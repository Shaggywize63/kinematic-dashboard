'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../../lib/api';
import { useClient } from '../../../context/ClientContext';

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

interface FormActivity {
  id: string;
  submitted_at: string;
  outlet_id?: string;
  outlet_name?: string;
  user_id: string;
  users?: { name: string; employee_id?: string; city_id?: string };
  activities?: { name: string };
  check_in_at?: string;
  check_out_at?: string;
  check_in_gps?: string;
  check_out_gps?: string;
  address?: string;
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
    const headers = ['Date', 'Client', 'Executive', 'Employee ID', 'Outlet', 'Activity', 'Check In', 'Check Out', 'Duration', 'Responses'];
    const rows = await Promise.all(groupedData.map(async (group) => {
        const first = group[0];
        const last = group[group.length - 1];
        const checkIn = first.check_in_at || first.submitted_at;
        const checkOut = last.check_out_at || last.submitted_at;
        const duration = calcDuration(checkIn, checkOut);
        
        return group.map(f => [
            fmtDate(f.submitted_at),
            selectedClientId || 'Global',
            f.users?.name || 'Unknown',
            f.users?.employee_id || '-',
            f.outlet_name || '-',
            f.activities?.name || 'Form',
            fmtTime(checkIn),
            fmtTime(checkOut),
            duration || '-',
            'Details View Required'
        ].map(v => `"${v}"`).join(',')).join('\n');
    }));

    const csvContent = headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kinematic_WorkActivities_${dateFrom}_to_${dateTo}.csv`;
    a.click();
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
          style={{ padding: '12px 24px', background: C.accent, borderRadius: '12px', color: C.text, border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 10px 20px rgba(62,158,255,0.2)' }}
        >
          <span>↓</span> Download Report
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

        <div style={{ width: '180px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Activity Type</label>
          <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.text, padding: '4px', borderRadius: '8px', fontSize: '12px', outline: 'none' }}>
            <option value="">All Activities</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ width: '220px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: C.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Search Executive / Store</label>
          <input 
            placeholder="Search..." 
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

      {/* Main Grid: Outlet Visits */}
      <div style={{ display: 'grid', gap: '24px' }}>
        {loading ? (
             <div style={{ padding: '100px', textAlign: 'center', color: C.textSec }}>Loading visit logs...</div>
        ) : groupedData.length === 0 ? (
             <div style={{ padding: '100px', textAlign: 'center', background: C.card, border: `1px dashed ${C.border}`, borderRadius: '24px', color: C.textSec }}>
               <h3 style={{ margin: 0 }}>No Visits Found</h3>
               <p>Try adjusting your date range or selecting a different client.</p>
             </div>
        ) : groupedData.map((group, idx) => {
            const first = group[0];
            const last = group[group.length - 1];
            const checkIn = first.check_in_at || first.submitted_at;
            const checkOut = last.check_out_at || last.submitted_at;
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
                            <div style={{ color: C.textSec, fontSize: '13px', marginTop: '4px', display: 'flex', gap: '12px' }}>
                                <span>👤 {first.users?.name}</span>
                                <span>📅 {fmtDate(first.submitted_at)}</span>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right', minWidth: '140px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.accent, marginBottom: '4px' }}>VISIT PERSISTENCE</div>
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
                                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{f.activities?.name || 'Form Submission'}</div>
                                                <div style={{ fontSize: '11px', color: C.textSec }}>Captured at {fmtTime(f.submitted_at)}</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/submissions?id=${f.id}`, '_blank'); }}
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

    </div>
  );
}
