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
  checkin_photo?: string | null;
  checkin_at?: string | null;
  checkin_lat?: number | null;
  checkin_lng?: number | null;
  users?: { name: string; employee_id?: string };
  activities?: { name: string };
  form_templates?: { title: string };
  gps?: string;
  form_responses?: any[];
}

interface StoreVisit {
  id: string;
  visited_at: string;
  outlet_name?: string;
  notes?: string;
  user_id: string;
  users?: { name: string; employee_id?: string; zones?: { name?: string } };
  lat?: number; lng?: number;
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

/* ── Outlet Side Panel ───────────────────────────────────────── */
function OutletPanel({
  outlet, onClose,
}: {
  outlet: { outlet_id?: string; outlet_name: string; user_name?: string; user_id: string; checkin_photo?: string | null; checkin_at?: string | null; checkin_lat?: number | null; checkin_lng?: number | null };
  onClose: () => void;
}) {
  const [forms, setForms] = useState<FormActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(false);

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
      // Fetch details for any forms not yet loaded
      const missing = forms.filter(f => !details[f.id]);
      const fetched = await Promise.all(
        missing.map(f => api.getSubmission(f.id).then((r: any) => ({ id: f.id, data: r?.data || r })).catch(() => ({ id: f.id, data: null })))
      );
      const allDetails: Record<string, any> = { ...details };
      fetched.forEach(({ id, data }) => { if (data) allDetails[id] = data; });
      setDetails(allDetails);

      // Build CSV rows — one row per field response
      const escCSV = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const headers = ['Outlet', 'FE Name', 'Employee ID', 'Checkin Time', 'Form / Activity', 'Submitted At', 'Field', 'Value', 'Photo URL'];
      const rows: string[][] = [];

      for (const f of forms) {
        const detail = allDetails[f.id];
        const responses: any[] = detail?.form_responses || [];
        const formTitle = f.activities?.name || (f as any).builder_forms?.title || f.form_templates?.title || 'Form';
        const baseRow = [
          outlet.outlet_name,
          outlet.user_name || '',
          f.users?.employee_id || '',
          outlet.checkin_at ? new Date(outlet.checkin_at).toLocaleString('en-IN') : '',
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
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', zIndex: 999 }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 640, background: C.s2, display: 'flex', flexDirection: 'column', zIndex: 1000, boxShadow: '-24px 0 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${C.border}`, background: C.s3, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Outlet Visit</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800, color: C.white, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {outlet.outlet_name}
              </div>
              {outlet.user_name && <div style={{ fontSize: 12, color: C.gray }}>by {outlet.user_name}</div>}
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: C.s4, border: 'none', color: C.white, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px' }}>

          {/* ── Checkin Card ── */}
          <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: C.grayd, textTransform: 'uppercase', letterSpacing: '1px' }}>Check-in Details</div>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Photo */}
              <div
                onClick={() => outlet.checkin_photo && setPhotoZoom(true)}
                style={{ flexShrink: 0, cursor: outlet.checkin_photo ? 'zoom-in' : 'default' }}
              >
                {outlet.checkin_photo ? (
                  <img
                    src={outlet.checkin_photo}
                    alt="checkin"
                    style={{ width: 90, height: 90, borderRadius: 12, objectFit: 'cover', border: `1px solid ${C.border}` }}
                  />
                ) : (
                  <div style={{ width: 90, height: 90, borderRadius: 12, background: C.s4, border: `2px dashed ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ fontSize: 26 }}>📷</span>
                    <span style={{ fontSize: 9, color: C.grayd, textAlign: 'center', lineHeight: 1.3 }}>No photo</span>
                  </div>
                )}
              </div>

              {/* Checkin meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.grayd, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Time</div>
                  <div style={{ fontSize: 14, color: C.white, fontWeight: 600 }}>{fmt(outlet.checkin_at)}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{fmtDate(outlet.checkin_at)}</div>
                </div>
                {(outlet.checkin_lat && outlet.checkin_lng) ? (
                  <div>
                    <div style={{ fontSize: 10, color: C.grayd, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>GPS Location</div>
                    <a
                      href={`https://maps.google.com/?q=${outlet.checkin_lat},${outlet.checkin_lng}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: C.blue, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      📍 {Number(outlet.checkin_lat).toFixed(5)}, {Number(outlet.checkin_lng).toFixed(5)} ↗
                    </a>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 10, color: C.grayd, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>GPS Location</div>
                    <div style={{ fontSize: 12, color: C.grayd }}>Not captured</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Forms Section ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.grayd, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Forms Submitted {!loading && `(${forms.length})`}
              </div>
              {!loading && forms.length > 0 && (
                <button
                  onClick={downloadAllForms}
                  disabled={downloading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: downloading ? C.s4 : C.blueD, border: `1px solid ${C.blue}40`, borderRadius: 8, color: downloading ? C.grayd : C.blue, fontSize: 12, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', transition: 'all 0.15s' }}
                >
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
                  const formTitle = f.activities?.name || (f as any).builder_forms?.title || f.form_templates?.title || 'Form';
                  const subTitle = f.activities?.name && ((f as any).builder_forms?.title || f.form_templates?.title) ? ((f as any).builder_forms?.title || f.form_templates?.title) : null;

                  return (
                    <div key={f.id} style={{ background: C.s3, border: `1px solid ${isExpanded ? C.blue + '50' : C.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                      {/* Form header row */}
                      <div
                        onClick={() => toggleForm(f.id)}
                        style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: C.blueD, border: `1px solid ${C.blue}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📋</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formTitle}</div>
                          {subTitle && <div style={{ fontSize: 11, color: C.grayd }}>{subTitle}</div>}
                          <div style={{ fontSize: 11, color: C.grayd, marginTop: 2 }}>{fmtDate(f.submitted_at)} · {fmt(f.submitted_at)}</div>
                        </div>
                        <div style={{ fontSize: 16, color: C.grayd, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</div>
                      </div>

                      {/* Expanded responses */}
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
                                      <img src={r.photo_url} alt="response" style={{ marginTop: val ? 8 : 0, maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: `1px solid ${C.border}`, objectFit: 'cover', display: 'block' }} />
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

      {/* Photo zoom overlay */}
      {photoZoom && outlet.checkin_photo && (
        <div onClick={() => setPhotoZoom(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24 }}>
          <img src={outlet.checkin_photo} alt="checkin full" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 14, objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function WorkActivitiesPage() {
  const [tab, setTab] = useState<'fe' | 'supervisor'>('fe');
  const [feActivities, setFEActivities] = useState<FormActivity[]>([]);
  const [feLoading, setFELoading] = useState(false);
  const [feTotal, setFETotal] = useState(0);
  const [fePage, setFEPage] = useState(1);
  const [svActivities, setSvActivities] = useState<StoreVisit[]>([]);
  const [svLoading, setSvLoading] = useState(false);
  const [svTotal, setSvTotal] = useState(0);
  const [svPage, setSvPage] = useState(1);
  const [outletPanel, setOutletPanel] = useState<Parameters<typeof OutletPanel>[0]['outlet'] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  }, [selectedClientId]);

  const buildParams = useCallback((page: number) => {
    const p: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (search) p.search = search;
    if (userFilter) p.user_id = userFilter;
    if (cityFilter) p.city_id = cityFilter;
    if (zoneFilter) p.zone_id = zoneFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (selectedClientId) p.client_id = selectedClientId;
    return p;
  }, [search, userFilter, cityFilter, zoneFilter, dateFrom, dateTo, selectedClientId]);

  const loadFE = useCallback(async (page = 1) => {
    setFELoading(true); setErr('');
    try {
      const r = await api.getAdminSubmissions(buildParams(page)) as any;
      const rows: FormActivity[] = Array.isArray(r) ? r : (r?.data ?? r?.submissions ?? []);
      
      // Group by user + outlet + date to show 1 row per check-in session
      const grouped: Record<string, FormActivity> = {};
      const order: string[] = [];
      
      rows.forEach(s => {
        const dateKey = s.checkin_at?.split('T')[0] || s.submitted_at?.split('T')[0] || '';
        const groupKey = `${s.user_id}_${s.outlet_id}_${dateKey}`;
        if (!grouped[groupKey]) {
          grouped[groupKey] = s;
          order.push(groupKey);
        } else {
          // If we have multiple form templates in one visit, we could aggregate here 
          // but for now 1 row is what user wants.
        }
      });

      const finalRows = order.map(k => grouped[k]);
      setFEActivities(finalRows);
      setFETotal(r?.total || r?.count || finalRows.length);
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

  const openPanel = (a: FormActivity) => {
    setOutletPanel({
      outlet_id: a.outlet_id,
      outlet_name: a.store_name || a.outlet_name || 'Unknown Outlet',
      user_name: a.users?.name,
      user_id: a.user_id,
      checkin_photo: a.checkin_photo,
      checkin_at: a.checkin_at,
      checkin_lat: a.checkin_lat,
      checkin_lng: a.checkin_lng,
    });
  };

  const downloadCSV = () => {
    if (!feActivities.length) return;
    const headers = ['Employee ID', 'Name', 'Activity', 'Outlet', 'Checkin Time', 'Date'];
    const rows = feActivities.map(a => [
      a.users?.employee_id || '', a.users?.name || '',
      a.activities?.name || (a as any).builder_forms?.title || a.form_templates?.title || '',
      a.store_name || a.outlet_name || '',
      fmt(a.checkin_at || a.submitted_at), fmtDate(a.checkin_at || a.submitted_at),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `work_activities_${new Date().toISOString().slice(0,10)}.csv`;
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
          <div style={{ fontSize: 13, color: C.gray }}>Click any row to see check-in details and all forms submitted at that outlet</div>
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
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="wa-btn" onClick={() => { setSearch(''); setUserFilter(''); setCityFilter(''); setZoneFilter(''); setDateFrom(''); setDateTo(''); }}
                style={{ padding: '9px 14px', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, color: C.gray, fontSize: 12, fontWeight: 600 }}>
                ✕ Clear
              </button>
            </div>
          </div>
        </div>

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

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 2fr 80px 1.2fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['Executive', 'Activity', 'Outlet', 'Check-in', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {feLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : feActivities.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>No form submissions found</div>
                  <div style={{ fontSize: 12 }}>Use filters above or check the mobile app data.</div>
                </div>
              ) : feActivities.map((a, i) => (
                <div key={a.id} className="wa-row"
                  onClick={() => openPanel(a)}
                  style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 2fr 80px 1.2fr', padding: '14px 20px', borderBottom: i < feActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>

                  {/* Executive */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: C.greenD, border: `1px solid rgba(0,217,126,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: C.green, flexShrink: 0 }}>
                      {(a.users?.name?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{a.users?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: C.grayd }}>{a.users?.employee_id || ''}</div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div>
                    <div style={{ fontSize: 13, color: C.white, fontWeight: 500 }}>{a.activities?.name || a.form_templates?.title || '—'}</div>
                    {a.activities?.name && a.form_templates?.title && (
                      <div style={{ fontSize: 11, color: C.grayd }}>{a.form_templates.title}</div>
                    )}
                  </div>

                  {/* Outlet */}
                  <div style={{ fontSize: 13, color: (a.store_name || a.outlet_name) ? C.white : C.grayd }}>
                    {a.store_name || a.outlet_name || '—'}
                  </div>

                  {/* Checkin photo thumbnail */}
                  <div>
                    {a.checkin_photo ? (
                      <img src={a.checkin_photo} alt="checkin"
                        style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', border: `1px solid ${C.border}` }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 9, background: C.s3, border: `1.5px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        📷
                      </div>
                    )}
                  </div>

                  {/* Checkin time */}
                  <div style={{ fontSize: 12, color: C.grayd }}>
                    <div style={{ color: C.white, fontWeight: 600 }}>{fmt(a.checkin_at || a.submitted_at)}</div>
                    <div>{fmtDate(a.checkin_at || a.submitted_at)}</div>
                  </div>
                </div>
              ))}
            </div>

            {feTotal > LIMIT && !feLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadFE(fePage - 1)} disabled={fePage <= 1}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage <= 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {fePage} of {Math.ceil(feTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadFE(fePage + 1)} disabled={fePage >= Math.ceil(feTotal / LIMIT)}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage >= Math.ceil(feTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage >= Math.ceil(feTotal / LIMIT) ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Supervisor Tab ── */}
        {tab === 'supervisor' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.grayd, fontWeight: 600 }}>{svLoading ? 'Loading…' : `${svTotal} total store visits`}</div>
              <button className="wa-btn" onClick={() => loadSV(svPage)} style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>↻ Refresh</button>
            </div>

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['Supervisor', 'Outlet Visited', 'Notes', 'Zone', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {svLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : svActivities.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏪</div>
                  <div style={{ fontWeight: 600 }}>No store visits found</div>
                </div>
              ) : svActivities.map((v, i) => (
                <div key={v.id} className="wa-row"
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '13px 20px', borderBottom: i < svActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: C.blueD, border: `1px solid rgba(62,158,255,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: C.blue, flexShrink: 0 }}>
                      {(v.users?.name?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{v.users?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: C.grayd }}>{v.users?.employee_id || ''}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: v.outlet_name ? C.white : C.grayd }}>{v.outlet_name || '—'}</div>
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
                <button className="wa-btn" onClick={() => loadSV(svPage - 1)} disabled={svPage <= 1}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage <= 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {svPage} of {Math.ceil(svTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadSV(svPage + 1)} disabled={svPage >= Math.ceil(svTotal / LIMIT)}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage >= Math.ceil(svTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage >= Math.ceil(svTotal / LIMIT) ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Outlet side panel */}
      {outletPanel && <OutletPanel outlet={outletPanel} onClose={() => setOutletPanel(null)} />}
    </>
  );
}
