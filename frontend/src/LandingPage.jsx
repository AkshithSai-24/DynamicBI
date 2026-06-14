import { useState, useRef, useCallback } from "react";
import Footer from "./components/Footer.jsx";

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

export default function LandingPage({ onJobStart, onImport }) {
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
      const r = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
      const { job_id, connection } = await r.json();
      onJobStart(job_id, connection.slice(0, 40) + "…");
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="landing-root">
      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>⚡</div>
        <h1 style={{ fontSize:32, fontWeight:800, background:"linear-gradient(135deg,var(--accent),var(--accent2))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:8 }}>
          DynamicBI
        </h1>
        <p style={{ color:"var(--text2)", fontSize:15, maxWidth:480, margin:"0 auto" }}>
          AI-powered PowerBI-style dashboards — connect any data source, get instant interactive analytics.
        </p>
      </div>

      <div style={{ textAlign:"center", marginBottom:28, color:"var(--text2)", fontSize:15, fontWeight:700 }}>
        Developed By <span style={{ color:"var(--accent)" }}>Akshith Sai Kondamadugu</span>
      </div>

      {/* Source selector */}
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

      <p style={{ marginTop:24, color:"var(--muted)", fontSize:12 }}>
        Powered by LangGraph · NVIDIA NIM · Recharts · FastAPI
      </p>
      <Footer />
    </div>
  );
}
