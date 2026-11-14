/**
 * IST (Asia/Kolkata, UTC+05:30, no DST) formatting helpers.
 *
 * The product shows every time in IST regardless of the viewer's device zone,
 * so all date/time rendering routes through here.
 */
const TZ = 'Asia/Kolkata';

/** Today's date as YYYY-MM-DD on the IST calendar. */
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** "dd MMM yyyy" (IST) from an ISO date/timestamp. */
export function istDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
}

/** "hh:mm AM/PM" (IST) from an ISO timestamp. */
export function istTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ });
}

/** "dd MMM, hh:mm AM/PM IST" from an ISO timestamp. */
export function istDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ })} IST`;
}
