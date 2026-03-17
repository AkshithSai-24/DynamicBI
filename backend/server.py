"""
FastAPI Backend for NeuralBI
Uses build_graph() exclusively — the LangGraph pipeline handles all agent orchestration.
Supports both file uploads (CSV/Excel) and database connection strings.
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
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

app = FastAPI(title="Dynamic BI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = BASE_DIR / "uploads"
DASHBOARD_DIR = BASE_DIR / "dashboard"
UPLOAD_DIR.mkdir(exist_ok=True)
DASHBOARD_DIR.mkdir(exist_ok=True)

executor = ThreadPoolExecutor(max_workers=4)
JOBS: dict = {}

# ── Stage labels reported back to the frontend ────────────────────────────────
STAGE_WEIGHTS = {
    "load_data":       (5,  "Loading data..."),
    "clean_data":      (15, "Cleaning & sanitising data..."),
    "kpi":             (25, "Computing KPIs..."),
    "visualize":       (40, "Generating smart visualisations..."),
    "anomaly_detect":  (55, "Running anomaly detection (Isolation Forest)..."),
    "forecast":        (65, "Forecasting with Prophet..."),
    "anomaly_visual":  (75, "Visualising anomalies..."),
    "anomaly_explain": (82, "Explaining anomalies via AI..."),
    "rag_profile":     (88, "Profiling dataset..."),
    "insights":        (93, "Generating AI business insights..."),
    "dashboard":       (97, "Assembling dashboard..."),
}


# ── Headless load_data_agent patch ────────────────────────────────────────────
# The original agent uses input() for Excel sheet and DB table selection.
# We replace it with a version that reads hints from state instead.

def _patch_load_agent():
    import agents.load_data_agent as mod
    from sqlalchemy import create_engine, inspect as sa_inspect
    from utils.source_detector import detect_source_type
    from state import AgentState

    def load_data_agent_headless(state: AgentState):
        path = state["source_path"]
        source_type = detect_source_type(path)
        print(f"[load_data] detected source_type={source_type}")

        if source_type == "csv":
            df = pd.read_csv(path)
            return {**state, "_df": df, "source_type": "csv"}

        if source_type == "excel":
            xls = pd.ExcelFile(path)
            sheet = state.get("_excel_sheet") or xls.sheet_names[0]
            df = pd.read_excel(path, sheet_name=sheet)
            print(f"[load_data] Excel sheet='{sheet}'")
            return {**state, "_df": df, "source_type": "excel"}

        # Database (sqlite / postgres / mysql)
        if source_type in ("sqlite", "postgres", "mysql"):
            engine = create_engine(path)
            inspector = sa_inspect(engine)
            tables = inspector.get_table_names()
            if not tables:
                raise Exception("No tables found in database.")
            table = state.get("_db_table") or tables[0]
            print(f"[load_data] DB table='{table}'")
            df = pd.read_sql(f"SELECT * FROM {table}", engine)
            return {
                **state,
                "_df": df,
                "engine": engine,
                "table_name": table,
                "source_type": "sql",
                "_available_tables": tables,
            }

        # MongoDB headless path
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
            print(f"[load_data] MongoDB db='{db_name}' collection='{col_name}'")
            data = list(db[col_name].find())
            df = pd.json_normalize(data)
            if "_id" in df.columns:
                df.drop("_id", axis=1, inplace=True)
            return {
                **state,
                "_df": df,
                "mongo_client": client,
                "database_name": db_name,
                "collection_name": col_name,
                "source_type": "mongodb",
            }

        raise Exception(f"Unsupported source_type in headless agent: {source_type}")

    mod.load_data_agent = load_data_agent_headless

_patch_load_agent()


# ── Graph builder with progress hooks ─────────────────────────────────────────

def _build_instrumented_graph(job_id: str):
    """
    Recreates the same graph as build_graph.py but wraps every node so it
    emits progress updates to JOBS[job_id] before executing.
    """
    from langgraph.graph import StateGraph, END
    from state import AgentState
    import agents.load_data_agent as lda_mod          # already patched above

    from agents.data_cleaning_agent import data_cleaning_agent
    from agents.kpi_agent import kpi_agent
    from agents.visualization_agent import dataset_visualization_agent
    from agents.anomaly_detection_agent import anomaly_detection_agent
    from agents.anomaly_visualization_agent import anomaly_visualization_agent
    from agents.anomaly_explanation_agent import anomaly_explanation_agent
    from agents.forecasting_agent import forecasting_agent
    from agents.rag_profile_agent import rag_profile_agent
    from agents.insight_agent import insight_agent
    from agents.dashboard_agent import dashboard_agent

    agent_map = {
        "load_data":       lda_mod.load_data_agent,     # patched version
        "clean_data":      data_cleaning_agent,
        "kpi":             kpi_agent,
        "visualize":       dataset_visualization_agent,
        "anomaly_detect":  anomaly_detection_agent,
        "forecast":        forecasting_agent,
        "anomaly_visual":  anomaly_visualization_agent,
        "anomaly_explain": anomaly_explanation_agent,
        "rag_profile":     rag_profile_agent,
        "insights":        insight_agent,
        "dashboard":       dashboard_agent,
    }

    def wrap(name, fn):
        def instrumented(state):
            pct, label = STAGE_WEIGHTS.get(name, (50, name))
            JOBS[job_id]["progress"] = pct
            JOBS[job_id]["stage"] = label
            return fn(state)
        instrumented.__name__ = name
        return instrumented

    graph = StateGraph(AgentState)

    for name, fn in agent_map.items():
        graph.add_node(name, wrap(name, fn))

    # Exact same edges as build_graph.py
    graph.set_entry_point("load_data")
    graph.add_edge("load_data",       "clean_data")
    graph.add_edge("clean_data",      "kpi")
    graph.add_edge("kpi",             "visualize")
    graph.add_edge("visualize",       "anomaly_detect")
    graph.add_edge("anomaly_detect",  "forecast")
    graph.add_edge("forecast",        "anomaly_visual")
    graph.add_edge("anomaly_visual",  "anomaly_explain")
    graph.add_edge("anomaly_explain", "rag_profile")
    graph.add_edge("rag_profile",     "insights")
    graph.add_edge("insights",        "dashboard")
    graph.add_edge("dashboard",       END)

    return graph.compile()


# ── Pipeline runner ───────────────────────────────────────────────────────────

def run_pipeline(job_id: str, initial_state: dict):
    """
    Runs the instrumented LangGraph in a thread.
    initial_state must contain at minimum {"source_path": "..."}.
    Optional keys: "_excel_sheet", "_db_table".
    """
    try:
        JOBS[job_id]["status"] = "running"
        JOBS[job_id]["progress"] = 2
        JOBS[job_id]["stage"] = "Initialising pipeline..."

        # Work from backend dir so dashboard/ and uploads/ resolve correctly
        os.chdir(BASE_DIR)

        compiled = _build_instrumented_graph(job_id)
        compiled.invoke(initial_state)

        JOBS[job_id]["progress"] = 99
        JOBS[job_id]["stage"] = "Packaging results..."
        JOBS[job_id]["result"] = _collect_dashboard()
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["progress"] = 100
        JOBS[job_id]["stage"] = "Dashboard ready!"

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(tb)
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(exc)
        JOBS[job_id]["traceback"] = tb


# ── Result collector ──────────────────────────────────────────────────────────

def _img_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _collect_dashboard() -> dict:
    result = {
        "charts":         [],
        "kpis":           [],
        "insights":       "",
        "anomaly_report": "",
        "cleaning_report":"",
        "profile":        "",
    }

    if DASHBOARD_DIR.exists():
        for f in sorted(DASHBOARD_DIR.iterdir()):
            if f.suffix == ".png":
                result["charts"].append({
                    "name":     f.stem.replace("_", " ").title(),
                    "filename": f.name,
                    "data":     _img_b64(str(f)),
                })

    for key, (fname, ftype) in {
        "kpis":            ("kpis.csv",                "csv"),
        "insights":        ("insights.txt",            "txt"),
        "anomaly_report":  ("anomaly_report.txt",      "txt"),
        "cleaning_report": ("data_cleaning_report.txt","txt"),
        "profile":         ("dataset_profile.txt",     "txt"),
    }.items():
        p = DASHBOARD_DIR / fname
        if not p.exists():
            continue
        if ftype == "csv":
            result[key] = pd.read_csv(p).to_dict(orient="records")
        else:
            result[key] = p.read_text(errors="replace")

    return result


# ── Job helpers ───────────────────────────────────────────────────────────────

def _init_job(job_id: str, source_label: str):
    JOBS[job_id] = {
        "status":   "queued",
        "progress": 0,
        "stage":    "Queued",
        "source":   source_label,
        "result":   None,
        "error":    None,
    }


def _schedule(background_tasks: BackgroundTasks, job_id: str, initial_state: dict):
    loop = asyncio.get_event_loop()
    background_tasks.add_task(
        loop.run_in_executor,
        executor,
        run_pipeline,
        job_id,
        initial_state,
    )


# ── Request models ────────────────────────────────────────────────────────────

class DbInspectRequest(BaseModel):
    connection_string: str


class DbConnectRequest(BaseModel):
    connection_string: str
    database: str | None = None   # for MongoDB: database name
    table: str | None = None      # SQL table name OR MongoDB collection name


class QueryRequest(BaseModel):
    question: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/db/inspect")
async def inspect_database(body: DbInspectRequest):
    """
    Given a connection string, return the list of databases/tables/collections
    WITHOUT starting the pipeline. The frontend uses this to present a picker UI.

    Response shape:
      SQL:     { "type": "sql",     "tables": ["orders", "users", ...] }
      MongoDB: { "type": "mongodb", "databases": ["mydb", ...],
                 "collections": { "mydb": ["col1", "col2"], ... } }
    """
    conn = body.connection_string.strip()
    conn_lower = conn.lower()

    # ── SQL databases ──────────────────────────────────────────────────────────
    if any(k in conn_lower for k in ("sqlite", "postgres", "postgresql", "mysql")):
        try:
            from sqlalchemy import create_engine, inspect as sa_inspect
            engine = create_engine(conn)
            inspector = sa_inspect(engine)
            tables = inspector.get_table_names()
            engine.dispose()
            return {"type": "sql", "tables": tables}
        except Exception as exc:
            raise HTTPException(400, f"Could not connect: {exc}")

    # ── MongoDB ────────────────────────────────────────────────────────────────
    if "mongodb" in conn_lower:
        try:
            from pymongo import MongoClient
            import certifi
            client = MongoClient(conn, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=6000)
            client.server_info()   # force connection — raises if unreachable
            raw_dbs = client.list_database_names()
            databases = [d for d in raw_dbs if d not in ("admin", "local", "config")]
            collections = {db: client[db].list_collection_names() for db in databases}
            client.close()
            return {"type": "mongodb", "databases": databases, "collections": collections}
        except Exception as exc:
            raise HTTPException(400, f"Could not connect to MongoDB: {exc}")

    raise HTTPException(400, "Unsupported connection string. Use SQLite, PostgreSQL, MySQL, or MongoDB.")


@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sheet: str | None = None,
):
    """
    Upload a CSV or Excel file.
    The graph's load_data_agent will detect the type and load it automatically.
    """
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(400, "Only CSV (.csv) and Excel (.xlsx / .xls) files are supported.")

    job_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{job_id}_{file.filename}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _init_job(job_id, file.filename)
    _schedule(background_tasks, job_id, {
        "source_path":   str(save_path),
        "_excel_sheet":  sheet,          # None → first sheet
    })

    return {"job_id": job_id, "filename": file.filename}


@app.post("/api/connect")
async def connect_database(
    background_tasks: BackgroundTasks,
    body: DbConnectRequest,
):
    """
    Start the pipeline for a database / MongoDB source.
    Call /api/db/inspect first to let the user pick database + table/collection,
    then POST here with the chosen values.

    SQL body:     { connection_string, table }
    MongoDB body: { connection_string, database, table }   (table = collection name)
    """
    conn = body.connection_string.strip()
    conn_lower = conn.lower()

    if not any(k in conn_lower for k in ("sqlite", "postgres", "postgresql", "mysql", "mongodb")):
        raise HTTPException(400, "Unsupported connection string.")

    job_id = str(uuid.uuid4())
    _init_job(job_id, conn)

    initial_state: dict = {"source_path": conn}

    if "mongodb" in conn_lower:
        # For MongoDB, pass database name and collection name via state
        initial_state["_mongo_database"]   = body.database
        initial_state["_mongo_collection"] = body.table
    else:
        initial_state["_db_table"] = body.table   # None → first table

    _schedule(background_tasks, job_id, initial_state)
    return {"job_id": job_id, "connection": conn}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    """Poll job progress."""
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found.")
    j = JOBS[job_id]
    return {
        "status":   j["status"],
        "progress": j["progress"],
        "stage":    j["stage"],
        "error":    j.get("error"),
    }


@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    """Return the full dashboard payload once the pipeline is done."""
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found.")
    j = JOBS[job_id]
    if j["status"] != "done":
        raise HTTPException(400, f"Pipeline not finished yet (status={j['status']}).")
    return JSONResponse(content=j["result"])


@app.post("/api/query/{job_id}")
async def natural_language_query(job_id: str, body: QueryRequest):
    """Answer a BI question using the insights generated by the pipeline."""
    if job_id not in JOBS or JOBS[job_id]["status"] != "done":
        raise HTTPException(400, "Dashboard not ready yet.")

    r = JOBS[job_id].get("result", {})
    ctx = "\n\n".join(filter(None, [
        "KPIs:\n"            + json.dumps(r.get("kpis", []), indent=2) if r.get("kpis") else "",
        "Insights:\n"        + r.get("insights", ""),
        "Anomaly Report:\n"  + r.get("anomaly_report", ""),
        "Dataset Profile:\n" + r.get("profile", "")[:2000],
    ]))

    try:
        from langchain_ollama import OllamaLLM
        llm = OllamaLLM(model="mistral")
        answer = llm.invoke(
            f"You are an expert Business Intelligence analyst.\n\nContext:\n{ctx}\n\n"
            f"Question: {body.question}\n\nProvide a clear, concise business answer."
        )
        return {"answer": answer}
    except Exception as e:
        return {"answer": f"⚠ AI model unavailable ({e}).\n\nContext summary:\n{ctx[:600]}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)