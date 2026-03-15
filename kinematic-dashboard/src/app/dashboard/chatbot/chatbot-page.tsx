'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';

const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: Date;
}

/* ── Markdown-lite renderer ── */
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, `<code style="background:${C.s3};padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>`)
    .replace(/^### (.*)/gm, `<div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:${C.white};margin:12px 0 4px">$1</div>`)
    .replace(/^## (.*)/gm,  `<div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:${C.white};margin:14px 0 5px">$1</div>`)
    .replace(/^- (.*)/gm,   `<div style="display:flex;gap:7px;margin:3px 0"><span style="color:${C.red};margin-top:1px">•</span><span>$1</span></div>`)
    .replace(/\n/g, '<br/>');
}

/* ── Quick action suggestions ── */
const QUICK = [
  { label:'FEs present today',     q:'How many field executives are present today?' },
  { label:'Attendance summary',     q:'Give me today\'s attendance summary' },
  { label:'Active outlets',         q:'How many active outlets do we have?' },
  { label:'Today\'s CC & ECC',      q:'What are today\'s total CC and ECC numbers?' },
  { label:'Weekly performance',     q:'Show me this week\'s performance summary' },
  { label:'Generate report',        q:'Generate a full attendance report for today' },
  { label:'Top performers',         q:'Who are the top performing FEs this week?' },
  { label:'Zone-wise breakdown',    q:'Give me a zone-wise breakdown of today\'s activity' },
];

export default function ChatbotPage() {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [liveData,   setLiveData]   = useState<Record<string,any>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
  const headers = { Authorization: `Bearer ${token}` };

  /* ── Fetch live context data ── */
  const fetchContext = useCallback(async () => {
    setDataLoading(true);
    try {
      const [attRes, locRes, weekRes, summRes] = await Promise.allSettled([
        api.get<any>('/api/v1/analytics/attendance-today', { headers }),
        api.get<any>('/api/v1/analytics/live-locations',   { headers }),
        api.get<any>('/api/v1/analytics/weekly-contacts',  { headers }),
        api.get<any>(`/api/v1/analytics/summary?date=${new Date().toISOString().split('T')[0]}`, { headers }),
      ]);
      const ctx: Record<string,any> = {};
      if (attRes.status  === 'fulfilled') ctx.attendance  = attRes.value?.data  ?? attRes.value;
      if (locRes.status  === 'fulfilled') ctx.locations   = locRes.value?.data  ?? locRes.value;
      if (weekRes.status === 'fulfilled') ctx.weekly      = weekRes.value?.data ?? weekRes.value;
      if (summRes.status === 'fulfilled') ctx.summary     = summRes.value?.data ?? summRes.value;
      setLiveData(ctx);
    } catch {}
    finally { setDataLoading(false); }
  }, [token]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  /* ── Build system prompt with live data ── */
  const buildSystem = () => {
    const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const att  = liveData.attendance?.summary || {};
    const locs = liveData.locations?.locations || [];
    const week = liveData.weekly || {};
    const summ = liveData.summary || {};

    const activeFEs = locs.filter((l:any) => l.status === 'active');

    return `You are Kinematic AI — the intelligent operations assistant for Rise Up, a field force management platform by Hindustan Field Co.

Today is ${today}.

## LIVE DATA (fetched just now)

### Attendance Today
- Total FEs: ${att.total ?? 'unknown'}
- Present / Checked In: ${att.present ?? 'unknown'}
- On Break: ${att.on_break ?? 'unknown'}
- Checked Out: ${att.checked_out ?? 'unknown'}
- Absent: ${att.absent ?? 'unknown'}

### Active Field Executives Right Now
${activeFEs.length > 0
  ? activeFEs.map((fe:any) => `- ${fe.name} · ${fe.zone_name || 'No zone'} · Status: ${fe.status}`).join('\n')
  : '- No FEs currently active in field'}

### Today's Performance
- Total CC (Consumer Contacts): ${summ.total_engagements ?? 'unknown'}
- Total ECC (Effective Consumer Contacts): ${summ.total_conversions ?? 'unknown'}
- Conversion Rate: ${summ.conversion_rate != null ? summ.conversion_rate + '%' : 'unknown'}

### Weekly Summary (Last 7 days)
- Total CC: ${week.total_cc ?? 'unknown'}
- Total ECC: ${week.total_ecc ?? 'unknown'}
- Days: ${(week.days || []).map((d:any) => `${d.short_label}: CC=${d.cc} ECC=${d.ecc}`).join(', ') || 'No data'}

## YOUR CAPABILITIES
You can answer questions about:
- Attendance (who is present, absent, on break, checked out)
- FE locations and field activity
- CC and ECC performance (today, weekly, by zone, by FE)
- Outlet coverage and visit data
- Generating text-based reports (attendance, productivity, zone-wise)
- Explaining trends and giving operational recommendations

## GUIDELINES
- Be concise and data-driven. Lead with the numbers.
- Format answers with **bold** for key metrics.
- Use bullet lists for breakdowns.
- If data shows 0 or unknown, say so honestly and suggest the admin check if FEs have checked in.
- When generating reports, use a clean structured format with sections.
- You are an operations assistant — stay focused on field force metrics and Kinematic data.
- Do not make up data. If something is unknown say "No data available for this".`;
  };

  /* ── Send message ── */
  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');

    const userMsg: Message = { role:'user', content:q, timestamp:new Date() };
    const loadingMsg: Message = { role:'assistant', content:'', loading:true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    // Build conversation history (exclude loading messages)
    const history = [...messages, userMsg]
      .filter(m => !m.loading)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystem(),
          messages: history,
        }),
      });

      const data = await res.json();
      const reply = data?.content?.[0]?.text || 'Sorry, I could not get a response. Please try again.';

      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { role:'assistant', content:reply, timestamp:new Date() } : m
      ));
    } catch(e:any) {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { role:'assistant', content:`Error: ${e.message || 'Something went wrong'}`, timestamp:new Date() } : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => setMessages([]);

  const inp: React.CSSProperties = {
    width:'100%', padding:'10px 14px', borderRadius:12,
    border:`1.5px solid ${C.border}`, background:C.s3,
    color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any, resize:'none',
    lineHeight:'1.5',
  };

  return (
    <>
      <style>{`
        @keyframes km-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes kspin     { to{transform:rotate(360deg)} }
        @keyframes km-pulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes km-blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        .msg-enter { animation: km-fadein .25s ease both; }
        textarea:focus { border-color: ${C.red} !important; }
        .quick-chip:hover { background: ${C.redD} !important; border-color: ${C.red} !important; color: ${C.white} !important; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 100px)', gap:0, animation:'km-fadein .3s ease' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:12, background:C.red, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, boxShadow:`0 4px 16px ${C.redB}` }}>
                ✦
              </div>
              Kinematic AI
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3, marginLeft:46 }}>
              Ask anything about your field operations — live data, reports, trends
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Live data status */}
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
              background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, fontSize:11 }}>
              {dataLoading ? (
                <div style={{ width:7, height:7, borderRadius:'50%', background:C.yellow, animation:'km-pulse 1s infinite' }}/>
              ) : (
                <div style={{ width:7, height:7, borderRadius:'50%', background:C.green }}/>
              )}
              <span style={{ color:C.gray }}>{dataLoading ? 'Fetching live data…' : 'Live data ready'}</span>
            </div>
            <button onClick={() => { fetchContext(); }}
              style={{ padding:'7px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ↺ Refresh
            </button>
            {messages.length > 0 && (
              <button onClick={clearChat}
                style={{ padding:'7px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10,
                  color:C.gray, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', background:C.s2,
          border:`1px solid ${C.border}`, borderRadius:18, minHeight:0 }}>

          <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 8px' }}>

            {/* Empty state */}
            {messages.length === 0 && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                height:'100%', gap:28, paddingBottom:20 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ width:64, height:64, borderRadius:20, background:C.redD,
                    border:`1px solid ${C.redB}`, display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:28, margin:'0 auto 16px' }}>✦</div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:C.white, marginBottom:6 }}>
                    How can I help?
                  </div>
                  <div style={{ fontSize:13, color:C.gray, maxWidth:360, lineHeight:1.6 }}>
                    I have live access to your field operations data — attendance, CC/ECC, outlets, FE locations and more.
                  </div>
                </div>

                {/* Live snapshot */}
                {!dataLoading && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, width:'100%', maxWidth:500 }}>
                    {[
                      { label:'Present Today',  value: liveData.attendance?.summary?.present ?? '—',  color:C.green  },
                      { label:'CC Today',       value: liveData.summary?.total_engagements ?? '—',    color:C.blue   },
                      { label:'ECC Today',      value: liveData.summary?.total_conversions ?? '—',    color:C.yellow },
                    ].map((s,i) => (
                      <div key={i} style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:10, color:C.gray, marginTop:3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick actions */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:560 }}>
                  {QUICK.map((q,i) => (
                    <button key={i} className="quick-chip" onClick={() => send(q.q)}
                      style={{ padding:'7px 14px', borderRadius:20,
                        border:`1px solid ${C.border}`, background:C.s3,
                        color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer',
                        fontFamily:"'DM Sans',sans-serif", transition:'all .15s' }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} className="msg-enter"
                style={{ display:'flex', gap:10, marginBottom:16,
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  alignItems:'flex-start' }}>

                {/* Avatar */}
                <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex',
                  alignItems:'center', justifyContent:'center', fontSize:14,
                  background: m.role === 'user' ? C.redD : C.s3,
                  border: `1px solid ${m.role === 'user' ? C.redB : C.border}` }}>
                  {m.role === 'user' ? '👤' : '✦'}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth:'75%',
                  background: m.role === 'user' ? C.redD : C.s3,
                  border: `1px solid ${m.role === 'user' ? C.redB : C.border}`,
                  borderRadius: m.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  padding:'11px 14px',
                  fontSize:13, color:C.white, lineHeight:1.6,
                }}>
                  {m.loading ? (
                    <div style={{ display:'flex', gap:4, alignItems:'center', padding:'2px 0' }}>
                      {[0,1,2].map(j => (
                        <div key={j} style={{ width:6, height:6, borderRadius:'50%', background:C.gray,
                          animation:`km-pulse 1.2s ${j*0.2}s infinite` }}/>
                      ))}
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}/>
                  )}
                  {m.timestamp && !m.loading && (
                    <div style={{ fontSize:10, color:C.grayd, marginTop:5 }}>
                      {m.timestamp.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* ── Quick chips (shown while chatting) ── */}
          {messages.length > 0 && messages.length < 6 && (
            <div style={{ padding:'0 20px 10px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
              {QUICK.slice(0, 4).map((q,i) => (
                <button key={i} className="quick-chip" onClick={() => send(q.q)}
                  style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${C.border}`,
                    background:C.s4, color:C.grayd, fontSize:11, fontWeight:600, cursor:'pointer',
                    fontFamily:"'DM Sans',sans-serif", transition:'all .15s' }}>
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Input area ── */}
          <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <textarea
                ref={inputRef}
                rows={1}
                placeholder="Ask about attendance, CC/ECC, outlets, FE performance…"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKey}
                style={{ ...inp, flex:1, maxHeight:120, overflow:'auto' }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                style={{ width:42, height:42, borderRadius:12, border:'none', flexShrink:0,
                  background: !input.trim() || loading ? C.s3 : C.red,
                  cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:18, transition:'all .15s',
                  boxShadow: !input.trim() || loading ? 'none' : `0 4px 14px ${C.redB}` }}>
                {loading ? (
                  <div style={{ width:16, height:16, border:`2px solid ${C.border}`, borderTopColor:C.blue,
                    borderRadius:'50%', animation:'kspin .65s linear infinite' }}/>
                ) : '↑'}
              </button>
            </div>
            <div style={{ fontSize:10, color:C.grayd, marginTop:6, textAlign:'center' }}>
              Press Enter to send · Shift+Enter for new line · Data refreshes on page load
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
