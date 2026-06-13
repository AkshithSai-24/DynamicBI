"""
anomaly_visualization_agent.py
Plots anomaly scatter using the TWO BEST METRIC columns (by business importance),
not simply numeric_cols[0] and [1].
Creates multiple plots if enough metric columns exist.
"""
import os
import math
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Reuse the same scoring logic from dashboard_schema_agent
_METRIC_KWS  = ["revenue","sales","amount","total","income","profit","margin","price",
                 "cost","spend","expense","discount","value","earning","quantity","qty",
                 "units","volume","orders","transactions","rate","score","rating","salary"]
_ID_KWS      = ["id","_id","code","key","number","num","no","ref","uuid","index",
                 "order_id","customer_id","user_id","transaction_id","invoice_id"]
_DEMO_KWS    = ["age","birth","dob","tenure","height","weight"]

def _score_col(col: str, series: pd.Series) -> float:
    c = col.lower()
    score = 0.0
    for kw in _METRIC_KWS:
        if kw in c: score += 10; break
    for kw in _ID_KWS:
        if c == kw or c.endswith(f"_{kw}") or c.startswith(f"{kw}_"):
            score -= 50; break
    for kw in _DEMO_KWS:
        if kw in c: score -= 5; break
    rng = float(series.max() - series.min()) if len(series) else 0
    if rng >= 1000: score += 3
    if float(series.sum()) > 1_000_000: score += 4
    return score


DARK_BG   = "#0e1117"
PANEL_BG  = "#161b27"
GRID_CLR  = "#1e2a40"
TEXT_CLR  = "#b0bdd4"
NORMAL_C  = "#00d4ff"
ANOMALY_C = "#ff6b6b"


def _style_ax(ax, title, xlabel, ylabel):
    ax.set_facecolor(PANEL_BG)
    ax.set_title(title, color=TEXT_CLR, fontsize=11, fontweight="bold", pad=10)
    ax.set_xlabel(xlabel, color=TEXT_CLR, fontsize=9)
    ax.set_ylabel(ylabel, color=TEXT_CLR, fontsize=9)
    ax.tick_params(colors=TEXT_CLR, labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID_CLR)
    ax.grid(True, color=GRID_CLR, linestyle="--", linewidth=0.5, alpha=0.7)


def anomaly_visualization_agent(state):
    os.makedirs("dashboard", exist_ok=True)
    df        = state["_df"]
    anomalies = state["anomalies"]

    if anomalies.empty:
        print("No anomalies to visualize")
        return state

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    if len(numeric_cols) < 2:
        return state

    # ── Rank numeric cols by business importance ──────────────────────────────
    scored = []
    for col in numeric_cols:
        s = df[col].replace([np.inf, -np.inf], np.nan).dropna()
        if len(s) == 0:
            continue
        scored.append((col, _score_col(col, s)))

    scored.sort(key=lambda x: x[1], reverse=True)
    # top metrics (exclude ID-penalised cols)
    top_metrics = [c for c, sc in scored if sc > -5]
    if len(top_metrics) < 2:
        top_metrics = [c for c, _ in scored[:4]]  # fallback: just take top 4

    # ── Build panel pairs: (top-metric-1 vs top-metric-2), (top-1 vs top-3), etc. ──
    pairs = []
    if len(top_metrics) >= 2:
        pairs.append((top_metrics[0], top_metrics[1]))
    if len(top_metrics) >= 3:
        pairs.append((top_metrics[0], top_metrics[2]))
    if len(top_metrics) >= 4:
        pairs.append((top_metrics[1], top_metrics[2]))

    pairs = pairs[:3]   # max 3 panels

    normal_df = df[df["anomaly"] != -1] if "anomaly" in df.columns else df

    # ── Build interactive scatter JSON for each pair ───────────────────────────
    scatter_panels = []
    for xcol, ycol in pairs:
        xdata = df[xcol].replace([np.inf, -np.inf], np.nan).dropna()
        ydata = df[ycol].replace([np.inf, -np.inf], np.nan).dropna()
        xlim  = (float(xdata.quantile(0.01)), float(xdata.quantile(0.99)))
        ylim  = (float(ydata.quantile(0.01)), float(ydata.quantile(0.99)))

        def _pts(sub_df, max_n=400):
            sub = sub_df[[xcol, ycol]].replace([np.inf, -np.inf], np.nan).dropna()
            if len(sub) > max_n:
                sub = sub.sample(max_n, random_state=42)
            return [{"x": round(float(r[xcol]), 4), "y": round(float(r[ycol]), 4)}
                    for _, r in sub.iterrows()]

        scatter_panels.append({
            "x_col": xcol,
            "y_col": ycol,
            "x_label": xcol.replace("_", " "),
            "y_label": ycol.replace("_", " "),
            "x_range": [round(xlim[0], 4), round(xlim[1], 4)],
            "y_range": [round(ylim[0], 4), round(ylim[1], 4)],
            "normal": _pts(normal_df),
            "anomaly": _pts(anomalies),
        })

    state["anomaly_scatter_panels"] = scatter_panels

    # ── Static fallback PNG (legacy) ───────────────────────────────────────────
    n_panels = len(pairs)
    fig, axes = plt.subplots(1, n_panels,
                              figsize=(5.5 * n_panels, 5),
                              facecolor=DARK_BG)
    if n_panels == 1:
        axes = [axes]

    for ax, (xcol, ycol), panel in zip(axes, pairs, scatter_panels):
        ax.scatter(normal_df[xcol], normal_df[ycol],
                   alpha=0.25, s=18, c=NORMAL_C, label="Normal", zorder=2)
        ax.scatter(anomalies[xcol], anomalies[ycol],
                   alpha=0.85, s=35, c=ANOMALY_C, label="Anomaly",
                   edgecolors="#ff0000", linewidths=0.5, zorder=3)

        ax.set_xlim(panel["x_range"])
        ax.set_ylim(panel["y_range"])
        _style_ax(ax,
                  f"Anomalies: {xcol.replace('_',' ')} vs {ycol.replace('_',' ')}",
                  xcol.replace("_"," "),
                  ycol.replace("_"," "))

        ax.legend(facecolor=PANEL_BG, edgecolor=GRID_CLR,
                  labelcolor=TEXT_CLR, fontsize=8)

    fig.suptitle(f"Anomaly Detection  ·  {len(anomalies)} anomalies detected "
                 f"({len(anomalies)/max(len(df),1)*100:.1f}% of data)",
                 color=TEXT_CLR, fontsize=12, fontweight="bold", y=1.02)

    plt.tight_layout()
    plt.savefig("dashboard/anomaly_visual.png",
                dpi=130, facecolor=DARK_BG,
                bbox_inches="tight")
    plt.close()

    print(f"Anomaly visualization saved ({n_panels} panels, "
          f"cols: {[p[0]+' vs '+p[1] for p in pairs]})")
    return state