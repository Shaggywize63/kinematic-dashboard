'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ClipboardCheck, Clock, CalendarDays, CalendarOff, UserCheck } from 'lucide-react';
import api from '../../lib/api';
import { getStoredUser, landingRouteFor } from '../../lib/auth';
import { getStoredIndustryScope } from '../../context/IndustryScopeContext';
import { useClient } from '../../context/ClientContext';
import { usePageTitle } from '../../lib/pageTitle';
import { Button, Card, Eyebrow, Input, PageHeader, Segmented, T, useIsCompact } from '../../components/ui';
import KiniMascot from '../../components/crm/KiniMascot';

/* ── types ─────────────────────────────────────────────────── */
interface AttSummary {
  total:number;
  present:number;
  on_break:number;
  checked_out:number;
  absent:number;
  regularised:number;
  total_days_worked?:number;
  total_leaves?:number;
}

interface WeekDay {
  date:string;
  label:string;
  short_label:string;
  engagements:number;
  tff:number;
  tff_rate:number;
}

interface CityPerf {
  city:string;
  zones:number;
  active_fes:number;
  checkins:number;
  engagements:number;
  tff:number;
  tff_rate:number;
  unique_outlets:number;
  avg_hours:number;
  lat:number|null;
  lng:number|null;
}
interface OutletRow {
  name:string;
  checkins:number;
  tff:number;
  city:string|null;
  tff_rate:number;
}

