import pandas as pd
import os
import math
import numpy as np


def _safe_float(value):
    """Convert a scalar to a JSON-safe Python float/int, returning None for NaN/Inf."""
    try:
        # Unwrap numpy scalars
        if hasattr(value, "item"):
            value = value.item()
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        # Return int when there is no fractional part to keep the CSV clean
        if f == int(f) and abs(f) < 1e15:
            return int(f)
        return round(f, 6)
    except Exception:
        return None


def kpi_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    kpis = {}

    # Only consider columns that are truly numeric (no all-NaN, no all-Inf columns)
    numeric_cols = df.select_dtypes(include=np.number).columns

    for col in numeric_cols:
        series = df[col].replace([np.inf, -np.inf], np.nan).dropna()

        col_sum = _safe_float(series.sum()) if len(series) > 0 else None
        col_avg = _safe_float(series.mean()) if len(series) > 0 else None

        kpis[f"SUM_{col}"] = col_sum
        kpis[f"AVG_{col}"] = col_avg

    kpis["ROW_COUNT"] = int(len(df))
    kpis["COLUMN_COUNT"] = int(len(df.columns))

    kpi_rows = [{"Metric": k, "Value": v} for k, v in kpis.items()]
    kpi_df = pd.DataFrame(kpi_rows, columns=["Metric", "Value"])

    kpi_df.to_csv("dashboard/kpis.csv", index=False)

    print("KPI metrics generated")

    return state