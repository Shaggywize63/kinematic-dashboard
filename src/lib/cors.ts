/**
 * CORS allowlist helper for the Next.js Route Handlers under
 * `src/app/api/v1/*`.
 *
 * Previously the handlers responded with `Access-Control-Allow-Origin: *`
 * paired with `Authorization` accepted in `Access-Control-Allow-Headers`.
 * Together that lets any website on the public web make authenticated
 * requests to our API via fetch using the user's bearer token (CSRF-via-
 * CORS) — once an XSS lands in any tab, the dashboard is wide open.
 *
 * Echo-origin pattern: read the request's `Origin` header, check it
 * against ALLOWED_ORIGINS (env-driven), and echo it back if it matches.
 * Browsers refuse to send credentials to a `*` response, but they will
 * send to an echoed match.
 *
 * Allowlist sources (any of):
 *  - `NEXT_PUBLIC_CORS_ALLOW_ORIGINS=https://a.example,https://b.example`
 *  - `NEXT_PUBLIC_APP_URL` (single origin, e.g. the prod dashboard)
 *  - localhost / 127.0.0.1 on any port when NODE_ENV !== 'production'
 */

const parseList = (raw: string | undefined): string[] =>
  (raw || '').split(',').map((s) => s.trim()).filter(Boolean);

const ALLOWED: string[] = (() => {
  const fromEnv = parseList(process.env.NEXT_PUBLIC_CORS_ALLOW_ORIGINS);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const all = appUrl ? [appUrl, ...fromEnv] : fromEnv;
  return Array.from(new Set(all));
})();

function isAllowed(origin: string | null): origin is string {
  if (!origin) return false;
  if (ALLOWED.includes(origin)) return true;
  // Dev convenience — localhost on any port. Off in production.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const u = new URL(origin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    } catch { /* ignore */ }
  }
  return false;
}

export function corsHeaders(reqOrigin: string | null, methods = 'GET, POST, OPTIONS'): Record<string, string> {
  const allowed = isAllowed(reqOrigin);
  // When the origin isn't allowed we DON'T echo `*` and we DON'T set the
  // header at all — the browser will block the response, which is the
  // intended behaviour for unknown origins. Same-origin / server-side
  // callers ignore CORS headers and continue to work.
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-Id, X-Client-Id',
    'Access-Control-Max-Age': '600',
  };
  if (allowed) {
    base['Access-Control-Allow-Origin'] = reqOrigin;
    base['Access-Control-Allow-Credentials'] = 'true';
  }
  return base;
}
