import os

from utils.chart_title import generate_chart_title
import matplotlib.pyplot as plt
import numpy as np
import matplotlib
matplotlib.use("Agg")

def anomaly_visualization_agent(state):
    os.makedirs("dashboard", exist_ok=True)
    df = state["_df"]
    anomalies = state["anomalies"]
    if anomalies.empty:
        print("No anomalies to visualize")
        return state
    numeric_cols = df.select_dtypes(include=np.number).columns

    if len(numeric_cols) < 2:
        return state

    x = numeric_cols[0]
    y = numeric_cols[1]

    plt.figure(figsize=(6,5))

    plt.scatter(df[x], df[y], alpha=0.3, label="Normal Data")
    plt.scatter(anomalies[x], anomalies[y], color="red", label="Anomalies")

    title = generate_chart_title(f"Anomaly detection for {x} vs {y}")

    plt.title(title)

    plt.xlabel(x)
    plt.ylabel(y)

    plt.legend()

    plt.tight_layout()

    plt.savefig("dashboard/anomaly_visual.png")

    plt.close()

    print("Anomaly visualization created")

    return state

