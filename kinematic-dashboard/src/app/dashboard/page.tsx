
'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

const C = {
  red:'#E01E2C', green:'#00D97E', yellow:'#FFB800', blue:'#3E9EFF',
  purple:'#9B6EFF', teal:'#00CEC9', gray:'#7A8BA0', grayd:'#2E445E',
  s2:'#131B2A', s3:'#1A2438', border:'#1E2D45',
};

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string;
}) {
  return (
    <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20, flex:1, minWidth:150 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ width:36, height:36, borderRadius:11, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            {icon.split(' M ').map((p,i) => <path key={i} d={i===0?p:'M '+p}/>)}
          </svg>
        </div>
        <span style={{ fontSize:12, color:C.gray, lineHeight:1.3 }}>{label}</span>
      </div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:34, fontWeight:800, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.grayd, marginTop:6 }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height:4, background:C.s2, borderRadius:2, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2, transition:'width 1s cubic-bezier(0.22,1,0.36,1)' }}/>
    </div>
  );
}

// Mock data for when API is not connected
const MOCK = {
  stats: { total_fes:47, checked_in_today:38, total_cc_today:312, total_ecc_today:241, avg_hours_today:6.4, attendance_rate:81, ecc_rate:77, active_sos:0, offline_forms:3, low_stock_alerts:2 },
  trend: [
    {day:'Mon', cc:280, ecc:210}, {day:'Tue', cc:310, ecc:235}, {day:'Wed', cc:295, ecc:228},
    {day:'Thu', cc:340, ecc:262}, {day:'Fri', cc:312, ecc:241},
  ],
  fes: [
    { name:'Divya Nair',    zone:'Zone H', cc:48, ecc:40, status:'active',  hours:7.2 },
    { name:'Priya Sharma',  zone:'Zone B', cc:43, ecc:35, status:'active',  hours:6.8 },
    { name:'Rajiv Kumar',   zone:'Zone A', cc:38, ecc:28, status:'active',  hours:6.1 },
    { name:'Sara Khan',     zone:'Zone D', cc:35, ecc:27, status:'break',   hours:5.5 },
    { name:'Amit Singh',    zone:'Zone C', cc:29, ecc:22, status:'active',  hours:5.1 },
    { name:'Dev Patel',     zone:'Zone E', cc:0,  ecc:0,  status:'absent',  hours:0   },
  ],
};

