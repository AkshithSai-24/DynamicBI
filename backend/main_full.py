from typing import TypedDict, Any
from langgraph import graph
from numpy.ma import anomalies
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os

import re

from sqlalchemy import create_engine, inspect
from langgraph.graph import StateGraph, END
from langchain_ollama import OllamaLLM
from sklearn.ensemble import IsolationForest
sns.set_style("whitegrid")
import warnings
warnings.filterwarnings("ignore")

# =====================================================
# STATE
# =====================================================

class AgentState(TypedDict):

    source_type: str
    source_path: str

    _df: pd.DataFrame
    engine: Any
    table_name: str

    anomalies: pd.DataFrame


# =====================================================
# UTILITY FUNCTIONS
# =====================================================

def extract_python(text):

    code_blocks = re.findall(r"```python(.*?)```", text, re.DOTALL | re.IGNORECASE)

    if code_blocks:
        return code_blocks[0].strip()

    lines = text.split("\n")

    code_lines = []

    for line in lines:

        line = line.strip()

        if (
            line.startswith("result")
            or "df." in line
            or "=" in line
            or "groupby" in line
        ):
            code_lines.append(line)

    return "\n".join(code_lines)


def extract_sql(text):

    sql_blocks = re.findall(r"```sql(.*?)```", text, re.DOTALL | re.IGNORECASE)

    if sql_blocks:
        return sql_blocks[0].strip()

    select_match = re.search(r"(SELECT .*?;)", text, re.IGNORECASE | re.DOTALL)

    if select_match:
        return select_match.group(1)

    return text.strip()

# =====================================================
# AI TITLE GENERATOR
# =====================================================

def generate_chart_title(description):

    llm = OllamaLLM(model="mistral")

    prompt = f"""
You are a data visualization expert.

Generate a short, clear, professional chart title.

Description:
{description}

Return ONLY the title.
"""

    try:
        title = llm.invoke(prompt).strip()
        return title
    except:
        return description


# =====================================================
# SOURCE TYPE DETECTOR
# =====================================================

def detect_source_type(source):

    source = source.lower()

    if source.endswith(".csv"):
        return "csv"

    if source.endswith(".xlsx") or source.endswith(".xls"):
        return "excel"

    if "sqlite://" in source:
        return "sqlite"

    if "postgres://" in source or "postgresql://" in source:
        return "postgres"

    if "mysql://" in source:
        return "mysql"

    raise ValueError("Unsupported source type")

# =====================================================
# LOAD DATA
# =====================================================

def load_data_agent(state: AgentState):

    path = state["source_path"]

    source_type = detect_source_type(path)

    print(f"\nDetected Source Type: {source_type}")

    # ============================================
    # CSV
    # ============================================

    if source_type == "csv":

        df = pd.read_csv(path)

        print("CSV dataset loaded")

        return {**state, "_df": df, "source_type": "csv"}

    # ============================================
    # EXCEL
    # ============================================

    if source_type == "excel":

        xls = pd.ExcelFile(path)

        print("\nAvailable Sheets:", xls.sheet_names)

        sheet = input("Enter sheet name (or press Enter for first sheet): ")

        if sheet == "":
            sheet = xls.sheet_names[0]

        df = pd.read_excel(path, sheet_name=sheet)

        print(f"Excel sheet '{sheet}' loaded")

        return {**state, "_df": df, "source_type": "excel"}

    # ============================================
    # DATABASE
    # ============================================

    engine = create_engine(path)

    inspector = inspect(engine)

    tables = inspector.get_table_names()

    if not tables:
        raise Exception("No tables found in database")

    print("\nAvailable Tables:", tables)

    table = input("Enter table name (or press Enter for first table): ")

    if table == "":
        table = tables[0]

    df = pd.read_sql(f"SELECT * FROM {table}", engine)

    print(f"Database table '{table}' loaded")

    return {
        **state,
        "_df": df,
        "engine": engine,
        "table_name": table,
        "source_type": "sql"
    }

