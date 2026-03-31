'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

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
  orange: '#FF7A30'
};

interface Asset { id:string; name:string; asset_code?:string; category?:string; description?:string; quantity:number; unit?:string; is_active:boolean; }
const BLANK = { name:'', asset_code:'', category:'', description:'', quantity:'0', unit:'pcs', is_active:true };
const CATEGORIES = ['Display Stand','Promotional Material','Branding Kit','Sampling Kit','Demo Unit','Uniform','Equipment','Vehicle','Other'];
const UNITS = ['pcs','set','kg','units','carton','box','pair'];

const Spinner = () => <div style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'kspin .65s linear infinite',flexShrink:0}}/>;
const Label = ({t,req}:{t:string;req?:boolean}) => <div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:'0.7px',textTransform:'uppercase',marginBottom:7}}>{t}{req&&<span style={{color:C.red}}> *</span>}</div>;
const inp:React.CSSProperties = {width:'100%',background:C.s3,border:`1.5px solid ${C.border}`,color:C.white,borderRadius:11,padding:'10px 13px',fontSize:13,outline:'none',fontFamily:"'DM Sans',sans-serif",transition:'border-color .15s'};

const Overlay = ({onClose,children}:{onClose:()=>void;children:React.ReactNode}) => (
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(6px)'}}>
    {children}
  </div>
);

const CatColor = (cat?:string) => {
  const m:{[k:string]:string} = {'Display Stand':C.blue,'Promotional Material':C.purple,'Branding Kit':C.yellow,'Sampling Kit':C.teal,'Demo Unit':C.green,'Uniform':C.orange,'Equipment':C.red,'Vehicle':C.gray};
  return (m as any)[cat||'']||C.gray;
};

