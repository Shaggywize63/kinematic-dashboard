'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = {
  bg:'#070D18',s2:'#0E1420',s3:'#131B2A',s4:'#1A2438',
  border:'#1E2D45',borderL:'#253650',
  white:'#E8EDF8',gray:'#7A8BA0',grayd:'#2E445E',graydd:'#1A2738',
  red:'#E01E2C',redD:'rgba(224,30,44,0.08)',redB:'rgba(224,30,44,0.2)',
  green:'#00D97E',greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF',blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800',yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF',purpleD:'rgba(155,110,255,0.08)',
  orange:'#FF7A30',orangeD:'rgba(255,122,48,0.08)',
};

interface Activity { 
  id:string; 
  name:string; 
  type?:string; 
  description?:string; 
  icon?:string; 
  color?:string; 
  is_active:boolean; 
  is_geofenced?:boolean; 
  geofence_radius?:number; 
}
const BLANK = { 
  name:'', 
  type:'GT', 
  description:'', 
  icon:'⚡', 
  color:'#3E9EFF', 
  is_active:true, 
  is_geofenced:false, 
  geofence_radius:100 
};
const ACT_TYPES = [{v:'GT',l:'GT Activity'},{v:'MT',l:'MT Activity'},{v:'VISIT',l:'Store Visit'},{v:'SAMPLING',l:'Sampling'},{v:'DEMO',l:'Demo'},{v:'SURVEY',l:'Survey'},{v:'OTHER',l:'Other'}];
const ICONS = ['⚡','🎯','📋','🏪','🤝','📊','🛍️','💡','📦','🔍','✅','🎉'];
const PRESET_COLORS = ['#3E9EFF','#00D97E','#FFB800','#9B6EFF','#FF7A30','#E01E2C','#00C9B1','#FF6B9D'];

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

const TypeBadge = ({t}:{t?:string}) => {
  const found = ACT_TYPES.find(a=>a.v===t);
  return <span style={{display:'inline-flex',padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:`${C.orange}18`,color:C.orange}}>{found?.l||t||'Other'}</span>;
};

