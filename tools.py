import pandas as pd
import json
import re
import os
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.io as pio
from typing import List, Callable, Any
from config import llm, json_llm

SAFE_AGG_FUNCS = {"sum", "mean", "count", "max", "min", "median"}
global x

def make_data_analyst_tool(df: pd.DataFrame, verbose: bool = True):
    def clean_json_text(raw: str) -> str:
        text = raw.strip()
        text = re.sub(r"^```[a-zA-Z]*", "", text)
        text = re.sub(r"```$", "", text)
        if text.lower().startswith("json"):
            if "[" in text:
                text = text[text.find("[") :]
            elif "{" in text:
                text = text[text.find("{") :]
        text = text.strip("` \n\t")
        return text

    def run(query: str) -> str:
        try:
            if verbose:
                print("\n[DATA_ANALYST] User query:", query)
                print("[DATA_ANALYST] Columns:", list(df.columns))

            prompt = f"""
You are a pandas data analysis assistant.
Return ONLY JSON. If multiple steps, use a JSON ARRAY of objects.

Example:
[
  {{
    "operation": "groupby_aggregate",
    "groupby": "City",
    "aggregate": {{"Total_Amount": "sum"}},
    "sort_by": "Total_Amount",
    "sort_order": "desc"
  }},
  {{
    "operation": "groupby_aggregate",
    "groupby": "Gender",
    "aggregate": {{"Order_ID": "count"}}
  }}
]
Columns: {list(df.columns)}
User question: {query}
"""
            llm_response = llm.invoke(prompt)
            clean = clean_json_text(str(llm_response))
            if verbose:
                print("[DATA_ANALYST] Cleaned JSON (first 300 chars):", clean[:300])

            parsed = json.loads(clean)
            plans = parsed if isinstance(parsed, list) else [parsed]

            summaries = []
            for i, plan in enumerate(plans, 1):
                if verbose:
                    print(f"\n[DATA_ANALYST] Step {i} plan:", json.dumps(plan, indent=2))

                groupby = plan.get("groupby")
                agg = plan.get("aggregate") or {}
                sort_by = plan.get("sort_by")
                sort_order = plan.get("sort_order", "desc")

                result = df.copy()

                if groupby:
                    safe_agg = {c: f for c, f in agg.items() if f in SAFE_AGG_FUNCS}
                    result = result.groupby(groupby).agg(safe_agg).reset_index()

                if sort_by and sort_by in result.columns:
                    result = result.sort_values(sort_by, ascending=(sort_order.lower() == "asc"))

                summaries.append(f"\nStep {i} result:\n{result.to_string(index=False)}")
            x = summaries
            final_output = "\n".join(summaries)
            
            if verbose:
                print("[DATA_ANALYST] Final Output Preview:\n", final_output[:400])
            return final_output

        except Exception as e:
            print("[DATA_ANALYST] ERROR:", e)
            return f"Error in data_analyst_tool: {e}"

    run.__name__ = "data_analyst_tool"
    return run


'''def make_chart_generator_tool(df: pd.DataFrame, verbose: bool = True):
    def run(query: str) -> str:
        try:
            if verbose:
                print("\n[CHART] User query:", query)

            # Detect "dashboard" → build manually (3 charts)
            

            
            prompt = f"""
Return a Plotly JSON spec (keys: data, layout).
Data: {x}
User request: {query}
"""
            response = json_llm.invoke(prompt)
            text = re.sub(r"^```[a-zA-Z]*", "", str(response))
            text = text.strip("` \n\t")
            spec = json.loads(text)
            fig = pio.from_json(json.dumps(spec))
            filename = "chart.png"
            fig.write_image(filename)
            print(f"[CHART] ✅ Single chart saved → {filename}")
            return f"Chart saved → {filename}"

        except Exception as e:
            print("[CHART] ERROR:", e)
            return f"Chart generation error: {e}"

    run.__name__ = "chart_generator_tool"
    return run

'''

def get_agent_tools(df: pd.DataFrame, verbose: bool = True) -> List[Callable[..., Any]]:
    return [
        make_data_analyst_tool(df, verbose),
        make_chart_generator_tool(df, verbose)
    ]
