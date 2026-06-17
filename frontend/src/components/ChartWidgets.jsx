/**
 * ChartWidgets.jsx — Recharts components with full theme support.
 * Uses usePalette() from ThemeContext so chart colours update live when
 * the user switches themes.  Grid lines and ticks read CSS variables.
 */
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush,
} from "recharts";
import { usePalette } from "../ThemeContext.jsx";

/* Static fallback palette used before context mounts */
export const PALETTE = [
  "#00d4ff","#7c5cfc","#00e5a0","#ff6b6b","#f4a535",
  "#c084fc","#60d394","#fb923c","#38bdf8","#ffd93d",
];

/* Read live CSS variable values (Recharts can't use CSS vars directly) */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const fmt = (v) => {
  if (v == null || (typeof v === "number" && isNaN(v))) return "";
  if (typeof v !== "number") return v;
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(1)+"B";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
};

/* Theme-aware helpers — called inside render so they always reflect current theme */
function tick()   { return { fill: cssVar("--chart-tick") || "#6b7a99", fontSize: 10 }; }
function grid()   { return { stroke: cssVar("--chart-grid") || "#1e2a40", strokeDasharray: "3 3" }; }
function tipBg()  { return cssVar("--tooltip-bg")     || "#0e1117"; }
function tipBdr() { return cssVar("--tooltip-border") || "#2a3550"; }
function bgColor(){ return cssVar("--bg")             || "#0e1117"; }
function textColor(){ return cssVar("--text")         || "#e8edf8"; }
function mutedColor(){ return cssVar("--muted")       || "#6b7a99"; }

/* Custom tooltip — always uses current theme CSS vars */
function Tip({ active, payload, label, palette }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: tipBg(), border: `1px solid ${tipBdr()}`, borderRadius: 8,
      padding: "9px 13px", fontSize: 12, pointerEvents: "none", zIndex: 9999 }}>
      {label != null && (
        <p style={{ color: mutedColor(), marginBottom: 5, fontWeight: 600, fontSize: 11 }}>
          {String(label).slice(0, 30)}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || (palette||PALETTE)[i % (palette||PALETTE).length], margin: "2px 0" }}>
          <span style={{ color: mutedColor() }}>{p.name ?? p.dataKey}: </span>
          <strong style={{ color: textColor() }}>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Bar ──────────────────────────────────────────────────────────────────── */
export function BarWidget({ data, xKey="name", yKey="value", onBarClick }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}
        onClick={e => onBarClick?.(e)} style={{ cursor: onBarClick ? "pointer" : "default" }}>
        <CartesianGrid {...G} />
        <XAxis dataKey={xKey} tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={T} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip palette={palette} />} cursor={false} />
        <Bar dataKey={yKey} radius={[4,4,0,0]} maxBarSize={44} activeBar={false}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Line ─────────────────────────────────────────────────────────────────── */
