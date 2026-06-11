"""
dashboard_schema_agent.py
=========================
AI-driven PowerBI-style dashboard schema generator.
Guarantees a minimum of 10 chart widgets across 1-2 pages.
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
    clean = re.sub(r"```(?:json)?", "", text, flags=re.I).replace("```", "").strip()
    try:
        return json.loads(clean)
    except Exception:
        pass
    m = re.search(r"\{.*\}", clean, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return {}


def _df_summary(df: pd.DataFrame) -> str:
    numeric_cols     = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    lines = [
        f"Rows: {len(df)}, Columns: {len(df.columns)}",
        f"Numeric  ({len(numeric_cols)}): {numeric_cols}",
        f"Categorical ({len(categorical_cols)}): {categorical_cols}",
        "",
        "Numeric stats:",
    ]
    for col in numeric_cols[:8]:
        s = df[col].dropna()
        if len(s):
            lines.append(
                f"  {col}: min={_safe_val(s.min())}, max={_safe_val(s.max())}, "
                f"mean={round(float(s.mean()), 2)}, nulls={int(df[col].isna().sum())}"
            )
    lines.append("\nCategorical samples:")
    for col in categorical_cols[:6]:
        top = df[col].value_counts().head(5).index.tolist()
        lines.append(f"  {col}: {top}")
    lines.append("\nFirst 5 rows:")
    lines.append(df.head(5).to_string(index=False))
    return "\n".join(lines)


# ─── chart data builders ──────────────────────────────────────────────────────

def _build_kpi_data(df: pd.DataFrame, numeric_cols: list) -> list:
    kpis = []
    for col in numeric_cols[:8]:
        s = df[col].replace([np.inf, -np.inf], np.nan).dropna()
        if len(s) == 0:
            continue
        kpis.append({
            "column": col,
            "label":  col.replace("_", " ").title(),
            "sum":    _safe_val(s.sum()),
            "avg":    round(float(s.mean()), 2),
            "max":    _safe_val(s.max()),
            "min":    _safe_val(s.min()),
            "count":  int(len(s)),
        })
    kpis.append({"column": "_rows", "label": "Total Records",
                 "sum": len(df), "avg": len(df), "max": len(df), "min": len(df), "count": len(df)})
    return kpis


def _build_bar_data(df, cat_col, num_col, agg="sum", top_n=15):
    try:
        fn = {"sum": "sum", "avg": "mean", "count": "count", "max": "max", "min": "min"}.get(agg, "sum")
        grouped = getattr(df.groupby(cat_col)[num_col], fn)()
        if agg == "avg":
            grouped = grouped.round(2)
        grouped = grouped.sort_values(ascending=False).head(top_n)
        return [{"name": str(k), "value": _safe_val(v)} for k, v in grouped.items() if _safe_val(v) is not None]
    except Exception:
        return []


def _build_line_data(df, time_col, num_col, agg="sum"):
    try:
        ts  = pd.to_datetime(df[time_col], errors="coerce")
        tmp = df.copy()
        tmp["_ts"] = ts
        tmp = tmp.dropna(subset=["_ts"])
        if len(tmp) == 0:
            return []
        span = (tmp["_ts"].max() - tmp["_ts"].min()).days
        if span > 365 * 2:
            tmp["_p"] = tmp["_ts"].dt.to_period("M").astype(str)
        elif span > 90:
            tmp["_p"] = tmp["_ts"].dt.to_period("W").astype(str)
        else:
            tmp["_p"] = tmp["_ts"].dt.to_period("D").astype(str)
        fn = {"sum": "sum", "avg": "mean", "count": "count"}.get(agg, "sum")
        grp = getattr(tmp.groupby("_p")[num_col], fn)().sort_index()
        return [{"name": str(k), "value": _safe_val(v)} for k, v in grp.items() if _safe_val(v) is not None]
    except Exception:
        return []


def _build_pie_data(df, cat_col, num_col=None, top_n=8):
    try:
        if num_col and num_col in df.columns:
            g = df.groupby(cat_col)[num_col].sum().sort_values(ascending=False).head(top_n)
            return [{"name": str(k), "value": _safe_val(v)} for k, v in g.items() if _safe_val(v) is not None]
        else:
            c = df[cat_col].value_counts().head(top_n)
            return [{"name": str(k), "value": int(v)} for k, v in c.items()]
    except Exception:
        return []


def _build_scatter_data(df, x_col, y_col, color_col=None):
    try:
        cols = [x_col, y_col]
        if color_col and color_col in df.columns:
            cols.append(color_col)
        tmp = df[cols].dropna().head(600)
        out = []
        for _, row in tmp.iterrows():
            item = {"x": _safe_val(row[x_col]), "y": _safe_val(row[y_col])}
            if color_col and color_col in row:
                item["category"] = str(row[color_col])
            out.append(item)
        return out
    except Exception:
        return []


def _build_histogram_data(df, col, bins=20):
    try:
        vals = df[col].replace([np.inf, -np.inf], np.nan).dropna()
        counts, edges = np.histogram(vals, bins=bins)
        return [{"name": f"{round(float(edges[i]),1)}-{round(float(edges[i+1]),1)}", "value": int(counts[i])}
                for i in range(len(counts))]
    except Exception:
        return []


def _build_table_data(df, columns, top_n=100):
    try:
        cols   = [c for c in columns if c in df.columns] or df.columns.tolist()[:8]
        sample = df[cols].head(top_n)
        rows   = [{str(k): (_safe_val(v) if not isinstance(v, str) else v) for k, v in row.items()}
                  for _, row in sample.iterrows()]
        return {"columns": cols, "rows": rows, "total": len(df)}
    except Exception:
        return {"columns": [], "rows": [], "total": 0}


def _build_correlation_data(df, numeric_cols):
    try:
        cols  = numeric_cols[:10]
        clean = df[cols].replace([np.inf, -np.inf], np.nan)
        clean = clean.dropna(axis=1, how="all")
        clean = clean.loc[:, clean.nunique() > 1]
        if clean.shape[1] < 2:
            return {}
        corr   = clean.corr().round(3)
        matrix = [{"row": str(r), "col": str(c), "value": _safe_val(corr.loc[r, c])}
                  for r in corr.index for c in corr.columns]
        return {"columns": corr.columns.tolist(), "matrix": matrix}
    except Exception:
        return {}


# ─── post-process: guarantee ≥ MIN_WIDGETS total non-kpi charts ───────────────

MIN_WIDGETS = 10   # minimum chart widgets (excluding kpi_row)

def _topup_widgets(schema, df, numeric_cols, categorical_cols, date_cols, all_cols):
    """
    After the LLM generates the schema, count non-kpi widgets.
    If fewer than MIN_WIDGETS, synthesise extra ones and append to page 1.
    """
    def _wcount(s):
        return sum(
            1 for p in s.get("pages", [])
            for w in p.get("widgets", [])
            if w.get("type") != "kpi_row"
        )

    if _wcount(schema) >= MIN_WIDGETS:
        return schema  # already enough

    p1_widgets = schema["pages"][0]["widgets"]
    existing_ids = {w["id"] for p in schema["pages"] for w in p["widgets"]}

    def _uid(prefix):
        i = 0
        while True:
            cand = f"{prefix}_{i}"
            if cand not in existing_ids:
                existing_ids.add(cand)
                return cand
            i += 1

    extras = []

    # ── bar charts for every cat×num pair not yet charted ─────────────────
    charted_pairs = set()
    for p in schema["pages"]:
        for w in p["widgets"]:
            if w.get("x_col") and w.get("y_col"):
                charted_pairs.add((w["x_col"], w["y_col"]))

    for cat in categorical_cols[:4]:
        for num in numeric_cols[:4]:
            if (cat, num) not in charted_pairs and _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
                for agg, label in [("sum","Total"), ("avg","Average"), ("count","Count")]:
                    if (cat, num, agg) not in charted_pairs:
                        charted_pairs.add((cat, num, agg))
                        extras.append({
                            "id": _uid("xbar"),
                            "type": "bar",
                            "title": f"{label} {num.replace('_',' ').title()} by {cat.replace('_',' ').title()}",
                            "x_col": cat, "y_col": num, "agg": agg,
                            "insight": f"{label} {num} across {cat} categories.",
                            "w": 6, "h": 2,
                        })
                        break

    # ── area chart for each date×num pair ─────────────────────────────────
    for dc in date_cols[:2]:
        for num in numeric_cols[:2]:
            if _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
                extras.append({
                    "id": _uid("xarea"),
                    "type": "area",
                    "title": f"{num.replace('_',' ').title()} Trend (Area)",
                    "x_col": dc, "y_col": num, "agg": "sum",
                    "insight": f"Area view of {num} over {dc}.",
                    "w": 6, "h": 2,
                })

    # ── histogram for each numeric ─────────────────────────────────────────
    for num in numeric_cols[:4]:
        if _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
            extras.append({
                "id": _uid("xhist"),
                "type": "histogram",
                "title": f"{num.replace('_',' ').title()} Distribution",
                "x_col": num, "y_col": num, "agg": "count",
                "insight": f"Frequency distribution of {num}.",
                "w": 4, "h": 2,
            })

    # ── extra pie for secondary cat ────────────────────────────────────────
    for cat in categorical_cols[1:4]:
        for num in numeric_cols[:2]:
            if _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
                extras.append({
                    "id": _uid("xpie"),
                    "type": "pie",
                    "title": f"{num.replace('_',' ').title()} by {cat.replace('_',' ').title()}",
                    "x_col": cat, "y_col": num,
                    "insight": f"Share of {num} across {cat}.",
                    "w": 4, "h": 2,
                })
                break

    # ── scatter for additional num pairs ──────────────────────────────────
    for i in range(len(numeric_cols)):
        for j in range(i+1, len(numeric_cols)):
            pair = (numeric_cols[i], numeric_cols[j])
            if pair not in charted_pairs and _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
                charted_pairs.add(pair)
                extras.append({
                    "id": _uid("xscat"),
                    "type": "scatter",
                    "title": f"{numeric_cols[i].replace('_',' ').title()} vs {numeric_cols[j].replace('_',' ').title()}",
                    "x_col": numeric_cols[i], "y_col": numeric_cols[j],
                    "color_col": categorical_cols[0] if categorical_cols else None,
                    "insight": f"Relationship between {numeric_cols[i]} and {numeric_cols[j]}.",
                    "w": 6, "h": 2,
                })

    # ── table ──────────────────────────────────────────────────────────────
    has_table = any(w.get("type") == "table" for p in schema["pages"] for w in p["widgets"])
    if not has_table and _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
        extras.append({
            "id": _uid("xtable"),
            "type": "table",
            "title": "Data Table",
            "columns": all_cols[:8],
            "insight": "Full dataset sample for manual inspection.",
            "w": 12, "h": 2,
        })

    # ── heatmap ───────────────────────────────────────────────────────────
    has_heat = any(w.get("type") == "heatmap" for p in schema["pages"] for w in p["widgets"])
    if not has_heat and len(numeric_cols) >= 3 and _wcount(schema) + len(extras) < MIN_WIDGETS + 3:
        extras.append({
            "id": _uid("xheat"),
            "type": "heatmap",
            "title": "Correlation Heatmap",
            "insight": "Colour-coded correlation between all numeric columns.",
            "w": 12, "h": 2,
        })

    # Distribute extras: overflow onto page 2 if page 1 has ≥8 non-kpi already
    p1_non_kpi = sum(1 for w in p1_widgets if w.get("type") != "kpi_row")
    if p1_non_kpi >= 8 and len(schema["pages"]) > 1:
        schema["pages"][1]["widgets"].extend(extras)
    elif p1_non_kpi >= 8:
        # create page 2
        schema["pages"].append({
            "id": "page2", "title": "Deep Dive",
            "widgets": extras,
        })
    else:
        p1_widgets.extend(extras)

    return schema


# ─── main agent ───────────────────────────────────────────────────────────────

def dashboard_schema_agent(state: dict) -> dict:
    df: pd.DataFrame = state["_df"]
    df.columns = [str(col).replace(".", "_") for col in df.columns]

    numeric_cols     = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    all_cols         = df.columns.tolist()

    # Detect date-like columns among categoricals
    date_cols = []
    for col in categorical_cols:
        try:
            parsed = pd.to_datetime(df[col], errors="coerce")
            if parsed.notna().sum() / max(len(df), 1) > 0.5:
                date_cols.append(col)
        except Exception:
            pass

    summary = _df_summary(df)
    llm     = get_llm()

    schema_prompt = f"""You are a senior Power BI architect. Design a rich, insightful dashboard.

