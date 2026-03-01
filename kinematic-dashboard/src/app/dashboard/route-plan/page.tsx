'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface TeamAttendance {
  user_id: string;
  name: string;
  employee_id?: string;
  zone?: string;
  city?: string;
  checked_in: boolean;
  on_break: boolean;
  total_hours?: number;
}

interface TeamStock {
  user_id: string;
  user_name?: string;
  employee_id?: string;
  allocation_id?: string;
  items?: Array<{ name: string; qty: number; status: string }>;
  total_allocated?: number;
  total_accepted?: number;
}

interface FEPlan {
  user_id: string;
  name: string;
  employee_id?: string;
  zone?: string;
  city?: string;
  checked_in: boolean;
  on_break: boolean;
  total_hours?: number;
  stock_allocated?: number;
  stock_accepted?: number;
  stock_items?: Array<{ name: string; qty: number; status: string }>;
}

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

export default function RoutePlan() {
  const [plans, setPlans] = useState<FEPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attendanceRes, stockRes] = await Promise.allSettled([
        apiRequest('/attendance/team'),
        apiRequest('/stock/team'),
      ]);

      const attendance: TeamAttendance[] = attendanceRes.status === 'fulfilled'
        ? (attendanceRes.value.data ?? attendanceRes.value ?? [])
        : [];

      const stockData: TeamStock[] = stockRes.status === 'fulfilled'
        ? (stockRes.value.data ?? stockRes.value ?? [])
        : [];

      // Merge attendance with stock
      const merged: FEPlan[] = attendance.map(fe => {
        const stock = stockData.find(s => s.user_id === fe.user_id);
        return {
          ...fe,
          stock_allocated: stock?.total_allocated ?? 0,
          stock_accepted: stock?.total_accepted ?? 0,
          stock_items: stock?.items ?? [],
        };
      });

      setPlans(merged);

      if (attendanceRes.status === 'rejected' && stockRes.status === 'rejected') {
        setError('Failed to load team data. Check your connection.');
      } else {
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load route plan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const zones = ['all', ...Array.from(new Set(plans.map(p => p.zone).filter(Boolean))) as string[]];

  const filtered = plans.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.employee_id?.toLowerCase().includes(search.toLowerCase());
    const matchZone = zoneFilter === 'all' || p.zone === zoneFilter;
    return matchSearch && matchZone;
  });

  const stats = {
    total: plans.length,
    active: plans.filter(p => p.checked_in && !p.on_break).length,
    stockReady: plans.filter(p => (p.stock_accepted ?? 0) > 0).length,
    zones: new Set(plans.map(p => p.zone).filter(Boolean)).size,
  };

  const statusColor = (p: FEPlan) => p.on_break ? '#FFC940' : p.checked_in ? '#00D97E' : '#E01E2C';
  const statusLabel = (p: FEPlan) => p.on_break ? 'On Break' : p.checked_in ? 'Active' : 'Not Started';

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, margin: 0 }}>Route Plan</h2>
          <p style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>Today's field deployment — team status & stock</p>
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }}
          style={{ background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 10, padding: '9px 16px', color: '#7A8BA0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Deployed', value: stats.total, color: '#3A9EFF', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z' },
          { label: 'Active in Field', value: stats.active, color: '#00D97E', icon: 'M20 6L9 17l-5-5' },
          { label: 'Stock Deployed', value: stats.stockReady, color: '#FFC940', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8' },
          { label: 'Zones Covered', value: stats.zones, color: '#AB6DFF', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon d={s.icon} size={20} color={s.color} />
            </div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name or employee ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 9, padding: '9px 14px', color: '#E8EDF8', fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {zones.map(z => (
            <button key={z} onClick={() => setZoneFilter(z)}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: zoneFilter === z ? '#E01E2C' : '#131B2A', color: zoneFilter === z ? '#fff' : '#7A8BA0', transition: 'all 0.15s' }}>
              {z === 'all' ? 'All Zones' : z}
            </button>
          ))}
        </div>
      </div>

      {/* FE Cards */}
      {filtered.length === 0 ? (
        <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 48, textAlign: 'center', color: '#2E445E', fontSize: 14 }}>
          {plans.length === 0 ? 'No team data available' : 'No field executives match your filter'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(fe => {
            const isExpanded = expanded === fe.user_id;
            const sc = statusColor(fe);
            return (
              <div key={fe.user_id} style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                {/* Row */}
                <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : fe.user_id)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#131B2A')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(224,30,44,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: '#E01E2C', flexShrink: 0 }}>
                    {fe.name[0]}
                  </div>

                  {/* Name + zone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#E8EDF8' }}>{fe.name}</div>
                    <div style={{ fontSize: 12, color: '#7A8BA0', marginTop: 2 }}>
                      {fe.employee_id && <span>{fe.employee_id} · </span>}
                      {fe.zone || 'No zone'}{fe.city ? ` · ${fe.city}` : ''}
                    </div>
                  </div>

                  {/* Status */}
                  <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${sc}18`, color: sc, whiteSpace: 'nowrap' }}>
                    {statusLabel(fe)}
                  </span>

                  {/* Hours */}
                  <div style={{ textAlign: 'right', minWidth: 60 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: '#E8EDF8' }}>
                      {fe.total_hours != null ? `${fe.total_hours.toFixed(1)}h` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A8BA0' }}>today</div>
                  </div>

                  {/* Stock */}
                  <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: '#FFC940' }}>
                      {fe.stock_accepted ?? 0}/{fe.stock_allocated ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A8BA0' }}>stock</div>
                  </div>

                  {/* Expand chevron */}
                  <div style={{ color: '#2E445E', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <Icon d="M19 9l-7 7-7-7" size={16} />
                  </div>
                </div>

                {/* Expanded: stock detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #131B2A', padding: '16px 18px', background: '#090D16' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#2E445E', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>Stock Allocation</div>
                    {!fe.stock_items || fe.stock_items.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#2E445E' }}>No stock allocated</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {fe.stock_items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0E1420', borderRadius: 10, padding: '10px 14px' }}>
                            <span style={{ fontSize: 13, color: '#E8EDF8' }}>{item.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8EDF8' }}>{item.qty} units</span>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: item.status === 'accepted' ? 'rgba(0,217,126,0.12)' : item.status === 'rejected' ? 'rgba(224,30,44,0.12)' : 'rgba(255,201,64,0.12)', color: item.status === 'accepted' ? '#00D97E' : item.status === 'rejected' ? '#E01E2C' : '#FFC940' }}>
                                {item.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
