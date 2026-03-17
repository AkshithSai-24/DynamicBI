
import re
def extract_python(text):

    code_blocks = re.findall(r"```python(.*?)```", text, re.DOTALL | re.IGNORECASE)

    if code_blocks:
        return code_blocks[0].strip()

    lines = text.split("\n")

    code_lines = []

    for line in lines:

        line = line.strip()

        if (
            line.startswith("result")
            or "df." in line
            or "=" in line
            or "groupby" in line
        ):
            code_lines.append(line)

    return "\n".join(code_lines)


def extract_sql(text):

    sql_blocks = re.findall(r"```sql(.*?)```", text, re.DOTALL | re.IGNORECASE)

    if sql_blocks:
        return sql_blocks[0].strip()

    select_match = re.search(r"(SELECT .*?;)", text, re.IGNORECASE | re.DOTALL)

    if select_match:
        return select_match.group(1)

    return text.strip()


