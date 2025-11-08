import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAI


load_dotenv()
if "GOOGLE_API_KEY" not in os.environ:
    raise EnvironmentError("GOOGLE_API_KEY not found in .env file.")


llm = GoogleGenerativeAI(temperature=0, model="models/gemini-2.0-flash")


json_llm = llm.bind(
    generation_config={"response_mime_type": "application/json"}
)

