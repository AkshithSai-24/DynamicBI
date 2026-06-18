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

      {/* ── Top-right controls: Theme + Portfolio + GitHub ──────── */}
      <div style={{ position:"fixed", top:12, right:14, zIndex:100,
        display:"flex", alignItems:"center", gap:8 }}>
        <a href="https://akshithsai.co.in" target="_blank" rel="noopener noreferrer"
          title="Portfolio — akshithsai.co.in"
          style={{ display:"inline-flex", alignItems:"center", gap:5,
            background:"var(--bg3)", border:"1px solid var(--border)",
            borderRadius:8, padding:"6px 11px", fontSize:12, fontWeight:700,
            color:"var(--text2)", textDecoration:"none", transition:"color 0.15s" }}
          onMouseOver={e=>e.currentTarget.style.color="var(--accent3)"}
          onMouseOut={e=>e.currentTarget.style.color="var(--text2)"}>
          <svg height="13" width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Portfolio
        </a>
        <a href="https://github.com/AkshithSai-24/DynamicBI" target="_blank" rel="noopener noreferrer"
          title="GitHub — DynamicBI"
          style={{ display:"inline-flex", alignItems:"center", gap:5,
            background:"var(--bg3)", border:"1px solid var(--border)",
            borderRadius:8, padding:"6px 11px", fontSize:12, fontWeight:700,
            color:"var(--text2)", textDecoration:"none", transition:"color 0.15s" }}
          onMouseOver={e=>e.currentTarget.style.color="var(--accent)"}
          onMouseOut={e=>e.currentTarget.style.color="var(--text2)"}>
          <svg height="13" width="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          GitHub
        </a>
        <ThemeToggle variant="compact" />
      </div>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div style={{ textAlign:"center", marginBottom:28 }}>
        {/* Real logo from public/vite.svg */}
        <img src="/vite.svg" alt="DynamicBI Logo"
          style={{ width:80, height:80, marginBottom:12,
            filter:"drop-shadow(0 0 14px var(--accent))", objectFit:"contain" }} />
        <h1 style={{ fontSize:38, fontWeight:900, letterSpacing:-1,
          background:"linear-gradient(135deg,var(--accent),var(--accent2))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:10 }}>
          DynamicBI
        </h1>
        <p style={{ color:"var(--text2)", fontSize:16, maxWidth:540, margin:"0 auto 10px", lineHeight:1.65 }}>
          Upload any dataset and get a <strong style={{ color:"var(--text)" }}>production-grade interactive dashboard</strong> in under 90 seconds — powered by a 10-agent AI pipeline, not manual configuration.
        </p>
        <p style={{ color:"var(--muted)", fontSize:13, maxWidth:480, margin:"0 auto 18px", lineHeight:1.6 }}>
          DynamicBI is an open-source AI-powered business intelligence platform. It combines LangGraph agent orchestration, NVIDIA NIM LLMs, and a React-based PowerBI-style frontend to transform raw data into fully interactive dashboards with zero configuration.
        </p>
        {/* Live stats strip */}
        <div style={{ display:"flex", gap:24, justifyContent:"center", flexWrap:"wrap", marginTop:16 }}>
          {[["7+","Data Sources"],["10","AI Pipeline Agents"],["8+","Chart Types"],["4","Themes"]].map(([n,l])=>(
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
      <div style={{ width:"100%", maxWidth:820, marginBottom:36 }}>
        <h2 style={{ textAlign:"center", fontSize:14, fontWeight:700, color:"var(--muted)",
          textTransform:"uppercase", letterSpacing:1, marginBottom:18 }}>
          Everything generated automatically
        </h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))", gap:12 }}>
          {[
            { icon:"📊", title:"PowerBI-style Layout",    desc:"Multi-page dashboard with 12-col grid, KPI cards, drill-down, and live filters — the AI chooses the best chart type and layout for your specific data." },
            { icon:"🤖", title:"AI Chat Assistant",        desc:"Ask questions in plain English. The agent writes, executes, and formats live queries against your exact dataset." },
            { icon:"🔍", title:"Anomaly Detection",        desc:"Isolation Forest flags statistical outliers with interactive scatter plots and an AI-written explanation report." },
            { icon:"📈", title:"Time-series Forecasting",  desc:"Automatic trend detection and multi-period forecasting with confidence bands. Supports daily, weekly, and monthly frequencies." },
            { icon:"💡", title:"AI Business Insights",     desc:"The LLM surfaces patterns, correlations, and non-obvious business takeaways written in plain business language, not data-science jargon." },
            { icon:"🔄", title:"Real-time Filters",        desc:"Multi-select, date-range, and numeric filters recompute every single widget instantly on the server — no page reload needed." },
            { icon:"↓",  title:"Export & Offline Import",  desc:"Export the full dashboard — every chart, insight, forecast, and anomaly report — as one self-contained JSON. Re-import anytime for an offline read-only view." },
            { icon:"🎨", title:"4 Themes",                 desc:"Switch between Dark, Light, Ocean, and Midnight themes from any page. Charts, tooltips, filters, and all text update instantly." },
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

      {/* ── AI Pipeline Flowchart ───────────────────────────────────── */}
      <div style={{ width:"100%", maxWidth:820, marginBottom:36 }}>
        <h2 style={{ textAlign:"center", fontSize:14, fontWeight:700, color:"var(--muted)",
          textTransform:"uppercase", letterSpacing:1, marginBottom:20 }}>
          10-Agent AI Pipeline
        </h2>

        {/* Swimlane flowchart */}
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)",
          borderRadius:14, padding:"24px 20px", overflowX:"auto" }}>
          {/* Two rows of 5 */}
          {[
            [
              { n:1, icon:"📂", label:"Load Data",         sub:"CSV · Excel · SQL · MongoDB", color:"var(--accent)" },
              { n:2, icon:"🧹", label:"Clean Data",         sub:"Deduplicate · type-cast · impute", color:"var(--accent2)" },
              { n:3, icon:"📊", label:"Compute KPIs",       sub:"SUM · AVG · COUNT per column", color:"var(--accent3)" },
              { n:4, icon:"🔍", label:"Anomaly Detect",     sub:"Isolation Forest outliers", color:"var(--accent5)" },
              { n:5, icon:"📈", label:"Forecast",           sub:"Time-series + confidence bands", color:"var(--accent4)" },
            ],
            [
              { n:6, icon:"🎨", label:"Visualise Anomalies",sub:"Interactive scatter panels", color:"var(--accent4)" },
              { n:7, icon:"🧠", label:"Explain Anomalies",  sub:"AI anomaly report (LLM)", color:"var(--accent6)" },
              { n:8, icon:"📋", label:"Profile Dataset",    sub:"Stats · distributions · types", color:"var(--accent3)" },
              { n:9, icon:"✨", label:"AI Insights",        sub:"Business takeaways (LLM)", color:"var(--accent2)" },
              { n:10,icon:"⚡", label:"Build Dashboard",    sub:"PowerBI layout + chart data", color:"var(--accent)" },
            ],
          ].map((row, rowIdx) => (
            <div key={rowIdx} style={{ display:"flex", alignItems:"center",
              justifyContent:"center", flexWrap:"nowrap", gap:0,
              marginBottom: rowIdx === 0 ? 16 : 0 }}>
              {row.map((step, si) => (
                <div key={step.n} style={{ display:"flex", alignItems:"center", gap:0 }}>
                  {/* Node */}
                  <div style={{ background:"var(--bg3)", border:`2px solid ${step.color}`,
                    borderRadius:10, padding:"10px 12px", textAlign:"center",
                    minWidth:120, maxWidth:140, flexShrink:0,
                    boxShadow:`0 0 12px ${step.color}22` }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{step.icon}</div>
                    <div style={{ fontSize:10, fontWeight:800, color:step.color,
                      marginBottom:2, letterSpacing:0.2 }}>
                      {step.n}. {step.label}
                    </div>
                    <div style={{ fontSize:9, color:"var(--muted)", lineHeight:1.4 }}>{step.sub}</div>
                  </div>
                  {/* Arrow (not after last in row) */}
                  {si < row.length - 1 && (
                    <div style={{ display:"flex", alignItems:"center", padding:"0 4px", flexShrink:0 }}>
                      <div style={{ height:2, width:18, background:"var(--border)" }} />
                      <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--muted)">
                        <path d="M0 0 L8 5 L0 10 Z"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {/* Wrap arrow between row 1 and row 2 */}
          <div style={{ display:"flex", justifyContent:"flex-end", margin:"0 0 4px",
            paddingRight: 0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:4, color:"var(--muted)",
              fontSize:10, fontStyle:"italic" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                <path d="M14 2 L14 8 Q14 14 8 14 L2 14" strokeLinecap="round"/>
                <path d="M5 11 L2 14 L5 17" strokeLinecap="round"/>
              </svg>
              continues…
            </div>
          </div>
          {/* Legend */}
          <div style={{ marginTop:16, borderTop:"1px solid var(--border)", paddingTop:12,
            display:"flex", gap:20, flexWrap:"wrap", justifyContent:"center" }}>
            {[["Data Flow","var(--border)","→"],["Input","var(--accent)","📂"],
              ["AI Agent","var(--accent2)","🧠"],["Output","var(--accent3)","📊"]].map(([l,c,i])=>(
              <div key={l} style={{ display:"flex", alignItems:"center", gap:5,
                fontSize:10, color:"var(--muted)" }}>
                <span style={{ color:c }}>{i}</span> {l}
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--muted)" }}>
              Total pipeline time: <strong style={{ color:"var(--accent)" }}>30–90 s</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── How It Works ────────────────────────────────────────────── */}
      <div style={{ width:"100%", maxWidth:820, marginBottom:36 }}>
        <h2 style={{ textAlign:"center", fontSize:14, fontWeight:700, color:"var(--muted)",
          textTransform:"uppercase", letterSpacing:1, marginBottom:18 }}>
          How It Works
        </h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
          {[
            { step:"1", icon:"📁", title:"Connect your data",  desc:"Upload a CSV/Excel file or paste a database connection string. DynamicBI detects the schema automatically." },
            { step:"2", icon:"⚙️", title:"AI analyses it",     desc:"10 LangGraph agents run in sequence — cleaning, anomaly detection, forecasting, profiling, and insights — all in one pipeline." },
            { step:"3", icon:"📊", title:"Dashboard appears",  desc:"A fully interactive PowerBI-style dashboard renders with charts, KPIs, filters, and AI-written insights tailored to your data." },
            { step:"4", icon:"💬", title:"Explore & export",   desc:"Ask questions in the AI Chat, drill down into segments, apply real-time filters, or export the whole thing as a portable JSON." },
          ].map(s => (
            <div key={s.step} style={{ background:"var(--bg2)", border:"1px solid var(--border)",
              borderRadius:12, padding:"16px 18px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:10, right:14, fontSize:32,
                fontWeight:900, color:"var(--border)", lineHeight:1 }}>{s.step}</div>
              <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontWeight:700, fontSize:13, color:"var(--text)", marginBottom:5 }}>{s.title}</div>
              <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{s.desc}</div>
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