DATASET SUMMARY:
{summary}

Available columns:
  Numeric:     {numeric_cols}
  Categorical: {categorical_cols}
  Date/time:   {date_cols}
  All:         {all_cols}

CRITICAL REQUIREMENTS:
- Page 1 "Overview"  must have AT LEAST 8 chart widgets (excluding kpi_row)
- Page 2 "Deep Dive" must have AT LEAST 5 chart widgets
- Total widgets (excluding kpi_row): MINIMUM 13
- Use EVERY chart type at least once: bar, line, area, pie, scatter, histogram, heatmap, table
- All column names MUST exactly match the available columns listed above
- Each widget must have a specific, data-driven "insight" sentence

Width rules: w=12 full, w=6 half, w=4 third, w=3 quarter
Agg options: sum | avg | count | max | min
Chart types:  kpi_row | bar | line | area | pie | scatter | histogram | heatmap | table

Return ONLY a valid JSON object — no markdown, no explanation:
{{
  "title": "<dashboard title>",
  "domain": "<sales|finance|hr|education|healthcare|ecommerce|operations|general>",
  "theme": "dark",
  "pages": [
    {{
      "id": "page1",
      "title": "Overview",
      "widgets": [
        {{"id":"w1","type":"kpi_row","title":"Key Metrics","columns":{numeric_cols[:4]},"agg":"sum","insight":"...","w":12}},
        {{"id":"w2","type":"bar","title":"...","x_col":"<cat_col>","y_col":"<num_col>","agg":"sum","insight":"...","w":6}},
        {{"id":"w3","type":"line","title":"...","x_col":"<date_or_cat_col>","y_col":"<num_col>","agg":"sum","insight":"...","w":6}},
        {{"id":"w4","type":"area","title":"...","x_col":"<date_or_cat_col>","y_col":"<num_col>","agg":"sum","insight":"...","w":6}},
        {{"id":"w5","type":"pie","title":"...","x_col":"<cat_col>","y_col":"<num_col>","insight":"...","w":4}},
        {{"id":"w6","type":"pie","title":"...","x_col":"<cat_col2>","y_col":"<num_col>","insight":"...","w":4}},
        {{"id":"w7","type":"scatter","title":"...","x_col":"<num_col1>","y_col":"<num_col2>","color_col":"<cat_col>","insight":"...","w":4}},
        {{"id":"w8","type":"histogram","title":"...","x_col":"<num_col>","y_col":"<num_col>","insight":"...","w":6}},
        {{"id":"w9","type":"bar","title":"...","x_col":"<cat_col>","y_col":"<num_col>","agg":"avg","insight":"...","w":6}}
      ]
    }},
    {{
      "id": "page2",
      "title": "Deep Dive",
      "widgets": [
        {{"id":"w10","type":"heatmap","title":"Correlation Matrix","insight":"...","w":12}},
        {{"id":"w11","type":"bar","title":"...","x_col":"<cat_col>","y_col":"<num_col>","agg":"count","insight":"...","w":6}},
        {{"id":"w12","type":"area","title":"...","x_col":"<date_or_cat_col>","y_col":"<num_col>","agg":"avg","insight":"...","w":6}},
        {{"id":"w13","type":"table","title":"Data Sample","columns":{all_cols[:8]},"insight":"...","w":12}},
        {{"id":"w14","type":"scatter","title":"...","x_col":"<num_col>","y_col":"<num_col2>","insight":"...","w":6}},
        {{"id":"w15","type":"histogram","title":"...","x_col":"<num_col2>","y_col":"<num_col2>","insight":"...","w":6}}
      ]
    }}
  ],
  "filters": [
    {{"id":"f1","column":"<cat_col>","type":"multi_select","label":"Filter by <Label>"}},
    {{"id":"f2","column":"<cat_col2>","type":"multi_select","label":"Filter by <Label2>"}}
  ],
  "ai_summary": "<2-3 sentence executive summary with specific numbers>",
  "key_insights": [
    "<insight 1 with numbers>",
    "<insight 2 with numbers>",
    "<insight 3 with numbers>",
    "<insight 4 with numbers>",
    "<insight 5 with numbers>",
    "<insight 6 with numbers>"
  ]
}}"""

    schema = {}
    try:
        resp   = llm.invoke(schema_prompt)
        raw    = resp.content.strip() if hasattr(resp, "content") else str(resp).strip()
        schema = _extract_json(raw)
    except Exception as e:
        print(f"[schema_agent] LLM call failed: {e}")

    if not schema or not schema.get("pages"):
        schema = _build_fallback_schema(df, numeric_cols, categorical_cols, date_cols, all_cols)

    # Guarantee minimum widget count
    schema = _topup_widgets(schema, df, numeric_cols, categorical_cols, date_cols, all_cols)

    # ── Pre-compute chart data for every widget ───────────────────────────────
    kpi_data = _build_kpi_data(df, numeric_cols)
    filter_options = {}
    for col in categorical_cols[:6]:
        vals = df[col].dropna().unique().tolist()
        if len(vals) <= 50:
            filter_options[col] = [str(v) for v in sorted(vals, key=str)]

    os.makedirs("dashboard", exist_ok=True)

    for page in schema.get("pages", []):
        for widget in page.get("widgets", []):
            wtype  = widget.get("type", "")
            x_col  = widget.get("x_col", "")
            y_col  = widget.get("y_col", "")
            agg    = widget.get("agg", "sum")

            # Validate column references — fall back gracefully
            if x_col and x_col not in df.columns:
                x_col = categorical_cols[0] if categorical_cols else ""
                widget["x_col"] = x_col
            if y_col and y_col not in df.columns:
                y_col = numeric_cols[0] if numeric_cols else ""
                widget["y_col"] = y_col
            color_col = widget.get("color_col")
            if color_col and color_col not in df.columns:
                color_col = categorical_cols[0] if categorical_cols else None
                widget["color_col"] = color_col

            try:
                if wtype == "kpi_row":
                    widget["data"] = kpi_data

                elif wtype in ("bar", "area"):
                    if x_col and y_col:
                        widget["data"] = _build_bar_data(df, x_col, y_col, agg)
                    elif x_col and numeric_cols:
                        widget["data"] = _build_bar_data(df, x_col, numeric_cols[0], agg)

                elif wtype == "line":
                    d = _build_line_data(df, x_col, y_col, agg) if x_col and y_col else []
                    if not d and x_col and y_col:
                        d = _build_bar_data(df, x_col, y_col, agg)
                    widget["data"] = d

                elif wtype == "pie":
                    widget["data"] = _build_pie_data(df, x_col, y_col or None) if x_col else []

                elif wtype == "scatter":
                    widget["data"] = _build_scatter_data(df, x_col, y_col, color_col) if x_col and y_col else []

                elif wtype == "histogram":
                    col = y_col or x_col
                    widget["data"] = _build_histogram_data(df, col) if col and col in numeric_cols else []

                elif wtype == "table":
                    cols = widget.get("columns", all_cols[:8])
                    widget["data"] = _build_table_data(df, cols)

                elif wtype == "heatmap":
                    widget["data"] = _build_correlation_data(df, numeric_cols)

            except Exception as e:
                print(f"[schema_agent] widget data error ({wtype}): {e}")
                widget["data"] = []

    schema["filter_options"]    = filter_options
    schema["kpi_data"]          = kpi_data
    schema["numeric_cols"]      = numeric_cols
    schema["categorical_cols"]  = categorical_cols
    schema["date_cols"]         = date_cols
    schema["all_cols"]          = all_cols
    schema["row_count"]         = len(df)
    schema["col_count"]         = len(df.columns)

    total_widgets = sum(len(p.get("widgets", [])) for p in schema.get("pages", []))
    non_kpi       = sum(1 for p in schema.get("pages", []) for w in p.get("widgets", []) if w.get("type") != "kpi_row")
    print(f"[dashboard_schema_agent] {len(schema.get('pages',[]))} page(s) | "
          f"{total_widgets} total widgets | {non_kpi} chart widgets")

    with open("dashboard/dashboard_schema.json", "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, default=str)

    return {**state, "dashboard_schema": schema}


def _build_fallback_schema(df, numeric_cols, categorical_cols, date_cols, all_cols):
    """Rich fallback used when the LLM returns unparseable output."""
    wid = 0
    def nw(t, **kw):
        nonlocal wid
        wid += 1
        return {"id": f"fw{wid}", "type": t, **kw}

    p1, p2 = [], []

    # KPI row
    p1.append(nw("kpi_row", title="Key Metrics", columns=numeric_cols[:5],
                 agg="sum", insight="Core summary statistics.", w=12))

    cat0 = categorical_cols[0] if categorical_cols else None
    cat1 = categorical_cols[1] if len(categorical_cols) > 1 else cat0
    num0 = numeric_cols[0] if numeric_cols else None
    num1 = numeric_cols[1] if len(numeric_cols) > 1 else num0

    if cat0 and num0:
        p1.append(nw("bar",  title=f"{num0} by {cat0}", x_col=cat0, y_col=num0, agg="sum",   insight=f"Total {num0} per {cat0}.", w=6))
        p1.append(nw("bar",  title=f"Avg {num0} by {cat0}", x_col=cat0, y_col=num0, agg="avg", insight=f"Average {num0} per {cat0}.", w=6))
        p1.append(nw("pie",  title=f"{num0} share by {cat0}", x_col=cat0, y_col=num0, insight=f"Distribution of {num0} across {cat0}.", w=4))
    if cat1 and num0 and cat1 != cat0:
        p1.append(nw("pie",  title=f"{num0} by {cat1}", x_col=cat1, y_col=num0, insight=f"{num0} split by {cat1}.", w=4))
    if date_cols and num0:
        dc = date_cols[0]
        p1.append(nw("line",  title=f"{num0} Over Time", x_col=dc, y_col=num0, agg="sum", insight=f"Trend of {num0} over time.", w=6))
        p1.append(nw("area",  title=f"{num0} Area Trend", x_col=dc, y_col=num0, agg="sum", insight=f"Area chart of {num0} trend.", w=6))
    elif cat0 and num0:
        p1.append(nw("line",  title=f"{num0} by {cat0} (count)", x_col=cat0, y_col=num0, agg="count", insight="Count trend.", w=6))
        p1.append(nw("area",  title=f"{num0} Area", x_col=cat0, y_col=num0, agg="sum", insight="Area view.", w=6))
    if num0:
        p1.append(nw("histogram", title=f"{num0} Distribution", x_col=num0, y_col=num0, insight=f"Frequency distribution of {num0}.", w=4))
    if num0 and num1 and num0 != num1:
        p1.append(nw("scatter", title=f"{num0} vs {num1}", x_col=num0, y_col=num1,
                     color_col=cat0, insight=f"Scatter of {num0} vs {num1}.", w=8))

    # Page 2
    if len(numeric_cols) >= 2:
        p2.append(nw("heatmap", title="Correlation Heatmap", insight="Pairwise numeric correlations.", w=12))
    if cat0 and num0:
        p2.append(nw("bar", title=f"Count by {cat0}", x_col=cat0, y_col=num0, agg="count", insight=f"Count per {cat0}.", w=6))
    if num1:
        p2.append(nw("histogram", title=f"{num1} Distribution", x_col=num1, y_col=num1, insight=f"Distribution of {num1}.", w=6))
    if cat1 and num1 and cat1 != cat0:
        p2.append(nw("bar", title=f"{num1} by {cat1}", x_col=cat1, y_col=num1, agg="avg", insight=f"Avg {num1} by {cat1}.", w=6))
    if num0 and len(numeric_cols) > 2:
        p2.append(nw("scatter", title=f"{num0} vs {numeric_cols[2]}", x_col=num0, y_col=numeric_cols[2],
                     color_col=cat0, insight="Additional correlation view.", w=6))
    p2.append(nw("table", title="Data Sample", columns=all_cols[:10], insight="Tabular view of raw data.", w=12))

    filters = []
    for col in categorical_cols[:3]:
        filters.append({"id": f"f_{col}", "column": col, "type": "multi_select",
                         "label": f"Filter by {col.replace('_',' ').title()}"})
    if date_cols:
        filters.append({"id": "f_date", "column": date_cols[0], "type": "date_range", "label": "Date Range"})

    pages = [{"id": "page1", "title": "Overview", "widgets": p1}]
    if p2:
        pages.append({"id": "page2", "title": "Deep Dive", "widgets": p2})

    return {
        "title":        "Data Analytics Dashboard",
        "domain":       "general",
        "theme":        "dark",
        "pages":        pages,
        "filters":      filters,
        "ai_summary":   f"Dataset with {len(df):,} rows and {len(df.columns)} columns. Explore charts below.",
        "key_insights": [
            f"Dataset has {len(df):,} records across {len(df.columns)} dimensions.",
            f"Numeric columns: {', '.join(numeric_cols[:4])}.",
            f"Key categories: {', '.join(categorical_cols[:4])}.",
            "Use filters to drill into specific segments.",
            "See Deep Dive page for correlation analysis.",
        ],
    }