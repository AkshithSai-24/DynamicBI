import os
from crewai import Agent, Task, Crew, LLM,Process
from tools import dataAnalyst_Tool, pandas_dataAnalysis_Tool
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
import pandas as pd
load_dotenv()
key = os.getenv("GOOGLE_API_KEY")
#llm = LLM(model="gemini/gemini-2.0-flash", api_key=key)
llm = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0, google_api_key=key)

pandas_analysis_agent = Agent(
    role="Pandas Data Analysis Agent",
    goal="Be the most friendly and helpful "
        "Pandas Data Analysist in your team",
    backstory=(
        "I'm the team's 'Data Strategist.' In my early days, I saw too many "
        "brilliant analyses fail because of a messy, improvised plan. "
        "I realized my true passion wasn't just *doing* the analysis, "
        "but *designing* it. I specialize in looking at any complex "
        "question and, like an architect, drawing up the perfect 'blueprint'—"
        "a clean, step-by-step JSON plan. I give this plan to my teammates, "
        "making their job easy, fast, and error-free. My goal is to be the "
        "most helpful part of the process, setting everyone up for a win!"
    ),allow_delegation=False,
	verbose=True,llm = llm,
    tools=[pandas_dataAnalysis_Tool]
)

data_analyst_agent = Agent(
    role="Data Analysist Agent",
    goal="Be the most accurate and efficient Data Analysist in your team",
    backstory=(
        "I'm the team's 'Data Specialist.' My journey began when I "
        "realized that even the most well-laid plans can fall apart "
        "without precise execution. I found my calling in taking "
        "detailed JSON plans and transforming them into accurate, "
        "ready-to-use data outputs. I pride myself on my attention "
        "to detail and my ability to deliver exactly what my team needs, "
        "when they need it. My goal is to be the backbone of our data "
        "operations, ensuring every analysis is spot-on and reliable."
    ),allow_delegation=False,   
    verbose=True,llm = llm,
    tools=[dataAnalyst_Tool]
)


pandas_analysis_task = Task(
  description=(
    "Analyze the following data analysis request and create a step-by-step plan. "
    "The user wants to know: **'{query}'**. "
    "Given the first 5 columns of dataframe: {columns}, "
    "Your job is to use your Pandas Data Analyses Tool to generate the "
    "JSON plan required to answer this question. "
    "Focus *only* on generating the plan."
  ),
  expected_output=(
    "A JSON string containing a list of operations "
    "(e.g., 'groupby_aggregate', 'sort_by') that details the "
    "exact steps needed to perform the analysis."
  ),
  agent=pandas_analysis_agent ,
  inputs={"df": lambda: inputs["df"], "query": lambda: inputs["query"]}
)

data_analyst_task = Task(
  description=(
    "Take the JSON plan created by the Pandas Data Analysis Agent "
    "and execute it to produce the final data analysis results. "
    "You will receive a dataframe and a JSON plan outlining the "
    "steps to follow. Your job is to use your Data Analyses Tool "
    "to carry out these steps accurately and efficiently."
    "The 'df' is available in the inputs. "
    "The 'json_plan' is the output from the 'Pandas Data Analysis Agent' task."
  ),expected_output=(
    "The final data analysis results as in Json Format, "
    "ready for presentation or further visualization."
  ),agent=data_analyst_agent,
  inputs={"df": lambda: inputs["df"]}
)

crew = Crew(
    agents=[pandas_analysis_agent,data_analyst_agent],
    tools=[pandas_dataAnalysis_Tool, dataAnalyst_Tool],
    llm=llm,
    verbose=True,
	memory=True,process=Process.sequential)
df = pd.read_csv("test.csv")
inputs = {
    "query": "what are the totAl sales amount by city and Salesperson",
    "df": df
}
result = crew.kickoff(inputs=inputs)


print(result.raw)

