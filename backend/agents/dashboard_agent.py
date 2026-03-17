import os
import pandas as pd
def dashboard_agent(state):

    charts = os.listdir("dashboard")

    chart_html = ""

    for c in charts:

        if c.endswith(".png"):

            chart_html += f"""
            <div class="chart-card">
                <img src="{c}">
            </div>
            """

    kpi_html = ""

    if os.path.exists("dashboard/kpis.csv"):

        kpis = pd.read_csv("dashboard/kpis.csv")

        for _, row in kpis.iterrows():

            kpi_html += f"""
            <div class="kpi-card">
                <div class="kpi-title">{row['Metric']}</div>
                <div class="kpi-value">{round(row['Value'],2)}</div>
            </div>
            """

    insights = ""
    anomaly_report = ""

    if os.path.exists("dashboard/insights.txt"):
        insights = open("dashboard/insights.txt").read()

    if os.path.exists("dashboard/anomaly_report.txt"):
        anomaly_report = open("dashboard/anomaly_report.txt").read()

    html = f"""
<html>

<head>

<title>AI BI Dashboard</title>

<style>

body {{
    font-family: Arial, sans-serif;
    background-color: #f4f6f9;
    margin: 0;
    padding: 0;
}}

.header {{
    background: #2c3e50;
    color: white;
    padding: 20px;
    text-align: center;
}}

.container {{
    padding: 20px;
}}

.section {{
    margin-top: 30px;
}}

.kpi-grid {{
    display: flex;
    flex-wrap: wrap;
}}

.kpi-card {{
    background: white;
    padding: 20px;
    margin: 10px;
    border-radius: 10px;
    width: 180px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    text-align: center;
}}

.kpi-title {{
    font-size: 14px;
    color: #777;
}}

.kpi-value {{
    font-size: 26px;
    font-weight: bold;
}}

.chart-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
}}

.chart-card {{
    background: white;
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}}

.chart-card img {{
    width: 100%;
}}

.text-panel {{
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    white-space: pre-wrap;
}}

</style>

</head>

<body>

<div class="header">
<h1>AI BI Autonomous Dashboard</h1>
</div>

<div class="container">

<div class="section">

<h2>Key Performance Indicators</h2>

<div class="kpi-grid">

{kpi_html}

</div>

</div>

<div class="section">

<h2>Business Insights</h2>

<div class="text-panel">
{insights}
</div>

</div>

<div class="section">

<h2>Anomaly Analysis</h2>

<div class="text-panel">
{anomaly_report}
</div>

</div>

<div class="section">

<h2>Visual Analytics</h2>

<div class="chart-grid">

{chart_html}

</div>

</div>

</div>

</body>

</html>
"""

    with open("dashboard/dashboard.html","w") as f:

        f.write(html)

    print("\nDashboard generated → dashboard/dashboard.html")

    return state


