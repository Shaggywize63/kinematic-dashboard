import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Toaster } from 'sonner';
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
// Force dynamic rendering on the root layout — we read the
// `kinematic-theme` cookie via next/headers and need it on every
// request, so the layout can't be statically pre-rendered.
export const dynamic = 'force-dynamic';

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
 * Theme resolution chain (FOUC-proof):
 *   1. Server reads the `kinematic-theme` cookie via next/headers and
 *      stamps it onto <html data-theme> + style.color-scheme during
 *      SSR. The first byte of HTML the browser receives already has
 *      the correct theme attribute — no "starts dark, switches to
 *      light" flash.
 *   2. Inline boot script (below) runs synchronously before React
 *      hydrates. Reads localStorage as the canonical client-side
 *      store; if it differs from the cookie (older session that
 *      pre-dates cookie write, or another tab updated localStorage
 *      first), re-stamps. Also wires up storage + visibilitychange
 *      so the theme survives bfcache restores and stays in sync
 *      across tabs.
 *   3. Settings pages write to BOTH localStorage and the cookie when
 *      the user toggles. Cookie lifetime is 1 year so the SSR-time
 *      stamp survives.
 */
const themeBootScript = `
(function() {
  function apply(t) {
    var v = (t === 'light' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', v);
    document.documentElement.style.colorScheme = v;
  }
  function readLs() {
    try { return localStorage.getItem('kinematic-theme') || ''; } catch (_) { return ''; }
  }
  function readCookie() {
    try {
      var m = (document.cookie || '').match(/(?:^|; )kinematic-theme=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }
  // localStorage wins over cookie — localStorage is the user-driven
  // store, cookie just mirrors it for SSR. If localStorage is empty,
  // fall back to the cookie so an SSR-stamped value isn't undone on
  // hydrate.
  apply(readLs() || readCookie());
  try {
    window.addEventListener('storage', function(e) {
      if (e.key === 'kinematic-theme') apply(readLs() || readCookie());
    });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') apply(readLs() || readCookie());
    });
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // SSR-time theme read. Cookie is set by the settings pages whenever
  // the user toggles. Defaults to 'dark' when missing so the cold-start
  // (first ever visit) is deterministic.
  const cookieStore = cookies();
  const cookieTheme = cookieStore.get('kinematic-theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang="en" data-theme={cookieTheme} style={{ colorScheme: cookieTheme }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
        {/* Global toast portal. Without this, every `toast.error(...)` /
            `toast.success(...)` call in the app is a silent no-op — which
            is why mobile users hitting validation guards (phone length,
            empty required field, etc.) saw "nothing happen" on submit.
            position=top-center keeps the toast above the on-screen
            keyboard; richColors makes errors red and successes green. */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
