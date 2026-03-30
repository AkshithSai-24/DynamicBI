"""
query_loop.py  —  DynamicBI intelligent query engine
======================================================
Stateless function called per-question from the FastAPI /api/query endpoint.
Returns a structured dict:
  {
    "answer":    str,           # natural-language explanation
    "data":      list[dict],    # tabular query result (empty if scalar/text)
    "visual":    {              # present only when a chart was generated
        "data":      str,       # base64-encoded PNG
        "name":      str,
        "chartData": dict,      # statistics + series for the lightbox panel
        "category":  "query",
    } | None,
    "needs_visual": bool,       # AI decision flag
  }
"""

from __future__ import annotations
import base64, io, json, os, re, traceback
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from langchain_ollama import OllamaLLM

from config import LLM_MODEL
from utils.code_extractor import extract_python, extract_sql

# ── LLM singleton (reused across calls) ───────────────────────────────────────
_llm: OllamaLLM | None = None

def _get_llm() -> OllamaLLM:
    global _llm
    if _llm is None:
        _llm = OllamaLLM(model=LLM_MODEL)
    return _llm


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_json(obj: Any) -> Any:
    """Recursively make an object JSON-serialisable."""
    if isinstance(obj, (pd.Timestamp, pd.NaT.__class__)):
        return str(obj)
    if isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _safe_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_json(v) for v in obj]
    return obj


def _df_to_rows(df: pd.DataFrame, max_rows: int = 200) -> list[dict]:
    return [_safe_json(row) for row in df.head(max_rows).to_dict(orient="records")]


def _fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=120)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def _compute_chart_data(df: pd.DataFrame, chart_type: str,
                         x_col: str, y_col: str | None) -> dict:
    """Build a chartData dict matching the lightbox panel format."""
    cd: dict = {
        "chart_type": chart_type,
        "x_name": x_col,
        "y_name": y_col or "value",
    }
    # Series preview
    if y_col and y_col in df.columns:
        pts = [{"x": str(r[x_col]), "y": _safe_json(r[y_col])}
               for _, r in df.head(50).iterrows()]
    else:
        pts = [{"x": str(v)} for v in df[x_col].head(50).tolist()]
    cd["series"] = {
        "representation": "points",
        "total_points": len(df),
        "preview_points": pts[:20],
    }
    # Basic statistics per numeric column
    stats = {}
    for col in [x_col, y_col]:
        if col and col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
            s = df[col].dropna()
            stats[col] = _safe_json({
                "label": col, "count": len(s), "missing": int(df[col].isna().sum()),
                "mean": s.mean(), "median": s.median(), "std": s.std(),
                "min": s.min(), "max": s.max(), "range": s.max() - s.min(),
                "q1": s.quantile(0.25), "q3": s.quantile(0.75),
                "iqr": s.quantile(0.75) - s.quantile(0.25),
                "skewness": float(s.skew()), "kurtosis": float(s.kurtosis()),
            })
    if stats:
        cd["statistics"] = stats
    return cd


# ── Visual decision & generation ───────────────────────────────────────────────

def _should_visualise(question: str, df: pd.DataFrame) -> tuple[bool, str]:
    """
    Ask the LLM whether a chart would help.
    Returns (should_visualise, chart_type).
    chart_type ∈ {bar, line, scatter, pie, histogram, none}
    """
    # Explicit visual keywords → always show chart
    vis_keywords = re.compile(
        r"\b(plot|chart|graph|visuali[sz]|show|display|histogram|bar|pie|scatter|trend|distribution)\b",
        re.I
    )
    if vis_keywords.search(question):
        forced = True
    else:
        forced = False

    cols = df.columns.tolist() if df is not None and len(df) > 0 else []
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])] if df is not None else []
    cat_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(df[c])] if df is not None else []

    if df is None or len(df) == 0 or len(cols) == 0:
        return False, "none"

    prompt = f"""You are a BI analyst deciding whether to show a chart.

User question: {question}
Result has {len(df)} rows and columns: {cols}
Numeric columns: {num_cols}
Categorical columns: {cat_cols}
Forced (user asked for visual): {forced}

Respond with ONLY a JSON object, nothing else:
{{"needs_visual": true/false, "chart_type": "bar|line|scatter|pie|histogram|none", "x_col": "<column>", "y_col": "<column or null>"}}

Rules:
- If forced=true, needs_visual must be true
- Use "none" as chart_type when needs_visual is false
- x_col must be a real column name from the list above
- y_col must be a real column name or null
- bar: categorical x, numeric y (good for comparisons, rankings)
- line: time/ordered x, numeric y (trends over time)
- scatter: two numeric columns (correlation)
- pie: categorical x, numeric y (proportions, max 10 slices)
- histogram: single numeric column (distribution)
"""
    try:
        raw = _get_llm().invoke(prompt).strip()
        # Extract JSON even if wrapped in markdown
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        dec = json.loads(m.group()) if m else {}
        needs_v = bool(dec.get("needs_visual", False))
        ctype   = str(dec.get("chart_type", "none")).lower()
        xcol    = dec.get("x_col", cols[0] if cols else None)
        ycol    = dec.get("y_col", None)
        # Validate column names
        if xcol not in cols:
            xcol = cols[0]
        if ycol not in cols:
            ycol = num_cols[0] if num_cols else None
        return needs_v or forced, ctype, xcol, ycol
    except Exception:
        return forced, "bar", cols[0] if cols else None, num_cols[0] if num_cols else None


