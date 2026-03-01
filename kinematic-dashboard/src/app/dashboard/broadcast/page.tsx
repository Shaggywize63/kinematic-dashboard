
'use client';
import { useState } from 'react';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

const MOCK_QS = [
  { id:1, question:'Which product showed the highest consumer interest today?', options:['SKU-001 — Mint','SKU-002 — Classic','SKU-003 — Premium','Couldn\'t assess'], correct_option:0, is_urgent:true, response_count:31, total_target:47, deadline:'4:00 PM', created_at:'8:00 AM' },
  { id:2, question:'Do you have enough stock for the second half of today?', options:['Yes — fully stocked','Partially stocked','No — urgent restock needed','Already requested restock'], correct_option:0, is_urgent:false, response_count:38, total_target:47, created_at:'11:30 AM' },
];

export default function BroadcastPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ question:'', opts:['','','',''], correct:0, urgent:false, deadline:'' });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Broadcast Questions</div>
          <div style={{ fontSize:13, color:C.gray, marginTop:3 }}>Send questions to all field executives</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background:C.red, color:'#fff', border:'none', borderRadius:12, padding:'11px 18px', fontSize:13, fontWeight:700, fontFamily:"'Syne',sans-serif", cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 8px 24px rgba(224,30,44,0.28)' }}>
          + New Question
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', gap:12 }}>
        {[{l:'Total Sent',v:String(MOCK_QS.length),c:C.blue},{l:'Avg Response Rate',v:'73%',c:C.green},{l:'Pending Response',v:'16',c:C.yellow}].map(s => (
          <div key={s.l} style={{ flex:1, background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Questions */}
      {MOCK_QS.map((q, qi) => {
        const pct = Math.round((q.response_count / q.total_target) * 100);
        return (
          <div key={q.id} style={{ background:'#0E1420', border:`1px solid ${q.is_urgent ? C.red+'35' : C.border}`, borderRadius:16, padding:22 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:10, color:C.purple, fontWeight:700 }}>Q{qi+1} · {q.created_at}</span>
                  {q.is_urgent && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(224,30,44,0.12)', color:C.red }}>URGENT</span>}
                  {q.deadline && <span style={{ fontSize:10, color:C.yellow }}>Due {q.deadline}</span>}
                </div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, lineHeight:1.4 }}>{q.question}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
              {q.options.map((opt, i) => (
                <div key={i} style={{ padding:'7px 13px', borderRadius:10, border:`1px solid ${i === q.correct_option ? C.green+'40' : C.border}`, background: i === q.correct_option ? 'rgba(0,217,126,0.08)' : '#131B2A', fontSize:12, color: i === q.correct_option ? C.green : C.gray }}>
                  {i === q.correct_option && '✓ '}{opt}
                </div>
              ))}
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:C.gray, marginBottom:6 }}>
                <span>Responses: {q.response_count}/{q.total_target}</span>
                <span style={{ color:C.green, fontWeight:700 }}>{pct}%</span>
              </div>
              <div style={{ height:6, background:'#131B2A', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background: pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red, borderRadius:3, transition:'width 0.8s ease' }}/>
              </div>
            </div>
          </div>
        );
      })}

      {/* Create modal */}
      {showCreate && (
        <div onClick={e => { if(e.target === e.currentTarget) setShowCreate(false); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation:'fadeIn 0.2s ease' }}>
          <div style={{ background:'#0E1420', border:'1px solid #1E2D45', borderRadius:22, width:'100%', maxWidth:520, padding:28, animation:'fadeUp 0.3s ease', maxHeight:'90vh', overflow:'auto' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:20 }}>Create Broadcast Question</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.gray, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.8px' }}>Question</label>
              <textarea value={form.question} onChange={e => setForm(p => ({...p, question:e.target.value}))} placeholder="Type your question..." rows={3}
                style={{ width:'100%', background:'#131B2A', border:'1px solid #1E2D45', color:'#E8EDF8', borderRadius:11, padding:'11px 14px', fontSize:13, outline:'none', resize:'none', fontFamily:"'DM Sans',sans-serif" }}/>
            </div>

            {['Option A','Option B','Option C','Option D'].map((ph, i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="radio" checked={form.correct === i} onChange={() => setForm(p => ({...p, correct:i}))} style={{ accentColor:C.green }}/>
                  <input value={form.opts[i]} onChange={e => setForm(p => { const o=[...p.opts]; o[i]=e.target.value; return {...p, opts:o}; })} placeholder={ph}
                    style={{ flex:1, background:'#131B2A', border:'1px solid #1E2D45', color:'#E8EDF8', borderRadius:10, padding:'9px 13px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif" }}/>
                </div>
              </div>
            ))}

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, background:'#131B2A', border:'1px solid #1E2D45', borderRadius:12, padding:'12px', color:'#7A8BA0', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, background:C.purple, border:'none', borderRadius:12, padding:'12px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Syne',sans-serif", boxShadow:'0 8px 24px rgba(155,110,255,0.3)' }}>Send to All FEs</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
