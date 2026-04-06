'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { format } from 'date-fns';

const C = {
  red: '#E01E2C', 
  green: '#00D97E', 
  blue: '#3E9EFF', 
  purple: '#9B6EFF',
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  s1: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  white: 'var(--text)',
};

interface SecurityAlert {
  id: string;
  type: 'MOCK_LOCATION' | 'VPN_DETECTED';
  action: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  user: {
    id: string;
    name: string;
    employee_id: string;
    role: string;
    zones?: { name: string };
  };
}

export default function SecurityAlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { user } = useAuth();
  const limit = 15;

  const fetchAlerts = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await api.get<any>(`/api/v1/misc/security/alerts/all?page=${p}&limit=${limit}`);
      const data = res.data?.data || res.data || [];
      setAlerts(Array.isArray(data) ? data : []);
      setTotal(res.data?.totalCount || 0);
    } catch (e) {
      console.error('Failed to fetch security alerts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts(page);
  }, [fetchAlerts, page]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">Monitoring mock location and VPN violations across the field force.</p>
        </div>
        <button 
          onClick={() => fetchAlerts(page)}
          className="px-4 py-2 bg-s3 border border-border rounded-lg text-sm font-medium hover:bg-s4 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="bg-s2 border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-s3/50 border-b border-border text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="px-6 py-4">Field Executive</th>
                <th className="px-6 py-4">Violation Type</th>
                <th className="px-6 py-4">Action Attempted</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Detected At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-red border-t-transparent rounded-full animate-spin" />
                      Loading security alerts...
                    </div>
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl opacity-20">🛡️</span>
                      No security violations detected yet.
                    </div>
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{alert.user?.name || 'Unknown User'}</div>
                      <div className="text-[11px] text-gray-500 uppercase flex items-center gap-2 mt-0.5">
                        <span className="bg-s3 px-1.5 py-0.5 rounded border border-border">{alert.user?.employee_id || 'N/A'}</span>
                        <span>{alert.user?.zones?.name || 'No Zone'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        alert.type === 'MOCK_LOCATION' 
                          ? 'bg-red/10 text-red border border-red/20' 
                          : 'bg-purple/10 text-purple border border-purple/20'
                      }`}>
                        {alert.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-300">
                      {alert.action.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4">
                      {alert.lat && alert.lng ? (
                        <a 
                          href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-blue hover:underline text-[12px] flex items-center gap-1.5"
                        >
                          📍 {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                        </a>
                      ) : (
                        <span className="text-gray-600 text-[12px]">No coordinates</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-400 font-mono text-[11px]">
                      {format(new Date(alert.created_at), 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-6 py-4 bg-s3/30 border-t border-border flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Showing <span className="text-white font-bold">{alerts.length}</span> of <span className="text-white font-bold">{total}</span> alerts
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 bg-s3 border border-border rounded-lg text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-s4 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 bg-s3 border border-border rounded-lg text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-s4 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        <div className="bg-s2 border border-blue/20 rounded-2xl p-5 border-l-4 border-l-blue">
          <div className="text-[10px] font-bold text-blue uppercase tracking-widest mb-1">Defense Protocol</div>
          <div className="text-sm text-gray-300 leading-relaxed">
            All Field Executive actions (Attendance, Forms, Visits) are now protected by real-time mock location and VPN checks.
          </div>
        </div>
        <div className="bg-s2 border border-red/20 rounded-2xl p-5 border-l-4 border-l-red">
          <div className="text-[10px] font-bold text-red uppercase tracking-widest mb-1">Strict Enforcement</div>
          <div className="text-sm text-gray-300 leading-relaxed">
            Violations result in an immediate block of the action. The FE cannot proceed until the spoofing app or VPN is disabled.
          </div>
        </div>
        <div className="bg-s2 border border-purple/20 rounded-2xl p-5 border-l-4 border-l-purple">
          <div className="text-[10px] font-bold text-purple uppercase tracking-widest mb-1">Automated Reporting</div>
          <div className="text-sm text-gray-300 leading-relaxed">
            Every blocked attempt is immediately reported here with user identity, location, and violation type for HR auditing.
          </div>
        </div>
      </div>
    </div>
  );
}
