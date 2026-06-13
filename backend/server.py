"""
server.py — FastAPI Backend for PowerBI-style DynamicBI
========================================================
Supports CSV/Excel uploads and database connections (PostgreSQL, MySQL,
SQLite, Oracle, MongoDB).  Returns a structured PowerBI-style dashboard
schema with pre-computed chart data and interactive filter options.
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
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import numpy as np

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import get_llm

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

app = FastAPI(title="DynamicBI PowerBI Backend", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR   = BASE_DIR / "uploads"
DASHBOARD_DIR = BASE_DIR / "dashboard"
UPLOAD_DIR.mkdir(exist_ok=True)
DASHBOARD_DIR.mkdir(exist_ok=True)

executor = ThreadPoolExecutor(max_workers=4)
JOBS: dict = {}

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


# ── JSON sanitizer ─────────────────────────────────────────────────────────────
def _sanitize(obj, _d=0):
    if _d > 50:
        return None
    try:
        import numpy as np
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating):
            f = float(obj)
            return None if (math.isnan(f) or math.isinf(f)) else f
        if isinstance(obj, np.bool_): return bool(obj)
        if isinstance(obj, np.ndarray): return _sanitize(obj.tolist(), _d+1)
    except ImportError:
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
def _build_instrumented_graph(job_id: str):
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
            JOBS[job_id]["progress"] = pct
            JOBS[job_id]["stage"]    = label
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
def run_pipeline(job_id: str, initial_state: dict):
    try:
        JOBS[job_id]["status"]   = "running"
        JOBS[job_id]["progress"] = 2
        JOBS[job_id]["stage"]    = "Initialising pipeline…"
        os.chdir(BASE_DIR)

        compiled    = _build_instrumented_graph(job_id)
        final_state = compiled.invoke(initial_state)

        JOBS[job_id]["_query_state"] = {
            "source_type":     final_state.get("source_type", ""),
            "_df":             final_state.get("_df"),
            "engine":          final_state.get("engine"),
            "table_name":      final_state.get("table_name"),
            "mongo_client":    final_state.get("mongo_client"),
            "database_name":   final_state.get("database_name"),
            "collection_name": final_state.get("collection_name"),
        }

        JOBS[job_id]["progress"] = 99
        JOBS[job_id]["stage"]    = "Packaging results…"
        JOBS[job_id]["result"]   = _collect_result(final_state)
        JOBS[job_id]["status"]   = "done"
        JOBS[job_id]["progress"] = 100
        JOBS[job_id]["stage"]    = "Dashboard ready!"

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(tb)
        JOBS[job_id]["status"]    = "error"
        JOBS[job_id]["error"]     = str(exc)
        JOBS[job_id]["traceback"] = tb


def _collect_result(final_state: dict) -> dict:
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

    # KPIs
    kpi_path = DASHBOARD_DIR / "kpis.csv"
    if kpi_path.exists():
        try:
            df_k = pd.read_csv(str(kpi_path))
            result["kpis"] = df_k.to_dict(orient="records")
        except Exception:
            pass

    # Text artefacts
    for key, fname in [
        ("insights",        "insights.txt"),
        ("anomaly_report",  "anomaly_report.txt"),
        ("cleaning_report", "data_cleaning_report.txt"),
        ("profile",         "dataset_profile.txt"),
    ]:
        p = DASHBOARD_DIR / fname
        if p.exists():
            result[key] = p.read_text(encoding="utf-8", errors="replace")

    # Forecasts — use interactive chart_data from forecasting agent
    state_forecasts = final_state.get("forecasts", [])
    if state_forecasts:
        for fc in state_forecasts:
            # Sanitise any NaN/Inf in rows
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
        # Fallback: read from CSV files on disk (legacy / if agent didn't write state)
        for f in sorted(DASHBOARD_DIR.iterdir()):
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
    anm_path = DASHBOARD_DIR / "anomalies.csv"
    if anm_path.exists():
        try:
            df_an = pd.read_csv(str(anm_path))
            df_an = df_an.replace([float("inf"), float("-inf")], float("nan"))
            num_c = df_an.select_dtypes(include="number").columns.tolist()

            def _ss(s, fn):
                try:
                    v = float(fn(s))
                    return None if (math.isnan(v) or math.isinf(v)) else round(v,4)
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

    # Anomaly image (base64 PNG)
    img_path = DASHBOARD_DIR / "anomaly_visual.png"
    if img_path.exists():
        try:
            with open(img_path, "rb") as img_f:
                result["anomaly_image"] = base64.b64encode(img_f.read()).decode("utf-8")
        except Exception:
            pass

    # Anomaly scatter panels (interactive)
    result["anomaly_scatter_panels"] = final_state.get("anomaly_scatter_panels", [])

    return result


# ── Job helpers ────────────────────────────────────────────────────────────────
def _init_job(job_id, source_label):
    JOBS[job_id] = {
        "status": "queued", "progress": 0, "stage": "Queued",
        "source": source_label, "result": None, "error": None,
    }

def _schedule(bg: BackgroundTasks, job_id, state):
    loop = asyncio.get_event_loop()
    bg.add_task(loop.run_in_executor, executor, run_pipeline, job_id, state)


# ── Request models ─────────────────────────────────────────────────────────────
class DbInspectRequest(BaseModel):
    connection_string: str

class DbConnectRequest(BaseModel):
    connection_string: str
    database: str | None = None
    table:    str | None = None

class QueryRequest(BaseModel):
    question: str

class FilterRequest(BaseModel):
    filters: dict   # { column: [values...] | {"from": ..., "to": ...} }
    page_id: str | None = None

class DrillDownRequest(BaseModel):
    widget_id: str
    dimension: str
    value: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/api/db/inspect")
async def inspect_database(body: DbInspectRequest):
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
            return {"type": "mongodb", "databases": databases, "collections": collections}
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
        return {"type": "sql", "tables": tables}
    except Exception as exc:
        raise HTTPException(400, f"Could not connect: {exc}")


@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sheet: str | None = None,
):
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ("csv","xlsx","xls"):
        raise HTTPException(400, "Only CSV (.csv) and Excel (.xlsx/.xls) are supported.")

    job_id    = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{job_id}_{file.filename}"
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _init_job(job_id, file.filename)
    _schedule(background_tasks, job_id, {"source_path": str(save_path), "_excel_sheet": sheet})
    return {"job_id": job_id, "filename": file.filename}


@app.post("/api/connect")
async def connect_database(background_tasks: BackgroundTasks, body: DbConnectRequest):
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
    _init_job(job_id, conn)
    initial_state: dict = {"source_path": conn}
    if is_mongo:
        initial_state["_mongo_database"]   = body.database
        initial_state["_mongo_collection"] = body.table
    else:
        initial_state["_db_table"] = body.table

    _schedule(background_tasks, job_id, initial_state)
    return {"job_id": job_id, "connection": conn}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found.")
    j = JOBS[job_id]
    return {"status": j["status"], "progress": j["progress"], "stage": j["stage"], "error": j.get("error")}


@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found.")
    j = JOBS[job_id]
    if j["status"] != "done":
        raise HTTPException(400, f"Pipeline not finished (status={j['status']}).")
    return JSONResponse(content=_sanitize(j["result"]))


@app.post("/api/filter/{job_id}")
async def apply_filters(job_id: str, body: FilterRequest):
    """
    Apply filters and recompute ALL pages' widget data.
    Supports: multi_select, date_range, numeric_range filters.
    """
    if job_id not in JOBS or JOBS[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    qs  = JOBS[job_id].get("_query_state", {})
    df0 = qs.get("_df")
    if df0 is None:
        raise HTTPException(400, "No dataframe available.")

    schema = JOBS[job_id]["result"].get("dashboard_schema", {})
    df = df0.copy()

    # ── Apply every filter ────────────────────────────────────────────
    for col, val in body.filters.items():
        if col not in df.columns:
            continue
        try:
            if isinstance(val, list) and val:
                # Multi-select: match any selected value (string cast for safety)
                mask = df[col].astype(str).isin([str(v) for v in val])
                df = df[mask]

            elif isinstance(val, dict):
                frm = val.get("from")
                to  = val.get("to")
                mn  = val.get("min")
                mx  = val.get("max")

                if frm is not None or to is not None:
                    # Date range filter
                    if pd.api.types.is_datetime64_any_dtype(df[col]):
                        ts = df[col]
                    else:
                        ts = pd.to_datetime(df[col], errors="coerce")
                    ts = ts.reset_index(drop=True)
                    df = df.reset_index(drop=True)
                    mask = pd.Series([True] * len(df))
                    if frm:
                        mask &= ts >= pd.to_datetime(frm)
                    if to:
                        mask &= ts <= pd.to_datetime(to)
                    df = df[mask.values]

                elif mn is not None or mx is not None:
                    # Numeric range filter
                    num_series = pd.to_numeric(df[col], errors="coerce")
                    mask = pd.Series([True] * len(df), index=df.index)
                    if mn is not None:
                        mask &= num_series >= float(mn)
                    if mx is not None:
                        mask &= num_series <= float(mx)
                    df = df[mask]
        except Exception as e:
            print(f"[filter] error applying filter on '{col}': {e}")
            continue

    # ── Recompute all widgets across ALL pages ────────────────────────
    from agents.dashboard_schema_agent import _compute_widget_data, _build_kpi_data, _profile_and_engineer

    # Re-run profile on filtered df so column types are correct
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
async def drilldown(job_id: str, body: DrillDownRequest):
    """
    Return detailed breakdown data for a specific dimension/value combination.
    Used when a user clicks on a bar/slice in a chart.
    """
    if job_id not in JOBS or JOBS[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    qs  = JOBS[job_id].get("_query_state", {})
    df0 = qs.get("_df")
    if df0 is None:
        raise HTTPException(400, "No dataframe available.")

    df = df0[df0[body.dimension].astype(str) == body.value].copy() if body.dimension in df0.columns else df0.copy()

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
        "dimension":  body.dimension,
        "value":      body.value,
        "row_count":  len(df),
        "statistics": stats,
        "sample":     sample,
    }))


@app.post("/api/query/{job_id}")
async def natural_language_query(job_id: str, body: QueryRequest):
    if job_id not in JOBS or JOBS[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    from query.query_loop import run_query

    job    = JOBS[job_id]
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
async def export_dashboard(job_id: str):
    """Return the full dashboard schema as a downloadable JSON."""
    if job_id not in JOBS or JOBS[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready.")
    schema = JOBS[job_id]["result"].get("dashboard_schema", {})
    return JSONResponse(content=_sanitize(schema), headers={"Content-Disposition": "attachment; filename=dashboard.json"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)