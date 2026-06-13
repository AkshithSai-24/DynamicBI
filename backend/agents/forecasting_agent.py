"""
forecasting_agent.py — DynamicBI
=================================
Pure statsmodels forecasting

Model selection (automatic, per column):
  1. SARIMA  — when enough data AND seasonal period is detectable
  2. ARIMA   — when trend is visible but data is too short for SARIMA
  3. Holt-Winters ETS — fast, reliable fallback for anything else

Visualization — user-friendly, non-technical dark-theme chart:
  • Teal line  = actual historical data
  • Blue dashed = forecast
  • Shaded band = confidence range ("likely range")
  • Annotation  = projected end-value with % change arrow
  • Summary stats bar below the chart (min · max · avg · trend direction)
"""

from __future__ import annotations

import os
import re
import json
import base64
import io
import warnings
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.patches as mpatches
import matplotlib.ticker as mticker

warnings.filterwarnings("ignore")

from config import get_llm


# ═══════════════════════════════════════════════════════════════════════════════
#  THEME — matches DynamicBI dark dashboard
# ═══════════════════════════════════════════════════════════════════════════════
_BG       = "#0c0f1e"
_PANEL    = "#111426"
_CARD     = "#151929"
_BORDER   = "#1c2438"
_TEXT     = "#dde4f4"
_SUBTEXT  = "#7585a8"
_GRID     = "#1a2035"
_TEAL     = "#00e5a0"   # actual data
_BLUE     = "#4d9fff"   # forecast
_RED      = "#ff5e7a"   # down trend
_YELLOW   = "#f4a535"   # neutral / warning
_PURPLE   = "#c084fc"


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _fmt(val: float) -> str:
    """Compact number formatter for axis labels and annotations."""
    if pd.isna(val):
        return "N/A"
    if abs(val) >= 1_000_000:
        return f"{val / 1_000_000:.2f}M"
    if abs(val) >= 1_000:
        return f"{val / 1_000:.1f}K"
    return f"{val:.2f}"


def _infer_freq(series: pd.Series) -> tuple[str, int, str]:
    """
    Infer pandas resample alias, forecast horizon, and human label
    from the median gap between timestamps.
    """
    diffs = series.sort_values().diff().dropna()
    if len(diffs) == 0:
        return "MS", 12, "months"
    gap = diffs.median()
    if gap <= pd.Timedelta("2h"):
        return "h",  48,  "hours"
    if gap <= pd.Timedelta("2d"):
        return "D",  30,  "days"
    if gap <= pd.Timedelta("10d"):
        return "W",  12,  "weeks"
    if gap <= pd.Timedelta("45d"):
        return "MS", 12,  "months"
    return "QS", 6, "quarters"


def _seasonal_period(freq_alias: str) -> int:
    return {"h": 24, "D": 7, "W": 52, "MS": 12, "QS": 4}.get(freq_alias, 0)


def _detect_time_col(df: pd.DataFrame) -> str | None:
    best_score, best_col = 0, None
    for col in df.columns:
        parsed = pd.to_datetime(df[col], errors="coerce")
        score  = int(parsed.notna().sum())
        name   = str(col).lower()
        if any(k in name for k in ["date", "time", "ds", "month", "year", "week", "period", "day"]):
            score += 20
        if score > best_score:
            best_score, best_col = score, col
    return best_col if best_score > 0 else None


def _detect_forecast_cols(df: pd.DataFrame, time_col: str, max_cols: int = 3) -> list[str]:
    result = []
    for col in df.columns:
        if col == time_col:
            continue
        coerced = pd.to_numeric(df[col], errors="coerce")
        non_na  = int(coerced.notna().sum())
        uniq    = int(coerced.nunique(dropna=True))
        if non_na >= 10 and uniq >= 3:
            result.append((non_na, col))
    result.sort(reverse=True)
    return [c for _, c in result[:max_cols]]


# ═══════════════════════════════════════════════════════════════════════════════
#  MODEL FITTING  (SARIMA → ARIMA → ETS cascade)
# ═══════════════════════════════════════════════════════════════════════════════

