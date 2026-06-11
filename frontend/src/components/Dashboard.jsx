import { useState, useCallback, useRef, useEffect } from "react";
import FilterPanel from "./FilterPanel.jsx";
import KpiRow from "./KpiRow.jsx";
import AiChat from "./AiChat.jsx";
import DrillDownModal from "./DrillDownModal.jsx";
import {
  BarWidget, LineWidget, AreaWidget, PieWidget,
  ScatterWidget, HistogramWidget, HeatmapWidget, TableWidget, PALETTE,
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
    <div style={{ background:"#0e1117", border:"1px solid #1e2a40", borderRadius:8,
      padding:"10px 14px", borderLeft:`3px solid ${accent}` }}>
      <div style={{ fontSize:10, color:"#6b7a99", fontWeight:600, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
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
          <div style={{ fontSize:11, fontWeight:700, color:"#8899bb", marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>Top {s.topN.length}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {s.topN.map((row,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"5px 10px", background:"#0e1117", borderRadius:6, border:"1px solid #1e2a40" }}>
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
      borderTop:"1px solid rgba(0,212,255,0.15)", fontSize:11, color:"#8899bb",
      lineHeight:1.5, display:"flex", gap:7, flexShrink:0 }}>
      <span style={{ color:"#00d4ff", flexShrink:0 }}>💡</span>
      <span>{text}</span>
    </div>
  );
}

/* ── Single widget card ────────────────────────────────────────────────── */
function WidgetShell({ widget, onDrillDown, filterApplied }) {
  const [expanded, setExpanded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const data = widget.data;
  const chartH = CHART_H[widget.type];

  const renderChart = (d) => {
    if (!d) return null;
    switch (widget.type) {
      case "kpi_row":   return <KpiRow data={d} columns={widget.columns} />;
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
      <div style={{ background:"#161b27", border:"1px solid #1e2a40", borderRadius:10,
        display:"flex", flexDirection:"column", overflow:"hidden", height:"100%" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"8px 12px", borderBottom:"1px solid #1e2a40", background:"#1a2030", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#e8edf8", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{widget.title}</span>
            {filterApplied && (
              <span style={{ fontSize:9, background:"#7c5cfc", color:"#fff",
                borderRadius:99, padding:"1px 5px", flexShrink:0 }}>filtered</span>
            )}
          </div>
          <button onClick={() => setExpanded(true)} title="Expand"
            style={{ background:"none", border:"1px solid #2a3550", borderRadius:5,
              color:"#6b7a99", padding:"2px 7px", fontSize:11, flexShrink:0, cursor:"pointer" }}>⤢</button>
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
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:1000,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{ background:"#161b27", border:"1px solid #2a3550", borderRadius:14,
              width:"92%", maxWidth:1100, maxHeight:"88vh",
              display:"flex", flexDirection:"column", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"12px 18px", borderBottom:"1px solid #1e2a40", background:"#1a2030", flexShrink:0 }}>
              <h3 style={{ fontWeight:800, fontSize:15, color:"#e8edf8" }}>{widget.title}</h3>
              <div style={{ display:"flex", gap:8 }}>
                {computeStats(widget) && (
                  <button onClick={() => setShowStats(s => !s)}
                    style={{ background: showStats ? "#7c5cfc" : "none",
                      border:"1px solid #2a3550", borderRadius:7, color: showStats ? "#fff" : "#8899bb",
                      padding:"5px 12px", fontSize:12, cursor:"pointer" }}>
                    {showStats ? "Hide Stats" : "📊 Stats"}
                  </button>
                )}
                <button onClick={() => setExpanded(false)}
                  style={{ background:"none", border:"1px solid #2a3550", borderRadius:7,
                    color:"#8899bb", padding:"5px 12px", fontSize:12, cursor:"pointer" }}>✕ Close</button>
              </div>
            </div>

            {/* Modal body: chart + optional stats sidebar */}
            <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
              {/* Chart pane */}
              <div style={{ flex:1, padding:"14px 16px", minWidth:0, overflow:"hidden" }}>
                {widget.type === "kpi_row" ? (
                  <div style={{ paddingTop:8 }}>{data && renderChart(data)}</div>
                ) : (
                  <div style={{ width:"100%", height:"100%" }}>
                    {data && renderChart(data)}
                  </div>
                )}
              </div>

              {/* Stats sidebar */}
              {showStats && computeStats(widget) && (
                <div style={{ width:300, flexShrink:0, borderLeft:"1px solid #1e2a40",
                  overflowY:"auto", padding:"14px 16px", background:"#12171f" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7a99",
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

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard({ result, jobId, sourceName, onReset }) {
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

  /* Apply filters with debounce */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
          headers:{"Content-Type":"application/json"},
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
  const TABS = [
    { id:"dashboard", label:"📊 Dashboard" },
    { id:"insights",  label:"💡 Insights"  },
    { id:"anomalies", label:"🔍 Anomalies" },
    { id:"chat",      label:"🤖 AI Chat"   },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", background:"#0e1117" }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 20px", height:50, background:"#161b27",
        borderBottom:"1px solid #1e2a40", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <span style={{ fontWeight:800, fontSize:14, color:"#e8edf8" }}>{schema.title || "Dashboard"}</span>
          <span style={{ fontSize:11, color:"#6b7a99" }}>{sourceName}</span>
          {schema.domain && (
            <span style={{ background:"#1a2030", border:"1px solid #2a3550",
              borderRadius:99, padding:"2px 9px", fontSize:10, color:"#7c5cfc", fontWeight:700, textTransform:"uppercase" }}>
              {schema.domain}
            </span>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {filtering && <span style={{ fontSize:11, color:"#00d4ff", animation:"pulse 1s infinite" }}>● filtering…</span>}
          <button onClick={() => window.open(`${API}/api/export/${jobId}`, "_blank")}
            style={{ background:"#1a2030", border:"1px solid #2a3550", borderRadius:7,
              color:"#b0bdd4", padding:"5px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>↓ Export</button>
          <button onClick={onReset}
            style={{ background:"none", border:"1px solid #1e2a40", borderRadius:7,
              color:"#6b7a99", padding:"5px 13px", fontSize:12, cursor:"pointer" }}>← New</button>
        </div>
      </header>

      {/* ── Tab nav ─────────────────────────────────────────────────── */}
      <div style={{ display:"flex", background:"#161b27", borderBottom:"1px solid #1e2a40",
        flexShrink:0, padding:"0 20px" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:"9px 17px", background:"none", border:"none",
              borderBottom: activeTab===t.id ? "2px solid #00d4ff" : "2px solid transparent",
              color: activeTab===t.id ? "#00d4ff" : "#6b7a99",
              fontWeight: activeTab===t.id ? 700 : 500,
              fontSize:12, cursor:"pointer", transition:"all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflow:"hidden", display:"flex" }}>

        {/* ════ DASHBOARD TAB ════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* Filter sidebar */}
            <div style={{ width:248, flexShrink:0, borderRight:"1px solid #1e2a40",
              overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:10 }}>
              <FilterPanel
                schema={schema}
                activeFilters={filters}
                onFilterChange={setFilters}
                rowCount={isFilterActive ? rowCount : schema.row_count}
              />
            </div>

            {/* Canvas */}
            <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>

              {/* Page tabs */}
              {pages.length > 1 && (
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {pages.map((p,i) => (
                    <button key={p.id} onClick={() => setActivePage(i)}
                      style={{ padding:"5px 14px", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer",
                        background: activePage===i ? "#7c5cfc" : "#1a2030",
                        border:`1px solid ${activePage===i ? "#7c5cfc" : "#2a3550"}`,
                        color:"#e8edf8" }}>
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
                    <p style={{ fontSize:12, color:"#b0bdd4", lineHeight:1.6 }}>{schema.ai_summary}</p>
                  </div>
                </div>
              )}

              {/* Widget grid — 12-col */}
              {currentPage && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:14, alignItems:"start" }}>
                  {currentPage.widgets?.map(widget => (
                    <div key={widget.id} style={{ gridColumn:`span ${Math.min(widget.w || 6, 12)}` }}>
                      <WidgetShell
                        widget={{ ...widget, data: getWidgetData(widget) }}
                        jobId={jobId}
                        onDrillDown={(dim,val) => setDrillDown({ dimension:dim, value:val })}
                        filterApplied={filteredData[widget.id] !== undefined}
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
          <div style={{ flex:1, overflowY:"auto", padding:"22px 26px" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:18, color:"#e8edf8" }}>💡 AI Insights</h2>

            {schema.key_insights?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:12, marginBottom:24 }}>
                {schema.key_insights.map((ins,i) => (
                  <div key={i} style={{ background:"#161b27", border:"1px solid #1e2a40",
                    borderRadius:10, padding:"14px 16px",
                    borderLeft:`3px solid ${PALETTE[i%PALETTE.length]}` }}>
                    <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                      <span style={{ color:PALETTE[i%PALETTE.length], fontWeight:800, fontSize:14, flexShrink:0 }}>{i+1}</span>
                      <p style={{ fontSize:12, color:"#b0bdd4", lineHeight:1.65 }}>{ins}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result?.insights && (
              <div style={{ background:"#161b27", border:"1px solid #1e2a40", borderRadius:10, padding:"18px 20px" }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"#00e5a0" }}>📋 Detailed Analysis</h3>
                <pre style={{ whiteSpace:"pre-wrap", fontSize:12, color:"#b0bdd4", lineHeight:1.7, fontFamily:"inherit" }}>
                  {result.insights}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ════ ANOMALIES TAB ════════════════════════════════════════ */}
        {activeTab === "anomalies" && (
          <div style={{ flex:1, overflowY:"auto", padding:"22px 26px" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:18, color:"#e8edf8" }}>🔍 Anomaly Detection</h2>

            {result?.anomaly_data && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:22 }}>
                <SB label="Anomalies Found" value={result.anomaly_data.count} accent="#ff6b6b" />
                <SB label="Columns Analysed" value={result.anomaly_data.numeric_columns?.length} accent="#00d4ff" />
                {Object.entries(result.anomaly_data.stats||{}).slice(0,4).map(([col,s])=>(
                  <SB key={col} label={col} value={s.mean?.toFixed?.(1)}
                    sub={`min ${s.min?.toFixed?.(1)} · max ${s.max?.toFixed?.(1)}`} accent="#fb923c" />
                ))}
              </div>
            )}

            {result?.anomaly_report && (
              <div style={{ background:"#161b27", border:"1px solid #1e2a40", borderRadius:10, padding:"18px 20px", marginBottom:20 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"#ff6b6b" }}>Anomaly Report</h3>
                <pre style={{ whiteSpace:"pre-wrap", fontSize:12, color:"#b0bdd4", lineHeight:1.7, fontFamily:"inherit" }}>
                  {result.anomaly_report}
                </pre>
              </div>
            )}

            {result?.forecasts?.length > 0 && (
              <div>
                <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12, color:"#00e5a0" }}>📈 Forecasts</h3>
                {result.forecasts.map(fc => (
                  <div key={fc.col} style={{ background:"#161b27", border:"1px solid #1e2a40", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                    <h4 style={{ fontSize:12, fontWeight:700, marginBottom:10, color:"#00d4ff" }}>Forecast: {fc.col}</h4>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ fontSize:11, borderCollapse:"collapse" }}>
                        <thead><tr>{["Period","Forecast","Lower","Upper"].map(h =>
                          <th key={h} style={{ padding:"4px 10px", color:"#6b7a99", borderBottom:"1px solid #1e2a40", textAlign:"left" }}>{h}</th>
                        )}</tr></thead>
                        <tbody>
                          {fc.rows.slice(-10).map((row,i) => (
                            <tr key={i} style={{ borderBottom:"1px solid #1a2235" }}>
                              <td style={{ padding:"4px 10px", color:"#b0bdd4" }}>{row.ds}</td>
                              <td style={{ padding:"4px 10px", color:"#00e5a0", fontWeight:600 }}>{row.yhat?.toFixed?.(2)}</td>
                              <td style={{ padding:"4px 10px", color:"#6b7a99" }}>{row.yhat_lower?.toFixed?.(2)}</td>
                              <td style={{ padding:"4px 10px", color:"#6b7a99" }}>{row.yhat_upper?.toFixed?.(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ CHAT TAB ═════════════════════════════════════════════ */}
        {activeTab === "chat" && (
          <div style={{ flex:1, overflow:"hidden", padding:"18px 22px", display:"flex", flexDirection:"column" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:14, color:"#e8edf8" }}>🤖 AI Data Assistant</h2>
            <div style={{ flex:1, background:"#161b27", border:"1px solid #1e2a40",
              borderRadius:10, padding:14, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <AiChat jobId={jobId} />
            </div>
          </div>
        )}
      </div>

      {drillDown && (
        <DrillDownModal jobId={jobId} dimension={drillDown.dimension}
          value={drillDown.value} onClose={() => setDrillDown(null)} />
      )}
    </div>
  );
}

function SB({ label, value, sub, accent }) {
  return (
    <div style={{ background:"#161b27", border:"1px solid #1e2a40", borderRadius:8,
      padding:"10px 13px", borderLeft:`3px solid ${accent||"#00d4ff"}` }}>
      <div style={{ fontSize:10, color:"#6b7a99", fontWeight:600, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color:accent||"#00d4ff" }}>{value??"-"}</div>
      {sub && <div style={{ fontSize:10, color:"#6b7a99", marginTop:2 }}>{sub}</div>}
    </div>
  );
}