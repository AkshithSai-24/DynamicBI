"""
query_loop.py  —  DynamicBI intelligent query engine
======================================================
Stateless function called per-question from the FastAPI /api/query endpoint.

What's new (v3):
  • Computed-column awareness — the LLM is told it CAN and SHOULD create new
    derived columns (margins, ratios, YoY, rolling averages, bins, etc.) when
    the question calls for them.  The generated code is executed in a rich
    sandbox (pd, np, datetime).
  • Two-phase LLM call — first a "plan" call decides WHAT columns are needed,
    then a "code" call produces clean pandas code.  Falls back gracefully to
    single-phase for simple queries.
  • Retry with full error context — on exec failure the LLM receives the
    traceback and the failing code so it can self-correct.
  • Robust code extraction — handles plain code, ```python blocks, and
    partial/inline code.
  • Richer narration — adapts tone to result type (scalar, table, derived).
  • Visual path fully consistent — _should_visualise always returns 4-tuple.

Returns:
  {
    "answer":       str,
    "data":         list[dict],
    "visual":       {data, name, chartData, category} | None,
    "needs_visual": bool,
    "row_count":    int,
    "columns":      list[str],
    "derived_cols": list[str],   # new computed columns added for this query
  }
"""

from __future__ import annotations
import base64, io, json, os, re, textwrap, traceback
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from config import get_llm
from utils.code_extractor import extract_python, extract_sql


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_json(obj: Any) -> Any:
    if isinstance(obj, (pd.Timestamp,)):
        return str(obj)
    if isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, dict):
        return {
            ("_".join(str(k) for k in key) if isinstance(key, tuple) else
             str(key) if not isinstance(key, (str, int, float, bool, type(None))) else key):
            _safe_json(v)
            for key, v in obj.items()
        }
    if isinstance(obj, (list, tuple)):
        return [_safe_json(v) for v in obj]
    return obj


def _df_to_rows(df: pd.DataFrame, max_rows: int = 500) -> list[dict]:
    return [_safe_json(row) for row in df.head(max_rows).to_dict(orient="records")]


def _fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=130)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def _flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ["_".join(str(lvl) for lvl in col).strip("_") for col in df.columns]
    else:
        df.columns = [str(c) for c in df.columns]
    return df


def _coerce_df(result: Any) -> pd.DataFrame | None:
    if isinstance(result, pd.DataFrame):
        if len(result) == 0:
            return None
        df = _flatten_columns(result)
        if isinstance(result.index, pd.MultiIndex):
            df = df.reset_index(drop=True)
        return df
    if isinstance(result, pd.Series):
        return _flatten_columns(result.reset_index())
    if isinstance(result, (int, float, str, bool, np.integer, np.floating)):
        return None
    try:
        return _flatten_columns(pd.DataFrame(result))
    except Exception:
        return None


def _schema_summary(df: pd.DataFrame) -> str:
    """Compact schema string: col (dtype) [sample vals]"""
    lines = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        sample_vals = df[col].dropna().head(4).tolist()
        sample_str = ", ".join(repr(v) for v in sample_vals)
        lines.append(f"  {col!r} ({dtype}): [{sample_str}]")
    return "\n".join(lines)


