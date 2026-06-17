"""
dashboard_schema_agent.py  —  Senior Data Analyst + Power BI Expert (v3)
=========================================================================
Key improvements over v2:
  • Semantic column scoring — metrics ranked by business importance, never by
    column position. ID columns, age, counts never appear as primary metrics.
  • Explicit axis roles: metric_cols (what to measure), dimension_cols (how to
    slice), time_cols (when). Every chart uses the right axis role.
  • _topup and _fallback use ranked metrics, not nc[0] shortcuts.
  • Duplicate chart deduplication — same (cat, metric, agg) pair never plotted twice.
  • LLM prompt gives ranked column lists + explicit examples from the actual data.
"""
import json, re, os, math, warnings
import numpy as np
import pandas as pd
from config import get_llm

warnings.filterwarnings("ignore")

MIN_CHART_WIDGETS = 25


# ════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════

def _safe(v):
    if v is None: return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating,)): return float(v)
    if isinstance(v, (np.bool_,)): return bool(v)
    return v

def _extract_json(text: str) -> dict:
    clean = re.sub(r"```(?:json)?", "", text, flags=re.I).replace("```", "").strip()
    try: return json.loads(clean)
    except Exception: pass
    depth, start = 0, -1
    for i, ch in enumerate(clean):
        if ch == '{':
            if depth == 0: start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start != -1:
                try: return json.loads(clean[start:i+1])
                except Exception: pass
    return {}


# ════════════════════════════════════════════════════════════════════
#  SEMANTIC COLUMN SCORING
# ════════════════════════════════════════════════════════════════════

# Keywords that indicate a column is a primary business METRIC (high score)
_METRIC_KWS = [
    "revenue","sales","amount","total","income","profit","margin","price",
    "cost","spend","expense","discount","value","earning","gross","net",
    "quantity","qty","units","volume","orders","transactions","count",
    "rate","score","rating","satisfaction","conversion","roi","return",
    "growth","performance","kpi","target","actual","budget","forecast",
    "salary","wage","fee","tax","payment","balance","receipt",
]

# Keywords that indicate a column is a DIMENSION (category for slicing)
_DIMENSION_KWS = [
    "category","type","segment","group","region","country","city","state",
    "department","team","product","brand","channel","source","method",
    "status","stage","gender","industry","sector","platform","device",
    "payment","mode","class","tier","level","grade","priority","flag",
]

# Keywords that indicate a column is an ID / non-metric (penalise heavily)
_ID_KWS = [
    "id","_id","code","key","number","num","no","ref","uuid","sku",
    "identifier","serial","index","order_id","customer_id","user_id",
    "transaction_id","invoice_id","employee_id","record_id",
]

# Demographic/attribute keywords — useful for distribution charts but
# should NOT be the primary metric on bar/line/area charts
_DEMO_KWS = [
    "age","birth","year_of_birth","dob","tenure","experience","seniority",
    "height","weight","size",
]

def _score_numeric_col(col: str, series: pd.Series) -> float:
    """
    Return a business-importance score for a numeric column.
    Higher = better metric to use on Y-axis.
    """
    c = col.lower()
    score = 0.0

    # Strong metric keywords → big boost
    for kw in _METRIC_KWS:
        if kw in c:
            score += 10
            break

    # ID/counter → heavy penalty
    for kw in _ID_KWS:
        if c == kw or c.endswith(f"_{kw}") or c.startswith(f"{kw}_"):
            score -= 50
            break

    # Demographic → moderate penalty (still useful for histograms/scatter)
    for kw in _DEMO_KWS:
        if kw in c:
            score -= 5
            break

    # Value range heuristic: very small range (e.g. 1–5 rating) → less
    # useful as a SUM metric, but fine as AVG
    rng = float(series.max() - series.min()) if len(series) else 0
    if rng <= 10:
        score -= 2
    elif rng >= 1000:
        score += 3

    # High sum → more "impactful" as a metric
    total = float(series.sum()) if len(series) else 0
    if total > 1_000_000:
        score += 4
    elif total > 10_000:
        score += 2

    # Binary (0/1) → minor penalty as a bar metric
    if series.nunique() <= 2:
        score -= 3

    return score


def _score_cat_col(col: str, series: pd.Series) -> float:
    """Score a categorical column for usefulness as a chart dimension (X-axis)."""
    c    = col.lower()
    uniq = series.nunique()
    score = 0.0

    # Good dimension keywords
    for kw in _DIMENSION_KWS:
        if kw in c:
            score += 8
            break

    # ID columns → useless as dimensions
    for kw in _ID_KWS:
        if kw in c:
            score -= 40
            break

    # Optimal cardinality: 3–20 unique values → perfect for bar/pie
    if 3 <= uniq <= 12:
        score += 10
    elif 13 <= uniq <= 25:
        score += 5
    elif uniq <= 2:
        score += 2   # binary is OK
    elif uniq > 50:
        score -= 10  # too many values → messy chart

    return score


# ════════════════════════════════════════════════════════════════════
#  DEEP PROFILING + FEATURE ENGINEERING
# ════════════════════════════════════════════════════════════════════