export function LineWidget({ data, xKey="name", yKey="value" }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <CartesianGrid {...G} />
        <XAxis dataKey={xKey} tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={T} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip palette={palette} />} cursor={{ stroke: G.stroke, strokeWidth:1 }} />
        <Line type="monotone" dataKey={yKey} stroke={palette[0]} strokeWidth={2.5}
          dot={false} activeDot={{ r:4, fill:palette[0], stroke:"none" }} />
        {data.length > 40 && <Brush dataKey={xKey} height={18} stroke={G.stroke} fill={bgColor()} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Area ─────────────────────────────────────────────────────────────────── */
export function AreaWidget({ data, xKey="name", yKey="value" }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <defs>
          <linearGradient id="ag0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={palette[0]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={palette[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...G} />
        <XAxis dataKey={xKey} tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={T} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip palette={palette} />} cursor={{ stroke: G.stroke, strokeWidth:1 }} />
        <Area type="monotone" dataKey={yKey} stroke={palette[0]} fill="url(#ag0)"
          strokeWidth={2.5} dot={false} activeDot={{ r:4, stroke:"none" }} />
        {data.length > 40 && <Brush dataKey={xKey} height={18} stroke={G.stroke} fill={bgColor()} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Pie ──────────────────────────────────────────────────────────────────── */
export function PieWidget({ data, nameKey="name", valueKey="value", onSliceClick }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const total = data.reduce((s,d) => s + (Number(d[valueKey]) || 0), 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="48%"
          innerRadius="30%" outerRadius="62%"
          dataKey={valueKey} nameKey={nameKey} paddingAngle={2}
          onClick={d => onSliceClick?.(d)}
          activeShape={null} activeIndex={undefined}
          label={({ name, percent }) =>
            percent > 0.04 ? `${String(name).slice(0,10)} ${(percent*100).toFixed(0)}%` : ""}
          labelLine={{ stroke: grid().stroke, strokeWidth:1 }}
        >
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Pie>
        <Tooltip content={<Tip palette={palette} />}
          formatter={v => [fmt(v)+(total ? ` (${((v/total)*100).toFixed(1)}%)` : ""), ""]} />
        <Legend wrapperStyle={{ fontSize:10, color: mutedColor() }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Scatter ──────────────────────────────────────────────────────────────── */
export function ScatterWidget({ data, xKey="x", yKey="y", colorKey="category" }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const cats = colorKey ? [...new Set(data.map(d => d[colorKey]).filter(Boolean))] : [];
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top:6, right:10, bottom:16, left:4 }}>
        <CartesianGrid {...G} />
        <XAxis dataKey={xKey} type="number" tick={T} tickFormatter={fmt} name={xKey} />
        <YAxis dataKey={yKey} type="number" tick={T} tickFormatter={fmt} name={yKey} width={48} />
        <Tooltip content={<Tip palette={palette} />} cursor={{ strokeDasharray:"3 3", stroke: G.stroke }} />
        {cats.length > 1
          ? cats.slice(0,8).map((cat,i) => (
              <Scatter key={cat} name={String(cat)}
                data={data.filter(d => d[colorKey]===cat)}
                fill={palette[i % palette.length]} opacity={0.72} />
            ))
          : <Scatter data={data.slice(0,600)} fill={palette[0]} opacity={0.65} />
        }
        {cats.length > 1 && <Legend wrapperStyle={{ fontSize:10, color: mutedColor() }} />}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ── Histogram ────────────────────────────────────────────────────────────── */
export function HistogramWidget({ data }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <CartesianGrid {...G} />
        <XAxis dataKey="name" tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={T} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip palette={palette} />} cursor={false} />
        <Bar dataKey="value" fill={palette[2]} radius={[2,2,0,0]} activeBar={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Heatmap ──────────────────────────────────────────────────────────────── */
export function HeatmapWidget({ data }) {
  const palette = usePalette();
  if (!data?.columns?.length) return <Empty />;
  const { columns, matrix } = data;
  const n = columns.length;
  const cellSz = Math.max(22, Math.min(44, Math.floor(320 / n)));

  const color = (v) => {
    if (v == null) return cssVar("--bg3") || "#1c2436";
    if (v >=  0.7) return palette[2];
    if (v >=  0.3) return palette[0];
    if (v >=  0)   return cssVar("--border2") || "#354060";
    if (v >= -0.3) return palette[1];
    return palette[3];
  };

  const byCell = {};
  (matrix||[]).forEach(({ row, col, value }) => { byCell[`${row}__${col}`] = value; });

  return (
    <div style={{ width:"100%", height:"100%", overflowX:"auto", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"flex-start", paddingTop:4 }}>
      <div style={{ display:"grid", gridTemplateColumns:`52px repeat(${n}, ${cellSz}px)`,
        gap:2, fontSize:9, color: mutedColor() }}>
        <div />
        {columns.map(c => (
          <div key={c} style={{ textAlign:"center", lineHeight:1.2, paddingBottom:3, wordBreak:"break-all" }}>
            {c.slice(0,7)}
          </div>
        ))}
        {columns.map(row => (
          <>
            <div key={row+"_l"} style={{ display:"flex", alignItems:"center",
              justifyContent:"flex-end", paddingRight:5, wordBreak:"break-all" }}>
              {row.slice(0,7)}
            </div>
            {columns.map(col => {
              const v = byCell[`${row}__${col}`];
              return (
                <div key={col} title={`${row} × ${col}: ${v?.toFixed?.(3) ?? "—"}`}
                  style={{ width:cellSz, height:cellSz, background:color(v), borderRadius:2,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {cellSz > 30 && (
                    <span style={{ fontSize:7, color:"rgba(255,255,255,0.7)" }}>
                      {v?.toFixed?.(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8, fontSize:9, color: mutedColor() }}>
        {[
          [palette[2],"Strong+"], [palette[0],"Mod+"],
          [cssVar("--border2")||"#354060","Weak"],
          [palette[1],"Mod−"],   [palette[3],"Strong−"],
        ].map(([c,l]) => (
          <span key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <span style={{ width:8, height:8, borderRadius:1, background:c, display:"inline-block" }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────────────────────── */
export function TableWidget({ data }) {
  const { columns=[], rows=[], total=0 } = data || {};
  if (!columns.length) return <Empty />;
  return (
    <div style={{ width:"100%", height:"100%", overflow:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} style={{ padding:"6px 10px", textAlign:"left",
                background: cssVar("--bg2")||"#161b27",
                color: mutedColor(), fontWeight:600, position:"sticky", top:0,
                whiteSpace:"nowrap", borderBottom:`1px solid ${cssVar("--border")||"#2a3550"}` }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom:`1px solid ${cssVar("--bg3")||"#1c2436"}`,
              background: i%2===0 ? "transparent" : "rgba(128,128,128,0.04)" }}>
              {columns.map(c => (
                <td key={c} style={{ padding:"5px 10px", color: cssVar("--text2")||"#b0bdd4",
                  maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {row[c] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <div style={{ textAlign:"center", padding:6, color: mutedColor(), fontSize:10 }}>
          Showing {rows.length} of {total.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

/* ── Forecast (interactive) ───────────────────────────────────────────────── */
export function ForecastWidget({ data }) {
  const palette = usePalette();
  if (!data?.length) return <Empty />;
  const T = tick(), G = grid();
  const fcColor = palette[0];
  const actColor = palette[2];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top:6, right:14, bottom:36, left:4 }}>
        <defs>
          <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={fcColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={fcColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...G} />
        <XAxis dataKey="date" tick={T} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={T} tickFormatter={fmt} width={50} domain={["auto","auto"]} />
        <Tooltip content={<Tip palette={palette} />} cursor={{ stroke: G.stroke, strokeWidth:1 }} />
        <Legend wrapperStyle={{ fontSize:10, color: mutedColor() }} />
        <Area type="monotone" dataKey="upper" name="Upper bound" stroke="none"
          fill="url(#fcBand)" connectNulls activeDot={false} legendType="none" />
        <Area type="monotone" dataKey="lower" name="Lower bound" stroke="none"
          fill={bgColor()} fillOpacity={1} connectNulls activeDot={false} legendType="none" />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={actColor} strokeWidth={2.5}
          dot={{ r:3, fill:actColor, stroke:"none" }} connectNulls
          activeDot={{ r:5, fill:actColor, stroke:"none" }} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke={fcColor} strokeWidth={2.5}
          strokeDasharray="6 4" dot={{ r:3, fill:fcColor, stroke:"none" }} connectNulls
          activeDot={{ r:5, fill:fcColor, stroke:"none" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Anomaly scatter (interactive) ────────────────────────────────────────── */
export function AnomalyScatterWidget({ panel }) {
  const palette = usePalette();
  if (!panel) return <Empty />;
  const { normal=[], anomaly=[], x_label, y_label, x_range, y_range } = panel;
  const T = tick(), G = grid();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top:6, right:14, bottom:16, left:4 }}>
        <CartesianGrid {...G} />
        <XAxis dataKey="x" type="number" tick={T} tickFormatter={fmt}
          name={x_label} domain={x_range||["auto","auto"]} />
        <YAxis dataKey="y" type="number" tick={T} tickFormatter={fmt}
          name={y_label} width={50} domain={y_range||["auto","auto"]} />
        <Tooltip content={<Tip palette={palette} />} cursor={{ strokeDasharray:"3 3", stroke: G.stroke }} />
        <Legend wrapperStyle={{ fontSize:10, color: mutedColor() }} />
        <Scatter name="Normal"  data={normal}  fill={palette[0]} opacity={0.35} />
        <Scatter name="Anomaly" data={anomaly} fill={palette[3]} opacity={0.9} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ── Shared empty state ───────────────────────────────────────────────────── */
function Empty() {
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", color: mutedColor(), gap:6 }}>
      <span style={{ fontSize:24 }}>📊</span>
      <span style={{ fontSize:12 }}>No data</span>
    </div>
  );
}