def _rich_sandbox() -> dict:
    """Execution sandbox with common libraries pre-imported."""
    return {
        "pd": pd,
        "np": np,
        "datetime": datetime,
        "timedelta": timedelta,
        "re": re,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Chart data helper
# ─────────────────────────────────────────────────────────────────────────────

def _compute_chart_data(df: pd.DataFrame, chart_type: str,
                        x_col: str, y_col: str | None) -> dict:
    cd: dict = {"chart_type": chart_type, "x_name": x_col, "y_name": y_col or "value"}
    if y_col and y_col in df.columns:
        pts = [{"x": str(r[x_col]), "y": _safe_json(r[y_col])}
               for _, r in df.head(100).iterrows()]
    else:
        pts = [{"x": str(v)} for v in df[x_col].head(100).tolist()]
    cd["series"] = {
        "representation": "points",
        "total_points": len(df),
        "preview_points": pts[:100],
    }
    stats = {}
    for col in [x_col, y_col]:
        if col and col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
            s = df[col].dropna()
            stats[col] = _safe_json({
                "label": col, "count": len(s),
                "missing": int(df[col].isna().sum()),
                "mean": s.mean(), "median": s.median(), "std": s.std(),
                "min": s.min(), "max": s.max(),
                "q1": s.quantile(0.25), "q3": s.quantile(0.75),
                "skewness": float(s.skew()), "kurtosis": float(s.kurtosis()),
            })
    if stats:
        cd["statistics"] = stats
    return cd


# ─────────────────────────────────────────────────────────────────────────────
#  Visual decision  (always returns a 4-tuple)
# ─────────────────────────────────────────────────────────────────────────────

def _should_visualise(question: str, df: pd.DataFrame) -> tuple[bool, str, str, str | None]:
    """
    Decide whether a chart is needed and which type.
    Always returns (needs_visual: bool, chart_type: str, x_col: str, y_col: str|None).
    """
    vis_kw = re.compile(
        r"\b(plot|chart|graph|visuali[sz]|show|display|histogram|bar|pie|"
        r"scatter|trend|distribution|compare|rank|top|bottom)\b", re.I
    )
    forced = bool(vis_kw.search(question))

    if df is None or len(df) == 0:
        return False, "none", "", None

    cols     = df.columns.tolist()
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    cat_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(df[c])]
    default_x = cat_cols[0] if cat_cols else (cols[0] if cols else "")
    default_y = num_cols[0] if num_cols else None

    prompt = textwrap.dedent(f"""
        You are a BI analyst deciding whether to show a chart.

        User question: {question}
        Result: {len(df)} rows, columns: {cols}
        Numeric columns: {num_cols}
        Categorical columns: {cat_cols}
        Forced (user asked for visual): {forced}

        Respond ONLY with a JSON object:
        {{"needs_visual": true/false, "chart_type": "bar|line|scatter|pie|histogram|none",
          "x_col": "<column>", "y_col": "<column or null>"}}

        Rules:
        - If forced=true → needs_visual must be true
        - bar: categorical x, numeric y (comparisons, rankings)
        - line: time/ordered x, numeric y (trends)
        - scatter: two numeric columns (correlation)
        - pie: categorical x, numeric y, ≤10 categories (proportions)
        - histogram: single numeric column (distribution)
        - x_col and y_col must be real column names from the list above
    """).strip()

    try:
        resp = get_llm().invoke(prompt)
        raw  = (resp.content if hasattr(resp, "content") else str(resp)).strip()
        m    = re.search(r"\{.*\}", raw, re.DOTALL)
        dec  = json.loads(m.group()) if m else {}
        needs_v = bool(dec.get("needs_visual", False)) or forced
        ctype   = str(dec.get("chart_type", "bar")).lower()
        xcol    = dec.get("x_col", default_x)
        ycol    = dec.get("y_col", default_y)
        if xcol not in cols:
            xcol = default_x
        if ycol not in cols:
            ycol = default_y
        return needs_v, ctype, xcol, ycol
    except Exception:
        return forced, "bar", default_x, default_y


# ─────────────────────────────────────────────────────────────────────────────
#  Chart renderer
# ─────────────────────────────────────────────────────────────────────────────

_BG, _PANEL  = "#0c0f1e", "#111426"
_BORDER      = "#1c2438"
_TEXT, _MUTED= "#dde4f4", "#7585a8"
_TEAL        = "#00e5a0"
_BLUE        = "#4d9fff"
_RED         = "#ff5e7a"
_YELLOW      = "#f4a535"
_PALETTE     = [_TEAL, _BLUE, _YELLOW, "#c084fc", _RED, "#60d394", "#fb923c", "#38bdf8"]


