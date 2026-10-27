'use client';
import { useEffect, useState } from 'react';

/**
 * Compact "text size" stepper for the dashboard header (next to the theme
 * toggle). The dashboard sizes text in fixed px via inline styles, so a rem /
 * root font-size can't cascade — instead this drives a CSS `zoom` on <body>
 * via the `--font-zoom` custom property (see globals.css), scaling the whole
 * UI uniformly. Range 100%–150% in 10% steps.
 *
 * Persistence mirrors the theme toggle exactly: localStorage `kinematic-font-
 * scale` (the boot script in app/layout.tsx re-applies it across tabs) + a
 * 1-year `kinematic-font-scale` cookie the server reads to stamp the initial
 * `--font-zoom` on <html> with no FOUC.
 */

const KEY = 'kinematic-font-scale';
const MIN = 1;
const MAX = 1.5;
const STEP = 0.1;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v * 10) / 10));

/** Parse a stored value → zoom factor. Tolerates the first release's named
 *  presets ('large' / 'xlarge') and anything unparseable (→ 100%). */
export function parseFontScale(raw: string | null | undefined): number {
  if (raw === 'large') return 1.1;
  if (raw === 'xlarge') return 1.3;
  const n = parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n > 0 ? clamp(n) : 1;
}

function readInitial(): number {
  try { return parseFontScale(localStorage.getItem(KEY)); } catch { return 1; }
}

function apply(v: number) {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--font-zoom', String(v));
}

function persist(v: number) {
  try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
  try { document.cookie = `${KEY}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`; } catch { /* ignore */ }
}

export default function FontSizeToggle() {
  // Start at 100% (matches the SSR default) and reconcile on mount so the
  // buttons' enabled/disabled state never disagrees with the applied zoom.
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setZoom(readInitial());
    setMounted(true);
    // Stay in sync if another tab changes it.
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setZoom(readInitial()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = (v: number) => {
    const n = clamp(v);
    setZoom(n);
    apply(n);
    persist(n);
  };

  const atMin = zoom <= MIN + 1e-9;
  const atMax = zoom >= MAX - 1e-9;
  const pct = Math.round(zoom * 100);

  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 26, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer', color: 'var(--text-dim)',
    opacity: disabled ? 0.35 : 1, padding: 0,
  });

  return (
    <div
      role="group"
      aria-label={`Text size, currently ${pct}%`}
      style={{
        display: 'flex', alignItems: 'center', height: 32, flexShrink: 0,
        border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
        visibility: mounted ? 'visible' : 'hidden',
      }}
    >
      <button type="button" className="km-iconbtn" onClick={() => set(zoom - STEP)} disabled={atMin}
        title="Decrease text size" aria-label="Decrease text size" style={btn(atMin)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      {/* The "A" signals this stepper scales text; its size nudges with the zoom. */}
      <span aria-hidden style={{ fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-manrope)', lineHeight: 1, padding: '0 2px', fontSize: zoom >= 1.3 ? 15 : zoom >= 1.1 ? 13 : 11 }}>A</span>
      <button type="button" className="km-iconbtn" onClick={() => set(zoom + STEP)} disabled={atMax}
        title="Increase text size" aria-label="Increase text size" style={btn(atMax)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}
