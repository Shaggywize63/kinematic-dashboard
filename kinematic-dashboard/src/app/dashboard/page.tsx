'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

/* ── palette ─────────────────────────────────────────────── */
const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1', tealD:'rgba(0,201,177,0.08)',
  orange:'#FF7A30',
};

/* ── types ─────────────────────────────────────────────────── */
interface AttSummary { total:number; present:number; on_break:number; checked_out:number; absent:number; regularised:number; }
interface WeekDay { date:string; label:string; short_label:string; cc:number; ecc:number; ecc_rate:number; }
interface FELoc { id:string; name:string; employee_id?:string; zone_name?:string; city?:string; status:'active'|'absent'|'checked_out'; lat:number|null; lng:number|null; address?:string; checkin_at?:string; total_hours?:number; }
interface CityPerf { city:string; zones:number; active_fes:number; checkins:number; cc:number; ecc:number; ecc_rate:number; unique_outlets:number; avg_hours:number; lat:number|null; lng:number|null; }
interface OutletRow { name:string; visits:number; conversions:number; city:string|null; ecc_rate:number; }

/* ── tiny atoms ─────────────────────────────────────────────── */
const Shimmer = ({ w='100%', h=16, br=6 }:{ w?:string|number; h?:number; br?:number }) => (
  <div style={{ width:w, height:h, borderRadius:br, background:C.s3, overflow:'hidden', position:'relative' }}>
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,transparent 0%,${C.border} 50%,transparent 100%)`, animation:'km-shimmer 1.3s ease-in-out infinite' }}/>
  </div>
);

const Dot = ({ color, size=8 }:{ color:string; size?:number }) => (
  <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
    <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:color, opacity:.35, animation:'km-pulse 2s infinite' }}/>
    <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:color }}/>
  </div>
);

const StatCard = ({ label, value, color, sub, loading }:{ label:string; value:string|number; color:string; sub?:string; loading?:boolean }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:'18px 20px' }}>
    {loading ? <Shimmer h={28} br={5} w="55%"/> : (
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color, lineHeight:1 }}>{value}</div>
    )}
    <div style={{ fontSize:11, color:C.gray, marginTop:6, fontWeight:600, letterSpacing:'0.3px' }}>{label}</div>
    {sub && <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{sub}</div>}
  </div>
);

/* ── SVG PIE CHART ────────────────────────────────────────────── */
const PieChart = ({ present, on_break, checked_out, absent, total }:{ present:number; on_break:number; checked_out:number; absent:number; total:number }) => {
  const R = 52, cx = 70, cy = 70, gap = 1.5;
  const segments = [
    { value: present,     color: C.green,  label: 'Active' },
    { value: on_break,    color: C.yellow, label: 'On Break' },
    { value: checked_out, color: C.blue,   label: 'Checked Out' },
    { value: absent,      color: C.grayd,  label: 'Absent' },
  ].filter(s => s.value > 0);

  const totalVal = segments.reduce((s,x) => s+x.value, 0) || 1;
  const arcs: { d:string; color:string; label:string; value:number }[] = [];
  let angle = -Math.PI / 2;
  segments.forEach(seg => {
    const frac = seg.value / totalVal;
    const sweep = frac * 2 * Math.PI - (gap * Math.PI / 180);
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep);
    const y2 = cy + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    arcs.push({ d:`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`, color:seg.color, label:seg.label, value:seg.value });
    angle += sweep + (gap * Math.PI / 180);
  });

  return (
    <div style={{ display:'flex', alignItems:'center', gap:20 }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={R+4} fill={C.s3}/>
        {arcs.map((arc,i) => (
          <path key={i} d={arc.d} fill={arc.color} style={{ transition:'opacity .2s' }} onMouseEnter={e=>(e.currentTarget.style.opacity='.75')} onMouseLeave={e=>(e.currentTarget.style.opacity='1')}/>
        ))}
        <circle cx={cx} cy={cy} r={32} fill={C.s2}/>
        <text x={cx} y={cy-6} textAnchor="middle" fill={C.white} fontSize={18} fontWeight={800} fontFamily="Syne,sans-serif">{total}</text>
        <text x={cx} y={cy+10} textAnchor="middle" fill={C.gray} fontSize={9}>TOTAL</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1 }}>
        {[
          { l:'Active',       v:present,     c:C.green  },
          { l:'On Break',     v:on_break,    c:C.yellow },
          { l:'Checked Out',  v:checked_out, c:C.blue   },
          { l:'Absent',       v:absent,      c:C.grayd  },
        ].map(s => (
          <div key={s.l} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:s.c, flexShrink:0 }}/>
            <div style={{ flex:1, fontSize:12, color:C.gray }}>{s.l}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:s.v>0?C.white:C.grayd }}>{s.v}</div>
            <div style={{ fontSize:10, color:C.grayd, width:28, textAlign:'right' }}>
              {total > 0 ? Math.round((s.v/total)*100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── BAR CHART (weekly ECC) ────────────────────────────────── */
const WeeklyBar = ({ days, loading }:{ days:WeekDay[]; loading:boolean }) => {
  const [hover, setHover] = useState<number|null>(null);
  if (loading) return <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90 }}>{Array.from({length:7}).map((_,i)=><Shimmer key={i} w="100%" h={Math.random()*60+20} br={4}/>)}</div>;
  if (!days.length) return <div style={{ textAlign:'center', padding:'24px 0', color:C.grayd, fontSize:13 }}>No data</div>;
  const maxECC = Math.max(...days.map(d=>d.ecc), 1);
  const maxCC  = Math.max(...days.map(d=>d.cc), 1);
  return (
    <div style={{ display:'flex', gap:5, alignItems:'flex-end', height:100 }}>
      {days.map((d,i) => (
        <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, position:'relative' }}
          onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}>
          {hover===i && (
            <div style={{ position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
              background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:9, padding:'8px 10px',
              fontSize:11, color:C.white, whiteSpace:'nowrap', zIndex:50, pointerEvents:'none', marginBottom:4,
              boxShadow:'0 8px 24px rgba(0,0,0,.6)' }}>
              <div style={{ fontWeight:700, marginBottom:3 }}>{d.label}</div>
              <div style={{ color:C.green }}>ECC: {d.ecc}</div>
              <div style={{ color:C.blue }}>CC: {d.cc}</div>
              {d.cc > 0 && <div style={{ color:C.yellow }}>Rate: {d.ecc_rate}%</div>}
            </div>
          )}
          {/* CC bar (background) */}
          <div style={{ width:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', height:80, position:'relative', borderRadius:4, overflow:'hidden', background:C.s3 }}>
            <div style={{ width:'100%', height:`${(d.cc/maxCC)*100}%`, background:`${C.blue}30`, transition:'height .5s ease', borderRadius:4 }}/>
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:`${(d.ecc/maxCC)*100}%`, background:C.green, borderRadius:4, opacity:.85, transition:'height .5s ease' }}/>
          </div>
          <div style={{ fontSize:9, color:hover===i?C.white:C.grayd, fontWeight:600 }}>{d.short_label}</div>
        </div>
      ))}
    </div>
  );
};

/* ── LEAFLET MAP (dynamic import) ─────────────────────────── */
const MapView = ({ locations }:{ locations:FELoc[] }) => {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = (window as any).L;
    if (!L || !mapRef.current) return;
    if (mapInst.current) return; // already initialised

    const map = L.map(mapRef.current, { zoomControl:false, attributionControl:false }).setView([19.076, 72.877], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(map);
    L.control.zoom({ position:'bottomright' }).addTo(map);
    mapInst.current = map;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = (window as any).L;
    const map = mapInst.current;
    if (!L || !map) return;

    // Remove old markers
    markRef.current.forEach(m => m.remove());
    markRef.current = [];

    locations.filter(fe => fe.lat && fe.lng).forEach(fe => {
      const color = fe.status === 'active' ? '#00D97E' : fe.status === 'checked_out' ? '#3E9EFF' : '#2E445E';
      const iconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid ${C.s2};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.5)">${fe.name[0]}</div>`;
      const icon = L.divIcon({ html:iconHtml, className:'', iconSize:[28,28], iconAnchor:[14,14] });
      const m = L.marker([fe.lat, fe.lng], { icon })
        .addTo(map)
        .bindPopup(`<div style="font-family:DM Sans,sans-serif;font-size:12px;color:#E8EDF8;background:#0E1420;padding:8px 10px;border-radius:8px;min-width:140px"><div style="font-weight:700;margin-bottom:4px">${fe.name}</div><div style="color:#7A8BA0">${fe.zone_name||''}</div><div style="margin-top:4px;font-size:11px;color:${color}">${fe.status}</div>${fe.checkin_at?`<div style="color:#7A8BA0;font-size:10px;margin-top:2px">In: ${new Date(fe.checkin_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>`:''}</div>`, { className:'km-popup' });
      markRef.current.push(m);
    });
  }, [locations]);

  return (
    <>
      <style>{`.km-popup .leaflet-popup-content-wrapper{background:#0E1420;border:1px solid #1E2D45;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7)}.km-popup .leaflet-popup-content{margin:0}.km-popup .leaflet-popup-tip{background:#0E1420}`}</style>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async/>
      <div ref={mapRef} style={{ width:'100%', height:'100%', borderRadius:16, overflow:'hidden' }}/>
    </>
  );
};