def _fit_sarima(series: pd.Series, sp: int, periods: int) -> dict | None:
    """Try SARIMA(1,1,1)(1,1,1)[sp]. Returns {yhat, lower, upper} or None."""
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
        if len(series) < sp * 3:
            return None
        model  = SARIMAX(series, order=(1, 1, 1),
                         seasonal_order=(1, 1, 1, sp),
                         enforce_stationarity=False,
                         enforce_invertibility=False)
        result = model.fit(disp=False, maxiter=200)
        fc     = result.get_forecast(steps=periods)
        mean   = fc.predicted_mean
        ci     = fc.conf_int(alpha=0.2)   # 80% interval
        return {
            "yhat":  mean.values,
            "lower": ci.iloc[:, 0].values,
            "upper": ci.iloc[:, 1].values,
        }
    except Exception:
        return None


def _fit_arima(series: pd.Series, periods: int) -> dict | None:
    """Try ARIMA(1,1,1). Returns {yhat, lower, upper} or None."""
    try:
        from statsmodels.tsa.arima.model import ARIMA
        model  = ARIMA(series, order=(1, 1, 1))
        result = model.fit()
        fc     = result.get_forecast(steps=periods)
        mean   = fc.predicted_mean
        ci     = fc.conf_int(alpha=0.2)
        return {
            "yhat":  mean.values,
            "lower": ci.iloc[:, 0].values,
            "upper": ci.iloc[:, 1].values,
        }
    except Exception:
        return None


