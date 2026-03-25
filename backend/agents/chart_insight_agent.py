import numpy as np
from langchain_ollama import OllamaLLM
from config import LLM_MODEL



# Initialize Mistral via Ollama
llm = OllamaLLM(model=LLM_MODEL)


# -----------------------------
# 🔍 STEP 1: PYTHON INSIGHTS
# -----------------------------
def generate_statistical_insights(chart_data):
    x = [str(v) for v in chart_data.get("x", [])]  
    y = chart_data.get("y", [])
    chart_type = chart_data.get("chart_type", "bar")

    insights = []

    if not y or len(y) == 0:
        return ["No data available for analysis."]

    y_array = np.array(y)

    # Basic stats
    max_idx = int(np.argmax(y_array))
    min_idx = int(np.argmin(y_array))

    insights.append(f"Highest value is {y[max_idx]} at {x[max_idx]}")
    insights.append(f"Lowest value is {y[min_idx]} at {x[min_idx]}")

    # Mean comparison
    mean_val = np.mean(y_array)
    above_avg = [x[i] for i in range(len(y)) if y[i] > mean_val]

    if above_avg:
        above_avg_str = [str(v) for v in above_avg]

        if chart_type in ["bar", "pie"]:
            insights.append(f"Above average categories: {', '.join(above_avg_str)}")
        else:
            insights.append(f"Above average data points: {', '.join(above_avg_str)}")

    # Chart-specific logic
    if chart_type == "line":
        trend = "increasing" if y[-1] > y[0] else "decreasing"
        insights.append(f"Overall trend is {trend}")

    elif chart_type == "bar":
        spread = max(y) - min(y)
        insights.append(f"Value spread is {spread}")

    elif chart_type == "pie":
        total = sum(y)
        percentages = [(val / total) * 100 for val in y]
        dominant_idx = int(np.argmax(percentages))
        insights.append(
            f"{x[dominant_idx]} dominates with {percentages[dominant_idx]:.1f}% share"
        )

    # Simple anomaly detection
    std_dev = np.std(y_array)
    anomalies = [
        x[i] for i in range(len(y))
        if abs(y[i] - mean_val) > 2 * std_dev
    ]
    if anomalies:
        anomalies_str = [str(v) for v in anomalies]
        insights.append(f"Potential anomalies in: {', '.join(anomalies_str)}")

    return insights


# -----------------------------
# 🧠 STEP 2: LLM EXPLANATION
# -----------------------------
def explain_insights_with_llm(chart_data, statistical_insights):

    prompt = """
You are a senior data analyst.

Chart Data:
{chart_data}

Statistical Findings:
{statistical_insights}

Task:
- Convert the findings into 3 clear business insights
- Use simple language
- Highlight trends, comparisons, and anomalies
- Avoid repeating raw numbers too much
- First point on the statistical insights.
- Rest points can be on recommendations, next steps, or implications based on the data.
"""
    

    

    response = llm.invoke(prompt)
    return response
def analyze_correlation(corr_matrix):

    insights = []

    cols = corr_matrix.columns

    for i in range(len(cols)):
        for j in range(i+1, len(cols)):
            val = corr_matrix.iloc[i, j]

            if abs(val) > 0.7:
                relation = "positive" if val > 0 else "negative"
                insights.append(
                    f"{cols[i]} and {cols[j]} have strong {relation} correlation ({val:.2f})"
                )

    if not insights:
        insights.append("No strong correlations found")

    return insights

# -----------------------------
# 🚀 MAIN FUNCTION
# -----------------------------
def analyze_chart(chart_data):
    stats = generate_statistical_insights(chart_data)
    explanation = explain_insights_with_llm(chart_data, stats)

    return {
        "statistical_insights": stats,
        "llm_insights": explanation
    }