// A filled form's unique reference + date, e.g. "SRPR2627-1 · 02 Nov 2026" — how an expense's linked form
// entry is named wherever it is picked or shown. Pure and total: it never throws, whatever the backend sends.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Asia/Kolkata is a fixed UTC+05:30 (no DST), so the shift is done by hand: no Intl/ICU variance in month names.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** "dd MMM yyyy" of an ISO timestamp, on the Asia/Kolkata calendar day. Unparseable input falls back to its first 10 chars. */
export function formRefDate(iso: string | null | undefined): string {
  if (typeof iso !== 'string') return '';
  const raw = iso.trim();
  if (!raw) return '';
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw.slice(0, 10);
  const d = new Date(t + IST_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "SRPR2627-1 · 02 Nov 2026". Blank ref → the date alone; blank date → the ref alone; both blank → "". */
export function formRefTitle(refNo: string | null | undefined, submittedAt: string | null | undefined): string {
  const ref = typeof refNo === 'string' ? refNo.trim() : '';
  const date = formRefDate(submittedAt);
  return ref && date ? `${ref} · ${date}` : ref || date;
}
