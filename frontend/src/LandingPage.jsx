import { useState, useEffect, useRef } from "react";

const ORBIT_NODES = [
  { label: "KPIs", icon: "📊", angle: 0,   r: 38, size: 48, color: "#4ade80" },
  { label: "Charts", icon: "📈", angle: 72,  r: 38, size: 44, color: "#60a5fa" },
  { label: "SQL", icon: "🗄️",  angle: 144, r: 38, size: 44, color: "#f59e0b" },
  { label: "AI", icon: "🤖",   angle: 216, r: 38, size: 52, color: "#a78bfa" },
  { label: "CSV", icon: "📁",  angle: 288, r: 38, size: 44, color: "#fb7185" },
  { label: "Trends", icon: "🔮", angle: 36, r: 62, size: 38, color: "#34d399" },
  { label: "Alerts", icon: "🔔", angle: 108, r: 62, size: 38, color: "#818cf8" },
  { label: "Reports", icon: "📋", angle: 180, r: 62, size: 38, color: "#fbbf24" },
  { label: "Forecast", icon: "🚀", angle: 252, r: 62, size: 38, color: "#f472b6" },
  { label: "Stream", icon: "⚡", angle: 324, r: 62, size: 38, color: "#2dd4bf" },
];

function OrbitNode({ node, rotation }) {
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
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        width: node.size,
        height: node.size,
        borderRadius: node.size / 2,
        background: hovered
          ? `${node.color}30`
          : "rgba(14,17,23,0.85)",
        border: `2px solid ${hovered ? node.color : node.color + "60"}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
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
          position: "absolute",
          bottom: -24,
          fontSize: 10,
          color: node.color,
          fontWeight: 700,
          whiteSpace: "nowrap",
          fontFamily: "'DM Mono', monospace",
        }}>{node.label}</span>
      )}
    </div>
  );
}

function StatBadge({ value, label, delay }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setTimeout(() => setVisible(true), delay);
  }, [delay]);
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.6s ease",
      background: "rgba(22,27,39,0.9)",
      border: "1px solid rgba(74,222,128,0.2)",
      borderRadius: 16,
      padding: "20px 28px",
      textAlign: "center",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ fontSize: 36, fontWeight: 900, background: "linear-gradient(135deg, #4ade80, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7a9a", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{label}</div>
    </div>
  );
}

export default function LandingPage({ onEnter }) {
  const [rotation, setRotation] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const animRef = useRef();

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

  return (
    <div style={{ minHeight: "100vh", background: "#0a0d14", overflow: "hidden", fontFamily: "'Bricolage Grotesque', sans-serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600;700;800;900&display=swap');

        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.5; }
          50% { transform: translate(-50%, -50%) scale(1.02); opacity: 0.3; }
          100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.5; }
        }
        @keyframes float-up {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(74,222,128,0.3), 0 0 60px rgba(74,222,128,0.1); }
          50% { box-shadow: 0 0 40px rgba(74,222,128,0.5), 0 0 100px rgba(74,222,128,0.2); }
        }
        .hero-title span {
          background: linear-gradient(135deg, #ffffff 0%, #4ade80 50%, #60a5fa 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }
        .cta-btn {
          animation: glow-pulse 2s ease-in-out infinite;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .cta-btn:hover {
          transform: scale(1.05) !important;
        }
        .nav-link {
          color: #6b7a9a;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
          cursor: pointer;
        }
        .nav-link:hover { color: #e8ecf4; }
        .feature-card {
          transition: border-color 0.3s, background 0.3s, transform 0.3s;
        }
        .feature-card:hover {
          border-color: rgba(74,222,128,0.4) !important;
          background: rgba(74,222,128,0.04) !important;
          transform: translateY(-4px);
        }
      `}</style>

      {/* Animated background gradient */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: `
          radial-gradient(ellipse at ${30 + mousePos.x * 20}% ${20 + mousePos.y * 20}%, rgba(74,222,128,0.08) 0%, transparent 60%),
          radial-gradient(ellipse at ${70 - mousePos.x * 20}% ${80 - mousePos.y * 20}%, rgba(96,165,250,0.08) 0%, transparent 60%),
          radial-gradient(ellipse at 50% 50%, rgba(167,139,250,0.05) 0%, transparent 70%),
          #0a0d14
        `,
        transition: "background 0.3s ease",
      }} />

      {/* Noise texture overlay */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, opacity: 0.03,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        pointerEvents: "none",
      }} />

      {/* Navbar */}
      <nav style={{
        position: "relative", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 60px",
        borderBottom: "1px solid rgba(35,44,62,0.6)",
        backdropFilter: "blur(20px)",
        background: "rgba(10,13,20,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(135deg, #4ade80, #60a5fa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#0a0d14",
          }}>D</div>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#e8ecf4", letterSpacing: "-0.5px" }}>DynamicBI</span>
        </div>

        <div style={{ display: "flex", gap: 36 }}>
          {["Features", "Docs"].map(link => (
            <a key={link} className="nav-link">{link}</a>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={onEnter}
            style={{
              padding: "9px 22px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #4ade80, #22c55e)",
              color: "#0a0d14",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "'Bricolage Grotesque', sans-serif",
            }}
          >Launch App →</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center",
        minHeight: "90vh",
        padding: "60px",
        gap: 60,
        maxWidth: 1400, margin: "0 auto",
      }}>
        {/* Left: Copy */}
        <div style={{ flex: "0 0 52%", animation: "float-up 0.8s ease both" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: 100, padding: "6px 16px",
            marginBottom: 32,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>
              Powered by LangGraph · DynamicBI
            </span>
          </div>

          <h1 className="hero-title" style={{
            fontSize: "clamp(42px, 5.5vw, 76px)",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-2px",
            marginBottom: 28,
            color: "#fff",
          }}>
            Unlock Deep{" "}
            <span>Business Intelligence</span>
            {" "}You Thought Was Out of Reach
          </h1>

          <p style={{
            fontSize: 18, color: "#6b7a9a", lineHeight: 1.7,
            marginBottom: 44, maxWidth: 500,
          }}>
            Connect any data source and get automated KPIs, visualisations, anomaly detection, forecasting, and natural-language insights — all powered by DynamicBI's intelligent pipeline.
          </p>

          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="cta-btn"
              onClick={onEnter}
              style={{
                padding: "16px 36px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #4ade80, #22c55e)",
                color: "#0a0d14",
                fontWeight: 800,
                fontSize: 16,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: "'Bricolage Grotesque', sans-serif",
              }}
            >
              Start Analysing →
            </button>
            <button style={{
              padding: "16px 28px",
              borderRadius: 14,
              border: "1px solid rgba(74,222,128,0.25)",
              background: "transparent",
              color: "#e8ecf4",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              fontFamily: "'Bricolage Grotesque', sans-serif",
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(74,222,128,0.6)"; e.currentTarget.style.color = "#4ade80"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(74,222,128,0.25)"; e.currentTarget.style.color = "#e8ecf4"; }}
            >
              ▶ Watch Demo
            </button>
          </div>

          {/* Trust row */}
          <div style={{ display: "flex", gap: 28, marginTop: 52, alignItems: "center" }}>
            {["No-code setup", "Any data source", "LLM-powered"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "#4ade80", fontSize: 14 }}>✓</span>
                <span style={{ color: "#6b7a9a", fontSize: 13 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Orbital visualization */}
        <div style={{
          flex: 1, position: "relative",
          height: 520,
          animation: "float-up 1s ease 0.2s both",
        }}>
          {/* Orbit rings */}
          {[38, 62, 82].map((r, i) => (
            <div key={i} style={{
              position: "absolute",
              left: "50%", top: "50%",
              width: `${r * 1.9}%`, height: `${r * 1.9}%`,
              borderRadius: "50%",
              border: `1px solid rgba(74,222,128,${0.08 - i * 0.02})`,
              transform: "translate(-50%, -50%)",
              animation: `pulse-ring ${3 + i}s ease-in-out infinite`,
            }} />
          ))}

          {/* Center */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(96,165,250,0.15))",
            border: "2px solid rgba(74,222,128,0.4)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 40px rgba(74,222,128,0.2)",
            zIndex: 20,
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#4ade80" }}>10k+</span>
            <span style={{ fontSize: 10, color: "#6b7a9a", fontFamily: "'DM Mono', monospace" }}>Insights</span>
          </div>

          {/* Orbit nodes */}
          {ORBIT_NODES.map((node, i) => (
            <OrbitNode key={i} node={node} rotation={rotation} />
          ))}

          {/* Floating cards */}
          {[
            { top: "8%", right: "2%", label: "Anomaly detected", sub: "Revenue spike +42%", color: "#f59e0b" },
            { bottom: "12%", left: "0%", label: "Forecast ready", sub: "Next 30 days →", color: "#4ade80" },
          ].map((card, i) => (
            <div key={i} style={{
              position: "absolute",
              top: card.top, bottom: card.bottom,
              right: card.right, left: card.left,
              background: "rgba(14,17,23,0.9)",
              border: `1px solid ${card.color}40`,
              borderRadius: 12, padding: "10px 16px",
              backdropFilter: "blur(12px)",
              zIndex: 30,
              minWidth: 170,
              boxShadow: `0 4px 20px rgba(0,0,0,0.4)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: card.color, boxShadow: `0 0 8px ${card.color}` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#e8ecf4" }}>{card.label}</span>
              </div>
              <span style={{ fontSize: 11, color: "#6b7a9a", fontFamily: "'DM Mono', monospace" }}>{card.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats row */}
      <section style={{ position: "relative", zIndex: 10, padding: "0 60px 80px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {[
            { value: "10k+", label: "insights generated" },
            { value: "8+", label: "chart types rendered" },
            { value: "4 DBs", label: "database connectors" },
            { value: "100%", label: "AI-automated" },
          ].map((s, i) => <StatBadge key={i} {...s} delay={i * 150} />)}
        </div>
      </section>

      {/* Features */}
      <section style={{ position: "relative", zIndex: 10, padding: "60px 60px 120px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontSize: 46, fontWeight: 900, color: "#e8ecf4", letterSpacing: "-1.5px", marginBottom: 16 }}>
            One pipeline.{" "}
            <span style={{ background: "linear-gradient(135deg, #4ade80, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Every insight.
            </span>
          </h2>
          <p style={{ color: "#6b7a9a", fontSize: 17, maxWidth: 500, margin: "0 auto" }}>
            From raw CSV to executive report — DynamicBI handles the entire analytics stack autonomously.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            { icon: "🧹", title: "Smart Data Cleaning", desc: "Automatic type inference, null handling, and outlier detection before any analysis begins.", accent: "#4ade80" },
            { icon: "📊", title: "Auto KPI Dashboard", desc: "Revenue, growth, anomalies, and benchmarks computed and ranked by impact automatically.", accent: "#60a5fa" },
            { icon: "📈", title: "8+ Chart Types", desc: "Bar, line, scatter, heatmap, histogram, box — rendered with perfect defaults and color theory.", accent: "#f59e0b" },
            { icon: "🔮", title: "Time-Series Forecast", desc: "Prophet-powered predictions with confidence intervals for any date-indexed column.", accent: "#a78bfa" },
            { icon: "🚨", title: "Anomaly Detection", desc: "Statistical and ML-based methods flag data irregularities the moment they appear.", accent: "#fb7185" },
            { icon: "💬", title: "Natural Language Q&A", desc: "Ask anything about your data in plain English. Get precise, cited answers instantly.", accent: "#2dd4bf" },
          ].map((f, i) => (
            <div key={i} className="feature-card" style={{
              background: "rgba(22,27,39,0.6)",
              border: "1px solid rgba(35,44,62,0.8)",
              borderRadius: 20, padding: "32px 28px",
              backdropFilter: "blur(12px)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${f.accent}15`,
                border: `1px solid ${f.accent}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, marginBottom: 20,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e8ecf4", marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#6b7a9a", lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        position: "relative", zIndex: 10,
        margin: "0 60px 100px",
        borderRadius: 28,
        background: "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(96,165,250,0.08))",
        border: "1px solid rgba(74,222,128,0.15)",
        padding: "72px 60px",
        textAlign: "center",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-50%", left: "50%",
          transform: "translateX(-50%)",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(74,222,128,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <h2 style={{ fontSize: 48, fontWeight: 900, color: "#e8ecf4", letterSpacing: "-1.5px", marginBottom: 16 }}>
          Your data is talking.
          <br />
          <span style={{ background: "linear-gradient(135deg, #4ade80, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Are you listening?
          </span>
        </h2>
        <p style={{ color: "#6b7a9a", fontSize: 17, marginBottom: 40 }}>
          Upload a CSV or connect your database and get your first insight in under 60 seconds.
        </p>
        <button
          className="cta-btn"
          onClick={onEnter}
          style={{
            padding: "18px 48px",
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg, #4ade80, #22c55e)",
            color: "#0a0d14",
            fontWeight: 800,
            fontSize: 17,
            cursor: "pointer",
            fontFamily: "'Bricolage Grotesque', sans-serif",
          }}
        >
          Start for Free →
        </button>
        <p style={{ color: "#6b7a9a", fontSize: 12, marginTop: 16, fontFamily: "'DM Mono', monospace" }}>
          No credit card · No setup · Runs locally
        </p>
      </section>

      {/* Footer */}
      <footer style={{
        position: "relative", zIndex: 10,
        borderTop: "1px solid rgba(35,44,62,0.6)",
        padding: "28px 60px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #4ade80, #60a5fa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#0a0d14",
          }}>D</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#e8ecf4" }}>DynamicBI</span>
        </div>
        <p style={{ color: "#6b7a9a", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
          DynamicBI · Powered by LangGraph · © 2025
        </p>
        <div style={{ display: "flex", gap: 24 }}>
          {["GitHub", "Docs", "Privacy"].map(l => (
            <a key={l} className="nav-link" style={{ fontSize: 13 }}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
