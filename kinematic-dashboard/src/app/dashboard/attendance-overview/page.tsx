'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface TeamMember {
  user_id: string;
  name: string;
  zone: string;
  status: 'checked_in' | 'on_break' | 'checked_out' | 'not_checked_in';
  check_in_time?: string;
  check_out_time?: string;
  hours_worked?: number;
  total_cc?: number;
  total_ecc?: number;
}

export default function AttendanceOverviewPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: TeamMember[] }>('/api/v1/attendance/team');
      const d = res as any;
      setMembers(d.data || d || []);
      setLastUpdated(new Date());
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = members.filter(m => {
    const matchesFilter = filter === 'all' || m.status === filter;
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.zone?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: members.length,
    checked_in: members.filter(m => m.status === 'checked_in').length,
    on_break: members.filter(m => m.status === 'on_break').length,
    not_checked_in: members.filter(m => m.status === 'not_checked_in').length,
  };

  const statusColor: Record<string, string> = {
    checked_in: 'bg-green-100 text-green-800',
    on_break: 'bg-yellow-100 text-yellow-800',
    checked_out: 'bg-gray-100 text-gray-800',
    not_checked_in: 'bg-red-100 text-red-800',
  };

  const statusLabel: Record<string, string> = {
    checked_in: 'Checked In',
    on_break: 'On Break',
    checked_out: 'Checked Out',
    not_checked_in: 'Not Checked In',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live field executive attendance · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total FEs', value: stats.total, color: 'text-gray-900' },
          { label: 'Checked In', value: stats.checked_in, color: 'text-green-600' },
          { label: 'On Break', value: stats.on_break, color: 'text-yellow-600' },
          { label: 'Not Checked In', value: stats.not_checked_in, color: 'text-red-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search by name or zone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
          />
          {['all', 'checked_in', 'on_break', 'not_checked_in'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f === 'all' ? 'All' : statusLabel[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading attendance data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No records found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Check In</th>
                <th className="px-4 py-3 text-left">Hours</th>
                <th className="px-4 py-3 text-left">CC</th>
                <th className="px-4 py-3 text-left">ECC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((m, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{m.zone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColor[m.status] || 'bg-gray-100 text-gray-800'}`}>
                      {statusLabel[m.status] || m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.check_in_time || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.hours_worked != null ? `${m.hours_worked.toFixed(1)}h` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.total_cc ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.total_ecc ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
