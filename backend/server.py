"""
server.py — FastAPI Backend for PowerBI-style DynamicBI
========================================================
Session-scoped: every browser tab gets its own session_id.
All uploads and dashboard artefacts live in sessions/<session_id>/.
Sessions are cleaned up when the tab closes (via /api/session/close)
or after a configurable TTL.
"""
import matplotlib
matplotlib.use("Agg")

import os
import sys
import uuid
import shutil
import asyncio
import base64
import json
import math
import time
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import numpy as np

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from config import get_llm

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

app = FastAPI(title="DynamicBI PowerBI Backend", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session store ──────────────────────────────────────────────────────────────
SESSIONS_ROOT = BASE_DIR / "sessions"
SESSIONS_ROOT.mkdir(exist_ok=True)

SESSION_TTL_SECONDS = 90   # evict sessions that miss ~3 heartbeats (tab closed)
SESSION_REAPER_INTERVAL = 20  # reaper wakes every 20 s

# SESSIONS[session_id] = {
#   "jobs": { job_id: {...} },
#   "dir": Path,            # sessions/<session_id>/
#   "upload_dir": Path,     # sessions/<session_id>/uploads/
#   "dashboard_dir": Path,  # sessions/<session_id>/dashboard/
#   "last_seen": float,     # timestamp
# }
SESSIONS: dict = {}
_sessions_lock = threading.Lock()

executor = ThreadPoolExecutor(max_workers=4)

# ── Stage weights ──────────────────────────────────────────────────────────────
STAGE_WEIGHTS = {
    "load_data":       (5,  "Loading data…"),
    "clean_data":      (15, "Cleaning & sanitising data…"),
    "kpi":             (25, "Computing KPIs…"),
    "anomaly_detect":  (35, "Running anomaly detection…"),
    "forecast":        (50, "Forecasting trends…"),
    "anomaly_visual":  (60, "Visualising anomalies…"),
    "anomaly_explain": (68, "Explaining anomalies via AI…"),
    "rag_profile":     (75, "Profiling dataset…"),
    "insights":        (83, "Generating AI business insights…"),
    "dashboard_schema":(92, "Building PowerBI dashboard layout…"),
}


# ── Session helpers ────────────────────────────────────────────────────────────

def _make_session(session_id: str) -> dict:
    sess_dir     = SESSIONS_ROOT / session_id
    upload_dir   = sess_dir / "uploads"
    dashboard_dir = sess_dir / "dashboard"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dashboard_dir.mkdir(parents=True, exist_ok=True)
    session = {
        "jobs":          {},
        "dir":           sess_dir,
        "upload_dir":    upload_dir,
        "dashboard_dir": dashboard_dir,
        "last_seen":     time.time(),
    }
    SESSIONS[session_id] = session
    return session


def _get_session(session_id: str | None) -> dict:
    """Return existing session or create a new one."""
    with _sessions_lock:
        if session_id and session_id in SESSIONS:
            SESSIONS[session_id]["last_seen"] = time.time()
            return SESSIONS[session_id]
        # Unknown / missing → create new (caller should use the returned session_id)
        sid = session_id or str(uuid.uuid4())
        return _make_session(sid)


def _destroy_session(session_id: str):
    """Delete all files and in-memory data for a session."""
    with _sessions_lock:
        sess = SESSIONS.pop(session_id, None)
    if sess:
        try:
            shutil.rmtree(sess["dir"], ignore_errors=True)
        except Exception:
            pass


def _touch_session(session_id: str):
    with _sessions_lock:
        if session_id in SESSIONS:
            SESSIONS[session_id]["last_seen"] = time.time()


def _ttl_reaper():
    """Background thread: evict sessions idle longer than SESSION_TTL_SECONDS.

    The frontend sends a heartbeat every 30 s.  If three consecutive heartbeats
    are missed (90 s TTL) we assume the tab is closed and destroy the session.
    """
    while True:
        time.sleep(SESSION_REAPER_INTERVAL)
        now = time.time()
        with _sessions_lock:
            stale = [sid for sid, s in SESSIONS.items()
                     if now - s["last_seen"] > SESSION_TTL_SECONDS]
        for sid in stale:
            print(f"[session] TTL evicting {sid} (idle >{SESSION_TTL_SECONDS}s)")
            _destroy_session(sid)


threading.Thread(target=_ttl_reaper, daemon=True).start()

# Clean up any leftover sessions from a previous server run on startup
for _old in SESSIONS_ROOT.iterdir():
    try:
        shutil.rmtree(_old, ignore_errors=True)
    except Exception:
        pass


# ── JSON sanitizer ─────────────────────────────────────────────────────────────
def _sanitize(obj, _d=0):
    if _d > 50:
        return None
    try:
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating):
            f = float(obj)
            return None if (math.isnan(f) or math.isinf(f)) else f
        if isinstance(obj, np.bool_): return bool(obj)
        if isinstance(obj, np.ndarray): return _sanitize(obj.tolist(), _d+1)
    except Exception:
        pass
    try:
        import pandas as _pd
        if isinstance(obj, _pd.Timestamp):
            return obj.isoformat() if not _pd.isnull(obj) else None
    except Exception:
        pass
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v, _d+1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v, _d+1) for v in obj]
    if hasattr(obj, "item"):
        try: return _sanitize(obj.item(), _d+1)
        except: pass
    return obj


