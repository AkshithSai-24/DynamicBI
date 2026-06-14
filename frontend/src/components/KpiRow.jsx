const fmt = (v) => {
  if (v == null || isNaN(v)) return v ?? "-";
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(2)+"B";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Number.isInteger(v) ? v.toString() : parseFloat(v.toFixed(2)).toString();
};

const KPI_ICONS = {
  sum: "∑", avg: "~", max: "↑", min: "↓", count: "#",
  revenue:"💰", sales:"📈", profit:"💹", customer:"👥", order:"📦",
  student:"🎓", grade:"📝", score:"⭐", employee:"👔", product:"🏷️",
};

function getIcon(label) {
  const low = label.toLowerCase();
  for (const [k,v] of Object.entries(KPI_ICONS)) {
    if (low.includes(k)) return v;
  }
  return "📊";
}

const ACCENT_CYCLE = ["var(--accent)","var(--accent2)","var(--accent3)","var(--accent5)","var(--accent6)","var(--accent4)"];

export default function KpiRow({ data, columns, showAll = false }) {
  if (!data?.length) return null;

  // Filter to just the requested columns, or show all / first 6
  const items = columns?.length
    ? data.filter(k => columns.includes(k.column) || k.column === "_rows")
    : (showAll ? data : data.slice(0, 6));

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:`repeat(auto-fit, minmax(140px, 1fr))`,
      gap:12, width:"100%",
    }}>
      {items.map((kpi, i) => (
        <KpiCard key={kpi.column} kpi={kpi} accent={ACCENT_CYCLE[i % ACCENT_CYCLE.length]} />
      ))}
    </div>
  );
}

function KpiCard({ kpi, accent }) {
  const { label, sum, avg, max, min, count } = kpi;
  const primary = sum ?? avg ?? count ?? 0;

  return (
    <div style={{
      background:"var(--bg3)", border:`1px solid var(--border)`,
      borderRadius:"var(--radius)", padding:"14px 16px",
      borderLeft:`3px solid ${accent}`,
      display:"flex", flexDirection:"column", gap:6,
      transition:"transform 0.15s, box-shadow 0.15s",
      cursor:"default",
    }}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 24px rgba(0,0,0,0.3)`;}}
    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <span style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, lineHeight:1.3, maxWidth:"80%" }}>
          {label}
        </span>
        <span style={{ fontSize:18, lineHeight:1 }}>{getIcon(label)}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:800, color: accent, letterSpacing:-0.5, lineHeight:1.1 }}>
        {fmt(primary)}
      </div>
      {avg != null && sum != null && (
        <div style={{ fontSize:11, color:"var(--muted)" }}>
          avg <span style={{ color:"var(--text2)", fontWeight:600 }}>{fmt(avg)}</span>
          {max != null && <> · max <span style={{ color:"var(--text2)", fontWeight:600 }}>{fmt(max)}</span></>}
        </div>
      )}
    </div>
  );
}
