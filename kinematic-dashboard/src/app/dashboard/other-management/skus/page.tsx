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
};

interface SKU { id:string; sku_code:string; name:string; category?:string; unit?:string; price?:number; description?:string; is_active:boolean; created_at:string; }
const BLANK = { sku_code:'', name:'', category:'', unit:'pcs', price:'', description:'', is_active:true };
const UNITS = ['pcs','kg','g','ml','l','box','carton','pack','strip','dozen'];

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

export default function SKUManagement() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SKU|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/api/v1/skus');
      const d = Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data)?r.data:[];
      setSkus(d); setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load SKUs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (s:SKU) => {
    setEditing(s);
    setForm({ sku_code:s.sku_code, name:s.name, category:s.category||'', unit:s.unit||'pcs', price:s.price!=null?String(s.price):'', description:s.description||'', is_active:s.is_active });
    setFErr(''); setShowModal(true);
  };

  const save = async () => {
    if(!form.sku_code.trim()||!form.name.trim()){setFErr('SKU code and name are required');return;}
    setSaving(true); setFErr('');
    const payload:any = { sku_code:form.sku_code.trim(), name:form.name.trim(), category:form.category||null, unit:form.unit||'pcs', description:form.description||null, is_active:form.is_active };
    if(form.price) payload.price = parseFloat(form.price);
    try {
      if(editing) await api.patch(`/api/v1/skus/${editing.id}`, payload);
      else await api.post('/api/v1/skus', payload);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (s:SKU) => {
    try { await api.patch(`/api/v1/skus/${s.id}`, {is_active:!s.is_active}); load(); } catch{}
  };

  const categories = [...new Set(skus.map(s=>s.category).filter(Boolean))];
  const filtered = skus.filter(s =>
    (s.sku_code.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()) || (s.category||'').toLowerCase().includes(search.toLowerCase())) &&
    (!filterCat || s.category === filterCat)
  );
  const active = skus.filter(s=>s.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:"Total SKU's",v:skus.length,c:C.purple},{l:'Active',v:active,c:C.green},{l:'Categories',v:categories.length,c:C.blue},{l:'Inactive',v:skus.length-active,c:C.gray}].map((s,i)=>(
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
          <input style={{...inp,paddingLeft:38}} placeholder="Search SKU code or name..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {categories.length>0 && (
          <select style={{...inp,width:'auto',minWidth:140}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c=><option key={c} value={c!}>{c}</option>)}
          </select>
        )}
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add SKU
        </button>
      </div>

      {/* Table */}
      <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'110px 1fr 1fr 80px 90px 90px 80px',padding:'12px 20px',borderBottom:`1px solid ${C.border}`,gap:12}}>
          {['SKU Code','Product Name','Category','Unit','Price','Status','Actions'].map(h=>(
            <div key={h} style={{fontSize:11,fontWeight:700,color:C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
        : err ? <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
        : filtered.length===0 ? <div style={{padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>{search||filterCat?"No SKUs match.":"No SKUs yet. Add your first product."}</div>
        : filtered.map((s,i)=>(
          <div key={s.id} style={{display:'grid',gridTemplateColumns:'110px 1fr 1fr 80px 90px 90px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',gap:12,alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.s3}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{fontFamily:'monospace',fontSize:13,color:C.purple,fontWeight:700}}>{s.sku_code}</div>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{s.name}</div>
              {s.description && <div style={{fontSize:11,color:C.gray,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{s.description}</div>}
            </div>
            <div>
              {s.category ? (
                <span style={{display:'inline-flex',padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:C.blueD,color:C.blue}}>{s.category}</span>
              ) : <span style={{fontSize:12,color:C.grayd}}>—</span>}
            </div>
            <div style={{fontSize:13,color:C.gray}}>{s.unit||'pcs'}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,color:C.yellow}}>{s.price!=null?`₹${Number(s.price).toFixed(2)}`:'—'}</div>
            <div>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.is_active?C.greenD:`rgba(122,139,160,0.1)`,color:s.is_active?C.green:C.gray}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}}/>
                {s.is_active?'Active':'Inactive'}
              </span>
            </div>
            <div style={{display:'flex',gap:6}}>
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

      {/* Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit SKU':'Add SKU'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Add a new product SKU to the catalogue'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div><Label t="SKU Code" req/><input style={inp} placeholder="e.g. SKU-001" value={form.sku_code} onChange={e=>setForm(p=>({...p,sku_code:e.target.value.toUpperCase()}))}/></div>
              <div><Label t="Unit"/><select style={inp} value={form.unit} onChange={e=>setForm(p=>({...p,unit:e.target.value}))}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
              <div style={{gridColumn:'1/-1'}}><Label t="Product Name" req/><input style={inp} placeholder="e.g. Classic Mints 10g Pack" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
              <div><Label t="Category"/><input style={inp} placeholder="e.g. Confectionery" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}/></div>
              <div><Label t="MRP Price (₹)"/><input style={inp} type="number" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></div>
              <div style={{gridColumn:'1/-1'}}><Label t="Description"/><textarea style={{...inp,resize:'none'}} rows={3} placeholder="Product details, variant info..." value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></div>
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
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} SKU`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
