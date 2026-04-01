'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';
import ClientSelect from '@/components/ClientSelect';
import ConfirmModal from '@/components/ConfirmModal';
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
interface BulkStoreRow {
  name: string; store_code: string; owner_name?: string; phone?: string;
  address?: string; city_name?: string; zone_name?: string; store_type?: string;
  lat?: string; lng?: string; client_id?: string;
  _status: 'pending' | 'success' | 'error'; _error?: string;
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
  const [clients,  setClients]  = useState<any[]>([]);
  const { user, isPlatformAdmin, token } = useAuth();
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
  const [deleteConfirm, setDeleteConfirm] = useState<{show:boolean; item:Outlet|null}>({show:false, item:null});
  const [deleting, setDeleting] = useState(false);
  const [showBulk,  setShowBulk] = useState(false);
  const [bulkRows,  setBulkRows] = useState<BulkStoreRow[]>([]);
  const [bulkBusy,  setBulkBusy] = useState(false);
  const [bulkDone,  setBulkDone] = useState(false);
  const [bulkErr,   setBulkErr]  = useState<string|null>(null);
  const fileRef = useState<any>(null)[0]; // Actually use useRef

  const authH = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  /* ── Fetch ── */
  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const headers = { Authorization:`Bearer ${token}` };
      const [oRes, zRes, cRes, clRes] = await Promise.allSettled([
        api.get<any>('/api/v1/stores', { headers }),
        api.get<any>('/api/v1/zones',  { headers }),
        api.get<any>('/api/v1/cities', { headers }),
        isPlatformAdmin ? api.get<any>('/api/v1/misc/clients', { headers }) : Promise.resolve(null),
      ]);

      const pick = (v: any) => {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        if (Array.isArray(v?.data)) return v.data;
        if (Array.isArray(v?.data?.data)) return v.data.data;
        return [];
      };

