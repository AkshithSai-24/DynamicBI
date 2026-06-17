
import { useState, useCallback, useRef, useEffect } from "react";
import FilterPanel from "./FilterPanel.jsx";
import KpiRow from "./KpiRow.jsx";
import AiChat from "./AiChat.jsx";
import MarkdownRenderer from "./MarkdownRenderer.jsx";
import DrillDownModal from "./DrillDownModal.jsx";
import GithubBadge from "./GithubBadge.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import {
  BarWidget, LineWidget, AreaWidget, PieWidget,
  ScatterWidget, HistogramWidget, HeatmapWidget, TableWidget, PALETTE,
  ForecastWidget, AnomalyScatterWidget,
} from "./ChartWidgets.jsx";

const API = import.meta.env.VITE_API_URL || "";

/* Fixed pixel heights for every widget type — chart area only */
const CHART_H = {
  kpi_row:   null,   // auto
  bar:       240,
  line:      240,
  area:      240,
  pie:       220,
  scatter:   240,
  histogram: 220,
  heatmap:   240,
  table:     220,
};

const fmt = (v) => {
  if (v == null) return "—";
  if (typeof v !== "number") return String(v);
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(2)+"B";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
};

/* ── Chart stats computed from widget data ─────────────────────────────── */
function computeStats(widget) {
  const d = widget.data;
  if (!d) return null;

  const type = widget.type;

  if (type === "kpi_row") return null;

  if (Array.isArray(d) && d.length && d[0]?.value !== undefined) {
    const vals = d.map(r => r.value).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    const sum  = vals.reduce((a,b) => a+b, 0);
    const avg  = sum / vals.length;
    const max  = Math.max(...vals);
    const min  = Math.min(...vals);
    const sorted = [...vals].sort((a,b)=>a-b);
    const med  = sorted[Math.floor(sorted.length/2)];
    const topN = [...d].sort((a,b)=>(b.value||0)-(a.value||0)).slice(0,5);
    const botN = [...d].sort((a,b)=>(a.value||0)-(b.value||0)).slice(0,3);
    return { count:vals.length, sum, avg, max, min, median:med, topN, botN };
  }

  if (type === "scatter" && Array.isArray(d)) {
    const xs = d.map(r=>r.x).filter(v=>v!=null&&!isNaN(v));
    const ys = d.map(r=>r.y).filter(v=>v!=null&&!isNaN(v));
    if (!xs.length) return null;
    return {
      count: d.length,
      xRange: [Math.min(...xs), Math.max(...xs)],
      yRange: [Math.min(...ys), Math.max(...ys)],
      xAvg: xs.reduce((a,b)=>a+b,0)/xs.length,
      yAvg: ys.reduce((a,b)=>a+b,0)/ys.length,
    };
  }

  if (type === "heatmap" && d?.columns) {
    return { columns: d.columns.length, pairs: d.matrix?.length || 0 };
  }

  if (type === "table" && d?.rows) {
    return { rows: d.total, cols: d.columns?.length };
  }

  return null;
}