# ── Headless load_data patch ────────────────────────────────────────────────────
def _patch_load_agent():
    import agents.load_data_agent as mod
    from sqlalchemy import create_engine, inspect as sa_inspect
    from utils.source_detector import detect_source_type

    def load_data_agent_headless(state):
        path = state["source_path"]
        source_type = detect_source_type(path)

        if source_type == "csv":
            df = pd.read_csv(path)
            return {**state, "_df": df, "source_type": "csv"}

        if source_type == "excel":
            xls = pd.ExcelFile(path)
            sheet = state.get("_excel_sheet") or xls.sheet_names[0]
            df = pd.read_excel(path, sheet_name=sheet)
            return {**state, "_df": df, "source_type": "excel"}

        if source_type in ("sqlite", "postgres", "mysql", "oracle"):
            engine = create_engine(path)
            inspector = sa_inspect(engine)
            tables = inspector.get_table_names()
            if not tables:
                raise Exception("No tables found in database.")
            table = state.get("_db_table") or tables[0]
            df = pd.read_sql(f'SELECT * FROM "{table}"', engine)
            return {**state, "_df": df, "engine": engine, "table_name": table,
                    "source_type": "sql", "_available_tables": tables}

        if source_type == "mongodb":
            from pymongo import MongoClient
            import certifi
            client = MongoClient(path, tlsCAFile=certifi.where())
            db_name = state.get("_mongo_database")
            if not db_name:
                all_dbs = [d for d in client.list_database_names()
                           if d not in ("admin", "local", "config")]
                db_name = all_dbs[0] if all_dbs else None
            if not db_name:
                raise Exception("No usable MongoDB database found.")
            db = client[db_name]
            col_name = state.get("_mongo_collection")
            if not col_name:
                cols = db.list_collection_names()
                col_name = cols[0] if cols else None
            if not col_name:
                raise Exception("No collections found in MongoDB database.")
            data = list(db[col_name].find())
            df = pd.json_normalize(data)
            if "_id" in df.columns:
                df.drop("_id", axis=1, inplace=True)
            return {**state, "_df": df, "mongo_client": client, "database_name": db_name,
                    "collection_name": col_name, "source_type": "mongodb"}

        raise Exception(f"Unsupported source_type: {source_type}")

    mod.load_data_agent = load_data_agent_headless

_patch_load_agent()


