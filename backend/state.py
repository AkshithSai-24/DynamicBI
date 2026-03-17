
from typing import TypedDict, Any
import pandas as pd

class AgentState(TypedDict, total=False):
    source_type: str
    source_path: str
    _df: pd.DataFrame
    engine: Any
    mongo_client: Any
    table_name: str
    anomalies: pd.DataFrame
    collection_name: str
    database_name: str