def _fit_ets(series: pd.Series, freq_alias: str, sp: int, periods: int) -> dict | None:
    """Holt-Winters ETS. Final fallback. Returns {yhat, lower, upper} or None."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        use_seasonal = sp > 0 and len(series) >= sp * 2
        model = ExponentialSmoothing(
            series,
            trend="add",
            seasonal="add" if use_seasonal else None,
            seasonal_periods=sp if use_seasonal else None,
        )
        fit       = model.fit(optimized=True)
        forecast  = fit.forecast(periods)
        resid_std = fit.resid.std()
        z         = 1.28   # 80% normal interval
        return {
            "yhat":  forecast.values,
            "lower": forecast.values - z * resid_std,
            "upper": forecast.values + z * resid_std,
        }
    except Exception:
        return None


def _run_forecast(ts_df: pd.DataFrame, freq_alias: str, periods: int) -> tuple[dict | None, str]:
    """
    Cascade: SARIMA → ARIMA → ETS.
    Returns (forecast_dict, method_name).
    forecast_dict keys: yhat, lower, upper  (all np.ndarray of length=periods)
    """
    series = ts_df.set_index("ds")["y"]
    sp     = _seasonal_period(freq_alias)

    fc = _fit_sarima(series, sp, periods)
    if fc is not None:
        return fc, "SARIMA"

    fc = _fit_arima(series, periods)
    if fc is not None:
        return fc, "ARIMA"

    fc = _fit_ets(series, freq_alias, sp, periods)
    if fc is not None:
        return fc, "Holt-Winters ETS"

    return None, "none"


# ═══════════════════════════════════════════════════════════════════════════════
#  VISUALIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def _build_chart(
    col:         str,
    hist_ds:     pd.Series,
    hist_y:      pd.Series,
    fc_ds:       pd.Series,
    fc_yhat:     np.ndarray,
    fc_lower:    np.ndarray,
    fc_upper:    np.ndarray,
    freq_label:  str,
    periods:     int,
    method:      str,
) -> str:
    """
    Render a clean, user-friendly forecast chart.
    Layout: main chart (top) + compact stats strip (bottom).
    Returns base64-encoded PNG.
    """
    col_label = col.replace("_", " ").title()

    # ── figure layout: main chart + thin stats strip ───────────────────────────
    fig = plt.figure(figsize=(12, 6.2), facecolor=_BG)
    gs  = fig.add_gridspec(2, 1, height_ratios=[5, 1], hspace=0.0)
    ax  = fig.add_subplot(gs[0])
    sx  = fig.add_subplot(gs[1])

    # ── main axes cosmetics ────────────────────────────────────────────────────
    ax.set_facecolor(_PANEL)
    sx.set_facecolor(_CARD)
    for spine in ax.spines.values():
        spine.set_edgecolor(_BORDER)
    for spine in sx.spines.values():
        spine.set_edgecolor(_BORDER)
    ax.tick_params(colors=_SUBTEXT, labelsize=9)
    ax.grid(axis="y", color=_GRID, linewidth=0.6, linestyle="--", zorder=0)
    ax.grid(axis="x", color=_GRID, linewidth=0.3, linestyle=":",  zorder=0)

    # ── confidence band ────────────────────────────────────────────────────────
    ax.fill_between(
        fc_ds, fc_lower, fc_upper,
        color=_BLUE, alpha=0.12, zorder=1, label="Likely range (80%)",
    )
    # soft outer glow
    ax.fill_between(
        fc_ds, fc_lower * 0.995, fc_upper * 1.005,
        color=_BLUE, alpha=0.05, zorder=1,
    )

    # ── historical line ────────────────────────────────────────────────────────
    ax.plot(hist_ds, hist_y,
            color=_TEAL, linewidth=2.4, zorder=4,
            solid_capstyle="round", label="Actual data")
    ax.scatter(hist_ds, hist_y,
               color=_TEAL, s=28, zorder=5, alpha=0.55, edgecolors="none")

    # ── forecast line ──────────────────────────────────────────────────────────
    ax.plot(fc_ds, fc_yhat,
            color=_BLUE, linewidth=2.4, linestyle="--", zorder=4,
            solid_capstyle="round", label=f"Forecast ({periods} {freq_label})")
    ax.scatter(fc_ds, fc_yhat,
               color=_BLUE, s=28, zorder=5, alpha=0.55, edgecolors="none")

    # ── "today" vertical divider ───────────────────────────────────────────────
    split_x = hist_ds.iloc[-1]
    ax.axvline(split_x, color=_SUBTEXT, linewidth=1.1,
               linestyle=":", alpha=0.7, zorder=3)

    # small "Today" label just above the line
    ylims = ax.get_ylim()
    ax.text(split_x, ylims[1],
            "  Now →", color=_SUBTEXT, fontsize=8,
            va="top", ha="left", style="italic")

    # ── end-point annotation ───────────────────────────────────────────────────
    last_fc   = fc_yhat[-1]
    first_fc  = fc_yhat[0]
    last_hist = float(hist_y.iloc[-1])
    pct       = ((last_fc - last_hist) / abs(last_hist) * 100) if last_hist != 0 else 0
    arrow_clr = _TEAL if pct >= 0 else _RED
    direction = "▲" if pct >= 0 else "▼"

    ax.annotate(
        f"{direction} {_fmt(last_fc)}  ({abs(pct):.1f}%)",
        xy=(pd.Series(fc_ds).iloc[-1], last_fc),
        xytext=(-55, 22), textcoords="offset points",
        fontsize=9.5, color=arrow_clr, fontweight="bold",
        arrowprops=dict(arrowstyle="->", color=arrow_clr, lw=1.3),
        bbox=dict(boxstyle="round,pad=0.4",
                  facecolor=_CARD, edgecolor=arrow_clr, alpha=0.92, lw=1.2),
        zorder=10,
    )

    # ── Y-axis compact formatting ──────────────────────────────────────────────
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: _fmt(v)))

    # ── X-axis auto date labels ────────────────────────────────────────────────
    locator   = mdates.AutoDateLocator(minticks=4, maxticks=10)
    formatter = mdates.ConciseDateFormatter(locator)
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(formatter)
    ax.tick_params(axis="x", colors=_SUBTEXT, labelsize=8.5, rotation=25)

    # ── Title ──────────────────────────────────────────────────────────────────
    ax.set_title(
        f"{col_label}  —  {periods}-{freq_label[:-1] if freq_label.endswith('s') else freq_label} Forecast",
        color=_TEXT, fontsize=13, fontweight="bold", pad=13, loc="left",
    )

    # ── Method badge (top-right) ───────────────────────────────────────────────
    ax.text(0.99, 1.02, f"Model: {method}",
            transform=ax.transAxes, fontsize=7.5,
            color=_SUBTEXT, ha="right", va="bottom",
            bbox=dict(boxstyle="round,pad=0.3", facecolor=_CARD,
                      edgecolor=_BORDER, alpha=0.85))

    # ── Legend ─────────────────────────────────────────────────────────────────
    ax.legend(
        loc="upper left", framealpha=0.85,
        facecolor=_PANEL, edgecolor=_BORDER,
        labelcolor=_TEXT, fontsize=9,
    )

    # ── Stats strip (bottom row) ───────────────────────────────────────────────
    sx.set_xlim(0, 1)
    sx.set_ylim(0, 1)
    sx.axis("off")

    all_y    = pd.concat([hist_y, pd.Series(fc_yhat)])
    hist_min = float(hist_y.min())
    hist_max = float(hist_y.max())
    hist_avg = float(hist_y.mean())
    fc_end   = float(fc_yhat[-1])
    trend    = "Upward ▲" if pct > 1 else ("Downward ▼" if pct < -1 else "Stable →")
    t_color  = _TEAL if pct > 1 else (_RED if pct < -1 else _YELLOW)

    stats = [
        ("Historical Min",  _fmt(hist_min), _SUBTEXT),
        ("Historical Max",  _fmt(hist_max), _SUBTEXT),
        ("Historical Avg",  _fmt(hist_avg), _SUBTEXT),
        ("Forecast End",    _fmt(fc_end),   _BLUE),
        ("Overall Trend",   trend,          t_color),
        ("Data Points",     str(len(hist_y)), _SUBTEXT),
    ]

    n   = len(stats)
    gap = 1.0 / n
    for i, (label, value, vcolor) in enumerate(stats):
        cx = gap * i + gap / 2
        sx.text(cx, 0.72, label, ha="center", va="center",
                color=_SUBTEXT, fontsize=7.5)
        sx.text(cx, 0.25, value, ha="center", va="center",
                color=vcolor, fontsize=9.5, fontweight="bold")
        # thin separator
        if i > 0:
            sx.axvline(gap * i, color=_BORDER, linewidth=0.8, alpha=0.6)

    # top rule separating chart from stats strip
    fig.add_artist(
        plt.Line2D([0.065, 0.98], [0.165, 0.165],
                   transform=fig.transFigure,
                   color=_BORDER, linewidth=0.8)
    )

    plt.tight_layout(pad=1.2)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=135,
                bbox_inches="tight", facecolor=_BG)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return b64


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN AGENT
# ═══════════════════════════════════════════════════════════════════════════════

def forecasting_agent(state: dict) -> dict:
    df = state["_df"]
    os.makedirs("dashboard", exist_ok=True)

    # ── 1. Detect columns (heuristic-first, LLM only if needed) ───────────────
    time_col      = _detect_time_col(df)
    forecast_cols = _detect_forecast_cols(df, time_col) if time_col else []

    if not time_col or not forecast_cols:
        llm     = get_llm()
        columns = df.columns.tolist()
        dtypes  = {c: str(df[c].dtype) for c in columns}
        prompt  = f"""You are a data scientist.
