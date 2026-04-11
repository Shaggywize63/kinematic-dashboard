'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { extractImageUrls } from '../../../lib/utils';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45',white:'#FFFFFF' };

interface Submission {
  id: string;
  submitted_at: string;
  is_converted: boolean;
  outlet_name?: string;
  user_id: string;
  activity_id?: string;
  users?: { name: string; employee_id: string };
  activities?: { name: string };
  form_templates?: { name: string };
  checkin_photo?: string;
  check_in_at?: string;
  check_out_at?: string;
  check_in_gps?: string;
  check_out_gps?: string;
}

interface PaginatedResult {
  data: Submission[];
  total: number;
  page: number;
  limit: number;
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (filter === 'tff') params.is_tff = 'true';
      if (filter === 'non_tff') params.is_tff = 'false';
      const qs = new URLSearchParams(params).toString();
      const res = await api.get<PaginatedResult>(`/api/v1/builder/forms/admin/submissions?${qs}`);
      const d = res as any;
      setSubmissions(d.data || d.submissions || (Array.isArray(d) ? d : []));
      setTotal(d.total || d.count || 0);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const viewDetails = async (s: Submission) => {
    setSelected(s);
    setLoadingDetails(true);
    setDetails(null);
    try {
      const res = await api.get<any>(`/api/v1/forms/submissions/${s.id}`);
      setDetails(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const tffCount = submissions.filter(s => s.is_converted).length;
  const nonTff = submissions.filter(s => !s.is_converted).length;

  const renderValue = (r: any) => {
    // Support both old and new backend metadata naming
    const field = r.form_fields || r.builder_questions;
    const qt = (field?.qtype || field?.field_type || '').toLowerCase();
    const val = r.value_text || r.value_number || r.value_bool || r.value_json;

    if (qt === 'image' || qt === 'photo' || qt === 'camera' || r.photo_url) {
      const src = r.photo_url || val;
      const urls = extractImageUrls(src);
      if (urls.length === 0) return '—';
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {urls.map((url, i) => (
            <img key={i} src={url} alt="Submission" style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: 12, border: `1px solid ${C.border}`, cursor: 'pointer' }} 
                 onClick={() => window.open(url, '_blank')} />
          ))}
        </div>
      );
    }
    if (qt === 'signature') {
      const urls = extractImageUrls(val);
      if (urls.length === 0) return '—';
      return (
        <div style={{ marginTop: 8, background: '#fff', borderRadius: 8, padding: 4, display: 'flex', gap: '8px' }}>
          {urls.map((url, i) => (
            <img key={i} src={url} alt="Signature" style={{ maxWidth: '100%', height: 60, objectFit: 'contain' }} />
          ))}
        </div>
      );
    }
    if (qt === 'yes_no') {
      const isYes = String(val).toLowerCase() === 'yes' || val === true;
      return (
        <span style={{ color: isYes ? C.green : C.red, fontWeight: 700 }}>
          {isYes ? '✓ Yes' : '✕ No'}
        </span>
      );
    }
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return String(val ?? '—');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>TFF Submissions</div>
          <div style={{ fontSize:13, color:C.gray, marginTop:3 }}>Total forms filled</div>
        </div>
        <button onClick={fetchData} style={{ padding:'9px 16px', background:C.red, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {[
          { l:'Total Submissions', v:total, c:C.blue },
          { l:'Effective (TFF)', v:tffCount, c:C.green },
          { l:'Non-TFF', v:nonTff, c:C.gray },
        ].map((s, i) => (
          <div key={i} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:6 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
        {/* Filters */}
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:8 }}>
          {[['all','All'],['tff','TFF Only'],['non_tff','Non-TFF']].map(([f, l]) => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              style={{ padding:'7px 14px', borderRadius:9, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
                background: filter===f ? C.red : C.s2, borderColor: filter===f ? C.red : C.border, color: filter===f ? '#fff' : C.gray }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>No submissions found</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  {['FE Name','Outlet','Template','Activity','TFF','Time','Duration','Details'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}40` }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600 }}>{s.users?.name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:C.gray }}>{s.outlet_name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:C.gray }}>{s.form_templates?.name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:C.gray }}>{s.activities?.name || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                        background: s.is_converted ? 'rgba(0,217,126,0.12)' : 'rgba(122,139,160,0.1)',
                        color: s.is_converted ? C.green : C.gray }}>
                        {s.is_converted ? 'TFF' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:C.grayd }}>
                      {new Date(s.submitted_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:C.green, fontWeight:700 }}>
                      {(() => {
                        if (!s.check_in_at || !s.check_out_at) return '—';
                        const start = new Date(s.check_in_at).getTime();
                        const end = new Date(s.check_out_at).getTime();
                        const diff = Math.floor((end - start) / 1000);
                        if (diff <= 0) return '—';
                        const m = Math.floor(diff / 60);
                        const sec = diff % 60;
                        return `${m}m ${sec}s`;
                      })()}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <button onClick={() => viewDetails(s)}
                        style={{ fontSize:12, color:C.blue, background:'none', border:'none', cursor:'pointer', fontFamily:"DM Sans,sans-serif", fontWeight:600 }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div style={{ padding:'12px 18px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:C.grayd }}>Page {page} · {total} total</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                style={{ padding:'6px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.gray, cursor:'pointer', opacity:page===1?0.4:1 }}>
                Previous
              </button>
              <button onClick={() => setPage(p => p+1)} disabled={page*limit >= total}
                style={{ padding:'6px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.gray, cursor:'pointer', opacity:page*limit>=total?0.4:1 }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter: 'blur(4px)' }}>
          <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:24, width:'100%', maxWidth:540, maxHeight:'90vh', overflowY:'auto', padding:0, position:'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.border}`, position:'sticky', top:0, background:'#0E1420', zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
               <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, margin:0 }}>Submission Details</h3>
               <button onClick={() => setSelected(null)}
                style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:18 }}>✕</button>
            </div>
            
            <div style={{ padding: 28 }}>
              {/* Info Grid */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:32 }}>
                {[
                  ['FE Name', selected.users?.name],
                  ['Outlet', (selected as any).store_name || selected.outlet_name],
                  ['Form', selected.form_templates?.name],
                  ['Timestamp', new Date(selected.submitted_at).toLocaleString('en-IN')],
                  ['Check-in', selected.check_in_at ? new Date(selected.check_in_at).toLocaleTimeString('en-IN') : '—'],
                  ['Check-out', selected.check_out_at ? new Date(selected.check_out_at).toLocaleTimeString('en-IN') : '—'],
                ].map(([k,v]) => (
                  <div key={String(k)}>
                    <div style={{ fontSize:11, color:C.gray, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{String(k)}</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{String(v || '—')}</div>
                  </div>
                ))}
              </div>

              {selected.check_in_at && selected.check_out_at && (
                <div style={{ marginBottom: 32, padding: '14px 20px', background: 'rgba(0,217,126,0.06)', border: `1px solid ${C.green}30`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.green, fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Activity Session Duration</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: "'Syne', sans-serif" }}>
                      {(() => {
                        const start = new Date(selected.check_in_at).getTime();
                        const end = new Date(selected.check_out_at).getTime();
                        const diff = Math.floor((end - start) / 1000);
                        const h = Math.floor(diff / 3600);
                        const m = Math.floor((diff % 3600) / 60);
                        const s = diff % 60;
                        return `${h ? h+'h ' : ''}${m ? m+'m ' : ''}${s}s`;
                      })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selected.check_in_gps && (
                      <a href={`https://www.google.com/maps?q=${selected.check_in_gps}`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.blue, borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>📍 In</a>
                    )}
                    {selected.check_out_gps && (
                      <a href={`https://www.google.com/maps?q=${selected.check_out_gps}`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.blue, borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>📍 Out</a>
                    )}
                  </div>
                </div>
              )}

               /* Check-in Details removed as per simplified UI requirements */
              <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: 24 }}>
                <h4 style={{ fontSize:15, fontWeight:800, marginBottom:16, color:C.blue }}>Form Responses</h4>
                {loadingDetails ? (
                  <div style={{ padding: 20, textAlign:'center', color:C.grayd }}>Loading responses...</div>
                ) : details?.form_responses?.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                    {details.form_responses.map((r: any, idx: number) => (
                      <div key={idx} style={{ background: C.s2, padding: 16, borderRadius: 12, border: `1px solid ${C.border}80` }}>
                        <div style={{ display:'flex', gap:10, marginBottom:8 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:C.gray }}>{idx + 1}.</span>
                          <span style={{ fontSize:14, fontWeight:700, color:C.white }}>{r.form_fields?.label || r.field_key}</span>
                        </div>
                        <div style={{ paddingLeft: 22, fontSize:14 }}>
                          {renderValue(r)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 20, textAlign:'center', color:C.grayd }}>No responses found for this submission</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