def _profile_and_engineer(df: pd.DataFrame):
    df = df.copy()
    df.columns = [str(c).strip().replace(" ","_").replace(".","_").replace("/","_") for c in df.columns]

    # ── 1. Detect & parse date columns ─────────────────────────────
    date_cols = []
    for col in list(df.select_dtypes(exclude=np.number).columns):
        if any(kw in col.lower() for kw in _ID_KWS):
            continue   # skip ID-like columns
        sample = df[col].dropna().head(300)
        parsed = pd.to_datetime(sample, errors="coerce")
        if parsed.notna().sum() / max(len(sample), 1) > 0.6:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            date_cols.append(col)

    # ── 2. Engineer date-derived columns ───────────────────────────
    engineered = []
    for dc in date_cols:
        base = dc.replace("_date","").replace("_time","").replace("Date","").replace("Time","")
        for suffix, expr in [
            ("_Year",    lambda c: df[c].dt.year),
            ("_Month",   lambda c: df[c].dt.month_name()),
            ("_Quarter", lambda c: "Q" + df[c].dt.quarter.astype(str)),
        ]:
            new_col = base + suffix
            if new_col not in df.columns:
                try:
                    df[new_col] = expr(dc)
                    engineered.append(new_col)
                except Exception:
                    pass
        # Day-of-week only for short-span data
        try:
            span = (df[dc].max() - df[dc].min()).days
            if span and span <= 90:
                dow = base + "_DayOfWeek"
                if dow not in df.columns:
                    df[dow] = df[dc].dt.day_name()
                    engineered.append(dow)
        except Exception:
            pass

    # ── 3. Engineer ratio/margin columns ───────────────────────────
    num_raw = df.select_dtypes(include=np.number).columns.tolist()
    revenue_kws = ["revenue","sales","total_amount","total","amount","income","price"]
    cost_kws    = ["discount","cost","expense","cogs","spend"]
    rev_cols  = [c for c in num_raw if any(k in c.lower() for k in revenue_kws)]
    cost_cols = [c for c in num_raw if any(k in c.lower() for k in cost_kws)]
    for rc in rev_cols[:2]:
        for cc in cost_cols[:2]:
            if rc == cc: continue
            mn = f"Margin_{rc}_vs_{cc}"
            if mn not in df.columns:
                try:
                    ratio = (df[rc] - df[cc]) / df[rc].replace(0, np.nan)
                    if ratio.notna().sum() > len(df) * 0.3:
                        df[mn] = ratio.round(4)
                        engineered.append(mn)
                except Exception:
                    pass
            break

    # ── 4. Classify and SCORE columns ──────────────────────────────
    all_numeric   = df.select_dtypes(include=np.number).columns.tolist()
    all_object    = df.select_dtypes(exclude=np.number).columns.tolist()
    date_cols_fin = [c for c in all_object if pd.api.types.is_datetime64_any_dtype(df[c])]
    cat_cols      = [c for c in all_object if c not in date_cols_fin]

    # Score and rank numeric columns
    num_scores = {}
    for col in all_numeric:
        s = df[col].replace([np.inf,-np.inf], np.nan).dropna()
        num_scores[col] = _score_numeric_col(col, s)

    # Score and rank categorical columns
    cat_scores = {}
    for col in cat_cols:
        cat_scores[col] = _score_cat_col(col, df[col])

    # Ranked lists (best first)
    ranked_numeric = sorted(all_numeric, key=lambda c: num_scores.get(c, 0), reverse=True)
    ranked_cat     = sorted(cat_cols,    key=lambda c: cat_scores.get(c, 0), reverse=True)

    # Primary metric cols = top-scored numerics (not IDs/demos)
    metric_cols = [c for c in ranked_numeric if num_scores.get(c, 0) > -5][:10]
    # Dimension cols = good categoricals
    dimension_cols = [c for c in ranked_cat if cat_scores.get(c, 0) > 0][:10]
    # All categoricals with decent cardinality
    good_cat = [c for c in ranked_cat if 2 <= df[c].nunique() <= 30]

    # Demographic/distribution-only numeric cols (useful for histogram/scatter)
    demo_cols = [c for c in all_numeric
                 if num_scores.get(c, 0) <= -3 and num_scores.get(c, 0) > -50]

    # Per-column stats
    col_stats = {}
    for col in all_numeric:
        s = df[col].replace([np.inf,-np.inf], np.nan).dropna()
        if not len(s): continue
        col_stats[col] = {
            "type":"numeric", "score": round(num_scores.get(col,0), 1),
            "min":_safe(s.min()), "max":_safe(s.max()),
            "mean":round(float(s.mean()),3), "median":round(float(s.median()),3),
            "std":round(float(s.std()),3), "nulls":int(df[col].isna().sum()),
            "unique":int(s.nunique()), "sum":_safe(s.sum()),
        }
    for col in cat_cols + date_cols_fin:
        col_stats[col] = {
            "type":"categorical" if col in cat_cols else "date",
            "score": round(cat_scores.get(col, 0), 1),
            "unique":int(df[col].nunique()), "nulls":int(df[col].isna().sum()),
            "top5":df[col].value_counts().head(5).index.astype(str).tolist(),
        }

    # Strong correlations
    correlations = []
    if len(metric_cols) >= 2:
        try:
            corr = df[metric_cols].replace([np.inf,-np.inf], np.nan).corr()
            for i, c1 in enumerate(metric_cols):
                for c2 in metric_cols[i+1:]:
                    v = corr.loc[c1, c2]
                    if pd.notna(v) and abs(v) > 0.3:
                        correlations.append({"col1":c1,"col2":c2,"r":round(float(v),3)})
            correlations.sort(key=lambda x: abs(x["r"]), reverse=True)
        except Exception:
            pass

    profile = {
        "rows": len(df), "cols": len(df.columns),
        "numeric_cols":   all_numeric,       # all numeric (for heatmap etc.)
        "metric_cols":    metric_cols,        # ranked: best Y-axis metrics first
        "dimension_cols": dimension_cols,     # ranked: best X-axis dimensions first
        "demo_cols":      demo_cols,          # age/score cols — histogram only
        "categorical_cols": cat_cols,
        "good_cat_cols":  good_cat,
        "date_cols":      date_cols_fin,
        "engineered_cols": engineered,
        "col_stats":      col_stats,
        "correlations":   correlations[:10],
        "all_cols":       df.columns.tolist(),
        "num_scores":     num_scores,
        "cat_scores":     cat_scores,
    }
    return df, profile