      if (oRes.status === 'fulfilled') setOutlets(pick(oRes.value));
      if (zRes.status === 'fulfilled') setZones(pick(zRes.value));
      if (cRes.status === 'fulfilled') setCities(pick(cRes.value));
      if (clRes.status === 'fulfilled') setClients(pick(clRes.value));
    } catch(e:any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [token, isPlatformAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Bulk Helpers ── */
  const parseCSV = (text: string): Record<string,string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').replace('*','').toLowerCase().replace(/ /g,'_'));
    return lines.slice(1).map(line => {
      const vals: string[] = []; let cur='', inQ=false;
      for (let i=0; i<line.length; i++) {
        if (line[i]==='"') inQ=!inQ;
        else if (line[i]===',' && !inQ) { vals.push(cur.trim()); cur=''; }
        else cur+=line[i];
      }
      vals.push(cur.trim());
      const obj: any = {};
      headers.forEach((h,i) => { obj[h] = (vals[i]||'').replace(/^"|"$/g,''); });
      return obj;
    });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBulkErr(null); setBulkDone(false);
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string);
      if (!parsed.length) { setBulkErr('No valid rows found.'); return; }
      setBulkRows(parsed.map(r => ({
        name: r.name || r.outlet_name || '',
        store_code: r.store_code || r.code || '',
        owner_name: r.owner_name || '',
        phone: r.phone || '',
        address: r.address || '',
        city_name: r.city || r.city_name || '',
        zone_name: r.zone || r.zone_name || '',
        store_type: r.type || r.store_type || '',
        lat: r.lat || r.latitude || '',
        lng: r.lng || r.longitude || r.long || '',
        client_id: isPlatformAdmin ? (r.client_id || r.client || '') : undefined,
        _status: (r.name || r.outlet_name) ? 'pending' : 'error',
        _error: (r.name || r.outlet_name) ? undefined : 'Name is required'
      })));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    let headers = 'name*,store_code*,owner_name,phone,address,city_name*,zone_name,store_type,latitude,longitude';
    if (isPlatformAdmin) headers += ',client_id';
    const row = 'Shiv Stores,S-001,Amit Shah,9876543210,"123 Main St, Mumbai",Mumbai,Zone A,Grocery,19.076,72.877';
    const csv = [headers, row].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'outlet_bulk_template.csv';
    a.click();
  };

  const runBulk = async () => {
    setBulkBusy(true);
    const rows = [...bulkRows];
    for (let i=0; i<rows.length; i++) {
      if (rows[i]._status !== 'pending') continue;
      try {
        const cityObj = cities.find(c => c.name.toLowerCase() === rows[i].city_name?.toLowerCase());
        const zoneObj = zones.find(z => z.name.toLowerCase() === rows[i].zone_name?.toLowerCase());
        const res = await fetch(`${apiBase}/api/v1/stores`, {
          method:'POST', headers:authH,
          body: JSON.stringify({
            name: rows[i].name,
            store_code: rows[i].store_code,
            owner_name: rows[i].owner_name,
            phone: rows[i].phone,
            address: rows[i].address,
            city_id: cityObj?.id || null,
            zone_id: zoneObj?.id || null,
            store_type: rows[i].store_type || 'Kirana / General Store',
            lat: rows[i].lat ? parseFloat(rows[i].lat as string) : null,
            lng: rows[i].lng ? parseFloat(rows[i].lng as string) : null,
            client_id: isPlatformAdmin ? (rows[i].client_id || null) : user?.client_id || null,
            is_active: true
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || json.message || 'Failed');
        }
        rows[i] = { ...rows[i], _status: 'success' };
      } catch (e: any) {
        rows[i] = { ...rows[i], _status: 'error', _error: e.message };
      }
      setBulkRows([...rows]);
    }
    setBulkBusy(false); setBulkDone(true);
    fetchAll();
  };

  const resetBulk = () => { setBulkRows([]); setBulkDone(false); setBulkErr(null); setShowBulk(false); };

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
    } catch { }
  };

  const doDelete = async () => {
    if (!deleteConfirm.item) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/stores/${deleteConfirm.item.id}`, {
        method: 'DELETE', headers: authH
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || json.message || 'Delete failed');
      }
      setDeleteConfirm({ show: false, item: null });
      fetchAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchAll}
              style={{ padding:'8px 14px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                display:'flex', alignItems:'center', gap:6 }}>
              ↺ Refresh
            </button>
            {(isPlatformAdmin || user?.role === 'client') && (
              <button onClick={() => setShowBulk(true)}
                style={{ padding:'8px 14px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:10,
                  color:C.blue, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', gap:6 }}>
                📦 Bulk Upload
              </button>
            )}
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
            <div style={{ display:'grid', gridTemplateColumns:isPlatformAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr 1fr 100px' : '2fr 1.2fr 1.2fr 1.2fr 1fr 1fr 100px',
              gap:8, padding:'10px 20px', borderBottom:`1px solid ${C.border}`,
              fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase' }}>
              {isPlatformAdmin ? (
                ['Outlet','Type','Zone','Owner / Phone','Code','Client','Status','Actions'].map(h => <span key={h}>{h}</span>)
              ) : (
                ['Outlet','Type','Zone','Owner / Phone','Code','Status','Actions'].map(h => <span key={h}>{h}</span>)
              )}
            </div>
            {/* Rows */}
            {filtered.map((o, i) => (
              <div key={o.id} className="km-tr"
                style={{ display:'grid', gridTemplateColumns:isPlatformAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr 1fr 100px' : '2fr 1.2fr 1.2fr 1.2fr 1fr 1fr 100px',
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
                <div style={{ fontSize:12, fontFamily:'monospace', color:C.gray }}>{o.store_code || '—'}</div>
                
                {/* Client Highlight */}
                {isPlatformAdmin && (
                   <div>
                     {o.client_id ? (
                       <Badge label={clients.find(cl => cl.id?.toLowerCase().trim() === o.client_id?.toLowerCase().trim())?.name || o.client_id.slice(0,8).toUpperCase()} color={C.purple} />
                     ) : (
                       <span style={{ fontSize:11, color:C.grayd }}>System</span>
                     )}
                   </div>
                )}

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
                  {isPlatformAdmin && (
                    <button title="Edit outlet" onClick={() => openEdit(o)}
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`,
                        background: 'transparent', cursor: 'pointer', fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      ✏️
                    </button>
                  )}
                  <button title={o.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(o)}
                    style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`,
                      background: 'transparent', cursor: 'pointer', fontSize: 13,
                      display:'flex', alignItems:'center', justifyContent:'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {o.is_active ? '⏸' : '▶️'}
                  </button>
                  {isPlatformAdmin && (
                    <button title="Delete outlet" onClick={() => setDeleteConfirm({show:true, item:o})}
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`,
                        background: 'transparent', cursor: 'pointer', fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.s3; e.currentTarget.style.color = C.red; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit'; }}>
                      🗑️
                    </button>
                  )}
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

      <ConfirmModal
        show={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ show: false, item: null })}
        onConfirm={doDelete}
        title="Delete Outlet"
        message="Are you sure you want to permanently delete this outlet"
        itemName={deleteConfirm.item?.name}
        loading={deleting}
      />

      {/* ── Bulk Modal ── */}
      {showBulk && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && resetBulk()}>
          <div style={{ ...mbox, maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800 }}>Bulk Upload Outlets</div>
                <div style={{ fontSize: 13, color: C.gray, marginTop: 4 }}>Add multiple outlets at once via CSV</div>
              </div>
              <button onClick={resetBulk} style={{ background: 'none', border: 'none', color: C.gray, fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {bulkErr && <div style={{ color: C.red, fontSize: 13, marginBottom: 16 }}>⚠ {bulkErr}</div>}

            {bulkRows.length === 0 ? (
              <div style={{ border: `2px dashed ${C.border}`, borderRadius: 16, padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Select stores CSV</div>
                <div style={{ fontSize: 13, color: C.gray, marginTop: 10, marginBottom: 20 }}>Click below to upload your store network data</div>
                <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-store-file" />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <label htmlFor="bulk-store-file" style={{ ...btnP, padding: '10px 20px', cursor: 'pointer', flex: 'unset' }}>Choose File</label>
                  <button onClick={downloadTemplate} style={{ ...btnS, padding: '10px 20px', flex: 'unset' }}>Download Template</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: C.s3, padding: '12px 16px', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13 }}>{bulkRows.length} rows detected</div>
                  <div style={{ fontSize: 13, color: C.green }}>{bulkRows.filter(r => r._status === 'success').length} success</div>
                </div>
                <div style={{ maxHeight: 350, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: C.s3, position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr style={{ textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px' }}>Name</th>
                        <th style={{ padding: '12px 16px' }}>Code</th>
                        <th style={{ padding: '12px 16px' }}>Coordinates</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: r._status === 'error' ? 'rgba(224,30,44,0.05)' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.name}</td>
                          <td style={{ padding: '12px 16px', color: C.gray }}>{r.store_code}</td>
                          <td style={{ padding: '12px 16px', color: C.grayd }}>
                             {r.lat && r.lng ? `${parseFloat(r.lat).toFixed(3)}, ${parseFloat(r.lng).toFixed(3)}` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 800, color: r._status === 'success' ? C.green : r._status === 'error' ? C.red : C.yellow }}>
                            {r._status.toUpperCase()}
                            {r._error && <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>{r._error}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={resetBulk} style={btnS}>Cancel</button>
                  {!bulkDone ? (
                    <button onClick={runBulk} disabled={bulkBusy} style={{ ...btnP, flex: 2, opacity: bulkBusy ? 0.7 : 1 }}>
                      {bulkBusy ? 'Processing...' : 'Start Upload'}
                    </button>
                  ) : (
                    <button onClick={resetBulk} style={{ ...btnP, flex: 2 }}>Close</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
