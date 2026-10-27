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
  // "Text size" preference. The dashboard sizes text in fixed px, so a root
  // font-size can't cascade — globals.css turns the --font-zoom factor into a
  // CSS zoom on <body> that scales the whole UI. Unset ⇒ 1 ⇒ untouched.
  // Tolerates the first release's named presets ('large' / 'xlarge').
  function applyScale(s) {
    var z = 1;
    if (s === 'large') z = 1.1;
    else if (s === 'xlarge') z = 1.3;
    else { var n = parseFloat(s); if (n > 0) z = Math.min(1.5, Math.max(1, Math.round(n * 10) / 10)); }
    document.documentElement.style.setProperty('--font-zoom', String(z));
  }
  function readLs(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }
  function readCookie(key) {
    try {
      var m = (document.cookie || '').match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }
  // localStorage wins over cookie — localStorage is the user-driven
  // store, cookie just mirrors it for SSR. If localStorage is empty,
  // fall back to the cookie so an SSR-stamped value isn't undone on
  // hydrate.
  function sync() {
    apply(readLs('kinematic-theme') || readCookie('kinematic-theme'));
    applyScale(readLs('kinematic-font-scale') || readCookie('kinematic-font-scale'));
  }
  sync();
  try {
    window.addEventListener('storage', function(e) {
      if (e.key === 'kinematic-theme' || e.key === 'kinematic-font-scale') sync();
    });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') sync();
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
  // SSR-stamp the saved text-size so a hard refresh renders at the chosen
  // scale with no flash (the boot script re-checks localStorage on hydrate).
  const rawScale = cookieStore.get('kinematic-font-scale')?.value;
  const parsedScale = parseFloat(rawScale || '');
  const fontZoom = rawScale === 'large' ? 1.1
    : rawScale === 'xlarge' ? 1.3
    : Number.isFinite(parsedScale) && parsedScale > 0 ? Math.min(1.5, Math.max(1, Math.round(parsedScale * 10) / 10))
    : 1;
  return (
    <html lang="en" data-theme={cookieTheme} style={{ colorScheme: cookieTheme, '--font-zoom': String(fontZoom) } as React.CSSProperties}>
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
