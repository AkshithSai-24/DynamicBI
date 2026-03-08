from langchain_ollama import OllamaLLM
import os
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from utils.chart_title import generate_chart_title
sns.set_style("whitegrid")
import warnings
warnings.filterwarnings("ignore")

def ai_select_category_numeric_pairs(df, categorical_cols, numeric_cols):

    llm = OllamaLLM(model="mistral")

    sample = df.head(10).to_string()

    prompt = f"""
You are a data analyst.

Dataset sample:
{sample}

Categorical columns:
{categorical_cols}

Numeric columns:
{numeric_cols}

Choose the BEST category vs numeric relationships
that would create meaningful business charts.

Rules:
- Maximum 5 pairs
- category must be from categorical columns
- metric must be from numeric columns

Return JSON list:

[
 {{"category":"col","metric":"col"}},
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

def dataset_visualization_agent(state):

    df = state["_df"]
    os.makedirs("dashboard", exist_ok=True)

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=np.number).columns.tolist()

    # ===============================
    # NUMERIC DISTRIBUTIONS
    # ===============================
    for col in numeric_cols:

        # Histogram
        plt.figure(figsize=(6,4))
        sns.histplot(df[col], kde=True, label=col)

        title = generate_chart_title(f"Distribution of {col}")
        plt.title(title)

        plt.xlabel(col)
        plt.ylabel("Frequency")
        plt.legend()

        plt.tight_layout()
        plt.savefig(f"dashboard/hist_{col}.png")
        plt.close()

        # Boxplot
        plt.figure(figsize=(6,4))
        sns.boxplot(x=df[col], label=col)

        title = generate_chart_title(f"Outlier distribution for {col}")
        plt.title(title)

        plt.xlabel(col)
        plt.legend()

        plt.tight_layout()
        plt.savefig(f"dashboard/box_{col}.png")
        plt.close()

    # ===============================
    # CATEGORY DISTRIBUTIONS
    # ===============================
    for col in categorical_cols:

        if df[col].nunique() <= 20:

            counts = df[col].value_counts().head(15)

            plt.figure(figsize=(6,4))
            sns.barplot(x=counts.index, y=counts.values, label=col)

            title = generate_chart_title(f"Category distribution for {col}")
            plt.title(title)

            plt.xlabel(col)
            plt.ylabel("Count")
            plt.legend()

            plt.xticks(rotation=45)

            plt.tight_layout()
            plt.savefig(f"dashboard/bar_{col}.png")
            plt.close()

    # ===============================
    # NUMERIC RELATIONSHIPS
    # ===============================
    if len(numeric_cols) >= 2:

        for i in range(min(4, len(numeric_cols)-1)):

            x = numeric_cols[i]
            y = numeric_cols[i+1]

            plt.figure(figsize=(6,5))
            sns.scatterplot(data=df, x=x, y=y)

            title = generate_chart_title(f"Relationship between {x} and {y}")
            plt.title(title)

            plt.tight_layout()
            plt.savefig(f"dashboard/scatter_{x}_{y}.png")
            plt.close()

    # ===============================
    # CATEGORY vs NUMERIC
    # ===============================
    # ===============================
# AI CATEGORY vs NUMERIC
# ===============================

    pairs = ai_select_category_numeric_pairs(
        df,
        categorical_cols,
        numeric_cols
    )

    for cat, num in pairs:

        grouped = df.groupby(cat)[num].mean().sort_values(ascending=False)

        if len(grouped) > 0:

            plt.figure(figsize=(7,4))
            sns.barplot(x=grouped.index, y=grouped.values)

            title = generate_chart_title(f"Average {num} by {cat}")

            plt.title(title)

            plt.xlabel(cat)
            plt.ylabel(f"Average {num}")

            plt.xticks(rotation=45)

            plt.tight_layout()

            plt.savefig(f"dashboard/avg_{num}_by_{cat}.png")

            plt.close()


    # ===============================
    # CORRELATION HEATMAP
    # ===============================
    if len(numeric_cols) > 1:

        clean_df = df[numeric_cols].replace([np.inf, -np.inf], np.nan)

        clean_df = clean_df.dropna(axis=1, how="all")

# remove constant columns
        lean_df = clean_df.loc[:, clean_df.nunique() > 1]

        # compute correlation on the filtered dataframe (no constant cols)
        corr = lean_df.corr()

        plt.figure(figsize=(8,6))
        sns.heatmap(corr, annot=True, cmap="coolwarm")

        title = generate_chart_title("Correlation between numeric variables")
        plt.title(title)

        plt.tight_layout()
        plt.savefig("dashboard/correlation_heatmap.png")
        plt.close()




    print("Smart visualizations created")

    return state