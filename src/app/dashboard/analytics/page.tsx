'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import api from '../../../lib/api';
import { useClient } from '../../../context/ClientContext';
import { useNewDesign } from '../../../lib/useNewDesign';
import FfmAnalyticsSection from '../../../components/ffm/analytics/FfmAnalyticsSection';
import { AuroraArea, CardHead } from '../../../components/charts/AuroraCharts';
import { AuroraPanel, AuroraStatTile, AuroraRankedBars, AuroraHeatmap, AuroraHeatLegend, AuroraInsightCard } from '../../../components/charts/AuroraAnalytics';
import { AlertTriangle, BarChart3, CalendarDays, CalendarOff, CheckCircle2, ClipboardCheck, Clock, LayoutGrid, Map as MapIcon, RefreshCw, Sparkles, Target, Telescope, TrendingDown, TrendingUp, Trophy, UserCheck, type LucideIcon } from 'lucide-react';
import { PageIcon, IconTile, InlineIcon } from '../../../components/ui/PageIcon';
import TileGrid from '../../../components/ui/TileGrid';

// Recharts is ~80 KB gz; load it only when this page actually renders.
const TffAreaChart = dynamic(() => import('../../../components/charts/TffAreaChart'), {
  ssr: false,
  loading: () => <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading chart…</div>,
});

const C = { 
  red: 'var(--primary)', 
  green: 'var(--green)', 
  yellow: '#FFB800', 
  blue: 'var(--accent)', 
  purple: '#9B6EFF', 
  gray: 'var(--text-dim)', 
  grayd: 'var(--text-dim)', 
  s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)',
  border: 'var(--border)' 
};

