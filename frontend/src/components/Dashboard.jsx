import { useState, useCallback, useRef, useEffect } from "react";
import FilterPanel from "./FilterPanel.jsx";
import KpiRow from "./KpiRow.jsx";
import AiChat from "./AiChat.jsx";
import DrillDownModal from "./DrillDownModal.jsx";
import {
  BarWidget, LineWidget, AreaWidget, PieWidget,
  ScatterWidget, HistogramWidget, HeatmapWidget, TableWidget,
  RadarWidget, RadialBarWidget, FunnelWidget, ComposedWidget, StackedBarWidget,
  ChartStats,
} from "./ChartWidgets.jsx";

const API = import.meta.env.VITE_API_URL || "";

// Compact heights so all charts fit in first screen without scrolling
const WIDGET_H = {
  kpi_row: 80,
  bar: 220, line: 220, area: 220,
  pie: 200, scatter: 220, histogram: 200,
  table: 200, heatmap: 220,
  radar: 220, radial_bar: 220, funnel: 220,
  composed: 220, stacked_bar: 220,
};

function InsightBubble({ text }) {
  if (!text) return null;
  return (
    <div style={{ marginTop:6, padding:"6px 12px", background:"rgba(0,212,255,0.07)", border:"1px solid rgba(0,212,255,0.2)", borderRadius:8, fontSize:11, color:"var(--text2)", lineHeight:1.5, display:"flex", gap:8 }}>
      <span style={{ color:"var(--accent)", flexShrink:0 }}>💡</span>
      <span>{text}</span>
    </div>
  );
}