def _profile_to_brief(p: dict) -> str:
    """Structured analyst brief for the LLM — sorted by business importance."""
    m = p["metric_cols"]
    d = p["dimension_cols"]
    dc = p["date_cols"]
    eng = p["engineered_cols"]

    lines = [
        f"DATASET: {p['rows']:,} rows × {p['cols']} columns",
        "",
        "── PRIMARY METRICS (use as Y-axis / values to measure) ──",
        "   Ranked by business importance (highest first):",
    ]
    for col in m[:10]:
        s = p["col_stats"].get(col, {})
        lines.append(
            f"   • {col}  [score={s.get('score')}]"
            f"  sum={s.get('sum')}  mean={s.get('mean')}  "
            f"min={s.get('min')}  max={s.get('max')}"
        )

    lines += ["", "── DIMENSIONS (use as X-axis / slicing categories) ──",
              "   Ranked by chart usefulness (highest first):"]
    for col in d[:10]:
        s = p["col_stats"].get(col, {})
        lines.append(
            f"   • {col}  [score={s.get('score')}]"
            f"  unique={s.get('unique')}  top5={s.get('top5')}"
        )

    if p["demo_cols"]:
        lines += ["", "── DEMOGRAPHIC / DISTRIBUTION COLS (histogram or scatter only) ──"]
        for col in p["demo_cols"][:5]:
            s = p["col_stats"].get(col, {})
            lines.append(f"   • {col}  min={s.get('min')}  max={s.get('max')}  mean={s.get('mean')}")

    if dc:
        lines += ["", f"── DATE COLUMNS: {dc}"]
    if eng:
        lines += [f"── ENGINEERED (derived from dates, use freely): {eng}"]

    if p["correlations"]:
        lines += ["", "── STRONG METRIC CORRELATIONS ──"]
        for c in p["correlations"][:6]:
            lines.append(f"   {c['col1']} ↔ {c['col2']}  r={c['r']}")

    lines += ["", "── ALL AVAILABLE COLUMNS ──", f"   {p['all_cols']}"]
    return "\n".join(lines)


# ════════════════════════════════════════════════════════════════════
#  CHART DATA BUILDERS
# ════════════════════════════════════════════════════════════════════

def _build_kpi_data(df, metric_cols):
    """KPIs use only proper metric columns, not IDs or demographics."""
    out = []
    for col in metric_cols[:8]:
        if col not in df.columns: continue
        s = df[col].replace([np.inf,-np.inf], np.nan).dropna()
        if not len(s): continue
        out.append({
            "column": col, "label": col.replace("_"," ").title(),
            "sum": _safe(s.sum()), "avg": round(float(s.mean()),2),
            "max": _safe(s.max()), "min": _safe(s.min()), "count": int(len(s)),
        })
    out.append({"column":"_rows","label":"Total Records",
                "sum":len(df),"avg":len(df),"max":len(df),"min":len(df),"count":len(df)})
    return out

def _build_bar_data(df, cat_col, num_col, agg="sum", top_n=15):
    try:
        fn = {"sum":"sum","avg":"mean","count":"count","max":"max","min":"min"}.get(agg,"sum")
        g  = getattr(df.groupby(cat_col)[num_col], fn)()
        if agg == "avg": g = g.round(2)
        return [{"name":str(k),"value":_safe(v)}
                for k,v in g.sort_values(ascending=False).head(top_n).items()
                if _safe(v) is not None]
    except Exception: return []

def _build_line_data(df, time_col, num_col, agg="sum"):
    try:
        col_data = df[time_col]
        ts = col_data if pd.api.types.is_datetime64_any_dtype(col_data) \
             else pd.to_datetime(col_data, errors="coerce")
        tmp = df.copy(); tmp["_ts"] = ts
        tmp = tmp.dropna(subset=["_ts"])
        if not len(tmp): return []
        span = (tmp["_ts"].max() - tmp["_ts"].min()).days
        period = "M" if span > 90 else "W" if span > 21 else "D"
        tmp["_p"] = tmp["_ts"].dt.to_period(period).astype(str)
        fn = {"sum":"sum","avg":"mean","count":"count","max":"max"}.get(agg,"sum")
        grp = getattr(tmp.groupby("_p")[num_col], fn)().sort_index()
        return [{"name":str(k),"value":_safe(v)} for k,v in grp.items() if _safe(v) is not None]
    except Exception: return []

def _build_pie_data(df, cat_col, num_col=None, top_n=8):
    try:
        if num_col and num_col in df.columns:
            g = df.groupby(cat_col)[num_col].sum().sort_values(ascending=False).head(top_n)
        else:
            g = df[cat_col].value_counts().head(top_n)
        return [{"name":str(k),"value":_safe(v)} for k,v in g.items() if _safe(v) is not None]
    except Exception: return []

