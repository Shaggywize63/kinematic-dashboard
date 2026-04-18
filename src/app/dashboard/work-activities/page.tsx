'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../../lib/api';
import { useClient } from '../../../context/ClientContext';
import { extractImageUrls } from '../../../lib/utils';

// design tokens
const C = {
  bg: 'var(--bg)',
  card: 'var(--s1)',
  cardH: 'var(--s2)',
  border: 'var(--border)',
  accent: 'var(--primary)',
  accentD: 'rgba(224, 30, 44, 0.1)',
  text: 'var(--text)',
  textSec: 'var(--text-dim)',
  textTert: 'var(--text-dim)',
  green: 'var(--green)',
  red: 'var(--primary)',
};

interface User { id: string; name: string; employee_id?: string; role: string; city_id?: string; }
interface City { id: string; name: string; }
interface Zone { id: string; name: string; city_id?: string; }

interface FormAnswer {
  question_id?: string;
  label: string;
  qtype: string;
  value: any;
  display?: string;
}

interface FormActivity {
  id: string;
  submitted_at: string;
  outlet_id?: string;
  outlet_name?: string;
  user_id: string;
  users?: { name: string; employee_id?: string; city_id?: string };
  activities?: { name: string };
  builder_forms?: { id: string; title: string };
  check_in_at?: string;
  check_out_at?: string;
  check_in_gps?: string;
  check_out_gps?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  answers?: FormAnswer[];
  form_responses?: any[];
}