function StatsPanel({ widget }) {
  const s = computeStats(widget);
  const type = widget.type;
  if (!s) return null;

  const tile = (label, value, accent="#00d4ff") => (
    <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8,
      padding:"10px 14px", borderLeft:`3px solid ${accent}` }}>
      <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:17, fontWeight:800, color:accent }}>{fmt(value)}</div>
    </div>
  );

  if (type === "scatter") return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      {tile("Data Points", s.count, "#7c5cfc")}
      {tile(`${widget.x_col||"X"} avg`, s.xAvg, "#00d4ff")}
      {tile(`${widget.y_col||"Y"} avg`, s.yAvg, "#00e5a0")}
      {tile(`${widget.x_col||"X"} range`, `${fmt(s.xRange?.[0])} – ${fmt(s.xRange?.[1])}`, "#f4a535")}
    </div>
  );

  if (type === "heatmap") return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      {tile("Columns", s.columns, "#00d4ff")}
      {tile("Correlation Pairs", s.pairs, "#7c5cfc")}
    </div>
  );

  if (type === "table") return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      {tile("Total Rows", s.rows, "#00d4ff")}
      {tile("Columns", s.cols, "#7c5cfc")}
    </div>
  );

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
        {tile("Count", s.count, "#00d4ff")}
        {tile("Total", s.sum, "#7c5cfc")}
        {tile("Average", s.avg, "#00e5a0")}
        {tile("Max", s.max, "#f4a535")}
        {tile("Min", s.min, "#ff6b6b")}
        {tile("Median", s.median, "#c084fc")}
      </div>
      {s.topN?.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text2)", marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>Top {s.topN.length}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {s.topN.map((row,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"5px 10px", background:"var(--bg)", borderRadius:6, border:"1px solid var(--border)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:8,height:8,borderRadius:2,background:PALETTE[i%PALETTE.length],display:"inline-block",flexShrink:0 }} />
                  <span style={{ fontSize:12, color:"#c8d4e8", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.name}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:PALETTE[i%PALETTE.length] }}>{fmt(row.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Insight bubble ────────────────────────────────────────────────────── */
function Insight({ text }) {
  if (!text) return null;
  return (
    <div style={{ padding:"6px 12px", background:"rgba(0,212,255,0.06)",
      borderTop:"1px solid rgba(0,212,255,0.15)", fontSize:11, color:"var(--text2)",
      lineHeight:1.5, display:"flex", gap:7, flexShrink:0 }}>
      <span style={{ color:"var(--accent)", flexShrink:0 }}>💡</span>
      <span>{text}</span>
    </div>
  );
}

/* ── Single widget card ────────────────────────────────────────────────── */
function WidgetShell({ widget, onDrillDown, filterApplied, allKpis }) {
  const [expanded, setExpanded] = useState(false);
  const data = widget.data;
  const chartH = CHART_H[widget.type];

  const renderChart = (d, opts = {}) => {
    if (!d) return null;
    switch (widget.type) {
      case "kpi_row":   return <KpiRow data={d} columns={opts.showAllKpis ? null : widget.columns} showAll={opts.showAllKpis} />;
      case "bar":       return <BarWidget data={d} onBarClick={e => {
        if (e?.activePayload?.[0] && widget.x_col)
          onDrillDown(widget.x_col, e.activePayload[0].payload.name);
      }} />;
      case "line":      return <LineWidget data={d} />;
      case "area":      return <AreaWidget data={d} />;
      case "pie":       return <PieWidget data={d} onSliceClick={d2 => {
        if (widget.x_col && d2?.name) onDrillDown(widget.x_col, d2.name);
      }} />;
      case "scatter":   return <ScatterWidget data={d} colorKey={widget.color_col} />;
      case "histogram": return <HistogramWidget data={d} />;
      case "heatmap":   return <HeatmapWidget data={d} />;
      case "table":     return <TableWidget data={d} />;
      default:          return <BarWidget data={d} />;
    }
  };

  return (
    <>
      {/* Card */}
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10,
        display:"flex", flexDirection:"column", overflow:"hidden", height:"100%" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"8px 12px", borderBottom:"1px solid var(--border)", background:"var(--bg3)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"var(--text)", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{widget.title}</span>
            {filterApplied && (
              <span style={{ fontSize:9, background:"#7c5cfc", color:"#fff",
                borderRadius:99, padding:"1px 5px", flexShrink:0 }}>filtered</span>
            )}
          </div>
          <button onClick={() => setExpanded(true)} title="Expand"
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:5,
              color:"var(--muted)", padding:"2px 7px", fontSize:11, flexShrink:0, cursor:"pointer" }}>⤢</button>
        </div>

        {/* Chart body — explicit px height so Recharts can measure it */}
        {widget.type === "kpi_row" ? (
          <div style={{ padding:"12px 14px", flexShrink:0 }}>
            {data ? renderChart(data) : <SkeletonH h={80} />}
          </div>
        ) : (
          <div style={{ height: chartH, flexShrink:0, padding:"6px 8px 4px" }}>
            {data ? renderChart(data) : <SkeletonH h={chartH} />}
          </div>
        )}

        {/* Insight strip */}
        {widget.insight && <Insight text={widget.insight} />}
      </div>

      {/* ── Expanded modal ──────────────────────────────────────────────── */}
      {expanded && (
        <div
          className="widget-modal-overlay"
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:1000,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setExpanded(false)}
        >
          <div
            className="widget-modal"
            style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14,
              width:"92%", maxWidth:1100, maxHeight:"88vh",
              display:"flex", flexDirection:"column", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"12px 18px", borderBottom:"1px solid var(--border)", background:"var(--bg3)", flexShrink:0 }}>
              <h3 style={{ fontWeight:800, fontSize:15, color:"var(--text)" }}>{widget.title}</h3>
              <div style={{ display:"flex", gap:8 }}>

                <button onClick={() => setExpanded(false)}
                  style={{ background:"none", border:"1px solid var(--border)", borderRadius:7,
                    color:"var(--text2)", padding:"5px 12px", fontSize:12, cursor:"pointer" }}>✕ Close</button>
              </div>
            </div>

            {/* Modal body: chart + optional stats sidebar */}
            <div className="widget-modal-body" style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
              {/* Chart pane */}
              <div style={{ flex:1, padding:"14px 16px", minWidth:0, overflowY:"auto" }}>
                {widget.type === "kpi_row" ? (
                  <div style={{ paddingTop:4 }}>
                    {allKpis?.length > 0
                      ? (
                        <>
                          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12, fontWeight:600 }}>
                            Showing all {allKpis.length} KPI{allKpis.length !== 1 ? "s" : ""} computed for this dataset
                          </div>
                          <KpiRow data={allKpis} showAll />
                        </>
                      )
                      : data
                        ? <KpiRow data={data} showAll />
                        : <p style={{ color:"var(--muted)", fontSize:13 }}>No KPI data available.</p>
                    }
                  </div>
                ) : (
                  <div style={{ width:"100%", height:"100%" }}>
                    {data && renderChart(data)}
                  </div>
                )}
              </div>

              {/* Stats sidebar — always visible when stats exist */}
              {computeStats(widget) && (
                <div className="widget-modal-stats" style={{ width:300, flexShrink:0, borderLeft:"1px solid var(--border)",
                  overflowY:"auto", padding:"14px 16px", background:"var(--bg3)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--muted)",
                    textTransform:"uppercase", letterSpacing:0.5, marginBottom:12 }}>
                    Chart Statistics
                  </div>
                  <StatsPanel widget={widget} />
                </div>
              )}
            </div>

            {widget.insight && <Insight text={widget.insight} />}
          </div>
        </div>
      )}
    </>
  );
}

