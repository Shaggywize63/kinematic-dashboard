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
};

/**
 * Synchronous boot script that runs BEFORE React hydrates.
 *
 * The dashboard's settings page applied data-theme via a `useEffect` on
 * mount, but that fires AFTER the first paint — so every page load
 * (and every route that doesn't host the settings useEffect) started at
 * the CSS default (dark), regardless of what the user had saved in
 * localStorage. Result: pick "Light" → refresh → back to dark.
 *
 * This inline script applies the saved theme (or the OS preference for
 * "system") to <html data-theme> synchronously in <head>, so the CSS
 * variables resolve to the right values on the very first paint. No
 * flash, no override on refresh, and it covers EVERY route, not just
 * the settings page.
 *
 * Default is "system" — matches OS preference on first install.
 */
const themeBootScript = `
(function() {
  try {
    var saved = localStorage.getItem('kinematic-theme') || 'system';
    var effective = saved;
    if (saved === 'system') {
      effective = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
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
