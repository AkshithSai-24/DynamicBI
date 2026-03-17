import pandas as pd

def rag_profile_agent(state):

    df = state["_df"]

    profile = []

    profile.append("DATASET OVERVIEW")
    profile.append(str(df.shape))

    profile.append("\nCOLUMNS\n")

    for col in df.columns:

        profile.append(f"{col} | type={df[col].dtype} | unique={df[col].nunique()}")

    profile.append("\nSTATISTICS\n")
    profile.append(df.describe().to_string())

    text = "\n".join(profile)

    with open("dashboard/dataset_profile.txt","w") as f:
        f.write(text)

    print("Dataset profile created")

    return state
