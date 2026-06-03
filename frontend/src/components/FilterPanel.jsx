import { useState } from "react";

export default function FilterPanel({ schema, activeFilters, onFilterChange, rowCount }) {
  const [open, setOpen] = useState(true);
  const filters = schema?.filters || [];

  if (!filters.length) return null;

  const clearAll = () => onFilterChange({});

  const activeCount = Object.values(activeFilters).filter(v =>
    Array.isArray(v) ? v.length > 0 : v?.from || v?.to
  ).length;

  return (
    <div style={{
      background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:"var(--radius)",
      overflow:"hidden", transition:"all 0.3s",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", cursor:"pointer", userSelect:"none" }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>🎛️</span>
          <span style={{ fontWeight:700, fontSize:13, color:"var(--text)" }}>Filters</span>
          {activeCount > 0 && (
            <span style={{ background:"var(--accent2)", color:"#fff", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 7px" }}>
              {activeCount}
            </span>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {activeCount > 0 && (
            <button onClick={e=>{e.stopPropagation();clearAll();}} style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, color:"var(--muted)", fontSize:11, padding:"2px 8px" }}>
              Clear all
            </button>
          )}
          <span style={{ color:"var(--muted)", fontSize:16 }}>{open?"▾":"▸"}</span>
        </div>
      </div>

      {/* Row count indicator */}
      {rowCount != null && (
        <div style={{ padding:"4px 16px 8px", borderTop:"1px solid var(--border)", background:"var(--bg3)" }}>
          <span style={{ fontSize:11, color:"var(--muted)" }}>Showing </span>
          <span style={{ fontSize:11, fontWeight:700, color:"var(--accent3)" }}>{rowCount?.toLocaleString()}</span>
          <span style={{ fontSize:11, color:"var(--muted)" }}> rows</span>
        </div>
      )}

      {open && (
        <div style={{ padding:"12px 16px 16px", display:"flex", flexDirection:"column", gap:16, borderTop:"1px solid var(--border)" }}>
          {filters.map(f => (
            <FilterItem
              key={f.id}
              filter={f}
              value={activeFilters[f.column]}
              options={schema.filter_options?.[f.column] || []}
              onChange={v => {
                const next = { ...activeFilters };
                if (!v || (Array.isArray(v) && !v.length)) delete next[f.column];
                else next[f.column] = v;
                onFilterChange(next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterItem({ filter, value, options, onChange }) {
  const label = filter.label || filter.column;

  if (filter.type === "date_range") {
    const from = value?.from || "";
    const to   = value?.to || "";
    return (
      <div>
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text2)", marginBottom:8 }}>{label}</label>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type="date" value={from}
            onChange={e=>onChange({...value,from:e.target.value})}
            style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text)", padding:"6px 10px", fontSize:12 }}
          />
          <span style={{ color:"var(--muted)", fontSize:11 }}>to</span>
          <input type="date" value={to}
            onChange={e=>onChange({...value,to:e.target.value})}
            style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text)", padding:"6px 10px", fontSize:12 }}
          />
        </div>
        {(from||to) && (
          <button onClick={()=>onChange({})} style={{ marginTop:6, background:"none", border:"none", color:"var(--muted)", fontSize:11, cursor:"pointer" }}>✕ Clear date</button>
        )}
      </div>
    );
  }

  // multi_select / single_select
  if (filter.type === "range") {
    return (
      <div>
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text2)", marginBottom:8 }}>{label}</label>
        <input
          type="range"
          style={{ width:"100%", accentColor:"var(--accent)" }}
        />
      </div>
    );
  }

  // Default: multi-select checkboxes
  const selected = Array.isArray(value) ? value : [];
  const allSelected = selected.length === 0;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <label style={{ fontSize:12, fontWeight:600, color:"var(--text2)" }}>{label}</label>
        {!allSelected && (
          <button onClick={()=>onChange([])} style={{ background:"none", border:"none", color:"var(--muted)", fontSize:11, cursor:"pointer" }}>✕ Clear</button>
        )}
      </div>
      <div style={{ maxHeight:140, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
        {options.slice(0,30).map(opt => {
          const checked = allSelected ? false : selected.includes(opt);
          return (
            <label key={opt} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"3px 6px", borderRadius:6, background: checked ? "rgba(124,92,252,0.15)" : "transparent", transition:"background 0.15s" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => {
                  const next = e.target.checked ? [...selected, opt] : selected.filter(s=>s!==opt);
                  onChange(next);
                }}
                style={{ accentColor:"var(--accent2)", width:14, height:14 }}
              />
              <span style={{ fontSize:12, color: checked ? "var(--text)" : "var(--text2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>
                {opt}
              </span>
            </label>
          );
        })}
        {options.length > 30 && <span style={{ color:"var(--muted)", fontSize:11, paddingLeft:6 }}>+{options.length-30} more…</span>}
      </div>
    </div>
  );
}
