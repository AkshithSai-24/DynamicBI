/**
 * MarkdownRenderer.jsx
 * Theme-aware: all colours use CSS custom properties so every theme looks correct.
 */

/* Read a CSS variable from :root at render time */
function v(name) {
  return `var(${name})`;
}

/* Heading accent colours cycling via CSS vars */
const H_COLORS = [v("--accent"), v("--accent2"), v("--accent3"), v("--accent5")];

/* ── Inline parser: bold, italic, code, links ───────────────────────────── */
function parseInline(text) {
  if (!text) return null;
  const parts = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={m.index} style={{ color: v("--text"), fontWeight: 800 }}><em>{m[2]}</em></strong>);
    else if (m[3]) parts.push(<strong key={m.index} style={{ color: v("--text"), fontWeight: 700 }}>{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={m.index} style={{ color: v("--text2"), fontStyle: "italic" }}>{m[4]}</em>);
    else if (m[5]) parts.push(
      <code key={m.index} style={{
        background: v("--bg3"), color: v("--accent3"), fontFamily: "monospace",
        padding: "1px 5px", borderRadius: 4, fontSize: "0.88em",
        border: `1px solid ${v("--border")}`,
      }}>{m[5]}</code>
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

/* ── Block-level renderer ──────────────────────────────────────────────── */
export default function MarkdownRenderer({ content, style = {} }) {
  if (!content) return null;

  const lines  = content.split("\n");
  const nodes  = [];
  let   i      = 0;
  let   key    = 0;
  const K      = () => key++;

  while (i < lines.length) {
    const raw  = lines[i];
    const line = raw.trimEnd();

    // ── Fenced code block ────────────────────────────────────────
    if (line.startsWith("```")) {
      const lang  = line.slice(3).trim();
      const block = [];
      i++;
      while (i < lines.length && !lines[i].trimEnd().startsWith("```")) {
        block.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={K()} style={{
          background: v("--bg3"), border: `1px solid ${v("--border")}`, borderRadius: 8,
          padding: "12px 16px", overflowX: "auto", margin: "12px 0",
          fontFamily: "monospace", fontSize: 12, color: v("--accent3"), lineHeight: 1.6,
        }}>
          {lang && <span style={{ color: v("--muted"), fontSize: 10, display: "block", marginBottom: 4 }}>{lang}</span>}
          {block.join("\n")}
        </pre>
      );
      i++;
      continue;
    }

    // ── Horizontal rule ──────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={K()} style={{ border: "none", borderTop: `1px solid ${v("--border")}`, margin: "14px 0" }} />);
      i++; continue;
    }

    // ── Headings ─────────────────────────────────────────────────
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text  = hMatch[2];
      const color = H_COLORS[(level - 1) % H_COLORS.length];
      const sizes = { 1: 20, 2: 17, 3: 14, 4: 13 };
      const mt    = level === 1 ? 20 : level === 2 ? 16 : 12;
      nodes.push(
        <div key={K()} style={{
          fontSize: sizes[level], fontWeight: 800, color,
          marginTop: mt, marginBottom: level <= 2 ? 10 : 6,
          paddingBottom: level <= 2 ? 6 : 0,
          borderBottom: level <= 2 ? `1px solid ${v("--border")}` : "none",
          letterSpacing: level === 1 ? -0.3 : 0,
        }}>
          {parseInline(text)}
        </div>
      );
      i++; continue;
    }

    // ── Bullet list ──────────────────────────────────────────────
    if (/^(\s*[-*+])\s+/.test(line)) {
      const items = [];
      const indent0 = line.match(/^(\s*)/)[1].length;
      while (i < lines.length) {
        const l = lines[i].trimEnd();
        const bm = l.match(/^(\s*)[-*+]\s+(.*)/);
        if (!bm) break;
        const indent = bm[1].length;
        items.push({ text: bm[2], indent });
        i++;
      }
      nodes.push(
        <ul key={K()} style={{ margin: "6px 0 8px", padding: 0, listStyle: "none" }}>
          {items.map((it, idx) => (
            <li key={idx} style={{
              display: "flex", gap: 8, marginBottom: 4,
              paddingLeft: it.indent > indent0 ? 20 : 0,
            }}>
              <span style={{ color: v("--accent"), flexShrink: 0, marginTop: 1, fontSize: 13 }}>•</span>
              <span style={{ fontSize: 13, color: v("--text2"), lineHeight: 1.65 }}>{parseInline(it.text)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Numbered list ────────────────────────────────────────────
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l  = lines[i].trimEnd();
        const nm = l.match(/^(\d+)\.\s+(.*)/);
        if (!nm) break;
        items.push({ n: nm[1], text: nm[2] });
        i++;
      }
      nodes.push(
        <ol key={K()} style={{ margin: "6px 0 8px", padding: 0, listStyle: "none" }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <span style={{
                background: v("--accent2"), color: "#fff", borderRadius: 99,
                fontSize: 10, fontWeight: 800, minWidth: 20, height: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 2,
              }}>{it.n}</span>
              <span style={{ fontSize: 13, color: v("--text2"), lineHeight: 1.65 }}>{parseInline(it.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Blank line ───────────────────────────────────────────────
    if (!line.trim()) {
      nodes.push(<div key={K()} style={{ height: 6 }} />);
      i++; continue;
    }

    // ── Paragraph ────────────────────────────────────────────────
    nodes.push(
      <p key={K()} style={{ fontSize: 13, color: v("--text2"), lineHeight: 1.75, margin: "3px 0 5px" }}>
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return (
    <div style={{ fontFamily: "inherit", ...style }}>
      {nodes}
    </div>
  );
}