# =====================================================
# DATA CLEANING AGENT
# =====================================================

def data_cleaning_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    report = []

    report.append("DATA CLEANING REPORT\n")

    # ============================================
    # Remove duplicates
    # ============================================

    before = len(df)

    df = df.drop_duplicates()

    after = len(df)

    report.append(f"Duplicates removed: {before - after}")

    # ============================================
    # Handle missing values
    # ============================================

    missing = df.isnull().sum()

    for col, count in missing.items():

        if count > 0:

            if df[col].dtype in ["int64", "float64"]:

                df[col] = df[col].fillna(df[col].median())

                report.append(f"Filled missing values in {col} using median")

            else:

                df[col] = df[col].fillna("Unknown")

                report.append(f"Filled missing values in {col} with 'Unknown'")

    # ============================================
    # Replace infinite values
    # ============================================

    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    # ============================================
    # Outlier detection (IQR)
    # ============================================

    numeric_cols = df.select_dtypes(include=np.number).columns

    for col in numeric_cols:

        Q1 = df[col].quantile(0.25)

        Q3 = df[col].quantile(0.75)

        IQR = Q3 - Q1

        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR

        outliers = ((df[col] < lower) | (df[col] > upper)).sum()

        if outliers > 0:

            df[col] = np.clip(df[col], lower, upper)

            report.append(f"Capped {outliers} outliers in column {col}")

    # ============================================
    # Save cleaning report
    # ============================================

    report_text = "\n".join(report)

    with open("dashboard/data_cleaning_report.txt", "w") as f:

        f.write(report_text)

    print("\nData cleaning completed")

    return {**state, "_df": df}
# =====================================================
# KPI AGENT
# =====================================================

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


# =====================================================
# DATASET VISUALIZATION
# =====================================================

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

        corr = df[numeric_cols].corr()

        plt.figure(figsize=(8,6))
        sns.heatmap(corr, annot=True, cmap="coolwarm")

        title = generate_chart_title("Correlation between numeric variables")
        plt.title(title)

        plt.tight_layout()
        plt.savefig("dashboard/correlation_heatmap.png")
        plt.close()




    print("Smart visualizations created")

    return state
# =====================================================
# ANOMALY DETECTION
# =====================================================

def anomaly_detection_agent(state):

    df = state["_df"]

    numeric_cols = df.select_dtypes(include=np.number).columns

    X = df[numeric_cols].fillna(0)

    model = IsolationForest(contamination=0.05)

    df["anomaly"] = model.fit_predict(X)

    anomalies = df[df["anomaly"] == -1]

    anomalies.to_csv("dashboard/anomalies.csv", index=False)

    print(f"Detected {len(anomalies)} anomalies")

    return {**state, "anomalies": anomalies}


# =====================================================
# ANOMALY VISUALIZATION
# =====================================================

def anomaly_visualization_agent(state):

    df = state["_df"]
    anomalies = state["anomalies"]

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


# =====================================================
# ANOMALY EXPLANATION AGENT
# =====================================================

def anomaly_explanation_agent(state):

    anomalies = state["anomalies"]

    if anomalies.empty:
        return state

    llm = OllamaLLM(model="mistral")

    sample = anomalies.head(10).to_string()

    prompt = f"""
You are a data quality expert.

Here are anomaly rows:

{sample}

Explain:
1. Why these anomalies occur
2. Business meaning
3. How to fix them
"""

    report = llm.invoke(prompt)

    with open("dashboard/anomaly_report.txt","w") as f:
        f.write(report)

    print("Anomaly explanation generated")

    return state


# =====================================================
# AUTO MULTI-METRIC FORECASTING AGENT
# =====================================================

