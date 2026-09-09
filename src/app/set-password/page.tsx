'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { getStoredToken, getStoredUser, landingRouteFor } from '../../lib/auth';
import BrandLogo from '../../components/shared/BrandLogo';
import { Button, Card, Field, Input, T } from '../../components/ui';

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

  const mismatch = confirm.length > 0 && confirm !== pw;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.canvas, color: T.text, padding: 20 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Card padding={28} style={{ width: 420, maxWidth: '100%', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <BrandLogo size={26} />
          <span style={{ fontFamily: T.heading, fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>Kinematic</span>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: T.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, marginBottom: 14 }}>
          <KeyRound size={18} strokeWidth={1.7} />
        </div>
        <h1 style={{ margin: 0, fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Set a new password</h1>
        <p style={{ fontSize: 13.5, color: T.dim, margin: '6px 0 22px', lineHeight: 1.5 }}>
          You signed in with a temporary password. Choose your own before continuing.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="New password" hint="At least 6 characters." htmlFor="new-password">
            <Input id="new-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" placeholder="At least 6 characters" style={{ height: 40 }} />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : undefined} htmlFor="confirm-password">
            <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Re-enter password" invalid={mismatch} style={{ height: 40 }} />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            style={{ height: 40, width: '100%', fontSize: 14, marginTop: 4 }}
            icon={busy ? <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : undefined}
          >
            {busy ? 'Saving…' : 'Update password & continue'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