Dataset columns: {columns}
Column types: {dtypes}
Sample:
{df.head(6).to_string()}

Return ONLY valid JSON — no explanation, no markdown:
{{"time_column": "...", "forecast_columns": ["col1", "col2"]}}"""
        try:
            resp = llm.invoke(prompt)
            raw  = resp.content.strip() if hasattr(resp, "content") else str(resp).strip()
            m    = re.search(r"\{.*\}", raw, re.DOTALL)
            dec  = json.loads(m.group()) if m else {}
            if not time_col and dec.get("time_column") in df.columns:
                time_col = dec["time_column"]
            if not forecast_cols:
                forecast_cols = [c for c in dec.get("forecast_columns", [])
                                 if c in df.columns]
        except Exception:
            pass

    if not time_col:
        print("[forecast] No time column detected — skipping")
        return state
    if not forecast_cols:
        print("[forecast] No forecastable columns detected — skipping")
        return state

    # ── 2. Parse datetime + infer frequency ───────────────────────────────────
    df = df.copy()
    df[time_col] = pd.to_datetime(df[time_col], errors="coerce")
    df = df.dropna(subset=[time_col])

    if len(df) < 10:
        print("[forecast] Too few valid timestamps — skipping")
        return state

    freq_alias, periods, freq_label = _infer_freq(df[time_col])
    print(f"[forecast] Frequency={freq_alias}  Horizon={periods} {freq_label}")

    forecasts_out: list[dict] = []

    # ── 3. Per-column forecast loop ────────────────────────────────────────────
    for col in forecast_cols:
        if col not in df.columns:
            continue

        # Prepare clean series
        ts = df[[time_col, col]].copy()
        ts[col] = pd.to_numeric(ts[col], errors="coerce")
        ts = ts.replace([np.inf, -np.inf], np.nan).dropna()

        if ts[col].nunique() < 3 or len(ts) < 10:
            print(f"[forecast] Skipping {col} — insufficient data/variance")
            continue

        # Resample to uniform frequency
        ts = (
            ts.set_index(time_col)
            .resample(freq_alias)[col]
            .mean()
            .dropna()
            .reset_index()
        )
        ts.columns = ["ds", "y"]

        if len(ts) < 8:
            print(f"[forecast] Skipping {col} — too sparse after resample")
            continue

        print(f"[forecast] Fitting {col}  ({len(ts)} pts)…")

        # ── Model selection cascade ────────────────────────────────────────────
        fc_dict, method = _run_forecast(ts, freq_alias, periods)

        if fc_dict is None:
            print(f"[forecast] All models failed for {col} — skipping")
            continue

        # ── Build future date index ────────────────────────────────────────────
        freq_offset = pd.tseries.frequencies.to_offset(freq_alias)
        last_date   = ts["ds"].iloc[-1]
        future_ds   = pd.date_range(start=last_date + freq_offset,
                                    periods=periods, freq=freq_alias)

        fc_yhat  = fc_dict["yhat"]
        fc_lower = fc_dict["lower"]
        fc_upper = fc_dict["upper"]

        # ── Save artefacts (full history retained on disk) ─────────────────────
        future_df = pd.DataFrame({
            "ds":         future_ds.astype(str),
            "yhat":       fc_yhat.round(4),
            "yhat_lower": fc_lower.round(4),
            "yhat_upper": fc_upper.round(4),
        })
        future_df.to_csv(f"dashboard/forecast_{col}.csv", index=False)

        print(f"[forecast] ✓ {col}  method={method}")

        # ── Build interactive chart_data: minimal trailing history + full future ─
        n_hist_ctx = min(8, len(ts))
        hist_tail_ds = ts["ds"].iloc[-n_hist_ctx:]
        hist_tail_y  = ts["y"].iloc[-n_hist_ctx:]

        chart_data = []
        for ds_val, y_val in zip(hist_tail_ds, hist_tail_y):
            chart_data.append({
                "date":     str(pd.Timestamp(ds_val).date()),
                "actual":   round(float(y_val), 4),
                "forecast": None,
                "lower":    None,
                "upper":    None,
            })

        # bridge point — connects actual line to forecast line at the boundary
        if chart_data:
            chart_data[-1]["forecast"] = chart_data[-1]["actual"]
            chart_data[-1]["lower"]    = chart_data[-1]["actual"]
            chart_data[-1]["upper"]    = chart_data[-1]["actual"]

        for ds_val, yh, lo, up in zip(future_ds, fc_yhat, fc_lower, fc_upper):
            chart_data.append({
                "date":     str(pd.Timestamp(ds_val).date()),
                "actual":   None,
                "forecast": round(float(yh), 4),
                "lower":    round(float(lo), 4),
                "upper":    round(float(up), 4),
            })

        forecasts_out.append({
            "col":        col,
            "method":     method,
            "freq":       freq_alias,
            "freq_label": freq_label,
            "periods":    periods,
            "chart_data": chart_data,
            "rows":       future_df.to_dict(orient="records"),
        })

    # ── 4. Write to state ──────────────────────────────────────────────────────
    state["forecasts"] = forecasts_out
    return state