def _build_scatter_data(df, x_col, y_col, color_col=None):
    try:
        cols = [x_col, y_col] + ([color_col] if color_col and color_col in df.columns else [])
        tmp  = df[cols].dropna().head(800)
        out  = []
        for _, row in tmp.iterrows():
            item = {"x":_safe(row[x_col]), "y":_safe(row[y_col])}
            if color_col and color_col in row:
                item["category"] = str(row[color_col])
            out.append(item)
        return out
    except Exception: return []

def _build_histogram_data(df, col, bins=20):
    try:
        vals = df[col].replace([np.inf,-np.inf], np.nan).dropna()
        counts, edges = np.histogram(vals, bins=bins)
        return [{"name":f"{round(float(edges[i]),1)}–{round(float(edges[i+1]),1)}",
                 "value":int(counts[i])} for i in range(len(counts))]
    except Exception: return []

def _build_table_data(df, columns, top_n=150):
    try:
        cols   = [c for c in columns if c in df.columns] or df.columns.tolist()[:10]
        sample = df[cols].head(top_n)
        rows   = [{str(k):(_safe(v) if not isinstance(v,str) else v) for k,v in row.items()}
                  for _,row in sample.iterrows()]
        return {"columns":cols, "rows":rows, "total":len(df)}
    except Exception: return {"columns":[],"rows":[],"total":0}

def _build_correlation_data(df, numeric_cols):
    try:
        cols  = [c for c in numeric_cols if df[c].nunique() > 1][:12]
        clean = df[cols].replace([np.inf,-np.inf], np.nan).dropna(axis=1, how="all")
        if clean.shape[1] < 2: return {}
        corr  = clean.corr().round(3)
        matrix = [{"row":str(r),"col":str(c),"value":_safe(corr.loc[r,c])}
                  for r in corr.index for c in corr.columns]
        return {"columns":corr.columns.tolist(), "matrix":matrix}
    except Exception: return {}


# ════════════════════════════════════════════════════════════════════
#  FILTER OPTIONS
# ════════════════════════════════════════════════════════════════════

def _build_filter_options(df, profile):
    opts = {}
    # All good categoricals
    for col in profile["good_cat_cols"]:
        uniq = df[col].dropna().unique()
        if 2 <= len(uniq) <= 50:
            opts[col] = sorted([str(v) for v in uniq], key=str)
    # Engineered categoricals
    for col in profile["engineered_cols"]:
        if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]):
            uniq = df[col].dropna().unique()
            if 2 <= len(uniq) <= 50:
                opts[col] = sorted([str(v) for v in uniq], key=str)
    # Numeric range meta for metric cols
    for col in profile["metric_cols"]:
        s = profile["col_stats"].get(col, {})
        if s.get("min") is not None:
            opts[f"__range__{col}"] = {"min":s["min"],"max":s["max"]}
    return opts

def _build_filter_definitions(profile, filter_options):
    filters, fid, seen = [], [0], set()
    def _add(col, ftype, label):
        if col in seen: return
        seen.add(col)
        fid[0] += 1
        filters.append({"id":f"f{fid[0]}","column":col,"type":ftype,"label":label})
    # Dimension cols first (most useful)
    for col in profile["dimension_cols"]:
        if col in filter_options:
            _add(col, "multi_select", col.replace("_"," ").title())
    # Remaining good cats
    for col in profile["good_cat_cols"]:
        if col in filter_options:
            _add(col, "multi_select", col.replace("_"," ").title())
    # Engineered
    for col in profile["engineered_cols"]:
        if col in filter_options:
            _add(col, "multi_select", col.replace("_"," ").title())
    # Dates
    for col in profile["date_cols"]:
        _add(col, "date_range", f"{col.replace('_',' ').title()} Range")
    # Top metric ranges
    for col in profile["metric_cols"][:4]:
        if f"__range__{col}" in filter_options:
            _add(col, "numeric_range", col.replace("_"," ").title())
    return filters


# ════════════════════════════════════════════════════════════════════
#  TOPUP — guarantee MIN_CHART_WIDGETS using RANKED columns
# ════════════════════════════════════════════════════════════════════

def _chart_count(schema):
    return sum(1 for p in schema.get("pages",[]) for w in p.get("widgets",[])
               if w.get("type") != "kpi_row")

