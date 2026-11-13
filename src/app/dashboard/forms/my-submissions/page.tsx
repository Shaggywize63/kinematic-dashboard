'use client';

/**
 * My Submissions — a field executive's OWN filled forms.
 *
 * Consumes the already-built backend under /api/v1/forms:
 *   - GET   /forms/submissions            → own submissions (paginated)
 *   - GET   /forms/submissions/:id        → one submission + answers + signed photos
 *   - PATCH /forms/submissions/:id        → edit own text answers + outlet/address
 *   - GET   /forms/submissions/:id/export → export-ready view (7-day signed photos)
 *
 * No Spark / entitlement gate — available to ALL authenticated users (field
 * executives especially), who only ever see their own rows (the backend scopes
 * every read by user_id).
 */

import { useState, useEffect, useCallback } from 'react';
import api, { type FormSubmissionRow, type FormSubmissionExport } from '@/lib/api';
import { csvLine, downloadCsv } from '@/components/ffm/reports/reportUtils';

const C = { red:'#E01E2C', green:'#00D97E', yellow:'#FFB800', blue:'#3E9EFF', gray:'#7A8BA0', grayd:'#2E445E', s2:'#131B2A', bg:'#0E1420', border:'#1E2D45', white:'#FFFFFF' };
const LIMIT = 20;

// A form_responses row carries both the simplified contract shape ({label, value,
// photos}) and the raw DB columns (value_text/value_number/value_bool,
// builder_questions). Read whichever is present so the page works against either.
interface PhotoRef { url?: string | null; signed?: string | boolean | null }
interface ResponseRow {
  field_id?: string | null;
  question_id?: string | null;
  field_key?: string | null;
  label?: string | null;
  value?: unknown;
  value_text?: string | null;
  value_number?: number | null;
  value_bool?: boolean | null;
  gps?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  photos?: PhotoRef[] | null;
  builder_questions?: { label?: string | null; qtype?: string | null } | null;
  form_fields?: { label?: string | null; qtype?: string | null } | null;
}
interface Detail extends FormSubmissionRow {
  latitude?: number | null;
  longitude?: number | null;
  form_responses?: ResponseRow[];
  photos?: PhotoRef[];
  crm_accounts?: { name?: string | null } | null;
  activities?: { name?: string | null } | null;
}

const titleOf = (s: FormSubmissionRow | Detail | null): string => s?.builder_forms?.title || 'Untitled form';
const labelOf = (r: ResponseRow): string => r.label || r.builder_questions?.label || r.form_fields?.label || r.field_key || 'Question';
const keyOf = (r: ResponseRow): string => String(r.field_id ?? r.question_id ?? r.field_key ?? '');

// A signed photo is renderable only when `signed` is a non-empty URL string.
// `signed:false`, null, or a missing signed link → show a placeholder instead.
const signedSrc = (p: PhotoRef): string | null => (typeof p.signed === 'string' && p.signed.length > 0 ? p.signed : null);

// All photos attached to a response row, normalised to {url, signed}.
const photosOf = (r: ResponseRow): PhotoRef[] => {
  if (Array.isArray(r.photos) && r.photos.length) return r.photos;
  if (Array.isArray(r.photo_urls) && r.photo_urls.length) return r.photo_urls.map((u) => ({ url: u, signed: null }));
  return [];
};

const isPhotoRow = (r: ResponseRow): boolean => {
  const qt = String(r.builder_questions?.qtype || r.form_fields?.qtype || '').toLowerCase();
  return /photo|image|camera|signature|file/.test(qt) || photosOf(r).length > 0;
};