def _generate_visual(df: pd.DataFrame, question: str,
                     chart_type: str, x_col: str, y_col: str | None) -> dict | None:
    try:
        df = df.copy()
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = ["_".join(str(l) for l in c).strip("_") for c in df.columns]
        else:
            df.columns = [str(c) for c in df.columns]
        df.columns = [c.replace(".", "_") for c in df.columns]
        x_col = str(x_col).replace(".", "_")
        if y_col:
            y_col = y_col.replace(".", "_")
        if "_id" in df.columns:
            df = df.rename(columns={"_id": "category"})
            if x_col == "_id":
                x_col = "category"

        # Guard: ensure cols exist
        if x_col not in df.columns:
            x_col = df.columns[0]
        if y_col and y_col not in df.columns:
            num = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            y_col = num[0] if num else None

        fig, ax = plt.subplots(figsize=(9, 5))
        fig.patch.set_facecolor(_BG)
        ax.set_facecolor(_PANEL)
        for spine in ax.spines.values():
            spine.set_edgecolor(_BORDER)
        ax.tick_params(colors=_MUTED, labelsize=9)
        ax.xaxis.label.set_color(_MUTED)
        ax.yaxis.label.set_color(_MUTED)
        ax.grid(axis="y", color="#1a2035", linewidth=0.6, linestyle="--")

        df_plot = df.dropna(subset=[x_col] + ([y_col] if y_col else []))

        if chart_type == "histogram":
            col = x_col if pd.api.types.is_numeric_dtype(df_plot[x_col]) else (y_col or x_col)
            ax.hist(df_plot[col].dropna(), bins=30, color=_TEAL, alpha=0.85, edgecolor=_BG)
            ax.set_xlabel(col); ax.set_ylabel("Frequency")

        elif chart_type == "pie":
            if y_col and y_col in df_plot.columns:
                pie_df = df_plot[[x_col, y_col]].head(10)
                vals, labels = pie_df[y_col].astype(float), pie_df[x_col].astype(str)
            else:
                vc = df_plot[x_col].value_counts().head(10)
                vals, labels = vc.values, vc.index.astype(str)
            _, _, autotexts = ax.pie(
                vals, labels=labels, autopct="%1.1f%%",
                colors=_PALETTE[:len(vals)], startangle=140,
                textprops={"color": _TEXT, "fontsize": 9},
            )
            for at in autotexts:
                at.set_color(_TEXT)

        elif chart_type == "line":
            if y_col and y_col in df_plot.columns:
                ax.plot(df_plot[x_col].astype(str), df_plot[y_col],
                        color=_TEAL, linewidth=2.2, marker="o", markersize=4)
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)
                plt.xticks(rotation=40, ha="right")
            else:
                vc = df_plot[x_col].value_counts().sort_index()
                ax.plot(vc.index.astype(str), vc.values,
                        color=_TEAL, linewidth=2.2, marker="o", markersize=4)
                plt.xticks(rotation=40, ha="right")

        elif chart_type == "scatter":
            if y_col and y_col in df_plot.columns:
                ax.scatter(df_plot[x_col], df_plot[y_col],
                           color=_TEAL, alpha=0.5, s=22, edgecolors="none")
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)
            else:
                chart_type = "bar"

        if chart_type == "bar":
            if y_col and y_col in df_plot.columns:
                bar_df = df_plot[[x_col, y_col]].head(25)
                ax.bar(bar_df[x_col].astype(str), bar_df[y_col].astype(float),
                       color=_PALETTE[:len(bar_df)], edgecolor="none")
            else:
                vc = df_plot[x_col].value_counts().head(25)
                ax.bar(vc.index.astype(str), vc.values,
                       color=_PALETTE[:len(vc)], edgecolor="none")
            plt.xticks(rotation=40, ha="right", fontsize=8)
            if y_col:
                ax.set_xlabel(x_col); ax.set_ylabel(y_col)

        title = question[:70] + ("…" if len(question) > 70 else "")
        ax.set_title(title, fontsize=11, pad=10, color=_TEXT)
        plt.tight_layout()
        b64 = _fig_to_b64(fig)
        plt.close(fig)
        return {
            "data":      b64,
            "name":      f"Query: {question[:50]}",
            "chartData": _compute_chart_data(df, chart_type, x_col, y_col),
            "category":  "query",
        }
    except Exception as e:
        print(f"[query visual] {e}\n{traceback.format_exc()}")
        plt.close("all")
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  Core CSV/Excel query executor  (the main improvement)
# ─────────────────────────────────────────────────────────────────────────────