/* ── tiny atoms ─────────────────────────────────────────────── */
const Shimmer = ({ w='100%', h=16, br=6, style }:{ w?:string|number; h?:number; br?:number; style?:CSSProperties }) => (
  <div style={{ width:w, height:h, borderRadius:br, background:T.raised, overflow:'hidden', position:'relative', ...style }}>
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,transparent 0%,${T.border} 50%,transparent 100%)`, animation:'km-shimmer 1.3s ease-in-out infinite' }}/>
  </div>
);

/** KPI stat tile — icon chip in a soft tonal wash, eyebrow label, Manrope
 *  value. The wash bleeds out of the chip corner as a faint radial glow so
 *  each tile carries its own colour identity without shouting; text always
 *  stays in text tokens (never the accent colour). */
type TileTone = 'ok' | 'info' | 'warn' | 'red' | 'neutral';
const TILE_TONES: Record<TileTone, { fg:string; wash:string }> = {
  ok:      { fg:T.ok,   wash:T.okWash   },
  info:    { fg:T.info, wash:T.infoWash },
  warn:    { fg:T.warn, wash:T.warnWash },
  red:     { fg:T.red,  wash:T.redWash  },
  neutral: { fg:T.dim,  wash:T.raised   },
};
const StatTile = ({ label, value, sub, loading, icon, tone = 'neutral' }:{
  label:string;
  value:string|number;
  sub?:string;
  loading?:boolean;
  icon?:React.ReactNode;
  tone?:TileTone;
}) => {
  const t = TILE_TONES[tone];
  return (
    <Card padding={16} className="km-tile" style={{ position:'relative', overflow:'hidden' }}>
      {/* corner glow — the tile's one decorative element */}
      <div aria-hidden style={{ position:'absolute', top:-30, right:-30, width:130, height:110, background:`radial-gradient(closest-side, ${t.wash}, transparent)`, pointerEvents:'none' }}/>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <Eyebrow style={{ paddingTop:2 }}>{label}</Eyebrow>
        {icon && (
          <div aria-hidden style={{ width:30, height:30, borderRadius:9, background:t.wash, color:t.fg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <Shimmer h={26} br={5} w="55%" style={{ marginTop:8 }}/>
      ) : (
        <div style={{ fontFamily:T.heading, fontSize:26, fontWeight:700, letterSpacing:'-0.01em', color:T.text, lineHeight:1.1, marginTop:6, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      )}
      {sub && <div style={{ fontSize:12, color:T.dim, marginTop:4 }}>{sub}</div>}
      {/* baseline accent tick — echoes the tone without colouring the number */}
      <div aria-hidden style={{ width:26, height:3, borderRadius:2, background:t.fg, opacity:.55, marginTop:10 }}/>
    </Card>
  );
};

/** Card heading: Manrope title + one-line dim sub, optional right slot. */
const CardTitle = ({ title, sub, right }:{ title:string; sub?:string; right?:React.ReactNode }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:14, flexWrap:'wrap' }}>
    <div style={{ minWidth:0 }}>
      <div style={{ fontFamily:T.heading, fontSize:15, fontWeight:700, letterSpacing:'-0.01em', color:T.text }}>{title}</div>
      {sub && <div style={{ fontSize:12.5, color:T.dim, marginTop:2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

const th: CSSProperties = { padding:'12px 16px', textAlign:'left', fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.08em', textTransform:'uppercase', color:T.mute, fontWeight:500, borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' };
const td: CSSProperties = { padding:'12px 16px', fontSize:13.5, color:T.text, borderBottom:`1px solid ${T.border}`, verticalAlign:'middle' };
const tdNum: CSSProperties = { ...td, textAlign:'right', fontFamily:T.mono, fontSize:12.5, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' };
const thNum: CSSProperties = { ...th, textAlign:'right' };

const Empty = ({ children }:{ children:React.ReactNode }) => (
  <div style={{ textAlign:'center', padding:'32px 0', color:T.dim, fontSize:13 }}>{children}</div>
);

/* ── ATTENDANCE DONUT ──────────────────────────────────────── */
// Ring order deliberately keeps green (Active) and amber (On break) apart —
// the two are the palette's weakest pair under red-green colour blindness, so
// blue (Checked out) always sits between them. Identity is never colour-alone:
// every slice is directly labelled in the legend with count + share, and the
// centre readout names whichever slice (or legend row) is hovered.
const PieChart = ({ present, on_break, checked_out, absent, total }:{
  present:number;
  on_break:number;
  checked_out:number;
  absent:number;
  total:number;
}) => {
  const [hover, setHover] = useState<string|null>(null);
  const SIZE = 150, cx = SIZE/2, cy = SIZE/2, R = 57, W = 15, GAP_DEG = 3;
  const legend = [
    { key:'active',  label:'Active',      value:present,     color:T.ok   },
    { key:'out',     label:'Checked out', value:checked_out, color:T.info },
    { key:'break',   label:'On break',    value:on_break,    color:T.warn },
    { key:'absent',  label:'Absent',      value:absent,      color:T.mute },
  ];
  const segments = legend.filter(s => s.value > 0);
  const totalVal = segments.reduce((s,x) => s + x.value, 0) || 1;
  const gapRad = segments.length > 1 ? (GAP_DEG * Math.PI / 180) : 0;

  const arcs: { key:string; d:string; color:string }[] = [];
  let angle = -Math.PI / 2;
  segments.forEach(seg => {
    const sweep = Math.max((seg.value / totalVal) * 2 * Math.PI - gapRad, 0.02);
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
    arcs.push({ key:seg.key, d:`M ${x1} ${y1} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2}`, color:seg.color });
    angle += sweep + gapRad;
  });

  const focused = hover ? legend.find(s => s.key === hover) : null;
  const centreValue = focused ? focused.value : total;
  const centreLabel = focused ? focused.label.toUpperCase() : 'TOTAL';

  return (
    <div style={{ display:'flex', alignItems:'center', gap:22, flexWrap:'wrap' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink:0 }} onMouseLeave={() => setHover(null)}>
        {/* quiet track so the ring reads as a whole even with tiny slices */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={T.raised} strokeWidth={W}/>
        {segments.length === 1 ? (
          <circle cx={cx} cy={cy} r={R} fill="none" className="km-arc" data-on={hover === segments[0].key || hover === null ? '1' : '0'}
            stroke={segments[0].color} strokeWidth={hover === segments[0].key ? W + 4 : W}
            onMouseEnter={() => setHover(segments[0].key)}/>
        ) : arcs.map(a => (
          <path key={a.key} d={a.d} fill="none" className="km-arc"
            stroke={a.color} strokeWidth={hover === a.key ? W + 4 : W}
            opacity={hover === null || hover === a.key ? 1 : 0.35}
            onMouseEnter={() => setHover(a.key)}/>
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fill:T.text, fontSize:22, fontWeight:700, fontFamily:T.heading, letterSpacing:'-0.01em', fontVariantNumeric:'tabular-nums' }}>
          {centreValue}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fill:T.mute, fontSize:8, fontFamily:T.mono, letterSpacing:'0.09em' }}>
          {centreLabel}
        </text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:2, flex:1, minWidth:170 }} onMouseLeave={() => setHover(null)}>
        {legend.map(s => (
          <div key={s.key} onMouseEnter={() => setHover(s.key)}
            style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', borderRadius:8, cursor:'default',
                     background: hover === s.key ? T.raised : 'transparent',
                     opacity: hover === null || hover === s.key ? 1 : 0.55, transition:'background .12s ease, opacity .12s ease' }}>
            <div style={{ width:9, height:9, borderRadius:3, background:s.color, flexShrink:0 }}/>
            <div style={{ flex:1, fontSize:13, color:T.dim }}>{s.label}</div>
            <div style={{ fontFamily:T.mono, fontSize:13, color:s.value>0?T.text:T.mute, fontVariantNumeric:'tabular-nums' }}>{s.value}</div>
            <div style={{ fontFamily:T.mono, fontSize:11.5, color:T.mute, width:36, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
              {total > 0 ? Math.round((s.value/total)*100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── BAR CHART (weekly TFF) ────────────────────────────────── */
const SKELETON_HEIGHTS = [42, 66, 30, 76, 52, 60, 46];
const WeeklyBar = ({ days, loading }:{ days:WeekDay[]; loading:boolean }) => {
  const [hover, setHover] = useState<number|null>(null);
  if (loading) {
    return (
      <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90 }}>
        {SKELETON_HEIGHTS.map((h,i) => (
          <Shimmer key={i} w="100%" h={h} br={4}/>
        ))}
      </div>
    );
  }
  if (!days.length) {
    return <Empty>No data</Empty>;
  }
  const maxTFF = Math.max(...days.map(d => d.tff), 1);
  const avg = days.reduce((s,d) => s + d.tff, 0) / days.length;
  const peakIdx = days.reduce((best,d,i) => (d.tff > days[best].tff ? i : best), 0);
  const PLOT_H = 96;

  return (
    <div style={{ position:'relative' }}>
      {/* dashed average line with a right-aligned tag — one quiet reference,
          no gridline forest */}
      {avg > 0 && (
        <div aria-hidden style={{ position:'absolute', left:0, right:0, bottom:20 + (avg/maxTFF)*PLOT_H, borderTop:`1px dashed ${T.borderStrong}`, zIndex:1, pointerEvents:'none' }}>
          <span style={{ position:'absolute', right:0, top:-16, fontFamily:T.mono, fontSize:9.5, color:T.mute, letterSpacing:'0.06em', background:T.card, paddingLeft:6 }}>
            AVG {Math.round(avg)}
          </span>
        </div>
      )}
      <div style={{ display:'flex', gap:8, alignItems:'flex-end', borderBottom:`1px solid ${T.border}` }}>
        {days.map((d,i) => {
          const h = Math.max((d.tff/maxTFF)*PLOT_H, d.tff > 0 ? 3 : 0);
          return (
            <div
              key={d.date}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:PLOT_H + 18, position:'relative', cursor:'default' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div
                  style={{
                    position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
                    background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 10px',
                    fontSize:12, color:T.text, whiteSpace:'nowrap', zIndex:50, pointerEvents:'none',
                    marginBottom:4, boxShadow:'var(--shadow-pop)',
                  }}
                >
                  <div style={{ fontWeight:500, marginBottom:2 }}>{d.label}</div>
                  <div style={{ color:T.dim, fontFamily:T.mono, fontSize:11.5 }}>TFF {d.tff}</div>
                </div>
              )}
              {/* the peak day is the one direct label; everything else answers on hover */}
              {i === peakIdx && d.tff > 0 && hover !== i && (
                <div style={{ fontFamily:T.mono, fontSize:10, color:T.dim, marginBottom:3, fontVariantNumeric:'tabular-nums' }}>{d.tff}</div>
              )}
              <div
                style={{
                  width:'100%', maxWidth:38, height:h,
                  background:`linear-gradient(180deg, ${T.ok} 0%, color-mix(in srgb, ${T.ok} 45%, transparent) 100%)`,
                  borderRadius:'4px 4px 0 0',
                  opacity:hover===null || hover===i ? 1 : .5,
                  transition:'height .5s ease, opacity .15s ease',
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:6 }}>
        {days.map((d,i) => (
          <div key={d.date} style={{ flex:1, textAlign:'center', fontFamily:T.mono, fontSize:10, color:hover===i?T.text:T.mute, letterSpacing:'0.04em' }}>{d.short_label}</div>
        ))}
      </div>
    </div>
  );
};

/* ── DATE RANGE PICKER ────────────────────────────────────── */
const PRESETS = [
  { label:'Today',  days:0  },
  { label:'7d',     days:7  },
  { label:'14d',    days:14 },
  { label:'30d',    days:30 },
];
const DateRangePicker = ({ from, to, onChange }:{
  from:string;
  to:string;
  onChange:(f:string,t:string)=>void;
}) => {
  const today = new Date().toISOString().split('T')[0];
  const calcFrom = (days:number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };
  const presetFrom = (days:number) => (days === 0 ? today : calcFrom(days - 1));
  const active = PRESETS.find(p => from === presetFrom(p.days) && to === today)?.label ?? 'custom';

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      <Segmented
        value={active}
        onChange={(v) => { const p = PRESETS.find(x => x.label === v); if (p) onChange(presetFrom(p.days), today); }}
        options={PRESETS.map(p => ({ value:p.label, label:p.label }))}
      />
      <Input type="date" aria-label="From date" value={from} onChange={e => onChange(e.target.value, to)} style={{ width:150 }} />
      <span style={{ fontSize:12, color:T.mute }}>→</span>
      <Input type="date" aria-label="To date" value={to} onChange={e => onChange(from, e.target.value)} style={{ width:150 }} />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   MAIN ANALYTICS DASHBOARD (NO HR TOGGLE)
══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const router = useRouter();
  usePageTitle('Dashboard');
  const narrow = useIsCompact(900);

  // Guard: this page calls /analytics/* endpoints that require the
  // `analytics` module. Users without it (e.g. client-level CRM users)
  // get 403s and a broken page. Bounce them to a route they can load.
  useEffect(() => {
    const u = getStoredUser() as { role?: string; permissions?: string[] } | null;
    if (!u) return;
    const role = (u.role || '').toLowerCase().replace(/-/g, '_');
    // Bounce anyone whose home ISN'T this field-force overview back to it.
    // Covers CRM-only clients and their client-admins (whose /analytics calls
    // 403 here and render a broken field-force shell) as well as non-admins
    // without the analytics module. The platform super admin is the only
    // account that always belongs here.
    const dest = landingRouteFor(u as any);
    if (role !== 'super_admin' && dest !== '/dashboard') router.replace(dest);
  }, [router]);

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();

  const [from, setFrom] = useState(sevenDaysAgo);
  const [to,   setTo]   = useState(today);

  const [attData,    setAtt]    = useState<{ summary:AttSummary; executives:any[] }|null>(null);
  const [weekData,   setWeek]   = useState<{ days:WeekDay[]; total_cc:number; total_tff:number }|null>(null);
  // Demo-only: when the Insurance vertical is selected, this field force is
  // advisors visiting customers (no retail outlets), so the field-force overview
  // is re-labelled and the outlet-coverage card is hidden. Empty for every real
  // tenant and the generic demo → no behaviour change for them.
  const isIns = getStoredIndustryScope() === 'insurance';
  const [cityData,   setCity]   = useState<{ cities:CityPerf[] }|null>(null);
  const [outletData, setOutlet] = useState<{ summary:any; outlets:OutletRow[]; cities:any[] }|null>(null);
  const [summData,   setSumm]   = useState<any>(null);

  const [loadingAtt,    setLAtt]    = useState(true);
  const [loadingWeek,   setLWeek]   = useState(true);
  const [loadingCity,   setLCity]   = useState(true);
  const [loadingOutlet, setLOutlet] = useState(true);
  const [loadingSumm,   setLSumm]   = useState(true);

  const [lastSync, setSync] = useState('');

  const [currUser, setCurrUser] = useState<any>(null);
  const userName = currUser?.name || 'Admin';

  const { selectedClientId } = useClient();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [userPerf, setUserPerf] = useState<{ users:any[] }|null>(null);
  const [loadingUserPerf, setLUserPerf] = useState(true);

  // ByteBack is field-force-only and route-less/outlet-less, so City-wise
  // performance + Outlet coverage are meaningless. Swap them for a User-wise
  // performance table (per FE: check-ins, submissions, active days). ByteBack only.
  const BYTEBACK_CLIENT_ID = '9c8d7e6f-5a4b-4c3d-8e1f-0a1b2c3d4e5f';
  const BYTEBACK_ORG_ID = '7e3b1c9a-2f44-4a6e-9b1d-0a2b3c4d5e6f';
  const isByteBack = selectedClientId === BYTEBACK_CLIENT_ID
    || (currUser as any)?.client_id === BYTEBACK_CLIENT_ID
    || (currUser as any)?.org_id === BYTEBACK_ORG_ID;

  const loadInit = useCallback(async () => {
    setLAtt(true); setLSumm(true); setLWeek(true);
    try {
      const qs = selectedClientId ? `?client_id=${selectedClientId}` : '';
      const r = await api.get<any>(`/api/v1/analytics/dashboard-init${qs}`);
      if (r?.data || r) {
        const d = r.data || r;
        setAtt({ summary: d.attendance, executives: [] });
        setSumm({ kpis: d.kpis });
        setWeek(d.weekly);
      }
    } catch { } finally {
      setLAtt(false); setLSumm(false); setLWeek(false);
      setIsInitialLoad(false);
    }
  }, [selectedClientId]);

  const loadRange = useCallback(async (f:string, t:string) => {
    if (isInitialLoad && f === (new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]) && t === (new Date().toISOString().split('T')[0])) return;
    setLWeek(true); setLCity(true); setLOutlet(true); setLSumm(true);
    let qs = `?from=${f}&to=${t}`;
    if (selectedClientId) qs += `&client_id=${selectedClientId}`;
    try {
      const [wRes, cRes, oRes, sRes] = await Promise.allSettled([
        api.get<any>(`/api/v1/analytics/weekly-contacts${qs}`),
        api.get<any>(`/api/v1/analytics/city-performance${qs}`),
        api.get<any>(`/api/v1/analytics/outlet-coverage${qs}`),
        api.get<any>(`/api/v1/analytics/summary${qs}`),
      ]);
      if (wRes.status === 'fulfilled') setWeek(wRes.value?.data ?? wRes.value);
      if (cRes.status === 'fulfilled') setCity(cRes.value?.data ?? cRes.value);
      if (oRes.status === 'fulfilled') setOutlet(oRes.value?.data ?? oRes.value);
      if (sRes.status === 'fulfilled') setSumm(sRes.value?.data ?? sRes.value);
      if (isByteBack) {
        setLUserPerf(true);
        try {
          const up = await api.get<any>(`/api/v1/analytics/user-performance${qs}`);
          setUserPerf(up?.data ?? up);
        } catch { } finally { setLUserPerf(false); }
      }
    } catch { }
    setLWeek(false); setLCity(false); setLOutlet(false); setLSumm(false);
  }, [isInitialLoad, selectedClientId, isByteBack]);

  useEffect(() => {
    const u = getStoredUser();
    setCurrUser(u);
    // If the signed-in user only has CRM granted, the org-wide overview
    // is meaningless to them — bounce to the CRM Overview instead.
    const perms = (u as { permissions?: string[] } | null)?.permissions;
    if (Array.isArray(perms) && perms.length > 0) {
      const hasCrm = perms.some((p) => p === 'crm' || p.startsWith('crm_'));
      const hasNonCrm = perms.some((p) => p !== 'crm' && !p.startsWith('crm_'));
      if (hasCrm && !hasNonCrm) router.replace('/dashboard/crm/dashboard');
    }
  }, [router]);

  useEffect(() => { loadInit(); }, [loadInit]);
  useEffect(() => {
    if (!isInitialLoad) loadRange(from, to);
  }, [from, to, loadRange, isInitialLoad, selectedClientId]);

  const handleRefresh = () => {
    loadInit();
    if (!isInitialLoad) loadRange(from, to);
    setSync(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }));
  };

  const att       = attData?.summary;

  return (
    <>
      <style>{`
        @keyframes km-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes km-fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .km-tile { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .km-tile:hover { transform: translateY(-2px); border-color: var(--border-l); box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
        .km-arc { transition: stroke-width .15s ease, opacity .15s ease; }
        .km-tbl tbody tr { transition: background .1s ease; }
        .km-tbl tbody tr:hover td { background: var(--s3); }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'km-fadein .3s ease' }}>
        <PageHeader
          eyebrow="Operational overview"
          title={
            <span style={{ display:'inline-flex', alignItems:'center', gap:12 }}>
              <span aria-hidden style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:46, height:46, borderRadius:14, background:'var(--s3)', border:`1px solid ${T.border}`, flexShrink:0 }}>
                <KiniMascot size={34} />
              </span>
              Hello, {userName}
            </span>
          }
          description={<>Field-force activity for <span style={{ fontFamily:T.mono, fontSize:12.5 }}>{from}</span> → <span style={{ fontFamily:T.mono, fontSize:12.5 }}>{to}</span>{lastSync ? <> · synced <span style={{ fontFamily:T.mono, fontSize:12.5 }}>{lastSync}</span></> : null}</>}
          actions={
            <>
              <DateRangePicker from={from} to={to} onChange={(f,t)=>{ setFrom(f); setTo(t); }}/>
              <Button onClick={handleRefresh} icon={<RefreshCw size={16} strokeWidth={1.6} />}>Refresh</Button>
            </>
          }
          compact={narrow}
        />

        {/* KPI Row - Phase 2 */}
        <div style={{ display:'grid', gridTemplateColumns:narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap:12 }}>
          <StatTile label="Total forms filled" tone="ok" icon={<ClipboardCheck size={15} strokeWidth={1.8}/>} value={summData?.kpis?.total_tff ?? '—'} loading={loadingSumm} />
          <StatTile label="Total hours" tone="info" icon={<Clock size={15} strokeWidth={1.8}/>} value={summData?.kpis?.total_hours_worked != null ? `${Math.floor(summData.kpis.total_hours_worked)}h ${Math.round((summData.kpis.total_hours_worked % 1) * 60)}m` : '—'} loading={loadingSumm} />
          <StatTile label="Days worked" tone="neutral" icon={<CalendarDays size={15} strokeWidth={1.8}/>} value={summData?.kpis?.total_days_worked ?? '—'} loading={loadingSumm} />
          <StatTile label="Total leaves" tone="warn" icon={<CalendarOff size={15} strokeWidth={1.8}/>} value={summData?.kpis?.total_leaves ?? '—'} loading={loadingSumm} />
          <StatTile label="Avg attendance" tone="red" icon={<UserCheck size={15} strokeWidth={1.8}/>} value={summData?.kpis?.avg_attendance != null ? `${Math.round(summData.kpis.avg_attendance)}%` : '—'} loading={loadingSumm} />
        </div>

        {/* Row 2: Attendance + Weekly Activity */}
        <div style={{ display:'grid', gridTemplateColumns:narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.5fr)', gap:16 }}>
          <Card>
            <CardTitle title="Attendance today" sub="Active · On break · Checked out · Absent" />
            {loadingAtt ? (
              <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                <Shimmer w={140} h={140} br={70}/>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                  {[...Array(4)].map((_,i) => (
                    <Shimmer key={i} h={14} br={4}/>
                  ))}
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
              <Empty>No attendance data</Empty>
            )}
          </Card>

          <Card>
            <CardTitle
              title="Weekly activity"
              sub="Total forms filled (TFF) per day"
            />
            <WeeklyBar days={weekData?.days || []} loading={loadingWeek}/>
            {!loadingWeek && weekData && (
              <div
                style={{
                  display:'flex',
                  gap:16,
                  marginTop:14,
                  paddingTop:14,
                  borderTop:`1px solid ${T.border}`,
                }}
              >
                {[
                  { l:'Total forms filled (TFF)', v:weekData.total_tff },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily:T.heading, fontSize:22, fontWeight:700, letterSpacing:'-0.01em', color:T.text, lineHeight:1.1, fontVariantNumeric:'tabular-nums' }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize:12, color:T.dim, marginTop:4 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {isByteBack && (
        <Card padding={0}>
          <div style={{ padding:'16px 16px 0' }}>
            <CardTitle title="User-wise performance" sub={`${from} → ${to} · per field executive`} />
          </div>
          {loadingUserPerf ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'0 16px 16px' }}>
              {[...Array(3)].map((_,i) => <Shimmer key={i} h={44} br={8}/>)}
            </div>
          ) : (userPerf?.users?.length ? (
            <div style={{ overflowX:'auto' }}>
              <table className="km-tbl" style={{ width:'100%', borderCollapse:'collapse', minWidth:520 }}>
                <thead>
                  <tr>
                    <th style={th}>Field executive</th>
                    <th style={thNum}>Check-ins</th>
                    <th style={thNum}>Submissions</th>
                    <th style={thNum}>Active days</th>
                  </tr>
                </thead>
                <tbody>
                  {userPerf.users.map((u:any, i:number) => {
                    const last = i === userPerf.users.length - 1;
                    return (
                      <tr key={u.user_id}>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <div style={{ fontWeight:500 }}>{u.name}</div>
                          {u.employee_id && <div style={{ fontSize:12, color:T.mute, marginTop:2 }}>{u.employee_id}</div>}
                        </td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{u.checkins}</td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{u.submissions}</td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{u.active_days}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No user activity for this period</Empty>
          ))}
        </Card>
        )}

        {!isByteBack && (
        <Card padding={0}>
          <div style={{ padding:'16px 16px 0' }}>
            <CardTitle
              title="City-wise performance"
              sub={`${from} → ${to} · based on check-ins & form submissions`}
            />
          </div>
          {(() => {
            const visibleCities = (cityData?.cities ?? []).filter(c => c.city?.toLowerCase() !== 'gurugram');
            const maxTFF = Math.max(...visibleCities.map(c => c.tff), 1);
            return loadingCity ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'0 16px 16px' }}>
                {[...Array(3)].map((_,i) => (
                  <Shimmer key={i} h={44} br={8}/>
                ))}
              </div>
            ) : visibleCities.length ? (
              <div style={{ overflowX:'auto' }}>
                <table className="km-tbl" style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
                  <thead>
                    <tr>
                      <th style={th}>City</th>
                      <th style={thNum}>{isIns ? 'Advisors' : 'FEs'}</th>
                      <th style={thNum}>{isIns ? 'Visits' : 'Check-ins'}</th>
                      <th style={{ ...thNum, minWidth:160 }}>{isIns ? 'Meetings' : 'TFF'}</th>
                      <th style={thNum}>{isIns ? 'Policies' : 'Outlets'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCities.map((city, i) => {
                      const barW = (city.tff / maxTFF) * 100;
                      const last = i === visibleCities.length - 1;
                      return (
                        <tr key={city.city}>
                          <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                            <div style={{ fontWeight:500 }}>{city.city}</div>
                            <div style={{ fontSize:12, color:T.mute, marginTop:2 }}>
                              {city.zones} zone{city.zones !== 1 ? 's' : ''}
                            </div>
                          </td>
                          <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{city.active_fes}</td>
                          <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{city.checkins ?? '—'}</td>
                          <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'flex-end' }}>
                              <div style={{ width:80, height:5, background:T.rule, borderRadius:3, overflow:'hidden' }}>
                                <div style={{ width:`${barW}%`, height:'100%', background:`linear-gradient(90deg, color-mix(in srgb, ${T.ok} 55%, transparent), ${T.ok})`, borderRadius:3, transition:'width .5s ease' }} />
                              </div>
                              <span style={{ minWidth:28, textAlign:'right' }}>{city.tff}</span>
                            </div>
                          </td>
                          <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{city.unique_outlets}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No city data for this period</Empty>
            );
          })()}
        </Card>
        )}

        {/* Row 5: Outlet Coverage — hidden for the insurance vertical (no outlets) and for ByteBack (route-less) */}
        {!isIns && !isByteBack && (
        <Card padding={0}>
          <div style={{ padding:'16px 16px 0' }}>
            <CardTitle
              title="Outlet coverage"
              sub={`Unique outlets contacted · ${from} → ${to}`}
              right={outletData?.summary && (
                <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                  {[
                    { l:'Unique outlets', v:outletData.summary.total_outlets },
                    { l:'Total check-ins', v:outletData.summary.total_checkins },
                    { l:'Total TFF', v:outletData.summary.total_tff },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:T.heading, fontSize:20, fontWeight:700, letterSpacing:'-0.01em', color:T.text, lineHeight:1.1, fontVariantNumeric:'tabular-nums' }}>
                        {s.v}
                      </div>
                      <Eyebrow style={{ marginTop:4 }}>{s.l}</Eyebrow>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>
          {loadingOutlet ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6, padding:'0 16px 16px' }}>
              {[...Array(5)].map((_,i) => (
                <Shimmer key={i} h={36} br={8}/>
              ))}
            </div>
          ) : outletData?.outlets?.length ? (
            <div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
              <table className="km-tbl" style={{ width:'100%', borderCollapse:'collapse', minWidth:520 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, position:'sticky', top:0, background:T.card }}>Outlet</th>
                    <th style={{ ...thNum, position:'sticky', top:0, background:T.card }}>Check-ins</th>
                    <th style={{ ...thNum, position:'sticky', top:0, background:T.card }}>TFF</th>
                    <th style={{ ...thNum, position:'sticky', top:0, background:T.card }}>TFF rate</th>
                  </tr>
                </thead>
                <tbody>
                  {outletData.outlets.map((o, i) => {
                    const last = i === outletData.outlets.length - 1;
                    // TFF-rate pill: state reads from the chip's wash, the number
                    // itself stays in text ink — never colour-alone text.
                    const rate = o.tff_rate == null ? null : o.tff_rate >= 60 ? { fg:T.ok, bg:T.okWash } : o.tff_rate >= 30 ? { fg:T.warn, bg:T.warnWash } : { fg:T.dim, bg:T.raised };
                    return (
                      <tr key={i}>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <div style={{ fontWeight:500 }}>{o.name}</div>
                          {o.city && <div style={{ fontSize:12, color:T.mute, marginTop:2 }}>{o.city}</div>}
                        </td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{o.checkins}</td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>{o.tff ?? '—'}</td>
                        <td style={{ ...tdNum, borderBottom: last ? 0 : td.borderBottom }}>
                          {rate ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:rate.bg, borderRadius:999, padding:'3px 9px' }}>
                              <span style={{ width:6, height:6, borderRadius:'50%', background:rate.fg }}/>
                              <span style={{ fontFamily:T.mono, fontSize:11.5, color:T.text, fontVariantNumeric:'tabular-nums' }}>{o.tff_rate}%</span>
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No outlet data for this period</Empty>
          )}
        </Card>
        )}
      </div>
    </>
  );
}
