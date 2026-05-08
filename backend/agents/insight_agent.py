import json
import re
from config import get_llm


def _clean_table_text(text: str) -> str:
    """Remove markdown-style table borders and convert pipe rows to clean bullets."""
    lines = text.splitlines()
    out_lines = []
    for ln in lines:
        # skip divider lines like |---|---|
        if re.match(r"^\s*\|?\s*-{2,}", ln):
            continue
        # lines that are table rows starting with |
        if '|' in ln:
            parts = [p.strip() for p in ln.strip().strip('|').split('|')]
            # ignore short separator rows
            if len(parts) <= 1:
                continue
            out_lines.append(' | '.join([p for p in parts if p]))
        else:
            out_lines.append(ln)
    cleaned = '\n'.join([l for l in out_lines if l.strip()])
    # replace multiple blank lines with single
    cleaned = re.sub(r"\n{2,}", "\n\n", cleaned)
    return cleaned


def insight_agent(state):

    with open("dashboard/dataset_profile.txt") as f:
        profile = f.read()

    llm = get_llm()

    prompt = f"""
You are a senior data analyst.

Dataset profile:
{profile}

Task:
Produce up to five concise business insights in MARKDOWN. For each insight include:
- A bolded short title
- One-sentence explanation
- A short 'Derivation:' line
- A short 'Impact:' line

Example (Markdown):

**1. High-value customers**
- Customers 50+ spend more on average.
- Derivation: Mean Total_Amount by age group.
- Impact: Target premium offers.

If you cannot output Markdown, return plain numbered short sentences.
"""

    resp = llm.invoke(prompt)
    if hasattr(resp, "content"):
        raw = resp.content.strip()
    elif hasattr(resp, "text"):
        raw = resp.text.strip()
    else:
        raw = str(resp).strip()

    # If response already looks like Markdown, use as-is
    if any(tok in raw for tok in ['**', '#', '- Derivation', 'Derivation:', 'Impact:']):
        md = raw
    else:
        # Try to parse JSON that contains insights and convert to Markdown
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and data.get('insights'):
                arr = data.get('insights')
            elif isinstance(data, list):
                arr = data
            elif isinstance(data, dict):
                arr = [data]
            else:
                arr = []
            lines = []
            for i, item in enumerate(arr[:5], start=1):
                title = item.get('title') or item.get('insight') or f'Insight {i}'
                detail = item.get('detail') or item.get('description') or ''
                deriv = item.get('derivation') or item.get('how') or ''
                impact = item.get('impact') or item.get('recommendation') or ''
                lines.append(f"**{i}. {title}**")
                if detail:
                    lines.append(f"- {detail}")
                if deriv:
                    lines.append(f"- Derivation: {deriv}")
                if impact:
                    lines.append(f"- Impact: {impact}")
                lines.append("")
            md = '\n'.join(lines).strip()
        except Exception:
            # Fallback: clean table-like text and convert to simple Markdown bullets
            cleaned = _clean_table_text(raw)
            lines = [ln.strip().lstrip('|').strip() for ln in cleaned.splitlines() if ln.strip()]
            bullets = []
            idx = 1
            for ln in lines:
                if re.search(r"rank|insight|how it was derived|potential business impact", ln, re.I):
                    continue
                s = ' '.join(ln.split())
                bullets.append(f"**{idx}. {s}**")
                idx += 1
            md = '\n\n'.join(bullets[:5])

    import os
    os.makedirs('dashboard', exist_ok=True)
    with open('dashboard/insights.txt', 'w') as f:
        f.write(md)

    print("Insights generated")

    return state
