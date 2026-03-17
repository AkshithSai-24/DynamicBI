import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://wwvmn2d1-8000.inc1.devtunnels.ms/";

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (v) => {
  if (typeof v !== "number") return String(v);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Number.isInteger(v) ? v.toString() : v.toFixed(2);
};

const uid = () => Math.random().toString(36).slice(2);

// ─── Message types rendered inside the chat thread ───────────────────────────
// Each message: { id, role:"assistant"|"user"|"system", type, payload, ts }

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "14px 18px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--accent)",
          display: "inline-block",
          animation: `typingBounce 1.1s ${i * 0.18}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ role }) {
  if (role === "user") return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: "var(--surface2)",
      border: "1.5px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, color: "var(--muted)",
    }}>U</div>
  );
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
      background: "linear-gradient(135deg, var(--accent), var(--accent2))",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15, fontWeight: 900, color: "#0a0f1a",
    }}>D</div>
  );
}

// ─── Bubble wrapper ───────────────────────────────────────────────────────────
function Bubble({ role, children, animate }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: 10, alignItems: "flex-start",
      marginBottom: 4,
      animation: animate ? "msgIn 0.32s cubic-bezier(.2,.8,.4,1) both" : "none",
    }}>
      <Avatar role={role} />
      <div style={{
        maxWidth: "78%",
        background: isUser ? "linear-gradient(135deg, var(--accent)22, var(--accent2)22)" : "var(--surface)",
        border: `1px solid ${isUser ? "var(--accent)44" : "var(--border)"}`,
        borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
        padding: "12px 16px",
        color: "var(--text)",
        fontSize: 14, lineHeight: 1.65,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Welcome message card ──────────────────────────────────────────────────────
function WelcomeCard() {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16, padding: "22px 24px",
      fontSize: 14, lineHeight: 1.75, color: "var(--muted)",
    }}>
      <p style={{ color: "var(--text)", fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
        👋 Welcome to DynamicBI
      </p>
      <p style={{ marginBottom: 14 }}>
        I'm your autonomous Business Intelligence analyst. Connect a data source and I'll run
        a full pipeline — cleaning, KPIs, visualisations, anomaly detection, forecasting, and
        natural-language insights — then answer any questions you have.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          ["📁", "Upload a CSV or Excel file"],
          ["🗄️", "Connect a database (SQLite / PostgreSQL / MySQL)"],
          ["💬", "Ask me anything about your data afterwards"],
        ].map(([icon, text]) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ color: "var(--text)", fontSize: 13 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline progress card ───────────────────────────────────────────────────
const STEPS = [
  "load_data", "clean_data", "kpi", "visualize",
  "anomaly_detect", "forecast", "anomaly_visual",
  "anomaly_explain", "rag_profile", "insights", "dashboard",
];
const STEP_LABELS = {
  load_data: "Load Data", clean_data: "Clean", kpi: "KPIs",
  visualize: "Visualise", anomaly_detect: "Anomalies", forecast: "Forecast",
  anomaly_visual: "Anomaly Viz", anomaly_explain: "Explain", rag_profile: "Profile",
  insights: "Insights", dashboard: "Dashboard",
};

function PipelineCard({ progress, stage }) {
  const doneCount = Math.round((progress / 100) * STEPS.length);
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Running pipeline…</span>
        <span style={{ fontSize: 12, color: "var(--accent)", fontFamily: "var(--mono)" }}>{progress}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--surface2)", borderRadius: 100, overflow: "hidden", marginBottom: 16 }}>
        <div style={{
          width: `${progress}%`, height: "100%",
          background: "linear-gradient(90deg, var(--accent), var(--accent2))",
          borderRadius: 100,
          transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {STEPS.map((s, i) => {
          const done = i < doneCount;
          const active = i === doneCount;
          return (
            <div key={s} style={{
              padding: "3px 10px", borderRadius: 100, fontSize: 11,
              fontFamily: "var(--mono)",
              background: done ? "var(--accent)18" : active ? "var(--accent2)18" : "var(--surface2)",
              border: `1px solid ${done ? "var(--accent)55" : active ? "var(--accent2)55" : "var(--border)"}`,
              color: done ? "var(--accent)" : active ? "var(--accent2)" : "var(--muted)",
              transition: "all 0.4s",
            }}>
              {done ? "✓ " : active ? "⟳ " : ""}{STEP_LABELS[s]}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        {stage}
      </p>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────
function KpiStrip({ kpis }) {
  const show = kpis.slice(0, 8);
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px",
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 14, fontFamily: "var(--mono)", letterSpacing: 1 }}>
        KEY METRICS
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {show.map((k, i) => {
          const isSum = k.Metric.startsWith("SUM_");
          const isAvg = k.Metric.startsWith("AVG_");
          const accent = isSum ? "var(--accent)" : isAvg ? "var(--accent2)" : "var(--accent3)";
          const label = k.Metric.replace(/^(SUM|AVG)_/, "");
          return (
            <div key={i} style={{
              background: "var(--surface2)", borderRadius: 12, padding: "12px 14px",
              border: `1px solid var(--border)`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 50, height: 50, background: `radial-gradient(circle at top right, ${accent}18, transparent)` }} />
              <p style={{ fontSize: 10, color: accent, fontFamily: "var(--mono)", letterSpacing: 1, marginBottom: 5 }}>
                {isSum ? "Σ" : isAvg ? "μ" : "#"} {label.toUpperCase().slice(0, 14)}
              </p>
              <p style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{fmt(k.Value)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chart gallery ────────────────────────────────────────────────────────────
function ChartGallery({ charts, onExpand }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px",
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 14, fontFamily: "var(--mono)", letterSpacing: 1 }}>
        VISUALISATIONS · {charts.length} charts
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {charts.map((c, i) => (
          <div key={i} onClick={() => onExpand(c)} style={{
            borderRadius: 10, overflow: "hidden", cursor: "pointer",
            border: "1px solid var(--border)",
            transition: "transform 0.2s, border-color 0.2s, box-shadow 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 8px 24px #0005"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = ""; }}
          >
            <img src={`data:image/png;base64,${c.data}`} alt={c.name} style={{ width: "100%", display: "block" }} />
            <div style={{ padding: "7px 10px", background: "var(--surface2)" }}>
              <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{c.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insights card ────────────────────────────────────────────────────────────
function InsightsCard({ insights, anomaly, cleaning }) {
  const [tab, setTab] = useState("insights");
  const tabs = [
    { id: "insights", label: "💡 Insights", text: insights },
    { id: "anomaly",  label: "⚠ Anomalies", text: anomaly },
    { id: "cleaning", label: "✓ Cleaning",  text: cleaning },
  ].filter(t => t.text);

  const active = tabs.find(t => t.id === tab) || tabs[0];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, overflow: "hidden",
    }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "11px 14px", border: "none", cursor: "pointer",
            background: (active?.id === t.id) ? "var(--surface2)" : "transparent",
            color: (active?.id === t.id) ? "var(--text)" : "var(--muted)",
            fontWeight: (active?.id === t.id) ? 600 : 400,
            fontSize: 12, fontFamily: "var(--sans)",
            borderBottom: (active?.id === t.id) ? "2px solid var(--accent)" : "2px solid transparent",
            transition: "all 0.18s",
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ padding: "16px 18px", maxHeight: 280, overflowY: "auto" }}>
        {active?.text.split("\n").filter(Boolean).map((line, i) => (
          <p key={i} style={{
            fontSize: 13, lineHeight: 1.7, color: "var(--muted)",
            marginBottom: 6, paddingLeft: line.trim().startsWith("-") ? 12 : 0,
          }}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// ─── Summary done card ────────────────────────────────────────────────────────
function DoneCard({ result, onAskQuestion }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--accent)33",
      borderRadius: 16, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--accent)22", border: "1.5px solid var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14,
        }}>✓</div>
        <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Analysis complete</p>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.65 }}>
        I've finished analysing your dataset. Here's what I found — scroll up to explore the
        charts, KPIs, and insights. You can also ask me anything below.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[
          "What are the top anomalies?",
          "Summarise the key trends",
          "Which metric has the highest risk?",
          "What actions do you recommend?",
        ].map(q => (
          <button key={q} onClick={() => onAskQuestion(q)} style={{
            padding: "7px 13px", borderRadius: 100, border: "1px solid var(--border)",
            background: "var(--surface2)", color: "var(--muted)",
            fontSize: 12, cursor: "pointer", fontFamily: "var(--sans)",
            transition: "all 0.18s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
          >{q}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ chart, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 32,
    }}>
      <div onClick={e => e.stopPropagation()}>
        <img src={`data:image/png;base64,${chart.data}`} alt={chart.name}
          style={{ maxWidth: "90vw", maxHeight: "84vh", borderRadius: 14, display: "block" }} />
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--accent)", fontFamily: "var(--mono)" }}>
          {chart.name} · Esc to close
        </p>
      </div>
    </div>
  );
}

// ─── Input bar ────────────────────────────────────────────────────────────────
function InputBar({ onSend, onFileSelect, onDbConnect, disabled, placeholder, showSourceButtons }) {
  const [text, setText] = useState("");
  const [dbMode, setDbMode] = useState(false);
  const [dbConn, setDbConn] = useState("");
  const [dbTable, setDbTable] = useState("");
  const fileRef = useRef();
  const textRef = useRef();

  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText("");
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) { alert("CSV or Excel only."); return; }
    onFileSelect(f);
    e.target.value = "";
  };

  const submitDb = () => {
    if (!dbConn.trim()) return;
    onDbConnect(dbConn.trim(), dbTable.trim() || null);
    setDbConn(""); setDbTable(""); setDbMode(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* DB expand panel */}
      {dbMode && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 10,
          animation: "msgIn 0.22s ease both",
        }}>
          <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1 }}>DATABASE CONNECTION</p>
          <input value={dbConn} onChange={e => setDbConn(e.target.value)}
            placeholder="postgresql://user:pass@host:5432/db  or  sqlite:///file.db"
            style={{
              background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 9,
              padding: "10px 13px", color: "var(--text)", fontSize: 13,
              fontFamily: "var(--mono)", outline: "none", width: "100%",
            }}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <input value={dbTable} onChange={e => setDbTable(e.target.value)}
            placeholder="table name (optional — uses first table)"
            style={{
              background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 9,
              padding: "10px 13px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%",
            }}
            onFocus={e => e.target.style.borderColor = "var(--accent2)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {["sqlite:///data.db", "postgresql://user:pass@localhost:5432/db", "mysql+pymysql://user:pass@localhost/db"].map(ex => (
              <button key={ex} onClick={() => setDbConn(ex)} style={{
                padding: "4px 10px", borderRadius: 100, fontSize: 10,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--accent)", cursor: "pointer", fontFamily: "var(--mono)",
              }}>{ex.split("://")[0]}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitDb} disabled={!dbConn.trim()} style={{
              flex: 1, padding: "10px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
              color: "#0a0f1a", fontWeight: 700, cursor: "pointer", fontSize: 13,
              fontFamily: "var(--sans)", opacity: dbConn.trim() ? 1 : 0.4,
            }}>Connect & Analyse</button>
            <button onClick={() => setDbMode(false)} style={{
              padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border)",
              background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13,
              fontFamily: "var(--sans)",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Main bar */}
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-end",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "8px 8px 8px 14px",
        boxShadow: "0 2px 16px #0004",
        transition: "border-color 0.2s",
      }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "var(--accent)44"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "var(--border)"}
      >
        {/* Left action buttons */}
        {showSourceButtons && (
          <div style={{ display: "flex", gap: 4, alignSelf: "center" }}>
            <button onClick={() => fileRef.current.click()} title="Upload file" style={{
              width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)",
              background: "var(--surface2)", color: "var(--muted)",
              cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.18s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
            >📁</button>
            <button onClick={() => setDbMode(m => !m)} title="Connect database" style={{
              width: 34, height: 34, borderRadius: 9,
              border: `1px solid ${dbMode ? "var(--accent)" : "var(--border)"}`,
              background: dbMode ? "var(--accent)18" : "var(--surface2)",
              color: dbMode ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.18s",
            }}>🗄️</button>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />

        {/* Text input */}
        <input
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder || "Ask a question about your data…"}
          disabled={disabled}
          style={{
            flex: 1, background: "transparent", border: "none",
            color: "var(--text)", fontSize: 14, outline: "none",
            padding: "6px 0", lineHeight: 1.5,
            opacity: disabled ? 0.4 : 1,
            fontFamily: "var(--sans)",
          }}
        />

        {/* Send */}
        <button onClick={submit} disabled={!text.trim() || disabled} style={{
          width: 36, height: 36, borderRadius: 10, border: "none",
          background: (!text.trim() || disabled)
            ? "var(--surface2)"
            : "linear-gradient(135deg, var(--accent), var(--accent2))",
          color: (!text.trim() || disabled) ? "var(--muted)" : "#0a0f1a",
          cursor: (!text.trim() || disabled) ? "default" : "pointer",
          fontSize: 15, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}>➤</button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ sessions, activeId, onSelect, onNew }) {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: "var(--sidebar)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      padding: "0 0 16px",
    }}>
      {/* Logo */}
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 900, color: "#0a0f1a",
        }}>D</div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", letterSpacing: -0.3 }}>DynamicBI</p>
          <p style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1 }}>AUTONOMOUS BI</p>
        </div>
      </div>

      {/* New session */}
      <div style={{ padding: "12px 12px 8px" }}>
        <button onClick={onNew} style={{
          width: "100%", padding: "9px 12px", borderRadius: 10,
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--muted)", cursor: "pointer", fontSize: 12,
          fontFamily: "var(--sans)", textAlign: "left",
          transition: "all 0.18s",
          display: "flex", alignItems: "center", gap: 8,
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          <span style={{ fontSize: 16 }}>+</span> New session
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        {sessions.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--muted)", padding: "8px 4px", fontFamily: "var(--mono)" }}>No sessions yet</p>
        )}
        {sessions.map(s => (
          <button key={s.id} onClick={() => onSelect(s.id)} style={{
            width: "100%", padding: "9px 10px", borderRadius: 8,
            background: s.id === activeId ? "var(--surface)" : "transparent",
            border: `1px solid ${s.id === activeId ? "var(--border)" : "transparent"}`,
            color: s.id === activeId ? "var(--text)" : "var(--muted)",
            cursor: "pointer", fontSize: 12, textAlign: "left",
            fontFamily: "var(--sans)", marginBottom: 3,
            transition: "all 0.15s",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <span style={{ marginRight: 6 }}>
              {s.sourceType === "db" ? "🗄️" : s.sourceType === "file" ? "📁" : "💬"}
            </span>
            {s.label || "New session"}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px 0", borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
          LangGraph · Prophet<br />Isolation Forest · Mistral
        </p>
      </div>
    </aside>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [sessions, setSessions] = useState([{ id: "s1", label: "Getting started", sourceType: null, messages: [], jobId: null, result: null, status: "idle" }]);
  const [activeId, setActiveId] = useState("s1");
  const [lightbox, setLightbox] = useState(null);
  const pollRef = useRef({});
  const bottomRef = useRef();

  const getSession = useCallback(id => sessions.find(s => s.id === id), [sessions]);
  const active = getSession(activeId);

  const updateSession = useCallback((id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const addMessage = useCallback((sessionId, msg) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, { id: uid(), ts: Date.now(), animate: true, ...msg }] }
        : s
    ));
  }, []);

  const updateLastMessage = useCallback((sessionId, patch) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
      return { ...s, messages: msgs };
    }));
  }, []);

  // scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions]);

  // ── Polling ────────────────────────────────────────────────────────────────
  const startPoll = useCallback((sessionId, jobId) => {
    clearInterval(pollRef.current[sessionId]);
    pollRef.current[sessionId] = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/status/${jobId}`);
        const d = await r.json();

        // Update pipeline card (last assistant message with type "pipeline")
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s;
          const msgs = s.messages.map(m =>
            m.type === "pipeline" ? { ...m, payload: { ...m.payload, progress: d.progress, stage: d.stage } } : m
          );
          return { ...s, messages: msgs };
        }));

        if (d.status === "done") {
          clearInterval(pollRef.current[sessionId]);
          const res = await fetch(`${API}/api/result/${jobId}`);
          const result = await res.json();

          setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            // Remove pipeline card, push result cards
            const msgs = s.messages.filter(m => m.type !== "pipeline");
            return {
              ...s, status: "done", result,
              messages: [
                ...msgs,
                { id: uid(), role: "assistant", type: "kpis",     payload: result, animate: true },
                { id: uid(), role: "assistant", type: "charts",   payload: result, animate: true },
                { id: uid(), role: "assistant", type: "insights", payload: result, animate: true },
                { id: uid(), role: "assistant", type: "done",     payload: result, animate: true },
              ],
            };
          }));
        } else if (d.status === "error") {
          clearInterval(pollRef.current[sessionId]);
          setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            const msgs = s.messages.filter(m => m.type !== "pipeline");
            return {
              ...s, status: "error",
              messages: [...msgs, {
                id: uid(), role: "assistant", type: "text", animate: true,
                payload: { text: `⚠ Pipeline failed: ${d.error || "Unknown error"}. Check that the backend and Ollama are running.` }
              }],
            };
          }));
        }
      } catch { /* keep polling */ }
    }, 1500);
  }, []);

  // ── Start pipeline (file or db) ────────────────────────────────────────────
  const launchPipeline = useCallback(async (sessionId, endpoint, body, label, sourceType, isFormData) => {
    updateSession(sessionId, { label, sourceType, status: "running" });

    addMessage(sessionId, {
      role: "assistant", type: "text",
      payload: { text: `Got it! I'm starting the analysis pipeline on **${label}**. This runs 11 AI agents in sequence — I'll show you the results as they complete.` }
    });
    addMessage(sessionId, {
      role: "assistant", type: "pipeline",
      payload: { progress: 0, stage: "Initialising…" }
    });

    try {
      const opts = isFormData
        ? { method: "POST", body }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };

      const r = await fetch(`${API}${endpoint}`, opts);
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Request failed"); }
      const { job_id } = await r.json();
      updateSession(sessionId, { jobId: job_id });
      startPoll(sessionId, job_id);
    } catch (err) {
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        const msgs = s.messages.filter(m => m.type !== "pipeline");
        return {
          ...s, status: "error",
          messages: [...msgs, { id: uid(), role: "assistant", type: "text", animate: true, payload: { text: `⚠ ${err.message}` } }],
        };
      }));
    }
  }, [updateSession, addMessage, startPoll]);

  const handleFile = useCallback((file) => {
    const sid = activeId;
    addMessage(sid, { role: "user", type: "text", payload: { text: `Upload: ${file.name}` } });
    const fd = new FormData();
    fd.append("file", file);
    launchPipeline(sid, "/api/upload", fd, file.name, "file", true);
  }, [activeId, addMessage, launchPipeline]);

  const handleDb = useCallback((conn, table) => {
    const sid = activeId;
    addMessage(sid, { role: "user", type: "text", payload: { text: `Connect: ${conn}${table ? ` · table: ${table}` : ""}` } });
    launchPipeline(sid, "/api/connect", { connection_string: conn, table }, conn, "db", false);
  }, [activeId, addMessage, launchPipeline]);

  // ── NL query ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (question) => {
    const sid = activeId;
    const sess = sessions.find(s => s.id === sid);
    addMessage(sid, { role: "user", type: "text", payload: { text: question } });

    if (!sess?.jobId || sess.status !== "done") {
      addMessage(sid, { role: "assistant", type: "text", payload: { text: "Please connect a data source first — upload a file or connect a database using the buttons below." } });
      return;
    }

    // Typing indicator
    const typingId = uid();
    setSessions(prev => prev.map(s =>
      s.id === sid ? { ...s, messages: [...s.messages, { id: typingId, role: "assistant", type: "typing", animate: true }] } : s
    ));

    try {
      const r = await fetch(`${API}/api/query/${sess.jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const d = await r.json();
      setSessions(prev => prev.map(s => {
        if (s.id !== sid) return s;
        const msgs = s.messages.filter(m => m.id !== typingId);
        return { ...s, messages: [...msgs, { id: uid(), role: "assistant", type: "text", animate: true, payload: { text: d.answer } }] };
      }));
    } catch {
      setSessions(prev => prev.map(s => {
        if (s.id !== sid) return s;
        const msgs = s.messages.filter(m => m.id !== typingId);
        return { ...s, messages: [...msgs, { id: uid(), role: "assistant", type: "text", animate: true, payload: { text: "⚠ Could not reach the backend." } }] };
      }));
    }
  }, [activeId, sessions, addMessage]);

  // ── Session management ─────────────────────────────────────────────────────
  const newSession = () => {
    const id = "s" + uid();
    setSessions(prev => [...prev, { id, label: "New session", sourceType: null, messages: [], jobId: null, result: null, status: "idle" }]);
    setActiveId(id);
  };

  // ── Render messages ────────────────────────────────────────────────────────
  const renderMessage = (msg) => {
    switch (msg.type) {
      case "text":
        return (
          <Bubble key={msg.id} role={msg.role} animate={msg.animate}>
            {msg.payload.text.split("\n").map((line, i) => (
              <span key={i}>{line}{i < msg.payload.text.split("\n").length - 1 && <br />}</span>
            ))}
          </Bubble>
        );

      case "typing":
        return (
          <div key={msg.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4, animation: "msgIn 0.25s ease both" }}>
            <Avatar role="assistant" />
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 18px 18px 18px" }}>
              <TypingDots />
            </div>
          </div>
        );

      case "pipeline":
        return (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.3s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <PipelineCard progress={msg.payload.progress} stage={msg.payload.stage} />
              </div>
            </div>
          </div>
        );

      case "kpis":
        return msg.payload.kpis?.length ? (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.35s 0.05s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <KpiStrip kpis={msg.payload.kpis} />
              </div>
            </div>
          </div>
        ) : null;

      case "charts":
        return msg.payload.charts?.length ? (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.35s 0.1s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <ChartGallery charts={msg.payload.charts} onExpand={setLightbox} />
              </div>
            </div>
          </div>
        ) : null;

      case "insights":
        return (msg.payload.insights || msg.payload.anomaly_report || msg.payload.cleaning_report) ? (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.35s 0.15s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <InsightsCard
                  insights={msg.payload.insights}
                  anomaly={msg.payload.anomaly_report}
                  cleaning={msg.payload.cleaning_report}
                />
              </div>
            </div>
          </div>
        ) : null;

      case "done":
        return (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.35s 0.2s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <DoneCard result={msg.payload} onAskQuestion={handleSend} />
              </div>
            </div>
          </div>
        );

      default: return null;
    }
  };

  const isRunning = active?.status === "running";
  const isDone = active?.status === "done";
  const hasMessages = active?.messages?.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600;700;800&display=swap');

        :root {
          --bg:       #0e1117;
          --sidebar:  #090c12;
          --surface:  #161b27;
          --surface2: #1c2333;
          --border:   #232c3e;
          --text:     #e8ecf4;
          --muted:    #6b7a9a;
          --accent:   #4ade80;
          --accent2:  #60a5fa;
          --accent3:  #f59e0b;
          --sans:     'Bricolage Grotesque', sans-serif;
          --mono:     'DM Mono', monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        input::placeholder { color: var(--muted); }
        textarea::placeholder { color: var(--muted); }

        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* Sidebar */}
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={newSession}
        />

        {/* Main chat area */}
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          height: "100vh", overflow: "hidden", position: "relative",
        }}>

          {/* Top bar */}
          <div style={{
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
            background: "var(--bg)",
          }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                {active?.label || "New session"}
              </p>
              <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                {active?.status === "running" ? "⟳ Analysing…"
                  : active?.status === "done" ? `✓ Ready · ${active.result?.charts?.length ?? 0} charts · ${active.result?.kpis?.length ?? 0} KPIs`
                  : active?.status === "error" ? "⚠ Error"
                  : "No data connected"}
              </p>
            </div>
            {isDone && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={newSession} style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted)", cursor: "pointer", fontSize: 12,
                  fontFamily: "var(--sans)",
                  transition: "all 0.18s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
                >+ New session</button>
              </div>
            )}
          </div>

          {/* Messages thread */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "24px 28px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* Welcome (only on empty session) */}
            {!hasMessages && (
              <div style={{ animation: "msgIn 0.4s ease both" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Avatar role="assistant" />
                  <div style={{ flex: 1, maxWidth: 580 }}>
                    <WelcomeCard />
                  </div>
                </div>
              </div>
            )}

            {/* Message list */}
            {active?.messages.map(msg => renderMessage(msg))}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: "14px 24px 20px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            background: "var(--bg)",
          }}>
            <InputBar
              onSend={handleSend}
              onFileSelect={handleFile}
              onDbConnect={handleDb}
              disabled={isRunning}
              placeholder={
                isRunning ? "Pipeline running — please wait…"
                : isDone ? "Ask me anything about your data…"
                : "Upload a file or connect a database to begin…"
              }
              showSourceButtons={!isRunning}
            />
            <p style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", marginTop: 10, fontFamily: "var(--mono)" }}>
              DynamicBI · Autonomous BI powered by LangGraph
            </p>
          </div>
        </main>
      </div>

      {lightbox && <Lightbox chart={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}