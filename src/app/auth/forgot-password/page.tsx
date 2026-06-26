'use client';

/**
 * Forgot-password — public, unauthed.
 *
 * Companion to /auth/reset-password. Mirrors the /login page's
 * centered card layout + brand palette so the three screens read as
 * one flow. The backend's anti-enumeration guarantee means we ALWAYS
 * show the same "if this email is on file, a reset link is on its way"
 * message regardless of whether the address exists — never reveal
 * existence on the success screen either.
 */

import { useState } from 'react';
import Link from 'next/link';
import api from '../../../lib/api';

const PALETTE = {
  bg:         '#F6F8FB',
  surface:    '#FFFFFF',
  ink:        '#0A0E1A',
  inkDim:     '#64748B',
  border:     '#E4E6EB',
  borderSoft: '#EEF1F5',
  red:        '#D01E2C',
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter the email tied to your account.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(trimmed);
      // Always treat the response as success — backend never reveals
      // whether the email matched a user.
      setSent(true);
    } catch (e: unknown) {
      // Only NETWORK errors land here; a 2xx with "user not found"
      // doesn't because the backend's anti-enumeration guard already
      // returned 200. A genuine 5xx still surfaces a real error so
      // the rep knows to retry rather than wait for an email that
      // will never arrive.
      setError((e as Error).message || 'Something went wrong. Try again in a minute.');
    } finally {
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

        {!sent ? (
          <>
            <h1 style={{ fontSize: 22, margin: '20px 0 8px', fontWeight: 700, color: PALETTE.ink }}>
              Reset your password
            </h1>
            <p style={{ fontSize: 13, color: PALETTE.inkDim, margin: '0 0 22px', lineHeight: 1.55 }}>
              Type the email tied to your account and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkDim, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
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
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: '20px 0 8px', fontWeight: 700, color: PALETTE.ink }}>
              Check your inbox
            </h1>
            <p style={{ fontSize: 13, color: PALETTE.inkDim, margin: '0 0 22px', lineHeight: 1.6 }}>
              If <strong style={{ color: PALETTE.ink }}>{email}</strong> is tied to a Kinematic account,
              a reset link is on its way. It expires in 60 minutes and can be used only once.
            </p>
            <p style={{ fontSize: 12, color: PALETTE.inkDim, margin: '0 0 18px', lineHeight: 1.6 }}>
              Didn&apos;t get it? Check your spam folder, then click below to resend.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              style={{
                background: 'transparent', border: `1px solid ${PALETTE.border}`,
                color: PALETTE.ink, padding: '11px 16px', borderRadius: 12, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', width: '100%',
              }}
            >
              Resend reset link
            </button>
          </>
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
