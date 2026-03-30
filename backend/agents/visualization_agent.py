from langchain_ollama import OllamaLLM
import os
import json
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from scipy import stats as scipy_stats
from config import LLM_MODEL
from utils.chart_title import generate_chart_title
import warnings
warnings.filterwarnings("ignore")
import matplotlib
matplotlib.use("Agg")


MAX_FRONTEND_SERIES_POINTS = 120
MAX_CATEGORY_SERIES_POINTS = 25
MAX_PREVIEW_POINTS = 12


sns.set_style("whitegrid")

# -------------------------------
# Color Palettes
# -------------------------------
color_palettes = [
    "viridis", "coolwarm", "Set2", "pastel", "tab10", "magma"
]

def get_palette(i):
    return color_palettes[i % len(color_palettes)]


# -----------------------------------------------
# Statistics helpers
# -----------------------------------------------

def compute_statistics(values, label="value"):
    """Full statistical summary for a numeric series."""
    arr = np.array([v for v in values if v is not None and not (isinstance(v, float) and np.isnan(v))], dtype=float)
    if len(arr) == 0:
        return {}

    try:
        mode_result = scipy_stats.mode(arr, keepdims=True)
        mode_val = float(mode_result.mode[0])
        mode_count = int(mode_result.count[0])
    except Exception:
        mode_val = None
        mode_count = None

    skewness = float(scipy_stats.skew(arr)) if len(arr) >= 3 else None
    kurt = float(scipy_stats.kurtosis(arr)) if len(arr) >= 4 else None

    q1 = float(np.percentile(arr, 25))
    q3 = float(np.percentile(arr, 75))
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr
    outliers = arr[(arr < lower_fence) | (arr > upper_fence)].tolist()

    mean_val = float(np.mean(arr))
    std_val = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
    cv = (std_val / mean_val * 100) if mean_val != 0 else None

    normality = {}
    sample = arr[:5000]
    if len(sample) >= 3:
        try:
            stat, p_val = scipy_stats.shapiro(sample)
            normality = {
                "shapiro_stat": round(float(stat), 6),
                "shapiro_p_value": round(float(p_val), 6),
                "is_normal_distribution": bool(p_val > 0.05)
            }
        except Exception:
            pass

    result = {
        "label": label,
        "count": int(len(arr)),
        "missing": int(len(values) - len(arr)),
        "mean": round(mean_val, 6),
        "median": round(float(np.median(arr)), 6),
        "mode": round(mode_val, 6) if mode_val is not None else None,
        "mode_count": mode_count,
        "std": round(std_val, 6),
        "variance": round(float(np.var(arr, ddof=1)) if len(arr) > 1 else 0.0, 6),
        "min": round(float(np.min(arr)), 6),
        "max": round(float(np.max(arr)), 6),
        "range": round(float(np.max(arr) - np.min(arr)), 6),
        "sum": round(float(np.sum(arr)), 6),
        "q1": round(q1, 6),
        "q3": round(q3, 6),
        "iqr": round(iqr, 6),
        "lower_fence": round(lower_fence, 6),
        "upper_fence": round(upper_fence, 6),
        "outlier_count": len(outliers),
        "outliers_sample": [round(float(v), 6) for v in outliers[:20]],
        "coefficient_of_variation_pct": round(cv, 4) if cv is not None else None,
        "skewness": round(skewness, 6) if skewness is not None else None,
        "kurtosis": round(kurt, 6) if kurt is not None else None,
        **normality,
    }

    for p in [5, 10, 25, 50, 75, 90, 95]:
        result[f"p{p}"] = round(float(np.percentile(arr, p)), 6)

    return result


def compute_categorical_statistics(labels, counts, label_name="category", metric_name="count"):
    """Stats for categorical bar / pie charts."""
    total = sum(counts)
    proportions = [c / total * 100 for c in counts] if total > 0 else [0] * len(counts)
    sorted_pairs = sorted(zip(labels, counts, proportions), key=lambda x: -x[1])
    return {
        "label_name": label_name,
        "metric_name": metric_name,
        "total_categories": len(labels),
        "total_count": int(total),
        "categories": [
            {"name": str(lbl), "count": int(cnt), "proportion_pct": round(pct, 4)}
            for lbl, cnt, pct in sorted_pairs
        ],
        "dominant_category": str(sorted_pairs[0][0]) if sorted_pairs else None,
        "dominant_proportion_pct": round(sorted_pairs[0][2], 4) if sorted_pairs else None,
        "count_stats": compute_statistics(counts, label=metric_name),
    }