def _generate_visual(df: pd.DataFrame, question: str,
                     chart_type: str, x_col: str, y_col: str | None) -> dict | None:
    """Generate a matplotlib chart and return the visual payload."""
    try:
        # Sanitise column names (MongoDB dot notation)
        df = df.copy()
        df.columns = [c.replace(".", "_") for c in df.columns]
        x_col = x_col.replace(".", "_")
        if y_col:
            y_col = y_col.replace(".", "_")
        if "_id" in df.columns:
            df = df.rename(columns={"_id": "category"})
            if x_col == "_id":
                x_col = "category"

        fig, ax = plt.subplots(figsize=(8, 5))
        fig.patch.set_facecolor("#0c0f1e")
        ax.set_facecolor("#111426")
        for spine in ax.spines.values():
            spine.set_edgecolor("#1c2438")
        ax.tick_params(colors="#7585a8", labelsize=9)
        ax.xaxis.label.set_color("#7585a8")
        ax.yaxis.label.set_color("#7585a8")
        ax.title.set_color("#dde4f4")

        ACCENT  = "#00e5a0"
        ACCENT2 = "#4d9fff"
        DANGER  = "#ff5e7a"
        palette = [ACCENT, ACCENT2, "#f4a535", "#c084fc", DANGER,
                   "#60d394", "#fb923c", "#38bdf8"]

        df_plot = df.dropna(subset=[x_col] + ([y_col] if y_col else []))

        if chart_type == "histogram":
            col = x_col if x_col in df.columns else y_col
            ax.hist(df_plot[col].dropna(), bins=30, color=ACCENT, alpha=0.85, edgecolor="#0c0f1e")
            ax.set_xlabel(col)
            ax.set_ylabel("Frequency")

        elif chart_type == "pie":
            if y_col and y_col in df_plot.columns:
                pie_df = df_plot[[x_col, y_col]].head(10)
                vals = pie_df[y_col].astype(float)
                labels = pie_df[x_col].astype(str)
            else:
                counts = df_plot[x_col].value_counts().head(10)
                vals   = counts.values
                labels = counts.index.astype(str)
            wedges, texts, autotexts = ax.pie(
                vals, labels=labels, autopct="%1.1f%%",
                colors=palette[:len(vals)], startangle=140,
                textprops={"color": "#dde4f4", "fontsize": 9},
            )
            for at in autotexts:
                at.set_color("#dde4f4")

        elif chart_type == "line":
            if y_col and y_col in df_plot.columns:
                ax.plot(df_plot[x_col].astype(str), df_plot[y_col],
                        color=ACCENT, linewidth=2, marker="o", markersize=4)
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)
                plt.xticks(rotation=45, ha="right")
            else:
                counts = df_plot[x_col].value_counts().sort_index()
                ax.plot(counts.index.astype(str), counts.values,
                        color=ACCENT, linewidth=2, marker="o", markersize=4)
                plt.xticks(rotation=45, ha="right")

        elif chart_type == "scatter":
            if y_col and y_col in df_plot.columns:
                ax.scatter(df_plot[x_col], df_plot[y_col],
                           color=ACCENT, alpha=0.55, s=18, edgecolors="none")
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)
            else:
                chart_type = "bar"  # fallback

        if chart_type == "bar":
            if y_col and y_col in df_plot.columns:
                bar_df = df_plot[[x_col, y_col]].head(20)
                bars = ax.bar(bar_df[x_col].astype(str), bar_df[y_col].astype(float),
                              color=palette[:len(bar_df)], edgecolor="none")
            else:
                counts = df_plot[x_col].value_counts().head(20)
                bars = ax.bar(counts.index.astype(str), counts.values,
                              color=palette[:len(counts)], edgecolor="none")
            plt.xticks(rotation=40, ha="right", fontsize=8)
            if y_col:
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)

        ax.set_title(question[:72] + ("…" if len(question) > 72 else ""),
                     fontsize=11, pad=12, color="#dde4f4")
        plt.tight_layout()

        b64 = _fig_to_b64(fig)
        plt.close(fig)

        chart_data = _compute_chart_data(df, chart_type, x_col, y_col)

        name = f"Query: {question[:50]}"
        return {
            "data":      b64,
            "name":      name,
            "chartData": chart_data,
            "category":  "query",
        }
    except Exception as e:
        print(f"[query visual] error: {e}\n{traceback.format_exc()}")
        plt.close("all")
        return None


