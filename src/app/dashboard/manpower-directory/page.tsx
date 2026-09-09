'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, FileUp, Pencil, Plus, Power, RefreshCw, Search, Trash2, Upload, Users, X } from 'lucide-react';
import api from '../../../lib/api';
import CitySelect from '../../../components/CitySelect';
import ClientSelect from '../../../components/ClientSelect';
import ConfirmModal from '../../../components/ConfirmModal';
import Modal from '../../../components/crm/shared/Modal';
import { useAuth } from '../../../hooks/useAuth';
import { useClient } from '../../../context/ClientContext';
import { fmtHrs } from '../../../lib/utils';
import { usePageTitle } from '../../../lib/pageTitle';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, PageHeader, Segmented, Select, T, useIsCompact } from '../../../components/ui';

interface Zone { id: string; name: string; city?: string; }
interface FieldExecutive {
  id: string; name: string; employee_id?: string; mobile?: string;
  role: string; is_active: boolean; zone_id?: string; city?: string;
  zones?: { name: string; city?: string };
  supervisor_id?: string; supervisors?: { name: string };
  city_manager_id?: string;
  app_password?: string;
  created_at: string;
  permissions?: string[];
  assigned_cities?: string[];
  client_id?: string;
  email?: string;
  is_checked_in?: boolean; today_cc?: number; today_ecc?: number; hours_worked?: number;
}
interface FormData {
  name: string; mobile: string; password: string; app_password?: string; employee_id: string;
  zone_id: string; role: string; supervisor_id: string; joined_date: string; city: string;
  permissions: string[];
  assigned_cities: string[];
  client_id?: string;
  email: string;
}
interface BulkRow {
  name: string; employee_id: string; mobile?: string; email?: string; password?: string;
  role?: string; city?: string;
  _status: 'pending' | 'success' | 'error'; _error?: string;
}

const EMPTY_FORM: FormData = {
  name:'', mobile:'', password:'', app_password:'', employee_id:'',
  zone_id:'', role:'executive', supervisor_id:'', joined_date:'', city:'',
  permissions: [],
  assigned_cities: [],
  client_id: '',
  email: '',
};

/* ── Helpers ── */
const Spin = () => (
  <span aria-hidden style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0, opacity: 0.8 }} />
);

/** Error / notice strip used inside the modals. */
const ErrorNote = ({ children }: { children: React.ReactNode }) => (
  <div role="alert" style={{ background: T.redWash, border: `1px solid ${T.red}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.red }}>{children}</div>
);

/* ── Table cell styles ── */
const th: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };

const roleLabel = (r: string) => (r || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ── CSV export ── */
function exportCSV(data: FieldExecutive[], supMap: Record<string,string>) {
  const headers = ['Name','Employee ID','Mobile','Role','Zone','City','Supervisor','Status','Joined'];
  const rows = data.map(fe => [
    fe.name, fe.employee_id||'', fe.mobile||'', fe.role,
    fe.zones?.name||'', fe.zones?.city||fe.city||'',
    fe.supervisor_id ? (supMap[fe.supervisor_id]||fe.supervisor_id) : '',
    fe.is_active?'Active':'Inactive',
    fe.created_at ? new Date(fe.created_at).toLocaleDateString('en-IN') : '',
  ]);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `manpower_directory_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

/* ── Template download ── */
function downloadTemplate() {
  const header = 'name*,employee_id*,mobile,password,role,zone_name,supervisor_name,city';
  const ex1    = 'Rajiv Kumar,FE-001,9876543210,Welcome@123,executive,Zone A,Vikram Nair,Mumbai';
  const ex2    = 'Priya Sharma,SUP-002,9876543211,Welcome@123,supervisor,,Rahul Dev,Delhi';
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header,ex1,ex2].join('\n'));
  a.download = 'bulk_upload_template.csv';
  a.click();
}

/* ── Simple CSV parser ── */
function parseCSV(text: string): Record<string,string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').replace('*','').toLowerCase().replace(/ /g,'_'));
  return lines.slice(1).map(line => {
    const vals: string[] = []; let cur='', inQ=false;
    for (let i=0;i<line.length;i++) {
      if (line[i]==='"') { inQ=!inQ; }
      else if (line[i]===','&&!inQ) { vals.push(cur.trim()); cur=''; }
      else cur+=line[i];
    }
    vals.push(cur.trim());
    const obj: Record<string,string> = {};
    headers.forEach((h,i)=>{ obj[h]=(vals[i]||'').replace(/^"|"$/g,''); });
    return obj;
  }).filter(r=>r['name']&&r['employee_id']);
}

