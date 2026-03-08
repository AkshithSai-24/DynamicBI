from state import AgentState
import pandas as pd
from sqlalchemy import create_engine, inspect
from utils.source_detector import detect_source_type


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
    print(f"Detected Source Type: {source_type}")

    if source_type == "csv":
        df = pd.read_csv(path)
        return {**state, "_df": df, "source_type": "csv"}

    if source_type == "excel":
        xls = pd.ExcelFile(path)
        sheet = xls.sheet_names[0]
        df = pd.read_excel(path, sheet_name=sheet)
        return {**state, "_df": df, "source_type": "excel"}

    engine = create_engine(path)
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    table = tables[0]

    df = pd.read_sql(f"SELECT * FROM {table}", engine)

    return {
        **state,
        "_df": df,
        "engine": engine,
        "table_name": table,
        "source_type": "sql"
    }
