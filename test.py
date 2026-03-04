import sqlite3
import pandas as pd

# sample data
'''data = {
    "city": ["Delhi","Mumbai","Delhi","Chennai","Mumbai","Delhi"],
    "sales": [200,300,150,400,250,100],
    "product": ["A","B","A","C","A","B"]
}'''

df = pd.read_csv("test2.csv")

conn = sqlite3.connect("sales.db")

df.to_sql("sales", conn, if_exists="replace", index=False)

conn.close()

print("Database created: sales.db")


# Use to Create a new database and insert data from a CSV file. LOCAL SQL DATA BASE CREATION ONLY.