# ── Instrumented graph ─────────────────────────────────────────────────────────
def _build_instrumented_graph(session_id: str, job_id: str):
    from langgraph.graph import StateGraph, END
    from state import AgentState
    import agents.load_data_agent as lda_mod

    from agents.data_cleaning_agent import data_cleaning_agent
    from agents.kpi_agent import kpi_agent
    from agents.anomaly_detection_agent import anomaly_detection_agent
    from agents.anomaly_visualization_agent import anomaly_visualization_agent
    from agents.anomaly_explanation_agent import anomaly_explanation_agent
    from agents.forecasting_agent import forecasting_agent
    from agents.rag_profile_agent import rag_profile_agent
    from agents.insight_agent import insight_agent
    from agents.dashboard_schema_agent import dashboard_schema_agent

    jobs = SESSIONS[session_id]["jobs"]

    agent_map = {
        "load_data":        lda_mod.load_data_agent,
        "clean_data":       data_cleaning_agent,
        "kpi":              kpi_agent,
        "anomaly_detect":   anomaly_detection_agent,
        "forecast":         forecasting_agent,
        "anomaly_visual":   anomaly_visualization_agent,
        "anomaly_explain":  anomaly_explanation_agent,
        "rag_profile":      rag_profile_agent,
        "insights":         insight_agent,
        "dashboard_schema": dashboard_schema_agent,
    }

    def wrap(name, fn):
        def instrumented(state):
            pct, label = STAGE_WEIGHTS.get(name, (50, name))
            jobs[job_id]["progress"] = pct
            jobs[job_id]["stage"]    = label
            return fn(state)
        instrumented.__name__ = name
        return instrumented

    graph = StateGraph(AgentState)
    for name, fn in agent_map.items():
        graph.add_node(name, wrap(name, fn))

    graph.set_entry_point("load_data")
    graph.add_edge("load_data",        "clean_data")
    graph.add_edge("clean_data",       "kpi")
    graph.add_edge("kpi",              "anomaly_detect")
    graph.add_edge("anomaly_detect",   "forecast")
    graph.add_edge("forecast",         "anomaly_visual")
    graph.add_edge("anomaly_visual",   "anomaly_explain")
    graph.add_edge("anomaly_explain",  "rag_profile")
    graph.add_edge("rag_profile",      "insights")
    graph.add_edge("insights",         "dashboard_schema")
    graph.add_edge("dashboard_schema", END)

    return graph.compile()


# ── Pipeline runner ────────────────────────────────────────────────────────────
def run_pipeline(session_id: str, job_id: str, initial_state: dict):
    try:
        sess = SESSIONS.get(session_id)
        if not sess:
            return  # session was already destroyed

        jobs = sess["jobs"]
        jobs[job_id]["status"]   = "running"
        jobs[job_id]["progress"] = 2
        jobs[job_id]["stage"]    = "Initialising pipeline…"

        # ── KEY: chdir to session dir so all agent relative-path writes
        #         (dashboard/kpis.csv, dashboard/insights.txt, etc.) go to
        #         sessions/<session_id>/ instead of the shared backend dir.
        sess_dir = sess["dir"]
        os.chdir(sess_dir)

        compiled    = _build_instrumented_graph(session_id, job_id)
        final_state = compiled.invoke(initial_state)

        jobs[job_id]["_query_state"] = {
            "source_type":     final_state.get("source_type", ""),
            "_df":             final_state.get("_df"),
            "engine":          final_state.get("engine"),
            "table_name":      final_state.get("table_name"),
            "mongo_client":    final_state.get("mongo_client"),
            "database_name":   final_state.get("database_name"),
            "collection_name": final_state.get("collection_name"),
        }

        jobs[job_id]["progress"] = 99
        jobs[job_id]["stage"]    = "Packaging results…"
        jobs[job_id]["result"]   = _collect_result(final_state, sess["dashboard_dir"])
        jobs[job_id]["status"]   = "done"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["stage"]    = "Dashboard ready!"

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(tb)
        if session_id in SESSIONS and job_id in SESSIONS[session_id]["jobs"]:
            SESSIONS[session_id]["jobs"][job_id]["status"]    = "error"
            SESSIONS[session_id]["jobs"][job_id]["error"]     = str(exc)
            SESSIONS[session_id]["jobs"][job_id]["traceback"] = tb
    finally:
        # Always chdir back to backend root so other things still work
        os.chdir(BASE_DIR)


