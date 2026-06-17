import { useState, useRef, useCallback } from "react";
import Footer from "./components/Footer.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

const SOURCES = [
  { id: "file",    label: "File Upload",  icon: "📁", desc: "CSV or Excel file" },
  { id: "postgres",label: "PostgreSQL",   icon: "🐘", desc: "PostgreSQL database" },
  { id: "mysql",   label: "MySQL",        icon: "🐬", desc: "MySQL / MariaDB" },
  { id: "sqlite",  label: "SQLite",       icon: "📦", desc: "SQLite database file" },
  { id: "mongodb", label: "MongoDB",      icon: "🍃", desc: "MongoDB Atlas or local" },
  { id: "oracle",  label: "Oracle",       icon: "🔴", desc: "Oracle Database" },
];

const SAMPLE_STRINGS = {
  postgres: "postgresql://user:password@localhost:5432/mydb",
  mysql:    "mysql+pymysql://user:password@localhost:3306/mydb",
  sqlite:   "sqlite:///path/to/database.db",
  mongodb:  "mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/",
  oracle:   "oracle+cx_oracle://user:password@localhost:1521/orcl",
};

export default function LandingPage({ onJobStart, onImport, sessionId }) {
  const [activeSource, setActiveSource] = useState("file");
  const [dragging, setDragging]         = useState(false);
  const [connStr, setConnStr]           = useState("");
  const [dbInfo, setDbInfo]             = useState(null);
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedDb, setSelectedDb]     = useState("");
  const [inspecting, setInspecting]     = useState(false);
  const [err, setErr]                   = useState("");
  const [importErr, setImportErr]       = useState("");
  const [importDragging, setImportDragging] = useState(false);
  const fileRef = useRef();
  const importRef = useRef();

  const API = import.meta.env.VITE_API_URL || "";

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv","xlsx","xls"].includes(ext)) {
      setErr("Only CSV and Excel files are supported."); return;
    }
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const headers = {}; if (sessionId) headers["X-Session-Id"] = sessionId;
      const r = await fetch(`${API}/api/upload`, { method: "POST", body: fd, headers });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Upload failed"); }
      const { job_id, filename } = await r.json();
      onJobStart(job_id, filename);
    } catch (e) { setErr(e.message); }
  }, [API, onJobStart]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleImportFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "json") {
      setImportErr("Only .json files exported from DynamicBI are supported.");
      return;
    }
    setImportErr("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const schema = parsed?.dashboard_schema || (Array.isArray(parsed?.pages) ? parsed : null);
      if (!schema || !Array.isArray(schema.pages)) {
        throw new Error("This file doesn't look like a valid DynamicBI dashboard export.");
      }
      const payload = parsed?.dashboard_schema ? parsed : { dashboard_schema: schema };
      onImport?.(payload, file.name.replace(/\.json$/i, ""));
    } catch (e) {
      setImportErr(e.message?.includes("JSON") ? "Couldn't parse this file — it isn't valid JSON." : e.message);
    }
  }, [onImport]);

  const handleImportDrop = useCallback((e) => {
    e.preventDefault(); setImportDragging(false);
    handleImportFile(e.dataTransfer.files[0]);
  }, [handleImportFile]);

  const inspect = async () => {
    setErr(""); setInspecting(true); setDbInfo(null);
    try {
      const r = await fetch(`${API}/api/db/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sessionId ? { "X-Session-Id": sessionId } : {}) },
        body: JSON.stringify({ connection_string: connStr }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
      const data = await r.json();
      setDbInfo(data);
      if (data.type === "sql" && data.tables?.length) setSelectedTable(data.tables[0]);
      if (data.type === "mongodb" && data.databases?.length) setSelectedDb(data.databases[0]);
    } catch (e) { setErr(e.message); }
    setInspecting(false);
  };

  const connect = async () => {
    setErr("");
    try {
      const body = { connection_string: connStr };
      if (dbInfo?.type === "mongodb") { body.database = selectedDb; body.table = selectedTable; }
      else { body.table = selectedTable; }

      const r = await fetch(`${API}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sessionId ? { "X-Session-Id": sessionId } : {}) },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
      const { job_id, connection } = await r.json();
      onJobStart(job_id, connection.slice(0, 40) + "…");
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="landing-root">

      {/* Theme toggle — fixed top right */}
      <div style={{ position:"fixed", top:14, right:16, zIndex:100 }}>
        <ThemeToggle variant="pill" />
      </div>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:56, marginBottom:10, filter:"drop-shadow(0 0 18px var(--accent))" }}>⚡</div>
        <h1 style={{ fontSize:38, fontWeight:900, letterSpacing:-1,
          background:"linear-gradient(135deg,var(--accent),var(--accent2))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:10 }}>
          DynamicBI
        </h1>
        <p style={{ color:"var(--text2)", fontSize:16, maxWidth:520, margin:"0 auto 14px", lineHeight:1.65 }}>
          Upload any dataset and get a <strong style={{ color:"var(--text)" }}>production-grade interactive dashboard</strong> in under 90 seconds — powered by AI agents, not manual configuration.
        </p>
        {/* Live stats strip */}
        <div style={{ display:"flex", gap:24, justifyContent:"center", flexWrap:"wrap", marginTop:16 }}>
          {[["7+","Data Sources"],["10","AI Pipeline Agents"],["8+","Chart Types"],["∞","Rows Supported"]].map(([n,l])=>(
            <div key={l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, color:"var(--accent)" }}>{n}</div>
              <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Developer credit ───────────────────────────────────────── */}
      <div style={{ textAlign:"center", marginBottom:28, color:"var(--text2)", fontSize:15, fontWeight:700 }}>
        Developed By{" "}
        <a href="https://akshithsai.co.in" target="_blank" rel="noopener noreferrer"
          style={{ color:"var(--accent)", textDecoration:"none", fontWeight:800 }}
          onMouseOver={e => e.currentTarget.style.textDecoration="underline"}
          onMouseOut={e  => e.currentTarget.style.textDecoration="none"}
        >
          <svg style={{ display:"inline", verticalAlign:"middle", marginRight:4 }}
               height="13" width="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Akshith Sai Kondamadugu
        </a>
      </div>

      {/* ── Feature cards ──────────────────────────────────────────── */}
      <div style={{ width:"100%", maxWidth:780, marginBottom:36 }}>
        <h2 style={{ textAlign:"center", fontSize:14, fontWeight:700, color:"var(--muted)",
          textTransform:"uppercase", letterSpacing:1, marginBottom:18 }}>
          Everything you need, generated automatically
        </h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
          {[
            { icon:"📊", title:"PowerBI-style Layout",    desc:"Multi-page dashboard with 12-column grid, drill-down, filters, and KPI cards — designed by AI for your data." },
            { icon:"🤖", title:"AI Chat Assistant",        desc:"Ask questions in plain English. The agent writes and executes queries live against your dataset." },
            { icon:"🔍", title:"Anomaly Detection",        desc:"Isolation Forest automatically flags outliers and generates an AI explanation report with interactive scatter charts." },
            { icon:"📈", title:"Time-series Forecasting",  desc:"Automatic trend detection and forecasting with confidence bands, rendered as interactive charts." },
            { icon:"💡", title:"AI Business Insights",     desc:"LLM analyses patterns, correlations, and trends to surface non-obvious takeaways written in plain language." },
            { icon:"🔄", title:"Real-time Filters",        desc:"Multi-select, date-range, and numeric filters re-compute every widget instantly without reloading." },
            { icon:"↓","title":"Export & Import",         desc:"Save the full dashboard — charts, insights, forecasts, anomalies — as a self-contained JSON. Re-import anytime." },
            { icon:"📱", title:"Fully Responsive",         desc:"Adapts cleanly to phone, tablet, and desktop. Four built-in themes: Dark, Light, Ocean, Midnight." },
          ].map(f => (
            <div key={f.title} style={{ background:"var(--bg2)", border:"1px solid var(--border)",
              borderRadius:12, padding:"16px 18px",
              transition:"transform 0.15s, box-shadow 0.15s" }}
              onMouseOver={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="var(--shadow)"; }}
              onMouseOut={e  => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="none"; }}
            >
              <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
              <div style={{ fontWeight:700, fontSize:13, color:"var(--text)", marginBottom:5 }}>{f.title}</div>
              <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI Pipeline ────────────────────────────────────────────── */}
      <div style={{ width:"100%", maxWidth:780, marginBottom:36 }}>
        <h2 style={{ textAlign:"center", fontSize:14, fontWeight:700, color:"var(--muted)",
          textTransform:"uppercase", letterSpacing:1, marginBottom:18 }}>
          10-Agent AI Pipeline
        </h2>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
          {[
            ["📂","Load Data"],["🧹","Clean Data"],["📊","Compute KPIs"],
            ["🔍","Anomaly Detect"],["📈","Forecast"],["🎨","Visualise Anomalies"],
            ["🧠","Explain Anomalies"],["📋","Profile Dataset"],["✨","AI Insights"],["⚡","Build Dashboard"],
          ].map(([icon, name], i) => (
            <div key={name} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)",
                borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:600,
                color:"var(--text2)", display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>{icon}</span>
                <span style={{ fontSize:11, color:"var(--accent)", fontWeight:700, marginRight:2 }}>{i+1}</span>
                {name}
              </div>
              {i < 9 && <span style={{ color:"var(--muted)", fontSize:14, fontWeight:300 }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Source selector + connect card ─────────────────────────── */}
      <div className="source-selector">
        {SOURCES.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveSource(s.id); setDbInfo(null); setErr(""); }}
            style={{
              display:"flex", alignItems:"center", gap:8, padding:"8px 16px",
              background: activeSource===s.id ? "var(--accent2)" : "var(--bg3)",
              border: `1px solid ${activeSource===s.id ? "var(--accent2)" : "var(--border)"}`,
              borderRadius:"var(--radius)", color:"var(--text)", fontWeight:600, fontSize:13,
              transition:"all 0.2s",
            }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Main card */}
      <div className="landing-card">

        {/* File upload */}
        {activeSource === "file" && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`,
                borderRadius: 12, padding: "40px 24px", textAlign:"center", cursor:"pointer",
                background: dragging ? "rgba(0,212,255,0.05)" : "var(--bg3)",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
              <p style={{ color:"var(--text)", fontWeight:600, marginBottom:6 }}>
                Drop CSV or Excel file here
              </p>
              <p style={{ color:"var(--muted)", fontSize:13 }}>or click to browse · .csv, .xlsx, .xls</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={e=>handleFile(e.target.files[0])} />
            </div>

            <div style={{ marginTop:20, textAlign:"center", color:"var(--muted)", fontSize:12 }}>
              💡 Supports sales data, student grades, financial records, inventory, and more
            </div>
          </div>
        )}

        {/* Database connection */}
        {activeSource !== "file" && (
          <div>
            <label style={{ display:"block", color:"var(--text2)", fontWeight:600, fontSize:13, marginBottom:8 }}>
              Connection String
            </label>
            <textarea
              value={connStr}
              onChange={e=>setConnStr(e.target.value)}
              placeholder={SAMPLE_STRINGS[activeSource] || "Enter connection string…"}
              rows={3}
              style={{
                width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8,
                color:"var(--text)", padding:"10px 12px", fontSize:13, fontFamily:"var(--mono)",
                resize:"vertical", outline:"none",
              }}
            />
            <button
              onClick={inspect}
              disabled={!connStr.trim() || inspecting}
              style={{
                marginTop:12, width:"100%", padding:"11px 0", background:"var(--accent2)",
                border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14,
                opacity: (!connStr.trim() || inspecting) ? 0.5 : 1, transition:"opacity 0.2s",
              }}
            >
              {inspecting ? "🔍 Inspecting…" : "🔌 Connect & Inspect"}
            </button>

            {/* Table / collection picker */}
            {dbInfo && (
              <div style={{ marginTop:20, animation:"fadeIn 0.3s ease" }}>
                {dbInfo.type === "sql" && (
                  <div>
                    <label style={{ display:"block", color:"var(--text2)", fontSize:13, fontWeight:600, marginBottom:6 }}>
                      Select Table ({dbInfo.tables?.length} found)
                    </label>
                    <select
                      value={selectedTable}
                      onChange={e=>setSelectedTable(e.target.value)}
                      style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"9px 12px", fontSize:13 }}
                    >
                      {dbInfo.tables?.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {dbInfo.type === "mongodb" && (
                  <div className="db-picker-row">
                    <div style={{ flex:1 }}>
                      <label style={{ display:"block", color:"var(--text2)", fontSize:13, fontWeight:600, marginBottom:6 }}>Database</label>
                      <select
                        value={selectedDb}
                        onChange={e=>{ setSelectedDb(e.target.value); setSelectedTable(""); }}
                        style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"9px 12px", fontSize:13 }}
                      >
                        {dbInfo.databases?.map(d=><option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1 }}>
                      <label style={{ display:"block", color:"var(--text2)", fontSize:13, fontWeight:600, marginBottom:6 }}>Collection</label>
                      <select
                        value={selectedTable}
                        onChange={e=>setSelectedTable(e.target.value)}
                        style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"9px 12px", fontSize:13 }}
                      >
                        {(dbInfo.collections?.[selectedDb] || []).map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <button
                  onClick={connect}
                  disabled={!selectedTable && dbInfo.type === "sql"}
                  style={{
                    marginTop:14, width:"100%", padding:"11px 0", background:"linear-gradient(135deg,var(--accent3),var(--accent))",
                    border:"none", borderRadius:8, color:"#000", fontWeight:800, fontSize:14,
                  }}
                >
                  🚀 Generate Dashboard
                </button>
              </div>
            )}
          </div>
        )}

        {err && (
          <div style={{ marginTop:16, padding:"10px 14px", background:"rgba(255,94,122,0.1)", border:"1px solid var(--red)", borderRadius:8, color:"var(--red)", fontSize:13 }}>
            ⚠ {err}
          </div>
        )}
      </div>

      {/* Import dashboard from JSON */}
      <div style={{ width:"100%", maxWidth:600, marginTop:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0 14px" }}>
          <div style={{ flex:1, height:1, background:"var(--border)" }} />
          <span style={{ color:"var(--muted)", fontSize:12, fontWeight:600 }}>OR</span>
          <div style={{ flex:1, height:1, background:"var(--border)" }} />
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
          onDragLeave={() => setImportDragging(false)}
          onDrop={handleImportDrop}
          onClick={() => importRef.current?.click()}
          style={{
            border: `2px dashed ${importDragging ? "var(--accent2)" : "var(--border2)"}`,
            borderRadius: 12, padding: "20px 24px", textAlign:"center", cursor:"pointer",
            background: importDragging ? "rgba(124,92,252,0.05)" : "var(--bg2)",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize:24, marginBottom:8 }}>📥</div>
          <p style={{ color:"var(--text)", fontWeight:600, marginBottom:4, fontSize:14 }}>
            Import a Dashboard
          </p>
          <p style={{ color:"var(--muted)", fontSize:12 }}>
            Drop a previously exported <code>dashboard.json</code> file here · or click to browse
          </p>
          <input ref={importRef} type="file" accept=".json,application/json" hidden
            onChange={e => handleImportFile(e.target.files[0])} />
        </div>

        {importErr && (
          <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,94,122,0.1)", border:"1px solid var(--red)", borderRadius:8, color:"var(--red)", fontSize:13 }}>
            ⚠ {importErr}
          </div>
        )}
      </div>

      {/* ── Tech stack ─────────────────────────────────────────────── */}
      <div style={{ marginTop:28, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600,
          textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>
          Built With
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
          {[
            ["⚡","FastAPI"],["🦜","LangGraph"],["🧠","NVIDIA NIM"],
            ["🐼","Pandas"],["📊","Recharts"],["⚛️","React + Vite"],
          ].map(([ic, name]) => (
            <span key={name} style={{ background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:99, padding:"4px 12px", fontSize:12, fontWeight:600,
              color:"var(--text2)", display:"inline-flex", alignItems:"center", gap:5 }}>
              {ic} {name}
            </span>
          ))}
        </div>
      </div>

      <Footer style={{ marginTop:20 }} />
    </div>
  );
}
