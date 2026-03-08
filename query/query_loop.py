from utils.code_extractor import extract_sql, extract_python
from langchain_ollama import OllamaLLM
import pandas as pd
from utils.code_extractor import extract_python
from query.auto_visualize import auto_visualize

def query_loop(state):

    df = state["_df"]
    engine = state.get("engine")
    table = state.get("table_name")

    source_type = state["source_type"]

    llm = OllamaLLM(model="mistral")

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

        else:

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


        # ==================================================
        # VISUALIZATION INTELLIGENCE AGENT
        # ==================================================

        try:

            auto_visualize(result, query)

        except Exception as viz_error:

            print("\nVisualization Error:", viz_error)