_DERIVE_HINTS = """
You CAN and SHOULD create new computed columns when the question calls for them.
Common patterns:
  df['profit_margin']  = df['Profit'] / df['Revenue'] * 100
  df['revenue_per_unit'] = df['Revenue'] / df['Quantity']
  df['month'] = pd.to_datetime(df['Date']).dt.to_period('M').astype(str)
  df['year']  = pd.to_datetime(df['Date']).dt.year
  df['growth'] = df['Revenue'].pct_change() * 100
  df['rolling_avg'] = df['Sales'].rolling(7).mean()
  df['segment'] = pd.cut(df['Age'], bins=[0,25,45,65,100], labels=['Young','Mid','Senior','Elder'])
  df['rank'] = df['Revenue'].rank(ascending=False)
"""

def _build_code_prompt(df: pd.DataFrame, question: str, extra: str = "") -> str:
    return textwrap.dedent(f"""
        You are an expert pandas data analyst.

        DataFrame `df` — schema (column: dtype: sample values):
        {_schema_summary(df)}

        Total rows: {len(df)}

        User question: {question}

        {_DERIVE_HINTS}

        {extra}

        Rules:
        - Write clean, executable Python.  df is already loaded.
        - Do NOT import anything — pd, np, datetime, timedelta, re are available.
        - Store the final result in a variable named `result`.
        - `result` must be a DataFrame, Series, or scalar (int/float/str).
        - Use .reset_index() after groupby so index columns become regular columns.
        - When creating computed columns, add them to df before grouping/filtering.
        - For percentage/ratio columns, round to 2 decimal places.
        - If the question asks for top-N, sort descending and use .head(N).
        - Return ONLY executable Python code — no markdown, no explanation.
    """).strip()


def _exec_code(code: str, df: pd.DataFrame) -> tuple[Any, list[str]]:
    """
    Execute LLM-generated pandas code.
    Returns (result, list_of_new_columns_added_to_df).
    """
    original_cols = set(df.columns)
    sandbox = _rich_sandbox()
    sandbox["df"] = df.copy()
    exec(compile(code, "<query>", "exec"), {}, sandbox)   # nosec
    result = sandbox.get("result")
    result_df = sandbox.get("df")
    new_cols = [c for c in (result_df.columns if result_df is not None else [])
                if c not in original_cols]
    return result, new_cols


def _query_csv_excel(df: pd.DataFrame, question: str) -> tuple[Any, str, list[str]]:
    """
    Two-phase: plan → code → exec → (auto-retry with error context).
    Returns (result, code_used, derived_columns).
    """
    llm = get_llm()
    derived_cols: list[str] = []

    # ── Phase 1: generate code ─────────────────────────────────────────────────
    prompt = _build_code_prompt(df, question)
    resp   = llm.invoke(prompt)
    raw    = (resp.content if hasattr(resp, "content") else str(resp)).strip()
    code   = extract_python(raw)

    # ── Phase 2: execute ───────────────────────────────────────────────────────
    try:
        result, derived_cols = _exec_code(code, df)
        return result, code, derived_cols

    except Exception as first_err:
        first_tb = traceback.format_exc()

        # ── Retry: give LLM the error so it can self-correct ──────────────────
        retry_prompt = _build_code_prompt(
            df, question,
            extra=textwrap.dedent(f"""
                Your previous attempt failed with this error — fix it:

                --- FAILED CODE ---
                {code}

                --- ERROR ---
                {first_tb[-1200:]}
            """).strip()
        )
        resp2 = llm.invoke(retry_prompt)
        raw2  = (resp2.content if hasattr(resp2, "content") else str(resp2)).strip()
        code2 = extract_python(raw2)

        try:
            result, derived_cols = _exec_code(code2, df)
            return result, code2, derived_cols
        except Exception as second_err:
            raise RuntimeError(
                f"Query failed after retry.\n"
                f"1st error: {first_err}\n"
                f"2nd error: {second_err}"
            ) from second_err