def _topup(schema, df, profile):
    mc  = profile["metric_cols"]        # ranked metrics (best first)
    dc  = profile["dimension_cols"]     # ranked dimensions (best first)
    dem = profile["demo_cols"]          # demographic cols
    dates = profile["date_cols"]
    eng   = profile["engineered_cols"]
    all_c = profile["all_cols"]
    nc    = profile["numeric_cols"]

    used_ids = {w["id"] for p in schema.get("pages",[]) for w in p.get("widgets",[])}
    uid_n = [0]
    def uid(prefix):
        uid_n[0] += 1
        cid = f"_tp_{prefix}_{uid_n[0]}"
        used_ids.add(cid)
        return cid

    # Track already-charted (dim, metric, agg) combos to avoid duplicates
    charted = set()
    for p in schema.get("pages",[]):
        for w in p.get("widgets",[]):
            charted.add((w.get("x_col"), w.get("y_col"), w.get("agg","sum"), w.get("type")))

    extras = []
    def _need(): return _chart_count(schema) + len(extras) < MIN_CHART_WIDGETS
    def _add(wtype, title, insight, w=6, **kw):
        if not _need(): return
        key = (kw.get("x_col"), kw.get("y_col"), kw.get("agg","sum"), wtype)
        if key in charted: return
        charted.add(key)
        extras.append({"id":uid(wtype),"type":wtype,"title":title,"insight":insight,"w":w,**kw})

    # ── Priority order mirrors what a senior analyst would build ──────

    # 1. Bar: each top dimension × top metrics (sum, avg, count)
    for dim in dc[:5]:
        for met in mc[:5]:
            for agg, lbl in [("sum","Total"),("avg","Avg"),("count","Count")]:
                _add("bar", f"{lbl} {met.replace('_',' ').title()} by {dim.replace('_',' ').title()}",
                     f"{lbl} {met} across each {dim}.", w=6, x_col=dim, y_col=met, agg=agg)

    # 2. Line / area: date × top metrics (trends)
    for dc_col in dates[:2]:
        for met in mc[:4]:
            _add("line", f"{met.replace('_',' ').title()} Over Time",
                 f"Monthly trend of {met}.", w=6, x_col=dc_col, y_col=met, agg="sum")
            _add("area", f"{met.replace('_',' ').title()} Area Trend",
                 f"Cumulative area view of {met} trend.", w=6, x_col=dc_col, y_col=met, agg="sum")

    # 3. Engineered date columns × top metrics
    for ec in [c for c in eng if c in df.columns
               and not pd.api.types.is_numeric_dtype(df[c])]:
        for met in mc[:3]:
            _add("bar", f"{met.replace('_',' ').title()} by {ec.replace('_',' ')}",
                 f"Breakdown of {met} by {ec.replace('_',' ')}.", w=6, x_col=ec, y_col=met, agg="sum")

    # 4. Pie: each dimension × top metric
    for dim in dc[:4]:
        for met in mc[:2]:
            _add("pie", f"{met.replace('_',' ').title()} by {dim.replace('_',' ').title()}",
                 f"Proportional share of {met} across {dim}.", w=4, x_col=dim, y_col=met)

    # 5. Histograms: metrics first, then demo cols
    for col in mc[:3] + dem[:3]:
        _add("histogram", f"{col.replace('_',' ').title()} Distribution",
             f"Frequency distribution of {col}.", w=4, x_col=col, y_col=col)

    # 6. Scatter: correlated metric pairs
    for corr in profile["correlations"][:5]:
        c1, c2 = corr["col1"], corr["col2"]
        color  = dc[0] if dc else None
        _add("scatter", f"{c1.replace('_',' ').title()} vs {c2.replace('_',' ').title()}",
             f"Correlation r={corr['r']} between {c1} and {c2}.", w=6,
             x_col=c1, y_col=c2, color_col=color)
    # Additional scatter for top metric pairs
    for i in range(len(mc)):
        for j in range(i+1, len(mc)):
            _add("scatter", f"{mc[i].replace('_',' ').title()} vs {mc[j].replace('_',' ').title()}",
                 f"Relationship between {mc[i]} and {mc[j]}.", w=6,
                 x_col=mc[i], y_col=mc[j], color_col=dc[0] if dc else None)

    # 7. Heatmap (once)
    if not any(w.get("type")=="heatmap" for p in schema.get("pages",[])
               for w in p.get("widgets",[])) and len(nc) >= 3 and _need():
        extras.append({"id":uid("heatmap"),"type":"heatmap","title":"Correlation Heatmap",
                       "insight":"Pairwise correlation across all numeric columns.","w":12})

    # 8. Table (once)
    if not any(w.get("type")=="table" for p in schema.get("pages",[])
               for w in p.get("widgets",[])) and _need():
        extras.append({"id":uid("table"),"type":"table","title":"Data Sample",
                       "columns":all_c[:12],"insight":"Raw data for inspection.","w":12})

    if not extras: return schema

    p1 = schema["pages"][0]["widgets"]
    p1_charts = sum(1 for w in p1 if w.get("type") != "kpi_row")
    if p1_charts >= 8 and len(schema["pages"]) > 1:
        schema["pages"][1]["widgets"].extend(extras)
    elif p1_charts >= 8:
        schema["pages"].append({"id":"page2","title":"Deep Dive","widgets":extras})
    else:
        p1.extend(extras)
    return schema


# ════════════════════════════════════════════════════════════════════
#  FALLBACK SCHEMA — uses ranked cols, never positional shortcuts
# ════════════════════════════════════════════════════════════════════

