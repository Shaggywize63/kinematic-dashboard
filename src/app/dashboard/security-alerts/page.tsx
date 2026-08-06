'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { format } from 'date-fns';
import { useTableSort, SortLabel } from '../../../lib/tableSort';

// Inline theme-var styling (app convention). This page previously used Tailwind
// colour utilities (bg-s2 / text-gray-* / border-border) whose tokens are
// hardcoded DARK hex in tailwind.config.ts and never flip with the theme — so
// the whole table was dark-on-dark (invisible) in light mode. Everything colour
// related now reads a CSS var that is defined for both themes in globals.css.
const RED = '#E01E2C';
const PURPLE = '#9B6EFF';
const C = {
  card: 'var(--s2)',
  raise: 'var(--s3)',
  raise2: 'var(--s4)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--text-dim)',
  accent: 'var(--accent)',
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

// Type-aware column sorting reads the raw alert value per column key.
const alertVal = (a: SecurityAlert, key: string): unknown => {
  switch (key) {
    case 'user': return a.user?.name;
    case 'type': return a.type;
    case 'action': return a.action;
    case 'detected': return a.created_at;
    default: return (a as unknown as Record<string, unknown>)[key];
  }
};

const th: React.CSSProperties = { padding: '16px 24px' };
const td: React.CSSProperties = { padding: '16px 24px' };

export default function SecurityAlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { user } = useAuth();
  const limit = 15;
  const { sorted, sort, toggle } = useTableSort<SecurityAlert>(alerts, alertVal, { key: 'detected', dir: 'desc' });

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

  const hover = (on: boolean) => (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = on ? C.raise2 : C.raise;
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>Security Alerts</h1>
          <p className="text-sm mt-1" style={{ color: C.dim }}>Monitoring mock location and VPN violations across the field force.</p>
        </div>
        <button
          onClick={() => fetchAlerts(page)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: C.raise, border: `1px solid ${C.border}`, color: C.text }}
          onMouseEnter={hover(true)}
          onMouseLeave={hover(false)}
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="font-semibold uppercase text-[10px] tracking-wider" style={{ background: C.raise, borderBottom: `1px solid ${C.border}`, color: C.dim }}>
                <th style={th}><SortLabel label="Field Executive" sortKey="user" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Violation Type" sortKey="type" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Action Attempted" sortKey="action" sort={sort} onToggle={toggle} /></th>
                <th style={th}>Location</th>
                <th style={th}><SortLabel label="Detected At" sortKey="detected" sort={sort} onToggle={toggle} /></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center" style={{ color: C.dim }}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `2px solid ${RED}`, borderTopColor: 'transparent' }} />
                      Loading security alerts...
                    </div>
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center" style={{ color: C.dim }}>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl opacity-20">🛡️</span>
                      No security violations detected yet.
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((alert) => (
                  <tr
                    key={alert.id}
                    className="transition-colors"
                    style={{ borderTop: `1px solid ${C.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.raise)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={td}>
                      <div className="font-bold" style={{ color: C.text }}>{alert.user?.name || 'Unknown User'}</div>
                      <div className="text-[11px] uppercase flex items-center gap-2 mt-0.5" style={{ color: C.dim }}>
                        <span className="px-1.5 py-0.5 rounded" style={{ background: C.raise, border: `1px solid ${C.border}` }}>{alert.user?.employee_id || 'N/A'}</span>
                        <span>{alert.user?.zones?.name || 'No Zone'}</span>
                      </div>
                    </td>
                    <td style={td}>
                      {(() => {
                        const col = alert.type === 'MOCK_LOCATION' ? RED : PURPLE;
                        return (
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: `${col}1A`, color: col, border: `1px solid ${col}33` }}>
                            {alert.type.replace('_', ' ')}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="font-medium" style={{ ...td, color: C.dim }}>
                      {alert.action.replace('_', ' ')}
                    </td>
                    <td style={td}>
                      {alert.lat && alert.lng ? (
                        <a
                          href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-[12px] flex items-center gap-1.5"
                          style={{ color: C.accent }}
                        >
                          📍 {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                        </a>
                      ) : (
                        <span className="text-[12px]" style={{ color: C.dim }}>No coordinates</span>
                      )}
                    </td>
                    <td className="font-mono text-[11px]" style={{ ...td, color: C.dim }}>
                      {format(new Date(alert.created_at), 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-6 py-4 flex items-center justify-between" style={{ background: C.raise, borderTop: `1px solid ${C.border}` }}>
            <div className="text-xs" style={{ color: C.dim }}>
              Showing <span className="font-bold" style={{ color: C.text }}>{alerts.length}</span> of <span className="font-bold" style={{ color: C.text }}>{total}</span> alerts
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ background: C.raise, border: `1px solid ${C.border}`, color: C.text }}
                onMouseEnter={hover(true)}
                onMouseLeave={hover(false)}
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ background: C.raise, border: `1px solid ${C.border}`, color: C.text }}
                onMouseEnter={hover(true)}
                onMouseLeave={hover(false)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {[
          { c: C.accent, t: 'Defense Protocol', b: 'All Field Executive actions (Attendance, Forms, Visits) are now protected by real-time mock location and VPN checks.' },
          { c: RED, t: 'Strict Enforcement', b: 'Violations result in an immediate block of the action. The FE cannot proceed until the spoofing app or VPN is disabled.' },
          { c: PURPLE, t: 'Automated Reporting', b: 'Every blocked attempt is immediately reported here with user identity, location, and violation type for HR auditing.' },
        ].map((card) => (
          <div key={card.t} className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${card.c}33`, borderLeft: `4px solid ${card.c}` }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: card.c }}>{card.t}</div>
            <div className="text-sm leading-relaxed" style={{ color: C.dim }}>
              {card.b}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