def _build_proper_kpis(raw_kpis: list, kpi_data_from_state) -> list:
    """
    Convert raw kpis.csv rows [{Metric, Value}] into the KpiRow-compatible
    [{column, label, sum, avg, max, min, count}] format.

    If the dashboard_schema_agent already stored kpi_data in state, use that
    directly (it's already in the right shape).  Fall back to transforming
    the CSV rows.
    """
    # Preferred: state already has properly shaped kpi_data
    if kpi_data_from_state and isinstance(kpi_data_from_state, list) and \
       kpi_data_from_state and "column" in kpi_data_from_state[0]:
        return kpi_data_from_state

    if not raw_kpis:
        return []

    # Fallback: transform {Metric, Value} CSV rows
    # Group SUM_X / AVG_X / ROW_COUNT etc. into per-column entries
    sums   = {}
    avgs   = {}
    extras = {}

    for row in raw_kpis:
        metric = str(row.get("Metric", ""))
        value  = row.get("Value")
        try:
            value = float(value) if value is not None else None
        except (TypeError, ValueError):
            value = None

        if metric.startswith("SUM_"):
            sums[metric[4:]] = value
        elif metric.startswith("AVG_"):
            avgs[metric[4:]] = value
        else:
            extras[metric] = value

    out = []
    all_cols = sorted(set(list(sums.keys()) + list(avgs.keys())))
    for col in all_cols:
        s = sums.get(col)
        a = avgs.get(col)
        if s is None and a is None:
            continue
        out.append({
            "column": col,
            "label":  col.replace("_", " ").title(),
            "sum":    s,
            "avg":    a,
            "max":    None,
            "min":    None,
            "count":  None,
        })

    # Append special metrics (ROW_COUNT etc.)
    row_count = extras.get("ROW_COUNT")
    if row_count is not None:
        out.append({
            "column": "_rows",
            "label":  "Total Records",
            "sum":    int(row_count),
            "avg":    int(row_count),
            "max":    int(row_count),
            "min":    int(row_count),
            "count":  int(row_count),
        })

    return out


def _collect_result(final_state: dict, dashboard_dir: Path) -> dict:
    """Collect all dashboard artefacts into a single response payload."""
    result = {
        "dashboard_schema": final_state.get("dashboard_schema", {}),
        "kpis":             [],
        "insights":         "",
        "anomaly_report":   "",
        "cleaning_report":  "",
        "profile":          "",
        "forecasts":        [],
        "anomaly_data":     None,
        "anomaly_image":    None,
        "anomaly_scatter_panels": [],
    }

    # KPIs — prefer the properly-shaped kpi_data stored in agent state
    kpi_data_from_state = final_state.get("kpi_data")  # set by dashboard_schema_agent
    raw_kpis = []
    kpi_path = dashboard_dir / "kpis.csv"
    if kpi_path.exists():
        try:
            df_k = pd.read_csv(str(kpi_path))
            raw_kpis = df_k.to_dict(orient="records")
        except Exception:
            pass
    result["kpis"] = _build_proper_kpis(raw_kpis, kpi_data_from_state)

    # Text artefacts
    for key, fname in [
        ("insights",        "insights.txt"),
        ("anomaly_report",  "anomaly_report.txt"),
        ("cleaning_report", "data_cleaning_report.txt"),
        ("profile",         "dataset_profile.txt"),
    ]:
        p = dashboard_dir / fname
        if p.exists():
            result[key] = p.read_text(encoding="utf-8", errors="replace")

    # Forecasts
    state_forecasts = final_state.get("forecasts", [])
    if state_forecasts:
        for fc in state_forecasts:
            clean_rows = []
            for row in fc.get("rows", []):
                clean_rows.append({
                    k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                    for k, v in row.items()
                })
            clean_chart_data = []
            for row in fc.get("chart_data", []):
                clean_chart_data.append({
                    k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                    for k, v in row.items()
                })
            result["forecasts"].append({
                "col":        fc.get("col"),
                "method":     fc.get("method", ""),
                "freq":       fc.get("freq", ""),
                "freq_label": fc.get("freq_label", ""),
                "periods":    fc.get("periods", 0),
                "chart_data": clean_chart_data,
                "rows":       clean_rows,
            })
    else:
        for f in sorted(dashboard_dir.iterdir()):
            if f.name.startswith("forecast_") and f.suffix == ".csv":
                col = f.stem[len("forecast_"):]
                try:
                    df_fc = pd.read_csv(str(f))
                    keep  = [c for c in ["ds", "yhat", "yhat_lower", "yhat_upper"] if c in df_fc.columns]
                    rows  = df_fc[keep].tail(60).round(4).to_dict(orient="records")
                    rows  = [{k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                              for k, v in row.items()} for row in rows]
                    chart_data = [{
                        "date":     str(r["ds"])[:10],
                        "actual":   None,
                        "forecast": r.get("yhat"),
                        "lower":    r.get("yhat_lower"),
                        "upper":    r.get("yhat_upper"),
                    } for r in rows]
                    result["forecasts"].append({"col": col, "rows": rows, "chart_data": chart_data})
                except Exception:
                    pass

    # Anomaly data
    anm_path = dashboard_dir / "anomalies.csv"
    if anm_path.exists():
        try:
            df_an = pd.read_csv(str(anm_path))
            df_an = df_an.replace([float("inf"), float("-inf")], float("nan"))
            num_c = df_an.select_dtypes(include="number").columns.tolist()

            def _ss(s, fn):
                try:
                    v = float(fn(s))
                    return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
                except: return None

            result["anomaly_data"] = {
                "count":           int(len(df_an)),
                "columns":         df_an.columns.tolist(),
                "numeric_columns": num_c,
                "sample": [{k:(None if isinstance(v,float) and (math.isnan(v) or math.isinf(v)) else v)
                             for k,v in row.items()}
                           for row in df_an.head(10).to_dict(orient="records")],
                "stats": {c: {"mean": _ss(df_an[c].dropna(), lambda s:s.mean()),
                              "min":  _ss(df_an[c].dropna(), lambda s:s.min()),
                              "max":  _ss(df_an[c].dropna(), lambda s:s.max()),
                              "std":  _ss(df_an[c].dropna(), lambda s:s.std())}
                          for c in num_c[:8]},
            }
        except Exception:
            pass

    # Anomaly image
    img_path = dashboard_dir / "anomaly_visual.png"
    if img_path.exists():
        try:
            with open(img_path, "rb") as img_f:
                result["anomaly_image"] = base64.b64encode(img_f.read()).decode("utf-8")
        except Exception:
            pass

    result["anomaly_scatter_panels"] = final_state.get("anomaly_scatter_panels", [])
    return result


