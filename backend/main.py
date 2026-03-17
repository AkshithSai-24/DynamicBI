
from graph.build_graph import build_graph
from query.query_loop import query_loop
from query.conversational_bi_agent import conversational_bi_agent
from config import LLM_MODEL
import warnings
warnings.filterwarnings("ignore")

if __name__ == "__main__":

    source_path = input("Enter data source (CSV/Excel/DB connection): ")
    print(f"Using LLM model: {LLM_MODEL}")
    app = build_graph()

    state = app.invoke({
        "source_path": source_path
    })

    print("Dashboard ready.")

    while True:

        print("1 - Data Query")
        print("2 - BI Chat")
        print("3 - Exit")

        choice = input("Enter choice: ")

        if choice == "1":
            query_loop(state)

        elif choice == "2":
            conversational_bi_agent()

        else:
            break