# ── Per-source query executors ─────────────────────────────────────────────────

def _query_csv_excel(df: pd.DataFrame, question: str) -> tuple[Any, str]:
    """Execute a pandas query, return (result_df_or_scalar, generated_code)."""
    llm = _get_llm()
    cols_info = "\n".join(f"  {c}: {df[c].dtype}" for c in df.columns)
    prompt = f"""You are a pandas expert.

DataFrame columns and dtypes:
{cols_info}

Sample (3 rows):
{df.head(3).to_string(index=False)}

User question: {question}

Rules:
- DataFrame is named `df`
- Store final result in variable `result`
- `result` should be a DataFrame or a scalar (int/float/str)
- Return ONLY executable Python, no markdown, no explanation
- Use .reset_index() if needed
- Do not import anything extra
"""
    code = extract_python(llm.invoke(prompt))
    local_vars: dict = {"df": df.copy(), "pd": pd, "np": np}
    exec(compile(code, "<query>", "exec"), {}, local_vars)   # nosec
    return local_vars.get("result"), code


def _query_sql(df: pd.DataFrame, engine: Any, table: str, question: str) -> tuple[Any, str]:
    llm = _get_llm()
    dialect = engine.dialect.name
    cols_info = ", ".join(f"{c} ({df[c].dtype})" for c in df.columns)
    schema = f"Table: {table}\nColumns: {cols_info}\nDialect: {dialect}"

    def _run_sql(sql: str) -> pd.DataFrame:
        return pd.read_sql(sql, engine)

    prompt = f"""You are an expert SQL developer.

Schema:
{schema}

Question: {question}

Rules:
- Return ONLY the SQL query, no explanation, no markdown
- Compatible with {dialect}
- SELECT query only
"""
    sql = extract_sql(llm.invoke(prompt))
    try:
        return _run_sql(sql), sql
    except Exception as e:
        retry_prompt = f"""The following SQL failed for {dialect}:
{sql}
Error: {e}
Schema: {schema}
Question: {question}
Rewrite correctly. Return ONLY SQL."""
        fixed_sql = extract_sql(llm.invoke(retry_prompt))
        return _run_sql(fixed_sql), fixed_sql


def _query_mongodb(client: Any, db_name: str, col_name: str,
                   question: str) -> tuple[Any, str]:
    llm = _get_llm()
    collection = client[db_name][col_name]
    sample_docs = list(collection.find({}, {"_id": 0}).limit(5))
    schema_keys = list(sample_docs[0].keys()) if sample_docs else []

    prompt = f"""You are an expert MongoDB developer.

Collection: {col_name}
Fields: {schema_keys}
Sample: {json.dumps(sample_docs[:2], default=str)}

Question: {question}

Rules:
- Return ONLY a valid JSON array (MongoDB aggregation pipeline)
- No markdown, no comments, no extra text
- Use $project, $group, $sort, $limit etc as needed
"""
    raw = llm.invoke(prompt)

    def _extract(text: str) -> list:
        try:
            return json.loads(text)
        except Exception:
            m = re.search(r'\[.*\]', text, re.DOTALL)
            if not m:
                raise ValueError("No JSON array found")
            cleaned = re.sub(r'//.*', '', m.group())
            cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
            return json.loads(cleaned)

    pipeline = _extract(raw)
    pipeline_str = json.dumps(pipeline, indent=2)

    def _run(pipe):
        docs = list(collection.aggregate(pipe))
        flat = []
        for doc in docs:
            row = {}
            for k, v in doc.items():
                if isinstance(v, dict):
                    for kk, vv in v.items():
                        row[f"{k}.{kk}"] = vv
                else:
                    row[k] = v
            flat.append(row)
        return pd.DataFrame(flat)

    try:
        return _run(pipeline), pipeline_str
    except Exception as e:
        retry = f"""Pipeline failed:
{pipeline_str}
Error: {e}
Collection: {col_name}, Fields: {schema_keys}
Question: {question}
Return corrected JSON pipeline only."""
        fixed = _extract(llm.invoke(retry))
        return _run(fixed), json.dumps(fixed, indent=2)


