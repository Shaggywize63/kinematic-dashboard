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

interface AuditMetadata {
  method?: string;
  path?: string;
  status?: number;
  platform?: 'web' | 'android' | 'ios' | 'api' | null;
  device_model?: string | null;
  device_brand?: string | null;
  os_version?: string | null;
  summary?: string | null;
  error?: string | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_table: string;
  entity_id: string | null;
  actor: { id: string; name: string | null; email: string | null; role: string | null } | null;
  client: { id: string; name: string | null } | null;
  ip_address: string | null;
  metadata: AuditMetadata | null;
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

// Verb + entity → human phrase ("Created lead", "Updated deal", "Deleted client").
function describeAction(action: string): string {
  const [entity, verb] = action.split('.');
  if (!entity || !verb) return action;
  const verbMap: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    win: 'Marked won',
    lose: 'Marked lost',
    reopen: 'Re-opened',
    convert: 'Converted',
    disqualify: 'Disqualified',
    approve: 'Approved',
    cancel: 'Cancelled',
    'move-stage': 'Moved stage on',
  };
  const v = verbMap[verb] || verb.charAt(0).toUpperCase() + verb.slice(1);
  const e = entity.replace(/_/g, ' ').replace(/s$/, '');
  return `${v} ${e}`;
}

const PLATFORM_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  web:     { bg: 'rgba(62,158,255,0.15)',  color: '#3E9EFF', label: 'Web' },
  android: { bg: 'rgba(0,217,126,0.15)',   color: '#00D97E', label: 'Android' },
  ios:     { bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', label: 'iOS' },
  api:     { bg: 'rgba(255,255,255,0.06)', color: '#94a3b8', label: 'API' },
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
        <div style={{ display: 'grid', gridTemplateColumns: '170px 180px 160px 100px 1fr 80px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.gray }}>
          <div>Time</div>
          <div>User</div>
          <div>Client</div>
          <div>Platform</div>
          <div>Action</div>
          <div style={{ textAlign: 'right' }}>Status</div>
        </div>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>No activity recorded for the selected window.</div>
        ) : (
          rows.map((r) => {
            const m = r.metadata || {};
            const platform = (m.platform || 'api') as keyof typeof PLATFORM_STYLE;
            const plat = PLATFORM_STYLE[platform] || PLATFORM_STYLE.api;
            const status = m.status ?? 0;
            const isError = status >= 400;
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '170px 180px 160px 100px 1fr 80px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.white, alignItems: 'start' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: C.gray }}>{fmtTime(r.created_at)}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{r.actor?.name || r.actor?.email || '—'}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{r.actor?.role || ''}</div>
                </div>
                <div style={{ color: r.client?.name ? C.white : C.gray }}>{r.client?.name || 'Org-level'}</div>
                <div>
                  <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, background: plat.bg, color: plat.color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{plat.label}</span>
                  {(m.device_brand || m.device_model) && (
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 3 }}>
                      {[m.device_brand, m.device_model].filter(Boolean).join(' ')}
                      {m.os_version ? ` · ${m.os_version}` : ''}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: actionColor(r.action), fontWeight: 700, fontSize: 13 }}>
                    {describeAction(r.action)}
                  </div>
                  {m.summary && (
                    <div style={{ fontSize: 12, color: C.white, marginTop: 2, fontWeight: 500 }}>
                      &ldquo;{m.summary}&rdquo;
                    </div>
                  )}
                  {r.entity_id && (
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                      ID {r.entity_id.slice(0, 8)}…
                    </div>
                  )}
                  {isError && m.error && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 4, background: 'rgba(224,30,44,0.1)', border: `1px solid rgba(224,30,44,0.3)`, padding: '4px 8px', borderRadius: 4 }}>
                      ⚠ {m.error}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 4, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                    {m.method} {m.path}
                  </div>
                </div>
                <div style={{ textAlign: 'right', color: isError ? C.red : C.green, fontWeight: 700 }}>{status || '—'}</div>
              </div>
            );
          })
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