export default function AssetManagement() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asset|null>(null);
  const [form, setForm] = useState({...BLANK});
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/api/v1/assets');
      const d = Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data)?r.data:[];
      setAssets(d); setErr('');
    } catch(e:any){ setErr(e.message||'Failed to load assets'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openAdd = () => { setEditing(null); setForm({...BLANK}); setFErr(''); setShowModal(true); };
  const openEdit = (a:Asset) => {
    setEditing(a);
    setForm({ name:a.name, asset_code:a.asset_code||'', category:a.category||'', description:a.description||'', quantity:String(a.quantity), unit:a.unit||'pcs', is_active:a.is_active });
    setFErr(''); setShowModal(true);
  };

  const save = async () => {
    if(!form.name.trim()){setFErr('Asset name is required');return;}
    setSaving(true); setFErr('');
    const payload:any = { name:form.name.trim(), asset_code:form.asset_code||null, category:form.category||null, description:form.description||null, quantity:parseInt(form.quantity)||0, unit:form.unit||'pcs', is_active:form.is_active };
    try {
      if(editing) await api.patch(`/api/v1/assets/${editing.id}`, payload);
      else await api.post('/api/v1/assets', payload);
      setShowModal(false); load();
    } catch(e:any){ setFErr(e.response?.data?.error||e.message||'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = async (a:Asset) => {
    try { await api.patch(`/api/v1/assets/${a.id}`, {is_active:!a.is_active}); load(); } catch{}
  };

  const cats = [...new Set(assets.map(a=>a.category).filter(Boolean))];
  const filtered = assets.filter(a =>
    (a.name.toLowerCase().includes(search.toLowerCase()) || (a.asset_code||'').toLowerCase().includes(search.toLowerCase()) || (a.category||'').toLowerCase().includes(search.toLowerCase())) &&
    (!filterCat || a.category === filterCat)
  );
  const totalQty = assets.reduce((s,a)=>s+a.quantity,0);
  const active = assets.filter(a=>a.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}} @keyframes orange{}`}</style>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Asset Types',v:assets.length,c:C.teal},{l:'Active',v:active,c:C.green},{l:'Total Quantity',v:totalQty,c:C.yellow},{l:'Categories',v:cats.length,c:C.purple}].map((s,i)=>(
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
          <input style={{...inp,paddingLeft:38}} placeholder="Search assets or codes..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {cats.length>0 && (
          <select style={{...inp,width:'auto',minWidth:160}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {cats.map(c=><option key={c} value={c!}>{c}</option>)}
          </select>
        )}
        <button onClick={openAdd} style={{background:C.red,color:'#fff',border:'none',borderRadius:11,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Asset
        </button>
      </div>

      {/* Table */}
      <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'100px 1fr 1fr 100px 80px 90px 80px',padding:'12px 20px',borderBottom:`1px solid ${C.border}`,gap:12}}>
          {['Code','Asset Name','Category','Qty / Unit','—','Status','Actions'].map((h,i)=>(
            <div key={i} style={{fontSize:11,fontWeight:700,color:i===4?'transparent':C.grayd,letterSpacing:'0.8px',textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div>
        : err ? <div style={{padding:40,textAlign:'center',color:C.red,fontSize:13}}>{err}</div>
        : filtered.length===0 ? <div style={{padding:48,textAlign:'center',color:C.grayd,fontSize:13}}>{search||filterCat?'No assets match.':'No assets yet. Add your first asset.'}</div>
        : filtered.map((a,i)=>(
          <div key={a.id} style={{display:'grid',gridTemplateColumns:'100px 1fr 1fr 100px 80px 90px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',gap:12,alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.s3}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{fontFamily:'monospace',fontSize:12,color:C.teal}}>{a.asset_code||'—'}</div>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{a.name}</div>
              {a.description && <div style={{fontSize:11,color:C.gray,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{a.description}</div>}
            </div>
            <div>
              {a.category ? (
                <span style={{display:'inline-flex',padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:`${CatColor(a.category)}18`,color:CatColor(a.category)}}>{a.category}</span>
              ) : <span style={{fontSize:12,color:C.grayd}}>—</span>}
            </div>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:a.quantity>0?C.yellow:C.red}}>{a.quantity}</div>
              <div style={{fontSize:10,color:C.gray}}>{a.unit||'pcs'}</div>
            </div>
            {/* Qty mini bar */}
            <div style={{height:4,background:C.s4,borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${Math.min((a.quantity/Math.max(...filtered.map(x=>x.quantity),1))*100,100)}%`,background:C.yellow,borderRadius:2,transition:'width .5s'}}/>
            </div>
            <div>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:a.is_active?C.greenD:`rgba(122,139,160,0.1)`,color:a.is_active?C.green:C.gray}}>
                <div style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}}/>
                {a.is_active?'Active':'Inactive'}
              </span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>openEdit(a)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:C.gray,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.gray;}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onClick={()=>toggle(a)} style={{width:30,height:30,border:`1px solid ${C.border}`,borderRadius:8,background:'transparent',cursor:'pointer',color:a.is_active?C.red:C.green,display:'flex',alignItems:'center',justifyContent:'center'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=a.is_active?C.red:C.green}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{a.is_active?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <Overlay onClose={()=>setShowModal(false)}>
          <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}>{editing?'Edit Asset':'Add Asset'}</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:24}}>{editing?`Editing ${editing.name}`:'Register a new field asset or resource'}</div>
            {fErr && <div style={{background:C.redD,border:`1px solid ${C.redB}`,borderRadius:10,padding:'10px 14px',color:C.red,fontSize:13,marginBottom:16}}>{fErr}</div>}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div style={{gridColumn:'1/-1'}}><Label t="Asset Name" req/><input style={inp} placeholder="e.g. Display Stand Type A" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
              <div><Label t="Asset Code"/><input style={inp} placeholder="e.g. AST-001" value={form.asset_code} onChange={e=>setForm(p=>({...p,asset_code:e.target.value.toUpperCase()}))}/></div>
              <div><Label t="Category"/><select style={inp} value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}><option value="">Select...</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div><Label t="Quantity"/><input style={inp} type="number" min="0" placeholder="0" value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))}/></div>
              <div><Label t="Unit"/><select style={inp} value={form.unit} onChange={e=>setForm(p=>({...p,unit:e.target.value}))}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
              <div style={{gridColumn:'1/-1'}}><Label t="Description"/><textarea style={{...inp,resize:'none'}} rows={3} placeholder="Asset details, condition, notes..." value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></div>
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
                {saving?<><Spinner/>Saving...</>:`${editing?'Update':'Create'} Asset`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
