'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { verifiedSendersApi, type VerifiedSender } from '../../../../lib/emailAlertsApi';
import { API_BASE_URL } from '../../../../lib/api';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

/**
 * Verified sender addresses for outbound email.
 *
 * Workflow:
 *   1. Add an address → backend emails a verification link to that
 *      address. The row sits as "Pending" until the recipient clicks.
 *   2. Click the link → backend flips verified_at to now() → the row
 *      shows as "Verified" and becomes selectable in the email-alert
 *      From dropdown.
 *
 * The ?verify=<token> URL query is the redirect target from the
 * verification email — when present we surface a one-off toast so the
 * user knows what happened.
 */
export default function EmailSendersPage() {
  const params = useSearchParams();
  const [rows, setRows] = useState<VerifiedSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await verifiedSendersApi.list();
      setRows(r.data || []);
    } catch (e: any) { toast.error(e?.message || 'Failed to load senders'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The verification link in the email points back to this page with
  // ?verify=<token>. The token is the only thing identifying the sender
  // row, so we POST it to the backend's /verify endpoint here — without
  // this call the dashboard used to show a "verified" toast while the
  // backend row stayed pending.
  useEffect(() => {
    const token = params.get('verify');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/crm/verified-senders/verify/${encodeURIComponent(token)}`,
          { method: 'GET' },
        );
        if (cancelled) return;
        // Backend returns 200 with success HTML when the token was found
        // and the row was flipped. 400 means the token didn't match any
        // row — usually because the user clicked an OLD verification
        // link after a Resend regenerated a fresh token, invalidating
        // the earlier one. Show distinct messaging so the rep knows to
        // open the most recent email instead of just retrying.
        if (res.ok) {
          toast.success('Sender verified.');
        } else if (res.status === 400) {
          toast.error('This verification link has expired. Click "Resend" below and open the most recent email.');
        } else {
          toast.error(`Verification failed (HTTP ${res.status}). Try again or contact support.`);
        }
        // Always refresh so the row state is in sync with whatever the
        // backend actually did.
        await load();
      } catch (err: any) {
        if (!cancelled) toast.error(`Verification link could not be processed: ${err?.message || 'network error'}`);
      }
    })();
    return () => { cancelled = true; };
  }, [params, load]);

  const add = async () => {
    const e = email.trim();
    if (!e) return;
    setAdding(true);
    try {
      await verifiedSendersApi.add(e, displayName.trim() || undefined);
      toast.success(`Verification email sent to ${e}. Open it and click the link to verify.`);
      setEmail(''); setDisplayName('');
      load();
    } catch (err: any) { toast.error(err?.message || 'Failed to add sender'); }
    finally { setAdding(false); }
  };

  const remove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from verified senders?`)) return;
    try { await verifiedSendersApi.remove(id); load(); }
    catch (e: any) { toast.error(e?.message || 'Failed to remove'); }
  };

  const setDefault = async (id: string) => {
    try { await verifiedSendersApi.setDefault(id); load(); toast.success('Default sender updated'); }
    catch (e: any) { toast.error(e?.message || 'Failed to set default'); }
  };

  const resendVerification = async (s: VerifiedSender) => {
    // Each Resend regenerates the token and invalidates the previous
    // email. Resend's free tier also rate-limits to 2 req/s, so multiple
    // clicks within a couple of seconds will hit 429. Disabling per-row
    // for 6 seconds covers both — long enough to be well clear of the
    // rate limit and short enough not to feel sluggish.
    setResendingId(s.id);
    try {
      await verifiedSendersApi.add(s.email, s.display_name || undefined);
      toast.success(`New verification email sent to ${s.email}. Open the LATEST email and click the link — older links are now invalid.`);
    } catch (e: any) {
      const msg = e?.message || '';
      if (/429|rate limit|too many requests/i.test(msg)) {
        toast.error('Resend hit its rate limit — wait 5 seconds and try again.');
      } else {
        toast.error(msg || 'Failed to resend');
      }
    } finally {
      setTimeout(() => setResendingId(null), 6000);
    }
  };

  // Type-aware client-side column sorting for the senders list. Status sorts by
  // verified_at (verified rows chronologically; pending — null — always last).
  const senderVal = useCallback((r: VerifiedSender, key: string): unknown => {
    switch (key) {
      case 'email': return r.email;
      case 'display_name': return r.display_name;
      case 'status': return r.verified_at;
      case 'added': return r.created_at;
      default: return (r as unknown as Record<string, unknown>)[key];
    }
  }, []);
  const { sorted, sort, toggle } = useTableSort<VerifiedSender>(rows, senderVal, { key: null, dir: 'asc' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Verified sender addresses</h1>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
          Only verified addresses can be used as the From on email alerts. Add an address, then click the verification link sent to its inbox.
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--s2)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Add address</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <input
            type="email" placeholder="hello@yourdomain.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }}
          />
          <input
            placeholder="Display name (optional)" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }}
          />
          <button onClick={add} disabled={adding || !email.trim()} style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'var(--primary)', border: 'none', color: '#fff',
            cursor: adding || !email.trim() ? 'not-allowed' : 'pointer',
            opacity: adding || !email.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
          }}>{adding ? 'Sending…' : 'Send verification'}</button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-dim)', fontSize: 13 }}>
          No sender addresses yet. Add one above to start sending email alerts.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th><SortLabel label="Email" sortKey="email" sort={sort} onToggle={toggle} /></Th>
                <Th><SortLabel label="Display name" sortKey="display_name" sort={sort} onToggle={toggle} /></Th>
                <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
                <Th><SortLabel label="Added" sortKey="added" sort={sort} onToggle={toggle} /></Th>
                <Th>{' '}</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>
                    <span style={{ fontWeight: 600 }}>{r.email}</span>
                    {r.is_default && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'rgba(34,197,94,0.18)', color: '#22c55e', fontWeight: 700 }}>DEFAULT</span>}
                  </Td>
                  <Td>{r.display_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}</Td>
                  <Td>{r.verified_at ? (
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ Verified</span>
                  ) : (
                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>⏳ Pending</span>
                  )}</Td>
                  <Td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Td>
                  <Td style={{ textAlign: 'right' }}>
                    {!r.verified_at && (
                      <button onClick={() => resendVerification(r)} disabled={resendingId === r.id} style={{ ...btnGhost, opacity: resendingId === r.id ? 0.5 : 1, cursor: resendingId === r.id ? 'wait' : 'pointer' }}>
                        {resendingId === r.id ? 'Sending…' : 'Resend'}
                      </button>
                    )}
                    {r.verified_at && !r.is_default && (
                      <button onClick={() => setDefault(r.id)} style={btnGhost}>Set default</button>
                    )}
                    <button onClick={() => remove(r.id, r.email)} style={{ ...btnGhost, color: 'var(--primary)', marginLeft: 4 }}>Remove</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  cursor: 'pointer',
};
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', verticalAlign: 'middle', ...style }}>{children}</td>;
}
