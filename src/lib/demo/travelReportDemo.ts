/**
 * Canned data for the Daily Travel Report in demo mode (demo@kinematic.com): GET /attendance/daily-report[/team].
 * A Bengaluru field day — check-in, a customer visit, a halt, a second visit, check-out — with a GPS route drawn
 * through them. Deterministic for a given date and person, no network.
 */
import type { DailyReport, DailyReportRoutePoint, DailyReportTeam } from '../api';

type Pt = { lat: number; lng: number };
interface DemoPerson { user_id?: string; id?: string; name?: string; users?: { name?: string; employee_id?: string; role?: string }; checkin_at?: string; checkout_at?: string; total_hours?: number }

const HOME: Pt = { lat: 12.9716, lng: 77.5946 };
const VISIT_A: Pt = { lat: 12.9352, lng: 77.6245 };
const HALT: Pt = { lat: 12.9279, lng: 77.6271 };
const VISIT_B: Pt = { lat: 12.9784, lng: 77.6408 };

const MODES: Array<{ mode: string; label: string } | null> = [
  { mode: 'own_bike', label: 'Own Bike' }, { mode: 'car', label: 'Car' }, { mode: 'public_transport', label: 'Public transport' }, null,
];

const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const shift = (p: Pt, k: number): Pt => ({ lat: p.lat + k * 0.0015, lng: p.lng + k * 0.0012 });

/** n points on the straight line a -> b, excluding a, including b. */
const between = (a: Pt, b: Pt, n: number): Pt[] => Array.from({ length: n }, (_, i) => ({
  lat: a.lat + ((b.lat - a.lat) * (i + 1)) / n, lng: a.lng + ((b.lng - a.lng) * (i + 1)) / n,
}));

export function demoDailyReport(date: string, userId: string, people: DemoPerson[] = []): DailyReport {
  const idx = Math.max(0, people.findIndex((p) => (p.user_id || p.id) === userId));
  const who = people[idx];
  const name = who?.users?.name || who?.name || 'Arjun Sharma';
  const k = hash(userId || name) % 5;
  const home = shift(HOME, k), a = shift(VISIT_A, k), halt = shift(HALT, k), b = shift(VISIT_B, k);
  const t = (hhmm: string) => `${date}T${hhmm}:00+05:30`;
  const m = MODES[idx % MODES.length];

  // The GPS route: home -> visit A, (stay) -> halt -> visit B, (stay) -> home, one fix every few minutes.
  const route: DailyReportRoutePoint[] = [];
  const addLeg = (from: Pt, to: Pt, startMin: number, endMin: number, n: number) => {
    between(from, to, n).forEach((p, i) => {
      const at = startMin + Math.round(((endMin - startMin) * (i + 1)) / n);
      route.push({ ...p, at: t(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`) });
    });
  };
  route.push({ ...home, at: t('09:12') });
  addLeg(home, a, 9 * 60 + 12, 10 * 60 + 5, 12);
  addLeg(a, halt, 10 * 60 + 43, 12 * 60 + 30, 8);
  addLeg(halt, b, 12 * 60 + 52, 14 * 60 + 10, 8);
  addLeg(b, home, 14 * 60 + 36, 18 * 60 + 5, 14);

  return {
    date,
    user: { id: userId, name, employee_id: who?.users?.employee_id || 'KIN-001', role: who?.users?.role || 'executive' },
    shift: { attendance_id: `demo-att-${date}`, checkin_at: t('09:12'), checkout_at: t('18:05'), total_hours: 8.88, in_progress: false },
    transport: { mode: m ? m.mode : null, label: m ? m.label : null },
    travel: {
      total_km: 23.6, method: 'gps_trail',
      legs: [
        { index: 0, km: 9.1, method: 'gps_trail',
          from: { kind: 'checkin', at: t('09:12'), lat: home.lat, lng: home.lng, label: 'Check-in' },
          to: { kind: 'form_checkin', at: t('10:05'), lat: a.lat, lng: a.lng, label: 'Daily Store Audit' } },
        { index: 1, km: 6.2, method: 'gps_trail',
          from: { kind: 'form_checkout', at: t('10:43'), lat: a.lat, lng: a.lng, label: 'Daily Store Audit' },
          to: { kind: 'form_checkin', at: t('14:10'), lat: b.lat, lng: b.lng, label: 'Dealer Visit' } },
        { index: 2, km: 8.3, method: 'gps_trail',
          from: { kind: 'form_checkout', at: t('14:36'), lat: b.lat, lng: b.lng, label: 'Dealer Visit' },
          to: { kind: 'checkout', at: t('18:05'), lat: home.lat, lng: home.lng, label: 'Check-out' } },
      ],
    },
    visits: [
      { submission_id: 'demo-s1', label: 'Daily Store Audit', arrival_at: t('10:05'), departure_at: t('10:43'), minutes: 38, lat: a.lat, lng: a.lng },
      { submission_id: 'demo-s2', label: 'Dealer Visit', arrival_at: t('14:10'), departure_at: t('14:36'), minutes: 26, lat: b.lat, lng: b.lng },
    ],
    halts: [{ index: 0, start_at: t('12:30'), end_at: t('12:52'), minutes: 22, lat: halt.lat, lng: halt.lng, points: 6 }],
    route: { points: route, thinned: false },
    summary: { visits: 2, visit_minutes: 64, halts: 1, halt_minutes: 22, total_km: 23.6 },
  };
}

export function demoDailyReportTeam(date: string, people: DemoPerson[] = []): DailyReportTeam {
  const rows = people.filter((p) => p.checkin_at).map((p, i) => {
    const m = MODES[i % MODES.length];
    const id = String(p.user_id || p.id || `demo-${i}`);
    return {
      user_id: id, name: p.users?.name || p.name || id, employee_id: p.users?.employee_id || null,
      checkin_at: `${date}T09:${String(10 + i * 7).padStart(2, '0')}:00+05:30`,
      checkout_at: p.checkout_at ? `${date}T18:${String(5 + i * 4).padStart(2, '0')}:00+05:30` : null,
      total_hours: p.total_hours ?? null,
      mode: m ? m.mode : null, label: m ? m.label : null,
      total_km: Number((23.6 - i * 3.7 + (i % 2) * 1.1).toFixed(1)),
      visits: 2 + (i % 3), visit_minutes: 64 + i * 11, halts: i % 3, halt_minutes: (i % 3) * 22,
    };
  });
  return { date, rows };
}
