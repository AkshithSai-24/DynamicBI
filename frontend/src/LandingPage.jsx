import { useState, useEffect, useRef } from "react";

const ORBIT_NODES = [
  { label: "KPIs",     icon: "📊", angle: 0,   r: 38, size: 48, color: "#4ade80" },
  { label: "Charts",   icon: "📈", angle: 72,  r: 38, size: 44, color: "#60a5fa" },
  { label: "SQL",      icon: "🗄️",  angle: 144, r: 38, size: 44, color: "#f59e0b" },
  { label: "AI",       icon: "🤖",  angle: 216, r: 38, size: 52, color: "#a78bfa" },
  { label: "CSV",      icon: "📁",  angle: 288, r: 38, size: 44, color: "#fb7185" },
  { label: "Trends",   icon: "🔮",  angle: 36,  r: 62, size: 38, color: "#34d399" },
  { label: "Alerts",   icon: "🔔",  angle: 108, r: 62, size: 38, color: "#818cf8" },
  { label: "Reports",  icon: "📋",  angle: 180, r: 62, size: 38, color: "#fbbf24" },
  { label: "Forecast", icon: "🚀",  angle: 252, r: 62, size: 38, color: "#f472b6" },
  { label: "Stream",   icon: "⚡",  angle: 324, r: 62, size: 38, color: "#2dd4bf" },
];

