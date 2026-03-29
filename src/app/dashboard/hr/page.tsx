'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';

const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1', tealD:'rgba(0,201,177,0.08)',
  orange:'#FF7A30',
};

/* ── types ── */
interface HRUser {
  id:string; name:string; role:string; mobile?:string; email?:string;
  employee_id?:string; city?:string; zone_id?:string; is_active?:boolean; joined_date?:string;
}
interface Zone { id:string; name:string; city?:string; }
interface Candidate {
  id:string; name:string; mobile?:string; email?:string; applied_role:string;
  city?:string; source?:string; stage:string; notes?:string; resume_url?:string;
  interview_date?:string; selected_at?:string; onboarded_at?:string;
  rejected_at?:string; rejection_reason?:string; converted_user_id?:string;
  created_at:string; applied_zone?:string;
}
interface CandidateDoc {
  id:string; candidate_id:string; doc_type:string; doc_label:string;
  file_url?:string; file_name?:string; doc_value?:string;
  is_verified?:boolean; uploaded_at:string;
}

/* ── atoms ── */
const Spin = () => (
  <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);
const Shimmer = ({ w='100%', h=16, br=6 }:{ w?:string|number; h?:number; br?:number }) => (
  <div style={{ width:w, height:h, borderRadius:br, background:C.s3, overflow:'hidden', position:'relative' }}>
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,transparent,${C.border},transparent)`, animation:'km-shimmer 1.3s ease-in-out infinite' }}/>
  </div>
);
const StatCard = ({ label, value, color, sub, loading }:{ label:string; value:string|number; color:string; sub?:string; loading?:boolean }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:'18px 20px' }}>
    {loading ? <Shimmer h={28} br={5} w="55%"/> : (
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color, lineHeight:1 }}>{value}</div>
    )}
    <div style={{ fontSize:11, color:C.gray, marginTop:6, fontWeight:600 }}>{label}</div>
    {sub && <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{sub}</div>}
  </div>
);
const Avatar = ({ name, size=32 }:{ name?:string; size?:number }) => {
  const safeName = name || '?';
  const initials = safeName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const hue = safeName.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 360;
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`hsl(${hue},55%,22%)`,
      border:`1px solid hsl(${hue},55%,35%)`, display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:size*0.35, color:`hsl(${hue},70%,65%)`, flexShrink:0 }}>
      {initials}
    </div>
  );
};
const Card = ({ children, style }:{ children:React.ReactNode; style?:React.CSSProperties }) => (
  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:18, padding:'20px 22px', ...style }}>
    {children}
  </div>
);
const SectionHeader = ({ title, sub }:{ title:string; sub?:string }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{title}</div>
    {sub && <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{sub}</div>}
  </div>
);

/* ── ATS PIPELINE STAGES ── */
const STAGES = [
  { id:'applied',    label:'Applied',    color:C.blue   },
  { id:'screening',  label:'Screening',  color:C.purple },
  { id:'interview',  label:'Interview',  color:C.yellow },
  { id:'selected',   label:'Selected',   color:C.teal   },
  { id:'onboarded',  label:'Onboarded',  color:C.green  },
  { id:'rejected',   label:'Rejected',   color:C.red    },
];

const stageColor = (s:string) => STAGES.find(x=>x.id===s)?.color || C.gray;

/* ── DOC TYPES ── */
// input_type: 'text' = enter value only, 'file' = upload file, 'both' = value + file
const DEFAULT_DOC_TYPES = [
  { type:'aadhaar',    label:'Aadhaar Card',            icon:'🪪',  input:'both',  placeholder:'Enter 12-digit Aadhaar number' },
  { type:'pan',        label:'PAN Card',                icon:'💳',  input:'both',  placeholder:'Enter PAN number (e.g. ABCDE1234F)' },
  { type:'bank',       label:'Bank Account Details',    icon:'🏦',  input:'text',  placeholder:'Account number / IFSC / Bank name' },
  { type:'email',      label:'Email ID',                icon:'📧',  input:'text',  placeholder:'candidate@email.com' },
  { type:'education',  label:'Education Certificate',   icon:'🎓',  input:'both',  placeholder:'Degree / Board / Year' },
  { type:'photo',      label:'Passport Photo',          icon:'📸',  input:'file',  placeholder:'' },
  { type:'resume',     label:'Resume / CV',             icon:'📄',  input:'file',  placeholder:'' },
];

/* ══════════════════════════════════════════════════
   CANDIDATE DETAIL PANEL
══════════════════════════════════════════════════ */
function CandidateDetail({ candidate, zones, onClose, onRefresh, token }:{
  candidate:Candidate; zones:Zone[]; onClose:()=>void; onRefresh:()=>void; token:string;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const authH   = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

  // Tabs within detail panel
  const [detailTab, setDetailTab] = useState<'info'|'docs'|'convert'>('info');

  // Stage / notes
  const [stage,   setStage]   = useState(candidate.stage);
  const [notes,   setNotes]   = useState(candidate.notes || '');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Documents
  const [docs,       setDocs]      = useState<CandidateDoc[]>([]);
  const [loadingDocs, setLD]       = useState(true);
  const [editingDoc, setEditingDoc] = useState<string|null>(null); // doc_type being edited
  const [docValues,  setDocValues] = useState<Record<string,string>>({}); // type -> value
  const [savingDoc,  setSavingDoc] = useState<string|null>(null);
  const [docMsg,     setDocMsg]    = useState('');

  // Add custom doc
  const [showAddCustom,    setShowAddCustom]    = useState(false);
  const [customDocLabel,   setCustomDocLabel]   = useState('');
  const [customDocValue,   setCustomDocValue]   = useState('');
  const [savingCustom,     setSavingCustom]     = useState(false);

  // Convert to FE
  const emptyConvert = { employee_id:'', app_password:'', zone_id:'', joined_date:'' };
  const [convertForm, setConvertForm] = useState(emptyConvert);
  const [converting,  setConverting]  = useState(false);
  const [convertErr,  setConvertErr]  = useState('');
  const [convertOk,   setConvertOk]   = useState(false);
  const [convertedUser, setConvertedUser] = useState<HRUser|null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showPwReset, setShowPwReset] = useState(false);
  const [newAppPw, setNewAppPw] = useState('');
  const [pwUpdating, setPwUpdating] = useState(false);

  const fetchUser = useCallback(async () => {
    if (!candidate.converted_user_id) return;
    setLoadingUser(true);
    try {
      const r = await api.getFieldExecutive(candidate.converted_user_id);
      setConvertedUser(r as HRUser);
    } catch {} finally { setLoadingUser(false); }
  }, [candidate.converted_user_id]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const updateAppPw = async () => {
    if (!newAppPw || !convertedUser) return;
    setPwUpdating(true);
    try {
      await api.updateUser(convertedUser.id, { app_password: newAppPw });
      setNewAppPw(''); setShowPwReset(false); fetchUser();
    } catch {} finally { setPwUpdating(false); }
  };

  const fetchDocs = useCallback(async () => {
    setLD(true);
    try {
      const r = await api.get<any>(`/api/v1/candidates/${candidate.id}/documents`, {
        headers:{ Authorization:`Bearer ${token}` }
      });
      const list: CandidateDoc[] = (r?.data ?? r) || [];
      setDocs(list);
      // Pre-fill docValues from existing records
      const vals: Record<string,string> = {};
      list.forEach(d => { if (d.doc_value) vals[d.doc_type] = d.doc_value; });
      setDocValues(vals);
    } catch { setDocs([]); } finally { setLD(false); }
  }, [candidate.id, token]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  /* ── Save stage + notes ── */
  const saveInfo = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/api/v1/candidates/${candidate.id}`, {
        method:'PATCH', headers:authH,
        body: JSON.stringify({ stage, notes }),
      });
      setSaveMsg('Saved!'); setTimeout(()=>setSaveMsg(''), 2000);
      onRefresh();
    } catch { setSaveMsg('Error saving'); }
    finally { setSaving(false); }
  };

  /* ── Save a single document field ── */
  const saveDocField = async (docType: string, docLabel: string, value: string, fileUrl?: string, fileName?: string) => {
    setSavingDoc(docType);
    try {
      const existing = docs.find(d => d.doc_type === docType);
      if (existing) {
        // Update via PATCH — we'll use a direct supabase call via backend
        await fetch(`${apiBase}/api/v1/candidates/${candidate.id}/documents/${existing.id}`, {
          method:'PATCH', headers:authH,
          body: JSON.stringify({ doc_value: value || null, file_url: fileUrl || existing.file_url, file_name: fileName || existing.file_name }),
        });
      } else {
        await fetch(`${apiBase}/api/v1/candidates/${candidate.id}/documents`, {
          method:'POST', headers:authH,
          body: JSON.stringify({ doc_type: docType, doc_label: docLabel, doc_value: value || null, file_url: fileUrl || null, file_name: fileName || null }),
        });
      }
      setDocMsg('Saved!'); setTimeout(()=>setDocMsg(''), 2000);
      setEditingDoc(null);
      fetchDocs();
    } catch { setDocMsg('Error saving'); }
    finally { setSavingDoc(null); }
  };

  /* ── Add custom doc ── */
  const saveCustomDoc = async () => {
    if (!customDocLabel.trim()) return;
    setSavingCustom(true);
    try {
      await fetch(`${apiBase}/api/v1/candidates/${candidate.id}/documents`, {
        method:'POST', headers:authH,
        body: JSON.stringify({ doc_type: `custom_${Date.now()}`, doc_label: customDocLabel.trim(), doc_value: customDocValue || null }),
      });
      setCustomDocLabel(''); setCustomDocValue(''); setShowAddCustom(false);
      fetchDocs();
    } catch {}
    finally { setSavingCustom(false); }
  };

  /* ── Delete a doc ── */
  const deleteDoc = async (docId: string) => {
    try {
      await fetch(`${apiBase}/api/v1/candidates/${candidate.id}/documents/${docId}`, {
        method:'DELETE', headers:authH,
      });
      fetchDocs();
    } catch {}
  };

  /* ── Convert to FE ── */
  const doConvert = async () => {
    if (!convertForm.employee_id || !convertForm.app_password) { setConvertErr('Employee ID and app password required'); return; }
    setConverting(true); setConvertErr('');
    try {
      const userRes = await fetch(`${apiBase}/api/v1/users`, {
        method:'POST', headers:authH,
        body: JSON.stringify({
          name: candidate.name, mobile: candidate.mobile,
          email: candidate.email, 
          city: candidate.city, employee_id: convertForm.employee_id,
          zone_id: convertForm.zone_id || undefined,
          joined_date: convertForm.joined_date || undefined,
          password: convertForm.app_password,
          app_password: convertForm.app_password,
          role: 'executive'
        }),
      });
      const userJson = await userRes.json();
      if (!userRes.ok) throw new Error(userJson.error || userJson.message || 'Failed to create user');
      const newUserId = userJson?.data?.id ?? userJson?.id;
      await fetch(`${apiBase}/api/v1/candidates/${candidate.id}`, {
        method:'PATCH', headers:authH,
        body: JSON.stringify({ stage:'onboarded', converted_user_id: newUserId }),
      });
      setConvertOk(true);
      setTimeout(()=>{ onRefresh(); onClose(); }, 1800);
    } catch(e:any) { setConvertErr(e.message); }
    finally { setConverting(false); }
  };

  const inp: React.CSSProperties = {
    width:'100%', padding:'8px 11px', borderRadius:9, border:`1.5px solid ${C.border}`,
    background:C.s4, color:C.white, fontSize:12, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  const existingTypes = new Set(docs.map(d => d.doc_type));
  const customDocs    = docs.filter(d => !DEFAULT_DOC_TYPES.find(dt => dt.type === d.doc_type));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:300,
      display:'flex', alignItems:'center', justifyContent:'flex-end', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:460, height:'calc(100vh - 32px)', background:C.s2,
        border:`1px solid ${C.borderL}`, borderRadius:18, display:'flex', flexDirection:'column',
        boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-slidein .25s ease', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <Avatar name={candidate.name} size={42}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:C.white }}>{candidate.name}</div>
              <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{candidate.mobile} {candidate.city?`· ${candidate.city}`:''}</div>
              <div style={{ display:'flex', gap:6, marginTop:6 }}>
                <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, fontWeight:700,
                  background:`${stageColor(stage)}18`, color:stageColor(stage) }}>
                  {STAGES.find(s=>s.id===stage)?.label || stage}
                </span>
                {candidate.source && <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, background:C.s3, color:C.gray }}>{candidate.source}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.border}`,
              borderRadius:8, width:28, height:28, cursor:'pointer', color:C.gray, fontSize:16,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
          {/* Sub-tabs */}
          <div style={{ display:'flex', gap:0, background:C.s3, borderRadius:10, padding:3 }}>
            {([
              { id:'info',    label:'📋 Info & Stage' },
              { id:'docs',    label:'📁 Documents' },
              { id:'convert', label:'🚀 Convert to FE' },
            ] as const).map(t=>(
              <button key={t.id} onClick={()=>setDetailTab(t.id)}
                style={{ flex:1, padding:'6px 0', borderRadius:8, border:'none',
                  background:detailTab===t.id?C.s2:'transparent',
                  color:detailTab===t.id?C.white:C.gray,
                  fontSize:11, fontWeight:700, cursor:'pointer',
                  fontFamily:"'DM Sans',sans-serif", transition:'all .15s',
                  boxShadow:detailTab===t.id?`0 1px 4px rgba(0,0,0,.4)`:undefined }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

          {/* ── INFO & STAGE TAB ── */}
          {detailTab === 'info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Details */}
              <div style={{ background:C.s3, borderRadius:12, overflow:'hidden' }}>
                {[
                  { l:'Email',        v: candidate.email || '—' },
                  { l:'Applied Role', v: candidate.applied_role },
                  { l:'Source',       v: candidate.source || '—' },
                  { l:'Applied',      v: candidate.created_at ? new Date(candidate.created_at).toLocaleDateString('en-IN') : '—' },
                ].map((r,i,arr)=>(
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 14px', borderBottom:i<arr.length-1?`1px solid ${C.border}`:'none', fontSize:12 }}>
                    <span style={{ color:C.gray }}>{r.l}</span>
                    <span style={{ color:C.white, fontWeight:600 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* Stage mover */}
              <div>
                <div style={{ fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Move Stage</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {STAGES.map(s=>(
                    <button key={s.id} onClick={()=>setStage(s.id)}
                      style={{ padding:'5px 12px', borderRadius:20, cursor:'pointer',
                        border:`1.5px solid ${stage===s.id?s.color:C.border}`,
                        background:stage===s.id?`${s.color}18`:'transparent',
                        color:stage===s.id?s.color:C.gray,
                        fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", transition:'all .15s' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Notes</div>
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                  placeholder="Add notes about this candidate…"
                  style={{ ...inp, resize:'none', lineHeight:1.5 }}/>
              </div>

               <button onClick={saveInfo} disabled={saving} style={{ padding:"10px 0", borderRadius:11, border:"none", background:C.red, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"\"DM Sans\",sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}> {saving ? <Spin/> : saveMsg ? `✓ ${saveMsg}` : "Save Changes"} </button>

              {/* ── App Credentials Section (if onboarded) ── */}
              {candidate.converted_user_id && (
                <div style={{ marginTop:20, padding:'16px', background:C.s3, borderRadius:14, border:`1px solid ${C.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase' }}>App Credentials</div>
                    <span style={{ fontSize:9, padding:'2px 8px', borderRadius:20, background:C.greenD, color:C.green, fontWeight:700 }}>Mobile Login Active</span>
                  </div>
                  
                  {loadingUser ? <Shimmer h={40}/> : convertedUser ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:11, color:C.gray }}>Login ID (Mobile/Email)</div>
                          <div style={{ fontSize:13, fontWeight:700, color:C.white, marginTop:2 }}>{convertedUser.mobile || convertedUser.email}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:11, color:C.gray }}>App Password</div>
                          <div style={{ fontSize:13, fontWeight:700, color:C.green, marginTop:2, fontFamily:'monospace' }}>
                            {convertedUser.app_password || '********'}
                          </div>
                        </div>
                      </div>

                      {showPwReset ? (
                        <div style={{ marginTop:6, display:'flex', gap:8 }}>
                          <input type="text" placeholder="New app password" style={{ ...inp, flex:1 }}
                            value={newAppPw} onChange={e=>setNewAppPw(e.target.value)}/>
                          <button onClick={updateAppPw} disabled={pwUpdating}
                            style={{ padding:'0 14px', borderRadius:9, border:'none', background:C.green, color:'#000', fontWeight:800, fontSize:11, cursor:'pointer' }}>
                            {pwUpdating ? <Spin/> : 'Change'}
                          </button>
                          <button onClick={()=>setShowPwReset(false)}
                            style={{ padding:'0 10px', borderRadius:9, border:`1px solid ${C.border}`, background:'transparent', color:C.gray, fontSize:11, cursor:'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={()=>setShowPwReset(true)}
                          style={{ width:'100%', padding:'8px 0', border:`1px solid ${C.border}`, background:'transparent', borderRadius:10, color:C.gray, fontSize:11, fontWeight:700, cursor:'pointer', marginTop:4 }}>
                          🔑 Set New App Password
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:C.red, textAlign:'center' }}>Failed to load user profile</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {detailTab === 'docs' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {docMsg && (
                <div style={{ padding:'8px 12px', background:C.greenD, border:`1px solid ${C.green}28`,
                  borderRadius:9, fontSize:12, color:C.green, marginBottom:10 }}>✓ {docMsg}</div>
              )}

              {loadingDocs ? (
                <div style={{ display:'flex', justifyContent:'center', padding:'32px 0' }}><Spin/></div>
              ) : (
                <>
                  {/* Standard doc types */}
                  {DEFAULT_DOC_TYPES.map((dt, i) => {
                    const existing = docs.find(d => d.doc_type === dt.type);
                    const isEditing = editingDoc === dt.type;
                    const currentVal = docValues[dt.type] || '';
                    const isSaving = savingDoc === dt.type;
                    const hasData = existing && (existing.doc_value || existing.file_url);

                    return (
                      <div key={dt.type} style={{
                        borderBottom: i < DEFAULT_DOC_TYPES.length - 1 ? `1px solid ${C.border}` : 'none',
                        padding:'12px 0',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          {/* Icon + status */}
                          <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
                            background: hasData ? C.greenD : C.s3,
                            border: `1px solid ${hasData ? C.green+'40' : C.border}`,
                            display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>
                            {dt.icon}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700,
                              color: hasData ? C.green : C.white }}>
                              {dt.label}
                              {hasData && <span style={{ fontSize:9, marginLeft:6, padding:'1px 6px',
                                borderRadius:20, background:C.greenD, color:C.green, fontWeight:700 }}>✓ Filled</span>}
                            </div>
                            {existing?.doc_value && !isEditing && (
                              <div style={{ fontSize:11, color:C.gray, marginTop:2, fontFamily:'monospace' }}>{existing.doc_value}</div>
                            )}
                            {existing?.file_name && !isEditing && (
                              <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>📎 {existing.file_name}</div>
                            )}
                          </div>
                          {/* Action buttons */}
                          <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                            {existing?.file_url && (
                              <a href={existing.file_url} target="_blank" rel="noreferrer"
                                style={{ padding:'4px 9px', borderRadius:7, background:C.blueD,
                                  border:`1px solid ${C.blue}30`, fontSize:10, color:C.blue,
                                  fontWeight:700, textDecoration:'none' }}>View</a>
                            )}
                            <button onClick={()=>{ setEditingDoc(isEditing ? null : dt.type); setDocValues(p=>({...p,[dt.type]:existing?.doc_value||''})); }}
                              style={{ padding:'4px 9px', borderRadius:7,
                                background: isEditing ? C.yellowD : C.s3,
                                border:`1px solid ${isEditing ? C.yellow+'40' : C.border}`,
                                color: isEditing ? C.yellow : C.gray,
                                fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              {isEditing ? 'Cancel' : hasData ? 'Edit' : 'Add'}
                            </button>
                            {existing && (
                              <button onClick={()=>deleteDoc(existing.id)}
                                style={{ padding:'4px 8px', borderRadius:7, background:C.redD,
                                  border:`1px solid ${C.red}30`, color:C.red,
                                  fontSize:10, fontWeight:700, cursor:'pointer' }}>✕</button>
                            )}
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {isEditing && (
                          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8,
                            padding:'12px', background:C.s3, borderRadius:10, border:`1px solid ${C.border}` }}>
                            {/* Text value input (for all except photo/resume) */}
                            {dt.input !== 'file' && (
                              <div>
                                <div style={{ fontSize:10, color:C.gray, marginBottom:4 }}>
                                  {dt.type === 'aadhaar' ? 'Aadhaar Number' :
                                   dt.type === 'pan' ? 'PAN Number' :
                                   dt.type === 'bank' ? 'Account Details' :
                                   dt.type === 'email' ? 'Email Address' :
                                   dt.type === 'education' ? 'Qualification Details' : 'Value'}
                                </div>
                                <input type={dt.type==='email'?'email':'text'}
                                  placeholder={dt.placeholder} style={inp}
                                  value={currentVal}
                                  onChange={e=>setDocValues(p=>({...p,[dt.type]:e.target.value}))}/>
                              </div>
                            )}
                            {/* File URL input (for all types that support file) */}
                            {dt.input !== 'text' && (
                              <div>
                                <div style={{ fontSize:10, color:C.gray, marginBottom:4 }}>Document URL / Link</div>
                                <input type="url" placeholder="Paste Google Drive / S3 link…" style={inp}
                                  value={existing?.file_url || ''}
                                  onChange={e=>{
                                    // Store temporarily — will be saved on submit
                                    const el = e.target as HTMLInputElement;
                                    el.setAttribute('data-url', e.target.value);
                                  }}/>
                              </div>
                            )}
                            <button onClick={()=>{
                              const fileInput = document.querySelector(`[data-url]`) as HTMLInputElement;
                              const fileUrl = fileInput?.getAttribute('data-url') || existing?.file_url || '';
                              saveDocField(dt.type, dt.label, currentVal, fileUrl);
                            }} disabled={isSaving}
                              style={{ padding:'8px 0', borderRadius:9, border:'none',
                                background:C.green, color:'#000', fontWeight:800, fontSize:12,
                                cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                                display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                              {isSaving ? <Spin/> : '✓ Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Custom docs */}
                  {customDocs.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.8px',
                        textTransform:'uppercase', padding:'10px 0 6px' }}>Additional Documents</div>
                      {customDocs.map((doc, i) => (
                        <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderTop:`1px solid ${C.border}` }}>
                          <div style={{ width:34, height:34, borderRadius:9, background:C.blueD,
                            border:`1px solid ${C.blue}30`, display:'flex', alignItems:'center',
                            justifyContent:'center', fontSize:15, flexShrink:0 }}>📎</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:C.white }}>{doc.doc_label}</div>
                            {doc.doc_value && <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>{doc.doc_value}</div>}
                          </div>
                          <div style={{ display:'flex', gap:5 }}>
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noreferrer"
                                style={{ padding:'4px 9px', borderRadius:7, background:C.blueD,
                                  border:`1px solid ${C.blue}30`, fontSize:10, color:C.blue,
                                  fontWeight:700, textDecoration:'none' }}>View</a>
                            )}
                            <button onClick={()=>deleteDoc(doc.id)}
                              style={{ padding:'4px 8px', borderRadius:7, background:C.redD,
                                border:`1px solid ${C.red}30`, color:C.red,
                                fontSize:10, fontWeight:700, cursor:'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add custom document */}
                  {showAddCustom ? (
                    <div style={{ marginTop:12, padding:'14px', background:C.s3, borderRadius:12,
                      border:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.white }}>Add Custom Document</div>
                      <div>
                        <div style={{ fontSize:10, color:C.gray, marginBottom:4 }}>Document Name *</div>
                        <input placeholder="e.g. Driving Licence, NOC, Medical Certificate…" style={inp}
                          value={customDocLabel} onChange={e=>setCustomDocLabel(e.target.value)}/>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:C.gray, marginBottom:4 }}>Value / Number (optional)</div>
                        <input placeholder="Document number or details…" style={inp}
                          value={customDocValue} onChange={e=>setCustomDocValue(e.target.value)}/>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={()=>{ setShowAddCustom(false); setCustomDocLabel(''); setCustomDocValue(''); }}
                          style={{ flex:1, padding:'8px 0', borderRadius:9, border:`1px solid ${C.border}`,
                            background:'transparent', color:C.gray, fontSize:12, fontWeight:600,
                            cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                        <button onClick={saveCustomDoc} disabled={savingCustom||!customDocLabel.trim()}
                          style={{ flex:1, padding:'8px 0', borderRadius:9, border:'none',
                            background:C.blue, color:'#fff', fontSize:12, fontWeight:700,
                            cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                            display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          {savingCustom ? <Spin/> : '+ Add'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>setShowAddCustom(true)}
                      style={{ width:'100%', marginTop:14, padding:'10px 0', borderRadius:11,
                        border:`1.5px dashed ${C.border}`, background:'transparent',
                        color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer',
                        fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center',
                        justifyContent:'center', gap:6, transition:'all .15s' }}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=C.blue)}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                      + Add Other Document
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── CONVERT TO FE TAB ── */}
          {detailTab === 'convert' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {candidate.converted_user_id ? (
                <div style={{ padding:'16px', background:C.greenD, border:`1px solid ${C.green}28`,
                  borderRadius:12, textAlign:'center' }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.green }}>Already Converted</div>
                  <div style={{ fontSize:12, color:C.gray, marginTop:4 }}>This candidate has been onboarded as a Field Executive.</div>
                </div>
              ) : (
                <>
                  <div style={{ padding:'12px 14px', background:C.greenD, border:`1px solid ${C.green}28`,
                    borderRadius:10, fontSize:12, color:C.green, lineHeight:1.6 }}>
                    Converting <strong>{candidate.name}</strong> will create a Kinematic login account with role <strong>Field Executive</strong> and mark this candidate as onboarded.
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {[
                      { id:'employee_id', label:'Employee ID *',    type:'text', ph:'e.g. FE-003' },
                      { id:'app_password',    label:'App Password *', type:'password', ph:'Min 6 characters' },
                      { id:'joined_date', label:'Joining Date',     type:'date', ph:'' },
                    ].map(f=>(
                      <div key={f.id}>
                        <div style={{ fontSize:11, color:C.gray, marginBottom:5 }}>{f.l}</div>
                        <input type={f.type} placeholder={f.ph} style={inp}
                          value={convertForm[f.id as keyof typeof convertForm]}
                          onChange={e=>setConvertForm(p=>({...p,[f.id]:e.target.value}))}/>
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize:11, color:C.gray, marginBottom:5 }}>Assign Zone</div>
                      <select style={inp} value={convertForm.zone_id} onChange={e=>setConvertForm(p=>({...p,zone_id:e.target.value}))}>
                        <option value="">Select zone…</option>
                        {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {convertErr && (
                    <div style={{ padding:'10px 14px', background:C.redD, border:`1px solid ${C.redB}`,
                      borderRadius:10, fontSize:12, color:C.red }}>{convertErr}</div>
                  )}
                  {convertOk && (
                    <div style={{ padding:'10px 14px', background:C.greenD, border:`1px solid ${C.green}28`,
                      borderRadius:10, fontSize:12, color:C.green }}>✓ Field Executive account created! Closing…</div>
                  )}
                  <button onClick={doConvert} disabled={converting || convertOk}
                    style={{ padding:'12px 0', borderRadius:11, border:'none',
                      background: converting||convertOk ? C.grayd : C.green,
                      color: converting||convertOk ? C.gray : '#000',
                      fontWeight:800, fontSize:14, cursor:'pointer',
                      fontFamily:"'DM Sans',sans-serif",
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {converting ? <><Spin/> Creating account…</> : convertOk ? '✓ Done' : '🚀 Create Field Executive Account'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ATS SECTION
══════════════════════════════════════════════════ */
function ATSSection({ token, zones }:{ token:string; zones:Zone[] }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Candidate|null>(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate|null>(null);
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState('');
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});

  const SOURCES = ['Referral','Walk-in','Naukri','LinkedIn','Indeed','WhatsApp','Instagram','Other'];

  const emptyForm = { name:'', mobile:'', email:'', applied_role:'executive', city:'', source:'', applied_zone:'' };
  const [form, setForm] = useState(emptyForm);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/api/v1/candidates', { headers:{ Authorization:`Bearer ${token}` } });
      setCandidates((r?.data ?? r) || []);
    } catch { setCandidates([]); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);


  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const stageCounts = STAGES.reduce((acc,s)=>{ acc[s.id]=safeCandidates.filter(c=>c.stage===s.id).length; return acc; }, {} as Record<string,number>);

  const filtered = safeCandidates.filter(c=>{
    const matchStage = stageFilter==='all' || c.stage===stageFilter;
    const q = search.toLowerCase();
    const matchSearch = !search || c.name?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.city?.toLowerCase().includes(q);
    return matchStage && matchSearch;
  });

  const validate = (): boolean => {
    const errs: Record<string,string> = {};
    if (!form.name.trim())  errs.name   = 'Full name is required';
    if (!form.mobile.trim()) errs.mobile = 'Mobile number is required';
    else if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) errs.mobile = 'Enter a valid 10-digit Indian mobile number';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (!form.city)   errs.city   = 'Please select a city';
    if (!form.source) errs.source = 'Please select a source';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const doAdd = async () => {
    if (!validate()) return;
    setSaving(true); setSaveErr('');
    try {
      // Mobile duplication check against existing candidates
      const dupCheck = safeCandidates.find(c => c.mobile?.trim() === form.mobile.trim());
      if (dupCheck) {
        setSaveErr(`Mobile ${form.mobile} already exists for candidate "${dupCheck.name}"`);
        setSaving(false); return;
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/candidates`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed');
      setShowAdd(false); setForm(emptyForm); fetchCandidates();
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const openEdit = (c: Candidate) => {
    setEditTarget(c);
    setForm({ name:c.name||'', mobile:c.mobile||'', email:c.email||'', applied_role:c.applied_role||'executive',
      city:c.city||'', source:c.source||'', applied_zone:c.applied_zone||'' });
    setSaveErr(''); setFormErrors({});
    setShowEdit(true);
  };

  const doEdit = async () => {
    if (!editTarget) return;
    if (!form.name.trim()) { setSaveErr('Name is required'); return; }
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile.trim())) { setSaveErr('Enter a valid 10-digit mobile number'); return; }
    // Mobile duplication check (exclude current candidate)
    const dupCheck = safeCandidates.find(c => c.id !== editTarget.id && c.mobile?.trim() === form.mobile.trim());
    if (dupCheck) { setSaveErr(`Mobile ${form.mobile} already used by "${dupCheck.name}"`); return; }
    setSaving(true); setSaveErr('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/candidates/${editTarget.id}`, {
        method:'PATCH',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed');
      setShowEdit(false); setEditTarget(null); fetchCandidates();
    } catch(e:any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
    background:C.s3, color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  return (
    <>
      {/* Pipeline overview */}
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
        {STAGES.map(s=>(
          <div key={s.id} onClick={()=>setStageFilter(stageFilter===s.id?'all':s.id)}
            style={{ flexShrink:0, padding:'12px 16px', borderRadius:14, cursor:'pointer',
              background:stageFilter===s.id?`${s.color}18`:C.s2,
              border:`1px solid ${stageFilter===s.id?s.color:C.border}`,
              textAlign:'center', minWidth:100, transition:'all .15s' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:s.color }}>{stageCounts[s.id]||0}</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10 }}>
        <div style={{ position:'relative', flex:1 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
          <input placeholder="Search candidates…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft:32 }}/>
        </div>
        <button onClick={()=>{ setForm(emptyForm); setSaveErr(''); setFormErrors({}); setShowAdd(true); }}
          style={{ padding:'8px 16px', background:C.red, border:'none', borderRadius:10,
            color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 16px ${C.redB}`, flexShrink:0 }}>
          + Add Candidate
        </button>
      </div>

      {/* Candidate list */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><Spin/></div>
      ) : filtered.length === 0 ? (
        <Card><div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>
          No candidates{stageFilter!=='all'?` in ${stageFilter}`:''}{search?` matching "${search}"`:''}</div></Card>
      ) : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1.2fr 1fr 76px',
            gap:8, padding:'10px 18px', borderBottom:`1px solid ${C.border}`,
            fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase' }}>
            {['Candidate','Role','City','Source','Stage',''].map(h=><span key={h}>{h}</span>)}
          </div>
          {filtered.map((c,i)=>(
            <div key={c.id} className="km-tr"
              style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1.2fr 1fr 76px',
                gap:8, padding:'13px 18px', alignItems:'center', cursor:'default',
                borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none', transition:'background .13s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Avatar name={c.name} size={30}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{c.name}</div>
                  <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{c.mobile||'—'}</div>
                </div>
              </div>
              <span style={{ fontSize:12, color:C.gray, textTransform:'capitalize' }}>{c.applied_role}</span>
              <span style={{ fontSize:12, color:C.gray }}>{c.city||'—'}</span>
              <span style={{ fontSize:12, color:C.gray }}>{c.source||'—'}</span>
              <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                background:`${stageColor(c.stage)}15`, color:stageColor(c.stage) }}>
                {STAGES.find(s=>s.id===c.stage)?.label}
              </span>
              <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                <button title="View details" onClick={()=>setSelected(c)}
                  style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.blue}40`,
                    background:C.blueD, cursor:'pointer', fontSize:14,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  👁
                </button>
                <button title="Edit candidate" onClick={e=>{ e.stopPropagation(); openEdit(c); }}
                  style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
                    background:C.s3, cursor:'pointer', fontSize:14,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  ✏️
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div style={{ fontSize:12, color:C.grayd, textAlign:'right' }}>{filtered.length} of {safeCandidates.length} candidates</div>

      {/* Add Candidate Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20, padding:28,
            width:'100%', maxWidth:520, boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-fadein .2s ease' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:20 }}>Add Candidate</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>

              {/* Name - full width */}
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Full Name <span style={{ color:C.red }}>*</span></div>
                <input type="text" style={{ ...inputStyle, borderColor:formErrors.name ? C.red : C.border }}
                  placeholder="Enter full name"
                  value={form.name}
                  onChange={e=>{ setForm(p=>({...p,name:e.target.value})); setFormErrors(p=>({...p,name:''})); }}/>
                {formErrors.name && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrors.name}</div>}
              </div>

              {/* Mobile */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Mobile <span style={{ color:C.red }}>*</span></div>
                <input type="tel" style={{ ...inputStyle, borderColor:formErrors.mobile ? C.red : C.border }}
                  placeholder="10-digit number" maxLength={10}
                  value={form.mobile}
                  onChange={e=>{ setForm(p=>({...p,mobile:e.target.value.replace(/\D/g,'').slice(0,10)})); setFormErrors(p=>({...p,mobile:''})); }}/>
                {formErrors.mobile && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrors.mobile}</div>}
              </div>

              {/* Email */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Email</div>
                <input type="email" style={{ ...inputStyle, borderColor:formErrors.email ? C.red : C.border }}
                  placeholder="Optional"
                  value={form.email}
                  onChange={e=>{ setForm(p=>({...p,email:e.target.value})); setFormErrors(p=>({...p,email:''})); }}/>
                {formErrors.email && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrors.email}</div>}
              </div>

              {/* City — dropdown */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>City <span style={{ color:C.red }}>*</span></div>
                <CitySelect
                  value={form.city}
                  onChange={(v) => { setForm(p=>({...p,city:v})); setFormErrors(p=>({...p,city:''})); }}
                  placeholder="Select city…"
                />
                {formErrors.city && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrors.city}</div>}
              </div>

              {/* Source — dropdown */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Source <span style={{ color:C.red }}>*</span></div>
                <select style={{ ...inputStyle, borderColor:formErrors.source ? C.red : C.border }}
                  value={form.source}
                  onChange={e=>{ setForm(p=>({...p,source:e.target.value})); setFormErrors(p=>({...p,source:''})); }}>
                  <option value="">Select source…</option>
                  {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                {formErrors.source && <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {formErrors.source}</div>}
              </div>

              {/* Applying For */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Applying For</div>
                <select style={inputStyle} value={form.applied_role} onChange={e=>setForm(p=>({...p,applied_role:e.target.value}))}>
                  <option value="executive">Field Executive</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>

              {/* Preferred Zone */}
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Preferred Zone</div>
                <select style={inputStyle} value={form.applied_zone} onChange={e=>setForm(p=>({...p,applied_zone:e.target.value}))}>
                  <option value="">Select zone…</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            </div>
            {saveErr && <div style={{ marginBottom:12, padding:'10px 14px', background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, fontSize:13, color:C.red }}>{saveErr}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>{ setShowAdd(false); setFormErrors({}); }}
                style={{ flex:1, padding:'10px', borderRadius:11, border:`1px solid ${C.border}`, background:'transparent', color:C.gray, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={doAdd} disabled={saving}
                style={{ flex:1, padding:'10px', borderRadius:11, border:'none', background:C.red, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {saving ? <Spin/> : '+ Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Modal */}
      {showEdit && editTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e=>e.target===e.currentTarget&&setShowEdit(false)}>
          <div style={{ background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20, padding:28,
            width:'100%', maxWidth:520, boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-fadein .2s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Edit Candidate</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{editTarget.name}</div>
              </div>
              <button onClick={()=>setShowEdit(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Full Name <span style={{ color:C.red }}>*</span></div>
                <input type="text" style={inputStyle} placeholder="Full name" value={form.name}
                  onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Mobile</div>
                <input type="tel" style={inputStyle} placeholder="10-digit number" maxLength={10}
                  value={form.mobile} onChange={e=>setForm(p=>({...p,mobile:e.target.value.replace(/\D/g,'').slice(0,10)}))}/>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Email</div>
                <input type="email" style={inputStyle} placeholder="Optional" value={form.email}
                  onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>City</div>
                <CitySelect
                  value={form.city}
                  onChange={(v) => setForm(p=>({...p,city:v}))}
                  placeholder="Select city…"
                />
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Source</div>
                <select style={inputStyle} value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))}>
                  <option value="">Select source…</option>
                  {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Applying For</div>
                <select style={inputStyle} value={form.applied_role} onChange={e=>setForm(p=>({...p,applied_role:e.target.value}))}>
                  <option value="executive">Field Executive</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Preferred Zone</div>
                <select style={inputStyle} value={form.applied_zone} onChange={e=>setForm(p=>({...p,applied_zone:e.target.value}))}>
                  <option value="">Select zone…</option>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            </div>
            {saveErr && <div style={{ marginBottom:12, padding:'10px 14px', background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, fontSize:13, color:C.red }}>{saveErr}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setShowEdit(false)}
                style={{ flex:1, padding:'10px', borderRadius:11, border:`1px solid ${C.border}`, background:'transparent', color:C.gray, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={doEdit} disabled={saving}
                style={{ flex:1, padding:'10px', borderRadius:11, border:'none', background:C.red, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {saving ? <Spin/> : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate detail panel */}
      {selected && (
        <CandidateDetail
          candidate={selected}
          zones={zones}
          token={token}
          onClose={()=>setSelected(null)}
          onRefresh={fetchCandidates}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════
   TEAM SECTION (users)
══════════════════════════════════════════════════ */
function TeamSection({ users, zones, loading, error, onRefresh, token }:{
  users:HRUser[]; zones:Zone[]; loading:boolean; error:string|null; onRefresh:()=>void; token:string;
}) {
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd]   = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [selUser, setSelUser]   = useState<HRUser|null>(null);
  const emptyForm = { name:'', mobile:'', email:'', role:'executive', employee_id:'', city:'', zone_id:'', password:'', joined_date:'' };
  const [form, setForm] = useState(emptyForm);
  const [newPass, setNewPass]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string|null>(null);
  const [saveOk, setSaveOk]     = useState(false);

  const roleColor: Record<string,string> = { executive:C.blue, admin:C.red, supervisor:C.teal, program_manager:C.purple, city_manager:C.orange };

  const filtered = users.filter(u=>{
    const matchRole = roleFilter==='all' || u.role===roleFilter;
    const q = search.toLowerCase();
    const matchSearch = !search || u.name?.toLowerCase().includes(q) || u.employee_id?.toLowerCase().includes(q) || u.mobile?.includes(q);
    return matchRole && matchSearch;
  });

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
    background:C.s3, color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  const doAdd = async () => {
    if (!form.mobile || !/^\d{10}$/.test(form.mobile)) { setSaveErr('Enter a valid 10-digit mobile number'); return; }
    // Mobile duplication check
    const dupUser = users.find(u => u.mobile?.trim() === form.mobile.trim());
    if (dupUser) { setSaveErr(`Mobile ${form.mobile} is already used by "${dupUser.name}"`); return; }
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed');
      setSaveOk(true);
      setTimeout(()=>{ setSaveOk(false); setShowAdd(false); setForm(emptyForm); onRefresh(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); } finally { setSaving(false); }
  };

  const doEdit = async () => {
    if (!selUser) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${selUser.id}`, {
        method:'PATCH', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed');
      setSaveOk(true);
      setTimeout(()=>{ setSaveOk(false); setShowEdit(false); setSelUser(null); onRefresh(); }, 1400);
    } catch(e:any) { setSaveErr(e.message); } finally { setSaving(false); }
  };

  const doReset = async () => {
    if (!selUser || newPass.length < 6) { setSaveErr('Min 6 characters'); return; }
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${selUser.id}/reset-password`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ password: newPass }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed');
      setSaveOk(true);
      setTimeout(()=>{ setSaveOk(false); setShowReset(false); }, 1400);
    } catch(e:any) { setSaveErr(e.message); } finally { setSaving(false); }
  };

  const toggleActive = async (u:HRUser) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${u.id}`, {
        method:'PATCH', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      onRefresh();
    } catch {}
  };

  const openEdit = (u:HRUser) => {
    setSelUser(u);
    setForm({ name:u.name||'', mobile:u.mobile||'', email:u.email||'', role:u.role||'executive',
      employee_id:u.employee_id||'', city:u.city||'', zone_id:u.zone_id||'', password:'', joined_date:u.joined_date||'' });
    setSaveErr(null); setSaveOk(false); setShowEdit(true);
  };

  const FField = (id:keyof typeof emptyForm, label:string, type='text', opts?:{v:string;l:string}[]) => (
    <div key={id}>
      <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>{label}</div>
      {opts ? (
        <select style={inputStyle} value={form[id]} onChange={e=>setForm(p=>({...p,[id]:e.target.value}))}>
          <option value="">Select…</option>
          {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={type} placeholder={label} style={inputStyle}
          value={form[id]} onChange={e=>setForm(p=>({...p,[id]:e.target.value}))}/>
      )}
    </div>
  );

  const modalOverlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 };
  const modalBox: React.CSSProperties = { background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20, padding:28, width:'100%', maxWidth:540, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-fadein .2s ease' };
  const btnPrimary: React.CSSProperties = { flex:1, padding:'10px 0', borderRadius:11, border:'none', background:C.red, color:'#fff', fontWeight:700, fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 };
  const btnSecondary: React.CSSProperties = { flex:1, padding:'10px 0', borderRadius:11, border:`1px solid ${C.border}`, background:'transparent', color:C.gray, fontWeight:600, fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' };

  return (
    <>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
          <input placeholder="Search by name, ID, mobile…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft:32 }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {['all','executive','admin','supervisor'].map(r=>(
            <button key={r} onClick={()=>setRoleFilter(r)}
              style={{ padding:'6px 13px', borderRadius:8, border:`1px solid ${roleFilter===r?C.blue:C.border}`,
                background:roleFilter===r?C.blueD:C.s3, color:roleFilter===r?C.blue:C.gray,
                fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {r==='all'?'All':r.charAt(0).toUpperCase()+r.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={()=>{ setForm(emptyForm); setSaveErr(null); setSaveOk(false); setShowAdd(true); }}
          style={{ padding:'8px 16px', background:C.red, border:'none', borderRadius:10, color:'#fff',
            fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 16px ${C.redB}` }}>
          + Add User
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><Spin/></div>
      ) : error ? (
        <Card style={{ background:C.redD, border:`1px solid ${C.redB}` }}>
          <div style={{ color:C.red, fontWeight:700, marginBottom:6 }}>Failed to load users</div>
          <div style={{ fontSize:13, color:C.gray, marginBottom:12 }}>{error}</div>
          <button onClick={onRefresh} style={{ ...btnSecondary, flex:'unset', padding:'7px 14px', fontSize:12 }}>Retry</button>
        </Card>
      ) : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1.4fr 1.2fr 1fr 110px',
            gap:8, padding:'10px 18px', borderBottom:`1px solid ${C.border}`,
            fontSize:10, color:C.grayd, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase' }}>
            {['Name / ID','Role','Mobile','Zone / City','Status','Actions'].map(h=><span key={h}>{h}</span>)}
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>No users found</div>
          ) : filtered.map((u,i)=>(
            <div key={u.id} className="km-tr"
              style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1.4fr 1.2fr 1fr 110px',
                gap:8, padding:'13px 18px', alignItems:'center',
                borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none', transition:'background .13s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Avatar name={u.name} size={30}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{u.name}</div>
                  <div style={{ fontSize:10, color:C.grayd, fontFamily:'monospace', marginTop:1 }}>{u.employee_id||'—'}</div>
                </div>
              </div>
              <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:20, background:`${roleColor[u.role]||C.blue}15`, color:roleColor[u.role]||C.blue, fontSize:11, fontWeight:700, textTransform:'capitalize' }}>{u.role}</span>
              <span style={{ fontSize:12, color:C.gray, fontFamily:'monospace' }}>{u.mobile||'—'}</span>
              <span style={{ fontSize:12, color:C.gray }}>{zones.find(z=>z.id===u.zone_id)?.name||u.city||'—'}</span>
              <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:20, background:u.is_active!==false?C.greenD:C.redD, color:u.is_active!==false?C.green:C.red, fontSize:11, fontWeight:700 }}>
                {u.is_active!==false?'Active':'Inactive'}
              </span>
              <div style={{ display:'flex', gap:4 }}>
                {[
                  { title:'Edit', icon:'✏️', fn:()=>openEdit(u) },
                  { title:'Reset password', icon:'🔑', fn:()=>{ setSelUser(u); setNewPass(''); setSaveErr(null); setSaveOk(false); setShowReset(true); } },
                  { title:u.is_active!==false?'Deactivate':'Activate', icon:u.is_active!==false?'⏸':'▶️', fn:()=>toggleActive(u) },
                ].map(a=>(
                  <button key={a.title} title={a.title} onClick={a.fn}
                    style={{ width:28, height:28, borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
                    onMouseEnter={e=>(e.currentTarget.style.background=C.s3)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Add User Modal */}
      {showAdd && (
        <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div style={modalBox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Add New User</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {FField('name','Full Name')}
              {FField('mobile','Mobile Number','tel')}
              {FField('email','Email (optional)','email')}
              {FField('password','Password','password')}
              {FField('role','Role','text',[{v:'executive',l:'Field Executive'},{v:'supervisor',l:'Supervisor'},{v:'admin',l:'Admin'},{v:'program_manager',l:'Program Manager'},{v:'city_manager',l:'City Manager'}])}
              {FField('employee_id','Employee ID (e.g. FE-003)')}
              {FField('city','City')}
              {FField('zone_id','Zone','text',zones.map(z=>({v:z.id,l:z.name})))}
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Date Joined</div>
                <input type="date" style={inputStyle} value={form.joined_date} onChange={e=>setForm(p=>({...p,joined_date:e.target.value}))}/>
              </div>
            </div>
            {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ User created!</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button style={btnSecondary} onClick={()=>setShowAdd(false)}>Cancel</button>
              <button style={btnPrimary} onClick={doAdd} disabled={saving||!form.name||!form.mobile}>{saving?<Spin/>:'+ Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEdit && selUser && (
        <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowEdit(false)}>
          <div style={modalBox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Edit User</div><div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{selUser.name}</div></div>
              <button onClick={()=>setShowEdit(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {FField('name','Full Name')}
              {FField('mobile','Mobile Number','tel')}
              {FField('email','Email','email')}
              {FField('role','Role','text',[{v:'executive',l:'Field Executive'},{v:'supervisor',l:'Supervisor'},{v:'admin',l:'Admin'},{v:'program_manager',l:'Program Manager'},{v:'city_manager',l:'City Manager'}])}
              {FField('employee_id','Employee ID')}
              {FField('city','City')}
              {FField('zone_id','Zone','text',zones.map(z=>({v:z.id,l:z.name})))}
            </div>
            {saveErr && <div style={{ marginTop:14, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:14, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Saved!</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button style={btnSecondary} onClick={()=>setShowEdit(false)}>Cancel</button>
              <button style={btnPrimary} onClick={doEdit} disabled={saving||!form.name||!form.mobile}>{saving?<Spin/>:'✓ Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showReset && selUser && (
        <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowReset(false)}>
          <div style={{ ...modalBox, maxWidth:380 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Reset Password</div><div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{selUser.name}</div></div>
              <button onClick={()=>setShowReset(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            <div style={{ display:'flex', gap:10, padding:'11px 14px', background:C.yellowD, border:`1px solid ${C.yellow}28`, borderRadius:10, marginBottom:16 }}>
              <span style={{ fontSize:13 }}>⚠️</span>
              <span style={{ fontSize:12, color:C.yellow, lineHeight:1.5 }}>User must log in with this new password immediately.</span>
            </div>
            <div>
              <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>New Password (min. 6 characters)</div>
              <input type="password" placeholder="Enter new password…" style={inputStyle} value={newPass} onChange={e=>setNewPass(e.target.value)}/>
            </div>
            {saveErr && <div style={{ marginTop:12, background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red }}>{saveErr}</div>}
            {saveOk  && <div style={{ marginTop:12, background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.green }}>✓ Password reset!</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button style={btnSecondary} onClick={()=>setShowReset(false)}>Cancel</button>
              <button style={btnPrimary} onClick={doReset} disabled={saving||!newPass}>{saving?<Spin/>:'🔑 Reset Password'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════
   TRAINING SECTION
══════════════════════════════════════════════════ */
function TrainingSection({ token }:{ token:string }) {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading]  = useState(false);
  const [uploadErr, setUploadErr]  = useState('');
  const [uploadOk, setUploadOk]    = useState(false);
  const [form, setForm] = useState({ title:'', category:'', type:'document', visible_to:'all', description:'' });

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/api/v1/learning', { headers:{ Authorization:`Bearer ${token}` } });
      setMaterials((r?.data ?? r) || []);
    } catch { setMaterials([]); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const doUpload = async () => {
    const fileInput = document.getElementById('training-file-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!form.title) { setUploadErr('Title is required'); return; }
    if (!form.type)  { setUploadErr('Type is required'); return; }
    if (!file) { setUploadErr('Please select a file'); return; }
    setUploading(true); setUploadErr(''); setUploadOk(false);
    try {
      // Step 1: upload file to storage
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/material`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}` },
        body: fd,
      });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson.error || upJson.message || 'File upload failed');
      const fileUrl: string = upJson.data?.url;
      if (!fileUrl) throw new Error('No URL returned from upload');

      // Step 2: create learning material record
      const targetRoles = form.visible_to === 'all'
        ? ['executive','supervisor','admin','city_manager','super_admin']
        : [form.visible_to];
      const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/learning`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          file_url: fileUrl,
          category: form.category || undefined,
          description: form.description || undefined,
          target_roles: targetRoles,
          is_mandatory: false,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error || createJson.message || 'Failed to save material');
      setUploadOk(true);
      setTimeout(()=>{ setUploadOk(false); setShowUpload(false); setForm({ title:'', category:'', type:'document', visible_to:'all', description:'' }); fetchMaterials(); }, 1600);
    } catch(e:any) { setUploadErr(e.message); }
    finally { setUploading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
    background:C.s3, color:C.white, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  const typeIcon = (t?:string) => t==='video'||t==='Video'?'▶':'📄';
  const typeColor = (t?:string) => t==='video'||t==='Video'?C.red:C.blue;

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <SectionHeader title="Training Materials" sub="All uploaded learning content"/>
        <button onClick={()=>{ setForm({ title:'', category:'', visible_to:'all', description:'' }); setUploadErr(''); setUploadOk(false); setShowUpload(true); }}
          style={{ padding:'8px 14px', background:C.red, border:'none', borderRadius:10, color:'#fff',
            fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 12px ${C.redB}` }}>
          + Upload Material
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{[...Array(4)].map((_,i)=><Shimmer key={i} h={56} br={12}/>)}</div>
      ) : materials.length === 0 ? (
        <Card><div style={{ textAlign:'center', padding:'32px 0', color:C.grayd, fontSize:13 }}>No materials uploaded yet</div></Card>
      ) : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          {materials.map((m,i)=>(
            <div key={m.id||i} style={{ display:'flex', gap:14, padding:'16px 20px', borderBottom:i<materials.length-1?`1px solid ${C.border}`:'none', alignItems:'center' }}>
              <div style={{ width:44, height:44, borderRadius:13, background:`${typeColor(m.material_type||m.type)}18`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                {typeIcon(m.material_type||m.type)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.white, marginBottom:3 }}>{m.title}</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {m.category && <span style={{ fontSize:10, color:C.gray, padding:'2px 8px', borderRadius:6, background:C.s3 }}>{m.category}</span>}
                  {m.visible_to && <span style={{ fontSize:10, color:C.gray }}>Visible to: {m.visible_to}</span>}
                  {m.view_count != null && <span style={{ fontSize:10, color:C.grayd }}>{m.view_count} views</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                  background:`${typeColor(m.material_type||m.type)}18`, color:typeColor(m.material_type||m.type) }}>
                  {m.material_type||m.type||'PDF'}
                </span>
                {m.file_url && (
                  <a href={m.file_url} target="_blank" rel="noreferrer"
                    style={{ padding:'4px 10px', borderRadius:8, background:C.blueD, border:`1px solid ${C.blue}30`,
                      fontSize:11, color:C.blue, fontWeight:700, textDecoration:'none' }}>
                    View
                  </a>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e=>e.target===e.currentTarget&&setShowUpload(false)}>
          <div style={{ background:C.s2, border:`1px solid ${C.borderL}`, borderRadius:20, padding:28,
            width:'100%', maxWidth:500, boxShadow:'0 32px 80px rgba(0,0,0,.8)', animation:'km-fadein .2s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800 }}>Upload Training Material</div>
              <button onClick={()=>setShowUpload(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:C.gray, fontSize:16 }}>×</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Title *</div>
                <input placeholder="e.g. Product Training Module 1" style={inputStyle}
                  value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Type *</div>
                  <select style={inputStyle} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                    <option value="document">Document</option>
                    <option value="pdf">PDF</option>
                    <option value="video">Video</option>
                    <option value="slides">Slides</option>
                    <option value="link">Link</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Category</div>
                  <select style={inputStyle} value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                    <option value="">Select…</option>
                    <option value="Product">Product</option>
                    <option value="Operations">Operations</option>
                    <option value="Skills">Skills</option>
                    <option value="Safety">Safety</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Visible To</div>
                <select style={inputStyle} value={form.visible_to} onChange={e=>setForm(p=>({...p,visible_to:e.target.value}))}>
                  <option value="all">All</option>
                  <option value="executive">Field Executives</option>
                  <option value="supervisor">Supervisors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>Description (optional)</div>
                <textarea rows={2} placeholder="Brief description…" style={{ ...inputStyle, resize:'none' }}
                  value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/>
              </div>
              <div>
                <div style={{ fontSize:12, color:C.gray, marginBottom:5 }}>File (PDF, MP4, PPT, etc.) *</div>
                <input id="training-file-input" type="file" accept=".pdf,.mp4,.ppt,.pptx,.docx,.jpg,.png"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
                    background:C.s3, color:C.gray, fontSize:13, fontFamily:"'DM Sans',sans-serif",
                    cursor:'pointer', colorScheme:'dark' as any }}/>
              </div>
            </div>
            {uploadErr && <div style={{ marginBottom:12, padding:'10px 14px', background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10, fontSize:13, color:C.red }}>{uploadErr}</div>}
            {uploadOk  && <div style={{ marginBottom:12, padding:'10px 14px', background:C.greenD, border:`1px solid ${C.green}28`, borderRadius:10, fontSize:13, color:C.green }}>✓ Uploaded successfully!</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setShowUpload(false)}
                style={{ flex:1, padding:'10px', borderRadius:11, border:`1px solid ${C.border}`, background:'transparent', color:C.gray, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center' }}>
                Cancel
              </button>
              <button onClick={doUpload} disabled={uploading}
                style={{ flex:1, padding:'10px', borderRadius:11, border:'none', background:C.red, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {uploading ? <Spin/> : '↑ Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════
   MAIN HR PAGE
══════════════════════════════════════════════════ */
export default function HRPage() {
  const [tab, setTab] = useState<'team'|'ats'|'training'>('team');
  const [users, setUsers] = useState<HRUser[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';

  const executives  = users.filter(u=>u.role==='executive');
  const activeUsers = users.filter(u=>u.is_active!==false);
  const admins      = users.filter(u=>u.role==='admin');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const headers = { Authorization:`Bearer ${token}` };
      const [uRes, zRes] = await Promise.allSettled([
        api.get<any>('/api/v1/users',  { headers }),
        api.get<any>('/api/v1/zones', { headers }),
      ]);
      if (uRes.status==='fulfilled') setUsers((uRes.value?.data??uRes.value)||[]);
      if (zRes.status==='fulfilled') setZones((zRes.value?.data??zRes.value)||[]);
    } catch(e:any) { setError(e?.message||'Failed to load'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <>
      <style>{`
        @keyframes km-shimmer  { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes km-fadein   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes km-slidein  { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes kspin       { to{transform:rotate(360deg)} }
        .km-tr:hover { background:${C.s3} !important; }
        .kbtn:hover  { opacity:.82; }
        .kbtn:active { transform:scale(.97); }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:22, animation:'km-fadein .3s ease' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              HR & Recruitment
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>Team management, hiring pipeline & training</div>
          </div>
          <button onClick={fetchAll}
            style={{ padding:'8px 14px', background:C.s3, border:`1px solid ${C.border}`, borderRadius:10,
              color:C.gray, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              display:'flex', alignItems:'center', gap:6 }}>
            ↺ Refresh
          </button>
        </div>

        {/* KPI row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total Users',      value:users.length,       color:C.blue,  sub:'All roles' },
            { label:'Field Executives', value:executives.length,  color:C.blue,  sub:'In field ops' },
            { label:'Active',           value:activeUsers.length, color:C.green, sub:'is_active = true' },
            { label:'Admins',           value:admins.length,      color:C.red,   sub:'System access' },
          ].map((k,i)=><StatCard key={i} {...k} loading={loading}/>)}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}` }}>
          {([
            { id:'team',     label:'👥 Team Directory' },
            { id:'ats',      label:'🎯 Hiring Pipeline (ATS)' },
            { id:'training', label:'📚 Training & Docs' },
          ] as const).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ padding:'10px 22px', background:'transparent', border:'none',
                borderBottom: tab===t.id?`2px solid ${C.red}`:'2px solid transparent',
                color: tab===t.id?C.red:C.gray,
                fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:13,
                cursor:'pointer', marginBottom:-1, transition:'all .2s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab==='team' && (
          <TeamSection users={users} zones={zones} loading={loading} error={error} onRefresh={fetchAll} token={token}/>
        )}
        {tab==='ats' && (
          <ATSSection token={token} zones={zones}/>
        )}
        {tab==='training' && (
          <TrainingSection token={token}/>
        )}

      </div>
    </>
  );
}
