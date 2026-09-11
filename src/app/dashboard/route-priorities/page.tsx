'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../../../lib/api';

/**
 * Outlet Priorities — set each outlet's visit cadence + priority. This is what
 * the route optimizer's priority weighting reads: outlets OVERDUE against their
 * cadence, or set to priority=High, are sequenced first when a rep (or a
 * supervisor auto-plan) optimizes the route. Saves per-outlet via
 * POST /route-plans/outlet-frequency (module route_optimization).
 */

type Store = { id: string; name?: string | null; store_code?: string | null; store_type?: string | null };
type Freq = { store_id: string; frequency?: string | null; priority?: string | null };

const C = {
  bg: 'var(--bg)', s2: 'var(--s2)', s3: 'var(--s3)', text: 'var(--text)',
  sec: 'var(--textSec)', tert: 'var(--textTert)', border: 'var(--border)',
  green: '#00D97E', red: '#E01E2C',
};
const FREQS = ['', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly'];
const PRIOS = ['', 'high', 'medium', 'low'];
const selStyle: React.CSSProperties = { background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', color: C.text, fontSize: 13, textTransform: 'capitalize' };

export default function OutletPrioritiesPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [freq, setFreq] = useState<Record<string, Freq>>({});
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sRes, fRes] = await Promise.all([
        api.get<{ data?: Store[] } | Store[]>('/api/v1/stores?limit=1000'),
        api.get<{ data?: Freq[] } | Freq[]>('/api/v1/route-plans/outlet-frequency'),
      ]);
      const sList = (Array.isArray(sRes) ? sRes : sRes?.data) ?? [];
      const fList = (Array.isArray(fRes) ? fRes : fRes?.data) ?? [];
      setStores(sList as Store[]);
      const map: Record<string, Freq> = {};
      (fList as Freq[]).forEach((f) => { if (f.store_id) map[f.store_id] = f; });
      setFreq(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load outlets');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (store_id: string, patch: Partial<Freq>) => {
    const next = { ...(freq[store_id] || { store_id }), ...patch, store_id };
    setFreq((m) => ({ ...m, [store_id]: next }));
    setSavingId(store_id); setSavedId(null); setError(null);
    try {
      await api.post('/api/v1/route-plans/outlet-frequency', {
        store_id,
        frequency: next.frequency || undefined,
        priority: next.priority || undefined,
      });
      setSavedId(store_id);
      setTimeout(() => setSavedId((cur) => (cur === store_id ? null : cur)), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId((cur) => (cur === store_id ? null : cur));
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stores;
    return stores.filter((s) => `${s.name ?? ''} ${s.store_code ?? ''}`.toLowerCase().includes(needle));
  }, [stores, q]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--heading, inherit)', fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Outlet Priorities</h1>
      <p style={{ fontSize: 13, color: C.sec, margin: '4px 0 16px' }}>
        Set how often each outlet should be visited and its priority. The route optimizer visits <strong>overdue</strong> and <strong>high-priority</strong> outlets first.
      </p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search outlets…"
        style={{ width: '100%', maxWidth: 320, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, marginBottom: 14 }} />

      {error && <div style={{ margin: '0 0 12px', fontSize: 13, color: C.red, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>{error}</div>}
      {loading && <div style={{ color: C.tert, fontSize: 13 }}>Loading outlets…</div>}

      {!loading && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.s2 }}>
          {filtered.length === 0 && <div style={{ padding: '24px 14px', color: C.tert, textAlign: 'center', fontSize: 13 }}>No outlets found.</div>}
          {filtered.map((s) => {
            const f = freq[s.id] || {};
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ color: C.text, fontSize: 14 }}>{s.name || s.store_code || 'Outlet'}</div>
                  {s.store_code && <div style={{ color: C.tert, fontSize: 12 }}>{s.store_code}</div>}
                </div>
                <label style={{ fontSize: 11, color: C.tert }}>Cadence
                  <select value={(f.frequency ?? '').toLowerCase()} onChange={(e) => save(s.id, { frequency: e.target.value })}
                    style={{ ...selStyle, marginLeft: 6 }}>
                    {FREQS.map((v) => <option key={v} value={v}>{v ? v : '—'}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: C.tert }}>Priority
                  <select value={(f.priority ?? '').toLowerCase()} onChange={(e) => save(s.id, { priority: e.target.value })}
                    style={{ ...selStyle, marginLeft: 6 }}>
                    {PRIOS.map((v) => <option key={v} value={v}>{v ? v : '—'}</option>)}
                  </select>
                </label>
                <span style={{ width: 62, fontSize: 12, textAlign: 'right', color: savedId === s.id ? C.green : C.tert }}>
                  {savingId === s.id ? 'Saving…' : savedId === s.id ? 'Saved' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
