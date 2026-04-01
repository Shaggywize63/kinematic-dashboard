'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';
import ClientSelect from '@/components/ClientSelect';
import { useAuth } from '@/hooks/useAuth';

const C = {
  bg: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  red: '#E01E2C', 
  redD: 'var(--redD)', 
  redB: 'rgba(224,30,44,0.2)',
  green: '#00D97E', 
  greenD: 'var(--greenD)',
  blue: '#3E9EFF', 
  blueD: 'var(--blueD)',
  yellow: '#FFB800', 
  yellowD: 'var(--yellowD)',
  purple: '#9B6EFF', 
  purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1', 
  tealD: 'rgba(0,201,177,0.08)',
  orange: '#FF7A30',
};

/* ── Outlet types matching store_type in DB ── */
const OUTLET_TYPES = [
  'Kirana / General Store',
  'Pan Shop',
  'Grocery',
  'Supermarket / Hypermarket',
  'Medical / Pharmacy',
  'Stationery',
  'Electronics',
  'Other',
];

interface Zone  { id:string; name:string; city?:string; }
interface City  { id:string; name:string; }
interface Outlet {
  id:string; name:string; store_code?:string; owner_name?:string;
  phone?:string; address?:string; lat?:number; lng?:number;
  store_type?:string; is_active:boolean; zone_id?:string; city_id?:string;
  client_id?:string;
  created_at?:string;
  zones?: { name:string };
  cities?: { name:string };
}

/* ── Atoms ── */
const Spin = () => (
  <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.blue,
    borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);
