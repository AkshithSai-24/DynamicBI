"""
main.py — CLI entry point for DynamicBI PowerBI
Run: python main.py
"""
import warnings
import time
import os
import shutil

warnings.filterwarnings("ignore")


if __name__ == "__main__":
    from graph.build_graph import build_graph

    shutil.rmtree("dashboard", ignore_errors=True)

    source_path = input("Enter data source (CSV / Excel path or DB connection string): ").strip()

    start = time.perf_counter()

    app   = build_graph()
    state = app.invoke({"source_path": source_path})

    elapsed = time.perf_counter() - start
    print(f"\n✅ Dashboard ready in {elapsed:.1f}s")
    print("   Schema saved → dashboard/dashboard_schema.json")
    print("   Insights    → dashboard/insights.txt")
    print("   KPIs        → dashboard/kpis.csv")
