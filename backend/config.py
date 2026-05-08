from langchain_ollama import OllamaLLM
from langchain_google_genai import GoogleGenerativeAI
from langchain_openrouter import ChatOpenRouter

from dotenv import load_dotenv
load_dotenv()

'''LLM = OllamaLLM(model="mistral")'''

# ── Other settings ─────────────────────────────────────────────────────────────
DASHBOARD_FOLDER = "dashboard"


def get_llm():
    """Return the configured LLM instance. All agents must call this."""
    #LLM = GoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
    base_llm = ChatOpenRouter(
        model="openai/gpt-oss-20b:free",
        temperature=0.8,
    )

    return base_llm
#"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
if __name__ == "__main__":

    from langchain_openrouter import ChatOpenRouter

    model = ChatOpenRouter(
        model="openrouter/free",
        temperature=0.8,
    )

    # Example usage
    response = model.invoke("what is  genai ?")
    print(response.content)
    print(response)
    print(response.text)

