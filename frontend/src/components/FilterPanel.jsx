import { useState, useMemo } from "react";

export default function FilterPanel({ schema, activeFilters, onFilterChange, rowCount }) {
  const [collapsed, setCollapsed] = useState(false);
  const filters = schema?.filters || [];

  const activeCount = useMemo(() =>
    Object.keys(activeFilters).filter(k => {
      const v = activeFilters[k];
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === "object") return Object.values(v).some(x => x != null && x !== "");
      return false;
    }).length,
    [activeFilters]
  );

  if (!filters.length) return null;

  const clearAll = () => onFilterChange({});

  const setFilter = (col, val) => {
    const next = { ...activeFilters };
    const isEmpty = !val ||
      (Array.isArray(val) && val.length === 0) ||
      (typeof val === "object" && !Array.isArray(val) &&
        Object.values(val).every(v => v == null || v === ""));
    if (isEmpty) delete next[col];
    else next[col] = val;
    onFilterChange(next);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 12px", background:"#1a2030", borderRadius:"8px 8px 0 0",
        border:"1px solid #1e2a40", cursor:"pointer", userSelect:"none" }}
        onClick={() => setCollapsed(c => !c)}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:13 }}>🎛️</span>
          <span style={{ fontWeight:700, fontSize:12, color:"#e8edf8" }}>Filters</span>
          {activeCount > 0 && (
            <span style={{ background:"#7c5cfc", color:"#fff", borderRadius:99,
              fontSize:9, fontWeight:700, padding:"1px 6px", lineHeight:1.6 }}>{activeCount}</span>
          )}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {activeCount > 0 && (
            <button onClick={e => { e.stopPropagation(); clearAll(); }}
              style={{ background:"none", border:"1px solid #2a3550", borderRadius:5,
                color:"#6b7a99", fontSize:10, padding:"1px 7px", cursor:"pointer" }}>
              Clear all
            </button>
          )}
          <span style={{ color:"#6b7a99", fontSize:12 }}>{collapsed ? "▸" : "▾"}</span>
        </div>
      </div>

      {/* Row count badge */}
      {rowCount != null && (
        <div style={{ padding:"5px 12px", background:"#12171f",
          border:"1px solid #1e2a40", borderTop:"none",
          display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"#00e5a0",
            display:"inline-block", animation:"pulse 2s infinite" }} />
          <span style={{ fontSize:11, color:"#6b7a99" }}>
            <strong style={{ color:"#00e5a0" }}>{rowCount.toLocaleString()}</strong> rows visible
          </span>
        </div>
      )}

      {/* Filter items */}
      {!collapsed && (
        <div style={{ border:"1px solid #1e2a40", borderTop:"none",
          borderRadius:"0 0 8px 8px", overflow:"hidden" }}>
          {filters.map((f, idx) => (
            <FilterItem
              key={f.id}
              filter={f}
              value={activeFilters[f.column]}
              options={schema.filter_options?.[f.column] || []}
              rangeOptions={schema.filter_options?.[`__range__${f.column}`]}
              isLast={idx === filters.length - 1}
              onChange={v => setFilter(f.column, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Individual filter item ──────────────────────────────────────────────── */
function FilterItem({ filter, value, options, rangeOptions, isLast, onChange }) {
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(true);

  const label = filter.label || filter.column.replace(/_/g," ").replace(/\b\w/g, c=>c.toUpperCase());
  const type  = filter.type;

  const borderStyle = isLast ? {} : { borderBottom:"1px solid #1a2235" };

  const header = (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"8px 12px 6px", cursor:"pointer", ...borderStyle }}
      onClick={() => setExpanded(e => !e)}>
      <span style={{ fontSize:11, fontWeight:700, color:"#b0bdd4",
        textTransform:"uppercase", letterSpacing:0.4 }}>{label}</span>
      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
        {_hasValue(value) && (
          <button onClick={e => { e.stopPropagation(); onChange(null); }}
            style={{ background:"none", border:"none", color:"#6b7a99",
              fontSize:10, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
        )}
        <span style={{ color:"#6b7a99", fontSize:10 }}>{expanded ? "▾" : "▸"}</span>
      </div>
    </div>
  );

  // ── Date range ───────────────────────────────────────────────────────────
  if (type === "date_range") {
    const from = value?.from || "";
    const to   = value?.to   || "";
    return (
      <div style={{ background: _hasValue(value) ? "rgba(0,212,255,0.04)" : "transparent" }}>
        {header}
        {expanded && (
          <div style={{ padding:"0 12px 10px", display:"flex", flexDirection:"column", gap:5 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <input type="date" value={from}
                onChange={e => onChange({ from: e.target.value, to })}
                style={inputStyle} />
              <span style={{ color:"#6b7a99", fontSize:10 }}>–</span>
              <input type="date" value={to}
                onChange={e => onChange({ from, to: e.target.value })}
                style={inputStyle} />
            </div>
            {(from || to) && (
              <button onClick={() => onChange(null)}
                style={{ background:"none", border:"none", color:"#6b7a99",
                  fontSize:10, cursor:"pointer", textAlign:"left", padding:0 }}>
                ✕ Clear dates
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Numeric range ────────────────────────────────────────────────────────
  if (type === "numeric_range" && rangeOptions) {
    const globalMin = rangeOptions.min ?? 0;
    const globalMax = rangeOptions.max ?? 100;
    const curMin = value?.min ?? "";
    const curMax = value?.max ?? "";
    return (
      <div style={{ background: _hasValue(value) ? "rgba(0,212,255,0.04)" : "transparent" }}>
        {header}
        {expanded && (
          <div style={{ padding:"0 12px 10px" }}>
            <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:5 }}>
              <input type="number" placeholder={String(globalMin)} value={curMin}
                onChange={e => onChange({ min: e.target.value||null, max: curMax||null })}
                style={{ ...inputStyle, width:"50%" }} />
              <span style={{ color:"#6b7a99", fontSize:10 }}>–</span>
              <input type="number" placeholder={String(globalMax)} value={curMax}
                onChange={e => onChange({ min: curMin||null, max: e.target.value||null })}
                style={{ ...inputStyle, width:"50%" }} />
            </div>
            <div style={{ fontSize:10, color:"#6b7a99" }}>
              Range: {_fmt(globalMin)} – {_fmt(globalMax)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Multi-select (default) ────────────────────────────────────────────────
  const selected = Array.isArray(value) ? value : [];
  const filtered = search
    ? options.filter(o => String(o).toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggleAll = () => {
    if (selected.length === options.length) onChange([]);
    else onChange([...options]);
  };

  return (
    <div style={{ background: selected.length ? "rgba(124,92,252,0.04)" : "transparent" }}>
      {header}
      {expanded && (
        <div style={{ padding:"0 12px 10px" }}>
          {/* Search box for long lists */}
          {options.length > 8 && (
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, width:"100%", marginBottom:6 }}
            />
          )}
          {/* Select all */}
          {options.length > 1 && (
            <button onClick={toggleAll}
              style={{ background:"none", border:"none", color:"#6b7a99",
                fontSize:10, cursor:"pointer", padding:"0 0 5px 2px", display:"block" }}>
              {selected.length === options.length ? "☑ Deselect all" : "☐ Select all"}
            </button>
          )}
          {/* Checkboxes */}
          <div style={{ maxHeight:160, overflowY:"auto", display:"flex",
            flexDirection:"column", gap:2 }}>
            {filtered.slice(0, 40).map(opt => {
              const isChecked = selected.includes(opt);
              return (
                <label key={opt} style={{ display:"flex", alignItems:"center", gap:7,
                  cursor:"pointer", padding:"3px 5px", borderRadius:5,
                  background: isChecked ? "rgba(124,92,252,0.18)" : "transparent",
                  transition:"background 0.12s" }}>
                  <input type="checkbox" checked={isChecked}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...selected, opt]
                        : selected.filter(s => s !== opt);
                      onChange(next.length ? next : null);
                    }}
                    style={{ accentColor:"#7c5cfc", width:12, height:12, flexShrink:0 }} />
                  <span style={{ fontSize:11, color: isChecked ? "#e8edf8" : "#8899bb",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    maxWidth:150 }}>
                    {String(opt)}
                  </span>
                </label>
              );
            })}
            {filtered.length > 40 && (
              <span style={{ fontSize:10, color:"#6b7a99", padding:"3px 5px" }}>
                +{filtered.length - 40} more — use search to narrow
              </span>
            )}
            {filtered.length === 0 && search && (
              <span style={{ fontSize:10, color:"#6b7a99", padding:"4px 5px" }}>No matches</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const inputStyle = {
  background:"#0e1117", border:"1px solid #2a3550", borderRadius:5,
  color:"#e8edf8", padding:"5px 8px", fontSize:11, outline:"none", width:"100%",
};

function _hasValue(v) {
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.values(v).some(x => x != null && x !== "");
  return false;
}

function _fmt(v) {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return typeof v === "number" ? parseFloat(v.toFixed(2)) : v;
}