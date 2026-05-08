import os
import pandas as pd
from prophet import Prophet
from backend.config import get_llm
import numpy as np
import warnings
warnings.filterwarnings("ignore")


def forecasting_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    llm = get_llm()

    columns = df.columns.tolist()

    dtypes = {c: str(df[c].dtype) for c in columns}

    sample = df.head(10).to_string()

    prompt = f"""
You are a data scientist.

Dataset columns:
{columns}

Column types:
{dtypes}

Sample data:
{sample}

Identify:

1. Time column
2. Numeric columns suitable for forecasting

Return JSON:

{{
"time_column": "...",
"forecast_columns": ["col1","col2"]
}}
"""

    import json

    def _detect_time_col(df: pd.DataFrame):
        # Prefer columns with many parseable datetimes or containing 'date'/'time'/'ds'
        candidates = []
        for col in df.columns:
            s = df[col]
            parsed = pd.to_datetime(s, errors='coerce')
            non_na = parsed.notna().sum()
            score = non_na
            name = str(col).lower()
            if any(k in name for k in ['date', 'time', 'ds']):
                score += 10
            candidates.append((score, col))
        candidates.sort(reverse=True)
        return candidates[0][1] if candidates and candidates[0][0] > 0 else None

    def _detect_forecast_cols(df: pd.DataFrame, time_col, max_cols=3):
        numeric_cols = []
        for col in df.columns:
            if col == time_col:
                continue
            # attempt to coerce
            coerced = pd.to_numeric(df[col], errors='coerce')
            non_na = coerced.notna().sum()
            uniq = coerced.nunique(dropna=True)
            if non_na >= 10 and uniq >= 2:
                numeric_cols.append((non_na, col))
        numeric_cols.sort(reverse=True)
        return [c for _, c in numeric_cols[:max_cols]]

    decision = None
    try:
        resp = llm.invoke(prompt)
        if hasattr(resp, "content"):
            text = resp.content.strip()
        elif hasattr(resp, "text"):
            text = resp.text.strip()
        else:
            text = str(resp).strip()
        try:
            decision = json.loads(text)
        except Exception:
            # sometimes LLM returns text around JSON; try to extract
            import re
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    decision = json.loads(m.group())
                except Exception:
                    decision = None

    except Exception:
        decision = None

    time_col = None
    forecast_cols = []
    if isinstance(decision, dict):
        time_col = decision.get("time_column")
        forecast_cols = decision.get("forecast_columns", []) or []

    # Fallback detection if LLM failed or returned invalid columns
    if not time_col or time_col not in df.columns:
        detected = _detect_time_col(df)
        if detected:
            print(f"[forecast] LLM time column invalid; auto-detected '{detected}'")
            time_col = detected
        else:
            print("AI could not find valid time column and auto-detection failed")
            return state

    if not forecast_cols:
        detected_cols = _detect_forecast_cols(df, time_col, max_cols=3)
        if detected_cols:
            print(f"[forecast] LLM forecast columns missing; auto-detected {detected_cols}")
            forecast_cols = detected_cols
        else:
            print("AI found no metrics suitable for forecasting and auto-detection failed")
            return state

    print("\nAI Forecast Setup")
    print("Time column:", time_col)
    print("Forecast columns:", forecast_cols)

    try:
        df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
        if df[time_col].notna().sum() == 0:
            print("Time conversion failed (no parsable dates)")
            return state
    except Exception as e:
        print("Time conversion failed:", e)
        return state

    from prophet import Prophet

    for col in forecast_cols:

        if col not in df.columns:
            continue

        # coerce metric to numeric
        ts = df[[time_col, col]].copy()
        ts[col] = pd.to_numeric(ts[col], errors='coerce')
        ts = ts.replace([np.inf, -np.inf], np.nan).dropna()

        # remove constant series
        if ts[col].nunique() < 2:
            print(f"Skipping {col} (constant values or couldn't coerce to numeric)")
            continue

        # remove extreme outliers (clamp to 1st-99th percentile)
        q1 = ts[col].quantile(0.01)
        q99 = ts[col].quantile(0.99)
        ts = ts[(ts[col] >= q1) & (ts[col] <= q99)]

        if len(ts) < 20:
            print(f"Skipping {col} (not enough data after coercion/outlier removal)")
            continue

        prophet_df = ts.rename(columns={
            time_col: "ds",
            col: "y"
        })

        try:
            model = Prophet()
            model.fit(prophet_df)
            future = model.make_future_dataframe(periods=30)
            forecast = model.predict(future)

            forecast.tail(30).to_csv(
                f"dashboard/forecast_{col}.csv",
                index=False
            )

            fig = model.plot(forecast)
            fig.savefig(f"dashboard/forecast_{col}.png")

            print(f"Forecast created for {col}")

        except Exception as e:
            print(f"Forecast failed for {col}: {e}")

    return state
