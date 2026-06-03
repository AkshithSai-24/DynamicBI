import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

function renderAnswer(text) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 4 }} />;
    const isBullet = /^[-•]/.test(trimmed);
    const content  = isBullet ? trimmed.slice(1).trim() : trimmed;
    if (isBullet) return (
      <div key={i} style={{ display:"flex", gap:8, marginBottom:4 }}>
        <span style={{ color:"var(--accent3)", flexShrink:0 }}>•</span>
        <span style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6 }}>{content}</span>
      </div>
    );
    return <p key={i} style={{ fontSize:13, color:"var(--text)", lineHeight:1.7, marginBottom:4 }}>{content}</p>;
  });
}

export default function AiChat({ jobId }) {
  const [messages, setMessages] = useState([{
    role:"assistant", text:"👋 Hi! Ask me anything about your data. I can answer questions, run calculations, and generate charts.",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(m => [...m, { role:"user", text:q }]);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/query/${jobId}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json();
      const msg = {
        role:"assistant",
        text: data.answer || "No answer returned.",
        visual: data.visual || null,
        table:  data.data?.length ? data.data : null,
        columns: data.columns || [],
      };
      setMessages(m => [...m, msg]);
    } catch(e) {
      setMessages(m => [...m, { role:"assistant", text:`⚠ Error: ${e.message}` }]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = [
    "What are the top 5 performing categories?",
    "Show me the trend over time",
    "Which segment has the highest average value?",
    "Are there any anomalies in the data?",
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:400 }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 0", display:"flex", flexDirection:"column", gap:12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:"flex", gap:10, flexDirection: msg.role==="user"?"row-reverse":"row", animation:"fadeIn 0.3s ease" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, background: msg.role==="user"?"var(--accent2)":"var(--bg4)", border:"1px solid var(--border)" }}>
              {msg.role==="user"?"👤":"🤖"}
            </div>
            <div style={{ maxWidth:"80%", background: msg.role==="user"?"var(--accent2)":"var(--bg3)", border: `1px solid ${msg.role==="user"?"transparent":"var(--border)"}`, borderRadius: msg.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px", padding:"10px 14px" }}>
              {renderAnswer(msg.text)}
              {msg.visual && (
                <div style={{ marginTop:10 }}>
                  <img src={`data:image/png;base64,${msg.visual.data}`} alt="chart" style={{ maxWidth:"100%", borderRadius:8 }} />
                </div>
              )}
              {msg.table && (
                <div style={{ marginTop:10, overflowX:"auto" }}>
                  <table style={{ fontSize:11, borderCollapse:"collapse", width:"100%" }}>
                    <thead>
                      <tr>{msg.columns.map(c=><th key={c} style={{ padding:"4px 8px", textAlign:"left", color:"var(--muted)", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {msg.table.slice(0,10).map((row,ri)=>(
                        <tr key={ri}>
                          {msg.columns.map(c=><td key={c} style={{ padding:"3px 8px", color:"var(--text2)", borderBottom:"1px solid rgba(42,53,80,0.4)" }}>{row[c]??"-"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {msg.table.length > 10 && <div style={{ fontSize:11, color:"var(--muted)", paddingTop:4 }}>…{msg.table.length-10} more rows</div>}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--bg4)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div>
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:"12px 12px 12px 4px", padding:"12px 16px", display:"flex", gap:5 }}>
              {[0,1,2].map(i=><span key={i} style={{ width:7,height:7,borderRadius:"50%",background:"var(--accent)",display:"inline-block",animation:`bounce 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
          {SUGGESTIONS.map(s=>(
            <button key={s} onClick={()=>{ setInput(s); }}
              style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:99, color:"var(--text2)", fontSize:11, padding:"5px 12px", cursor:"pointer", whiteSpace:"nowrap" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display:"flex", gap:8, padding:"10px 0 0" }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Ask anything about your data…"
          style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"10px 14px", fontSize:13, outline:"none" }}
        />
        <button
          onClick={send}
          disabled={!input.trim()||loading}
          style={{ padding:"10px 18px", background:"linear-gradient(135deg,var(--accent2),var(--accent))", border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:13, opacity:(!input.trim()||loading)?0.5:1 }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