function fmtTime(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderAnswerValue(
  answer: FormAnswer,
  onImageClick?: (urls: string[], index: number) => void
) {
  const { qtype, value, display } = answer;

  // Image/signature: always render visually — check qtype BEFORE display,
  // because the edge function sets display to the raw URL string which would
  // otherwise be returned as plain text.
  if (qtype === 'image' || qtype === 'signature' || qtype === 'photo' || qtype === 'camera') {
    // value may be a URL string, array of URLs, or object/array with .url field.
    // Also accept display as a URL fallback when value is missing.
    const src = value ?? display;
    const urls = extractImageUrls(src);
    if (urls.length === 0) return '—';
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        {urls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`${qtype} ${i + 1}`}
            style={{ height: '90px', width: '110px', borderRadius: '8px', objectFit: 'cover', cursor: 'pointer', border: '2px solid var(--border)', transition: 'transform 0.15s' }}
            onClick={() => onImageClick ? onImageClick(urls, i) : window.open(url, '_blank')}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>
    );
  }

  if (display && display !== '—') return display;
  if (value === null || value === undefined || value === '') return '—';
  if (qtype === 'file') {
    const url = typeof value === 'string' ? value : (value?.url ?? null);
    return url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>View File</a> : '—';
  }
  if (qtype === 'rating') return `${'★'.repeat(Number(value) || 0)}${'☆'.repeat(Math.max(0, 5 - (Number(value) || 0)))} (${value})`;
  if (qtype === 'checkbox' && Array.isArray(value)) return value.join(', ') || '—';
  if (qtype === 'yes_no' || qtype === 'consent') return value === true || value === 'true' || value === 'Yes' ? '✓ Yes' : '✗ No';
  if (qtype === 'location' && typeof value === 'object') return `${value.lat ?? value.latitude ?? ''},${value.lng ?? value.longitude ?? ''}`;
  if (qtype === 'section_header') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function calcDuration(start?: string, end?: string) {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const diff = e - s;
  if (diff <= 0) return '0m';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}

/* ── Activity View Wrap ───────────────────────────────────────── */
export default function WorkActivitiesPage() {
  const { selectedClientId } = useClient();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FormActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Static Metadata
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  
  // Default to showing last 3 days to ensure April 9th is visible
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [activityFilter, setActivityFilter] = useState('');

  // UI State
  const [expandedOutlet, setExpandedOutlet] = useState<string | null>(null);
  const [detailedSub, setDetailedSub] = useState<any>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  // Initial Data
  useEffect(() => {
    const cid = selectedClientId || '';
    api.getUsers({ limit: '500', client_id: cid }).then((r: any) => setUsers(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
    api.getCities({ limit: '200', client_id: cid }).then((r: any) => setCities(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
    api.getActivities({ client_id: cid }).then((r: any) => setActivities(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
  }, [selectedClientId]);

  // Main Load
  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = {
        page: String(p),
        limit: String(LIMIT),
        client_id: selectedClientId || 'Kinematic',
        date_from: dateFrom,
        date_to: dateTo,
        search,
        user_id: userFilter,
        city_id: cityFilter,
        activity_id: activityFilter
      };
      const res: any = await api.getAdminSubmissions(params);
      // Backend returns { success: true, data: { data: [], pagination: {} } }
      const rows = res?.data?.data || res?.data || res?.submissions || [];
      setData(Array.isArray(rows) ? rows : []);
      setTotal(res?.data?.pagination?.total || rows.length || 0);
      setPage(p);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, dateFrom, dateTo, search, userFilter, cityFilter, activityFilter]);

  useEffect(() => { loadData(1); }, [loadData]);

  // Grouping Logic: (Outlet + User + Date)
  const groupedData = useMemo(() => {
    const map = new Map<string, FormActivity[]>();
    data.forEach(item => {
      const datePart = item.submitted_at?.split('T')[0] || '1970-01-01';
      const key = `${item.outlet_name || 'Individual'}_${item.user_id}_${datePart}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.values());
  }, [data]);

  const downloadReport = async () => {
    if (!data.length) return;
    setReportLoading(true);
    try {
        const params: any = {
            client_id: selectedClientId || 'Kinematic',
            date_from: dateFrom,
            date_to: dateTo,
            search,
            user_id: userFilter,
            city_id: cityFilter,
            activity_id: activityFilter,
            include_responses: 'true',
            limit: '1000'
        };
        const res: any = await api.getAdminSubmissions(params);
        const fullData = res?.data?.data || res?.data || [];
        
        const headers = ['Date', 'Client', 'Executive', 'Employee ID', 'Outlet', 'Activity', 'Address', 'Check In GPS', 'Check Out GPS', 'Check In Time', 'Check Out Time', 'Responses'];
        
        const csvRows = fullData.map((f: any) => {
            const responsesStr = (f.form_responses || []).map((r: any) => 
                `${r.builder_questions?.label || 'Q'}: ${r.value_text || r.value_number || r.value_bool || '—'}`
            ).join(' | ');

            return [
                fmtDate(f.submitted_at),
                selectedClientId || 'Global',
                f.users?.name || 'Unknown',
                f.users?.employee_id || '-',
                f.outlet_name || '-',
                f.activities?.name || 'Form',
                f.address || '-',
                f.check_in_gps || (f.latitude + ',' + f.longitude) || '-',
                f.check_out_gps || '-',
                fmtTime(f.check_in_at || f.submitted_at),
                fmtTime(f.check_out_at || f.submitted_at),
                responsesStr
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = headers.join(',') + '\n' + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kinematic_WorkActivities_${dateFrom}_to_${dateTo}.csv`;
        a.click();
    } catch (err) {
        console.error('Report Error:', err);
    } finally {
        setReportLoading(false);
    }
  };

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "var(--font-dm-sans)" }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: 0, letterSpacing: '-1px', fontFamily: 'var(--font-syne)' }}>Work Activities</h1>
          <p style={{ color: C.textSec, marginTop: '8px', fontSize: '14px' }}>Analyze field submissions grouped by outlet visits and track duration.</p>
        </div>
        <button 
          onClick={downloadReport}
          disabled={reportLoading}
          style={{ padding: '12px 24px', background: reportLoading ? C.card : C.accent, borderRadius: '12px', color: C.text, border: 'none', fontWeight: 700, cursor: reportLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 10px 20px rgba(62,158,255,0.2)' }}
        >
          <span>↓</span> {reportLoading ? 'Preparing Report...' : 'Download Report'}
        </button>
      </div>

      {/* Universal Sticky Filter Bar */}
      <div style={{ position: 'sticky', top: '16px', zIndex: 100, background: 'rgba(22, 25, 31, 0.8)', backdropFilter: 'blur(20px)', border: `1px solid ${C.border}`, borderRadius: '20px', padding: '16px 24px', display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Date Window</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px 8px', borderRadius: '8px', fontSize: '12px' }} />
            <span style={{ color: C.textTert }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px 8px', borderRadius: '8px', fontSize: '12px' }} />
          </div>
        </div>

        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>City</label>
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px', borderRadius: '8px', fontSize: '12px', outline: 'none' }}>
            <option value="">All Cities</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Executive</label>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px', borderRadius: '8px', fontSize: '12px', outline: 'none' }}>
            <option value="">All Executives</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Activity Type</label>
          <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px', borderRadius: '8px', fontSize: '12px', outline: 'none' }}>
            <option value="">All Activities</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ width: '180px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Search Store</label>
          <input 
            placeholder="Search store..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '6px 12px', borderRadius: '8px', fontSize: '12px', outline: 'none' }} 
          />
        </div>

        {selectedClientId === 'Kinematic' && (
           <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: '20px' }}>
             <span style={{ padding: '6px 12px', background: C.red, borderRadius: '8px', fontSize: '10px', fontWeight: 900 }}>GLOBAL VIEW</span>
           </div>
        )}
      </div>

      <div style={{ marginBottom: '16px', fontSize: '11px', color: C.textSec, background: C.card, padding: '8px 16px', borderRadius: '10px', display: 'flex', gap: '16px', border: `1px solid ${C.border}` }}>
          <span><b>ACTIVE FILTERS:</b></span>
          <span>Date: {dateFrom} to {dateTo}</span>
          {cityFilter && <span>City: {cities.find(c => c.id === cityFilter)?.name || cityFilter}</span>}
          {userFilter && <span>Exec: {users.find(u => u.id === userFilter)?.name || userFilter} ({userFilter.slice(0, 6)})</span>}
          {search && <span>Store: {search}</span>}
          <span style={{ marginLeft: 'auto', color: C.accent }}>API Status: {loading ? 'FETCHING...' : 'READY'} | Records: {total}</span>
      </div>

      {/* Main Grid: Outlet Visits */}
      <div style={{ display: 'grid', gap: '24px' }}>
        {loading ? (
             <div style={{ padding: '100px', textAlign: 'center', color: C.textSec }}>Loading visit logs...</div>
        ) : groupedData.length === 0 ? (
             <div style={{ padding: '100px', textAlign: 'center', background: C.card, border: `1px dashed ${C.border}`, borderRadius: '24px', color: C.textSec }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>No Visits Found</div>
                <div style={{ color: C.textSec, marginTop: '8px', maxWidth: '300px', margin: '8px auto' }}>
                  No submissions found for the selected filters. {dateFrom === dateTo ? `Checking ${fmtDate(dateFrom)} only.` : `Checking from ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}.`}
                </div>
                <button 
                  onClick={() => {
                    setSearch(''); setCityFilter(''); setUserFilter(''); setActivityFilter('');
                    const d = new Date(); d.setDate(d.getDate() - 2); setDateFrom(d.toISOString().split('T')[0]);
                    setDateTo(new Date().toISOString().split('T')[0]);
                  }}
                  style={{ marginTop: '20px', padding: '8px 20px', background: 'transparent', border: `1px solid ${C.accent}`, borderRadius: '8px', color: C.accent, cursor: 'pointer', fontWeight: 600 }}
                >
                  Clear All Filters
                </button>
             </div>
        ) : groupedData.map((group, idx) => {
            const first = group[0];
            const last = group[group.length - 1];
            
            // Calculate the earliest possible start and latest possible end for the visit
            const allStarts = group.flatMap(f => [f.check_in_at, f.submitted_at]).filter(Boolean).map(t => new Date(t!).getTime());
            const allEnds = group.flatMap(f => [f.check_out_at, f.submitted_at]).filter(Boolean).map(t => new Date(t!).getTime());
            
            const startLimit = allStarts.length ? new Date(Math.min(...allStarts)).toISOString() : first.submitted_at;
            const endLimit = allEnds.length ? new Date(Math.max(...allEnds)).toISOString() : (last.check_out_at || last.submitted_at);
            
            const checkIn = startLimit;
            const checkOut = endLimit;
            const duration = calcDuration(checkIn, checkOut);
            const isExpanded = expandedOutlet === `${idx}`;

            return (
                <div 
                  key={idx} 
                  style={{ background: C.card, borderRadius: '24px', border: `1px solid ${isExpanded ? C.accent : C.border}`, overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)' }}
                >
                    {/* Outlet Header */}
                    <div 
                      onClick={() => setExpandedOutlet(isExpanded ? null : `${idx}`)}
                      style={{ padding: '24px 32px', display: 'flex', alignItems: 'center', gap: '32px', cursor: 'pointer' }}
                    >
                        <div style={{ width: '56px', height: '56px', background: C.accentD, color: C.accent, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>🏪</div>
                        
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{first.outlet_name || 'Individual Visit'}</div>
                            <div style={{ color: C.textSec, fontSize: '13px', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <span>👤 {first.users?.name}</span>
                                <span>📅 {fmtDate(first.submitted_at)}</span>
                                <span style={{ opacity: 0.8 }}>📍 {first.address || 'Location Saved'}</span>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right', minWidth: '140px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.accent, marginBottom: '4px' }}>VISIT DURATION</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: C.green }}>{duration || 'Processing'}</div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', textAlign: 'right', borderLeft: `1px solid ${C.border}`, paddingLeft: '32px' }}>
                            <div>
                                <div style={{ fontSize: '9px', color: C.textSec }}>CHECK IN</div>
                                <div style={{ fontWeight: 700 }}>{fmtTime(checkIn)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '9px', color: C.textSec }}>LAST OUT</div>
                                <div style={{ fontWeight: 700 }}>{fmtTime(checkOut)}</div>
                            </div>
                        </div>

                        <div style={{ fontSize: '24px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.4s' }}>⌄</div>
                    </div>

                    {/* Expandable Form Details */}
                    {isExpanded && (
                        <div style={{ background: C.bg, padding: '32px', borderTop: `1px solid ${C.border}` }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <h4 style={{ margin: 0, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '2px', color: C.textSec }}>Submissions ({group.length})</h4>
                             </div>
                             
                             <div style={{ display: 'grid', gap: '16px' }}>
                                {group.map((f, fIdx) => (
                                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: C.card, borderRadius: '12px', border: `1px solid ${C.border}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ width: '8px', height: '8px', background: C.accent, borderRadius: '50%' }} />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{f.builder_forms?.title || f.activities?.name || 'Form Submission'}</div>
                                                <div style={{ fontSize: '11px', color: C.textSec }}>Captured at {fmtTime(f.submitted_at)}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingId(f.id);
                                                setDetailedSub(f);
                                            }}
                                            style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.accent}`, borderRadius: '6px', color: C.accent, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            View Data
                                        </button>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}
                </div>
            )
        })}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '48px' }}>
              <button disabled={page === 1} onClick={() => loadData(page - 1)} style={{ padding: '10px 20px', background: C.card, borderRadius: '10px', border: `1px solid ${C.border}`, color: page === 1 ? C.textTert : C.text, cursor: page === 1 ? 'default' : 'pointer' }}>Previous</button>
              <div style={{ alignSelf: 'center', fontSize: '14px', fontWeight: 600 }}>Page {page} of {Math.ceil(total / LIMIT)}</div>
              <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => loadData(page + 1)} style={{ padding: '10px 20px', background: C.card, borderRadius: '10px', border: `1px solid ${C.border}`, color: page >= Math.ceil(total / LIMIT) ? C.textTert : C.text, cursor: page >= Math.ceil(total / LIMIT) ? 'default' : 'pointer' }}>Next</button>
          </div>
      )}

      {/* detail modal */}
      {detailedSub && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} onClick={() => { setDetailedSub(null); setViewingId(null); }}>
              <div style={{ background: C.card, width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '24px', border: `1px solid ${C.border}`, padding: '40px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
                      <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Submission Details</h2>
                      <button onClick={() => { setDetailedSub(null); setViewingId(null); }} style={{ background: 'transparent', border: 'none', color: C.textSec, cursor: 'pointer', fontSize: '24px' }}>×</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }}>
                      <div style={{ padding: '16px', background: C.bg, borderRadius: '12px' }}>
                          <div style={{ fontSize: '10px', color: C.accent, fontWeight: 800 }}>EXECUTIVE</div>
                          <div style={{ fontWeight: 700 }}>{detailedSub.users?.name || 'FE'}</div>
                      </div>
                      <div style={{ padding: '16px', background: C.bg, borderRadius: '12px' }}>
                          <div style={{ fontSize: '10px', color: C.accent, fontWeight: 800 }}>OUTLET</div>
                          <div style={{ fontWeight: 700 }}>{detailedSub.outlet_name || 'Individual'}</div>
                      </div>
                      <div style={{ padding: '16px', background: C.bg, borderRadius: '12px' }}>
                          <div style={{ fontSize: '10px', color: C.accent, fontWeight: 800 }}>ADDRESS</div>
                          <div style={{ fontWeight: 700, fontSize: '12px' }}>{detailedSub.address || 'GPS Only'}</div>
                      </div>
                      <div style={{ padding: '16px', background: C.bg, borderRadius: '12px' }}>
                          <div style={{ fontSize: '10px', color: C.accent, fontWeight: 800 }}>CHECK-IN GPS</div>
                          <div style={{ fontWeight: 700, fontSize: '11px' }}>{detailedSub.check_in_gps || detailedSub.latitude + ',' + detailedSub.longitude || '—'}</div>
                      </div>
                      <div style={{ padding: '16px', background: C.bg, borderRadius: '12px' }}>
                          <div style={{ fontSize: '10px', color: C.accent, fontWeight: 800 }}>CHECK-OUT GPS</div>
                          <div style={{ fontWeight: 700, fontSize: '11px' }}>{detailedSub.check_out_gps || 'Same as entry'}</div>
                      </div>
                  </div>

                  <h3 style={{ fontSize: '12px', letterSpacing: '2px', color: C.textSec, marginBottom: '20px' }}>
                      {detailedSub.builder_forms?.title ? `FORM: ${detailedSub.builder_forms.title}` : 'FORM RESPONSES'}
                  </h3>
                  <div style={{ display: 'grid', gap: '12px' }}>
                      {(detailedSub.answers && detailedSub.answers.length > 0)
                          ? detailedSub.answers
                              .filter((a: FormAnswer) => a.qtype !== 'section_header')
                              .map((a: FormAnswer, idx: number) => {
                                  const rendered = renderAnswerValue(a, (urls, i) => setLightbox({ urls, index: i }));
                                  if (rendered === null) return null;
                                  return (
                                      <div key={idx} style={{ padding: '20px', background: C.bg, borderRadius: '16px', border: `1px solid ${C.border}` }}>
                                          <div style={{ fontSize: '13px', fontWeight: 600, color: C.textSec, marginBottom: '8px' }}>{a.label || 'Question'}</div>
                                          <div style={{ fontWeight: 700, fontSize: '15px' }}>{rendered}</div>
                                      </div>
                                  );
                              })
                           : (detailedSub.form_responses && detailedSub.form_responses.length > 0)
                           ? detailedSub.form_responses.map((r: any, idx: number) => {
                               const answer: FormAnswer = {
                                   label: r.builder_questions?.label || 'Question',
                                   qtype: r.builder_questions?.qtype || r.qtype || 'text',
                                   value: r.value_text ?? r.value_number ?? r.value_bool ?? null,
                                   display: (r.value_text ?? r.value_number ?? r.value_bool ?? '—').toString()
                               };
                               const rendered = renderAnswerValue(answer, (urls, i) => setLightbox({ urls, index: i }));
                               if (rendered === null) return null;
                               return (
                                   <div key={idx} style={{ padding: '20px', background: C.bg, borderRadius: '16px', border: `1px solid ${C.border}` }}>
                                       <div style={{ fontSize: '13px', fontWeight: 600, color: C.textSec, marginBottom: '8px' }}>{answer.label}</div>
                                       <div style={{ fontWeight: 700, fontSize: '15px' }}>{rendered}</div>
                                   </div>
                               );
                           })
                          : <div style={{ padding: '20px', color: C.textSec, fontSize: '13px', textAlign: 'center' }}>No form responses recorded.</div>
                      }
                  </div>
              </div>
          </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightbox(null)}
        >
          {/* Close */}
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: '20px', right: '28px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
          >×</button>

          {/* Counter */}
          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
              {lightbox.index + 1} / {lightbox.urls.length}
            </div>
          )}

          {/* Prev */}
          {lightbox.urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : null); }}
              style={{ position: 'absolute', left: '20px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >‹</button>
          )}

          {/* Image */}
          <img
            src={lightbox.urls[lightbox.index]}
            alt={`Image ${lightbox.index + 1}`}
            style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          {lightbox.urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : null); }}
              style={{ position: 'absolute', right: '20px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >›</button>
          )}

          {/* Thumbnail strip for multi-image */}
          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
              {lightbox.urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`thumb ${i + 1}`}
                  onClick={() => setLightbox(lb => lb ? { ...lb, index: i } : null)}
                  style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: i === lightbox.index ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)', opacity: i === lightbox.index ? 1 : 0.55, transition: 'all 0.15s' }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
