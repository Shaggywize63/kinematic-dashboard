// Deterministic field evidence for the HRMS preview: 8 field people, 1 Oct to 6 Nov 2026 (deals from 1 Sep).
// Generated once per page load from a seeded random generator, so it is identical every time and never stored.
// A handful of real-looking problems are planted on purpose (a missed punch with proof of work, a check-in 40 km
// away 12 minutes after the last one, a duplicate receipt ...). The engines in engines.ts find them; the tests pin them.

import { makeRng } from '../areaStore';
import { addDays, diffDays } from '../format';
import type {
  Beat, Deal, ExpenseClaim, FieldEvidence, FieldRep, GeoPoint, IncentivePlan, OdometerDay, Outlet, Punch, Target, Territory,
  TrailDay, TrailPoint, TravelPolicy, Visit,
} from './types';

export const EVIDENCE_FROM = '2026-10-01';
export const EVIDENCE_TO = '2026-11-06';
export const DEALS_FROM = '2026-09-01';
export const ROAD_FACTOR = 1.15; // great-circle distance understates the road; trail km is scaled by this

// ───────────────────────────── geometry ─────────────────────────────
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const offsetKm = (p: GeoPoint, eastKm: number, northKm: number): GeoPoint => ({
  lat: p.lat + northKm / 111.32,
  lng: p.lng + eastKm / (111.32 * Math.cos((p.lat * Math.PI) / 180)),
});
export const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const weekdayOf = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
const hash8 = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

// ───────────────────────────── the cast ─────────────────────────────
const REPS: FieldRep[] = [
  { employeeId: 'emp_4', city: 'Delhi', territoryId: 'ter_del_c', vehicle: 'car', deviceId: 'dev_a4', planAcknowledged: true, isTeamLead: true },
  { employeeId: 'emp_6', city: 'Delhi', territoryId: 'ter_del_s', vehicle: 'bike', deviceId: 'dev_a6', planAcknowledged: true },
  { employeeId: 'emp_7', city: 'Delhi', territoryId: 'ter_del_s', vehicle: 'bike', deviceId: 'dev_a7', planAcknowledged: true },
  { employeeId: 'emp_8', city: 'Bengaluru', territoryId: 'ter_blr_e', vehicle: 'bike', deviceId: 'dev_a8', planAcknowledged: true },
  { employeeId: 'emp_9', city: 'Bengaluru', territoryId: 'ter_blr_w', vehicle: 'bike', deviceId: 'dev_a9', planAcknowledged: true },
  { employeeId: 'emp_19', city: 'Delhi', territoryId: 'ter_del_n', vehicle: 'bike', deviceId: 'dev_b19', planAcknowledged: true },
  { employeeId: 'emp_20', city: 'Delhi', territoryId: 'ter_del_n', vehicle: 'bike', deviceId: 'dev_b20', planAcknowledged: false },
  { employeeId: 'emp_22', city: 'Delhi', territoryId: 'ter_del_n', vehicle: 'bike', deviceId: 'dev_b22', planAcknowledged: true },
];

const TERRITORIES: Territory[] = [
  { id: 'ter_del_c', name: 'Delhi Central', city: 'Delhi', ownerId: 'emp_4', potentialPerMonth: 2400000, centre: { lat: 28.6315, lng: 77.2167 } },
  { id: 'ter_del_s', name: 'Delhi South', city: 'Delhi', ownerId: 'emp_6', potentialPerMonth: 2600000, centre: { lat: 28.5355, lng: 77.21 } },
  { id: 'ter_del_n', name: 'Delhi North', city: 'Delhi', ownerId: 'emp_19', potentialPerMonth: 2200000, centre: { lat: 28.7495, lng: 77.0565 } },
  { id: 'ter_blr_e', name: 'Bengaluru East', city: 'Bengaluru', ownerId: 'emp_8', potentialPerMonth: 1900000, centre: { lat: 12.9784, lng: 77.6408 } },
  { id: 'ter_blr_w', name: 'Bengaluru West', city: 'Bengaluru', ownerId: 'emp_9', potentialPerMonth: 1500000, centre: { lat: 12.9916, lng: 77.552 } },
];

