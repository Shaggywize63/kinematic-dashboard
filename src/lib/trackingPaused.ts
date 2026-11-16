/**
 * Has a checked-in rep's phone stopped reporting its location?
 *
 * A rep's pin on Live Trailing is their LAST KNOWN fix. When the phone's tracking service is stopped (the
 * phone's battery saver, "app closed in background", no signal) that pin silently goes stale: the row just
 * says "30m ago". This names what is going on, so a manager reads "tracking paused", not "the app is slow".
 *
 * Phones report about every 10 minutes, so 25 minutes of silence is two missed reports. Not for someone who is
 * checked out (silence is expected) and not when the phone says its location is switched off (that has its own,
 * more specific message).
 */
export const TRACKING_PAUSED_AFTER_MIN = 25;

const LOCATION_OFF = new Set(['services_off', 'denied', 'restricted']);

export interface PausedInput {
  status?: string | null;
  location_source?: string | null;
  location_status?: string | null;
  location_captured_at?: string | null;
  last_location_updated_at?: string | null;
}

/** Minutes of silence when tracking looks paused, otherwise null. */
export function trackingPausedMinutes(fe: PausedInput, now: number = Date.now()): number | null {
  if (fe.status !== 'active' && fe.status !== 'on_break') return null;
  if (fe.location_source && fe.location_source !== 'live') return null; // check-in point / zone: no live fix to be stale
  if (fe.location_status && LOCATION_OFF.has(fe.location_status)) return null;
  const seen = fe.location_captured_at ?? fe.last_location_updated_at;
  if (!seen) return null;
  const t = new Date(seen).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.floor((now - t) / 60_000);
  return mins >= TRACKING_PAUSED_AFTER_MIN ? mins : null;
}

/**
 * Adaptive units: minutes under an hour, hours up to a day, then days.
 * "45 min" / "1 h 8 min" / "2 d 3 h"
 */
export function fmtSilence(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/**
 * Why tracking looks paused. The silent case (location still ON, phone just not reporting) is inherently
 * uncertain, so we name the likely causes — but when the last heartbeat carried a low battery we call out
 * the phone's battery saver specifically, since that is the usual culprit below ~20%.
 */
export function trackingPausedText(mins: number, batteryPct?: number | null): string {
  const base = `Tracking paused — no location from this phone for ${fmtSilence(mins)}.`;
  if (batteryPct != null && batteryPct <= 20) {
    return `${base} The battery was ${batteryPct}%, so the phone's battery saver has most likely stopped it; it may also be out of signal or closed in the background.`;
  }
  return `${base} It may be switched off, out of signal, or stopped by the phone's battery saver.`;
}
