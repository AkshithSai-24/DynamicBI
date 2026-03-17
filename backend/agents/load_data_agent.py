from state import AgentState
import pandas as pd
from sqlalchemy import create_engine, inspect
from utils.source_detector import detect_source_type
from pymongo import MongoClient
import certifi


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
    if source_type in ["sqlite", "postgres", "mysql"]:
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
    

    # -------------------------
    # MongoDB Source Loader
    # -------------------------

    if source_type == "mongodb":

        uri = path  # MongoDB connection string

        client = MongoClient(uri, tlsCAFile=certifi.where())

        # -------------------------
        # List Databases
        # -------------------------

        databases = client.list_database_names()

        # remove internal databases
        databases = [db for db in databases if db not in ["admin", "local", "config"]]

        if not databases:
            raise Exception("No databases found in MongoDB")

        print("\nAvailable Databases:", databases)

        db_name = input("Enter database name (or press Enter for first database): ")

        if db_name == "":
            db_name = databases[0]

        db = client[db_name]

        # -------------------------
        # List Collections
        # -------------------------

        collections = db.list_collection_names()

        if not collections:
            raise Exception("No collections found in database")

        print("\nAvailable Collections:", collections)

        collection_name = input("Enter collection name (or press Enter for first collection): ")

        if collection_name == "":
            collection_name = collections[0]

        collection = db[collection_name]

        # -------------------------
        # Load Data
        # -------------------------

        data = list(collection.find())

        df = pd.json_normalize(data)

        # remove MongoDB ObjectId
        if "_id" in df.columns:
            df.drop("_id", axis=1, inplace=True)

        print(f"MongoDB collection '{collection_name}' loaded")

        return {
            **state,
            "_df": df,
            "mongo_client": client,
            "database_name": db_name,
            "collection_name": collection_name,
            "source_type": "mongodb",

        }



