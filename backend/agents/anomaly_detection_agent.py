import numpy as np
from sklearn.ensemble import IsolationForest
import pandas as pd
import os



def anomaly_detection_agent(state):
    os.makedirs("dashboard", exist_ok=True)
    df = state["_df"]

    numeric_cols = df.select_dtypes(include=np.number).columns

    # pick numeric data and sanitize
    X = df[numeric_cols].replace([np.inf, -np.inf], np.nan)
    X = X.fillna(X.median())

    # drop any constant columns (zero variance) which can trigger warnings
    variances = X.var()
    const_cols = variances[variances == 0].index.tolist()
    if const_cols:
        print(f"Dropping constant numeric columns before modeling: {const_cols}")
        X = X.drop(columns=const_cols)

    model = IsolationForest(contamination=0.05)

    df["anomaly"] = model.fit_predict(X)

    anomalies = df[df["anomaly"] == -1]

    anomalies.to_csv("dashboard/anomalies.csv", index=False)

    print(f"Detected {len(anomalies)} anomalies")

    return {**state, "anomalies": anomalies}


