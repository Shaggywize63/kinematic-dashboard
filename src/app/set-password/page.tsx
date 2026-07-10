'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api from '../../lib/api';
import { getStoredToken, getStoredUser, landingRouteFor } from '../../lib/auth';

/**
 * Forced "set a new password" screen. The dashboard layout routes here when
 * the signed-in user's `must_change_password` flag is true (new users, or
 * anyone still on their initial/shared password). The user can't reach the
 * app until they set a fresh password — this page has no nav out except a
 * sign-out.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  // Must be signed in to set a password (they logged in with their temp one).
  useEffect(() => {
    if (!getStoredToken()) router.replace('/login');
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (pw !== confirm) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    try {
      await api.changePassword(pw);
      // Clear the flag on the cached user so the layout stops redirecting here.
      try {
        const raw = localStorage.getItem('kinematic_user');
        if (raw) {
          const u = JSON.parse(raw);
          u.must_change_password = false;
          localStorage.setItem('kinematic_user', JSON.stringify(u));
        }
      } catch { /* ignore cache write failure */ }
      toast.success('Password updated');
      router.replace(landingRouteFor(getStoredUser()));
    } catch (err: any) {
      toast.error(err?.message || 'Could not update your password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #0b0d12)', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%', background: 'var(--s2, #14171f)', border: '1px solid var(--border, #262a33)', borderRadius: 16, padding: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text, #fff)', margin: 0 }}>Set a new password</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim, #9aa0aa)', marginTop: 8, marginBottom: 20 }}>
          For your security, please choose a new password before continuing.
        </p>
        <form onSubmit={submit}>
          <Field label="New password">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" placeholder="At least 6 characters" style={inp} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Re-enter password" style={inp} />
          </Field>
          <button type="submit" disabled={busy} style={{
            width: '100%', marginTop: 8, padding: '11px 16px', borderRadius: 10, border: 'none',
            background: 'var(--primary, #3E9EFF)', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          }}>{busy ? 'Saving…' : 'Update password & continue'}</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim, #9aa0aa)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--s3, #1b1f28)',
  border: '1px solid var(--border, #262a33)', color: 'var(--text, #fff)',
  padding: '10px 12px', borderRadius: 10, fontSize: 14,
};
