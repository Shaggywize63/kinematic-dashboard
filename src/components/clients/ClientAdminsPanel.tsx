'use client';
import { useCallback, useEffect, useState } from 'react';
import api, { type ClientAdmin, type ClientAdminsResponse } from '../../lib/api';

/**
 * Client Management → Admins.
 *
 * Lists a client's admins (role `client`: they run the client's own workspace) and lets a master admin add more,
 * or switch one off and on. Everything goes through /clients/:id/admins, which creates the admin in the org (and
 * project) that holds the client's users. The older Settings → Users path stamped the caller's own org, so an admin
 * made there could not see the client's data; such rows are flagged here.
 */

const box: React.CSSProperties = { background: 'var(--s3)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' };
const ACCENT = '#3E9EFF';
const RED = '#E01E2C';
const GREEN = '#00A862';
const AMBER = '#B45309';

const field: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)',
  color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif",
};
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: ACCENT, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--textSec)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 };

/** A random password that passes the server's policy: 14 characters, every character class, no runs or sequences. */
export function generatePassword(length = 14): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?-'];
  const all = sets.join('');
  const rand = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  for (;;) {
    const chars = sets.map((set) => set[rand(set.length)]);
    while (chars.length < length) chars.push(all[rand(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    const pw = chars.join('');
    if (!/(.)\1{2,}/.test(pw)) return pw;
  }
}

/** Digits only, so a pasted "98765 43210" or "+91 98765 43210" becomes 9876543210 (no length cap, which would cut a
 *  pasted number before its spaces are removed; the 10-digit rule is checked on save). */
export function mobileDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

const BLANK = { name: '', email: '', mobile: '', password: '' };
type Form = typeof BLANK;

/** The first problem with the form, or '' (the server checks again; this just saves a round trip). */
function formProblem(f: Form): string {
  if (!f.name.trim()) return 'Enter the admin’s name.';
  if (!f.email.trim()) return 'Enter an email. Admins sign in to the dashboard with it.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter a valid email address.';
  if (f.mobile.trim() && !/^\d{10}$/.test(f.mobile.trim())) return 'The mobile number must be exactly 10 digits.';
  if (f.password.length < 10) return 'The password must be at least 10 characters.';
  return '';
}

export default function ClientAdminsPanel({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [state, setState] = useState<ClientAdminsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(BLANK);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  // The admin just added, with the password typed for them, so it can be copied once and handed over.
  const [handover, setHandover] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setLoadErr('');
    api.listClientAdmins(clientId)
      .then((r) => setState(r))
      .catch((e: Error) => setLoadErr(e?.message || 'Could not load this client’s admins.'))
      .finally(() => setLoading(false));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const startAdding = () => { setForm(BLANK); setShowPw(false); setErr(''); setNote(''); setHandover(null); setAdding(true); };

  const add = async () => {
    const problem = formProblem(form);
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr(''); setNote('');
    try {
      const created = await api.addClientAdmin(clientId, {
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.mobile.trim() ? { mobile: form.mobile.trim() } : {}),
        password: form.password,
      });
      setHandover({ name: created.name || form.name.trim(), email: created.email || form.email.trim().toLowerCase(), password: form.password });
      setCopied(false);
      setAdding(false); setForm(BLANK);
      load();
    } catch (e) { setErr((e as Error)?.message || 'Could not add the admin.'); }
    finally { setSaving(false); }
  };

  const setActive = async (a: ClientAdmin, next: boolean) => {
    if (!next && typeof window !== 'undefined' && !window.confirm(`Switch off ${a.name || a.email}? They will be signed out and cannot sign in until you switch them back on.`)) return;
    setBusyId(a.id); setErr(''); setNote('');
    try {
      await api.setClientAdminActive(clientId, a.id, next);
      setNote(next ? `${a.name || a.email} can sign in again.` : `${a.name || a.email} is switched off.`);
      load();
    } catch (e) { setErr((e as Error)?.message || 'Could not update the admin.'); }
    finally { setBusyId(''); }
  };

  const moveIn = async (a: ClientAdmin) => {
    setBusyId(a.id); setErr(''); setNote('');
    try {
      await api.moveClientAdminIntoClient(clientId, a.id);
      setNote(`${a.name || a.email} is now in ${clientName || 'this client'}’s organisation and can see its data.`);
      load();
    } catch (e) { setErr((e as Error)?.message || 'Could not move the admin.'); }
    finally { setBusyId(''); }
  };

  const copyHandover = async () => {
    if (!handover) return;
    const where = typeof window !== 'undefined' ? window.location.origin : 'the Kinematic dashboard';
    const text = `Kinematic dashboard${clientName ? ` (${clientName})` : ''}\nSign in at: ${where}\nEmail: ${handover.email}\nPassword: ${handover.password}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setErr('Could not copy. Select the details and copy them by hand.'); }
  };

  const btn = (text: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; testId?: string; danger?: boolean }) => (
    <button
      type="button" onClick={onClick} disabled={opts?.disabled} data-testid={opts?.testId}
      style={{
        // One explicit size for every button here: globals.css restyles some outlined-button signatures and not
        // others, which left this panel's buttons in two sizes.
        height: 34, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        border: opts?.primary ? 'none' : `1px solid ${opts?.danger ? 'rgba(224,30,44,0.4)' : 'var(--border)'}`,
        background: opts?.primary ? (opts?.disabled ? 'var(--s4)' : ACCENT) : 'transparent',
        color: opts?.primary ? (opts?.disabled ? 'var(--textTert)' : '#fff') : (opts?.danger ? RED : 'var(--textSec)'),
        cursor: opts?.disabled ? 'default' : 'pointer', opacity: opts?.disabled ? 0.7 : 1,
      }}
    >{text}</button>
  );

  if (loading && !state) return <div style={{ ...box, fontSize: 12, color: 'var(--textTert)' }} data-testid="client-admins-loading">Loading admins…</div>;
  if (!state) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} data-testid="client-admins-error">
        <span role="alert" style={{ fontSize: 12.5, color: RED, flex: 1, minWidth: 0 }}>{loadErr || 'Admins are unavailable.'}</span>
        {btn('Try again', load)}
      </div>
    );
  }

  const { admins, seats } = state;
  const activeCount = admins.filter((a) => a.is_active).length;
  const seatsFull = seats.allocated != null && seats.active >= seats.allocated;

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="client-admins-panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {admins.length === 0 ? 'No admins yet' : `${activeCount} active admin${activeCount === 1 ? '' : 's'}`}
            {admins.length > activeCount && <span style={{ color: 'var(--textTert)', fontWeight: 600 }}> · {admins.length - activeCount} switched off</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 3, lineHeight: 1.5 }}>
            Admins run this client’s workspace: its users, roles, settings and every module the client has. They sign in to the dashboard with their email.
            {seats.allocated != null && (
              <span data-testid="client-admins-seats" style={{ color: seatsFull ? RED : 'var(--textSec)', fontWeight: 600 }}>
                {' '}Seats: {seats.active} of {seats.allocated} in use{seatsFull ? ', so raise Max Active Users before adding someone.' : '.'}
              </span>
            )}
          </div>
        </div>
        {!adding && btn('Add admin', startAdding, { primary: true, testId: 'client-admins-add' })}
      </div>

      {handover && (
        <div data-testid="client-admins-handover" style={{ background: 'rgba(0,168,98,0.08)', border: '1px solid rgba(0,168,98,0.3)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{handover.name} is now an admin of {clientName || 'this client'}.</div>
          <div style={{ fontSize: 12, color: 'var(--textSec)', lineHeight: 1.7, userSelect: 'text' }}>
            Email: <b style={{ color: 'var(--text)' }}>{handover.email}</b><br />
            Password: <b style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{handover.password}</b>
            <span style={{ color: 'var(--textTert)' }}> (shown once, so copy it now)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {btn(copied ? 'Copied' : 'Copy sign-in details', copyHandover, { testId: 'client-admins-copy' })}
            {btn('Done', () => setHandover(null))}
          </div>
        </div>
      )}

      {admins.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--s2)' }}>
          {admins.map((a, i) => (
            <div key={a.id} data-testid={`client-admin-${a.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.is_active ? 'var(--text)' : 'var(--textTert)' }}>{a.name || '(no name)'}</span>
                  {a.is_primary && <Tag color={ACCENT}>Main login</Tag>}
                  {!a.is_active && <Tag color="var(--textTert)">Switched off</Tag>}
                  {!a.in_client_org && <Tag color={AMBER}>Wrong organisation</Tag>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 2, overflowWrap: 'anywhere' }}>{[a.email, a.mobile].filter(Boolean).join(' · ') || '—'}</div>
                {!a.in_client_org && (
                  <div style={{ fontSize: 11, color: AMBER, marginTop: 4 }}>
                    Saved in another organisation (an admin added from Settings → Users), so it cannot see this client’s data. Move it into this client to fix that.
                  </div>
                )}
              </div>
              {!a.in_client_org && btn(busyId === a.id ? 'Moving…' : 'Move into this client', () => moveIn(a), { disabled: !!busyId, testId: `client-admin-move-${a.id}` })}
              {a.is_active
                ? btn(busyId === a.id ? 'Switching off…' : 'Switch off', () => setActive(a, false), { danger: true, disabled: !!busyId, testId: `client-admin-off-${a.id}` })
                : btn(busyId === a.id ? 'Switching on…' : 'Switch on', () => setActive(a, true), { disabled: !!busyId, testId: `client-admin-on-${a.id}` })}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div data-testid="client-admins-form" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: admins.length ? '1px solid var(--border)' : 'none', paddingTop: admins.length ? 14 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>New admin for {clientName || 'this client'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 14px' }}>
            <div>
              <label htmlFor="ca-name" style={label}>Full name <span style={{ color: RED }}>*</span></label>
              <input id="ca-name" style={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Nair" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="ca-email" style={label}>Email <span style={{ color: RED }}>*</span></label>
              <input id="ca-email" type="email" style={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@company.com" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="ca-mobile" style={label}>Mobile (optional)</label>
              <input id="ca-mobile" inputMode="numeric" style={field} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: mobileDigits(e.target.value) })} placeholder="10 digits" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="ca-password" style={label}>Password <span style={{ color: RED }}>*</span></label>
              <input id="ca-password" type={showPw ? 'text' : 'password'} style={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 10 characters" autoComplete="new-password" />
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" style={linkBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>
                <button type="button" style={linkBtn} data-testid="client-admins-generate" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPw(true); }}>Generate a strong password</button>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--textTert)' }}>
            The admin gets every module this client has. Use at least 10 characters, with no runs like “aaaa” or sequences like “123456”.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {btn(saving ? 'Adding…' : 'Add admin', add, { primary: true, disabled: saving || seatsFull, testId: 'client-admins-save' })}
            {btn('Cancel', () => { setAdding(false); setErr(''); }, { disabled: saving })}
          </div>
        </div>
      )}

      {(note || err) && (
        <div role={err ? 'alert' : 'status'} data-testid="client-admins-message" style={{ fontSize: 12, fontWeight: 600, color: err ? RED : GREEN }}>{err || note}</div>
      )}
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, border: `1px solid ${color}`, color }}>{children}</span>
  );
}
