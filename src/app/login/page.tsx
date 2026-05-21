'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { saveSession, landingRouteFor } from '../../lib/auth';

/**
 * Login page — light-themed marketing surface + sign-in form.
 *
 * Layout: the page covers the full viewport on desktop with a
 * feature-card grid on the left (≈60% width) and the sign-in card
 * pinned to the right rail. On narrow screens (≤960px) the grid drops
 * below the form. Cards stagger-fade in on mount and lift on hover.
 *
 * Light surface only — the rest of the app honours the user's
 * dark/light theme post-login, but the login screen is always light
 * so the marketing impression is consistent regardless of the saved
 * theme. The form itself uses the same auth flow as before;
 * everything new is presentational.
 */

interface Feature {
  icon: string;
  title: string;
  description: string;
  accent: string;
}

interface FeatureGroup {
  label: string;
  caption: string;
  tone: string;
  items: Feature[];
}

// Three pillars. Each card is one capability the platform ships today.
// Keep titles short (≤24 chars) and descriptions to one tight line so the
// grid stays scannable.
const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'Field Tracking',
    caption: 'Real-time visibility into every rep on the ground.',
    tone: '#F59E0B',
    items: [
      { icon: '📍', title: 'Live GPS Trail',         description: '10-minute breadcrumb pings + day-long polyline on the supervisor map.', accent: '#F59E0B' },
      { icon: '🤳', title: 'Selfie + Geo Attendance', description: 'Geo-fenced check-in with face capture. Auto-flags out-of-zone marks.',   accent: '#EAB308' },
      { icon: '🗺',  title: 'Smart Route Plans',     description: 'AI-ordered daily beats. Nearest-neighbour optimisation + carbon scoring.', accent: '#22C55E' },
      { icon: '🆘', title: 'SOS + Low-Battery Alerts',description: 'One-tap distress + automatic battery + offline alerts to supervisors.', accent: '#EF4444' },
      { icon: '📸', title: 'Geo-Tagged CC / ECC',     description: 'Consumer-contact forms with GPS, photo, GST-grade audit trail.',        accent: '#06B6D4' },
      { icon: '⏱',  title: 'Hours + Idle Time',     description: 'Work-hour totals, idle minutes, location dwell — per FE, per day.',     accent: '#8B5CF6' },
    ],
  },
  {
    label: 'Lead Management',
    caption: 'CRM that closes deals, not just records them.',
    tone: '#3E9EFF',
    items: [
      { icon: '✦', title: 'KINI AI Copilot',     description: 'Plain-English commands across leads, deals, and reports. Ask, act, automate.', accent: '#E01E2C' },
      { icon: '🎯', title: 'AI Lead Scoring',     description: 'ICP weights + behaviour signals. Focus on the 70+ scores first.',         accent: '#3E9EFF' },
      { icon: '🔀', title: 'Lead → Deal in One Tap',description: 'Convert spawns Contact + Account + Deal with the name pre-filled.',         accent: '#10B981' },
      { icon: '🪜', title: 'Pipeline + Kanban',   description: 'Drag-drop deal stages. Multiple pipelines per business motion.',             accent: '#6366F1' },
      { icon: '💬', title: 'WhatsApp + Email',    description: 'Native WhatsApp Business templates. Email tracking with open + click receipts.', accent: '#25D366' },
      { icon: '🔮', title: 'Win-Probability + NBA',description: 'Model-backed forecasts + a Next-Best-Action card on every open deal.',     accent: '#8B5CF6' },
      { icon: '📑', title: '10+ Reports + Builder',description: 'Funnel, stuck deals, lead aging, source ROI — plus a drag-drop custom builder.', accent: '#EC4899' },
      { icon: '🌐', title: 'Multi-language',      description: 'KINI replies in हिन्दी, বাংলা, ଓଡ଼ିଆ, অসমীয়া + English.',                  accent: '#0EA5E9' },
    ],
  },
  {
    label: 'Supply Chain',
    caption: 'Distributor onboarding to invoice reconciliation.',
    tone: '#10B981',
    items: [
      { icon: '🏬', title: 'Distributor Network',    description: 'Onboard distributors, retailers, sub-stockists with KYC + credit limits.', accent: '#10B981' },
      { icon: '🧾', title: 'GST-Grade Invoicing',    description: 'CGST/SGST/IGST splits, e-invoice IRN, immutable double-entry ledger.',     accent: '#F59E0B' },
      { icon: '💳', title: 'Payments + Returns',     description: 'UPI / cheque / bank tracking. Credit notes on returns auto-post to the ledger.', accent: '#3E9EFF' },
      { icon: '📦', title: 'SKU Catalogue',          description: 'Weight-based pricing, multi-pack, batch + expiry, channel-specific MRPs.',  accent: '#8B5CF6' },
      { icon: '📊', title: 'Stock Movement',         description: 'Real-time inventory across warehouses, vans, and retailer outlets.',          accent: '#EC4899' },
      { icon: '🔌', title: 'Tally Bridge (v1)',      description: 'Direct sync to Tally Prime / ERP 9. Eliminate manual re-keying entirely.',     accent: '#06B6D4' },
    ],
  },
];

