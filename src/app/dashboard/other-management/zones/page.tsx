'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';

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
};

interface Zone { id:string; name:string; city?:string; state?:string; meeting_lat?:number; meeting_lng?:number; meeting_address?:string; geofence_radius?:number; is_active:boolean; city_id?:string; }
interface City { id:string; name:string; }
const BLANK = { name:'', city:'', state:'', city_id:'', meeting_lat:'', meeting_lng:'', meeting_address:'', geofence_radius:'100', is_active:true };

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

export default function ZoneManagement() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Zone|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pick = (r:any) => Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data)?r.data:[];
      const zr = await api.get<any>('/api/v1/zones');
      setZones(pick(zr)); setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load zones'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (z:Zone) => {
    setEditing(z);
    setForm({ name:z.name, city:z.city||'', state:z.state||'', city_id:z.city_id||'', meeting_lat:z.meeting_lat!=null?String(z.meeting_lat):'', meeting_lng:z.meeting_lng!=null?String(z.meeting_lng):'', meeting_address:z.meeting_address||'', geofence_radius:z.geofence_radius!=null?String(z.geofence_radius):'100', is_active:z.is_active });
    setFErr(''); setShowModal(true);
  };

  const save = async () => {
    if(!form.name.trim()){setFErr('Zone name is required');return;}
    setSaving(true); setFErr('');
    const payload:any = { name:form.name, city:form.city, state:form.state, is_active:form.is_active, meeting_address:form.meeting_address, geofence_radius:form.geofence_radius?Number(form.geofence_radius):100 };
    if(form.city_id) payload.city_id = form.city_id;
    if(form.meeting_lat) payload.meeting_lat = parseFloat(form.meeting_lat);
    if(form.meeting_lng) payload.meeting_lng = parseFloat(form.meeting_lng);
    try {
      if(editing) await api.patch(`/api/v1/zones/${editing.id}`, payload);
      else await api.post('/api/v1/zones', payload);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (z:Zone) => {
    try { await api.patch(`/api/v1/zones/${z.id}`, {is_active:!z.is_active}); load(); } catch{}
  };

  const sf = (v:string)=>setForm(p=>({...p,...JSON.parse(v)}));
  const filtered = zones.filter(z => z.name.toLowerCase().includes(search.toLowerCase()) || (z.city||'').toLowerCase().includes(search.toLowerCase()));
  const active = zones.filter(z=>z.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Zones',v:zones.length,c:C.yellow},{l:'Active',v:active,c:C.green},{l:'Cities Covered',v:new Set(zones.map(z=>z.city).filter(Boolean)).size,c:C.blue}].map((s,i)=>(
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
          <input style={{...inp,paddingLeft:38}} placeholder="Search zones or cities..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Zone
        </button>
      </div>

      {/* Table */}
      <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 140px 90px 80px',padding:'12px 20px',borderBottom:`1px solid ${C.border}`,gap:12}}>
          {['Zone Name','City','Geofence','Meeting Point','Status','Actions'].map(h=>(
            <div key={h} style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
        : err ? <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
        : filtered.length===0 ? <div style={{padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>{search?'No zones match.':'No zones yet.'}</div>
        : filtered.map((z,i)=>(
          <div key={z.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 140px 90px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',gap:12,alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.s3}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{fontWeight:600,fontSize:14}}>{z.name}</div>
            <div style={{fontSize:13,color:C.gray}}>{z.city||'—'}</div>
            <div style={{fontSize:13,color:C.yellow}}>{z.geofence_radius?`${z.geofence_radius}m`:'—'}</div>
            <div style={{fontSize:12,color:C.gray}}>
              {z.meeting_lat&&z.meeting_lng ? <span style={{color:C.blue}}>{z.meeting_lat.toFixed(4)}, {z.meeting_lng.toFixed(4)}</span> : <span style={{color:C.grayd}}>Not set</span>}
            </div>
            <div>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:z.is_active?C.greenD:`rgba(122,139,160,0.1)`,color:z.is_active?C.green:C.gray}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}}/>
                {z.is_active?'Active':'Inactive'}
              </span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>openEdit(z)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onClick={()=>toggle(z)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:z.is_active?C.red:C.green,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=z.is_active?C.red:C.green}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{z.is_active?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit Zone':'Add Zone'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Create a new operational zone'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}

            <div style={{marginBottom:14}}><Label t="Zone Name" req/><input style={inp} placeholder="e.g. Zone A — Andheri West" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <Label t="City"/>
                <CitySelect
                  value={form.city}
                  onChange={(v, c) => setForm(p=>({...p, city_id: c?.id||'', city: v, state: c?.state||p.state}))}
                  placeholder="Search city..."
                />
              </div>
              <div><Label t="State"/><input style={inp} placeholder="e.g. Maharashtra" value={form.state} onChange={e=>setForm(p=>({...p,state:e.target.value}))}/></div>
            </div>

            <div style={{borderTop:`1px solid ${C.border}`,margin:'18px 0',paddingTop:18}}>
              <div style={{fontSize:12,fontWeight:700,color:C.gray,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:14}}>Meeting Point (Geo-fence Centre)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><Label t="Latitude"/><input style={inp} type="number" step="any" placeholder="e.g. 19.0760" value={form.meeting_lat} onChange={e=>setForm(p=>({...p,meeting_lat:e.target.value}))}/></div>
                <div><Label t="Longitude"/><input style={inp} type="number" step="any" placeholder="e.g. 72.8777" value={form.meeting_lng} onChange={e=>setForm(p=>({...p,meeting_lng:e.target.value}))}/></div>
              </div>
              <div style={{marginBottom:12}}><Label t="Meeting Address"/><input style={inp} placeholder="e.g. Lokhandwala, Andheri West" value={form.meeting_address} onChange={e=>setForm(p=>({...p,meeting_address:e.target.value}))}/></div>
              <div><Label t="Geofence Radius (meters)"/><input style={inp} type="number" min="50" max="5000" placeholder="100" value={form.geofence_radius} onChange={e=>setForm(p=>({...p,geofence_radius:e.target.value}))}/></div>
            </div>

            {editing && (
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <div onClick={()=>setForm(p=>({...p,is_active:!p.is_active}))} style={{width:40,height:22,borderRadius:11,background:form.is_active?C.red:C.grayd,cursor:'pointer',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:3,left:form.is_active?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                </div>
                <span style={{fontSize:13,color:C.gray}}>Active</span>
              </div>
            )}
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',border:`1px solid ${C.border}`,borderRadius:11,background:'transparent',color:C.gray,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:'11px',border:'none',borderRadius:11,background:C.red,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:"'DM Sans',sans-serif",opacity:saving?0.7:1}}>
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} Zone`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
