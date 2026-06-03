from config import get_llm


def generate_chart_title(description):

    llm = get_llm()

    prompt = f"""
You are a data visualization expert.

Generate a short, clear, professional chart title.

Description:
{description}

Return ONLY the title.
"""

    try:
        resp = llm.invoke(prompt)
        if hasattr(resp, "content"):
            title = resp.content.strip()
        elif hasattr(resp, "text"):
            title = resp.text.strip()
        else:
            title = str(resp).strip()
        return title
    except:
        return description.replace("_"," ").title()
