import pandas as pd
import json
import plotly.io as pio  # <-- Import plotly.io for image export
from langchain_experimental.agents.agent_toolkits import create_pandas_dataframe_agent
from langchain_core.tools import tool
from config import llm, json_llm  # Import our initialized LLMs

def get_agent_tools(df: pd.DataFrame):
    """
    This function creates and returns the list of specialized tools 
    that our agent will use. It takes the DataFrame as an argument
    so the tools can close over it.
    """
    
    @tool
    def data_analyst_tool(query: str) -> str:
        """
        A tool that acts as a Data Analyst. 
        It takes a user's natural language query.
        It uses a dedicated pandas DataFrame agent to answer the query.
        Use this for any questions about data, calculations, statistics, or finding information.
        
        Args:
            query (str): The natural language query.
        
        Returns:
            str: The agent's natural language answer.
        """
        print(f"\n--- Calling DataAnalystAgent ---")
        print(f"Query: {query}")
        
        # This agent is specialized for pandas DataFrames.
        pandas_agent_executor = create_pandas_dataframe_agent(
            llm,
            df,  # <-- The DataFrame is available here
            agent_type="zero-shot-react-description",
            verbose=True,
            allow_dangerous_code=True # Note: Be cautious with this in production
        )
        
        try:
            response = pandas_agent_executor.invoke({"input": query})
            return response.get("output", "Could not get an answer.")
        except Exception as e:
            print(f"Error in DataAnalystAgent: {e}")
            return f"An error occurred: {e}"

    @tool
    def chart_generator_tool(query: str) -> str:
        """
        A tool that acts as a Chart Generator.
        It takes a user's query asking for a chart.
        It uses an LLM to generate a Plotly JSON schema.
        It then saves the chart as a static PNG image file.
        
        Args:
            query (str): The natural language query for the chart.
        
        Returns:
            str: A confirmation message with the filename of the saved chart.
        """
        print(f"\n--- Calling ChartGeneratorAgent ---")
        print(f"Query: {query}")

        # Create a prompt to guide the LLM
        prompt = f"""
        You are a data visualization expert. Based on the user's query and the following
        DataFrame sample, generate a single, valid Plotly JSON object for a chart.
        
        DataFrame Sample (first 5 rows):
        {df.head().to_string()}  # <-- The DataFrame is available here
        
        User Query:
        "{query}"
        
        Return ONLY the valid Plotly JSON object. Do not include any other text,
        markdown "json" backticks, or explanations.
        The JSON object must have top-level "data" (a list of traces) and "layout" (an object) keys.
        """
        
        try:
            # Use the specialized JSON-output LLM
            response = json_llm.invoke(prompt)
            
            # Load the JSON string from the response
            plotly_json = json.loads(response)
                
            # --- START: MODIFIED CODE ---
            # We will no longer save the JSON or HTML.
            # Instead, we'll convert the JSON to a Figure and save as PNG.
            
            # Convert the Plotly JSON back into a Plotly Figure object
            # We use json.dumps to turn the Python dict back into a string for from_json
            fig = pio.from_json(json.dumps(plotly_json))
            
            # Save the figure as a static PNG image
            viewer_filename = "chart.png"
            fig.write_image(viewer_filename)
                
            return f"Successfully generated chart and saved to '{viewer_filename}'. Open '{viewer_filename}' to see the chart."
            # --- END: MODIFIED CODE ---
            
        except Exception as e:
            print(f"Error in ChartGeneratorAgent: {e}")
            return f"An error occurred while generating the chart: {e}"
    
    # Return the list of tools
    return [data_analyst_tool, chart_generator_tool]

