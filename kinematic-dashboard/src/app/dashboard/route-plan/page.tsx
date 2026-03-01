'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface FEDeployment {
  user_id: string;
  name: string;
  zone: string;
  status: string;
  location?: string;
  stock_allocated?: number;
  stock_consumed?: number;
  stock_remaining?: number;
  check_in_time?: string;
  total_cc?: number;
  total_ecc?: number;
}

export default function RoutePlanPage() {
  const [deployments, setDeployments] = useState<FEDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attendRes, stockRes] = await Promise.all([
        api.get<any>('/api/v1/attendance/team'),
        api.get<any>('/api/v1/stock/team').catch(() => ({ data: [] })),
      ]);
      const attendance = (attendRes as any).data || attendRes || [];
      const stock = (stockRes as any).data || stockRes || [];

      const merged = attendance.map((fe: any) => {
        const feStock = stock.find((s: any) => s.user_id === fe.user_id || s.fe_id === fe.user_id);
        return {
          ...fe,
          stock_allocated: feStock?.allocated || feStock?.stock_allocated || 0,
          stock_consumed: feStock?.consumed || feStock?.stock_consumed || 0,
          stock_remaining: feStock?.remaining || feStock?.stock_remaining || 0,
        };
      });
      setDeployments(merged);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load deployment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const zones = ['all', ...Array.from(new Set(deployments.map(d => d.zone).filter(Boolean)))];

  const filtered = deployments.filter(d => {
    const matchesZone = zoneFilter === 'all' || d.zone === zoneFilter;
    const matchesSearch = d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.zone?.toLowerCase().includes(search.toLowerCase());
    return matchesZone && matchesSearch;
  });

  const statusColor: Record<string, string> = {
    checked_in: 'bg-green-100 text-green-800',
    on_break: 'bg-yellow-100 text-yellow-800',
    checked_out: 'bg-gray-100 text-gray-800',
    not_checked_in: 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Route Plan</h1>
          <p className="text-sm text-gray-500 mt-1">Field executive deployment overview</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Deployed', value: deployments.length, color: 'text-gray-900' },
          { label: 'Active in Field', value: deployments.filter(d => d.status === 'checked_in').length, color: 'text-green-600' },
          { label: 'Zones Covered', value: new Set(deployments.map(d => d.zone)).size, color: 'text-blue-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex gap-3 flex-wrap">
          <input type="text" placeholder="Search by name or zone..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"/>
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {zones.map(z => <option key={z} value={z}>{z === 'all' ? 'All Zones' : z}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading deployment data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No deployments found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((d, i) => (
              <div key={i}>
                <div className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === d.user_id ? null : d.user_id)}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">
                      {d.name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{d.name}</div>
                      <div className="text-sm text-gray-500">{d.zone} {d.location ? `· ${d.location}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColor[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {d.status?.replace('_', ' ') || 'Unknown'}
                    </span>
                    <span className="text-gray-400 text-sm">{expanded === d.user_id ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expanded === d.user_id && (
                  <div className="px-4 pb-4 bg-gray-50 grid grid-cols-3 gap-4 text-sm">
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-gray-500 mb-1">Check In</div>
                      <div className="font-medium">{d.check_in_time || '—'}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-gray-500 mb-1">CC / ECC</div>
                      <div className="font-medium">{d.total_cc ?? 0} / {d.total_ecc ?? 0}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-gray-500 mb-1">Stock (Alloc/Used/Left)</div>
                      <div className="font-medium">{d.stock_allocated} / {d.stock_consumed} / {d.stock_remaining}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
