'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';
import ClientSelect from '@/components/ClientSelect';
import { useAuth } from '@/hooks/useAuth';
import { fmtHrs } from '@/lib/utils';

const C = {
  red: '#E01E2C', 
  redD: 'var(--redD)', 
  redB: 'rgba(224,30,44,0.2)',
  green: '#00D97E', 
  greenD: 'var(--greenD)',
  yellow: '#FFB800', 
  yellowD: 'var(--yellowD)',
  blue: '#3E9EFF', 
  blueD: 'var(--blueD)',
  purple: '#9B6EFF', 
  purpleD: 'rgba(155,110,255,0.08)',
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  s1: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)',
};

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
  is_checked_in?: boolean; today_cc?: number; today_ecc?: number; hours_worked?: number;
}
interface FormData {
  name: string; mobile: string; password: string; app_password?: string; employee_id: string;
  zone_id: string; role: string; supervisor_id: string; joined_date: string; city: string;
  permissions: string[];
  assigned_cities: string[];
  client_id?: string;
}
interface BulkRow {
  name: string; employee_id: string; mobile?: string; password?: string;
  role?: string; city?: string;
  _status: 'pending' | 'success' | 'error'; _error?: string;
}

const EMPTY_FORM: FormData = {
  name:'', mobile:'', password:'', app_password:'', employee_id:'',
  zone_id:'', role:'executive', supervisor_id:'', joined_date:'', city:'',
  permissions: [],
  assigned_cities: [],
  client_id: '',
};