def compute_scatter_statistics(x_vals, y_vals, x_name="x", y_name="y"):
    """Regression + correlation stats for scatter charts."""
    x_arr = np.array(x_vals, dtype=float)
    y_arr = np.array(y_vals, dtype=float)
    mask = ~(np.isnan(x_arr) | np.isnan(y_arr))
    x_clean = x_arr[mask]
    y_clean = y_arr[mask]

    base = {
        x_name: compute_statistics(x_clean.tolist(), label=x_name),
        y_name: compute_statistics(y_clean.tolist(), label=y_name),
    }
    if len(x_clean) >= 3:
        pearson_r, pearson_p = scipy_stats.pearsonr(x_clean, y_clean)
        spearman_r, spearman_p = scipy_stats.spearmanr(x_clean, y_clean)
        slope, intercept, r_val, p_val, std_err = scipy_stats.linregress(x_clean, y_clean)
        base["correlation"] = {
            "pearson_r": round(float(pearson_r), 6),
            "pearson_p_value": round(float(pearson_p), 6),
            "spearman_r": round(float(spearman_r), 6),
            "spearman_p_value": round(float(spearman_p), 6),
            "r_squared": round(float(r_val ** 2), 6),
        }
        base["linear_regression"] = {
            "slope": round(float(slope), 6),
            "intercept": round(float(intercept), 6),
            "r_squared": round(float(r_val ** 2), 6),
            "p_value": round(float(p_val), 6),
            "std_error": round(float(std_err), 6),
        }
    return base


# -----------------------------------------------
# Persist chart data + stats to JSON
# -----------------------------------------------

def _is_nan_like(value):
    return value is None or (isinstance(value, float) and np.isnan(value))