export default function DashboardHome() {
  const [stats]    = useState(MOCK.stats);
  const [fes]      = useState(MOCK.fes);
  const [trend]    = useState(MOCK.trend);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const maxCC = Math.max(...trend.map(t => t.cc));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, animation:'fadeUp 0.4s ease both' }}>

      {/* KPI row */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'1.2px', color:C.grayd, textTransform:'uppercase', marginBottom:14 }}>TODAY AT A GLANCE</div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <StatCard label="Checked In" value={`${stats.checked_in_today}/${stats.total_fes}`} sub={`${stats.attendance_rate}% attendance`} color={C.green} icon="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z"/>
          <StatCard label="Consumer Contacts" value={stats.total_cc_today} sub="Total engagements" color={C.red} icon="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z"/>
          <StatCard label="Effective (ECC)" value={stats.total_ecc_today} sub={`${stats.ecc_rate}% conversion`} color={C.blue} icon="M20 6L9 17l-5-5"/>
          <StatCard label="Avg Hours" value={`${stats.avg_hours_today}h`} sub="Per active FE" color={C.yellow} icon="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2"/>
        </div>
      </div>

      {/* Alerts row */}
      {(stats.active_sos > 0 || stats.offline_forms > 0 || stats.low_stock_alerts > 0) && (
        <div style={{ display:'flex', gap:10 }}>
          {stats.active_sos > 0 && (
            <div style={{ flex:1, background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.25)', borderRadius:13, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:C.red, animation:'pulse 1.5s infinite' }}/>
              <span style={{ fontSize:13, fontWeight:700, color:C.red }}>{stats.active_sos} Active SOS Alert{stats.active_sos > 1 ? 's' : ''}</span>
            </div>
          )}
          {stats.offline_forms > 0 && (
            <div style={{ flex:1, background:'rgba(255,184,0,0.08)', border:'1px solid rgba(255,184,0,0.2)', borderRadius:13, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, color:C.yellow }}>⚠ {stats.offline_forms} offline forms pending sync</span>
            </div>
          )}
          {stats.low_stock_alerts > 0 && (
            <div style={{ flex:1, background:'rgba(62,158,255,0.08)', border:'1px solid rgba(62,158,255,0.2)', borderRadius:13, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, color:C.blue }}>📦 {stats.low_stock_alerts} items running low</span>
            </div>
          )}
        </div>
      )}

      {/* Chart + FE table row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:16 }}>

        {/* Weekly trend chart */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:4 }}>Weekly CC vs ECC</div>
          <div style={{ fontSize:12, color:C.gray, marginBottom:18 }}>Current week performance</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:120 }}>
            {trend.map((t, i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
                <div style={{ width:'100%', display:'flex', gap:3, alignItems:'flex-end', height:'100%' }}>
                  <div style={{ flex:1, background:`${C.blue}50`, borderRadius:'4px 4px 0 0', height:`${(t.cc/maxCC)*100}%`, minHeight:4, position:'relative' }}>
                    <div style={{ position:'absolute', inset:0, background:C.blue, borderRadius:'4px 4px 0 0', opacity:0.7 }}/>
                  </div>
                  <div style={{ flex:1, background:`${C.green}50`, borderRadius:'4px 4px 0 0', height:`${(t.ecc/maxCC)*100}%`, minHeight:4, position:'relative' }}>
                    <div style={{ position:'absolute', inset:0, background:C.green, borderRadius:'4px 4px 0 0', opacity:0.7 }}/>
                  </div>
                </div>
                <span style={{ fontSize:10, color:C.grayd }}>{t.day}</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:16, marginTop:12 }}>
            {[{l:'CC',c:C.blue},{l:'ECC',c:C.green}].map(l => (
              <div key={l.l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.gray }}>
                <div style={{ width:10, height:10, borderRadius:2, background:l.c }}/>
                {l.l}
              </div>
            ))}
          </div>
        </div>

        {/* FE activity table */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700 }}>Field Executive Activity</div>
              <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>Live — updated every 60s</div>
            </div>
            <a href="/dashboard/field-executives" style={{ fontSize:12, color:C.red, textDecoration:'none', fontWeight:600 }}>View all →</a>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto', gap:'0 12px', borderBottom:`1px solid ${C.border}`, paddingBottom:8, marginBottom:8 }}>
            {['Name', 'CC', 'ECC', 'Hours', 'Status'].map(h => (
              <span key={h} style={{ fontSize:10, fontWeight:700, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>{h}</span>
            ))}
          </div>
          {fes.map((fe, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto', gap:'0 12px', alignItems:'center', padding:'9px 0', borderBottom: i < fes.length-1 ? `1px solid ${C.border}40` : 'none' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{fe.name}</div>
                <div style={{ fontSize:11, color:C.grayd }}>{fe.zone}</div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:C.blue }}>{fe.cc}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.green }}>{fe.ecc}</span>
              <span style={{ fontSize:13, color:C.gray }}>{fe.hours}h</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20,
                background: fe.status==='active'?'rgba(0,217,126,0.12)':fe.status==='break'?'rgba(255,184,0,0.12)':'rgba(224,30,44,0.12)',
                color: fe.status==='active'?C.green:fe.status==='break'?C.yellow:C.red
              }}>{fe.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone performance */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:4 }}>Zone Performance</div>
        <div style={{ fontSize:12, color:C.gray, marginBottom:18 }}>ECC targets — June 2024</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
          {[
            {zone:'Zone A — Mumbai North', target:500, actual:412, color:C.blue},
            {zone:'Zone B — Andheri',      target:480, actual:398, color:C.green},
            {zone:'Zone C — Bandra',       target:460, actual:310, color:C.yellow},
            {zone:'Zone D — Dadar',        target:420, actual:390, color:C.purple},
          ].map((z, i) => {
            const p = Math.round((z.actual / z.target) * 100);
            return (
              <div key={i} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:13, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:10, lineHeight:1.3 }}>{z.zone}</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:z.color, marginBottom:4 }}>{p}%</div>
                <div style={{ fontSize:11, color:C.grayd, marginBottom:8 }}>{z.actual} / {z.target} ECC</div>
                <ProgressBar pct={p} color={z.color}/>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
