'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = { red:'#E01E2C',green:'#00D97E',yellow:'#FFB800',blue:'#3E9EFF',purple:'#9B6EFF',gray:'#7A8BA0',grayd:'#2E445E',s2:'#131B2A',border:'#1E2D45' };

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
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (filter === 'ecc') params.is_ecc = 'true';
      if (filter === 'non_ecc') params.is_ecc = 'false';
      // FIXED: correct endpoint is /api/v1/builder/forms/admin/submissions
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

  const ecc = submissions.filter(s => s.is_converted).length;
  const nonEcc = submissions.filter(s => !s.is_converted).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>CC Submissions</div>
          <div style={{ fontSize:13, color:C.gray, marginTop:3 }}>Consumer contact form submissions</div>
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
          { l:'Effective (ECC)', v:ecc, c:C.green },
          { l:'Non-ECC', v:nonEcc, c:C.gray },
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
          {[['all','All'],['ecc','ECC Only'],['non_ecc','Non-ECC']].map(([f, l]) => (
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
                  {['FE Name','Outlet','Template','Activity','ECC','Time','Details'].map(h => (
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
                        {s.is_converted ? 'ECC' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:C.grayd }}>
                      {new Date(s.submitted_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <button onClick={() => setSelected(s)}
                        style={{ fontSize:12, color:C.blue, background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
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
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:22, width:'100%', maxWidth:480, padding:28, position:'relative' }}>
            <button onClick={() => setSelected(null)}
              style={{ position:'absolute', top:16, right:16, background:C.s2, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:16 }}>✕</button>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:20 }}>Submission Details</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                ['FE', selected.users?.name],
                ['Employee ID', selected.users?.employee_id],
                ['Outlet', selected.outlet_name],
                ['Template', selected.form_templates?.name],
                ['Activity', selected.activities?.name],
                ['ECC', selected.is_converted ? 'Yes' : 'No'],
                ['Submitted', new Date(selected.submitted_at).toLocaleString('en-IN')],
              ].filter(([,v]) => v).map(([k, v]) => (
                <div key={String(k)} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'8px 0', borderBottom:`1px solid ${C.border}40` }}>
                  <span style={{ color:C.gray }}>{k}</span>
                  <span style={{ fontWeight:600 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
