import { useState, useEffect, useRef, useCallback } from "react";
import LandingPage from "./LandingPage.jsx";

const API = "http://127.0.0.1:8000";

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
    <div style={{ display: "flex", gap: 5, padding: "12px 16px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: i === 0 ? "var(--accent)" : i === 1 ? "var(--accent2)" : "var(--accent4)",
          display: "inline-block",
          animation: `typingBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          boxShadow: i === 0 ? "0 0 6px var(--accent)" : i === 1 ? "0 0 6px var(--accent2)" : "0 0 6px var(--accent4)",
        }} />
      ))}
      <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6, fontFamily: "var(--mono)" }}>analysing…</span>
    </div>
  );
}


// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ role }) {
  if (role === "user") return (
    <div style={{
      width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, var(--surface3), var(--surface2))",
      border: "1.5px solid var(--border2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, color: "var(--muted2)", fontWeight: 700,
      fontFamily: "var(--mono)",
    }}>U</div>
  );
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
      background: "linear-gradient(135deg, #00e5a0, #4d9fff)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 900, color: "#07090f",
      boxShadow: "0 0 12px rgba(0,229,160,0.3)",
    }}>D</div>
  );
}

// ─── Bubble wrapper ───────────────────────────────────────────────────────────
function Bubble({ role, children, animate, ts }) {
  const isUser = role === "user";
  const time = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="msg-row" style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: 10, alignItems: "flex-start",
      marginBottom: 2,
      animation: animate ? "msgIn 0.38s cubic-bezier(.2,.8,.4,1) both" : "none",
      position: "relative",
    }}>
      <Avatar role={role} />
      <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
        <div style={{
          background: isUser
            ? "linear-gradient(135deg, rgba(0,229,160,0.09), rgba(77,159,255,0.07))"
            : "linear-gradient(145deg, var(--surface), var(--surface2))",
          border: `1px solid ${isUser ? "rgba(0,229,160,0.22)" : "var(--border)"}`,
          borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
          padding: "11px 16px",
          color: "var(--text)",
          fontSize: 13.5, lineHeight: 1.72,
          backdropFilter: "blur(8px)",
          boxShadow: isUser
            ? "0 4px 16px rgba(0,229,160,0.06), inset 0 1px 0 rgba(0,229,160,0.06)"
            : "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.025)",
        }}>
          {children}
        </div>
        {time && (
          <span className="msg-ts" style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", paddingLeft: isUser ? 0 : 4, paddingRight: isUser ? 4 : 0 }}>
            {time}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Welcome message card ──────────────────────────────────────────────────────
function WelcomeCard() {
  return (
    <div style={{
      background: "linear-gradient(135deg, var(--surface), var(--surface2))",
      border: "1px solid var(--border2)",
      borderRadius: 20, padding: "28px 28px",
      position: "relative", overflow: "hidden",
    }}>
      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,160,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: "linear-gradient(135deg, #00e5a0, #4d9fff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 0 16px rgba(0,229,160,0.3)",
        }}>⚡</div>
        <div>
          <p style={{ color: "var(--text)", fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>
            Welcome to DynamicBI
          </p>
          <p style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--mono)", marginTop: 2 }}>
            Powered by LangGraph · AI-native analytics
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13.5, color: "var(--muted2)", lineHeight: 1.75, marginBottom: 20 }}>
        Your intelligent BI analyst. Connect a data source and I'll run a full automated pipeline —
        cleaning, KPIs, visualisations, anomaly detection, forecasting, and natural-language insights.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { icon: "📁", label: "Upload File", sub: "CSV, Excel (.xlsx/.xls)" },
          { icon: "🗄️", label: "Connect Database", sub: "SQLite · PostgreSQL · MySQL · MongoDB" },
          { icon: "📊", label: "Auto KPIs", sub: "Revenue, growth, trends" },
          { icon: "💬", label: "Ask Anything", sub: "Natural language Q&A" },
        ].map(({ icon, label, sub }) => (
          <div key={label} className="feat-card" style={{
            background: "var(--surface3)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "11px 14px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{label}</p>
              <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>{sub}</p>
            </div>
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
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, padding: "22px 24px",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background shimmer */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(0,229,160,0.02) 0%, transparent 50%, rgba(77,159,255,0.02) 100%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 8px var(--accent)",
            animation: "pulse-dot 1.5s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Pipeline Running</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{doneCount}/{STEPS.length} steps</span>
          <span style={{
            fontSize: 14, fontWeight: 800, color: "var(--accent)",
            fontFamily: "var(--mono)", minWidth: 40, textAlign: "right",
          }}>{progress}%</span>
        </div>
      </div>

      {/* Progress track */}
      <div style={{ height: 6, background: "var(--surface3)", borderRadius: 100, overflow: "hidden", marginBottom: 18, position: "relative" }}>
        <div style={{
          width: `${progress}%`, height: "100%",
          background: "linear-gradient(90deg, var(--accent), var(--accent2), var(--accent4))",
          backgroundSize: "200% auto",
          borderRadius: 100,
          transition: "width 0.7s cubic-bezier(.4,0,.2,1)",
          animation: "progress-shimmer 2s linear infinite",
          boxShadow: "0 0 10px rgba(0,229,160,0.4)",
        }} />
      </div>

      {/* Step pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {STEPS.map((s, i) => {
          const done = i < doneCount;
          const active = i === doneCount;
          return (
            <div key={s} className="step-pill" style={{
              padding: "4px 11px", borderRadius: 100, fontSize: 10.5,
              fontFamily: "var(--mono)",
              background: done ? "rgba(0,229,160,0.1)" : active ? "rgba(77,159,255,0.12)" : "var(--surface3)",
              border: `1px solid ${done ? "rgba(0,229,160,0.35)" : active ? "rgba(77,159,255,0.4)" : "var(--border)"}`,
              color: done ? "var(--accent)" : active ? "var(--accent2)" : "var(--muted)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {done && <span style={{ fontSize: 8 }}>✓</span>}
              {active && <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 8 }}>⟳</span>}
              {STEP_LABELS[s]}
            </div>
          );
        })}
      </div>

      {stage && (
        <p style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", paddingLeft: 4, borderLeft: "2px solid var(--border2)", paddingLeft: 10 }}>
          {stage}
        </p>
      )}
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────
function KpiStrip({ kpis }) {
  const show = kpis.slice(0, 8);
  const ACCENTS = ["var(--accent)", "var(--accent2)", "var(--accent3)", "var(--accent4)", "var(--danger)", "var(--accent)", "var(--accent2)", "var(--accent3)"];
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, padding: "20px 22px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📊</div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>
          KEY METRICS
        </p>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
          {show.length} of {kpis.length} shown
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
        {show.map((k, i) => {
          const isSum = k.Metric.startsWith("SUM_");
          const isAvg = k.Metric.startsWith("AVG_");
          const accent = ACCENTS[i % ACCENTS.length];
          const label = k.Metric.replace(/^(SUM|AVG)_/, "");
          const prefix = isSum ? "Σ" : isAvg ? "μ" : "#";
          return (
            <div key={i} className="kpi-card" style={{
              background: "linear-gradient(145deg, var(--surface2), var(--surface3))",
              borderRadius: 14, padding: "14px 16px",
              border: `1px solid var(--border)`,
              position: "relative", overflow: "hidden",
              transition: "border-color 0.25s, transform 0.25s, box-shadow 0.25s",
              cursor: "default",
              boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at top right, ${accent}15, transparent)` }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 2, background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
              <p style={{ fontSize: 9.5, color: accent, fontFamily: "var(--mono)", letterSpacing: 1.2, marginBottom: 7, fontWeight: 600 }}>
                {prefix} {label.toUpperCase().slice(0, 14)}
              </p>
              <p style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: -0.5 }}>{fmt(k.Value)}</p>
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
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, padding: "20px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(77,159,255,0.12)", border: "1px solid rgba(77,159,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📈</div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>
          VISUALISATIONS
        </p>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
          {charts.length} chart{charts.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
        {charts.map((c, i) => (
          <div key={i} className="chart-card" onClick={() => onExpand(c)} style={{
            borderRadius: 12, overflow: "hidden", cursor: "pointer",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            position: "relative",
          }}>
            <div style={{ position: "relative", overflow: "hidden" }}>
              <img src={`data:image/png;base64,${c.data}`} alt={c.name} style={{ width: "100%", display: "block" }} />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(0deg, rgba(14,17,32,0.5) 0%, transparent 50%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "3px 8px",
                fontSize: 9, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)",
              }}>click to expand</div>
            </div>
            <div style={{ padding: "9px 12px", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
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
    { id: "insights", label: "💡 Insights", text: insights, color: "var(--accent3)" },
    { id: "anomaly",  label: "⚠ Anomalies", text: anomaly,  color: "var(--danger)" },
    { id: "cleaning", label: "✓ Cleaning",  text: cleaning,  color: "var(--accent)" },
  ].filter(t => t.text);

  const activeTab = tabs.find(t => t.id === tab) || tabs[0];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, overflow: "hidden",
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)",
        background: "var(--surface2)",
      }}>
        {tabs.map(t => (
          <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "12px 14px", border: "none", cursor: "pointer",
            background: "transparent",
            color: (activeTab?.id === t.id) ? "var(--text)" : "var(--muted)",
            fontWeight: (activeTab?.id === t.id) ? 700 : 400,
            fontSize: 12, fontFamily: "var(--sans)",
            borderBottom: (activeTab?.id === t.id) ? `2px solid ${t.color}` : "2px solid transparent",
            position: "relative",
          }}>
            {t.label}
            {(activeTab?.id === t.id) && (
              <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: "18px 20px", maxHeight: 300, overflowY: "auto" }}>
        {activeTab?.text.split("\n").filter(Boolean).map((line, i) => {
          const isItem = line.trim().startsWith("-") || line.trim().startsWith("•");
          return (
            <p key={i} style={{
              fontSize: 13, lineHeight: 1.75, color: isItem ? "var(--muted2)" : "var(--text)",
              marginBottom: 8,
              paddingLeft: isItem ? 16 : 0,
              position: "relative",
            }}>
              {isItem && (
                <span style={{ position: "absolute", left: 0, top: "0.55em", width: 5, height: 5, borderRadius: "50%", background: activeTab.color, display: "inline-block" }} />
              )}
              {isItem ? line.replace(/^[-•]\s*/, "") : line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ─── Summary done card ────────────────────────────────────────────────────────
function DoneCard({ result, onAskQuestion }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,229,160,0.06), rgba(77,159,255,0.04))",
      border: "1px solid rgba(0,229,160,0.25)",
      borderRadius: 18, padding: "22px 24px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -30, right: -30,
        width: 120, height: 120, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,160,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(0,229,160,0.15)", border: "1.5px solid rgba(0,229,160,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, boxShadow: "0 0 12px rgba(0,229,160,0.2)",
        }}>✓</div>
        <div>
          <p style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>Analysis Complete</p>
          <p style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--mono)", marginTop: 2 }}>
            {result?.charts?.length ?? 0} charts · {result?.kpis?.length ?? 0} KPIs generated
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--muted2)", marginBottom: 18, lineHeight: 1.7 }}>
        Your dataset has been fully analysed. Explore the charts, KPIs and insights above, or ask me any follow-up question below.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {[
          "What are the top anomalies?",
          "Summarise the key trends",
          "Which metric has the highest risk?",
          "What actions do you recommend?",
        ].map(q => (
          <button key={q} className="suggest-chip" onClick={() => onAskQuestion(q)} style={{
            padding: "7px 14px", borderRadius: 100,
            border: "1px solid var(--border2)",
            background: "var(--surface2)", color: "var(--muted2)",
            fontSize: 11.5, cursor: "pointer", fontFamily: "var(--sans)",
          }}>{q}</button>
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
      background: "rgba(5,7,16,0.92)", backdropFilter: "blur(20px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 40,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: -14, right: -14, zIndex: 10,
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--surface3)", border: "1px solid var(--border2)",
          color: "var(--muted2)", cursor: "pointer", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--danger)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--danger)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--muted2)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
        >✕</button>

        <div style={{
          border: "1px solid var(--border2)", borderRadius: 18, overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        }}>
          <img src={`data:image/png;base64,${chart.data}`} alt={chart.name}
            style={{ maxWidth: "88vw", maxHeight: "80vh", display: "block" }} />
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
          <p style={{ fontSize: 12, color: "var(--muted2)", fontFamily: "var(--mono)" }}>
            {chart.name}
          </p>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>· Esc to close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Input bar ────────────────────────────────────────────────────────────────
// DB panel steps:
//   "conn"   → user types connection string, clicks Inspect
//   "picking" → loading spinner while /api/db/inspect runs
//   "table"  → user picks database (MongoDB only) + table/collection from list
function InputBar({ onSend, onFileSelect, onDbConnect, disabled, placeholder, showSourceButtons }) {
  const [text, setText] = useState("");
  // DB panel state
  const [dbMode, setDbMode] = useState(false);
  const [dbStep, setDbStep] = useState("conn");   // "conn" | "picking" | "table"
  const [dbConn, setDbConn] = useState("");
  const [dbInspectError, setDbInspectError] = useState("");
  const [dbType, setDbType] = useState("");        // "sql" | "mongodb"
  const [dbDatabases, setDbDatabases] = useState([]);
  const [dbCollections, setDbCollections] = useState({});
  const [dbTables, setDbTables] = useState([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [selectedTable, setSelectedTable] = useState("");

  const fileRef = useRef();

  const resetDb = () => {
    setDbStep("conn"); setDbConn(""); setDbInspectError("");
    setDbType(""); setDbDatabases([]); setDbCollections({});
    setDbTables([]); setSelectedDb(""); setSelectedTable("");
  };

  const closeDb = () => { setDbMode(false); resetDb(); };

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

  // Step 1 → call /api/db/inspect
  const handleInspect = async () => {
    if (!dbConn.trim()) return;
    setDbInspectError("");
    setDbStep("picking");
    try {
      const r = await fetch(`${API}/api/db/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_string: dbConn.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Inspection failed");
      setDbType(d.type);
      if (d.type === "sql") {
        setDbTables(d.tables || []);
        setSelectedTable(d.tables?.[0] || "");
      } else {
        setDbDatabases(d.databases || []);
        setDbCollections(d.collections || {});
        const firstDb = d.databases?.[0] || "";
        setSelectedDb(firstDb);
        setSelectedTable(d.collections?.[firstDb]?.[0] || "");
      }
      setDbStep("table");
    } catch (err) {
      setDbInspectError(err.message);
      setDbStep("conn");
    }
  };

  // Step 2 → launch pipeline
  const handleLaunch = () => {
    if (!selectedTable) return;
    const database = dbType === "mongodb" ? selectedDb : undefined;
    onDbConnect(dbConn.trim(), selectedTable, database);
    closeDb();
  };

  // When selected DB changes in MongoDB mode, update collection list
  const handleDbChange = (db) => {
    setSelectedDb(db);
    const cols = dbCollections[db] || [];
    setSelectedTable(cols[0] || "");
  };

  // DB connector metadata
  const DB_CONNECTORS = [
    { id: "sqlite",   label: "SQLite",     icon: "💾", color: "#60d394", example: "sqlite:///data.db",                                              hint: "Local file-based database" },
    { id: "postgres", label: "PostgreSQL", icon: "🐘", color: "#4d9fff", example: "postgresql://user:pass@localhost:5432/dbname",                   hint: "Most feature-rich open-source DB" },
    { id: "mysql",    label: "MySQL",      icon: "🐬", color: "#f4a535", example: "mysql+pymysql://user:pass@localhost/dbname",                     hint: "World's most popular open-source DB" },
    { id: "oracle",   label: "Oracle",     icon: "🔴", color: "#ff5e7a", example: "oracle+oracledb://user:pass@host:1521/?service_name=ORCLPDB1",   hint: "Enterprise-grade relational database" },
    { id: "mongodb",  label: "MongoDB",    icon: "🍃", color: "#00e5a0", example: "mongodb+srv://user:pass@cluster.mongodb.net/",                   hint: "Leading NoSQL document database" },
  ];

  const [selectedConnector, setSelectedConnector] = useState(null);

  const selectStyle = {
    background: "rgba(20,24,40,0.8)", border: "1px solid var(--border2)", borderRadius: 10,
    padding: "9px 13px", color: "var(--text)", fontSize: 13, outline: "none",
    width: "100%", cursor: "pointer", fontFamily: "var(--sans)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Futuristic DB panel ── */}
      {dbMode && (
        <div style={{
          background: "linear-gradient(145deg, rgba(14,17,32,0.98), rgba(10,13,24,0.98))",
          border: "1px solid var(--border2)", borderRadius: 20, overflow: "hidden",
          animation: "msgIn 0.28s cubic-bezier(.2,.8,.4,1) both",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
          position: "relative",
        }}>
          {/* Ambient top line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(77,159,255,0.4), rgba(0,229,160,0.4), transparent)" }} />

          {/* Header */}
          <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(30,39,64,0.8)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, rgba(77,159,255,0.2), rgba(0,229,160,0.1))", border: "1px solid rgba(77,159,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔌</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: -0.3 }}>
                  {dbStep === "conn" ? "Connect Database" : dbStep === "picking" ? "Establishing Connection…" : "Select Target Table"}
                </p>
                <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>
                  {dbStep === "conn" ? "5 connectors available" : dbStep === "picking" ? "Inspecting schema…" : "Choose table to analyse"}
                </p>
              </div>
            </div>
            {/* Step indicators */}
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {[
                { n: 1, label: "Connect", done: dbStep === "table", active: dbStep === "conn" || dbStep === "picking" },
                { n: 2, label: "Select",  done: false, active: dbStep === "table" },
              ].map((step, i) => (
                <div key={step.n} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <div style={{ width: 28, height: 1, background: step.done || dbStep === "table" ? "var(--accent)" : "var(--border2)", margin: "0 4px", transition: "background 0.4s" }} />}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", fontSize: 11, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)",
                      background: step.done ? "rgba(0,229,160,0.15)" : step.active ? "rgba(77,159,255,0.15)" : "var(--surface3)",
                      border: `1.5px solid ${step.done ? "rgba(0,229,160,0.6)" : step.active ? "rgba(77,159,255,0.6)" : "var(--border)"}`,
                      color: step.done ? "var(--accent)" : step.active ? "var(--accent2)" : "var(--muted)",
                      transition: "all 0.3s",
                      boxShadow: step.done ? "0 0 8px rgba(0,229,160,0.2)" : step.active ? "0 0 8px rgba(77,159,255,0.2)" : "none",
                    }}>{step.done ? "✓" : step.n}</div>
                    <span style={{ fontSize: 8.5, color: step.active || step.done ? "var(--muted2)" : "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 0.5 }}>{step.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Step 1 ── */}
          {(dbStep === "conn" || dbStep === "picking") && (
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Connector grid */}
              <div>
                <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.5, marginBottom: 10 }}>SELECT CONNECTOR</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {DB_CONNECTORS.map(c => {
                    const isSel = selectedConnector?.id === c.id;
                    return (
                      <button key={c.id} className="db-connector" onClick={() => { setSelectedConnector(c); setDbConn(c.example); }} style={{
                        padding: "10px 6px 9px", borderRadius: 12,
                        border: `1.5px solid ${isSel ? c.color + "70" : "var(--border)"}`,
                        background: isSel ? c.color + "10" : "rgba(20,24,40,0.6)",
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        transition: "all 0.2s cubic-bezier(.2,.8,.4,1)", position: "relative", overflow: "hidden",
                        boxShadow: isSel ? `0 0 16px ${c.color}20, inset 0 1px 0 ${c.color}15` : "none",
                      }}
                        onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = c.color + "50"; e.currentTarget.style.background = c.color + "08"; }}}
                        onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(20,24,40,0.6)"; }}}
                      >
                        {isSel && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.color}, transparent)` }} />}
                        <span style={{ fontSize: 18 }}>{c.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: isSel ? c.color : "var(--muted2)", fontFamily: "var(--mono)", letterSpacing: 0.3 }}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedConnector && (
                  <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, fontFamily: "var(--mono)", borderLeft: `2px solid ${selectedConnector.color}60`, paddingLeft: 8 }}>
                    {selectedConnector.hint}
                  </p>
                )}
              </div>

              {/* Connection string */}
              <div>
                <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.5, marginBottom: 8 }}>CONNECTION STRING</p>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5, pointerEvents: "none" }}>🔗</div>
                  <input value={dbConn} onChange={e => setDbConn(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleInspect()}
                    placeholder={selectedConnector?.example || "Select a connector above or paste connection string…"}
                    disabled={dbStep === "picking"}
                    style={{
                      background: "rgba(20,24,40,0.8)",
                      border: `1px solid ${dbInspectError ? "var(--danger)" : dbConn ? "rgba(77,159,255,0.3)" : "var(--border2)"}`,
                      borderRadius: 12, padding: "11px 14px 11px 36px",
                      color: "var(--text)", fontSize: 12, fontFamily: "var(--mono)", outline: "none", width: "100%",
                      opacity: dbStep === "picking" ? 0.6 : 1, transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    onFocus={e => { e.target.style.borderColor = "rgba(77,159,255,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(77,159,255,0.08)"; }}
                    onBlur={e => { e.target.style.borderColor = dbInspectError ? "var(--danger)" : dbConn ? "rgba(77,159,255,0.3)" : "var(--border2)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
                {dbInspectError && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "rgba(255,94,122,0.07)", border: "1px solid rgba(255,94,122,0.25)", borderRadius: 10 }}>
                    <span style={{ fontSize: 14 }}>⚠</span>
                    <span style={{ fontSize: 12, color: "var(--danger)", fontFamily: "var(--mono)" }}>{dbInspectError}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleInspect} disabled={!dbConn.trim() || dbStep === "picking"} style={{
                  flex: 1, padding: "12px", borderRadius: 12, border: "none",
                  background: dbConn.trim() && dbStep !== "picking"
                    ? `linear-gradient(135deg, ${selectedConnector?.color || "var(--accent2)"}, ${selectedConnector?.color ? selectedConnector.color + "bb" : "#00c87a"})`
                    : "var(--surface3)",
                  color: dbConn.trim() && dbStep !== "picking" ? "#07090f" : "var(--muted)",
                  fontWeight: 800, cursor: dbConn.trim() && dbStep !== "picking" ? "pointer" : "default",
                  fontSize: 13, fontFamily: "var(--sans)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.25s",
                  boxShadow: dbConn.trim() && dbStep !== "picking" ? `0 4px 20px ${selectedConnector?.color || "var(--accent2)"}40` : "none",
                }}>
                  {dbStep === "picking"
                    ? <><span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>⟳</span> Connecting…</>
                    : <><span>Inspect Database</span><span style={{ opacity: 0.7 }}>→</span></>
                  }
                </button>
                <button onClick={closeDb} style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid var(--border2)", background: "transparent", color: "var(--muted2)", cursor: "pointer", fontSize: 13, fontFamily: "var(--sans)", transition: "all 0.18s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,94,122,0.4)"; e.currentTarget.style.color = "var(--danger)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted2)"; }}
                >✕ Cancel</button>
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {dbStep === "table" && (
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Connected badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.2)", borderRadius: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 8px var(--accent)", flexShrink: 0, animation: "pulse-dot 2s ease-in-out infinite" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>Connection Established</p>
                  <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{dbConn}</p>
                </div>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{selectedConnector?.icon || "🗄️"}</span>
              </div>

              {/* MongoDB DB selector */}
              {dbType === "mongodb" && dbDatabases.length > 0 && (
                <div>
                  <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.5, marginBottom: 8 }}>DATABASE — {dbDatabases.length} found</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {dbDatabases.map(db => {
                      const isA = selectedDb === db;
                      return <button key={db} onClick={() => handleDbChange(db)} style={{ padding: "5px 14px", borderRadius: 100, fontSize: 11.5, cursor: "pointer", border: `1px solid ${isA ? "rgba(0,229,160,0.5)" : "var(--border2)"}`, background: isA ? "rgba(0,229,160,0.1)" : "rgba(20,24,40,0.6)", color: isA ? "var(--accent)" : "var(--muted2)", transition: "all 0.15s", fontFamily: "var(--mono)" }}>{db}</button>;
                    })}
                  </div>
                </div>
              )}

              {/* Table list */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>
                    {dbType === "mongodb" ? `COLLECTIONS IN ${selectedDb.toUpperCase()}` : "TABLES"} — {(dbType === "mongodb" ? dbCollections[selectedDb] : dbTables)?.length ?? 0} FOUND
                  </p>
                  {selectedTable && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--accent2)", fontFamily: "var(--mono)" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent2)" }} />
                      {selectedTable}
                    </div>
                  )}
                </div>
                {(() => {
                  const items = dbType === "mongodb" ? (dbCollections[selectedDb] || []) : dbTables;
                  if (items.length === 0) return <p style={{ fontSize: 12, color: "var(--danger)", fontFamily: "var(--mono)" }}>No tables found.</p>;
                  if (items.length <= 16) return (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 130, overflowY: "auto" }}>
                      {items.map(t => {
                        const isA = selectedTable === t;
                        return <button key={t} onClick={() => setSelectedTable(t)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", border: `1px solid ${isA ? "rgba(77,159,255,0.5)" : "var(--border)"}`, background: isA ? "rgba(77,159,255,0.1)" : "rgba(20,24,40,0.5)", color: isA ? "var(--accent2)" : "var(--muted2)", transition: "all 0.15s", fontFamily: "var(--mono)", fontWeight: isA ? 700 : 400, boxShadow: isA ? "0 0 10px rgba(77,159,255,0.15)" : "none" }}>{t}</button>;
                      })}
                    </div>
                  );
                  return <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} style={selectStyle}>{items.map(t => <option key={t} value={t}>{t}</option>)}</select>;
                })()}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setDbStep("conn"); setDbInspectError(""); }} style={{ padding: "11px 18px", borderRadius: 12, border: "1px solid var(--border2)", background: "transparent", color: "var(--muted2)", cursor: "pointer", fontSize: 13, fontFamily: "var(--sans)", transition: "all 0.18s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent2)"; e.currentTarget.style.color = "var(--accent2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted2)"; }}
                >← Back</button>
                <button onClick={handleLaunch} disabled={!selectedTable} style={{
                  flex: 1, padding: "11px", borderRadius: 12, border: "none",
                  background: selectedTable ? "linear-gradient(135deg, var(--accent), #00c87a)" : "var(--surface3)",
                  color: selectedTable ? "#07090f" : "var(--muted)",
                  fontWeight: 800, cursor: selectedTable ? "pointer" : "default",
                  fontSize: 13, fontFamily: "var(--sans)", transition: "all 0.25s",
                  boxShadow: selectedTable ? "0 4px 20px rgba(0,229,160,0.3)" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  {selectedTable ? <span>⚡ Run Analysis on <strong>{selectedTable}</strong></span> : "Select a table to continue"}
                </button>
                <button onClick={closeDb} style={{ padding: "11px 18px", borderRadius: 12, border: "1px solid var(--border2)", background: "transparent", color: "var(--muted2)", cursor: "pointer", fontSize: 13, fontFamily: "var(--sans)" }}>✕</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main input bar ── */}
      <div className="input-bar-wrap" style={{
        display: "flex", gap: 10, alignItems: "center",
        background: "linear-gradient(135deg, rgba(12,15,30,0.97), rgba(8,10,20,0.97))",
        border: "1px solid var(--border2)", borderRadius: 16, padding: "8px 8px 8px 16px",
        boxShadow: "0 4px 28px rgba(0,0,0,0.4)", position: "relative",
        transition: "border-color 0.25s, box-shadow 0.25s",
      }}>
        {showSourceButtons && (
          <div style={{ display: "flex", gap: 5, alignSelf: "center", flexShrink: 0 }}>
            <button onClick={() => fileRef.current.click()} title="Upload CSV / Excel" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--muted2)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,229,160,0.4)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "rgba(0,229,160,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted2)"; e.currentTarget.style.background = "var(--surface2)"; }}
            >📁</button>
            <button onClick={() => dbMode ? closeDb() : setDbMode(true)} title="Connect database" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${dbMode ? "rgba(77,159,255,0.5)" : "var(--border2)"}`, background: dbMode ? "rgba(77,159,255,0.1)" : "var(--surface2)", color: dbMode ? "var(--accent2)" : "var(--muted2)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s" }}
              onMouseEnter={e => { if (!dbMode) { e.currentTarget.style.borderColor = "rgba(77,159,255,0.4)"; e.currentTarget.style.color = "var(--accent2)"; e.currentTarget.style.background = "rgba(77,159,255,0.06)"; }}}
              onMouseLeave={e => { if (!dbMode) { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted2)"; e.currentTarget.style.background = "var(--surface2)"; }}}
            >🗄️</button>
          </div>
        )}
        {showSourceButtons && <div style={{ width: 1, height: 22, background: "var(--border2)", flexShrink: 0 }} />}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
          placeholder={placeholder || "Ask a question about your data…"} disabled={disabled}
          style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", fontSize: 13.5, outline: "none", padding: "8px 0", lineHeight: 1.5, opacity: disabled ? 0.4 : 1, fontFamily: "var(--sans)" }}
        />
        <button onClick={submit} disabled={!text.trim() || disabled} style={{
          width: 38, height: 38, borderRadius: 11, border: "none",
          background: (!text.trim() || disabled) ? "var(--surface3)" : "linear-gradient(135deg, var(--accent), #00c87a)",
          color: (!text.trim() || disabled) ? "var(--muted)" : "#07090f",
          cursor: (!text.trim() || disabled) ? "default" : "pointer",
          fontSize: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s", boxShadow: (!text.trim() || disabled) ? "none" : "0 0 16px rgba(0,229,160,0.3)",
        }}>➤</button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ sessions, activeId, onSelect, onNew }) {
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: "var(--sidebar)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Logo */}
      <div style={{
        padding: "18px 18px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #00e5a0, #4d9fff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 900, color: "#07090f",
            boxShadow: "0 0 14px rgba(0,229,160,0.25)",
            flexShrink: 0,
          }}>D</div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", letterSpacing: -0.5 }}>DynamicBI</p>
            <p style={{ fontSize: 9, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 1.2, marginTop: 1 }}>POWERED BY LANGGRAPH</p>
          </div>
        </div>
      </div>

      {/* New session button */}
      <div style={{ padding: "14px 14px 8px" }}>
        <button onClick={onNew} style={{
          width: "100%", padding: "10px 14px", borderRadius: 11,
          border: "1px dashed var(--border2)", background: "transparent",
          color: "var(--muted)", cursor: "pointer", fontSize: 12.5,
          fontFamily: "var(--sans)", textAlign: "left",
          transition: "all 0.2s",
          display: "flex", alignItems: "center", gap: 8,
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,229,160,0.4)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "rgba(0,229,160,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          <span>New Session</span>
        </button>
      </div>

      {/* Section label */}
      <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.2, padding: "4px 18px 8px", textTransform: "uppercase" }}>
        Sessions
      </p>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px" }}>
        {sessions.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--muted)", padding: "8px 8px", fontFamily: "var(--mono)" }}>No sessions yet</p>
        )}
        {sessions.map(s => {
          const isActive = s.id === activeId;
          const statusColor = s.status === "running" ? "var(--accent2)" : s.status === "done" ? "var(--accent)" : s.status === "error" ? "var(--danger)" : "var(--border2)";
          return (
            <button key={s.id} className={"sess-item" + (isActive ? " active" : "")} onClick={() => onSelect(s.id)} style={{
              width: "100%", padding: "9px 12px", borderRadius: 10,
              background: isActive ? "var(--surface2)" : "transparent",
              border: `1px solid ${isActive ? "var(--border2)" : "transparent"}`,
              color: isActive ? "var(--text)" : "var(--muted)",
              cursor: "pointer", fontSize: 12.5, textAlign: "left",
              fontFamily: "var(--sans)", marginBottom: 3,
              display: "flex", alignItems: "center", gap: 9,
            }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <span style={{ fontSize: 14 }}>
                  {s.sourceType === "db" ? "🗄️" : s.sourceType === "file" ? "📁" : "💬"}
                </span>
                {s.status !== "idle" && (
                  <div style={{ position: "absolute", bottom: -1, right: -1, width: 6, height: 6, borderRadius: "50%", background: statusColor, border: "1.5px solid var(--sidebar)" }} />
                )}
              </div>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {s.label || "New session"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 18px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[["LangGraph", "var(--accent)"], ["Prophet", "var(--accent2)"], ["Isolation Forest", "var(--accent4)"]].map(([tech, color]) => (
            <div key={tech} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{tech}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [showLanding, setShowLanding] = useState(true);
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

  const handleDb = useCallback((conn, table, database) => {
    const sid = activeId;
    const label = database
      ? `Connect: ${conn} · db: ${database} · ${table}`
      : `Connect: ${conn}${table ? ` · table: ${table}` : ""}`;
    addMessage(sid, { role: "user", type: "text", payload: { text: label } });
    launchPipeline(sid, "/api/connect", { connection_string: conn, table, database: database || null }, conn, "db", false);
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
          <Bubble key={msg.id} role={msg.role} animate={msg.animate} ts={msg.ts}>
            {msg.payload.text.split("\n").map((line, i) => (
              <span key={i}>{line}{i < msg.payload.text.split("\n").length - 1 && <br />}</span>
            ))}
          </Bubble>
        );

      case "typing":
        return (
          <div key={msg.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4, animation: "msgIn 0.25s ease both" }}>
            <Avatar role="assistant" />
            <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "4px 16px 16px 16px" }}>
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

  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600;700;800;900&display=swap');

        :root {
          --bg:        #06080e;
          --sidebar:   #040610;
          --surface:   #0c0f1e;
          --surface2:  #111426;
          --surface3:  #171b30;
          --border:    #1c2438;
          --border2:   #222d46;
          --text:      #dde4f4;
          --muted:     #50607e;
          --muted2:    #7585a8;
          --accent:    #00e5a0;
          --accent2:   #4d9fff;
          --accent3:   #f4a535;
          --accent4:   #c084fc;
          --danger:    #ff5e7a;
          --sans:      'Bricolage Grotesque', sans-serif;
          --mono:      'DM Mono', monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }

        /* Dot-grid on chat area */
        .chat-bg {
          background-image: radial-gradient(circle, rgba(28,36,56,0.55) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 8px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        input::placeholder { color: var(--muted); }
        textarea::placeholder { color: var(--muted); }

        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px) scale(0.985); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0)   scale(1);     filter: blur(0);  }
        }
        @keyframes typingBounce {
          0%, 100% { transform: translateY(0);    opacity: 0.25; }
          50%       { transform: translateY(-6px); opacity: 1;    }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
        @keyframes progress-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes border-flow {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }

        /* Animated gradient border on input-bar focus */
        .input-bar-wrap { position: relative; }
        .input-bar-wrap:focus-within {
          border-color: transparent !important;
        }
        .input-bar-wrap:focus-within::before {
          content: '';
          position: absolute; inset: -1px;
          border-radius: 17px; padding: 1px;
          background: linear-gradient(135deg, rgba(0,229,160,0.5), rgba(77,159,255,0.5), rgba(192,132,252,0.4));
          background-size: 200% 200%;
          animation: border-flow 3s ease infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none; z-index: 0;
        }

        /* Message timestamp on hover */
        .msg-row:hover .msg-ts { opacity: 1 !important; }
        .msg-ts { opacity: 0; transition: opacity 0.2s; }

        /* KPI card */
        .kpi-card { transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s !important; }
        .kpi-card:hover { border-color: var(--accent2) !important; transform: translateY(-3px) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important; }

        /* Chart card */
        .chart-card { transition: all 0.28s cubic-bezier(.2,.8,.4,1) !important; }
        .chart-card:hover { transform: translateY(-5px) scale(1.015) !important; border-color: rgba(77,159,255,0.5) !important; box-shadow: 0 16px 40px rgba(0,0,0,0.4), 0 0 24px rgba(77,159,255,0.08) !important; }

        /* Welcome feature cards */
        .feat-card { transition: all 0.22s ease !important; }
        .feat-card:hover { border-color: rgba(0,229,160,0.3) !important; background: rgba(0,229,160,0.03) !important; transform: translateY(-2px); }

        /* DB connector buttons */
        .db-connector { transition: all 0.22s cubic-bezier(.2,.8,.4,1) !important; }
        .db-connector:hover { transform: translateY(-2px) !important; }

        /* Session items */
        .sess-item { transition: all 0.15s ease !important; }
        .sess-item:hover { background: rgba(26,32,52,0.8) !important; }

        /* Step pills in pipeline */
        .step-pill { transition: all 0.4s ease !important; }

        /* Suggestion chips */
        .suggest-chip { transition: all 0.18s ease !important; }
        .suggest-chip:hover {
          border-color: rgba(0,229,160,0.45) !important;
          color: var(--accent) !important;
          background: rgba(0,229,160,0.05) !important;
          transform: translateY(-1px);
        }

        /* Insight tabs */
        .tab-btn { transition: all 0.18s ease !important; }
        .tab-btn:hover { color: var(--text) !important; }

        select option { background: #111426; color: #dde4f4; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* Sidebar */}
        <Sidebar sessions={sessions} activeId={activeId} onSelect={setActiveId} onNew={newSession} />

        {/* Main chat area */}
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          height: "100vh", overflow: "hidden", position: "relative",
          background: "var(--bg)",
        }}>
          {/* Ambient corner glows */}
          <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(77,159,255,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
          <div style={{ position: "absolute", bottom: -80, left: -80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,229,160,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
          {/* Top edge glow line */}
          <div style={{
            position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
            background: "linear-gradient(90deg, transparent, rgba(0,229,160,0.25), rgba(77,159,255,0.2), transparent)",
            pointerEvents: "none", zIndex: 2,
          }} />

          {/* Top bar */}
          <div style={{
            padding: "12px 28px",
            borderBottom: "1px solid rgba(28,36,56,0.8)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
            background: "rgba(6,8,14,0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            position: "relative", zIndex: 5,
            boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Status dot */}
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: active?.status === "running" ? "var(--accent2)"
                  : active?.status === "done" ? "var(--accent)"
                  : active?.status === "error" ? "var(--danger)"
                  : "var(--border2)",
                boxShadow: active?.status === "running" ? "0 0 8px var(--accent2)"
                  : active?.status === "done" ? "0 0 8px var(--accent)"
                  : "none",
                animation: active?.status === "running" ? "pulse-dot 1.5s ease-in-out infinite" : "none",
              }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", letterSpacing: -0.2 }}>
                  {active?.label || "New session"}
                </p>
                <p style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>
                  {active?.status === "running" ? "⟳ Pipeline running…"
                    : active?.status === "done" ? `✓ Done · ${active.result?.charts?.length ?? 0} charts · ${active.result?.kpis?.length ?? 0} KPIs`
                    : active?.status === "error" ? "⚠ Error encountered"
                    : "Awaiting data source"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {isDone && (
                <>
                  {/* Mini stats */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: active.result?.charts?.length ?? 0, suffix: "charts", color: "var(--accent2)" },
                      { label: active.result?.kpis?.length ?? 0, suffix: "KPIs", color: "var(--accent)" },
                    ].map(({ label, suffix, color }) => (
                      <div key={suffix} style={{
                        padding: "5px 12px", borderRadius: 8,
                        background: "var(--surface)", border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "var(--mono)" }}>{label}</span>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>{suffix}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={newSession} style={{
                    padding: "7px 16px", borderRadius: 9,
                    border: "1px solid var(--border2)", background: "transparent",
                    color: "var(--muted2)", cursor: "pointer", fontSize: 12,
                    fontFamily: "var(--sans)", transition: "all 0.18s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,229,160,0.4)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted2)"; }}
                  >+ New session</button>
                </>
              )}
            </div>
          </div>

          {/* Messages thread */}
          <div className="chat-bg" style={{
            flex: 1, overflowY: "auto", padding: "28px 32px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            {/* Welcome */}
            {!hasMessages && (
              <div style={{ animation: "msgIn 0.4s ease both" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Avatar role="assistant" />
                  <div style={{ flex: 1, maxWidth: 600 }}>
                    <WelcomeCard />
                  </div>
                </div>
              </div>
            )}

            {/* Message list */}
            {active?.messages.map(msg => renderMessage(msg))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar area */}
          <div style={{
            padding: "12px 28px 18px",
            borderTop: "1px solid rgba(28,36,56,0.7)",
            flexShrink: 0,
            background: "rgba(6,8,14,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 -1px 0 rgba(255,255,255,0.025)",
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 10 }}>
              {[["DynamicBI", "var(--accent)"], ["LangGraph", "var(--accent2)"], ["Local & Private", "var(--muted)"]].map(([label, color], i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {i > 0 && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--border2)" }} />}
                  <span style={{ fontSize: 10, color, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {lightbox && <Lightbox chart={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}