# ── Job helpers ────────────────────────────────────────────────────────────────
def _init_job(session_id: str, job_id: str, source_label: str):
    SESSIONS[session_id]["jobs"][job_id] = {
        "status": "queued", "progress": 0, "stage": "Queued",
        "source": source_label, "result": None, "error": None,
    }

def _schedule(bg: BackgroundTasks, session_id: str, job_id: str, state: dict):
    loop = asyncio.get_event_loop()
    bg.add_task(loop.run_in_executor, executor, run_pipeline, session_id, job_id, state)


# ── Request models ─────────────────────────────────────────────────────────────
class DbInspectRequest(BaseModel):
    connection_string: str

class DbConnectRequest(BaseModel):
    connection_string: str
    database: Optional[str] = None
    table:    Optional[str] = None

class QueryRequest(BaseModel):
    question: str

class FilterRequest(BaseModel):
    filters: dict
    page_id: Optional[str] = None

class DrillDownRequest(BaseModel):
    widget_id: str
    dimension: str
    value: str


# ── Helper: extract session_id from header ─────────────────────────────────────
def _sid(x_session_id: Optional[str]) -> tuple[str, dict]:
    """Return (session_id, session_dict), creating the session if needed."""
    sess = _get_session(x_session_id)
    # Find the actual session_id key (needed when a new one was auto-created)
    if x_session_id and x_session_id in SESSIONS:
        sid = x_session_id
    else:
        # Newly created — find it
        sid = next((k for k, v in SESSIONS.items() if v is sess), None)
        if sid is None:
            sid = str(uuid.uuid4())
            SESSIONS[sid] = sess
    _touch_session(sid)
    return sid, sess


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/api/session/init")
async def init_session():
    """
    Called by the frontend when a new tab opens.
    Returns a fresh session_id that the tab must include in all subsequent
    requests as the X-Session-Id header.
    """
    sid = str(uuid.uuid4())
    _make_session(sid)
    return {"session_id": sid}


@app.post("/api/session/close")
async def close_session(x_session_id: Optional[str] = Header(default=None)):
    """
    Called via navigator.sendBeacon when the tab is closing.
    Deletes all files and in-memory state for this session immediately.
    """
    if x_session_id and x_session_id in SESSIONS:
        _destroy_session(x_session_id)
    return {"status": "closed"}