def _fallback_schema(df, profile):
    mc  = profile["metric_cols"]
    dc  = profile["dimension_cols"]
    dates = profile["date_cols"]
    eng   = profile["engineered_cols"]
    dem   = profile["demo_cols"]
    all_c = profile["all_cols"]
    nc    = profile["numeric_cols"]

    # Safe getters with fallback
    def met(i): return mc[i] if i < len(mc) else (nc[i] if i < len(nc) else None)
    def dim(i): return dc[i] if i < len(dc) else None
    def date(): return dates[0] if dates else None

    wid = [0]
    def w(t, **kw):
        wid[0] += 1
        return {"id":f"fw{wid[0]}","type":t,**kw}

    p1, p2 = [], []

    p1.append(w("kpi_row", title="Key Metrics", columns=mc[:6],
                agg="sum", insight="Core business KPIs.", w=12))

    m0, m1, m2 = met(0), met(1), met(2)
    d0, d1 = dim(0), dim(1)
    dt = date()

    if d0 and m0:
        p1.append(w("bar",  title=f"Total {m0.replace('_',' ').title()} by {d0.replace('_',' ').title()}",
                    x_col=d0, y_col=m0, agg="sum",
                    insight=f"Which {d0} generates most {m0}?", w=6))
        p1.append(w("bar",  title=f"Avg {m0.replace('_',' ').title()} by {d0.replace('_',' ').title()}",
                    x_col=d0, y_col=m0, agg="avg",
                    insight=f"Average {m0} per {d0}.", w=6))
        p1.append(w("pie",  title=f"{m0.replace('_',' ').title()} Share by {d0.replace('_',' ').title()}",
                    x_col=d0, y_col=m0,
                    insight=f"Proportional split of {m0} across {d0}.", w=4))
    if d1 and m0:
        p1.append(w("pie",  title=f"{m0.replace('_',' ').title()} by {d1.replace('_',' ').title()}",
                    x_col=d1, y_col=m0,
                    insight=f"{m0} split by {d1}.", w=4))
    if d0 and m1:
        p1.append(w("bar",  title=f"Count of Orders by {d0.replace('_',' ').title()}",
                    x_col=d0, y_col=m0, agg="count",
                    insight=f"Number of transactions per {d0}.", w=4))
    if dt and m0:
        p1.append(w("line", title=f"{m0.replace('_',' ').title()} Over Time",
                    x_col=dt, y_col=m0, agg="sum",
                    insight=f"Monthly trend of {m0}.", w=8))
        p1.append(w("area", title=f"{m0.replace('_',' ').title()} Area Trend",
                    x_col=dt, y_col=m0, agg="sum",
                    insight=f"Area view of {m0} over time.", w=4))
    if m0:
        p1.append(w("histogram", title=f"{m0.replace('_',' ').title()} Distribution",
                    x_col=m0, y_col=m0,
                    insight=f"Frequency distribution of {m0}.", w=4))
    if m0 and m1:
        p1.append(w("scatter", title=f"{m0.replace('_',' ').title()} vs {m1.replace('_',' ').title()}",
                    x_col=m0, y_col=m1, color_col=d0,
                    insight=f"Relationship between {m0} and {m1}.", w=8))

    # Page 2 — engineered date breakdowns + deep numeric analysis
    for ec in [c for c in eng if c in df.columns
               and not pd.api.types.is_numeric_dtype(df[c])][:3]:
        if m0:
            p2.append(w("bar", title=f"{m0.replace('_',' ').title()} by {ec.replace('_',' ')}",
                        x_col=ec, y_col=m0, agg="sum",
                        insight=f"Breakdown of {m0} by {ec.replace('_',' ')}.", w=6))
    if d1 and m1:
        p2.append(w("bar", title=f"Avg {m1.replace('_',' ').title()} by {d1.replace('_',' ').title()}",
                    x_col=d1, y_col=m1, agg="avg",
                    insight=f"Average {m1} across {d1}.", w=6))
    if m1:
        p2.append(w("histogram", title=f"{m1.replace('_',' ').title()} Distribution",
                    x_col=m1, y_col=m1,
                    insight=f"Distribution of {m1}.", w=4))
    for dcol in dem[:2]:
        p2.append(w("histogram", title=f"{dcol.replace('_',' ').title()} Distribution",
                    x_col=dcol, y_col=dcol,
                    insight=f"Distribution of customer {dcol.replace('_',' ')}.", w=4))
    if m0 and m2:
        p2.append(w("scatter", title=f"{m0.replace('_',' ').title()} vs {m2.replace('_',' ').title()}",
                    x_col=m0, y_col=m2, color_col=d0,
                    insight=f"Scatter of {m0} vs {m2}.", w=6))
    if len(nc) >= 3:
        p2.append(w("heatmap", title="Correlation Heatmap",
                    insight="Pairwise correlations across all numeric columns.", w=12))
    p2.append(w("table", title="Data Sample", columns=all_c[:12],
                insight="Raw data table for inspection.", w=12))

    pages = [{"id":"page1","title":"Overview","widgets":p1}]
    if p2:
        pages.append({"id":"page2","title":"Deep Dive","widgets":p2})

    fo = _build_filter_options(df, profile)
    return {
        "title":"Data Analytics Dashboard","domain":"general","theme":"dark",
        "pages":pages,"filters":_build_filter_definitions(profile, fo),
        "ai_summary":f"Dataset with {len(df):,} rows and {len(df.columns)} columns.",
        "key_insights":[
            f"Top metric: {m0} (total: {_safe(df[m0].sum()) if m0 and m0 in df else 'N/A'})",
            f"Primary dimension: {d0} ({df[d0].nunique() if d0 and d0 in df else 'N/A'} categories)",
        ],
    }


# ════════════════════════════════════════════════════════════════════
#  COMPUTE WIDGET DATA
# ════════════════════════════════════════════════════════════════════

