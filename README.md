# ⚡ DynamicBI — AI-Powered PowerBI-Style Dashboard

> Upload any dataset → get a production-grade interactive dashboard in under 90 seconds.

🔗 **Live Demo:** [dynamicbi.akshithsai.co.in](https://dynamicbi.akshithsai.co.in)
👤 **Developer:** [Akshith Sai Kondamadugu](https://akshithsai.co.in)
🐙 **GitHub:** [github.com/AkshithSai-24/DynamicBI](https://github.com/AkshithSai-24/DynamicBI)

---

## ✨ Features

| Feature | Detail |
|---------|--------|
| **Universal Data Sources** | CSV, Excel, PostgreSQL, MySQL, SQLite, MongoDB, Oracle |
| **10-Agent AI Pipeline** | LangGraph orchestrates load → clean → KPI → anomaly → forecast → insights → dashboard |
| **AI Dashboard Design** | LLM designs the optimal multi-page PowerBI-style layout for your specific data |
| **Interactive Filters** | Multi-select, date-range, numeric-range — all widgets re-compute in real time |
| **Drill-down** | Click any bar or pie slice for a detailed breakdown of that segment |
| **8+ Chart Types** | Bar, Line, Area, Pie, Scatter, Histogram, Heatmap, Table |
| **KPI Cards** | Auto-computed metrics with expand-to-all view showing every backend KPI |
| **AI Chat Assistant** | Ask natural-language questions; the agent executes live queries against your data |
| **Anomaly Detection** | Isolation Forest flags outliers with interactive scatter panels and an AI report |
| **Time-series Forecasting** | Automatic trend detection with confidence bands rendered as interactive charts |
| **AI Business Insights** | LLM surfaces non-obvious patterns and business takeaways in plain language |
| **Export / Import** | Save the full dashboard (charts + insights + forecasts + anomalies) as JSON; re-import anytime for an offline read-only view |
| **4 Themes** | Dark · Light · Ocean · Midnight — all components including charts update instantly |
| **Responsive** | Phone, tablet, and desktop layouts via CSS media queries |
| **Session Management** | Each browser tab gets its own isolated session; files auto-deleted when the tab closes or after 90s of inactivity |

---

## 🎨 Themes

Switch between four built-in themes using the theme button on every page.
All components — charts, KPI cards, tooltips, filters, headers — update instantly.

| Theme | Description |
|-------|-------------|
| 🌑 **Dark** | Deep navy / cyan default |
| ☀️ **Light** | Clean white / blue professional look |
| 🌊 **Ocean** | Deep sea blues and teals |
| 🌌 **Midnight** | Purple / pink cosmic palette |

---

## 🗂️ Project Structure

```
DynamicBI/
├── backend/
│   ├── agents/
│   │   ├── load_data_agent.py           # Multi-source data loader
│   │   ├── data_cleaning_agent.py       # Data quality & normalisation
│   │   ├── kpi_agent.py                 # Numeric KPI computation
│   │   ├── anomaly_detection_agent.py   # Isolation Forest
│   │   ├── anomaly_visualization_agent.py
│   │   ├── anomaly_explanation_agent.py # AI anomaly report
│   │   ├── forecasting_agent.py         # Time-series forecasting
│   │   ├── rag_profile_agent.py         # Dataset profiling
│   │   ├── insight_agent.py             # AI business insights
│   │   └── dashboard_schema_agent.py ⭐ # PowerBI layout + chart data
│   ├── graph/build_graph.py             # LangGraph pipeline
│   ├── query/query_loop.py              # NL query engine
│   ├── utils/                           # Source detector, helpers
│   ├── config.py                        # LLM config (NVIDIA NIM)
│   ├── state.py                         # LangGraph AgentState
│   ├── server.py                        # FastAPI — session-scoped
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── ThemeContext.jsx  ⭐          # 4-theme system + usePalette()
│   │   ├── App.jsx                      # App shell + session lifecycle
│   │   ├── LandingPage.jsx              # Hero, features, pipeline, connect
│   │   ├── index.css                    # CSS vars + responsive layout
│   │   └── components/
│   │       ├── Dashboard.jsx            # Main canvas + all tabs
│   │       ├── ChartWidgets.jsx         # Theme-aware Recharts components
│   │       ├── ThemeToggle.jsx ⭐        # Theme cycle button (icon + pill)
│   │       ├── KpiRow.jsx               # KPI card grid
│   │       ├── FilterPanel.jsx          # Sidebar filters
│   │       ├── AiChat.jsx               # AI chat interface
│   │       ├── DrillDownModal.jsx       # Drill-down detail modal
│   │       ├── MarkdownRenderer.jsx     # AI report renderer
│   │       ├── Footer.jsx               # Dev credit + Portfolio + GitHub
│   │       └── GithubBadge.jsx          # Compact header badges
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Add your NVIDIA_API_KEY to .env
uvicorn server:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## 🔑 Environment Variables

```env
# Required — NVIDIA NIM API key (https://build.nvidia.com)
NVIDIA_API_KEY=nvapi-...

# Optional — override the default model
LLM_MODEL=mistralai/mistral-medium-3.5-128b
```

---

## 📊 Supported Data Sources

| Source | Connection |
|--------|-----------|
| CSV / Excel | Upload via UI |
| PostgreSQL | `postgresql://user:pass@host:5432/db` |
| MySQL | `mysql+pymysql://user:pass@host:3306/db` |
| SQLite | `sqlite:///path/to/file.db` |
| MongoDB | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| Oracle | `oracle+cx_oracle://user:pass@host:1521/sid` *(install cx_oracle separately)* |

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/session/init` | Create a new tab session → returns `session_id` |
| `POST` | `/api/session/heartbeat` | Keep session alive (called every 30 s) |
| `POST` | `/api/session/close` | Destroy session + delete all files immediately |
| `POST` | `/api/upload` | Upload CSV/Excel (attach `X-Session-Id` header) |
| `POST` | `/api/connect` | Connect to database |
| `POST` | `/api/db/inspect` | Inspect DB schema |
| `GET`  | `/api/status/{job_id}` | Poll pipeline progress |
| `GET`  | `/api/result/{job_id}` | Fetch completed dashboard |
| `POST` | `/api/filter/{job_id}` | Apply filters — recomputes all widgets |
| `POST` | `/api/drilldown/{job_id}` | Drill into a dimension value |
| `POST` | `/api/query/{job_id}` | Natural language query |
| `GET`  | `/api/export/{job_id}` | Export full self-contained dashboard JSON |

All endpoints (except `/api/session/init`) require the `X-Session-Id` header.

---

## 🏗️ Architecture

```
Browser Tab
  │  POST /api/session/init  →  session_id
  │  X-Session-Id: <sid> on every request
  │
  ▼
FastAPI Server
  │  sessions/<sid>/uploads/   ← uploaded files
  │  sessions/<sid>/dashboard/ ← agent artefacts
  │  SESSIONS[sid]["jobs"]     ← in-memory job state
  │
  ▼
LangGraph Pipeline (os.chdir → session dir)
  ┌─────────────────────────────────────────┐
  │ 1  load_data_agent        (5%)          │
  │ 2  data_cleaning_agent    (15%)         │
  │ 3  kpi_agent              (25%)         │
  │ 4  anomaly_detection_agent(35%)         │
  │ 5  forecasting_agent      (50%)         │
  │ 6  anomaly_visualization_agent (60%)    │
  │ 7  anomaly_explanation_agent   (68%)    │
  │ 8  rag_profile_agent      (75%)         │
  │ 9  insight_agent          (83%)         │
  │ 10 dashboard_schema_agent (92%) ⭐       │
  └─────────────────────────────────────────┘
  │
  ▼
React Frontend
  ├── ThemeProvider (4 themes, CSS vars, localStorage)
  ├── Dashboard tab    ← widgets + filters + KPIs + drill-down
  ├── Insights tab     ← AI insights + key findings
  ├── Forecasting tab  ← interactive charts + tables
  ├── Anomalies tab    ← scatter panels + AI report
  └── AI Chat tab      ← live NL queries against your data
```

---

## ♻️ Session Lifecycle

```
Tab opens   → POST /api/session/init  → creates sessions/<sid>/
Tab running → POST /api/session/heartbeat every 30 s
Tab closes  → beforeunload fires fetch(keepalive) + sendBeacon
             → POST /api/session/close → immediate file deletion
Crashed tab → TTL reaper (checks every 20 s, 90 s threshold) → auto-cleanup
Server restart → all sessions/<*>/ directories wiped on startup
```

---

## 📦 Production Build

```bash
cd frontend && npm run build
# Serve frontend/dist/ via Nginx or FastAPI StaticFiles
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit and push
4. Open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🙌 Credits

Developed by **Akshith Sai Kondamadugu**
🌐 [akshithsai.co.in](https://akshithsai.co.in) · 🐙 [GitHub](https://github.com/AkshithSai-24/DynamicBI)
