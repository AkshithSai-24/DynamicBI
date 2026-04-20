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

// ─── Markdown renderer (bold, italic, numbered/bullet lists) ──────────────────
function renderMarkdown(text) {
  if (!text) return null;
  // Normalise line endings and collapse excessive blank lines
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  const lines = normalised.split("\n");

  return lines.map((raw, idx) => {
    const line = raw.trimEnd();
    if (!line) return <div key={idx} style={{ height: 6 }} />;

    // Detect bullet / numbered list items
    const isBullet  = /^[-•*]\s+/.test(line);
    const isNum     = /^\d+\.\s+/.test(line);
    const isHeading = /^#{1,3}\s/.test(line);
    const isItem    = isBullet || isNum;

    // Strip leading marker for processing
    let stripped = line;
    if (isBullet)  stripped = line.replace(/^[-•*]\s+/, "");
    if (isNum)     stripped = line.replace(/^\d+\.\s+/, "");
    if (isHeading) stripped = line.replace(/^#{1,3}\s+/, "");

    // Inline: **bold**, *italic*
    function applyInline(txt) {
      const parts = [];
      // Split on **...** and *...*
      const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
      let last = 0, m;
      while ((m = re.exec(txt)) !== null) {
        if (m.index > last) parts.push(txt.slice(last, m.index));
        if (m[2] !== undefined) {
          parts.push(<strong key={m.index} style={{ color: "var(--text)", fontWeight: 700 }}>{m[2]}</strong>);
        } else if (m[3] !== undefined) {
          parts.push(<em key={m.index} style={{ color: "var(--muted2)", fontStyle: "italic" }}>{m[3]}</em>);
        }
        last = m.index + m[0].length;
      }
      if (last < txt.length) parts.push(txt.slice(last));
      return parts;
    }

    if (isHeading) return (
      <p key={idx} style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: 0.5, marginBottom: 6, marginTop: 10, textTransform: "uppercase" }}>
        {applyInline(stripped)}
      </p>
    );

    if (isItem) return (
      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 5, paddingLeft: 4 }}>
        <span style={{ color: "var(--accent)", fontWeight: 700, flexShrink: 0, marginTop: 1, fontSize: 12 }}>
          {isNum ? line.match(/^(\d+\.)/)[1] : "•"}
        </span>
        <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--muted2)", margin: 0, wordBreak: "break-word" }}>
          {applyInline(stripped)}
        </p>
      </div>
    );

    return (
      <p key={idx} style={{ fontSize: 13, lineHeight: 1.78, color: "var(--text)", marginBottom: 6, wordBreak: "break-word" }}>
        {applyInline(line)}
      </p>
    );
  });
}

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
          <p style={{ color: "var(--text)", fontWeight: 800, fontSize: 15, letterSpacing: -0.3, lineHeight: 1.3 }}>
            DynamicBI: Agentic AI Framework for Conversational Business Intelligence
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
        <p style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", paddingLeft: 10, borderLeft: "2px solid var(--border2)" }}>
          {stage}
        </p>
      )}
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────
function KpiStrip({ kpis }) {
  const ACCENTS = ["var(--accent)", "var(--accent2)", "var(--accent3)", "var(--accent4)", "var(--danger)", "var(--accent)", "var(--accent2)", "var(--accent3)"];
  // Group by type: SUM, AVG, other
  const sums  = kpis.filter(k => k.Metric.startsWith("SUM_"));
  const avgs  = kpis.filter(k => k.Metric.startsWith("AVG_"));
  const other = kpis.filter(k => !k.Metric.startsWith("SUM_") && !k.Metric.startsWith("AVG_"));

  const KpiCard = ({ k, i, prefix }) => {
    const accent = ACCENTS[i % ACCENTS.length];
    const label = k.Metric.replace(/^(SUM|AVG)_/, "");
    return (
      <div className="kpi-card" style={{
        background: "linear-gradient(145deg, var(--surface2), var(--surface3))",
        borderRadius: 14, padding: "14px 16px",
        border: `1px solid var(--border)`,
        position: "relative", overflow: "hidden",
        transition: "border-color 0.25s, transform 0.25s, box-shadow 0.25s",
        cursor: "default", boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at top right, ${accent}15, transparent)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 2, background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
        <p style={{ fontSize: 9.5, color: accent, fontFamily: "var(--mono)", letterSpacing: 1.2, marginBottom: 7, fontWeight: 600 }}>
          {prefix} {label.toUpperCase().slice(0, 16)}
        </p>
        <p style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", letterSpacing: -0.5 }}>{fmt(k.Value)}</p>
      </div>
    );
  };

  const Section = ({ title, items, prefix, color }) => items.length === 0 ? null : (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color }} />
        <p style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "var(--mono)", letterSpacing: 1.4 }}>{title}</p>
        <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>{items.length} metric{items.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 8 }}>
        {items.map((k, i) => <KpiCard key={i} k={k} i={i} prefix={prefix} />)}
      </div>
    </div>
  );

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, padding: "20px 22px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📊</div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>
          KEY METRICS
        </p>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
          {kpis.length} total
        </span>
      </div>
      <Section title="TOTALS (Σ)" items={sums}  prefix="Σ" color="var(--accent)" />
      <Section title="AVERAGES (μ)" items={avgs}  prefix="μ" color="var(--accent2)" />
      <Section title="OTHER" items={other} prefix="#" color="var(--accent3)" />
    </div>
  );
}

// ─── Chart gallery ────────────────────────────────────────────────────────────
const CHART_CATEGORIES = [
  { key: "forecasting",  label: "📈 Forecasting",    color: "var(--accent)",  desc: "Time-series predictions via Prophet" },
  { key: "anomaly",      label: "⚠ Anomaly Detection", color: "var(--danger)", desc: "Isolation Forest outlier detection" },
  { key: "distribution", label: "📊 Distributions",  color: "var(--accent2)", desc: "Histograms of numeric columns" },
  { key: "scatter",      label: "🔵 Scatter Plots",   color: "var(--accent3)", desc: "Correlation between numeric pairs" },
  { key: "correlation",  label: "🔥 Correlation",    color: "var(--accent4)", desc: "Full-dataset correlation heatmap" },
  { key: "bar",          label: "📉 Bar Charts",      color: "#60d394",        desc: "Category frequency counts" },
  { key: "pie",          label: "🥧 Pie Charts",      color: "#f4a535",        desc: "Proportional breakdowns" },
  { key: "other",        label: "🗂 Other",           color: "var(--muted2)",  desc: "Miscellaneous charts" },
];

