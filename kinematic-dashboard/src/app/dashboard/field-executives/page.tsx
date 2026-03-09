'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

/* ─── colour palette matches the dashboard ─── */
const C = {
  bg:     '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white:  '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E', graydd: '#1A2738',
  red:    '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.2)',
  green:  '#00D97E', greenD: 'rgba(0,217,126,0.08)',
  blue:   '#3E9EFF', blueD: 'rgba(62,158,255,0.10)',
  yellow: '#FFB800', yellowD: 'rgba(255,184,0,0.08)',
  purple: '#9B6EFF', purpleD: 'rgba(155,110,255,0.08)',
};

/* ─── types ─── */
interface Zone { id: string; name: string; city?: string; }
interface FE {
  id: string; name: string; mobile?: string; employee_id?: string;
  role: string; is_active: boolean; zone_id?: string; supervisor_id?: string;
  zones?: { name: string }; created_at: string;
  is_checked_in?: boolean; today_cc?: number; today_ecc?: number; hours_worked?: number;
}
interface FormData {
  name: string; mobile: string; password: string; employee_id: string;
  zone_id: string; role: string; supervisor_id: string; joined_date: string;
}
const BLANK: FormData = {
  name:'', mobile:'', password:'', employee_id:'',
  zone_id:'', role:'executive', supervisor_id:'', joined_date:'',
};

