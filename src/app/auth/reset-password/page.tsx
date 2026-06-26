'use client';

/**
 * Reset-password — public, unauthed.
 *
 * Lands here from the email link. Token + email arrive as URL query
 * params (sent by the backend's branded reset email). On submit we
 * call /auth/reset-password which verifies the token, sets the new
 * password, and returns a fresh session — we saveSession() + route
 * the rep to their landing page. Zero re-login required.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '../../../lib/api';
import { saveSession, landingRouteFor } from '../../../lib/auth';
import type { AuthUser } from '../../../types';

const PALETTE = {
  bg:         '#F6F8FB',
  surface:    '#FFFFFF',
  ink:        '#0A0E1A',
  inkDim:     '#64748B',
  border:     '#E4E6EB',
  borderSoft: '#EEF1F5',
  red:        '#D01E2C',
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const email = (searchParams.get('email') || '').trim().toLowerCase();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkValid = !!token && !!email;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkValid) {
      setError('This reset link is incomplete. Open the link from the email again, or request a fresh one.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await api.resetPassword(email, token, password);
      // Mirrors the /login save path: stash the new session in
      // localStorage then route via landingRouteFor so role-based
      // routing matches the regular sign-in flow.
      const data = (resp as { data: { user: AuthUser; access_token: string; refresh_token?: string; expires_at?: number } }).data;
      saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at ?? 0,
        user: data.user,
      });
      router.replace(landingRouteFor(data.user));
    } catch (e: unknown) {
      setError((e as Error).message || 'Reset failed. The link may have expired — request a new one.');
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: PALETTE.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: "'Inter','DM Sans',-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      color: PALETTE.ink,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: PALETTE.surface,
        border: `1px solid ${PALETTE.borderSoft}`, borderRadius: 20, padding: 32,
        boxShadow: '0 30px 80px rgba(15,30,60,0.12)',
      }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-0.01em' }}>
          Kinematic
        </div>

        <h1 style={{ fontSize: 22, margin: '20px 0 8px', fontWeight: 700, color: PALETTE.ink }}>
          Set a new password
        </h1>
        {email && (
          <p style={{ fontSize: 13, color: PALETTE.inkDim, margin: '0 0 22px', lineHeight: 1.55 }}>
            for <strong style={{ color: PALETTE.ink }}>{email}</strong>
          </p>
        )}

        {!linkValid ? (
          <div style={{ fontSize: 13, color: PALETTE.red, background: 'rgba(208,30,44,0.06)', padding: '12px 14px', borderRadius: 8, lineHeight: 1.5 }}>
            This reset link is incomplete. Open the link from the email exactly as it was sent, or
            <Link href="/auth/forgot-password" style={{ color: PALETTE.red, fontWeight: 700, marginLeft: 4 }}>
              request a new one
            </Link>.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkDim, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                New password
              </span>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: '0 6px 0 14px', background: '#FFFFFF' }}>
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  style={{ flex: 1, border: 'none', padding: '12px 0', fontSize: 14, outline: 'none', background: 'transparent' }}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  style={{ background: 'transparent', border: 'none', color: PALETTE.inkDim, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 10px' }}
                  tabIndex={-1}
                >
                  {show ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkDim, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Confirm new password
              </span>
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-type to confirm"
                style={{
                  border: `1px solid ${PALETTE.border}`, borderRadius: 12,
                  padding: '12px 14px', fontSize: 14, outline: 'none',
                  background: '#FFFFFF',
                }}
              />
            </label>

            {error && (
              <div style={{ fontSize: 12, color: PALETTE.red, background: 'rgba(208,30,44,0.06)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                background: PALETTE.red, color: '#FFFFFF', border: 'none',
                padding: '13px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {busy ? 'Updating…' : 'Update password and sign me in'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${PALETTE.borderSoft}`, textAlign: 'center' }}>
          <Link
            href="/login"
            style={{ fontSize: 12, color: PALETTE.inkDim, textDecoration: 'none' }}
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
