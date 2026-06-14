# ⚡ DynamicBI — AI-Powered PowerBI-Style Dashboard

A fully dynamic, AI-driven business intelligence dashboard that works like Power BI.
Upload any data source, and the AI analyses it end-to-end to produce an interactive,
filterable, multi-page dashboard — accessible from desktop, tablet, or mobile.

🔗 **Live Demo:** [dynamicbi.akshithsai.co.in](https://dynamicbi.akshithsai.co.in)

👤 **Developed By:** Akshith Sai Kondamadugu
🐙 **GitHub:** [github.com/AkshithSai-24/DynamicBI](https://github.com/AkshithSai-24/DynamicBI)

---

## ✨ Features

| Feature | Detail |
|---------|--------|
| **Universal Data Sources** | CSV, Excel, PostgreSQL, MySQL, SQLite, MongoDB (Oracle via optional driver) |
| **AI Dashboard Design** | LLM analyses your data and designs the optimal layout |
| **Interactive Filters** | Multi-select, date-range, cross-filtering in real time |
| **Drill-down** | Click any bar/slice to deep-dive into that segment |
| **Smart Charts** | Bar, Line, Area, Pie, Scatter, Histogram, Heatmap, Table |
| **KPI Cards** | Auto-computed key metrics — expand a KPI card to view **every** KPI computed for the dataset |
| **Multi-Page** | Up to 2 pages (Overview + Deep Dive) |
| **AI Chat** | Ask natural-language questions, get answers + charts |
| **Anomaly Detection** | Isolation Forest detects outliers automatically |
| **Forecasting** | Time-series forecasting with confidence bands |
| **AI Insights** | LLM-generated business insights with derivations |
| **Export Dashboard** | Download the dashboard (schema + AI insights + KPIs + reports) as a single JSON file |
| **Import Dashboard** | Re-load a previously exported JSON for an offline, read-only view — no backend job needed |
| **Responsive UI** | Adapts cleanly to phones, tablets, and desktops |
| **Session-Friendly** | Each new session automatically clears previous uploads & generated files on the server |

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
│   │   ├── forecasting_agent.py        # Time-series forecasting
│   │   ├── rag_profile_agent.py        # Dataset profiling
│   │   ├── insight_agent.py            # AI business insights
│   │   └── dashboard_schema_agent.py   # ⭐ PowerBI layout AI
│   ├── graph/
│   │   └── build_graph.py              # LangGraph pipeline
│   ├── query/
│   │   └── query_loop.py               # NL query engine
│   ├── utils/
│   │   ├── source_detector.py
│   │   ├── chart_title.py
│   │   └── code_extractor.py
│   ├── config.py                       # LLM configuration (NVIDIA NIM)
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
│   │   │   ├── DrillDownModal.jsx      # Drill-down detail view
│   │   │   ├── MarkdownRenderer.jsx    # Renders AI markdown reports
│   │   │   ├── Footer.jsx              # Developer credit + GitHub link
│   │   │   └── GithubBadge.jsx         # GitHub badge for dashboard header
│   │   ├── App.jsx                     # App shell + routing + session reset
│   │   ├── LandingPage.jsx             # Upload / connect / import UI
│   │   ├── index.css                   # Global dark theme + responsive layout
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
# Edit .env and add your NVIDIA_API_KEY
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
# Required — used for all AI agents
NVIDIA_API_KEY=nvapi-...

# Optional — override the default model
LLM_MODEL=mistralai/mistral-medium-3.5-128b
```

### Switching LLM Provider

By default `backend/config.py` uses **ChatNVIDIA** from
`langchain-nvidia-ai-endpoints`. To use a different provider, install the
relevant `langchain-*` integration package and swap the implementation of
`get_llm()` in `backend/config.py` — every agent calls this single function,
so no other code needs to change.

---

## 📊 Supported Data Sources

| Source | Example Connection |
|--------|-------------------|
| CSV | Upload via UI |
| Excel (.xlsx/.xls) | Upload via UI |
| PostgreSQL | `postgresql://user:pass@host:5432/db` |
| MySQL | `mysql+pymysql://user:pass@host:3306/db` |
| SQLite | `sqlite:///path/to/file.db` |
| MongoDB | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| Oracle | `oracle+cx_oracle://user:pass@host:1521/sid` *(install `cx_oracle` / `oracledb` separately)* |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/reset` | Clear uploads, generated dashboard files & in-memory jobs (called automatically at the start of every new session) |
| `POST` | `/api/upload` | Upload CSV/Excel file |
| `POST` | `/api/connect` | Connect to database |
| `POST` | `/api/db/inspect` | Inspect DB schema |
| `GET`  | `/api/status/{job_id}` | Poll pipeline progress |
| `GET`  | `/api/result/{job_id}` | Get dashboard payload |
| `POST` | `/api/filter/{job_id}` | Apply filters (real-time) |
| `POST` | `/api/drilldown/{job_id}` | Drill into a dimension |
| `POST` | `/api/query/{job_id}` | Natural language query |
| `GET`  | `/api/export/{job_id}` | Export dashboard schema + AI insights + KPIs + reports as JSON |

---

## 🏗️ Architecture

```
User Upload / DB Connect
        ↓
   FastAPI Server  ──▶  /api/reset wipes previous session's
        ↓                uploads & dashboard/ artefacts
   LangGraph Pipeline:
   ┌─────────────────────────────┐
   │ load_data_agent             │  Load & detect source
   │ data_cleaning_agent         │  Clean, deduplicate
   │ kpi_agent                   │  Compute KPIs
   │ anomaly_detection_agent     │  Isolation Forest
   │ forecasting_agent           │  Time-series forecasting
   │ anomaly_visualization_agent │  Anomaly charts
   │ anomaly_explanation_agent   │  AI anomaly report
   │ rag_profile_agent           │  Dataset profiling
   │ insight_agent               │  AI business insights
   │ dashboard_schema_agent ⭐   │  PowerBI layout design
   └─────────────────────────────┘
        ↓
   JSON Schema + Chart Data
        ↓
   React + Recharts Frontend (responsive)
   - Filter Panel (real-time)
   - Multi-page layout
   - Drill-down modals
   - Expandable KPI view (all KPIs)
   - AI Chat
   - Export / Import dashboard JSON
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

### Export / Import

Exporting (`/api/export/{job_id}`) produces a self-contained JSON file
containing the dashboard schema, AI summary & key insights, the full AI
insights report, every computed KPI, the dataset profile, and any
anomaly/forecast summaries. This file can be re-loaded later from the
landing page's **Import a Dashboard** panel for a fast, read-only,
offline view of the same dashboard.

---

## 📱 Responsive Design

The UI uses a shared set of layout classes (`index.css`) with breakpoints at
**900px** (tablet — filter sidebar moves above the canvas) and **640px**
(mobile — widgets stack to a 2-column then 1-column grid, headers wrap,
modals go full-screen). All charts use Recharts' `ResponsiveContainer`, so
every visual reflows automatically with the viewport.

---

## ♻️ Session Handling

On every fresh page load (and whenever you click **← New**), the frontend
calls `POST /api/reset`, which:

- Deletes all files in `backend/uploads/`
- Deletes all generated artefacts in `backend/dashboard/`
- Clears all in-memory job records

This keeps each session isolated and prevents stale files from previous
runs from accumulating on the server.

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

---

## 🙌 Credits

Developed by **Akshith Sai Kondamadugu**
🐙 [github.com/AkshithSai-24/DynamicBI](https://github.com/AkshithSai-24/DynamicBI)
