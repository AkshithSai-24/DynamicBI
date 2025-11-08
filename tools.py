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

            final_output = "\n".join(summaries)
            if verbose:
                print("[DATA_ANALYST] Final Output Preview:\n", final_output[:400])
            return final_output

        except Exception as e:
            print("[DATA_ANALYST] ERROR:", e)
            return f"Error in data_analyst_tool: {e}"

    run.__name__ = "data_analyst_tool"
    return run


def make_chart_generator_tool(df: pd.DataFrame, verbose: bool = True):
    def run(query: str) -> str:
        try:
            if verbose:
                print("\n[CHART] User query:", query)

            # Detect "dashboard" → build manually (3 charts)
            if any(k in query.lower() for k in ["dashboard", "compare", "visual", "chart", "plot"]):
                if verbose:
                    print("[CHART] Detected dashboard request → building combined dashboard")

                cols = {c.lower(): c for c in df.columns}
                city_col = cols.get("city") or next((v for k, v in cols.items() if "city" in k), None)
                payment_col = next((v for k, v in cols.items() if "payment" in k or "method" in k), None)
                gender_col = next((v for k, v in cols.items() if "gender" in k), None)
                amount_col = next((v for k, v in cols.items() if "total" in k and "amount" in k), None)
                id_col = next((v for k, v in cols.items() if "order" in k and "id" in k), None)

                if amount_col is None:
                    numeric_cols = df.select_dtypes("number").columns.tolist()
                    amount_col = numeric_cols[0] if numeric_cols else None

                fig = make_subplots(
                    rows=1, cols=3,
                    subplot_titles=["Sales by City", "Sales by Payment Method", "Purchases by Gender"]
                )

                # Sales by City
                if city_col and amount_col:
                    by_city = df.groupby(city_col)[amount_col].sum().sort_values(ascending=False)
                    fig.add_trace(go.Bar(x=by_city.index, y=by_city.values, name="Sales by City"), row=1, col=1)

                # Sales by Payment
                if payment_col and amount_col:
                    by_payment = df.groupby(payment_col)[amount_col].sum().sort_values(ascending=False)
                    fig.add_trace(go.Bar(x=by_payment.index, y=by_payment.values, name="Sales by Payment"), row=1, col=2)

                # Purchases by Gender
                if gender_col:
                    if id_col:
                        by_gender = df.groupby(gender_col)[id_col].count().sort_values(ascending=False)
                    else:
                        by_gender = df[gender_col].value_counts()
                    fig.add_trace(go.Bar(x=by_gender.index, y=by_gender.values, name="Purchases by Gender"), row=1, col=3)

                fig.update_layout(height=600, width=1500, title_text="Dashboard: Sales and Purchases Summary")

                filename = "chart.png"
                outpath = os.path.join(os.getcwd(), filename)
                fig.write_image(outpath)

                if os.path.exists(outpath):
                    print(f"[CHART] ✅ Dashboard saved → {outpath}")
                    return f"Dashboard saved → {outpath}"
                else:
                    print("[CHART] ❌ File not created!")
                    return "Chart generation attempted, but file missing."

            
            prompt = f"""
Return a Plotly JSON spec (keys: data, layout).
Columns: {list(df.columns)}
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



def get_agent_tools(df: pd.DataFrame, verbose: bool = True) -> List[Callable[..., Any]]:
    return [
        make_data_analyst_tool(df, verbose),
        make_chart_generator_tool(df, verbose)
    ]
