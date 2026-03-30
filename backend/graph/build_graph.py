
from langgraph.graph import StateGraph, END

from state import AgentState

from agents.load_data_agent import load_data_agent
from agents.data_cleaning_agent import data_cleaning_agent
from agents.kpi_agent import kpi_agent
from agents.visualization_agent import dataset_visualization_agent
from agents.anomaly_detection_agent import anomaly_detection_agent
from agents.anomaly_visualization_agent import anomaly_visualization_agent
from agents.anomaly_explanation_agent import anomaly_explanation_agent
from agents.forecasting_agent import forecasting_agent
from agents.rag_profile_agent import rag_profile_agent
from agents.insight_agent import insight_agent
from agents.dashboard_agent import dashboard_agent
import warnings
warnings.filterwarnings("ignore")

def build_graph():

    graph = StateGraph(AgentState)

    # Data Engineering
    graph.add_node("load_data", load_data_agent)

    # Data Quality
    graph.add_node("clean_data", data_cleaning_agent)

    # BI Analyst
    graph.add_node("kpi", kpi_agent)
    graph.add_node("visualize", dataset_visualization_agent)

    # Data Scientist
    graph.add_node("anomaly_detect", anomaly_detection_agent)
    graph.add_node("anomaly_visual", anomaly_visualization_agent)
    graph.add_node("anomaly_explain", anomaly_explanation_agent)

    # Dataset Understanding
    graph.add_node("rag_profile", rag_profile_agent)

    # Insight generation
    graph.add_node("insights", insight_agent)
    graph.add_node("forecast", forecasting_agent)
    # Dashboard generation


    graph.set_entry_point("load_data")

    graph.add_edge("load_data","clean_data")
    graph.add_edge("clean_data","kpi")
    graph.add_edge("kpi","visualize")
    graph.add_edge("visualize","anomaly_detect")
    graph.add_edge("anomaly_detect","forecast")
    graph.add_edge("forecast","anomaly_visual")
    #graph.add_edge("anomaly_detect","anomaly_visual")
    graph.add_edge("anomaly_visual","anomaly_explain")
    graph.add_edge("anomaly_explain","rag_profile")
    graph.add_edge("rag_profile","insights")
    graph.add_edge("insights", END)


    return graph.compile()


