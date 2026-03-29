'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF',
};

/* ── Types ── */
interface User { id: string; name: string; employee_id?: string; role: string; }
interface City { id: string; name: string; }
interface Zone { id: string; name: string; city?: string; }
interface FormActivity {
  id: string;
  submitted_at: string;
  outlet_id?: string;
  outlet_name?: string;
  user_id: string;
  checkin_photo?: string | null;
  users?: { name: string; employee_id?: string; role?: string; zones?: { name?: string } };
  activities?: { name: string };
  form_templates?: { title: string };
  outlets?: { name: string };
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
  lat?: number;
  lng?: number;
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function Spinner() {
  return (
    <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.1)', borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
  );
}

export default function WorkActivitiesPage() {
  const [tab, setTab] = useState<'fe' | 'supervisor'>('fe');

  /* ── FE data ── */
  const [feActivities, setFEActivities] = useState<FormActivity[]>([]);
  const [feLoading, setFELoading] = useState(false);
  const [feTotal, setFETotal] = useState(0);
  const [fePage, setFEPage] = useState(1);

  /* ── Supervisor data ── */
  const [svActivities, setSvActivities] = useState<StoreVisit[]>([]);
  const [svLoading, setSvLoading] = useState(false);
  const [svTotal, setSvTotal] = useState(0);
  const [svPage, setSvPage] = useState(1);

  /* ── Outlet detail panel ── */
  const [outletPanel, setOutletPanel] = useState<{ outlet_id?: string; outlet_name?: string; user_name?: string } | null>(null);
  const [outletForms, setOutletForms] = useState<FormActivity[]>([]);
  const [outletLoading, setOutletLoading] = useState(false);
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);
  const [formDetails, setFormDetails] = useState<Record<string, any>>({});
  const [formDetailsLoading, setFormDetailsLoading] = useState<string | null>(null);

  /* ── Filters ── */
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

  useEffect(() => {
    api.get<any>('/api/v1/admin/users?limit=500').then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.data ?? r?.users ?? []);
      setUsers(arr);
    }).catch(() => {});
    api.get<any>('/api/v1/admin/cities?limit=200').then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.data ?? r?.cities ?? []);
      setCities(arr);
    }).catch(() => {});
    api.get<any>('/api/v1/admin/zones?limit=500').then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.data ?? r?.zones ?? []);
      setZones(arr);
    }).catch(() => {});
  }, []);

  const buildParams = useCallback((page: number) => {
    const p: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (search) p.search = search;
    if (userFilter) p.user_id = userFilter;
    if (cityFilter) p.city_id = cityFilter;
    if (zoneFilter) p.zone_id = zoneFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [search, userFilter, cityFilter, zoneFilter, dateFrom, dateTo]);

  const loadFE = useCallback(async (page = 1) => {
    setFELoading(true); setErr('');
    try {
      const r = await api.getAdminSubmissions(buildParams(page)) as any;
      const rows = Array.isArray(r) ? r : (r?.data ?? r?.submissions ?? []);
      setFEActivities(rows);
      setFETotal(r?.total || r?.count || rows.length);
      setFEPage(page);
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally {
      setFELoading(false);
    }
  }, [buildParams]);

  const loadSV = useCallback(async (page = 1) => {
    setSvLoading(true); setErr('');
    try {
      const r = await api.get<any>(`/api/v1/visits/team?page=${page}&limit=${LIMIT}`);
      const d = r as any;
      const rows = Array.isArray(d) ? d : (d?.data ?? d?.visits ?? []);
      setSvActivities(rows);
      setSvTotal(d?.total || d?.count || rows.length);
      setSvPage(page);
    } catch {
      setSvActivities([]); setSvTotal(0);
    } finally {
      setSvLoading(false);
    }
  }, []);

  const openOutletPanel = async (a: FormActivity) => {
    setOutletPanel({
      outlet_id: a.outlet_id,
      outlet_name: a.outlet_name || a.outlets?.name || '—',
      user_name: a.users?.name,
    });
    setOutletForms([]);
    setExpandedFormId(null);
    setFormDetails({});
    setOutletLoading(true);
    try {
      const params: Record<string, string> = { limit: '50', user_id: a.user_id };
      if (a.outlet_id) params.outlet_id = a.outlet_id;
      const r = await api.getAdminSubmissions(params) as any;
      const rows = Array.isArray(r) ? r : (r?.data ?? r?.submissions ?? []);
      setOutletForms(rows);
    } catch {
      setOutletForms([]);
    } finally {
      setOutletLoading(false);
    }
  };

  const toggleFormDetail = async (formId: string) => {
    if (expandedFormId === formId) { setExpandedFormId(null); return; }
    setExpandedFormId(formId);
    if (formDetails[formId]) return;
    setFormDetailsLoading(formId);
    try {
      const r: any = await api.getSubmission(formId);
      setFormDetails(prev => ({ ...prev, [formId]: r?.data || r }));
    } catch { /* show empty */ }
    finally { setFormDetailsLoading(null); }
  };

  const downloadCSV = () => {
    if (!feActivities.length) return;
    const headers = ['Employee ID', 'Name', 'Activity', 'Outlet', 'Checkin Time', 'Date'];
    const rows = feActivities.map(a => [
      a.users?.employee_id || '',
      a.users?.name || '',
      a.activities?.name || a.form_templates?.title || '',
      a.outlet_name || '',
      fmt(a.submitted_at),
      fmtDate(a.submitted_at),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `work_activities_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (tab === 'fe') loadFE(1); else loadSV(1);
  }, [tab, loadFE, loadSV]);

  const feUsers = users.filter(u => ['executive','field_executive','field-executive'].includes(u.role));
  const svUsers = users.filter(u => ['supervisor','city_manager','program_manager'].includes(u.role));
  const dropdownUsers = tab === 'fe' ? feUsers : svUsers;
  const filteredZones = cityFilter
    ? zones.filter(z => (z as any).city_id === cityFilter || z.city === cities.find(c => c.id === cityFilter)?.name)
    : zones;

  const baseInp: React.CSSProperties = {
    background: C.s3, border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 9, padding: '9px 13px', fontSize: 13, outline: 'none',
    fontFamily: "'DM Sans',sans-serif", width: '100%',
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .wa-row { transition: background 0.12s; cursor: pointer; }
        .wa-row:hover { background: ${C.s4} !important; }
        .wa-btn { cursor: pointer; transition: opacity 0.15s; }
        .wa-btn:hover { opacity: 0.78; }
      `}</style>

      <div style={{ padding: '28px', maxWidth: 1300, margin: '0 auto', fontFamily: "'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: C.white, marginBottom: 4 }}>Work Activities</div>
          <div style={{ fontSize: 13, color: C.gray }}>Field executive form submissions & supervisor store visits</div>
        </div>

        {err && (
          <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 11, padding: '11px 16px', fontSize: 13, color: C.red, marginBottom: 18 }}>{err}</div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          {([
            { key: 'fe', label: '📋 Field Executives', desc: 'Form Submissions' },
            { key: 'supervisor', label: '🏪 Supervisors', desc: 'Store Visits' },
          ] as const).map(t => (
            <button key={t.key} className="wa-btn" onClick={() => setTab(t.key)}
              style={{ padding: '10px 20px', background: tab === t.key ? C.s3 : 'transparent', border: `1px solid ${tab === t.key ? C.border : 'transparent'}`, borderRadius: 11, color: tab === t.key ? C.white : C.gray, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, textAlign: 'left' as const }}>
              {t.label}
              <div style={{ fontSize: 11, color: C.grayd, fontWeight: 400, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</div>
              <input style={baseInp} placeholder="Name, outlet…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab === 'fe' ? 'Executive' : 'Supervisor'}</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                <option value="">All</option>
                {dropdownUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>City</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={cityFilter} onChange={e => { setCityFilter(e.target.value); setZoneFilter(''); }}>
                <option value="">All Cities</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zone</div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
                <option value="">All Zones</option>
                {filteredZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>From</div>
              <input type="date" style={baseInp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</div>
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

        {/* ── FE TAB ── */}
        {tab === 'fe' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.grayd, fontWeight: 600 }}>
                {feLoading ? 'Loading…' : `${feTotal} total submissions`}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="wa-btn" onClick={downloadCSV}
                  style={{ padding: '8px 12px', background: C.blueD, border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
                  ↓ CSV
                </button>
                <button className="wa-btn" onClick={() => loadFE(fePage)}
                  style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 2fr 72px 1.1fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['Executive', 'Activity', 'Outlet', 'Photo', 'Check-in Time'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {feLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : feActivities.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>No form submissions found</div>
                  <div style={{ fontSize: 12 }}>Form submission data will appear here once recorded through the mobile app.</div>
                </div>
              ) : (
                feActivities.map((a, i) => (
                  <div key={a.id} className="wa-row"
                    onClick={() => openOutletPanel(a)}
                    style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 2fr 72px 1.1fr', padding: '14px 20px', borderBottom: i < feActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>

                    {/* Executive */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: C.greenD, border: `1px solid rgba(0,217,126,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: C.green, flexShrink: 0 }}>
                        {(a.users?.name?.[0] || '?').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{a.users?.name || a.user_id?.slice(0, 8) || '—'}</div>
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
                    <div style={{ fontSize: 13, color: a.outlet_name ? C.white : C.grayd, fontWeight: a.outlet_name ? 500 : 400 }}>
                      {a.outlet_name || '—'}
                    </div>

                    {/* Checkin photo */}
                    <div>
                      {a.checkin_photo ? (
                        <img
                          src={a.checkin_photo}
                          alt="checkin"
                          style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.border}` }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: C.s3, border: `1px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                          📷
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <div style={{ fontSize: 12, color: C.grayd }}>
                      <div style={{ color: C.white, fontWeight: 600 }}>{fmt(a.submitted_at)}</div>
                      <div>{fmtDate(a.submitted_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* FE Pagination */}
            {feTotal > LIMIT && !feLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadFE(fePage - 1)} disabled={fePage <= 1}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage <= 1 ? 0.4 : 1 }}>
                  ← Prev
                </button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {fePage} of {Math.ceil(feTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadFE(fePage + 1)} disabled={fePage >= Math.ceil(feTotal / LIMIT)}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: fePage >= Math.ceil(feTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: fePage >= Math.ceil(feTotal / LIMIT) ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SUPERVISOR TAB ── */}
        {tab === 'supervisor' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.grayd, fontWeight: 600 }}>
                {svLoading ? 'Loading…' : `${svTotal} total store visits`}
              </div>
              <button className="wa-btn" onClick={() => loadSV(svPage)}
                style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>
                ↻ Refresh
              </button>
            </div>

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['Supervisor', 'Outlet Visited', 'Notes', 'Zone', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {svLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : svActivities.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏪</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>No store visits found</div>
                  <div style={{ fontSize: 12 }}>Supervisor store visit data will appear here once recorded.</div>
                </div>
              ) : (
                svActivities.map((v, i) => (
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
                ))
              )}
            </div>

            {svTotal > LIMIT && !svLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadSV(svPage - 1)} disabled={svPage <= 1}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage <= 1 ? 0.4 : 1 }}>
                  ← Prev
                </button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>Page {svPage} of {Math.ceil(svTotal / LIMIT)}</span>
                <button className="wa-btn" onClick={() => loadSV(svPage + 1)} disabled={svPage >= Math.ceil(svTotal / LIMIT)}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage >= Math.ceil(svTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage >= Math.ceil(svTotal / LIMIT) ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Outlet Forms Panel ── */}
      {outletPanel && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOutletPanel(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', zIndex: 1000 }}
        >
          <div style={{ background: C.s2, width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

            {/* Panel Header */}
            <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.border}`, background: C.s3, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                    Outlet Forms
                  </div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: C.white, marginBottom: 4 }}>
                    {outletPanel.outlet_name || 'Unknown Outlet'}
                  </div>
                  {outletPanel.user_name && (
                    <div style={{ fontSize: 13, color: C.gray }}>by {outletPanel.user_name}</div>
                  )}
                </div>
                <button className="wa-btn" onClick={() => setOutletPanel(null)}
                  style={{ width: 36, height: 36, borderRadius: 10, background: C.s4, border: 'none', color: C.white, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
              {outletLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
              ) : outletForms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: C.grayd, fontSize: 14 }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                  No forms found for this outlet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: C.grayd, fontWeight: 600, marginBottom: 4 }}>
                    {outletForms.length} form{outletForms.length !== 1 ? 's' : ''} submitted
                  </div>
                  {outletForms.map(f => {
                    const isExpanded = expandedFormId === f.id;
                    const detail = formDetails[f.id];
                    const isLoadingDetail = formDetailsLoading === f.id;
                    return (
                      <div key={f.id} style={{ background: C.s3, border: `1px solid ${isExpanded ? C.blue + '40' : C.border}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                        {/* Form row — clickable */}
                        <div className="wa-btn" onClick={() => toggleFormDetail(f.id)}
                          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.blueD, border: `1px solid ${C.blue}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                              📋
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {f.activities?.name || f.form_templates?.title || 'Form'}
                              </div>
                              {f.activities?.name && f.form_templates?.title && (
                                <div style={{ fontSize: 11, color: C.grayd }}>{f.form_templates.title}</div>
                              )}
                              <div style={{ fontSize: 11, color: C.grayd, marginTop: 2 }}>{fmtDate(f.submitted_at)} · {fmt(f.submitted_at)}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {f.checkin_photo && (
                              <img src={f.checkin_photo} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: `1px solid ${C.border}` }} />
                            )}
                            <div style={{ fontSize: 16, color: C.gray, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              ▾
                            </div>
                          </div>
                        </div>

                        {/* Expanded responses */}
                        {isExpanded && (
                          <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px' }}>
                            {isLoadingDetail ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>
                            ) : detail?.form_responses?.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {detail.form_responses.map((r: any, idx: number) => (
                                  <div key={idx} style={{ padding: '12px 14px', background: C.s4, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                                    <div style={{ fontSize: 11, color: C.grayd, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                      {r.form_fields?.label || r.field_key?.replace(/_/g, ' ') || 'Field'}
                                    </div>
                                    <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>
                                      {r.value_text || r.value_number || (r.value_bool !== null && r.value_bool !== undefined ? (r.value_bool ? 'Yes' : 'No') : null) || '—'}
                                    </div>
                                    {r.photo_url && (
                                      <div style={{ marginTop: 10 }}>
                                        <img src={r.photo_url} alt="response" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, border: `1px solid ${C.border}`, objectFit: 'cover' }} />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', color: C.grayd, fontSize: 13, padding: '10px 0' }}>No responses recorded.</div>
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
      )}
    </>
  );
}
