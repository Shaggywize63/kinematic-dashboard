'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmModal from '../../../components/ConfirmModal';
import { useAuth } from '../../../hooks/useAuth';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const C = {
  bg: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)', 
  s5: 'var(--border)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  red: '#E01E2C', 
  redD: 'var(--redD)', 
  redB: 'rgba(224,30,44,0.18)',
  green: '#00D97E', 
  greenD: 'var(--greenD)',
  blue: '#3E9EFF', 
  blueD: 'var(--blueD)',
  yellow: '#FFB800', 
  yellowD: 'var(--yellowD)',
  purple: '#9B6EFF', 
  purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1', 
  orange: '#FF7A30',
};

const API   = process.env.NEXT_PUBLIC_API_URL ?? '';
const tok   = () => (typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') ?? '' : '');
const hdrs  = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${tok()}` });
async function apiFetch<T>(path:string, opts:RequestInit={}):Promise<T> {
  const r = await fetch(`${API}${path}`, { ...opts, headers:{ ...hdrs(), ...(opts.headers||{}) } });
  const text = await r.text();
  let j: any = {};
  if (text) {
    try { j = JSON.parse(text); } catch { j = { message: text }; }
  }
  if (!r.ok) throw new Error(j.message || j.error || `${r.status} ${r.statusText}`);
  return (j?.data ?? j) as T;
}

/* ─── Question type config ───────────────────────────────────────────────── */
const FIELD_GROUPS = [
  { label:'Basic',    items:[
    { type:'short_text',  icon:'✏️',  label:'Short Text'   },
    { type:'long_text',   icon:'📝',  label:'Long Text'    },
    { type:'number',      icon:'🔢',  label:'Number'       },
    { type:'email',       icon:'📧',  label:'Email'        },
    { type:'phone',       icon:'📱',  label:'Phone'        },
  ]},
  { label:'Choice',   items:[
    { type:'radio',       icon:'⚪',  label:'Single Select'},
    { type:'checkbox',    icon:'☑️',  label:'Multi Select' },
    { type:'dropdown',    icon:'🔽',  label:'Dropdown'     },
    { type:'yes_no',      icon:'👍',  label:'Yes / No'     },
    { type:'rating',      icon:'⭐',  label:'Rating'       },
  ]},
  { label:'Date / Time', items:[
    { type:'date',        icon:'📅',  label:'Date'         },
    { type:'time',        icon:'🕐',  label:'Time'         },
    { type:'datetime',    icon:'🗓️',  label:'Date & Time'  },
  ]},
  { label:'Media',    items:[
    { type:'image',       icon:'📷',  label:'Image Upload' },
    { type:'file',        icon:'📎',  label:'File Upload'  },
    { type:'signature',   icon:'✍️',  label:'Signature'    },
    { type:'location',    icon:'📍',  label:'Location'     },
  ]},
  { label:'Advanced', items:[
    { type:'section_header', icon:'📌', label:'Section'    },
    { type:'consent',     icon:'🔏',  label:'Consent'      },
  ]},
];

const ALL_TYPES = FIELD_GROUPS.flatMap(g => g.items);
const typeInfo  = (t:string) => ALL_TYPES.find(f => f.type===t) ?? { type:t, icon:'❓', label:t };

const STATUS_COLOR:Record<string,string> = {
  draft:'#7A8BA0', published:C.green, archived:C.grayd
};

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface BForm { id:string; title:string; description?:string; status:string; version:number; icon:string; cover_color:string; created_at:string; _pages?:BPage[]; _questions?:BQuestion[]; }
interface BPage { id:string; form_id:string; title:string; description?:string; page_order:number; }
interface BQuestion { id:string; form_id:string; page_id?:string; qtype:string; label:string; placeholder?:string; helper_text?:string; is_required:boolean; q_order:number; options:any[]; validation:any; logic:any[]; prefill_key?:string; media_config:any; keyboard_type?:string; image_count?:number; camera_only?:boolean; depends_on_id?:string; depends_on_value?:string; is_consent?:boolean; }
interface BSubmission { id:string; form_id:string; submitted_by?:string; status:string; submitted_at:string; answers:any; }

/* ─── Atoms ──────────────────────────────────────────────────────────────── */
const Spin = ({ size=16 }:{size?:number}) => (
  <div style={{ width:size, height:size, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', animation:'fbspin .6s linear infinite', flexShrink:0 }}/>
);
const Tog = ({ val, onChange }:{val:boolean;onChange:(v:boolean)=>void}) => (
  <div onClick={() => onChange(!val)} style={{ width:40, height:22, borderRadius:11, background:val?C.red:C.grayd, cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
    <div style={{ position:'absolute', top:2, left:val?20:2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.4)' }}/>
  </div>
);
const Tag = ({ label, color }:{label:string;color:string}) => (
  <span style={{ display:'inline-flex', padding:'2px 8px', borderRadius:20, background:`${color}18`, color, fontSize:11, fontWeight:700, textTransform:'capitalize' }}>{label}</span>
);
const inpStyle:React.CSSProperties = {
  background:C.s3, border:`1.5px solid ${C.border}`, color:C.white,
  borderRadius:10, padding:'8px 12px', fontSize:13, fontFamily:"'DM Sans',sans-serif",
  outline:'none', width:'100%', colorScheme:'dark' as any,
};

/* ══════════════════════════════════════════════════════════════════════════
   FORM LIST VIEW
══════════════════════════════════════════════════════════════════════════ */
function FormList({ onOpen, onCreate }:{ onOpen:(f:BForm)=>void; onCreate:()=>void }) {
  const { user } = useAuth();
  const [forms,   setForms]   = useState<BForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [statusF, setStatusF] = useState('all');
  const [showAIGen, setShowAIGen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/v1/builder/forms');
      const list = Array.isArray(data) ? data : (data?.forms ?? data?.data ?? []);
      setForms(list);
    } catch { setForms([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Original del function logic removed in favor of `showDeleteModal` and `confirmDelete`


  const duplicate = async (f:BForm, e:React.MouseEvent) => {
    e.stopPropagation();
    await apiFetch('/api/v1/builder/forms', { method:'POST', body: JSON.stringify({ title:`${f.title} (Copy)`, description:f.description, icon:f.icon, cover_color:f.cover_color }) }).catch(()=>{});
    load();
  };

  const shown = forms.filter(f =>
    (statusF==='all' || f.status===statusF) &&
    (!search || f.title.toLowerCase().includes(search.toLowerCase()))
  );

  const stats = { total:forms.length, published:forms.filter(f=>f.status==='published').length, draft:forms.filter(f=>f.status==='draft').length };

  const [deleteForm, setDeleteForm] = useState<BForm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteForm) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/builder/forms/${deleteForm.id}`, { method:'DELETE' });
      setDeleteForm(null);
      load();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const showDeleteModal = (f:BForm, e:React.MouseEvent) => {
    e.stopPropagation();
    setDeleteForm(f);
  };

  return (
    <div style={{ padding:'28px 32px', overflowY:'auto', flex:1 }}>
      {showAIGen && <AIGenerateModal onGenerated={onOpen} onClose={() => setShowAIGen(false)} />}
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:C.white, margin:0, letterSpacing:'-0.3px' }}>Form Builder</h1>
          <p style={{ fontSize:13, color:C.gray, margin:'4px 0 0', }}>Create and manage digital forms for field operations</p>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={() => setShowAIGen(true)} style={{ padding:'10px 20px', background:`linear-gradient(135deg, ${C.blue}, ${C.purple})`, border:'none', borderRadius:10, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:8, boxShadow:`0 4px 18px ${C.blue}25` }}>
            ✨ AI Magic
          </button>
          <button onClick={onCreate} style={{ padding:'10px 20px', background:C.red, border:'none', borderRadius:10, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:8, boxShadow:`0 4px 18px ${C.redB}` }}>
            + New Form
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', gap:12, marginBottom:24 }}>
        {[{ l:'Total Forms', v:stats.total, c:C.white }, { l:'Published', v:stats.published, c:C.green }, { l:'Drafts', v:stats.draft, c:C.yellow }].map((s,i) => (
          <div key={i} style={{ flex:1, background:C.s2, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 18px' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:s.c }}>{loading?'—':s.v}</div>
            <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
          <input placeholder="Search forms…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inpStyle, paddingLeft:30 }}/>
        </div>
        {['all','draft','published','archived'].map(s => (
          <button key={s} onClick={() => setStatusF(s)}
            style={{ padding:'8px 16px', borderRadius:8, border:`1.5px solid ${statusF===s?C.red:C.border}`, background:statusF===s?C.redD:C.s3, color:statusF===s?C.red:C.gray, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spin size={24}/></div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 20px', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontSize:60, marginBottom:20, animation:'km-pulse 2s infinite' }}>✨</div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, marginBottom:8 }}>Start with AI or Build Manually</h2>
          <p style={{ fontSize:14, color:C.gray, marginBottom:32, maxWidth:420, lineHeight:1.6 }}>Describe your field audit or survey challenge and let Claude design a professional multi-page form for you in seconds.</p>
          
          <div style={{ display:'flex', gap:20, flexWrap:'wrap', justifyContent:'center' }}>
            <div onClick={() => setShowAIGen(true)} className="kbtn" style={{ width:240, background:C.s2, border:`1px solid ${C.blue}40`, padding:'30px 20px', borderRadius:20, cursor:'pointer', boxShadow:`0 10px 40px ${C.blue}15`, transition:'all .2s' }}>
              <div style={{ fontSize:32, marginBottom:16 }}>🪄</div>
              <div style={{ fontWeight:800, color:C.white, marginBottom:6 }}>AI Magic Synthesis</div>
              <div style={{ fontSize:11, color:C.grayd }}>Describe a problem to get a full form structure.</div>
            </div>

            <div onClick={onCreate} className="kbtn" style={{ width:240, background:C.s2, border:`1px solid ${C.border}`, padding:'30px 20px', borderRadius:20, cursor:'pointer', transition:'all .2s' }}>
              <div style={{ fontSize:32, marginBottom:16 }}>➕</div>
              <div style={{ fontWeight:800, color:C.white, marginBottom:6 }}>Manual Creation</div>
              <div style={{ fontSize:11, color:C.grayd }}>Build your form field by field from scratch.</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
          {shown.map(f => (
            <div key={f.id} onClick={() => onOpen(f)}
              style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden', cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.borderL; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}>
              {/* Color band */}
              <div style={{ height:6, background:f.cover_color||C.red }}/>
              <div style={{ padding:'16px 18px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div style={{ fontSize:28 }}>{f.icon||'📋'}</div>
                  <Tag label={f.status} color={STATUS_COLOR[f.status]||C.gray}/>
                </div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:C.white, marginBottom:4, lineHeight:1.3 }}>{f.title}</div>
                {f.description && <div style={{ fontSize:12, color:C.gray, marginBottom:10, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{f.description}</div>}
                <div style={{ fontSize:11, color:C.grayd, marginBottom:14 }}>v{f.version} · {new Date(f.created_at).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' })}</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={e => { e.stopPropagation(); onOpen(f); }} style={{ flex:1, padding:'8px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    ✏️ Edit
                  </button>
                  <button onClick={e => duplicate(f, e)} style={{ padding:'8px 10px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:8, color:C.gray, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }} title="Duplicate">⧉</button>
                  {user?.role !== 'client' && (
                    <button onClick={e => showDeleteModal(f, e)} style={{ padding:'8px 10px', background:C.s3, border:`1px solid ${C.redB}`, borderRadius:8, color:C.red, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }} title="Delete">🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        show={!!deleteForm}
        onClose={() => setDeleteForm(null)}
        onConfirm={confirmDelete}
        title="Delete Form"
        message="Are you sure you want to delete the form? This will permanently remove all associated pages, questions, and submissions."
        itemName={deleteForm?.title}
        loading={deleting}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   AI GENERATE MODAL
   Premium, futuristic design for AI-driven synthesis
══════════════════════════════════════════════════════════════════════════ */
function AIGenerateModal({ onGenerated, onClose }:{ onGenerated:(f:BForm)=>void; onClose:()=>void }) {
  const [problem, setProblem] = useState('');
  const [status,  setStatus]  = useState<'idle'|'thinking'|'creating'|'finishing'>('idle');
  const [stage,   setStage]   = useState('');
  const [err,     setErr]     = useState('');

  const STAGES = [
    'Analyzing problem statement...',
    'Identifying domain requirements...',
    'Structuring multi-page canvas...',
    'Synthesizing professional query types...',
    'Optimizing field validations...',
    'Applying Kinematic design tokens...',
    'Finalizing AI synthesis...'
  ];

  useEffect(() => {
    if (status === 'thinking') {
      let i = 0;
      const t = setInterval(() => {
        setStage(STAGES[i % STAGES.length]);
        i++;
      }, 1500);
      return () => clearInterval(t);
    }
  }, [status]);

  const generate = async () => {
    if (!problem.trim() || problem.length < 10) {
      setErr('Please describe your challenge in at least 10 characters.');
      return;
    }
    setErr('');
    setStatus('thinking');
    setStage(STAGES[0]);

    try {
      // 1. Get AI Structure
      const res = await apiFetch<any>('/api/v1/ai/generate-form', { 
        method:'POST', 
        body: JSON.stringify({ problemStatement: problem }) 
      });
      
      setStatus('creating');
      const { form: aiForm, questions: aiQs } = res;

      // 2. Create Form
      const form = await apiFetch<BForm>('/api/v1/builder/forms', {
        method:'POST',
        body: JSON.stringify({ 
          title: aiForm.title ||'AI Generated Form', 
          description: aiForm.description,
          icon: aiForm.icon || '✨',
          cover_color: aiForm.cover_color || C.blue
        })
      });

      // 3. Create Default Page
      const page = await apiFetch<BPage>(`/api/v1/builder/forms/${form.id}/pages`, {
        method:'POST',
        body: JSON.stringify({ title: 'Standard Audit', page_order: 0 })
      });

      // 4. Create Questions sequentially
      for (const [idx, q] of aiQs.entries()) {
        await apiFetch(`/api/v1/builder/forms/${form.id}/questions`, {
          method:'POST',
          body: JSON.stringify({
            ...q,
            page_id: page.id,
            q_order: idx,
            options: q.options || [],
            validation: {},
            logic: [],
            media_config: {}
          })
        });
      }

      setStatus('finishing');
      setTimeout(() => onGenerated(form), 800);

    } catch (e: any) {
      console.error('AI Gen Failed:', e);
      setErr(e.message || 'AI Synthesis failed. Please try a different prompt.');
      setStatus('idle');
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(10px)' }}>
      <div style={{ background:C.s2, border:`1px solid ${C.blue}40`, borderRadius:28, padding:'40px', width:520, boxShadow:`0 0 100px ${C.blue}20`, position:'relative', overflow:'hidden' }}>
        
        {/* Shimmer effect when thinking */}
        {status !== 'idle' && (
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg, transparent, ${C.blue}, transparent)`, animation:'aiscan 2s linear infinite' }} />
        )}

        <button onClick={onClose} style={{ position:'absolute', top:24, right:24, background:'none', border:'none', color:C.gray, cursor:'pointer', fontSize:20 }}>✕</button>

        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:42, marginBottom:16, animation: status==='thinking' ? 'pulse 2s infinite' : 'none' }}>✨</div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, margin:0 }}>AI Form Synthesis</h2>
          <p style={{ fontSize:14, color:C.gray, marginTop:8 }}>Describe your field challenge and let Claude design the solution.</p>
        </div>

        {status === 'idle' ? (
          <>
            <div style={{ marginBottom:28 }}>
              <label style={{ fontSize:11, fontWeight:700, color:C.blue, letterSpacing:'1px', textTransform:'uppercase', display:'block', marginBottom:10 }}>Problem Statement</label>
              <textarea 
                style={{ ...inpStyle, minHeight:120, fontSize:15, lineHeight:1.6, padding:16, border:`1.5px solid ${C.blue}30`, background:`${C.blue}05` }}
                placeholder="e.g. I need to audit luxury furniture showrooms for display quality, inventory accuracy, and staff grooming standards across 10 cities."
                value={problem}
                onChange={e => setProblem(e.target.value)}
              />
            </div>

            {err && <div style={{ background:`${C.red}15`, color:C.red, padding:'10px 14px', borderRadius:10, fontSize:13, marginBottom:20, border:`1px solid ${C.red}30` }}>{err}</div>}

            <button onClick={generate} 
              style={{ width:'100%', padding:'16px', background:`linear-gradient(135deg, ${C.blue}, ${C.purple})`, border:'none', borderRadius:14, color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:`0 8px 24px ${C.blue}40` }}>
              Generate Smart Form
            </button>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}><Spin size={40} /></div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, color:C.white, marginBottom:8 }}>{stage}</div>
            <div style={{ fontSize:13, color:C.grayd }}>Please wait while Claude synthesizes your requirements...</div>
          </div>
        )}

        <style>{`
          @keyframes aiscan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
          @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes km-pulse { 0% { transform: scale(1); filter: drop-shadow(0 0 5px ${C.blue}40); } 50% { transform: scale(1.1); filter: drop-shadow(0 0 20px ${C.blue}80); } 100% { transform: scale(1); filter: drop-shadow(0 0 5px ${C.blue}40); } }
          @keyframes fbspin { to { transform: rotate(360deg); } }
          .kbtn:hover { border-color: ${C.blue} !important; transform: translateY(-4px); background: ${C.s3} !important; }
        `}</style>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CREATE FORM MODAL
══════════════════════════════════════════════════════════════════════════ */
function CreateFormModal({ onCreated, onClose }:{ onCreated:(f:BForm)=>void; onClose:()=>void }) {
  const [form, setForm] = useState({ title:'', description:'', icon:'📋', cover_color:C.red, activity_id:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  
  // AI Magic State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    apiFetch<any>('/api/v1/activities').then(d => {
      setActivities(Array.isArray(d) ? d : (d?.data || []));
    }).catch(()=>{});
  }, []);

  const ICONS = ['📋','📊','🏪','👤','📦','🔍','✅','⚠️','📸','🗂️','📝','🔧'];
  const COLORS = [C.red,'#3E9EFF','#00D97E','#FFB800','#9B6EFF','#00C9B1','#FF7A30','#FF6B9D'];

  const magicFill = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true); setErr('');
    try {
      const res = await apiFetch<any>('/api/v1/ai/recommend-form-details', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt, activities })
      });
      const d = res;
      setForm(p => ({
        ...p,
        title: d.title || p.title,
        description: d.description || p.description,
        activity_id: d.activity_id || p.activity_id,
        icon: d.icon || p.icon,
        cover_color: d.cover_color || p.cover_color
      }));
      setAiPrompt('');
    } catch (e: any) {
      setErr('Magic Fill failed: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const create = async () => {
    if (!form.title.trim()) { setErr('Form title is required'); return; }
    setSaving(true); setErr('');
    const payload = { ...form };
    if (!payload.activity_id) delete (payload as any).activity_id;
    try {
      const f = await apiFetch<BForm>('/api/v1/builder/forms', { method:'POST', body: JSON.stringify(payload) });
      onCreated(f);
    } catch (e: any) { 
      console.error('Form creation failed:', e);
      setErr(`⚠ Failed to create form: ${e.message || 'Unknown server error'}`); 
    }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(20px)' }}>
      <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:28, padding:32, width:460, boxShadow:'0 32px 100px rgba(0,0,0,.9)', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:24, right:24, width:32, height:32, borderRadius:12, background:C.s3, border:`1px solid ${C.border}`, cursor:'pointer', color:C.gray, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, marginBottom:6 }}>Create Form</div>
        <p style={{ fontSize:13, color:C.gray, marginBottom:28 }}>Setup your form manually or use AI to auto-fill details.</p>

        {/* AI Magic Section */}
        <div style={{ marginBottom:30, padding:'16px', background:`linear-gradient(135deg, ${C.blue}08, ${C.purple}08)`, border:`1px solid ${C.blue}25`, borderRadius:18, position:'relative' }}>
          <label style={{ fontSize:10, fontWeight:800, color:C.blue, textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:10 }}>✨ AI Magic Detailer</label>
          <div style={{ display:'flex', gap:10 }}>
            <input 
              style={{ ...inpStyle, fontSize:12, background:C.s4 }} 
              placeholder="e.g. Audit for luxury outlets..." 
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && magicFill()}
            />
            <button 
              onClick={magicFill} 
              disabled={aiBusy || !aiPrompt.trim()}
              style={{ background:C.blue, color:'#fff', border:'none', borderRadius:10, padding:'0 14px', fontSize:11, fontWeight:800, cursor:'pointer', opacity:aiBusy?0.6:1, display:'flex', alignItems:'center', gap:6 }}>
              {aiBusy ? <Spin size={12}/> : 'Magic Fill'}
            </button>
          </div>
          <div style={{ fontSize:10, color:C.grayd, marginTop:8, fontStyle:'italic', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Describe your form to auto-fill details.</span>
            <span 
              onClick={() => window.dispatchEvent(new CustomEvent('km-open-ai'))} 
              style={{ color:C.blue, cursor:'pointer', fontWeight:700, borderLeft:`1px solid ${C.border}`, paddingLeft:10 }}>
              Need help? Consult Kinematic AI →
            </span>
          </div>
        </div>

        <div style={{ height:'1px', background:C.border, marginBottom:28 }} />

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:8, fontWeight:600 }}>Form Title <span style={{ color:C.red }}>*</span></label>
          <input style={inpStyle} placeholder="e.g. Outlet Audit Form" value={form.title} onChange={e => setForm(p => ({...p, title:e.target.value}))} autoFocus/>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:8, fontWeight:600 }}>Linked Activity</label>
          <select style={{...inpStyle, appearance:'none' as any}} value={form.activity_id} onChange={e => setForm(p => ({...p, activity_id:e.target.value}))}>
            <option value="">None (Standalone Form)</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:8, fontWeight:600 }}>Description</label>
          <textarea style={{ ...inpStyle, resize:'none' as any }} rows={2} placeholder="Briefly describe what this form collects…" value={form.description} onChange={e => setForm(p => ({...p, description:e.target.value}))}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:28 }}>
          <div>
            <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:10, fontWeight:600 }}>Icon</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ICONS.slice(0, 6).map(ic => (
                <div key={ic} onClick={() => setForm(p => ({...p, icon:ic}))}
                  style={{ width:34, height:34, borderRadius:10, background:form.icon===ic?`${form.cover_color}25`:C.s3, border:`1.5px solid ${form.icon===ic?form.cover_color:C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, cursor:'pointer', transition:'all .13s' }}>
                  {ic}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:10, fontWeight:600 }}>Color</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {COLORS.slice(0, 6).map(c => (
                <div key={c} onClick={() => setForm(p => ({...p, cover_color:c}))}
                  style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border:`2.5px solid ${form.cover_color===c?'#fff':'transparent'}`, transition:'all .13s' }}/>
              ))}
            </div>
          </div>
        </div>

        {err && <div style={{ fontSize:12, color:C.red, marginBottom:16, background:`${C.red}10`, padding:'8px 12px', borderRadius:10, border:`1px solid ${C.red}20` }}>⚠ {err}</div>}
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:12, color:C.gray, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={create} disabled={saving} style={{ flex:1, padding:'12px', background:C.red, border:'none', borderRadius:12, color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:`0 8px 24px ${C.redB}` }}>
            {saving?<><Spin/>Creating…</>:'Create Form'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   QUESTION PROPERTIES PANEL
══════════════════════════════════════════════════════════════════════════ */
function PropertiesPanel({ q, allQs, onChange, onDelete }:{ q:BQuestion; allQs:BQuestion[]; onChange:(q:BQuestion)=>void; onDelete:()=>void }) {
  const { user } = useAuth();
  const hasOptions = ['radio','checkbox','dropdown'].includes(q.qtype);
  const [newOpt, setNewOpt] = useState('');

  const addOption = () => {
    if (!newOpt.trim()) return;
    onChange({ ...q, options:[...q.options, { label:newOpt.trim(), value:newOpt.trim().toLowerCase().replace(/\s+/g,'_') }] });
    setNewOpt('');
  };

  const removeOption = (i:number) => onChange({ ...q, options:q.options.filter((_:any,idx:number) => idx!==i) });

  return (
    <div style={{ width:280, flexShrink:0, background:C.s2, borderLeft:`1px solid ${C.border}`, overflowY:'auto', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.white, display:'flex', alignItems:'center', gap:7 }}>
          <span>{typeInfo(q.qtype).icon}</span> {typeInfo(q.qtype).label}
        </div>
        {user?.role !== 'client' && (
          <button onClick={onDelete} style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:13, padding:'2px 6px', borderRadius:6 }}>🗑</button>
        )}
      </div>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14, flex:1 }}>
        {/* Label */}
        <div>
          <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Question Label</label>
          <input style={inpStyle} value={q.label} onChange={e => onChange({ ...q, label:e.target.value })}/>
        </div>

        {/* Placeholder */}
        {!['radio','checkbox','rating','yes_no','section_header','consent','image','file','signature','location'].includes(q.qtype) && (
          <div>
            <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Placeholder</label>
            <input style={inpStyle} value={q.placeholder||''} onChange={e => onChange({ ...q, placeholder:e.target.value })} placeholder="Enter placeholder…"/>
          </div>
        )}

        {/* Helper text */}
        <div>
          <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Helper Text</label>
          <input style={inpStyle} value={q.helper_text||''} onChange={e => onChange({ ...q, helper_text:e.target.value })} placeholder="Optional hint…"/>
        </div>

        {/* Keyboard Type (for text inputs) */}
        {['short_text','phone','number'].includes(q.qtype) && (
          <div>
            <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Keyboard Layout</label>
            <select style={{ ...inpStyle, appearance:'none' as any }} value={q.keyboard_type||''} onChange={e => onChange({ ...q, keyboard_type:e.target.value })}>
              <option value="">Default</option>
              <option value="text">Text</option>
              <option value="number">Number Pad</option>
              <option value="phone">Phone Pad</option>
            </select>
          </div>
        )}

        {/* Required toggle */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:C.s3, borderRadius:10, border:`1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.white }}>Required</div>
            <div style={{ fontSize:11, color:C.grayd }}>Must be filled</div>
          </div>
          <Tog val={q.is_required} onChange={v => onChange({ ...q, is_required:v })}/>
        </div>

        {/* Options (for choice types) */}
        {hasOptions && (
          <div>
            <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:8 }}>Options</label>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
              {q.options.map((opt:any, i:number) => (
                <div key={i} style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input style={{ ...inpStyle, flex:1, fontSize:12 }} value={opt.label}
                    onChange={e => { const opts=[...q.options]; opts[i]={...opts[i],label:e.target.value}; onChange({...q,options:opts}); }}/>
                  <button onClick={() => removeOption(i)} style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:14, padding:'0 4px' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <input style={{ ...inpStyle, flex:1, fontSize:12 }} placeholder="Add option…" value={newOpt} onChange={e => setNewOpt(e.target.value)}
                onKeyDown={e => e.key==='Enter' && addOption()}/>
              <button onClick={addOption} style={{ padding:'8px 12px', background:C.red, border:'none', borderRadius:8, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>+</button>
            </div>
          </div>
        )}

        {/* Rating config */}
        {q.qtype==='rating' && (
          <div>
            <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Max Stars</label>
            <select style={{ ...inpStyle, appearance:'none' as any }} value={q.validation?.max||5} onChange={e => onChange({ ...q, validation:{ ...q.validation, max:+e.target.value } })}>
              {[3,4,5,7,10].map(n => <option key={n} value={n}>{n} stars</option>)}
            </select>
          </div>
        )}

        {/* Image config */}
        {q.qtype==='image' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Max Photos</label>
              <input type="number" style={{ ...inpStyle, width:80 }} min={1} max={10} value={q.image_count||1}
                onChange={e => onChange({ ...q, image_count:+e.target.value })}/>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:C.s3, borderRadius:10, border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:12, color:C.white }}>Camera only</span>
              <Tog val={!!q.camera_only} onChange={v => onChange({ ...q, camera_only:v })}/>
            </div>
          </div>
        )}

        {/* Conditional Logic */}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginTop:6 }}>
          <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:8, fontWeight:700, textTransform:'uppercase' }}>Visibility Logic</label>
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:10, color:C.grayd, display:'block', marginBottom:4 }}>Show if parent field...</label>
            <select style={{ ...inpStyle, appearance:'none' as any, fontSize:12 }} value={q.depends_on_id||''} onChange={e => onChange({ ...q, depends_on_id:e.target.value||undefined })}>
              <option value="">Always Visible</option>
              {allQs.filter(other => other.id !== q.id && !['section_header'].includes(other.qtype)).map(other => (
                <option key={other.id} value={other.id}>{other.label}</option>
              ))}
            </select>
          </div>
          {q.depends_on_id && (
            <div>
              <label style={{ fontSize:10, color:C.grayd, display:'block', marginBottom:4 }}>Equals value...</label>
              <input style={{ ...inpStyle, fontSize:12 }} value={q.depends_on_value||''} onChange={e => onChange({ ...q, depends_on_value:e.target.value })} placeholder="e.g. Yes"/>
            </div>
          )}
        </div>

        {/* Consent Type */}
        {q.qtype === 'consent' && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:C.s3, borderRadius:10, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.white }}>Mandatory</div>
            <Tog val={!!q.is_consent} onChange={v => onChange({ ...q, is_consent:v, is_required:v })}/>
          </div>
        )}

        {/* Pre-fill */}
        <div>
          <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Auto Pre-fill From</label>
          <select style={{ ...inpStyle, appearance:'none' as any }} value={q.prefill_key||''} onChange={e => onChange({ ...q, prefill_key:e.target.value||undefined })}>
            <option value="">None</option>
            <option value="user.name">Field Executive Name</option>
            <option value="user.employee_id">Employee ID</option>
            <option value="outlet.name">Outlet Name</option>
            <option value="supervisor.name">Supervisor Name</option>
            <option value="meta.date">Today&apos;s Date</option>
            <option value="meta.location">Current Location</option>
          </select>
        </div>

        {/* Validation */}
        {['short_text','long_text'].includes(q.qtype) && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Min Chars</label>
              <input type="number" style={inpStyle} min={0} value={q.validation?.min_length||''} onChange={e => onChange({ ...q, validation:{ ...q.validation, min_length:e.target.value?+e.target.value:undefined } })}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:C.gray, display:'block', marginBottom:5 }}>Max Chars</label>
              <input type="number" style={inpStyle} min={0} value={q.validation?.max_length||''} onChange={e => onChange({ ...q, validation:{ ...q.validation, max_length:e.target.value?+e.target.value:undefined } })}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   QUESTION CARD (Canvas)
══════════════════════════════════════════════════════════════════════════ */
function QuestionCard({ q, index, isSelected, onSelect, onMoveUp, onMoveDown, isFirst, isLast }:{ q:BQuestion; index:number; isSelected:boolean; onSelect:()=>void; onMoveUp:()=>void; onMoveDown:()=>void; isFirst:boolean; isLast:boolean }) {
  const ti = typeInfo(q.qtype);

  const renderPreview = () => {
    switch (q.qtype) {
      case 'short_text':  return <input disabled style={{ ...previewInp, opacity:.4 }} value={q.placeholder||'Short answer…'} readOnly/>;
      case 'long_text':   return <textarea disabled style={{ ...previewInp, height:54, opacity:.4, resize:'none' }} value={q.placeholder||'Long answer…'} readOnly/>;
      case 'number':      return <input type="number" disabled style={{ ...previewInp, opacity:.4 }} placeholder={q.placeholder||'0'}/>;
      case 'email':       return <input type="email" disabled style={{ ...previewInp, opacity:.4 }} placeholder="name@example.com"/>;
      case 'phone':       return <input type="tel" disabled style={{ ...previewInp, opacity:.4 }} placeholder="+91 XXXXXXXXXX"/>;
      case 'radio':       return <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{(q.options.length?q.options:[{label:'Option 1'},{label:'Option 2'}]).map((o:any,i:number) => <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:C.gray }}><div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:8, height:8, borderRadius:'50%', background:isSelected?C.red:C.border }}/></div>{o.label}</div>)}</div>;
      case 'checkbox':    return <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{(q.options.length?q.options:[{label:'Option 1'},{label:'Option 2'}]).map((o:any,i:number) => <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:C.gray }}><div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${C.border}`, background:isSelected?`${C.red}20`:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ color:C.red, fontSize:10 }}>{isSelected?'✓':''}</span></div>{o.label}</div>)}</div>;
      case 'dropdown':    return <div style={{ ...previewInp, display:'flex', justifyContent:'space-between', alignItems:'center', opacity:.5 }}><span>Select an option</span><span style={{ fontSize:10 }}>▼</span></div>;
      case 'yes_no':      return <div style={{ display:'flex', gap:8 }}><div style={{ padding:'6px 18px', borderRadius:8, background:`${C.green}18`, color:C.green, fontSize:13, fontWeight:700, border:`1px solid ${C.green}30` }}>Yes</div><div style={{ padding:'6px 18px', borderRadius:8, background:`${C.red}18`, color:C.red, fontSize:13, fontWeight:700, border:`1px solid ${C.red}30` }}>No</div></div>;
      case 'rating':      return <div style={{ display:'flex', gap:4 }}>{Array.from({length:q.validation?.max||5}).map((_,i) => <span key={i} style={{ fontSize:20, color:i<3?C.yellow:C.grayd }}>★</span>)}</div>;
      case 'date':        return <input type="date" disabled style={{ ...previewInp, opacity:.6 }}/>;
      case 'time':        return <input type="time" disabled style={{ ...previewInp, opacity:.6 }}/>;
      case 'datetime':    return <input type="datetime-local" disabled style={{ ...previewInp, opacity:.6 }}/>;
      case 'image':       return <div style={{ border:`2px dashed ${C.border}`, borderRadius:12, padding:'24px', textAlign:'center', color:C.gray, background:`${C.s2}80`, display:'flex', flexDirection:'column', gap:8, alignItems:'center' }}><span style={{ fontSize:24 }}>📷</span><div style={{ fontSize:13, fontWeight:600 }}>Image Upload / Camera</div><div style={{ fontSize:11, color:C.grayd }}>Max {q.media_config?.max_files||1} photos · Compression enabled</div></div>;
      case 'file':        return <div style={{ border:`2px dashed ${C.border}`, borderRadius:12, padding:'20px', textAlign:'center', color:C.gray, background:`${C.s2}80`, display:'flex', gap:10, alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:20 }}>📎</span><div style={{ fontSize:13, fontWeight:600 }}>Click to upload any file</div></div>;
      case 'signature':   return <div style={{ border:`2px solid ${C.border}`, background:C.s4, borderRadius:12, padding:14, height:100, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color:C.grayd, position:'relative' }}><div style={{ borderBottom:`1.5px dashed ${C.grayd}`, width:'80%', marginBottom:10 }}/><span style={{ fontSize:12 }}>Sign here</span><span style={{ position:'absolute', top:10, right:12, fontSize:16, opacity:0.3 }}>✍️</span></div>;
      case 'location':    return <div style={{ border:`1px solid ${C.border}`, background:`${C.blue}10`, borderRadius:10, padding:'12px 14px', color:C.blue, fontSize:13, display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:18 }}>📍</span>GPS Location (Auto-capture)</div>;
      case 'section_header': return null;
      case 'consent':     return <div style={{ background:`${C.blue}08`, border:`1px solid ${C.blue}20`, borderRadius:10, padding:'12px 14px', fontSize:12, color:C.gray, lineHeight:1.6, display:'flex', gap:10, alignItems:'flex-start' }}><input type="checkbox" disabled checked/><div style={{ opacity:0.8 }}>I agree to the terms and data collection consent policy.</div></div>;
      default: return null;
    }
  };
  const previewInp:React.CSSProperties = { background:C.s4, border:`1.5px solid ${C.border}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.white, fontFamily:"'DM Sans',sans-serif", outline:'none' };

  if (q.qtype === 'section_header') return (
    <div onClick={onSelect} style={{ padding:'10px 18px', cursor:'pointer', borderBottom:`2px solid ${isSelected?C.red:C.borderL}`, background:isSelected?C.redD:'transparent', transition:'all .13s' }}>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:isSelected?C.red:C.white }}>{q.label}</div>
      {q.helper_text && <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{q.helper_text}</div>}
    </div>
  );

  return (
    <div onClick={onSelect}
      style={{ background:isSelected?C.redD:C.s3, border:`1.5px solid ${isSelected?C.red:C.border}`, borderRadius:14, padding:'16px 18px', cursor:'pointer', transition:'all .15s', position:'relative' }}>
      {/* Type badge */}
      <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:4, alignItems:'center' }}>
        <div style={{ fontSize:10, color:C.grayd, display:'flex', alignItems:'center', gap:4 }}>
          <span>{ti.icon}</span><span style={{ fontWeight:600, textTransform:'capitalize' }}>{ti.label}</span>
        </div>
        {isSelected && (
          <div style={{ display:'flex', gap:2, marginLeft:8 }}>
            {!isFirst && <button onClick={e=>{e.stopPropagation();onMoveUp();}} style={{ background:C.s4, border:`1px solid ${C.border}`, borderRadius:4, color:C.gray, cursor:'pointer', fontSize:11, padding:'1px 6px' }}>↑</button>}
            {!isLast  && <button onClick={e=>{e.stopPropagation();onMoveDown();}} style={{ background:C.s4, border:`1px solid ${C.border}`, borderRadius:4, color:C.gray, cursor:'pointer', fontSize:11, padding:'1px 6px' }}>↓</button>}
          </div>
        )}
      </div>
      {/* Label */}
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:800, color:isSelected?C.red:C.white }}>Q{index+1}</span>
        <span style={{ fontSize:14, fontWeight:700, color:C.white, paddingRight:80 }}>{q.label}</span>
        {q.is_required && <span style={{ fontSize:10, color:C.red, fontWeight:800 }}>*</span>}
      </div>
      {q.helper_text && <div style={{ fontSize:11, color:C.gray, marginBottom:8 }}>{q.helper_text}</div>}
      {renderPreview()}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FORM BUILDER (Editor)
══════════════════════════════════════════════════════════════════════════ */
function FormEditor({ form: initialForm, onBack }:{ form:BForm; onBack:()=>void }) {
  const [form,      setForm]     = useState<BForm>(initialForm);
  const [pages,     setPages]    = useState<BPage[]>([]);
  const [questions, setQs]       = useState<BQuestion[]>([]);
  const [selPage,   setSelPage]  = useState<string|null>(null);
  const [selQ,      setSelQ]     = useState<string|null>(null);
  const [tab,       setTab]      = useState<'build'|'settings'|'logic'>('build');
  const [saving,    setSaving]   = useState(false);
  const [saved,     setSaved]    = useState(false);
  const [deleteQModal, setDeleteQModal] = useState<{show:boolean; id:string; label:string}>({show:false, id:'', label:''});
  const [deletingQ, setDeletingQ] = useState(false);

  /* Load form data */
  const loadForm = useCallback(async () => {
    try {
      const [pData, qData] = await Promise.all([
        apiFetch<any>(`/api/v1/builder/forms/${form.id}/pages`),
        apiFetch<any>(`/api/v1/builder/forms/${form.id}/questions`),
      ]);
      const pList:BPage[] = Array.isArray(pData) ? pData : (pData?.data ?? []);
      const qList:BQuestion[] = Array.isArray(qData) ? qData : (qData?.data ?? []);
      // If no pages, create default
      if (pList.length === 0) {
        const newPage = await apiFetch<BPage>(`/api/v1/builder/forms/${form.id}/pages`, { method:'POST', body: JSON.stringify({ title:'Page 1', page_order:0 }) });
        setPages([newPage]);
        setSelPage(newPage.id);
      } else {
        setPages(pList.sort((a,b) => a.page_order - b.page_order));
        setSelPage(p => p || pList[0]?.id || null);
      }
      setQs(qList.sort((a,b) => a.q_order - b.q_order));
    } catch {}
  }, [form.id]);

  useEffect(() => { loadForm(); }, [loadForm]);


  /* Add question */
  const addQuestion = async (qtype:string) => {
    if (!selPage) return;
    const pageQs = questions.filter(q => q.page_id === selPage);
    const newQ = await apiFetch<BQuestion>(`/api/v1/builder/forms/${form.id}/questions`, {
      method:'POST',
      body: JSON.stringify({ page_id:selPage, qtype, label:`New ${typeInfo(qtype).label}`, q_order:pageQs.length, is_required:false, options:[], validation:{}, logic:[], media_config:{} })
    });
    setQs(p => [...p, newQ]);
    setSelQ(newQ.id);
  };

  /* Update question locally + save */
  const updateQ = async (updated:BQuestion) => {
    setQs(p => p.map(q => q.id===updated.id ? updated : q));
    setSelQ(updated.id);
    await apiFetch(`/api/v1/builder/questions/${updated.id}`, { method:'PATCH', body: JSON.stringify(updated) }).catch(()=>{});
  };

  /* Delete question */
  const doDeleteQ = async () => {
    if(!deleteQModal.id) return;
    setDeletingQ(true);
    try {
      await apiFetch(`/api/v1/builder/questions/${deleteQModal.id}`, { method:'DELETE' });
      setQs(p => p.filter(q => q.id!==deleteQModal.id));
      setSelQ(null);
      setDeleteQModal({show:false, id:'', label:''});
    } catch(e:any){
      alert(e.message);
    } finally {
      setDeletingQ(false);
    }
  };

  /* Reorder questions */
  const moveQ = (id:string, dir:'up'|'down') => {
    const pageQs = questions.filter(q => q.page_id===selPage).sort((a,b) => a.q_order-b.q_order);
    const idx = pageQs.findIndex(q => q.id===id);
    if (dir==='up' && idx===0) return;
    if (dir==='down' && idx===pageQs.length-1) return;
    const swapIdx = dir==='up' ? idx-1 : idx+1;
    const updated = [...pageQs];
    [updated[idx].q_order, updated[swapIdx].q_order] = [updated[swapIdx].q_order, updated[idx].q_order];
    setQs(p => p.map(q => { const f=updated.find(u=>u.id===q.id); return f||q; }));
  };

  /* Add page */
  const addPage = async () => {
    const newPage = await apiFetch<BPage>(`/api/v1/builder/forms/${form.id}/pages`, {
      method:'POST', body: JSON.stringify({ title:`Page ${pages.length+1}`, page_order:pages.length })
    });
    setPages(p => [...p, newPage]);
    setSelPage(newPage.id);
  };

  /* Save form metadata */
  const saveForm = async () => {
    setSaving(true); setSaved(false);
    await apiFetch(`/api/v1/builder/forms/${form.id}`, { method:'PATCH', body: JSON.stringify({ title:form.title, description:form.description, status:form.status }) }).catch(()=>{});
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  /* Publish / unpublish */
  const toggleStatus = async () => {
    const newStatus = form.status==='published' ? 'draft' : 'published';
    await apiFetch(`/api/v1/builder/forms/${form.id}`, { method:'PATCH', body: JSON.stringify({ status:newStatus }) }).catch(()=>{});
    setForm(p => ({...p, status:newStatus}));
  };

  const currentPageQs = questions.filter(q => q.page_id===selPage).sort((a,b) => a.q_order-b.q_order);
  const selectedQ = questions.find(q => q.id===selQ);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)' }}>
      {/* Top bar */}
      <div style={{ background:C.s2, borderBottom:`1px solid ${C.border}`, padding:'10px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
        <button onClick={onBack} style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:8, color:C.gray, cursor:'pointer', fontSize:13, padding:'6px 12px', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
          ← Back
        </button>
        <div style={{ flex:1 }}>
          <input style={{ background:'transparent', border:'none', color:C.white, fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, outline:'none', width:'100%', caretColor:C.red }}
            value={form.title} onChange={e => setForm(p => ({...p, title:e.target.value}))}/>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:2, background:C.s3, borderRadius:9, padding:3, border:`1px solid ${C.border}` }}>
          {(['build','settings','logic'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize', background:tab===t?C.s4:'transparent', color:tab===t?C.white:C.gray, transition:'all .13s' }}>
              {t}
            </button>
          ))}
        </div>
        <Tag label={form.status} color={STATUS_COLOR[form.status]||C.gray}/>
        <button onClick={toggleStatus}
          style={{ padding:'7px 14px', background:form.status==='published'?C.s3:C.green, border:`1px solid ${form.status==='published'?C.border:C.green}`, borderRadius:8, color:form.status==='published'?C.gray:'#000', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          {form.status==='published'?'Unpublish':'Publish'}
        </button>
        <button onClick={saveForm} disabled={saving}
          style={{ padding:'7px 16px', background:C.red, border:'none', borderRadius:8, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1, display:'flex', alignItems:'center', gap:6 }}>
          {saving?<><Spin size={12}/>Saving…</>:saved?'✓ Saved':'Save'}
        </button>
      </div>

      {/* Builder layout */}
      {tab==='build' && (
        <div style={{ display:'flex', flex:1, minHeight:0 }}>
          {/* Left — Field types */}
          <div style={{ width:200, flexShrink:0, background:C.s2, borderRight:`1px solid ${C.border}`, overflowY:'auto', padding:'10px 0' }}>
            {FIELD_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom:4 }}>
                <div style={{ padding:'6px 14px 4px', fontSize:10, color:C.grayd, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px' }}>{group.label}</div>
                {group.items.map(item => (
                  <div key={item.type} onClick={() => addQuestion(item.type)}
                    style={{ padding:'7px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:9, borderRadius:0, transition:'background .1s', fontSize:12, color:C.gray, fontWeight:600 }}
                    onMouseEnter={e => (e.currentTarget.style.background=C.s3)}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <span style={{ fontSize:14 }}>{item.icon}</span>
                    {item.label}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Center — Canvas */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
            {/* Page tabs */}
            <div style={{ background:C.s2, borderBottom:`1px solid ${C.border}`, padding:'0 20px', display:'flex', alignItems:'center', gap:2, flexShrink:0, overflowX:'auto' }}>
              {pages.map(p => (
                <button key={p.id} onClick={() => { setSelPage(p.id); setSelQ(null); }}
                  style={{ padding:'10px 16px', border:'none', borderBottom:`2px solid ${selPage===p.id?C.red:'transparent'}`, background:'transparent', color:selPage===p.id?C.white:C.gray, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                  {p.title}
                </button>
              ))}
              <button onClick={addPage} style={{ padding:'8px 12px', border:'none', background:'transparent', color:C.grayd, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:4 }}>
                + Page
              </button>
            </div>

            {/* Questions canvas */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', background:C.bg }}>
              {currentPageQs.length === 0 ? (
                <div style={{ border:`2px dashed ${C.border}`, borderRadius:16, padding:'48px', textAlign:'center', color:C.grayd }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.gray, marginBottom:6 }}>Empty page</div>
                  <div style={{ fontSize:12 }}>Click any field type on the left to add it here</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:640, margin:'0 auto' }}>
                  {currentPageQs.map((q, i) => (
                    <QuestionCard key={q.id} q={q} index={i} isSelected={selQ===q.id}
                      onSelect={() => setSelQ(q.id)}
                      onMoveUp={() => moveQ(q.id, 'up')}
                      onMoveDown={() => moveQ(q.id, 'down')}
                      isFirst={i===0} isLast={i===currentPageQs.length-1}/>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right — Properties */}
          {selectedQ ? (
            <PropertiesPanel q={selectedQ} allQs={questions} onChange={updateQ} onDelete={() => setDeleteQModal({show:true, id:selectedQ.id, label:selectedQ.label})}/>
          ) : (
            <div style={{ width:280, flexShrink:0, background:C.s2, borderLeft:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:C.grayd, fontSize:13, textAlign:'center', padding:24 }}>
              <div><div style={{ fontSize:32, marginBottom:10 }}>👆</div>Select a field to edit its properties</div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        show={deleteQModal.show}
        onClose={() => setDeleteQModal({show:false, id:'', label:''})}
        onConfirm={doDeleteQ}
        title="Delete Question"
        message="Are you sure you want to permanently delete this field"
        itemName={deleteQModal.label}
        loading={deletingQ}
      />

      {/* Settings tab */}
      {tab==='settings' && (
        <div style={{ flex:1, overflowY:'auto', padding:'28px 40px' }}>
          <div style={{ maxWidth:600 }}>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white, marginBottom:20 }}>Form Settings</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div><label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:6 }}>Form Title</label><input style={inpStyle} value={form.title} onChange={e => setForm(p => ({...p,title:e.target.value}))}/></div>
              <div><label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:6 }}>Description</label><textarea style={{ ...inpStyle, resize:'none' as any }} rows={3} value={form.description||''} onChange={e => setForm(p => ({...p,description:e.target.value}))}/></div>
              <div>
                <label style={{ fontSize:12, color:C.gray, display:'block', marginBottom:6 }}>Status</label>
                <select style={{ ...inpStyle, appearance:'none' as any }} value={form.status} onChange={e => setForm(p => ({...p,status:e.target.value}))}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              {[
                { key:'requires_gps',   label:'Require GPS',   desc:'Force GPS location capture on submission' },
                { key:'requires_photo', label:'Require Photo', desc:'At least one image must be attached' },
                { key:'allow_offline',  label:'Allow Offline', desc:'Form can be filled without internet' },
              ].map(s => (
                <div key={s.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', background:C.s3, borderRadius:12, border:`1px solid ${C.border}` }}>
                  <div><div style={{ fontSize:13, fontWeight:700, color:C.white }}>{s.label}</div><div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{s.desc}</div></div>
                  <Tog val={!!(form as any)[s.key]} onChange={v => setForm(p => ({...p, [s.key]:v}))}/>
                </div>
              ))}
              <button onClick={saveForm} disabled={saving} style={{ padding:'11px', background:C.red, border:'none', borderRadius:10, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {saving?<><Spin/>Saving…</>:saved?'✓ Saved':'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logic tab */}
      {tab==='logic' && (
        <div style={{ flex:1, overflowY:'auto', padding:'28px 40px' }}>
          <div style={{ maxWidth:640 }}>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white, marginBottom:6 }}>Conditional Logic</h2>
            <p style={{ fontSize:13, color:C.gray, marginBottom:24 }}>Show or hide questions based on other answers</p>
            {questions.filter(q=>!['section_header'].includes(q.qtype)).map(q => (
              <div key={q.id} style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 16px', marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:q.logic?.length?12:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.white }}>
                    <span style={{ marginRight:8 }}>{typeInfo(q.qtype).icon}</span>{q.label}
                  </div>
                  <button onClick={() => updateQ({ ...q, logic:[...(q.logic||[]), { condition_q:'', condition_val:'', action:'show' }] })}
                    style={{ fontSize:11, padding:'4px 10px', background:C.blueD, border:`1px solid ${C.blue}30`, borderRadius:6, color:C.blue, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:700 }}>
                    + Add Rule
                  </button>
                </div>
                {(q.logic||[]).map((rule:any, ri:number) => (
                  <div key={ri} style={{ display:'flex', gap:8, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, color:C.gray }}>If</span>
                    <select style={{ ...inpStyle, flex:1, minWidth:120, fontSize:11 }} value={rule.condition_q} onChange={e => { const l=[...q.logic]; l[ri]={...l[ri],condition_q:e.target.value}; updateQ({...q,logic:l}); }}>
                      <option value="">Select question…</option>
                      {questions.filter(qq=>qq.id!==q.id&&['radio','dropdown','yes_no'].includes(qq.qtype)).map(qq=><option key={qq.id} value={qq.id}>{qq.label}</option>)}
                    </select>
                    <span style={{ fontSize:11, color:C.gray }}>is</span>
                    <input style={{ ...inpStyle, flex:1, minWidth:80, fontSize:11 }} placeholder="value…" value={rule.condition_val} onChange={e => { const l=[...q.logic]; l[ri]={...l[ri],condition_val:e.target.value}; updateQ({...q,logic:l}); }}/>
                    <span style={{ fontSize:11, color:C.gray }}>→</span>
                    <select style={{ ...inpStyle, width:'auto', fontSize:11 }} value={rule.action} onChange={e => { const l=[...q.logic]; l[ri]={...l[ri],action:e.target.value}; updateQ({...q,logic:l}); }}>
                      <option value="show">Show</option>
                      <option value="hide">Hide</option>
                      <option value="require">Require</option>
                    </select>
                    <button onClick={() => { const l=q.logic.filter((_:any,i:number)=>i!==ri); updateQ({...q,logic:l}); }} style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:16 }}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function FormBuilderPage() {
  const [view, setView] = useState<'list'|'editor'|'create'>('list');
  const [activeForm, setActiveForm] = useState<BForm|null>(null);

  const openEditor = (f:BForm) => { setActiveForm(f); setView('editor'); };
  const onCreated  = (f:BForm) => { setActiveForm(f); setView('editor'); };

  return (
    <>
      <style>{`
        @keyframes fbspin { to { transform:rotate(360deg) } }
        @keyframes fbfade  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; }
      `}</style>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, animation:'fbfade .3s ease' }}>
        {view==='list' && <FormList onOpen={openEditor} onCreate={() => setView('create')}/>}
        {view==='editor' && activeForm && <FormEditor form={activeForm} onBack={() => setView('list')}/>}
        {view==='create' && <CreateFormModal onCreated={onCreated} onClose={() => setView('list')}/>}
      </div>
    </>
  );
}
