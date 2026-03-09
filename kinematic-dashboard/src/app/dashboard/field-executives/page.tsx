'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',s3:'#1A2438',border:'#1E2D45' };

interface FieldExecutive {
  id: string;
  name: string;
  employee_id?: string;
  mobile?: string;
  role: string;
  status: string;
  is_active: boolean;
  zone_id?: string;
  zones?: { name: string };
  supervisor_id?: string;
  supervisor?: { name: string };
  created_at: string;
  // from attendance view (if joined)
  is_checked_in?: boolean;
  today_cc?: number;
  today_ecc?: number;
  hours_worked?: number;
  monthly_attendance?: number;
}

export default function FieldExecutivesPage() {
  const [fes, setFes] = useState<FieldExecutive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<FieldExecutive | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all users with role=field_executive
      const res = await api.get<any>('/api/v1/users?role=field_executive');
      const d = res as any;
      const users = d.data || d.users || (Array.isArray(d) ? d : []);
      setFes(users);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load field executives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const shown = fes.filter(fe => {
    const matchSearch = !search ||
      fe.name?.toLowerCase().includes(search.toLowerCase()) ||
      fe.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
      fe.zones?.name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      (filter === 'checked_in' && fe.is_checked_in) ||
      (filter === 'absent' && !fe.is_checked_in && fe.is_active) ||
      (filter === 'inactive' && !fe.is_active);
    return matchSearch && matchFilter;
  });

  const checkedIn = fes.filter(fe => fe.is_checked_in).length;
  const absent    = fes.filter(fe => !fe.is_checked_in && fe.is_active).length;
  const inactive  = fes.filter(fe => !fe.is_active).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { l:'Total FEs', v:fes.length, c:C.blue },
          { l:'Checked In', v:checkedIn, c:C.green },
          { l:'Absent Today', v:absent, c:C.red },
          { l:'Inactive', v:inactive, c:C.gray },
        ].map((s, i) => (
          <div key={i} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:6 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ flex:1, position:'relative', minWidth:220 }}>
          <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', opacity:0.35 }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ID, or zone..."
            style={{ width:'100%', background:'#0E1420', border:`1px solid ${C.border}`, color:'#E8EDF8', borderRadius:12, padding:'10px 14px 10px 36px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif" }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['all',`All (${fes.length})`],['checked_in','Checked In'],['absent','Absent'],['inactive','Inactive']].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'9px 14px', borderRadius:10, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
                background: filter===f ? C.red : '#0E1420', borderColor: filter===f ? C.red : C.border, color: filter===f ? '#fff' : C.gray }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={fetchData} style={{ padding:'9px 16px', background:C.s2, border:`1px solid ${C.border}`, color:C.gray, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Refresh
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading field executives...</div>
      ) : shown.length === 0 ? (
        <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>No field executives found</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {shown.map((fe, i) => (
            <div key={fe.id} onClick={() => setSelected(fe)}
              style={{ background:'#0E1420', border:`1px solid ${fe.is_checked_in ? C.green+'28' : C.border}`, borderRadius:16, padding:18, cursor:'pointer', transition:'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.s2; e.currentTarget.style.borderColor = '#253650'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0E1420'; e.currentTarget.style.borderColor = fe.is_checked_in ? C.green+'28' : C.border; }}>
              <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:14 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:'rgba(62,158,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:C.blue, flexShrink:0 }}>
                  {fe.name?.[0] || '?'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{fe.name}</div>
                  <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{fe.employee_id || fe.id.slice(0,8)} · {fe.zones?.name || 'No zone'}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                  background: fe.is_checked_in ? 'rgba(0,217,126,0.12)' : !fe.is_active ? 'rgba(122,139,160,0.1)' : 'rgba(224,30,44,0.1)',
                  color: fe.is_checked_in ? C.green : !fe.is_active ? C.gray : C.red }}>
                  {fe.is_checked_in ? '● Active' : !fe.is_active ? 'Inactive' : 'Absent'}
                </span>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                {[
                  { l:'CC Today', v: fe.today_cc ?? '—', c:C.blue },
                  { l:'ECC Today', v: fe.today_ecc ?? '—', c:C.green },
                  { l:'Hours', v: fe.hours_worked != null ? `${fe.hours_worked.toFixed(1)}h` : '—', c:C.yellow },
                ].map(s => (
                  <div key={s.l} style={{ background:C.s2, borderRadius:10, padding:'9px 0', textAlign:'center' }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:C.grayd }}>
                <span>{fe.zones?.name || 'No zone assigned'}</span>
                <span>Joined {new Date(fe.created_at).toLocaleDateString('en-IN', { month:'short', year:'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:22, width:'100%', maxWidth:480, padding:28, position:'relative' }}>
            <button onClick={() => setSelected(null)}
              style={{ position:'absolute', top:16, right:16, background:C.s2, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:16 }}>✕</button>

            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
              <div style={{ width:60, height:60, borderRadius:18, background:'rgba(62,158,255,0.12)', border:'1.5px solid rgba(62,158,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:26, color:C.blue }}>
                {selected.name?.[0] || '?'}
              </div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>{selected.name}</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>{selected.employee_id || selected.id.slice(0,8)} · {selected.zones?.name || 'No zone'}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, marginTop:6, display:'inline-block',
                  background: selected.is_active ? 'rgba(0,217,126,0.12)' : 'rgba(224,30,44,0.1)',
                  color: selected.is_active ? C.green : C.red }}>
                  {selected.is_active ? '● Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {[
                { l:'Mobile', v: selected.mobile || '—' },
                { l:'Zone', v: selected.zones?.name || '—' },
                { l:'Role', v: selected.role },
                { l:'Joined', v: new Date(selected.created_at).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) },
              ].map(r => (
                <div key={r.l} style={{ background:C.s2, borderRadius:11, padding:'11px 13px' }}>
                  <div style={{ fontSize:10, color:C.grayd, marginBottom:4 }}>{r.l}</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{r.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[
                { l:'CC Today', v: selected.today_cc ?? '—', c:C.blue },
                { l:'ECC Today', v: selected.today_ecc ?? '—', c:C.green },
                { l:'Hours Today', v: selected.hours_worked != null ? `${selected.hours_worked.toFixed(1)}h` : '—', c:C.yellow },
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
