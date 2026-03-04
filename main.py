from typing import TypedDict, Any
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os
import warnings
import re
# Creating various visual for sql and csv 
from sqlalchemy import create_engine, inspect

from langgraph.graph import StateGraph, END
from langchain_ollama import OllamaLLM
from sklearn.ensemble import IsolationForest

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
# SQL CLEANER
# =====================================================


def extract_python(text):
    """
    Extract executable python code from LLM output.
    Removes markdown blocks and explanations.
    """

    # extract ```python ``` blocks
    code_blocks = re.findall(r"```python(.*?)```", text, re.DOTALL | re.IGNORECASE)

    if code_blocks:
        return code_blocks[0].strip()

    # fallback extraction
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
# LOAD DATA
# =====================================================

def load_data_agent(state: AgentState):

    source_type = state["source_type"]
    path = state["source_path"]

    # CSV SOURCE
    if source_type == "csv":

        df = pd.read_csv(path)

        print("\nCSV dataset loaded")

        return {**state, "_df": df}

    # DATABASE SOURCE (generic using SQLAlchemy inspect)

    engine = create_engine(path)

    inspector = inspect(engine)

    tables = inspector.get_table_names()

    if not tables:
        raise Exception("No tables found in database")

    table = tables[0]

    df = pd.read_sql(f"SELECT * FROM {table}", engine)

    print(f"\nDatabase table '{table}' loaded")

    return {
        **state,
        "_df": df,
        "engine": engine,
        "table_name": table
    }


# =====================================================
# DATASET VISUALIZATION
# =====================================================

def dataset_visualization_agent(state):

    df = state["_df"]

    os.makedirs("dashboard", exist_ok=True)

    numeric_cols = df.select_dtypes(include=np.number).columns
    categorical_cols = df.select_dtypes(exclude=np.number).columns

    for col in numeric_cols:

        plt.figure(figsize=(6,4))

        sns.histplot(df[col], kde=True)

        plt.title(col)

        plt.tight_layout()

        plt.savefig(f"dashboard/hist_{col}.png")

        plt.close()

    for col in categorical_cols:

        if df[col].nunique() < 20:

            counts = df[col].value_counts()

            plt.figure(figsize=(6,4))

            sns.barplot(x=counts.index, y=counts.values)

            plt.xticks(rotation=45)

            plt.tight_layout()

            plt.savefig(f"dashboard/bar_{col}.png")

            plt.close()

    numeric_df = df[numeric_cols].replace([np.inf,-np.inf],np.nan).dropna()

    numeric_df = numeric_df.loc[:, numeric_df.std()!=0]

    if numeric_df.shape[1] > 1:

        corr = numeric_df.corr()

        plt.figure(figsize=(8,6))

        sns.heatmap(corr, annot=True, cmap="coolwarm")

        plt.tight_layout()

        plt.savefig("dashboard/correlation_heatmap.png")

        plt.close()

    print("Dataset visualizations created")

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

    plt.scatter(df[x], df[y], alpha=0.3)

    plt.scatter(anomalies[x], anomalies[y], color="red")

    plt.tight_layout()

    plt.savefig("dashboard/anomaly_visual.png")

    plt.close()

    print("Anomaly visualization created")

    return state


# =====================================================
# INSIGHT AGENT
# =====================================================

def insight_agent(state):

    df = state["_df"]

    summary = df.describe().to_string()

    llm = OllamaLLM(model="mistral")

    prompt = f"""
Generate 5 business insights from this dataset summary.

{summary}
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

            chart_html += f'<img src="{c}" width="400">'

    insights = ""

    if os.path.exists("dashboard/insights.txt"):

        with open("dashboard/insights.txt") as f:

            insights = f.read()

    html = f"""
<html>
<body>

<h1>AI BI Dashboard</h1>

<h2>Insights</h2>
<pre>{insights}</pre>

<h2>Anomalies</h2>
<p>See anomalies.csv</p>

<h2>Charts</h2>

{chart_html}

</body>
</html>
"""

    with open("dashboard/dashboard.html","w") as f:

        f.write(html)

    print("\nDashboard generated → dashboard/dashboard.html")

    return state


# =====================================================
# BUILD LANGGRAPH
# =====================================================

def build_graph():

    graph = StateGraph(AgentState)

    graph.add_node("load_data", load_data_agent)
    graph.add_node("visualize", dataset_visualization_agent)
    graph.add_node("anomaly_detect", anomaly_detection_agent)
    graph.add_node("anomaly_visual", anomaly_visualization_agent)
    graph.add_node("insights", insight_agent)
    graph.add_node("dashboard", dashboard_agent)

    graph.set_entry_point("load_data")

    graph.add_edge("load_data","visualize")
    graph.add_edge("visualize","anomaly_detect")
    graph.add_edge("anomaly_detect","anomaly_visual")
    graph.add_edge("anomaly_visual","insights")
    graph.add_edge("insights","dashboard")
    graph.add_edge("dashboard",END)

    return graph.compile()

#=====================
# Auto Visualization Agent
#=====================

def auto_visualize(result, query):

    import pandas as pd
    import matplotlib.pyplot as plt
    import seaborn as sns
    import os

    os.makedirs("dashboard", exist_ok=True)

    if isinstance(result, pd.Series):
        result = result.reset_index()

    if not isinstance(result, pd.DataFrame):
        return

    cols = result.columns

    numeric_cols = result.select_dtypes(include="number").columns
    cat_cols = result.select_dtypes(exclude="number").columns

    plt.figure(figsize=(6,4))

    # =========================
    # Histogram
    # =========================

    if len(cols) == 1 and len(numeric_cols) == 1:

        sns.histplot(result[numeric_cols[0]], kde=True)

        chart = "histogram"

    # =========================
    # Pie Chart
    # =========================

    elif len(cat_cols) == 1 and len(numeric_cols) == 1 and len(result) <= 10:

        result.set_index(cat_cols[0])[numeric_cols[0]].plot.pie(autopct='%1.1f%%')

        chart = "pie"

    # =========================
    # Line Chart (time series)
    # =========================

    elif "date" in cols[0].lower() or "time" in cols[0].lower():

        plt.plot(result[cols[0]], result[cols[1]])

        chart = "line"

    # =========================
    # Scatter Plot
    # =========================

    elif len(numeric_cols) >= 2 and len(result.columns) >= 2:

        sns.scatterplot(x=result[numeric_cols[0]], y=result[numeric_cols[1]])

        chart = "scatter"

    # =========================
    # Default → Bar Chart
    # =========================

    else:

        x = result.iloc[:,0]
        y = result.iloc[:,1]

        plt.bar(x,y)

        chart = "bar"

    plt.title(query)

    plt.tight_layout()

    path = "dashboard/query_visual.png"

    plt.savefig(path)

    plt.close()

    print(f"\nVisualization ({chart}) saved → {path}")
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

        if source_type == "csv":

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
# RUN
# =====================================================

if __name__ == "__main__":

    source_type = input("Enter source type (csv/sqlite/postgres/mysql): ")

    source_path = input("Enter file path or connection string: ")

    app = build_graph()

    state = app.invoke({
        "source_type": source_type,
        "source_path": source_path
    })

    print("\nDashboard ready. Ask questions.")

    query_loop(state)