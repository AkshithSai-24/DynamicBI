/**
 * ChartWidgets.jsx — Recharts components, no hover white-cast, fixed heights
 */
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush,
} from "recharts";

export const PALETTE = [
  "#00d4ff","#7c5cfc","#00e5a0","#ff6b6b","#f4a535",
  "#c084fc","#60d394","#fb923c","#38bdf8","#ffd93d",
  "#e879f9","#34d399","#f87171","#a78bfa","#facc15",
];

const TICK  = { fill:"#6b7a99", fontSize:10 };
const GRID  = { stroke:"#1e2a40", strokeDasharray:"3 3" };

const fmt = (v) => {
  if (v == null || (typeof v === "number" && isNaN(v))) return "";
  if (typeof v !== "number") return v;
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(1)+"B";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
};

/* Custom tooltip — dark, no white flash */
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0e1117", border:"1px solid #2a3550", borderRadius:8,
      padding:"9px 13px", fontSize:12, pointerEvents:"none", zIndex:9999 }}>
      {label != null && <p style={{ color:"#8899bb", marginBottom:5, fontWeight:600, fontSize:11 }}>{String(label).slice(0,30)}</p>}
      {payload.map((p,i) => (
        <p key={i} style={{ color: p.color || PALETTE[i], margin:"2px 0" }}>
          <span style={{ color:"#6b7a99" }}>{p.name ?? p.dataKey}: </span>
          <strong style={{ color:"#e8edf8" }}>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

/* ── Bar ──────────────────────────────────────────────────────────────────── */
export function BarWidget({ data, xKey="name", yKey="value", onBarClick }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}
        onClick={e => onBarClick?.(e)} style={{ cursor: onBarClick ? "pointer" : "default" }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} tick={TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip />} cursor={false} />
        <Bar dataKey={yKey} radius={[4,4,0,0]} maxBarSize={44}
          activeBar={false}>
          {data.map((_,i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Line ─────────────────────────────────────────────────────────────────── */
export function LineWidget({ data, xKey="name", yKey="value" }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} tick={TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip />} cursor={{ stroke:"#2a3550", strokeWidth:1 }} />
        <Line type="monotone" dataKey={yKey} stroke={PALETTE[0]} strokeWidth={2.5}
          dot={false} activeDot={{ r:4, fill:PALETTE[0], stroke:"none" }} />
        {data.length > 40 && <Brush dataKey={xKey} height={18} stroke="#2a3550" fill="#0e1117" />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Area ─────────────────────────────────────────────────────────────────── */
export function AreaWidget({ data, xKey="name", yKey="value" }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <defs>
          <linearGradient id="ag0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PALETTE[0]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} tick={TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip />} cursor={{ stroke:"#2a3550", strokeWidth:1 }} />
        <Area type="monotone" dataKey={yKey} stroke={PALETTE[0]} fill="url(#ag0)"
          strokeWidth={2.5} dot={false} activeDot={{ r:4, stroke:"none" }} />
        {data.length > 40 && <Brush dataKey={xKey} height={18} stroke="#2a3550" fill="#0e1117" />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Pie ──────────────────────────────────────────────────────────────────── */
export function PieWidget({ data, nameKey="name", valueKey="value", onSliceClick }) {
  if (!data?.length) return <Empty />;
  const total = data.reduce((s,d) => s + (Number(d[valueKey]) || 0), 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} cx="50%" cy="48%"
          innerRadius="30%" outerRadius="62%"
          dataKey={valueKey} nameKey={nameKey}
          paddingAngle={2}
          onClick={(d) => onSliceClick?.(d)}
          /* kill the default activeShape white bleed */
          activeShape={null}
          activeIndex={undefined}
          label={({ name, percent }) =>
            percent > 0.04 ? `${String(name).slice(0,10)} ${(percent*100).toFixed(0)}%` : ""}
          labelLine={{ stroke:"#2a3550", strokeWidth:1 }}
        >
          {data.map((_,i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip
          content={<Tip />}
          formatter={(v) => [fmt(v) + (total ? ` (${((v/total)*100).toFixed(1)}%)` : ""), ""]}
        />
        <Legend wrapperStyle={{ fontSize:10, color:"#6b7a99" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Scatter ──────────────────────────────────────────────────────────────── */
export function ScatterWidget({ data, xKey="x", yKey="y", colorKey="category" }) {
  if (!data?.length) return <Empty />;
  const cats = colorKey ? [...new Set(data.map(d => d[colorKey]).filter(Boolean))] : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top:6, right:10, bottom:16, left:4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} type="number" tick={TICK} tickFormatter={fmt} name={xKey} />
        <YAxis dataKey={yKey} type="number" tick={TICK} tickFormatter={fmt} name={yKey} width={48} />
        <Tooltip content={<Tip />} cursor={{ strokeDasharray:"3 3", stroke:"#2a3550" }} />
        {cats.length > 1
          ? cats.slice(0,8).map((cat,i) => (
              <Scatter key={cat} name={String(cat)}
                data={data.filter(d => d[colorKey] === cat)}
                fill={PALETTE[i % PALETTE.length]} opacity={0.72} />
            ))
          : <Scatter data={data.slice(0,600)} fill={PALETTE[0]} opacity={0.65} />
        }
        {cats.length > 1 && <Legend wrapperStyle={{ fontSize:10, color:"#6b7a99" }} />}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ── Histogram ────────────────────────────────────────────────────────────── */
export function HistogramWidget({ data }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:6, right:10, bottom:36, left:4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="name" tick={TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip />} cursor={false} />
        <Bar dataKey="value" fill={PALETTE[2]} radius={[2,2,0,0]}
          activeBar={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Heatmap ──────────────────────────────────────────────────────────────── */
export function HeatmapWidget({ data }) {
  if (!data?.columns?.length) return <Empty />;
  const { columns, matrix } = data;
  const n = columns.length;
  const cellSz = Math.max(22, Math.min(44, Math.floor(320 / n)));

  const color = (v) => {
    if (v == null) return "#1c2436";
    if (v >=  0.7) return "#00e5a0";
    if (v >=  0.3) return "#00d4ff";
    if (v >=  0)   return "#354060";
    if (v >= -0.3) return "#7c5cfc";
    return "#ff6b6b";
  };

  const byCell = {};
  (matrix||[]).forEach(({ row, col, value }) => { byCell[`${row}__${col}`] = value; });

  return (
    <div style={{ width:"100%", height:"100%", overflowX:"auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", paddingTop:4 }}>
      <div style={{ display:"grid", gridTemplateColumns:`52px repeat(${n}, ${cellSz}px)`, gap:2, fontSize:9, color:"#6b7a99" }}>
        <div />
        {columns.map(c => <div key={c} style={{ textAlign:"center", lineHeight:1.2, paddingBottom:3, wordBreak:"break-all" }}>{c.slice(0,7)}</div>)}
        {columns.map(row => (
          <>
            <div key={row+"_l"} style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:5, wordBreak:"break-all" }}>{row.slice(0,7)}</div>
            {columns.map(col => {
              const v = byCell[`${row}__${col}`];
              return (
                <div key={col} title={`${row} × ${col}: ${v?.toFixed?.(3) ?? "—"}`}
                  style={{ width:cellSz, height:cellSz, background:color(v), borderRadius:2,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {cellSz > 30 && <span style={{ fontSize:7, color:"rgba(255,255,255,0.7)" }}>{v?.toFixed?.(1)}</span>}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8, fontSize:9, color:"#6b7a99" }}>
        {[["#00e5a0","Strong+"],["#00d4ff","Mod+"],["#354060","Weak"],["#7c5cfc","Mod−"],["#ff6b6b","Strong−"]].map(([c,l])=>(
          <span key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <span style={{ width:8,height:8,borderRadius:1,background:c,display:"inline-block" }} />{l}
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
              <th key={c} style={{ padding:"6px 10px", textAlign:"left", background:"#161b27",
                color:"#8899bb", fontWeight:600, position:"sticky", top:0,
                whiteSpace:"nowrap", borderBottom:"1px solid #2a3550" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i} style={{ borderBottom:"1px solid #1a2235",
              background: i%2===0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
              {columns.map(c => (
                <td key={c} style={{ padding:"5px 10px", color:"#c8d4e8",
                  maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {row[c] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <div style={{ textAlign:"center", padding:6, color:"#6b7a99", fontSize:10 }}>
          Showing {rows.length} of {total.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

/* ── Forecast (interactive) ───────────────────────────────────────────────── */
export function ForecastWidget({ data }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top:6, right:14, bottom:36, left:4 }}>
        <defs>
          <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4d9fff" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#4d9fff" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tick={TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} width={50} domain={["auto","auto"]} />
        <Tooltip content={<Tip />} cursor={{ stroke:"#2a3550", strokeWidth:1 }} />
        <Legend wrapperStyle={{ fontSize:10, color:"#6b7a99" }} />
        {/* confidence band */}
        <Area type="monotone" dataKey="upper" name="Upper bound" stroke="none"
          fill="url(#fcBand)" connectNulls activeDot={false} legendType="none" />
        <Area type="monotone" dataKey="lower" name="Lower bound" stroke="none"
          fill="#0e1117" fillOpacity={1} connectNulls activeDot={false} legendType="none" />
        {/* actual history */}
        <Line type="monotone" dataKey="actual" name="Actual" stroke="#00e5a0" strokeWidth={2.5}
          dot={{ r:3, fill:"#00e5a0", stroke:"none" }} connectNulls
          activeDot={{ r:5, fill:"#00e5a0", stroke:"none" }} />
        {/* forecast */}
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#4d9fff" strokeWidth={2.5}
          strokeDasharray="6 4" dot={{ r:3, fill:"#4d9fff", stroke:"none" }} connectNulls
          activeDot={{ r:5, fill:"#4d9fff", stroke:"none" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Anomaly scatter (interactive) ────────────────────────────────────────── */
export function AnomalyScatterWidget({ panel }) {
  if (!panel) return <Empty />;
  const { normal=[], anomaly=[], x_label, y_label, x_range, y_range } = panel;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top:6, right:14, bottom:16, left:4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="x" type="number" tick={TICK} tickFormatter={fmt}
          name={x_label} domain={x_range || ["auto","auto"]} />
        <YAxis dataKey="y" type="number" tick={TICK} tickFormatter={fmt}
          name={y_label} width={50} domain={y_range || ["auto","auto"]} />
        <Tooltip content={<Tip />} cursor={{ strokeDasharray:"3 3", stroke:"#2a3550" }} />
        <Legend wrapperStyle={{ fontSize:10, color:"#6b7a99" }} />
        <Scatter name="Normal" data={normal} fill="#00d4ff" opacity={0.35} />
        <Scatter name="Anomaly" data={anomaly} fill="#ff6b6b" opacity={0.9} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ── Shared empty state ───────────────────────────────────────────────────── */
function Empty() {
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", color:"#6b7a99", gap:6 }}>
      <span style={{ fontSize:24 }}>📊</span>
      <span style={{ fontSize:12 }}>No data</span>
    </div>
  );
}
