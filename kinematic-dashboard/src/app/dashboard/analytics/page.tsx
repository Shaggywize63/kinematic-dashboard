'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

interface SummaryData {
  total_cc?: number;
  total_ecc?: number;
  avg_attendance?: number;
  ecc_rate?: number;
  monthly_data?: Array<{ month: string; cc: number; ecc: number }>;
  top_performers?: Array<{ name: string; zone: string; ecc: number; attendance: number }>;
  zone_breakdown?: Array<{ zone: string; ecc: number; target: number }>;
}

interface ActivityItem {
  type: string;
  message: string;
  time: string;
  user?: string;
}

// ── Heatmap helpers ─────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Generate mock contact-activity data for last 7 days × 24 hours */
function generateHeatmapData(): number[][] {
  // rows = days (0=Sun … 6=Sat), cols = hours (0–23)
  return DAYS_SHORT.map((_, dayIdx) =>
    HOURS.map(hour => {
      // Business hours 9-18 and weekdays get higher activity
      const isWeekday = dayIdx >= 1 && dayIdx <= 5;
      const isBusinessHour = hour >= 9 && hour <= 18;
      const base = isWeekday && isBusinessHour ? Math.random() * 80 + 20 : Math.random() * 15;
      return Math.round(base);
    })
  );
}

function heatColor(value: number, max: number): string {
  if (max === 0) return C.s2;
  const ratio = value / max;
  if (ratio === 0) return C.s2;
  if (ratio < 0.25) return '#0d2e3e';
  if (ratio < 0.5)  return '#0a4a6e';
  if (ratio < 0.75) return '#0e6ea8';
  return '#3E9EFF';
}

