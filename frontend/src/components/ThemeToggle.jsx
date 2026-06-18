import { useState, useRef, useEffect } from "react";
import { useTheme, THEMES } from "../ThemeContext.jsx";

/**
 * Theme selector dropdown — shows current theme with icon + label,
 * opens a menu listing all four themes.
 *
 * variant="compact"  → icon + label + chevron (default, fits headers)
 * variant="icon"     → icon-only button that opens the same dropdown
 */
export default function ThemeToggle({ variant = "compact" }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen]     = useState(false);
  const ref                 = useRef(null);

  const current = THEMES[theme] || THEMES.dark;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buttonBase = {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "var(--bg3)", border: "1px solid var(--border)",
    color: "var(--text2)", cursor: "pointer", borderRadius: 8,
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...buttonBase,
          padding: variant === "icon" ? "6px 8px" : "6px 12px",
          fontSize: 13, fontWeight: 700,
        }}
        onMouseOver={e => { e.currentTarget.style.background = "var(--bg4)"; e.currentTarget.style.color = "var(--text)"; }}
        onMouseOut={e  => { e.currentTarget.style.background = "var(--bg3)"; e.currentTarget.style.color = "var(--text2)"; }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{current.icon}</span>
        {variant !== "icon" && <span>{current.label}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 6px)",
            right: 0, zIndex: 1000,
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden", minWidth: 150,
            boxShadow: "var(--shadow)",
          }}
        >
          {Object.entries(THEMES).map(([key, def]) => {
            const isActive = key === theme;
            return (
              <button
                key={key}
                role="option"
                aria-selected={isActive}
                onClick={() => { setTheme(key); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "9px 14px", background: isActive ? "var(--bg3)" : "transparent",
                  border: "none", cursor: "pointer", fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--accent)" : "var(--text2)",
                  transition: "background 0.12s",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = "var(--bg3)"; e.currentTarget.style.color = "var(--text)"; }}}
                onMouseOut={e  => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text2)"; }}}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{def.icon}</span>
                <span>{def.label}</span>
                {isActive && <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
