'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/api';

const C = {
  bg: 'var(--bg)',
  card: 'var(--s2)',
  border: 'var(--border)',
  white: 'var(--text)',
  gray: 'var(--textSec)',
  red: '#E01E2C',
  green: '#00D97E',
  blue: '#3E9EFF',
  orange: '#FFB800',
};

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_table: string;
  entity_id: string | null;
  actor: { id: string; name: string | null; email: string | null; role: string | null } | null;
  client: { id: string; name: string | null } | null;
  ip_address: string | null;
  metadata: { method?: string; path?: string; status?: number } | null;
}

type ApiResp = { success: boolean; data: { rows: AuditRow[]; limit: number; offset: number; has_more: boolean } };

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

const actionColor = (action: string): string => {
  if (action.endsWith('.delete')) return C.red;
  if (action.endsWith('.create')) return C.green;
  if (action.endsWith('.update')) return C.blue;
  return C.orange;
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState({ action: '', entity_table: '', from: '', to: '' });
  const limit = 100;

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(off) });
      if (filter.action)       params.set('action', filter.action);
      if (filter.entity_table) params.set('entity_table', filter.entity_table);
      if (filter.from)         params.set('from', filter.from);
      if (filter.to)           params.set('to', filter.to);
      const r = await api.get<ApiResp>(`/api/v1/audit-log?${params.toString()}`, { noCache: true } as RequestInit & { noCache?: boolean });
      setRows(r.data.rows);
      setHasMore(r.data.has_more);
      setOffset(off);
    } catch (e: any) {
      setErr(e.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.white }}>Activity Log</h1>
        <div style={{ fontSize: 12, color: C.gray }}>Tracks every state change across all clients in this org.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, marginBottom: 16 }}>
        <input placeholder="action (e.g. leads.create)" value={filter.action}
               onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}
               style={inputStyle} />
        <input placeholder="entity (e.g. leads)" value={filter.entity_table}
               onChange={e => setFilter(f => ({ ...f, entity_table: e.target.value }))}
               style={inputStyle} />
        <input type="date" value={filter.from}
               onChange={e => setFilter(f => ({ ...f, from: e.target.value }))}
               style={inputStyle} />
        <input type="date" value={filter.to}
               onChange={e => setFilter(f => ({ ...f, to: e.target.value }))}
               style={inputStyle} />
        <button onClick={() => fetchPage(0)} style={btnStyle}>Apply</button>
        <button onClick={() => { setFilter({ action: '', entity_table: '', from: '', to: '' }); }} style={{ ...btnStyle, background: 'transparent', border: `1px solid ${C.border}` }}>Clear</button>
      </div>

      {err && <div style={{ padding: 12, background: 'rgba(224,30,44,0.1)', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, marginBottom: 12 }}>{err}</div>}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 200px 200px 220px 1fr 110px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.gray }}>
          <div>Time</div>
          <div>User</div>
          <div>Client</div>
          <div>Action</div>
          <div>Path / Details</div>
          <div style={{ textAlign: 'right' }}>Status</div>
        </div>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>No activity recorded for the selected window.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '180px 200px 200px 220px 1fr 110px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.white, alignItems: 'start' }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: C.gray }}>{fmtTime(r.created_at)}</div>
              <div>
                <div>{r.actor?.name || r.actor?.email || '—'}</div>
                <div style={{ fontSize: 11, color: C.gray }}>{r.actor?.role || ''}</div>
              </div>
              <div style={{ color: r.client?.name ? C.white : C.gray }}>{r.client?.name || 'Org-level'}</div>
              <div>
                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: actionColor(r.action), fontWeight: 700, fontSize: 12 }}>{r.action}</span>
              </div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: C.gray, wordBreak: 'break-all' }}>
                <span style={{ color: C.white, fontWeight: 700 }}>{r.metadata?.method || ''}</span>{' '}{r.metadata?.path || `${r.entity_table}${r.entity_id ? `/${r.entity_id}` : ''}`}
              </div>
              <div style={{ textAlign: 'right', color: (r.metadata?.status ?? 0) >= 400 ? C.red : C.green, fontWeight: 700 }}>{r.metadata?.status ?? '—'}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.gray, fontSize: 12 }}>
        <div>Page {Math.floor(offset / limit) + 1} • showing {rows.length} entries</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fetchPage(Math.max(0, offset - limit))} disabled={offset === 0 || loading} style={pageBtn(offset === 0 || loading)}>← Prev</button>
          <button onClick={() => fetchPage(offset + limit)}              disabled={!hasMore || loading} style={pageBtn(!hasMore || loading)}>Next →</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 160,
};
const btnStyle: React.CSSProperties = {
  background: '#E01E2C', border: 'none', color: '#fff', padding: '8px 16px',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: '1px solid var(--border)',
  color: disabled ? 'var(--textSec)' : 'var(--text)',
  padding: '6px 14px', borderRadius: 8, fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});
