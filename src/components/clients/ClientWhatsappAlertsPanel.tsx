'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';

/**
 * Client Management → WhatsApp alerts.
 *
 * Who gets this client's important updates on WhatsApp (up to 10 people), which updates, and the approved WhatsApp
 * template they go out with (GET/PUT /api/v1/clients/:id/whatsapp-alerts; POST …/test sends a test). Off by default.
 * Messages go out from the client's own WhatsApp number (CRM Settings → WhatsApp), and an update must also be on under
 * Notifications above to be sent. Own Save button, like the Notifications panel.
 */

type Recipient = { name: string; phone: string };
type Template = { id: string; name: string; language: string; category: string; status: string; body: string; placeholders: number };
type Entry = { kind: string; label: string; group: string; description: string; enabled: boolean; in_app_enabled: boolean };
type View = {
  enabled: boolean;
  template_id: string | null;
  recipients: Recipient[];
  kinds: string[];
  project_disabled: boolean;
  connection: { configured: boolean; active: boolean; from_phone: string | null; display_name: string | null };
  templates: Template[];
  catalog: Entry[];
  suggested_template: { name: string; category: string; language: string; body: string };
};
type Form = { enabled: boolean; template_id: string; recipients: Recipient[]; kinds: string[] };

const MAX_PEOPLE = 10;
const GROUPS: { id: string; label: string }[] = [
  { id: 'CRM', label: 'Lead management (CRM)' },
  { id: 'FieldForce', label: 'Field force' },
  { id: 'Distribution', label: 'Supply chain / distribution' },
  { id: 'System', label: 'System' },
];

const unwrap = <T,>(r: unknown): T => {
  const o = r as { data?: T } & Partial<T>;
  return (o?.data ?? o) as T;
};
const toForm = (v: View): Form => ({
  enabled: v.enabled,
  template_id: v.template_id ?? '',
  recipients: v.recipients.map(r => ({ ...r })),
  kinds: [...v.kinds],
});
const sig = (f: Form) => JSON.stringify({ ...f, kinds: [...f.kinds].sort() });
const errText = (e: any, fallback: string) => e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || fallback;

