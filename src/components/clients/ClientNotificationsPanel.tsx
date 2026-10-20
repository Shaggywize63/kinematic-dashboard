'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';

/**
 * Client Management → Notifications.
 *
 * The backend keeps a catalogue of every notification the platform can send (GET /api/v1/clients/:id/notifications) and a
 * per-client list of the kinds switched on. Nothing is on by default, so a new client receives no notifications until an
 * admin ticks them here. Saving replaces the client's list (PUT, same path). Independent of the client form's own Save:
 * it has its own button so a notification change never rides along with, or blocks, a module/profile edit.
 */

type Entry = { kind: string; label: string; group: string; description: string; recommended: boolean; enabled: boolean };
type View = { project_disabled: boolean; all: boolean; enabled_kinds: string[]; catalog: Entry[] };

const GROUPS: { id: string; label: string }[] = [
  { id: 'CRM', label: 'Lead management (CRM)' },
  { id: 'FieldForce', label: 'Field force' },
  { id: 'Distribution', label: 'Supply chain / distribution' },
  { id: 'System', label: 'System' },
];

const unwrap = (r: unknown): View => {
  const o = r as { data?: View } & Partial<View>;
  return (o?.data ?? o) as View;
};

export default function ClientNotificationsPanel({ clientId }: { clientId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const apply = useCallback((v: View) => {
    setView(v);
    const s = new Set(v.catalog.filter(c => c.enabled).map(c => c.kind));
    setSelected(s);
    setSaved([...s].sort().join(','));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(''); setNote('');
    api.get(`/api/v1/clients/${clientId}/notifications`, { noCache: true } as RequestInit)
      .then(r => {
        if (!alive) return;
        const v = unwrap(r);
        if (!v || !Array.isArray(v.catalog)) throw new Error('Notification settings are unavailable for this client.');
        apply(v);
      })
      .catch((e: any) => { if (alive) setErr(e?.response?.data?.error || e?.message || 'Could not load notification settings'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId, apply]);

  const dirty = useMemo(() => [...selected].sort().join(',') !== saved, [selected, saved]);
  const catalog = view?.catalog ?? [];

  const toggle = (kind: string) => setSelected(p => {
    const n = new Set(p);
    if (n.has(kind)) n.delete(kind); else n.add(kind);
    return n;
  });
  const setMany = (kinds: string[], on: boolean) => setSelected(p => {
    const n = new Set(p);
    kinds.forEach(k => (on ? n.add(k) : n.delete(k)));
    return n;
  });

  const save = async () => {
    setSaving(true); setErr(''); setNote('');
    try {
      const r = await api.put(`/api/v1/clients/${clientId}/notifications`, { enabled_kinds: [...selected] });
      const v = unwrap(r);
      if (!v || !Array.isArray(v.catalog)) throw new Error('Unexpected response while saving notification settings.');
      apply(v);
      setNote('Saved. Takes effect within a minute.');
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Could not save notification settings');
    } finally { setSaving(false); }
  };

  const box: React.CSSProperties = { background: 'var(--s3)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' };
  const link: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#3E9EFF', cursor: 'pointer', background: 'none', border: 'none', padding: 0 };

  if (loading) return <div style={{ ...box, fontSize: 12, color: 'var(--textTert)' }}>Loading notification settings…</div>;
  if (!view) return <div style={{ ...box, fontSize: 12, color: '#E01E2C' }} role="alert">{err || 'Notification settings are unavailable.'}</div>;

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }}>
        Choose which notifications this client&apos;s users receive (push and in-app). <b>Nothing is on by default</b> — a new client
        gets no notifications until you switch them on here.
      </div>

      {view.project_disabled && (
        <div role="status" style={{ fontSize: 12, fontWeight: 600, color: '#B45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '8px 12px' }}>
          Notifications are switched off for this client&apos;s whole project, so nothing is sent whatever you choose below.
        </div>
      )}
      {view.all && !dirty && (
        <div style={{ fontSize: 11.5, color: 'var(--textSec)' }}>
          Every notification is currently on for this client (including ones added in future). Saving after a change keeps an explicit list instead.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{selected.size} of {catalog.length} on</span>
        <button type="button" style={link} onClick={() => setMany(catalog.map(c => c.kind), true)}>Turn all on</button>
        <button type="button" style={link} onClick={() => setMany(catalog.map(c => c.kind), false)}>Turn all off</button>
        <button type="button" style={link} onClick={() => setMany(catalog.filter(c => c.recommended).map(c => c.kind), true)}>Turn on safety alerts</button>
      </div>

      {GROUPS.map(g => {
        const items = catalog.filter(c => c.group === g.id);
        if (!items.length) return null;
        const ids = items.map(i => i.kind);
        const allOn = ids.every(k => selected.has(k));
        return (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' }}>{g.label}</div>
              <button type="button" style={link} onClick={() => setMany(ids, !allOn)} aria-label={`${allOn ? 'Clear' : 'Select all'} ${g.label}`}>{allOn ? 'Clear' : 'Select all'}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {items.map(it => {
                const on = selected.has(it.kind);
                const id = `notif-${clientId}-${it.kind}`;
                return (
                  <label key={it.kind} htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(62,158,255,0.1)' : 'transparent', border: `1px solid ${on ? '#3E9EFF' : 'transparent'}` }}>
                    <input id={id} type="checkbox" checked={on} onChange={() => toggle(it.kind)} style={{ marginTop: 2 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: on ? 600 : 500, color: on ? 'var(--text)' : 'var(--textSec)' }}>
                        {it.label}
                        {it.recommended && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: '#047857', background: 'rgba(16,185,129,0.14)', borderRadius: 999, padding: '1px 6px' }}>Recommended</span>}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--textTert)' }}>{it.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button" onClick={save} disabled={!dirty || saving}
          style={{ padding: '9px 16px', border: 'none', borderRadius: 10, background: dirty ? '#3E9EFF' : 'var(--s4)', color: dirty ? '#fff' : 'var(--textTert)', fontSize: 12.5, fontWeight: 700, cursor: dirty && !saving ? 'pointer' : 'default', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save notifications'}
        </button>
        {dirty && !saving && <span style={{ fontSize: 11.5, color: 'var(--textTert)' }}>Unsaved changes</span>}
        {note && !dirty && <span role="status" style={{ fontSize: 11.5, color: '#00A862', fontWeight: 600 }}>{note}</span>}
        {err && <span role="alert" style={{ fontSize: 11.5, color: '#E01E2C', fontWeight: 600 }}>{err}</span>}
      </div>
    </div>
  );
}
