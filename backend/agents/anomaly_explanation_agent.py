import os
from backend.config import get_llm


def anomaly_explanation_agent(state):

    anomalies = state["anomalies"]

    if anomalies.empty:
        return state

    llm = get_llm()

    sample = anomalies.head(10).to_string()

    prompt = f"""
You are a data quality expert.

Here are anomaly rows:

{sample}

Task (output MARKDOWN):
Provide three sections with headings and short bullet points:

### 1. Why these anomalies occur
- Brief root-cause bullets

### 2. Business meaning
- One-line business interpretation bullets

### 3. How to fix them
- Actionable fixes in bullets

Return MARKDOWN only.
"""

    response = llm.invoke(prompt)

    os.makedirs("dashboard", exist_ok=True)

    if hasattr(response, "content"):
        raw = response.content.strip()
    elif hasattr(response, "text"):
        raw = response.text.strip()
    else:
        raw = str(response).strip()

    # If response already contains markdown headings, use as-is
    if any(h in raw for h in ['### 1', '### 2', '### 3', '#', '- ']):
        md = raw
    else:
        # Convert plain text into markdown sections heuristically
        parts = raw.split('\n\n')
        md_lines = []
        # take up to 3 sections
        headers = ['### 1. Why these anomalies occur', '### 2. Business meaning', '### 3. How to fix them']
        for i in range(3):
            sec = parts[i] if i < len(parts) else ''
            lines = [l.strip() for l in sec.splitlines() if l.strip()]
            if not lines:
                md_lines.append(headers[i])
                md_lines.append('- No details available')
            else:
                md_lines.append(headers[i])
                for ln in lines[:5]:
                    md_lines.append(f"- {ln}")
            md_lines.append('')
        md = '\n'.join(md_lines).strip()

    with open('dashboard/anomaly_report.txt', 'w') as f:
        f.write(md)

    print("Anomaly explanation generated")

    return state
