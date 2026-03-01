'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface TeamMember {
  user_id: string;
  name: string;
  employee_id?: string;
  zone?: string;
  city?: string;
  checked_in: boolean;
  check_in_time?: string;
  check_out_time?: string;
  on_break: boolean;
  break_count: number;
  total_hours?: number;
  location?: { lat: number; lng: number };
}

type FilterType = 'all' | 'checked_in' | 'not_checked_in' | 'on_break';

function Icon({ d, size = 18, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E01E2C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon d={icon} size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Syne',sans-serif", color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

export default function AttendanceOverview() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchTeam = useCallback(async () => {
    try {
      const res = await apiRequest('/attendance/team');
      setTeam(res.data ?? res ?? []);
      setLastRefresh(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
    const interval = setInterval(fetchTeam, 60000); // auto-refresh every 60s
    return () => clearInterval(interval);
  }, [fetchTeam]);

  const filtered = team.filter(m => {
    const matchesSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.employee_id?.toLowerCase().includes(search.toLowerCase()) || m.zone?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'checked_in' ? (m.checked_in && !m.on_break) :
      filter === 'not_checked_in' ? !m.checked_in :
      filter === 'on_break' ? m.on_break : true;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: team.length,
    checkedIn: team.filter(m => m.checked_in).length,
    onBreak: team.filter(m => m.on_break).length,
    notIn: team.filter(m => !m.checked_in).length,
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    try { return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); }
    catch { return t; }
  };

  const formatHours = (h?: number) => h != null ? `${h.toFixed(1)}h` : '—';

  const statusColor = (m: TeamMember) => m.on_break ? '#FFC940' : m.checked_in ? '#00D97E' : '#E01E2C';
  const statusLabel = (m: TeamMember) => m.on_break ? 'On Break' : m.checked_in ? 'Checked In' : 'Not In';

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, margin: 0 }}>Attendance Overview</h2>
          <p style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>
            Last updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchTeam(); }}
          style={{ background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 10, padding: '9px 16px', color: '#7A8BA0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" size={15} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,30,44,0.1)', border: '1px solid rgba(224,30,44,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, color: '#E01E2C', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Field Execs" value={stats.total} color="#3A9EFF" icon="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z" />
        <StatCard label="Checked In" value={stats.checkedIn} color="#00D97E" icon="M20 6L9 17l-5-5" />
        <StatCard label="On Break" value={stats.onBreak} color="#FFC940" icon="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3M10 1v3M14 1v3" />
        <StatCard label="Not Checked In" value={stats.notIn} color="#E01E2C" icon="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Filters */}
      <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name, ID or zone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 9, padding: '9px 14px', color: '#E8EDF8', fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'checked_in', 'on_break', 'not_checked_in'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filter === f ? '#E01E2C' : '#131B2A', color: filter === f ? '#fff' : '#7A8BA0', transition: 'all 0.15s' }}
            >
              {{ all: 'All', checked_in: 'Checked In', on_break: 'On Break', not_checked_in: 'Not In' }[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1E2D45' }}>
                {['Field Executive', 'Zone / City', 'Status', 'Check-In', 'Check-Out', 'Hours', 'Breaks'].map(h => (
                  <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#2E445E', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#2E445E', fontSize: 14 }}>
                    {team.length === 0 ? 'No team data available' : 'No results match your filter'}
                  </td>
                </tr>
              ) : filtered.map((m, i) => (
                <tr key={m.user_id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #131B2A' : 'none', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#131B2A')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(224,30,44,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: '#E01E2C', flexShrink: 0 }}>
                        {m.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EDF8' }}>{m.name}</div>
                        {m.employee_id && <div style={{ fontSize: 11, color: '#7A8BA0' }}>{m.employee_id}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, color: '#E8EDF8' }}>{m.zone || '—'}</div>
                    {m.city && <div style={{ fontSize: 11, color: '#7A8BA0' }}>{m.city}</div>}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: `${statusColor(m)}18`, color: statusColor(m), fontSize: 12, fontWeight: 700 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(m) }} />
                      {statusLabel(m)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#E8EDF8' }}>{formatTime(m.check_in_time)}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#E8EDF8' }}>{formatTime(m.check_out_time)}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#E8EDF8', fontWeight: 600 }}>{formatHours(m.total_hours)}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#7A8BA0' }}>{m.break_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #131B2A', fontSize: 12, color: '#2E445E' }}>
            Showing {filtered.length} of {team.length} field executives
          </div>
        )}
      </div>
    </div>
  );
}