const rawValue = (r: ResponseRow): string => {
  const v = r.value ?? r.value_text ?? r.value_number ?? r.value_bool;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const fmtDate = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—');

export default function MySubmissionsPage() {
  const [rows, setRows] = useState<FormSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [selected, setSelected] = useState<FormSubmissionRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [outlet, setOutlet] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMySubmissions({ page, limit: LIMIT });
      const d = res as unknown as { data?: { data?: FormSubmissionRow[]; pagination?: { total?: number; totalPages?: number } } };
      // Tolerate the documented shape AND a flat array fallback.
      const list = (Array.isArray(d?.data?.data) ? d.data!.data : Array.isArray((res as unknown as FormSubmissionRow[]) ) ? (res as unknown as FormSubmissionRow[]) : []) as FormSubmissionRow[];
      setRows(list);
      setTotal(d?.data?.pagination?.total ?? list.length);
      setTotalPages(Math.max(1, d?.data?.pagination?.totalPages ?? 1));
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'Could not load your submissions.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openDetail = async (s: FormSubmissionRow) => {
    setSelected(s);
    setDetail(null);
    setEditing(false);
    setEditError('');
    setLoadingDetail(true);
    try {
      const res = await api.getSubmission(s.id) as { data?: Detail } | Detail;
      const d = ((res as { data?: Detail })?.data ?? res) as Detail;
      setDetail(d);
    } catch (e) {
      setEditError((e as Error)?.message || 'Could not load this submission.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const startEdit = () => {
    if (!detail) return;
    const seed: Record<string, string> = {};
    for (const r of detail.form_responses || []) {
      if (isPhotoRow(r)) continue;
      seed[keyOf(r)] = rawValue(r);
    }
    setEdits(seed);
    setOutlet(detail.outlet_name || '');
    setAddress(detail.address || '');
    setEditError('');
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!selected || !detail) return;
    setSaving(true);
    setEditError('');
    try {
      const responses = (detail.form_responses || [])
        .filter((r) => !isPhotoRow(r) && keyOf(r))
        .map((r) => ({ field_id: keyOf(r), value: edits[keyOf(r)] ?? '' }));
      await api.updateSubmission(selected.id, { responses, outlet_name: outlet, address });
      const res = await api.getSubmission(selected.id) as { data?: Detail } | Detail;
      setDetail(((res as { data?: Detail })?.data ?? res) as Detail);
      setEditing(false);
      fetchList();
    } catch (e) {
      setEditError((e as Error)?.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const exportOne = async (s: FormSubmissionRow) => {
    setExportingId(s.id);
    setExportError('');
    try {
      const res = await api.exportSubmission(s.id);
      const d = (res?.data ?? (res as unknown as FormSubmissionExport)) as FormSubmissionExport;
      const meta: Array<[string, string | number | null]> = [
        ['Form', d.form_title],
        ['Reference', d.ref_no],
        ['Activity', d.activity_name],
        ['Account', d.account_name],
        ['Outlet', d.outlet_name],
        ['Address', d.address],
        ['Submitted by', d.submitter?.name ?? ''],
        ['Employee ID', d.submitter?.employee_id ?? ''],
        ['Submitted at', d.submitted_at],
        ['Check-in', d.check_in_at],
        ['Check-out', d.check_out_at],
        ['Location', d.latitude != null && d.longitude != null ? `${d.latitude}, ${d.longitude}` : ''],
        ['Exported at', d.exported_at],
      ];
      const lines: string[] = [];
      lines.push(csvLine(['Field', 'Value']));
      for (const [k, v] of meta) lines.push(csvLine([k, v ?? '']));
      lines.push('');
      lines.push(csvLine(['#', 'Question', 'Answer', 'Photos']));
      (d.answers || []).forEach((a, i) => {
        const photos = (a.photos || []).map((p) => p.signed || p.url || '').filter(Boolean).join(' | ');
        lines.push(csvLine([i + 1, a.label ?? '', a.value == null ? '' : String(a.value), photos]));
      });
      const name = `form-${(d.ref_no || d.submission_id || s.id).toString().replace(/[^A-Za-z0-9._-]/g, '_')}.csv`;
      downloadCsv(name, lines.join('\n'));
    } catch (e) {
      setExportError((e as Error)?.message || 'Export failed.');
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>My Submissions</div>
          <div style={{ fontSize:13, color:C.gray, marginTop:3 }}>Forms you have filled — view, edit and export each one.</div>
        </div>
        <button onClick={fetchList} style={{ padding:'9px 16px', background:C.red, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Refresh
        </button>
      </div>

      {exportError && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'10px 14px', fontSize:13, color:C.red }}>{exportError}</div>
      )}

      <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
        {loading ? (
          <div data-testid="my-sub-loading" style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading your submissions…</div>
        ) : error ? (
          <div data-testid="my-sub-error" style={{ padding:'32px 24px', textAlign:'center', color:C.red, fontSize:14 }}>
            {error}
            <div style={{ marginTop:12 }}>
              <button onClick={fetchList} style={{ padding:'7px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:9, color:C.gray, fontSize:12, cursor:'pointer' }}>Try again</button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div data-testid="my-sub-empty" style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>
            You haven&apos;t submitted any forms yet.
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  {['Form number', 'Form', 'Submitted', 'Outlet / Account', ''].map((h) => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:C.grayd, letterSpacing:'0.8px', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} data-testid="my-sub-row"
                    style={{ borderBottom:`1px solid ${C.border}40` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.s2)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td data-testid="my-sub-ref" style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:C.white, whiteSpace:'nowrap' }}>{s.ref_no || '—'}</td>
                    <td data-testid="my-sub-title" style={{ padding:'12px 16px', fontSize:13, fontWeight:600 }}>{titleOf(s)}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:C.gray, whiteSpace:'nowrap' }}>{fmtDate(s.submitted_at)}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:C.gray }}>{s.outlet_name || '—'}</td>
                    <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                        <button data-testid="my-sub-view" onClick={() => openDetail(s)}
                          style={{ fontSize:12, color:C.blue, background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:700 }}>View</button>
                        <button data-testid="my-sub-export" onClick={() => exportOne(s)} disabled={exportingId === s.id}
                          style={{ fontSize:12, color:C.green, background:'none', border:'none', cursor: exportingId === s.id ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:700, opacity: exportingId === s.id ? 0.6 : 1 }}>
                          {exportingId === s.id ? 'Exporting…' : 'Export'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div style={{ padding:'12px 18px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:C.grayd }}>Page {page} of {totalPages} · {total} total</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding:'6px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.gray, cursor:'pointer', opacity: page === 1 ? 0.4 : 1 }}>Previous</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                style={{ padding:'6px 12px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.gray, cursor:'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>Next</button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)' }}>
          <div data-testid="my-sub-detail" style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:22, width:'100%', maxWidth:560, maxHeight:'92vh', overflowY:'auto', position:'relative', boxShadow:'0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ padding:'20px 22px', borderBottom:`1px solid ${C.border}`, position:'sticky', top:0, background:C.bg, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ minWidth:0 }}>
                <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:19, fontWeight:800, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleOf(detail || selected)}</h3>
                <div data-testid="my-sub-detail-ref" style={{ fontSize:12, fontWeight:700, color:C.gray, marginTop:4 }}>{selected.ref_no || detail?.ref_no || 'No form number'}</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {!loadingDetail && detail && !editing && (
                  <button data-testid="my-sub-edit" onClick={startEdit} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, padding:'8px 14px', cursor:'pointer', color:C.blue, fontSize:13, fontWeight:700 }}>Edit</button>
                )}
                {editing && (
                  <>
                    <button onClick={() => { setEditing(false); setEditError(''); }} disabled={saving}
                      style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, padding:'8px 12px', cursor:'pointer', color:C.gray, fontSize:13, fontWeight:700 }}>Cancel</button>
                    <button data-testid="my-sub-save" onClick={saveEdits} disabled={saving}
                      style={{ background:C.green, border:'none', borderRadius:10, padding:'8px 16px', cursor: saving ? 'default' : 'pointer', color:'#06281B', fontSize:13, fontWeight:800, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                  </>
                )}
                <button onClick={() => setSelected(null)} aria-label="Close"
                  style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:17 }}>✕</button>
              </div>
            </div>

            <div style={{ padding:22 }}>
              {loadingDetail ? (
                <div style={{ padding:24, textAlign:'center', color:C.grayd }}>Loading…</div>
              ) : !detail ? (
                <div style={{ padding:24, textAlign:'center', color:C.red }}>{editError || 'Could not load this submission.'}</div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:16, marginBottom:24 }}>
                    {([
                      ['Submitted', fmtDate(detail.submitted_at)],
                      ['Outlet', detail.outlet_name || '—'],
                      ['Account', detail.crm_accounts?.name || '—'],
                      ['Address', detail.address || '—'],
                      ['Check-in', fmtDate(detail.check_in_at)],
                      ['Check-out', fmtDate(detail.check_out_at)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize:11, color:C.gray, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{k}</div>
                        <div style={{ fontSize:14, fontWeight:600, wordBreak:'break-word' }}>{v}</div>
                      </div>
                    ))}
                    {detail.latitude != null && detail.longitude != null && (
                      <div>
                        <div style={{ fontSize:11, color:C.gray, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Location</div>
                        <a href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer" style={{ fontSize:13, fontWeight:600, color:C.blue, textDecoration:'none' }}>📍 {detail.latitude}, {detail.longitude}</a>
                      </div>
                    )}
                  </div>

                  {editing && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, marginBottom:20 }}>
                      <label style={{ fontSize:12, color:C.gray }}>Outlet name
                        <input data-testid="my-sub-outlet" value={outlet} onChange={(e) => setOutlet(e.target.value)}
                          style={{ display:'block', width:'100%', marginTop:5, background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontSize:14, padding:'8px 10px' }} />
                      </label>
                      <label style={{ fontSize:12, color:C.gray }}>Address
                        <input data-testid="my-sub-address" value={address} onChange={(e) => setAddress(e.target.value)}
                          style={{ display:'block', width:'100%', marginTop:5, background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontSize:14, padding:'8px 10px' }} />
                      </label>
                    </div>
                  )}

                  <div style={{ borderTop:`1.5px solid ${C.border}`, paddingTop:20 }}>
                    <h4 style={{ fontSize:15, fontWeight:800, marginBottom:14, color:C.blue }}>Answers</h4>
                    {editError && <div style={{ color:'#FF6B6B', fontSize:12, marginBottom:12 }}>{editError}</div>}
                    {(detail.form_responses || []).length === 0 ? (
                      <div style={{ padding:16, textAlign:'center', color:C.grayd }}>No answers recorded.</div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                        {(detail.form_responses || []).map((r, idx) => {
                          const photos = photosOf(r);
                          const editable = editing && !isPhotoRow(r) && keyOf(r);
                          return (
                            <div key={keyOf(r) || idx} data-testid="my-sub-answer" style={{ background:C.s2, padding:14, borderRadius:12, border:`1px solid ${C.border}80` }}>
                              <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:8 }}>{idx + 1}. {labelOf(r)}</div>
                              {editable ? (
                                <textarea
                                  value={edits[keyOf(r)] ?? ''}
                                  onChange={(e) => setEdits((prev) => ({ ...prev, [keyOf(r)]: e.target.value }))}
                                  style={{ width:'100%', minHeight:40, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontSize:14, padding:'8px 10px', resize:'vertical', fontFamily:'inherit' }}
                                />
                              ) : photos.length > 0 ? (
                                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                  {photos.map((p, pi) => {
                                    const src = signedSrc(p);
                                    if (!src) {
                                      return (
                                        <div key={pi} data-testid="my-sub-photo-missing"
                                          style={{ width:120, height:120, borderRadius:12, border:`1px dashed ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', color:C.grayd, fontSize:11, padding:8, background:C.bg }}>
                                          Photo unavailable
                                        </div>
                                      );
                                    }
                                    return (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={pi} data-testid="my-sub-photo" src={src} alt={labelOf(r)}
                                        onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                                        style={{ maxWidth:'100%', maxHeight:140, borderRadius:12, border:`1px solid ${C.border}`, cursor:'pointer' }} />
                                    );
                                  })}
                                </div>
                              ) : (
                                <div style={{ fontSize:14, color: rawValue(r) ? C.white : C.grayd, wordBreak:'break-word' }}>{rawValue(r) || '—'}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
