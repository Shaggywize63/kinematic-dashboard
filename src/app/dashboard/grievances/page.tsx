'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface Grievance {
  id: string;
  user_id: string;
  user_name?: string;
  employee_id?: string;
  type: string;
  against?: string;
  incident_date?: string;
  details: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  admin_remarks?: string;
  created_at: string;
  updated_at?: string;
}

const STATUS_CONFIG = {
  pending:      { label: 'Pending',      color: '#FFC940', bg: 'rgba(255,201,64,0.12)' },
  under_review: { label: 'Under Review', color: '#3A9EFF', bg: 'rgba(58,158,255,0.12)' },
  resolved:     { label: 'Resolved',     color: '#00D97E', bg: 'rgba(0,217,126,0.12)' },
  dismissed:    { label: 'Dismissed',    color: '#7A8BA0', bg: 'rgba(122,139,160,0.12)' },
};

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

export default function Grievances() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Grievance | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updating, setUpdating] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [newStatus, setNewStatus] = useState<string>('');

  const fetchGrievances = useCallback(async () => {
    try {
      const res = await apiRequest('/grievances/admin');
      setGrievances(res.data ?? res ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load grievances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGrievances(); }, [fetchGrievances]);

  const updateStatus = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      await apiRequest(`/grievances/admin/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, admin_remarks: adminRemarks }),
      });
      setGrievances(prev => prev.map(g => g.id === selected.id ? { ...g, status: newStatus as any, admin_remarks: adminRemarks } : g));
      setSelected(prev => prev ? { ...prev, status: newStatus as any, admin_remarks: adminRemarks } : null);
      setNewStatus('');
      setAdminRemarks('');
    } catch (err: any) {
      alert(err.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = statusFilter === 'all' ? grievances : grievances.filter(g => g.status === statusFilter);

  const counts = {
    total: grievances.length,
    pending: grievances.filter(g => g.status === 'pending').length,
    under_review: grievances.filter(g => g.status === 'under_review').length,
    resolved: grievances.filter(g => g.status === 'resolved').length,
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, margin: 0 }}>Grievances</h2>
        <p style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>Confidential complaints — visible to admins only</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,30,44,0.1)', border: '1px solid rgba(224,30,44,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, color: '#E01E2C', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total', value: counts.total, color: '#3A9EFF' },
          { label: 'Pending', value: counts.pending, color: '#FFC940' },
          { label: 'Under Review', value: counts.under_review, color: '#3A9EFF' },
          { label: 'Resolved', value: counts.resolved, color: '#00D97E' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pending', 'under_review', 'resolved', 'dismissed'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === f ? '#E01E2C' : '#0E1420', color: statusFilter === f ? '#fff' : '#7A8BA0', border: statusFilter === f ? 'none' : '1px solid #1E2D45', transition: 'all 0.15s' }}>
            {{ all: 'All', pending: 'Pending', under_review: 'Under Review', resolved: 'Resolved', dismissed: 'Dismissed' }[f] || f}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 48, textAlign: 'center', color: '#2E445E', fontSize: 14 }}>
            No grievances found
          </div>
        ) : filtered.map(g => {
          const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.pending;
          return (
            <div key={g.id} style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 20, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onClick={() => { setSelected(g); setNewStatus(g.status); setAdminRemarks(g.admin_remarks || ''); }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#2E445E')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D45')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(224,30,44,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: '#E01E2C', fontSize: 14, flexShrink: 0 }}>
                      {(g.user_name || '?')[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EDF8' }}>{g.user_name || g.user_id}</div>
                      <div style={{ fontSize: 11, color: '#7A8BA0' }}>{g.employee_id} · Filed {formatDate(g.created_at)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E8EDF8', marginBottom: 6 }}>{g.type}</div>
                  {g.against && <div style={{ fontSize: 12, color: '#7A8BA0', marginBottom: 6 }}>Regarding: {g.against}</div>}
                  <div style={{ fontSize: 13, color: '#7A8BA0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {g.details}
                  </div>
                </div>
                <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div style={{ width: 460, background: '#0E1420', borderLeft: '1px solid #1E2D45', height: '100%', overflowY: 'auto', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, margin: 0 }}>Grievance Detail</h3>
              <button onClick={() => setSelected(null)} style={{ background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 8, padding: '6px 10px', color: '#7A8BA0', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            {/* Info */}
            {[
              { l: 'Filed by', v: `${selected.user_name || selected.user_id}${selected.employee_id ? ` · ${selected.employee_id}` : ''}` },
              { l: 'Category', v: selected.type },
              { l: 'Regarding', v: selected.against },
              { l: 'Incident Date', v: selected.incident_date ? formatDate(selected.incident_date) : undefined },
              { l: 'Filed On', v: formatDate(selected.created_at) },
            ].map(r => r.v ? (
              <div key={r.l} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#2E445E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{r.l}</div>
                <div style={{ fontSize: 14, color: '#E8EDF8' }}>{r.v}</div>
              </div>
            ) : null)}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#2E445E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Details</div>
              <div style={{ fontSize: 14, color: '#E8EDF8', lineHeight: 1.65, background: '#131B2A', borderRadius: 10, padding: '12px 14px' }}>{selected.details}</div>
            </div>

            {selected.admin_remarks && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#2E445E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Admin Remarks</div>
                <div style={{ fontSize: 14, color: '#E8EDF8', lineHeight: 1.65, background: '#131B2A', borderRadius: 10, padding: '12px 14px' }}>{selected.admin_remarks}</div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #1E2D45', margin: '24px 0' }} />

            {/* Update status */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Update Status</div>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              style={{ width: '100%', background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 9, padding: '10px 14px', color: '#E8EDF8', fontSize: 13, outline: 'none', marginBottom: 12 }}
            >
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <textarea
              placeholder="Admin remarks (optional)…"
              value={adminRemarks}
              onChange={e => setAdminRemarks(e.target.value)}
              rows={3}
              style={{ width: '100%', background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 9, padding: '10px 14px', color: '#E8EDF8', fontSize: 13, outline: 'none', resize: 'none', marginBottom: 14, fontFamily: 'inherit' }}
            />
            <button onClick={updateStatus} disabled={updating || !newStatus}
              style={{ width: '100%', background: '#E01E2C', border: 'none', borderRadius: 10, padding: '12px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {updating ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
