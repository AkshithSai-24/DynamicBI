"""
dashboard_schema_agent.py
=========================
Uses the LLM to analyse the dataset and produce a structured PowerBI-style
dashboard layout schema.  The schema describes:
  - Overall dashboard metadata (title, theme, data domain)
  - Page 1 & optional Page 2 layouts
  - Each widget: type, columns, aggregation, title, insight text, position

The frontend receives this schema and renders fully-interactive Recharts
components with filters, cross-filtering, drill-down, and KPI cards.
"""
import json
import re
import os
import math
import numpy as np
import pandas as pd
from config import get_llm


# ─── helpers ──────────────────────────────────────────────────────────────────

def _safe_val(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    return v


def _extract_json(text: str) -> dict:
    """Robustly extract JSON from LLM response (may have markdown fences)."""
    # strip markdown fences
    clean = re.sub(r"```(?:json)?", "", text, flags=re.I).replace("```", "").strip()
    # try full parse
    try:
        return json.loads(clean)
    except Exception:
        pass
    # find first { ... } block
    m = re.search(r"\{.*\}", clean, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return {}


def _df_summary(df: pd.DataFrame) -> str:
    """Compact text summary of the dataframe for the LLM prompt."""
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()

    lines = [
        f"Rows: {len(df)}, Columns: {len(df.columns)}",
        f"Numeric columns ({len(numeric_cols)}): {numeric_cols}",
        f"Categorical columns ({len(categorical_cols)}): {categorical_cols}",
        "",
        "Sample statistics (numeric):",
    ]
    for col in numeric_cols[:8]:
        s = df[col].dropna()
        if len(s):
            lines.append(
                f"  {col}: min={_safe_val(s.min())}, max={_safe_val(s.max())}, "
                f"mean={round(float(s.mean()), 2)}, nulls={int(df[col].isna().sum())}"
            )
    lines.append("")
    lines.append("Categorical value samples:")
    for col in categorical_cols[:6]:
        top = df[col].value_counts().head(5).index.tolist()
        lines.append(f"  {col}: {top}")
    lines.append("")
    lines.append("First 5 rows:")
    lines.append(df.head(5).to_string(index=False))
    return "\n".join(lines)


# ─── widget data builders ──────────────────────────────────────────────────────

def _build_kpi_data(df: pd.DataFrame, numeric_cols: list) -> list:
    kpis = []
    for col in numeric_cols[:8]:
        s = df[col].replace([np.inf, -np.inf], np.nan).dropna()
        if len(s) == 0:
            continue
        total = _safe_val(s.sum())
        avg = round(float(s.mean()), 2)
        mx = _safe_val(s.max())
        mn = _safe_val(s.min())
        kpis.append({
            "column": col,
            "label": col.replace("_", " ").title(),
            "sum": total,
            "avg": avg,
            "max": mx,
            "min": mn,
            "count": int(len(s)),
        })
    kpis.append({"column": "_rows", "label": "Total Records", "sum": len(df), "avg": len(df), "max": len(df), "min": len(df), "count": len(df)})
    return kpis


def _build_bar_data(df: pd.DataFrame, cat_col: str, num_col: str, agg: str = "sum", top_n: int = 15) -> list:
    try:
        if agg == "sum":
            grouped = df.groupby(cat_col)[num_col].sum()
        elif agg == "avg":
            grouped = df.groupby(cat_col)[num_col].mean().round(2)
        elif agg == "count":
            grouped = df.groupby(cat_col)[num_col].count()
        elif agg == "max":
            grouped = df.groupby(cat_col)[num_col].max()
        else:
            grouped = df.groupby(cat_col)[num_col].sum()

        grouped = grouped.sort_values(ascending=False).head(top_n)
        return [
            {"name": str(k), "value": _safe_val(v)}
            for k, v in grouped.items()
            if _safe_val(v) is not None
        ]
    except Exception:
        return []


def _build_line_data(df: pd.DataFrame, time_col: str, num_col: str, agg: str = "sum") -> list:
    try:
        ts = pd.to_datetime(df[time_col], errors="coerce")
        tmp = df.copy()
        tmp["_ts"] = ts
        tmp = tmp.dropna(subset=["_ts"])
        if len(tmp) == 0:
            return []
        # choose period granularity
        span_days = (tmp["_ts"].max() - tmp["_ts"].min()).days
        if span_days > 365 * 2:
            tmp["_period"] = tmp["_ts"].dt.to_period("M").astype(str)
        elif span_days > 90:
            tmp["_period"] = tmp["_ts"].dt.to_period("W").astype(str)
        elif span_days > 14:
            tmp["_period"] = tmp["_ts"].dt.to_period("D").astype(str)
        else:
            tmp["_period"] = tmp["_ts"].dt.to_period("D").astype(str)

        if agg == "sum":
            grp = tmp.groupby("_period")[num_col].sum()
        elif agg == "avg":
            grp = tmp.groupby("_period")[num_col].mean().round(2)
        elif agg == "count":
            grp = tmp.groupby("_period")[num_col].count()
        else:
            grp = tmp.groupby("_period")[num_col].sum()

        grp = grp.sort_index()
        return [{"name": str(k), "value": _safe_val(v)} for k, v in grp.items() if _safe_val(v) is not None]
    except Exception:
        return []


def _build_pie_data(df: pd.DataFrame, cat_col: str, num_col: str = None, top_n: int = 8) -> list:
    try:
        if num_col and num_col in df.columns:
            grouped = df.groupby(cat_col)[num_col].sum().sort_values(ascending=False).head(top_n)
            return [{"name": str(k), "value": _safe_val(v)} for k, v in grouped.items() if _safe_val(v) is not None]
        else:
            counts = df[cat_col].value_counts().head(top_n)
            return [{"name": str(k), "value": int(v)} for k, v in counts.items()]
    except Exception:
        return []


def _build_scatter_data(df: pd.DataFrame, x_col: str, y_col: str, color_col: str = None) -> list:
    try:
        cols = [x_col, y_col]
        if color_col and color_col in df.columns:
            cols.append(color_col)
        tmp = df[cols].dropna().head(500)
        result = []
        for _, row in tmp.iterrows():
            item = {"x": _safe_val(row[x_col]), "y": _safe_val(row[y_col])}
            if color_col and color_col in row:
                item["category"] = str(row[color_col])
            result.append(item)
        return result
    except Exception:
        return []


def _build_histogram_data(df: pd.DataFrame, col: str, bins: int = 20) -> list:
    try:
        vals = df[col].dropna().replace([np.inf, -np.inf], np.nan).dropna()
        counts, edges = np.histogram(vals, bins=bins)
        return [
            {"name": f"{round(float(edges[i]), 1)}-{round(float(edges[i+1]), 1)}", "value": int(counts[i])}
            for i in range(len(counts))
        ]
    except Exception:
        return []


def _build_table_data(df: pd.DataFrame, columns: list, top_n: int = 100) -> dict:
    try:
        cols = [c for c in columns if c in df.columns]
        if not cols:
            cols = df.columns.tolist()[:8]
        sample = df[cols].head(top_n)
        rows = []
        for _, row in sample.iterrows():
            rows.append({str(k): _safe_val(v) if not isinstance(v, str) else v for k, v in row.items()})
        return {"columns": cols, "rows": rows, "total": len(df)}
    except Exception:
        return {"columns": [], "rows": [], "total": 0}


def _build_correlation_data(df: pd.DataFrame, numeric_cols: list) -> dict:
    try:
        cols = numeric_cols[:10]
        clean = df[cols].replace([np.inf, -np.inf], np.nan)
        clean = clean.dropna(axis=1, how="all")
        clean = clean.loc[:, clean.nunique() > 1]
        if clean.shape[1] < 2:
            return {}
        corr = clean.corr().round(3)
        matrix = []
        for row_name in corr.index:
            for col_name in corr.columns:
                matrix.append({
                    "row": str(row_name),
                    "col": str(col_name),
                    "value": _safe_val(corr.loc[row_name, col_name])
                })
        return {"columns": corr.columns.tolist(), "matrix": matrix}
    except Exception:
        return {}


# ─── main agent ───────────────────────────────────────────────────────────────

def dashboard_schema_agent(state: dict) -> dict:
    """
    Analyses the dataset and produces a PowerBI-style dashboard schema
    plus pre-computed chart data for every widget.
    """
    df: pd.DataFrame = state["_df"]
    df.columns = [col.replace(".", "_") for col in df.columns]

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    all_cols = df.columns.tolist()

    # Detect date columns among categoricals
    date_cols = []
    for col in categorical_cols:
        try:
            parsed = pd.to_datetime(df[col], errors="coerce")
            if parsed.notna().sum() / max(len(df), 1) > 0.5:
                date_cols.append(col)
        except Exception:
            pass

    summary = _df_summary(df)
    llm = get_llm()

    schema_prompt = f"""You are an expert Power BI dashboard architect.

Analyse this dataset and design a professional, insightful dashboard layout.

DATASET SUMMARY:
{summary}

TASK: Design a complete PowerBI-style dashboard with 1-2 pages.

Return a JSON object with this exact structure:
{{
  "title": "Dashboard title",
  "domain": "sales|finance|hr|education|healthcare|ecommerce|operations|general",
  "theme": "dark",
  "pages": [
    {{
      "id": "page1",
      "title": "Overview",
      "widgets": [
        {{
          "id": "w1",
          "type": "kpi_row",
          "title": "Key Metrics",
          "columns": ["col1", "col2"],
          "agg": "sum",
          "insight": "One-sentence insight about these KPIs",
          "w": 12, "h": 1
        }},
        {{
          "id": "w2",
          "type": "bar",
          "title": "Revenue by Category",
          "x_col": "category_col",
          "y_col": "numeric_col",
          "agg": "sum",
          "insight": "Insight about this chart",
          "w": 6, "h": 2
        }},
        {{
          "id": "w3",
          "type": "line",
          "title": "Trend Over Time",
          "x_col": "date_col",
          "y_col": "numeric_col",
          "agg": "sum",
          "insight": "Insight about the trend",
          "w": 6, "h": 2
        }},
        {{
          "id": "w4",
          "type": "pie",
          "title": "Distribution by Segment",
          "x_col": "category_col",
          "y_col": "numeric_col",
          "insight": "Insight about distribution",
          "w": 4, "h": 2
        }},
        {{
          "id": "w5",
          "type": "scatter",
          "title": "Correlation Analysis",
          "x_col": "numeric_col1",
          "y_col": "numeric_col2",
          "color_col": "category_col",
          "insight": "Insight about correlation",
          "w": 8, "h": 2
        }}
      ]
    }}
  ],
  "filters": [
    {{
      "id": "f1",
      "column": "category_col",
      "type": "multi_select",
      "label": "Filter by Category"
    }},
    {{
      "id": "f2",
      "column": "date_col",
      "type": "date_range",
      "label": "Date Range"
    }}
  ],
  "ai_summary": "2-3 sentence executive summary of the dataset and key findings",
  "key_insights": [
    "Insight 1 with specific numbers",
    "Insight 2 with specific numbers",
    "Insight 3 with specific numbers",
    "Insight 4 with specific numbers",
    "Insight 5 with specific numbers"
  ]
}}

WIDGET TYPES AVAILABLE: kpi_row, bar, line, pie, scatter, histogram, table, heatmap, area
AGG TYPES: sum, avg, count, max, min

RULES:
- Only use actual column names from the dataset: {all_cols}
- Numeric columns: {numeric_cols}
- Categorical columns: {categorical_cols}
- Date/time columns detected: {date_cols}
- Page 1: Overview (KPIs + 4-5 key charts)
- Page 2 (optional): Deep-dive analysis (if dataset is complex enough)
- Include date filter if date columns exist
- Include at least 2 category filters if categorical columns exist
- w=12 means full width, w=6 means half, w=4 means third, w=3 means quarter
- Make widget insights specific and data-driven
- Return ONLY the JSON object, no markdown, no explanation
"""

    try:
        resp = llm.invoke(schema_prompt)
        raw = resp.content.strip() if hasattr(resp, "content") else str(resp).strip()
        schema = _extract_json(raw)
    except Exception as e:
        print(f"[schema_agent] LLM call failed: {e}")
        schema = {}

    if not schema or not schema.get("pages"):
        # Fallback: build a sensible default schema
        schema = _build_fallback_schema(df, numeric_cols, categorical_cols, date_cols)

    # ── Pre-compute data for every widget ──────────────────────────────────────
    kpi_data = _build_kpi_data(df, numeric_cols)
    # Build filter options
    filter_options = {}
    for col in categorical_cols[:6]:
        vals = df[col].dropna().unique().tolist()
        if len(vals) <= 50:
            filter_options[col] = [str(v) for v in sorted(vals, key=str)]

    os.makedirs("dashboard", exist_ok=True)

    for page in schema.get("pages", []):
        for widget in page.get("widgets", []):
            wtype = widget.get("type", "")
            x_col = widget.get("x_col", "")
            y_col = widget.get("y_col", "")
            agg = widget.get("agg", "sum")

            # Validate columns exist
            if x_col and x_col not in df.columns:
                x_col = categorical_cols[0] if categorical_cols else ""
                widget["x_col"] = x_col
            if y_col and y_col not in df.columns:
                y_col = numeric_cols[0] if numeric_cols else ""
                widget["y_col"] = y_col

            try:
                if wtype == "kpi_row":
                    widget["data"] = kpi_data

                elif wtype in ("bar", "area"):
                    if x_col and y_col:
                        widget["data"] = _build_bar_data(df, x_col, y_col, agg)
                    elif x_col and categorical_cols and numeric_cols:
                        widget["data"] = _build_bar_data(df, x_col, numeric_cols[0], agg)

                elif wtype == "line":
                    if x_col and y_col:
                        # try as time series first
                        line_data = _build_line_data(df, x_col, y_col, agg)
                        if not line_data:
                            line_data = _build_bar_data(df, x_col, y_col, agg)
                        widget["data"] = line_data
                    elif x_col and numeric_cols:
                        widget["data"] = _build_bar_data(df, x_col, numeric_cols[0], agg)

                elif wtype == "pie":
                    if x_col:
                        widget["data"] = _build_pie_data(df, x_col, y_col if y_col else None)

                elif wtype == "scatter":
                    if x_col and y_col:
                        color_col = widget.get("color_col")
                        widget["data"] = _build_scatter_data(df, x_col, y_col, color_col)

                elif wtype == "histogram":
                    col = y_col or x_col
                    if col and col in numeric_cols:
                        widget["data"] = _build_histogram_data(df, col)

                elif wtype == "table":
                    cols = widget.get("columns", all_cols[:8])
                    widget["data"] = _build_table_data(df, cols)

                elif wtype == "heatmap":
                    widget["data"] = _build_correlation_data(df, numeric_cols)

            except Exception as e:
                print(f"[schema_agent] widget data error for {wtype}: {e}")
                widget["data"] = []

    # ── Build filter options for the schema ────────────────────────────────────
    schema["filter_options"] = filter_options
    schema["kpi_data"] = kpi_data
    schema["numeric_cols"] = numeric_cols
    schema["categorical_cols"] = categorical_cols
    schema["date_cols"] = date_cols
    schema["all_cols"] = all_cols
    schema["row_count"] = len(df)
    schema["col_count"] = len(df.columns)

    # Save schema to disk
    with open("dashboard/dashboard_schema.json", "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, default=str)

    print(f"[dashboard_schema_agent] Schema generated: {len(schema.get('pages', []))} page(s), "
          f"{sum(len(p.get('widgets', [])) for p in schema.get('pages', []))} widgets")

    return {**state, "dashboard_schema": schema}


def _build_fallback_schema(df, numeric_cols, categorical_cols, date_cols):
    """Minimal fallback if LLM fails."""
    widgets_p1 = [{"id": "w_kpi", "type": "kpi_row", "title": "Key Metrics",
                   "columns": numeric_cols[:4], "agg": "sum",
                   "insight": "Core dataset metrics", "w": 12, "h": 1}]

    if categorical_cols and numeric_cols:
        widgets_p1.append({"id": "w_bar", "type": "bar", "title": f"{numeric_cols[0]} by {categorical_cols[0]}",
                           "x_col": categorical_cols[0], "y_col": numeric_cols[0], "agg": "sum",
                           "insight": "Top categories by value", "w": 6, "h": 2})
        widgets_p1.append({"id": "w_pie", "type": "pie", "title": f"Distribution of {categorical_cols[0]}",
                           "x_col": categorical_cols[0], "y_col": numeric_cols[0],
                           "insight": "Share by category", "w": 6, "h": 2})

    if date_cols and numeric_cols:
        widgets_p1.append({"id": "w_line", "type": "line", "title": f"{numeric_cols[0]} Over Time",
                           "x_col": date_cols[0], "y_col": numeric_cols[0], "agg": "sum",
                           "insight": "Time series trend", "w": 12, "h": 2})

    if len(numeric_cols) >= 2:
        widgets_p1.append({"id": "w_scatter", "type": "scatter", "title": "Correlation Analysis",
                           "x_col": numeric_cols[0], "y_col": numeric_cols[1],
                           "color_col": categorical_cols[0] if categorical_cols else None,
                           "insight": "Relationship between key metrics", "w": 12, "h": 2})

    filters = []
    for col in categorical_cols[:2]:
        filters.append({"id": f"f_{col}", "column": col, "type": "multi_select", "label": f"Filter by {col.replace('_', ' ').title()}"})
    if date_cols:
        filters.append({"id": "f_date", "column": date_cols[0], "type": "date_range", "label": "Date Range"})

    return {
        "title": "Data Analytics Dashboard",
        "domain": "general",
        "theme": "dark",
        "pages": [{"id": "page1", "title": "Overview", "widgets": widgets_p1}],
        "filters": filters,
        "ai_summary": f"Dataset with {len(df)} rows and {len(df.columns)} columns.",
        "key_insights": ["Dataset loaded successfully.", "Explore the charts below for insights."],
    }
