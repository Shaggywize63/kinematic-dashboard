'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface Submission {
  id: string;
  form_id?: string;
  form_name?: string;
  user_id: string;
  user_name?: string;
  employee_id?: string;
  zone?: string;
  outlet_name?: string;
  outlet_type?: string;
  is_ecc: boolean;
  submitted_at: string;
  synced: boolean;
  data?: Record<string, any>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
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

export default function Submissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [eccFilter, setEccFilter] = useState<'all' | 'ecc' | 'non_ecc'>('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [page, setPage] = useState(1);

  const fetchSubmissions = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '25' });
      if (eccFilter === 'ecc') params.set('is_ecc', 'true');
      if (eccFilter === 'non_ecc') params.set('is_ecc', 'false');
      if (search) params.set('search', search);
      const res = await apiRequest(`/forms/admin/submissions?${params}`);
      setSubmissions(res.data ?? res ?? []);
      if (res.pagination) setPagination(res.pagination);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [eccFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchSubmissions(1); }, 300);
    return () => clearTimeout(t);
  }, [search, eccFilter]);

  useEffect(() => { fetchSubmissions(page); }, [page]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); }
    catch { return d; }
  };

  const total = pagination.total || submissions.length;
  const ecc = submissions.filter(s => s.is_ecc).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, margin: 0 }}>CC Submissions</h2>
          <p style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>All consumer contact form submissions</p>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,30,44,0.1)', border: '1px solid rgba(224,30,44,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, color: '#E01E2C', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Submissions', value: total, color: '#3A9EFF' },
          { label: 'Effective (ECC)', value: ecc, color: '#00D97E' },
          { label: 'Non-ECC', value: total - ecc, color: '#FFC940' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#7A8BA0', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by FE name, outlet or zone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 9, padding: '9px 14px', color: '#E8EDF8', fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'ecc', 'non_ecc'] as const).map(f => (
            <button key={f} onClick={() => setEccFilter(f)}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: eccFilter === f ? '#E01E2C' : '#131B2A', color: eccFilter === f ? '#fff' : '#7A8BA0', transition: 'all 0.15s' }}>
              {{ all: 'All', ecc: 'ECC Only', non_ecc: 'Non-ECC' }[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#0E1420', border: '1px solid #1E2D45', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? <Spinner /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D45' }}>
                  {['Field Executive', 'Outlet', 'Zone', 'ECC', 'Submitted', 'Sync'].map(h => (
                    <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#2E445E', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  <th style={{ padding: '13px 18px', width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#2E445E', fontSize: 14 }}>No submissions found</td></tr>
                ) : submissions.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < submissions.length - 1 ? '1px solid #131B2A' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#131B2A')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EDF8' }}>{s.user_name || s.user_id}</div>
                      {s.employee_id && <div style={{ fontSize: 11, color: '#7A8BA0' }}>{s.employee_id}</div>}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: 13, color: '#E8EDF8' }}>{s.outlet_name || '—'}</div>
                      {s.outlet_type && <div style={{ fontSize: 11, color: '#7A8BA0' }}>{s.outlet_type}</div>}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#7A8BA0' }}>{s.zone || '—'}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.is_ecc ? 'rgba(0,217,126,0.12)' : 'rgba(255,201,64,0.12)', color: s.is_ecc ? '#00D97E' : '#FFC940' }}>
                        {s.is_ecc ? 'ECC' : 'Non-ECC'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#7A8BA0', whiteSpace: 'nowrap' }}>{formatDate(s.submitted_at)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.synced ? 'rgba(0,217,126,0.1)' : 'rgba(255,201,64,0.1)', color: s.synced ? '#00D97E' : '#FFC940' }}>
                        {s.synced ? 'Synced' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <button onClick={() => setSelected(s)}
                        style={{ background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 8, padding: '6px 12px', color: '#7A8BA0', fontSize: 12, cursor: 'pointer' }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid #131B2A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#2E445E' }}>Page {page} of {pagination.pages} · {pagination.total} total</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #1E2D45', background: '#131B2A', color: page === 1 ? '#2E445E' : '#7A8BA0', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #1E2D45', background: '#131B2A', color: page === pagination.pages ? '#2E445E' : '#7A8BA0', fontSize: 12, cursor: page === pagination.pages ? 'not-allowed' : 'pointer' }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div style={{ width: 420, background: '#0E1420', borderLeft: '1px solid #1E2D45', height: '100%', overflowY: 'auto', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, margin: 0 }}>Submission Detail</h3>
              <button onClick={() => setSelected(null)} style={{ background: '#131B2A', border: '1px solid #1E2D45', borderRadius: 8, padding: '6px 10px', color: '#7A8BA0', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: selected.is_ecc ? 'rgba(0,217,126,0.12)' : 'rgba(255,201,64,0.12)', color: selected.is_ecc ? '#00D97E' : '#FFC940' }}>
                {selected.is_ecc ? '✓ Effective Contact (ECC)' : 'Non-ECC'}
              </span>
            </div>

            {[
              { l: 'Field Executive', v: selected.user_name || selected.user_id },
              { l: 'Employee ID', v: selected.employee_id },
              { l: 'Zone', v: selected.zone },
              { l: 'Outlet', v: selected.outlet_name },
              { l: 'Outlet Type', v: selected.outlet_type },
              { l: 'Submitted At', v: formatDate(selected.submitted_at) },
              { l: 'Sync Status', v: selected.synced ? 'Synced' : 'Pending sync' },
            ].map(r => r.v ? (
              <div key={r.l} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#2E445E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{r.l}</div>
                <div style={{ fontSize: 14, color: '#E8EDF8' }}>{r.v}</div>
              </div>
            ) : null)}

            {selected.data && Object.keys(selected.data).length > 0 && (
              <>
                <div style={{ borderTop: '1px solid #1E2D45', margin: '20px 0' }} />
                <div style={{ fontSize: 11, color: '#2E445E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>Form Fields</div>
                {Object.entries(selected.data).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 12, background: '#131B2A', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#7A8BA0', marginBottom: 3, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 13, color: '#E8EDF8' }}>{String(v)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
