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

/* ── PIE, BAR, MAP, ETC. (unchanged) ───────────────────────── */
/* Use your existing PieChart, WeeklyBar, MapView, DateRangePicker,
   SectionHeader, Card, Spin from the previous file – paste them here
   exactly as they were. For brevity I’m not repeating their bodies. */

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

/* ── DATE RANGE PICKER, WEEKLY BAR, PIE, MAP, etc. GO HERE ───── */
/* ... paste your existing implementations from paste.txt ... */

/* ══════════════════════════════════════════════════════════
   MAIN ANALYTICS DASHBOARD (NO TOGGLE)
══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();

  const [from, setFrom] = useState(sevenDaysAgo);
  const [to,   setTo]   = useState(today);

  // data state
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

  const loadAtt = useCallback(async () => {
    setLAtt(true);
    try {
      const r = await api.get<any>('/api/v1/analytics/attendance-today');
      setAtt(r?.data ?? r);
    } catch { } finally { setLAtt(false); }
  }, []);

  const loadSumm = useCallback(async () => {
    setLSumm(true);
    try {
      const r = await api.get<any>(`/api/v1/analytics/summary?date=${today}`);
      setSumm(r?.data ?? r);
    } catch { } finally { setLSumm(false); }
  }, [today]);

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
    } catch { }
    setLWeek(false); setLCity(false); setLOutlet(false);
  }, []);

  const loadLoc = useCallback(async () => {
    setLLoc(true);
    try {
      const r = await api.get<any>('/api/v1/analytics/live-locations');
      setLoc(r?.data ?? r);
    } catch { } finally { setLLoc(false); }
  }, []);

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
        {/* Header – no toggle, just analytics */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              Dashboard
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>Rise Up · Kinematic</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            {/* plug in your DateRangePicker here */}
            {/* <DateRangePicker from={from} to={to} onChange={(f,t)=>{ setFrom(f); setTo(t); }}/> */}
            <button className="kbtn" onClick={handleRefresh}
              style={{ padding:'8px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6, fontFamily:"'DM Sans',sans-serif" }}>
              ↺ Refresh
              {lastSync && <span style={{ color:C.grayd }}>· {lastSync}</span>}
            </button>
          </div>
        </div>

        {/* KPI row, attendance, weekly, map, city, outlet – paste unchanged from dashboard view */}
        {/* ... your existing analytics JSX (KPI row, cards etc.) goes here exactly as in the dashboard view ... */}
      </div>
    </>
  );
}