/* ── Helpers ── */
const Spin = () => (
  <div style={{width:16,height:16,border:'2px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}/>
);
const Modal = ({onClose, children}: {onClose:()=>void, children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:24,backdropFilter:'blur(4px)'}}>
    {children}
  </div>
);
const Field = ({label, required, children}: {label:string, required?:boolean, children:React.ReactNode}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.8px',textTransform:'uppercase' as const,marginBottom:6}}>
      {label}{required && <span style={{color:C.red}}> *</span>}
    </div>
    {children}
  </div>
);
const inp: React.CSSProperties = {
  width:'100%', background:C.s3, border:`1px solid ${C.border}`, color:C.white,
  borderRadius:10, padding:'10px 13px', fontSize:13, outline:'none',
  fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.15s',
};

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
  const [staff,    setStaff]   = useState<FieldExecutive[]>([]);
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
  const fileRef = useRef<HTMLInputElement>(null);
  
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  /* ── fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uR,zR,sR,cR, cityR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=1000'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/users?role=supervisor&limit=200'),
        api.get<any>('/api/v1/users?role=city_manager&limit=100'),
        api.get<any>('/api/v1/cities'),
      ]);
      const pick = (r: any): any[] => {
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        return r?.users || [];
      };
      setStaff(pick(uR).filter((u:any) =>
        ['executive', 'field_executive', 'field-executive', 'supervisor'].includes(u.role)
      ));
      setZones(pick(zR));
      setSups(pick(sR));
      setCMs(pick(cR));
      setCities(pick(cityR).filter((c:any) => c.is_active));
      setError('');
    } catch(e:any) { setError(e.message||'Failed to load'); }
    finally { setLoading(false); }
  }, []);
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
      await api.post('/api/v1/users',{
        name:form.name, mobile:form.mobile||undefined, password:form.password||undefined,
        app_password:form.app_password||undefined,
        role:form.role, employee_id:form.employee_id, zone_id:form.zone_id||undefined,
        supervisor_id:form.supervisor_id||undefined, joined_date:form.joined_date||undefined, city:form.city||undefined,
        permissions: form.permissions, assigned_cities: form.assigned_cities,
        client_id: form.client_id
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
      assigned_cities: fe.assigned_cities || []
    });
    setFErr(''); setShowEdit(true);
  };
  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true); setFErr('');
    try {
      await api.patch(`/api/v1/users/${editTarget.id}`,{ 
        name:form.name, zone_id:form.zone_id||null, supervisor_id:form.supervisor_id||null, 
        employee_id:form.employee_id||null, is_active:editTarget.is_active, city:form.city||null,
        role:form.role, app_password:form.app_password||undefined,
        permissions: form.permissions, assigned_cities: form.assigned_cities,
        client_id: form.client_id
      });
      setShowEdit(false); setEditT(null); setSelected(null); fetchData();
    } catch(e:any){ setFErr(e.message||'Failed'); } finally{ setSaving(false); }
  };
  const toggleActive = async (fe: FieldExecutive) => {
    try { await api.patch(`/api/v1/users/${fe.id}`,{is_active:!fe.is_active}); fetchData(); }
    catch(e:any){ setError(e.message); }
  };

  /* ── BULK ── */
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBulkErr(''); setBulkDone(false);
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target?.result as string);
      if (!rows.length) { setBulkErr('No valid rows found. Check the file format.'); return; }
      setBulk(rows.map(r => ({
        name: r['name']||'', employee_id: r['employee_id']||'',
        mobile: r['mobile']||undefined, password: r['password']||undefined,
        role: r['role']||'executive', city: r['city']||undefined,
        _status: (!r['name']||!r['employee_id']) ? 'error' : 'pending',
        _error: (!r['name']||!r['employee_id']) ? 'Name and Employee ID required' : undefined,
      })));
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
        await api.post('/api/v1/users',{ name:rows[i].name, employee_id:rows[i].employee_id, mobile:rows[i].mobile||undefined, password:rows[i].password||undefined, role:rows[i].role||'executive', city:rows[i].city||undefined });
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

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fe-card { transition: all 0.15s; }
        .fe-card:hover { background: ${C.s3} !important; border-color: ${C.borderL} !important; }
        .kinp:focus { border-color: ${C.blue} !important; }
        .btn-icon { transition: all 0.15s; }
        .btn-icon:hover { opacity:0.8; transform:scale(0.96); }
        .brow-ok  { background: rgba(0,217,126,0.06)  !important; }
        .brow-err { background: rgba(224,30,44,0.06) !important; }
      `}</style>

      <div style={{display:'flex',flexDirection:'column',gap:20,animation:'fadeIn 0.3s ease'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,margin:0,color:C.white}}>Manpower Directory</h1>
            <p style={{fontSize:13,color:C.gray,marginTop:4}}>Manage both Field Executives and Supervisors</p>
          </div>
          <div style={{display:'flex',gap:10}}>
             <button onClick={()=>setShowBulk(true)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'10px 16px',background:C.s2,border:`1px solid ${C.border}`,borderRadius:12,color:C.blue,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Bulk Upload
              </button>
              <button onClick={()=>{setForm(EMPTY_FORM);setFErr('');setShowAdd(true);}}
                style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',background:C.red,border:'none',borderRadius:12,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",boxShadow:`0 4px 16px rgba(224,30,44,0.3)`}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Member
              </button>
          </div>
        </div>

        {error && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:12,padding:'12px 16px',fontSize:13,color:C.red}}>⚠ {error}</div>}

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {[{l:'Total Manpower',v:stats.total,c:C.blue,i:'👥'},{l:'Executives',v:stats.executives,c:C.purple,i:'👤'},{l:'Supervisors',v:stats.supervisors,c:C.yellow,i:'🛡️'},{l:'Currently Active',v:stats.active,c:C.green,i:'✓'}].map((s,i)=>(
            <div key={i} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:'18px 20px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:12,right:14,fontSize:20,opacity:0.15}}>{s.i}</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:11,color:C.gray,marginTop:6,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {/* Row 1 */}
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{flex:1,position:'relative',minWidth:250}}>
              <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',opacity:0.3}} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, ID, mobile or zone..."
                style={{...inp,paddingLeft:34,borderRadius:12}} className="kinp"/>
            </div>
            
            <div style={{display:'flex',gap:6,background:C.s2,padding:3,borderRadius:12,border:`1px solid ${C.border}`}}>
              {[['all','All'],['executive','Executives'],['supervisor','Supervisors']].map(([r,l])=>(
                <button key={r} onClick={()=>setFRole(r)} style={{padding:'7px 16px',borderRadius:9,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.2s',background:fRole===r?C.s4:'transparent',color:fRole===r?C.white:C.gray}}>{l}</button>
              ))}
            </div>

            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[['all','All Status'],['active','Active'],['inactive','Inactive']].map(([f,l])=>(
                <button key={f} onClick={()=>setFilter(f)} style={{padding:'9px 14px',borderRadius:10,border:`1px solid ${filter===f?C.red:C.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.15s',background:filter===f?C.red:C.s2,color:filter===f?'#fff':C.gray,whiteSpace:'nowrap' as const}}>{l}</button>
              ))}
            </div>
            
            <button onClick={()=>exportCSV(shown,supMap)} title="Download CSV"
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',background:C.s2,border:`1px solid ${C.border}`,borderRadius:10,color:C.green,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
            </button>
            <button onClick={fetchData} style={{padding:'9px 12px',background:C.s2,border:`1px solid ${C.border}`,color:C.gray,borderRadius:10,fontSize:13,cursor:'pointer'}}>↻</button>
          </div>

          {/* Row 2 — Filters */}
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px'}}>FILTER BY</span>
            <select value={fCity} onChange={e=>setFCity(e.target.value)} className="kinp"
              style={{...inp,width:'auto',minWidth:130,borderRadius:10,fontSize:12,background:fCity?C.s4:C.s2,borderColor:fCity?C.blue:C.border}}>
              <option value="">All Cities</option>
              {allCities.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {fRole !== 'supervisor' && (
              <select value={fSup} onChange={e=>setFSup(e.target.value)} className="kinp"
                style={{...inp,width:'auto',minWidth:155,borderRadius:10,fontSize:12,background:fSup?C.s4:C.s2,borderColor:fSup?C.blue:C.border}}>
                <option value="">All Supervisors</option>
                {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <select value={fCM} onChange={e=>setFCM(e.target.value)} className="kinp"
              style={{...inp,width:'auto',minWidth:170,borderRadius:10,fontSize:12,background:fCM?C.s4:C.s2,borderColor:fCM?C.blue:C.border}}>
              <option value="">All City Managers</option>
              {cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}
            </select>
            {(fCity||fSup||fCM) && (
              <button onClick={()=>{setFCity('');setFSup('');setFCM('');}} style={{fontSize:12,color:C.red,background:'none',border:'none',cursor:'pointer',fontWeight:600}}>✕ Clear</button>
            )}
            <span style={{marginLeft:'auto',fontSize:12,color:C.grayd,fontWeight:600}}>{shown.length} staff found</span>
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{padding:60,textAlign:'center',color:C.grayd,fontSize:14}}>Loading directory...</div>
        ) : shown.length===0 ? (
          <div style={{padding:60,textAlign:'center',color:C.grayd,fontSize:14}}>No staff members match your current filters.</div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(310px,1fr))',gap:14}}>
            {shown.map(u=>(
              <div key={u.id} className="fe-card"
                style={{background:C.s2,border:`1px solid ${u.is_checked_in?C.green+'28':u.is_active?C.border:'rgba(122,139,160,0.15)'}`,borderRadius:16,padding:18,cursor:'pointer',opacity:u.is_active?1:0.65}}
                onClick={()=>setSelected(u)}>
                <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:14}}>
                  <div style={{width:44,height:44,borderRadius:13,background:u.role==='supervisor'?C.yellowD:C.blueD,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:u.role==='supervisor'?C.yellow:C.blue,flexShrink:0}}>{u.name?.[0]||u.role?.[0].toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</div>
                    <div style={{fontSize:11,color:C.grayd,marginTop:2}}>{u.role.replace('_',' ')} · {u.employee_id||u.id.slice(0,8)}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,flexShrink:0,background:u.is_checked_in?'rgba(0,217,126,0.12)':!u.is_active?'rgba(122,139,160,0.1)':'rgba(224,30,44,0.1)',color:u.is_checked_in?C.green:!u.is_active?C.gray:C.red}}>{u.is_checked_in?'● Active':!u.is_active?'Inactive':'Absent'}</span>
                </div>
                
                <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}>
                   <div style={{fontSize:11,color:C.gray,display:'flex',justifyContent:'space-between'}}>
                      <span>City: <strong>{u.zones?.city||u.city||'—'}</strong></span>
                      {u.role!=='supervisor' && <span>Sup: <strong>{u.supervisors?.name||'—'}</strong></span>}
                   </div>
                   <div style={{fontSize:11,color:C.gray}}>Zone: <strong>{u.zones?.name||'No zone'}</strong></div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:12}}>
                  {[{l:'TFF Today',v:u.today_ecc??'—',c:C.green},{l:'Hours',v:fmtHrs(u.hours_worked),c:C.yellow}].map(s=>(
                    <div key={s.l} style={{background:C.s3,borderRadius:9,padding:'8px 0',textAlign:'center'}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800,color:s.c}}>{s.v}</div>
                      <div style={{fontSize:10,color:C.grayd,marginTop:1}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{display:'flex',justifyContent:'flex-end',gap:6}} onClick={e=>e.stopPropagation()}>
                    <button className="btn-icon" onClick={()=>openEdit(u)} style={{width:28,height:28,borderRadius:8,background:C.blueD,border:`1px solid rgba(62,158,255,0.2)`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.blue}}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="btn-icon" onClick={()=>toggleActive(u)} style={{width:28,height:28,borderRadius:8,background:u.is_active?'rgba(0,217,126,0.1)':'rgba(122,139,160,0.1)',border:`1px solid ${u.is_active?'rgba(0,217,126,0.2)':'rgba(122,139,160,0.2)'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:u.is_active?C.green:C.gray}}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg>
                    </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:540,padding:28,maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Add Staff Member</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>Register a new Field Executive or Supervisor</div>
              </div>
              <button onClick={()=>setShowAdd(false)} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,cursor:'pointer',color:C.gray,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
            {formErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>{formErr}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}><Field label="Full Name" required><input className="kinp" style={inp} placeholder="e.g. Rajiv Kumar" value={form.name} onChange={e=>setF('name',e.target.value)}/></Field></div>
              <Field label="Employee ID" required><input className="kinp" style={inp} placeholder="e.g. FE-001 or SUP-001" value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
              <Field label="Role">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.role} onChange={e=>setF('role',e.target.value)}>
                  <option value="executive">Field Executive</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </Field>
              <div style={{gridColumn:'1/-1'}}><Field label="Mobile Number"><input className="kinp" style={inp} placeholder="10-digit mobile (optional)" value={form.mobile} onChange={e=>setF('mobile',e.target.value)} maxLength={10}/></Field></div>
              <div style={{gridColumn:'1/-1'}}><Field label="Login Password" required><input className="kinp" style={inp} type="text" placeholder="Enter password for app/web login" value={form.password} onChange={e=>{setF('password',e.target.value); setF('app_password',e.target.value);}}/></Field></div>
              <Field label="City">
                <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Zone">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}{z.city?` — ${z.city}`:''}</option>)}
                </select>
              </Field>
              {form.role === 'executive' && (
                <Field label="Supervisor">
                  <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                    <option value="">No supervisor</option>
                    {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              {isPlatformAdmin && (
                <div style={{gridColumn:'1/-1', marginTop: 8}}>
                   <Field label="Client Organization">
                      <ClientSelect 
                        value={form.client_id || ''} 
                        onChange={(id) => setF('client_id', id)} 
                      />
                   </Field>
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setShowAdd(false)} style={{flex:1,padding:'12px',background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer'}}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{flex:2,padding:'12px',background:C.red,border:'none',color:'#fff',borderRadius:12,fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',opacity:saving?0.7:1}}>
                {saving?<Spin/>:'Create Member'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* EDIT MODAL */}
      {showEdit && editTarget && (
        <Modal onClose={()=>setShowEdit(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:520,padding:28,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div><div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Edit Member</div><div style={{fontSize:12,color:C.gray,marginTop:3}}>{editTarget.name}</div></div>
              <button onClick={()=>setShowEdit(false)} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,cursor:'pointer',color:C.gray,fontSize:16}}>✕</button>
            </div>
            {formErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>{formErr}</div>}
            <Field label="Full Name" required><input className="kinp" style={inp} value={form.name} onChange={e=>setF('name',e.target.value)}/></Field>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
               <Field label="Employee ID" required><input className="kinp" style={inp} value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
               <Field label="Role">
                  <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.role} onChange={e=>setF('role',e.target.value)}>
                    <option value="executive">Field Executive</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                </Field>
              <Field label="Zone">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="City">
                <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
              </Field>
              {form.role === 'executive' && (
                <Field label="Supervisor">
                  <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                    <option value="">No supervisor</option>
                    {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              <div style={{gridColumn:'1/-1'}}><Field label="Login Password"><input className="kinp" style={inp} type="text" placeholder="Mobile app/web password" value={form.app_password} onChange={e=>{setF('app_password',e.target.value); setF('password', e.target.value);}}/></Field></div>

              {/* RBAC Section Edit */}
              {(form.role === 'sub_admin' || form.role === 'city_manager' || form.role === 'admin') && (
                <div style={{gridColumn:'1/-1', borderTop:`1px solid ${C.border}`, paddingTop:16, marginTop:8}}>
                  <div style={{fontSize:12, fontWeight:800, color:C.white, marginBottom:12, fontFamily:"'Syne',sans-serif"}}>Module Access & Scope</div>
                  
                  <div style={{display:'flex', flexWrap:'wrap', gap:10, marginBottom:16}}>
                    {['orders','users','analytics','inventory','reports'].map(m => (
                      <label key={m} style={{display:'flex', alignItems:'center', gap:6, background:C.s3, padding:'6px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${form.permissions.includes(m)?C.blue:C.border}`}}>
                        <input type="checkbox" checked={form.permissions.includes(m)} 
                          onChange={e => {
                            const next = e.target.checked ? [...form.permissions, m] : form.permissions.filter(p => p !== m);
                            setForm(p => ({...p, permissions: next}));
                          }} 
                          style={{accentColor:C.blue}}
                        />
                        <span style={{fontSize:12, color:form.permissions.includes(m)?C.white:C.gray, textTransform:'capitalize'}}>{m}</span>
                      </label>
                    ))}
                  </div>

                  {form.role === 'city_manager' && (
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:11, fontWeight:700, color:C.gray, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:6}}>Assigned Cities</div>
                      <div style={{display:'flex', flexWrap:'wrap', gap:6, background:C.s3, padding:8, borderRadius:10, border:`1px solid ${C.border}`}}>
                        {allCities.map(c => (
                          <button key={c} onClick={() => {
                            const next = form.assigned_cities.includes(c) ? form.assigned_cities.filter(x => x !== c) : [...form.assigned_cities, c];
                            setForm(p => ({...p, assigned_cities: next}));
                          }} type="button"
                            style={{padding:'4px 10px', borderRadius:6, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', background:form.assigned_cities.includes(c)?C.blue:C.s4, color:form.assigned_cities.includes(c)?'#fff':C.gray}}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {isPlatformAdmin && (
                <div style={{gridColumn:'1/-1', marginTop: 8}}>
                  <label style={{ display: 'block', color: C.gray, fontSize: 11, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>CLIENT</label>
                  <ClientSelect 
                    value={form.client_id || ''} 
                    onChange={(id) => setForm(p => ({ ...p, client_id: id }))} 
                  />
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setShowEdit(false)} style={{flex:1,padding:'11px',background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:11,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={handleEdit} disabled={saving} style={{flex:2,padding:'11px',background:C.blue,border:'none',color:'#fff',borderRadius:11,fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer'}}>
                {saving?<Spin/>:'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {selected && !showEdit && (
        <Modal onClose={()=>setSelected(null)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:480,padding:28,position:'relative'}}>
            <button onClick={()=>setSelected(null)} style={{position:'absolute',top:16,right:16,background:C.s3,border:`1px solid ${C.border}`,borderRadius:9,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.gray,fontSize:16}}>✕</button>
            <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:22}}>
              <div style={{width:60,height:60,borderRadius:18,background:selected.role==='supervisor'?C.yellowD:C.blueD,border:`1.5px solid ${selected.role==='supervisor'?'rgba(255,184,0,0.2)':'rgba(62,158,255,0.2)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:selected.role==='supervisor'?C.yellow:C.blue}}>{selected.name?.[0]||'?'}</div>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>{selected.name}</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>{selected.role.toUpperCase()} · {selected.employee_id}</div>
                <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,marginTop:6,display:'inline-block',background:selected.is_active?C.greenD:C.redD,color:selected.is_active?C.green:C.red}}>{selected.is_active?'● Active':'Inactive'}</span>
              </div>
            </div>

            <div style={{marginBottom:'24px',border:'1px solid #e5e7eb',borderRadius:'12px',padding:'16px',background:'#f9fafb'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <h3 style={{fontSize:'14px',fontWeight:600}}>App Credentials</h3>
                {!showPwReset ? (
                  <button onClick={() => { setShowPwReset(true); setNewAppPw(selected.app_password || ''); }} style={{fontSize:'12px',color:'#007bff',background:'white',padding:'4px 10px',borderRadius:'6px',border:'1px solid #e5e7eb',cursor:'pointer'}}>Manage</button>
                ) : (
                  <button onClick={() => setShowPwReset(false)} style={{fontSize:'12px',color:'#6b7280',background:'white',padding:'4px 10px',borderRadius:'6px',border:'1px solid #e5e7eb',cursor:'pointer'}}>Cancel</button>
                )}
              </div>
              
              {!showPwReset ? (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                  <Field label="App Password">
                    <div style={{fontSize:'14px',fontFamily:'monospace',color:'#374151'}}>{selected.app_password || 'Not set'}</div>
                  </Field>
                  <Field label="Login Mobile">
                    <div style={{fontSize:'14px',color:'#374151'}}>{selected.mobile || 'Not set'}</div>
                  </Field>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column' as const,gap:'12px'}}>
                  <div style={{fontSize:'12px',color:'#6b7280'}}>Set a new password for mobile app login.</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <input className="kinp" style={{...inp,flex:1}} type="text" placeholder="New App Password" value={newAppPw} onChange={e => setNewAppPw(e.target.value)} />
                    <button 
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
                      style={{backgroundColor:'#007bff',color:'white',padding:'8px 16px',borderRadius:'8px',border:'none',fontSize:'13px',fontWeight:600,cursor:pwUpdating?'not-allowed':'pointer',opacity:pwUpdating?0.7:1}}
                    >
                      {pwUpdating ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
               <div style={{background:C.s3,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:C.gray,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>Mobile</div>
                  <div style={{fontSize:13,fontWeight:600}}>{selected.mobile||'—'}</div>
               </div>
               <div style={{background:C.s3,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:C.gray,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>City</div>
                  <div style={{fontSize:13,fontWeight:600}}>{selected.zones?.city||selected.city||'—'}</div>
               </div>
               <div style={{background:C.s3,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:C.gray,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>Zone</div>
                  <div style={{fontSize:13,fontWeight:600}}>{selected.zones?.name||'—'}</div>
               </div>
               <div style={{background:C.s3,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:C.gray,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>Supervisor</div>
                  <div style={{fontSize:13,fontWeight:600}}>{selected.supervisors?.name||'—'}</div>
               </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{openEdit(selected);setSelected(null);}} style={{flex:1,padding:'12px',background:C.blueD,border:`1px solid rgba(62,158,255,0.2)`,color:C.blue,borderRadius:12,fontSize:13,fontWeight:700}}>Edit Profile</button>
              <button onClick={()=>{toggleActive(selected);setSelected(null);}} style={{flex:1,padding:'12px',background:selected.is_active?C.redD:'rgba(0,217,126,0.1)',border:`1px solid ${selected.is_active?C.redB:'rgba(0,217,126,0.2)'}`,color:selected.is_active?C.red:C.green,borderRadius:12,fontSize:13,fontWeight:700}}>
                {selected.is_active?'Deactivate':'Activate'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK MODAL */}
      {showBulk && (
        <Modal onClose={resetBulk}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:700,padding:28,maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Bulk Upload Manpower</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>Upload a CSV to add multiple members at once</div>
              </div>
              <button onClick={resetBulk} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,color:C.gray,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>✕</button>
            </div>
            
            {bulkErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>{bulkErr}</div>}

            {bulkRows.length===0 ? (
               <div onClick={()=>fileRef.current?.click()}
                  style={{border:`2px dashed ${C.border}`,borderRadius:16,padding:'48px 24px',textAlign:'center',cursor:'pointer',transition:'all 0.2s',marginBottom:16}}>
                  <div style={{fontSize:34,marginBottom:12}}>📂</div>
                  <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Select CSV file</div>
                  <div style={{fontSize:12,color:C.gray,marginBottom:14}}>Click to browse or drag and drop</div>
                  <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={onFile}/>
                  <button onClick={(e)=>{e.stopPropagation(); downloadTemplate();}} style={{fontSize:12,color:C.blue,background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>Download Template</button>
                </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,color:C.gray,background:C.s3,padding:'10px 14px',borderRadius:12}}>
                  <div><strong style={{color:C.white}}>{bulkRows.length}</strong> rows found</div>
                  <div><strong style={{color:C.green}}>{bulkRows.filter(r=>r._status==='success').length}</strong> successful</div>
                </div>

                <div style={{maxHeight:300,overflowY:'auto',border:`1px solid ${C.border}`,borderRadius:12}}>
                  {/* Header */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 100px 120px',gap:10,padding:'10px 14px',background:C.s3,borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.5px',textTransform:'uppercase'}}>
                    <div>Name</div>
                    <div>Employee ID</div>
                    <div>Role</div>
                    <div>Status</div>
                  </div>
                  {/* Rows */}
                  {bulkRows.map((r,i) => (
                    <div key={i} className={r._status==='error'?'brow-err':r._status==='success'?'brow-ok':''}
                      style={{display:'grid',gridTemplateColumns:'1fr 1fr 100px 120px',gap:10,padding:'12px 14px',borderBottom:i<bulkRows.length-1?`1px solid ${C.border}`:'none',fontSize:13,alignItems:'center'}}>
                      <div style={{fontWeight:600}}>{r.name || '—'}</div>
                      <div style={{fontFamily:'monospace',color:C.gray}}>{r.employee_id || '—'}</div>
                      <div>{r.role || 'executive'}</div>
                      <div style={{fontSize:11,fontWeight:700,color:r._status==='error'?C.red:r._status==='success'?C.green:C.yellow}}>
                        {r._status.toUpperCase()}
                        {r._error && <div style={{fontSize:10,fontWeight:400,color:C.red,marginTop:2}}>{r._error}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{display:'flex',gap:10,marginTop:10}}>
                   <button onClick={resetBulk} disabled={bulkBusy} style={{flex:1,padding:12,background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:12,fontSize:13,fontWeight:600,cursor:bulkBusy?'not-allowed':'pointer'}}>Cancel</button>
                   {!bulkDone ? (
                     <button onClick={runBulk} disabled={bulkBusy} style={{flex:2,padding:12,background:C.red,border:'none',color:'#fff',borderRadius:12,fontSize:13,fontWeight:700,cursor:bulkBusy?'not-allowed':'pointer',opacity:bulkBusy?0.7:1}}>
                       {bulkBusy?<><Spin/> Processing...</>:'Start Upload'}
                     </button>
                   ) : (
                     <button onClick={resetBulk} style={{flex:2,padding:12,background:C.green,border:'none',color:'#fff',borderRadius:12,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                       Done
                     </button>
                   )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