@app.post("/api/session/heartbeat")
async def heartbeat(x_session_id: Optional[str] = Header(default=None)):
    """Keep the session alive (called every ~30 s from the frontend)."""
    if x_session_id:
        _touch_session(x_session_id)
    return {"status": "ok"}


@app.post("/api/db/inspect")
async def inspect_database(body: DbInspectRequest,
                           x_session_id: Optional[str] = Header(default=None)):
    sid, _ = _sid(x_session_id)
    conn = body.connection_string.strip()
    conn_lower = conn.lower()

    if conn_lower.startswith("mongodb://") or conn_lower.startswith("mongodb+srv://"):
        try:
            from pymongo import MongoClient
            import certifi
            client = MongoClient(conn, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=6000)
            client.server_info()
            raw_dbs = client.list_database_names()
            databases = [d for d in raw_dbs if d not in ("admin","local","config")]
            collections = {db: client[db].list_collection_names() for db in databases}
            client.close()
            return {"session_id": sid, "type": "mongodb", "databases": databases, "collections": collections}
        except Exception as exc:
            raise HTTPException(400, f"Could not connect to MongoDB: {exc}")

    normalised = conn
    if conn_lower.startswith("postgres://"):
        normalised = "postgresql+psycopg2://" + conn[len("postgres://"):]
    elif conn_lower.startswith("postgresql://") and "+psycopg" not in conn_lower:
        normalised = "postgresql+psycopg2://" + conn[len("postgresql://"):]

    try:
        from sqlalchemy import create_engine, inspect as sa_inspect, text
        engine = create_engine(normalised, connect_args={"connect_timeout": 10})
        with engine.connect() as _conn:
            _conn.execute(text("SELECT 1"))
        tables = sa_inspect(engine).get_table_names()
        engine.dispose()
        return {"session_id": sid, "type": "sql", "tables": tables}
    except Exception as exc:
        raise HTTPException(400, f"Could not connect: {exc}")


@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sheet: Optional[str] = None,
    x_session_id: Optional[str] = Header(default=None),
):
    sid, sess = _sid(x_session_id)

    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ("csv","xlsx","xls"):
        raise HTTPException(400, "Only CSV (.csv) and Excel (.xlsx/.xls) are supported.")

    job_id    = str(uuid.uuid4())
    save_path = sess["upload_dir"] / f"{job_id}_{file.filename}"
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _init_job(sid, job_id, file.filename)
    _schedule(background_tasks, sid, job_id, {"source_path": str(save_path), "_excel_sheet": sheet})
    return {"session_id": sid, "job_id": job_id, "filename": file.filename}


@app.post("/api/connect")
async def connect_database(background_tasks: BackgroundTasks,
                           body: DbConnectRequest,
                           x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)

    conn = body.connection_string.strip()
    conn_lower = conn.lower()

    if conn_lower.startswith("postgres://"):
        conn = "postgresql+psycopg2://" + conn[len("postgres://"):]
    elif conn_lower.startswith("postgresql://") and "+psycopg" not in conn_lower:
        conn = "postgresql+psycopg2://" + conn[len("postgresql://"):]
    conn_lower = conn.lower()

    is_mongo = conn_lower.startswith("mongodb://") or conn_lower.startswith("mongodb+srv://")
    is_sql   = any(conn_lower.startswith(p) for p in ("sqlite","postgresql+","mysql","oracle"))

    if not (is_mongo or is_sql):
        raise HTTPException(400, "Unsupported connection string.")

    job_id = str(uuid.uuid4())
    _init_job(sid, job_id, conn)
    initial_state: dict = {"source_path": conn}
    if is_mongo:
        initial_state["_mongo_database"]   = body.database
        initial_state["_mongo_collection"] = body.table
    else:
        initial_state["_db_table"] = body.table

    _schedule(background_tasks, sid, job_id, initial_state)
    return {"session_id": sid, "job_id": job_id, "connection": conn}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str,
                     x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs:
        raise HTTPException(404, "Job not found.")
    j = jobs[job_id]
    return {"status": j["status"], "progress": j["progress"], "stage": j["stage"], "error": j.get("error")}