export default function ClientWhatsappAlertsPanel({ clientId }: { clientId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<Form>({ enabled: false, template_id: '', recipients: [], kinds: [] });
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const apply = useCallback((v: View) => {
    setView(v);
    const f = toForm(v);
    setForm(f);
    setSaved(sig(f));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(''); setNote('');
    api.get(`/api/v1/clients/${clientId}/whatsapp-alerts`, { noCache: true } as RequestInit)
      .then(r => {
        if (!alive) return;
        const v = unwrap<View>(r);
        if (!v || !Array.isArray(v.catalog)) throw new Error('WhatsApp alert settings are unavailable for this client.');
        apply(v);
      })
      .catch((e: any) => { if (alive) setErr(errText(e, 'Could not load WhatsApp alert settings')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId, apply]);

  const dirty = useMemo(() => sig(form) !== saved, [form, saved]);
  const catalog = view?.catalog ?? [];
  const template = view?.templates.find(t => t.id === form.template_id) ?? null;
  const offInApp = catalog.filter(c => form.kinds.includes(c.kind) && !c.in_app_enabled);

  const toggleKind = (kind: string) => setForm(f => ({ ...f, kinds: f.kinds.includes(kind) ? f.kinds.filter(k => k !== kind) : [...f.kinds, kind] }));
  const setMany = (kinds: string[], on: boolean) => setForm(f => {
    const s = new Set(f.kinds);
    kinds.forEach(k => (on ? s.add(k) : s.delete(k)));
    return { ...f, kinds: [...s] };
  });
  const addPerson = () => {
    const phone = newPhone.trim();
    if (!phone) return;
    setForm(f => ({ ...f, recipients: [...f.recipients, { name: newName.trim(), phone }] }));
    setNewName(''); setNewPhone('');
  };
  const removePerson = (i: number) => setForm(f => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true); setErr(''); setNote('');
    try {
      const r = await api.put(`/api/v1/clients/${clientId}/whatsapp-alerts`, {
        enabled: form.enabled,
        template_id: form.template_id || null,
        recipients: form.recipients,
        kinds: form.kinds,
      });
      const v = unwrap<View>(r);
      if (!v || !Array.isArray(v.catalog)) throw new Error('Unexpected response while saving WhatsApp alert settings.');
      apply(v);
      setNote(v.enabled ? 'Saved. Alerts start within a minute.' : 'Saved. WhatsApp alerts are off for this client.');
    } catch (e: any) {
      setErr(errText(e, 'Could not save WhatsApp alert settings'));
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setErr(''); setNote('');
    try {
      const r = unwrap<{ sent: number; failed: number; results: Array<{ name: string; phone: string; status: string; error: string | null }> }>(
        await api.post(`/api/v1/clients/${clientId}/whatsapp-alerts/test`, {}),
      );
      if (r.failed) {
        const first = r.results.find(x => x.status === 'failed');
        setErr(`Test sent to ${r.sent} of ${r.sent + r.failed}. ${first ? `${first.name || first.phone}: ${first.error}` : ''}`);
      } else {
        setNote(`Test sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`);
      }
    } catch (e: any) {
      setErr(errText(e, 'Could not send the test alert'));
    } finally { setTesting(false); }
  };

  const box: React.CSSProperties = { background: 'var(--s3)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' };
  const link: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#3E9EFF', cursor: 'pointer', background: 'none', border: 'none', padding: 0 };
  const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 12.5, minWidth: 0 };
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' };
  const warn: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#B45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 };

  if (loading) return <div style={{ ...box, fontSize: 12, color: 'var(--textTert)' }}>Loading WhatsApp alert settings…</div>;
  if (!view) return <div style={{ ...box, fontSize: 12, color: '#E01E2C' }} role="alert">{err || 'WhatsApp alert settings are unavailable.'}</div>;

  const idBase = `wa-alerts-${clientId}`;

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }}>
        Send this client&apos;s important updates to chosen people on WhatsApp, as well as in the app. <b>Off by default.</b> Messages go out
        from the client&apos;s own WhatsApp number, set up in CRM Settings → WhatsApp.
      </div>

      {view.project_disabled && (
        <div role="status" style={warn}>Notifications are switched off for this client&apos;s whole project, so no WhatsApp alerts are sent whatever you choose below.</div>
      )}
      {!view.connection.configured && (
        <div role="status" style={warn}>This client has no WhatsApp number connected yet. Connect one in CRM Settings → WhatsApp (signed in as the client), then come back here.</div>
      )}
      {view.connection.configured && !view.connection.active && (
        <div role="status" style={warn}>This client&apos;s WhatsApp connection is switched off, so nothing will be sent. Tick Active in CRM Settings → WhatsApp.</div>
      )}

      {/* On / off */}
      <label htmlFor={`${idBase}-enabled`} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input id={`${idBase}-enabled`} type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Send WhatsApp alerts for this client</span>
      </label>

      {/* Template */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={`${idBase}-template`} style={sectionLabel}>Message template</label>
        {view.templates.length ? (
          <select id={`${idBase}-template`} value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))} style={{ ...input, maxWidth: 420 }}>
            <option value="">Choose an approved template…</option>
            {view.templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language}{t.category ? `, ${t.category.toLowerCase()}` : ''})</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--textSec)', lineHeight: 1.5 }}>
            No approved templates yet. Create this <b>Utility</b> template in WhatsApp Manager, wait for approval, then press Sync templates in CRM Settings → WhatsApp:
          </div>
        )}
        {template && (
          <div style={{ fontSize: 11.5, color: 'var(--textSec)', background: 'var(--s2)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
            {template.body}
            <div style={{ marginTop: 4, color: 'var(--textTert)' }}>
              {template.placeholders >= 2 ? '{{1}} becomes the update title and {{2}} its details.'
                : template.placeholders === 1 ? '{{1}} becomes "title: details".'
                : 'This template has no placeholders, so every alert reads the same. Pick one with {{1}} and {{2}}.'}
            </div>
          </div>
        )}
        {!view.templates.length && (
          <div style={{ fontSize: 11.5, color: 'var(--text)', background: 'var(--s2)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
            <div><b>Name:</b> {view.suggested_template.name} · <b>Category:</b> {view.suggested_template.category} · <b>Language:</b> {view.suggested_template.language}</div>
            <div style={{ marginTop: 4 }}>{view.suggested_template.body}</div>
          </div>
        )}
      </div>

      {/* People */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>Who gets the alerts ({form.recipients.length} of {MAX_PEOPLE})</div>
        {form.recipients.length === 0 && <div style={{ fontSize: 12, color: 'var(--textTert)' }}>Nobody yet. Add the owner, an ops head or regional managers.</div>}
        {form.recipients.map((r, i) => (
          <div key={`${r.phone}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{r.name || 'No name'}</span>
            <span style={{ fontSize: 12.5, color: 'var(--textSec)', fontVariantNumeric: 'tabular-nums' }}>+{r.phone.replace(/^\+/, '')}</span>
            <button type="button" style={{ ...link, color: '#E01E2C' }} onClick={() => removePerson(i)} aria-label={`Remove ${r.name || r.phone}`}>Remove</button>
          </div>
        ))}
        {form.recipients.length < MAX_PEOPLE && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input id={`${idBase}-new-name`} aria-label="Name" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} style={{ ...input, width: 160 }} />
            <input
              id={`${idBase}-new-phone`} aria-label="WhatsApp number" placeholder="WhatsApp number, e.g. 9876543210" inputMode="tel"
              value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
              style={{ ...input, width: 240 }}
            />
            <button type="button" onClick={addPerson} disabled={!newPhone.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #3E9EFF', background: 'transparent', color: '#3E9EFF', fontSize: 12, fontWeight: 700, cursor: newPhone.trim() ? 'pointer' : 'default', opacity: newPhone.trim() ? 1 : 0.5 }}>
              Add person
            </button>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--textTert)' }}>10-digit Indian numbers get +91 added. Use the full number with country code for other countries.</div>
      </div>

      {/* Updates */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={sectionLabel}>Which updates ({form.kinds.length} of {catalog.length})</span>
          <button type="button" style={link} onClick={() => setMany(catalog.map(c => c.kind), true)}>Select all</button>
          <button type="button" style={link} onClick={() => setMany(catalog.map(c => c.kind), false)}>Clear</button>
        </div>
        {offInApp.length > 0 && (
          <div role="status" style={warn}>
            {offInApp.map(c => c.label).join(', ')} {offInApp.length === 1 ? 'is' : 'are'} off under Notifications above, so {offInApp.length === 1 ? 'it' : 'they'} won&apos;t be sent on WhatsApp either. Switch {offInApp.length === 1 ? 'it' : 'them'} on there too.
          </div>
        )}
        {GROUPS.map(g => {
          const items = catalog.filter(c => c.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--textTert)', marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {items.map(it => {
                  const on = form.kinds.includes(it.kind);
                  const id = `${idBase}-${it.kind}`;
                  return (
                    <label key={it.kind} htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(37,211,102,0.1)' : 'transparent', border: `1px solid ${on ? '#25D366' : 'transparent'}` }}>
                      <input id={id} type="checkbox" checked={on} onChange={() => toggleKind(it.kind)} style={{ marginTop: 2 }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: on ? 600 : 500, color: on ? 'var(--text)' : 'var(--textSec)' }}>{it.label}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--textTert)' }}>{it.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button" onClick={save} disabled={!dirty || saving}
          style={{ padding: '9px 16px', border: 'none', borderRadius: 10, background: dirty ? '#3E9EFF' : 'var(--s4)', color: dirty ? '#fff' : 'var(--textTert)', fontSize: 12.5, fontWeight: 700, cursor: dirty && !saving ? 'pointer' : 'default', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save WhatsApp alerts'}
        </button>
        <button
          type="button" onClick={sendTest} disabled={dirty || testing || !view.template_id || !view.recipients.length}
          title={dirty ? 'Save first, then send a test' : undefined}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: !dirty && !testing && view.template_id && view.recipients.length ? 'pointer' : 'default', opacity: dirty || !view.template_id || !view.recipients.length ? 0.5 : 1 }}
        >
          {testing ? 'Sending…' : 'Send a test'}
        </button>
        {dirty && !saving && <span style={{ fontSize: 11.5, color: 'var(--textTert)' }}>Unsaved changes</span>}
        {note && <span role="status" style={{ fontSize: 11.5, color: '#00A862', fontWeight: 600 }}>{note}</span>}
        {err && <span role="alert" style={{ fontSize: 11.5, color: '#E01E2C', fontWeight: 600 }}>{err}</span>}
      </div>
    </div>
  );
}