const Shimmer = ({ h=16, br=8 }:{ h?:number; br?:number }) => (
  <div style={{ height:h, borderRadius:br, background:C.s3, overflow:'hidden', position:'relative' }}>
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,transparent,${C.border},transparent)`,
      animation:'km-shimmer 1.3s ease-in-out infinite' }}/>
  </div>
);
const Card = ({ children, style }:{ children:React.ReactNode; style?:React.CSSProperties }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:18, ...style }}>
    {children}
  </div>
);
const Badge = ({ label, color }:{ label:string; color:string }) => (
  <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20,
    background:`${color}15`, color, fontSize:11, fontWeight:700 }}>
    {label}
  </span>
);

export default function OutletManagementPage() {
  const [outlets,  setOutlets]  = useState<Outlet[]>([]);
  const [zones,    setZones]    = useState<Zone[]>([]);
  const [cities,   setCities]   = useState<City[]>([]);
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);

  // Filters
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [showAdd,  setShowAdd]  = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [selOutlet, setSelOutlet] = useState<any>(null);

  const emptyForm = {
    name:'', store_code:'', owner_name:'', phone:'', address:'',
    store_type:'', zone_id:'', city_id:'', lat:'', lng:'',
    rating: 'good', remarks: '',
    client_id: '',
  };
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);
  const [saveOk,  setSaveOk]  = useState(false);
  const [formErrs, setFormErrs] = useState<Record<string,string>>({});

  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
  const authH = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  /* ── Fetch ── */
  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const headers = { Authorization:`Bearer ${token}` };
      const [oRes, zRes, cRes] = await Promise.allSettled([
        api.get<any>('/api/v1/stores', { headers }),
        api.get<any>('/api/v1/zones',  { headers }),
        api.get<any>('/api/v1/cities', { headers }),
      ]);
      if (oRes.status === 'fulfilled') setOutlets((oRes.value?.data ?? oRes.value) || []);
      if (zRes.status === 'fulfilled') setZones((zRes.value?.data  ?? zRes.value)  || []);
      if (cRes.status === 'fulfilled') setCities((cRes.value?.data ?? cRes.value)  || []);
    } catch(e:any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Derived ── */
  const safeOutlets = Array.isArray(outlets) ? outlets : [];
  const filtered = safeOutlets.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || o.name?.toLowerCase().includes(q)
      || o.store_code?.toLowerCase().includes(q)
      || o.owner_name?.toLowerCase().includes(q)
      || o.phone?.includes(q)
      || o.address?.toLowerCase().includes(q);
    const matchType   = typeFilter === 'all'   || o.store_type === typeFilter;
    const matchZone   = zoneFilter === 'all'   || o.zone_id === zoneFilter;
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? o.is_active : !o.is_active);
    return matchSearch && matchType && matchZone && matchStatus;
  });

  const activeCount   = safeOutlets.filter(o => o.is_active).length;
  const inactiveCount = safeOutlets.filter(o => !o.is_active).length;

  /* ── Validate ── */
  const validate = () => {
    const errs: Record<string,string> = {};
    if (!form.name.trim())  errs.name  = 'Outlet name is required';
    if (form.phone && !/^\d{10}$/.test(form.phone.trim())) errs.phone = 'Enter valid 10-digit number';
    setFormErrs(errs);
    return Object.keys(errs).length === 0;
  };

  /* ── Add ── */
  const doAdd = async () => {
    if (!validate()) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/stores`, {
        method:'POST', headers:authH,
        body: JSON.stringify({
          ...form,
          lat: form.lat ? parseFloat(form.lat) : null,
          lng: form.lng ? parseFloat(form.lng) : null,
          zone_id:  form.zone_id  || null,
          city_id:  form.city_id  || null,
          store_type: form.store_type || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to create outlet');
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setShowAdd(false); setForm(emptyForm); fetchAll(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  /* ── Edit ── */
  const openEdit = (o: Outlet) => {
    setSelOutlet(o);
    setForm({
      name: o.name || '', store_code: o.store_code || '',
      owner_name: o.owner_name || '', phone: o.phone || '',
      address: o.address || '', store_type: o.store_type || '',
      zone_id: o.zone_id || '', city_id: o.city_id || '',
      lat: o.lat?.toString() || '', lng: o.lng?.toString() || '',
      rating: 'good', remarks: '',
      client_id: o.client_id || '',
    });
    setSaveErr(null); setSaveOk(false); setFormErrs({});
    setShowEdit(true);
  };

  const doEdit = async () => {
    if (!selOutlet || !validate()) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/stores/${selOutlet.id}`, {
        method:'PATCH', headers:authH,
        body: JSON.stringify({
          ...form,
          lat: form.lat ? parseFloat(form.lat) : null,
          lng: form.lng ? parseFloat(form.lng) : null,
          zone_id:  form.zone_id  || null,
          city_id:  form.city_id  || null,
          store_type: form.store_type || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to update outlet');
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setShowEdit(false); setSelOutlet(null); fetchAll(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  /* ── Toggle active ── */
  const toggleActive = async (o: Outlet) => {
    try {
      await fetch(`${apiBase}/api/v1/stores/${o.id}`, {
        method:'PATCH', headers:authH,
        body: JSON.stringify({ is_active: !o.is_active }),
      });
      fetchAll();
    } catch {}
  };

  /* ── Shared styles ── */
  const inp: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:10,
    border:`1.5px solid ${C.border}`, background:C.s3,
    color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };
  const overlay: React.CSSProperties = {
    position:'fixed', inset:0, background:'rgba(0,0,0,.76)', zIndex:200,
    display:'flex', alignItems:'center', justifyContent:'center', padding:24,
  };
  const mbox: React.CSSProperties = {
    background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20,
    padding:28, width:'100%', maxWidth:580,
    maxHeight:'88vh', overflowY:'auto',
    boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-fadein .2s ease',
  };
  const btnP: React.CSSProperties = {
    flex:1, padding:'10px 0', borderRadius:11, border:'none',
    background:C.red, color:'#fff', fontWeight:700, fontSize:13,
    fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
  };
  const btnS: React.CSSProperties = {
    flex:1, padding:'10px 0', borderRadius:11,
    border:`1px solid ${C.border}`, background:'transparent',
    color:C.gray, fontWeight:600, fontSize:13,
    fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
  };

  /* ── Form field helper ── */
  const F = (id: keyof typeof emptyForm, label: string, type = 'text', opts?: string[]) => (
    <div key={id}>
      <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>{label}</div>
      {opts ? (
        <select style={{ ...inp, borderColor: formErrs[id] ? C.red : C.border }}
          value={form[id]} onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))}>
          <option value="">Select…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} placeholder={label}
          style={{ ...inp, borderColor: formErrs[id] ? C.red : C.border }}
          value={form[id]} onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))}/>
      )}
      {formErrs[id] && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrs[id]}</div>}
    </div>
  );

  const OutletForm = () => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div style={{ gridColumn:'1 / -1' }}>{F('name',       'Outlet Name *')}</div>
      {F('store_code',  'Outlet Code')}
      {F('owner_name',  'Owner / Contact Name')}
      {F('phone',       'Phone Number', 'tel')}
      {F('store_type',  'Outlet Type', 'text', OUTLET_TYPES)}
      {/* Zone select */}
      <div>
        <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Zone</div>
        <select style={inp} value={form.zone_id}
          onChange={e => setForm(p => ({ ...p, zone_id: e.target.value }))}>
          <option value="">Select zone…</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      {/* City select */}
      <div>
        <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>City</div>
        <CitySelect value={form.city_id} onChange={(v, c) => setForm(p => ({ ...p, city_id: c.id }))} placeholder="Select city..." />
      </div>
      <div style={{ gridColumn:'1 / -1' }}>{F('address', 'Address')}</div>
      {F('lat', 'Latitude (optional)', 'number')}
      {F('lng', 'Longitude (optional)', 'number')}
      {isPlatformAdmin && (
        <div style={{ gridColumn:'1 / -1' }}>
          <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Client Organization</div>
          <ClientSelect 
            value={form.client_id || ''} 
            onChange={(id) => setForm(p => ({ ...p, client_id: id }))} 
          />
        </div>
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
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:22, animation:'km-fadein .3s ease' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              Outlet Management
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
              All retail & trade outlets in your network
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={fetchAll}
              style={{ padding:'8px 14px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6 }}>
              ↺ Refresh
            </button>
            <button onClick={() => { setForm(emptyForm); setSaveErr(null); setSaveOk(false); setFormErrs({}); setShowAdd(true); }}
              style={{ padding:'8px 16px', background:C.red, border:'none', borderRadius:10,
                color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 16px ${C.redB}` }}>
              + Add Outlet
            </button>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total Outlets',  value:safeOutlets.length, color:C.blue,   sub:'All registered' },
            { label:'Active',         value:activeCount,         color:C.green,  sub:'Currently active' },
            { label:'Inactive',       value:inactiveCount,       color:C.red,    sub:'Deactivated' },
            { label:'Zones Covered',  value:new Set(safeOutlets.map(o=>o.zone_id).filter(Boolean)).size, color:C.yellow, sub:'Unique zones' },
          ].map((k,i) => (
            <div key={i} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:'18px 20px' }}>
              {loading ? <Shimmer h={28} br={5}/> : (
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
              )}
              <div style={{ fontSize:11, color:C.gray, marginTop:6, fontWeight:600 }}>{k.label}</div>
              <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:220 }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
            <input placeholder="Search outlet name, code, owner, phone…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, paddingLeft:32 }}/>
          </div>
          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ ...inp, width:'auto', minWidth:160, padding:'9px 14px' }}>
            <option value="all">All Types</option>
            {OUTLET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Zone filter */}
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            style={{ ...inp, width:'auto', minWidth:140, padding:'9px 14px' }}>
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inp, width:'auto', minWidth:120, padding:'9px 14px' }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <Card style={{ padding:'20px 22px' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[...Array(5)].map((_,i) => <Shimmer key={i} h={44} br={10}/>)}
            </div>
          </Card>
        ) : error ? (
          <Card style={{ padding:'20px 22px', background:C.redD, border:`1px solid ${C.redB}` }}>
            <div style={{ color:C.red, fontWeight:700, marginBottom:6 }}>Failed to load outlets</div>
            <div style={{ fontSize:13, color:C.gray, marginBottom:12 }}>{error}</div>
            <button onClick={fetchAll} style={{ ...btnS, flex:'unset', padding:'7px 14px', fontSize:12 }}>Retry</button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card style={{ padding:'40px 22px' }}>
            <div style={{ textAlign:'center', color:C.grayd, fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🏪</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>No outlets found</div>
              <div style={{ fontSize:12 }}>{search ? `No results for "${search}"` : 'Add your first outlet to get started'}</div>
            </div>
          </Card>
        ) : (
          <Card style={{ padding:0, overflow:'hidden' }}>
            {/* Table header */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1.2fr 1.2fr 1fr 1fr 100px',
              gap:8, padding:'10px 20px', borderBottom:`1px solid ${C.border}`,
              fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase' }}>
              {['Outlet','Type','Zone','Owner / Phone','Code','Status','Actions'].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {/* Rows */}
            {filtered.map((o, i) => (
              <div key={o.id} className="km-tr"
                style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1.2fr 1.2fr 1fr 1fr 100px',
                  gap:8, padding:'14px 20px', alignItems:'center',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                  transition:'background .13s' }}>

                {/* Outlet name + address */}
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.white }}>{o.name}</div>
                  {o.address && (
                    <div style={{ fontSize:10, color:C.grayd, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      📍 {o.address}
                    </div>
                  )}
                </div>

                {/* Type */}
                <span style={{ fontSize:11, color:C.gray }}>
                  {o.store_type || '—'}
                </span>

                {/* Zone */}
                <span style={{ fontSize:11, color:C.gray }}>
                  {zones.find(z => z.id === o.zone_id)?.name || '—'}
                </span>

                {/* Owner / Phone */}
                <div>
                  <div style={{ fontSize:12, color:C.white, fontWeight:600 }}>{o.owner_name || '—'}</div>
                  {o.phone && <div style={{ fontSize:10, color:C.grayd, marginTop:1, fontFamily:'monospace' }}>{o.phone}</div>}
                </div>

                {/* Code */}
                <span style={{ fontSize:11, color:C.grayd, fontFamily:'monospace' }}>
                  {o.store_code || '—'}
                </span>

                {/* Status */}
                <Badge label={o.is_active ? 'Active' : 'Inactive'} color={o.is_active ? C.green : C.red}/>

                {/* Actions */}
                <div style={{ display:'flex', gap:5 }}>
                  <button title="Log field visit" onClick={() => { setSelOutlet(o); setShowVisit(true); setSaveErr(null); setSaveOk(false); }}
                    style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.blue}40`,
                      background:'transparent', cursor:'pointer', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center', color:C.blue }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.blue}10`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    📋
                  </button>
                  <button title="Edit outlet" onClick={() => openEdit(o)}
                    style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
                      background:'transparent', cursor:'pointer', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    ✏️
                  </button>
                  <button title={o.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(o)}
                    style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
                      background:'transparent', cursor:'pointer', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {o.is_active ? '⏸' : '▶️'}
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}

        {!loading && !error && (
          <div style={{ fontSize:12, color:C.grayd, textAlign:'right' }}>
            Showing {filtered.length} of {safeOutlets.length} outlets
          </div>
        )}
      </div>

      {/* ══ ADD OUTLET MODAL ══ */}
      {showAdd && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={mbox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Add New Outlet</div>
              <button onClick={() => setShowAdd(false)}
                style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8,
                  width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            {OutletForm()}
            {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Outlet created!</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button style={btnS} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={btnP} onClick={doAdd} disabled={saving || !form.name}>
                {saving ? <Spin/> : '+ Create Outlet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LOG VISIT MODAL ══ */}
      {showVisit && selOutlet && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setShowVisit(false)}>
          <div style={{ ...mbox, maxWidth: 450 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Log Field Visit</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>Recording visit for: {selOutlet.name}</div>
              </div>
              <button onClick={() => setShowVisit(false)}
                style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8,
                  width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.gray, textTransform:'uppercase', marginBottom:8 }}>Rating</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['excellent','good','average','poor'].map(r => (
                    <button key={r} onClick={() => setForm({...form, rating: r})}
                      style={{ flex:1, padding:'8px 0', borderRadius:8, border:`1px solid ${form.rating === r ? C.blue : C.border}`, background: form.rating === r ? `${C.blue}15` : 'transparent', color: form.rating === r ? C.blue : C.gray, fontSize:11, fontWeight:700, textTransform:'capitalize', transition:'all .15s' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.gray, textTransform:'uppercase', marginBottom:8 }}>Remarks / Notes</label>
                <textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} 
                  placeholder="Describe the objective and outcome of the visit..."
                  style={{ width:'100%', minHeight:100, background:C.s3, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px', color:C.white, fontSize:13, outline:'none' }} />
              </div>

              <div style={{ display:'flex', gap:10, alignItems:'center', background:C.s3, padding:12, borderRadius:10, border:`1px solid ${C.border}` }}>
                <span style={{ fontSize:18 }}>📸</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:C.white }}>Store Selfie</div>
                  <div style={{ fontSize:10, color:C.grayd }}>Capture photo for verification</div>
                </div>
                <button style={{ background:C.s4, border:`1px solid ${C.border}`, color:C.gray, padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600 }}>Upload</button>
              </div>
            </div>

            {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Visit logged successfully!</div>}
            
            <div style={{ display:'flex', gap:10, marginTop:24 }}>
              <button style={btnS} onClick={() => setShowVisit(false)}>Cancel</button>
              <button style={{ ...btnP, background:C.blue, boxShadow:`0 4px 16px ${C.blue}30` }} 
                onClick={async () => {
                  setSaving(true);
                  try {
                    await api.post('/api/v1/visits', { 
                      outlet_id: selOutlet.id, 
                      rating: form.rating || 'good', 
                      remarks: form.remarks 
                    });
                    setSaveOk(true);
                    setTimeout(() => setShowVisit(false), 1500);
                  } catch (e: any) {
                    setSaveErr(e.message || 'Failed to log visit');
                  } finally {
                    setSaving(false);
                  }
                }} 
                disabled={saving}>
                {saving ? <Spin/> : 'Complete Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showEdit && selOutlet && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setShowEdit(false)}>
          <div style={mbox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>Edit Outlet</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{selOutlet.name}</div>
              </div>
              <button onClick={() => setShowEdit(false)}
                style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8,
                  width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            {OutletForm()}
            {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Saved!</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button style={btnS} onClick={() => setShowEdit(false)}>Cancel</button>
              <button style={btnP} onClick={doEdit} disabled={saving || !form.name}>
                {saving ? <Spin/> : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