/* ══════════════════════════════════════════════════════ */
export default function ManpowerDirectoryPage() {
  usePageTitle('Manpower directory');
  const narrow = useIsCompact(900);
  const [staff,    setStaff]   = useState<FieldExecutive[]>([]);
  const [clients,  setClients] = useState<any[]>([]);
  const [zones,    setZones]   = useState<Zone[]>([]);
  const [sups,     setSups]    = useState<FieldExecutive[]>([]);
  const [cms,      setCMs]     = useState<FieldExecutive[]>([]);
  const [cities,   setCities]  = useState<Zone[]>([]); // Using Zone interface as it matches city {id, name}
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');
  const [search,   setSearch]  = useState('');
  const [filter,   setFilter]  = useState('all');
  const [fRole,    setFRole]   = useState('all');
  const [fCity,    setFCity]   = useState('');
  const [fSup,     setFSup]    = useState('');
  const [fCM,      setFCM]     = useState('');
  const [selected, setSelected]= useState<FieldExecutive|null>(null);

  const [showAdd,   setShowAdd]  = useState(false);
  const [showEdit,  setShowEdit] = useState(false);
  const [editTarget,setEditT]   = useState<FieldExecutive|null>(null);

  // App Password Reset State
  const [showPwReset, setShowPwReset] = useState(false);
  const [newAppPw, setNewAppPw] = useState('');
  const [pwUpdating, setPwUpdating] = useState(false);

  const [showBulk,  setShowBulk] = useState(false);

  const [form,    setForm]   = useState<FormData>(EMPTY_FORM);
  const [saving,  setSaving] = useState(false);
  const [formErr, setFErr]   = useState('');
  const setF = (k: keyof FormData, v: string) => setForm(p=>({...p,[k]:v}));

  const [bulkRows, setBulk]     = useState<BulkRow[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const [bulkErr,  setBulkErr]  = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{show:boolean; item:FieldExecutive|null}>({show:false, item:null});
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, isPlatformAdmin, token } = useAuth();
  const { selectedClientId } = useClient();

  /* ── fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = selectedClientId ? `&client_id=${selectedClientId}` : '';
      const [uR,zR,sR,cR, cityR, clR] = await Promise.all([
        api.get<any>(`/api/v1/users?limit=1000${qs}`),
        api.get<any>(`/api/v1/zones?limit=500${qs}`),
        api.get<any>(`/api/v1/users?role=supervisor&limit=200${qs}`),
        api.get<any>(`/api/v1/users?role=client_manager&limit=200${qs}`),
        api.get<any>(`/api/v1/cities?limit=200${qs}`),
        api.get<any>('/api/v1/misc/clients'),
      ]);
      const pick = (r: any): any[] => {
        if (!r) return [];
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        return [];
      };
      setStaff(pick(uR).filter((u:any) =>
        ['executive', 'fe', 'field_executive', 'supervisor'].includes((u.role || '').toLowerCase().trim())
      ));
      setZones(pick(zR));
      setSups(pick(sR).filter((u:any) => (u.role || '').toLowerCase().trim() === 'supervisor'));
      setCMs(pick(cR));
      setCities(pick(cityR).filter((c:any) => c.is_active));
      setClients(pick(clR));
      setError('');
    } catch(e:any) { setError(e.message||'Failed to load'); }
    finally { setLoading(false); }
  }, [selectedClientId]);

  useEffect(() => {
    const effectiveClientId = selectedClientId || user?.client_id;
    if (effectiveClientId && !form.client_id && !showEdit) {
      setForm(p => ({ ...p, client_id: effectiveClientId }));
    }
  }, [user, selectedClientId, form.client_id, showEdit]);

  useEffect(()=>{ fetchData(); },[fetchData]);

  const supMap: Record<string,string> = {};
  sups.forEach(s=>{ supMap[s.id]=s.name; });

  const allCities = cities.map(c => c.name);


  const shown = staff.filter(fe => {
    const q = search.toLowerCase();
    const ms = !q||fe.name?.toLowerCase().includes(q)||(fe.employee_id||'').toLowerCase().includes(q)||(fe.zones?.name||'').toLowerCase().includes(q)||(fe.mobile||'').includes(q);
    const mf = filter==='all'||(filter==='active'&&fe.is_active)||(filter==='inactive'&&!fe.is_active)||(filter==='checked_in'&&fe.is_checked_in);
    const mr = fRole==='all'
      || (fRole==='executive' && (fe.role==='executive'||fe.role==='field_executive'||fe.role==='field-executive'))
      || (fRole==='supervisor' && fe.role==='supervisor');
    const mc = !fCity||(fe.zones?.city||fe.city)===fCity;
    const ms2= !fSup||fe.supervisor_id===fSup;
    const mc2= !fCM||fe.city_manager_id===fCM;
    return ms&&mf&&mr&&mc&&ms2&&mc2;
  });

  const stats = {
    total: staff.length,
    executives: staff.filter(u=>u.role==='executive'||u.role==='field_executive').length,
    supervisors: staff.filter(u=>u.role==='supervisor').length,
    active: staff.filter(f=>f.is_active).length
  };

  /* ── ADD ── */
  const handleAdd = async () => {
    if (!form.name||!form.employee_id) { setFErr('Name and Employee ID are required.'); return; }
    setSaving(true); setFErr('');
    try {
      // 1. Mobile Format Validation
      if (form.mobile && (form.mobile.length !== 10 || !/^\d+$/.test(form.mobile))) {
        setFErr('Mobile number must be exactly 10 digits.');
        setSaving(false); return;
      }
      // 2. Email Validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (form.email && !emailRegex.test(form.email)) {
        setFErr('Please enter a valid email address.');
        setSaving(false); return;
      }
      // 3. Duplication Check
      const dupMobile = staff.find(u => u.mobile === form.mobile && form.mobile !== '');
      const dupEmail = staff.find(u => u.email?.toLowerCase().trim() === form.email.toLowerCase().trim() && form.email !== '');
      if (dupMobile) { setFErr(`Mobile number ${form.mobile} is already registered with ${dupMobile.name}.`); setSaving(false); return; }
      if (dupEmail) { setFErr(`Email ${form.email} is already registered with ${dupEmail.name}.`); setSaving(false); return; }

      await api.post('/api/v1/users',{
        name:form.name, mobile:form.mobile||undefined, password:form.password||undefined,
        app_password:form.app_password||undefined,
        role:form.role, employee_id:form.employee_id, zone_id:form.zone_id||undefined,
        supervisor_id:form.supervisor_id||undefined, joined_date:form.joined_date||undefined, city:form.city||undefined,
        permissions: form.permissions, assigned_cities: form.assigned_cities,
        client_id: form.client_id, email: form.email || undefined
      });
      setShowAdd(false); setForm(EMPTY_FORM); fetchData();
    } catch(e:any){ setFErr(e.message||'Failed'); } finally{ setSaving(false); }
  };

  /* ── EDIT ── */
  const openEdit = (fe: FieldExecutive) => {
    setEditT(fe);
    setForm({
      name:fe.name, mobile:fe.mobile||'', password:'', employee_id:fe.employee_id||'',
      zone_id:fe.zone_id||'', role:fe.role, supervisor_id:fe.supervisor_id||'',
      joined_date:'', city:fe.city||fe.zones?.city||'', app_password:fe.app_password||'',
      permissions: fe.permissions || [],
      assigned_cities: fe.assigned_cities || [],
      client_id: fe.client_id || '',
      email: fe.email || '',
    });
    setFErr(''); setShowEdit(true);
  };
  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true); setFErr('');
    try {
      // 1. Mobile Format Validation
      if (form.mobile && (form.mobile.length !== 10 || !/^\d+$/.test(form.mobile))) {
        setFErr('Mobile number must be exactly 10 digits.');
        setSaving(false); return;
      }
      // 2. Email Validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (form.email && !emailRegex.test(form.email)) {
        setFErr('Please enter a valid email address.');
        setSaving(false); return;
      }
      // 3. Duplication Check
      const dupMobile = staff.find(u => u.id !== editTarget.id && u.mobile === form.mobile && form.mobile !== '');
      const dupEmail = staff.find(u => u.id !== editTarget.id && u.email?.toLowerCase().trim() === form.email.toLowerCase().trim() && form.email !== '');
      if (dupMobile) { setFErr(`Mobile number ${form.mobile} is already registered with ${dupMobile.name}.`); setSaving(false); return; }
      if (dupEmail) { setFErr(`Email ${form.email} is already registered with ${dupEmail.name}.`); setSaving(false); return; }

      await api.patch(`/api/v1/users/${editTarget.id}`,{
        name:form.name, zone_id:form.zone_id||null, supervisor_id:form.supervisor_id||null,
        employee_id:form.employee_id||null, is_active:editTarget.is_active, city:form.city||null,
        role:form.role, app_password:form.app_password||undefined,
        permissions: form.permissions, assigned_cities: form.assigned_cities,
        client_id: form.client_id, email: form.email || undefined
      });
      setShowEdit(false); setEditT(null); setSelected(null); fetchData();
    } catch(e:any){ setFErr(e.message||'Failed'); } finally{ setSaving(false); }
  };
  const toggleActive = async (fe: FieldExecutive) => {
    try { await api.patch(`/api/v1/users/${fe.id}`,{is_active:!fe.is_active}); fetchData(); }
    catch(e:any){ setError(e.message); }
  };

  const handleDelete = async () => {
    if(!deleteConfirm.item) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/users/${deleteConfirm.item.id}`);
      setDeleteConfirm({show:false, item:null});
      setSelected(null);
      fetchData();
    } catch(e:any){
      alert(e.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  /* ── BULK ── */
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBulkErr(''); setBulkDone(false);
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target?.result as string);
      if (!rows.length) { setBulkErr('No valid rows found. Check the file format.'); return; }
      setBulk(rows.map(r => {
        const m = r['mobile']?.trim() || '';
        const e = r['email']?.trim() || '';
        const name = r['name']?.trim() || '';
        const eid = r['employee_id']?.trim() || '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        let err = '';
        if (!name || !eid) err = 'Name and Employee ID required';
        else if (m && !/^\d{10}$/.test(m)) err = 'Mobile must be 10 digits';
        else if (e && !emailRegex.test(e)) err = 'Invalid email address';

        return {
          name, employee_id: eid,
          mobile: m || undefined, email: e || undefined,
          password: r['password']||undefined,
          role: r['role']||'executive', city: r['city']||undefined,
          _status: err ? 'error' : 'pending',
          _error: err || undefined,
        };
      }));
    };
    reader.readAsText(file);
    e.target.value='';
  };

  const runBulk = async () => {
    setBulkBusy(true);
    const rows = [...bulkRows];
    for (let i=0; i<rows.length; i++) {
      if (rows[i]._status!=='pending') continue;
      try {
        await api.post('/api/v1/users',{
          name:rows[i].name,
          employee_id:rows[i].employee_id,
          mobile:rows[i].mobile||undefined,
          email:rows[i].email||undefined,
          password:rows[i].password||undefined,
          role:rows[i].role||'executive',
          city:rows[i].city||undefined
        });
        rows[i]={...rows[i],_status:'success'};
      } catch(e:any){ rows[i]={...rows[i],_status:'error',_error:e.message||'Failed'}; }
      setBulk([...rows]);
    }
    setBulkBusy(false); setBulkDone(true);
    if (rows.some(r=>r._status==='success')) fetchData();
  };
  const resetBulk = () => { setBulk([]); setBulkDone(false); setBulkErr(''); setShowBulk(false); };

  /* ── Render ── */
  const pendingBulk = bulkRows.filter(r=>r._status==='pending').length;
  const hasFilters = !!(fCity||fSup||fCM);
  const clientName = (id?: string) => (id ? (clients.find(c => c.id === id)?.name || id.slice(0,8).toUpperCase()) : '');

  const statusOf = (u: FieldExecutive): { label: string; tone: 'ok' | 'neutral' | 'warn' } =>
    u.is_checked_in ? { label: 'Checked in', tone: 'ok' } : !u.is_active ? { label: 'Inactive', tone: 'neutral' } : { label: 'Absent', tone: 'warn' };

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        <PageHeader
          title="Manpower directory"
          description="Field executives and supervisors across your workspace — add, edit and activate members."
          compact={narrow}
          actions={
            <>
              <Button onClick={()=>setShowBulk(true)} icon={<Upload size={16} strokeWidth={1.6} />}>Bulk upload</Button>
              <Button variant="primary" onClick={()=>{setForm(EMPTY_FORM);setFErr('');setShowAdd(true);}} icon={<Plus size={16} strokeWidth={2} />}>Add member</Button>
            </>
          }
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:narrow?'repeat(2, minmax(0,1fr))':'repeat(4, minmax(0,1fr))',gap:14}}>
          {[
            { l:'Total manpower', v:stats.total },
            { l:'Executives', v:stats.executives },
            { l:'Supervisors', v:stats.supervisors },
            { l:'Currently active', v:stats.active, c:T.ok },
          ].map((s)=>(
            <Card key={s.l} padding={16}>
              <Eyebrow>{s.l}</Eyebrow>
              <div style={{fontFamily:T.heading,fontSize:26,fontWeight:700,letterSpacing:'-0.01em',color:s.c||T.text,lineHeight:1.1,marginTop:8,fontVariantNumeric:'tabular-nums'}}>{s.v}</div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{flex:'1 1 240px',position:'relative',minWidth:200}}>
            <Search size={16} strokeWidth={1.6} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:T.mute,pointerEvents:'none'}} />
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, ID, mobile or zone" aria-label="Search staff" style={{paddingLeft:32}} />
          </div>
          <Segmented value={fRole} onChange={setFRole} options={[{value:'all',label:'All'},{value:'executive',label:'Executives'},{value:'supervisor',label:'Supervisors'}]} />
          <Select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Status" style={{width:140}}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select value={fCity} onChange={e=>setFCity(e.target.value)} aria-label="City" style={{width:150}}>
            <option value="">All cities</option>
            {allCities.map(c=><option key={c} value={c}>{c}</option>)}
          </Select>
          {fRole !== 'supervisor' && (
            <Select value={fSup} onChange={e=>setFSup(e.target.value)} aria-label="Supervisor" style={{width:170}}>
              <option value="">All supervisors</option>
              {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Select value={fCM} onChange={e=>setFCM(e.target.value)} aria-label="City manager" style={{width:180}}>
            <option value="">All city managers</option>
            {cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}
          </Select>
          {hasFilters && (
            <Button variant="ghost" onClick={()=>{setFCity('');setFSup('');setFCM('');}} icon={<X size={14} strokeWidth={1.8} />}>Clear</Button>
          )}
          <Button onClick={()=>exportCSV(shown,supMap)} title="Download CSV" icon={<Download size={16} strokeWidth={1.6} />}>Export</Button>
          <IconButton label="Refresh" onClick={fetchData}><RefreshCw size={16} strokeWidth={1.6} /></IconButton>
        </div>

        {/* Table */}
        <Card padding={0}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 16px',borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <div style={{fontFamily:T.heading,fontSize:15,fontWeight:700,letterSpacing:'-0.01em'}}>Members</div>
              <span style={{fontFamily:T.mono,fontSize:11,color:T.mute}}>{shown.length} of {staff.length}</span>
            </div>
          </div>
          {loading ? (
            <div style={{padding:'48px 24px',textAlign:'center',color:T.mute,fontSize:13.5}}>Loading directory…</div>
          ) : shown.length===0 ? (
            <EmptyState
              icon={<Users size={20} strokeWidth={1.6} />}
              title={staff.length === 0 ? 'No members yet' : 'No staff match these filters'}
              description={staff.length === 0 ? 'Add a field executive or supervisor, or bulk upload a CSV.' : 'Try a different search, role or status.'}
              action={staff.length === 0
                ? <Button variant="primary" size="sm" onClick={()=>{setForm(EMPTY_FORM);setFErr('');setShowAdd(true);}} icon={<Plus size={14} strokeWidth={2} />}>Add member</Button>
                : (hasFilters || search || filter !== 'all' || fRole !== 'all')
                  ? <Button size="sm" onClick={()=>{setSearch('');setFilter('all');setFRole('all');setFCity('');setFSup('');setFCM('');}}>Clear filters</Button>
                  : undefined}
            />
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
                <thead>
                  <tr>
                    <th style={th}>Member</th>
                    <th style={th}>Role</th>
                    <th style={th}>City</th>
                    <th style={th}>Zone</th>
                    <th style={th}>Supervisor</th>
                    <th style={th}>Status</th>
                    <th style={{...th,textAlign:'right'}}>TFF today</th>
                    <th style={{...th,textAlign:'right'}}>Hours</th>
                    <th style={{...th,textAlign:'right'}} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(u=>{
                    const st = statusOf(u);
                    return (
                      <tr key={u.id} data-clickable="true" onClick={()=>setSelected(u)} style={{opacity:u.is_active?1:0.6}}>
                        <td style={td}>
                          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                            <Avatar name={u.name} size={30} />
                            <div style={{minWidth:0}}>
                              <div className="km-entity-link" style={{fontSize:13.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</div>
                              <div style={{fontFamily:T.mono,fontSize:11.5,color:T.mute,marginTop:2,display:'flex',alignItems:'center',gap:8}}>
                                {u.employee_id||u.id.slice(0,8)}
                                {isPlatformAdmin && u.client_id && <Badge tone="neutral" style={{height:18,fontSize:10.5}}>{clientName(u.client_id)}</Badge>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={td}><Badge tone={u.role==='supervisor'?'info':'neutral'}>{roleLabel(u.role)}</Badge></td>
                        <td style={{...td,color:T.dim}}>{u.zones?.city||u.city||'—'}</td>
                        <td style={{...td,color:T.dim}}>{u.zones?.name||'—'}</td>
                        <td style={{...td,color:T.dim}}>{u.role!=='supervisor' ? (u.supervisors?.name||'—') : <span style={{color:T.mute}}>n/a</span>}</td>
                        <td style={td}><Badge tone={st.tone} dot={st.tone==='ok'}>{st.label}</Badge></td>
                        <td style={{...td,textAlign:'right',fontFamily:T.mono,fontSize:12.5,fontVariantNumeric:'tabular-nums'}}>{u.today_ecc??'—'}</td>
                        <td style={{...td,textAlign:'right',fontFamily:T.mono,fontSize:12.5,fontVariantNumeric:'tabular-nums',color:T.dim}}>{fmtHrs(u.hours_worked)}</td>
                        <td style={{...td,textAlign:'right'}} onClick={e=>e.stopPropagation()}>
                          <div style={{display:'inline-flex',gap:2}}>
                            {isPlatformAdmin && (
                              <IconButton label="Edit" onClick={()=>openEdit(u)}><Pencil size={15} strokeWidth={1.6} /></IconButton>
                            )}
                            <IconButton label={u.is_active?'Deactivate':'Activate'} onClick={()=>toggleActive(u)} style={{color:u.is_active?T.ok:T.mute}}><Power size={15} strokeWidth={1.6} /></IconButton>
                            {isPlatformAdmin && (
                              <IconButton label="Delete" onClick={()=>setDeleteConfirm({show:true, item:u})}><Trash2 size={15} strokeWidth={1.6} /></IconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ADD MODAL */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add staff member" subtitle="Register a new field executive or supervisor" width={560}
        footer={
          <>
            <Button onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd} disabled={saving} icon={saving?<Spin/>:undefined}>{saving?'Creating…':'Create member'}</Button>
          </>
        }
      >
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {formErr && <ErrorNote>{formErr}</ErrorNote>}
          <div style={{display:'grid',gridTemplateColumns:narrow?'1fr':'repeat(2, minmax(0,1fr))',gap:'14px 16px'}}>
            <Field label="Full name" required style={{gridColumn:'1/-1'}}><Input placeholder="e.g. Rajiv Kumar" value={form.name} onChange={e=>setF('name',e.target.value)}/></Field>
            <Field label="Employee ID" required><Input placeholder="e.g. FE-001 or SUP-001" value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
            <Field label="Role">
              <Select value={form.role} onChange={e=>setF('role',e.target.value)}>
                <option value="executive">Field Executive</option>
                <option value="supervisor">Supervisor</option>
              </Select>
            </Field>
            <Field label="Mobile number" style={{gridColumn:'1/-1'}}><Input placeholder="10-digit mobile (optional)" value={form.mobile} onChange={e=>setF('mobile',e.target.value)} maxLength={10}/></Field>
            <Field label="Email address" style={{gridColumn:'1/-1'}}><Input type="email" placeholder="e.g. rajiv@kinematic.com" value={form.email} onChange={e=>setF('email',e.target.value)}/></Field>
            <Field label="Login password" required style={{gridColumn:'1/-1'}}><Input type="text" placeholder="Enter password for app/web login" value={form.password} onChange={e=>{setF('password',e.target.value); setF('app_password',e.target.value);}}/></Field>
            <Field label="City">
              <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
            </Field>
            <Field label="Zone">
              <Select value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                <option value="">No zone</option>
                {zones.map(z=><option key={z.id} value={z.id}>{z.name}{z.city?` — ${z.city}`:''}</option>)}
              </Select>
            </Field>
            {form.role === 'executive' && (
              <Field label="Supervisor">
                <Select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">No supervisor</option>
                  {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {isPlatformAdmin && (
              <Field label="Client organisation" style={{gridColumn:'1/-1'}}>
                <ClientSelect
                  value={form.client_id || ''}
                  onChange={(id) => setF('client_id', id)}
                />
              </Field>
            )}
          </div>
        </div>
      </Modal>

      {/* EDIT MODAL */}
      <Modal open={showEdit && !!editTarget} onClose={()=>setShowEdit(false)} title="Edit member" subtitle={editTarget?.name} width={560}
        footer={
          <>
            <Button onClick={()=>setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleEdit} disabled={saving} icon={saving?<Spin/>:undefined}>{saving?'Saving…':'Save changes'}</Button>
          </>
        }
      >
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {formErr && <ErrorNote>{formErr}</ErrorNote>}

          <div style={{display:'grid',gridTemplateColumns:narrow?'1fr':'repeat(2, minmax(0,1fr))',gap:'14px 16px'}}>
            <Field label="Full name" required style={{gridColumn:'1/-1'}}><Input value={form.name} onChange={e=>setF('name',e.target.value)}/></Field>
            <Field label="Email address" style={{gridColumn:'1/-1'}}><Input type="email" placeholder="e.g. rajiv@kinematic.com" value={form.email} onChange={e=>setF('email',e.target.value)}/></Field>
            <Field label="Mobile number" style={{gridColumn:'1/-1'}}><Input value={form.mobile} onChange={e=>setF('mobile',e.target.value)} maxLength={10}/></Field>

            <Field label="Employee ID" required><Input value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
            <Field label="Role">
              <Select value={form.role} onChange={e=>setF('role',e.target.value)}>
                <option value="executive">Field Executive</option>
                <option value="supervisor">Supervisor</option>
                <option value="client_manager">Client Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Zone">
              <Select value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                <option value="">No zone</option>
                {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label="City">
              <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
            </Field>
            {form.role === 'executive' && (
              <Field label="Supervisor">
                <Select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">No supervisor</option>
                  {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Login password" style={{gridColumn:'1/-1'}}><Input type="text" placeholder="Mobile app/web password" value={form.app_password} onChange={e=>{setF('app_password',e.target.value); setF('password', e.target.value);}}/></Field>

            {/* RBAC Section Edit */}
            {(form.role === 'sub_admin' || form.role === 'city_manager' || form.role === 'admin') && (
              <div style={{gridColumn:'1/-1', borderTop:`1px solid ${T.border}`, paddingTop:16, marginTop:4, display:'flex', flexDirection:'column', gap:12}}>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <Eyebrow>Module access & scope</Eyebrow>
                  <div style={{fontSize:13,color:T.dim}}>Modules this member can open.</div>
                </div>

                <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                  {['orders','users','analytics','inventory','reports'].map(m => {
                    const on = form.permissions.includes(m);
                    return (
                      <label key={m} style={{display:'inline-flex', alignItems:'center', gap:8, height:28, padding:'0 10px', borderRadius:999, cursor:'pointer', background:on?T.infoWash:T.card, border:`1px solid ${on?T.info:T.border}`, fontSize:12.5, fontWeight:500, color:on?T.text:T.dim, textTransform:'capitalize'}}>
                        <input type="checkbox" checked={on}
                          onChange={e => {
                            const next = e.target.checked ? [...form.permissions, m] : form.permissions.filter(p => p !== m);
                            setForm(p => ({...p, permissions: next}));
                          }}
                          style={{width:14,height:14,margin:0}}
                        />
                        {m}
                      </label>
                    );
                  })}
                </div>

                {form.role === 'city_manager' && (
                  <Field label="Assigned cities">
                    <div style={{display:'flex', flexWrap:'wrap', gap:6, background:T.raised, padding:8, borderRadius:8, border:`1px solid ${T.border}`}}>
                      {allCities.map(c => {
                        const on = form.assigned_cities.includes(c);
                        return (
                          <button key={c} onClick={() => {
                            const next = on ? form.assigned_cities.filter(x => x !== c) : [...form.assigned_cities, c];
                            setForm(p => ({...p, assigned_cities: next}));
                          }} type="button" aria-pressed={on}
                            style={{height:26, padding:'0 10px', borderRadius:999, border:`1px solid ${on?T.info:T.border}`, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit', background:on?T.infoWash:T.card, color:on?T.text:T.dim}}>
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
              </div>
            )}

            {isPlatformAdmin && (
              <Field label="Client" style={{gridColumn:'1/-1'}}>
                <ClientSelect
                  value={form.client_id || ''}
                  onChange={(id) => setForm(p => ({ ...p, client_id: id }))}
                />
              </Field>
            )}
          </div>
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      {selected && !showEdit && (
        <Modal open onClose={()=>setSelected(null)} title={selected.name} subtitle={`${roleLabel(selected.role)} · ${selected.employee_id || selected.id.slice(0,8)}`} width={520}
          footer={
            <>
              {isPlatformAdmin && (
                <Button onClick={()=>{openEdit(selected);setSelected(null);}} icon={<Pencil size={15} strokeWidth={1.6} />}>Edit profile</Button>
              )}
              <Button variant={selected.is_active?'danger':'primary'} onClick={()=>{toggleActive(selected);setSelected(null);}} icon={<Power size={15} strokeWidth={1.6} />}>
                {selected.is_active?'Deactivate':'Activate'}
              </Button>
            </>
          }
        >
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',gap:14,alignItems:'center'}}>
              <Avatar name={selected.name} size={48} />
              <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selected.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <Badge tone={selected.role==='supervisor'?'info':'neutral'}>{roleLabel(selected.role)}</Badge>
                  <Badge tone={selected.is_active?'ok':'neutral'} dot={selected.is_active}>{selected.is_active?'Active':'Inactive'}</Badge>
                </div>
              </div>
            </div>

            <div style={{border:`1px solid ${T.border}`,borderRadius:8,padding:14,background:T.raised,display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                <Eyebrow>App credentials</Eyebrow>
                {!showPwReset ? (
                  <Button size="sm" onClick={() => { setShowPwReset(true); setNewAppPw(selected.app_password || ''); }}>Manage</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setShowPwReset(false)}>Cancel</Button>
                )}
              </div>

              {!showPwReset ? (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <div style={{fontSize:12,color:T.dim,marginBottom:4}}>App password</div>
                    <div style={{fontSize:13.5,fontFamily:T.mono,color:T.text}}>{selected.app_password || <span style={{color:T.mute}}>Not set</span>}</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,color:T.dim,marginBottom:4}}>Login mobile</div>
                    <div style={{fontSize:13.5,fontFamily:T.mono,color:T.text}}>{selected.mobile || <span style={{color:T.mute}}>Not set</span>}</div>
                  </div>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{fontSize:12.5,color:T.dim}}>Set a new password for mobile app login.</div>
                  <div style={{display:'flex',gap:8}}>
                    <Input type="text" placeholder="New app password" value={newAppPw} onChange={e => setNewAppPw(e.target.value)} style={{flex:1}} />
                    <Button
                      variant="primary"
                      disabled={pwUpdating}
                      onClick={async () => {
                        setPwUpdating(true);
                        try {
                          await api.patch(`/api/v1/users/${selected.id}`, { app_password: newAppPw });
                          const updated = { ...selected, app_password: newAppPw };
                          setSelected(updated);
                          setStaff(p => p.map(u => u.id === updated.id ? updated : u));
                          setSups(p => p.map(u => u.id === updated.id ? updated : u));
                          setCMs(p => p.map(u => u.id === updated.id ? updated : u));
                          setShowPwReset(false);
                        } catch (e: any) {
                          alert(e.message || 'Failed to update app password');
                        } finally {
                          setPwUpdating(false);
                        }
                      }}
                    >
                      {pwUpdating ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                { l:'Email address', v:selected.email, span:true },
                { l:'Mobile', v:selected.mobile, mono:true },
                { l:'City', v:selected.zones?.city||selected.city },
                { l:'Zone', v:selected.zones?.name },
                { l:'Supervisor', v:selected.supervisors?.name },
              ].map((r) => (
                <div key={r.l} style={{gridColumn:r.span?'1/-1':undefined, background:T.raised, borderRadius:8, padding:'10px 12px'}}>
                  <Eyebrow style={{marginBottom:4}}>{r.l}</Eyebrow>
                  <div style={{fontSize:13.5,color:r.v?T.text:T.mute,fontFamily:r.mono?T.mono:undefined,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.v||'—'}</div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* BULK MODAL */}
      <Modal open={showBulk} onClose={resetBulk} title="Bulk upload manpower" subtitle="Upload a CSV to add multiple members at once" width={760}
        footer={bulkRows.length===0 ? (
          <Button onClick={resetBulk}>Cancel</Button>
        ) : (
          <>
            <Button onClick={resetBulk} disabled={bulkBusy}>Cancel</Button>
            {!bulkDone ? (
              <Button variant="primary" onClick={runBulk} disabled={bulkBusy} icon={bulkBusy?<Spin/>:<Upload size={15} strokeWidth={1.8} />}>
                {bulkBusy?'Processing…':`Start upload${pendingBulk?` (${pendingBulk})`:''}`}
              </Button>
            ) : (
              <Button variant="primary" onClick={resetBulk}>Done</Button>
            )}
          </>
        )}
      >
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {bulkErr && <ErrorNote>{bulkErr}</ErrorNote>}

          {bulkRows.length===0 ? (
            <div onClick={()=>fileRef.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); fileRef.current?.click(); } }}
              style={{border:`1px dashed ${T.borderStrong}`,borderRadius:12,padding:'40px 24px',textAlign:'center',cursor:'pointer',background:T.raised,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
              <div style={{width:40,height:40,borderRadius:10,background:T.card,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',color:T.dim,marginBottom:4}}>
                <FileUp size={20} strokeWidth={1.6} />
              </div>
              <div style={{fontSize:14,fontWeight:600,color:T.text}}>Select CSV file</div>
              <div style={{fontSize:13,color:T.dim}}>Click to browse. Columns: name, employee ID, mobile, password, role, zone, supervisor, city.</div>
              <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={onFile}/>
              <Button size="sm" variant="ghost" onClick={(e)=>{e.stopPropagation(); downloadTemplate();}} icon={<Download size={14} strokeWidth={1.6} />} style={{marginTop:4}}>Download template</Button>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',gap:16,alignItems:'center',fontSize:13,color:T.dim,background:T.raised,padding:'10px 14px',borderRadius:8}}>
                <span><span style={{fontFamily:T.mono,color:T.text}}>{bulkRows.length}</span> rows found</span>
                <span><span style={{fontFamily:T.mono,color:T.ok}}>{bulkRows.filter(r=>r._status==='success').length}</span> successful</span>
                <span><span style={{fontFamily:T.mono,color:T.red}}>{bulkRows.filter(r=>r._status==='error').length}</span> failed</span>
              </div>

              <div style={{maxHeight:320,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:8}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
                  <thead>
                    <tr>
                      <th style={{...th,position:'sticky',top:0,background:T.card}}>Name</th>
                      <th style={{...th,position:'sticky',top:0,background:T.card}}>Employee ID</th>
                      <th style={{...th,position:'sticky',top:0,background:T.card}}>Role</th>
                      <th style={{...th,position:'sticky',top:0,background:T.card}}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((r,i) => (
                      <tr key={i} style={{background:r._status==='error'?T.redWash:r._status==='success'?T.okWash:'transparent'}}>
                        <td style={{...td,borderBottom:i<bulkRows.length-1?td.borderBottom:0}}>{r.name || '—'}</td>
                        <td style={{...td,borderBottom:i<bulkRows.length-1?td.borderBottom:0,fontFamily:T.mono,fontSize:12.5,color:T.dim}}>{r.employee_id || '—'}</td>
                        <td style={{...td,borderBottom:i<bulkRows.length-1?td.borderBottom:0,color:T.dim}}>{roleLabel(r.role || 'executive')}</td>
                        <td style={{...td,borderBottom:i<bulkRows.length-1?td.borderBottom:0}}>
                          <Badge tone={r._status==='error'?'red':r._status==='success'?'ok':'warn'}>{r._status==='error'?'Error':r._status==='success'?'Added':'Pending'}</Badge>
                          {r._error && <div style={{fontSize:12,color:T.red,marginTop:4}}>{r._error}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        show={deleteConfirm.show}
        onClose={() => setDeleteConfirm({show:false, item:null})}
        onConfirm={handleDelete}
        title="Delete Staff Member"
        message="Are you sure you want to permanently delete this member"
        itemName={deleteConfirm.item?.name}
        loading={deleting}
      />
    </>
  );
}
