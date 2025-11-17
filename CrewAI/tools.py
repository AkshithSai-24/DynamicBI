import pandas as pd
from crewai.tools import tool
from langchain_google_genai import GoogleGenerativeAI
import re
import json
from typing import Any
SAFE_AGG_FUNCS = {"sum", "mean", "count", "max", "min", "median"}

@tool("Pandas Data Analyses Tool")
def pandas_dataAnalysis_Tool(df:Any, query: str):

    """Pandas Data Analysis Assistant, Returns a json string with the json type plan for users query. Cantains only plan for data analysis which can be use by other agents."""
    
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
    llm = GoogleGenerativeAI(temperature=0, model="models/gemini-2.0-flash")
    json_llm = llm.bind(
        generation_config={"response_mime_type": "application/json"}
    )
    llm_response = json_llm.invoke(prompt)
    text = llm_response.strip()
    text = re.sub(r"^```[a-zA-Z]*", "", text)
    text = re.sub(r"```$", "", text)
    if text.lower().startswith("json"):
        if "[" in text:
            text = text[text.find("[") :]
        elif "{" in text:
            text = text[text.find("{") :]
    text = text.strip("` \n\t")
    return text
    
@tool("Data Analyses Tool")
def dataAnalyst_Tool(df: Any, json_plan:str):
    """Data Analysis Assistant, Returns the values which are queried through the given dataframe and ready for visual preparation ."""
    
    parsed = json.loads(json_plan)
    plans = parsed if isinstance(parsed, list) else [parsed]
    summaries = []
    for i, plan in enumerate(plans, 1):
        
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
        
        
    return final_output

       

'''if __name__ == "__main__":
    print("started")
    pandas_dataAnalysis_Tool()
    print("ended")'''