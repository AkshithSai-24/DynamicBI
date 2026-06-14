import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

/* ── inline styles shared ───────────────────────────────────────────────── */
const S = {
  muted:   { color: "var(--muted)", fontSize: 11 },
  accent:  { color: "var(--accent)" },
  accent2: { color: "var(--accent2)" },
  pill: (color = "var(--accent2)") => ({
    display: "inline-block",
    background: "rgba(77,159,255,0.12)",
    border: `1px solid ${color}`,
    borderRadius: 99,
    padding: "1px 8px",
    fontSize: 10,
    color,
    marginLeft: 6,
    verticalAlign: "middle",
  }),
};

/* ── render answer text (bullet-aware) ──────────────────────────────────── */
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

/* ── derived-column badge strip ─────────────────────────────────────────── */
function DerivedBadges({ cols }) {
  if (!cols?.length) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      <span style={{ ...S.muted, marginRight: 2 }}>✦ computed:</span>
      {cols.map(c => (
        <span key={c} style={S.pill("#00e5a0")}>
          {c.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

/* ── result table with expand ───────────────────────────────────────────── */
const PREVIEW_ROWS = 5;

function ResultTable({ rows, columns }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows?.length || !columns?.length) return null;

  const visible  = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
  const hasMore  = rows.length > PREVIEW_ROWS;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} style={{
                  padding: "4px 8px", textAlign: "left",
                  color: "var(--muted)", borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}>
                  {c.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(0,0,0,0.15)" }}>
                {columns.map(c => (
                  <td key={c} style={{
                    padding: "3px 8px",
                    color: "var(--text2)",
                    borderBottom: "1px solid rgba(42,53,80,0.35)",
                    whiteSpace: "nowrap",
                  }}>
                    {row[c] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 6, width: "100%", padding: "4px 0",
            background: "rgba(77,159,255,0.07)",
            border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--accent2)",
            fontSize: 11, cursor: "pointer",
          }}
        >
          {expanded
            ? `▲ Show less`
            : `▼ Show all ${rows.length} rows  (${rows.length - PREVIEW_ROWS} more)`}
        </button>
      )}
    </div>
  );
}

/* ── message bubble ─────────────────────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", gap: 10,
      flexDirection: isUser ? "row-reverse" : "row",
      animation: "fadeIn 0.25s ease",
    }}>
      {/* avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14,
        background: isUser ? "var(--accent2)" : "var(--bg4)",
        border: "1px solid var(--border)",
      }}>
        {isUser ? "👤" : "🤖"}
      </div>

      {/* content */}
      <div style={{
        maxWidth: "82%",
        background: isUser ? "var(--accent2)" : "var(--bg3)",
        border: `1px solid ${isUser ? "transparent" : "var(--border)"}`,
        borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
        padding: "10px 14px",
      }}>
        {renderAnswer(msg.text)}

        {/* derived columns indicator */}
        <DerivedBadges cols={msg.derivedCols} />

        {/* chart */}
        {msg.visual && (
          <div style={{ marginTop: 10 }}>
            <img
              src={`data:image/png;base64,${msg.visual.data}`}
              alt="chart"
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />
          </div>
        )}

        {/* table */}
        <ResultTable rows={msg.table} columns={msg.columns} />

        {/* row-count footer */}
        {msg.rowCount != null && msg.rowCount > 0 && (
          <div style={{ ...S.muted, marginTop: 6 }}>
            {msg.rowCount} row{msg.rowCount !== 1 ? "s" : ""} returned
          </div>
        )}
      </div>
    </div>
  );
}

/* ── typing indicator ───────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "var(--bg4)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
      }}>🤖</div>
      <div style={{
        background: "var(--bg3)", border: "1px solid var(--border)",
        borderRadius: "12px 12px 12px 4px",
        padding: "12px 16px", display: "flex", gap: 5,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--accent)",
            display: "inline-block",
            animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ── suggestion chips ───────────────────────────────────────────────────── */
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

/* ── main component ─────────────────────────────────────────────────────── */
export default function AiChat({ jobId }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    text: "👋 Hi! Ask me anything about your data — I can calculate margins, ranks, trends, or build computed columns on the fly to answer your question.",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/query/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json();

      setMessages(m => [...m, {
        role:        "assistant",
        text:        data.answer || "No answer returned.",
        visual:      data.visual  || null,
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

      {/* ── messages ── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "12px 0",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* ── suggestions (first screen only) ── */}
      {messages.length <= 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {SUGGESTIONS.map(s => (
            <button key={s}
              onClick={() => setInput(s)}
              style={{
                background: "var(--bg3)", border: "1px solid var(--border)",
                borderRadius: 99, color: "var(--text2)",
                fontSize: 11, padding: "5px 12px",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── input bar ── */}
      <div style={{ display: "flex", gap: 8, padding: "10px 0 0" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything — margins, trends, rankings, comparisons…"
          style={{
            flex: 1, background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--text)",
            padding: "10px 14px", fontSize: 13, outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg,var(--accent2),var(--accent))",
            border: "none", borderRadius: 8,
            color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: !input.trim() || loading ? "not-allowed" : "pointer",
            opacity: !input.trim() || loading ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
