'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isSessionValid, clearSession, getRoleLabel } from '@/lib/auth';
import api from '@/lib/api';
import { ClientProvider, useClient } from '@/context/ClientContext';
import ClientSelect from '@/components/ClientSelect';
function GlobalClientFilter({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const { selectedClientId, setSelectedClientId } = useClient();
  if (!isPlatformAdmin) return null;
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <ClientSelect
        value={selectedClientId}
        onChange={(id) => setSelectedClientId(id)}
        placeholder="Filter by Client..."
      />
    </div>
  );
}

const C = {
  bg: 'var(--bg)', 
  side: 'var(--s1)', 
  border: 'var(--border)', 
  borderL: 'var(--border-l)',
  white: 'var(--text)', 
  gray: 'var(--text-dim)', 
  grayd: 'var(--text-dim)',
  red: 'var(--primary)', 
  redD: 'rgba(224,30,44,0.12)', 
  redB: 'rgba(224,30,44,0.2)',
  s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  green: 'var(--green)', blue: 'var(--accent)',
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

const CORE_NAV = [
  { href: '/dashboard',                     label: 'Dashboard',     icon: 'M3 9l9-7 9 7v17-STABLEa2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/dashboard/analytics',           label: 'Analytics',     icon: 'M18 20V10 M12 20V4 M6 20v-6' },
  { href: '/dashboard/live-tracking',      label: 'Live Tracking',  icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z' },
  { href: '/dashboard/broadcast',          label: 'Broadcast',      icon: 'M18 8a6 6 0 010 8M14 11.73A2 2 0 1112 15a2 2 0 002-3.27z M21.64 4.36a12 12 0 010 15.27' },
];

const OPS_NAV = [
  { href: '/dashboard/attendance-overview', label: 'Attendance',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/dashboard/route-plan',          label: 'Route Plan',    icon: 'M9 20l-5.44-2.72A2 2 0 013 15.49V4.5a2 2 0 012.89-1.8L9 4 M9 20l6-3 M9 4v16 M15 1l5.44 2.72A2 2 0 0121 5.51v10.98a2 2 0 01-2.89 1.8L15 17 M15 1v16' },
  { href: '/dashboard/work-activities',     label: 'Work Activities', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4' },
];

const MGT_NAV = [
  { href: '/dashboard/manpower-directory', label: 'Manpower',       icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
  { href: '/dashboard/hr',                 label: 'HR',              icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0z M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { href: '/dashboard/visit-logs',         label: 'Visit Logs',      icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z' },
  { href: '/dashboard/warehouse',          label: 'Warehouse',       icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8' },
  { href: '/dashboard/grievances',         label: 'Grievances',     icon: 'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { href: '/dashboard/form-builder',       label: 'Form Builder',    icon: 'M11 5H6a2 2 0 00-2 2v17-STABLEa2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 113.003 3.003L12 16l-4 1 1-4 9.586-9.586z' },
];

const SYS_NAV = [
  { href: '/dashboard/notifications',      label: 'Notifications',  icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0' },
  { href: '/dashboard/settings',           label: 'Settings',       icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
];

const OTHER_NAV = [

  { href: '/dashboard/other-management/cities',     label: 'City Management',     icon: 'M3 9l9-7 9 7v17-STABLEa2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/dashboard/other-management/zones',      label: 'Zone Management',     icon: 'M1 6l10.5 7L22 6M1 6v12a2 2 0 002 2h18a2 2 0 002-2V6 M1 6l10.5-4L22 6' },
  { href: '/dashboard/other-management/stores',     label: 'Outlet Management',   icon: 'M3 3h18v4H3z M5 7v13h14V7 M9 7v13 M15 7v13' },
  { href: '/dashboard/other-management/skus',       label: "SKU's Management",    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
  { href: '/dashboard/other-management/activities', label: 'Activity Management', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4' },
  { href: '/dashboard/other-management/assets',     label: 'Asset Management',    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8 M10 12h4' },
];

/* ══ KINEMATIC AI OVERLAY ══ */
interface ChatMsg { role:'user'|'assistant'; content:string; loading?:boolean; ts?:Date; }

const QUICK = [
  'How many FEs are present today?',
  "Today's attendance summary",
  'Total active outlets',
  "Today's TFF numbers",
  "This week's performance",
  'Generate attendance report for today',
  'Top performers this week',
  'Zone-wise activity breakdown',
];

function md(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`(.*?)`/g,'<code style="background:#131B2A;padding:1px 6px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>')
    .replace(/^### (.*)/gm,'<div style="font-family:\'Syne\',sans-serif;font-size:13px;font-weight:800;color:#E8EDF8;margin:10px 0 3px">$1</div>')
    .replace(/^## (.*)/gm, '<div style="font-family:\'Syne\',sans-serif;font-size:14px;font-weight:800;color:#E8EDF8;margin:12px 0 4px">$1</div>')
    .replace(/^- (.*)/gm,  '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:#E01E2C">•</span><span>$1</span></div>')
    .replace(/\n/g,'<br/>');
}

function KinematicAI({ token }: { token: string }) {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<ChatMsg[]>([]);
  const [input,   setInput]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [live,    setLive]    = useState<Record<string,any>>({});
  const [ready,   setReady]   = useState(false);
  const endRef  = useRef<HTMLDivElement>(null);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const headers = { Authorization:`Bearer ${token}` };

  const fetchLive = useCallback(async () => {
    setReady(false);
    try {
      const hdrs = { Authorization:`Bearer ${token}` };
      const today = new Date().toISOString().split('T')[0];
      const [a,l,w,s] = await Promise.allSettled([
        api.get<any>('/api/v1/analytics/attendance-today',{headers:hdrs}),
        api.get<any>('/api/v1/analytics/live-locations',  {headers:hdrs}),
        api.get<any>('/api/v1/analytics/weekly-contacts', {headers:hdrs}),
        api.get<any>(`/api/v1/analytics/summary?date=${today}`,{headers:hdrs}),
      ]);
      const ctx: Record<string,any> = {};
      if(a.status==='fulfilled') ctx.att  = a.value?.data??a.value;
      if(l.status==='fulfilled') ctx.locs = l.value?.data??l.value;
      if(w.status==='fulfilled') ctx.week = w.value?.data??w.value;
      if(s.status==='fulfilled') ctx.summ = s.value?.data??s.value;
      setLive(ctx);
    } catch{}
    setReady(true);
  },[token]);

  useEffect(()=>{ if(open&&!ready) fetchLive(); },[open, ready, fetchLive]);
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);
  useEffect(()=>{ if(open) setTimeout(()=>taRef.current?.focus(),120); },[open]);

  const sys = () => {
    const today = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const att  = live.att?.summary||{};
    const locs = live.locs?.locations||[];
    const week = live.week||{};
    const summ = live.summ||{};
    const fes  = locs.filter((l:any)=>l.status==='active');
    return `You are Kinematic AI — operations assistant for Kinematic field force platform by Horizonn Tech Studio.\nToday: ${today}\n\n## LIVE DATA\n### Attendance\n- Total FEs: ${att.total??'unknown'}\n- Present: ${att.present??'unknown'}\n- On Break: ${att.on_break??'unknown'}\n- Checked Out: ${att.checked_out??'unknown'}\n- Absent: ${att.absent??'unknown'}\n\n### Active FEs Now\n${fes.length>0?fes.map((f:any)=>`- ${f.name} · ${f.zone_name||'—'} · ${f.status}`).join('\n'):'- None active'}\n\n### Today Performance\n- TFF: ${summ.total_tff??0}\n\n### This Week\n- TFF: ${week.total_tff??0}\n- ${(week.days||[]).map((d:any)=>`${d.short_label}: TFF=${d.tff}`).join(', ')||'No data'}\n\nBe concise, data-driven, use **bold** for numbers. Generate structured reports when asked. Don't make up data.`;
  };

  const send = async (text?: string) => {
    const q=(text||input).trim(); if(!q||busy) return;
    setInput(''); if(taRef.current) taRef.current.style.height='auto';
    const um:ChatMsg={role:'user',content:q,ts:new Date()};
    const lm:ChatMsg={role:'assistant',content:'',loading:true};
    setMsgs(p=>[...p,um,lm]); setBusy(true);
    const hist=[...msgs,um].filter(m=>!m.loading).map(m=>({role:m.role,content:m.content}));
    try {
      const r=await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/chat`,{
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body:JSON.stringify({messages:hist, system:sys()}),
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d?.error||d?.message||`Server error ${r.status}`);
      const reply=d?.data?.text||'Sorry, could not respond.';
      setMsgs(p=>p.map((m,i)=>i===p.length-1?{role:'assistant',content:reply,ts:new Date()}:m));
    } catch(e:any){
      setMsgs(p=>p.map((m,i)=>i===p.length-1?{role:'assistant',content:`Error: ${e.message}`,ts:new Date()}:m));
    } finally{setBusy(false);}
  };

  const onKey=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
  };

  const taStyle:React.CSSProperties={
    flex:1, padding:'8px 11px', borderRadius:10,
    border:`1.5px solid ${C.border}`, background:C.s4,
    color:C.white, fontSize:12, fontFamily:"'DM Sans',sans-serif",
    outline:'none', resize:'none', lineHeight:'1.5',
    colorScheme:'dark' as any, maxHeight:90, overflow:'auto',
  };

  return (
    <>
      {/* FAB */}
      <button onClick={()=>setOpen(o=>!o)} title="Kinematic AI"
        style={{
          position:'fixed', bottom:24, right:24, zIndex:999,
          width:50,height:50,borderRadius:'50%',
          background:open?C.s3:C.red,
          border:`1px solid ${open?C.border:'transparent'}`,
          color:'#fff', fontSize:20, cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:open?'none':`0 4px 22px rgba(224,30,44,.45)`,
          transition:'all .2s',
        }}>
        {open?'✕':'✦'}
      </button>

      {/* Panel */}
      {open&&(
        <div style={{
          position:'fixed', bottom:86, right:24, zIndex:998,
          width:380, height:560,
          background:C.s2, border:`1px solid ${C.border}`,
          borderRadius:18, display:'flex', flexDirection:'column',
          boxShadow:'0 20px 70px rgba(0,0,0,.75)',
          animation:'kai-in .2s cubic-bezier(.22,1,.36,1)',
          overflow:'hidden',
        }}>
          {/* Header */}
          <div style={{padding:'13px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:9,flexShrink:0}}>
            <div style={{width:30,height:30,borderRadius:9,background:C.red,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>✦</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:800,color:C.white}}>Kinematic AI</div>
              <div style={{fontSize:10,color:C.grayd,display:'flex',alignItems:'center',gap:4,marginTop:1}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:ready?C.green:C.gray,animation:ready?'none':'kai-pulse 1s infinite'}}/>
                {ready?'Live data ready':'Fetching live data…'}
              </div>
            </div>
            <div style={{display:'flex',gap:5}}>
              {msgs.length>0&&<button onClick={()=>setMsgs([])} style={{padding:'3px 8px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.grayd,fontSize:10,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Clear</button>}
              <button onClick={fetchLive} style={{padding:'3px 8px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.grayd,fontSize:10,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>↺</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:'12px 12px 6px'}}>
            {msgs.length===0&&(
              <div style={{display:'flex',flexDirection:'column',gap:12,height:'100%'}}>
                <div style={{textAlign:'center',paddingTop:8}}>
                  <div style={{fontSize:11,color:C.gray,lineHeight:1.6}}>Ask me about your field operations</div>
                  {ready&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}>
                      {[
                        {l:'Present',  v:live.att?.summary?.present??'—',  c:C.green},
                        {l:'TFF Today',v:live.summ?.total_tff??'—', c:'#FFB800'},
                      ].map((s,i)=>(
                        <div key={i} style={{background:C.s3,borderRadius:9,padding:'7px 5px',textAlign:'center'}}>
                          <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:9,color:C.grayd,marginTop:1}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {QUICK.map((q,i)=>(
                    <button key={i} onClick={()=>send(q)} style={{padding:'4px 10px',borderRadius:20,cursor:'pointer',border:`1px solid ${C.border}`,background:C.s3,color:C.gray,fontSize:11,fontFamily:"'DM Sans',sans-serif",transition:'all .15s'}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.color=C.white;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m,i)=>(
              <div key={i} style={{display:'flex',gap:7,marginBottom:10,flexDirection:m.role==='user'?'row-reverse':'row',alignItems:'flex-start',animation:'kai-msg .2s ease'}}>
                <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,background:m.role==='user'?C.redD:C.s3,border:`1px solid ${m.role==='user'?C.redB:C.border}`}}>
                  {m.role==='user'?'👤':'✦'}
                </div>
                <div style={{maxWidth:'82%',background:m.role==='user'?C.redD:C.s3,border:`1px solid ${m.role==='user'?C.redB:C.border}`,borderRadius:m.role==='user'?'12px 3px 12px 12px':'3px 12px 12px 12px',padding:'8px 11px',fontSize:12,color:C.white,lineHeight:1.6}}>
                  {m.loading?(
                    <div style={{display:'flex',gap:3,padding:'2px 0'}}>
                      {[0,1,2].map(j=><div key={j} style={{width:5,height:5,borderRadius:'50%',background:C.gray,animation:`kai-pulse 1.2s ${j*.2}s infinite`}}/>)}
                    </div>
                  ):(
                    <div dangerouslySetInnerHTML={{__html:md(m.content)}}/>
                  )}
                  {m.ts&&!m.loading&&<div style={{fontSize:9,color:C.grayd,marginTop:3}}>{m.ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>}
                </div>
              </div>
            ))}
            <div ref={endRef}/>
          </div>

          {/* Input */}
          <div style={{padding:'9px 11px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:'flex',gap:7,alignItems:'flex-end'}}>
              <textarea ref={taRef} rows={1} placeholder="Ask about attendance, TFF, outlets…" value={input}
                onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,90)+'px';}}
                onKeyDown={onKey} style={taStyle}/>
              <button onClick={()=>send()} disabled={!input.trim()||busy} style={{width:34,height:34,borderRadius:9,border:'none',flexShrink:0,background:!input.trim()||busy?C.s3:C.red,color:'#fff',cursor:!input.trim()||busy?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,transition:'all .15s'}}>
                {busy?<div style={{width:13,height:13,border:`2px solid ${C.border}`,borderTopColor:C.blue,borderRadius:'50%',animation:'kspin .65s linear infinite'}}/>:'↑'}
              </button>
            </div>
            <div style={{fontSize:9,color:C.grayd,marginTop:4,textAlign:'center'}}>Enter to send · Shift+Enter new line</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes kai-in    {from{opacity:0;transform:scale(.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes kai-msg   {from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)}}
        @keyframes kai-pulse {0%,100%{opacity:1} 50%{opacity:.2}}
        @keyframes kspin     {to{transform:rotate(360deg)}}
      `}</style>
    </>
  );
}

/* ══ LAYOUT ══ */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [userName, setUserName]   = useState('');
  const [userRole, setUserRole]   = useState('');
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [token,    setToken]      = useState('');
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    setUserName(u.name || u.email || 'Admin');
    setUserRole(u.role || '');
    setUserPerms(u.permissions || []);
    
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('kinematic-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);
      const t = localStorage.getItem('kinematic_token') || '';
      setToken(t);

      // Forever Fix: Re-fetch profile to sync permissions (handle stale sessions)
      if (t) {
        api.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${t}` } })
          .then((res: any) => {
            const fresh = res.data?.data || res.data;
            if (fresh && fresh.id) {
              const updatedUser = { ...u, ...fresh };
              setUserPerms(updatedUser.permissions || []);
              localStorage.setItem('kinematic_user', JSON.stringify(updatedUser));
            }
          })
          .catch(e => console.error('Profile sync failed:', e));
      }
    }
    if (pathname.startsWith('/dashboard/other-management')) setOtherOpen(true);
  }, [pathname, router]);

  const handleLogout = () => { clearSession(); router.push('/login'); };
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  const sideW = collapsed ? 64 : 220;

  // RBAC Filter
  const filterNav = (items: any[]) => {
    const isAdmin = ['super_admin', 'admin', 'main_admin'].includes(userRole);
    if (isAdmin) return items;
    
    // For Clients, they only see modules explicitly assigned to them + the dashboard
    if (userRole === 'client') {
      return items.filter(item => {
        if (!item.module) return item.label === 'Dashboard'; 
        return userPerms.includes(item.module);
      });
    }

    return items.filter(item => {
      if (!item.module) return true;
      return userPerms.includes(item.module);
    });
  };

  const visibleCore = filterNav([
    { href: '/dashboard',                     label: 'Dashboard',     icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
    { href: '/dashboard/analytics',           label: 'Analytics',     icon: 'M18 20V10 M12 20V4 M6 20v-6', module: 'analytics' },
    { href: '/dashboard/live-tracking',      label: 'Live Tracking',  icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z', module: 'live_tracking' },
    { href: '/dashboard/broadcast',          label: 'Broadcast',      icon: 'M18 8a6 6 0 010 8M14 11.73A2 2 0 1112 15a2 2 0 002-3.27z M21.64 4.36a12 12 0 010 15.27', module: 'broadcast' },
  ]);

  const visibleOps = filterNav([
    { href: '/dashboard/attendance-overview', label: 'Attendance',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', module: 'attendance' },
    { href: '/dashboard/route-plan',          label: 'Route Plan',    icon: 'M9 20l-5.44-2.72A2 2 0 013 15.49V4.5a2 2 0 012.89-1.8L9 4 M9 20l6-3 M9 4v16 M15 1l5.44 2.72A2 2 0 0121 5.51v10.98a2 2 0 01-2.89 1.8L15 17 M15 1v16', module: 'orders' },
    { href: '/dashboard/work-activities',     label: 'Work Activities', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4', module: 'work_activities' },
  ]);

  const visibleMgt = filterNav([
    { href: '/dashboard/manpower-directory', label: 'Manpower',       icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75', module: 'users' },
    { href: '/dashboard/hr',                 label: 'HR',              icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0z M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', module: 'hr' },
    { href: '/dashboard/visit-logs',         label: 'Visit Logs',      icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z', module: 'visit_logs' },
    { href: '/dashboard/clients',            label: 'Clients',         icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', module: 'clients' },
    { href: '/dashboard/warehouse',          label: 'Warehouse',       icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8', module: 'inventory' },
    { href: '/dashboard/grievances',         label: 'Grievances',     icon: 'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', module: 'grievances' },
    { href: '/dashboard/form-builder',       label: 'Form Builder',    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 113.003 3.003L12 16l-4 1 1-4 9.586-9.586z', module: 'form_builder' },
  ]);

  const visibleSys = filterNav([
    { href: '/dashboard/notifications',      label: 'Notifications',  icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0' },
    { href: '/dashboard/settings',           label: 'Settings',       icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z', module: 'settings' },
  ]);

  const visibleOther = filterNav([
    { href: '/dashboard/other-management/cities',     label: 'City Management',     icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10', module: 'cities' },
    { href: '/dashboard/other-management/zones',      label: 'Zone Management',     icon: 'M1 6l10.5 7L22 6M1 6v12a2 2 0 002 2h18a2 2 0 002-2V6 M1 6l10.5-4L22 6', module: 'zones' },
    { href: '/dashboard/other-management/stores',     label: 'Outlet Management',   icon: 'M3 3h18v4H3z M5 7v13h14V7 M9 7v13 M15 7v13', module: 'stores' },
    { href: '/dashboard/other-management/skus',       label: "SKU's Management",    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10', module: 'skus' },
    { href: '/dashboard/other-management/activities', label: 'Activity Management', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4', module: 'activities' },
    { href: '/dashboard/other-management/assets',     label: 'Asset Management',    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8 M10 12h4', module: 'assets' },
  ]);

  return (
    <ClientProvider>
    <div style={{ display:'flex', minHeight:'100vh', background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>

      {/* Sidebar */}
      <aside style={{ 
        width:sideW, flexShrink:0, 
        background:C.side, 
        backdropFilter:'blur(20px)',
        WebkitBackdropFilter:'blur(20px)',
        borderRight:`1px solid ${C.border}`, 
        display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:100, 
        transition:'width .2s cubic-bezier(.4,0,.2,1)', overflow:'hidden' 
      }}>
        {/* Logo */}
        <div style={{ height:68, display:'flex', alignItems:'center', padding:collapsed?'0 16px':'0 24px', gap:12, flexShrink:0, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ width:36, height:36, borderRadius:10, background:C.red, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:`0 4px 12px ${C.redB}` }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#fff' }}>K</span>
          </div>
          {!collapsed && <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:C.white, whiteSpace:'nowrap', letterSpacing:'-0.5px' }}>Kinematic</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'10px 0' }}>
          {/* Core */}
          {visibleCore.length > 0 && !collapsed && <div style={{ padding:'0 16px', marginTop:14, marginBottom:6, fontSize:10, fontWeight:800, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>Core</div>}
          {visibleCore.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', margin:'1px 8px', borderRadius:9, background:active?C.redD:'transparent', color:active?C.red:C.gray, fontSize:13, fontWeight:active?700:500, whiteSpace:'nowrap', overflow:'hidden', transition:'background .14s, color .14s', cursor:'pointer' }}>
                  <Icon d={item.icon} size={17}/>
                  {!collapsed && <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                  {active && !collapsed && <div style={{ marginLeft:'auto', width:5, height:5, borderRadius:'50%', background:C.red, flexShrink:0 }}/>}
                </div>
              </Link>
            );
          })}

          {/* Operations */}
          {visibleOps.length > 0 && !collapsed && <div style={{ padding:'0 16px', marginTop:18, marginBottom:6, fontSize:10, fontWeight:800, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>Operations</div>}
          {visibleOps.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', margin:'1px 8px', borderRadius:9, background:active?C.redD:'transparent', color:active?C.red:C.gray, fontSize:13, fontWeight:active?700:500, whiteSpace:'nowrap', overflow:'hidden', transition:'background .14s, color .14s', cursor:'pointer' }}>
                  <Icon d={item.icon} size={17}/>
                  {!collapsed && <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                  {active && !collapsed && <div style={{ marginLeft:'auto', width:5, height:5, borderRadius:'50%', background:C.red, flexShrink:0 }}/>}
                </div>
              </Link>
            );
          })}

          {/* Management */}
          {visibleMgt.length > 0 && !collapsed && <div style={{ padding:'0 16px', marginTop:18, marginBottom:6, fontSize:10, fontWeight:800, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>Management</div>}
          {visibleMgt.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', margin:'1px 8px', borderRadius:9, background:active?C.redD:'transparent', color:active?C.red:C.gray, fontSize:13, fontWeight:active?700:500, whiteSpace:'nowrap', overflow:'hidden', transition:'background .14s, color .14s', cursor:'pointer' }}>
                  <Icon d={item.icon} size={17}/>
                  {!collapsed && <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                  {active && !collapsed && <div style={{ marginLeft:'auto', width:5, height:5, borderRadius:'50%', background:C.red, flexShrink:0 }}/>}
                </div>
              </Link>
            );
          })}

          {/* Other Management */}
          {visibleOther.length > 0 && !collapsed && (
            <>
              <div onClick={()=>setOtherOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', margin:'18px 8px 1px', borderRadius:9, color:C.grayd, fontSize:10, fontWeight:800, letterSpacing:'0.8px', textTransform:'uppercase', cursor:'pointer', userSelect:'none' }}>
                <Icon d="M4 6h16M4 12h16M4 18h16" size={14}/>
                <span>Resources</span>
                <svg style={{ marginLeft:'auto', transform:otherOpen?'rotate(180deg)':'none', transition:'transform .2s' }} width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {otherOpen && visibleOther.map(item => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px 9px 28px', margin:'1px 8px', borderRadius:9, background:active?C.redD:'transparent', color:active?C.red:C.gray, fontSize:12, fontWeight:active?700:500, whiteSpace:'nowrap', overflow:'hidden', transition:'background .14s, color .14s', cursor:'pointer' }}>
                      <Icon d={item.icon} size={15}/>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </>
          )}

          {/* System */}
          {!collapsed && visibleSys.length > 0 && <div style={{ padding:'0 16px', marginTop:18, marginBottom:6, fontSize:10, fontWeight:800, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>System</div>}
          {visibleSys.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', margin:'1px 8px', borderRadius:9, background:active?C.redD:'transparent', color:active?C.red:C.gray, fontSize:13, fontWeight:active?700:500, whiteSpace:'nowrap', overflow:'hidden', transition:'background .14s, color .14s', cursor:'pointer' }}>
                  <Icon d={item.icon} size={17}/>
                  {!collapsed && <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                  {active && !collapsed && <div style={{ marginLeft:'auto', width:5, height:5, borderRadius:'50%', background:C.red, flexShrink:0 }}/>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div style={{ borderTop:`1px solid ${C.border}`, padding:collapsed?'12px 10px':'12px 14px', flexShrink:0 }}>
          {!collapsed && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName}</div>
              <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{getRoleLabel(userRole)}</div>
            </div>
          )}
          <button onClick={handleLogout} style={{ width:'100%', display:'flex', alignItems:'center', gap:collapsed?0:8, justifyContent:collapsed?'center':'flex-start', padding:'8px 10px', borderRadius:9, background:'transparent', border:`1px solid ${C.border}`, color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'background .14s' }}>
            <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={15}/>
            {!collapsed && 'Sign Out'}
          </button>
        </div>

        {/* Collapse btn */}
        <button onClick={()=>setCollapsed(c=>!c)} style={{ position:'absolute', bottom:110, right:-12, width:24, height:24, borderRadius:'50%', background:C.side, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, zIndex:10 }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ transform:collapsed?'rotate(180deg)':'none', transition:'transform .2s' }}>
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </aside>

      {/* Main */}
      <main style={{ marginLeft:sideW, flex:1, minHeight:'100vh', padding:0, transition:'margin-left .2s cubic-bezier(.4,0,.2,1)', display:'flex', flexDirection:'column' }}>
        {/* Page Header with Global Filter */}
        <header style={{ height:68, background:C.s1, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', flexShrink:0, position:'sticky', top:0, zIndex:90, backdropFilter:'blur(10px)' }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.white, letterSpacing:'-0.2px' }}>
            {pathname.split('/').pop()?.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || 'Dashboard'}
          </div>
          <GlobalClientFilter isPlatformAdmin={['super_admin', 'admin', 'main_admin', 'platform_admin'].includes(userRole)} />
        </header>

        <div style={{ padding:'24px 32px', flex:1 }}>
          {children}
        </div>
        <div className="mt-8 pt-4 border-t border-white/10 text-[10px] text-white/30 text-center">
          System Identity Registry: v8-AMBIG-FIX | API: {process.env.NEXT_PUBLIC_API_URL || 'PRODUCTION'}
        </div>
      </main>

      {/* Kinematic AI — floats over every page */}
      {token && <KinematicAI token={token}/>}
    </div>
    </ClientProvider>
  );
}