/* ─── tiny helpers ─── */
const Spinner = () => (
  <div style={{ width:15, height:15, border:'2.5px solid rgba(255,255,255,0.18)', borderTopColor:'#fff', borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);
const Label = ({ text, req }: { text:string; req?:boolean }) => (
  <div style={{ fontSize:11, fontWeight:700, color:C.gray, letterSpacing:'0.7px', textTransform:'uppercase' as const, marginBottom:7 }}>
    {text}{req && <span style={{ color:C.red }}> *</span>}
  </div>
);
const baseInp: React.CSSProperties = {
  width:'100%', background:C.s3, border:`1.5px solid ${C.border}`, color:C.white,
  borderRadius:11, padding:'10px 13px', fontSize:13, outline:'none',
  fontFamily:"'DM Sans',sans-serif", transition:'border-color .15s',
};

/* ─── modal wrapper ─── */
const Overlay = ({ onClose, children }: { onClose:()=>void; children:React.ReactNode }) => (
  <div
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:500,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(6px)' }}>
    {children}
  </div>
);

/* ═══════════════════════════════════════════════════════════ */
export default function FieldExecutivesPage() {

  const [fes,    setFes]    = useState<FE[]>([]);
  const [zones,  setZones]  = useState<Zone[]>([]);
  const [sups,   setSups]   = useState<FE[]>([]);
  const [loading,setLoad]   = useState(true);
  const [err,    setErr]    = useState('');

  /* filters */
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all'|'active'|'inactive'|'in'>('all');

  /* modals */
  const [detailFe, setDetail] = useState<FE|null>(null);
  const [editFe,   setEditFe] = useState<FE|null>(null);
  const [showAdd,  setShowAdd]= useState(false);

  /* form */
  const [form,   setForm]  = useState<FormData>(BLANK);
  const [fErr,   setFErr]  = useState('');
  const [saving, setSaving]= useState(false);

  const setF = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── fetch ── */
  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [uRes, zRes, sRes] = await Promise.all([
        api.get<any>('/api/v1/users?role=executive&limit=100'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/users?role=supervisor&limit=100'),
      ]);
      const pick = (r: any) => (r as any)?.data ?? (Array.isArray(r) ? r : []);
      setFes(pick(uRes));
      setZones(pick(zRes));
      setSups(pick(sRes));
      setErr('');
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── CREATE ── */
  const handleCreate = async () => {
    if (!form.name || !form.mobile || !form.password) {
      setFErr('Name, mobile and password are required.'); return;
    }
    if (!/^\d{10}$/.test(form.mobile)) {
      setFErr('Mobile must be exactly 10 digits.'); return;
    }
    setSaving(true); setFErr('');
    try {
      await api.post('/api/v1/users', {
        name:          form.name.trim(),
        mobile:        form.mobile.trim(),
        password:      form.password,
        role:          form.role,
        employee_id:   form.employee_id   || undefined,
        zone_id:       form.zone_id       || undefined,
        supervisor_id: form.supervisor_id || undefined,
        joined_date:   form.joined_date   || undefined,
      });
      setShowAdd(false); setForm(BLANK); load();
    } catch (e: any) { setFErr(e.message || 'Failed to create user'); }
    finally { setSaving(false); }
  };

  /* ── UPDATE ── */
  const openEdit = (fe: FE) => {
    setEditFe(fe);
    setForm({
      name: fe.name, mobile: fe.mobile||'', password:'',
      employee_id: fe.employee_id||'', zone_id: fe.zone_id||'',
      role: fe.role, supervisor_id: fe.supervisor_id||'', joined_date:'',
    });
    setFErr('');
  };
  const handleUpdate = async () => {
    if (!editFe) return;
    setSaving(true); setFErr('');
    try {
      await api.patch(`/api/v1/users/${editFe.id}`, {
        name:          form.name.trim(),
        employee_id:   form.employee_id   || null,
        zone_id:       form.zone_id       || null,
        supervisor_id: form.supervisor_id || null,
        is_active:     editFe.is_active,
      });
      setEditFe(null); setDetail(null); load();
    } catch (e: any) { setFErr(e.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  /* ── TOGGLE ACTIVE ── */
  const toggleActive = async (fe: FE) => {
    try {
      await api.patch(`/api/v1/users/${fe.id}`, { is_active: !fe.is_active });
      load();
    } catch (e: any) { setErr(e.message); }
  };

  /* ── filtered list ── */
  const shown = fes.filter(fe => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || fe.name?.toLowerCase().includes(q)
      || (fe.employee_id||'').toLowerCase().includes(q)
      || (fe.zones?.name||'').toLowerCase().includes(q)
      || (fe.mobile||'').includes(q);
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'active'   ? fe.is_active :
      filter === 'inactive' ? !fe.is_active :
      !!fe.is_checked_in;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:  fes.length,
    active: fes.filter(f => f.is_active).length,
    in:     fes.filter(f => f.is_checked_in).length,
    off:    fes.filter(f => !f.is_active).length,
  };

  /* ─────────────────────────────────────── RENDER ──── */
  return (
    <>
      <style>{`
        @keyframes kspin { to { transform:rotate(360deg); } }
        @keyframes kfade { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .kcard { transition:background .14s, border-color .14s; }
        .kcard:hover { background:${C.s3} !important; border-color:${C.borderL} !important; }
        .kinp:focus { border-color:${C.blue} !important; }
        .kbtn { transition:opacity .13s, transform .13s; }
        .kbtn:hover { opacity:.82; }
        .kbtn:active { transform:scale(.96); }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:22, animation:'kfade .3s ease' }}>

        {/* error banner */}
        {err && (
          <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:12,
            padding:'11px 16px', fontSize:13, color:C.red, display:'flex', gap:9, alignItems:'center' }}>
            ⚠ {err}
            <button onClick={()=>setErr('')} style={{ marginLeft:'auto', background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        )}

        {/* ── stat cards ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
          {[
            { l:'Total FEs',  v:stats.total,  c:C.blue   },
            { l:'Active',     v:stats.active, c:C.green  },
            { l:'Checked In', v:stats.in,     c:C.purple },
            { l:'Inactive',   v:stats.off,    c:C.gray   },
          ].map(s => (
            <div key={s.l} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3, borderRadius:'3px 0 0 3px', background:s.c, opacity:.55 }}/>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:32, fontWeight:800, color:s.c, lineHeight:1 }}>{s.v}</div>
              <div style={{ fontSize:11, color:C.gray, marginTop:6, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── toolbar ── */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>

          {/* search */}
          <div style={{ flex:1, position:'relative', minWidth:220 }}>
            <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', opacity:.3 }}
              width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="kinp" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search name, ID, zone or mobile…"
              style={{ ...baseInp, paddingLeft:34, borderRadius:12 }}/>
          </div>

          {/* filter pills */}
          {(['all','active','inactive','in'] as const).map(f => (
            <button key={f} className="kbtn" onClick={()=>setFilter(f)}
              style={{ padding:'9px 14px', borderRadius:10,
                border:`1px solid ${filter===f ? C.red : C.border}`,
                fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap',
                background:filter===f ? C.red : C.s2, color:filter===f ? '#fff' : C.gray, transition:'all .15s' }}>
              {f==='in' ? 'Checked In' : f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}

          {/* add button */}
          <button className="kbtn" onClick={()=>{ setForm(BLANK); setFErr(''); setShowAdd(true); }}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px',
              background:C.red, border:'none', borderRadius:10, color:'#fff',
              fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              boxShadow:'0 4px 18px rgba(224,30,44,0.28)', flexShrink:0 }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Executive
          </button>

          <button className="kbtn" onClick={load}
            style={{ padding:'9px 13px', background:C.s2, border:`1px solid ${C.border}`,
              color:C.gray, borderRadius:10, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            ↻
          </button>
        </div>

        {/* ── card grid ── */}
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:C.grayd, fontSize:14 }}>
            {fes.length===0 ? 'No field executives yet — add the first one.' : 'No results match your search.'}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
            {shown.map(fe => (
              <div key={fe.id} className="kcard" onClick={()=>setDetail(fe)}
                style={{ background:C.s2, borderRadius:16, padding:18, cursor:'pointer',
                  border:`1px solid ${fe.is_checked_in ? C.green+'30' : fe.is_active ? C.border : C.graydd}`,
                  opacity: fe.is_active ? 1 : 0.6 }}>

                {/* header */}
                <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:14 }}>
                  <div style={{ width:44, height:44, borderRadius:13, flexShrink:0,
                    background: fe.is_active ? C.blueD : 'rgba(122,139,160,0.08)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18,
                    color: fe.is_active ? C.blue : C.gray }}>
                    {fe.name?.[0] || '?'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fe.name}</div>
                    <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{fe.employee_id || fe.id.slice(0,8)} · {fe.zones?.name || 'No zone'}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, flexShrink:0,
                    background: fe.is_checked_in ? C.greenD : !fe.is_active ? 'rgba(122,139,160,0.1)' : C.redD,
                    color: fe.is_checked_in ? C.green : !fe.is_active ? C.gray : C.red }}>
                    {fe.is_checked_in ? '● In' : !fe.is_active ? 'Off' : 'Absent'}
                  </span>
                </div>

                {/* mini stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7, marginBottom:13 }}>
                  {[
                    { l:'CC',  v: fe.today_cc  ?? '—', c:C.blue   },
                    { l:'ECC', v: fe.today_ecc ?? '—', c:C.green  },
                    { l:'Hrs', v: fe.hours_worked != null ? `${fe.hours_worked.toFixed(1)}h` : '—', c:C.yellow },
                  ].map(s => (
                    <div key={s.l} style={{ background:C.s3, borderRadius:9, padding:'8px 0', textAlign:'center' }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* footer with action buttons */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:C.grayd }}>{fe.mobile || '—'}</span>
                  <div style={{ display:'flex', gap:7 }} onClick={e=>e.stopPropagation()}>
                    {/* edit */}
                    <button className="kbtn" onClick={()=>openEdit(fe)}
                      style={{ width:30, height:30, borderRadius:8, background:C.blueD,
                        border:'1px solid rgba(62,158,255,0.18)', cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', color:C.blue }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {/* toggle */}
                    <button className="kbtn" onClick={()=>toggleActive(fe)}
                      style={{ width:30, height:30, borderRadius:8, cursor:'pointer',
                        background: fe.is_active ? C.greenD : 'rgba(122,139,160,0.08)',
                        border:`1px solid ${fe.is_active ? 'rgba(0,217,126,0.2)' : 'rgba(122,139,160,0.15)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color: fe.is_active ? C.green : C.gray }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                        <path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/>
                      </svg>
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ ADD MODAL ═══════ */}
      {showAdd && (
        <Overlay onClose={()=>setShowAdd(false)}>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:22,
            width:'100%', maxWidth:520, padding:28, maxHeight:'90vh', overflowY:'auto' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>Add Field Executive</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>Creates a login account + profile</div>
              </div>
              <button onClick={()=>setShowAdd(false)}
                style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:15 }}>✕</button>
            </div>

            {fErr && (
              <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red, marginBottom:16 }}>
                {fErr}
              </div>
            )}

            <Label text="Full Name" req/>
            <input className="kinp" style={{ ...baseInp, marginBottom:14 }} placeholder="e.g. Rajiv Kumar"
              value={form.name} onChange={e=>setF('name',e.target.value)}/>

            <Label text="Mobile Number" req/>
            <input className="kinp" style={{ ...baseInp, marginBottom:14 }} placeholder="10-digit mobile" maxLength={10}
              value={form.mobile} onChange={e=>setF('mobile',e.target.value.replace(/\D/g,'').slice(0,10))}/>

            <Label text="Password" req/>
            <input className="kinp" type="password" style={{ ...baseInp, marginBottom:14 }} placeholder="Set login password"
              value={form.password} onChange={e=>setF('password',e.target.value)}/>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <Label text="Employee ID"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={form.role} onChange={e=>setF('role',e.target.value)}>
                  <option value="executive">Executive</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="city_manager">City Manager</option>
                </select>
              </div>
              <div>
                <Label text="Role"/>
                <input className="kinp" style={baseInp} placeholder="FE-001"
                  value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/>
              </div>
              <div>
                <Label text="Zone"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}{z.city ? ` — ${z.city}` : ''}</option>)}
                </select>
              </div>
              <div>
                <Label text="Supervisor"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">None</option>
                  {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label text="Joining Date"/>
                <input className="kinp" type="date" style={baseInp}
                  value={form.joined_date} onChange={e=>setF('joined_date',e.target.value)}/>
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="kbtn" onClick={()=>setShowAdd(false)}
                style={{ flex:1, padding:'11px', background:C.s3, border:`1px solid ${C.border}`, color:C.gray,
                  borderRadius:11, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleCreate} disabled={saving}
                style={{ flex:2, padding:'11px', background:C.red, border:'none', color:'#fff', borderRadius:11,
                  fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  opacity:saving?0.7:1, boxShadow:'0 4px 18px rgba(224,30,44,0.3)' }}>
                {saving ? <><Spinner/>Creating…</> : 'Create Executive'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ═══════ EDIT MODAL ═══════ */}
      {editFe && (
        <Overlay onClose={()=>setEditFe(null)}>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:22,
            width:'100%', maxWidth:480, padding:28, maxHeight:'90vh', overflowY:'auto' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>Edit Executive</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>{editFe.name}</div>
              </div>
              <button onClick={()=>setEditFe(null)}
                style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:15 }}>✕</button>
            </div>

            {fErr && (
              <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red, marginBottom:16 }}>
                {fErr}
              </div>
            )}

            <Label text="Full Name" req/>
            <input className="kinp" style={{ ...baseInp, marginBottom:14 }}
              value={form.name} onChange={e=>setF('name',e.target.value)}/>

            <Label text="Employee ID"/>
            <input className="kinp" style={{ ...baseInp, marginBottom:14 }} placeholder="FE-001"
              value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <Label text="Zone"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <Label text="Supervisor"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">None</option>
                  {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* active toggle */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              background:C.s3, border:`1px solid ${C.border}`, borderRadius:12, padding:'13px 15px', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>Account Active</div>
                <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>
                  {editFe.is_active ? 'Currently active' : 'Inactive — cannot log in'}
                </div>
              </div>
              <div onClick={()=>setEditFe(p => p ? { ...p, is_active:!p.is_active } : p)}
                style={{ width:44, height:26, borderRadius:13, background:editFe.is_active?C.green:C.grayd,
                  position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
                <div style={{ position:'absolute', top:3, left:editFe.is_active?21:3, width:20, height:20,
                  borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="kbtn" onClick={()=>setEditFe(null)}
                style={{ flex:1, padding:'11px', background:C.s3, border:`1px solid ${C.border}`, color:C.gray,
                  borderRadius:11, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleUpdate} disabled={saving}
                style={{ flex:2, padding:'11px', background:C.blue, border:'none', color:'#fff', borderRadius:11,
                  fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  opacity:saving?0.7:1, boxShadow:'0 4px 18px rgba(62,158,255,0.25)' }}>
                {saving ? <><Spinner/>Saving…</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ═══════ DETAIL MODAL ═══════ */}
      {detailFe && !editFe && (
        <Overlay onClose={()=>setDetail(null)}>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:22, width:'100%', maxWidth:440, padding:28 }}>

            <button onClick={()=>setDetail(null)}
              style={{ float:'right', background:C.s3, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32,
                display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:15 }}>✕</button>

            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:22, marginTop:4 }}>
              <div style={{ width:60, height:60, borderRadius:18, background:C.blueD,
                border:'1.5px solid rgba(62,158,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:26, color:C.blue, flexShrink:0 }}>
                {detailFe.name?.[0] || '?'}
              </div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>{detailFe.name}</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{detailFe.employee_id || detailFe.id.slice(0,8)} · {detailFe.zones?.name || 'No zone'}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, marginTop:6, display:'inline-block',
                  background:detailFe.is_active ? C.greenD : C.redD, color:detailFe.is_active ? C.green : C.red }}>
                  {detailFe.is_active ? '● Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:16 }}>
              {[
                { l:'Mobile', v: detailFe.mobile || '—' },
                { l:'Zone',   v: detailFe.zones?.name || '—' },
                { l:'Role',   v: detailFe.role },
                { l:'Added',  v: new Date(detailFe.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) },
              ].map(r => (
                <div key={r.l} style={{ background:C.s3, borderRadius:11, padding:'11px 13px' }}>
                  <div style={{ fontSize:10, color:C.grayd, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>{r.l}</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{r.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:9, marginBottom:22 }}>
              {[
                { l:'CC Today',  v: detailFe.today_cc  ?? '—', c:C.blue   },
                { l:'ECC Today', v: detailFe.today_ecc ?? '—', c:C.green  },
                { l:'Hours',     v: detailFe.hours_worked != null ? `${detailFe.hours_worked.toFixed(1)}h` : '—', c:C.yellow },
              ].map(s => (
                <div key={s.l} style={{ background:C.s4, border:`1px solid ${C.border}`, borderRadius:13, padding:'14px 0', textAlign:'center' }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:C.grayd, marginTop:3 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:9 }}>
              <button className="kbtn" onClick={()=>{ openEdit(detailFe); setDetail(null); }}
                style={{ flex:1, padding:'11px', background:C.blueD,
                  border:'1px solid rgba(62,158,255,0.18)', color:C.blue,
                  borderRadius:11, fontSize:13, fontWeight:700, cursor:'pointer',
                  fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                ✎ Edit
              </button>
              <button className="kbtn" onClick={()=>{ toggleActive(detailFe); setDetail(null); }}
                style={{ flex:1, padding:'11px', borderRadius:11, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: detailFe.is_active ? C.greenD : C.redD,
                  border:`1px solid ${detailFe.is_active ? 'rgba(0,217,126,0.2)' : C.redB}`,
                  color: detailFe.is_active ? C.green : C.red }}>
                {detailFe.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