function SkeletonH({ h }) {
  return (
    <div style={{ height:h, borderRadius:6,
      background:"linear-gradient(90deg,#1a2030 25%,#222b3a 50%,#1a2030 75%)",
      backgroundSize:"200% 100%", animation:"shimmer 1.5s infinite" }} />
  );
}


/* ── ForecastCard — collapsible table (5 rows default, expand to all) ──── */
const PREVIEW_ROWS = 5;
function ForecastCard({ fc }) {
  const [expanded, setExpanded] = useState(false);
  const totalRows  = fc.rows?.length ?? 0;
  const visibleRows = expanded ? fc.rows : fc.rows?.slice(0, PREVIEW_ROWS);
  const hasMore    = totalRows > PREVIEW_ROWS;

  return (
    <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
      {/* ─ header ─ */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <h4 style={{ fontSize:13, fontWeight:700, color:"var(--accent)" }}>
          {fc.col?.replace(/_/g," ")} — {fc.periods} {fc.freq_label} forecast
        </h4>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {fc.method && (
            <span style={{ fontSize:10, color:"var(--muted)", background:"var(--bg)",
              border:"1px solid var(--border)", borderRadius:99, padding:"2px 10px" }}>
              Model: {fc.method}
            </span>
          )}
          <span style={{ fontSize:10, color:"#4d9fff", background:"var(--bg)",
            border:"1px solid var(--border)", borderRadius:99, padding:"2px 10px" }}>
            {totalRows} pts
          </span>
        </div>
      </div>

      {/* ─ chart ─ */}
      <div style={{ height:300, marginBottom:14 }}>
        <ForecastWidget data={fc.chart_data} />
      </div>

      {/* ─ table ─ */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ fontSize:11, borderCollapse:"collapse", width:"100%" }}>
          <thead>
            <tr>
              {["Period","Forecast","Lower","Upper"].map(h => (
                <th key={h} style={{ padding:"4px 10px", color:"var(--muted)",
                  borderBottom:"1px solid var(--border)", textAlign:"left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows?.map((row, i) => (
              <tr key={i} style={{ borderBottom:"1px solid #1a2235",
                background: i % 2 === 0 ? "transparent" : "#0d1120" }}>
                <td style={{ padding:"4px 10px", color:"var(--text2)" }}>{row.ds}</td>
                <td style={{ padding:"4px 10px", color:"var(--accent3)", fontWeight:600 }}>{row.yhat?.toFixed?.(2)}</td>
                <td style={{ padding:"4px 10px", color:"var(--muted)" }}>{row.yhat_lower?.toFixed?.(2)}</td>
                <td style={{ padding:"4px 10px", color:"var(--muted)" }}>{row.yhat_upper?.toFixed?.(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─ expand / collapse toggle ─ */}
      {hasMore && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          style={{
            marginTop:10, width:"100%", padding:"6px 0",
            background:"var(--bg)", border:"1px solid var(--border)",
            borderRadius:6, color:"#4d9fff", fontSize:11,
            cursor:"pointer", letterSpacing:"0.3px",
            transition:"background 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background="#131b2e"}
          onMouseLeave={e => e.currentTarget.style.background="var(--bg)"}
        >
          {expanded
            ? `▲  Show less  (displaying all ${totalRows})`
            : `▼  Show all ${totalRows} forecast points  (${totalRows - PREVIEW_ROWS} more)`}
        </button>
      )}
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard({ result, jobId, sourceName, onReset, isImported, sessionId }) {
  const schema = result?.dashboard_schema || {};
  const pages  = schema.pages || [];

  const [activePage, setActivePage]     = useState(0);
  const [activeTab, setActiveTab]       = useState("dashboard");
  const [filters, setFilters]           = useState({});
  const [filteredData, setFilteredData] = useState({});
  const [rowCount, setRowCount]         = useState(null);
  const [filtering, setFiltering]       = useState(false);
  const [drillDown, setDrillDown]       = useState(null);
  const debounceRef = useRef(null);

  const sessionHeaders = sessionId ? { "X-Session-Id": sessionId } : {};

  /* Apply filters with debounce */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!jobId) { setFilteredData({}); setRowCount(null); return; }
    const hasFilters = Object.keys(filters).some(k => {
      const v = filters[k];
      return Array.isArray(v) ? v.length > 0 : v?.from || v?.to;
    });
    if (!hasFilters) { setFilteredData({}); setRowCount(null); return; }

    debounceRef.current = setTimeout(async () => {
      setFiltering(true);
      try {
        const r = await fetch(`${API}/api/filter/${jobId}`, {
          method:"POST",
          headers:{ "Content-Type":"application/json", ...sessionHeaders },
          body: JSON.stringify({ filters, page_id: pages[activePage]?.id }),
        });
        const d = await r.json();
        setFilteredData(d.updated_widgets || {});
        setRowCount(d.row_count ?? null);
      } catch(e) { console.error(e); }
      setFiltering(false);
    }, 400);
  }, [filters, activePage]);

  const getWidgetData = useCallback(w =>
    filteredData[w.id] !== undefined ? filteredData[w.id] : w.data,
  [filteredData]);

  const isFilterActive = Object.keys(filters).some(k => {
    const v = filters[k];
    return Array.isArray(v) ? v.length > 0 : v?.from || v?.to;
  });

  const currentPage = pages[activePage];

  /* ── Tabs ─────────────────────────────────────────────────────────── */
  const ALL_TABS = [
    { id:"dashboard",   label:"📊 Dashboard"   },
    { id:"insights",    label:"💡 Insights"    },
    { id:"forecasting", label:"📈 Forecasting" },
    { id:"anomalies",   label:"🔍 Anomalies"   },
    { id:"chat",        label:"🤖 AI Chat"     },
  ];

  // For imported dashboards: show a tab only when the exported JSON contained
  // that data.  Chat always requires a live backend job so it is always hidden.
  const hasForecasts  = (result?.forecasts?.length  ?? 0) > 0;
  const hasAnomalies  = !!(result?.anomaly_data || result?.anomaly_report ||
                           result?.anomaly_scatter_panels?.length);

  const TABS = isImported
    ? ALL_TABS.filter(t => {
        if (t.id === "chat")        return false;
        if (t.id === "forecasting") return hasForecasts;
        if (t.id === "anomalies")   return hasAnomalies;
        return true;                              // dashboard + insights always shown
      })
    : ALL_TABS;

  return (
    <div className="app-shell">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-left">
          <span style={{ fontSize:18 }}>⚡</span>
          <span style={{ fontWeight:800, fontSize:14, color:"var(--text)" }}>{schema.title || "Dashboard"}</span>
          <span style={{ fontSize:11, color:"var(--muted)" }}>{sourceName}</span>
          <a href="https://akshithsai.co.in" target="_blank" rel="noopener noreferrer"
            className="header-credit"
            style={{ fontSize:13, color:"#9aa8c7", fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4 }}
            onMouseOver={e => e.currentTarget.style.color="#00e5a0"}
            onMouseOut={e  => e.currentTarget.style.color="#9aa8c7"}
            title="Akshith Sai Kondamadugu — Portfolio"
          >
            <svg height="12" width="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            · Developed By Akshith Sai Kondamadugu
          </a>
          {schema.domain && (
            <span style={{ background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:99, padding:"2px 9px", fontSize:10, color:"var(--accent2)", fontWeight:700, textTransform:"uppercase" }}>
              {schema.domain}
            </span>
          )}
          {isImported && (
            <span style={{ background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:99, padding:"2px 9px", fontSize:10, color:"var(--accent3)", fontWeight:700, textTransform:"uppercase" }}>
              Imported · Read-only
            </span>
          )}
        </div>
        <div className="app-header-right">
          {filtering && <span style={{ fontSize:11, color:"var(--accent)", animation:"pulse 1s infinite" }}>● filtering…</span>}
          {jobId && (
            <button onClick={() => {
              const url = `${API}/api/export/${jobId}`;
              // Use fetch + blob to attach session header
              fetch(url, { headers: sessionHeaders })
                .then(r => r.blob())
                .then(blob => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "dashboard.json";
                  a.click();
                  URL.revokeObjectURL(a.href);
                });
            }}
              style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:7,
                color:"var(--text2)", padding:"5px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>↓ Export</button>
          )}
          <button onClick={onReset}
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:7,
              color:"var(--muted)", padding:"5px 13px", fontSize:12, cursor:"pointer" }}>← New</button>
          <ThemeToggle variant="icon" />
          <GithubBadge />
        </div>
      </header>

      {/* ── Tab nav ─────────────────────────────────────────────────── */}
      <div className="app-tabs">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:"9px 17px", background:"none", border:"none",
              borderBottom: activeTab===t.id ? "2px solid #00d4ff" : "2px solid transparent",
              color: activeTab===t.id ? "#00d4ff" : "var(--muted)",
              fontWeight: activeTab===t.id ? 700 : 500,
              fontSize:12, cursor:"pointer", transition:"all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="app-body">

        {/* ════ DASHBOARD TAB ════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* Filter sidebar */}
            <div className="app-sidebar">
              <FilterPanel
                schema={schema}
                activeFilters={filters}
                onFilterChange={setFilters}
                rowCount={isFilterActive ? rowCount : schema.row_count}
              />
            </div>

            {/* Canvas */}
            <div className="app-canvas">

              {/* Page tabs */}
              {pages.length > 1 && (
                <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                  {pages.map((p,i) => (
                    <button key={p.id} onClick={() => setActivePage(i)}
                      style={{ padding:"5px 14px", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer",
                        background: activePage===i ? "#7c5cfc" : "var(--bg3)",
                        border:`1px solid ${activePage===i ? "#7c5cfc" : "#2a3550"}`,
                        color:"var(--text)" }}>
                      {p.title}
                    </button>
                  ))}
                </div>
              )}

              {/* AI Summary */}
              {schema.ai_summary && (
                <div style={{ background:"linear-gradient(135deg,rgba(124,92,252,0.08),rgba(0,212,255,0.08))",
                  border:"1px solid rgba(0,212,255,0.18)", borderRadius:10,
                  padding:"11px 16px", marginBottom:14 }}>
                  <div style={{ display:"flex", gap:8 }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>🧠</span>
                    <p style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6 }}>{schema.ai_summary}</p>
                  </div>
                </div>
              )}

              {/* Widget grid — 12-col, collapses on mobile via .widget-grid */}
              {currentPage && (
                <div className="widget-grid">
                  {currentPage.widgets?.map(widget => (
                    <div key={widget.id} style={{ gridColumn:`span ${Math.min(widget.w || 6, 12)}` }}>
                      <WidgetShell
                        widget={{ ...widget, data: getWidgetData(widget) }}
                        jobId={jobId}
                        onDrillDown={(dim,val) => { if (jobId) setDrillDown({ dimension:dim, value:val }); }}
                        filterApplied={filteredData[widget.id] !== undefined}
                        allKpis={result?.kpis}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ════ INSIGHTS TAB ═════════════════════════════════════════ */}
        {activeTab === "insights" && (
          <div className="tab-pane" style={{ flex:1, overflowY:"auto" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:18, color:"var(--text)" }}>💡 AI Insights</h2>

            {schema.key_insights?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:12, marginBottom:24 }}>
                {schema.key_insights.map((ins,i) => (
                  <div key={i} style={{ background:"var(--bg2)", border:"1px solid var(--border)",
                    borderRadius:10, padding:"14px 16px",
                    borderLeft:`3px solid ${PALETTE[i%PALETTE.length]}` }}>
                    <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                      <span style={{ color:PALETTE[i%PALETTE.length], fontWeight:800, fontSize:14, flexShrink:0 }}>{i+1}</span>
                      <span style={{ fontSize:12, color:"var(--text2)", lineHeight:1.65 }}>{ins}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result?.insights && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"20px 24px" }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:"var(--accent3)", display:"flex", alignItems:"center", gap:8 }}>
                  <span>📋</span> Detailed Analysis
                </div>
                <MarkdownRenderer content={result.insights} />
              </div>
            )}
          </div>
        )}

        {/* ════ ANOMALIES TAB ════════════════════════════════════════ */}
        {activeTab === "anomalies" && (
          <div className="tab-pane" style={{ flex:1, overflowY:"auto" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:18, color:"var(--text)" }}>🔍 Anomaly Detection</h2>

            {/* KPI strip */}
            {result?.anomaly_data && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:22 }}>
                <SB label="Anomalies Found" value={result.anomaly_data.count} accent="#ff6b6b" />
                <SB label="Columns Analysed" value={result.anomaly_data.numeric_columns?.length} accent="#00d4ff" />
                {Object.entries(result.anomaly_data.stats||{}).slice(0,5).map(([col,s])=>(
                  <SB key={col} label={col} value={s.mean?.toFixed?.(1)}
                    sub={`min ${s.min?.toFixed?.(1)} · max ${s.max?.toFixed?.(1)}`} accent="#fb923c" />
                ))}
              </div>
            )}

            {/* Anomaly scatter charts — interactive */}
            {result?.anomaly_scatter_panels?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fit, minmax(260px, 1fr))`, gap:14, marginBottom:20 }}>
                {result.anomaly_scatter_panels.map((panel,i) => (
                  <div key={i} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10,
                    padding:"14px 16px" }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:10, color:"var(--accent)",
                      display:"flex", alignItems:"center", gap:8 }}>
                      <span>📈</span> {panel.x_label} vs {panel.y_label}
                    </div>
                    <div style={{ height:280 }}>
                      <AnomalyScatterWidget panel={panel} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fallback: static anomaly image if no interactive panels */}
            {!result?.anomaly_scatter_panels?.length && result?.anomaly_image && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10,
                padding:"16px 18px", marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"var(--accent)",
                  display:"flex", alignItems:"center", gap:8 }}>
                  <span>📈</span> Anomaly Scatter Plot
                </div>
                <img
                  src={`data:image/png;base64,${result.anomaly_image}`}
                  alt="Anomaly scatter plot"
                  style={{ width:"100%", borderRadius:8, display:"block" }}
                />
              </div>
            )}

            {/* AI markdown report */}
            {result?.anomaly_report && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10,
                padding:"20px 24px", marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:"var(--accent4)",
                  display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--border)", paddingBottom:10 }}>
                  <span>🔬</span> AI Analysis Report
                </div>
                <MarkdownRenderer content={result.anomaly_report} />
              </div>
            )}
          </div>
        )}

        {/* ════ FORECASTING TAB ══════════════════════════════════════ */}
        {activeTab === "forecasting" && (
          <div className="tab-pane" style={{ flex:1, overflowY:"auto" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:18, color:"var(--text)" }}>📈 Forecasting</h2>

            {result?.forecasts?.length > 0 ? (
              result.forecasts.map(fc => (
                <ForecastCard key={fc.col} fc={fc} />
              ))
            ) : (
              <div style={{ color:"var(--muted)", fontSize:13 }}>No forecast data available for this dataset.</div>
            )}
          </div>
        )}

        {/* ════ CHAT TAB ═════════════════════════════════════════════ */}
        {activeTab === "chat" && (
          <div className="tab-pane" style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:14, color:"var(--text)" }}>🤖 AI Data Assistant</h2>
            <div style={{ flex:1, background:"var(--bg2)", border:"1px solid var(--border)",
              borderRadius:10, padding:14, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <AiChat jobId={jobId} sessionId={sessionId} />
            </div>
          </div>
        )}
      </div>

      {drillDown && (
        <DrillDownModal jobId={jobId} dimension={drillDown.dimension}
          value={drillDown.value} onClose={() => setDrillDown(null)}
          sessionId={sessionId} />
      )}
    </div>
  );
}

function SB({ label, value, sub, accent }) {
  return (
    <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8,
      padding:"10px 13px", borderLeft:`3px solid ${accent||"#00d4ff"}` }}>
      <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color:accent||"#00d4ff" }}>{value??"-"}</div>
      {sub && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
    </div>
  );
}