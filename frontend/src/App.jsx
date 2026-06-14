import { useState, useEffect, useRef } from "react";
import LandingPage from "./LandingPage.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Footer from "./components/Footer.jsx";

const API = import.meta.env.VITE_API_URL || "";

const STAGE_ICONS = {
  "Loading data":        "📂",
  "Cleaning":            "🧹",
  "Computing KPIs":      "📊",
  "Running anomaly":     "🔍",
  "Forecasting":         "📈",
  "Visualising":         "🎨",
  "Explaining":          "🧠",
  "Profiling":           "📋",
  "Generating AI":       "✨",
  "Building PowerBI":    "⚡",
  "Packaging":           "📦",
  "Initialising":        "🚀",
};

function getStageIcon(stage) {
  for (const [key, icon] of Object.entries(STAGE_ICONS)) {
    if (stage?.includes(key)) return icon;
  }
  return "⚙️";
}

function LoadingScreen({ stage, progress, sourceName }) {
  const [dots, setDots] = useState("");
  const [logs, setLogs] = useState([]);
  const logsRef = useRef();

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (stage) {
      setLogs(prev => {
        const last = prev[prev.length - 1];
        if (last?.text === stage) return prev;
        return [...prev.slice(-12), { text: stage, icon: getStageIcon(stage), ts: Date.now() }];
      });
    }
  }, [stage]);

  useEffect(() => {
    logsRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  }, [logs]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      {/* Animated logo */}
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 28 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid var(--accent)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "2px solid var(--accent2)", borderBottomColor: "transparent", animation: "spin 1.5s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>⚡</div>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Building Your Dashboard</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 32, maxWidth: 360, textAlign: "center" }}>
        AI is analysing <strong style={{ color: "var(--text2)" }}>{sourceName}</strong> and generating a personalised PowerBI layout
      </p>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 480, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>
            {getStageIcon(stage)} {stage}{dots}
          </span>
          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ height: 8, background: "var(--bg3)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--accent2), var(--accent))",
            borderRadius: 99,
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "0 0 12px rgba(0,212,255,0.4)",
          }} />
        </div>
      </div>

      {/* Pipeline steps */}
      <div style={{ width: "100%", maxWidth: 480, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Pipeline Log</div>
        <div ref={logsRef} style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
          {logs.map((log, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", animation: "fadeIn 0.3s ease" }}>
              <span style={{ fontSize: 13 }}>{log.icon}</span>
              <span style={{ fontSize: 12, color: i === logs.length - 1 ? "var(--accent)" : "var(--text2)" }}>{log.text}</span>
              {i === logs.length - 1 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1s infinite", marginLeft: 2 }} />}
            </div>
          ))}
        </div>
      </div>

      <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 11 }}>This typically takes 30–90 seconds depending on dataset size</p>
      <Footer />
    </div>
  );
}

function ErrorScreen({ error, onReset }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--red)", marginBottom: 10 }}>Pipeline Failed</h2>
      <div style={{ background: "rgba(255,94,122,0.08)", border: "1px solid var(--red)", borderRadius: 12, padding: "16px 20px", maxWidth: 520, width: "100%", marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, fontFamily: "var(--mono)", whiteSpace: "pre-wrap" }}>{error}</p>
      </div>
      <button onClick={onReset} style={{ background: "var(--accent2)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 28px", cursor: "pointer" }}>
        ← Try Again
      </button>
      <Footer />
    </div>
  );
}

export default function App() {
  const [view, setView]         = useState("landing"); // landing | loading | dashboard | error
  const [jobId, setJobId]       = useState(null);
  const [sourceName, setSourceName] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage]       = useState("");
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState("");
  const [isImported, setIsImported] = useState(false);
  const pollRef = useRef(null);

  const startJob = (id, name) => {
    setJobId(id);
    setSourceName(name);
    setProgress(0);
    setStage("Initialising pipeline…");
    setError("");
    setResult(null);
    setIsImported(false);
    setView("loading");
  };

  // Load a dashboard imported from an exported JSON file (no backend job)
  const importDashboard = (payload, name) => {
    const schema = payload?.dashboard_schema || payload;
    setJobId(null);
    setSourceName(name || payload?.meta?.title || "Imported Dashboard");
    setProgress(100);
    setStage("");
    setError("");
    setResult({
      dashboard_schema: schema,
      insights: payload?.insights_report || "",
      anomaly_report: payload?.anomaly_report || "",
      kpis: payload?.kpis || [],
      profile: payload?.dataset_profile || "",
      cleaning_report: payload?.cleaning_report || "",
    });
    setIsImported(true);
    setView("dashboard");
  };

  // Poll job status
  useEffect(() => {
    if (view !== "loading" || !jobId) return;

    const poll = async () => {
      try {
        const r  = await fetch(`${API}/api/status/${jobId}`);
        const d  = await r.json();
        setProgress(d.progress ?? 0);
        setStage(d.stage ?? "");

        if (d.status === "done") {
          clearInterval(pollRef.current);
          // Fetch full result
          const r2  = await fetch(`${API}/api/result/${jobId}`);
          const res = await r2.json();
          setResult(res);
          setView("dashboard");
        } else if (d.status === "error") {
          clearInterval(pollRef.current);
          setError(d.error || "Unknown error");
          setView("error");
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };

    pollRef.current = setInterval(poll, 1500);
    poll(); // immediate first call
    return () => clearInterval(pollRef.current);
  }, [view, jobId]);

  const reset = () => {
    clearInterval(pollRef.current);
    setView("landing");
    setJobId(null);
    setResult(null);
    setError("");
    setProgress(0);
    setStage("");
    setIsImported(false);
  };

  if (view === "landing")   return <LandingPage onJobStart={startJob} onImport={importDashboard} />;
  if (view === "loading")   return <LoadingScreen stage={stage} progress={progress} sourceName={sourceName} />;
  if (view === "error")     return <ErrorScreen error={error} onReset={reset} />;
  if (view === "dashboard") return <Dashboard result={result} jobId={jobId} sourceName={sourceName} onReset={reset} isImported={isImported} />;

  return null;
}
