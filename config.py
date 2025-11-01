import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAI

# --- 1. Load Environment Variables & API Key ---
load_dotenv()
if "GOOGLE_API_KEY" not in os.environ:
    raise EnvironmentError("GOOGLE_API_KEY not found in .env file.")

# --- 2. Initialize Gemini LLM ---
# We will use one model for general reasoning and one for structured JSON output
llm = GoogleGenerativeAI(temperature=0, model="models/gemini-2.0-flash")

# This is the corrected way to request JSON output from Gemini
json_llm = llm.bind(
    generation_config={"response_mime_type": "application/json"}
)

