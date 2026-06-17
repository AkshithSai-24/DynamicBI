import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

const fmt = v => {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Math.abs(v)>=1e6) return (v/1e6).toFixed(2)+"M";
    if (Math.abs(v)>=1e3) return (v/1e3).toFixed(1)+"K";
    return Number.isInteger(v)?v:parseFloat(v.toFixed(2));
  }
  return String(v);
};

export default function DrillDownModal({ jobId, dimension, value, onClose, sessionId }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId || !dimension || !value) return;
    setLoading(true);
    fetch(`${API}/api/drilldown/${jobId}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", ...(sessionId ? { "X-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ widget_id:"", dimension, value }),
    })
    .then(r=>r.json())
    .then(d=>{ setData(d); setLoading(false); })
    .catch(()=>setLoading(false));
  }, [jobId, dimension, value]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, width:"100%", maxWidth:640, maxHeight:"80vh", overflow:"auto", padding:28 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h3 style={{ fontSize:17, fontWeight:800, color:"var(--text)" }}>Drill-down: <span style={{ color:"var(--accent)" }}>{String(value)}</span></h3>
            <p style={{ color:"var(--muted)", fontSize:12 }}>by {dimension}</p>
          </div>
          <button onClick={onClose} style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text2)", padding:"6px 12px", fontSize:14 }}>✕</button>
        </div>

        {loading && (
          <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
            <div style={{ width:32,height:32,borderRadius:"50%",border:"3px solid var(--accent)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite",margin:"0 auto 12px" }} />
            Loading details…
          </div>
        )}

        {data && !loading && (
          <div>
            {/* Stats grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
              <StatBox label="Matching Rows" value={data.row_count?.toLocaleString()} accent="var(--accent)" />
              {Object.entries(data.statistics||{}).slice(0,5).map(([col,stats])=>(
                <StatBox key={col} label={col} value={fmt(stats.sum??stats.mean)} sub={`avg ${fmt(stats.mean)}`} accent="var(--accent2)" />
              ))}
            </div>

            {/* Sample table */}
            {data.sample?.length > 0 && (
              <div>
                <h4 style={{ fontSize:13, fontWeight:700, color:"var(--text2)", marginBottom:10 }}>Sample Records</h4>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead>
                      <tr>{Object.keys(data.sample[0]||{}).map(c=><th key={c} style={{ padding:"6px 10px", textAlign:"left", color:"var(--muted)", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.sample.map((row,i)=>(
                        <tr key={i} style={{ borderBottom:"1px solid rgba(42,53,80,0.5)" }}>
                          {Object.values(row).map((v,j)=>(
                            <td key={j} style={{ padding:"5px 10px", color:"var(--text2)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v??"-"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, accent }) {
  return (
    <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", borderLeft:`3px solid ${accent||"var(--accent)"}` }}>
      <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color:accent||"var(--accent)" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
    </div>
  );
}