@app.get("/api/result/{job_id}")
async def get_result(job_id: str,
                     x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs:
        raise HTTPException(404, "Job not found.")
    j = jobs[job_id]
    if j["status"] != "done":
        raise HTTPException(400, f"Pipeline not finished (status={j['status']}).")
    return JSONResponse(content=_sanitize(j["result"]))


@app.post("/api/filter/{job_id}")
async def apply_filters(job_id: str, body: FilterRequest,
                        x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs or jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    qs  = jobs[job_id].get("_query_state", {})
    df0 = qs.get("_df")
    if df0 is None:
        raise HTTPException(400, "No dataframe available.")

    schema = jobs[job_id]["result"].get("dashboard_schema", {})
    df = df0.copy()

    for col, val in body.filters.items():
        if col not in df.columns:
            continue
        try:
            if isinstance(val, list) and val:
                mask = df[col].astype(str).isin([str(v) for v in val])
                df = df[mask]
            elif isinstance(val, dict):
                frm = val.get("from"); to  = val.get("to")
                mn  = val.get("min");  mx  = val.get("max")
                if frm is not None or to is not None:
                    ts = df[col] if pd.api.types.is_datetime64_any_dtype(df[col]) \
                         else pd.to_datetime(df[col], errors="coerce")
                    ts = ts.reset_index(drop=True)
                    df = df.reset_index(drop=True)
                    mask = pd.Series([True] * len(df))
                    if frm: mask &= ts >= pd.to_datetime(frm)
                    if to:  mask &= ts <= pd.to_datetime(to)
                    df = df[mask.values]
                elif mn is not None or mx is not None:
                    num_series = pd.to_numeric(df[col], errors="coerce")
                    mask = pd.Series([True] * len(df), index=df.index)
                    if mn is not None: mask &= num_series >= float(mn)
                    if mx is not None: mask &= num_series <= float(mx)
                    df = df[mask]
        except Exception as e:
            print(f"[filter] error on '{col}': {e}")
            continue

    from agents.dashboard_schema_agent import _compute_widget_data, _build_kpi_data, _profile_and_engineer

    try:
        filtered_df, fprofile = _profile_and_engineer(df)
    except Exception:
        filtered_df = df
        fprofile = {
            "numeric_cols": df.select_dtypes(include=np.number).columns.tolist(),
            "categorical_cols": df.select_dtypes(exclude=np.number).columns.tolist(),
            "good_cat_cols": df.select_dtypes(exclude=np.number).columns.tolist(),
            "date_cols": [], "engineered_cols": [], "all_cols": df.columns.tolist(),
        }

    nc       = fprofile["numeric_cols"]
    kpi_data = _build_kpi_data(filtered_df, nc)

    updated_widgets = {}
    for page in schema.get("pages", []):
        for w in page.get("widgets", []):
            wid = w["id"]
            try:
                updated_widgets[wid] = _compute_widget_data(dict(w), filtered_df, fprofile)
            except Exception as e:
                print(f"[filter] widget {wid} error: {e}")
                updated_widgets[wid] = []

    return JSONResponse(content=_sanitize({
        "updated_widgets": updated_widgets,
        "row_count": len(filtered_df),
        "kpi_data": kpi_data,
    }))


@app.post("/api/drilldown/{job_id}")
async def drilldown(job_id: str, body: DrillDownRequest,
                    x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs or jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    qs  = jobs[job_id].get("_query_state", {})
    df0 = qs.get("_df")
    if df0 is None:
        raise HTTPException(400, "No dataframe available.")

    df = df0[df0[body.dimension].astype(str) == body.value].copy() \
         if body.dimension in df0.columns else df0.copy()
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()

    stats = {}
    for col in numeric_cols[:8]:
        s = df[col].replace([np.inf, -np.inf], np.nan).dropna()
        if len(s):
            stats[col] = {
                "count": len(s), "sum": float(s.sum()),
                "mean":  round(float(s.mean()), 2),
                "min":   float(s.min()), "max": float(s.max()),
            }

    sample = df.head(20).to_dict(orient="records")
    sample = [{k: (None if isinstance(v,float) and (math.isnan(v) or math.isinf(v)) else v)
               for k,v in row.items()} for row in sample]

    return JSONResponse(content=_sanitize({
        "dimension": body.dimension, "value": body.value,
        "row_count": len(df), "statistics": stats, "sample": sample,
    }))


@app.post("/api/query/{job_id}")
async def natural_language_query(job_id: str, body: QueryRequest,
                                 x_session_id: Optional[str] = Header(default=None)):
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs or jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    from query.query_loop import run_query

    job    = jobs[job_id]
    result = job.get("result", {})
    qs     = job.get("_query_state", {})

    source_context = "\n\n".join(filter(None, [
        "KPIs:\n"            + json.dumps(result.get("kpis", []), indent=2) if result.get("kpis") else "",
        "Insights:\n"        + result.get("insights", ""),
        "Anomaly Report:\n"  + result.get("anomaly_report", ""),
        "Dataset Profile:\n" + result.get("profile", "")[:2000],
    ]))

    df           = qs.get("_df")
    source_type  = qs.get("source_type", "csv")
    engine       = qs.get("engine")
    table_name   = qs.get("table_name")
    mongo_client = qs.get("mongo_client")
    db_name      = qs.get("database_name")
    col_name     = qs.get("collection_name")

    if df is None:
        try:
            llm  = get_llm()
            resp = llm.invoke(f"You are an expert BI analyst.\n\nContext:\n{source_context}\n\nQuestion: {body.question}\n\nProvide a clear, concise business answer.")
            answer = resp.content.strip() if hasattr(resp, "content") else str(resp).strip()
        except Exception as e:
            answer = f"⚠ AI unavailable: {e}"
        return {"answer": answer, "data": [], "visual": None, "needs_visual": False}

    try:
        response = run_query(
            question=body.question, source_type=source_type, df=df,
            engine=engine, table_name=table_name, mongo_client=mongo_client,
            db_name=db_name, collection_name=col_name, source_context=source_context,
        )
        return JSONResponse(content=_sanitize(response))
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(content={"answer": f"⚠ Query error: {e}", "data": [], "visual": None, "needs_visual": False})


@app.get("/api/export/{job_id}")
async def export_dashboard(job_id: str,
                           x_session_id: Optional[str] = Header(default=None)):
    """Return a fully self-contained dashboard JSON that includes:
    - dashboard_schema (pages, widgets, chart data, filters, KPIs)
    - AI insights report + key insights
    - Full forecast rows + chart data (so Forecasting tab works offline)
    - Full anomaly data + scatter panels + anomaly image (so Anomalies tab works offline)
    - Dataset profile, cleaning report, KPIs
    """
    sid, sess = _sid(x_session_id)
    jobs = sess["jobs"]
    if job_id not in jobs or jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready.")

    result = jobs[job_id]["result"]
    schema = result.get("dashboard_schema", {})

    export_payload = {
        # ── Schema + layout ──────────────────────────────────────────
        "dashboard_schema": schema,
        "meta": {
            "title":          schema.get("title", "Dashboard"),
            "domain":         schema.get("domain"),
            "source":         jobs[job_id].get("source"),
            "row_count":      schema.get("row_count"),
            "exported_from":  "DynamicBI",
            "export_version": "2",
        },

        # ── AI text content ──────────────────────────────────────────
        "ai_summary":      schema.get("ai_summary", ""),
        "key_insights":    schema.get("key_insights", []),
        "insights_report": result.get("insights", ""),
        "dataset_profile": result.get("profile", ""),
        "cleaning_report": result.get("cleaning_report", ""),

        # ── KPIs (full, properly-shaped for KpiRow) ──────────────────
        "kpis": result.get("kpis", []),

        # ── Forecasts — full rows + chart_data so charts render ──────
        "forecasts": result.get("forecasts", []),

        # ── Anomalies — full data + interactive scatter panels ────────
        "anomaly_data":          result.get("anomaly_data"),
        "anomaly_scatter_panels": result.get("anomaly_scatter_panels", []),
        "anomaly_report":         result.get("anomaly_report", ""),
        # Embed the PNG as base64 only when interactive panels are absent
        "anomaly_image": (
            result.get("anomaly_image")
            if not result.get("anomaly_scatter_panels")
            else None
        ),
    }

    return JSONResponse(
        content=_sanitize(export_payload),
        headers={"Content-Disposition": "attachment; filename=dashboard.json"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
