from config import LLM_MODEL
from langchain_ollama import OllamaLLM


def insight_agent(state):

    with open("dashboard/dataset_profile.txt") as f:
        profile = f.read()

    llm = OllamaLLM(model=LLM_MODEL)

    prompt = f"""
You are a senior data analyst.

Dataset profile:
{profile}

Generate:
- 5 business insights
- 2 risks
- 2 opportunities
"""

    insights = llm.invoke(prompt)

    with open("dashboard/insights.txt","w") as f:
        f.write(insights)

    print("Insights generated")

    return state


