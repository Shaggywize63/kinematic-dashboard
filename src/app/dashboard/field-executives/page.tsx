'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import CitySelect from '../../../components/CitySelect';

const C = {
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  s1:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8',
};

interface Zone { id: string; name: string; city?: string; }
interface FieldExecutive {
  id: string; name: string; employee_id?: string; mobile?: string;
  role: string; is_active: boolean; zone_id?: string; city?: string;
  zones?: { name: string; city?: string };
  supervisor_id?: string; supervisors?: { name: string };
  city_manager_id?: string;
  created_at: string;
  is_checked_in?: boolean; today_engagements?: number; today_tff?: number; hours_worked?: number;
}
interface FormData {
  name: string; mobile: string; password: string; employee_id: string;
  zone_id: string; role: string; supervisor_id: string; joined_date: string; city: string;
}
interface BulkRow {
  name: string; employee_id: string; mobile?: string; password?: string;
  role?: string; city?: string;
  _status: 'pending' | 'success' | 'error'; _error?: string;
}

const EMPTY_FORM: FormData = {
  name:'', mobile:'', password:'', employee_id:'',
  zone_id:'', role:'executive', supervisor_id:'', joined_date:'', city:'',
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
  a.download = `field_executives_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

/* ── Template download ── */
function downloadTemplate() {
  const header = 'name*,employee_id*,mobile,password,role,zone_name,supervisor_name,city';
  const ex1    = 'Rajiv Kumar,FE-001,9876543210,Welcome@123,executive,Zone A,Vikram Nair,Mumbai';
  const ex2    = 'Priya Sharma,FE-002,,,,,,Delhi';
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
  }).filter(r=>r['name']||r['employee_id']);
}

/* ══════════════════════════════════════════════════════ */
export default function FieldExecutivesPage() {
  const [fes,      setFes]     = useState<FieldExecutive[]>([]);
  const [zones,    setZones]   = useState<Zone[]>([]);
  const [sups,     setSups]    = useState<FieldExecutive[]>([]);
  const [cms,      setCMs]     = useState<FieldExecutive[]>([]);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');
  const [search,   setSearch]  = useState('');
  const [filter,   setFilter]  = useState('all');
  const [fCity,    setFCity]   = useState('');
  const [fSup,     setFSup]    = useState('');
  const [fCM,      setFCM]     = useState('');
  const [selected, setSelected]= useState<FieldExecutive|null>(null);

  const [showAdd,   setShowAdd]  = useState(false);
  const [showEdit,  setShowEdit] = useState(false);
  const [showBulk,  setShowBulk] = useState(false);
  const [editTarget,setEditT]   = useState<FieldExecutive|null>(null);

  const [form,    setForm]   = useState<FormData>(EMPTY_FORM);
  const [saving,  setSaving] = useState(false);
  const [formErr, setFErr]   = useState('');
  const setF = (k: keyof FormData, v: string) => setForm(p=>({...p,[k]:v}));

  const [bulkRows, setBulk]     = useState<BulkRow[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const [bulkErr,  setBulkErr]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uR,zR,sR,cR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=500'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/users?role=supervisor&limit=200'),
        api.get<any>('/api/v1/users?role=city_manager&limit=100'),
      ]);
      const pick = (r: any): any[] => {
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        return r?.users || [];
      };
      const all = pick(uR);
      setFes(all.filter((u:any)=>u.role==='executive'||u.role==='field_executive'));
      setZones(pick(zR));
      setSups(pick(sR));
      setCMs(pick(cR));
      setError('');
    } catch(e:any) { setError(e.message||'Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(()=>{ fetchData(); },[fetchData]);

  const supMap: Record<string,string> = {};
  sups.forEach(s=>{ supMap[s.id]=s.name; });

  const allCities = Array.from(new Set(
    fes.map(fe=>fe.zones?.city||fe.city||'').filter(Boolean)
  )).sort();

  const shown = fes.filter(fe => {
    const q = search.toLowerCase();
    const ms = !q||fe.name?.toLowerCase().includes(q)||(fe.employee_id||'').toLowerCase().includes(q)||(fe.zones?.name||'').toLowerCase().includes(q)||(fe.mobile||'').includes(q);
    const mf = filter==='all'||(filter==='active'&&fe.is_active)||(filter==='inactive'&&!fe.is_active)||(filter==='checked_in'&&fe.is_checked_in);
    const mc = !fCity||(fe.zones?.city||fe.city)===fCity;
    const ms2= !fSup||fe.supervisor_id===fSup;
    const mc2= !fCM||fe.city_manager_id===fCM;
    return ms&&mf&&mc&&ms2&&mc2;
  });

  const stats = { total:fes.length, active:fes.filter(f=>f.is_active).length, checkedIn:fes.filter(f=>f.is_checked_in).length, inactive:fes.filter(f=>!f.is_active).length };

  /* ── ADD ── */
  const handleAdd = async () => {
    if (!form.name||!form.employee_id) { setFErr('Name and Employee ID are required.'); return; }
    setSaving(true); setFErr('');
    try {
      await api.post('/api/v1/users',{
        name:form.name, mobile:form.mobile||undefined, password:form.password||undefined,
        role:form.role, employee_id:form.employee_id, zone_id:form.zone_id||undefined,
        supervisor_id:form.supervisor_id||undefined, joined_date:form.joined_date||undefined, city:form.city||undefined,
      });
      setShowAdd(false); setForm(EMPTY_FORM); fetchData();
    } catch(e:any){ setFErr(e.message||'Failed'); } finally{ setSaving(false); }
  };

  /* ── EDIT ── */
  const openEdit = (fe: FieldExecutive) => {
    setEditT(fe);
    setForm({ name:fe.name, mobile:fe.mobile||'', password:'', employee_id:fe.employee_id||'', zone_id:fe.zone_id||'', role:fe.role, supervisor_id:fe.supervisor_id||'', joined_date:'', city:fe.city||fe.zones?.city||'' });
    setFErr(''); setShowEdit(true);
  };
  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true); setFErr('');
    try {
      await api.patch(`/api/v1/users/${editTarget.id}`,{ name:form.name, zone_id:form.zone_id||null, supervisor_id:form.supervisor_id||null, employee_id:form.employee_id||null, is_active:editTarget.is_active, city:form.city||null });
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

        {error && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:12,padding:'12px 16px',fontSize:13,color:C.red}}>⚠ {error}</div>}

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {[{l:'Total FEs',v:stats.total,c:C.blue,i:'👥'},{l:'Active',v:stats.active,c:C.green,i:'✓'},{l:'In Field',v:stats.checkedIn,c:C.purple,i:'📍'},{l:'Inactive',v:stats.inactive,c:C.gray,i:'○'}].map((s,i)=>(
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
            <div style={{flex:1,position:'relative',minWidth:200}}>
              <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',opacity:0.3}} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, ID, mobile or zone..."
                style={{...inp,paddingLeft:34,borderRadius:12}} className="kinp"/>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[['all','All'],['active','Active'],['inactive','Inactive'],['checked_in','In Field']].map(([f,l])=>(
                <button key={f} onClick={()=>setFilter(f)} style={{padding:'9px 14px',borderRadius:10,border:`1px solid ${filter===f?C.red:C.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.15s',background:filter===f?C.red:C.s2,color:filter===f?'#fff':C.gray,whiteSpace:'nowrap' as const}}>{l}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0}}>
              {/* Export */}
              <button onClick={()=>exportCSV(shown,supMap)} title="Download current view as CSV"
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',background:C.s2,border:`1px solid ${C.border}`,borderRadius:10,color:C.green,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap' as const}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
              {/* Bulk upload */}
              <button onClick={()=>setShowBulk(true)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',background:C.s2,border:`1px solid ${C.border}`,borderRadius:10,color:C.blue,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap' as const}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Bulk Upload
              </button>
              {/* Add */}
              <button onClick={()=>{setForm(EMPTY_FORM);setFErr('');setShowAdd(true);}}
                style={{display:'flex',alignItems:'center',gap:8,padding:'9px 18px',background:C.red,border:'none',borderRadius:10,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",boxShadow:`0 4px 16px rgba(224,30,44,0.3)`,whiteSpace:'nowrap' as const}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Executive
              </button>
              <button onClick={fetchData} style={{padding:'9px 12px',background:C.s2,border:`1px solid ${C.border}`,color:C.gray,borderRadius:10,fontSize:13,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>↻</button>
            </div>
          </div>

          {/* Row 2 — Advanced filters */}
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',flexShrink:0}}>FILTER BY</span>
            {/* City */}
            <select value={fCity} onChange={e=>setFCity(e.target.value)} className="kinp"
              style={{...inp,width:'auto',minWidth:130,appearance:'none' as const,borderRadius:10,fontSize:12,background:fCity?C.s4:C.s2,borderColor:fCity?C.blue:C.border,color:fCity?C.white:C.gray}}>
              <option value="">All Cities</option>
              {allCities.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {/* Supervisor */}
            <select value={fSup} onChange={e=>setFSup(e.target.value)} className="kinp"
              style={{...inp,width:'auto',minWidth:155,appearance:'none' as const,borderRadius:10,fontSize:12,background:fSup?C.s4:C.s2,borderColor:fSup?C.blue:C.border,color:fSup?C.white:C.gray}}>
              <option value="">All Supervisors</option>
              {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {/* City Manager */}
            <select value={fCM} onChange={e=>setFCM(e.target.value)} className="kinp"
              style={{...inp,width:'auto',minWidth:170,appearance:'none' as const,borderRadius:10,fontSize:12,background:fCM?C.s4:C.s2,borderColor:fCM?C.blue:C.border,color:fCM?C.white:C.gray}}>
              <option value="">All City Managers</option>
              {cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}
            </select>
            {(fCity||fSup||fCM) && (
              <button onClick={()=>{setFCity('');setFSup('');setFCM('');}} style={{fontSize:12,color:C.red,background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,padding:'4px 8px'}}>✕ Clear</button>
            )}
            <span style={{marginLeft:'auto',fontSize:12,color:C.grayd,fontWeight:600}}>{shown.length} of {fes.length} executives</span>
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{padding:60,textAlign:'center',color:C.grayd,fontSize:14}}>Loading field executives...</div>
        ) : shown.length===0 ? (
          <div style={{padding:60,textAlign:'center',color:C.grayd,fontSize:14}}>
            {fes.length===0?'No field executives yet. Add one to get started.':'No results match your filters.'}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(310px,1fr))',gap:14}}>
            {shown.map(fe=>(
              <div key={fe.id} className="fe-card"
                style={{background:C.s2,border:`1px solid ${fe.is_checked_in?C.green+'28':fe.is_active?C.border:'rgba(122,139,160,0.15)'}`,borderRadius:16,padding:18,cursor:'pointer',opacity:fe.is_active?1:0.65}}
                onClick={()=>setSelected(fe)}>
                <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:14}}>
                  <div style={{width:44,height:44,borderRadius:13,background:fe.is_active?C.blueD:'rgba(122,139,160,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:fe.is_active?C.blue:C.gray,flexShrink:0}}>{fe.name?.[0]||'?'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fe.name}</div>
                    <div style={{fontSize:11,color:C.grayd,marginTop:2}}>{fe.employee_id||fe.id.slice(0,8)} · {fe.zones?.name||'No zone'}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,flexShrink:0,background:fe.is_checked_in?'rgba(0,217,126,0.12)':!fe.is_active?'rgba(122,139,160,0.1)':'rgba(224,30,44,0.1)',color:fe.is_checked_in?C.green:!fe.is_active?C.gray:C.red}}>{fe.is_checked_in?'● Active':!fe.is_active?'Inactive':'Absent'}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7, marginBottom:12 }}>
                  {[{l:'TFF Today',v:fe.today_tff??'—',c:C.green},{l:'Hours',v:fe.hours_worked!=null?`${Math.floor(fe.hours_worked)}h ${Math.round((fe.hours_worked % 1) * 60)}m`:'—',c:C.yellow}].map(s=>(
                    <div key={s.l} style={{background:C.s3,borderRadius:9,padding:'8px 0',textAlign:'center'}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800,color:s.c}}>{s.v}</div>
                      <div style={{fontSize:10,color:C.grayd,marginTop:1}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:C.grayd}}>{fe.zones?.city||fe.city||fe.zones?.name||'No zone'}</span>
                  <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                    <button className="btn-icon" onClick={()=>openEdit(fe)} style={{width:28,height:28,borderRadius:8,background:C.blueD,border:`1px solid rgba(62,158,255,0.2)`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.blue}}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="btn-icon" onClick={()=>toggleActive(fe)} style={{width:28,height:28,borderRadius:8,background:fe.is_active?'rgba(0,217,126,0.1)':'rgba(122,139,160,0.1)',border:`1px solid ${fe.is_active?'rgba(0,217,126,0.2)':'rgba(122,139,160,0.2)'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:fe.is_active?C.green:C.gray}}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ ADD MODAL ══ */}
      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:540,padding:28,maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Add Field Executive</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>Only Name and Employee ID are required</div>
              </div>
              <button onClick={()=>setShowAdd(false)} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,cursor:'pointer',color:C.gray,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
            {formErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>{formErr}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}><Field label="Full Name" required><input className="kinp" style={inp} placeholder="e.g. Rajiv Kumar" value={form.name} onChange={e=>setF('name',e.target.value)}/></Field></div>
              <Field label="Employee ID" required><input className="kinp" style={inp} placeholder="e.g. FE-001" value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
              <Field label="Role">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.role} onChange={e=>setF('role',e.target.value)}>
                  <option value="executive">Executive</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="city_manager">City Manager</option>
                </select>
              </Field>
              <div style={{gridColumn:'1/-1'}}><Field label="Mobile Number"><input className="kinp" style={inp} placeholder="10-digit mobile (optional)" value={form.mobile} onChange={e=>setF('mobile',e.target.value)} maxLength={10}/></Field></div>
              <div style={{gridColumn:'1/-1'}}><Field label="Password"><input className="kinp" style={inp} type="password" placeholder="Login password (optional)" value={form.password} onChange={e=>setF('password',e.target.value)}/></Field></div>
              <Field label="Zone">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}{z.city?` — ${z.city}`:''}</option>)}
                </select>
              </Field>
              <Field label="City">
                <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Supervisor">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">No supervisor</option>
                  {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Joining Date"><input className="kinp" style={inp} type="date" value={form.joined_date} onChange={e=>setF('joined_date',e.target.value)}/></Field>
            </div>
            <div style={{display:'flex',gap:10,marginTop:8}}>
              <button onClick={()=>setShowAdd(false)} style={{flex:1,padding:'11px',background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:11,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{flex:2,padding:'11px',background:C.red,border:'none',color:'#fff',borderRadius:11,fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:saving?0.7:1,boxShadow:`0 4px 16px rgba(224,30,44,0.3)`}}>
                {saving?<><Spin/>Creating...</>:'Create Executive'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ BULK UPLOAD MODAL ══ */}
      {showBulk && (
        <Modal onClose={resetBulk}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:700,padding:28,maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Bulk Upload Executives</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>Upload a CSV — only <strong style={{color:C.white}}>name</strong> and <strong style={{color:C.white}}>employee_id</strong> are required per row</div>
              </div>
              <button onClick={resetBulk} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,cursor:'pointer',color:C.gray,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
            </div>

            {/* Template banner */}
            <div style={{background:C.blueD,border:`1px solid rgba(62,158,255,0.2)`,borderRadius:14,padding:'14px 18px',marginBottom:20,display:'flex',alignItems:'center',gap:14}}>
              <div style={{fontSize:24,flexShrink:0}}>📄</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>Download CSV Template</div>
                <div style={{fontSize:12,color:C.gray}}>Columns: <span style={{color:C.white,fontWeight:600}}>name*, employee_id*</span>, mobile, password, role, zone_name, supervisor_name, city</div>
              </div>
              <button onClick={downloadTemplate} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 16px',background:C.blue,border:'none',borderRadius:10,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",flexShrink:0,whiteSpace:'nowrap' as const}}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Template
              </button>
            </div>

            {/* Drop zone */}
            {bulkRows.length===0 && (
              <>
                {bulkErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:14}}>{bulkErr}</div>}
                <div onClick={()=>fileRef.current?.click()}
                  style={{border:`2px dashed ${C.border}`,borderRadius:16,padding:'48px 24px',textAlign:'center',cursor:'pointer',transition:'all 0.2s',marginBottom:16}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.background='rgba(62,158,255,0.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background='transparent';}}>
                  <div style={{fontSize:34,marginBottom:12}}>📂</div>
                  <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Click to select CSV file</div>
                  <div style={{fontSize:12,color:C.gray}}>Accepts .csv files · Max 1,000 rows per upload</div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={onFile}/>
                </div>
              </>
            )}

            {/* Preview table */}
            {bulkRows.length>0 && (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700}}>
                    {bulkRows.length} rows &nbsp;·&nbsp;
                    <span style={{color:C.green}}>{bulkRows.filter(r=>r._status==='success').length} done</span> &nbsp;·&nbsp;
                    <span style={{color:C.red}}>{bulkRows.filter(r=>r._status==='error').length} errors</span> &nbsp;·&nbsp;
                    <span style={{color:C.yellow}}>{pendingBulk} pending</span>
                  </div>
                  {!bulkDone && <button onClick={()=>{setBulk([]);setBulkErr('');}} style={{fontSize:12,color:C.gray,background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>✕ Clear</button>}
                </div>

                <div style={{background:C.s3,borderRadius:12,overflow:'hidden',border:`1px solid ${C.border}`,marginBottom:16,maxHeight:300,overflowY:'auto'}}>
                  <div style={{display:'grid',gridTemplateColumns:'24px 1fr 1fr 1fr 1fr 90px',gap:8,padding:'9px 14px',background:C.s4,borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.7px',textTransform:'uppercase' as const,position:'sticky',top:0}}>
                    <div>#</div><div>Name</div><div>Employee ID</div><div>Mobile</div><div>Role/City</div><div>Status</div>
                  </div>
                  {bulkRows.map((r,i)=>(
                    <div key={i} className={r._status==='success'?'brow-ok':r._status==='error'?'brow-err':''}
                      style={{display:'grid',gridTemplateColumns:'24px 1fr 1fr 1fr 1fr 90px',gap:8,padding:'9px 14px',borderBottom:i<bulkRows.length-1?`1px solid ${C.border}`:'none',fontSize:12,alignItems:'center'}}>
                      <div style={{color:C.grayd}}>{i+1}</div>
                      <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.name||<span style={{color:C.red}}>Missing</span>}</div>
                      <div style={{color:C.gray,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.employee_id||<span style={{color:C.red}}>Missing</span>}</div>
                      <div style={{color:C.gray}}>{r.mobile||'—'}</div>
                      <div style={{color:C.gray,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.role||'executive'}{r.city?` · ${r.city}`:''}</div>
                      <div>
                        {r._status==='success' && <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:C.greenD,color:C.green}}>✓ Done</span>}
                        {r._status==='error'   && <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:C.redD,color:C.red}} title={r._error}>✗ Error</span>}
                        {r._status==='pending' && <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:'rgba(255,184,0,0.1)',color:C.yellow}}>Pending</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {bulkRows.some(r=>r._status==='error'&&r._error) && (
                  <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:12,color:C.red,marginBottom:14}}>
                    {bulkRows.filter(r=>r._status==='error').map((r,i)=>(
                      <div key={i}><strong>Row {bulkRows.indexOf(r)+1} ({r.name||'?'}):</strong> {r._error}</div>
                    ))}
                  </div>
                )}

                <div style={{display:'flex',gap:10}}>
                  <button onClick={resetBulk} style={{flex:1,padding:'11px',background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:11,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                    {bulkDone?'Close':'Cancel'}
                  </button>
                  {!bulkDone && pendingBulk>0 && (
                    <button onClick={runBulk} disabled={bulkBusy}
                      style={{flex:2,padding:'11px',background:C.red,border:'none',color:'#fff',borderRadius:11,fontSize:13,fontWeight:700,cursor:bulkBusy?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:bulkBusy?0.7:1,boxShadow:`0 4px 16px rgba(224,30,44,0.3)`}}>
                      {bulkBusy?<><Spin/>Uploading...</>:`Upload ${pendingBulk} executives`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ══ EDIT MODAL ══ */}
      {showEdit && editTarget && (
        <Modal onClose={()=>setShowEdit(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:520,padding:28,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div><div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>Edit Executive</div><div style={{fontSize:12,color:C.gray,marginTop:3}}>{editTarget.name}</div></div>
              <button onClick={()=>setShowEdit(false)} style={{width:32,height:32,borderRadius:9,background:C.s3,border:`1px solid ${C.border}`,cursor:'pointer',color:C.gray,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
            {formErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>{formErr}</div>}
            <Field label="Full Name" required><input className="kinp" style={inp} value={form.name} onChange={e=>setF('name',e.target.value)}/></Field>
            <Field label="Employee ID" required><input className="kinp" style={inp} value={form.employee_id} onChange={e=>setF('employee_id',e.target.value)}/></Field>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <Field label="Zone">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.zone_id} onChange={e=>setF('zone_id',e.target.value)}>
                  <option value="">No zone</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="City">
                <CitySelect value={form.city} onChange={(v, c) => setF('city', v)} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Supervisor">
                <select className="kinp" style={{...inp,appearance:'none' as const}} value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}>
                  <option value="">No supervisor</option>
                  {sups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.s3,border:`1px solid ${C.border}`,borderRadius:11,padding:'12px 14px',marginBottom:20}}>
              <div><div style={{fontSize:13,fontWeight:600}}>Account Status</div><div style={{fontSize:11,color:C.gray,marginTop:2}}>{editTarget.is_active?'Currently active':'Currently inactive'}</div></div>
              <div onClick={()=>setEditT(p=>p?{...p,is_active:!p.is_active}:p)} style={{width:44,height:26,borderRadius:13,background:editTarget.is_active?C.green:C.grayd,position:'relative',cursor:'pointer',transition:'background 0.2s',flexShrink:0}}>
                <div style={{position:'absolute',top:3,left:editTarget.is_active?21:3,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowEdit(false)} style={{flex:1,padding:'11px',background:C.s3,border:`1px solid ${C.border}`,color:C.gray,borderRadius:11,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={handleEdit} disabled={saving} style={{flex:2,padding:'11px',background:C.blue,border:'none',color:'#fff',borderRadius:11,fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:saving?0.7:1,boxShadow:`0 4px 16px rgba(62,158,255,0.25)`}}>
                {saving?<><Spin/>Saving...</>:'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {selected && !showEdit && (
        <Modal onClose={()=>setSelected(null)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:22,width:'100%',maxWidth:480,padding:28,position:'relative'}}>
            <button onClick={()=>setSelected(null)} style={{position:'absolute',top:16,right:16,background:C.s3,border:`1px solid ${C.border}`,borderRadius:9,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.gray,fontSize:16}}>✕</button>
            <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:22}}>
              <div style={{width:60,height:60,borderRadius:18,background:C.blueD,border:`1.5px solid rgba(62,158,255,0.2)`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:C.blue}}>{selected.name?.[0]||'?'}</div>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>{selected.name}</div>
                <div style={{fontSize:12,color:C.gray,marginTop:3}}>{selected.employee_id||selected.id.slice(0,8)} · {selected.zones?.name||'No zone'}</div>
                <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,marginTop:6,display:'inline-block',background:selected.is_active?C.greenD:C.redD,color:selected.is_active?C.green:C.red}}>{selected.is_active?'● Active':'Inactive'}</span>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:18}}>
              {[{l:'Mobile',v:selected.mobile||'—'},{l:'Zone',v:selected.zones?.name||'—'},{l:'City',v:selected.zones?.city||selected.city||'—'},{l:'Joined',v:selected.created_at?new Date(selected.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}].map(r=>(
                <div key={r.l} style={{background:C.s3,borderRadius:11,padding:'11px 13px'}}>
                  <div style={{fontSize:10,color:C.grayd,marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.6px'}}>{r.l}</div>
                  <div style={{fontSize:13,fontWeight:600}}>{r.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:9, marginBottom:22 }}>
              {[{l:'TFF Today',v:selected.today_tff??'—',c:C.green},{l:'Hours Today',v:selected.hours_worked!=null?`${Math.floor(selected.hours_worked)}h ${Math.round((selected.hours_worked % 1) * 60)}m`:'—',c:C.yellow}].map(s=>(
                <div key={s.l} style={{background:C.s4,border:`1px solid ${C.border}`,borderRadius:13,padding:'14px 0',textAlign:'center'}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:10,color:C.grayd,marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:9}}>
              <button onClick={()=>{openEdit(selected);setSelected(null);}} style={{flex:1,padding:'11px',background:C.blueD,border:`1px solid rgba(62,158,255,0.2)`,color:C.blue,borderRadius:11,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button onClick={()=>{toggleActive(selected);setSelected(null);}} style={{flex:1,padding:'11px',background:selected.is_active?'rgba(0,217,126,0.08)':'rgba(224,30,44,0.08)',border:`1px solid ${selected.is_active?'rgba(0,217,126,0.2)':'rgba(224,30,44,0.2)'}`,color:selected.is_active?C.green:C.red,borderRadius:11,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                {selected.is_active?'Deactivate':'Activate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
