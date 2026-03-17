def detect_source_type(source):

    source = source.lower()

    if source.endswith(".csv"):
        return "csv"

    if source.endswith(".xlsx") or source.endswith(".xls"):
        return "excel"

    if "sqlite://" in source:
        return "sqlite"

    if "postgres://" in source or "postgresql://" in source:
        return "postgres"

    if "mysql://" in source:
        return "mysql"
    if "mongodb+srv://" in source or "mongodb://" in source:
        return "mongodb"

    raise ValueError("Unsupported source type")

