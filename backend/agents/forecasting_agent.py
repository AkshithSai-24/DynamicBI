import os
from langchain_ollama import OllamaLLM
import pandas as pd
from prophet import Prophet
from config import LLM_MODEL
import numpy as np
import warnings
warnings.filterwarnings("ignore")


def forecasting_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    llm = OllamaLLM(model=LLM_MODEL)

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

    try:
        decision = json.loads(llm.invoke(prompt))
    except:
        print("AI forecast detection failed")
        return state

    time_col = decision.get("time_column")
    forecast_cols = decision.get("forecast_columns", [])

    if not time_col or time_col not in df.columns:
        print("AI could not find valid time column")
        return state

    if len(forecast_cols) == 0:
        print("AI found no metrics suitable for forecasting")
        return state

    print("\nAI Forecast Setup")
    print("Time column:", time_col)
    print("Forecast columns:", forecast_cols)

    try:
        df[time_col] = pd.to_datetime(df[time_col])
    except:
        print("Time conversion failed")
        return state

    from prophet import Prophet

    for col in forecast_cols:

        if col not in df.columns:
            continue

        ts = df[[time_col, col]].replace([np.inf, -np.inf], np.nan)

        ts = ts.dropna()

# remove constant series
        if ts[col].nunique() < 2:
            print(f"Skipping {col} (constant values)")
            continue

# remove extreme outliers
        q1 = ts[col].quantile(0.01)
        q99 = ts[col].quantile(0.99)

        ts = ts[(ts[col] >= q1) & (ts[col] <= q99)]

        if len(ts) < 20:
            print(f"Skipping {col} (not enough data)")
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

