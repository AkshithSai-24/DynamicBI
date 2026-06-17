from typing import TypedDict, Any, Optional, List, Dict
import pandas as pd


class AgentState(TypedDict, total=False):
    # Source config
    source_type: str
    source_path: str

    # Data
    _df: pd.DataFrame
    engine: Any
    mongo_client: Any
    table_name: str
    collection_name: str
    database_name: str

    # Excel hints
    _excel_sheet: Optional[str]
    _db_table: Optional[str]
    _mongo_database: Optional[str]
    _mongo_collection: Optional[str]
    _available_tables: List[str]

    # Agent outputs
    anomalies: pd.DataFrame
    dashboard_schema: Dict   # AI-generated PowerBI layout schema
    ai_analysis: Dict        # Full AI data analysis

    forecasts: List[Dict]
    kpi_data: List[Dict]              # properly-shaped KPI list for KpiRow
    anomaly_scatter_panels: List[Dict]