def forecasting_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    llm = OllamaLLM(model="mistral")

    columns = df.columns.tolist()

    dtypes = {c: str(df[c].dtype) for c in columns}

    sample = df.head(10).to_string()

    prompt = f"""
You are a data scientist.

Dataset columns:
{columns}

Column types:
{dtypes}

Sample data:
{sample}

Identify:

1. Time column
2. Numeric columns suitable for forecasting

Return JSON:

{{
"time_column": "...",
"forecast_columns": ["col1","col2"]
}}
"""

    import json

    try:
        decision = json.loads(llm.invoke(prompt))
    except:
        print("AI forecast detection failed")
        return state

    time_col = decision.get("time_column")
    forecast_cols = decision.get("forecast_columns", [])

    if not time_col or time_col not in df.columns:
        print("AI could not find valid time column")
        return state

    if len(forecast_cols) == 0:
        print("AI found no metrics suitable for forecasting")
        return state

    print("\nAI Forecast Setup")
    print("Time column:", time_col)
    print("Forecast columns:", forecast_cols)

    try:
        df[time_col] = pd.to_datetime(df[time_col])
    except:
        print("Time conversion failed")
        return state

    from prophet import Prophet

    for col in forecast_cols:

        if col not in df.columns:
            continue

        ts = df[[time_col, col]].dropna()

        if len(ts) < 20:
            print(f"Skipping {col} (not enough data)")
            continue

        prophet_df = ts.rename(columns={
            time_col: "ds",
            col: "y"
        })

        try:

            model = Prophet()

            model.fit(prophet_df)

            future = model.make_future_dataframe(periods=30)

            forecast = model.predict(future)

            forecast.tail(30).to_csv(
                f"dashboard/forecast_{col}.csv",
                index=False
            )

            fig = model.plot(forecast)

            fig.savefig(f"dashboard/forecast_{col}.png")

            print(f"Forecast created for {col}")

        except Exception as e:

            print(f"Forecast failed for {col}: {e}")

    return state
# ================
# RAG PROFILE AGENT
#======================================================
def rag_profile_agent(state):

    df = state["_df"]

    profile = []

    profile.append("DATASET OVERVIEW")
    profile.append(str(df.shape))

    profile.append("\nCOLUMNS\n")

    for col in df.columns:

        profile.append(f"{col} | type={df[col].dtype} | unique={df[col].nunique()}")

    profile.append("\nSTATISTICS\n")
    profile.append(df.describe().to_string())

    text = "\n".join(profile)

    with open("dashboard/dataset_profile.txt","w") as f:
        f.write(text)

    print("Dataset profile created")

    return state
# =====================================================
# INSIGHT AGENT
# =====================================================

def insight_agent(state):

    with open("dashboard/dataset_profile.txt") as f:
        profile = f.read()

    llm = OllamaLLM(model="mistral")

    prompt = f"""
You are a senior data analyst.

Dataset profile:
{profile}

Generate:
- 5 business insights
- 2 risks
- 2 opportunities
"""

    insights = llm.invoke(prompt)

    with open("dashboard/insights.txt","w") as f:
        f.write(insights)

    print("Insights generated")

    return state


# =====================================================
# DASHBOARD AGENT
# =====================================================