function ChartCard({ c, onExpand, accentColor }) {
  return (
    <div className="chart-card" onClick={() => onExpand(c)} style={{
      borderRadius: 12, overflow: "hidden", cursor: "pointer",
      border: "1px solid var(--border)", background: "var(--surface2)",
      position: "relative",
    }}>
      <div style={{ position: "relative", overflow: "hidden" }}>
        <img src={`data:image/png;base64,${c.data}`} alt={c.name} style={{ width: "100%", display: "block" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg, rgba(14,17,32,0.55) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, padding: "3px 8px",
          fontSize: 9, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)",
        }}>click to expand</div>
        {c.category && (
          <div style={{
            position: "absolute", top: 8, left: 8,
            background: `${accentColor}22`, border: `1px solid ${accentColor}50`,
            borderRadius: 5, padding: "2px 7px",
            fontSize: 8.5, color: accentColor, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 0.5,
          }}>{c.category.toUpperCase()}</div>
        )}
      </div>
      <div style={{ padding: "9px 12px", borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
      </div>
    </div>
  );
}

function ChartSection({ catKey, catLabel, catColor, catDesc, charts, onExpand }) {
  const [collapsed, setCollapsed] = useState(false);
  const filtered = charts.filter(c => (c.category || "other") === catKey);
  if (filtered.length === 0) return null;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 16, overflow: "hidden", marginBottom: 12,
    }}>
      {/* Section header — clickable to collapse */}
      <div
        onClick={() => setCollapsed(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
          cursor: "pointer", background: "var(--surface2)",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
          userSelect: "none",
        }}
      >
        <div style={{
          width: 4, height: 22, borderRadius: 2,
          background: catColor, boxShadow: `0 0 8px ${catColor}60`, flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: -0.2 }}>{catLabel}</p>
          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>{catDesc}</p>
        </div>
        <span style={{ fontSize: 10, color: catColor, fontFamily: "var(--mono)", fontWeight: 700, flexShrink: 0 }}>
          {filtered.length} chart{filtered.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {filtered.map((c, i) => (
              <ChartCard key={i} c={c} onExpand={onExpand} accentColor={catColor} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartGallery({ charts, onExpand }) {
  const total = charts.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Gallery header */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border2)",
        borderRadius: 16, padding: "16px 20px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(77,159,255,0.12)", border: "1px solid rgba(77,159,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📈</div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>
            VISUALISATIONS
          </p>
          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>
            {total} chart{total !== 1 ? "s" : ""} · grouped by category · click headers to collapse
          </p>
        </div>
      </div>

      {CHART_CATEGORIES.map(cat => (
        <ChartSection
          key={cat.key}
          catKey={cat.key}
          catLabel={cat.label}
          catColor={cat.color}
          catDesc={cat.desc}
          charts={charts}
          onExpand={onExpand}
        />
      ))}
    </div>
  );
}

// ─── Forecast data panel ──────────────────────────────────────────────────────
function ForecastPanel({ forecasts }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (!forecasts || forecasts.length === 0) return null;
  const active = forecasts[activeIdx];
  const rows = active?.rows || [];
  const lastRow = rows[rows.length - 1];
  const firstRow = rows[0];
  const trend = lastRow && firstRow ? lastRow.yhat - firstRow.yhat : 0;
  const trendPct = firstRow?.yhat ? (trend / Math.abs(firstRow.yhat)) * 100 : 0;
  const trendUp = trend >= 0;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid rgba(0,229,160,0.25)",
      borderRadius: 18, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px", background: "linear-gradient(135deg, rgba(0,229,160,0.06), rgba(0,229,160,0.02))",
        borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📈</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>FORECAST DATA</p>
          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>Prophet 30-day prediction window</p>
        </div>
      </div>

      {/* Column tabs */}
      {forecasts.length > 1 && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
          {forecasts.map((fc, i) => (
            <button key={i} onClick={() => setActiveIdx(i)} style={{
              flex: 1, padding: "10px 12px", border: "none", cursor: "pointer",
              background: "transparent", fontSize: 11, fontFamily: "var(--mono)",
              color: i === activeIdx ? "var(--accent)" : "var(--muted)",
              fontWeight: i === activeIdx ? 700 : 400,
              borderBottom: `2px solid ${i === activeIdx ? "var(--accent)" : "transparent"}`,
            }}>{fc.col.replace(/_/g, " ")}</button>
          ))}
        </div>
      )}

      <div style={{ padding: "14px 18px" }}>
        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "LAST FORECAST", value: lastRow ? fmt(lastRow.yhat) : "—", color: "var(--accent)" },
            { label: "TREND", value: `${trendUp ? "+" : ""}${trendPct.toFixed(1)}%`, color: trendUp ? "var(--accent)" : "var(--danger)" },
            { label: "UNCERTAINTY", value: lastRow ? `±${fmt((lastRow.yhat_upper - lastRow.yhat_lower) / 2)}` : "—", color: "var(--accent3)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: `${color}0d`, border: `1px solid ${color}30`,
              borderRadius: 10, padding: "10px 12px", textAlign: "center",
            }}>
              <p style={{ fontSize: 8.5, color, fontFamily: "var(--mono)", letterSpacing: 1, marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Forecast table — last 10 rows */}
        <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 8, textTransform: "uppercase" }}>
          Latest {Math.min(10, rows.length)} Forecast Points
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 4, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
            {["Date", "Forecast", "Lower", "Upper"].map(h => (
              <span key={h} style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 0.8 }}>{h.toUpperCase()}</span>
            ))}
          </div>
          {rows.slice(-10).map((row, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 4,
              padding: "4px 0", borderBottom: "1px solid rgba(28,36,56,0.5)",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
            }}>
              <span style={{ fontSize: 10, color: "var(--muted2)", fontFamily: "var(--mono)" }}>
                {row.ds ? String(row.ds).slice(0, 10) : "—"}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)" }}>{fmt(row.yhat)}</span>
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(row.yhat_lower)}</span>
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(row.yhat_upper)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Anomaly data panel ───────────────────────────────────────────────────────
function AnomalyPanel({ anomalyData, anomalyReport }) {
  const [tab, setTab] = useState("stats");
  if (!anomalyData) return null;
  const { count, stats, sample, numeric_columns } = anomalyData;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid rgba(255,94,122,0.25)",
      borderRadius: 18, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px", background: "linear-gradient(135deg, rgba(255,94,122,0.06), rgba(255,94,122,0.02))",
        borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,94,122,0.12)", border: "1px solid rgba(255,94,122,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>⚠</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", fontFamily: "var(--mono)", letterSpacing: 1.5 }}>ANOMALY DATA</p>
          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 1 }}>Isolation Forest · 5% contamination rate</p>
        </div>
        <div style={{
          padding: "4px 12px", borderRadius: 100,
          background: "rgba(255,94,122,0.12)", border: "1px solid rgba(255,94,122,0.4)",
          fontSize: 12, fontWeight: 800, color: "var(--danger)", fontFamily: "var(--mono)",
        }}>{count} flagged</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        {[["stats","📊 Stats"], ["sample","🔍 Sample Rows"], ["report","📋 Report"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
            background: "transparent", fontSize: 11, fontFamily: "var(--sans)",
            color: tab === id ? "var(--text)" : "var(--muted)",
            fontWeight: tab === id ? 700 : 400,
            borderBottom: `2px solid ${tab === id ? "var(--danger)" : "transparent"}`,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "14px 18px", maxHeight: 320, overflowY: "auto" }}>
        {tab === "stats" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.entries(stats).map(([col, s]) => (
              <div key={col} style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--danger)", fontFamily: "var(--mono)", marginBottom: 8 }}>{col}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {[["MEAN", s.mean], ["MIN", s.min], ["MAX", s.max], ["STD", s.std]].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 8.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 0.8 }}>{lbl}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", fontFamily: "var(--mono)" }}>{fmt(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "sample" && sample && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, fontFamily: "var(--mono)" }}>
              <thead>
                <tr>
                  {numeric_columns.slice(0, 6).map(col => (
                    <th key={col} style={{ padding: "5px 8px", textAlign: "left", color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,94,122,0.03)" }}>
                    {numeric_columns.slice(0, 6).map(col => (
                      <td key={col} style={{ padding: "5px 8px", color: "var(--muted2)", borderBottom: "1px solid rgba(28,36,56,0.5)", whiteSpace: "nowrap" }}>
                        {row[col] !== undefined && row[col] !== null ? fmt(Number(row[col])) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "report" && anomalyReport && (
          <div>{renderMarkdown(anomalyReport)}</div>
        )}
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
        {renderMarkdown(activeTab?.text || "")}
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

// ─── Query Answer Card ───────────────────────────────────────────────────────
function QueryAnswerCard({ payload, onExpand }) {
  const { answer, data, columns, row_count, visual, needs_visual, question } = payload;
  const [showTable, setShowTable] = useState(false);
  const hasData  = data && data.length > 0;
  const hasChart = !!visual;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 18, overflow: "hidden",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    }}>
      {/* Answer text */}
      <div style={{ padding: "16px 20px", borderBottom: hasData || hasChart ? "1px solid var(--border)" : "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
            background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
          }}>💡</div>
          <p style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginTop: 3 }}>AI ANALYSIS</p>
        </div>
        <div style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
          {renderMarkdown(answer)}
        </div>
      </div>

      {/* Chart */}
      {hasChart && (() => {
        const cd = visual.chartData || {};
        const chartType = cd.chart_type || "chart";
        const xName = cd.x_name || "";
        const yName = cd.y_name || "";
        const pts = cd.series?.total_points || 0;
        const stats = cd.statistics || {};
        const statKey = Object.keys(stats).find(k => typeof stats[k] === "object" && stats[k]?.mean !== undefined);
        const st = statKey ? stats[statKey] : null;
        const typeColors = { bar:"var(--accent2)", line:"var(--accent)", scatter:"var(--accent4)", pie:"var(--accent3)", histogram:"var(--accent)", chart:"var(--accent2)" };
        const typeColor = typeColors[chartType] || "var(--accent2)";

        return (
          <div style={{ borderBottom: hasData ? "1px solid var(--border)" : "none" }}>
            {/* Chart header bar */}
            <div style={{
              padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
              background: "var(--surface2)", borderBottom: "1px solid var(--border)", flexWrap: "wrap", rowGap: 6,
            }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: typeColor }} />
              <p style={{ fontSize: 10, fontWeight: 700, color: typeColor, fontFamily: "var(--mono)", letterSpacing: 1.3 }}>
                {chartType.toUpperCase()} CHART
              </p>
              {xName && <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>X: {xName}</span>}
              {yName && <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>· Y: {yName}</span>}
              {pts > 0 && <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>· {pts.toLocaleString()} pts</span>}
              <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", marginLeft: "auto" }}>click image to expand</span>
            </div>

            {/* Quick stat pills — from chartData statistics */}
            {st && (
              <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 7, borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.15)" }}>
                {[
                  { label: "Mean",   value: st.mean,   color: typeColor },
                  { label: "Median", value: st.median, color: "var(--accent2)" },
                  { label: "Min",    value: st.min,    color: "var(--muted2)" },
                  { label: "Max",    value: st.max,    color: "var(--muted2)" },
                  { label: "Std",    value: st.std,    color: "var(--accent3)" },
                ].filter(s => s.value !== undefined && s.value !== null).map(({ label, value, color }) => (
                  <div key={label} style={{
                    padding: "4px 10px", borderRadius: 8,
                    background: `${color}10`, border: `1px solid ${color}30`,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ fontSize: 9, color, fontFamily: "var(--mono)", letterSpacing: 0.8, fontWeight: 600 }}>{label.toUpperCase()}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>
                      {typeof value === "number" ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3)) : value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Chart image */}
            <div
              className="chart-card"
              onClick={() => onExpand(visual)}
              style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
            >
              <img
                src={`data:image/png;base64,${visual.data}`}
                alt={visual.name}
                style={{ width: "100%", display: "block", maxHeight: 340, objectFit: "contain", background: "#0c0f1e" }}
              />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(0deg, rgba(14,17,32,0.35) 0%, transparent 55%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", top: 8, left: 8,
                background: `${typeColor}22`, border: `1px solid ${typeColor}50`,
                borderRadius: 5, padding: "2px 8px",
                fontSize: 8.5, color: typeColor, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 0.5,
              }}>QUERY VISUAL · {chartType.toUpperCase()}</div>
            </div>

            {/* Chart description */}
            <div style={{ padding: "10px 16px", background: "var(--surface2)" }}>
              <p style={{ fontSize: 11.5, color: "var(--muted2)", lineHeight: 1.65, wordBreak: "break-word" }}>
                {xName && yName
                  ? `This ${chartType} chart shows the relationship between ${xName} and ${yName}${pts > 0 ? ` across ${pts.toLocaleString()} data points` : ""}. Click the chart to open the full statistics panel.`
                  : xName
                  ? `This ${chartType} chart visualises ${xName}${pts > 0 ? ` (${pts.toLocaleString()} data points)` : ""}. Click to explore detailed statistics.`
                  : `AI-generated ${chartType} chart for your query. Click to expand with full data statistics.`
                }
              </p>
            </div>
          </div>
        );
      })()}

      {/* Data table */}
      {hasData && (
        <div>
          <button
            onClick={() => setShowTable(p => !p)}
            style={{
              width: "100%", padding: "10px 16px", border: "none", cursor: "pointer",
              background: "var(--surface2)", display: "flex", alignItems: "center", gap: 8,
              borderBottom: showTable ? "1px solid var(--border)" : "none",
            }}
          >
            <div style={{ width: 4, height: 16, borderRadius: 2, background: "var(--accent3)" }} />
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent3)", fontFamily: "var(--mono)", letterSpacing: 1.3 }}>
              DATA TABLE
            </p>
            <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", marginLeft: 4 }}>
              {row_count} row{row_count !== 1 ? "s" : ""} · {columns.length} col{columns.length !== 1 ? "s" : ""}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", transform: showTable ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
          </button>

          {showTable && (
            <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
              <table style={{
                width: "100%", borderCollapse: "collapse",
                fontSize: 11, fontFamily: "var(--mono)",
              }}>
                <thead>
                  <tr style={{ background: "var(--surface3)", position: "sticky", top: 0 }}>
                    {columns.map(col => (
                      <th key={col} style={{
                        padding: "7px 12px", textAlign: "left", color: "var(--muted)",
                        fontWeight: 600, fontSize: 10, letterSpacing: 0.5,
                        borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                      {columns.map(col => {
                        const val = row[col];
                        const isNum = typeof val === "number";
                        return (
                          <td key={col} style={{
                            padding: "6px 12px", color: isNum ? "var(--accent)" : "var(--muted2)",
                            borderBottom: "1px solid rgba(28,36,56,0.45)", whiteSpace: "nowrap",
                            textAlign: isNum ? "right" : "left",
                            fontWeight: isNum ? 600 : 400,
                          }}>
                            {val === null || val === undefined ? <span style={{ color: "var(--muted)", opacity: 0.5 }}>—</span>
                              : isNum ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(4))
                              : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 50 && (
                <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", padding: "8px 12px", textAlign: "center" }}>
                  Showing first 50 of {row_count} rows
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, accent }) {
  if (value === null || value === undefined) return null;
  const display = typeof value === "number"
    ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4))
    : String(value);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 0", borderBottom: "1px solid rgba(28,36,56,0.6)",
    }}>
      <span style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent || "var(--text)", fontFamily: "var(--mono)" }}>{display}</span>
    </div>
  );
}

function ChartDataPanel({ chart }) {
  const cd = chart.chartData;
  const [activeStatTab, setActiveStatTab] = useState(0);

  if (!cd) return (
    <div style={{ padding: 24, color: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)", textAlign: "center" }}>
      No chart data available
    </div>
  );

  const chartType = cd.chart_type?.toUpperCase() || "CHART";
  const typeColors = {
    bar: "var(--accent2)", pie: "var(--accent3)", scatter: "var(--accent4)",
    hist: "var(--accent)", histogram: "var(--accent)", heatmap: "var(--danger)",
  };
  const typeColor = typeColors[cd.chart_type?.toLowerCase()] || "var(--accent)";

  // Determine data points to show
  const dataPoints = cd.series?.preview_points || cd.x || [];
  const isHeatmap = cd.chart_type === "heatmap";
  const statKeys = cd.statistics ? Object.keys(cd.statistics) : [];
  const perColStatKeys = cd.per_column_statistics ? Object.keys(cd.per_column_statistics) : [];

  const statTabKeys = statKeys.filter(k => typeof cd.statistics[k] === "object" && cd.statistics[k] !== null && !Array.isArray(cd.statistics[k]));
  const activeStatKey = statTabKeys[activeStatTab];
  const activeStat = cd.statistics?.[activeStatKey];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "16px 18px 14px", borderBottom: "1px solid var(--border)",
        background: "linear-gradient(135deg, var(--surface2), var(--surface3))",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            padding: "3px 10px", borderRadius: 100, fontSize: 9.5, fontWeight: 700,
            fontFamily: "var(--mono)", letterSpacing: 1.2,
            background: `${typeColor}18`, border: `1px solid ${typeColor}50`,
            color: typeColor,
          }}>{chartType}</div>
          <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            {cd.series?.total_points ?? dataPoints.length} points
          </span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>
          {cd.x_name && cd.y_name ? `${cd.x_name} vs ${cd.y_name}` : cd.x_name || cd.y_name || chart.name}
        </p>
        {cd.x_name && (
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {cd.x_name && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor }} />
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>X: {cd.x_name}</span>
            </div>}
            {cd.y_name && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent2)" }} />
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>Y: {cd.y_name}</span>
            </div>}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Data points table — skip for histograms and heatmaps */}
        {!isHeatmap && cd.chart_type !== "histogram" && dataPoints.length > 0 && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" }}>
              Data Points
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {dataPoints.slice(0, 12).map((pt, i) => {
                const xVal = pt.x ?? pt;
                const yVal = pt.y;
                const pct = dataPoints.length > 0 && typeof yVal === "number"
                  ? (yVal / Math.max(...dataPoints.map(p => p.y ?? 0))) * 100 : null;
                return (
                  <div key={i} style={{ position: "relative" }}>
                    {pct !== null && (
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4,
                        width: `${pct}%`, background: `${typeColor}12`,
                        transition: "width 0.4s ease", minWidth: 2,
                      }} />
                    )}
                    <div style={{
                      position: "relative", display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "4px 6px",
                    }}>
                      <span style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                        {String(xVal)}
                      </span>
                      {yVal !== undefined && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: typeColor, fontFamily: "var(--mono)" }}>
                          {typeof yVal === "number" ? (Number.isInteger(yVal) ? yVal.toLocaleString() : yVal.toFixed(2)) : yVal}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {dataPoints.length > 12 && (
                <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", textAlign: "center", paddingTop: 4 }}>
                  +{dataPoints.length - 12} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Histogram — rich statistical panel (no raw bin points) */}
        {cd.chart_type === "histogram" && (() => {
          const st = cd.statistics || {};
          const s  = cd.series    || {};
          const binEdges = s.bin_edges || [];
          const binMin = binEdges[0];
          const binMax = binEdges[binEdges.length - 1];
          const fmtN = v => v === undefined || v === null ? "—"
            : typeof v === "boolean" ? (v ? "Yes" : "No")
            : typeof v === "number"  ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4))
            : String(v);
          return (
            <>
              {/* ── Distribution overview cards ── */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" }}>Distribution Overview</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {[
                    { label: "Total Points", value: s.total_points,  color: typeColor },
                    { label: "Bin Count",    value: s.bin_count,     color: "var(--accent2)" },
                    { label: "Range Min",    value: binMin,           color: "var(--muted2)" },
                    { label: "Range Max",    value: binMax,           color: "var(--muted2)" },
                    { label: "Mean",         value: st.mean,          color: typeColor },
                    { label: "Median",       value: st.median,        color: "var(--accent2)" },
                    { label: "Std Dev",      value: st.std,           color: "var(--accent3)" },
                    { label: "Variance",     value: st.variance,      color: "var(--accent4)" },
                  ].filter(x => x.value !== undefined && x.value !== null).map(({ label, value, color }) => (
                    <div key={label} style={{ background: `${color}0d`, border: `1px solid ${color}28`, borderRadius: 9, padding: "9px 11px", textAlign: "center" }}>
                      <p style={{ fontSize: 8.5, color, fontFamily: "var(--mono)", letterSpacing: 0.8, marginBottom: 4 }}>{label.toUpperCase()}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>{fmtN(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Shape & tail statistics ── */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 8, textTransform: "uppercase" }}>Shape & Tail</p>
                {[
                  ["Skewness",    st.skewness],
                  ["Kurtosis",    st.kurtosis],
                  ["Shapiro Stat",st.shapiro_stat],
                  ["Shapiro p",   st.shapiro_p_value],
                  ["Normal Dist", st.is_normal_distribution !== undefined ? (st.is_normal_distribution ? "Yes ✓" : "No ✗") : undefined],
                  ["CV %",        st.coefficient_of_variation_pct],
                  ["Outliers",    st.outlier_count],
                  ["Missing",     st.missing],
                  ["Mode",        st.mode],
                  ["Mode Count",  st.mode_count],
                  ["Sum",         st.sum],
                ].filter(([,v]) => v !== undefined && v !== null).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(28,36,56,0.5)" }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", fontFamily: "var(--mono)" }}>{fmtN(value)}</span>
                  </div>
                ))}
              </div>

              {/* ── Percentile ladder ── */}
              {(st.p5 !== undefined) && (
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 8, textTransform: "uppercase" }}>Percentiles</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {[["p5","p5"],["p10","p10"],["Q1 (p25)","q1"],["Median (p50)","p50"],["Q3 (p75)","q3"],["p90","p90"],["p95","p95"]].map(([label, key]) => {
                      const val = st[key];
                      if (val === undefined || val === null) return null;
                      const pct = (val - (binMin||0)) / ((binMax - binMin) || 1) * 100;
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", width: 80, flexShrink: 0 }}>{label}</span>
                          <div style={{ flex: 1, height: 4, background: "var(--surface3)", borderRadius: 100, overflow: "hidden" }}>
                            <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: "100%", background: `linear-gradient(90deg, ${typeColor}, var(--accent2))`, borderRadius: 100 }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: typeColor, fontFamily: "var(--mono)", width: 44, textAlign: "right", flexShrink: 0 }}>{fmtN(val)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Fence / IQR ── */}
              {(st.iqr !== undefined) && (
                <div style={{ padding: "14px 18px" }}>
                  <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 8, textTransform: "uppercase" }}>IQR & Fences</p>
                  {[["IQR","iqr"],["Lower Fence","lower_fence"],["Upper Fence","upper_fence"]].map(([label, key]) => {
                    const val = st[key];
                    if (val === undefined) return null;
                    return (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(28,36,56,0.5)" }}>
                        <span style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent3)", fontFamily: "var(--mono)" }}>{fmtN(val)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* Heatmap columns */}
        {isHeatmap && cd.columns && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" }}>
              Columns ({cd.columns.length})
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {cd.columns.map((col, i) => (
                <span key={i} style={{
                  padding: "3px 10px", borderRadius: 100, fontSize: 10, fontFamily: "var(--mono)",
                  background: "var(--surface3)", border: "1px solid var(--border2)", color: "var(--muted2)",
                }}>{col}</span>
              ))}
            </div>
          </div>
        )}

        {/* Statistics */}
        {statTabKeys.length > 0 && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" }}>
              Statistics
            </p>

            {/* Stat tabs if multiple */}
            {statTabKeys.length > 1 && (
              <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
                {statTabKeys.map((key, i) => (
                  <button key={key} onClick={() => setActiveStatTab(i)} style={{
                    padding: "4px 12px", borderRadius: 100, fontSize: 10.5, fontFamily: "var(--mono)",
                    cursor: "pointer", border: `1px solid ${i === activeStatTab ? typeColor + "60" : "var(--border)"}`,
                    background: i === activeStatTab ? `${typeColor}12` : "transparent",
                    color: i === activeStatTab ? typeColor : "var(--muted)",
                    transition: "all 0.15s",
                  }}>{key}</button>
                ))}
              </div>
            )}

            {activeStat && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Key stats highlighted */}
                {activeStat.mean !== undefined && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                    {[
                      { label: "Mean", value: activeStat.mean, accent: typeColor },
                      { label: "Median", value: activeStat.median, accent: "var(--accent2)" },
                      { label: "Std Dev", value: activeStat.std, accent: "var(--accent3)" },
                      { label: "Count", value: activeStat.count, accent: "var(--accent4)" },
                    ].map(({ label, value, accent }) => value !== undefined && (
                      <div key={label} style={{
                        background: `${accent}0d`, border: `1px solid ${accent}30`,
                        borderRadius: 8, padding: "8px 10px", textAlign: "center",
                      }}>
                        <p style={{ fontSize: 9, color: accent, fontFamily: "var(--mono)", letterSpacing: 1, marginBottom: 3 }}>{label.toUpperCase()}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>
                          {typeof value === "number" ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3)) : value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Remaining stats */}
                {[
                  ["Min", activeStat.min], ["Max", activeStat.max],
                  ["Range", activeStat.range], ["Q1", activeStat.q1], ["Q3", activeStat.q3],
                  ["IQR", activeStat.iqr], ["Skewness", activeStat.skewness],
                  ["Kurtosis", activeStat.kurtosis], ["Outliers", activeStat.outlier_count],
                  ["Missing", activeStat.missing], ["CV %", activeStat.coefficient_of_variation_pct],
                  ["Normal Dist", activeStat.is_normal_distribution !== undefined ? (activeStat.is_normal_distribution ? "Yes" : "No") : undefined],
                ].filter(([, v]) => v !== undefined && v !== null).map(([label, value]) => (
                  <StatRow key={label} label={label} value={value} />
                ))}

                {/* Correlation info if present */}
                {cd.statistics?.correlation && (
                  <>
                    <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginTop: 12, marginBottom: 6, textTransform: "uppercase" }}>Correlation</p>
                    <StatRow label="Pearson r" value={cd.statistics.correlation.pearson_r} accent={Math.abs(cd.statistics.correlation.pearson_r) > 0.5 ? typeColor : undefined} />
                    <StatRow label="R²" value={cd.statistics.correlation.r_squared} />
                    <StatRow label="P-value" value={cd.statistics.correlation.pearson_p_value} />
                  </>
                )}
                {cd.statistics?.linear_regression && (
                  <>
                    <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginTop: 12, marginBottom: 6, textTransform: "uppercase" }}>Linear Regression</p>
                    <StatRow label="Slope" value={cd.statistics.linear_regression.slope} />
                    <StatRow label="Intercept" value={cd.statistics.linear_regression.intercept} />
                    <StatRow label="R²" value={cd.statistics.linear_regression.r_squared} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Per-column stats for heatmap */}
        {perColStatKeys.length > 0 && (
          <div style={{ padding: "14px 18px" }}>
            <p style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" }}>
              Per-column Stats
            </p>
            {perColStatKeys.slice(0, 5).map(col => {
              const s = cd.per_column_statistics[col];
              return (
                <div key={col} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: typeColor, fontFamily: "var(--mono)", marginBottom: 4 }}>{col}</p>
                  <StatRow label="Mean" value={s.mean} accent={typeColor} />
                  <StatRow label="Std" value={s.std} />
                  <StatRow label="Min" value={s.min} />
                  <StatRow label="Max" value={s.max} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({ chart, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(5,7,16,0.94)", backdropFilter: "blur(24px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 28,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        display: "flex", gap: 0,
        maxWidth: "95vw", maxHeight: "90vh",
        border: "1px solid var(--border2)", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        animation: "lightboxIn 0.3s cubic-bezier(.2,.8,.4,1) both",
        position: "relative",
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12, zIndex: 10,
          width: 30, height: 30, borderRadius: "50%",
          background: "rgba(6,8,14,0.85)", border: "1px solid var(--border2)",
          color: "var(--muted2)", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s", backdropFilter: "blur(8px)",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--danger)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--danger)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(6,8,14,0.85)"; e.currentTarget.style.color = "var(--muted2)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
        >✕</button>

        {/* Left: Chart image */}
        <div style={{
          background: "var(--surface)",
          display: "flex", flexDirection: "column",
          minWidth: 0, flex: "1 1 60%",
        }}>
          {/* Image area */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, minHeight: 0, overflow: "hidden",
          }}>
            <img
              src={`data:image/png;base64,${chart.data}`}
              alt={chart.name}
              style={{ maxWidth: "100%", maxHeight: "72vh", display: "block", borderRadius: 10, objectFit: "contain" }}
            />
          </div>
          {/* Image footer */}
          <div style={{
            padding: "10px 20px", borderTop: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(6,8,14,0.6)", flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
            <p style={{ fontSize: 11.5, color: "var(--muted2)", fontFamily: "var(--mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {chart.name}
            </p>
            <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", flexShrink: 0 }}>Esc to close</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "var(--border2)", flexShrink: 0 }} />

        {/* Right: Data panel */}
        <div style={{
          width: 300, flexShrink: 0,
          background: "var(--surface2)",
          display: "flex", flexDirection: "column",
          overflowY: "hidden",
        }}>
          <ChartDataPanel chart={chart} />
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
    background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 10,
    padding: "9px 13px", color: "var(--text)", fontSize: 13, outline: "none",
    width: "100%", cursor: "pointer", fontFamily: "var(--sans)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Futuristic DB panel ── */}
      {dbMode && (
        <div style={{
          background: "linear-gradient(145deg, var(--surface), var(--surface2))",
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
                        background: isSel ? c.color + "10" : "var(--surface2)",
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        transition: "all 0.2s cubic-bezier(.2,.8,.4,1)", position: "relative", overflow: "hidden",
                        boxShadow: isSel ? `0 0 16px ${c.color}20, inset 0 1px 0 ${c.color}15` : "none",
                      }}
                        onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = c.color + "50"; e.currentTarget.style.background = c.color + "08"; }}}
                        onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface2)"; }}}
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
                      background: "var(--surface2)",
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
                      return <button key={db} onClick={() => handleDbChange(db)} style={{ padding: "5px 14px", borderRadius: 100, fontSize: 11.5, cursor: "pointer", border: `1px solid ${isA ? "rgba(0,229,160,0.5)" : "var(--border2)"}`, background: isA ? "rgba(0,229,160,0.1)" : "var(--surface2)", color: isA ? "var(--accent)" : "var(--muted2)", transition: "all 0.15s", fontFamily: "var(--mono)" }}>{db}</button>;
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
                        return <button key={t} onClick={() => setSelectedTable(t)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", border: `1px solid ${isA ? "rgba(77,159,255,0.5)" : "var(--border)"}`, background: isA ? "rgba(77,159,255,0.1)" : "var(--surface2)", color: isA ? "var(--accent2)" : "var(--muted2)", transition: "all 0.15s", fontFamily: "var(--mono)", fontWeight: isA ? 700 : 400, boxShadow: isA ? "0 0 10px rgba(77,159,255,0.15)" : "none" }}>{t}</button>;
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
        background: "linear-gradient(135deg, var(--surface), var(--surface2))",
        border: "1px solid var(--border2)", borderRadius: 16, padding: "6px 8px 6px 12px",
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
          style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", fontSize: 13.5, outline: "none", padding: "6px 0", lineHeight: 1.5, opacity: disabled ? 0.4 : 1, fontFamily: "var(--sans)" }}
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
          <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", letterSpacing: -0.3, lineHeight: 1.2 }}>DynamicBI</p>
            <p style={{ fontSize: 8.5, color: "var(--accent)", fontFamily: "var(--mono)", letterSpacing: 0.4, marginTop: 2, lineHeight: 1.3 }}>AGENTIC AI · CONVERSATIONAL BI</p>
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
  const [darkMode, setDarkMode] = useState(true);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
        // Build a rich query-answer message
        const newMsgs = [
          ...msgs,
          {
            id: uid(), role: "assistant", type: "query_answer", animate: true,
            payload: {
              answer:      d.answer  || "",
              data:        d.data    || [],
              columns:     d.columns || [],
              row_count:   d.row_count || 0,
              visual:      d.visual  || null,
              needs_visual:d.needs_visual || false,
              question,
            }
          }
        ];
        return { ...s, messages: newMsgs };
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
            <div style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
              {renderMarkdown(msg.payload.text)}
            </div>
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
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <ChartGallery charts={msg.payload.charts} onExpand={setLightbox} />
                {msg.payload.forecasts?.length > 0 && (
                  <ForecastPanel forecasts={msg.payload.forecasts} />
                )}
                {msg.payload.anomaly_data && (
                  <AnomalyPanel
                    anomalyData={msg.payload.anomaly_data}
                    anomalyReport={msg.payload.anomaly_report}
                  />
                )}
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

      case "query_answer":
        return (
          <div key={msg.id} style={{ animation: msg.animate ? "msgIn 0.38s ease both" : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <QueryAnswerCard payload={msg.payload} onExpand={setLightbox} />
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

  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} darkMode={darkMode} onToggleTheme={() => setDarkMode(d => !d)} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600;700;800;900&display=swap');

        :root {
          --bg:        ${darkMode ? "#06080e" : "#f0f4fd"};
          --sidebar:   ${darkMode ? "#040610" : "#e8edf8"};
          --surface:   ${darkMode ? "#0c0f1e" : "#ffffff"};
          --surface2:  ${darkMode ? "#111426" : "#f0f4fd"};
          --surface3:  ${darkMode ? "#171b30" : "#e4eaf6"};
          --border:    ${darkMode ? "#1c2438" : "#cdd6ea"};
          --border2:   ${darkMode ? "#222d46" : "#b8c4da"};
          --text:      ${darkMode ? "#dde4f4" : "#1a2540"};
          --muted:     ${darkMode ? "#50607e" : "#6b7a9a"};
          --muted2:    ${darkMode ? "#7585a8" : "#4a5878"};
          --accent:    #00e5a0;
          --accent2:   #4d9fff;
          --accent3:   #f4a535;
          --accent4:   #c084fc;
          --danger:    #ff5e7a;
          --sans:      'Bricolage Grotesque', sans-serif;
          --mono:      'DM Mono', monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--sans);
          min-height: 100%;
        }

        /* Responsive full-height layout */
        #root { height: 100%; display: flex; flex-direction: column; }

        /* Dot-grid on chat area — theme-aware */
        .chat-bg {
          background-image: radial-gradient(circle, ${darkMode ? "rgba(28,36,56,0.55)" : "rgba(180,196,220,0.45)"} 1px, transparent 1px);
          background-size: 28px 28px;
        }

        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 8px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        input, textarea { background: var(--surface2); color: var(--text); }
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
        @keyframes lightboxIn {
          from { opacity: 0; transform: scale(0.94) translateY(12px); filter: blur(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    filter: blur(0);  }
        }

        /* Animated gradient border on input-bar focus */
        .input-bar-wrap { position: relative; }
        .input-bar-wrap:focus-within { border-color: transparent !important; }
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
        .kpi-card:hover { border-color: var(--accent2) !important; transform: translateY(-3px) !important; box-shadow: 0 8px 24px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"} !important; }

        /* Chart card */
        .chart-card { transition: all 0.28s cubic-bezier(.2,.8,.4,1) !important; }
        .chart-card:hover { transform: translateY(-5px) scale(1.015) !important; border-color: rgba(77,159,255,0.5) !important; box-shadow: 0 16px 40px ${darkMode ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.1)"}, 0 0 24px rgba(77,159,255,0.08) !important; }

        /* Welcome feature cards */
        .feat-card { transition: all 0.22s ease !important; }
        .feat-card:hover { border-color: rgba(0,229,160,0.35) !important; background: rgba(0,229,160,0.04) !important; transform: translateY(-2px); }

        /* DB connector buttons */
        .db-connector { transition: all 0.22s cubic-bezier(.2,.8,.4,1) !important; }
        .db-connector:hover { transform: translateY(-2px) !important; }

        /* Session items */
        .sess-item { transition: all 0.15s ease !important; }
        .sess-item:hover { background: var(--surface2) !important; }

        /* Step pills in pipeline */
        .step-pill { transition: all 0.4s ease !important; }

        /* Suggestion chips */
        .suggest-chip { transition: all 0.18s ease !important; }
        .suggest-chip:hover {
          border-color: rgba(0,229,160,0.45) !important;
          color: var(--accent) !important;
          background: rgba(0,229,160,0.06) !important;
          transform: translateY(-1px);
        }

        /* Insight tabs */
        .tab-btn { transition: all 0.18s ease !important; }
        .tab-btn:hover { color: var(--text) !important; }

        /* Select dropdown — theme-aware */
        select { background: var(--surface2) !important; color: var(--text) !important; border-color: var(--border) !important; }
        select option { background: var(--surface2); color: var(--text); }

        /* Responsive: smaller sidebar on tablet */
        @media (max-width: 900px) {
          .app-sidebar { width: 200px !important; }
        }
        @media (max-width: 680px) {
          .app-sidebar { display: none !important; }
          .app-topbar { padding: 10px 14px !important; }
          .app-chat { padding: 16px 14px !important; }
          .app-input { padding: 10px 14px 14px !important; }
        }
      `}</style>

      <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>

        {/* Sidebar */}
        <Sidebar sessions={sessions} activeId={activeId} onSelect={setActiveId} onNew={newSession} />

        {/* Main chat area */}
        <main style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100dvh",
          overflow: "hidden",
          position: "relative",
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
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
            background: "var(--surface2)",
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
              {/* Dark/Light Mode Toggle */}
              <button
                onClick={() => setDarkMode(d => !d)}
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                style={{
                  width: 52, height: 28, borderRadius: 14,
                  border: `1.5px solid ${darkMode ? "rgba(0,229,160,0.35)" : "rgba(251,191,36,0.5)"}`,
                  background: darkMode ? "rgba(15,20,35,0.8)" : "rgba(255,252,235,0.9)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "all 0.35s cubic-bezier(.2,.8,.4,1)",
                  display: "flex", alignItems: "center",
                  padding: "2px 3px",
                  flexShrink: 0,
                  boxShadow: darkMode ? "inset 0 1px 3px rgba(0,0,0,0.4)" : "inset 0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                {/* Track icons */}
                <span style={{ position: "absolute", left: 6, fontSize: 10, opacity: darkMode ? 0.8 : 0.3, transition: "opacity 0.3s" }}>🌙</span>
                <span style={{ position: "absolute", right: 6, fontSize: 10, opacity: darkMode ? 0.3 : 0.9, transition: "opacity 0.3s" }}>☀️</span>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: darkMode
                    ? "linear-gradient(135deg, #6b7a9a, #4ade8060)"
                    : "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  transform: darkMode ? "translateX(0px)" : "translateX(24px)",
                  transition: "transform 0.35s cubic-bezier(.2,.8,.4,1), background 0.3s",
                  flexShrink: 0, zIndex: 1,
                  boxShadow: darkMode ? "0 1px 4px rgba(0,0,0,0.5)" : "0 1px 6px rgba(251,191,36,0.5)",
                }} />
              </button>
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
          <div className="chat-bg" style={{
            flex: 1, overflowY: "auto", padding: "8px 20px 6px",
            display: "flex", flexDirection: "column", gap: 8,
            background: darkMode ? "var(--surface)" : "var(--surface)",
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
            padding: "6px 16px 6px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            background: "var(--surface2)",
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 2 }}>
              {[["DynamicBI: Agentic AI", "var(--accent)"], ["LangGraph", "var(--accent2)"], ["Local & Private", "var(--muted)"]].map(([label, color], i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {i > 0 && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--border2)" }} />}
                  <span style={{ fontSize: 10, color, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team Footer */}
          <div style={{
            borderTop: "1px solid var(--border)",
            padding: "4px 12px",
            background: "var(--sidebar)",
            flexShrink: 0,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 20px" }}>
              {[
                "Akshith Sai Kondamadugu (2451-22-749-019)",
                "Ananthula Ujwal (2451-22-749-004)",
                "Gotte Thiru Habinash Yadav (2451-22-749-021)",
              ].map((name, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--border2)" }} />}
                  <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{name}</span>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
              Guided By <span style={{ color: "var(--accent2)", fontWeight: 600 }}>P. Phani Prasad</span>, Asst. Professor, MVSR Engineering College
            </span>
          </div>
        </main>
      </div>

      {lightbox && <Lightbox chart={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}