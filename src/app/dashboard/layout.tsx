'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isSessionValid, clearSession, getRoleLabel } from '../../lib/auth';
import api from '../../lib/api';
import { ClientProvider, useClient } from '../../context/ClientContext';
import ClientSelect from '../../components/ClientSelect';

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
  const [msgs,    setMsgs]    = useState<any[]>([]);
  const [input,   setInput]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [live,    setLive]    = useState<Record<string,any>>({});
  const [ready,   setReady]   = useState(false);
  const endRef  = useRef<HTMLDivElement>(null);
  const taRef   = useRef<HTMLTextAreaElement>(null);

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
    setInput('');
    const um={role:'user',content:q,ts:new Date()};
    const lm={role:'assistant',content:'',loading:true};
    setMsgs(p=>[...p,um,lm]); setBusy(true);
    try {
      const r=await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/chat`,{
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body:JSON.stringify({messages:[um], system:sys()}),
      });
      const d=await r.json();
      const reply=d?.data?.text||'Sorry, could not respond.';
      setMsgs(p=>p.map((m,i)=>i===p.length-1?{role:'assistant',content:reply,ts:new Date()}:m));
    } catch(e:any){
      setMsgs(p=>p.map((m,i)=>i===p.length-1?{role:'assistant',content:`Error: ${e.message}`,ts:new Date()}:m));
    } finally{setBusy(false);}
  };

  return (
    <>
      <button onClick={()=>setOpen(o=>!o)} title="Kinematic AI" style={{ position:'fixed', bottom:24, right:24, zIndex:1000, width:50, height:50, borderRadius:'50%', background:open?C.s3:C.red, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 22px rgba(224,30,44,.45)', cursor:'pointer' }}>{open?'✕':'✦'}</button>
      {open&&(
        <div style={{ position:'fixed', bottom:86, right:24, zIndex:999, width:380, height:560, background:C.s2, border:`1px solid ${C.border}`, borderRadius:18, display:'flex', flexDirection:'column', boxShadow:'0 20px 70px rgba(0,0,0,.75)', overflow:'hidden' }}>
          <div style={{padding:'13px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
             <div style={{fontWeight:800, color:C.white, fontSize:13}}>Kinematic AI</div>
             <button onClick={()=>setMsgs([])} style={{background:'transparent', border:'none', color:C.grayd, fontSize:10, cursor:'pointer'}}>Clear</button>
          </div>
          <div style={{flex:1, overflowY:'auto', padding:'15px'}}>
            {msgs.length === 0 && <div style={{color:C.grayd, textAlign:'center', marginTop:100}}>How can I help you today?</div>}
            {msgs.map((m,i)=>(
              <div key={i} style={{marginBottom:15, textAlign:m.role==='user'?'right':'left'}}>
                <div style={{display:'inline-block', background:m.role==='user'?C.redD:C.s3, padding:'8px 12px', borderRadius:12, fontSize:12, color:C.white, maxWidth:'80%'}} dangerouslySetInnerHTML={{__html:md(m.content||'...')}} />
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div style={{padding:'10px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} style={{flex:1, background:C.s1, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px', color:C.white}} placeholder="Type your message..." />
            <button onClick={()=>send()} style={{background:C.red, border:'none', borderRadius:8, padding:'0 15px', color:'white'}}>Go</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [token, setToken] = useState('');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    setUser(u);
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('kinematic_token') || '');
    }
  }, [router]);

  const handleLogout = () => { clearSession(); router.push('/login'); };
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  const sideW = collapsed ? 64 : 220;

  const userRole = user?.role || '';
  const userPerms = user?.permissions || [];

  const filterNav = (items: any[]) => {
    if (['super_admin', 'admin', 'main_admin'].includes(userRole)) return items;
    return items.filter(i => !i.module || userPerms.includes(i.module));
  };

  const navGroups = [
    { label: 'Core', items: filterNav([
      { href: '/dashboard', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
      { href: '/dashboard/analytics', label: 'Analytics', icon: 'M18 20V10 M12 20V4 M6 20v-6', module: 'analytics' },
      { href: '/dashboard/live-tracking', label: 'Live Tracking', icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z', module: 'live_tracking' },
      { href: '/dashboard/broadcast', label: 'Broadcast', icon: 'M12 19V5 M5 12l7-7 7 7', module: 'broadcast' },
    ])},
    { label: 'Operations', items: filterNav([
      { href: '/dashboard/attendance-overview', label: 'Attendance', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', module: 'attendance' },
      { href: '/dashboard/route-plan', label: 'Route Plan', icon: 'M9 20l-5.44-2.72A2 2 0 013 15.49V4.5a2 2 0 012.89-1.8L9 4 M9 20l6-3 M9 4v16 M15 1l5.44 2.72A2 2 0 0121 5.51v10.98a2 2 0 01-2.89 1.8L15 17 M15 1v16', module: 'orders' },
      { href: '/dashboard/work-activities', label: 'Work Activities', icon: 'M12 2v20 M2 12h20 M5 5l14 14 M19 5L5 14', module: 'work_activities' },
      { href: '/dashboard/visits', label: 'Visit Logs', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', module: 'visit_logs' },
    ])},
    { label: 'People & Support', items: filterNav([
      { href: '/dashboard/users', label: 'Manpower', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75', module: 'users' },
      { href: '/dashboard/grievances', label: 'Grievances', icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01', module: 'grievances' },
    ])},
    { label: 'Business', items: filterNav([
      { href: '/dashboard/clients', label: 'Clients', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z', module: 'clients' },
      { href: '/dashboard/warehouse', label: 'Warehouse', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'inventory' },
    ])},
    { label: 'System Management', items: filterNav([
      { href: '/dashboard/form-builder', label: 'Form Builder', icon: 'M12 5v14 M5 12h14', module: 'form_builder' },
      { href: '/dashboard/security-alerts', label: 'Security Alerts', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', module: 'live_tracking' },
      { href: '/dashboard/cities', label: 'Cities', icon: 'M3 21h18 M3 7v1a3 3 0 006 0V7m6 0v1a3 3 0 006 0V7', module: 'cities' },
      { href: '/dashboard/zones', label: 'Zones', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 10a3 3 0 100-6 3 3 0 000 6z', module: 'zones' },
      { href: '/dashboard/outlets', label: 'Outlets', icon: 'M3 21h18 M9 8h10 M9 12h10 M9 16h10 M3 4h18', module: 'stores' },
      { href: '/dashboard/skus', label: 'SKU Management', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'inventory' },
      { href: '/dashboard/activity-types', label: 'Activities', icon: 'M12 2v20 M2 12h20', module: 'activities' },
      { href: '/dashboard/assets', label: 'Assets', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', module: 'assets' },
    ])},
  ];


  return (
    <ClientProvider>
      <div style={{ display:'flex', minHeight:'100vh', background:C.bg, color:C.white }}>
        <aside style={{ width:sideW, background:C.side, borderRight:`1px solid ${C.border}`, position:'fixed', top:0, left:0, bottom:0, display:'flex', flexDirection:'column', transition:'width .2s' }}>
          <div style={{ height:65, display:'flex', alignItems:'center', padding:'0 20px', borderBottom:`1px solid ${C.border}`, gap:10 }}>
            <div style={{ width:32, height:32, background:C.red, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900 }}>K</div>
            {!collapsed && <span style={{ fontWeight:800, fontSize:18 }}>Kinematic</span>}
          </div>
          
          <nav style={{ flex:1, padding:'15px 0', overflowY:'auto' }}>
            {navGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom:20 }}>
                {!collapsed && <div style={{ padding:'0 20px', fontSize:10, color:C.grayd, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{g.label}</div>}
                {g.items.map((i:any) => (
                  <Link key={i.href} href={i.href}>
                    <div style={{ display:'flex', alignItems:'center', padding:'10px 20px', gap:12, color:isActive(i.href)?C.red:C.gray, background:isActive(i.href)?C.redD:'transparent', cursor:'pointer' }}>
                      <Icon d={i.icon} size={18} />
                      {!collapsed && <span style={{ fontSize:14 }}>{i.label}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div style={{ padding:20, borderTop:`1px solid ${C.border}` }}>
            {!collapsed && <div style={{ marginBottom:10, fontSize:12 }}>{user?.name || 'Admin'}</div>}
            <button onClick={handleLogout} style={{ width:'100%', padding:'10px', background:'transparent', border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, cursor:'pointer' }}>Sign Out</button>
            
            {/* DEFINITIVE DEPLOYMENT BADGE */}
            {user?.email === 'demo@kinematic.com' && (
              <div style={{ marginTop:15, padding:10, background:'rgba(255,59,48,0.1)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:8, textAlign:'center' }}>
                <div style={{ color:C.red, fontSize:9, fontWeight:900 }}>DEMO ACTIVE</div>
                <div style={{ fontSize:8, color:C.grayd }}>Stable Mock Intercept</div>
              </div>
            )}
          </div>
        </aside>

        <main style={{ marginLeft:sideW, flex:1, display:'flex', flexDirection:'column' }}>
          <header style={{ height:65, background:C.s1, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 25px' }}>
            <span style={{ fontWeight:700 }}>{pathname.split('/').pop()?.toUpperCase() || 'DASHBOARD'}</span>
          </header>
          <div style={{ padding:25, flex:1 }}>{children}</div>
          <footer style={{ padding:15, borderTop:`1px solid ${C.border}`, textAlign:'center', fontSize:9, color:C.grayd }}>
            Kinematic Registry: STABLE-ENV | Interception Enabled
          </footer>
        </main>
        {token && <KinematicAI token={token} />}
      </div>
    </ClientProvider>
  );
}