def dashboard_agent(state):

    charts = os.listdir("dashboard")

    chart_html = ""

    for c in charts:

        if c.endswith(".png"):

            chart_html += f"""
            <div class="chart-card">
                <img src="{c}">
            </div>
            """

    kpi_html = ""

    if os.path.exists("dashboard/kpis.csv"):

        kpis = pd.read_csv("dashboard/kpis.csv")

        for _, row in kpis.iterrows():

            kpi_html += f"""
            <div class="kpi-card">
                <div class="kpi-title">{row['Metric']}</div>
                <div class="kpi-value">{round(row['Value'],2)}</div>
            </div>
            """

    insights = ""
    anomaly_report = ""

    if os.path.exists("dashboard/insights.txt"):
        insights = open("dashboard/insights.txt").read()

    if os.path.exists("dashboard/anomaly_report.txt"):
        anomaly_report = open("dashboard/anomaly_report.txt").read()

    html = f"""
<html>

<head>

<title>AI BI Dashboard</title>

<style>

body {{
    font-family: Arial, sans-serif;
    background-color: #f4f6f9;
    margin: 0;
    padding: 0;
}}

.header {{
    background: #2c3e50;
    color: white;
    padding: 20px;
    text-align: center;
}}

.container {{
    padding: 20px;
}}

.section {{
    margin-top: 30px;
}}

.kpi-grid {{
    display: flex;
    flex-wrap: wrap;
}}

.kpi-card {{
    background: white;
    padding: 20px;
    margin: 10px;
    border-radius: 10px;
    width: 180px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    text-align: center;
}}

.kpi-title {{
    font-size: 14px;
    color: #777;
}}

.kpi-value {{
    font-size: 26px;
    font-weight: bold;
}}

.chart-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
}}

.chart-card {{
    background: white;
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}}

.chart-card img {{
    width: 100%;
}}

.text-panel {{
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    white-space: pre-wrap;
}}

</style>

</head>

<body>

<div class="header">
<h1>AI BI Autonomous Dashboard</h1>
</div>

<div class="container">

<div class="section">

<h2>Key Performance Indicators</h2>

<div class="kpi-grid">

{kpi_html}

</div>

</div>

<div class="section">

<h2>Business Insights</h2>

<div class="text-panel">
{insights}
</div>

</div>

<div class="section">

<h2>Anomaly Analysis</h2>

<div class="text-panel">
{anomaly_report}
</div>

</div>

<div class="section">

<h2>Visual Analytics</h2>

<div class="chart-grid">

{chart_html}

</div>

</div>

</div>

</body>

</html>
"""

    with open("dashboard/dashboard.html","w") as f:

        f.write(html)

    print("\nDashboard generated → dashboard/dashboard.html")

    return state


# =====================================================
# GRAPH
# =====================================================

def build_graph():

    graph = StateGraph(AgentState)

    # Data Engineering
    graph.add_node("load_data", load_data_agent)

    # Data Quality
    graph.add_node("clean_data", data_cleaning_agent)

    # BI Analyst
    graph.add_node("kpi", kpi_agent)
    graph.add_node("visualize", dataset_visualization_agent)

    # Data Scientist
    graph.add_node("anomaly_detect", anomaly_detection_agent)
    graph.add_node("anomaly_visual", anomaly_visualization_agent)
    graph.add_node("anomaly_explain", anomaly_explanation_agent)

    # Dataset Understanding
    graph.add_node("rag_profile", rag_profile_agent)

    # Insight generation
    graph.add_node("insights", insight_agent)
    graph.add_node("forecast", forecasting_agent)
    # Dashboard generation
    graph.add_node("dashboard", dashboard_agent)

    graph.set_entry_point("load_data")

    graph.add_edge("load_data","clean_data")
    graph.add_edge("clean_data","kpi")
    graph.add_edge("kpi","visualize")
    graph.add_edge("visualize","anomaly_detect")
    graph.add_edge("anomaly_detect","forecast")
    graph.add_edge("forecast","anomaly_visual")
    #graph.add_edge("anomaly_detect","anomaly_visual")
    graph.add_edge("anomaly_visual","anomaly_explain")
    graph.add_edge("anomaly_explain","rag_profile")
    graph.add_edge("rag_profile","insights")
    graph.add_edge("insights","dashboard")
    graph.add_edge("dashboard", END)

    return graph.compile()


# =====================================================
# AI VISUALIZATION
# =====================================================

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


# =====================================================
# QUERY LOOP
# =====================================================

