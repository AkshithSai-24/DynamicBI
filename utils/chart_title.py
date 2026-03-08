from langchain_ollama import OllamaLLM
def generate_chart_title(description):

    llm = OllamaLLM(model="mistral")

    prompt = f"""
You are a data visualization expert.

Generate a short, clear, professional chart title.

Description:
{description}

Return ONLY the title.
"""

    try:
        title = llm.invoke(prompt).strip()
        return title
    except:
        return description.replace("_"," ").title()