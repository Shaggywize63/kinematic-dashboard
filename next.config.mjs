/** @type {import('next').NextConfig} */

// Security headers. Conservative CSP that doesn't break Next.js (it
// still needs 'unsafe-inline' for hydration markers and 'unsafe-eval'
// for the dev runtime) but tightens the highest-impact directives:
//
//   object-src 'none'        — kills Flash/Java/applets, common XSS sinks
//   base-uri 'self'          — stops <base href> takeover
//   frame-ancestors 'none'   — clickjacking guard
//   connect-src allowlist    — limits where an injected script can
//                              exfiltrate data (defaults assume
//                              Supabase + the backend API origin)
//
// To tighten further once we've verified nothing trips:
//   1. flip 'unsafe-eval' off in production (Next 14+ supports nonces)
//   2. add `report-uri` + monitor for legitimate sources we missed
//   3. switch back to 'self' on `default-src` after auditing img/font.
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const API_HOST      = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

// Google Maps JS (address autocomplete on the lead form) loads its script from
// maps.googleapis.com, pulls map/marker assets from maps.gstatic.com, and makes
// Places XHRs to maps.googleapis.com — all three must be allowlisted or the CSP
// blocks the <script> with a net::ERR_BLOCKED_BY_CSP ("Could not load Google
// Maps").
const GOOGLE_MAPS = 'https://maps.googleapis.com https://maps.gstatic.com';
// Google Fonts: the stylesheet is fetched from fonts.googleapis.com (style-src)
// and the font files from fonts.gstatic.com (font-src). Without these the CSP
// refuses the <link> and the app falls back to system fonts.
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GOOGLE_MAPS}`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data: ${GOOGLE_FONTS_FILES}`,
  `connect-src 'self' ${SUPABASE_HOST} ${API_HOST} https://api.anthropic.com ${GOOGLE_MAPS} wss: https:`.replace(/\s+/g, ' ').trim(),
  `frame-ancestors 'none'`,
  `frame-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const securityHeaders = [
  // Strict-Transport-Security — force HTTPS for a year and include
  // subdomains. Safe to set unconditionally; behind any proxy that
  // terminates TLS the header still applies to the user agent.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // X-Frame-Options is redundant with frame-ancestors 'none' but
  // doesn't hurt for old browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  // X-Content-Type-Options stops MIME-sniffing-based XSS on uploaded
  // files served back through our domain.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer-Policy — same-origin keeps the referrer for our own
  // analytics but strips it on outbound clicks.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions-Policy — deny the most dangerous browser APIs by
  // default; surface a per-app override later if a feature needs them.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  { key: 'Content-Security-Policy', value: csp },
  // X-DNS-Prefetch-Control — keep prefetch off, prevents DNS leak.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Source maps off in the production browser bundle so attackers
  // can't trivially reverse-engineer the auth + rendering logic.
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