/* ── DATE RANGE PICKER ────────────────────────────────────── */
const DateRangePicker = ({ from, to, onChange }:{ from:string; to:string; onChange:(f:string,t:string)=>void }) => {
  const presets = [
    { label:'Today',    days:0  },
    { label:'7d',       days:7  },
    { label:'14d',      days:14 },
    { label:'30d',      days:30 },
  ];
  const today = new Date().toISOString().split('T')[0];
  const calcFrom = (days:number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split('T')[0]; };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      {presets.map(p => {
        const pFrom = p.days === 0 ? today : calcFrom(p.days - 1);
        const active = from === pFrom && to === today;
        return (
          <button key={p.label} onClick={()=>onChange(pFrom, today)}
            style={{ padding:'6px 12px', borderRadius:9, border:`1px solid ${active?C.blue:C.border}`, background:active?C.blueD:C.s3,
              color:active?C.blue:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all .15s' }}>
            {p.label}
          </button>
        );
      })}
      <input type="date" value={from} onChange={e=>onChange(e.target.value, to)}
        style={{ padding:'6px 10px', borderRadius:9, border:`1px solid ${C.border}`, background:C.s3, color:C.white, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }}/>
      <span style={{ fontSize:12, color:C.grayd }}>→</span>
      <input type="date" value={to} onChange={e=>onChange(from, e.target.value)}
        style={{ padding:'6px 10px', borderRadius:9, border:`1px solid ${C.border}`, background:C.s3, color:C.white, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }}/>
    </div>
  );
};

/* ── SECTION HEADER ─────────────────────────────────────────── */
const SectionHeader = ({ title, sub }:{ title:string; sub?:string }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{title}</div>
    {sub && <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{sub}</div>}
  </div>
);

/* ── CARD WRAPPER ────────────────────────────────────────────── */
const Card = ({ children, style }:{ children:React.ReactNode; style?:React.CSSProperties }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:18, padding:'20px 22px', ...style }}>
    {children}
  </div>
);

