from typing import TypedDict, Any
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os

from dotenv import load_dotenv
from langchain_ollama import OllamaLLM
from langgraph.graph import StateGraph, END

load_dotenv()



# State Definition

class AgentState(TypedDict):
    csv_path: str
    user_query: str
    df_columns: list
    pandas_expression: str
    execution_result: Any
    chart_path: str
    _df: pd.DataFrame



# Node 1: Load CSV

def load_csv(state: AgentState) -> AgentState:
    df = pd.read_csv(state["csv_path"])
    return {
        **state,
        "_df": df,
        "df_columns": df.columns.tolist()
    }



# Node 2: Generate Pandas Expression

def generate_pandas_expression(state: AgentState) -> AgentState:
    llm = OllamaLLM(model="mistral", temperature=0)

    prompt = f"""
You are an expert pandas developer.

CSV Columns:
{state["df_columns"]}

User Query:
{state["user_query"]}

Rules:
- Return ONLY a valid pandas expression
- Assume dataframe name is df
- Do NOT use markdown
- Do NOT explain
- Do NOT assign to variables
- Do NOT print
- Expression must be directly executable

Example:
df.groupby("region")["sales"].sum()
"""

    return {
        **state,
        "pandas_expression": llm.invoke(prompt).strip()
    }



# Node 3: Execute Pandas Expression

def execute_pandas_expression(state: AgentState) -> AgentState:
    df = state["_df"]
    expr = state["pandas_expression"]

    try:
        result = eval(expr, {"__builtins__": {}}, {"df": df, "pd": pd})
    except Exception as e:
        result = f"Execution Error: {e}"

    return {
        **state,
        "execution_result": result
    }



# Node 4: Dynamic Bar Chart Generator Agent

def create_bar_chart(state: AgentState) -> AgentState:
    data = state["execution_result"]

    if not isinstance(data, (pd.Series, pd.DataFrame)):
        return {
            **state,
            "chart_path": "Chart not generated (non-plotable output)"
        }

    if isinstance(data, pd.DataFrame):
        if data.shape[1] == 1:
            data = data.iloc[:, 0]
        else:
            data = data.sum(axis=1)

    categories = data.index.astype(str)
    values = data.values

    max_idx = np.argmax(values)
    min_idx = np.argmin(values)

    ylabel = "Value"
    title = f"{state['user_query']}"

    plt.figure(figsize=(10, 6))
    bars = plt.bar(categories, values)

    # Highlight max & min
    bars[max_idx].set_color("green")
    bars[min_idx].set_color("red")
    bars[max_idx].set_linewidth(3)
    bars[min_idx].set_linewidth(3)

    # Annotations
    '''
    plt.annotate(
        f"Highest: {values[max_idx]} ({categories[max_idx]})",
        xy=(max_idx, values[max_idx]),
        xytext=(max_idx, values[max_idx] * 1.05),
        arrowprops=dict(arrowstyle="->")
    )

    plt.annotate(
        f"Lowest: {values[min_idx]} ({categories[min_idx]})",
        xy=(min_idx, values[min_idx]),
        #xytext=(min_idx, values[min_idx] * 0.95),
        arrowprops=dict(arrowstyle="->")
    )
    '''
    plt.xlabel("Category")
    plt.ylabel(ylabel)
    plt.title(title)
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    output_path = "dynamic_chart.png"
    plt.savefig(output_path)
    plt.close()

    return {
        **state,
        "chart_path": os.path.abspath(output_path)
    }

def create_line_chart(state: AgentState) -> AgentState:
    data = state["execution_result"]

    if not isinstance(data, (pd.Series, pd.DataFrame)):
        return {**state, "line_chart_path": "Not generated"}

    

    categories = data.index.astype(str)
    values = data.values

    max_idx = int(np.argmax(values))
    min_idx = int(np.argmin(values))

    fig, ax = plt.subplots(figsize=(11, 6))

    ax.plot(categories, values, marker="o", linewidth=2)

    ax.scatter(categories[max_idx], values[max_idx], s=120)
    ax.scatter(categories[min_idx], values[min_idx], s=120)

    ax.set_title(f"{state['user_query']} (Line Chart)")
    ax.set_xlabel("Category")
    ax.set_ylabel("Value")
    ax.tick_params(axis="x", rotation=45)

    plt.subplots_adjust(right=0.72)

    annotation_text = (
        f"HIGHEST\n{categories[max_idx]} : {values[max_idx]}\n\n"
        f"LOWEST\n{categories[min_idx]} : {values[min_idx]}"
    )

    ax.text(
        1.02,
        0.5,
        annotation_text,
        transform=ax.transAxes,
        verticalalignment="center",
        bbox=dict(boxstyle="round,pad=0.6", facecolor="whitesmoke")
    )

    output_path = "dynamic_line_chart.png"
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches="tight")
    plt.close()

    return {**state, "line_chart_path": os.path.abspath(output_path)}

# Build LangGraph

def build_graph(csv_path: str, user_query: str):
    graph = StateGraph(AgentState)

    graph.add_node("load_csv", load_csv)
    graph.add_node("generate_pandas_expression", generate_pandas_expression)
    graph.add_node("execute_pandas_expression", execute_pandas_expression)
    graph.add_node("create_bar_chart", create_bar_chart)
    graph.add_node("create_line_chart", create_line_chart)

    graph.set_entry_point("load_csv")
    graph.add_edge("load_csv", "generate_pandas_expression")
    graph.add_edge("generate_pandas_expression", "execute_pandas_expression")
    graph.add_edge("execute_pandas_expression", "create_bar_chart")
    graph.add_edge("create_bar_chart", "create_line_chart")
    graph.add_edge("create_line_chart", END)

    app =  graph.compile()
    result = app.invoke({
        "csv_path": csv_path,
        "user_query": user_query
    })
    print("\nPandas Expression:\n", result["pandas_expression"])
    print("\nExecution Result:\n", result["execution_result"])
    return "dynamic_line_chart.png",result["execution_result"]



# Run

if __name__ == "__main__":
    csv_path = "test2.csv"
    user_query = "what are the total sales by city? "

    app = build_graph(csv_path, user_query)

    '''result = app.invoke({
        "csv_path": csv_path,
        "user_query": user_query
    })'''


    
    print("\nChart saved \n")
