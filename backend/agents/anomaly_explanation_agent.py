"""
anomaly_explanation_agent.py
Uses the full dataset profile + anomaly stats for a generalised explanation
that never hard-codes column names.
"""
import os
import pandas as pd
import numpy as np
from config import get_llm


def anomaly_explanation_agent(state):
    anomalies = state["anomalies"]
    df        = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    if anomalies.empty:
        with open("dashboard/anomaly_report.txt", "w", encoding="utf-8") as f:
            f.write("## Anomaly Report\n\nNo anomalies were detected in this dataset.")
        return state

    # ── Build a rich, generalised summary for the LLM ────────────────────────
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    normal_df    = df[df["anomaly"] != -1] if "anomaly" in df.columns else df

    # Per-column comparison: anomaly mean vs normal mean
    col_summaries = []
    for col in numeric_cols[:12]:
        try:
            anm_vals  = anomalies[col].replace([np.inf,-np.inf], np.nan).dropna()
            norm_vals = normal_df[col].replace([np.inf,-np.inf], np.nan).dropna()
            if not len(anm_vals) or not len(norm_vals):
                continue
            anm_mean  = float(anm_vals.mean())
            norm_mean = float(norm_vals.mean())
            diff_pct  = ((anm_mean - norm_mean) / max(abs(norm_mean), 1e-9)) * 100
            col_summaries.append(
                f"  - **{col}**: anomaly avg={anm_mean:.2f}, normal avg={norm_mean:.2f} "
                f"(Δ {diff_pct:+.1f}%)"
            )
        except Exception:
            pass

    # Categorical breakdown
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    cat_summaries = []
    for col in cat_cols[:6]:
        try:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                continue
            anm_top  = anomalies[col].value_counts().head(3)
            all_top  = df[col].value_counts().head(3)
            anm_str  = ", ".join([f"{v} ({c})" for v,c in anm_top.items()])
            all_str  = ", ".join([f"{v} ({c})" for v,c in all_top.items()])
            cat_summaries.append(
                f"  - **{col}**: anomalies top={anm_str} | full dataset top={all_str}"
            )
        except Exception:
            pass

    sample_rows = anomalies.drop(columns=["anomaly"], errors="ignore").head(5).to_string(index=False)

    prompt = f"""You are a senior data quality and business analyst with 10+ years of experience.

## Dataset Overview
- Total rows: {len(df):,}
- Anomalies detected: {len(anomalies):,} ({len(anomalies)/max(len(df),1)*100:.1f}% of data)
- All columns: {df.columns.tolist()}

## Anomaly vs Normal — Numeric Column Comparison
{chr(10).join(col_summaries) if col_summaries else "  (no numeric comparison available)"}

## Anomaly vs Normal — Categorical Breakdown
{chr(10).join(cat_summaries) if cat_summaries else "  (no categorical breakdown available)"}

## Sample Anomaly Rows
```
{sample_rows}
```

---

Write a **professional anomaly analysis report** in Markdown. Structure it as:

## Anomaly Report

### 1. Key Findings
- Summarise WHICH columns deviate most and by how much (use the numbers above)
- Highlight which categories/segments are over-represented in anomalies
- Use **bold** for column names and *italic* for important values

### 2. Likely Root Causes
- Give 3-5 specific, data-driven root cause hypotheses
- Reference actual column names and values from the summary

### 3. Business Impact
- Explain what these anomalies mean for the business
- Use bullet points with **bold** impact labels

### 4. Recommended Actions
- Provide 4-6 concrete, prioritised remediation steps
- Format as numbered list

Use clear Markdown formatting with proper headings, bold, italic, bullet points, and code spans for column/value names like `column_name`.
Return ONLY the Markdown report.
"""

    llm = get_llm()
    try:
        response = llm.invoke(prompt)
        md = (response.content if hasattr(response, "content") else str(response)).strip()
    except Exception as e:
        md = f"## Anomaly Report\n\n*Could not generate AI explanation: {e}*"

    # Ensure it starts with a heading
    if not md.startswith("#"):
        md = "## Anomaly Report\n\n" + md

    with open("dashboard/anomaly_report.txt", "w", encoding="utf-8") as f:
        f.write(md)

    print(f"Anomaly explanation generated ({len(md)} chars)")
    return state