def _compute_widget_data(widget, df, profile):
    mc  = profile["metric_cols"]
    dc  = profile["dimension_cols"]
    nc  = profile["numeric_cols"]
    all_c = profile["all_cols"]

    wtype    = widget.get("type","")
    x_col    = widget.get("x_col","")
    y_col    = widget.get("y_col","")
    agg      = widget.get("agg","sum")
    color_col= widget.get("color_col")

    # Validate — fall back to best-ranked alternatives, never positional [0]
    if x_col and x_col not in df.columns:
        x_col = dc[0] if dc else (all_c[0] if all_c else "")
        widget["x_col"] = x_col
    if y_col and y_col not in df.columns:
        y_col = mc[0] if mc else (nc[0] if nc else "")
        widget["y_col"] = y_col
    if color_col and color_col not in df.columns:
        color_col = dc[0] if dc else None
        widget["color_col"] = color_col

    try:
        if wtype == "kpi_row":
            kpi_cols = [c for c in (widget.get("columns") or mc[:6]) if c in df.columns]
            return _build_kpi_data(df, kpi_cols or mc[:6])
        if wtype in ("bar","area"):
            return _build_bar_data(df, x_col, y_col, agg) if x_col and y_col else []
        if wtype == "line":
            d = _build_line_data(df, x_col, y_col, agg) if x_col and y_col else []
            return d or (_build_bar_data(df, x_col, y_col, agg) if x_col and y_col else [])
        if wtype == "pie":
            return _build_pie_data(df, x_col, y_col or None) if x_col else []
        if wtype == "scatter":
            return _build_scatter_data(df, x_col, y_col, color_col) if x_col and y_col else []
        if wtype == "histogram":
            col = y_col or x_col
            return _build_histogram_data(df, col) if col and col in df.columns else []
        if wtype == "table":
            return _build_table_data(df, widget.get("columns", all_c[:10]))
        if wtype == "heatmap":
            return _build_correlation_data(df, nc)
    except Exception as e:
        print(f"[compute_widget_data] {wtype} ({x_col},{y_col}) error: {e}")
    return []


# ════════════════════════════════════════════════════════════════════
#  MAIN AGENT
# ════════════════════════════════════════════════════════════════════