const PALETTE = {
  bg: '#F6F8FB',
  surface: '#FFFFFF',
  ink: '#0A0E1A',
  inkDim: '#64748B',
  border: '#E4E6EB',
  borderSoft: '#EEF1F5',
  red: '#D01E2C',
  redSoft: 'rgba(208,30,44,0.06)',
};

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const router = useRouter();

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail)         { setError('Please enter a valid email address.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }

    setError(''); setLoading(true);
    try {
      const res = await api.login(email, password) as {
        success: boolean;
        data: {
          user: { id: string; name: string; role: string; org_id: string; permissions: string[] };
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
        router.push(landingRouteFor(user));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh', width: '100%',
      background: `linear-gradient(135deg, ${PALETTE.bg} 0%, #ECF0F6 100%)`,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: PALETTE.ink,
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Soft brand-tinted bloom in the background — keeps the surface
          interesting without competing with the cards. */}
      <div aria-hidden style={{ position: 'absolute', top: -160, right: -160, width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(208,30,44,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -120, left: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(62,158,255,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <style jsx global>{`
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .feature-card {
          animation: loginFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 36px rgba(15, 30, 60, 0.10);
        }
        .feature-icon {
          animation: loginFloat 4s ease-in-out infinite;
        }
        .login-card {
          animation: loginFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .login-input:focus {
          border-color: ${PALETTE.red} !important;
          box-shadow: 0 0 0 4px ${PALETTE.redSoft};
        }
        .login-submit:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 30px rgba(208,30,44,0.30);
        }
        @media (max-width: 960px) {
          /* On mobile the form leads — easier to sign in without
             scrolling past 20 marketing cards. The feature grid sits
             below as a "why this product" recap. column-reverse keeps
             the desktop JSX order (features → form) intact. */
          .login-split { flex-direction: column-reverse !important; }
          .login-feature-pane {
            min-height: auto !important;
            padding: 24px 20px 40px !important;
          }
          .login-form-pane {
            min-height: auto !important;
            padding: 28px 20px 12px !important;
            flex: 0 0 auto !important;
          }
        }
      `}</style>

      <div className="login-split" style={{ display: 'flex', width: '100%', position: 'relative', zIndex: 1 }}>
        {/* LEFT — feature grid covering the page */}
        <section className="login-feature-pane" style={{
          flex: '1 1 60%', minHeight: '100vh',
          padding: '56px 56px 40px',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
            <img src="/logo-mark.png" alt="Kinematic" style={{ width: 44, height: 44, objectFit: 'contain' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '-0.3px' }}>
                  Kinematic
                </span>
                {/* "Powered with KINI AI" pill — sits right next to the
                    wordmark and uses the brand red the rest of the app
                    reserves for KINI surfaces. */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                  textTransform: 'uppercase', color: PALETTE.red,
                  background: PALETTE.redSoft, padding: '4px 9px',
                  border: '1px solid rgba(208,30,44,0.22)', borderRadius: 999,
                }}>
                  <span style={{ fontSize: 11, lineHeight: 1 }}>✦</span>
                  Powered with KINI AI
                </span>
              </div>
              <div style={{ fontSize: 11, color: PALETTE.inkDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 }}>
                Field Force · CRM · Supply Chain
              </div>
            </div>
          </div>

          <h2 style={{
            fontFamily: "'Syne',sans-serif", fontSize: 40, fontWeight: 900,
            margin: '0 0 12px', letterSpacing: '-0.8px', maxWidth: 720, lineHeight: 1.1,
            animation: 'loginFadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            Motion Made <span style={{ color: PALETTE.red }}>Measurable</span>.
          </h2>
          <p style={{
            fontSize: 15, color: PALETTE.inkDim, margin: '0 0 32px', maxWidth: 620, lineHeight: 1.55,
            animation: 'loginFadeUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.08s both',
          }}>
            One platform for field tracking, lead management, and supply chain — purpose-built for India&apos;s field-first businesses.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 920 }}>
            {FEATURE_GROUPS.map((group, gi) => (
              <div key={group.label}>
                {/* Pillar header — gives the grid a clear story (Field
                    Tracking / Lead Management / Supply Chain) rather
                    than a flat 18-card wall. */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12,
                  animation: `loginFadeUp 0.55s cubic-bezier(0.16,1,0.3,1) ${0.15 + gi * 0.15}s both`,
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900,
                    color: PALETTE.ink, letterSpacing: '-0.2px',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 2, background: group.tone,
                      display: 'inline-block',
                    }} />
                    {group.label}
                  </span>
                  <span style={{ fontSize: 12, color: PALETTE.inkDim }}>
                    {group.caption}
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                  gap: 12,
                }}>
                  {group.items.map((f, i) => (
                    <div
                      key={f.title}
                      className="feature-card"
                      style={{
                        background: PALETTE.surface,
                        border: `1px solid ${PALETTE.border}`,
                        borderRadius: 14,
                        padding: '14px 14px 12px',
                        // Stagger inside each group so pillars fill in
                        // sequentially top-to-bottom, left-to-right.
                        animationDelay: `${0.22 + gi * 0.15 + i * 0.045}s`,
                        boxShadow: '0 1px 2px rgba(15, 30, 60, 0.04)',
                      }}
                    >
                      <div
                        className="feature-icon"
                        style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: `${f.accent}14`,
                          color: f.accent,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 17, marginBottom: 9,
                          animationDelay: `${i * 0.12}s`,
                        }}
                      >
                        {f.icon}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 12.5, color: PALETTE.ink, marginBottom: 3, letterSpacing: '-0.1px' }}>
                        {f.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: PALETTE.inkDim, lineHeight: 1.5 }}>
                        {f.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT — sign-in card */}
        <section className="login-form-pane" style={{
          flex: '0 0 440px', minHeight: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 36px',
        }}>
          <div className="login-card" style={{
            width: '100%', maxWidth: 380,
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 20,
            padding: 32,
            boxShadow: '0 20px 60px rgba(15, 30, 60, 0.10)',
          }}>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800,
              margin: '0 0 6px', letterSpacing: '-0.3px', color: PALETTE.ink,
            }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 13, color: PALETTE.inkDim, margin: '0 0 24px' }}>
              Sign in to your Kinematic account.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: PALETTE.inkDim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={PALETTE.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input
                    className="login-input"
                    type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@company.com" required
                    style={{
                      width: '100%', background: PALETTE.bg,
                      border: `1.5px solid ${PALETTE.borderSoft}`, color: PALETTE.ink,
                      borderRadius: 11, padding: '11px 14px 11px 36px', fontSize: 14,
                      outline: 'none', transition: 'border-color 0.18s, box-shadow 0.18s',
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: PALETTE.inkDim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={PALETTE.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <input
                    className="login-input"
                    type={showPass ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="Enter your password" required
                    style={{
                      width: '100%', background: PALETTE.bg,
                      border: `1.5px solid ${PALETTE.borderSoft}`, color: PALETTE.ink,
                      borderRadius: 11, padding: '11px 42px 11px 36px', fontSize: 14,
                      outline: 'none', transition: 'border-color 0.18s, box-shadow 0.18s',
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  />
                  <button type="button" onClick={() => setShowPass((p) => !p)} aria-label={showPass ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.55, padding: 4 }}>
                    {showPass ? (
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={PALETTE.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={PALETTE.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: PALETTE.redSoft, border: `1px solid rgba(208,30,44,0.22)`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={PALETTE.red} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span style={{ fontSize: 12, color: PALETTE.red, fontWeight: 600 }}>{error}</span>
                </div>
              )}

              <button
                type="submit" disabled={loading || !email || !password}
                className="login-submit"
                style={{
                  width: '100%',
                  background: loading || !email || !password ? 'rgba(208,30,44,0.55)' : PALETTE.red,
                  color: '#fff', border: 'none', borderRadius: 12,
                  padding: '13px', fontSize: 14, fontWeight: 700,
                  fontFamily: "'Syne',sans-serif",
                  cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'transform 0.18s, box-shadow 0.18s, background 0.18s',
                  marginTop: 6,
                  boxShadow: loading || !email || !password ? 'none' : '0 8px 22px rgba(208,30,44,0.26)',
                }}
              >
                {loading
                  ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                  : 'Sign In →'
                }
              </button>

              <p style={{ textAlign: 'center', fontSize: 12, color: PALETTE.inkDim, margin: '6px 0 0' }}>
                Forgot password?{' '}
                <span style={{ color: PALETTE.red, cursor: 'pointer', fontWeight: 700 }}>Contact your administrator</span>
              </p>
            </form>

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${PALETTE.borderSoft}`, textAlign: 'center', fontSize: 11, color: PALETTE.inkDim }}>
              Role-based access controlled by your admin · v1.0
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