function OrbitNode({ node, rotation, orbitNodeBg }) {
  const rad = ((node.angle + rotation) * Math.PI) / 180;
  const cx = 50 + node.r * Math.cos(rad);
  const cy = 50 + node.r * Math.sin(rad);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: `${cx}%`, top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        width: node.size, height: node.size,
        borderRadius: node.size / 2,
        background: hovered ? `${node.color}30` : (orbitNodeBg || "rgba(14,17,23,0.85)"),
        border: `2px solid ${hovered ? node.color : node.color + "60"}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.3s ease",
        backdropFilter: "blur(10px)",
        boxShadow: hovered ? `0 0 20px ${node.color}50` : "none",
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: node.size * 0.38 }}>{node.icon}</span>
      {hovered && (
        <span style={{
          position: "absolute", bottom: -24,
          fontSize: 10, color: node.color, fontWeight: 700,
          whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace",
        }}>{node.label}</span>
      )}
    </div>
  );
}

function StatBadge({ value, label, delay, statBg, statBorder, statMuted }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.6s ease",
      background: statBg || "rgba(22,27,39,0.9)",
      border: `1px solid ${statBorder || "rgba(74,222,128,0.2)"}`,
      borderRadius: 16, padding: "16px 20px",
      textAlign: "center", backdropFilter: "blur(12px)",
    }}>
      <div style={{ fontSize: "clamp(22px,5vw,36px)", fontWeight: 900, background: "linear-gradient(135deg, #4ade80, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{value}</div>
      <div style={{ fontSize: 11, color: statMuted || "#6b7a9a", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{label}</div>
    </div>
  );
}

export default function LandingPage({ onEnter, darkMode = true, onToggleTheme }) {
  const [rotation, setRotation] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showDemo, setShowDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const animRef = useRef();
  const videoRef = useRef();

  const T = darkMode ? {
    bg: "#0a0d14", navBg: "rgba(10,13,20,0.6)", navBorder: "rgba(35,44,62,0.6)",
    text: "#e8ecf4", muted: "#6b7a9a", cardBg: "rgba(22,27,39,0.9)",
    cardBorder: "rgba(74,222,128,0.2)", featureBg: "rgba(22,27,39,0.6)",
    featureBorder: "rgba(35,44,62,0.8)", orbitNode: "rgba(14,17,23,0.85)",
    statBg: "rgba(22,27,39,0.9)",
    ctaBg: "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(96,165,250,0.08))",
    ctaBorder: "rgba(74,222,128,0.15)", toggleBorder: "rgba(74,222,128,0.3)",
    footerBorder: "rgba(35,44,62,0.6)", teamFooterBg: "rgba(10,13,20,0.95)",
    teamFooterBorder: "rgba(35,44,62,0.8)",
  } : {
    bg: "#f0f4fd", navBg: "rgba(240,244,253,0.85)", navBorder: "rgba(200,215,240,0.6)",
    text: "#1a2540", muted: "#5a6a8a", cardBg: "rgba(255,255,255,0.95)",
    cardBorder: "rgba(74,222,128,0.3)", featureBg: "rgba(255,255,255,0.85)",
    featureBorder: "rgba(200,215,240,0.8)", orbitNode: "rgba(240,244,253,0.92)",
    statBg: "rgba(255,255,255,0.9)",
    ctaBg: "linear-gradient(135deg, rgba(74,222,128,0.06), rgba(96,165,250,0.06))",
    ctaBorder: "rgba(74,222,128,0.25)", toggleBorder: "rgba(74,222,128,0.5)",
    footerBorder: "rgba(200,215,240,0.6)", teamFooterBg: "rgba(240,244,253,0.97)",
    teamFooterBorder: "rgba(200,215,240,0.8)",
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setShowDemo(false); videoRef.current?.pause(); setMenuOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      setRotation(((ts - start) / 80) % 360);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  useEffect(() => {
    const onMove = (e) => setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, overflowX: "hidden", fontFamily: "'Bricolage Grotesque', sans-serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes pulse-ring {
          0%   { transform: translate(-50%,-50%) scale(0.95); opacity: 0.5; }
          50%  { transform: translate(-50%,-50%) scale(1.02); opacity: 0.3; }
          100% { transform: translate(-50%,-50%) scale(0.95); opacity: 0.5; }
        }
        @keyframes float-up {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(74,222,128,0.3), 0 0 60px rgba(74,222,128,0.1); }
          50%       { box-shadow: 0 0 40px rgba(74,222,128,0.5), 0 0 100px rgba(74,222,128,0.2); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .hero-title span {
          background: linear-gradient(135deg, ${darkMode ? "#ffffff" : "#1a2540"} 0%, #4ade80 50%, #60a5fa 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .cta-btn {
          animation: glow-pulse 2s ease-in-out infinite;
          transition: transform 0.2s ease;
        }
        .cta-btn:hover { transform: scale(1.05) !important; }
        .nav-link {
          color: ${T.muted};
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
          cursor: pointer;
        }
        .nav-link:hover { color: ${T.text}; }
        .feature-card { transition: border-color 0.3s, background 0.3s, transform 0.3s; }
        .feature-card:hover {
          border-color: rgba(74,222,128,0.4) !important;
          background: ${darkMode ? "rgba(74,222,128,0.04)" : "rgba(74,222,128,0.08)"} !important;
          transform: translateY(-4px);
        }

        /* ── NAV ── */
        .lp-nav {
          position: relative; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 60px;
          border-bottom: 1px solid ${T.navBorder};
          backdrop-filter: blur(20px);
          background: ${T.navBg};
        }
        .lp-nav-center { display: flex; gap: 36px; }
        .lp-nav-right  { display: flex; gap: 12px; align-items: center; }
        .lp-hamburger  { display: none !important; }
        .lp-mobile-drawer { display: none !important; }

        /* ── HERO ── */
        .lp-hero {
          position: relative; z-index: 10;
          display: flex; align-items: center;
          min-height: 90vh; padding: 60px; gap: 60px;
          max-width: 1400px; margin: 0 auto;
        }
        .lp-hero-copy  { flex: 0 0 52%; animation: float-up 0.8s ease both; }
        .lp-hero-visual {
          flex: 1; position: relative; height: 520px;
          animation: float-up 1s ease 0.2s both;
        }
        .lp-hero-btns  { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .lp-trust-row  { display: flex; gap: 28px; margin-top: 52px; align-items: center; flex-wrap: wrap; }

        /* ── STATS ── */
        .lp-stats { position: relative; z-index: 10; padding: 0 60px 80px; max-width: 1400px; margin: 0 auto; }
        .lp-stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }

        /* ── FEATURES ── */
        .lp-features { position: relative; z-index: 10; padding: 60px 60px 120px; max-width: 1400px; margin: 0 auto; }
        .lp-features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }

        /* ── CTA ── */
        .lp-cta {
          position: relative; z-index: 10;
          margin: 0 60px 100px; border-radius: 28px;
          background: ${T.ctaBg}; border: 1px solid ${T.ctaBorder};
          padding: 72px 60px; text-align: center;
          backdrop-filter: blur(20px); overflow: hidden;
        }

        /* ── FOOTER ── */
        .lp-footer {
          position: relative; z-index: 10;
          border-top: 1px solid ${T.footerBorder};
          padding: 28px 60px;
          display: flex; justify-content: space-between; align-items: center;
        }

        /* ─── TABLET ≤ 900px ─── */
        @media (max-width: 900px) {
          .lp-nav { padding: 14px 28px; }
          .lp-nav-center { gap: 20px; }
          .lp-hero { padding: 40px 28px 48px; gap: 36px; flex-direction: column; min-height: unset; }
          .lp-hero-copy { flex: none; width: 100%; text-align: center; }
          .lp-hero-btns { justify-content: center; }
          .lp-trust-row { justify-content: center; }
          .lp-hero-visual { width: 100%; flex: none; height: 360px; }
          .lp-stats { padding: 0 28px 60px; }
          .lp-stats-grid { grid-template-columns: repeat(2,1fr); }
          .lp-features { padding: 40px 28px 80px; }
          .lp-features-grid { grid-template-columns: repeat(2,1fr); }
          .lp-cta { margin: 0 28px 80px; padding: 48px 28px; }
          .lp-footer { padding: 24px 28px; flex-direction: column; gap: 16px; text-align: center; }
        }

        /* ─── MOBILE ≤ 600px ─── */
        @media (max-width: 600px) {
          .lp-nav { padding: 12px 16px; }
          .lp-nav-center { display: none !important; }
          .lp-nav-launch { display: none !important; }
          .lp-hamburger {
            display: flex !important;
            align-items: center; justify-content: center;
            width: 38px; height: 38px; border-radius: 10px;
            border: 1px solid ${T.navBorder};
            background: transparent; cursor: pointer;
            color: ${T.text}; font-size: 18px; flex-shrink: 0;
          }
          .lp-mobile-drawer {
            display: flex !important;
            flex-direction: column; gap: 0;
            position: absolute; top: 100%; left: 0; right: 0;
            background: ${T.navBg}; border-bottom: 1px solid ${T.navBorder};
            backdrop-filter: blur(20px);
            padding: 8px 16px 16px;
            animation: slideDown 0.2s ease both;
            z-index: 200;
          }
          .lp-mobile-drawer a,
          .lp-mobile-drawer .mob-row {
            display: block; padding: 12px 0;
            border-bottom: 1px solid ${T.navBorder};
            font-size: 14px;
          }
          .lp-hero { padding: 28px 16px 40px; gap: 24px; }
          .lp-hero-visual { height: 280px; }
          .lp-stats { padding: 0 16px 48px; }
          .lp-stats-grid { grid-template-columns: repeat(2,1fr); gap: 12px; }
          .lp-features { padding: 32px 16px 64px; }
          .lp-features-grid { grid-template-columns: 1fr; }
          .lp-cta { margin: 0 16px 60px; padding: 36px 20px; border-radius: 20px; }
          .lp-footer { padding: 20px 16px; gap: 12px; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Animated background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: `
          radial-gradient(ellipse at ${30 + mousePos.x * 20}% ${20 + mousePos.y * 20}%, ${darkMode ? "rgba(74,222,128,0.08)" : "rgba(74,222,128,0.12)"} 0%, transparent 60%),
          radial-gradient(ellipse at ${70 - mousePos.x * 20}% ${80 - mousePos.y * 20}%, ${darkMode ? "rgba(96,165,250,0.08)" : "rgba(96,165,250,0.12)"} 0%, transparent 60%),
          ${T.bg}
        `,
        transition: "background 0.4s ease",
        pointerEvents: "none",
      }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, opacity: 0.03, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", pointerEvents: "none" }} />

      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #4ade80, #60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#0a0d14", flexShrink: 0 }}>D</div>
          <div>
            <span style={{ fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: "-0.3px", display: "block", lineHeight: 1.2 }}>DynamicBI</span>
            <span style={{ fontSize: 9, color: T.muted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.3px", display: "block" }}>Agentic AI · Conversational BI</span>
          </div>
        </div>

        {/* Desktop center links */}
        <div className="lp-nav-center">
          <a href="https://github.com/AkshithSai-24/DynamicBI" target="_blank" rel="noreferrer" className="nav-link">GitHub</a>
        </div>

        {/* Desktop right actions */}
        <div className="lp-nav-right">
          <button onClick={onToggleTheme} title={darkMode ? "Light Mode" : "Dark Mode"} style={{ width: 52, height: 28, borderRadius: 14, border: `1.5px solid ${T.toggleBorder}`, background: darkMode ? "rgba(15,20,35,0.8)" : "rgba(240,248,255,0.9)", cursor: "pointer", position: "relative", transition: "all 0.35s cubic-bezier(.2,.8,.4,1)", display: "flex", alignItems: "center", padding: "2px 3px", flexShrink: 0 }}>
            <span style={{ position: "absolute", left: 6, fontSize: 10, opacity: darkMode ? 0.8 : 0.3, transition: "opacity 0.3s" }}>🌙</span>
            <span style={{ position: "absolute", right: 6, fontSize: 10, opacity: darkMode ? 0.3 : 0.9, transition: "opacity 0.3s" }}>☀️</span>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: darkMode ? "linear-gradient(135deg,#6b7a9a,#4ade8060)" : "linear-gradient(135deg,#fbbf24,#f59e0b)", transform: darkMode ? "translateX(0px)" : "translateX(24px)", transition: "transform 0.35s cubic-bezier(.2,.8,.4,1), background 0.3s", flexShrink: 0, zIndex: 1 }} />
          </button>
          <button className="lp-nav-launch" onClick={onEnter} style={{ padding: "9px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "#0a0d14", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Launch App →</button>

          {/* Hamburger (mobile only) */}
          <button className="lp-hamburger" onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }} aria-label="Toggle menu">
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="lp-mobile-drawer" onClick={e => e.stopPropagation()}>
            <a href="https://github.com/AkshithSai-24/DynamicBI" target="_blank" rel="noreferrer" className="nav-link" style={{ color: T.muted }}>GitHub</a>
            <button className="mob-row" onClick={onToggleTheme} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 14, textAlign: "left", width: "100%" }}>
              {darkMode ? "☀️  Switch to Light Mode" : "🌙  Switch to Dark Mode"}
            </button>
            <button onClick={onEnter} style={{ marginTop: 12, padding: "14px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4ade80,#22c55e)", color: "#0a0d14", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif", width: "100%" }}>
              Launch App →
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        {/* Copy */}
        <div className="lp-hero-copy">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 100, padding: "6px 14px", marginBottom: 28 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80", flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: "clamp(9px,1.8vw,12px)", color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>DynamicBI: Agentic AI Framework for Conversational Business Intelligence</span>
          </div>

          <h1 className="hero-title" style={{ fontSize: "clamp(30px,5.5vw,76px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", marginBottom: 24, color: T.text }}>
            Unlock Deep{" "}<span>Business Intelligence</span>{" "}You Thought Was Out of Reach
          </h1>

          <p style={{ fontSize: "clamp(14px,2vw,18px)", color: T.muted, lineHeight: 1.7, marginBottom: 40, maxWidth: 500 }}>
            Connect any data source and get automated KPIs, visualisations, anomaly detection, forecasting, and natural-language insights — all powered by the <strong style={{ color: "#4ade80" }}>DynamicBI Agentic AI Framework</strong>.
          </p>

          <div className="lp-hero-btns">
            <button className="cta-btn" onClick={onEnter} style={{ padding: "15px 32px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#4ade80,#22c55e)", color: "#0a0d14", fontWeight: 800, fontSize: "clamp(14px,2vw,16px)", cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
              Start Analysing →
            </button>
            <button onClick={() => setShowDemo(true)} style={{ padding: "15px 24px", borderRadius: 14, border: "1px solid rgba(74,222,128,0.25)", background: "transparent", color: T.text, fontWeight: 600, fontSize: "clamp(13px,2vw,15px)", cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(74,222,128,0.6)"; e.currentTarget.style.color = "#4ade80"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(74,222,128,0.25)"; e.currentTarget.style.color = T.text; }}>
              ▶ Watch Demo
            </button>
          </div>

          <div className="lp-trust-row">
            {["No-code setup", "Any data source", "LLM-powered"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "#4ade80", fontSize: 14 }}>✓</span>
                <span style={{ color: T.muted, fontSize: 13 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orbital viz */}
        <div className="lp-hero-visual">
          {[38, 62, 82].map((r, i) => (
            <div key={i} style={{ position: "absolute", left: "50%", top: "50%", width: `${r * 1.9}%`, height: `${r * 1.9}%`, borderRadius: "50%", border: `1px solid rgba(74,222,128,${0.08 - i * 0.02})`, transform: "translate(-50%,-50%)", animation: `pulse-ring ${3 + i}s ease-in-out infinite` }} />
          ))}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg,rgba(74,222,128,0.15),rgba(96,165,250,0.15))", border: "2px solid rgba(74,222,128,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)", boxShadow: "0 0 40px rgba(74,222,128,0.2)", zIndex: 20 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#4ade80" }}>10k+</span>
            <span style={{ fontSize: 10, color: "#6b7a9a", fontFamily: "'DM Mono', monospace" }}>Insights</span>
          </div>
          {ORBIT_NODES.map((node, i) => (
            <OrbitNode key={i} node={node} rotation={rotation} orbitNodeBg={T.orbitNode} />
          ))}
          {[
            { top: "8%", right: "2%", label: "Anomaly detected", sub: "Revenue spike +42%", color: "#f59e0b" },
            { bottom: "12%", left: "0%", label: "Forecast ready", sub: "Next 30 days →", color: "#4ade80" },
          ].map((card, i) => (
            <div key={i} style={{ position: "absolute", top: card.top, bottom: card.bottom, right: card.right, left: card.left, background: darkMode ? "rgba(14,17,23,0.9)" : "rgba(255,255,255,0.95)", border: `1px solid ${card.color}40`, borderRadius: 12, padding: "10px 16px", backdropFilter: "blur(12px)", zIndex: 30, minWidth: 155, boxShadow: darkMode ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: card.color, boxShadow: `0 0 8px ${card.color}` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{card.label}</span>
              </div>
              <span style={{ fontSize: 11, color: T.muted, fontFamily: "'DM Mono', monospace" }}>{card.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <div className="lp-stats">
        <div className="lp-stats-grid">
          {[
            { value: "10k+", label: "insights generated" },
            { value: "8+",   label: "chart types rendered" },
            { value: "4 DBs", label: "database connectors" },
            { value: "100%", label: "AI-automated" },
          ].map((s, i) => <StatBadge key={i} {...s} delay={i * 150} statBg={T.statBg} statBorder={T.cardBorder} statMuted={T.muted} />)}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="lp-features">
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontSize: "clamp(26px,5vw,46px)", fontWeight: 900, color: T.text, letterSpacing: "-1.5px", marginBottom: 16 }}>
            One pipeline.{" "}
            <span style={{ background: "linear-gradient(135deg,#4ade80,#60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Every insight.</span>
          </h2>
          <p style={{ color: T.muted, fontSize: "clamp(14px,2vw,17px)", maxWidth: 500, margin: "0 auto" }}>
            From raw CSV to executive report — the DynamicBI Agentic AI Framework handles the entire analytics stack autonomously.
          </p>
        </div>
        <div className="lp-features-grid">
          {[
            { icon: "🧹", title: "Smart Data Cleaning",  desc: "Automatic type inference, null handling, and outlier detection before any analysis begins.", accent: "#4ade80" },
            { icon: "📊", title: "Auto KPI Dashboard",   desc: "Revenue, growth, anomalies, and benchmarks computed and ranked by impact automatically.", accent: "#60a5fa" },
            { icon: "📈", title: "8+ Chart Types",       desc: "Bar, line, scatter, heatmap, histogram, box — rendered with perfect defaults and color theory.", accent: "#f59e0b" },
            { icon: "🔮", title: "Time-Series Forecast", desc: "Prophet-powered predictions with confidence intervals for any date-indexed column.", accent: "#a78bfa" },
            { icon: "🚨", title: "Anomaly Detection",    desc: "Statistical and ML-based methods flag data irregularities the moment they appear.", accent: "#fb7185" },
            { icon: "💬", title: "Natural Language Q&A", desc: "Ask anything about your data in plain English. Get precise, cited answers instantly.", accent: "#2dd4bf" },
          ].map((f, i) => (
            <div key={i} className="feature-card" style={{ background: T.featureBg, border: `1px solid ${T.featureBorder}`, borderRadius: 20, padding: "28px 24px", backdropFilter: "blur(12px)" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${f.accent}15`, border: `1px solid ${f.accent}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 18 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div style={{ position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(74,222,128,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <h2 style={{ fontSize: "clamp(24px,5vw,48px)", fontWeight: 900, color: T.text, letterSpacing: "-1.5px", marginBottom: 16 }}>
          Your data is talking.<br />
          <span style={{ background: "linear-gradient(135deg,#4ade80,#60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Are you listening?</span>
        </h2>
        <p style={{ color: T.muted, fontSize: "clamp(14px,2vw,17px)", marginBottom: 40 }}>
          Upload a CSV or connect your database and get your first insight in under 60 seconds.
        </p>
        <button className="cta-btn" onClick={onEnter} style={{ padding: "18px 48px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#4ade80,#22c55e)", color: "#0a0d14", fontWeight: 800, fontSize: 17, cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          Start for Free →
        </button>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#4ade80,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#0a0d14" }}>D</div>
          <span style={{ fontWeight: 700, fontSize: 13, color: T.text, lineHeight: 1.3 }}>DynamicBI<br /><span style={{ fontSize: 9, fontWeight: 400, color: T.muted, fontFamily: "'DM Mono', monospace" }}>Agentic AI Framework</span></span>
        </div>
        <p style={{ color: T.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", textAlign: "center" }}>DynamicBI · © 2025</p>
        <a href="https://github.com/AkshithSai-24/DynamicBI" target="_blank" rel="noreferrer" className="nav-link" style={{ fontSize: 13, color: T.muted }}>GitHub</a>
      </footer>

      {/* Team footer */}
      <div style={{ position: "relative", zIndex: 10, background: T.teamFooterBg, borderTop: `1px solid ${T.teamFooterBorder}`, padding: "14px 16px", backdropFilter: "blur(20px)", textAlign: "center" }}>
        <span style={{ fontSize: 11, color: T.muted, fontFamily: "'DM Mono', monospace" }}>Developed by Akshith Sai Kondamadugu</span>
      </div>

      {/* ── DEMO MODAL ── */}
      {showDemo && (
        <div onClick={(e) => { if (e.target === e.currentTarget) { setShowDemo(false); videoRef.current?.pause(); } }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <style>{`
            @keyframes demoFadeIn  { from { opacity: 0; } to { opacity: 1; } }
            @keyframes demoSlideUp { from { opacity: 0; transform: scale(0.94) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
          `}</style>
          <div style={{ position: "relative", width: "100%", maxWidth: 960, background: "#08091a", borderRadius: 20, border: "1px solid rgba(74,222,128,0.25)", boxShadow: "0 40px 120px rgba(0,0,0,0.7)", overflow: "hidden", animation: "demoSlideUp 0.3s cubic-bezier(.2,.8,.4,1) both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(74,222,128,0.12)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#4ade80,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#0a0d14" }}>D</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#e8ecf4", lineHeight: 1.3 }}>DynamicBI: Agentic AI Framework</p>
                  <p style={{ fontSize: 10, color: "#4ade80", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>Conversational Business Intelligence · LangGraph</p>
                </div>
              </div>
              <button onClick={() => { setShowDemo(false); videoRef.current?.pause(); }} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(74,222,128,0.2)", background: "rgba(255,255,255,0.05)", color: "#6b7a9a", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s" }}>✕</button>
            </div>
            <video ref={videoRef} src="/demo.mp4" controls autoPlay style={{ width: "100%", display: "block", maxHeight: "70vh", background: "#000" }}>Your browser does not support the video tag.</video>
            <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(74,222,128,0.1)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#50607e", fontFamily: "'DM Mono', monospace" }}>Press Esc or click outside to close</span>
              <button onClick={onEnter} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#4ade80,#22c55e)", color: "#0a0d14", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Try it now →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}