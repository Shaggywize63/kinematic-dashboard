'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Route, Sparkles, Truck } from 'lucide-react';
import api, { API_BASE_URL } from '../../lib/api';
import * as demo from '../../lib/demoMocks';
import { saveSession, landingRouteFor, detectIdentitySwitch, recordLoginIdentity } from '../../lib/auth';
import { resolveProjectForEmail, setStoredProjectKey, DEFAULT_PROJECT } from '../../lib/projects';
import BrandLogo from '../../components/shared/BrandLogo';
import { Button, Field, Input, T, useIsCompact } from '../../components/ui';

/**
 * Login page — a two-pane sign-in.
 *
 * Left: an always-dark brand pane (mark, headline, the three product
 * pillars). Right: the sign-in card on the theme canvas, so it follows the
 * viewer's light / dark choice like the rest of the app. Under 960px the
 * brand pane collapses to a short band above the form.
 */

// The brand pane is deliberately single-theme (dark) so the red mark and the
// white-dot logo always sit on the same ground. These are the only literal
// colours on the page; everything else comes from the theme tokens.
const PANE = {
  bg: '#0A0F1D',
  bg2: '#0E1A2E',
  text: '#E8EDF8',
  dim: '#8A9BB3',
  mute: '#55657D',
  rule: 'rgba(255,255,255,0.08)',
  red: '#D01E2C',
};

