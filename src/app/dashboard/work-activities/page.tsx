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
  outlet_name?: string;
  user_id: string;
  users?: { name: string; employee_id?: string; role: string; zones?: { name?: string } };
  activities?: { name: string };
  form_templates?: { name: string };
  city_id?: string;
  zone_id?: string;
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
    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
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

  /* ── Load reference data ── */
  useEffect(() => {
    api.get<any>('/api/v1/admin/users?limit=500').then((r: any) => {
      const arr = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : (Array.isArray(r?.users) ? r.users : []));
      setUsers(arr);
    }).catch(() => {});
    api.get<any>('/api/v1/admin/cities?limit=200').then((r: any) => {
      const arr = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : (Array.isArray(r?.cities) ? r.cities : []));
      setCities(arr);
    }).catch(() => {});
    api.get<any>('/api/v1/admin/zones?limit=500').then((r: any) => {
      const arr = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : (Array.isArray(r?.zones) ? r.zones : []));
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
    return new URLSearchParams(p).toString();
  }, [search, userFilter, cityFilter, zoneFilter, dateFrom, dateTo]);

  /* ── Load FE form activities ── */
  const loadFE = useCallback(async (page = 1) => {
    setFELoading(true);
    setErr('');
    try {
      const qs = buildParams(page);
      const paramsObj = Object.fromEntries(new URLSearchParams(qs));
      const r = await api.getAdminSubmissions(paramsObj);
      const d = r as any;
      const rows = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.submissions) ? d.submissions : []));
      setFEActivities(rows);
      setFETotal(d.total || d.count || rows.length);
      setFEPage(page);
    } catch (e: any) {
      setErr(e.message || 'Failed to load activities');
    } finally {
      setFELoading(false);
    }
  }, [buildParams]);

  /* ── Load Supervisor store visits ── */
  const loadSV = useCallback(async (page = 1) => {
    setSvLoading(true);
    setErr('');
    const qs = buildParams(page);
    try {
      const r = await api.get<any>(`/api/v1/visits/team?${qs}`);
      const d = r as any;
      const rows = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.visits) ? d.visits : []));
      setSvActivities(rows);
      setSvTotal(d?.total || d?.count || rows.length);
      setSvPage(page);
    } catch (e: any) {
      // fallback: try alternative endpoint
      try {
        const r2 = await api.get<any>(`/api/v1/supervisor/visits?${qs}`);
        const d2 = r2 as any;
        const rows2 = Array.isArray(d2) ? d2 : (Array.isArray(d2?.data) ? d2.data : (Array.isArray(d2?.visits) ? d2.visits : []));
        setSvActivities(rows2);
        setSvTotal(d2.total || rows2.length);
        setSvPage(page);
        setErr('');
      } catch {
        setSvActivities([]);
        setSvTotal(0);
      }
    } finally {
      setSvLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (tab === 'fe') loadFE(1);
    else loadSV(1);
  }, [tab, loadFE, loadSV]);

  /* ── Filtered users for dropdown ── */
  const feUsers = users.filter(u => ['executive', 'field_executive', 'field-executive'].includes(u.role));
  const svUsers = users.filter(u => ['supervisor', 'city_manager', 'program_manager'].includes(u.role));
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
        .wa-btn { cursor:pointer; transition:all 0.18s; }
        .wa-btn:hover { opacity:0.82; }
        .wa-row { transition:background 0.12s; }
        .wa-row:hover { background: ${C.s3} !important; }
      `}</style>

      <div style={{ padding: '28px 28px', maxWidth: 1400, margin: '0 auto', fontFamily: "'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: C.white, marginBottom: 4 }}>
            Work Activities
          </div>
          <div style={{ fontSize: 13, color: C.gray }}>
            Field executive form submissions & supervisor store visits
          </div>
        </div>

        {err && (
          <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 11, padding: '11px 16px', fontSize: 13, color: C.red, marginBottom: 18 }}>
            {err}
          </div>
        )}

        {/* Role tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          {([
            { key: 'fe', label: '📋 Field Executives', desc: 'Form Submissions' },
            { key: 'supervisor', label: '🏪 Supervisors', desc: 'Store Visits' },
          ] as const).map(t => (
            <button key={t.key} className="wa-btn" onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px', background: tab === t.key ? C.s3 : 'transparent',
                border: `1px solid ${tab === t.key ? C.border : 'transparent'}`,
                borderRadius: 11, color: tab === t.key ? C.white : C.gray,
                fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, textAlign: 'left' as const,
              }}>
              {t.label}
              <div style={{ fontSize: 11, color: C.grayd, fontWeight: 400, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>

            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</div>
              <input style={baseInp} placeholder="Name, ID…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div>
              <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {tab === 'fe' ? 'Executive' : 'Supervisor'}
              </div>
              <select style={{ ...baseInp, appearance: 'none' as const }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                <option value="">All</option>
                {dropdownUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
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
              <button className="wa-btn" onClick={() => loadFE(fePage)}
                style={{ padding: '8px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 9, fontSize: 13 }}>
                ↻ Refresh
              </button>
            </div>

            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
                {['Executive', 'Form / Activity', 'Outlet', 'Zone', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>

              {feLoading ? (
                <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : feActivities.length === 0 ? (
                <div style={{ padding: 50, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
                  No form submissions found for the selected filters.
                </div>
              ) : (
                feActivities.map((a, i) => (
                  <div key={a.id} className="wa-row"
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '13px 20px', borderBottom: i < feActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>

                    {/* Executive */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: C.greenD, border: `1px solid rgba(0,217,126,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: C.green, flexShrink: 0 }}>
                        {(a.users?.name?.[0] || '?')}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{a.users?.name || a.user_id?.slice(0, 8) || '—'}</div>
                        <div style={{ fontSize: 11, color: C.grayd }}>{a.users?.employee_id || ''}</div>
                      </div>
                    </div>

                    {/* Form / Activity */}
                    <div>
                      <div style={{ fontSize: 13, color: C.white, fontWeight: 500 }}>{a.form_templates?.name || a.activities?.name || '—'}</div>
                      {a.activities?.name && a.form_templates?.name && (
                        <div style={{ fontSize: 11, color: C.grayd }}>{a.activities.name}</div>
                      )}
                    </div>

                    {/* Outlet */}
                    <div style={{ fontSize: 13, color: a.outlet_name ? C.white : C.grayd }}>
                      {a.outlet_name || '—'}
                    </div>

                    {/* Zone */}
                    <div style={{ fontSize: 12, color: C.gray }}>
                      {a.users?.zones?.name || '—'}
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
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>
                  Page {fePage} of {Math.ceil(feTotal / LIMIT)}
                </span>
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
              {/* Header */}
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
                  <div style={{ fontSize: 12 }}>Supervisor store visit data will appear here once recorded through the mobile app.</div>
                </div>
              ) : (
                svActivities.map((v, i) => (
                  <div key={v.id} className="wa-row"
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr', padding: '13px 20px', borderBottom: i < svActivities.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>

                    {/* Supervisor */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: C.blueD, border: `1px solid rgba(62,158,255,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: C.blue, flexShrink: 0 }}>
                        {(v.users?.name?.[0] || '?')}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{v.users?.name || v.user_id?.slice(0, 8) || '—'}</div>
                        <div style={{ fontSize: 11, color: C.grayd }}>{v.users?.employee_id || ''}</div>
                      </div>
                    </div>

                    {/* Outlet */}
                    <div style={{ fontSize: 13, color: v.outlet_name ? C.white : C.grayd }}>
                      {v.outlet_name || '—'}
                      {(v.lat && v.lng) && (
                        <div>
                          <a href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, color: C.blue, textDecoration: 'none' }}>
                            📍 {Number(v.lat).toFixed(4)}, {Number(v.lng).toFixed(4)} ↗
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div style={{ fontSize: 12, color: C.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {v.notes || '—'}
                    </div>

                    {/* Zone */}
                    <div style={{ fontSize: 12, color: C.gray }}>
                      {v.users?.zones?.name || '—'}
                    </div>

                    {/* Time */}
                    <div style={{ fontSize: 12, color: C.grayd }}>
                      <div style={{ color: C.white, fontWeight: 600 }}>{fmt(v.visited_at)}</div>
                      <div>{fmtDate(v.visited_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Supervisor Pagination */}
            {svTotal > LIMIT && !svLoading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="wa-btn" onClick={() => loadSV(svPage - 1)} disabled={svPage <= 1}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage <= 1 ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage <= 1 ? 0.4 : 1 }}>
                  ← Prev
                </button>
                <span style={{ padding: '8px 16px', color: C.gray, fontSize: 13 }}>
                  Page {svPage} of {Math.ceil(svTotal / LIMIT)}
                </span>
                <button className="wa-btn" onClick={() => loadSV(svPage + 1)} disabled={svPage >= Math.ceil(svTotal / LIMIT)}
                  style={{ padding: '8px 16px', background: C.s2, border: `1px solid ${C.border}`, color: svPage >= Math.ceil(svTotal / LIMIT) ? C.grayd : C.white, borderRadius: 9, fontSize: 13, opacity: svPage >= Math.ceil(svTotal / LIMIT) ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
