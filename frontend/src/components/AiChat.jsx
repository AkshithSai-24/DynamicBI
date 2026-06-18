import { useState, useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { usePalette } from "../ThemeContext.jsx";

const API = import.meta.env.VITE_API_URL || "";

/* ── number formatter ──────────────────────────────────────────────────── */
const fmt = (v) => {
  if (v == null || (typeof v === "number" && isNaN(v))) return "";
  if (typeof v !== "number") return v;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
};

/* ── read a live CSS variable ───────────────────────────────────────────── */
const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ── theme-aware tooltip ──────────────────────────────────────────────── */
function ChatTip({ active, payload, label, palette }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: cv("--tooltip-bg") || cv("--bg"),
      border: `1px solid ${cv("--tooltip-border") || cv("--border")}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 11,
      pointerEvents: "none", zIndex: 9999,
    }}>
      {label != null && (
        <p style={{ color: cv("--muted"), marginBottom: 4, fontWeight: 600 }}>
          {String(label).slice(0, 30)}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || palette?.[i] || cv("--accent"), margin: "2px 0" }}>
          <span style={{ color: cv("--muted") }}>{p.name ?? p.dataKey}: </span>
          <strong style={{ color: cv("--text") }}>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Interactive Recharts chart from query_loop chartData ──────────────── */
function QueryChart({ chartData }) {
  const palette = usePalette();
  if (!chartData) return null;

  const { chart_type, x_name, y_name, series } = chartData;
  const pts = series?.preview_points || [];
  if (!pts.length) return null;

  // Normalise points: ensure {name, value} shape for standard XAxis/dataKey
  const data = pts.map(p => ({ name: String(p.x ?? ""), value: p.y ?? 0 }));
  const T = { fill: cv("--chart-tick") || "#6b7a99", fontSize: 10 };
  const G = { stroke: cv("--chart-grid") || "#1e2a40", strokeDasharray: "3 3" };
  const h = 220;
  const baseProps = { data, margin: { top: 6, right: 10, bottom: 40, left: 4 } };

  const XA = <XAxis dataKey="name" tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />;
  const YA = <YAxis tick={T} tickFormatter={fmt} width={50} />;
  const TIP = <Tooltip content={<ChatTip palette={palette} />} cursor={false} />;
  const GRD = <CartesianGrid {...G} />;

  const totalLabel = series?.total_points > data.length
    ? ` · showing ${data.length} of ${series.total_points}`
    : "";

  let chartEl;

  switch (chart_type) {
    case "pie": {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name"
              cx="50%" cy="48%" innerRadius="28%" outerRadius="60%"
              paddingAngle={2}
              label={({ name, percent }) =>
                percent > 0.04 ? `${String(name).slice(0, 12)} ${(percent * 100).toFixed(0)}%` : ""}
              labelLine={{ stroke: G.stroke, strokeWidth: 1 }}>
              {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip content={<ChatTip palette={palette} />} />
            <Legend wrapperStyle={{ fontSize: 10, color: cv("--muted") }} />
          </PieChart>
        </ResponsiveContainer>
      );
      break;
    }
    case "line": {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <LineChart {...baseProps}>
            {GRD}{XA}{YA}{TIP}
            <Line type="monotone" dataKey="value" name={y_name || "value"}
              stroke={palette[0]} strokeWidth={2.5}
              dot={data.length < 50 ? { r: 3, fill: palette[0], stroke: "none" } : false}
              activeDot={{ r: 5, fill: palette[0], stroke: "none" }} />
          </LineChart>
        </ResponsiveContainer>
      );
      break;
    }
    case "area": {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <AreaChart {...baseProps}>
            <defs>
              <linearGradient id="qcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={palette[0]} stopOpacity={0.35} />
                <stop offset="95%" stopColor={palette[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {GRD}{XA}{YA}{TIP}
            <Area type="monotone" dataKey="value" name={y_name || "value"}
              stroke={palette[0]} fill="url(#qcGrad)"
              strokeWidth={2.5} dot={false}
              activeDot={{ r: 4, stroke: "none" }} />
          </AreaChart>
        </ResponsiveContainer>
      );
      break;
    }
    case "scatter": {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <ScatterChart margin={{ top: 6, right: 10, bottom: 16, left: 4 }}>
            {GRD}
            <XAxis dataKey="name" type="category" tick={T} name={x_name} />
            <YAxis dataKey="value" type="number" tick={T} tickFormatter={fmt} name={y_name} width={50} />
            <Tooltip content={<ChatTip palette={palette} />} />
            <Scatter data={data} fill={palette[0]} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      );
      break;
    }
    case "histogram": {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <BarChart {...baseProps}>
            {GRD}{XA}{YA}{TIP}
            <Bar dataKey="value" name={x_name} fill={palette[2]}
              radius={[2, 2, 0, 0]} maxBarSize={40} activeBar={false} />
          </BarChart>
        </ResponsiveContainer>
      );
      break;
    }
    default: /* bar */ {
      chartEl = (
        <ResponsiveContainer width="100%" height={h}>
          <BarChart {...baseProps}>
            {GRD}{XA}{YA}{TIP}
            <Bar dataKey="value" name={y_name || "value"}
              radius={[4, 4, 0, 0]} maxBarSize={44} activeBar={false}>
              {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
  }

  return (
    <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden",
      border: "1px solid var(--border)", background: "var(--bg3)" }}>
      <div style={{ padding: "7px 12px 2px", fontSize: 10, fontWeight: 600,
        color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
        <span>
          {(chart_type || "bar").toUpperCase()}
          {x_name ? ` · ${x_name}` : ""}
          {y_name ? ` vs ${y_name}` : ""}
        </span>
        <span style={{ opacity: 0.7 }}>{totalLabel}</span>
      </div>
      <div style={{ padding: "2px 6px 8px" }}>
        {chartEl}
      </div>
    </div>
  );
}

/* ── inline styles ─────────────────────────────────────────────────────── */
const S = {
  muted: { color: "var(--muted)", fontSize: 11 },
  pill: (color = "var(--accent2)") => ({
    display: "inline-block",
    background: "rgba(77,159,255,0.12)",
    border: `1px solid ${color}`,
    borderRadius: 99, padding: "1px 8px",
    fontSize: 10, color, marginLeft: 6, verticalAlign: "middle",
  }),
};

/* ── render text ─────────────────────────────────────────────────────────  */
function renderAnswer(text) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 4 }} />;
    if (/^[-•]/.test(trimmed)) {
      return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "var(--accent3)", flexShrink: 0 }}>•</span>
          <span style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6 }}>
            {trimmed.slice(1).trim()}
          </span>
        </div>
      );
    }
    return (
      <p key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7, marginBottom: 4 }}>
        {trimmed}
      </p>
    );
  });
}

function DerivedBadges({ cols }) {
  if (!cols?.length) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      <span style={{ ...S.muted, marginRight: 2 }}>✦ computed:</span>
      {cols.map(c => (
        <span key={c} style={S.pill("#00e5a0")}>{c.replace(/_/g, " ")}</span>
      ))}
    </div>
  );
}

/* ── result table ─────────────────────────────────────────────────────── */
function ResultTable({ rows, columns }) {
  if (!rows?.length || !columns?.length) return null;
  const visible = rows.slice(0, 5);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} style={{ padding: "4px 8px", textAlign: "left",
                  color: "var(--muted)", borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap" }}>
                  {c.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri} style={{
                background: ri % 2 === 0 ? "transparent" : "rgba(128,128,128,0.06)" }}>
                {columns.map(c => (
                  <td key={c} style={{ padding: "3px 8px", color: "var(--text2)",
                    borderBottom: "1px solid rgba(128,128,128,0.08)",
                    whiteSpace: "nowrap" }}>
                    {row[c] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 5 && (
        <div style={{ marginTop: 4, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
          Showing 5 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

/* ── message bubble ─────────────────────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 10,
      flexDirection: isUser ? "row-reverse" : "row",
      animation: "fadeIn 0.25s ease" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        background: isUser ? "var(--accent2)" : "var(--bg4)",
        border: "1px solid var(--border)" }}>
        {isUser ? "👤" : "🤖"}
      </div>
      <div style={{ maxWidth: "85%",
        background: isUser ? "var(--accent2)" : "var(--bg3)",
        border: `1px solid ${isUser ? "transparent" : "var(--border)"}`,
        borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
        padding: "10px 14px" }}>
        {renderAnswer(msg.text)}
        <DerivedBadges cols={msg.derivedCols} />

        {/* Interactive chart — primary output */}
        {msg.chartData && <QueryChart chartData={msg.chartData} />}

        {/* Static PNG fallback — only when chartData absent (older messages) */}
        {!msg.chartData && msg.visual?.data && (
          <div style={{ marginTop: 10 }}>
            <img src={`data:image/png;base64,${msg.visual.data}`}
              alt="chart" style={{ maxWidth: "100%", borderRadius: 8 }} />
          </div>
        )}

        <ResultTable rows={msg.table} columns={msg.columns} />

        {msg.rowCount != null && msg.rowCount > 0 && (
          <div style={{ ...S.muted, marginTop: 6 }}>
            {msg.rowCount} row{msg.rowCount !== 1 ? "s" : ""} returned
          </div>
        )}
      </div>
    </div>
  );
}

/* ── typing dots ─────────────────────────────────────────────────────────  */
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%",
        background: "var(--bg4)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        🤖
      </div>
      <div style={{ background: "var(--bg3)", border: "1px solid var(--border)",
        borderRadius: "12px 12px 12px 4px", padding: "12px 16px", display: "flex", gap: 5 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: "50%",
            background: "var(--accent)", display: "inline-block",
            animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "What is the profit margin by category?",
  "Show revenue trend over time",
  "Which segment has the highest average order value?",
  "Top 10 products by total sales",
  "Show the monthly growth rate",
  "Are there any anomalies in the data?",
  "Rank customers by total spend",
  "What percentage does each category contribute?",
];

/* ── Initial message (exported so Dashboard can seed state) ─────────────── */
export const INITIAL_CHAT_MESSAGES = [{
  role: "assistant",
  text: "👋 Hi! Ask me anything about your data — I can calculate margins, ranks, trends, and build computed columns on the fly. Charts are fully interactive!",
}];

/* ── Main component ─────────────────────────────────────────────────────── */
/**
 * messages / setMessages are lifted to Dashboard so chat history
 * persists across tab switches (state lives in Dashboard, not here).
 */
export default function AiChat({ jobId, sessionId, messages, setMessages }) {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const q = inputVal.trim();
    if (!q || loading) return;
    setInputVal("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/query/${jobId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "X-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json();

      // Extract structured chartData for Recharts; keep PNG only as last resort
      const chartData = data.visual?.chartData || null;

      setMessages(m => [...m, {
        role:        "assistant",
        text:        data.answer || "No answer returned.",
        chartData,                                       // ← Recharts data
        visual:      chartData ? null : (data.visual || null),  // PNG fallback
        table:       data.data?.length ? data.data : null,
        columns:     data.columns      || [],
        derivedCols: data.derived_cols || [],
        rowCount:    data.row_count    ?? null,
      }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: `⚠ Error: ${e.message}` }]);
    }

    setLoading(false);
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 400 }}>
      {/* messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0",
        display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* suggestions (only on first screen) */}
      {messages.length <= 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setInputVal(s)}
              style={{ background: "var(--bg3)", border: "1px solid var(--border)",
                borderRadius: 99, color: "var(--text2)",
                fontSize: 11, padding: "5px 12px",
                cursor: "pointer", whiteSpace: "nowrap" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <div style={{ display: "flex", gap: 8, padding: "10px 0 0" }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything — margins, trends, rankings, comparisons…"
          style={{ flex: 1, background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--text)",
            padding: "10px 14px", fontSize: 13, outline: "none" }}
        />
        <button onClick={send} disabled={!inputVal.trim() || loading}
          style={{ padding: "10px 18px",
            background: "linear-gradient(135deg,var(--accent2),var(--accent))",
            border: "none", borderRadius: 8,
            color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: !inputVal.trim() || loading ? "not-allowed" : "pointer",
            opacity: !inputVal.trim() || loading ? 0.5 : 1,
            transition: "opacity 0.15s" }}>
          ↑
        </button>
      </div>
    </div>
  );
}