export default function ActivityManagement() {
  const [acts, setActs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Activity|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/api/v1/activities');
      const d = Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data)?r.data:[];
      setActs(d); setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load activities'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (a:Activity) => {
    setEditing(a);
    setForm({ 
      name:a.name, 
      type:a.type||'gt', 
      description:a.description||'', 
      icon:a.icon||'⚡', 
      color:a.color||'#3E9EFF', 
      is_active:a.is_active,
      is_geofenced:a.is_geofenced ?? false,
      geofence_radius:a.geofence_radius ?? 100
    });
    setFErr(''); setShowModal(true);
  };

  const save = async () => {
    if(!form.name.trim()){setFErr('Activity name is required');return;}
    setSaving(true); setFErr('');
    const payload = { 
      name:form.name.trim(), 
      type:form.type, 
      description:form.description||null, 
      icon:form.icon||null, 
      color:form.color||null, 
      is_active:form.is_active,
      is_geofenced:form.is_geofenced,
      geofence_radius:form.geofence_radius
    };
    try {
      if(editing) await api.patch(`/api/v1/activities/${editing.id}`, payload);
      else await api.post('/api/v1/activities', payload);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (a:Activity) => {
    try { await api.patch(`/api/v1/activities/${a.id}`, {is_active:!a.is_active}); load(); } catch{}
  };

  const filtered = acts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || (a.type||'').toLowerCase().includes(search.toLowerCase()));
  const active = acts.filter(a=>a.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Activities',v:acts.length,c:C.orange},{l:'Active',v:active,c:C.green},{l:'Types',v:new Set(acts.map(a=>a.type).filter(Boolean)).size,c:C.blue}].map((s,i)=>(
          <div key={i} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:'18px 20px'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>{s.l}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center'}}>
        <div style={{flex:1,position:'relative'}}>
          <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.gray}} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{...inp,paddingLeft:38}} placeholder="Search activities..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Activity
        </button>
      </div>

      {/* Cards Grid */}
      {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
      : err ? <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
      : filtered.length===0 ? (
        <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>
          {search?'No activities match.':'No activities yet. Create your first activity type.'}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
          {filtered.map(a=>(
            <div key={a.id} style={{background:C.s2,border:`1px solid ${a.is_active?C.border:C.graydd}`,borderRadius:16,padding:20,opacity:a.is_active?1:0.6,transition:'all .15s'}}
              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor=a.color||C.border}
              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=a.is_active?C.border:C.graydd}
            >
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div style={{width:46,height:46,borderRadius:14,background:`${a.color||C.blue}18`,border:`1px solid ${a.color||C.blue}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>
                  {a.icon||'⚡'}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={() => window.location.href = `/dashboard/route-plan?tab=mapping&activity_id=${a.id}`} 
                    style={{width:28,height:28,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.purple,display:'flex',alignItems:'center',justifyContent:'center'}}
                    title="Map FEs to this activity"
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.purple;e.currentTarget.style.background=`${C.purple}10`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background='transparent';}}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  </button>
                  <button onClick={()=>openEdit(a)} style={{width:28,height:28,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
                  </button>
                  <button onClick={()=>toggle(a)} style={{width:28,height:28,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:a.is_active?C.red:C.green,display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=a.is_active?C.red:C.green}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{a.is_active?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
                  </button>
                </div>
              </div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:5}}>{a.name}</div>
              <TypeBadge t={a.type}/>
              {a.description && <div style={{fontSize:12,color:C.gray,marginTop:9,lineHeight:1.5}}>{a.description}</div>}
              <div style={{display:'flex',alignItems:'center',gap:5,marginTop:12}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:a.is_active?C.green:C.gray}}/>
                <span style={{fontSize:11,color:a.is_active?C.green:C.gray}}>{a.is_active?'Active':'Inactive'}</span>
                <div style={{width:14,height:14,borderRadius:4,background:a.color||C.blue,marginLeft:'auto'}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:480}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit Activity':'Add Activity'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Create a new activity type for field execs'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}

            <div style={{marginBottom:14}}><Label t="Activity Name" req/><input style={inp} placeholder="e.g. GT Activity" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div style={{marginBottom:14}}><Label t="Type"/><select style={inp} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>{ACT_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            <div style={{marginBottom:14}}><Label t="Description"/><textarea style={{...inp,resize:'none'}} rows={2} placeholder="Brief description of this activity..." value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <Label t="Icon"/>
                <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                  {ICONS.map(ic=>(
                    <div key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{width:36,height:36,borderRadius:9,background:form.icon===ic?`${form.color||C.blue}30`:C.s3,border:`1.5px solid ${form.icon===ic?form.color||C.blue:C.border}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,transition:'all .15s'}}>
                      {ic}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label t="Color"/>
                <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                  {PRESET_COLORS.map(cl=>(
                    <div key={cl} onClick={()=>setForm(p=>({...p,color:cl}))} style={{width:30,height:30,borderRadius:'50%',background:cl,cursor:'pointer',border:`2.5px solid ${form.color===cl?C.white:'transparent'}`,transition:'border .15s'}}/>
                  ))}
                </div>
                <div style={{marginTop:8,display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{width:28,height:28,borderRadius:8,background:form.color||C.blue}}/>
                  <input style={{...inp,fontSize:11,padding:'6px 10px'}} value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))} placeholder="#3E9EFF"/>
                </div>
              </div>
            </div>


            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <Label t="Geo-fencing"/>
                <div style={{display:'flex',alignItems:'center',gap:10,background:C.s3,border:`1.5px solid ${C.border}`,borderRadius:11,padding:'8px 12px'}}>
                  <div onClick={()=>setForm(p=>({...p,is_geofenced:!p.is_geofenced}))} style={{width:34,height:18,borderRadius:10,background:form.is_geofenced?C.green:C.grayd,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0}}>
                    <div style={{position:'absolute',top:2,left:form.is_geofenced?18:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                  </div>
                  <span style={{fontSize:12,color:C.gray,fontWeight:600}}>{form.is_geofenced?'Enabled':'Disabled'}</span>
                </div>
              </div>
              <div>
                <Label t="Radius (meters)"/>
                <input type="number" style={{...inp, opacity: form.is_geofenced?1:0.5}} disabled={!form.is_geofenced} placeholder="e.g. 100" value={form.geofence_radius} onChange={e=>setForm(p=>({...p,geofence_radius:parseInt(e.target.value)||0}))}/>
              </div>
            </div>

            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
              <div onClick={()=>setForm(p=>({...p,is_active:!p.is_active}))} style={{width:40,height:22,borderRadius:11,background:form.is_active?C.red:C.grayd,cursor:'pointer',position:'relative',transition:'background .2s'}}>
                <div style={{position:'absolute',top:3,left:form.is_active?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
              </div>
              <span style={{fontSize:13,color:C.gray}}>Active</span>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',border:`1px solid ${C.border}`,borderRadius:11,background:'transparent',color:C.gray,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:'11px',border:'none',borderRadius:11,background:C.red,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:"'DM Sans',sans-serif",opacity:saving?0.7:1}}>
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} Activity`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
