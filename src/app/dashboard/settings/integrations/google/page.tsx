'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import api from '../../../../../lib/api';

type Status = { connected: boolean; email?: string; configured?: boolean };

/**
 * Google Calendar integration — per-user OAuth handshake.
 *
 * Connect → backend returns Google's consent URL → we redirect there.
 * After consent Google redirects back to `/api/v1/integrations/google/
 * callback` which finishes the exchange and bounces here with either
 * `?connected=<email>` or `?error=<message>`.
 */
export default function GoogleCalendarIntegrationPage() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const r = await api.get<Status>('/api/v1/integrations/google/status');
      setStatus(r);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load status');
    }
  };

  useEffect(() => { reload(); }, []);

  // Surface OAuth result from query string on first render.
  useEffect(() => {
    const connected = sp?.get('connected');
    const err = sp?.get('error');
    if (connected) {
      toast.success(`Google Calendar connected as ${connected}`);
      reload();
      // Clean the URL so the message doesn't re-fire on subsequent reloads.
      window.history.replaceState({}, '', window.location.pathname);
    } else if (err) {
      toast.error(`Google connection failed: ${err}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [sp]);

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
    if (!confirm('Disconnect Google Calendar? New CRM activities will stop syncing to your calendar.')) return;
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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 0' }}>
      <Link href="/dashboard/settings" style={{ fontSize: 12, color: 'var(--text-dim)' }}>← Back to Settings</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 6 }}>Google Calendar</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 22 }}>
        Connect your Google account so every meeting, call and task you log in Kinematic shows up on your Google Calendar automatically. Updates and deletions on the CRM side keep the calendar event in sync. One-way push only — events created directly on Google Calendar do not appear in Kinematic.
      </p>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        {status === null ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : status.configured === false ? (
          <div style={{ fontSize: 13, color: '#f59e0b', lineHeight: 1.6 }}>
            Google OAuth isn&rsquo;t configured on the server yet. Your administrator needs to set <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code> and <code>GOOGLE_OAUTH_REDIRECT_URI</code> before this feature is available.
          </div>
        ) : status.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#10b981' }} />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                Connected as <strong>{status.email || 'your Google account'}</strong>
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              Activities you log with a due / scheduled time get pushed to your primary Google Calendar. Updates and deletes stay in sync.
            </p>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              style={{
                background: 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: 'var(--text-dim)' }} />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Not connected</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              You&rsquo;ll be redirected to Google to grant Kinematic permission to create events on your calendar. We only ask for calendar-event access (<code>calendar.events</code>) and your email address.
            </p>
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                color: '#3c4043',
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              <GoogleLogo size={18} />
              {busy ? 'Redirecting…' : 'Connect Google Calendar'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 22, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>What gets synced?</strong>
        <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
          <li>Meetings, calls and tasks with a scheduled / due time.</li>
          <li>Subject becomes the event title; notes become the description.</li>
          <li>Updates and deletes on the CRM side keep the calendar event in sync.</li>
          <li>Notes-only activities (no due time) are not pushed.</li>
        </ul>
      </div>
    </div>
  );
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.972 32.91 29.418 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.398 0-9.953-3.077-11.299-7.946l-6.514 5.02C9.466 39.557 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.572l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
