import pandas as pd
from typing import Any, Dict
from tools import get_agent_tools

class SimpleOrchestrator:
    def __init__(self, df: pd.DataFrame, verbose: bool = True):
        self.df = df
        self.verbose = verbose
        tools = get_agent_tools(df, verbose)
        self.tools = {t.__name__: t for t in tools}
        self.chart_keywords = {"dashboard", "chart", "plot", "graph", "visual", "compare"}
        self.data_keywords = {"sum", "total", "average", "mean", "count", "find", "how"}

    def invoke(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        user_input = payload.get("input", "")
        if not user_input:
            return {"output": "No input provided."}
        low = user_input.lower()

        try:
            if any(k in low for k in self.chart_keywords):
                data_out = self.tools["data_analyst_tool"](user_input)
                chart_out = self.tools["chart_generator_tool"](user_input)
                return {"output": f"{data_out}\n\n{chart_out}"}
            elif any(k in low for k in self.data_keywords):
                return {"output": self.tools["data_analyst_tool"](user_input)}
            else:
                return {"output": self.tools["chart_generator_tool"](user_input)}
        except Exception as e:
            return {"output": f"Error running orchestrator: {e}"}


def create_orchestrator_agent(df: pd.DataFrame, verbose: bool = True) -> SimpleOrchestrator:
    return SimpleOrchestrator(df, verbose)