const MONTHLY_TARGET: Record<string, number> = { emp_4: 1800000, emp_6: 1400000, emp_7: 800000, emp_8: 1200000, emp_9: 700000, emp_19: 1400000, emp_20: 700000, emp_22: 600000 };
// Booked revenue as a share of target, by month. Chosen so the slabs, the accelerator and the miss cases all show up.
const ATTAINMENT: Record<string, Record<string, number>> = {
  emp_4: { '2026-09': 0.97, '2026-10': 1.01, '2026-11': 0.34 },
  emp_6: { '2026-09': 1.04, '2026-10': 1.08, '2026-11': 0.41 },
  emp_7: { '2026-09': 0.81, '2026-10': 0.74, '2026-11': 0.22 },
  emp_8: { '2026-09': 0.92, '2026-10': 0.96, '2026-11': 0.37 },
  emp_9: { '2026-09': 1.12, '2026-10': 1.12, '2026-11': 0.45 },
  emp_19: { '2026-09': 1.18, '2026-10': 1.31, '2026-11': 0.52 },
  emp_20: { '2026-09': 0.66, '2026-10': 0.63, '2026-11': 0.2 },
  emp_22: { '2026-09': 0.7, '2026-10': 0.58, '2026-11': 0.15 },
};

const SHOP_A = ['Sharma', 'Gupta', 'Royal', 'City', 'Bharat', 'New Age', 'Modern', 'Sai', 'Krishna', 'Metro', 'Shree', 'Anand', 'Prime', 'Classic', 'Lakshmi', 'National'];
const SHOP_B = ['Electricals', 'General Store', 'Hardware', 'Home Needs', 'Traders', 'Electronics', 'Agencies', 'Lighting House', 'Enterprises', 'Distributors', 'Mart', 'Supplies'];
const AREAS: Record<string, string[]> = {
  Delhi: ['Karol Bagh', 'Lajpat Nagar', 'Saket', 'Rohini', 'Pitampura', 'Nehru Place', 'Connaught Place', 'Janakpuri', 'Azadpur', 'Model Town', 'Hauz Khas', 'Okhla'],
  Bengaluru: ['Indiranagar', 'Jayanagar', 'Rajajinagar', 'Malleshwaram', 'Whitefield', 'HSR Layout', 'Yeshwanthpur', 'Koramangala', 'Basavanagudi', 'KR Puram'],
};
const CUSTOMERS = ['Aggarwal Builders', 'Sundaram Interiors', 'Kapoor Projects', 'Metro Residency', 'Bhatia & Sons', 'Lotus Developers', 'Greenfield Homes', 'Nair Contracting', 'Orchid Hospitality', 'Raj Electricals', 'Vasant Apartments', 'Heritage Hotels', 'Pioneer Estates', 'Skyline Realty', 'Mehta Furnishings', 'Citadel Offices'];
const PRODUCTS = ['LED panel lights', 'Modular switches', 'Ceiling fans', 'Water purifiers', 'Inverter batteries', 'Smart meters', 'Wiring cable', 'Kitchen chimneys'];

export const FIELD_PLAN: IncentivePlan = {
  id: 'plan_2026', name: 'Field sales incentive FY 2026-27', effectiveFrom: '2026-04-01',
  bands: [{ from: 0, to: 70, rate: 0 }, { from: 70, to: 100, rate: 0.01 }, { from: 100, to: 120, rate: 0.015 }, { from: 120, to: null, rate: 0.025 }],
  minCollectionPct: 80, clawbackWindowDays: 60,
  note: 'Sample plan written for this preview. Slab rates, the collection gate and the clawback window are company policy, not statute. A clawback needs the rep to have acknowledged the plan.',
};
export const FIELD_TRAVEL: TravelPolicy = {
  ratePerKm: { bike: 3.5, car: 9 }, fuelRatePerKm: { bike: 2.4, car: 6.5 }, disputeThresholdPct: 15,
  source: 'Sample company travel policy for the preview. Not a statutory rate.',
};

// ───────────────────────────── generator ─────────────────────────────
interface Stop { outlet: Outlet; start: number; end: number; travelMin: number; pos: GeoPoint }

