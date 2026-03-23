'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar 
} from 'recharts';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

interface SummaryData {
  total_tff?: number;
  total_engagements?: number;
  avg_attendance?: number;
  tff_rate?: number;
  monthly_data?: Array<{ month: string; tff?: number; engagements?: number }>;
  top_performers?: Array<{ name: string; zone: string; tff?: number; attendance: number }>;
  zone_breakdown?: Array<{ zone: string; tff?: number; target: number }>;
}

interface ActivityItem {
  type: string;
  message: string;
  time: string;
  user?: string;
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
  const rows         = data?.rows || [];
  const totalContacts = data?.summary?.total_contacts ?? 0;
  const allVals      = rows.flatMap(row => row.hours.map(h => h.count));
  const maxVal       = Math.max(...allVals, 1);

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
                const val = row.hours[hour]?.count || 0;
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
  const [activity,       setActivity]       = useState<ActivityItem[]>([]);
  const [heatmap,        setHeatmap]        = useState<HeatmapResponse | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [error,          setError]          = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setHeatmapLoading(true);
    const qs = `?from=${from}&to=${to}`;
    try {
      const [summRes, actRes, heatRes, trendRes] = await Promise.all([
        api.get<any>(`/api/v1/analytics/summary${qs}`),
        api.get<any>('/api/v1/analytics/activity-feed'),
        api.get<any>(`/api/v1/analytics/contact-heatmap${qs}`),
        api.get<any>(`/api/v1/analytics/tff-trends${qs}`),
      ]);

      const s = summRes as any;
      setSummary(s.data || s);

      const a = actRes as any;
      setActivity(a.data || a.feed || (Array.isArray(a) ? a : []));

      const h = heatRes as any;
      setHeatmap(h.data || h);

      const t = trendRes as any;
      setTrends(t.data || t);

      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setHeatmapLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthly       = summary?.monthly_data    || [];
  const maxTFF        = monthly.length ? Math.max(...monthly.map(m => m.tff ?? 0), 1) : 1;
  const topPerformers = summary?.top_performers  || [];
  const zones         = summary?.zone_performance || [];

  const kpis = [
    { l:'Total TFF',      v: (summary?.total_tff)?.toLocaleString() ?? '—', c:C.green  },
    { l:'Avg Attendance', v: summary?.avg_attendance ? `${summary.avg_attendance}%` : '—', c:C.yellow },
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

      {/* TFF Trend Chart - Phase 2 */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700 }}>TFF & Engagements Trend</div>
          <div style={{ display:'flex', gap:10 }}>
            {[{c:C.green,l:'TFF'}, {c:C.blue,l:'Engagements'}].map(l => (
              <div key={l.l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.gray }}>
                <div style={{ width:10, height:10, borderRadius:2, background:l.c }}/>{l.l}
              </div>
            ))}
          </div>
        </div>
        
        {loading ? (
          <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>Loading chart...</div>
        ) : (
          <div style={{ height:240, width:'100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colTff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.green} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colEng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.blue} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill:C.grayd, fontSize:10}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill:C.grayd, fontSize:10}} 
                />
                <Tooltip 
                  contentStyle={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:12, fontSize:12 }}
                  itemStyle={{ fontSize:11, fontWeight:700 }}
                />
                <Area type="monotone" dataKey="tff" stroke={C.green} fillOpacity={1} fill="url(#colTff)" strokeWidth={2} />
                <Area type="monotone" dataKey="engagements" stroke={C.blue} fillOpacity={1} fill="url(#colEng)" strokeWidth={2} />
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
          ) : topPerformers.map((fe, i) => (
            <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 0', borderBottom: i < topPerformers.length-1 ? `1px solid ${C.border}40` : 'none' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background: i===0?'rgba(255,184,0,0.15)':i===1?'rgba(122,139,160,0.1)':i===2?'rgba(205,127,50,0.15)':'rgba(62,158,255,0.1)',
                display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:800,
                color: i===0?C.yellow:i===1?C.gray:i===2?'#CD7F32':C.blue, flexShrink:0 }}>#{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{fe.name}</div>
                <div style={{ fontSize:11, color:C.grayd }}>{fe.zone} · {fe.attendance}% att.</div>
              </div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.green }}>{fe.tff}</div>
            </div>
          ))}
        </div>

        {/* Zone breakdown */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Zone Breakdown</div>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>Loading...</div>
          ) : zones.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>No data available</div>
          ) : zones.map((z, i) => {
            const colors = [C.blue, C.green, C.yellow, C.purple];
            const col = colors[i % colors.length];
            const tffVal = z.tff ?? 0;
            const pct = z.target ? Math.round((tffVal / z.target) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{z.zone}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:col }}>{pct}%</span>
                </div>
                <div style={{ height:6, background:C.s2, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:C.grayd, marginTop:4 }}>{z.tff || 0} / {z.target} TFF</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TFF Activity Heatmap (live) ── */}
      <ContactActivityHeatmap data={heatmap} loading={heatmapLoading} />

      {/* Activity feed */}
      {activity.length > 0 && (
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Live Activity Feed</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {activity.slice(0, 8).map((a, i) => (
              <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'8px 0', borderBottom: i < Math.min(activity.length,8)-1 ? `1px solid ${C.border}40` : 'none' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:C.green, flexShrink:0 }}/>
                <div style={{ flex:1, fontSize:13, color:C.gray }}>{a.message}</div>
                <div style={{ fontSize:11, color:C.grayd, flexShrink:0 }}>{a.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