function WidgetShell({ widget, jobId, onDrillDown, filterApplied }) {
  const [expanded, setExpanded] = useState(false);
  const data = widget.data;
  const h = WIDGET_H[widget.type] || 220;

  const renderChart = (d, fullH) => {
    const chartH = fullH || h;
    switch (widget.type) {
      case "kpi_row":    return <KpiRow data={d} columns={widget.columns} />;
      case "bar":        return (
        <BarWidget data={d} onBarClick={e => {
          if (e?.activePayload?.[0] && widget.x_col)
            onDrillDown(widget.x_col, e.activePayload[0].payload.name);
        }} />
      );
      case "line":       return <LineWidget data={d} />;
      case "area":       return <AreaWidget data={d} />;
      case "pie":        return <PieWidget data={d} onSliceClick={(d2) => {
        if (widget.x_col && d2?.name) onDrillDown(widget.x_col, d2.name);
      }} />;
      case "scatter":    return <ScatterWidget data={d} colorKey={widget.color_col} />;
      case "histogram":  return <HistogramWidget data={d} />;
      case "heatmap":    return <HeatmapWidget data={d} />;
      case "table":      return <TableWidget data={d} />;
      case "radar":      return <RadarWidget data={d} />;
      case "radial_bar": return <RadialBarWidget data={d} />;
      case "funnel":     return <FunnelWidget data={d} />;
      case "composed":   return <ComposedWidget data={d} />;
      case "stacked_bar":return <StackedBarWidget data={d} />;
      default:           return <BarWidget data={d} />;
    }
  };

  return (
    <>
      <div style={{
        background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:"var(--radius)",
        display:"flex", flexDirection:"column", overflow:"hidden",
        transition:"box-shadow 0.2s",
      }}>
        {/* Widget header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", borderBottom:"1px solid var(--border)", background:"var(--bg3)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{widget.title}</span>
            {filterApplied && <span style={{ fontSize:10, background:"var(--accent2)", color:"#fff", borderRadius:99, padding:"1px 6px" }}>filtered</span>}
          </div>
          <button
            onClick={() => setExpanded(true)}
            title="Expand"
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, color:"var(--muted)", padding:"2px 7px", fontSize:12, cursor:"pointer" }}
          >⤢</button>
        </div>

        {/* Chart area */}
        <div style={{ flex:1, padding: widget.type==="kpi_row"?"10px":"6px 8px 8px", height: widget.type==="kpi_row"?"auto":h }}>
          {data ? renderChart(data) : (
            <div style={{ height:h, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="skeleton" style={{ width:"90%", height:"80%", borderRadius:8 }} />
            </div>
          )}
        </div>

        {widget.insight && <InsightBubble text={widget.insight} />}
      </div>

      {/* Expanded modal with stats */}
      {expanded && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:998, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, width:"92%", maxWidth:960, maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 18px", borderBottom:"1px solid var(--border)", background:"var(--bg3)", flexShrink:0 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:15, margin:0 }}>{widget.title}</h3>
                <span style={{ fontSize:11, color:"var(--muted)", textTransform:"uppercase" }}>{widget.type?.replace(/_/g," ")}</span>
              </div>
              <button onClick={() => setExpanded(false)} style={{ background:"none", border:"1px solid var(--border)", borderRadius:8, color:"var(--text2)", padding:"4px 12px", cursor:"pointer" }}>✕ Close</button>
            </div>

            {/* Chart */}
            <div style={{ flex:1, padding:"14px 18px", overflow:"hidden", minHeight:320 }}>
              {data && renderChart(data, "100%")}
            </div>

            {/* Insight */}
            {widget.insight && (
              <div style={{ padding:"0 18px 8px" }}>
                <InsightBubble text={widget.insight} />
              </div>
            )}

            {/* Stats strip */}
            {data && widget.type !== "kpi_row" && widget.type !== "table" && widget.type !== "heatmap" && (
              <ChartStats data={data} type={widget.type} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Dashboard({ result, jobId, sourceName, onReset }) {
  const schema = result?.dashboard_schema || {};
  const pages  = schema.pages || [];

  const [activePage, setActivePage]     = useState(0);
  const [activeTab, setActiveTab]       = useState("dashboard");
  const [filters, setFilters]           = useState({});
  const [filteredData, setFilteredData] = useState({});
  const [filteredKpis, setFilteredKpis] = useState(null);
  const [rowCount, setRowCount]         = useState(null);
  const [filtering, setFiltering]       = useState(false);
  const [drillDown, setDrillDown]       = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const hasFilters = Object.keys(filters).some(k => {
      const v = filters[k];
      return Array.isArray(v) ? v.length > 0 : v?.from || v?.to;
    });
    if (!hasFilters) {
      setFilteredData({});
      setFilteredKpis(null);
      setRowCount(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setFiltering(true);
      try {
        const pageId = pages[activePage]?.id;
        const r = await fetch(`${API}/api/filter/${jobId}`, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ filters, page_id: pageId }),
        });
        const d = await r.json();
        setFilteredData(d.updated_widgets || {});
        setFilteredKpis(d.kpi_data || null);
        setRowCount(d.row_count ?? null);
      } catch(e) {
        console.error("Filter error:", e);
      }
      setFiltering(false);
    }, 400);
  }, [filters, activePage]);

  const getWidgetData = useCallback((widget) => {
    if (filteredData[widget.id] !== undefined) return filteredData[widget.id];
    return widget.data;
  }, [filteredData]);

  const isFilterActive = Object.keys(filters).some(k => {
    const v = filters[k];
    return Array.isArray(v) ? v.length > 0 : v?.from || v?.to;
  });

  const currentPage = pages[activePage];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
      {/* Top bar */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", height:48, background:"var(--bg2)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <div>
            <span style={{ fontWeight:800, fontSize:14, color:"var(--text)" }}>{schema.title || "Dashboard"}</span>
            <span style={{ marginLeft:10, fontSize:11, color:"var(--muted)" }}>{sourceName}</span>
          </div>
          {schema.domain && (
            <span style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:99, padding:"2px 10px", fontSize:11, color:"var(--accent2)", fontWeight:600, textTransform:"uppercase" }}>
              {schema.domain}
            </span>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {filtering && <span style={{ fontSize:11, color:"var(--accent)", animation:"pulse 1s infinite" }}>● Filtering…</span>}
          <button
            onClick={() => window.open(`${API}/api/export/${jobId}`, "_blank")}
            style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text2)", padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}
          >
            ↓ Export
          </button>
          <button
            onClick={onReset}
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:8, color:"var(--muted)", padding:"5px 14px", fontSize:12, cursor:"pointer" }}
          >
            ← New
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:0, background:"var(--bg2)", borderBottom:"1px solid var(--border)", flexShrink:0, padding:"0 20px" }}>
        {[
          { id:"dashboard", label:"📊 Dashboard" },
          { id:"insights",  label:"💡 AI Insights" },
          { id:"anomalies", label:"🔍 Anomalies" },
          { id:"chat",      label:"🤖 AI Chat" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding:"9px 18px", background:"none", border:"none",
              borderBottom: activeTab===tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab===tab.id ? "var(--accent)" : "var(--muted)",
              fontWeight: activeTab===tab.id ? 700 : 500,
              fontSize:13, cursor:"pointer", transition:"all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflow:"hidden", display:"flex" }}>

        {activeTab === "dashboard" && (
          <>
            {/* Sidebar: filters */}
            <div style={{ width:240, flexShrink:0, borderRight:"1px solid var(--border)", overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:10 }}>
              <FilterPanel
                schema={schema}
                activeFilters={filters}
                onFilterChange={setFilters}
                rowCount={isFilterActive ? rowCount : result?.dashboard_schema?.row_count}
              />
            </div>

            {/* Main canvas */}
            <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
              {/* Page tabs */}
              {pages.length > 1 && (
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  {pages.map((p,i) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePage(i)}
                      style={{
                        padding:"5px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                        background: activePage===i ? "var(--accent2)" : "var(--bg3)",
                        border:`1px solid ${activePage===i?"var(--accent2)":"var(--border)"}`,
                        color:"var(--text)",
                      }}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}

              {/* AI Summary banner */}
              {schema.ai_summary && (
                <div style={{ background:"linear-gradient(135deg,rgba(124,92,252,0.1),rgba(0,212,255,0.1))", border:"1px solid rgba(0,212,255,0.2)", borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>🧠</span>
                    <p style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6, margin:0 }}>{schema.ai_summary}</p>
                  </div>
                </div>
              )}

              {/* Widget grid — auto-fill columns so all charts show on first screen */}
              {currentPage && (
                <div style={{
                  display:"grid",
                  gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",
                  gap:12,
                }}>
                  {currentPage.widgets?.map(widget => (
                    <WidgetShell
                      key={widget.id}
                      widget={{ ...widget, data: getWidgetData(widget) }}
                      jobId={jobId}
                      onDrillDown={(dim,val) => setDrillDown({ dimension:dim, value:val })}
                      filterApplied={filteredData[widget.id] !== undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "insights" && (
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
            <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20, color:"var(--text)" }}>💡 AI Insights</h2>

            {schema.key_insights?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:14, marginBottom:28 }}>
                {schema.key_insights.map((ins,i) => (
                  <div key={i} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px", borderLeft:`3px solid ${["var(--accent)","var(--accent2)","var(--accent3)","var(--accent5)","var(--accent6)"][i%5]}` }}>
                    <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                      <span style={{ color:["var(--accent)","var(--accent2)","var(--accent3)","var(--accent5)","var(--accent6)"][i%5], fontWeight:800, fontSize:16, flexShrink:0 }}>{i+1}</span>
                      <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.65 }}>{ins}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result?.insights && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 22px" }}>
                <h3 style={{ fontSize:15, fontWeight:700, marginBottom:14, color:"var(--accent3)" }}>📋 Detailed Analysis</h3>
                <pre style={{ whiteSpace:"pre-wrap", fontSize:13, color:"var(--text2)", lineHeight:1.7, fontFamily:"var(--sans)" }}>{result.insights}</pre>
              </div>
            )}
          </div>
        )}

        {activeTab === "anomalies" && (
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
            <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>🔍 Anomaly Detection</h2>

            {result?.anomaly_data && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
                <StatBox label="Anomalies Found" value={result.anomaly_data.count} accent="var(--red)" />
                <StatBox label="Columns Analysed" value={result.anomaly_data.numeric_columns?.length} accent="var(--accent)" />
                {Object.entries(result.anomaly_data.stats||{}).slice(0,4).map(([col,s])=>(
                  <StatBox key={col} label={col} value={s.mean?.toFixed(1)} sub={`min ${s.min?.toFixed(1)} · max ${s.max?.toFixed(1)}`} accent="var(--orange)" />
                ))}
              </div>
            )}

            {result?.anomaly_report && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 22px" }}>
                <h3 style={{ fontSize:15, fontWeight:700, marginBottom:14, color:"var(--red)" }}>Anomaly Report</h3>
                <pre style={{ whiteSpace:"pre-wrap", fontSize:13, color:"var(--text2)", lineHeight:1.7, fontFamily:"var(--sans)" }}>{result.anomaly_report}</pre>
              </div>
            )}

            {result?.forecasts?.length > 0 && (
              <div style={{ marginTop:24 }}>
                <h3 style={{ fontSize:16, fontWeight:700, marginBottom:14, color:"var(--accent3)" }}>📈 Forecasts</h3>
                <div style={{ display:"grid", gap:14 }}>
                  {result.forecasts.map(fc=>(
                    <div key={fc.col} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px" }}>
                      <h4 style={{ fontSize:13, fontWeight:700, marginBottom:10, color:"var(--accent)" }}>Forecast: {fc.col}</h4>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ fontSize:11, borderCollapse:"collapse" }}>
                          <thead><tr>{["Period","Forecast","Lower","Upper"].map(h=><th key={h} style={{ padding:"4px 10px", color:"var(--muted)", borderBottom:"1px solid var(--border)", textAlign:"left" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {fc.rows.slice(-10).map((row,i)=>(
                              <tr key={i} style={{ borderBottom:"1px solid rgba(42,53,80,0.4)" }}>
                                <td style={{ padding:"4px 10px", color:"var(--text2)" }}>{row.ds}</td>
                                <td style={{ padding:"4px 10px", color:"var(--accent3)", fontWeight:600 }}>{row.yhat?.toFixed?.(2)}</td>
                                <td style={{ padding:"4px 10px", color:"var(--muted)" }}>{row.yhat_lower?.toFixed?.(2)}</td>
                                <td style={{ padding:"4px 10px", color:"var(--muted)" }}>{row.yhat_upper?.toFixed?.(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <div style={{ flex:1, overflow:"hidden", padding:"20px 24px", display:"flex", flexDirection:"column" }}>
            <h2 style={{ fontSize:20, fontWeight:800, marginBottom:16 }}>🤖 AI Data Assistant</h2>
            <div style={{ flex:1, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:16, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <AiChat jobId={jobId} />
            </div>
          </div>
        )}
      </div>

      {drillDown && (
        <DrillDownModal
          jobId={jobId}
          dimension={drillDown.dimension}
          value={drillDown.value}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, sub, accent }) {
  return (
    <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px", borderLeft:`3px solid ${accent||"var(--accent)"}` }}>
      <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color:accent||"var(--accent)" }}>{value??"-"}</div>
      {sub && <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
    </div>
  );
}