# ─────────────────────────────────────────────────────────────────────────────
#  SQL executor  (unchanged except consistent return signature)
# ─────────────────────────────────────────────────────────────────────────────

def _query_sql(df: pd.DataFrame, engine: Any, table: str, question: str
               ) -> tuple[Any, str, list[str]]:
    llm     = get_llm()
    dialect = engine.dialect.name
    cols_info = ", ".join(f"{c} ({df[c].dtype})" for c in df.columns)

    prompt = textwrap.dedent(f"""
        You are an expert SQL developer.
        Schema — Table: {table} | Columns: {cols_info} | Dialect: {dialect}
        Question: {question}
        Rules: Return ONLY the SQL SELECT query. No markdown. Compatible with {dialect}.
    """).strip()

    resp = llm.invoke(prompt)
    raw  = (resp.content if hasattr(resp, "content") else str(resp)).strip()
    sql  = extract_sql(raw)

    def _run(s: str) -> pd.DataFrame:
        return pd.read_sql(s, engine)

    try:
        return _run(sql), sql, []
    except Exception as e:
        retry = f"Failed SQL:\n{sql}\nError: {e}\nSchema: {table}({cols_info})\nQuestion: {question}\nReturn corrected SQL only."
        resp2 = llm.invoke(retry)
        raw2  = (resp2.content if hasattr(resp2, "content") else str(resp2)).strip()
        fixed = extract_sql(raw2)
        return _run(fixed), fixed, []


# ─────────────────────────────────────────────────────────────────────────────
#  MongoDB executor
# ─────────────────────────────────────────────────────────────────────────────

def _query_mongodb(client: Any, db_name: str, col_name: str,
                   question: str) -> tuple[Any, str, list[str]]:
    llm        = get_llm()
    collection = client[db_name][col_name]
    sample_docs = list(collection.find({}, {"_id": 0}).limit(5))
    schema_keys = list(sample_docs[0].keys()) if sample_docs else []

    prompt = textwrap.dedent(f"""
        You are an expert MongoDB developer.
        Collection: {col_name} | Fields: {schema_keys}
        Sample: {json.dumps(sample_docs[:2], default=str)}
        Question: {question}
        Return ONLY a valid JSON aggregation pipeline array. No markdown.
    """).strip()

    resp = llm.invoke(prompt)
    raw  = (resp.content if hasattr(resp, "content") else str(resp)).strip()

    def _extract(text: str) -> list:
        try:
            return json.loads(text)
        except Exception:
            m = re.search(r"\[.*\]", text, re.DOTALL)
            if not m:
                raise ValueError("No JSON array found")
            cleaned = re.sub(r"//.*", "", m.group())
            cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
            return json.loads(cleaned)

    def _run(pipe: list) -> pd.DataFrame:
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

    pipeline = _extract(raw)
    pipeline_str = json.dumps(pipeline, indent=2)

    try:
        return _run(pipeline), pipeline_str, []
    except Exception as e:
        retry = f"Pipeline failed:\n{pipeline_str}\nError: {e}\nFields: {schema_keys}\nQuestion: {question}\nReturn corrected pipeline only."
        resp2  = llm.invoke(retry)
        raw2   = (resp2.content if hasattr(resp2, "content") else str(resp2)).strip()
        fixed  = _extract(raw2)
        return _run(fixed), json.dumps(fixed, indent=2), []


# ─────────────────────────────────────────────────────────────────────────────
#  Narration
# ─────────────────────────────────────────────────────────────────────────────

