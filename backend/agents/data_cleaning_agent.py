
import pandas as pd
import numpy as np
import os

def data_cleaning_agent(state):

    df = state["_df"]
    # ============================================
    # GLOBAL NUMERIC SANITIZATION
    # ============================================

    numeric_cols = df.select_dtypes(include=np.number).columns

    df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan)

    # clip extremely large numbers
    df[numeric_cols] = df[numeric_cols].clip(-1e12, 1e12)

    # drop constant columns early to avoid downstream warnings/issues
    variances = df[numeric_cols].var()
    const_cols = variances[variances == 0].index.tolist()
    if const_cols:
        print(f"Dropping constant numeric columns during cleaning: {const_cols}")
        df = df.drop(columns=const_cols)

    os.makedirs("dashboard", exist_ok=True)

    report = []

    report.append("DATA CLEANING REPORT\n")

    # ============================================
    # Remove duplicates
    # ============================================

    before = len(df)

    df = df.drop_duplicates()

    after = len(df)

    report.append(f"Duplicates removed: {before - after}")

    # ============================================
    # Handle missing values
    # ============================================

    missing = df.isnull().sum()

    for col, count in missing.items():

        if count > 0:

            if df[col].dtype in ["int64", "float64"]:

                df[col] = df[col].fillna(df[col].median())

                report.append(f"Filled missing values in {col} using median")

            else:

                df[col] = df[col].fillna("Unknown")

                report.append(f"Filled missing values in {col} with 'Unknown'")

    # ============================================
    # Replace infinite values
    # ============================================

    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    # ============================================
    # Outlier detection (IQR)
    # ============================================

    numeric_cols = df.select_dtypes(include=np.number).columns

    for col in numeric_cols:

        Q1 = df[col].quantile(0.25)

        Q3 = df[col].quantile(0.75)

        IQR = Q3 - Q1

        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR

        outliers = ((df[col] < lower) | (df[col] > upper)).sum()

        if outliers > 0:

            df[col] = np.clip(df[col], lower, upper)

            report.append(f"Capped {outliers} outliers in column {col}")

    # ============================================
    # Save cleaning report
    # ============================================

    report_text = "\n".join(report)

    with open("dashboard/data_cleaning_report.txt", "w") as f:

        f.write(report_text)

    print("\nData cleaning completed")

    return {**state, "_df": df}