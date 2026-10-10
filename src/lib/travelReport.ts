/**
 * Daily Travel Report — the pure parts: reading the API answers defensively, building the time-ordered timeline
 * (check-in, travel legs, visits, halts, check-out), the map's route path, and the CSV rows.
 *
 * No React and no network in here, so the ordering and CSV rules can be unit-tested directly.
 */
import type {
  AttendanceTravelLeg, AttendanceTravelMethod, DailyReport, DailyReportHalt, DailyReportRoutePoint,
  DailyReportTeam, DailyReportTeamRow, DailyReportVisit,
} from './api';
import { csvStamp, fmtClock, stampMs } from './visitTime';

export interface LatLng { lat: number; lng: number }

// ── Small formatters ─────────────────────────────────────────────────────────

/** "23.4 km" — at most two decimals, no trailing zeros. */
export const fmtKm = (km: number | null | undefined): string => `${Number((Number(km) || 0).toFixed(2))} km`;

/** "7h 30m" from decimal hours; "—" when unknown. */
export function fmtHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(Number(h))) return '—';
  const total = Math.round(Number(h) * 60);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** Today's calendar date in IST (the attendance day), YYYY-MM-DD. */
export const istToday = (): string => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** "10 Oct 2026" from YYYY-MM-DD. */
export function fmtDay(ymd: string): string {
  if (!isYmd(ymd)) return ymd || '—';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "Own Bike" from the server label, else a readable form of the id ("own_bike" -> "Own bike"), else "—". */
export function modeText(mode?: string | null, label?: string | null): string {
  const l = (label || '').trim();
  if (l) return l;
  const m = (mode || '').trim();
  if (!m) return '—';
  const words = m.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '—';
}

/** A name that starts with = + - @ would run as a formula when the CSV is opened in a spreadsheet. */
export const csvSafe = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** A file-name-safe slug of a person's name. */
export const slug = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'employee';

// ── Reading the API answers ──────────────────────────────────────────────────

const num = (v: unknown, fallback = 0): number => (v == null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** A usable map point: both numbers, in range. Numeric strings (Postgres numerics) are accepted. */
export function point(lat: unknown, lng: unknown): LatLng | null {
  const a = numOrNull(lat);
  const b = numOrNull(lng);
  if (a == null || b == null || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

const unwrap = (res: unknown): Record<string, any> | null => {
  const r = res as { data?: unknown } | null;
  const d = r && typeof r === 'object' && r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : r;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, any>) : null;
};

/**
 * Reads `{success, data}` or the bare payload into a DailyReport with every list present and every number a number.
 * Anything that does not look like a daily report (no shift, no summary, no lists) is not one: null.
 */
export function readDailyReport(res: unknown): DailyReport | null {
  const d = unwrap(res);
  if (!d || !(d.shift || d.summary || Array.isArray(d.visits) || Array.isArray(d.halts) || d.travel)) return null;

  const visits: DailyReportVisit[] = (Array.isArray(d.visits) ? d.visits : []).map((v: any, i: number) => {
    const p = point(v?.lat, v?.lng);
    return {
      submission_id: String(v?.submission_id ?? `visit-${i}`), label: str(v?.label) || 'Customer Visit',
      arrival_at: String(v?.arrival_at ?? ''), departure_at: String(v?.departure_at ?? ''),
      minutes: num(v?.minutes), lat: p ? p.lat : null, lng: p ? p.lng : null,
    };
  });
  const halts: DailyReportHalt[] = (Array.isArray(d.halts) ? d.halts : []).map((h: any, i: number) => ({
    index: num(h?.index, i), start_at: String(h?.start_at ?? ''), end_at: String(h?.end_at ?? ''),
    minutes: num(h?.minutes), lat: num(h?.lat), lng: num(h?.lng), points: num(h?.points),
  }));
  const legs: AttendanceTravelLeg[] = Array.isArray(d.travel?.legs) ? d.travel.legs : [];
  const routePoints: DailyReportRoutePoint[] = (Array.isArray(d.route?.points) ? d.route.points : [])
    .map((p: any) => ({ p: point(p?.lat, p?.lng), at: String(p?.at ?? '') }))
    .filter((x: { p: LatLng | null }) => !!x.p)
    .map((x: { p: LatLng | null; at: string }) => ({ lat: (x.p as LatLng).lat, lng: (x.p as LatLng).lng, at: x.at }));

  const totalKm = num(d.travel?.total_km, num(d.summary?.total_km));
  const visitMinutes = visits.reduce((s, v) => s + v.minutes, 0);
  const haltMinutes = halts.reduce((s, h) => s + h.minutes, 0);
  const s = d.summary || {};
  return {
    date: String(d.date ?? ''),
    user: {
      id: String(d.user?.id ?? ''), name: String(d.user?.name || '—'),
      employee_id: str(d.user?.employee_id), role: str(d.user?.role),
    },
    shift: {
      attendance_id: str(d.shift?.attendance_id),
      checkin_at: str(d.shift?.checkin_at), checkout_at: str(d.shift?.checkout_at),
      total_hours: numOrNull(d.shift?.total_hours), in_progress: d.shift?.in_progress === true,
    },
    transport: { mode: str(d.transport?.mode), label: str(d.transport?.label) },
    travel: { total_km: totalKm, method: (str(d.travel?.method) as AttendanceTravelMethod | null) || 'none', legs },
    visits, halts,
    route: { points: routePoints, thinned: d.route?.thinned === true },
    // The server's own summary wins; a missing field is worked out from the lists.
    summary: {
      visits: num(s.visits, visits.length), visit_minutes: num(s.visit_minutes, visitMinutes),
      halts: num(s.halts, halts.length), halt_minutes: num(s.halt_minutes, haltMinutes),
      total_km: num(s.total_km, totalKm),
    },
  };
}

/** Reads `{success, data:{date, rows}}` (or a bare rows list) into rows with numeric counts. */
export function readTeamReport(res: unknown): DailyReportTeam | null {
  const r = res as { data?: unknown } | null;
  const raw = r && typeof r === 'object' && !Array.isArray(r) && 'data' in r ? r.data : res;
  const d = Array.isArray(raw) ? { rows: raw } : unwrap(raw);
  if (!d || !Array.isArray(d.rows)) return null;
  const rows: DailyReportTeamRow[] = d.rows.map((x: any, i: number) => ({
    user_id: String(x?.user_id ?? `row-${i}`), name: String(x?.name || '—'), employee_id: str(x?.employee_id),
    checkin_at: str(x?.checkin_at), checkout_at: str(x?.checkout_at), total_hours: numOrNull(x?.total_hours),
    mode: str(x?.mode), label: str(x?.label),
    total_km: num(x?.total_km), visits: num(x?.visits), visit_minutes: num(x?.visit_minutes),
    halts: num(x?.halts), halt_minutes: num(x?.halt_minutes),
  }));
  return { date: String(d.date ?? ''), rows };
}

// ── The timeline ─────────────────────────────────────────────────────────────

export type TimelineKind = 'checkin' | 'travel' | 'visit' | 'halt' | 'checkout';

export interface TimelineItem {
  key: string;
  kind: TimelineKind;
  /** 1-based position in time order. */
  seq: number;
  /** The number on the map: visits and halts share one count, in time order. null for the other kinds. */
  marker: number | null;
  start: string | null;
  end: string | null;
  /** A travel leg that runs to "now" (the shift is still open). */
  openEnd: boolean;
  /** Visits and halts only. */
  minutes: number | null;
  /** Travel legs only. */
  km: number | null;
  title: string;
  detail: string;
  /** Where it happened (for a travel leg: where it started). */
  at: LatLng | null;
  /** Travel legs only: where it ended. */
  to: LatLng | null;
}

export const KIND_LABEL: Record<TimelineKind, string> = {
  checkin: 'Check-in', travel: 'Travel', visit: 'Visit', halt: 'Halt', checkout: 'Check-out',
};

// At the same instant a check-in comes first and a check-out last; a leg starts when the previous stop ends.
const RANK: Record<TimelineKind, number> = { checkin: 0, travel: 1, halt: 2, visit: 3, checkout: 4 };

const POINT_FALLBACK: Record<string, string> = {
  checkin: 'Check-in', form_checkout: 'Visit', form_checkin: 'Visit', checkout: 'Check-out', now: 'Now',
};
const pointLabel = (p: { kind?: string; label?: string } | undefined) => (p?.label && p.label.trim()) || POINT_FALLBACK[p?.kind || ''] || 'Stop';

/**
 * Every event of the day in time order: the check-in, each travel leg, each visit, each halt and the check-out.
 * Ordered by when each STARTS, so a halt in the middle of a long leg appears after that leg's row (the leg began
 * first) and before the visit that follows it. Visits and halts are numbered 1..n in that order — the same numbers
 * the map shows on its markers.
 */
export function buildTimeline(report: DailyReport): TimelineItem[] {
  if (!report.shift.attendance_id) return [];
  const legs = report.travel.legs;
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const items: Omit<TimelineItem, 'seq' | 'marker'>[] = [];

  if (report.shift.checkin_at) {
    items.push({
      key: 'checkin', kind: 'checkin', start: report.shift.checkin_at, end: null, openEnd: false, minutes: null, km: null,
      title: KIND_LABEL.checkin, detail: '',
      at: firstLeg?.from?.kind === 'checkin' ? point(firstLeg.from.lat, firstLeg.from.lng) : null, to: null,
    });
  }
  legs.forEach((l, i) => {
    const open = l.to?.kind === 'now';
    const suffix = l.method === 'straight_line' ? ' · straight line' : l.method === 'none' ? ' · no location' : '';
    items.push({
      key: `leg-${l.index ?? i}`, kind: 'travel', start: str(l.from?.at), end: open ? null : str(l.to?.at), openEnd: open,
      minutes: null, km: num(l.km), title: KIND_LABEL.travel, detail: `${pointLabel(l.from)} → ${pointLabel(l.to)}${suffix}`,
      at: point(l.from?.lat, l.from?.lng), to: point(l.to?.lat, l.to?.lng),
    });
  });
  report.visits.forEach((v, i) => {
    items.push({
      key: `visit-${v.submission_id}-${i}`, kind: 'visit', start: str(v.arrival_at), end: str(v.departure_at), openEnd: false,
      minutes: v.minutes, km: null, title: KIND_LABEL.visit, detail: v.label, at: point(v.lat, v.lng), to: null,
    });
  });
  report.halts.forEach((h, i) => {
    items.push({
      key: `halt-${h.index}-${i}`, kind: 'halt', start: str(h.start_at), end: str(h.end_at), openEnd: false,
      minutes: h.minutes, km: null, title: KIND_LABEL.halt, detail: h.points > 0 ? `${h.points} GPS pings` : '',
      at: point(h.lat, h.lng), to: null,
    });
  });
  if (report.shift.checkout_at) {
    items.push({
      key: 'checkout', kind: 'checkout', start: report.shift.checkout_at, end: null, openEnd: false, minutes: null, km: null,
      title: KIND_LABEL.checkout, detail: '',
      at: lastLeg?.to?.kind === 'checkout' ? point(lastLeg.to.lat, lastLeg.to.lng) : null, to: null,
    });
  }

  const ordered = items
    .map((it, i) => ({ it, i, ms: stampMs(it.start) }))
    .sort((a, b) => {
      // Rows with no readable time sink to the bottom rather than jumping to the top.
      if (a.ms == null && b.ms == null) return a.i - b.i;
      if (a.ms == null) return 1;
      if (b.ms == null) return -1;
      return a.ms - b.ms || RANK[a.it.kind] - RANK[b.it.kind] || a.i - b.i;
    })
    .map((x) => x.it);

  let marker = 0;
  return ordered.map((it, i) => ({
    ...it, seq: i + 1, marker: it.kind === 'visit' || it.kind === 'halt' ? ++marker : null,
  }));
}

/**
 * The line the map draws. The GPS trail when there is one; otherwise the stops joined by straight lines
 * (leg ends, in order), so a day with check-ins but no pings still shows where the person went.
 */
export function routePath(report: DailyReport): LatLng[] {
  if (report.route.points.length >= 2) return report.route.points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const out: LatLng[] = [];
  const push = (p: LatLng | null) => {
    if (p && !(out.length && out[out.length - 1].lat === p.lat && out[out.length - 1].lng === p.lng)) out.push(p);
  };
  for (const l of report.travel.legs) { push(point(l.from?.lat, l.from?.lng)); push(point(l.to?.lat, l.to?.lng)); }
  return out.length >= 2 ? out : [];
}

/** Every distinct place a name could be looked up for (timeline points), in row order. */
export function timelinePlaces(items: TimelineItem[]): LatLng[] {
  const seen = new Set<string>();
  const out: LatLng[] = [];
  for (const it of items) {
    for (const p of [it.at, it.to]) {
      if (!p) continue;
      const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; // the same ~11 m cell the place-name cache uses
      if (!seen.has(k)) { seen.add(k); out.push(p); }
    }
  }
  return out;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export const TIMELINE_CSV_COLUMNS = [
  '#', 'Date', 'Employee', 'Employee ID', 'Event', 'Start', 'End', 'Minutes', 'Distance (km)', 'Details', 'Place', 'Latitude', 'Longitude',
] as const;

const coord = (n: number) => Number(n.toFixed(6));

/**
 * One CSV row per timeline row. `placeOf` turns a point into whatever name is known for it (or ""), so the export
 * carries the same place names as the screen. Latitude / Longitude are always there, even without a name; for a
 * travel leg they are where it started.
 */
export function timelineCsvRows(
  report: DailyReport, items: TimelineItem[], placeOf: (p: LatLng) => string,
): Array<Record<string, unknown>> {
  return items.map((it) => {
    const from = it.at ? placeOf(it.at) : '';
    const to = it.to ? placeOf(it.to) : '';
    const place = it.kind === 'travel' ? (from || to ? `${from || '?'} → ${to || '?'}` : '') : from;
    return {
      '#': it.seq,
      Date: report.date,
      Employee: csvSafe(report.user.name),
      'Employee ID': csvSafe(report.user.employee_id || ''),
      Event: it.title,
      Start: csvStamp(it.start),
      End: it.openEnd ? 'now' : csvStamp(it.end),
      Minutes: it.minutes ?? '',
      'Distance (km)': it.km == null ? '' : Number(it.km.toFixed(2)),
      Details: csvSafe(it.detail),
      Place: csvSafe(place),
      Latitude: it.at ? coord(it.at.lat) : '',
      Longitude: it.at ? coord(it.at.lng) : '',
    };
  });
}

export const TEAM_CSV_COLUMNS = [
  'Employee', 'Employee ID', 'Date', 'Check-in', 'Check-out', 'Hours', 'Mode of transport', 'Distance (km)',
  'Visits', 'Visit minutes', 'Halts', 'Halt minutes',
] as const;

export function teamCsvRows(rows: DailyReportTeamRow[], date: string): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    Employee: csvSafe(r.name),
    'Employee ID': csvSafe(r.employee_id || ''),
    Date: date,
    'Check-in': csvStamp(r.checkin_at),
    'Check-out': csvStamp(r.checkout_at),
    Hours: r.total_hours == null ? '' : Number(r.total_hours.toFixed(2)),
    'Mode of transport': r.mode || r.label ? modeText(r.mode, r.label) : '',
    'Distance (km)': Number(r.total_km.toFixed(2)),
    Visits: r.visits,
    'Visit minutes': r.visit_minutes,
    Halts: r.halts,
    'Halt minutes': r.halt_minutes,
  }));
}

/** "09:12 AM – 10:05 AM", "09:12 AM – now" or just "09:12 AM" for a point event. */
export function timeRange(it: Pick<TimelineItem, 'start' | 'end' | 'openEnd'>): string {
  const a = fmtClock(it.start);
  if (it.openEnd) return `${a} – now`;
  return it.end ? `${a} – ${fmtClock(it.end)}` : a;
}
