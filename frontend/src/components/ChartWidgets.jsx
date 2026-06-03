/**
 * ChartWidgets.jsx
 * All Recharts-based chart components for the PowerBI dashboard
 * - No white hover cast
 * - 10+ chart types
 * - Expanded stats panels
 */
import { Fragment } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar,
  FunnelChart, Funnel, LabelList,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine,
} from "recharts";

export const PALETTE = [
  "#00d4ff","#7c5cfc","#00e5a0","#ff6b6b","#f4a535",
  "#c084fc","#60d394","#fb923c","#38bdf8","#ffd93d",
];

const TICK_STYLE = { fill:"#6b7a99", fontSize:11 };
const GRID_STYLE = { stroke:"#2a3550", strokeDasharray:"3 3" };

const fmt = (v) => {
  if (v == null || isNaN(v)) return v;
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(1)+"B";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
};

// No white cast: use explicit dark styles, cursor set to crosshair
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8, padding:"10px 14px", fontSize:12, pointerEvents:"none" }}>
      <p style={{ color:"#b0bdd4", marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map((p,i) => (
        <p key={i} style={{ color:p.color||PALETTE[i], margin:"2px 0" }}>
          <span style={{ color:"#6b7a99" }}>{p.name}: </span>
          <strong>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

// Shared tooltip style for all charts - overrides recharts default white bg
const tooltipStyle = {
  contentStyle:{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 },
  labelStyle:{ color:"#b0bdd4", fontWeight:600 },
  itemStyle:{ color:"#e8edf8" },
  cursor:{ fill:"transparent" },  // removes white hover cast on bars
};

// ── Stats helper used in expanded modal ──────────────────────────
export function ChartStats({ data, type }) {
  if (!data) return null;
  if (type === "heatmap") return null;

  const rows = Array.isArray(data) ? data : (data?.rows || []);
  if (!rows.length) return null;

  const nums = rows.map(r => r.value ?? r.y ?? null).filter(v => v != null && !isNaN(v));
  if (!nums.length) return null;

  const sum = nums.reduce((a,b)=>a+b, 0);
  const avg = sum / nums.length;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const sorted = [...nums].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length/2)];

  const stats = [
    { label:"Count",  value: nums.length.toLocaleString() },
    { label:"Sum",    value: fmt(sum) },
    { label:"Avg",    value: fmt(avg) },
    { label:"Max",    value: fmt(max) },
    { label:"Min",    value: fmt(min) },
    { label:"Median", value: fmt(median) },
  ];

  return (
    <div style={{ display:"flex", gap:10, flexWrap:"wrap", padding:"12px 16px", borderTop:"1px solid #2a3550", background:"#0f1520" }}>
      {stats.map(s => (
        <div key={s.label} style={{ background:"#1c2436", border:"1px solid #2a3550", borderRadius:8, padding:"8px 14px", textAlign:"center", minWidth:80 }}>
          <div style={{ fontSize:10, color:"#6b7a99", marginBottom:3, textTransform:"uppercase", fontWeight:600 }}>{s.label}</div>
          <div style={{ fontSize:16, fontWeight:800, color:"#00d4ff" }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Bar ──────────────────────────────────────────────────────────
export function BarWidget({ data, xKey="name", yKey="value", onBarClick }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }} onClick={e=>onBarClick?.(e)}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
        <Bar dataKey={yKey} radius={[4,4,0,0]} maxBarSize={40}>
          {data.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Line ─────────────────────────────────────────────────────────
export function LineWidget({ data, xKey="name", yKey="value" }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize:11, color:"#6b7a99" }} />
        <Line type="monotone" dataKey={yKey} stroke={PALETTE[0]} strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:PALETTE[0] }} />
        {data.length > 30 && <Brush dataKey={xKey} height={20} stroke="#2a3550" fill="#161b27" travellerWidth={6} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Area ─────────────────────────────────────────────────────────
export function AreaWidget({ data, xKey="name", yKey="value" }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PALETTE[0]} stopOpacity={0.3} />
            <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey={yKey} stroke={PALETTE[0]} fill="url(#areaGrad)" strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:PALETTE[0] }} />
        {data.length > 30 && <Brush dataKey={xKey} height={20} stroke="#2a3550" fill="#161b27" />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Pie ──────────────────────────────────────────────────────────
export function PieWidget({ data, nameKey="name", valueKey="value", onSliceClick }) {
  if (!data?.length) return <EmptyState />;
  const total = data.reduce((s,d)=>s+(d[valueKey]||0),0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} cx="50%" cy="50%"
          innerRadius="35%" outerRadius="65%"
          dataKey={valueKey} nameKey={nameKey}
          paddingAngle={2}
          onClick={(d,i)=>onSliceClick?.(d,i)}
          label={({name,percent})=>`${name?.slice?.(0,12)} ${(percent*100).toFixed(1)}%`}
          labelLine={{ stroke:"#354060", strokeWidth:1 }}
        >
          {data.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v)=>[fmt(v)+` (${((v/total)*100).toFixed(1)}%)`, ""]} contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} labelStyle={{ color:"#b0bdd4" }} />
        <Legend wrapperStyle={{ fontSize:11, color:"#6b7a99" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Scatter ──────────────────────────────────────────────────────
export function ScatterWidget({ data, xKey="x", yKey="y", colorKey="category" }) {
  if (!data?.length) return <EmptyState />;
  const cats = colorKey ? [...new Set(data.map(d=>d[colorKey]).filter(Boolean))] : [];
  if (cats.length > 1) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top:8, right:12, bottom:16, left:8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey={xKey} type="number" tick={TICK_STYLE} tickFormatter={fmt} name={xKey} />
          <YAxis dataKey={yKey} type="number" tick={TICK_STYLE} tickFormatter={fmt} name={yKey} width={50} />
          <Tooltip cursor={{ strokeDasharray:"3 3", stroke:"#354060" }} contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} />
          <Legend wrapperStyle={{ fontSize:11 }} />
          {cats.slice(0,8).map((cat,i)=>(
            <Scatter key={cat} name={String(cat)} data={data.filter(d=>d[colorKey]===cat)} fill={PALETTE[i%PALETTE.length]} opacity={0.7} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top:8, right:12, bottom:16, left:8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} type="number" tick={TICK_STYLE} tickFormatter={fmt} name={xKey} />
        <YAxis dataKey={yKey} type="number" tick={TICK_STYLE} tickFormatter={fmt} name={yKey} width={50} />
        <Tooltip cursor={{ strokeDasharray:"3 3", stroke:"#354060" }} contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} />
        <Scatter data={data.slice(0,500)} fill={PALETTE[0]} opacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ── Histogram ────────────────────────────────────────────────────
export function HistogramWidget({ data }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="name" tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" fill={PALETTE[2]} radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────
export function HeatmapWidget({ data }) {
  if (!data?.columns?.length) return <EmptyState />;
  const { columns, matrix } = data;
  const size = Math.min(380, 36 * columns.length);
  const cellSz = Math.floor(size / columns.length);

  const getColor = (v) => {
    if (v == null) return "#1c2436";
    if (v >= 0.7)  return "#00e5a0";
    if (v >= 0.3)  return "#00d4ff";
    if (v >= 0)    return "#354060";
    if (v >= -0.3) return "#7c5cfc";
    return "#ff6b6b";
  };

  const byCell = {};
  matrix.forEach(({row,col,value})=>{ byCell[`${row}__${col}`]=value; });

  return (
    <div style={{ overflowX:"auto", width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{ display:"grid", gridTemplateColumns:`60px repeat(${columns.length}, ${cellSz}px)`, gap:2 }}>
        <div />
        {columns.map(c=>(
          <div key={c} style={{ fontSize:9, color:"#6b7a99", textAlign:"center", wordBreak:"break-all", lineHeight:1.2, paddingBottom:4 }}>
            {c.slice(0,8)}
          </div>
        ))}
        {columns.map(row=>(
          <Fragment key={row}>
            <div style={{ fontSize:9, color:"#6b7a99", display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:6, wordBreak:"break-all" }}>
              {row.slice(0,8)}
            </div>
            {columns.map(col=>{
              const v = byCell[`${row}__${col}`];
              return (
                <div key={col} title={`${row} × ${col}: ${v?.toFixed?.(3)}`}
                  style={{ width:cellSz, height:cellSz, background:getColor(v), borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {cellSz > 28 && <span style={{ fontSize:8, color:"rgba(255,255,255,0.7)" }}>{v?.toFixed?.(1)}</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:10, fontSize:10, color:"#6b7a99" }}>
        {[["#00e5a0","Strong +"],["#00d4ff","Moderate +"],["#354060","Weak"],["#7c5cfc","Moderate -"],["#ff6b6b","Strong -"]].map(([c,l])=>(
          <span key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ width:10,height:10,borderRadius:2,background:c,display:"inline-block" }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────
export function TableWidget({ data }) {
  const { columns=[], rows=[], total=0 } = data || {};
  if (!columns.length) return <EmptyState />;
  return (
    <div style={{ width:"100%", height:"100%", overflow:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr>
            {columns.map(c=>(
              <th key={c} style={{ padding:"8px 10px", textAlign:"left", background:"#1c2436", color:"#b0bdd4", fontWeight:600, position:"sticky", top:0, whiteSpace:"nowrap", borderBottom:"1px solid #2a3550", fontSize:11 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i)=>(
            <tr key={i} style={{ background: i%2===0?"transparent":"rgba(255,255,255,0.02)", borderBottom:"1px solid #1c2436" }}>
              {columns.map(c=>(
                <td key={c} style={{ padding:"6px 10px", color:"#e8edf8", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {row[c]??"-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <div style={{ textAlign:"center", padding:"8px", color:"#6b7a99", fontSize:11 }}>
          Showing {rows.length} of {total.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

// ── Radar ────────────────────────────────────────────────────────
export function RadarWidget({ data, nameKey="name", valueKey="value" }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} margin={{ top:8, right:24, bottom:8, left:24 }}>
        <PolarGrid stroke="#2a3550" />
        <PolarAngleAxis dataKey={nameKey} tick={{ fill:"#6b7a99", fontSize:11 }} />
        <PolarRadiusAxis tick={{ fill:"#6b7a99", fontSize:9 }} tickFormatter={fmt} />
        <Radar dataKey={valueKey} stroke={PALETTE[0]} fill={PALETTE[0]} fillOpacity={0.25} dot={{ r:3, fill:PALETTE[0] }} />
        <Tooltip contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} labelStyle={{ color:"#b0bdd4" }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Radial Bar ───────────────────────────────────────────────────
export function RadialBarWidget({ data, nameKey="name", valueKey="value" }) {
  if (!data?.length) return <EmptyState />;
  const d = data.slice(0,8).map((item,i) => ({ ...item, fill: PALETTE[i%PALETTE.length] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart cx="50%" cy="50%" innerRadius="15%" outerRadius="90%" data={d} startAngle={180} endAngle={-180}>
        <RadialBar dataKey={valueKey} background={{ fill:"#1c2436" }} cornerRadius={4} label={{ fill:"#b0bdd4", fontSize:10 }} />
        <Legend iconSize={10} wrapperStyle={{ fontSize:11, color:"#6b7a99" }} />
        <Tooltip contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} labelStyle={{ color:"#b0bdd4" }} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

// ── Funnel ───────────────────────────────────────────────────────
export function FunnelWidget({ data, nameKey="name", valueKey="value" }) {
  if (!data?.length) return <EmptyState />;
  const d = data.slice(0,8).map((item,i) => ({ ...item, fill: PALETTE[i%PALETTE.length] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip contentStyle={{ background:"#1c2436", border:"1px solid #354060", borderRadius:8 }} labelStyle={{ color:"#b0bdd4" }} />
        <Funnel dataKey={valueKey} data={d} isAnimationActive>
          <LabelList position="right" fill="#b0bdd4" stroke="none" dataKey={nameKey} fontSize={11} />
          {d.map((item,i) => <Cell key={i} fill={item.fill} />)}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

// ── Composed (Bar + Line) ────────────────────────────────────────
export function ComposedWidget({ data, xKey="name", barKey="value", lineKey="value2" }) {
  if (!data?.length) return <EmptyState />;
  const hasLine = data.some(d => d[lineKey] != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
        <Legend wrapperStyle={{ fontSize:11, color:"#6b7a99" }} />
        <Bar dataKey={barKey} fill={PALETTE[1]} radius={[3,3,0,0]} maxBarSize={40} />
        {hasLine && <Line type="monotone" dataKey={lineKey} stroke={PALETTE[0]} strokeWidth={2.5} dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Stacked Bar ──────────────────────────────────────────────────
export function StackedBarWidget({ data, xKey="name" }) {
  if (!data?.length) return <EmptyState />;
  // Auto-detect numeric value keys (not the xKey)
  const keys = Object.keys(data[0] || {}).filter(k => k !== xKey && typeof data[0][k] === "number");
  if (!keys.length) return <BarWidget data={data} xKey={xKey} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:8, right:12, bottom:32, left:8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={TICK_STYLE} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK_STYLE} tickFormatter={fmt} width={50} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
        <Legend wrapperStyle={{ fontSize:11, color:"#6b7a99" }} />
        {keys.map((k,i) => (
          <Bar key={k} dataKey={k} stackId="a" fill={PALETTE[i%PALETTE.length]} radius={i===keys.length-1?[3,3,0,0]:[0,0,0,0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#6b7a99", fontSize:13, flexDirection:"column", gap:8 }}>
      <span style={{ fontSize:28 }}>📊</span>
      <span>No data available</span>
    </div>
  );
}
