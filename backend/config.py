"""
config.py — Central configuration for DynamicBI backend.
"""

from langchain_openrouter import ChatOpenRouter
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from dotenv import load_dotenv
import os

load_dotenv()

# ── Dashboard folder ────────────────────────────────────────────────────────────
DASHBOARD_FOLDER = "dashboard"
UPLOAD_FOLDER    = "uploads"

# ── LLM ─────────────────────────────────────────────────────────────────────
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
LLM_MODEL      = os.getenv("LLM_MODEL", "mistralai/mistral-medium-3.5-128b")

def get_llm():
    """Return the configured LLM instance. All agents must call this."""
    '''base_llm = ChatOpenRouter(
        model="openai/gpt-oss-120b:free",
        temperature=0.3,
    )'''


    base_llm =  ChatNVIDIA(
        model=LLM_MODEL,
        api_key=NVIDIA_API_KEY,
        temperature=0.2,
    )
    return base_llm
    





if __name__ == "__main__":
    model = get_llm()
    response = model.invoke("What is generative AI?")
    print(response.content)