/* ══════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();

  const [from, setFrom] = useState(sevenDaysAgo);
  const [to,   setTo]   = useState(today);

  /* data state */
  const [attData,    setAtt]    = useState<{ summary:AttSummary; executives:any[] }|null>(null);
  const [weekData,   setWeek]   = useState<{ days:WeekDay[]; total_cc:number; total_ecc:number }|null>(null);
  const [locData,    setLoc]    = useState<{ summary:any; locations:FELoc[] }|null>(null);
  const [cityData,   setCity]   = useState<{ cities:CityPerf[] }|null>(null);
  const [outletData, setOutlet] = useState<{ summary:any; outlets:OutletRow[]; cities:any[] }|null>(null);
  const [summData,   setSumm]   = useState<any>(null);

  const [loadingAtt,    setLAtt]    = useState(true);
  const [loadingWeek,   setLWeek]   = useState(true);
  const [loadingLoc,    setLLoc]    = useState(true);
  const [loadingCity,   setLCity]   = useState(true);
  const [loadingOutlet, setLOutlet] = useState(true);
  const [loadingSumm,   setLSumm]   = useState(true);

  const [lastSync, setSync] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  /* load attendance (always today) */
  const loadAtt = useCallback(async () => {
    setLAtt(true);
    try {
      const r = await api.get<any>('/api/v1/analytics/attendance-today');
      setAtt(r?.data ?? r);
    } catch { /* silent */ } finally { setLAtt(false); }
  }, []);

  /* load summary */
  const loadSumm = useCallback(async () => {
    setLSumm(true);
    try {
      const r = await api.get<any>(`/api/v1/analytics/summary?date=${today}`);
      setSumm(r?.data ?? r);
    } catch { /* silent */ } finally { setLSumm(false); }
  }, [today]);

  /* load range-dependent data */
  const loadRange = useCallback(async (f:string, t:string) => {
    setLWeek(true); setLCity(true); setLOutlet(true);
    const qs = `?from=${f}&to=${t}`;
    try {
      const [wRes, cRes, oRes] = await Promise.allSettled([
        api.get<any>(`/api/v1/analytics/weekly-contacts${qs}`),
        api.get<any>(`/api/v1/analytics/city-performance${qs}`),
        api.get<any>(`/api/v1/analytics/outlet-coverage${qs}`),
      ]);
      if (wRes.status === 'fulfilled') setWeek(wRes.value?.data ?? wRes.value);
      if (cRes.status === 'fulfilled') setCity(cRes.value?.data ?? cRes.value);
      if (oRes.status === 'fulfilled') setOutlet(oRes.value?.data ?? oRes.value);
    } catch { /* silent */ }
    setLWeek(false); setLCity(false); setLOutlet(false);
  }, []);

  /* load live locations (today only) */
  const loadLoc = useCallback(async () => {
    setLLoc(true);
    try {
      const r = await api.get<any>('/api/v1/analytics/live-locations');
      setLoc(r?.data ?? r);
    } catch { /* silent */ } finally { setLLoc(false); }
  }, []);

  /* load Leaflet once */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = (window as any).L;
    if (L) { setMapLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => setMapLoaded(true);
    document.head.appendChild(s);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }, []);

  /* initial load */
  useEffect(() => { loadAtt(); loadSumm(); loadLoc(); }, [loadAtt, loadSumm, loadLoc]);
  useEffect(() => { loadRange(from, to); }, [from, to, loadRange]);

  const handleRefresh = () => {
    loadAtt(); loadSumm(); loadLoc(); loadRange(from, to);
    setSync(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }));
  };

  const att     = attData?.summary;
  const locs    = locData?.locations || [];
  const activeFEs = locs.filter(l => l.status === 'active');

  return (
    <>
      <style>{`
        @keyframes km-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes km-fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes km-pulse   { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes kspin      { to{transform:rotate(360deg)} }
        .kbtn { transition:opacity .13s,transform .13s; cursor:pointer; }
        .kbtn:hover { opacity:.82; }
        .kbtn:active { transform:scale(.97); }
        .km-tr:hover { background:${C.s3} !important; }
        .leaflet-container { background:#070D18; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:22, animation:'km-fadein .3s ease' }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              Dashboard
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
              Rise Up · Kinematic
              {lastSync && <span style={{ color:C.grayd, marginLeft:8 }}>· synced {lastSync}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <DateRangePicker from={from} to={to} onChange={(f,t)=>{ setFrom(f); setTo(t); }}/>
            <button className="kbtn" onClick={handleRefresh}
              style={{ padding:'8px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6, fontFamily:"'DM Sans',sans-serif" }}>
              ↺ Refresh
            </button>
          </div>
        </div>

        {/* ── KPI ROW ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total FEs',       value: summData?.total_executives ?? (loadingSumm?'…':'—'),      color:C.blue,   sub:'Active executives' },
            { label:'Active Today',    value: att?.present ?? (loadingAtt?'…':'—'),                      color:C.green,  sub:'Checked in now' },
            { label:'CC This Period',  value: weekData?.total_cc ?? (loadingWeek?'…':'—'),               color:C.red,    sub:`${from} → ${to}` },
            { label:'ECC This Period', value: weekData?.total_ecc ?? (loadingWeek?'…':'—'),              color:C.yellow, sub:weekData && weekData.total_cc > 0 ? `${Math.round((weekData.total_ecc/weekData.total_cc)*100)}% conversion` : undefined },
          ].map((k,i) => (
            <StatCard key={i} {...k} loading={loadingSumm || loadingAtt || loadingWeek}/>
          ))}
        </div>

        {/* ── ROW 2: PIE + WEEKLY BAR ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:16 }}>

          {/* Attendance Pie */}
          <Card>
            <SectionHeader title="Attendance Today" sub="Active · On break · Absent"/>
            {loadingAtt ? (
              <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                <Shimmer w={140} h={140} br={70}/>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                  {[...Array(4)].map((_,i)=><Shimmer key={i} h={14} br={4}/>)}
                </div>
              </div>
            ) : att ? (
              <PieChart
                present={att.present}
                on_break={att.on_break}
                checked_out={att.checked_out}
                absent={att.absent}
                total={att.total}
              />
            ) : (
              <div style={{ textAlign:'center', padding:'24px 0', color:C.grayd, fontSize:13 }}>No attendance data</div>
            )}
            {/* FE list */}
            {!loadingAtt && attData?.executives && attData.executives.length > 0 && (
              <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                <div style={{ fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Field Executives</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:160, overflowY:'auto' }}>
                  {attData.executives.map(fe => {
                    const sc = fe.display_status;
                    const c = sc==='present'?C.green : sc==='on_break'?C.yellow : sc==='checked_out'?C.blue : C.grayd;
                    return (
                      <div key={fe.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <Dot color={c} size={7}/>
                        <div style={{ flex:1, fontSize:12, color:sc==='absent'?C.grayd:C.white }}>{fe.name}</div>
                        <div style={{ fontSize:10, color:C.grayd }}>{fe.zone_name || ''}</div>
                        <div style={{ fontSize:10, color:c, fontWeight:700, textTransform:'capitalize', width:72, textAlign:'right' }}>{sc.replace('_',' ')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Weekly ECC bar */}
          <Card>
            <SectionHeader title="Weekly Activity" sub="Total forms filled · ECC (green) · CC (blue)"/>
            <WeeklyBar days={weekData?.days || []} loading={loadingWeek}/>
            {/* totals */}
            {!loadingWeek && weekData && (
              <div style={{ display:'flex', gap:16, marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}` }}>
                {[
                  { l:'Total CC',  v:weekData.total_cc,  c:C.blue   },
                  { l:'Total ECC', v:weekData.total_ecc, c:C.green  },
                  { l:'ECC Rate',  v:weekData.total_cc>0?`${Math.round((weekData.total_ecc/weekData.total_cc)*100)}%`:'—', c:C.yellow },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── ROW 3: LIVE MAP ── */}
        <Card style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <SectionHeader title="Live Field Locations" sub={`${activeFEs.length} active FEs · based on today's check-in coordinates`}/>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {[{l:'Active',c:C.green},{l:'Checked Out',c:C.blue},{l:'Absent',c:C.grayd}].map(b=>(
                <div key={b.l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:C.gray }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:b.c }}/>
                  {b.l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ height:380, position:'relative' }}>
            {loadingLoc ? (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>
                <div style={{ width:20, height:20, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', animation:'kspin .65s linear infinite' }}/>
              </div>
            ) : mapLoaded ? (
              <MapView locations={locs}/>
            ) : (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>Loading map…</div>
            )}
          </div>
          {/* FE chips below map */}
          {!loadingLoc && locs.length > 0 && (
            <div style={{ padding:'12px 22px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexWrap:'wrap' }}>
              {locs.map(fe => {
                const c = fe.status==='active'?C.green : fe.status==='checked_out'?C.blue : C.grayd;
                return (
                  <div key={fe.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:20, background:C.s3, border:`1px solid ${C.border}`, fontSize:11 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:c }}/>
                    <span style={{ color:fe.status==='absent'?C.grayd:C.white, fontWeight:600 }}>{fe.name}</span>
                    {fe.zone_name && <span style={{ color:C.grayd }}>{fe.zone_name}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── ROW 4: CITY PERFORMANCE ── */}
        <Card>
          <SectionHeader title="City-wise Performance" sub={`${from} → ${to} · based on check-ins & form submissions`}/>
          {loadingCity ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[...Array(3)].map((_,i) => <Shimmer key={i} h={52} br={10}/>)}
            </div>
          ) : cityData?.cities?.length ? (
            <>
              {/* Header */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 70px 80px 70px',
                gap:8, padding:'8px 12px', fontSize:10, color:C.grayd, fontWeight:700,
                letterSpacing:'0.6px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, marginBottom:6 }}>
                <div>City</div>
                <div style={{ textAlign:'center' }}>FEs</div>
                <div style={{ textAlign:'center' }}>Check-ins</div>
                <div style={{ textAlign:'center' }}>CC</div>
                <div style={{ textAlign:'center' }}>ECC</div>
                <div style={{ textAlign:'center' }}>ECC Rate</div>
                <div style={{ textAlign:'center' }}>Outlets</div>
              </div>
              {cityData.cities.map((city, i) => {
                const maxCC = Math.max(...cityData.cities.map(c => c.cc), 1);
                const barW  = (city.cc / maxCC) * 100;
                return (
                  <div key={city.city} className="km-tr" style={{ display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 70px 80px 70px',
                    gap:8, padding:'12px 12px', borderRadius:10, borderBottom:i<cityData.cities.length-1?`1px solid ${C.border}`:'none',
                    transition:'background .15s', position:'relative', overflow:'hidden' }}>
                    {/* bar bg */}
                    <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${barW}%`, background:`${C.blue}07`, pointerEvents:'none', borderRadius:10 }}/>
                    <div style={{ position:'relative' }}>
                      <div style={{ fontWeight:700, fontSize:13, color:C.white }}>{city.city}</div>
                      <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{city.zones} zone{city.zones!==1?'s':''}</div>
                    </div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:C.blue, display:'flex', alignItems:'center', justifyContent:'center' }}>{city.active_fes}</div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:C.white, display:'flex', alignItems:'center', justifyContent:'center' }}>{city.checkins}</div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:C.blue, display:'flex', alignItems:'center', justifyContent:'center' }}>{city.cc}</div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:C.green, display:'flex', alignItems:'center', justifyContent:'center' }}>{city.ecc}</div>
                    <div style={{ textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14,
                        color:city.ecc_rate>=60?C.green:city.ecc_rate>=30?C.yellow:C.red }}>
                        {city.ecc_rate}%
                      </span>
                    </div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:C.teal, display:'flex', alignItems:'center', justifyContent:'center' }}>{city.unique_outlets}</div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>No city data for this period</div>
          )}
        </Card>

        {/* ── ROW 5: OUTLET COVERAGE ── */}
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
            <SectionHeader title="Outlet Coverage" sub={`Unique outlets contacted · ${from} → ${to}`}/>
            {outletData?.summary && (
              <div style={{ display:'flex', gap:16 }}>
                {[
                  { l:'Unique Outlets', v:outletData.summary.total_outlets, c:C.teal },
                  { l:'Total Visits',   v:outletData.summary.total_visits,  c:C.blue },
                ].map(s => (
                  <div key={s.l} style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:22, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:10, color:C.gray, marginTop:1 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {loadingOutlet ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...Array(5)].map((_,i) => <Shimmer key={i} h={38} br={8}/>)}
            </div>
          ) : outletData?.outlets?.length ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 70px',
                gap:8, padding:'6px 12px', fontSize:10, color:C.grayd, fontWeight:700,
                letterSpacing:'0.6px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, marginBottom:6 }}>
                <div>Outlet</div>
                <div style={{ textAlign:'center' }}>Visits</div>
                <div style={{ textAlign:'center' }}>Conversions</div>
                <div style={{ textAlign:'center' }}>ECC Rate</div>
              </div>
              <div style={{ maxHeight:280, overflowY:'auto' }}>
                {outletData.outlets.map((o, i) => (
                  <div key={i} className="km-tr" style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 70px',
                    gap:8, padding:'9px 12px', borderRadius:8, transition:'background .15s',
                    borderBottom:i<outletData.outlets.length-1?`1px solid ${C.border}`:'none' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.white }}>{o.name}</div>
                      {o.city && <div style={{ fontSize:10, color:C.grayd }}>{o.city}</div>}
                    </div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:C.blue, display:'flex', alignItems:'center', justifyContent:'center' }}>{o.visits}</div>
                    <div style={{ textAlign:'center', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:C.green, display:'flex', alignItems:'center', justifyContent:'center' }}>{o.conversions}</div>
                    <div style={{ textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12,
                        color:o.ecc_rate>=60?C.green:o.ecc_rate>=30?C.yellow:C.grayd }}>
                        {o.ecc_rate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>No outlet data for this period</div>
          )}
        </Card>

      </div>
    </>
  );
}