let memo: FieldEvidence | null = null;
export function getFieldEvidence(): FieldEvidence {
  if (!memo) memo = build();
  return memo;
}

function build(): FieldEvidence {
  const outlets: Outlet[] = [];
  const beats: Beat[] = [];
  const repIndex = new Map(REPS.map((r, i) => [r.employeeId, i]));

  // Beats and outlets: six weekday beats per person, eight outlets each, clustered around a beat centre.
  REPS.forEach((rep, ri) => {
    const terr = TERRITORIES.find((t) => t.id === rep.territoryId)!;
    const rng = makeRng(9100 + ri * 77);
    const areas = AREAS[rep.city]!;
    for (let wd = 1; wd <= 6; wd++) {
      const ang = (wd * 1.05) + ri * 1.7;
      const rad = 1.5 + wd * 0.8 + (ri % 3) * 0.9;
      // Farhan's Wednesday beat sits ~400 m from Gaurav's: the overlap the territory screen should surface.
      let centre = offsetKm(terr.centre, Math.cos(ang) * rad, Math.sin(ang) * rad);
      if (rep.employeeId === 'emp_20' && wd === 3) {
        const g = beats.find((b) => b.repId === 'emp_19' && b.weekday === 3)!;
        const gc = outlets.find((o) => o.id === g.outletIds[0])!.pos;
        centre = offsetKm(gc, 0.4, 0.1);
      }
      const beatId = `beat_${rep.employeeId}_${wd}`;
      const ids: string[] = [];
      for (let k = 0; k < 8; k++) {
        const a2 = rng() * Math.PI * 2, r2 = 0.3 + rng() * 1.9;
        const idx = ri * 100 + wd * 10 + k;
        const o: Outlet = {
          id: `out_${rep.employeeId}_${wd}${k}`,
          name: `${SHOP_A[(idx * 7) % SHOP_A.length]} ${SHOP_B[(idx * 5 + wd) % SHOP_B.length]}`,
          type: k === 0 ? 'distributor' : k === 5 ? 'dealer' : 'retail',
          area: areas[(ri + wd + k) % areas.length]!,
          pos: offsetKm(centre, Math.cos(a2) * r2, Math.sin(a2) * r2),
          beatId, territoryId: rep.territoryId, repId: rep.employeeId, tier: rng() < 0.2 ? 'A' : rng() < 0.55 ? 'B' : 'C',
        };
        outlets.push(o); ids.push(o.id);
      }
      beats.push({ id: beatId, name: `${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd]} beat`, territoryId: rep.territoryId, repId: rep.employeeId, weekday: wd as Beat['weekday'], outletIds: ids });
    }
  });
  // One far-away outlet: where a check-in cannot physically be reached from the previous one (planted anomaly).
  outlets.push({ id: 'out_far_blr', name: 'Doddaballapur Hardware', type: 'dealer', area: 'Doddaballapur', pos: { lat: 13.2957, lng: 77.5378 }, beatId: 'beat_emp_8_5', territoryId: 'ter_blr_e', repId: 'emp_8', tier: 'C' });
  const outletById = new Map(outlets.map((o) => [o.id, o]));

  const holidays = ['2026-10-02'];
  const visits: Visit[] = [];
  const punches: Punch[] = [];
  const trails: TrailDay[] = [];
  const odometer: OdometerDay[] = [];
  const claims: ExpenseClaim[] = [];

  const ODO_START: Record<string, number> = { emp_4: 41200, emp_6: 18740, emp_7: 9120, emp_8: 27410, emp_9: 12680, emp_19: 33050, emp_20: 6310, emp_22: 21900 };

  // Planted days, keyed "employee|date".
  const LONG_DAYS = new Set(['emp_6|2026-10-07', 'emp_6|2026-10-21', 'emp_6|2026-10-28', 'emp_8|2026-10-16']);
  const SUNDAY_WORK = new Set(['emp_6|2026-10-11', 'emp_6|2026-10-18']);
  const NO_OUT_PUNCH = new Set(['emp_6|2026-10-14', 'emp_4|2026-11-04']);
  const NO_PUNCH_AT_ALL = new Set(['emp_9|2026-10-08', 'emp_7|2026-10-20', 'emp_22|2026-11-05']);
  const NONE_VERIFIED = new Set(['emp_22|2026-11-05']);
  const AT_HOME = new Set(['emp_22|2026-11-03']);
  const ONE_VERIFIED = new Set(['emp_7|2026-10-20']);
  const SHARED_DEVICE_DAYS = new Set(['2026-10-06', '2026-10-13', '2026-10-20']);
  const PLANTED = new Set<string>([...LONG_DAYS, ...SUNDAY_WORK, ...NO_OUT_PUNCH, ...NO_PUNCH_AT_ALL, ...AT_HOME, 'emp_8|2026-10-09', 'emp_9|2026-10-22', 'emp_19|2026-10-27', 'emp_4|2026-10-29', 'emp_19|2026-11-02', 'emp_20|2026-11-02', 'emp_7|2026-10-12', 'emp_7|2026-10-13',
    ...[...SHARED_DEVICE_DAYS].flatMap((d) => [`emp_19|${d}`, `emp_20|${d}`])]);

  REPS.forEach((rep, ri) => {
    const rng = makeRng(4200 + ri * 191);
    const empBeats = beats.filter((b) => b.repId === rep.employeeId);
    let odo = ODO_START[rep.employeeId]!;
    // Two or three random absent days a month, never on a planted day.
    const absent = new Set<string>();
    for (let d = EVIDENCE_FROM; d <= EVIDENCE_TO; d = addDays(d, 1)) {
      if (weekdayOf(d) !== 0 && !PLANTED.has(`${rep.employeeId}|${d}`) && rng() < 0.065) absent.add(d);
    }
    for (let d = EVIDENCE_FROM; d <= EVIDENCE_TO; d = addDays(d, 1)) {
      const key = `${rep.employeeId}|${d}`;
      const wd = weekdayOf(d);
      const isSunday = wd === 0;
      if (holidays.includes(d) || (isSunday && !SUNDAY_WORK.has(key)) || absent.has(d)) continue;
      const beatDay = (isSunday ? 6 : wd);
      const beat = empBeats.find((b) => b.weekday === beatDay)!;
      let ids = [...beat.outletIds];
      if (LONG_DAYS.has(key)) ids = [...ids, ...empBeats.find((b) => b.weekday === (beatDay % 6) + 1)!.outletIds];
      else if (rep.isTeamLead) ids = ids.slice(0, 4);
      else ids = ids.filter((_, i) => i < 4 || rng() > 0.12);
      const day: Stop[] = [];
      const home = AT_HOME.has(key);

      if (!home) {
        let t = 9 * 60 + 25 + Math.floor(rng() * 35);
        let prev: GeoPoint | null = null;
        let lunched = false;
        for (const id of ids) {
          const o = outletById.get(id)!;
          let travel = 20;
          if (prev) {
            travel = Math.round((haversineKm(prev, o.pos) * ROAD_FACTOR) / 22 * 60) + 3 + Math.floor(rng() * 6);
            t += travel;
            if (!lunched && t >= 12 * 60 + 45) { t += 35 + Math.floor(rng() * 15); lunched = true; }
          }
          const dur = 12 + Math.floor(rng() * 24);
          day.push({ outlet: o, start: t, end: t + dur, travelMin: travel, pos: o.pos });
          t += dur; prev = o.pos;
        }
      }

      // Punches: in 20 minutes before the first stop (that 20 minutes is the ride from home), out 20 after the last.
      let punchIn: number, punchOut: number;
      let homePos: GeoPoint, endPos: GeoPoint;
      if (home) {
        punchIn = 9 * 60 + 12; punchOut = 18 * 60 + 5;
        homePos = offsetKm(TERRITORIES.find((t) => t.id === rep.territoryId)!.centre, 6.2, -2.4); endPos = homePos;
      } else {
        punchIn = day[0]!.start - 20; punchOut = day[day.length - 1]!.end + 20;
        homePos = offsetKm(day[0]!.pos, -2.2, -1.8); endPos = offsetKm(day[day.length - 1]!.pos, 1.9, -2.1);
      }
      if (key === 'emp_4|2026-10-29') punchIn = 11 * 60 + 40; // punched in well after the first visit

      // Position of the phone at minute t.
      const posAt = (t: number): GeoPoint => {
        if (home) return homePos;
        const first = day[0]!, last = day[day.length - 1]!;
        if (t <= first.start) {
          const f = Math.max(0, Math.min(1, (t - punchIn) / Math.max(1, first.start - punchIn)));
          return { lat: homePos.lat + (first.pos.lat - homePos.lat) * f, lng: homePos.lng + (first.pos.lng - homePos.lng) * f };
        }
        if (t >= last.end) {
          const f = Math.max(0, Math.min(1, (t - last.end) / Math.max(1, punchOut - last.end)));
          return { lat: last.pos.lat + (endPos.lat - last.pos.lat) * f, lng: last.pos.lng + (endPos.lng - last.pos.lng) * f };
        }
        for (let i = 0; i < day.length; i++) {
          const s = day[i]!;
          if (t >= s.start && t <= s.end) return s.pos;
          const nx = day[i + 1];
          if (nx && t > s.end && t < nx.start) {
            const leave = nx.start - nx.travelMin;
            if (t <= leave) return s.pos;
            const f = (t - leave) / Math.max(1, nx.travelMin);
            return { lat: s.pos.lat + (nx.pos.lat - s.pos.lat) * f, lng: s.pos.lng + (nx.pos.lng - s.pos.lng) * f };
          }
        }
        return last.pos;
      };

      // Trail: a fix every 10 minutes while punched in.
      let points: TrailPoint[] = [];
      for (let t = punchIn; t <= punchOut; t += 10) points.push({ t: toHHMM(t), pos: posAt(t) });
      const fullKm = trailKm(points);
      if (key === 'emp_8|2026-10-16') points = points.filter((p) => toMin(p.t) < 13 * 60 + 10 || toMin(p.t) > 16 * 60 + 40); // battery died mid-day
      const km = trailKm(points);
      const longestGapMin = longestGap(points);
      trails.push({ employeeId: rep.employeeId, date: d, points, km: round1(km), longestGapMin });

      // Odometer: ends where the true route says it should (so a GPS gap leaves the odometer ahead of the trail).
      const factor = key === 'emp_9|2026-10-22' ? 2.35 : 0.96 + rng() * 0.1;
      const dist = Math.round(fullKm * factor) + (key === 'emp_8|2026-10-16' ? 55 : 0); // plus a ride out to a dealer while the phone was off
      odometer.push({ employeeId: rep.employeeId, date: d, startKm: odo, endKm: odo + dist, photoStart: true, photoEnd: true });
      odo += dist + Math.floor(rng() * 4);

      // Visits.
      const dayVisits: Visit[] = day.map((s, i) => {
        const bad = rng();
        const off = bad < 0.06 ? 220 + rng() * 380 : rng() * 90; // metres from the outlet
        const ang = rng() * Math.PI * 2;
        const pos = offsetKm(s.pos, (Math.cos(ang) * off) / 1000, (Math.sin(ang) * off) / 1000);
        const photo = rng() > 0.03;
        const distM = Math.round(haversineKm(pos, s.outlet.pos) * 1000);
        const orderValue = rng() < 0.45 ? 0 : Math.round((3000 + rng() * 57000) / 100) * 100;
        const v: Visit = {
          id: `v_${rep.employeeId}_${d}_${i}`, employeeId: rep.employeeId, outletId: s.outlet.id, date: d,
          start: toHHMM(s.start), end: toHHMM(s.end), pos, distanceFromOutletM: distM, photo, verified: false, orderValue,
        };
        return v;
      });
      if (ONE_VERIFIED.has(key)) dayVisits.forEach((v, i) => { if (i > 0) v.photo = false; });
      if (NONE_VERIFIED.has(key)) dayVisits.forEach((v) => { v.photo = false; });
      if (key === 'emp_8|2026-10-09' && dayVisits[3]) { // a check-in 40 km away, 12 minutes after the last one
        const far = outletById.get('out_far_blr')!;
        const v = dayVisits[3];
        v.outletId = far.id; v.pos = offsetKm(far.pos, 0.03, 0.02); v.distanceFromOutletM = Math.round(haversineKm(v.pos, far.pos) * 1000);
        v.photo = true;
      }
      for (const v of dayVisits) v.verified = v.distanceFromOutletM <= 150 && v.photo && toMin(v.end) - toMin(v.start) >= 5;
      visits.push(...dayVisits);

      // Punch.
      const pDev = SHARED_DEVICE_DAYS.has(d) && rep.employeeId === 'emp_19' ? 'dev_b20' : rep.deviceId;
      const punch: Punch = {
        employeeId: rep.employeeId, date: d, in: toHHMM(punchIn), out: toHHMM(punchOut),
        inPos: offsetKm(homePos, 0.02, 0.01), outPos: offsetKm(endPos, 0.02, -0.01), deviceId: pDev, source: 'app',
      };
      if (NO_PUNCH_AT_ALL.has(key)) { delete punch.in; delete punch.out; delete punch.inPos; delete punch.outPos; }
      if (NO_OUT_PUNCH.has(key)) { delete punch.out; delete punch.outPos; }
      if (!NO_PUNCH_AT_ALL.has(key) && !NO_OUT_PUNCH.has(key) && !PLANTED.has(key) && rng() < 0.02) { delete punch.out; delete punch.outPos; } // the odd natural miss
      punches.push(punch);

      // Claims.
      const trailKmDay = km;
      if (rep.vehicle !== 'public' && rng() < 0.22) {
        const rate = FIELD_TRAVEL.fuelRatePerKm[rep.vehicle];
        const amt = Math.max(100, Math.round((trailKmDay * rate * (0.9 + rng() * 0.3)) / 10) * 10);
        claims.push({ id: `cl_${rep.employeeId}_${d}_f`, employeeId: rep.employeeId, date: d, category: 'fuel', amount: amt, receiptHash: `rh_${hash8(`${key}fuel${amt}`)}`, vendor: rep.city === 'Delhi' ? 'Indian Oil, Ring Road' : 'HP Petrol Pump, Old Madras Rd' });
      }
      if (rng() < 0.14) {
        const amt = Math.round((180 + rng() * 240) / 10) * 10;
        claims.push({ id: `cl_${rep.employeeId}_${d}_m`, employeeId: rep.employeeId, date: d, category: 'meal', amount: amt, receiptHash: `rh_${hash8(`${key}meal${amt}`)}`, vendor: 'Dhaba / canteen' });
      }
      if (rep.vehicle === 'car') claims.push({ id: `cl_${rep.employeeId}_${d}_p`, employeeId: rep.employeeId, date: d, category: 'parking', amount: 40 + Math.floor(rng() * 4) * 20, receiptHash: `rh_${hash8(`${key}park`)}`, vendor: 'Parking' });
    }
  });

  // Planted claims.
  const addClaim = (c: ExpenseClaim) => { const i = claims.findIndex((x) => x.id === c.id); if (i >= 0) claims[i] = c; else claims.push(c); };
  addClaim({ id: 'cl_emp_19_2026-10-27_f', employeeId: 'emp_19', date: '2026-10-27', category: 'fuel', amount: 1850, receiptHash: 'rh_5b1e0c77', vendor: 'Indian Oil, Rohini' });
  addClaim({ id: 'cl_emp_19_2026-11-02_m', employeeId: 'emp_19', date: '2026-11-02', category: 'meal', amount: 1240, receiptHash: 'rh_9f31a7c2', vendor: 'Kake Da Dhaba, Rohini' });
  addClaim({ id: 'cl_emp_20_2026-11-02_m', employeeId: 'emp_20', date: '2026-11-02', category: 'meal', amount: 1240, receiptHash: 'rh_9f31a7c2', vendor: 'Kake Da Dhaba, Rohini' });
  addClaim({ id: 'cl_emp_7_2026-10-12_p', employeeId: 'emp_7', date: '2026-10-12', category: 'parking', amount: 60, receiptHash: 'rh_c2d4e801', vendor: 'Nehru Place parking' });
  addClaim({ id: 'cl_emp_7_2026-10-13_p', employeeId: 'emp_7', date: '2026-10-13', category: 'parking', amount: 60, receiptHash: 'rh_c2d4e801', vendor: 'Nehru Place parking' });

  // Targets.
  const targets: Target[] = [];
  for (const rep of REPS) for (const m of ['2026-09', '2026-10', '2026-11']) {
    targets.push({ employeeId: rep.employeeId, month: m, revenue: MONTHLY_TARGET[rep.employeeId]!, visits: rep.isTeamLead ? 90 : 150, newOutlets: rep.isTeamLead ? 2 : 4 });
  }

  const deals = buildDeals(repIndex);

  return {
    reps: REPS, territories: TERRITORIES, beats, outlets, visits, punches, trails, odometer, claims, deals, targets,
    plan: FIELD_PLAN, travel: FIELD_TRAVEL, holidays, from: EVIDENCE_FROM, to: EVIDENCE_TO,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Route distance estimate from GPS fixes: great-circle hops times the road factor. */
export function trailKm(points: TrailPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1]!.pos, points[i]!.pos);
  return km * ROAD_FACTOR;
}
export function longestGap(points: TrailPoint[]): number {
  let g = 0;
  for (let i = 1; i < points.length; i++) g = Math.max(g, toMin(points[i]!.t) - toMin(points[i - 1]!.t));
  return g;
}

