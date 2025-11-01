import pandas as pd
from agent import create_orchestrator_agent

def main():
    """
    Main function to load data, create the agent, and start the chat loop.
    """
    # Load the CSV data
    csv_file_path = "test.csv"
    try:
        df = pd.read_csv(csv_file_path)
    except FileNotFoundError:
        print(f"Error: The file '{csv_file_path}' was not found.")
        print("Please make sure 'sales_data.csv' is in the same directory.")
        return
    except Exception as e:
        print(f"Error loading CSV file: {e}")
        return

    # Create the agent
    orchestrator = create_orchestrator_agent(df)
    
    print("--- CSV Agent is Ready ---")
    print("Ask me questions about your data (e.g., 'What are the total sales?').")
    print("Type 'exit' to quit.")

    # Start the chat loop
    while True:
        try:
            user_query = input("\nUser: ")
            if user_query.lower() == 'exit':
                print("Agent: Goodbye!")
                break
            
            if user_query:
                # Invoke the agent with the user's query
                response = orchestrator.invoke({"input": user_query})
                print(f"\nAgent: {response.get('output', 'I am not sure how to respond.')}")
        
        except KeyboardInterrupt:
            print("\nAgent: Goodbye!")
            break
        except Exception as e:
            print(f"An error occurred in the agent loop: {e}")

if __name__ == "__main__":
    main()

