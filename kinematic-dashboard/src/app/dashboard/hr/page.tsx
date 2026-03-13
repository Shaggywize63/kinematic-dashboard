'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

/* ── palette ─────────────────────────────────────────────── */
const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1', tealD:'rgba(0,201,177,0.08)',
  orange:'#FF7A30',
};

/* ── types ─────────────────────────────────────────────────── */
interface HRUser {
  id: string;
  name: string;
  role: string;
  mobile?: string;
  email?: string;
  employee_id?: string;
  city?: string;
  zone_id?: string;
  is_active?: boolean;
  joined_date?: string;
}
interface Zone { id: string; name: string; city?: string; }

/* ── atoms ───────────────────────────────────────────────────── */
const Shimmer = ({ w='100%', h=16, br=6 }: { w?: string|number; h?: number; br?: number }) => (
  <div style={{ width:w, height:h, borderRadius:br, background:C.s3, overflow:'hidden', position:'relative' }}>
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,transparent 0%,${C.border} 50%,transparent 100%)`, animation:'km-shimmer 1.3s ease-in-out infinite' }}/>
  </div>
);

const Spin = () => (
  <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);

const StatCard = ({ label, value, color, sub, loading }: { label:string; value:string|number; color:string; sub?:string; loading?:boolean }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:'18px 20px' }}>
    {loading ? <Shimmer h={28} br={5} w="55%"/> : (
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color, lineHeight:1 }}>{value}</div>
    )}
    <div style={{ fontSize:11, color:C.gray, marginTop:6, fontWeight:600, letterSpacing:'0.3px' }}>{label}</div>
    {sub && <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{sub}</div>}
  </div>
);

const Avatar = ({ name, size=32 }: { name:string; size?:number }) => {
  const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const hue = name.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 360;
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`hsl(${hue},55%,22%)`,
      border:`1px solid hsl(${hue},55%,35%)`, display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:size*0.35, color:`hsl(${hue},70%,65%)`, flexShrink:0 }}>
      {initials}
    </div>
  );
};

const Card = ({ children, style }: { children:React.ReactNode; style?:React.CSSProperties }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:18, padding:'20px 22px', ...style }}>
    {children}
  </div>
);

const SectionHeader = ({ title, sub }: { title:string; sub?:string }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{title}</div>
    {sub && <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{sub}</div>}
  </div>
);

/* ── HR PAGE ─────────────────────────────────────────────────── */
export default function HRPage() {
  const [hrTab, setHrTab] = useState<'team'|'roles'|'training'>('team');
  const [users, setUsers]   = useState<HRUser[]>([]);
  const [zones, setZones]   = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [showAdd, setShowAdd]   = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [selUser, setSelUser]   = useState<HRUser|null>(null);

  const emptyForm = { name:'', mobile:'', email:'', role:'executive', employee_id:'', city:'', zone_id:'', password:'', joined_date:'' };
  const [form, setForm]     = useState(emptyForm);
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);
  const [saveOk, setSaveOk]   = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
      const headers = { Authorization:`Bearer ${token}` };
      const [uRes, zRes] = await Promise.allSettled([
        api.get<any>('/api/v1/users',  { headers }),
        api.get<any>('/api/v1/zones', { headers }),
      ]);
      if (uRes.status === 'fulfilled') setUsers((uRes.value?.data ?? uRes.value) || []);
      if (zRes.status === 'fulfilled') setZones((zRes.value?.data ?? zRes.value) || []);
    } catch(e:any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const executives  = users.filter(u => u.role === 'executive');
  const admins      = users.filter(u => u.role === 'admin');
  const supervisors = users.filter(u => u.role === 'supervisor');
  const activeUsers = users.filter(u => u.is_active !== false);

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchSearch = !search
      || u.name?.toLowerCase().includes(q)
      || u.employee_id?.toLowerCase().includes(q)
      || u.mobile?.includes(q)
      || u.city?.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const roleColor: Record<string,string> = {
    executive:C.blue, admin:C.red, supervisor:C.teal,
    program_manager:C.purple, city_manager:C.orange,
  };

  const doAdd = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to create user');
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setShowAdd(false); setForm(emptyForm); fetchAll(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const doEdit = async () => {
    if (!selUser) return;
    setSaving(true); setSaveErr(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${selUser.id}`, {
        method:'PATCH',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to save');
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setShowEdit(false); setSelUser(null); fetchAll(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const doReset = async () => {
    if (!selUser || newPass.length < 6) { setSaveErr('Password must be at least 6 characters'); return; }
    setSaving(true); setSaveErr(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${selUser.id}/reset-password`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ password: newPass }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Reset failed');
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setShowReset(false); }, 1400);
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u: HRUser) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${u.id}`, {
        method:'PATCH',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      fetchAll();
    } catch {}
  };

  const openEdit = (u: HRUser) => {
    setSelUser(u);
    setForm({ name:u.name||'', mobile:u.mobile||'', email:u.email||'', role:u.role||'executive',
      employee_id:u.employee_id||'', city:u.city||'', zone_id:u.zone_id||'', password:'', joined_date:u.joined_date||'' });
    setSaveErr(null); setSaveOk(false); setShowEdit(true);
  };

  /* shared styles */
  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:10,
    border:`1.5px solid ${C.border}`, background:C.s3,
    color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };
  const modalOverlay: React.CSSProperties = {
    position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:200,
    display:'flex', alignItems:'center', justifyContent:'center', padding:24,
  };
  const modalBox: React.CSSProperties = {
    background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20,
    padding:28, width:'100%', maxWidth:540,
    maxHeight:'85vh', overflowY:'auto',
    boxShadow:'0 32px 80px rgba(0,0,0,.8)',
    animation:'km-fadein .2s ease',
  };
  const btnPrimary: React.CSSProperties = {
    flex:1, padding:'10px 0', borderRadius:11, border:'none',
    background:C.red, color:'#fff', fontWeight:700, fontSize:13,
    fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
  };
  const btnSecondary: React.CSSProperties = {
    flex:1, padding:'10px 0', borderRadius:11,
    border:`1px solid ${C.border}`, background:'transparent',
    color:C.gray, fontWeight:600, fontSize:13,
    fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
  };

  // Reusable form field renderer
  const FField = (id: keyof typeof emptyForm, label: string, type='text', opts?: {v:string;l:string}[]) => (
    <div key={id}>
      <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>{label}</div>
      {opts ? (
        <select style={inputStyle} value={form[id]} onChange={e=>setForm(p=>({...p,[id]:e.target.value}))}>
          <option value="">Select…</option>
          {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={type} placeholder={label} style={inputStyle}
          value={form[id]} onChange={e=>setForm(p=>({...p,[id]:e.target.value}))}/>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes km-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes km-fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes kspin      { to{transform:rotate(360deg)} }
        .km-tr:hover { background:${C.s3} !important; }
        .kbtn:hover  { opacity:.82; }
        .kbtn:active { transform:scale(.97); }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:22, animation:'km-fadein .3s ease' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              HR — Team Management
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>All users registered in Rise Up</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="kbtn" onClick={fetchAll}
              style={{ padding:'8px 14px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6 }}>
              ↺ Refresh
            </button>
            <button className="kbtn" onClick={()=>{ setForm(emptyForm); setSaveErr(null); setSaveOk(false); setShowAdd(true); }}
              style={{ padding:'8px 16px', background:C.red, border:'none', borderRadius:10,
                color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 16px ${C.redB}` }}>
              + Add User
            </button>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total Users',       value:users.length,       color:C.blue,  sub:'Across all roles' },
            { label:'Field Executives',  value:executives.length,  color:C.blue,  sub:'In field ops' },
            { label:'Active',            value:activeUsers.length, color:C.green, sub:'is_active = true' },
            { label:'Admins',            value:admins.length,      color:C.red,   sub:'System administrators' },
          ].map((k,i) => <StatCard key={i} {...k} loading={loading}/>)}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}` }}>
          {([
            { id:'team',     label:'Team Directory' },
            { id:'roles',    label:'Role Overview' },
            { id:'training', label:'Training & Docs' },
          ] as const).map(t => (
            <button key={t.id} onClick={()=>setHrTab(t.id)}
              style={{ padding:'10px 20px', background:'transparent', border:'none',
                borderBottom: hrTab===t.id ? `2px solid ${C.red}` : '2px solid transparent',
                color: hrTab===t.id ? C.red : C.gray,
                fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:13,
                cursor:'pointer', marginBottom:-1, transition:'all .2s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ TAB: Team Directory ══ */}
        {hrTab === 'team' && (
          <>
            {/* Toolbar */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={{ position:'relative', flex:1, minWidth:200 }}>
                <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
                <input placeholder="Search by name, ID, mobile, city…" value={search}
                  onChange={e=>setSearch(e.target.value)}
                  style={{ ...inputStyle, paddingLeft:32 }}/>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {['all','executive','admin','supervisor'].map(r=>(
                  <button key={r} onClick={()=>setRoleFilter(r)}
                    style={{ padding:'6px 13px', borderRadius:8,
                      border:`1px solid ${roleFilter===r ? C.blue : C.border}`,
                      background: roleFilter===r ? C.blueD : C.s3,
                      color: roleFilter===r ? C.blue : C.gray,
                      fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {r==='all'?'All':r.charAt(0).toUpperCase()+r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><Spin/></div>
            ) : error ? (
              <Card style={{ background:C.redD, border:`1px solid ${C.redB}` }}>
                <div style={{ color:C.red, fontWeight:700, marginBottom:6 }}>Failed to load users</div>
                <div style={{ fontSize:13, color:C.gray, marginBottom:12 }}>{error}</div>
                <button onClick={fetchAll} style={{ ...btnSecondary, flex:'unset', padding:'7px 14px', fontSize:12 }}>Retry</button>
              </Card>
            ) : filtered.length === 0 ? (
              <Card><div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>
                No users found{search ? ` for "${search}"` : ''}
              </div></Card>
            ) : (
              <Card style={{ padding:0, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1.4fr 1.2fr 1fr 110px',
                  gap:8, padding:'10px 18px', borderBottom:`1px solid ${C.border}`,
                  fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase' }}>
                  {['Name / ID','Role','Mobile','Zone / City','Status','Actions'].map(h=><span key={h}>{h}</span>)}
                </div>
                {filtered.map((u, i) => (
                  <div key={u.id} className="km-tr"
                    style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1.4fr 1.2fr 1fr 110px',
                      gap:8, padding:'13px 18px', alignItems:'center',
                      borderBottom: i<filtered.length-1 ? `1px solid ${C.border}` : 'none',
                      transition:'background .13s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={u.name} size={30}/>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:C.white }}>{u.name}</div>
                        <div style={{ fontSize:10, color:C.grayd, fontFamily:'monospace', marginTop:1 }}>{u.employee_id || '—'}</div>
                      </div>
                    </div>
                    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20,
                      background:`${roleColor[u.role]||C.blue}15`, color:roleColor[u.role]||C.blue,
                      fontSize:11, fontWeight:700, textTransform:'capitalize' }}>
                      {u.role}
                    </span>
                    <span style={{ fontSize:12, color:C.gray, fontFamily:'monospace' }}>{u.mobile || '—'}</span>
                    <span style={{ fontSize:12, color:C.gray }}>
                      {zones.find(z=>z.id===u.zone_id)?.name || u.city || '—'}
                    </span>
                    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20,
                      background: u.is_active !== false ? C.greenD : C.redD,
                      color: u.is_active !== false ? C.green : C.red,
                      fontSize:11, fontWeight:700 }}>
                      {u.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                    <div style={{ display:'flex', gap:4 }}>
                      {[
                        { title:'Edit',    icon:'✏️', fn:()=>openEdit(u) },
                        { title:'Reset password', icon:'🔑', fn:()=>{ setSelUser(u); setNewPass(''); setSaveErr(null); setSaveOk(false); setShowReset(true); } },
                        { title: u.is_active !== false ? 'Deactivate' : 'Activate', icon: u.is_active !== false ? '⏸' : '▶️', fn:()=>toggleActive(u) },
                      ].map(a=>(
                        <button key={a.title} title={a.title} onClick={a.fn}
                          style={{ width:28, height:28, borderRadius:8, border:`1px solid ${C.border}`,
                            background:'transparent', cursor:'pointer', fontSize:13,
                            display:'flex', alignItems:'center', justifyContent:'center' }}
                          onMouseEnter={e=>(e.currentTarget.style.background=C.s3)}
                          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          {a.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            )}
            {!loading && !error && filtered.length > 0 && (
              <div style={{ fontSize:12, color:C.grayd, textAlign:'right' }}>
                Showing {filtered.length} of {users.length} users
              </div>
            )}
          </>
        )}

        {/* ══ TAB: Role Overview ══ */}
        {hrTab === 'roles' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
            <Card>
              <SectionHeader title="Role Distribution" sub="Live from database"/>
              {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spin/></div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { l:'Field Executives', v:executives.length,  c:C.blue },
                    { l:'Admins',           v:admins.length,       c:C.red  },
                    { l:'Supervisors',      v:supervisors.length,  c:C.teal },
                    { l:'Other',            v:users.filter(u=>!['executive','admin','supervisor'].includes(u.role)).length, c:C.purple },
                  ].map((x,i)=>(
                    <div key={i}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:C.gray }}>
                          <div style={{ width:9, height:9, borderRadius:'50%', background:x.c }}/>
                          {x.l}
                        </div>
                        <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:x.c }}>{x.v}</span>
                      </div>
                      <div style={{ height:4, background:C.s3, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:x.c, borderRadius:2, width:`${users.length>0?(x.v/users.length)*100:0}%`, transition:'width .8s ease' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Active Status" sub="Account activation state"/>
              {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spin/></div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { l:'Active users',   v:activeUsers.length,               c:C.green },
                    { l:'Inactive users', v:users.length - activeUsers.length, c:C.red   },
                  ].map((x,i)=>(
                    <div key={i}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:C.gray }}>
                          <div style={{ width:9, height:9, borderRadius:'50%', background:x.c }}/>
                          {x.l}
                        </div>
                        <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:x.c }}>{x.v}</span>
                      </div>
                      <div style={{ height:4, background:C.s3, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:x.c, borderRadius:2, width:`${users.length>0?(x.v/users.length)*100:0}%`, transition:'width .8s ease' }}/>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop:8, padding:'12px 14px', background:C.s3, borderRadius:12, fontSize:12, color:C.gray }}>
                    {users.length} total users · {executives.length} in field operations
                  </div>
                </div>
              )}
            </Card>

            {(['executive','supervisor','admin'] as const).map(role => {
              const roleUsers = users.filter(u=>u.role===role);
              return (
                <Card key={role} style={{ padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:800, textTransform:'capitalize', color:roleColor[role]||C.blue }}>
                      {role}s <span style={{ color:C.grayd, fontSize:11, fontWeight:400 }}>({roleUsers.length})</span>
                    </div>
                  </div>
                  {loading ? <div style={{ padding:24, display:'flex', justifyContent:'center' }}><Spin/></div> :
                    roleUsers.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'24px 0', color:C.grayd, fontSize:12 }}>No {role}s yet</div>
                    ) : roleUsers.map((u,i)=>(
                      <div key={u.id} style={{ display:'flex', gap:12, padding:'11px 18px', borderBottom:i<roleUsers.length-1?`1px solid ${C.border}`:'none', alignItems:'center' }}>
                        <Avatar name={u.name} size={30}/>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:C.white }}>{u.name}</div>
                          <div style={{ fontSize:10, color:C.grayd, display:'flex', gap:8, marginTop:2 }}>
                            {u.employee_id && <span style={{ fontFamily:'monospace' }}>{u.employee_id}</span>}
                            {u.mobile && <span>{u.mobile}</span>}
                          </div>
                        </div>
                        <span style={{ display:'inline-flex', padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700,
                          background: u.is_active !== false ? C.greenD : C.redD,
                          color: u.is_active !== false ? C.green : C.red }}>
                          {u.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))
                  }
                </Card>
              );
            })}
          </div>
        )}

        {/* ══ TAB: Training & Docs ══ */}
        {hrTab === 'training' && (
          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <SectionHeader title="Training Materials" sub="Managed from Learning Center"/>
              <button style={{ padding:'8px 14px', background:C.red, border:'none', borderRadius:10,
                color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 12px ${C.redB}` }}>
                + Upload Material
              </button>
            </div>
            {[
              { name:'Product Training Module 1', type:'Video', visible:'FE + Supervisor', views:145 },
              { name:'GT Activity Best Practices',  type:'PDF',   visible:'All',            views:234 },
              { name:'Safety Guidelines 2024',      type:'PDF',   visible:'FE',             views:89  },
              { name:'Supervisor Verification SOP', type:'PDF',   visible:'Supervisor',     views:42  },
            ].map((m,i)=>(
              <div key={i} style={{ display:'flex', gap:14, padding:'14px 0', borderBottom:i<3?`1px solid ${C.border}`:'none', alignItems:'center' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:m.type==='Video'?C.redD:C.blueD,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                  {m.type==='Video'?'▶':'📄'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.white, marginBottom:3 }}>{m.name}</div>
                  <div style={{ fontSize:11, color:C.gray }}>Visible to: {m.visible} · {m.views} views</div>
                </div>
                <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                  background:m.type==='Video'?C.redD:C.blueD, color:m.type==='Video'?C.red:C.blue }}>
                  {m.type}
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* ══ ADD USER MODAL ══ */}
        {showAdd && (
          <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
            <div style={modalBox}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Add New User</div>
                <button onClick={()=>setShowAdd(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {FField('name',        'Full Name')}
                {FField('mobile',      'Mobile Number', 'tel')}
                {FField('email',       'Email (optional)', 'email')}
                {FField('password',    'Password', 'password')}
                {FField('role',        'Role', 'text', [
                  {v:'executive',l:'Field Executive'},{v:'supervisor',l:'Supervisor'},
                  {v:'admin',l:'Admin'},{v:'program_manager',l:'Program Manager'},{v:'city_manager',l:'City Manager'},
                ])}
                {FField('employee_id', 'Employee ID (e.g. FE-003)')}
                {FField('city',        'City')}
                {FField('zone_id',     'Zone', 'text', zones.map(z=>({v:z.id,l:z.name})))}
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Date Joined</div>
                  <input type="date" style={inputStyle} value={form.joined_date} onChange={e=>setForm(p=>({...p,joined_date:e.target.value}))}/>
                </div>
              </div>
              {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
              {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ User created successfully!</div>}
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button style={btnSecondary} onClick={()=>setShowAdd(false)}>Cancel</button>
                <button style={btnPrimary} onClick={doAdd} disabled={saving||!form.name||!form.mobile}>
                  {saving ? <Spin/> : '+ Create User'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ EDIT USER MODAL ══ */}
        {showEdit && selUser && (
          <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowEdit(false)}>
            <div style={modalBox}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Edit User</div>
                  <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{selUser.name}</div>
                </div>
                <button onClick={()=>setShowEdit(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {FField('name',        'Full Name')}
                {FField('mobile',      'Mobile Number', 'tel')}
                {FField('email',       'Email', 'email')}
                {FField('role',        'Role', 'text', [
                  {v:'executive',l:'Field Executive'},{v:'supervisor',l:'Supervisor'},
                  {v:'admin',l:'Admin'},{v:'program_manager',l:'Program Manager'},{v:'city_manager',l:'City Manager'},
                ])}
                {FField('employee_id', 'Employee ID')}
                {FField('city',        'City')}
                {FField('zone_id',     'Zone', 'text', zones.map(z=>({v:z.id,l:z.name})))}
                <div>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Date Joined</div>
                  <input type="date" style={inputStyle} value={form.joined_date} onChange={e=>setForm(p=>({...p,joined_date:e.target.value}))}/>
                </div>
              </div>
              {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
              {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Saved successfully!</div>}
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button style={btnSecondary} onClick={()=>setShowEdit(false)}>Cancel</button>
                <button style={btnPrimary} onClick={doEdit} disabled={saving||!form.name||!form.mobile}>
                  {saving ? <Spin/> : '✓ Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ RESET PASSWORD MODAL ══ */}
        {showReset && selUser && (
          <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowReset(false)}>
            <div style={{ ...modalBox, maxWidth:380 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Reset Password</div>
                  <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{selUser.name}</div>
                </div>
                <button onClick={()=>setShowReset(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
              </div>
              <div style={{ display:'flex', gap:10, padding:'11px 14px', background:C.yellowD, border:`1px solid ${C.yellow}28`, borderRadius:10, marginBottom:16 }}>
                <span style={{ fontSize:13 }}>⚠️</span>
                <span style={{ fontSize:12, color:C.yellow, lineHeight:1.5 }}>The user will need to log in with this new password immediately.</span>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>New Password (min. 6 characters)</div>
                <input type="password" placeholder="Enter new password…" style={inputStyle} value={newPass} onChange={e=>setNewPass(e.target.value)}/>
              </div>
              {saveErr && <div style={{ marginTop:12, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
              {saveOk  && <div style={{ marginTop:12, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Password reset!</div>}
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button style={btnSecondary} onClick={()=>setShowReset(false)}>Cancel</button>
                <button style={btnPrimary} onClick={doReset} disabled={saving||!newPass}>
                  {saving ? <Spin/> : '🔑 Reset Password'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
