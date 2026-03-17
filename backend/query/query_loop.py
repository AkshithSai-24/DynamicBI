from utils.code_extractor import extract_sql, extract_python
from langchain_ollama import OllamaLLM
import pandas as pd
from utils.code_extractor import extract_python
from query.auto_visualize import auto_visualize
from config import LLM_MODEL
from pymongo import MongoClient
import pandas as pd
import json

def query_loop(state):

    df = state["_df"]
    engine = state.get("engine")
    table = state.get("table_name")
    client = state.get("mongo_client")
    db_name = state.get("database_name")
    collection_name = state.get("collection_name")
    source_type = state["source_type"]

    llm = OllamaLLM(model=LLM_MODEL)

    while True:

        query = input("\nAsk a query (type exit): ")

        if query.lower() == "exit":
            break

        # ==================================================
        # CSV / PANDAS MODE
        # ==================================================

        if source_type == "csv" or source_type == "excel":

            prompt = f"""
You are a pandas expert.

Dataset columns:
{df.columns.tolist()}

User question:
{query}

Return ONLY executable python code.

Rules:
- DATAFRAME NAME is df
- final output must be stored in variable result
- do not include explanations
- do not include markdown
"""

            raw_code = llm.invoke(prompt)

            code = extract_python(raw_code)

            print("\nGenerated Code:\n", code)

            try:

                local_vars = {"df": df, "pd": pd}

                exec(code, {}, local_vars)

                result = local_vars.get("result")

                if result is None:
                    raise Exception("No result variable returned")

                print("\nQuery Result:\n", result)

            except Exception as e:

                print("\nExecution Error:", e)

                continue


        # ==================================================
        # SQL DATABASE MODE
        # ==================================================

        elif source_type in ["sqlite", "postgres", "mysql","sql"]:

            dialect = engine.dialect.name

            schema = f"""
Table: {table}
Columns: {df.columns.tolist()}
SQL Dialect: {dialect}
"""

            prompt = f"""
You are an expert SQL developer.

Database schema:
{schema}

User question:
{query}

Rules:
- Write SQL compatible with {dialect}
- Do NOT use unsupported functions
- Return ONLY SQL
"""

            raw_sql = llm.invoke(prompt)

            sql = extract_sql(raw_sql)

            print("\nGenerated SQL:\n", sql)

            try:

                result = pd.read_sql(sql, engine)

                print("\nQuery Result:\n", result)

            except Exception as e:

                print("\nSQL failed. Retrying generation...")

                retry_prompt = f"""
The following SQL failed for {dialect}:

{sql}

Error:
{e}

Rewrite the SQL query correctly for {dialect}.

Schema:
{schema}

User question:
{query}

Return ONLY corrected SQL.
"""

                fixed_sql = extract_sql(llm.invoke(retry_prompt))

                print("\nRetry SQL:\n", fixed_sql)

                try:

                    result = pd.read_sql(fixed_sql, engine)

                    print("\nQuery Result:\n", result)

                except Exception as e2:

                    print("\nSQL Execution Error:", e2)

                    continue
        elif source_type == "mongodb": # ======================================

            

            db = client[db_name]
            collection = db[collection_name]

            # -------------------------
            # Create schema from sample
            # -------------------------
            sample_docs = list(collection.find().limit(5))

            def extract_schema(docs):
                schema = {}
                for doc in docs:
                    for k, v in doc.items():
                        schema[k] = type(v).__name__
                return schema

            schema_dict = extract_schema(sample_docs)

            schema = f"""
        Collection: {collection_name}
        Fields: {list(schema_dict.keys())}
        NOTE: Documents may contain nested JSON.
        """

            # -------------------------
            # LLM Prompt
            # -------------------------
            prompt = f"""
You are an expert MongoDB developer.

STRICT RULES:
- Output ONLY valid JSON
- No explanation
- No comments
- No text before or after JSON
- Use double quotes ONLY
- JSON must be directly parsable with json.loads()

Schema:
{schema}

User question:
{query}

Return ONLY MongoDB aggregation pipeline:
"""

            raw_pipeline = llm.invoke(prompt)
            print("\nRaw LLM Output:\n", raw_pipeline)
            # -------------------------
            # Extract JSON Pipeline
            # -------------------------
            def extract_pipeline(text):
                import json
                import re

                try:
                    return json.loads(text)

                except:
                    pass

                # -------------------------
                # Extract JSON array safely
                # -------------------------
                match = re.search(r"\[.*\]", text, re.DOTALL)

                if not match:
                    raise Exception("No valid JSON pipeline found")

                json_str = match.group()

                # -------------------------
                # Fix common LLM issues
                # -------------------------

                # Remove comments
                json_str = re.sub(r"//.*", "", json_str)

                # Remove trailing commas
                json_str = re.sub(r",\s*]", "]", json_str)
                json_str = re.sub(r",\s*}", "}", json_str)

                # Fix single quotes → double quotes
                json_str = json_str.replace("'", '"')

                try:
                    return json.loads(json_str)

                except Exception as e:
                    print("\nRAW LLM OUTPUT:\n", text)
                    print("\nCLEANED JSON:\n", json_str)
                    raise e
            pipeline = extract_pipeline(raw_pipeline)
            # -------------------------
            # Execute Pipeline
            # -------------------------
            try:

                result_data = list(collection.aggregate(pipeline))

                # Flatten nested JSON for BI
                def flatten_json(y, parent_key='', sep='.'):
                    items = []
                    for k, v in y.items():
                        new_key = f"{parent_key}{sep}{k}" if parent_key else k
                        if isinstance(v, dict):
                            items.extend(flatten_json(v, new_key, sep=sep).items())
                        else:
                            items.append((new_key, v))
                    return dict(items)

                flattened = [flatten_json(doc) for doc in result_data]

                result = pd.DataFrame(flattened)

                print("\nQuery Result:\n", result)

            except Exception as e:

                print("\nPipeline failed. Retrying generation...")

                retry_prompt = f"""
        The following MongoDB pipeline failed:

        {pipeline}

        Error:
        {e}

        Rewrite the pipeline correctly.

        Schema:
        {schema}

        User question:
        {query}

        Rules:
        - Must be valid MongoDB aggregation pipeline
        - Handle nested fields properly (dot notation)
        - Return ONLY JSON
        """

                fixed_pipeline = extract_pipeline(llm.invoke(retry_prompt))

                print("\nRetry Pipeline:\n", fixed_pipeline)

                try:

                    result_data = list(collection.aggregate(fixed_pipeline))

                    flattened = [flatten_json(doc) for doc in result_data]

                    result = pd.DataFrame(flattened)

                    print("\nQuery Result:\n", result)

                except Exception as e2:

                    print("\nMongoDB Execution Error:", e2)
                    continue


        # ==================================================
        # VISUALIZATION INTELLIGENCE AGENT
        # ==================================================

        try:

            auto_visualize(result, query)

        except Exception as viz_error:

            print("\nVisualization Error:", viz_error)
