import streamlit as st
import pandas as pd
import tempfile
import os


from main_full import build_graph   


st.set_page_config(
    page_title="Dynamic BI with Agents",
    layout="wide"
)

st.title("📊 Dynamic BI – Agentic CSV Analyzer")

st.markdown(
    """
    Upload a **CSV file**, ask a **natural language question**,  
    and the agent system will generate insights and charts automatically.
    """
)


# CSV Upload

uploaded_file = st.file_uploader(
    "Upload CSV file",
    type=["csv"]
)

# Query Input

query = st.text_input(
    "Enter your query",
    placeholder="e.g. Show highest and lowest sales by category"
)

# Run Button
run_btn = st.button("Run Analysis")


# Execution
if run_btn:
    if uploaded_file is None:
        st.error("Please upload a CSV file.")
    elif not query.strip():
        st.error("Please enter a query.")
    else:
        with st.spinner("Running agent pipeline..."):
            try:
                # Save CSV temporarily
                with tempfile.NamedTemporaryFile(
                    delete=False, suffix=".csv"
                ) as tmp:
                    tmp.write(uploaded_file.getbuffer())
                    csv_path = tmp.name

                # Run your agentic pipeline
                png_path, description = build_graph(
                    csv_path=csv_path,
                    user_query=query
                )

                # Results Layout
                col1, col2 = st.columns([2, 1])

                with col1:
                    st.subheader("📈 Generated Chart")
                    if os.path.exists(png_path):
                        st.image(png_path, use_container_width=True)
                    else:
                        st.warning("Chart image not found.")

                with col2:
                    st.subheader("📝 Description")
                    st.write(description)

            except Exception as e:
                st.error("Error during analysis")
                st.exception(e)
