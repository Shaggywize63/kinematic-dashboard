'use client';

/**
 * Public consumer self-registration — /s/[token]
 *
 * The page an outlet's QR code (or shared wa.me link) opens. Deliberately a
 * self-contained, no-login, mobile-first page: it is a sibling of dashboard/,
 * so it inherits NO auth gate and NO dashboard chrome. It talks to the backend
 * public capture endpoint with a RAW fetch (no Authorization / X-Org-Id / project
 * headers) — the outlet, its tenant and its Supabase project are all resolved
 * server-side from the :token in the path.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE_URL } from '../../../lib/api';

const P = {
  bg: '#F4F7F5', surface: '#FFFFFF', ink: '#14201C', dim: '#5C6E67',
  border: '#E1EAE6', brand: '#0E7C66', brandInk: '#0A5E4D', good: '#1E9E6B',
  danger: '#C4523E',
};

interface Product { sku_id: string; name: string; sku_code?: string | null }
interface CaptureCtx { outlet_name: string; products: Product[] }

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureInner />
    </Suspense>
  );
}

function CaptureInner() {
  const params = useParams();
  const token = String((params?.token as string | string[]) || '').toString();

  const [ctx, setCtx] = useState<CaptureCtx | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [skuId, setSkuId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/distribution/capture/${encodeURIComponent(token)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setLoadErr(body?.error || 'This registration link is not active.');
      } else {
        setCtx(body.data as CaptureCtx);
      }
    } catch {
      setLoadErr('Could not reach the server. Please check your connection and try again.');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) { setError('Please enter a valid mobile number.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/distribution/capture/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumer_phone: phone.trim(),
          consumer_name: name.trim() || null,
          sku_id: skuId || null,
          vehicle_reg: vehicle.trim() || null,
          channel: 'qr',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error || 'Could not save. Please try again.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Could not save. Please check your connection and try again.');
    }
    setBusy(false);
  };

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh', background: P.bg, color: P.ink,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px 48px',
      fontFamily: "'Inter','DM Sans',-apple-system,Segoe UI,Roboto,Arial,sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>{children}</div>
    </div>
  );

  const brandBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: P.brand }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: P.brand, opacity: 0.55 }} />
      <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em', marginLeft: 2 }}>Kinematic</span>
    </div>
  );

  const card: React.CSSProperties = {
    background: P.surface, border: `1px solid ${P.border}`, borderRadius: 18,
    padding: 24, boxShadow: '0 20px 50px rgba(15,40,32,0.08)',
  };

  if (loading) {
    return shell(<>{brandBar}<div style={card}><p style={{ color: P.dim, margin: 0 }}>Loading…</p></div></>);
  }

  if (loadErr) {
    return shell(<>{brandBar}
      <div style={card}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Link not active</h1>
        <p style={{ color: P.dim, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{loadErr}</p>
      </div>
    </>);
  }

  if (done) {
    return shell(<>{brandBar}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(30,158,107,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 14px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={P.good} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>You&rsquo;re registered!</h1>
        <p style={{ color: P.dim, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Thanks for registering your purchase{ctx?.outlet_name ? ` at ${ctx.outlet_name}` : ''}. We&rsquo;ll keep you posted on offers and support.
        </p>
      </div>
    </>);
  }

  return shell(<>
    {brandBar}
    <div style={card}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px', color: P.brandInk }}>Register your purchase</h1>
      <p style={{ color: P.dim, fontSize: 13.5, lineHeight: 1.55, margin: '0 0 20px' }}>
        {ctx?.outlet_name ? <>Bought something at <strong style={{ color: P.ink }}>{ctx.outlet_name}</strong>? </> : null}
        Register in 10 seconds for offers, warranty and support.
      </p>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Mobile number *">
          <input
            type="tel" inputMode="tel" autoComplete="tel" required
            value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 98765 43210" style={inputStyle}
          />
        </Field>

        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" style={inputStyle} />
        </Field>

        {ctx && ctx.products.length > 0 && (
          <Field label="Which product did you buy?">
            <select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={inputStyle}>
              <option value="">Select a product (optional)</option>
              {ctx.products.map((p) => (
                <option key={p.sku_id} value={p.sku_id}>{p.name}{p.sku_code ? ` (${p.sku_code})` : ''}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Vehicle / serial (optional)">
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="If applicable" style={inputStyle} />
        </Field>

        {error && (
          <div style={{ fontSize: 13, color: P.danger, background: 'rgba(196,82,62,0.07)', padding: '10px 12px', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          background: P.brand, color: '#fff', border: 'none', borderRadius: 12,
          padding: '14px 18px', fontSize: 15, fontWeight: 700, marginTop: 4,
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
        }}>
          {busy ? 'Registering…' : 'Register my purchase'}
        </button>
      </form>

      <p style={{ color: P.dim, fontSize: 11.5, lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center' }}>
        Your number is used only to service your purchase. No spam.
      </p>
    </div>
  </>);
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${P.border}`, borderRadius: 12,
  padding: '13px 14px', fontSize: 15, outline: 'none', background: '#fff',
  color: P.ink, boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: P.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}
