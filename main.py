import pandas as pd
from agent import create_orchestrator_agent

def main():
    print("--- CSV Agent is Ready ---")
    print("Ask me questions about your data (e.g., 'What are the total sales?').")
    print("Type 'exit' to quit.\n")

    # Load your test CSV
    df = pd.read_csv("test2.csv")

    orchestrator = create_orchestrator_agent(df, verbose=False)

    while True:
        user_query = input("User: ")
        if user_query.strip().lower() in ["exit", "quit"]:
            break
        response = orchestrator.invoke({"input": user_query})
        print("\nAgent:", response["output"], "\n")

if __name__ == "__main__":
    main()
