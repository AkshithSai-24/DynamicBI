
from langchain_ollama import OllamaLLM
from config import LLM_MODEL

def anomaly_explanation_agent(state):

    anomalies = state["anomalies"]

    if anomalies.empty:
        return state

    llm = OllamaLLM(model="mistral")

    sample = anomalies.head(10).to_string()

    prompt = f"""
You are a data quality expert.

Here are anomaly rows:

{sample}

Explain:
1. Why these anomalies occur
2. Business meaning
3. How to fix them
"""

    report = llm.invoke(prompt)

    with open("dashboard/anomaly_report.txt","w") as f:
        f.write(report)

    print("Anomaly explanation generated")

    return state