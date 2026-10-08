'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { Button, Card, Field, Input, T } from '../ui';
import { PASSWORD_POLICY_HINT, changePasswordProblem } from '../../lib/passwordPolicy';

/**
 * Voluntary "Change password" for the signed-in user (My account). The server verifies the current
 * password before it accepts a new one, so a session left open on a shared computer cannot be used
 * to lock the owner out. The forced first-login screen (/set-password) is separate and does not ask
 * for the current password.
 */
export default function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const problem = changePasswordProblem(current, next, confirm);
  const mismatch = confirm.length > 0 && confirm !== next;
  const type = show ? 'text' : 'password';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setServerError('');
    try {
      await api.changePassword(next, current);
      setCurrent(''); setNext(''); setConfirm('');
      toast.success('Password updated');
    } catch (err: any) {
      // The server's message is specific ("Your current password is incorrect.", the policy reason,
      // a breached-password rejection…), so show it as is.
      setServerError(err?.message || 'Could not update your password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding={22} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, flexShrink: 0 }}>
          <KeyRound size={17} strokeWidth={1.7} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Change password</div>
          <div style={{ fontSize: 12.5, color: T.dim }}>Enter your current password, then choose a new one.</div>
        </div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Current password" htmlFor="current-password">
          <Input id="current-password" type={type} value={current} onChange={(e) => { setCurrent(e.target.value); setServerError(''); }}
            autoComplete="current-password" style={{ height: 40 }} />
        </Field>
        <Field label="New password" hint={PASSWORD_POLICY_HINT} htmlFor="new-password">
          <Input id="new-password" type={type} value={next} onChange={(e) => { setNext(e.target.value); setServerError(''); }}
            autoComplete="new-password" style={{ height: 40 }} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : undefined} htmlFor="confirm-password">
          <Input id="confirm-password" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" invalid={mismatch} style={{ height: 40 }} />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.dim, cursor: 'pointer', width: 'fit-content' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
        </label>

        {serverError && (
          <div role="alert" style={{ fontSize: 13, color: T.red, lineHeight: 1.4 }}>{serverError}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || problem !== null}
            icon={busy ? <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : undefined}
          >
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Card>
  );
}
