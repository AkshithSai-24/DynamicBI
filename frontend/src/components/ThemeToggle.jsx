import { useTheme, THEMES } from "../ThemeContext.jsx";

/**
 * Compact theme-cycle button.
 * Shows the NEXT theme's icon so the user knows what clicking will do.
 * variant="icon"  → circular icon-only button (for tight headers)
 * variant="pill"  → icon + label pill (for landing page / loading screen)
 */
export default function ThemeToggle({ variant = "pill" }) {
  const { theme, cycleTheme } = useTheme();

  const keys     = Object.keys(THEMES);
  const current  = THEMES[theme] || THEMES.dark;
  const nextKey  = keys[(keys.indexOf(theme) + 1) % keys.length];
  const next     = THEMES[nextKey];

  const title = `Switch to ${next.label} theme`;

  if (variant === "icon") {
    return (
      <button
        onClick={cycleTheme}
        title={title}
        aria-label={title}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8, fontSize: 16,
          background: "var(--bg3)", border: "1px solid var(--border)",
          color: "var(--text2)", cursor: "pointer",
          transition: "background 0.2s, transform 0.15s",
          flexShrink: 0,
        }}
        onMouseOver={e => { e.currentTarget.style.background = "var(--bg4)"; e.currentTarget.style.transform = "rotate(20deg)"; }}
        onMouseOut={e  => { e.currentTarget.style.background = "var(--bg3)"; e.currentTarget.style.transform = "none"; }}
      >
        {current.icon}
      </button>
    );
  }

  /* pill variant */
  return (
    <button
      onClick={cycleTheme}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 13px", borderRadius: 99, fontSize: 13, fontWeight: 700,
        background: "var(--bg3)", border: "1px solid var(--border)",
        color: "var(--text2)", cursor: "pointer",
        transition: "background 0.2s, color 0.2s",
      }}
      onMouseOver={e => { e.currentTarget.style.background = "var(--bg4)"; e.currentTarget.style.color = "var(--text)"; }}
      onMouseOut={e  => { e.currentTarget.style.background = "var(--bg3)"; e.currentTarget.style.color = "var(--text2)"; }}
    >
      <span style={{ fontSize: 15 }}>{current.icon}</span>
      {current.label}
    </button>
  );
}