def query_loop(state):

    df = state["_df"]
    engine = state.get("engine")
    table = state.get("table_name")

    source_type = state["source_type"]

    llm = OllamaLLM(model="mistral")

    while True:

        query = input("\nAsk a query (type exit): ")

        if query.lower() == "exit":
            break

        # ==================================================
        # CSV / PANDAS MODE
        # ==================================================

        if source_type == "csv" or source_type == "excel":

            prompt = f"""
You are a pandas expert.

Dataset columns:
{df.columns.tolist()}

User question:
{query}

Return ONLY executable python code.

Rules:
- dataframe name is df
- final output must be stored in variable result
- do not include explanations
- do not include markdown
"""

            raw_code = llm.invoke(prompt)

            code = extract_python(raw_code)

            print("\nGenerated Code:\n", code)

            try:

                local_vars = {"df": df, "pd": pd}

                exec(code, {}, local_vars)

                result = local_vars.get("result")

                if result is None:
                    raise Exception("No result variable returned")

                print("\nQuery Result:\n", result)

            except Exception as e:

                print("\nExecution Error:", e)

                continue


        # ==================================================
        # SQL DATABASE MODE
        # ==================================================

        else:

            dialect = engine.dialect.name

            schema = f"""
Table: {table}
Columns: {df.columns.tolist()}
SQL Dialect: {dialect}
"""

            prompt = f"""
You are an expert SQL developer.

Database schema:
{schema}

User question:
{query}

Rules:
- Write SQL compatible with {dialect}
- Do NOT use unsupported functions
- Return ONLY SQL
"""

            raw_sql = llm.invoke(prompt)

            sql = extract_sql(raw_sql)

            print("\nGenerated SQL:\n", sql)

            try:

                result = pd.read_sql(sql, engine)

                print("\nQuery Result:\n", result)

            except Exception as e:

                print("\nSQL failed. Retrying generation...")

                retry_prompt = f"""
The following SQL failed for {dialect}:

{sql}

Error:
{e}

Rewrite the SQL query correctly for {dialect}.

Schema:
{schema}

User question:
{query}

Return ONLY corrected SQL.
"""

                fixed_sql = extract_sql(llm.invoke(retry_prompt))

                print("\nRetry SQL:\n", fixed_sql)

                try:

                    result = pd.read_sql(fixed_sql, engine)

                    print("\nQuery Result:\n", result)

                except Exception as e2:

                    print("\nSQL Execution Error:", e2)

                    continue


        # ==================================================
        # VISUALIZATION INTELLIGENCE AGENT
        # ==================================================

        try:

            auto_visualize(result, query)

        except Exception as viz_error:

            print("\nVisualization Error:", viz_error)


# =====================================================
# CONVERSATIONAL BI AGENT
# =====================================================

def conversational_bi_agent():

    llm = OllamaLLM(model="mistral")

    print("\nAI BI Chat ready. Ask analytical questions (type exit).")

    while True:

        question = input("\nBI Question: ")

        if question.lower() == "exit":
            break

        context = ""

        if os.path.exists("dashboard/kpis.csv"):
            context += "\nKPIs:\n"
            context += pd.read_csv("dashboard/kpis.csv").to_string()

        if os.path.exists("dashboard/insights.txt"):
            context += "\nInsights:\n"
            context += open("dashboard/insights.txt").read()

        if os.path.exists("dashboard/anomaly_report.txt"):
            context += "\nAnomaly Report:\n"
            context += open("dashboard/anomaly_report.txt").read()

        if os.path.exists("dashboard/dataset_profile.txt"):
            context += "\nDataset Profile:\n"
            context += open("dashboard/dataset_profile.txt").read()

        prompt = f"""
You are an expert Business Intelligence analyst.

Context about the dataset:
{context}

User question:
{question}

Provide a clear business answer.
Explain reasoning briefly.
"""

        response = llm.invoke(prompt)

        print("\nAI BI Answer:\n")
        print(response)

# =====================================================
# RUN
# =====================================================

if __name__ == "__main__":

    source_path = input("Enter data source (CSV/Excel/DB connection): ")

    app = build_graph()

    state = app.invoke({
        "source_path": source_path
    })

    print("\nDashboard ready. Ask questions.")

    print("\nDashboard ready.")

    while True:

        print("\nChoose mode:")
        print("1 - Data Query")
        print("2 - BI Chat")
        print("3 - Exit")

        choice = input("Enter choice: ")

        if choice == "1":

            query_loop(state)

        elif choice == "2":

            conversational_bi_agent()

        else :

            break