def dashboard_schema_agent(state: dict) -> dict:
    raw_df: pd.DataFrame = state["_df"]

    df, profile = _profile_and_engineer(raw_df)
    mc  = profile["metric_cols"]
    dc  = profile["dimension_cols"]
    dc_ = profile["date_cols"]
    eng = profile["engineered_cols"]
    nc  = profile["numeric_cols"]
    all_c = profile["all_cols"]

    brief = _profile_to_brief(profile)
    llm   = get_llm()

    prompt = f"""You are a Senior Data Analyst and Power BI Architect with 10+ years experience.

Analyse this dataset and design the BEST POSSIBLE PowerBI-style dashboard.

{brief}

═══ CRITICAL RULES ═══
1. Y-axis (values to measure) must come from PRIMARY METRICS list above
   — NEVER use ID columns, index columns, or high-cardinality text as Y-axis
2. X-axis (categories to slice by) must come from DIMENSIONS list above
   — NEVER use numeric metric columns as X-axis on bar/pie charts
3. Demographic/distribution cols ({profile['demo_cols'][:4]}) → histogram or scatter ONLY
4. Date trends: use the actual date column ({dc_}) for line/area; use engineered cols
   ({eng}) for bar charts broken down by time period
5. Page 1 "Overview": 1 kpi_row + MINIMUM 8 chart widgets (different dim×metric combos)
6. Page 2 "Deep Dive": MINIMUM 5 chart widgets (deeper breakdowns, correlations)
7. NO duplicate charts — each widget must show a DIFFERENT insight
8. Make titles and insights specific: include actual column names and stats from the brief
9. All column names must exactly match: {all_c}
10. Return ONLY valid JSON

Primary metrics ranked (use these as y_col): {mc[:8]}
Dimensions ranked (use these as x_col): {dc[:8]}
Date cols for trends: {dc_}
Engineered time cols: {eng}

JSON:
{{
  "title": "...",
  "domain": "ecommerce|sales|finance|hr|education|healthcare|operations|general",
  "theme": "dark",
  "pages": [
    {{
      "id": "page1",
      "title": "Overview",
      "widgets": [
        {{"id":"w1","type":"kpi_row","title":"Key Metrics","columns":{mc[:5]},"agg":"sum","insight":"Total revenue, orders, avg basket size at a glance.","w":12}},
        {{"id":"w2","type":"bar","title":"[metric] by [dimension]","x_col":"[dim]","y_col":"[metric]","agg":"sum","insight":"Which [dim] drives most [metric]?","w":6}},
        {{"id":"w3","type":"bar","title":"Avg [metric] by [dimension]","x_col":"[dim]","y_col":"[metric]","agg":"avg","insight":"Average [metric] per [dim].","w":6}},
        {{"id":"w4","type":"line","title":"[metric] Over Time","x_col":"{dc_[0] if dc_ else (eng[0] if eng else '')}","y_col":"[metric]","agg":"sum","insight":"Monthly trend of [metric].","w":8}},
        {{"id":"w5","type":"area","title":"[metric] Area Trend","x_col":"{dc_[0] if dc_ else (eng[0] if eng else '')}","y_col":"[metric2]","agg":"sum","insight":"Cumulative view of [metric2] trend.","w":4}},
        {{"id":"w6","type":"pie","title":"[metric] by [dim]","x_col":"[dim]","y_col":"[metric]","insight":"Share of [metric] across [dim].","w":4}},
        {{"id":"w7","type":"pie","title":"[metric] by [dim2]","x_col":"[dim2]","y_col":"[metric]","insight":"[metric] split by [dim2].","w":4}},
        {{"id":"w8","type":"bar","title":"Order Count by [dimension]","x_col":"[dim]","y_col":"[any_metric]","agg":"count","insight":"Transaction volume by [dim].","w":4}},
        {{"id":"w9","type":"scatter","title":"[metric] vs [metric2]","x_col":"[metric]","y_col":"[metric2]","color_col":"[dim]","insight":"Correlation between [metric] and [metric2].","w":8}},
        {{"id":"w10","type":"histogram","title":"[metric] Distribution","x_col":"[metric]","y_col":"[metric]","insight":"Distribution of [metric] values.","w":4}}
      ]
    }},
    {{
      "id": "page2",
      "title": "Deep Dive",
      "widgets": [
        {{"id":"w11","type":"heatmap","title":"Correlation Heatmap","insight":"Pairwise correlations across all numeric columns.","w":12}},
        {{"id":"w12","type":"table","title":"Data Sample","columns":{all_c[:10]},"insight":"Full data table.","w":12}},
        {{"id":"w13","type":"bar","title":"[metric] by [engineered time col]","x_col":"{eng[0] if eng else (dc_[0] if dc_ else '')}","y_col":"[metric]","agg":"sum","insight":"Breakdown by time period.","w":6}},
        {{"id":"w14","type":"bar","title":"Avg [metric2] by [dim2]","x_col":"[dim2]","y_col":"[metric2]","agg":"avg","insight":"Average [metric2] per [dim2].","w":6}},
        {{"id":"w15","type":"histogram","title":"[demo_col] Distribution","x_col":"{profile['demo_cols'][0] if profile['demo_cols'] else (mc[1] if len(mc)>1 else '')}","y_col":"{profile['demo_cols'][0] if profile['demo_cols'] else (mc[1] if len(mc)>1 else '')}","insight":"Customer demographic distribution.","w":4}},
        {{"id":"w16","type":"scatter","title":"[metric] vs [metric3]","x_col":"[metric]","y_col":"[metric3]","color_col":"[dim]","insight":"Additional correlation view.","w":8}}
      ]
    }}
  ],
  "filters": [
    {{"id":"f1","column":"{dc[0] if dc else ''}","type":"multi_select","label":"{dc[0].replace('_',' ').title() if dc else ''}"}},
    {{"id":"f2","column":"{dc[1] if len(dc)>1 else ''}","type":"multi_select","label":"{dc[1].replace('_',' ').title() if len(dc)>1 else ''}"}},
    {{"id":"f3","column":"{dc_[0] if dc_ else ''}","type":"date_range","label":"Date Range"}}
  ],
  "ai_summary": "3-sentence executive summary using real column names and actual numbers from the data.",
  "key_insights": [
    "Insight with specific numbers from brief",
    "Insight with specific numbers",
    "Insight with specific numbers",
    "Insight with specific numbers",
    "Insight with specific numbers",
    "Insight with specific numbers"
  ]
}}"""

    schema = {}
    try:
        resp   = llm.invoke(prompt)
        raw    = resp.content.strip() if hasattr(resp,"content") else str(resp).strip()
        schema = _extract_json(raw)
        print(f"[schema_agent] LLM → {_chart_count(schema)} chart widgets")
    except Exception as e:
        print(f"[schema_agent] LLM failed: {e}")

    if not schema or not schema.get("pages"):
        print("[schema_agent] Using fallback schema")
        schema = _fallback_schema(df, profile)

    # Topup to MIN_CHART_WIDGETS
    schema = _topup(schema, df, profile)

    # Build + merge filters
    filter_options = _build_filter_options(df, profile)
    llm_filters    = schema.get("filters", [])
    auto_filters   = _build_filter_definitions(profile, filter_options)
    seen_cols      = {f["column"] for f in llm_filters}
    for af in auto_filters:
        if af["column"] not in seen_cols:
            llm_filters.append(af)
            seen_cols.add(af["column"])
    schema["filters"] = [f for f in llm_filters if f.get("column")]

    # Compute all widget data
    os.makedirs("dashboard", exist_ok=True)
    for page in schema.get("pages",[]):
        for widget in page.get("widgets",[]):
            widget["data"] = _compute_widget_data(widget, df, profile)

    schema.update({
        "filter_options":   filter_options,
        "kpi_data":         _build_kpi_data(df, mc),
        "numeric_cols":     nc,
        "metric_cols":      mc,
        "categorical_cols": profile["categorical_cols"],
        "good_cat_cols":    profile["good_cat_cols"],
        "dimension_cols":   dc,
        "date_cols":        dc_,
        "engineered_cols":  eng,
        "all_cols":         all_c,
        "row_count":        len(df),
        "col_count":        len(df.columns),
    })

    total  = sum(len(p.get("widgets",[])) for p in schema.get("pages",[]))
    charts = _chart_count(schema)
    print(f"[schema_agent] Final: {len(schema['pages'])} pages | {total} widgets | {charts} chart widgets")
    print(f"[schema_agent] Top metrics: {mc[:5]}")
    print(f"[schema_agent] Top dims: {dc[:5]}")

    with open("dashboard/dashboard_schema.json","w",encoding="utf-8") as f:
        json.dump(schema, f, indent=2, default=str)

    return {**state, "_df": df, "dashboard_schema": schema, "kpi_data": _build_kpi_data(df, mc)}