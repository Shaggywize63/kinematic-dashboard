
'use client';
import { useState } from 'react';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

const MONTHLY = [
  { month:'Jan', cc:5200, ecc:3900 }, { month:'Feb', cc:5800, ecc:4400 },
  { month:'Mar', cc:6100, ecc:4700 }, { month:'Apr', cc:5700, ecc:4300 },
  { month:'May', cc:6400, ecc:4900 }, { month:'Jun', cc:5500, ecc:4200 },
];

const TOP = [
  { name:'Divya Nair', zone:'H', ecc:210, att:98 },
  { name:'Priya Sharma', zone:'B', ecc:186, att:96 },
  { name:'Sara Khan', zone:'D', ecc:171, att:94 },
  { name:'Rajiv Kumar', zone:'A', ecc:154, att:91 },
  { name:'Neha Gupta', zone:'F', ecc:149, att:89 },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'month'|'quarter'>('month');
  const maxCC = Math.max(...MONTHLY.map(m => m.cc));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Period selector */}
      <div style={{ display:'flex', gap:8 }}>
        {(['month','quarter'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ padding:'9px 18px', borderRadius:10, border:'1px solid', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background: period===p ? C.red : '#0E1420', borderColor: period===p ? C.red : '#1E2D45', color: period===p ? '#fff' : C.gray, transition:'all 0.15s' }}>
            {p === 'month' ? 'This Month' : 'This Quarter'}
          </button>
        ))}
      </div>

      {/* Summary KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { l:'Total CC', v:'33,700', delta:'+8.2%', c:C.blue },
          { l:'Total ECC', v:'25,900', delta:'+11.4%', c:C.green },
          { l:'Avg Attendance', v:'84%', delta:'+2.1%', c:C.yellow },
          { l:'ECC Rate', v:'76.8%', delta:'+3.5%', c:C.purple },
        ].map(s => (
          <div key={s.l} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontSize:12, color:C.gray, marginBottom:10 }}>{s.l}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:11, color:C.green, marginTop:6 }}>{s.delta} vs last period</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:20 }}>Monthly CC vs ECC Trend</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:16, height:160 }}>
          {MONTHLY.map((m, i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
              <div style={{ display:'flex', gap:4, width:'100%', alignItems:'flex-end', height:'100%' }}>
                <div style={{ flex:1, background:C.blue, borderRadius:'5px 5px 0 0', height:`${(m.cc/maxCC)*100}%`, opacity:0.8, minHeight:4 }}/>
                <div style={{ flex:1, background:C.green, borderRadius:'5px 5px 0 0', height:`${(m.ecc/maxCC)*100}%`, opacity:0.8, minHeight:4 }}/>
              </div>
              <span style={{ fontSize:11, color:C.grayd }}>{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Top performers */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Top Performers</div>
          {TOP.map((fe, i) => (
            <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 0', borderBottom: i < TOP.length-1 ? `1px solid ${C.border}40` : 'none' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background: i===0?'rgba(255,184,0,0.15)':i===1?'rgba(122,139,160,0.1)':i===2?'rgba(205,127,50,0.15)':'rgba(62,158,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:800, color: i===0?C.yellow:i===1?C.gray:i===2?'#CD7F32':C.blue, flexShrink:0 }}>#{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{fe.name}</div>
                <div style={{ fontSize:11, color:C.grayd }}>Zone {fe.zone} · {fe.att}% att.</div>
              </div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.green }}>{fe.ecc}</div>
            </div>
          ))}
        </div>

        {/* Zone breakdown */}
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, marginBottom:16 }}>Zone Breakdown</div>
          {[
            { zone:'Zone A — Mumbai North', ecc:412, target:500, c:C.blue },
            { zone:'Zone B — Andheri',      ecc:398, target:480, c:C.green },
            { zone:'Zone C — Bandra',       ecc:310, target:460, c:C.yellow },
            { zone:'Zone D — Dadar',        ecc:390, target:420, c:C.purple },
          ].map((z, i) => {
            const p = Math.round((z.ecc / z.target)*100);
            return (
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{z.zone}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:z.c }}>{p}%</span>
                </div>
                <div style={{ height:6, background:C.s2, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${p}%`, background:z.c, borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:C.grayd, marginTop:4 }}>{z.ecc} / {z.target} ECC</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