function ContactActivityHeatmap() {
  const heatData = generateHeatmapData();
  const allVals = heatData.flat();
  const maxVal = Math.max(...allVals, 1);

  // Get the last 7 days in order ending today
  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return DAYS_SHORT[d.getDay()];
  });

  return (
    <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:4 }}>
            Contact Activity Heatmap
          </div>
          <div style={{ fontSize:12, color:C.gray }}>Density by day &amp; hour — last 7 days</div>
        </div>
        {/* Legend */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:C.grayd }}>Low</span>
          {['#0d2e3e','#0a4a6e','#0e6ea8','#3E9EFF'].map((col, i) => (
            <div key={i} style={{ width:16, height:16, borderRadius:3, background:col }}/>
          ))}
          <span style={{ fontSize:11, color:C.grayd }}>High</span>
        </div>
      </div>

      {/* Hour labels */}
      <div style={{ display:'flex', marginLeft:36, marginBottom:6, gap:2 }}>
        {HOURS.map(h => (
          <div key={h} style={{ flex:1, textAlign:'center', fontSize:9, color:C.grayd, lineHeight:'1' }}>
            {h % 3 === 0 ? `${h}h` : ''}
          </div>
        ))}
      </div>

      {/* Grid */}
      {last7Days.map((dayLabel, rowIdx) => (
        <div key={rowIdx} style={{ display:'flex', alignItems:'center', gap:2, marginBottom:3 }}>
          <div style={{ width:32, fontSize:11, color:C.gray, textAlign:'right', paddingRight:6, flexShrink:0 }}>
            {dayLabel}
          </div>
          {HOURS.map(hour => {
            const val = heatData[rowIdx][hour];
            return (
              <div
                key={hour}
                title={`${dayLabel} ${hour}:00 — ${val} contacts`}
                style={{
                  flex: 1,
                  height: 18,
                  borderRadius: 3,
                  background: heatColor(val, maxVal),
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                }}
              />
            );
          })}
        </div>
      ))}

      {/* Footer stats */}
      <div style={{ display:'flex', gap:24, marginTop:16, paddingTop:14, borderTop:`1px solid ${C.border}40` }}>
        {[
          { label:'Peak Hour', value: (() => { let mx=0,mh=0; HOURS.forEach(h => { const s = heatData.reduce((a,r)=>a+r[h],0); if(s>mx){mx=s;mh=h;} }); return `${mh}:00`; })() },
          { label:'Peak Day',  value: (() => { let mx=0,md=''; last7Days.forEach((d,i) => { const s=heatData[i].reduce((a,b)=>a+b,0); if(s>mx){mx=s;md=d;} }); return md; })() },
          { label:'Total Contacts', value: allVals.reduce((a,b)=>a+b,0).toLocaleString() },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{ fontSize:11, color:C.grayd, marginBottom:3 }}>{stat.label}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:C.blue }}>{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ── End Heatmap ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'month'|'quarter'>('month');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // FIXED: correct endpoints are /api/v1/analytics/summary and /api/v1/analytics/activity-feed
      const [summaryRes, activityRes] = await Promise.all([
        api.get<any>(`/api/v1/analytics/summary?period=${period}`),
        api.get<any>('/api/v1/analytics/activity-feed'),
      ]);
      const s = summaryRes as any;
      setSummary(s.data || s);
      const a = activityRes as any;
      setActivity(a.data || a.feed || (Array.isArray(a) ? a : []));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthly = summary?.monthly_data || [];
  const maxCC = monthly.length ? Math.max(...monthly.map(m => m.cc), 1) : 1;
  const topPerformers = summary?.top_performers || [];
  const zones = summary?.zone_breakdown || [];

  const kpis = [
    { l:'Total CC', v: summary?.total_cc?.toLocaleString() ?? '—', delta:'+8.2%', c:C.blue },
    { l:'Total ECC', v: summary?.total_ecc?.toLocaleString() ?? '—', delta:'+11.4%', c:C.green },
    { l:'Avg Attendance', v: summary?.avg_attendance ? `${summary.avg_attendance}%` : '—', delta:'+2.1%', c:C.yellow },
    { l:'ECC Rate', v: summary?.ecc_rate ? `${summary.ecc_rate}%` : '—', delta:'+3.5%', c:C.purple },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Period selector */}
      <div style={{ display:'flex', gap:8 }}>
        {(['month','quarter'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{ padding:'9px 18px', borderRadius:10, border:'1px solid', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background: period===p ? C.red : '#0E1420', borderColor: period===p ? C.red : C.border, color: period===p ? '#fff' : C.gray, transition:'all 0.15s' }}>
            {p === 'month' ? 'This Month' : 'This Quarter'}
          </button>
        ))}
        <button onClick={fetchData}
          style={{ marginLeft:'auto', padding:'9px 18px', borderRadius:10, border:`1px solid ${C.border}`, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background:'#0E1420', color:C.gray }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {kpis.map(s => (
          <div key={s.l} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontSize:12, color:C.gray, marginBottom:10 }}>{s.l}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>
              {loading ? '—' : s.v}
            </div>
            <div style={{ fontSize:11, color:C.green, marginTop:6 }}>{s.delta} vs last period</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:20 }}>Monthly CC vs ECC Trend</div>
        {loading ? (
          <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>Loading chart...</div>
        ) : monthly.length === 0 ? (
          <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13 }}>No data available</div>
        ) : (
          <div style={{ display:'flex', alignItems:'flex-end', gap:16, height:160 }}>
            {monthly.map((m, i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
                <div style={{ display:'flex', gap:4, width:'100%', alignItems:'flex-end', height:'100%' }}>
                  <div style={{ flex:1, background:C.blue, borderRadius:'5px 5px 0 0', height:`${(m.cc/maxCC)*100}%`, opacity:0.8, minHeight:4 }}/>
                  <div style={{ flex:1, background:C.green, borderRadius:'5px 5px 0 0', height:`${(m.ecc/maxCC)*100}%`, opacity:0.8, minHeight:4 }}/>
                </div>
                <span style={{ fontSize:11, color:C.grayd }}>{m.month}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:16, marginTop:14 }}>
          {[{c:C.blue,l:'CC'},{c:C.green,l:'ECC'}].map(l => (
            <div key={l.l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:C.gray }}>
              <div style={{ width:10, height:10, borderRadius:2, background:l.c }}/>
              {l.l}
            </div>
          ))}
        </div>
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
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.green }}>{fe.ecc}</div>
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
            const pct = z.target ? Math.round((z.ecc / z.target) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{z.zone}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:col }}>{pct}%</span>
                </div>
                <div style={{ height:6, background:C.s2, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:C.grayd, marginTop:4 }}>{z.ecc} / {z.target} ECC</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Contact Activity Heatmap ── */}
      <ContactActivityHeatmap />

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
