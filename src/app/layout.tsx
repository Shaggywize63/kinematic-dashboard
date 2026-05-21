import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kinematic — Field Force Management',
  description:
    'Kinematic is a B2B SaaS field force management platform purpose-built for FMCG companies — from geo-fenced attendance to consumer contact reporting to incentive-linked performance, in a single mobile-first system designed for the conditions of actual fieldwork.',
  icons: { icon: '/favicon.svg' },
};

/**
 * Viewport configuration — separated from `metadata` per Next.js 14
 * convention. WITHOUT this export, mobile browsers default to a 980px
 * desktop viewport and scale the page down, which:
 *   1. Forces persistent horizontal scroll on phones (page is laid out
 *      for 980px and the browser ships a 360px viewport).
 *   2. Stops `@media (max-width: 640px)` rules from triggering because
 *      the layout viewport is reported as 980px.
 *   3. Shrinks UI text below readable sizes.
 *
 * Setting `width: 'device-width'` tells the browser to use the actual
 * device pixel width as the layout viewport, which is what every CSS
 * media-query rule in `globals.css` is sized against.
 *
 * `themeColor` moved here from `metadata` to silence the Next.js 14
 * "Unsupported metadata themeColor" build warnings (visible in the
 * earlier Vercel build log).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0E1A2E',
  // `viewport-fit: cover` lets `env(safe-area-inset-*)` resolve to real
  // values on notched iOS devices — without this the KINI AI floating
  // button sits too low and gets clipped by the home-indicator strip.
  viewportFit: 'cover',
};

/**
 * Synchronous theme boot script — runs BEFORE the body renders, before
 * React hydrates, before any CSS variables resolve.
 *
 * Behaviour:
 *   1. Pull `kinematic-theme` from localStorage. Only 'dark' and 'light'
 *      are honoured; anything else (legacy 'system', stray values, an
 *      empty store) normalises to 'dark' so the page never starts in an
 *      ambiguous state.
 *   2. Stamp the resolved value onto BOTH `<html data-theme>` (drives
 *      our --bg / --text / --primary tokens) AND `color-scheme` (drives
 *      native form controls + scrollbars). Without color-scheme the
 *      browser may flash light scrollbars on a dark theme during the
 *      first paint.
 *   3. Re-stamp on visibilitychange when the doc becomes visible again.
 *      Catches a class of bug where the theme appears to "flip" — the
 *      browser restores a bfcache page without our boot script running,
 *      so data-theme can disappear after a back-button navigation.
 *   4. Re-stamp on the `storage` event so changes in another tab
 *      propagate immediately, instead of the two tabs disagreeing.
 *
 * Inline, IIFE-wrapped, idempotent. Safe to run on every nav.
 */
const themeBootScript = `
(function() {
  function apply(t) {
    var v = (t === 'light' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', v);
    document.documentElement.style.colorScheme = v;
  }
  function read() {
    try { return localStorage.getItem('kinematic-theme') || ''; } catch (_) { return ''; }
  }
  apply(read());
  try {
    window.addEventListener('storage', function(e) {
      if (e.key === 'kinematic-theme') apply(read());
    });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') apply(read());
    });
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
