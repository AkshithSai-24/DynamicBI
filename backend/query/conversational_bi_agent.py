import os
import pandas as pd
from config import get_llm


def conversational_bi_agent():

    llm = get_llm()

    print("\nAI BI Chat ready. Ask analytical questions (type exit).")

    while True:

        question = input("\nBI Question: ")

        if question.lower() == "exit":
            break

        context = ""

        if os.path.exists("dashboard/kpis.csv"):
            context += "\nKPIs:\n"
            context += pd.read_csv("dashboard/kpis.csv").to_string()

        if os.path.exists("dashboard/insights.txt"):
            context += "\nInsights:\n"
            context += open("dashboard/insights.txt").read()

        if os.path.exists("dashboard/anomaly_report.txt"):
            context += "\nAnomaly Report:\n"
            context += open("dashboard/anomaly_report.txt").read()

        if os.path.exists("dashboard/dataset_profile.txt"):
            context += "\nDataset Profile:\n"
            context += open("dashboard/dataset_profile.txt").read()

        prompt = f"""
You are an expert Business Intelligence analyst.

Context about the dataset:
{context}

User question:
{question}

Provide a clear business answer.
Explain reasoning briefly.
"""

        resp = llm.invoke(prompt)
        if hasattr(resp, "content"):
            response = resp.content.strip()
        elif hasattr(resp, "text"):
            response = resp.text.strip()
        else:
            response = str(resp).strip()

        print("\nAI BI Answer:\n")
        print(response)
