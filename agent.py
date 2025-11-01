import pandas as pd
from langchain_core.prompts import PromptTemplate
from langchain.agents import create_react_agent, AgentExecutor
from config import llm  # Import the main LLM
from tools import get_agent_tools  # Import our tool factory

def create_orchestrator_agent(df: pd.DataFrame):
    """
    Creates the main orchestrator agent.
    This agent has access to the specialized tools and decides which one to use.
    """
    
    # Get the list of tools, passing in the DataFrame
    tools = get_agent_tools(df)
    
    # This is the "brain" of our agent, defining its persona and logic
    prompt_template = """
    You are a helpful "Orchestrator" agent. Your job is to assist a user with
    their data analysis requests. You have access to a pandas DataFrame and two specialized tools.
    
    The user is interacting with you in a chat. You must respond conversationally.

    You have access to the following tools:

    {tools}

    Use the following format for your response:

    Thought: [Your reasoning about the user's request and which tool to use]
    Action: [The name of the one tool to use from this list: {tool_names}]
    Action Input: [The string query or input for the tool]
    Observation: [The result from the tool]

    ... (this Thought/Action/Action Input/Observation sequence can repeat N times)

    Thought: I now have enough information to answer the user's request.
    Final Answer: [Your final conversational response to the user]

    **Workflow Guidelines:**
    - If it's a data question (calculations, lookups, stats), use `data_analyst_tool`.
    - If it's *only* a chart request (plot, graph, chart), use `chart_generator_tool`.
    - If the user asks for *both* data AND a chart (e.g., "What are the total sales and show me a bar chart?"),
      you MUST call the tools sequentially. 
      First, call `data_analyst_tool` to get the text-based answer.
      Then, in a new step, call `chart_generator_tool` to create the chart.
      Finally, combine both results in your `Final Answer`.
    - If you don't need a tool (e.g., "Hello"), just respond directly with `Final Answer:`.

    Begin!

    User Input: {input}
    Thought:
    {agent_scratchpad}
    """
    
    prompt = PromptTemplate.from_template(prompt_template)
    
    # This creates the ReAct (Reasoning and Acting) agent
    agent = create_react_agent(llm, tools, prompt)
    
    # This creates the executor that runs the agent in a loop
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True # Try to gracefully handle LLM output errors
    )
    
    return agent_executor

