'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';

type Status = { connected: boolean; email?: string; configured?: boolean };

/**
 * Inline Google Calendar connect/disconnect strip — designed to sit
 * above the activity calendar grid so reps can hook up their Google
 * account without leaving the page. Replaces the standalone settings
 * page as the primary entry point.
 *
 * Three states:
 *   - configured:false → "ask your admin to set this up"
 *   - connected:false  → "Connect Google Calendar" button
 *   - connected:true   → "Synced to alice@example.com · Disconnect"
 *
 * Also picks up `?connected=…` / `?error=…` query params from the
 * OAuth callback and surfaces them as toasts before clearing the URL.
 */
export default function GoogleCalendarBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const r = await api.get<Status>('/api/v1/integrations/google/status');
      setStatus(r);
    } catch {
      // Endpoint missing on older backends → hide the banner entirely
      // rather than show a broken state.
      setStatus({ connected: false, configured: false });
    }
  };

  useEffect(() => { reload(); }, []);

  // Surface OAuth round-trip result from query string once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get('connected');
    const err = sp.get('error');
    if (connected) {
      toast.success(`Google Calendar connected as ${connected}`);
      reload();
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    } else if (err) {
      toast.error(`Google connection failed: ${err}`);
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await api.get<{ url: string }>('/api/v1/integrations/google/authorize');
      window.location.href = r.url;
    } catch (e: any) {
      toast.error(e.message || 'Failed to start Google OAuth');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google Calendar? New activities will stop syncing to your calendar.')) return;
    setBusy(true);
    try {
      await api.delete('/api/v1/integrations/google');
      toast.success('Disconnected');
      await reload();
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  // Don't show anything when the backend hasn't been configured —
  // there's nothing the rep can do about it from here.
  if (status.configured === false) {
    return (
      <div style={bannerStyle('warning')}>
        <GIcon />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>
          Google Calendar sync isn&rsquo;t set up on this server yet — ask your administrator to configure the Google OAuth credentials.
        </span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div style={bannerStyle('ok')}>
        <GIcon />
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
          Synced to <strong>{status.email || 'your Google account'}</strong>. Activities with a scheduled time appear on your Google Calendar.
        </span>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '…' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <div style={bannerStyle('cta')}>
      <GIcon />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
        Connect your Google account to mirror activities onto your Google Calendar automatically.
      </span>
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          color: '#3c4043',
          padding: '7px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
      >
        {busy ? 'Redirecting…' : 'Connect Google Calendar'}
      </button>
    </div>
  );
}

function bannerStyle(kind: 'cta' | 'ok' | 'warning'): React.CSSProperties {
  const tint =
    kind === 'ok'      ? 'rgba(16,185,129,0.08)'
    : kind === 'warning' ? 'rgba(245,158,11,0.08)'
    : 'var(--s2)';
  const border =
    kind === 'ok'      ? 'rgba(16,185,129,0.35)'
    : kind === 'warning' ? 'rgba(245,158,11,0.35)'
    : 'var(--border)';
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: tint,
    border: `1px solid ${border}`,
    borderRadius: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  };
}

function GIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.972 32.91 29.418 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.398 0-9.953-3.077-11.299-7.946l-6.514 5.02C9.466 39.557 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.572l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