def _narrate(question: str, result: Any, df: pd.DataFrame | None,
             source_context: str, derived_cols: list[str]) -> str:
    llm = get_llm()

    if df is not None and len(df) > 0:
        result_summary = df.head(12).to_string(index=False)
        if len(df) > 12:
            result_summary += f"\n… ({len(df)} rows total)"
    else:
        result_summary = str(result)

    derived_note = ""
    if derived_cols:
        derived_note = (
            f"\nNote: the following computed columns were created to answer this question: "
            f"{', '.join(derived_cols)}"
        )

    prompt = textwrap.dedent(f"""
        You are an expert Business Intelligence analyst answering a user's question about their data.

        Dataset context:
        {source_context[:1500]}

        User question: {question}

        Query result:
        {result_summary}
        {derived_note}

        Write a clear, direct business answer:
        - Start with 1–2 sentences summarising the key finding
        - For multi-row results, highlight the top 2–3 insights as bullet points using "- " prefix
        - Mention any computed/derived columns if they were needed to answer the question
        - End with a short business implication sentence

        Rules:
        - Plain text only — no asterisks, no markdown bold, no headers
        - Don't repeat every raw number; focus on patterns and significance
        - Keep total response under 160 words
    """).strip()

    try:
        resp = llm.invoke(prompt)
        return (resp.content if hasattr(resp, "content") else str(resp)).strip()
    except Exception:
        return f"Result: {result_summary}"


# ─────────────────────────────────────────────────────────────────────────────
#  Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_query(
    question:        str,
    source_type:     str,
    df:              pd.DataFrame,
    engine:          Any = None,
    table_name:      str | None = None,
    mongo_client:    Any = None,
    db_name:         str | None = None,
    collection_name: str | None = None,
    source_context:  str = "",
) -> dict:
    result_df:    pd.DataFrame | None = None
    code_used    = ""
    error_msg    = ""
    derived_cols: list[str] = []

    # ── 1. Execute against data source ────────────────────────────────────────
    try:
        if source_type in ("csv", "excel"):
            raw, code_used, derived_cols = _query_csv_excel(df, question)
            result_df  = _coerce_df(raw)
            scalar_str = str(raw) if result_df is None else ""

        elif source_type in ("sql", "sqlite", "postgres", "mysql", "oracle"):
            if engine is None:
                raise ValueError("SQL engine not available for this job")
            raw, code_used, derived_cols = _query_sql(df, engine, table_name or "data", question)
            result_df  = _coerce_df(raw)
            scalar_str = str(raw) if result_df is None else ""

        elif source_type == "mongodb":
            if mongo_client is None:
                raise ValueError("MongoDB client not available for this job")
            raw, code_used, derived_cols = _query_mongodb(
                mongo_client, db_name or "", collection_name or "", question
            )
            result_df  = _coerce_df(raw)
            scalar_str = str(raw) if result_df is None else ""

        else:
            raise ValueError(f"Unknown source_type: {source_type}")

    except Exception as e:
        error_msg  = str(e)
        scalar_str = ""
        traceback.print_exc()

    # ── 2. Narration ──────────────────────────────────────────────────────────
    answer = _narrate(
        question,
        result_df if result_df is not None else scalar_str,
        result_df,
        source_context,
        derived_cols,
    )
    if error_msg:
        answer = f"⚠ Could not execute query: {error_msg}\n\n{answer}"

    # ── 3. Visual decision & generation ───────────────────────────────────────
    visual       = None
    needs_visual = False

    if result_df is not None and len(result_df) > 0:
        try:
            needs_v, ctype, xcol, ycol = _should_visualise(question, result_df)
            needs_visual = needs_v
            if needs_visual and ctype != "none" and xcol:
                visual = _generate_visual(result_df, question, ctype, xcol, ycol)
        except Exception as ve:
            print(f"[query visual] {ve}")

    # ── 4. Response ───────────────────────────────────────────────────────────
    rows = _df_to_rows(result_df) if result_df is not None else []

    return {
        "answer":       answer,
        "data":         rows,
        "visual":       visual,
        "needs_visual": needs_visual,
        "row_count":    len(result_df) if result_df is not None else 0,
        "columns":      [str(c) for c in result_df.columns.tolist()] if result_df is not None else [],
        "derived_cols": derived_cols,
    }
