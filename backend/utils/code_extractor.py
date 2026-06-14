"""
code_extractor.py — DynamicBI
==============================
Robust extraction of executable code blocks from LLM text responses.
Handles: fenced ```python blocks, bare code, inline snippets, and mixed prose.
"""

import re


def extract_python(text: str) -> str:
    """
    Extract the first executable Python block from an LLM response.

    Priority order:
      1. ```python ... ``` fenced block
      2. ``` ... ``` fenced block (language-agnostic)
      3. Any line that looks like Python code (assignment, df., result, etc.)
      4. Full text as last resort (LLM may have returned bare code)
    """
    text = text.strip()

    # 1. Explicit ```python block
    m = re.search(r"```python\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # 2. Any fenced block
    m = re.search(r"```(?:\w*)\s*\n(.*?)```", text, re.DOTALL)
    if m:
        block = m.group(1).strip()
        if block:
            return block

    # 3. Heuristic line-by-line extraction
    code_lines = []
    for line in text.splitlines():
        stripped = line.rstrip()
        if not stripped:
            # keep blank lines that are inside a code block
            if code_lines:
                code_lines.append("")
            continue
        # Indicators that this line is code
        is_code = (
            re.match(r"^\s*(import |from |#)", stripped)           # imports / comments
            or re.match(r"^\s*\w+\s*=", stripped)                  # assignment
            or "df[" in stripped or "df." in stripped              # DataFrame ops
            or stripped.lstrip().startswith("result")              # result = ...
            or re.match(r"^\s*(if |for |while |try:|except|with |def |class |return)", stripped)
            or re.match(r"^\s*(pd\.|np\.|datetime)", stripped)     # library calls
            or stripped.lstrip().startswith("print(")
        )
        if is_code:
            code_lines.append(stripped)

    if code_lines:
        # Strip trailing blank lines
        while code_lines and not code_lines[-1].strip():
            code_lines.pop()
        return "\n".join(code_lines)

    # 4. Fall back to the full text (LLM returned bare code)
    return text


def extract_sql(text: str) -> str:
    """
    Extract the first SQL query from an LLM response.

    Priority order:
      1. ```sql ... ``` fenced block
      2. ``` ... ``` fenced block
      3. SELECT … ; pattern anywhere in the text
      4. Full text as last resort
    """
    text = text.strip()

    # 1. Explicit ```sql block
    m = re.search(r"```sql\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # 2. Any fenced block
    m = re.search(r"```(?:\w*)\s*\n(.*?)```", text, re.DOTALL)
    if m:
        block = m.group(1).strip()
        if block.upper().lstrip().startswith("SELECT"):
            return block

    # 3. SELECT … ; pattern
    m = re.search(r"(SELECT\b.*?;)", text, re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip()

    # 4. SELECT without semicolon (grab to end)
    m = re.search(r"(SELECT\b.*)", text, re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip()

    return text.strip()
