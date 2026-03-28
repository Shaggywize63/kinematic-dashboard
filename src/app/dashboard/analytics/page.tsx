'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

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

// ── Heatmap types ─────────────────────────────────────────────────────────────
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

// ── Heatmap helpers ───────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function heatColor(value: number, max: number): string {
  if (max === 0) return C.s2;
  const ratio = value / max;
  if (ratio === 0)   return C.s2;
  if (ratio < 0.25)  return '#0d2e3e';
  if (ratio < 0.5)   return '#0a4a6e';
  if (ratio < 0.75)  return '#0e6ea8';
  return '#3E9EFF';
}

function ContactActivityHeatmap({ data, loading }: { data: HeatmapResponse | null; loading: boolean }) {
  const rows          = data?.rows ?? (Array.isArray(data) ? data : []);
  const totalContacts = data?.summary?.total_contacts ?? rows.reduce((acc: number, r: any) => acc + (r.total || 0), 0);
  const allVals       = rows.flatMap((row: any) => row.hours.map((h: any) => h.count));
  const maxVal        = Math.max(...allVals, 1);

  // TRUE empty = API returned rows but all counts are zero (no submissions yet)
  const isEmpty = !loading && (rows.length === 0 || totalContacts === 0);

  return (
    <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:4 }}>
            TFF Activity Heatmap
          </div>
          <div style={{ fontSize:12, color:C.gray }}>Density by day &amp; hour — last 7 days</div>
        </div>
        {/* Legend — hide when empty */}
        {!isEmpty && !loading && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:C.grayd }}>Low</span>
            {['#0d2e3e','#0a4a6e','#0e6ea8','#3E9EFF'].map((col, i) => (
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
          <div style={{ fontSize:28 }}>📊</div>
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
                    title={`${row.day} ${hour.toString().padStart(2,'0')}:00 — ${val} contacts`}
                    style={{ flex:1, height:18, borderRadius:3, background:heatColor(val, maxVal), cursor:'default', transition:'opacity 0.15s' }}
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
// ── End Heatmap ───────────────────────────────────────────────────────────────

interface TrendItem { label:string; date:string; tff:number; engagements:number; }

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setHeatmapLoading(true);
    const qs = `?from=${from}&to=${to}`;
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
      const heatmapRaw = h?.data?.data ?? h?.data ?? h;
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
  }, [from, to]);

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

  const kpis = [
    { l:'Total Form Filled', v: totalTff    != null ? Number(totalTff).toLocaleString() : '—',   c:C.green  },
    { l:'Avg Attendance',    v: avgAtt      != null ? `${Number(avgAtt).toFixed(1)}%` : '—',      c:C.yellow },
    { l:'Days Worked',       v: daysWorked  != null ? String(daysWorked) : '—',                   c:C.blue   },
    { l:'Total Leaves',      v: totalLeaves != null ? String(totalLeaves) : '—',                  c:C.red    },
    { l:'Total Hours',       v: totalHours  != null ? `${Math.floor(Number(totalHours))}h ${Math.round((Number(totalHours) % 1) * 60)}m` : '—', c:C.purple },
    { l:'Field Visits',      v: totalVisits != null ? Number(totalVisits).toLocaleString() : '—', c:C.blue   },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>Analytics</div>
          <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Performance trends and metrics</div>
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
                  background: active ? C.blue : '#1A2438',
                  border: `1px solid ${active ? C.blue : C.border}`,
                  color: active ? '#fff' : C.gray,
                  transition: 'all .15s'
                }}>{p.l}</button>
            );
          })}
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ background:'#1A2438', border:`1px solid ${C.border}`, borderRadius:8, color:'#fff', fontSize:11, padding:'5px 8px', colorScheme:'dark' }} />
          <span style={{ color:C.grayd, fontSize:12 }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ background:'#1A2438', border:`1px solid ${C.border}`, borderRadius:8, color:'#fff', fontSize:11, padding:'5px 8px', colorScheme:'dark' }} />
          
          <button onClick={fetchData} className="kbtn" 
            style={{ padding:'6px 12px', borderRadius:8, background:C.s2, border:`1px solid ${C.border}`, color:C.gray, fontSize:11, fontWeight:600 }}>
            ↺ Sync
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:14 }}>
        {kpis.map(s => (
          <div key={s.l} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontSize:12, color:C.gray, marginBottom:10 }}>{s.l}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>
              {loading ? '—' : s.v}
            </div>
          </div>
        ))}
      </div>

      {/* TFF Trend Chart */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700 }}>TFF Trend</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Forms filled per day</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.gray }}>
            <div style={{ width:10, height:10, borderRadius:2, background:C.green }}/>TFF
          </div>
        </div>

        {loading ? (
          <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>Loading chart...</div>
        ) : !trends.length ? (
          <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>No trend data for this period</div>
        ) : (
          <div style={{ height:240, width:'100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colTff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.green} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:C.grayd, fontSize:10}} dy={10}/>
                <YAxis axisLine={false} tickLine={false} tick={{fill:C.grayd, fontSize:10}}/>
                <Tooltip
                  contentStyle={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:12, fontSize:12 }}
                  itemStyle={{ fontSize:11, fontWeight:700 }}
                />
                <Area type="monotone" dataKey="tff" stroke={C.green} fillOpacity={1} fill="url(#colTff)" strokeWidth={2} name="TFF"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Top performers */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Top Performers</div>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>Loading...</div>
          ) : topPerformers.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>No data available</div>
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
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Zone Breakdown</div>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>Loading...</div>
          ) : zones.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>No data available</div>
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
      </div>

      {/* ── TFF Activity Heatmap (live) ── */}
      <ContactActivityHeatmap data={heatmap} loading={heatmapLoading} />

      {/* Predictive Insights */}
      {!loading && trends.length > 0 && (() => {
        // ── Compute insights from existing data ──────────────────────────────

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

        // 3. Best performing day
        const best = trends.reduce((a, b) => b.tff > a.tff ? b : a, trends[0]);

        // 4. Consistency score: % of days with at least 1 TFF
        const activeDays    = trends.filter(d => d.tff > 0).length;
        const consistencyPct = Math.round((activeDays / trends.length) * 100);

        // 5. At-risk zones: zones below 50% of target
        const atRiskZones = zones.filter((z: any) => z.target > 0 && (z.tff ?? 0) / z.target < 0.5);

        // 6. Peak performer efficiency (TFF per attended day)
        const topFe = topPerformers[0];
        const efficiencyScore = topFe
          ? `${topFe.tff} TFF · ${topFe.attendance}% att.`
          : null;

        const insightCard = (
          icon: string,
          title: string,
          value: string,
          sub: string,
          accent: string,
          badge?: { label: string; color: string }
        ) => (
          <div style={{
            background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16,
            padding:20, display:'flex', flexDirection:'column', gap:10,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontSize:22 }}>{icon}</div>
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
            <div style={{ fontSize:13, fontWeight:600, color:'#E8EDF8' }}>{title}</div>
            <div style={{ fontSize:11, color:C.gray }}>{sub}</div>
          </div>
        );

        return (
          <div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:'#E8EDF8' }}>
                Predictive Insights
              </div>
              <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>
                AI-computed signals from your {trends.length}-day activity window
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
              {insightCard(
                '📈',
                'TFF Momentum',
                `${momentumUp ? '+' : ''}${momentumPct}%`,
                momentumUp
                  ? `Performance is accelerating — second half avg ${Math.round(secondHalfAvg)} vs first half ${Math.round(firstHalfAvg)}`
                  : `Performance is declining — second half avg ${Math.round(secondHalfAvg)} vs first half ${Math.round(firstHalfAvg)}`,
                momentumUp ? C.green : C.red,
                { label: momentumUp ? 'TRENDING UP' : 'NEEDS ATTENTION', color: momentumUp ? C.green : C.red }
              )}
              {insightCard(
                '🔮',
                'TFF Forecast (Tomorrow)',
                String(forecastVal),
                slope >= 0
                  ? `Based on the current upward trend (+${slope.toFixed(1)}/day), tomorrow looks strong`
                  : `Current trend is softening (${slope.toFixed(1)}/day) — consider nudging the team`,
                C.blue,
                { label: slope >= 0 ? 'POSITIVE SIGNAL' : 'WATCH', color: slope >= 0 ? C.blue : C.yellow }
              )}
              {insightCard(
                '🏆',
                'Best Day This Period',
                best.label,
                `Peak TFF of ${best.tff} — schedule high-priority outlets on similar days`,
                C.yellow
              )}
              {insightCard(
                '📅',
                'Activity Consistency',
                `${consistencyPct}%`,
                `${activeDays} of ${trends.length} days had TFF activity — ${
                  consistencyPct >= 80 ? 'excellent execution discipline'
                  : consistencyPct >= 50 ? 'some gaps in daily execution'
                  : 'significant gaps — check FE attendance & route coverage'
                }`,
                consistencyPct >= 80 ? C.green : consistencyPct >= 50 ? C.yellow : C.red
              )}
              {atRiskZones.length > 0
                ? insightCard(
                    '⚠️',
                    'Zones Below 50% Target',
                    String(atRiskZones.length),
                    `${atRiskZones.map((z: any) => z.zone).join(', ')} — immediate intervention recommended`,
                    C.red,
                    { label: 'AT RISK', color: C.red }
                  )
                : insightCard(
                    '✅',
                    'All Zones on Track',
                    '0 at risk',
                    'Every zone is above 50% of its TFF target for this period',
                    C.green,
                    { label: 'ON TRACK', color: C.green }
                  )
              }
              {topFe
                ? insightCard(
                    '⚡',
                    'Top Performer',
                    topFe.name,
                    efficiencyScore
                      ? `${efficiencyScore} — replicate this execution pattern across the team`
                      : 'Leading the leaderboard this period',
                    C.purple
                  )
                : insightCard(
                    '⚡',
                    'Top Performer',
                    '—',
                    'No performer data available for this period',
                    C.purple
                  )
              }
            </div>
          </div>
        );
      })()}
    </div>
  );
}