def _safe_serializable(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def _series_points(x_vals, y_vals, chart_type):
    """Build a frontend-friendly series payload with optional downsampling."""
    x_clean = []
    y_clean = []
    for x, y in zip(x_vals, y_vals):
        if _is_nan_like(x) or _is_nan_like(y):
            continue
        x_clean.append(_safe_serializable(x))
        y_clean.append(_safe_serializable(y))

    total_points = len(x_clean)
    if total_points == 0:
        return {
            "representation": "points",
            "truncated": False,
            "total_points": 0,
            "preview_points": [],
        }

    if chart_type == "histogram":
        numeric = np.array([float(v) for v in y_clean], dtype=float)
        bins = min(30, max(5, int(np.sqrt(len(numeric)))))
        counts, edges = np.histogram(numeric, bins=bins)
        points = [
            {
                "x": f"{round(float(edges[i]), 6)} - {round(float(edges[i + 1]), 6)}",
                "y": int(counts[i]),
            }
            for i in range(len(counts))
        ]
        return {
            "representation": "histogram_bins",
            "truncated": False,
            "total_points": int(len(numeric)),
            "bin_count": int(len(counts)),
            "bin_edges": [round(float(v), 6) for v in edges.tolist()],
            "preview_points": points,
        }

    points = [{"x": x, "y": y} for x, y in zip(x_clean, y_clean)]
    limit = MAX_CATEGORY_SERIES_POINTS if chart_type in {"bar", "pie"} else MAX_FRONTEND_SERIES_POINTS

    if total_points <= limit:
        return {
            "representation": "points",
            "truncated": False,
            "total_points": int(total_points),
            "preview_points": points,
        }

    # Keep the beginning and end of the series so the frontend can show context.
    head = max(1, min(MAX_PREVIEW_POINTS, limit // 2))
    tail = max(1, min(MAX_PREVIEW_POINTS, limit - head))
    if head + tail >= total_points:
        preview = points
    else:
        preview = points[:head] + points[-tail:]

    return {
        "representation": "points",
        "truncated": True,
        "total_points": int(total_points),
        "preview_points": preview,
        "preview_note": f"Showing {len(preview)} of {total_points} points",
    }


def _compact_extra_statistics(extra_stats):
    if not isinstance(extra_stats, dict):
        return extra_stats

    compacted = {}
    for key, value in extra_stats.items():
        if isinstance(value, list):
            if len(value) <= MAX_CATEGORY_SERIES_POINTS:
                compacted[key] = value
            else:
                compacted[key] = {
                    "truncated": True,
                    "total_items": len(value),
                    "preview_items": value[:MAX_PREVIEW_POINTS] + value[-MAX_PREVIEW_POINTS:],
                }
        else:
            compacted[key] = value
    return compacted


def save_chart_data(filename_base, chart_type, x_vals, y_vals, x_name, y_name, extra_stats=None):
    """Write chart data and statistics to dashboard/chart_data/<filename_base>.json"""
    os.makedirs("dashboard/chart_data", exist_ok=True)

    series_payload = _series_points(x_vals, y_vals, chart_type)

    payload = {
        "chart_type": chart_type,
        "x_name": x_name,
        "y_name": y_name,
        "series": series_payload,
        "x": series_payload.get("preview_points", []),
        "y": [point.get("y") for point in series_payload.get("preview_points", [])],
    }

    if chart_type == "histogram":
        numeric = [float(v) for v in y_vals if not _is_nan_like(v)]
        payload["statistics"] = compute_statistics(numeric, label=y_name)

    elif chart_type == "scatter":
        try:
            x_numeric = [float(v) for v in x_vals]
            payload["statistics"] = compute_scatter_statistics(x_numeric, y_vals, x_name, y_name)
        except Exception:
            payload["statistics"] = compute_statistics(y_vals, label=y_name)

    elif chart_type in ("bar", "pie"):
        payload["statistics"] = compute_categorical_statistics(x_vals, y_vals, x_name, y_name)

    elif chart_type == "line":
        payload["statistics"] = {
            y_name: compute_statistics(y_vals, label=y_name),
            "trend": "increasing" if (y_vals and y_vals[-1] > y_vals[0]) else "decreasing",
        }
    else:
        payload["statistics"] = compute_statistics(y_vals, label=y_name)

    if extra_stats:
        payload["extra_statistics"] = _compact_extra_statistics(extra_stats)

    out_path = f"dashboard/chart_data/{filename_base}.json"
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    return payload


# -------------------------------
# AI Column Pair Selection
# -------------------------------
def ai_select_category_numeric_pairs(df, categorical_cols, numeric_cols):
    llm = OllamaLLM(model=LLM_MODEL)
    sample = df.head(10).to_string()
    prompt = f"""
You are a data analyst.

Dataset sample:
{sample}

Categorical columns:
{categorical_cols}

Numeric columns:
{numeric_cols}

Choose the BEST category vs numeric relationships.

Rules:
- Max 7 pairs
- category must be categorical
- metric must be numeric

Return JSON list:
[
 {{"category":"col","metric":"col"}}
]
"""
    try:
        pairs = json.loads(llm.invoke(prompt))
        valid_pairs = []
        for p in pairs:
            cat = p.get("category")
            num = p.get("metric")
            if cat in categorical_cols and num in numeric_cols:
                valid_pairs.append((cat, num))
        return valid_pairs
    except Exception:
        return []


# -------------------------------
# MAIN VISUALIZATION AGENT
# -------------------------------
def dataset_visualization_agent(state):

    df = state["_df"]
    df.columns = [col.replace(".", "_") for col in df.columns]

    os.makedirs("dashboard", exist_ok=True)
    os.makedirs("dashboard/chart_data", exist_ok=True)

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()

    # =====================================================
    # HISTOGRAM + DISTRIBUTION
    # =====================================================
    for i, col in enumerate(numeric_cols):
        plt.figure(figsize=(7, 4))
        clean_vals = df[col].dropna().tolist()

        sns.histplot(clean_vals, kde=True, color=sns.color_palette(get_palette(i))[0], label=col)
        title = generate_chart_title(f"Distribution of {col}")
        plt.title(title)
        plt.xlabel(col)
        plt.ylabel("Frequency")
        plt.legend()
        plt.tight_layout()
        plt.savefig(f"dashboard/hist_{col}.png")
        plt.close()

        save_chart_data(
            filename_base=f"hist_{col}",
            chart_type="histogram",
            x_vals=clean_vals,
            y_vals=clean_vals,
            x_name=col,
            y_name="frequency",
        )


    # =====================================================
    # CATEGORY DISTRIBUTION (BAR)
    # =====================================================
    for i, col in enumerate(categorical_cols):
        if df[col].nunique() <= 20:
            counts = df[col].value_counts().head(15)

            plt.figure(figsize=(7, 4))
            sns.barplot(x=counts.index, y=counts.values, palette=get_palette(i))
            title = generate_chart_title(f"Distribution of {col}")
            plt.title(title)
            plt.xlabel(col)
            plt.ylabel("Count")
            plt.xticks(rotation=45)
            plt.legend([col])
            plt.tight_layout()
            plt.savefig(f"dashboard/bar_{col}.png")
            plt.close()

            save_chart_data(
                filename_base=f"bar_{col}",
                chart_type="bar",
                x_vals=counts.index.tolist(),
                y_vals=counts.values.tolist(),
                x_name=col,
                y_name="count",
            )



    # =====================================================
    # PIE CHARTS
    # =====================================================
    for col in categorical_cols:
        if df[col].nunique() <= 10:
            counts = df[col].value_counts().head(10)

            plt.figure(figsize=(6, 6))
            plt.pie(counts.values, labels=counts.index, autopct='%1.1f%%', colors=sns.color_palette("pastel"))
            title = generate_chart_title(f"Share of {col}")
            plt.title(title)
            plt.tight_layout()
            plt.savefig(f"dashboard/pie_{col}.png")
            plt.close()

            save_chart_data(
                filename_base=f"pie_{col}",
                chart_type="pie",
                x_vals=counts.index.tolist(),
                y_vals=counts.values.tolist(),
                x_name=col,
                y_name="count",
            )



    # =====================================================
    # SCATTER PLOTS
    # =====================================================
    if len(numeric_cols) >= 2:
        for i in range(min(4, len(numeric_cols) - 1)):
            x_col = numeric_cols[i]
            y_col = numeric_cols[i + 1]

            plt.figure(figsize=(7, 5))
            sns.scatterplot(data=df, x=x_col, y=y_col, hue=x_col, palette=get_palette(i))
            title = generate_chart_title(f"{x_col} vs {y_col}")
            plt.title(title)
            plt.xlabel(x_col)
            plt.ylabel(y_col)
            plt.legend()
            plt.tight_layout()
            plt.savefig(f"dashboard/scatter_{x_col}_{y_col}.png")
            plt.close()

            paired = df[[x_col, y_col]].dropna()
            x_vals = paired[x_col].tolist()
            y_vals = paired[y_col].tolist()

            save_chart_data(
                filename_base=f"scatter_{x_col}_{y_col}",
                chart_type="scatter",
                x_vals=x_vals,
                y_vals=y_vals,
                x_name=x_col,
                y_name=y_col,
            )


    # =====================================================
    # CATEGORY vs NUMERIC (AI SELECTED)
    # =====================================================
    pairs = ai_select_category_numeric_pairs(df, categorical_cols, numeric_cols)

    for i, (cat, num) in enumerate(pairs):
        grouped = df.groupby(cat)[num].mean().sort_values(ascending=False)

        if len(grouped) > 0:
            plt.figure(figsize=(7, 4))
            sns.barplot(x=grouped.index, y=grouped.values, palette=get_palette(i))
            title = generate_chart_title(f"Average {num} by {cat}")
            plt.title(title)
            plt.xlabel(cat)
            plt.ylabel(f"Average {num}")
            plt.xticks(rotation=45)
            plt.legend([num])
            plt.tight_layout()
            plt.savefig(f"dashboard/avg_{num}_by_{cat}.png")
            plt.close()

            # Per-group detail stats
            group_detail = df.groupby(cat)[num].agg(["mean", "std", "min", "max", "count", "median"])
            group_detail = group_detail.reset_index()
            group_stats_dict = group_detail.to_dict(orient="records")

            save_chart_data(
                filename_base=f"avg_{num}_by_{cat}",
                chart_type="bar",
                x_vals=grouped.index.tolist(),
                y_vals=grouped.values.tolist(),
                x_name=cat,
                y_name=f"avg_{num}",
                extra_stats={"per_group_detail": group_stats_dict},
            )


    # =====================================================
    # CORRELATION HEATMAP
    # =====================================================
    if len(numeric_cols) > 1:
        clean_df = df[numeric_cols].replace([np.inf, -np.inf], np.nan)
        clean_df = clean_df.dropna(axis=1, how="all")
        clean_df = clean_df.loc[:, clean_df.nunique() > 1]

        if clean_df.shape[1] > 1:
            corr = clean_df.corr()

            plt.figure(figsize=(8, 6))
            sns.heatmap(corr, annot=True, cmap="coolwarm")
            title = generate_chart_title("Correlation between variables")
            plt.title(title)
            plt.tight_layout()
            plt.savefig("dashboard/correlation_heatmap.png")
            plt.close()

            corr_payload = {
                "chart_type": "correlation_heatmap",
                "columns": corr.columns.tolist(),
                "matrix": [
                    {"row": row_name, **{col: round(float(val), 6) for col, val in row.items()}}
                    for row_name, row in corr.round(6).to_dict(orient="index").items()
                ],
                "per_column_statistics": {
                    col: compute_statistics(clean_df[col].dropna().tolist(), label=col)
                    for col in clean_df.columns
                },
            }
            with open("dashboard/chart_data/correlation_heatmap.json", "w") as f:
                json.dump(corr_payload, f, indent=2, default=str)


    # =====================================================
    # DATASET-LEVEL STATISTICS SUMMARY
    # =====================================================
    summary = {
        "dataset_shape": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "numeric_statistics": {
            col: compute_statistics(df[col].dropna().tolist(), label=col)
            for col in numeric_cols
        },
        "categorical_statistics": {
            col: {
                "unique_values": int(df[col].nunique()),
                "top_5_values": df[col].value_counts().head(5).to_dict(),
                "missing_count": int(df[col].isna().sum()),
            }
            for col in categorical_cols
        },
    }
    with open("dashboard/chart_data/dataset_statistics_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)

    print("Smart visualizations created — chart data & statistics saved to dashboard/chart_data/")

    return state
