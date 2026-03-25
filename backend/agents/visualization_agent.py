from langchain_ollama import OllamaLLM
import os
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from config import LLM_MODEL
from utils.chart_title import generate_chart_title
import warnings
warnings.filterwarnings("ignore")
import matplotlib
matplotlib.use("Agg")
from agents.chart_insight_agent import analyze_chart
from agents.chart_insight_agent import analyze_correlation

sns.set_style("whitegrid")

# -------------------------------
# Color Palettes
# -------------------------------
color_palettes = [
    "viridis",
    "coolwarm",
    "Set2",
    "pastel",
    "tab10",
    "magma"
]

def get_palette(i):
    return color_palettes[i % len(color_palettes)]


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

    import json

    try:
        pairs = json.loads(llm.invoke(prompt))

        valid_pairs = []
        for p in pairs:
            cat = p.get("category")
            num = p.get("metric")

            if cat in categorical_cols and num in numeric_cols:
                valid_pairs.append((cat, num))

        return valid_pairs

    except:
        return []


# -------------------------------
# MAIN VISUALIZATION AGENT
# -------------------------------
def dataset_visualization_agent(state):

    df = state["_df"]

    # MongoDB safety (nested fields)
    df.columns = [col.replace(".", "_") for col in df.columns]

    os.makedirs("dashboard", exist_ok=True)
    os.makedirs("dashboard/insights", exist_ok=True)

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()

    # =====================================================
    # HISTOGRAM + DISTRIBUTION
    # =====================================================
    for i, col in enumerate(numeric_cols):

        plt.figure(figsize=(7,4))

        sns.histplot(
            df[col].dropna(),
            kde=True,
            color=sns.color_palette(get_palette(i))[0],
            label=col
        )

        title = generate_chart_title(f"Distribution of {col}")

        plt.title(title)
        plt.xlabel(col)
        plt.ylabel("Frequency")
        plt.legend()

        plt.tight_layout()
        plt.savefig(f"dashboard/hist_{col}.png")
        plt.close()
        chart_data = {
        "chart_type": "histogram",
        "x": df[col].dropna().tolist(),
        "y": df[col].dropna().tolist(),
        "metric": col
        }

        result = analyze_chart(chart_data)

        with open(f"dashboard/insights/insights_hist_{col}.txt", "w") as f:
            f.write(result["llm_insights"])

    # =====================================================
    # LINE CHARTS (TRENDS)
    # =====================================================
    '''for i, col in enumerate(numeric_cols[:3]):

        plt.figure(figsize=(7,4))

        plt.plot(
            df[col],
            color=sns.color_palette(get_palette(i))[2],
            label=col
        )

        title = generate_chart_title(f"Trend of {col}")

        plt.title(title)
        plt.xlabel("Index / Time")
        plt.ylabel(col)
        plt.legend()

        plt.tight_layout()
        plt.savefig(f"dashboard/line_{col}.png")
        plt.close()
        chart_data = {
    "chart_type": "line",
    "x": list(range(len(df[col]))),
    "y": df[col].tolist(),
    "metric": col
}

        result = analyze_chart(chart_data)

        with open(f"dashboard/insights/insights_line_{col}.txt", "w") as f:
            f.write(result["llm_insights"])
'''
    # =====================================================
    # CATEGORY DISTRIBUTION (BAR)
    # =====================================================
    for i, col in enumerate(categorical_cols):

        if df[col].nunique() <= 20:

            counts = df[col].value_counts().head(15)

            plt.figure(figsize=(7,4))

            sns.barplot(
                x=counts.index,
                y=counts.values,
                palette=get_palette(i)
            )

            title = generate_chart_title(f"Distribution of {col}")

            plt.title(title)
            plt.xlabel(col)
            plt.ylabel("Count")
            plt.xticks(rotation=45)
            plt.legend([col])

            plt.tight_layout()
            plt.savefig(f"dashboard/bar_{col}.png")
            plt.close()
            chart_data = {
    "chart_type": "bar",
    "x": counts.index.tolist(),
    "y": counts.values.tolist(),
    "metric": col
}

        result = analyze_chart(chart_data)

        with open(f"dashboard/insights/insights_bar_{col}.txt", "w") as f:
            f.write(result["llm_insights"])

    # =====================================================
    # PIE CHARTS
    # =====================================================
    for col in categorical_cols:

        if df[col].nunique() <= 10:

            counts = df[col].value_counts().head(10)

            plt.figure(figsize=(6,6))

            plt.pie(
                counts.values,
                labels=counts.index,
                autopct='%1.1f%%',
                colors=sns.color_palette("pastel")
            )

            title = generate_chart_title(f"Share of {col}")

            plt.title(title)

            plt.tight_layout()
            plt.savefig(f"dashboard/pie_{col}.png")
            plt.close()
            chart_data = {
    "chart_type": "pie",
    "x": counts.index.tolist(),
    "y": counts.values.tolist(),
    "metric": col
}

        result = analyze_chart(chart_data)

        with open(f"dashboard/insights/insights_pie_{col}.txt", "w") as f:
            f.write(result["llm_insights"])

    # =====================================================
    # SCATTER PLOTS
    # =====================================================
    if len(numeric_cols) >= 2:

        for i in range(min(4, len(numeric_cols)-1)):

            x = numeric_cols[i]
            y = numeric_cols[i+1]

            plt.figure(figsize=(7,5))

            sns.scatterplot(
                data=df,
                x=x,
                y=y,
                hue=x,
                palette=get_palette(i)
            )

            title = generate_chart_title(f"{x} vs {y}")

            plt.title(title)
            plt.xlabel(x)
            plt.ylabel(y)
            plt.legend()

            plt.tight_layout()
            plt.savefig(f"dashboard/scatter_{x}_{y}.png")
            plt.close()
            chart_data = {
    "chart_type": "scatter",
    "x": df[x].tolist(),
    "y": df[y].tolist(),
    "metric": f"{x} vs {y}"
}

        result = analyze_chart(chart_data)

        with open(f"dashboard/insights/insights_pie_{col}.txt", "w") as f:
            f.write(result["llm_insights"])

    # =====================================================
    # CATEGORY vs NUMERIC (AI SELECTED)
    # =====================================================
    pairs = ai_select_category_numeric_pairs(
        df,
        categorical_cols,
        numeric_cols
    )

    for i, (cat, num) in enumerate(pairs):

        grouped = df.groupby(cat)[num].mean().sort_values(ascending=False)

        if len(grouped) > 0:

            plt.figure(figsize=(7,4))

            sns.barplot(
                x=grouped.index,
                y=grouped.values,
                palette=get_palette(i)
            )

            title = generate_chart_title(f"Average {num} by {cat}")

            plt.title(title)
            plt.xlabel(cat)
            plt.ylabel(f"Average {num}")
            plt.xticks(rotation=45)
            plt.legend([num])

            plt.tight_layout()
            plt.savefig(f"dashboard/avg_{num}_by_{cat}.png")
            plt.close()
            chart_data = {
    "chart_type": "bar",
    "x": grouped.index.tolist(),
    "y": grouped.values.tolist(),
    "metric": f"avg_{num}_by_{cat}"
}

            result = analyze_chart(chart_data)

            with open(f"dashboard/insights/insights_avg_{num}_by_{cat}.txt", "w") as f:
                f.write(result["llm_insights"])

    # =====================================================
    # CORRELATION HEATMAP
    # =====================================================
    if len(numeric_cols) > 1:

        clean_df = df[numeric_cols].replace([np.inf, -np.inf], np.nan)
        clean_df = clean_df.dropna(axis=1, how="all")
        clean_df = clean_df.loc[:, clean_df.nunique() > 1]

        if clean_df.shape[1] > 1:

            corr = clean_df.corr()

            plt.figure(figsize=(8,6))

            sns.heatmap(
                corr,
                annot=True,
                cmap="coolwarm"
            )

            title = generate_chart_title("Correlation between variables")

            plt.title(title)

            plt.tight_layout()
            plt.savefig("dashboard/correlation_heatmap.png")
            plt.close()
            corr_insights = analyze_correlation(corr)

            with open("dashboard/insights/insights_correlation.txt", "w") as f:
                f.write("\n".join(corr_insights))

    print("Smart visualizations created")

    return state


