
from graph.build_graph import build_graph
from query.query_loop import query_loop
from query.conversational_bi_agent import conversational_bi_agent
from config import LLM_MODEL
import warnings
import time
import os
import shutil

warnings.filterwarnings("ignore")

if __name__ == "__main__":
    shutil.rmtree("dashboard") if os.path.exists("dashboard") else None
    source_path = input("Enter data source (CSV/Excel/DB connection): ")
    print(f"Using LLM model: {LLM_MODEL}")
    start_time = time.perf_counter()

    app = build_graph()

    state = app.invoke({
        "source_path": source_path
    })

    print("Dashboard ready.")
    end_time = time.perf_counter()
    print(f"Total processing time: {end_time - start_time:.4f} seconds")

    '''while True:

        print("1 - Data Query")
        print("2 - BI Chat")
        print("3 - Exit")

        choice = input("Enter choice: ")

        if choice == "1":
            query_loop(state)

        elif choice == "2":
            conversational_bi_agent()

        else:
            break'''


