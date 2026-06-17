import { createContext, useContext, useState, useEffect, useCallback } from "react";

/* ── Theme definitions ─────────────────────────────────────────────────────
   Each theme defines CSS variable overrides applied to <html data-theme="X">
   plus a matching chart PALETTE array for Recharts (which can't read CSS vars).
   ───────────────────────────────────────────────────────────────────────── */
export const THEMES = {
  dark: {
    label: "Dark",
    icon: "🌑",
    vars: {
      "--bg":      "#0e1117", "--bg2":    "#161b27", "--bg3": "#1c2436", "--bg4": "#232c42",
      "--border":  "#2a3550", "--border2":"#354060",
      "--text":    "#e8edf8", "--text2":  "#b0bdd4", "--muted":"#6b7a99",
      "--accent":  "#00d4ff", "--accent2":"#7c5cfc", "--accent3":"#00e5a0",
      "--accent4": "#ff6b6b", "--accent5":"#f4a535", "--accent6":"#c084fc",
      "--red":     "#ff5e7a", "--green":  "#00e5a0", "--orange":"#fb923c",
      "--shadow":  "0 4px 24px rgba(0,0,0,0.45)",
      "--chart-grid": "#1e2a40", "--chart-tick": "#6b7a99",
      "--tooltip-bg": "#0e1117", "--tooltip-border": "#2a3550",
    },
    palette: ["#00d4ff","#7c5cfc","#00e5a0","#ff6b6b","#f4a535",
              "#c084fc","#60d394","#fb923c","#38bdf8","#ffd93d",
              "#e879f9","#34d399","#f87171","#a78bfa","#facc15"],
  },

  light: {
    label: "Light",
    icon: "☀️",
    vars: {
      "--bg":      "#f0f4f8", "--bg2":    "#ffffff", "--bg3":"#e8edf5", "--bg4":"#dde3ed",
      "--border":  "#c5cfde", "--border2":"#a8b4cc",
      "--text":    "#111827", "--text2":  "#374151", "--muted":"#6b7280",
      "--accent":  "#0284c7", "--accent2":"#7c3aed", "--accent3":"#059669",
      "--accent4": "#dc2626", "--accent5":"#d97706", "--accent6":"#9333ea",
      "--red":     "#dc2626", "--green":  "#059669", "--orange":"#ea580c",
      "--shadow":  "0 4px 20px rgba(0,0,0,0.10)",
      "--chart-grid": "#d1d9e6", "--chart-tick": "#6b7280",
      "--tooltip-bg": "#ffffff", "--tooltip-border": "#c5cfde",
    },
    palette: ["#0284c7","#7c3aed","#059669","#dc2626","#d97706",
              "#9333ea","#0d9488","#ea580c","#0369a1","#ca8a04",
              "#c026d3","#16a34a","#ef4444","#6d28d9","#eab308"],
  },

  ocean: {
    label: "Ocean",
    icon: "🌊",
    vars: {
      "--bg":      "#03111e", "--bg2":    "#051929", "--bg3":"#072236", "--bg4":"#0a2d47",
      "--border":  "#0d3a5c", "--border2":"#10486f",
      "--text":    "#cce8f8", "--text2":  "#7ec8e3", "--muted":"#3d7a9b",
      "--accent":  "#00c6fb", "--accent2":"#0080d4", "--accent3":"#00e5bc",
      "--accent4": "#ff6b8a", "--accent5":"#ffd166", "--accent6":"#a78bfa",
      "--red":     "#ff4d6d", "--green":  "#00e5bc", "--orange":"#ffd166",
      "--shadow":  "0 4px 24px rgba(0,0,0,0.55)",
      "--chart-grid": "#0d3a5c", "--chart-tick": "#3d7a9b",
      "--tooltip-bg": "#03111e", "--tooltip-border": "#0d3a5c",
    },
    palette: ["#00c6fb","#0080d4","#00e5bc","#ff6b8a","#ffd166",
              "#a78bfa","#22d3ee","#f59e0b","#38bdf8","#34d399",
              "#e879f9","#06b6d4","#f87171","#818cf8","#facc15"],
  },

  midnight: {
    label: "Midnight",
    icon: "🌌",
    vars: {
      "--bg":      "#0d0d1a", "--bg2":    "#12122a", "--bg3":"#181836", "--bg4":"#1e1e42",
      "--border":  "#252550", "--border2":"#2e2e62",
      "--text":    "#e8e0ff", "--text2":  "#b8aef0", "--muted":"#6b64a0",
      "--accent":  "#a78bfa", "--accent2":"#ec4899", "--accent3":"#34d399",
      "--accent4": "#f87171", "--accent5":"#fbbf24", "--accent6":"#60a5fa",
      "--red":     "#f87171", "--green":  "#34d399", "--orange":"#fbbf24",
      "--shadow":  "0 4px 28px rgba(0,0,0,0.6)",
      "--chart-grid": "#252550", "--chart-tick": "#6b64a0",
      "--tooltip-bg": "#0d0d1a", "--tooltip-border": "#252550",
    },
    palette: ["#a78bfa","#ec4899","#34d399","#f87171","#fbbf24",
              "#60a5fa","#e879f9","#10b981","#fb7185","#818cf8",
              "#c084fc","#06b6d4","#fcd34d","#38bdf8","#4ade80"],
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("dbi-theme") || "dark"; }
    catch { return "dark"; }
  });

  // Apply CSS vars to <html> whenever theme changes
  useEffect(() => {
    const def = THEMES[theme] || THEMES.dark;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    Object.entries(def.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    try { localStorage.setItem("dbi-theme", theme); } catch {}
  }, [theme]);

  const cycleTheme = useCallback(() => {
    const keys = Object.keys(THEMES);
    setTheme(t => keys[(keys.indexOf(t) + 1) % keys.length]);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Returns the chart colour palette for the active theme */
export function usePalette() {
  const ctx = useContext(ThemeContext);
  return (ctx ? THEMES[ctx.theme] : THEMES.dark)?.palette ?? THEMES.dark.palette;
}