interface SummaryData {
  total_tff?: number;
  tff_count?: number;
  total_engagements?: number;
  avg_attendance?: number;
  attendance_pct?: number;
  tff_rate?: number;
  total_days_worked?: number;
  total_leaves?: number;
  total_hours_worked?: number;
  total_visits?: number;
  monthly_data?: Array<{ month: string; tff?: number; engagements?: number }>;
  top_performers?: Array<{ name: string; zone: string; tff?: number; attendance: number }>;
  zone_performance?: Array<{ zone: string; tff?: number; target: number }>;
  kpis?: {
    total_tff?: number;
    avg_attendance?: number;
    total_leaves?: number;
    total_days_worked?: number;
    total_hours_worked?: number;
    total_visits?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

// ── Heatmap types ────────────────────────────────────────────────────────────────────────
interface HeatmapHour  { hour: number; count: number; }
interface HeatmapRow   { date: string; day: string; hours: HeatmapHour[]; total: number; }
interface HeatmapResponse {
  days: number;
  start_date: string | null;
  end_date: string | null;
  rows: HeatmapRow[];
  summary: {
    peak_hour: string;
    peak_hour_count: number;
    peak_day: string;
    peak_day_count: number;
    total_contacts: number;
  };
}

// ── Heatmap helpers ──────────────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function heatColor(value: number, max: number): string {
  if (max === 0) return C.s2;
  const ratio = value / max;
  if (ratio === 0)   return C.s2;
  // Kinematic-red gradient (deep maroon → brand red → light red for the peak).
  if (ratio < 0.25)  return '#5E0F14'; // Deep maroon
  if (ratio < 0.5)   return '#8E1620'; // Dark red
  if (ratio < 0.75)  return '#C51A28'; // Kinematic red
  return '#F26D6D'; // Light red peak
}

function ContactActivityHeatmap({ data, loading }: { data: HeatmapResponse | null; loading: boolean }) {
  const { enabled }   = useNewDesign();
  const rows          = data?.rows ?? (Array.isArray(data) ? data : []);
  const totalContacts = data?.summary?.total_contacts ?? rows.reduce((acc: number, r: any) => acc + (r.total || 0), 0);
  const allVals       = rows.flatMap((row: any) => row.hours.map((h: any) => h.count));
  const maxVal        = Math.max(...allVals, 1);

  // TRUE empty = API returned rows but all counts are zero (no submissions yet)
  const isEmpty = !loading && (rows.length === 0 || totalContacts === 0);

  // New design — Aurora: a tint ramp (track → accent) of rounded cells, a glass tooltip, a gradient legend, big numerals.
  if (enabled) {
    const stats: Array<[string, string]> = [
      ['Peak hour', String(data?.summary?.peak_hour || '—')],
      ['Peak day', String(data?.summary?.peak_day || '—')],
      ['Total engagements', data?.summary?.total_contacts?.toLocaleString() ?? '—'],
    ];
    return (
      <AuroraPanel padding={22} style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <CardHead icon={LayoutGrid} tint="var(--accent)" title="TFF Activity Heatmap" sub="Density by day & hour — last 7 days"
          right={!isEmpty && !loading ? <AuroraHeatLegend accent="var(--accent)" /> : undefined} />
        {loading ? (
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--a-ink-2)', fontSize:13 }}>Loading heatmap...</div>
        ) : isEmpty ? (
          <div style={{ height:180, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
            <IconTile icon={BarChart3} size={40} iconSize={20} />
            <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>No TFF activity yet</div>
            <div style={{ fontSize:12, color:'var(--a-ink-2)', textAlign:'center', maxWidth:280 }}>Data will appear here once field executives start submitting forms</div>
          </div>
        ) : (
          <>
            <AuroraHeatmap
              ariaLabel="TFF activity by day and hour, last 7 days"
              colLabels={HOURS.map(h => (h % 3 === 0 ? `${h}h` : ''))}
              rows={rows.map((row: any) => ({
                key: row.date,
                label: row.day,
                cells: HOURS.map(hour => {
                  const val = row.hours.find((h: HeatmapHour) => h.hour === hour)?.count || 0;
                  return { value: val, tipTitle: `${row.date} @ ${hour.toString().padStart(2,'0')}:00`, tipValue: `${val} TFF${val === 1 ? '' : 's'}` };
                }),
              }))}
            />
            <div style={{ display:'flex', flexWrap:'wrap', gap:'14px 36px', paddingTop:16, borderTop:'1px solid var(--a-grid)' }}>
              {stats.map(([l, v]) => (
                <div key={l}>
                  <div className="km-au-num" style={{ fontSize:24 }}>{v}</div>
                  <div style={{ fontSize:11.5, color:'var(--a-ink-2)', marginTop:6 }}>{l}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </AuroraPanel>
    );
  }

  return (
    <div style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
      <style>{`
        .heatmap-cell:hover {
          transform: scale(1.15);
          filter: brightness(1.12) drop-shadow(0 0 6px rgba(208, 30, 44, 0.45));
          z-index: 10;
        }
      `}</style>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
            <InlineIcon icon={LayoutGrid} size={16} style={{ color:C.gray }} />
            TFF Activity Heatmap
          </div>
          <div style={{ fontSize:12, color:C.gray }}>Density by day &amp; hour — last 7 days</div>
        </div>
        {/* Legend — hide when empty */}
        {!isEmpty && !loading && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:C.grayd }}>Low</span>
            {['#5E0F14','#8E1620','#C51A28','#F26D6D'].map((col, i) => (
              <div key={i} style={{ width:16, height:16, borderRadius:3, background:col }}/>
            ))}
            <span style={{ fontSize:11, color:C.grayd }}>High</span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>
          Loading heatmap...
        </div>
      ) : isEmpty ? (
        <div style={{ height:180, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
          <IconTile icon={BarChart3} size={40} iconSize={20} />
          <div style={{ fontSize:13, color:C.gray, fontWeight:600 }}>No TFF activity yet</div>
          <div style={{ fontSize:12, color:C.grayd, textAlign:'center', maxWidth:280 }}>
            Data will appear here once field executives start submitting forms
          </div>
        </div>
      ) : (
        <>
          {/* Hour labels */}
          <div style={{ display:'flex', marginLeft:36, marginBottom:6, gap:2 }}>
            {HOURS.map(h => (
              <div key={h} style={{ flex:1, textAlign:'center', fontSize:9, color:C.grayd, lineHeight:'1' }}>
                {h % 3 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {rows.map(row => (
            <div key={row.date} style={{ display:'flex', alignItems:'center', gap:2, marginBottom:3 }}>
              <div style={{ width:32, fontSize:11, color:C.gray, textAlign:'right', paddingRight:6, flexShrink:0 }}>
                {row.day}
              </div>
              {HOURS.map(hour => {
                const val = row.hours.find((h: HeatmapHour) => h.hour === hour)?.count || 0;
                return (
                  <div
                    key={hour}
                    title={`${row.date} @ ${hour.toString().padStart(2,'0')}:00\nValue: ${val} TFFs`}
                    className="heatmap-cell"
                    style={{ 
                      flex:1, 
                      height:18, 
                      borderRadius:3, 
                      background:heatColor(val, maxVal), 
                      cursor:'default', 
                      transition:'all 0.1s ease-in-out'
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* Footer stats */}
          <div style={{ display:'flex', gap:24, marginTop:16, paddingTop:14, borderTop:`1px solid ${C.border}40` }}>
            <div>
              <div style={{ fontSize:11, color:C.grayd, marginBottom:3 }}>Peak Hour</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:C.blue }}>
                {data?.summary?.peak_hour || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.grayd, marginBottom:3 }}>Peak Day</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:C.blue }}>
                {data?.summary?.peak_day || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.grayd, marginBottom:3 }}>Total Engagements</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:C.blue }}>
                {data?.summary?.total_contacts?.toLocaleString() ?? '—'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
// ── End Heatmap ─────────────────────────────────────────────────────────────────────────────

interface TrendItem { label:string; date:string; tff:number; engagements:number; }

// ── New design (Aurora) variants of the trend / leaderboard cards ───────────────────────────────────────────────────
// Same data as the Classic cards below; only the presentation differs. Each is rendered only when `useNewDesign().enabled`.

/** "Mon, 12 Jan" from the trend point's ISO date (UTC, so the day never shifts); falls back to the API's own label. */
function trendDayLabel(date: string | undefined, fallback: string): string {
  const d = new Date(`${String(date ?? '').slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' });
}

function TffTrendAurora({ trends, loading }: { trends: TrendItem[]; loading: boolean }) {
  const points = useMemo(() => trends.map(t => ({ label: trendDayLabel(t.date, t.label), short: t.label, value: t.tff || 0 })), [trends]);
  const total = points.reduce((s, p) => s + p.value, 0);
  const avg   = points.length ? Math.round(total / points.length) : 0;
  const best  = points.reduce<typeof points[number] | null>((b, p) => (!b || p.value > b.value ? p : b), null);
  const stats: Array<[string, string]> = [
    ['Total forms', total.toLocaleString('en-IN')],
    ['Average per day', avg.toLocaleString('en-IN')],
    ['Best day', best ? `${best.value.toLocaleString('en-IN')}` : '—'],
  ];
  return (
    <AuroraPanel padding={22} style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <CardHead icon={TrendingUp} tint="var(--au-good, #0AAC23)" title="TFF Trend" sub="Forms filled per day"
        right={points.length > 0 && !loading ? (
          <>
            <span className="km-livepill"><span aria-hidden style={{ width:8, height:8, borderRadius:999, background:'var(--au-good, #0AAC23)' }} />TFF</span>
            {avg > 0 && <span className="km-livepill"><span aria-hidden style={{ width:14, borderTop:'2px dashed var(--a-axis)' }} />avg {avg}</span>}
          </>
        ) : undefined} />
      {loading ? (
        <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--a-ink-2)', fontSize:13 }}>Loading chart...</div>
      ) : !points.length ? (
        <div style={{ height:240, display:'flex', flexDirection:'column', gap:10, alignItems:'center', justifyContent:'center', color:'var(--a-ink-2)', fontSize:13 }}><IconTile icon={TrendingUp} size={40} iconSize={20} />No trend data for this period</div>
      ) : (
        <>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'10px 36px' }}>
            {stats.map(([l, v]) => (
              <div key={l}>
                <div className="km-au-num" style={{ fontSize:26 }}>{v}</div>
                <div style={{ fontSize:11.5, color:'var(--a-ink-2)', marginTop:6 }}>{l}{l === 'Best day' && best ? ` · ${best.label}` : ''}</div>
              </div>
            ))}
          </div>
          <AuroraArea data={points} unit="forms" height={220} ariaLabel="Forms filled per day" />
        </>
      )}
    </AuroraPanel>
  );
}

function TopPerformersAurora({ rows, loading }: { rows: any[]; loading: boolean }) {
  // gold / silver / bronze, then the accent — all derived from the Aurora status tokens
  const tints = ['var(--au-warn, #FBB315)', 'var(--au-neutral, #97A1B2)', 'color-mix(in srgb, var(--au-warn, #FBB315) 55%, var(--au-crit, #DC3C3D))'];
  return (
    <AuroraPanel padding={20} style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <CardHead icon={Trophy} tint="var(--au-warn, #FBB315)" title="Top Performers" sub="Ranked by forms filled" />
      {loading ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--a-ink-2)', fontSize:13 }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--a-ink-2)', fontSize:13 }}><IconTile icon={Trophy} size={40} iconSize={20} style={{ display:'flex', margin:'0 auto 10px' }} />No data available</div>
      ) : (
        <div role="list" style={{ display:'grid', gap:2 }}>
          {rows.map((fe: any, i: number) => {
            const tffVal = fe.tff ?? fe.tff_count ?? fe.total_tff ?? '—';
            const attVal = fe.attendance ?? fe.attendance_pct ?? fe.attendance_percentage;
            const zone   = fe.zone ?? fe.zone_name ?? '';
            const tint   = tints[i] ?? 'var(--accent)';
            return (
              <div key={i} role="listitem" className="km-au-row" style={{ display:'grid', gridTemplateColumns:'34px minmax(0,1fr) auto', alignItems:'center', gap:12, padding:'9px 10px', borderRadius:14 }}>
                <span aria-hidden className="km-lz" style={{ ['--tint' as string]: tint, width:34, height:34, display:'inline-grid', placeItems:'center', fontFamily:"var(--font-manrope)", fontSize:13, fontWeight:800, fontVariantNumeric:'tabular-nums' } as React.CSSProperties}>{i + 1}</span>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fe.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--a-ink-2)' }}>{zone}{attVal != null ? `${zone ? ' · ' : ''}${Number(attVal).toFixed(0)}% att.` : ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div className="km-au-num" style={{ fontSize:22 }}>{tffVal}</div>
                  <div style={{ fontSize:10.5, color:'var(--a-ink-3)', marginTop:3 }}>forms</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AuroraPanel>
  );
}

function ZonesAurora({ zones, loading }: { zones: any[]; loading: boolean }) {
  // each zone keeps the colour it has in Classic (by its position in the API's list); the list is ranked by attainment
  const colors = [C.blue, C.green, C.yellow, C.purple];
  const items = zones.map((z: any, i: number) => {
    const tffVal = z.tff ?? z.tff_count ?? z.total_tff ?? 0;
    const target = z.target ?? z.tff_target ?? z.goal ?? 0;
    const pct    = target > 0 ? Math.min(100, Math.round((tffVal / target) * 100)) : 0;
    return { label: z.zone ?? z.zone_name ?? z.name ?? `Zone ${i + 1}`, value: pct, display: `${pct}%`, sub: `${tffVal} / ${target || '—'} TFF`, color: colors[i % colors.length] };
  }).sort((a, b) => b.value - a.value);
  return (
    <AuroraPanel padding={20} style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <CardHead icon={MapIcon} tint="var(--accent)" title="Zone Breakdown" sub="Share of target reached" />
      {loading ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--a-ink-2)', fontSize:13 }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--a-ink-2)', fontSize:13 }}><IconTile icon={MapIcon} size={40} iconSize={20} style={{ display:'flex', margin:'0 auto 10px' }} />No data available</div>
      ) : (
        <AuroraRankedBars items={items} max={100} ariaLabel="Zones ranked by share of TFF target reached" />
      )}
    </AuroraPanel>
  );
}

export default function AnalyticsPage() {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();

  const [from,           setFrom]           = useState(sevenDaysAgo);
  const [to,             setTo]             = useState(today);
  const [trends,         setTrends]         = useState<TrendItem[]>([]);
  const [summary,        setSummary]        = useState<SummaryData | null>(null);
  const [heatmap,        setHeatmap]        = useState<HeatmapResponse | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [error,          setError]          = useState('');

  const { selectedClientId } = useClient();
  const { enabled } = useNewDesign();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setHeatmapLoading(true);
    let qs = `?from=${from}&to=${to}`;
    if (selectedClientId) qs += `&client_id=${selectedClientId}`;
    try {
      const [summRes, heatRes, trendRes] = await Promise.all([
        api.get<any>(`/api/v1/analytics/summary${qs}`),
        api.get<any>(`/api/v1/analytics/contact-heatmap${qs}`),
        api.get<any>(`/api/v1/analytics/tff-trends${qs}`),
      ]);

      const s = summRes as any;
      // Handle single wrap { data: {...} }, double wrap { data: { data: {...} } }, or raw
      const summaryRaw = s?.data?.data ?? s?.data ?? s;
      setSummary(summaryRaw);

      const h = heatRes as any;
      // Robustly extract the heatmap data object
      const heatmapRaw = h?.data?.rows ? h.data : (h?.rows ? h : (h?.data?.data?.rows ? h.data.data : null));
      setHeatmap(heatmapRaw);

      const t = trendRes as any;
      setTrends(Array.isArray(t.data) ? t.data : Array.isArray(t) ? t : []);

      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setHeatmapLoading(false);
    }
  }, [from, to, selectedClientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthly       = summary?.monthly_data || [];
  const maxTFF        = monthly.length ? Math.max(...monthly.map((m: any) => m.tff ?? 0), 1) : 1;
  const topPerformers: any[] = summary?.top_performers ?? summary?.data?.top_performers ?? [];
  const zones: any[]         = summary?.zone_performance ?? summary?.data?.zone_performance ?? [];

  // Resolve each field across all known response shapes
  const totalTff    = summary?.kpis?.total_tff     ?? summary?.total_tff    ?? summary?.tff_count;
  const avgAtt      = summary?.kpis?.avg_attendance ?? summary?.avg_attendance ?? summary?.attendance_pct;
  const daysWorked  = summary?.kpis?.total_days_worked  ?? summary?.total_days_worked;
  const totalLeaves = summary?.kpis?.total_leaves   ?? summary?.total_leaves;
  const totalHours  = summary?.kpis?.total_hours_worked ?? summary?.total_hours_worked;
  const totalVisits = summary?.kpis?.total_visits   ?? summary?.total_visits;

  // Same glyphs as the KPI tiles on the dashboard home, which show these same figures.
  const kpis: { l:string; v:string; c:string; icon:LucideIcon }[] = [
    { l:'Total Forms Filled', v: totalTff    != null ? Number(totalTff).toLocaleString() : '—',   c:C.green,  icon:ClipboardCheck },
    { l:'Avg Attendance',    v: avgAtt      != null ? `${Math.round(Number(avgAtt))}%` : '—',      c:C.yellow, icon:UserCheck },
    { l:'Days Worked',       v: daysWorked  != null ? String(daysWorked) : '—',                   c:C.blue,   icon:CalendarDays },
    { l:'Total Leaves',      v: totalLeaves != null ? String(totalLeaves) : '—',                  c:C.red,    icon:CalendarOff },
    { l:'Total Hours',       v: totalHours  != null ? `${Math.floor(Number(totalHours))}h ${Math.round((Number(totalHours) % 1) * 60)}m` : '—', c:C.purple, icon:Clock },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <PageIcon />
          <div>
            <div style={{ fontSize:15, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>Analytics</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Performance trends, field-force metrics &amp; customisable widgets</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {[
            { l:'Last 7d', d:7 },
            { l:'Last 30d', d:30 }
          ].map(p => {
            const pFrom = (() => { const d = new Date(); d.setDate(d.getDate() - (p.d-1)); return d.toISOString().split('T')[0]; })();
            const active = from === pFrom && to === today;
            return (
              <button key={p.l} onClick={() => { setFrom(pFrom); setTo(today); }}
                style={{
                  padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer',
                  background: active ? C.blue : C.s2,
                  border: `1px solid ${active ? C.blue : C.border}`,
                  color: active ? '#fff' : C.gray,
                  transition: 'all .15s'
                }}>{p.l}</button>
            );
          })}
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, color:'var(--text)', fontSize:11, padding:'5px 8px' }} />
          <span style={{ color:C.grayd, fontSize:12 }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, color:'var(--text)', fontSize:11, padding:'5px 8px' }} />
          
          <button onClick={fetchData} className="kbtn" 
            style={{ padding:'6px 12px', borderRadius:8, background:C.s2, border:`1px solid ${C.border}`, color:C.gray, fontSize:11, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6 }}>
            <InlineIcon icon={RefreshCw} size={14} />
            Sync
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <TileGrid id="analytics-kpis" perRow={5} h={3} style={{ display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:14 }}>
        {kpis.map(s => enabled ? (
          <AuroraStatTile key={s.l} icon={s.icon} label={s.l} value={loading ? '—' : s.v} tint={s.c} />
        ) : (
          <div key={s.l} style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontSize:12, color:C.gray, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><InlineIcon icon={s.icon} size={14} />{s.l}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>
              {loading ? '—' : s.v}
            </div>
          </div>
        ))}
      </TileGrid>

      {/* TFF Trend Chart */}
      <TileGrid id="analytics-tff-trend" perRow={1} h={8}>
      {enabled ? <TffTrendAurora key="tff-trend" trends={trends} loading={loading} /> : (
      <div key="tff-trend" style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}><InlineIcon icon={TrendingUp} size={16} style={{ color:C.gray }} />TFF Trend</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Forms filled per day</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.gray }}>
            <div style={{ width:10, height:10, borderRadius:2, background:C.green }}/>TFF
          </div>
        </div>

        {loading ? (
          <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>Loading chart...</div>
        ) : !trends.length ? (
          <div style={{ height:240, display:'flex', flexDirection:'column', gap:10, alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}><IconTile icon={TrendingUp} size={40} iconSize={20} />No trend data for this period</div>
        ) : (
          <TffAreaChart trends={trends as unknown as { label: string; tff: number }[]} />
        )}
      </div>
      )}
      </TileGrid>

      <TileGrid id="analytics-leaderboards" perRow={2} h={9} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Top performers */}
        {enabled ? <TopPerformersAurora key="top-performers" rows={topPerformers} loading={loading} /> : (
        <div key="top-performers" style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><InlineIcon icon={Trophy} size={16} style={{ color:C.gray }} />Top Performers</div>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>Loading...</div>
          ) : topPerformers.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}><IconTile icon={Trophy} size={40} iconSize={20} style={{ display:'flex', margin:'0 auto 10px' }} />No data available</div>
          ) : topPerformers.map((fe: any, i: number) => {
            const tffVal = fe.tff ?? fe.tff_count ?? fe.total_tff ?? '—';
            const attVal = fe.attendance ?? fe.attendance_pct ?? fe.attendance_percentage;
            const zone   = fe.zone ?? fe.zone_name ?? '';
            return (
              <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 0', borderBottom: i < topPerformers.length-1 ? `1px solid ${C.border}40` : 'none' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: i===0?'rgba(255,184,0,0.15)':i===1?'rgba(122,139,160,0.1)':i===2?'rgba(205,127,50,0.15)':'rgba(62,158,255,0.1)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:800,
                  color: i===0?C.yellow:i===1?C.gray:i===2?'#CD7F32':C.blue, flexShrink:0 }}>#{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{fe.name}</div>
                  <div style={{ fontSize:11, color:C.grayd }}>
                    {zone}{attVal != null ? ` · ${Number(attVal).toFixed(0)}% att.` : ''}
                  </div>
                </div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.green }}>{tffVal}</div>
              </div>
            );
          })}
        </div>

        {/* Zone breakdown */}
        <div key="zone-breakdown" style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><InlineIcon icon={MapIcon} size={16} style={{ color:C.gray }} />Zone Breakdown</div>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>Loading...</div>
          ) : zones.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}><IconTile icon={MapIcon} size={40} iconSize={20} style={{ display:'flex', margin:'0 auto 10px' }} />No data available</div>
          ) : zones.map((z: any, i: number) => {
            const colors = [C.blue, C.green, C.yellow, C.purple];
            const col    = colors[i % colors.length];
            const zoneName = z.zone ?? z.zone_name ?? z.name ?? `Zone ${i+1}`;
            const tffVal   = z.tff ?? z.tff_count ?? z.total_tff ?? 0;
            const target   = z.target ?? z.tff_target ?? z.goal ?? 0;
            const pct      = target > 0 ? Math.min(100, Math.round((tffVal / target) * 100)) : 0;
            return (
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{zoneName}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:col }}>{pct}%</span>
                </div>
                <div style={{ height:6, background:C.s2, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:C.grayd, marginTop:4 }}>{tffVal} / {target || '—'} TFF</div>
              </div>
            );
          })}
        </div>
      </TileGrid>

      {/* ── TFF Activity Heatmap (live) ── */}
      <TileGrid id="analytics-heatmap" perRow={1} h={9}>
        <ContactActivityHeatmap key="tff-activity-heatmap" data={heatmap} loading={heatmapLoading} />
      </TileGrid>

      {/* Predictive Insights */}
      {!loading && trends.length > 0 && (() => {
        // ── Compute insights from existing data ─────────────────────────────────

        // 1. TFF Momentum: compare avg of first half vs second half of trend period
        const half = Math.floor(trends.length / 2);
        const firstHalfAvg  = half > 0 ? trends.slice(0, half).reduce((s, d) => s + d.tff, 0) / half : 0;
        const secondHalfAvg = (trends.length - half) > 0 ? trends.slice(half).reduce((s, d) => s + d.tff, 0) / (trends.length - half) : 0;
        const momentumPct   = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;
        const momentumUp    = momentumPct >= 0;

        // 2. TFF Forecast: linear regression to predict tomorrow's TFF
        const n = trends.length;
        const xMean = (n - 1) / 2;
        const yMean = trends.reduce((s, d) => s + d.tff, 0) / n;
        const slope = trends.reduce((s, d, i) => s + (i - xMean) * (d.tff - yMean), 0) /
                      (trends.reduce((s, _, i) => s + (i - xMean) ** 2, 0) || 1);
        const intercept   = yMean - slope * xMean;
        const forecastVal = Math.max(0, Math.round(intercept + slope * n));

        // 3. Consistency score: % of days with at least 1 TFF
        const activeDays    = trends.filter(d => d.tff > 0).length;
        const consistencyPct = Math.round((activeDays / trends.length) * 100);

        // 5. At-risk zones: zones below 50% of target
        const atRiskZones = zones.filter((z: any) => z.target > 0 && (z.tff ?? 0) / z.target < 0.5);

        // 6. Weekly run-rate: current daily average projected across a 7-day week
        const dailyAvg = yMean;
        const weeklyRunRate = Math.round(dailyAvg * 7);

        // 7. Forecast confidence: R² of the linear trend fit (how tightly days follow the trend)
        const ssTot = trends.reduce((s, d) => s + (d.tff - yMean) ** 2, 0);
        const ssRes = trends.reduce((s, d, i) => { const pred = intercept + slope * i; return s + (d.tff - pred) ** 2; }, 0);
        const r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
        const confPct = Math.round(r2 * 100);

        const insightCard = (
          icon: LucideIcon,
          title: string,
          value: string,
          sub: string,
          accent: string,
          badge?: { label: string; color: string },
          methodology?: string
        ) => (
          <div key={title} style={{
            background:C.s1, border:`1px solid ${C.border}`, borderRadius:16,
            padding:20, display:'flex', flexDirection:'column', gap:10,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <InlineIcon icon={icon} size={22} style={{ color:accent }} />
                {methodology && (
                  <span className="kini-info" style={{ position:'relative', cursor:'help', color:C.gray, display:'inline-flex', opacity:0.8 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span className="kini-info-pop" style={{
                      display:'none', position:'absolute', top:'165%', left:0, zIndex:60, width:230,
                      background:C.s3, border:`1px solid ${C.border}`, borderRadius:10, padding:'9px 11px',
                      fontSize:11, lineHeight:1.5, color:C.gray, fontWeight:400, textAlign:'left', whiteSpace:'normal',
                      boxShadow:'0 12px 30px rgba(0,0,0,0.28)',
                    }}>
                      <span style={{ display:'block', fontWeight:800, color:'var(--text)', fontSize:9.5, letterSpacing:'0.5px', marginBottom:4 }}>HOW THIS IS CALCULATED</span>
                      {methodology}
                    </span>
                  </span>
                )}
              </div>
              {badge && (
                <span style={{
                  fontSize:10, fontWeight:700, letterSpacing:'0.5px',
                  padding:'3px 8px', borderRadius:20,
                  background:`${badge.color}18`, color:badge.color,
                  border:`1px solid ${badge.color}30`,
                }}>
                  {badge.label}
                </span>
              )}
            </div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:accent, lineHeight:1 }}>
              {value}
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{title}</div>
            <div style={{ fontSize:11, color:C.gray }}>{sub}</div>
          </div>
        );

        return (
          <div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                <InlineIcon icon={Sparkles} size={16} style={{ color:C.gray }} />
                Predictive Insights
              </div>
              <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>
                KINI-computed signals from your {trends.length}-day activity window · hover the ⓘ on any card to see how it&apos;s calculated
              </div>
            </div>
            <TileGrid id="analytics-insights" perRow={3} h={5} style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
              {insightCard(
                momentumUp ? TrendingUp : TrendingDown,
                'TFF Momentum',
                `${momentumUp ? '+' : ''}${momentumPct}%`,
                momentumUp
                  ? `Performance is accelerating — second half avg ${Math.round(secondHalfAvg)} vs first half ${Math.round(firstHalfAvg)}`
                  : `Performance is declining — second half avg ${Math.round(secondHalfAvg)} vs first half ${Math.round(firstHalfAvg)}`,
                momentumUp ? C.green : C.red,
                { label: momentumUp ? 'TRENDING UP' : 'NEEDS ATTENTION', color: momentumUp ? C.green : C.red },
                'Average TFF across the first half of the selected window versus the second half. A positive value means daily output is accelerating.'
              )}
              {insightCard(
                Telescope,
                'TFF Forecast (Tomorrow)',
                String(forecastVal),
                slope >= 0
                  ? `Based on the current upward trend (+${slope.toFixed(1)}/day), tomorrow looks strong`
                  : `Current trend is softening (${slope.toFixed(1)}/day) — consider nudging the team`,
                C.blue,
                { label: slope >= 0 ? 'POSITIVE SIGNAL' : 'WATCH', color: slope >= 0 ? C.blue : C.yellow },
                'Least-squares linear regression fitted to the daily TFF series, projected one day ahead.'
              )}
              {insightCard(
                CalendarDays,
                'Activity Consistency',
                `${consistencyPct}%`,
                `${activeDays} of ${trends.length} days had TFF activity — ${
                  consistencyPct >= 80 ? 'excellent execution discipline'
                  : consistencyPct >= 50 ? 'some gaps in daily execution'
                  : 'significant gaps — check FE attendance & route coverage'
                }`,
                consistencyPct >= 80 ? C.green : consistencyPct >= 50 ? C.yellow : C.red,
                undefined,
                'Share of days in the window with at least one TFF logged (active days ÷ total days).'
              )}
              {atRiskZones.length > 0
                ? insightCard(
                    AlertTriangle,
                    'Zones Below 50% Target',
                    String(atRiskZones.length),
                    `${atRiskZones.map((z: any) => z.zone).join(', ')} — immediate intervention recommended`,
                    C.red,
                    { label: 'AT RISK', color: C.red },
                    'Zones whose TFF for this period is below 50% of their assigned target.'
                  )
                : insightCard(
                    CheckCircle2,
                    'All Zones on Track',
                    '0 at risk',
                    'Every zone is above 50% of its TFF target for this period',
                    C.green,
                    { label: 'ON TRACK', color: C.green },
                    'Zones whose TFF for this period is below 50% of their assigned target.'
                  )
              }
              {insightCard(
                BarChart3,
                'Weekly Run-Rate',
                String(weeklyRunRate),
                `At the current pace of ~${Math.round(dailyAvg)} TFF/day, the team is on track for ${weeklyRunRate} TFF over a 7-day week`,
                C.blue,
                undefined,
                'Average daily TFF across the window projected across a full 7-day week (daily average × 7).'
              )}
              {insightCard(
                Target,
                'Forecast Confidence',
                `${confPct}%`,
                confPct >= 70
                  ? 'Daily TFF tracks the trend closely — the forecast is reliable'
                  : confPct >= 40
                    ? 'Daily TFF is moderately variable — treat the forecast as indicative'
                    : 'Daily TFF is volatile — the forecast carries high uncertainty',
                confPct >= 70 ? C.green : confPct >= 40 ? C.yellow : C.red,
                { label: confPct >= 70 ? 'HIGH' : confPct >= 40 ? 'MODERATE' : 'LOW', color: confPct >= 70 ? C.green : confPct >= 40 ? C.yellow : C.red },
                'R² of the linear trend fit — the share of day-to-day TFF variation explained by the trend line. Higher means a more reliable forecast.'
              )}
            </TileGrid>
          </div>
        );
      })()}

      {/* Customisable Field-Force widget grid (merged from FFM Analytics) */}
      <FfmAnalyticsSection />
    </div>
  );
}
