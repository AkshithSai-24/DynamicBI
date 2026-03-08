from langchain_ollama import OllamaLLM
from utils.chart_title import generate_chart_title
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

def auto_visualize(result, query):

    if isinstance(result, pd.Series):
        result = result.reset_index()

    if not isinstance(result, pd.DataFrame):
        return

    cols = result.columns.tolist()

    llm = OllamaLLM(model="mistral")

    prompt = f"""
User query:
{query}

Columns:
{cols}

Choose best chart:
bar
line
scatter
pie
histogram
"""

    chart = llm.invoke(prompt).strip().lower()

    plt.figure(figsize=(7,5))

    title = generate_chart_title(query)

    try:

        if chart == "histogram":

            plt.hist(result[cols[0]], label=cols[0])

        elif chart == "pie":

            result.set_index(cols[0])[cols[1]].plot.pie(
                autopct='%1.1f%%',
                legend=True
            )

        elif chart == "line":

            plt.plot(result[cols[0]], result[cols[1]], label=cols[1])

        elif chart == "scatter":

            sns.scatterplot(x=result[cols[0]], y=result[cols[1]], label=cols[1])

        else:

            plt.bar(result[cols[0]], result[cols[1]], label=cols[1])

        plt.title(title)

        plt.xlabel(cols[0])

        if len(cols) > 1:
            plt.ylabel(cols[1])

        plt.legend()

        plt.tight_layout()

        path = "dashboard/query_visual.png"

        plt.savefig(path)

        plt.close()

        print("Visualization saved")

    except Exception as e:

        print("Visualization error:", e)
