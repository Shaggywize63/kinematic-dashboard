
'use client';
import { useState } from 'react';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

const ITEMS = [
  { id:'1', name:'Product SKU-001 (Mint)',  sku:'SKU-001', total:1200, allocated:950, consumed:720, category:'product' },
  { id:'2', name:'Product SKU-002 (Classic)', sku:'SKU-002', total:800,  allocated:650, consumed:480, category:'product' },
  { id:'3', name:'Product SKU-003 (Premium)', sku:'SKU-003', total:400,  allocated:300, consumed:210, category:'product' },
  { id:'4', name:'Display Stand Type A',    sku:'DSP-001', total:60,   allocated:48,  consumed:48,  category:'tool' },
  { id:'5', name:'Promotional Kit',         sku:'PRK-001', total:200,  allocated:150, consumed:130, category:'asset' },
];

export default function WarehousePage() {
  const [filter, setFilter] = useState('all');
  const shown = ITEMS.filter(i => filter === 'all' || i.category === filter);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', gap:8 }}>
        {['all','product','tool','asset'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:'9px 16px', borderRadius:10, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background: filter===f ? C.blue : '#0E1420', borderColor: filter===f ? C.blue : '#1E2D45', color: filter===f ? '#fff' : C.gray, transition:'all 0.15s', textTransform:'capitalize' }}>{f}</button>
        ))}
      </div>

      <div style={{ display:'flex', gap:12 }}>
        {[{l:'Total SKUs',v:String(ITEMS.length),c:C.blue},{l:'Low Stock',v:'1',c:C.red},{l:'Fully Allocated',v:'2',c:C.green}].map(s => (
          <div key={s.l} style={{ flex:1, background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {shown.map((item, i) => {
        const allocPct = Math.round((item.allocated / item.total) * 100);
        const consPct  = Math.round((item.consumed  / item.total) * 100);
        const remaining = item.allocated - item.consumed;
        const isLow = remaining < 50 && item.category === 'product';
        return (
          <div key={i} style={{ background:'#0E1420', border:`1px solid ${isLow ? C.red+'30' : C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700 }}>{item.name}</div>
                <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{item.sku} · <span style={{ textTransform:'capitalize' }}>{item.category}</span></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {isLow && <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'rgba(224,30,44,0.12)', color:C.red }}>LOW STOCK</span>}
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'rgba(62,158,255,0.1)', color:C.blue }}>Total: {item.total}</span>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[{l:'Allocated',v:item.allocated,p:allocPct,c:C.blue},{l:'Consumed',v:item.consumed,p:consPct,c:C.green},{l:'Remaining',v:remaining,p:Math.round((remaining/item.total)*100),c:isLow?C.red:C.yellow}].map(s => (
                <div key={s.l}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
                    <span style={{ color:C.gray }}>{s.l}</span>
                    <span style={{ fontWeight:700, color:s.c }}>{s.v}</span>
                  </div>
                  <div style={{ height:5, background:C.s2, borderRadius:2.5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${s.p}%`, background:s.c, borderRadius:2.5 }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
