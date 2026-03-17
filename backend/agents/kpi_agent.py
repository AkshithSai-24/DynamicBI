
import pandas as pd
import os
import numpy as np

def kpi_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    kpis = {}

    numeric_cols = df.select_dtypes(include=np.number).columns

    for col in numeric_cols:

        kpis[f"SUM_{col}"] = df[col].sum()
        kpis[f"AVG_{col}"] = df[col].mean()

    kpis["ROW_COUNT"] = len(df)
    kpis["COLUMN_COUNT"] = len(df.columns)

    kpi_df = pd.DataFrame(list(kpis.items()), columns=["Metric","Value"])

    kpi_df.to_csv("dashboard/kpis.csv", index=False)

    print("KPI metrics generated")

    return state


