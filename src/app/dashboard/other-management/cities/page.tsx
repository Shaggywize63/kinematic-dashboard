'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import ClientSelect from '@/components/ClientSelect';
import ConfirmModal from '@/components/ConfirmModal';
import { useAuth } from '@/hooks/useAuth';

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", 
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", 
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", 
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

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
};

interface City { id:string; name:string; state?:string; country?:string; is_active:boolean; created_at:string; }
const BLANK = { name:'', state:'', country:'India', is_active:true, client_id: '' };

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

export default function CityManagement() {
  const [cities, setCities] = useState<City[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<City|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{show:boolean; item:City|null}>({show:false, item:null});
  const [deleting, setDeleting] = useState(false);

  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/api/v1/cities');
      const clResp = isPlatformAdmin ? await api.get('/api/v1/clients') : null;
      
      const pick = (r: any) => {
        if (!r) return [];
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.results)) return r.results;
        return [];
      };

      setCities(pick(resp));
      if (clResp) setClients(pick(clResp));
      setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load cities'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (c:City) => { setEditing(c); setForm({name:c.name,state:c.state||'',country:c.country||'India',is_active:c.is_active, client_id: (c as any).client_id || ''}); setFErr(''); setShowModal(true); };

  const save = async () => {
    if(!form.name.trim()){setFErr('City name is required');return;}
    if(!form.state){setFErr('State is required');return;}
    setSaving(true); setFErr('');
    try {
      if(editing) await api.patch(`/api/v1/cities/${editing.id}`, form);
      else await api.post('/api/v1/cities', form);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (c:City) => {
    try { await api.patch(`/api/v1/cities/${c.id}`, {is_active:!c.is_active}); load(); }
    catch{}
  };

  const handleDelete = async () => {
    if(!deleteConfirm.item) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/cities/${deleteConfirm.item.id}`);
      setDeleteConfirm({show:false, item:null});
      load();
    } catch(e:any){
      alert(e.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = cities.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.state||'').toLowerCase().includes(search.toLowerCase()));
  const active = cities.filter(c=>c.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Cities',v:cities.length,c:C.blue,bg:C.blueD},{l:'Active',v:active,c:C.green,bg:C.greenD},{l:'Inactive',v:cities.length-active,c:C.gray,bg:`rgba(122,139,160,0.08)`}].map((s,i)=>(
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
          <input style={{...inp,paddingLeft:38}} placeholder="Search cities..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add City
        </button>
      </div>

      {/* Table */}
      <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:isPlatformAdmin?'1fr 1fr 1fr 1fr 100px 80px':'1fr 1fr 1fr 100px 80px',padding:'12px 20px',borderBottom:`1px solid ${C.border}`,gap:12}}>
          {isPlatformAdmin ? (
            ['City Name','State','Country',`Client (${clients.length})`,'Status','Actions'].map(h=>(
              <div key={h} style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
            ))
          ) : (
            ['City Name','State','Country','Status','Actions'].map(h=>(
              <div key={h} style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
            ))
          )}
        </div>
        {loading ? (
          <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
        ) : err ? (
          <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>
            {search ? 'No cities match your search.' : 'No cities yet. Add your first city.'}
          </div>
        ) : filtered.map((c,i)=>(
          <div key={c.id} style={{display:'grid',gridTemplateColumns:isPlatformAdmin?'1fr 1fr 1fr 1fr 100px 80px':'1fr 1fr 1fr 100px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',gap:12,alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.s3}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{fontWeight:600,fontSize:14}}>{c.name}</div>
            <div style={{fontSize:13,color:C.gray}}>{c.state||'—'}</div>
            <div style={{fontSize:13,color:C.gray}}>{c.country||'India'}</div>
            {isPlatformAdmin && (
              <div>
                {(c as any).client_id ? (
                  <span style={{display:'inline-flex',padding:'3px 9px',borderRadius:6,background:C.blueD,color:C.blue,fontSize:10,fontWeight:800}}>
                    {clients.find(cl => cl.id?.toLowerCase().trim() === (c as any).client_id?.toLowerCase().trim())?.name || (c as any).client_id.slice(0,8).toUpperCase()}
                  </span>
                ) : <span style={{fontSize:11,color:C.grayd}}>System</span>}
              </div>
            )}
            <div>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:c.is_active?C.greenD:`rgba(122,139,160,0.1)`,color:c.is_active?C.green:C.gray}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}}/>
                {c.is_active?'Active':'Inactive'}
              </span>
            </div>
            <div style={{display:'flex',gap:6}}>
              {isPlatformAdmin && (
                <>
                  <button onClick={()=>openEdit(c)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
                  </button>
                </>
              )}
              <button onClick={()=>toggle(c)} title={c.is_active?'Deactivate':'Activate'} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:c.is_active?C.red:C.green,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=c.is_active?C.red:C.green}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{c.is_active?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
              </button>
              {isPlatformAdmin && (
                <button onClick={()=>setDeleteConfirm({show:true, item:c})} title="Delete City" style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.color=C.red;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:440,position:'relative'}}>
            {/* Close Button (X) */}
            <button onClick={()=>setShowModal(false)} style={{position:'absolute',top:18,right:18,width:32,height:32,borderRadius:'50%',border:'none',background:C.s3,color:C.gray,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}
              onMouseEnter={e=>{e.currentTarget.style.color=C.white;e.currentTarget.style.background=C.border;}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.gray;e.currentTarget.style.background=C.s3;}}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit City':'Add City'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Create a new city record'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}
            <div style={{marginBottom:14}}><Label t="City Name" req/><input style={inp} placeholder="e.g. Mumbai" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
              <div>
                <Label t="State" req/>
                <select style={{...inp, appearance: 'none', cursor: 'pointer', color: form.state ? C.white : C.gray}} value={form.state} onChange={e=>setForm(p=>({...p,state:e.target.value}))}>
                  <option value="" disabled>Select State</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><Label t="Country"/><input style={inp} placeholder="India" value={form.country} onChange={e=>setForm(p=>({...p,country:e.target.value}))}/></div>
            </div>
            {isPlatformAdmin && (
              <div style={{marginBottom:14}}>
                <Label t="Client Organization" req/>
                <ClientSelect 
                  value={form.client_id || ''} 
                  onChange={(id) => setForm(p => ({ ...p, client_id: id }))} 
                />
              </div>
            )}
            {editing && (
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <div onClick={()=>setForm(p=>({...p,is_active:!p.is_active}))} style={{width:40,height:22,borderRadius:11,background:form.is_active?C.red:`${C.grayd}`,cursor:'pointer',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:3,left:form.is_active?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                </div>
                <span style={{fontSize:13,color:C.gray}}>Active</span>
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',border:`1px solid ${C.border}`,borderRadius:11,background:'transparent',color:C.gray,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:'11px',border:'none',borderRadius:11,background:C.red,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:"'DM Sans',sans-serif",opacity:saving?0.7:1}}>
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} City`}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      <ConfirmModal
        show={deleteConfirm.show}
        onClose={() => setDeleteConfirm({show:false, item:null})}
        onConfirm={handleDelete}
        title="Delete City"
        message="Are you sure you want to delete the city"
        itemName={deleteConfirm.item?.name}
        loading={deleting}
      />
    </div>
  );
}
