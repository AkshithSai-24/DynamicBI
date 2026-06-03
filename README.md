# ⚡ DynamicBI — AI-Powered PowerBI-Style Dashboard

A fully dynamic, AI-driven business intelligence dashboard that works like Power BI.  
Upload any data source, and the AI analyses it end-to-end to produce an interactive, filterable, multi-page dashboard.

---

## ✨ Features

| Feature | Detail |
|---------|--------|
| **Universal Data Sources** | CSV, Excel, PostgreSQL, MySQL, SQLite, Oracle, MongoDB |
| **AI Dashboard Design** | LLM analyses your data and designs the optimal layout |
| **Interactive Filters** | Multi-select, date-range, cross-filtering in real time |
| **Drill-down** | Click any bar/slice to deep-dive into that segment |
| **Smart Charts** | Bar, Line, Area, Pie, Scatter, Histogram, Heatmap, Table |
| **KPI Cards** | Auto-computed key metrics with trend indicators |
| **Multi-Page** | Up to 2 pages (Overview + Deep Dive) |
| **AI Chat** | Ask natural-language questions, get answers + charts |
| **Anomaly Detection** | Isolation Forest detects outliers automatically |
| **Forecasting** | Prophet-based time-series forecasting |
| **AI Insights** | LLM-generated business insights with derivations |
| **Export** | Download dashboard schema as JSON |

---

## 🗂️ Project Structure

```
DynamicBI/
├── backend/
│   ├── agents/
│   │   ├── load_data_agent.py          # Multi-source data loader
│   │   ├── data_cleaning_agent.py      # Data quality & cleaning
│   │   ├── kpi_agent.py                # KPI computation
│   │   ├── anomaly_detection_agent.py  # Isolation Forest
│   │   ├── anomaly_visualization_agent.py
│   │   ├── anomaly_explanation_agent.py
│   │   ├── forecasting_agent.py        # Prophet forecasting
│   │   ├── rag_profile_agent.py        # Dataset profiling
│   │   ├── insight_agent.py            # AI business insights
│   │   ├── visualization_agent.py      # Chart data generator
│   │   └── dashboard_schema_agent.py   # ⭐ PowerBI layout AI
│   ├── graph/
│   │   └── build_graph.py              # LangGraph pipeline
│   ├── query/
│   │   └── query_loop.py               # NL query engine
│   ├── utils/
│   │   ├── source_detector.py
│   │   ├── chart_title.py
│   │   └── code_extractor.py
│   ├── config.py                       # LLM configuration
│   ├── state.py                        # LangGraph state
│   ├── server.py                       # FastAPI backend
│   ├── main.py                         # CLI entry point
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx           # ⭐ Main PowerBI canvas
│   │   │   ├── ChartWidgets.jsx        # All Recharts components
│   │   │   ├── FilterPanel.jsx         # Interactive filter sidebar
│   │   │   ├── KpiRow.jsx              # KPI card grid
│   │   │   ├── AiChat.jsx              # AI chat interface
│   │   │   └── DrillDownModal.jsx      # Drill-down detail view
│   │   ├── App.jsx                     # App shell + routing
│   │   ├── LandingPage.jsx             # Upload / connect UI
│   │   ├── index.css                   # Global dark theme
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

### 2. Start Backend

```bash
cd backend
uvicorn server:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🔑 Environment Variables

### Backend `.env`

```env
# Required
OPENROUTER_API_KEY=sk-or-...

# Optional — change model in config.py
```

### Switching LLM Provider

Edit `backend/config.py`:

```python
# OpenRouter (default)
from langchain_openrouter import ChatOpenRouter
def get_llm():
    return ChatOpenRouter(model="openai/gpt-4o-mini", temperature=0.3)

# Ollama (local)
from langchain_ollama import OllamaLLM
def get_llm():
    return OllamaLLM(model="mistral")

# Google Gemini
from langchain_google_genai import GoogleGenerativeAI
def get_llm():
    return GoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.3)
```

---

## 📊 Supported Data Sources

| Source | Example Connection |
|--------|-------------------|
| CSV | Upload via UI |
| Excel (.xlsx/.xls) | Upload via UI |
| PostgreSQL | `postgresql://user:pass@host:5432/db` |
| MySQL | `mysql+pymysql://user:pass@host:3306/db` |
| SQLite | `sqlite:///path/to/file.db` |
| Oracle | `oracle+cx_oracle://user:pass@host:1521/sid` |
| MongoDB | `mongodb+srv://user:pass@cluster.mongodb.net/` |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload CSV/Excel file |
| `POST` | `/api/connect` | Connect to database |
| `POST` | `/api/db/inspect` | Inspect DB schema |
| `GET`  | `/api/status/{job_id}` | Poll pipeline progress |
| `GET`  | `/api/result/{job_id}` | Get dashboard payload |
| `POST` | `/api/filter/{job_id}` | Apply filters (real-time) |
| `POST` | `/api/drilldown/{job_id}` | Drill into a dimension |
| `POST` | `/api/query/{job_id}` | Natural language query |
| `GET`  | `/api/export/{job_id}` | Export schema as JSON |

---

## 🏗️ Architecture

```
User Upload / DB Connect
        ↓
   FastAPI Server
        ↓
   LangGraph Pipeline:
   ┌─────────────────────────────┐
   │ load_data_agent             │  Load & detect source
   │ data_cleaning_agent         │  Clean, deduplicate
   │ kpi_agent                   │  Compute KPIs
   │ anomaly_detection_agent     │  Isolation Forest
   │ forecasting_agent           │  Prophet time-series
   │ anomaly_visualization_agent │  Anomaly charts
   │ anomaly_explanation_agent   │  AI anomaly report
   │ rag_profile_agent           │  Dataset profiling
   │ insight_agent               │  AI business insights
   │ dashboard_schema_agent ⭐   │  PowerBI layout design
   └─────────────────────────────┘
        ↓
   JSON Schema + Chart Data
        ↓
   React + Recharts Frontend
   - Filter Panel (real-time)
   - Multi-page layout
   - Drill-down modals
   - AI Chat
```

---

## 🎨 Dashboard Layout

The AI generates a JSON schema like:
```json
{
  "title": "Sales Performance Dashboard",
  "domain": "sales",
  "pages": [
    {
      "id": "page1",
      "title": "Overview",
      "widgets": [
        { "type": "kpi_row", "w": 12 },
        { "type": "bar", "x_col": "Region", "y_col": "Revenue", "w": 6 },
        { "type": "line", "x_col": "Date", "y_col": "Revenue", "w": 6 },
        { "type": "pie", "x_col": "Category", "w": 4 },
        { "type": "scatter", "x_col": "Price", "y_col": "Quantity", "w": 8 }
      ]
    }
  ],
  "filters": [
    { "column": "Region", "type": "multi_select" },
    { "column": "Date", "type": "date_range" }
  ]
}
```

---

## 📦 Production Build

```bash
# Build frontend
cd frontend
npm run build

# Serve with FastAPI static files (or Nginx)
# The built files are in frontend/dist/
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