def _coerce_df(result: Any) -> pd.DataFrame | None:
    """Convert a query result to a DataFrame (or return None if scalar)."""
    if isinstance(result, pd.DataFrame):
        return result if len(result) > 0 else None
    if isinstance(result, pd.Series):
        return result.reset_index()
    if isinstance(result, (int, float, str, bool, np.integer, np.floating)):
        return None    # scalar — no table/chart needed
    try:
        return pd.DataFrame(result)
    except Exception:
        return None


def _narrate(question: str, result: Any, df: pd.DataFrame | None,
             source_context: str) -> str:
    """Ask LLM to produce a natural-language answer from the result."""
    llm = _get_llm()

    if df is not None and len(df) > 0:
        result_summary = df.head(10).to_string(index=False)
        if len(df) > 10:
            result_summary += f"\n… ({len(df)} rows total)"
    else:
        result_summary = str(result)

    prompt = f"""You are an expert Business Intelligence analyst.

Dataset context:
{source_context}

User question: {question}

Query result:
{result_summary}

Write a clear, well-structured business answer. Use this format:
- Start with 1-2 sentences summarising the key finding directly
- If the result has multiple items, list the top insights as bullet points using "- " prefix
- End with 1 sentence on the business implication

Rules:
- Use plain text only — no asterisks (*), no markdown bold (**), no headers (#)
- Do NOT repeat every raw number — focus on patterns and significance
- Keep the total response under 150 words
"""
    try:
        return llm.invoke(prompt).strip()
    except Exception:
        return f"Result: {result_summary}"


# ── Public entry point ─────────────────────────────────────────────────────────

def run_query(
    question: str,
    source_type: str,
    df: pd.DataFrame,
    engine: Any = None,
    table_name: str | None = None,
    mongo_client: Any = None,
    db_name: str | None = None,
    collection_name: str | None = None,
    source_context: str = "",
) -> dict:
    """
    Main entry point called by the FastAPI /api/query endpoint.
    Returns a structured response dict.
    """
    result_df: pd.DataFrame | None = None
    code_used = ""
    error_msg = ""

    # ── 1. Execute query against the appropriate data source ───────────────────
    try:
        if source_type in ("csv", "excel"):
            raw, code_used = _query_csv_excel(df, question)
            result_df = _coerce_df(raw)
            if result_df is None:
                scalar_str = str(raw)
            else:
                scalar_str = ""

        elif source_type in ("sql", "sqlite", "postgres", "mysql", "oracle"):
            if engine is None:
                raise ValueError("SQL engine not available for this job")
            raw, code_used = _query_sql(df, engine, table_name or "data", question)
            result_df = _coerce_df(raw)
            scalar_str = str(raw) if result_df is None else ""

        elif source_type == "mongodb":
            if mongo_client is None:
                raise ValueError("MongoDB client not available for this job")
            raw, code_used = _query_mongodb(
                mongo_client, db_name or "", collection_name or "", question
            )
            result_df = _coerce_df(raw)
            scalar_str = str(raw) if result_df is None else ""

        else:
            raise ValueError(f"Unknown source_type: {source_type}")

    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        result_df = None
        scalar_str = ""

    # ── 2. AI narration ────────────────────────────────────────────────────────
    answer = _narrate(question, result_df if result_df is not None else scalar_str,
                      result_df, source_context)
    if error_msg:
        answer = f"⚠ Could not execute query: {error_msg}\n\n{answer}"

    # ── 3. Visual decision & generation ───────────────────────────────────────
    visual = None
    needs_visual = False

    if result_df is not None and len(result_df) > 0:
        try:
            needs_v, ctype, xcol, ycol = _should_visualise(question, result_df)
            needs_visual = needs_v
            if needs_visual and ctype != "none" and xcol:
                visual = _generate_visual(result_df, question, ctype, xcol, ycol)
        except Exception as ve:
            print(f"[query visual decision] {ve}")

    # ── 4. Build response ──────────────────────────────────────────────────────
    rows = _df_to_rows(result_df) if result_df is not None else []

    return {
        "answer":       answer,
        "data":         rows,
        "visual":       visual,
        "needs_visual": needs_visual,
        "row_count":    len(result_df) if result_df is not None else 0,
        "columns":      result_df.columns.tolist() if result_df is not None else [],
    }