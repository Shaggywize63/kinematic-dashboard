'use client';
import { useEffect, useState } from 'react';

/**
 * Compact light/dark switch for the dashboard header, so users can flip
 * the theme without digging into Settings. It reuses the EXACT persistence
 * the Settings page uses (localStorage `kinematic-theme` + a 1-year
 * `kinematic-theme` cookie the server reads to stamp <html data-theme> with
 * no FOUC), so both entry points stay in perfect sync:
 *   - localStorage change → the boot script in app/layout.tsx re-applies the
 *     theme across every open tab (it listens on the `kinematic-theme` key).
 *   - cookie → the next hard refresh SSR-renders the right theme.
 *
 * Two explicit states only (dark / light) — "system" was removed elsewhere
 * because OS auto-switching read as "random theme changes" to users.
 */

type Theme = 'dark' | 'light';

function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
}

function persistTheme(t: Theme) {
  try { localStorage.setItem('kinematic-theme', t); } catch { /* ignore */ }
  try {
    document.cookie = `kinematic-theme=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch { /* ignore */ }
}

// The current theme as the DOM already knows it — the server stamped
// <html data-theme> from the cookie, so this is correct on first paint and
// avoids a flash. localStorage is the tie-breaker if the attribute is unset.
function readInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  try {
    return localStorage.getItem('kinematic-theme') === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Start 'dark' (matches the SSR default) and reconcile on mount so the
  // button never renders a value that differs from <html data-theme> after
  // hydration.
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readInitialTheme());
    setMounted(true);
    // Stay in sync if the Settings page (or another tab) changes the theme
    // while this toggle is on screen.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'kinematic-theme') {
        setTheme(e.newValue === 'light' ? 'light' : 'dark');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  };

  const isDark = theme === 'dark';
  // Before mount we don't know the persisted theme for certain (the button
  // could briefly show the wrong glyph), so render it invisible until the
  // effect reconciles — one frame, no layout shift (size is fixed).
  const size = compact ? 32 : 34;

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--s3)', border: '1px solid var(--border)',
        borderRadius: 8, cursor: 'pointer', color: 'var(--text)',
        padding: 0, visibility: mounted ? 'visible' : 'hidden',
      }}
    >
      {isDark ? (
        // Currently dark → offer the sun (switch to light)
        <SunIcon size={compact ? 17 : 18} />
      ) : (
        // Currently light → offer the moon (switch to dark)
        <MoonIcon size={compact ? 17 : 18} />
      )}
    </button>
  );
}

function SunIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