function buildDeals(_repIndex: Map<string, number>): Deal[] {
  const deals: Deal[] = [];
  REPS.forEach((rep, ri) => {
    const rng = makeRng(6100 + ri * 53);
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const target = MONTHLY_TARGET[rep.employeeId]!;
      const goal = target * (ATTAINMENT[rep.employeeId]![month] ?? 0.8);
      const monthEnd = month === '2026-11' ? EVIDENCE_TO : addDays(`${month}-01`, 29 + (month === '2026-10' ? 1 : 0));
      const days = Math.max(1, diffDays(`${month}-01`, monthEnd));
      let booked = 0, n = 0;
      while (booked < goal - 20000 && n < 30) {
        const size = Math.min(goal - booked, Math.round((60000 + rng() * 190000) / 1000) * 1000);
        const closedOn = addDays(`${month}-01`, Math.floor(rng() * days));
        const old = diffDays(closedOn, '2026-11-07') > 35;
        const collectedPct = old ? 100 : [100, 100, 100, 60, 0][Math.floor(rng() * 5)]!;
        deals.push({
          id: `deal_${rep.employeeId}_${month}_${n}`, employeeId: rep.employeeId,
          customer: CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)]!, product: PRODUCTS[Math.floor(rng() * PRODUCTS.length)]!,
          value: size, closedOn, status: 'won', collectedPct: month === '2026-11' ? [0, 50, 100, 0][Math.floor(rng() * 4)]! : collectedPct,
          kind: rng() < 0.4 ? 'new' : rng() < 0.7 ? 'repeat' : 'upsell',
        });
        booked += size; n++;
      }
    }
  });
  // Planted cancellations that exercise the clawback rules.
  const put = (d: Deal) => { const i = deals.findIndex((x) => x.id === d.id); if (i >= 0) deals[i] = d; else deals.push(d); };
  put({ id: 'deal_clw_gaurav', employeeId: 'emp_19', customer: 'Lotus Developers', product: 'Modular switches', value: 240000, closedOn: '2026-09-22', status: 'cancelled', cancelledOn: '2026-10-14', collectedPct: 100, kind: 'new' });
  put({ id: 'deal_clw_farhan', employeeId: 'emp_20', customer: 'Mehta Furnishings', product: 'Ceiling fans', value: 110000, closedOn: '2026-09-25', status: 'cancelled', cancelledOn: '2026-10-21', collectedPct: 100, kind: 'repeat' });
  put({ id: 'deal_clw_sana', employeeId: 'emp_9', customer: 'Orchid Hospitality', product: 'Smart meters', value: 180000, closedOn: '2026-09-03', status: 'cancelled', cancelledOn: '2026-11-05', collectedPct: 100, kind: 'new' });
  put({ id: 'deal_clw_karthik', employeeId: 'emp_8', customer: 'Skyline Realty', product: 'LED panel lights', value: 95000, closedOn: '2026-10-08', status: 'cancelled', cancelledOn: '2026-10-19', collectedPct: 0, kind: 'upsell' });
  return deals;
}
