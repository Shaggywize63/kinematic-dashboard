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
  teal:'#00C9B1',tealD:'rgba(0,201,177,0.08)',
};

interface Store { id:string; name:string; store_code?:string; owner_name?:string; phone?:string; address?:string; lat?:number; lng?:number; store_type?:string; is_active:boolean; zone_id?:string; city_id?:string; zones?:{name:string}; cities?:{name:string}; }
interface Zone { id:string; name:string; city?:string; }
interface City { id:string; name:string; }
const BLANK = { name:'', store_code:'', owner_name:'', phone:'', address:'', lat:'', lng:'', store_type:'retail', zone_id:'', city_id:'', is_active:true };
const STORE_TYPES = ['retail','kirana','supermarket','pan_shop','grocery','pharmacy','other'];

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

const TypeBadge = ({t}:{t?:string}) => {
  const colors:{[k:string]:string} = {retail:C.blue,kirana:C.teal,supermarket:C.yellow,pan_shop:C.green,grocery:'#FF7A30',pharmacy:C.red,other:C.gray};
  const c = colors[t||'other']||C.gray;
  return <span style={{display:'inline-flex',padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:`${c}18`,color:c}}>{(t||'retail').replace('_',' ')}</span>;
};

export default function StoreManagement() {
  const [stores, setStores] = useState<Store[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Store|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');
  const [detailStore, setDetailStore] = useState<Store|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, zr, cr] = await Promise.all([
        api.get<any>('/api/v1/stores'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/cities'),
      ]);
      const pick = (r:any) => Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data)?r.data:[];
      setStores(pick(sr)); setZones(pick(zr)); setCities(pick(cr)); setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load stores'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (s:Store) => {
    setEditing(s);
    setForm({ name:s.name, store_code:s.store_code||'', owner_name:s.owner_name||'', phone:s.phone||'', address:s.address||'', lat:s.lat!=null?String(s.lat):'', lng:s.lng!=null?String(s.lng):'', store_type:s.store_type||'retail', zone_id:s.zone_id||'', city_id:s.city_id||'', is_active:s.is_active });
    setFErr(''); setShowModal(true);
  };

  const save = async () => {
    if(!form.name.trim()){setFErr('Store name is required');return;}
    setSaving(true); setFErr('');
    const payload:any = { name:form.name, store_code:form.store_code||null, owner_name:form.owner_name||null, phone:form.phone||null, address:form.address||null, store_type:form.store_type, is_active:form.is_active };
    if(form.zone_id) payload.zone_id = form.zone_id;
    if(form.city_id) payload.city_id = form.city_id;
    if(form.lat) payload.lat = parseFloat(form.lat);
    if(form.lng) payload.lng = parseFloat(form.lng);
    try {
      if(editing) await api.patch(`/api/v1/stores/${editing.id}`, payload);
      else await api.post('/api/v1/stores', payload);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (s:Store) => {
    try { await api.patch(`/api/v1/stores/${s.id}`, {is_active:!s.is_active}); load(); } catch{}
  };

  const filtered = stores.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase()) || (s.store_code||'').toLowerCase().includes(search.toLowerCase()) || (s.owner_name||'').toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || s.store_type === filterType)
  );
  const active = stores.filter(s=>s.is_active).length;
  const withGeo = stores.filter(s=>s.lat&&s.lng).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Stores',v:stores.length,c:C.teal},{l:'Active',v:active,c:C.green},{l:'With Geo Location',v:withGeo,c:C.blue},{l:'Zones Covered',v:new Set(stores.map(s=>s.zone_id).filter(Boolean)).size,c:C.yellow}].map((s,i)=>(
          <div key={i} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:'18px 20px'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>{s.l}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:200,position:'relative'}}>
          <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.gray}} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{...inp,paddingLeft:38}} placeholder="Search stores, codes, owners..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={{...inp,width:'auto',minWidth:140}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {STORE_TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
        </select>
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Store
        </button>
      </div>

      {/* Table */}
      <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 90px 1fr 120px 130px 90px 80px',padding:'12px 20px',borderBottom:`1px solid ${C.border}`,gap:12}}>
          {['Store Name','Code','Owner / Phone','Type','Location','Status','Actions'].map(h=>(
            <div key={h} style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
        : err ? <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
        : filtered.length===0 ? <div style={{padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>{search||filterType?'No stores match.':'No stores yet. Add your first store.'}</div>
        : filtered.map((s,i)=>(
          <div key={s.id} style={{display:'grid',gridTemplateColumns:'1fr 90px 1fr 120px 130px 90px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',gap:12,alignItems:'center',cursor:'pointer'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.s3}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            onClick={()=>setDetailStore(s)}
          >
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{s.name}</div>
              {s.zones && <div style={{fontSize:11,color:C.gray,marginTop:2}}>{s.zones.name}</div>}
            </div>
            <div style={{fontSize:12,color:C.gray,fontFamily:'monospace'}}>{s.store_code||'—'}</div>
            <div>
              <div style={{fontSize:13}}>{s.owner_name||'—'}</div>
              {s.phone && <div style={{fontSize:11,color:C.gray}}>{s.phone}</div>}
            </div>
            <div onClick={e=>e.stopPropagation()}><TypeBadge t={s.store_type}/></div>
            <div onClick={e=>e.stopPropagation()}>
              {s.lat&&s.lng ? (
                <a href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer"
                  style={{fontSize:11,color:C.blue,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
                  {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                </a>
              ) : <span style={{fontSize:12,color:C.grayd}}>No GPS</span>}
            </div>
            <div onClick={e=>e.stopPropagation()}>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.is_active?C.greenD:`rgba(122,139,160,0.1)`,color:s.is_active?C.green:C.gray}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}}/>
                {s.is_active?'Active':'Inactive'}
              </span>
            </div>
            <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>openEdit(s)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onClick={()=>toggle(s)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:s.is_active?C.red:C.green,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=s.is_active?C.red:C.green}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{s.is_active?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Store Detail Panel */}
      {detailStore && (
        <Overlay onClose={()=>setDetailStore(null)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:460}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>{detailStore.name}</div>
                <TypeBadge t={detailStore.store_type}/>
              </div>
              <button onClick={()=>setDetailStore(null)} style={{width:32,height:32,border:`1px solid ${C.border}`,borderRadius:9,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {[
              {l:'Store Code',v:detailStore.store_code||'—'},
              {l:'Owner',v:detailStore.owner_name||'—'},
              {l:'Phone',v:detailStore.phone||'—'},
              {l:'Zone',v:detailStore.zones?.name||'—'},
              {l:'Address',v:detailStore.address||'—'},
            ].map((r,i)=>(
              <div key={i} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:12,color:C.gray,width:100,flexShrink:0}}>{r.l}</span>
                <span style={{fontSize:13,fontWeight:500}}>{r.v}</span>
              </div>
            ))}
            {detailStore.lat && detailStore.lng && (
              <div style={{marginTop:16,padding:14,background:C.s3,borderRadius:12,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>GPS Location</div>
                <div style={{fontSize:14,fontFamily:'monospace',color:C.white,marginBottom:10}}>{detailStore.lat.toFixed(6)}, {detailStore.lng.toFixed(6)}</div>
                <a href={`https://maps.google.com/?q=${detailStore.lat},${detailStore.lng}`} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:C.blueD,border:`1px solid ${C.blue}40`,borderRadius:8,color:C.blue,fontSize:12,fontWeight:600,textDecoration:'none'}}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
                  Open in Google Maps
                </a>
              </div>
            )}
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>{setDetailStore(null);openEdit(detailStore);}} style={{flex:1,padding:'10px',border:`1px solid ${C.border}`,borderRadius:11,background:'transparent',color:C.white,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Edit Store</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit Store':'Add Store'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Register a new store / outlet'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div style={{gridColumn:'1/-1'}}><Label t="Store Name" req/><input style={inp} placeholder="e.g. Sharma General Store" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
              <div><Label t="Store Code"/><input style={inp} placeholder="e.g. STR-001" value={form.store_code} onChange={e=>setForm(p=>({...p,store_code:e.target.value}))}/></div>
              <div><Label t="Store Type"/><select style={inp} value={form.store_type} onChange={e=>setForm(p=>({...p,store_type:e.target.value}))}>{STORE_TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}</select></div>
              <div><Label t="Owner Name"/><input style={inp} placeholder="Owner full name" value={form.owner_name} onChange={e=>setForm(p=>({...p,owner_name:e.target.value}))}/></div>
              <div><Label t="Phone"/><input style={inp} placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></div>
              <div><Label t="Zone"/><select style={inp} value={form.zone_id} onChange={e=>setForm(p=>({...p,zone_id:e.target.value}))}><option value="">Select zone...</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></div>
              <div><Label t="City"/><select style={inp} value={form.city_id} onChange={e=>setForm(p=>({...p,city_id:e.target.value}))}><option value="">Select city...</option>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div style={{gridColumn:'1/-1'}}><Label t="Address"/><input style={inp} placeholder="Full store address" value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))}/></div>
            </div>

            <div style={{background:C.s3,border:`1px solid ${C.border}`,borderRadius:13,padding:16,marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.teal,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:14,display:'flex',alignItems:'center',gap:7}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
                GPS Coordinates
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div><Label t="Latitude"/><input style={inp} type="number" step="any" placeholder="e.g. 19.0760" value={form.lat} onChange={e=>setForm(p=>({...p,lat:e.target.value}))}/></div>
                <div><Label t="Longitude"/><input style={inp} type="number" step="any" placeholder="e.g. 72.8777" value={form.lng} onChange={e=>setForm(p=>({...p,lng:e.target.value}))}/></div>
              </div>
              <div style={{fontSize:11,color:C.gray,marginTop:8}}>Used for store location on map. Find on Google Maps → right-click → Copy coordinates.</div>
            </div>

            {editing && (
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <div onClick={()=>setForm(p=>({...p,is_active:!p.is_active}))} style={{width:40,height:22,borderRadius:11,background:form.is_active?C.red:C.grayd,cursor:'pointer',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:3,left:form.is_active?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                </div>
                <span style={{fontSize:13,color:C.gray}}>Active</span>
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',border:`1px solid ${C.border}`,borderRadius:11,background:'transparent',color:C.gray,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:'11px',border:'none',borderRadius:11,background:C.red,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:"'DM Sans',sans-serif",opacity:saving?0.7:1}}>
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} Store`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