const PILLARS = [
  { icon: Route, title: 'Field force', body: 'Live GPS trail, selfie attendance, route plans and geo-tagged check-ins, captured automatically.' },
  { icon: Sparkles, title: 'Lead management', body: 'KINI AI scores every lead, drafts the next step and moves deals through the pipeline.' },
  { icon: Truck, title: 'Distribution', body: 'Distributor network, GST-grade invoicing, payments and returns on one ledger.' },
] as const;

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const router = useRouter();
  const narrow = useIsCompact(960);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail)         { setError('Please enter a valid email address.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }

    setError(''); setLoading(true);

    // Demo account runs entirely on client-side fixtures (matchDemoMock). Log
    // it in WITHOUT calling the backend so the showcase works even when the API
    // is cold-starting or unreachable. Any password is accepted for the single
    // public demo email; every subsequent request is served from the mocks.
    if (email.trim().toLowerCase() === demo.DEMO_USER_EMAIL) {
      const me = demo.matchDemoMock<{ data?: Record<string, unknown> }>('/api/v1/auth/me', 'GET');
      const user = (me && me.data ? me.data : {
        id: 'demo-user-999', email: demo.DEMO_USER_EMAIL, name: 'Demo Admin',
        role: 'super_admin', org_id: 'demo-org-999', permissions: [],
      }) as Parameters<typeof saveSession>[0]['user'];
      saveSession({
        user,
        // Must match the backend's accepted demo token EXACTLY
        // (auth.ts DEMO token bypass = 'demo-token-jwt-placeholder'). Pages with
        // no client-side mock (e.g. the whole Distribution/SCM section) fall
        // through to the real network; with the wrong token the backend 401s and
        // the page errors even when DEMO_MODE=on. With the canonical token the
        // backend serves its demo fixtures instead.
        access_token: 'demo-token-jwt-placeholder',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      });
      setLoading(false);
      router.push(landingRouteFor(user));
      return;
    }

    // Multi-project: resolve which Supabase project this email belongs to and
    // store it BEFORE login, so api.login() stamps the X-Kinematic-Project
    // header and the backend authenticates against the correct project. Always
    // resolves (defaults on failure), so this never blocks login.
    let project = DEFAULT_PROJECT;
    try {
      project = await resolveProjectForEmail(API_BASE_URL, email);
      setStoredProjectKey(project);
    } catch { setStoredProjectKey(null); }

    // Retry up to 3 attempts on network errors (covers backend cold starts).
    // Credential errors (wrong password, inactive account, etc.) are not retried.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      try {
        const res = await api.login(email, password) as {
          success: boolean;
          data: {
            user: { id: string; name: string; email: string; role: string; org_id: string; client_id?: string | null; permissions: string[] };
            access_token: string;
            refresh_token?: string;
            expires_at: number;
          };
        };
        if (res.success && res.data) {
          const user = res.data.user as Parameters<typeof saveSession>[0]['user'];
          saveSession({
            user,
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token,
            expires_at: res.data.expires_at ?? Math.floor(Date.now() / 1000) + 86400,
          });
          // Warn if this browser was last signed in as a DIFFERENT account/org —
          // catches acting under the wrong session before anything gets created
          // under it (see detectIdentitySwitch for the motivating incident).
          const switchWarning = detectIdentitySwitch(user, project);
          if (switchWarning) toast.warning(switchWarning, { duration: 15000 });
          recordLoginIdentity(user, project);
          router.push(landingRouteFor(user));
        }
        setLoading(false);
        return;
      } catch (err) {
        const raw = err instanceof Error ? err.message : '';
        const isNetwork = /Failed to fetch|NetworkError|Load failed/i.test(raw);
        lastErr = err;
        if (!isNetwork) break; // credential / server error — don't retry
      }
    }

    // All attempts exhausted — surface the error.
    const raw = lastErr instanceof Error ? lastErr.message : '';
    if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
      // eslint-disable-next-line no-console
      console.error('[login] could not reach API after retries', API_BASE_URL, raw);
      setError('Could not reach the server. Check your internet connection and try again, or contact your administrator if the problem persists.');
    } else {
      setError(raw || 'Login failed. Check your credentials.');
    }
    setLoading(false);
  };

  const canSubmit = !loading && !!email && !!password;
  const iconAt: React.CSSProperties = { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' };

  return (
    <main style={{
      minHeight: '100vh', width: '100%', background: T.canvas, color: T.text,
      display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(360px, 44%) 1fr',
      gridTemplateRows: narrow ? 'auto 1fr' : '1fr',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes loginRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .login-rise { animation: loginRise .5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) { .login-rise { animation: none; } }
      `}</style>

      {/* ── Brand pane ─────────────────────────────────────────────────── */}
      <aside style={{
        position: 'relative', overflow: 'hidden',
        background: `linear-gradient(160deg, ${PANE.bg2} 0%, ${PANE.bg} 70%)`, color: PANE.text,
        padding: narrow ? '28px 24px 24px' : '40px 48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: narrow ? 20 : 48,
      }}>
        <div aria-hidden style={{ position: 'absolute', top: -220, left: -160, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(208,30,44,0.22) 0%, transparent 62%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -240, right: -200, width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(77,157,255,0.14) 0%, transparent 62%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandLogo size={30} forceDark />
          <span style={{ fontFamily: T.heading, fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>Kinematic</span>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: narrow ? 8 : 28, maxWidth: 480 }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PANE.dim, marginBottom: 12 }}>
              Field force · CRM · Distribution
            </div>
            <h1 style={{ margin: 0, color: '#FFFFFF', fontFamily: T.heading, fontSize: narrow ? 26 : 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12, textWrap: 'balance' as any }}>
              Motion, made <span style={{ color: PANE.red }}>measurable</span>
            </h1>
            {!narrow && (
              <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.55, color: PANE.dim }}>
                One workspace for the people in the field, the leads they bring in and the stock that follows.
              </p>
            )}
          </div>

          {!narrow && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 18 }}>
              {PILLARS.map(({ icon: Icon, title, body }) => (
                <li key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: `1px solid ${PANE.rule}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PANE.text }}>
                    <Icon size={17} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: PANE.dim }}>{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!narrow && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 20, borderTop: `1px solid ${PANE.rule}`, fontFamily: T.mono, fontSize: 11, color: PANE.mute }}>
            <span>© {new Date().getFullYear()} Kinematic</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} strokeWidth={1.8} style={{ color: PANE.red }} />
              Powered with KINI AI
            </span>
          </div>
        )}
      </aside>

      {/* ── Sign-in pane ───────────────────────────────────────────────── */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? '32px 20px 48px' : '48px 40px' }}>
        <div className="login-rise" style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Sign in</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: T.dim }}>Use the work email your administrator invited.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Email" htmlFor="login-email">
              <div style={{ position: 'relative' }}>
                <Mail size={15} strokeWidth={1.8} style={iconAt} />
                <Input
                  id="login-email"
                  type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@company.com" required autoComplete="email" autoFocus
                  invalid={!!error && !validEmail}
                  style={{ height: 40, paddingLeft: 36 }}
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password">
              <div style={{ position: 'relative' }}>
                <Lock size={15} strokeWidth={1.8} style={iconAt} />
                <Input
                  id="login-password"
                  type={showPass ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password" required autoComplete="current-password"
                  style={{ height: 40, paddingLeft: 36, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  title={showPass ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent', color: T.mute, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showPass ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>
            </Field>

            {error && (
              <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13, lineHeight: 1.45 }}>
                <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              style={{ height: 40, width: '100%', fontSize: 14, marginTop: 4 }}
              icon={loading ? <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : undefined}
            >
              {loading ? 'Signing in…' : <>Sign In <ArrowRight size={16} strokeWidth={2} /></>}
            </Button>

            <p style={{ textAlign: 'center', fontSize: 13, color: T.dim, margin: 0 }}>
              Forgot your password?{' '}
              <a href="/auth/forgot-password" style={{ color: T.text, fontWeight: 600, textDecoration: 'none', borderBottom: `1px solid ${T.borderStrong}` }}>Reset it</a>
            </p>
          </form>

          {narrow && (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: '20px 0 0', borderTop: `1px solid ${T.border}`, display: 'grid', gap: 12 }}>
              {PILLARS.map(({ icon: Icon, title, body }) => (
                <li key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.raised, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.dim }}>
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: T.dim }}>{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
