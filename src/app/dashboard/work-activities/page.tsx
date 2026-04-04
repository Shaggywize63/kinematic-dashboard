'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { useClient } from '../../../context/ClientContext';

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
};

interface User { id: string; name: string; employee_id?: string; role: string; }
interface City { id: string; name: string; }
interface Zone { id: string; name: string; city?: string; }

interface FormActivity {
  id: string;
  submitted_at: string;
  outlet_id?: string;
  outlet_name?: string;
  store_name?: string;
  user_id: string;
  users?: { name: string; employee_id?: string };
  activities?: { name: string };
  form_templates?: { title: string };
  gps?: string;
  form_responses?: any[];
}

function fmt(ts?: string | null) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function fmtDate(ts?: string | null) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}
function Spinner() {
  return <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.1)', borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />;
}

/* ── Submission Modal ────────────────────────────────────────── */
function SubmissionModal({ submission, onClose }: { submission: FormActivity | null; onClose: () => void }) {
  if (!submission) return null;
  const formTitle = submission.activities?.name || submission.form_templates?.title || 'Form Submission';
  
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 2000, animation: 'fadeIn 0.2s ease-out' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: 800, maxHeight: '85vh', background: C.s2, borderRadius: 24, display: 'flex', flexDirection: 'column', zIndex: 2001, boxShadow: '0 32px 100px rgba(0,0,0,0.8)', overflow: 'hidden', border: `1px solid ${C.border}`, animation: 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '24px 32px', borderBottom: `1px solid ${C.border}`, background: C.s3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: C.blue, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>Submission Details</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: C.white }}>{formTitle}</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 12, background: C.s4, border: 'none', color: C.white, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div style={{ padding: '16px', background: C.s3, borderRadius: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.grayd, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Field Executive</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{submission.users?.name}</div>
              <div style={{ fontSize: 12, color: C.grayd, marginTop: 2 }}>{submission.users?.employee_id}</div>
            </div>
            <div style={{ padding: '16px', background: C.s3, borderRadius: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.grayd, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Submitted At</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{fmtDate(submission.submitted_at)}</div>
              <div style={{ fontSize: 12, color: C.grayd, marginTop: 2 }}>{fmt(submission.submitted_at)}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: C.grayd, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16 }}>Captured Data</div>
          
          {submission.form_responses && submission.form_responses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submission.form_responses.map((r: any, idx: number) => {
                const label = r.builder_questions?.title || r.field_key?.replace(/_/g, ' ') || 'Untitled';
                const val = r.value_text ?? r.value_number?.toString() ?? (r.value_bool !== null ? (r.value_bool ? 'Yes' : 'No') : null);
                return (
                  <div key={idx} style={{ padding: '16px 20px', background: C.s3, borderRadius: 16, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.grayd, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                    {val && <div style={{ fontSize: 15, color: C.white }}>{val}</div>}
                    {r.photo_url && (
                      <div style={{ marginTop: val ? 12 : 0 }}>
                        <img src={r.photo_url} alt="res" style={{ maxWidth: '100%', borderRadius: 12, border: `1px solid ${C.border}`, cursor: 'pointer' }} onClick={() => window.open(r.photo_url, '_blank')} />
                      </div>
                    )}
                    {!val && !r.photo_url && <div style={{ fontSize: 14, color: C.grayd }}>—</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '60px', textAlign: 'center', background: C.s3, borderRadius: 20, border: `1px dashed ${C.border}`, color: C.grayd }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div>No responses found for this submission.</div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      `}</style>
    </>
  );
}

/* ── Outlet Side Panel ───────────────────────────────────────── */
function OutletPanel({
  outlet, onClose,
}: {
  outlet: { outlet_id?: string; outlet_name: string; user_name?: string; user_id: string };
  onClose: () => void;
}) {
  const [forms, setForms] = useState<FormActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { limit: '50', user_id: outlet.user_id };
    if (outlet.outlet_id) params.outlet_id = outlet.outlet_id;
    api.getAdminSubmissions(params).then((r: any) => {
      const rows = Array.isArray(r) ? r : (r?.data ?? r?.submissions ?? []);
      setForms(rows);
    }).catch(() => setForms([])).finally(() => setLoading(false));
  }, [outlet.outlet_id, outlet.user_id]);

  const [downloading, setDownloading] = useState(false);

  const toggleForm = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (details[id]) return;
    setDetailLoading(id);
    try {
      const r: any = await api.getSubmission(id);
      setDetails(p => ({ ...p, [id]: r?.data || r }));
    } catch { /* noop */ } finally { setDetailLoading(null); }
  };

  const downloadAllForms = async () => {
    if (!forms.length) return;
    setDownloading(true);
    try {
      const missing = forms.filter(f => !details[f.id]);
      const fetched = await Promise.all(
        missing.map(f => api.getSubmission(f.id).then((r: any) => ({ id: f.id, data: r?.data || r })).catch(() => ({ id: f.id, data: null })))
      );
      const allDetails: Record<string, any> = { ...details };
      fetched.forEach(({ id, data }) => { if (data) allDetails[id] = data; });
      setDetails(allDetails);

      const escCSV = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const headers = ['Outlet', 'FE Name', 'Employee ID', 'Form / Activity', 'Submitted At', 'Field', 'Value', 'Photo URL'];
      const rows: string[][] = [];

      for (const f of forms) {
        const detail = allDetails[f.id];
        const responses: any[] = detail?.form_responses || [];
        const formTitle = f.activities?.name || (f as any).builder_forms?.title || f.form_templates?.title || 'Form';
        const baseRow = [
          outlet.outlet_name,
          outlet.user_name || '',
          f.users?.employee_id || '',
          formTitle,
          f.submitted_at ? new Date(f.submitted_at).toLocaleString('en-IN') : '',
        ];

        if (responses.length === 0) {
          rows.push([...baseRow, '—', '—', '']);
        } else {
          for (const r of responses) {
            const label = r.builder_questions?.title || r.field_key?.replace(/_/g, ' ') || '';
            const val = r.value_text ?? r.value_number?.toString() ?? (r.value_bool !== null && r.value_bool !== undefined ? (r.value_bool ? 'Yes' : 'No') : '');
            rows.push([...baseRow, label, val, r.photo_url || '']);
          }
        }
      }

      const csv = [headers, ...rows].map(row => row.map(escCSV).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(outlet.outlet_name || 'outlet').replace(/[^a-z0-9]/gi, '_')}_forms_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', zIndex: 999 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 640, background: C.s2, display: 'flex', flexDirection: 'column', zIndex: 1000, boxShadow: '-24px 0 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${C.border}`, background: C.s3, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Outlet Submissions</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800, color: C.white, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {outlet.outlet_name}
              </div>
              {outlet.user_name && <div style={{ fontSize: 12, color: C.gray }}>Assigned to {outlet.user_name}</div>}
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: C.s4, border: 'none', color: C.white, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.grayd, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Forms Submitted {!loading && `(${forms.length})`}
              </div>
              {!loading && forms.length > 0 && (
                <button onClick={downloadAllForms} disabled={downloading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: downloading ? C.s4 : C.blueD, border: `1px solid ${C.blue}40`, borderRadius: 8, color: downloading ? C.grayd : C.blue, fontSize: 12, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                  {downloading ? <><Spinner /> Preparing…</> : <>↓ Download All Forms</>}
                </button>
              )}
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
            ) : forms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: C.grayd, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                No forms submitted for this outlet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {forms.map(f => {
                  const isExpanded = expandedId === f.id;
                  const detail = details[f.id];
                  const isLoadingDetail = detailLoading === f.id;
                  const formTitle = f.activities?.name || f.form_templates?.title || 'Form';
                  return (
                    <div key={f.id} style={{ background: C.s3, border: `1px solid ${isExpanded ? C.blue + '50' : C.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                      <div onClick={() => toggleForm(f.id)} style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: C.blueD, border: `1px solid ${C.blue}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📋</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formTitle}</div>
                          <div style={{ fontSize: 11, color: C.grayd, marginTop: 2 }}>{fmtDate(f.submitted_at)} · {fmt(f.submitted_at)}</div>
                        </div>
                        <div style={{ fontSize: 16, color: C.grayd, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</div>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 16px' }}>
                          {isLoadingDetail ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>
                          ) : detail?.form_responses?.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {detail.form_responses.map((r: any, idx: number) => {
                                const val = r.value_text || r.value_number?.toString() || (r.value_bool !== null && r.value_bool !== undefined ? (r.value_bool ? 'Yes' : 'No') : null);
                                return (
                                  <div key={idx} style={{ padding: '10px 12px', background: C.s4, borderRadius: 9, border: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 10, color: C.grayd, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                                      {r.builder_questions?.title || r.field_key?.replace(/_/g, ' ') || `Field ${idx + 1}`}
                                    </div>
                                    {val && <div style={{ fontSize: 14, color: C.white }}>{val}</div>}
                                    {r.photo_url && (
                                      <img src={r.photo_url} alt="response" style={{ marginTop: val ? 8 : 0, maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: `1px solid ${C.border}`, objectFit: 'cover', display: 'block' }} onClick={() => window.open(r.photo_url, '_blank')} />
                                    )}
                                    {!val && !r.photo_url && <div style={{ fontSize: 13, color: C.grayd }}>—</div>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', color: C.grayd, fontSize: 13, padding: '8px 0' }}>No responses recorded.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function WorkActivitiesPage() {
  const [tab, setTab] = useState<'fe' | 'supervisor'>('fe');
  const [feActivities, setFEActivities] = useState<{ rows: FormActivity[], grouped: Record<string, FormActivity[]>, order: string[] }>({ rows: [], grouped: {}, order: [] });
  const [feLoading, setFELoading] = useState(false);
  const [feTotal, setFETotal] = useState(0);
  const [fePage, setFEPage] = useState(1);
  const [svActivities, setSvActivities] = useState<any[]>([]);
  const [svLoading, setSvLoading] = useState(false);
  const [svTotal, setSvTotal] = useState(0);
  const [svPage, setSvPage] = useState(1);
  const [outletPanel, setOutletPanel] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [formTemplates, setFormTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeSubmission, setActiveSubmission] = useState<FormActivity | null>(null);
  const [err, setErr] = useState('');
  const LIMIT = 25;

  const { selectedClientId } = useClient();

  useEffect(() => {
    const qs = selectedClientId ? `?client_id=${selectedClientId}` : '';
    api.getUsers({ limit: '500', client_id: selectedClientId || '' }).then((r: any) => setUsers(Array.isArray(r) ? r : (r?.data ?? r?.users ?? []))).catch(() => {});
    api.getCities({ limit: '200', client_id: selectedClientId || '' }).then((r: any) => setCities(Array.isArray(r) ? r : (r?.data ?? r?.cities ?? []))).catch(() => {});
    api.get(`/api/v1/zones?limit=500${qs.replace('?','&')}`).then((r: any) => {
       const pick = (res: any) => Array.isArray(res) ? res : (res?.data ?? res?.zones ?? []);
       setZones(pick(r));
    }).catch(() => {});
    api.getForms({ client_id: selectedClientId || '' }).then((r: any) => setFormTemplates(Array.isArray(r) ? r : (r?.data ?? r?.forms ?? []))).catch(() => {});
  }, [selectedClientId]);

  const buildParams = useCallback((page: number) => {
    const p: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (search) p.search = search;
    if (userFilter) p.user_id = userFilter;
    if (cityFilter) p.city_id = cityFilter;
    if (zoneFilter) p.zone_id = zoneFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (selectedTemplateId) p.activity_id = selectedTemplateId;
    if (selectedClientId) p.client_id = selectedClientId;
    return p;
  }, [search, userFilter, cityFilter, zoneFilter, dateFrom, dateTo, selectedTemplateId, selectedClientId]);

  const loadFE = useCallback(async (page = 1) => {
    setFELoading(true); setErr('');
    try {
      const r = await api.getAdminSubmissions(buildParams(page)) as any;
      const rows: FormActivity[] = Array.isArray(r) ? r : (r?.data ?? r?.submissions ?? []);
      
      const grouped: Record<string, FormActivity[]> = {};
      const order: string[] = [];
      
      rows.forEach(s => {
        const key = s.store_name || s.outlet_name || 'Individual Submissions';
        if (!grouped[key]) {
          grouped[key] = [];
          order.push(key);
        }
        grouped[key].push(s);
      });

      setFEActivities({ rows, grouped, order });
      
      setFETotal(r?.total || r?.count || rows.length);
      setFEPage(page);
    } catch (e: any) { setErr(e.message || 'Failed to load'); }
    finally { setFELoading(false); }
  }, [buildParams]);

  const loadSV = useCallback(async (page = 1) => {
    setSvLoading(true);
    try {
      const qs = selectedClientId ? `&client_id=${selectedClientId}` : '';
      const r = await api.get<any>(`/api/v1/visits/team?page=${page}&limit=${LIMIT}${qs}`);
      const d = r as any;
      const rows = Array.isArray(d) ? d : (d?.data ?? d?.visits ?? []);
      setSvActivities(rows); setSvTotal(d?.total || d?.count || rows.length); setSvPage(page);
    } catch { setSvActivities([]); setSvTotal(0); }
    finally { setSvLoading(false); }
  }, [selectedClientId]);

  useEffect(() => { if (tab === 'fe') loadFE(1); else loadSV(1); }, [tab, loadFE, loadSV]);

  const downloadCSV = () => {
    if (!feActivities.rows.length) return;
    const headers = ['Employee ID', 'Name', 'Activity', 'Outlet', 'Submitted At', 'Date'];
    const rows = feActivities.rows.map(a => [
      a.users?.employee_id || '', a.users?.name || '',
      a.activities?.name || (a as any).builder_forms?.title || a.form_templates?.title || '',
      a.store_name || a.outlet_name || '',
      fmt(a.submitted_at), fmtDate(a.submitted_at),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `work_activities_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const downloadGroupCSV = (outletName: string) => {
    const group = feActivities.grouped[outletName];
    if (!group?.length) return;
    const headers = ['Employee ID', 'Name', 'Activity', 'Outlet', 'Submitted At', 'Date'];
    const rows = group.map(a => [
      a.users?.employee_id || '', a.users?.name || '',
      a.activities?.name || a.form_templates?.title || '',
      a.store_name || a.outlet_name || '',
      fmt(a.submitted_at), fmtDate(a.submitted_at),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${outletName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const feUsers = users.filter(u => ['executive','field_executive','field-executive'].includes(u.role));
  const svUsers = users.filter(u => ['supervisor','city_manager','program_manager'].includes(u.role));
  const filteredZones = cityFilter ? zones.filter(z => (z as any).city_id === cityFilter || z.city === cities.find(c => c.id === cityFilter)?.name) : zones;

  const baseInp: React.CSSProperties = { background: C.s3, border: `1px solid ${C.border}`, color: C.white, borderRadius: 9, padding: '9px 13px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif", width: '100%' };

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .wa-row{transition:background 0.12s;cursor:pointer;} .wa-row:hover{background:${C.s4}!important;} .wa-btn{cursor:pointer;transition:opacity 0.15s;} .wa-btn:hover{opacity:0.78;}`}</style>

      <div style={{ padding: '28px', maxWidth: 1300, margin: '0 auto', fontFamily: "'DM Sans',sans-serif" }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: C.white, marginBottom: 4 }}>Work Activities</div>
          <div style={{ fontSize: 13, color: C.gray }}>View field submissions grouped by outlet. Captured data is visible inline.</div>
        </div>

        {err && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 11, padding: '11px 16px', fontSize: 13, color: C.red, marginBottom: 18 }}>{err}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          {([{ key: 'fe', label: '📋 Field Executives', desc: 'Form Submissions' }, { key: 'supervisor', label: '🏪 Supervisors', desc: 'Store Visits' }] as const).map(t => (
            <button key={t.key} className="wa-btn" onClick={() => setTab(t.key)}
              style={{ padding: '10px 20px', background: tab === t.key ? C.s3 : 'transparent', border: `1px solid ${tab === t.key ? C.border : 'transparent'}`, borderRadius: 11, color: tab === t.key ? C.white : C.gray, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, textAlign: 'left' as const }}>
              {t.label}
              <div style={{ fontSize: 11, color: C.grayd, fontWeight: 400, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</div>
              <input style={baseInp} placeholder="Name, outlet…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab === 'fe' ? 'Executive' : 'Supervisor'}</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                <option value="">All</option>
                {(tab === 'fe' ? feUsers : svUsers).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>City</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={cityFilter} onChange={e => { setCityFilter(e.target.value); setZoneFilter(''); }}>
                <option value="">All Cities</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zone</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
                <option value="">All Zones</option>
                {filteredZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>From</div>
              <input type="date" style={baseInp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</div>
              <input type="date" style={baseInp} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {tab === 'fe' && (
              <div>
                <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity</div>
                <select style={{ ...baseInp, appearance: 'none' as const }} value={selectedTemplateId || ''} onChange={e => setSelectedTemplateId(e.target.value || null)}>
                  <option value="">All Activities</option>
                  {formTemplates.map(ft => <option key={ft.id} value={ft.id}>{ft.title}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="wa-btn" onClick={() => { setSearch(''); setUserFilter(''); setCityFilter(''); setZoneFilter(''); setDateFrom(''); setDateTo(''); setSelectedTemplateId(null); }}
                style={{ padding: '9px 14px', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, color: C.gray, fontSize: 12, fontWeight: 600 }}>
                ✕ Clear
              </button>
            </div>
          </div>
        </div>


        <SubmissionModal submission={activeSubmission} onClose={() => setActiveSubmission(null)} />

        {/* ── FE Tab ── */}
        {tab === 'fe' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.grayd, fontWeight: 600 }}>{feLoading ? 'Loading…' : `${feTotal} total submissions`}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="wa-btn" onClick={downloadCSV} style={{ padding: '8px 12px', background: C.blueD, border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 9, fontSize: 13, fontWeight: 600 }}>↓ CSV</button>
                <button className="wa-btn" onClick={() => loadFE(fePage)} style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>↻ Refresh</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {feLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : feActivities.rows.length === 0 ? (
                <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>No form submissions found</div>
                  <div style={{ fontSize: 12 }}>Use filters above or check the mobile app data.</div>
                </div>
              ) : feActivities.order?.map((outletName: string) => (
                <div key={outletName} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
                  {/* Outlet Header */}
                  <div style={{ padding: '18px 24px', background: C.s3, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: C.white }}>{outletName}</div>
                      <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {feActivities.grouped[outletName].length} Submissions
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); downloadGroupCSV(outletName); }} className="wa-btn" style={{ padding: '6px 12px', background: C.s4, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 8, fontSize: 11, fontWeight: 600 }}>↓ Export Group</button>
                  </div>

                  {/* Submissions List */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {feActivities.grouped[outletName].map((a: any, i: number) => (
                      <div key={a.id} onClick={() => setActiveSubmission(a)} className="wa-row" style={{ padding: '16px 24px', borderBottom: i < feActivities.grouped[outletName].length - 1 ? `1px solid ${C.border}40` : 'none', display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.blueD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📋</div>
                        <div style={{ width: 140, flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.users?.name}</div>
                          <div style={{ fontSize: 11, color: C.grayd }}>{a.users?.employee_id}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{a.activities?.name || a.form_templates?.title}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{fmt(a.submitted_at)}</div>
                          <div style={{ fontSize: 11, color: C.grayd }}>{fmtDate(a.submitted_at)}</div>
                        </div>
                        <div style={{ color: C.grayd, fontSize: 16 }}>›</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {feTotal > LIMIT && !feLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadFE(fePage - 1)} disabled={fePage <= 1} style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage <= 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {fePage} of {Math.ceil(feTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadFE(fePage + 1)} disabled={fePage >= Math.ceil(feTotal / LIMIT)} style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage >= Math.ceil(feTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage >= Math.ceil(feTotal / LIMIT) ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Supervisor Tab ── */}
        {tab === 'supervisor' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.grayd, fontWeight: 600 }}>{svLoading ? 'Loading…' : `${svTotal} total activities`}</div>
              <button className="wa-btn" onClick={() => loadSV(svPage)} style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>↻ Refresh</button>
            </div>

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['User', 'Activity Name', 'Notes', 'Zone', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {svLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : svActivities.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏪</div>
                  <div style={{ fontWeight: 600 }}>No activities found</div>
                </div>
              ) : svActivities.map((v, i) => (
                <div key={v.id} className="wa-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '13px 20px', borderBottom: i < svActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: C.blueD, border: `1px solid rgba(62,158,255,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: C.blue, flexShrink: 0 }}>
                      {(v.users?.name?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{v.users?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: C.grayd }}>{v.users?.employee_id || ''}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: v.outlet_name ? C.white : C.grayd }}>{v.outlet_name || 'Generic Activity'}</div>
                  <div style={{ fontSize: 12, color: C.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.notes || '—'}</div>
                  <div style={{ fontSize: 12, color: C.gray }}>{v.users?.zones?.name || '—'}</div>
                  <div style={{ fontSize: 12, color: C.grayd }}>
                    <div style={{ color: C.white, fontWeight: 600 }}>{fmt(v.visited_at)}</div>
                    <div>{fmtDate(v.visited_at)}</div>
                  </div>
                </div>
              ))}
            </div>

            {svTotal > LIMIT && !svLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadSV(svPage - 1)} disabled={svPage <= 1} style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage <= 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {svPage} of {Math.ceil(svTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadSV(svPage + 1)} disabled={svPage >= Math.ceil(svTotal / LIMIT)} style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage >= Math.ceil(svTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage >= Math.ceil(svTotal / LIMIT) ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {outletPanel && <OutletPanel outlet={outletPanel} onClose={() => setOutletPanel(null)} />}
    </>
  );
}
