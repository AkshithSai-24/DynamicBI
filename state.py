
from typing import TypedDict, Any
import pandas as pd

class AgentState(TypedDict, total=False):
    source_type: str
    source_path: str
    _df: pd.DataFrame
    engine: Any
    table_name: str
    anomalies: pd.DataFrame
