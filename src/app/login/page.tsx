'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import api, { API_BASE_URL } from '../../lib/api';
import { saveSession, landingRouteFor } from '../../lib/auth';

/**
 * Login page — light-themed marketing surface + sign-in form.
 *
 * Desktop layout: the sign-in card is fixed dead-centre of the viewport,
 * and 12 marquee feature cards float around it like a constellation —
 * each with its own gentle drift animation (different phase + duration
 * per card) and a small initial rotation so the cluster feels alive.
 *
 * Mobile (≤960px): the constellation collapses to a single orderly
 * column — logo + headline + form first, then the feature grid below
 * as a recap. Floating layouts would overlap the form at narrow widths.
 */

interface Feature {
  icon: string;
  title: string;
  group: 'field' | 'leads' | 'supply';
  accent: string;
}

// 20 marquee features scattered around the form. Order here defines the
// position index used in CONSTELLATION below — keep them in lockstep.
const FEATURES: Feature[] = [
  // Field Tracking (7)
  { icon: '📍', title: 'Live GPS Trail',          group: 'field',  accent: '#F59E0B' },
  { icon: '🤳', title: 'Selfie Attendance',       group: 'field',  accent: '#EAB308' },
  { icon: '🗺',  title: 'Smart Route Plans',      group: 'field',  accent: '#22C55E' },
  { icon: '🆘', title: 'SOS + Battery Alerts',    group: 'field',  accent: '#EF4444' },
  { icon: '📸', title: 'Geo-Tagged CC / ECC',     group: 'field',  accent: '#06B6D4' },
  { icon: '⏱',  title: 'Hours + Idle Time',      group: 'field',  accent: '#8B5CF6' },
  { icon: '📊', title: 'Live Heatmap',            group: 'field',  accent: '#F97316' },
  // Lead Management (8)
  { icon: '✦', title: 'KINI AI Copilot',          group: 'leads',  accent: '#E01E2C' },
  { icon: '🎯', title: 'AI Lead Scoring',         group: 'leads',  accent: '#3E9EFF' },
  { icon: '🔀', title: 'Lead → Deal in 1 Tap',    group: 'leads',  accent: '#10B981' },
  { icon: '💬', title: 'WhatsApp + Email',        group: 'leads',  accent: '#25D366' },
  { icon: '📑', title: 'Reports + Forecast',      group: 'leads',  accent: '#EC4899' },
  { icon: '🪜', title: 'Pipeline + Kanban',       group: 'leads',  accent: '#6366F1' },
  { icon: '🔮', title: 'Win-Probability + NBA',   group: 'leads',  accent: '#A855F7' },
  { icon: '🌐', title: 'Multi-language',          group: 'leads',  accent: '#0EA5E9' },
  // Supply Chain (5)
  { icon: '🏬', title: 'Distributor Network',     group: 'supply', accent: '#10B981' },
  { icon: '🧾', title: 'GST-Grade Invoicing',     group: 'supply', accent: '#F59E0B' },
  { icon: '💳', title: 'Payments + Returns',      group: 'supply', accent: '#3E9EFF' },
  { icon: '📦', title: 'SKU Catalogue',           group: 'supply', accent: '#8B5CF6' },
  { icon: '🔌', title: 'Tally Bridge',            group: 'supply', accent: '#06B6D4' },
];

