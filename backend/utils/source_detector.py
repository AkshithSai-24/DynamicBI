def detect_source_type(source):
    s = source.strip().lower()

    if s.endswith(".csv"):
        return "csv"

    if s.endswith(".xlsx") or s.endswith(".xls"):
        return "excel"

    if s.startswith("sqlite://"):
        return "sqlite"

    # Accept both shorthand (postgres://) and full (postgresql://)
    # and any driver variant (postgresql+psycopg2://, postgresql+asyncpg://)
    if s.startswith("postgres://") or s.startswith("postgresql"):
        return "postgres"

    if s.startswith("mysql"):
        return "mysql"

    if s.startswith("mongodb://") or s.startswith("mongodb+srv://"):
        return "mongodb"

    if s.startswith("oracle"):
        return "oracle"

    raise ValueError(f"Unsupported source type for: {source}")