/**
 * A user- or webhook-supplied URL is only safe to put in an `href` when its scheme is a plain web/contact one.
 * `javascript:` (and `data:`, `vbscript:`, `file:` …) would run on the dashboard origin when clicked, so those
 * become `undefined` (no link) and callers fall back to plain text.
 *
 * Scheme-less values are left alone (relative links keep working); a bare domain ("example.com") becomes https.
 */
const ALLOWED = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Browsers ignore tabs / newlines / control characters inside a scheme ("java\tscript:"), so strip them first.
  const raw = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!raw) return undefined;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
  if (!hasScheme) {
    // A value with no scheme cannot run script, so relative links ("/path", "files/a.pdf") are left exactly as they
    // were; only a bare domain ("example.com/x") is turned into a web address, the way an address bar would.
    return /^[^\s/.?#][^\s/]*\.[a-z]{2,}(?:[/?#]|$)/i.test(raw) && !/\.(pdf|png|jpe?g|docx?|xlsx?|csv|txt|zip)$/i.test(raw) ? `https://${raw}` : raw;
  }
  try {
    const u = new URL(raw);
    return ALLOWED.has(u.protocol.toLowerCase()) ? raw : undefined;
  } catch {
    return undefined;
  }
}