// Hand-tuned constellation around a ~380px-wide centred form. Each entry
// is an absolute position relative to the viewport (top/left/right/bottom
// in % + a small rotation). Slot count = FEATURES.length; pattern keeps a
// clear corridor through the centre so the form's bounds stay readable
// at ≥1200px width while still feeling scattered.
interface SlotStyle { top?: string; left?: string; right?: string; bottom?: string; rotate: number; floatVariant: 1 | 2 | 3; delay: number }
const CONSTELLATION: SlotStyle[] = [
  // Top band (6 cards)
  { top: '3%',  left:  '2%',  rotate: -6, floatVariant: 1, delay: 0.04 },
  { top: '8%',  left: '16%',  rotate:  4, floatVariant: 2, delay: 0.10 },
  { top: '3%',  left: '32%',  rotate: -3, floatVariant: 3, delay: 0.16 },
  { top: '4%',  right:'32%',  rotate:  5, floatVariant: 1, delay: 0.22 },
  { top: '7%',  right:'16%',  rotate: -5, floatVariant: 2, delay: 0.28 },
  { top: '3%',  right: '2%',  rotate:  6, floatVariant: 3, delay: 0.34 },
  // Upper-mid band (4 cards, hugging the form's shoulders)
  { top: '24%', left:  '1%',  rotate:  4, floatVariant: 2, delay: 0.40 },
  { top: '30%', left: '12%',  rotate: -5, floatVariant: 3, delay: 0.46 },
  { top: '28%', right:'12%',  rotate:  3, floatVariant: 1, delay: 0.52 },
  { top: '23%', right: '1%',  rotate: -6, floatVariant: 2, delay: 0.58 },
  // Lower-mid band (4 cards, hugging the form's waist)
  { top: '55%', left:  '1%',  rotate: -4, floatVariant: 3, delay: 0.64 },
  { top: '62%', left: '12%',  rotate:  5, floatVariant: 1, delay: 0.70 },
  { top: '60%', right:'12%',  rotate: -3, floatVariant: 2, delay: 0.76 },
  { top: '56%', right: '1%',  rotate:  6, floatVariant: 3, delay: 0.82 },
  // Bottom band (6 cards)
  { bottom: '3%', left:  '2%', rotate:  5, floatVariant: 1, delay: 0.88 },
  { bottom: '7%', left: '16%', rotate: -4, floatVariant: 2, delay: 0.94 },
  { bottom: '3%', left: '32%', rotate:  3, floatVariant: 3, delay: 1.00 },
  { bottom: '4%', right:'32%', rotate: -5, floatVariant: 1, delay: 1.06 },
  { bottom: '6%', right:'16%', rotate:  4, floatVariant: 2, delay: 1.12 },
  { bottom: '3%', right: '2%', rotate: -6, floatVariant: 3, delay: 1.18 },
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
      // "Failed to fetch" is a browser-level error meaning the request never
      // reached our backend. Show a generic message to the user (never expose
      // the backend URL/infra); log the detail to the console for support.
      const raw = e instanceof Error ? e.message : '';
      if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
        // eslint-disable-next-line no-console
        console.error('[login] could not reach API', API_BASE_URL, raw);
        setError('Could not reach the server. Check your internet connection and try again, or contact your administrator if the problem persists.');
      } else {
        setError(raw || 'Login failed. Check your credentials.');
      }
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
    }}>
      <style jsx global>{`
        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        /* Three float variants so neighbouring cards don't bob in lockstep. */
        @keyframes floatA {
          0%, 100% { transform: translate(0, 0)   rotate(var(--rot, 0deg)); }
          50%      { transform: translate(6px, -10px) rotate(var(--rot, 0deg)); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0, 0)   rotate(var(--rot, 0deg)); }
          50%      { transform: translate(-8px, -6px) rotate(var(--rot, 0deg)); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0, 0)   rotate(var(--rot, 0deg)); }
          50%      { transform: translate(4px, 8px) rotate(var(--rot, 0deg)); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes formPop {
          0%   { opacity: 0; transform: translate(-50%, -48%) scale(0.92); }
          60%  { opacity: 1; transform: translate(-50%, -50%) scale(1.01); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .floating-card {
          /* Entry animation runs once, then we hand off to the continuous
             float so the card never stops moving (slowly). The continuous
             animation owns the transform via the --rot CSS var. */
          opacity: 0;
          animation:
            loginFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) var(--entry-delay, 0s) forwards,
            var(--float-anim, floatA) var(--float-dur, 8s) ease-in-out infinite;
          animation-delay: var(--entry-delay, 0s), calc(var(--entry-delay, 0s) + 0.7s);
        }
        .floating-card:hover {
          z-index: 5;
          /* Pause the drift on hover so the user can read the card. */
          animation-play-state: paused, paused;
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
          /* Mobile: collapse the constellation into a normal vertical
             stack — logo + headline → form → recap grid. */
          .login-constellation { display: none !important; }
          .login-card-center {
            position: static !important;
            transform: none !important;
            margin: 0 auto;
            animation: loginFadeIn 0.6s ease both !important;
          }
          .login-mobile-stack { display: flex !important; }
        }
        @media (min-width: 961px) {
          .login-mobile-stack { display: none !important; }
        }
      `}</style>

      {/* Background blooms */}
      <div aria-hidden style={{ position: 'absolute', top: -160, right: -160, width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(208,30,44,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -120, left: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(62,158,255,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* DESKTOP — constellation of floating cards around the form */}
      <div className="login-constellation" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {FEATURES.map((f, i) => {
          const slot = CONSTELLATION[i % CONSTELLATION.length];
          const floatAnim = `float${slot.floatVariant === 1 ? 'A' : slot.floatVariant === 2 ? 'B' : 'C'}`;
          const floatDur  = 7 + (i % 4); // 7s / 8s / 9s / 10s — desync neighbours
          return (
            <div
              key={f.title}
              className="floating-card"
              style={{
                position: 'absolute',
                top: slot.top,
                left: slot.left,
                right: slot.right,
                bottom: slot.bottom,
                width: 178,
                background: PALETTE.surface,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 13,
                padding: '11px 12px 10px',
                boxShadow: '0 10px 28px rgba(15, 30, 60, 0.08)',
                pointerEvents: 'auto',
                cursor: 'default',
                ['--rot' as any]: `${slot.rotate}deg`,
                ['--entry-delay' as any]: `${slot.delay}s`,
                ['--float-anim' as any]: floatAnim,
                ['--float-dur' as any]: `${floatDur}s`,
                transform: `rotate(${slot.rotate}deg)`,
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: `${f.accent}14`, color: f.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, marginBottom: 7,
              }}>{f.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 12, color: PALETTE.ink, letterSpacing: '-0.1px' }}>
                {f.title}
              </div>
            </div>
          );
        })}
      </div>

      {/* CENTERED LOGIN CARD */}
      <div
        className="login-card-center"
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%', maxWidth: 380,
          padding: '0 20px',
          zIndex: 10,
          animation: 'formPop 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        }}
      >
        <div style={{
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 30px 80px rgba(15, 30, 60, 0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <img src="/logo-mark.png" alt="Kinematic" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, letterSpacing: '-0.3px' }}>
                  Kinematic
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
                  textTransform: 'uppercase', color: PALETTE.red,
                  background: PALETTE.redSoft, padding: '3px 7px',
                  border: '1px solid rgba(208,30,44,0.22)', borderRadius: 999,
                }}>
                  <span style={{ fontSize: 10, lineHeight: 1 }}>✦</span>
                  Powered with KINI AI
                </span>
              </div>
            </div>
          </div>

          <h1 style={{
            fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900,
            margin: '0 0 6px', letterSpacing: '-0.5px', color: PALETTE.ink, lineHeight: 1.15,
          }}>
            Motion Made <span style={{ color: PALETTE.red }}>Measurable</span>.
          </h1>
          <p style={{ fontSize: 12.5, color: PALETTE.inkDim, margin: '0 0 22px' }}>
            Sign in to your Kinematic account.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        </div>
      </div>

      {/* MOBILE — orderly stack below the form. Hidden on desktop via CSS.
          On mobile the centred form drops position:absolute and flows
          naturally above this block, so we DON'T add a top margin —
          adding one used to leave a viewport-tall blank gap. */}
      <div className="login-mobile-stack" style={{
        display: 'none', flexDirection: 'column', gap: 12,
        padding: '24px 20px 40px',
      }}>
        <div style={{
          fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800,
          color: PALETTE.inkDim, textTransform: 'uppercase', letterSpacing: 0.6,
          textAlign: 'center', marginBottom: 4,
        }}>
          What you get
        </div>
        {FEATURES.map((f, i) => (
          <div key={f.title} style={{
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            animation: `loginFadeIn 0.5s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.04}s both`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: `${f.accent}14`, color: f.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>{f.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: PALETTE.ink }}>
              {f.title}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
