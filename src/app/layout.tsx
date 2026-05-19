import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kinematic — Field Force Management',
  description:
    'Kinematic is a B2B SaaS field force management platform purpose-built for FMCG companies — from geo-fenced attendance to consumer contact reporting to incentive-linked performance, in a single mobile-first system designed for the conditions of actual fieldwork.',
  icons: { icon: '/favicon.svg' },
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
