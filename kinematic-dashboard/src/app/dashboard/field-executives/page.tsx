
'use client';
import { useState } from 'react';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',s3:'#1A2438',border:'#1E2D45' };

const MOCK_FES = [
  { id:'1', name:'Divya Nair',   employee_id:'FE-001', zone:'Zone H', supervisor:'Vikram Nair', status:'active',  is_checked_in:true,  today_cc:48, today_ecc:40, today_hours:7.2, monthly_attendance:20, mobile:'9876543210', joined_date:'2024-01-15' },
  { id:'2', name:'Priya Sharma', employee_id:'FE-002', zone:'Zone B', supervisor:'Anita Das',   status:'active',  is_checked_in:true,  today_cc:43, today_ecc:35, today_hours:6.8, monthly_attendance:19, mobile:'9876543211', joined_date:'2024-02-01' },
  { id:'3', name:'Rajiv Kumar',  employee_id:'FE-003', zone:'Zone A', supervisor:'Vikram Nair', status:'active',  is_checked_in:true,  today_cc:38, today_ecc:28, today_hours:6.1, monthly_attendance:18, mobile:'9876543212', joined_date:'2024-03-01' },
  { id:'4', name:'Sara Khan',    employee_id:'FE-004', zone:'Zone D', supervisor:'Riya Patel',  status:'active',  is_checked_in:true,  today_cc:35, today_ecc:27, today_hours:5.5, monthly_attendance:21, mobile:'9876543213', joined_date:'2024-01-20' },
  { id:'5', name:'Amit Singh',   employee_id:'FE-005', zone:'Zone C', supervisor:'Anita Das',   status:'active',  is_checked_in:false, today_cc:0,  today_ecc:0,  today_hours:0,   monthly_attendance:16, mobile:'9876543214', joined_date:'2024-04-01', on_break:true },
  { id:'6', name:'Dev Patel',    employee_id:'FE-006', zone:'Zone E', supervisor:'Riya Patel',  status:'inactive',is_checked_in:false, today_cc:0,  today_ecc:0,  today_hours:0,   monthly_attendance:12, mobile:'9876543215', joined_date:'2024-02-15' },
  { id:'7', name:'Neha Gupta',   employee_id:'FE-007', zone:'Zone F', supervisor:'Vikram Nair', status:'active',  is_checked_in:true,  today_cc:31, today_ecc:24, today_hours:5.8, monthly_attendance:20, mobile:'9876543216', joined_date:'2024-03-10' },
];

export default function FieldExecutivesPage() {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [selected, setSelected] = useState<typeof MOCK_FES[0] | null>(null);

  const shown = MOCK_FES.filter(fe => {
    const matchSearch = fe.name.toLowerCase().includes(search.toLowerCase()) ||
                        fe.employee_id.toLowerCase().includes(search.toLowerCase()) ||
                        fe.zone.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || 
                        (filter === 'checked_in' && fe.is_checked_in) ||
                        (filter === 'absent' && !fe.is_checked_in && fe.status === 'active') ||
                        (filter === 'inactive' && fe.status === 'inactive');
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header row */}
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ flex:1, position:'relative' }}>
          <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', opacity:0.35 }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ID, or zone..."
            style={{ width:'100%', background:'#0E1420', border:'1px solid #1E2D45', color:'#E8EDF8', borderRadius:12, padding:'10px 14px 10px 36px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif" }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {['all','checked_in','absent','inactive'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding:'9px 14px', borderRadius:10, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s', background: filter===f ? C.red : '#0E1420', borderColor: filter===f ? C.red : '#1E2D45', color: filter===f ? '#fff' : C.gray }}>
              {f === 'all' ? `All (${MOCK_FES.length})` : f === 'checked_in' ? `Checked In` : f === 'absent' ? 'Absent' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
        {shown.map((fe, i) => (
          <div key={fe.id} onClick={() => setSelected(fe)}
            style={{ background:'#0E1420', border:`1px solid ${fe.is_checked_in ? C.green+'28' : '#1E2D45'}`, borderRadius:16, padding:18, cursor:'pointer', transition:'all 0.15s', animation:`fadeUp 0.4s ${i*0.04}s ease both` }}
            onMouseEnter={e => { e.currentTarget.style.background = '#131B2A'; e.currentTarget.style.borderColor = '#253650'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0E1420'; e.currentTarget.style.borderColor = fe.is_checked_in ? C.green+'28' : '#1E2D45'; }}
          >
            <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:14 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:'rgba(62,158,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:C.blue, flexShrink:0 }}>
                {fe.name[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{fe.name}</div>
                <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{fe.employee_id} · {fe.zone}</div>
              </div>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                background: fe.is_checked_in ? 'rgba(0,217,126,0.12)' : fe.status==='inactive' ? 'rgba(122,139,160,0.1)' : 'rgba(224,30,44,0.1)',
                color: fe.is_checked_in ? C.green : fe.status==='inactive' ? C.gray : C.red,
              }}>{fe.is_checked_in ? '● Active' : fe.status==='inactive' ? 'Inactive' : 'Absent'}</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              {[
                { l:'CC Today', v:fe.today_cc, c:C.blue },
                { l:'ECC Today', v:fe.today_ecc, c:C.green },
                { l:'Hours', v:`${fe.today_hours}h`, c:C.yellow },
              ].map(s => (
                <div key={s.l} style={{ background:C.s2, borderRadius:10, padding:'9px 0', textAlign:'center' }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:C.grayd }}>
              <span>Supervisor: {fe.supervisor}</span>
              <span>Att: {fe.monthly_attendance}/22</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {selected && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation:'fadeIn 0.2s ease' }}>
          <div style={{ background:'#0E1420', border:'1px solid #1E2D45', borderRadius:22, width:'100%', maxWidth:480, padding:28, animation:'fadeUp 0.3s ease', position:'relative' }}>
            <button onClick={() => setSelected(null)} style={{ position:'absolute', top:16, right:16, background:'#131B2A', border:'1px solid #1E2D45', borderRadius:9, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray }}>✕</button>

            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
              <div style={{ width:60, height:60, borderRadius:18, background:'rgba(62,158,255,0.12)', border:'1.5px solid rgba(62,158,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:26, color:C.blue }}>
                {selected.name[0]}
              </div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>{selected.name}</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>{selected.employee_id} · {selected.zone}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, marginTop:6, display:'inline-block',
                  background: selected.is_checked_in ? 'rgba(0,217,126,0.12)' : 'rgba(224,30,44,0.1)',
                  color: selected.is_checked_in ? C.green : C.red,
                }}>{selected.is_checked_in ? '● Checked In' : 'Not Checked In'}</span>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {[
                { l:'Mobile', v:selected.mobile }, { l:'Supervisor', v:selected.supervisor },
                { l:'Joined', v:new Date(selected.joined_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) },
                { l:'Attendance', v:`${selected.monthly_attendance}/22 days` },
              ].map(r => (
                <div key={r.l} style={{ background:C.s2, borderRadius:11, padding:'11px 13px' }}>
                  <div style={{ fontSize:10, color:C.grayd, marginBottom:4 }}>{r.l}</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{r.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[
                { l:'CC Today', v:selected.today_cc, c:C.blue },
                { l:'ECC Today', v:selected.today_ecc, c:C.green },
                { l:'Hours Today', v:`${selected.today_hours}h`, c:C.yellow },
              ].map(s => (
                <div key={s.l} style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:13, padding:'14px 0', textAlign:'center' }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:C.grayd, marginTop:3 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
