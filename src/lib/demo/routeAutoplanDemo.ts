/**
 * Demo-account engine for Automated Route Plans (/dashboard/route-automation).
 *
 * A real account's page is driven by five backend endpoints:
 *   GET  /route-plans/autoplan/methods      → the method catalog + vehicle types
 *   GET  /route-plans/autoplan/policy       → the org's saved method + params
 *   PUT  /route-plans/autoplan/policy       → save them
 *   GET  /route-plans/autoplan/field-execs  → each rep's location readiness
 *   PUT  /route-plans/autoplan/fe-location  → set a rep's base coordinates
 *   POST /route-plans/autoplan/preview      → dry-run the per-rep assignment
 *   POST /route-plans/autoplan/run          → generate + assign plans
 *
 * None of these were mocked, so the demo account got no method cards, no vehicle
 * list and no working preview / assign. This module serves ALL of them with the
 * same shapes, the same seven methods (copy kept in step with
 * route-team-autoplan.service.ts), the same eight vehicle types and the same
 * policy rules, over a small deterministic outlet pool — so every option behaves
 * differently and visibly in the demo, and "Generate & assign" really adds plans
 * to the demo's route-plan list.
 *
 * Pure and deterministic (no randomness, no network) so it can be tested directly.
 */

export type AutoPlanMethodId =
  | 'cadence_priority' | 'territory' | 'geo_cluster' | 'nearest_fe'
  | 'balanced_workload' | 'recurring_pjp' | 'manual';

export interface AutoPlanMethodMeta {
  id: AutoPlanMethodId;
  label: string;
  tagline: string;
  description: string;
  automatic: boolean;
  uses: Array<'max_outlets_per_fe' | 'vehicle_type' | 'max_radius_km'>;
}

export const DEMO_AUTOPLAN_METHODS: AutoPlanMethodMeta[] = [
  {
    id: 'cadence_priority',
    label: 'Cadence & priority',
    tagline: 'Cover the most overdue outlets, split evenly',
    description:
      'Ranks every outlet that is overdue against its visit cadence or flagged high priority, then shares them out evenly across all field executives — most-urgent first. Best when you just want due outlets covered fairly, regardless of geography.',
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type'],
  },
  {
    id: 'territory',
    label: 'Territory / beat',
    tagline: 'Assign by the city each rep owns',
    description:
      "Groups due outlets by city and hands each city's outlets to the field executive(s) who cover that city (by their zone). Outlets in a city no one covers are given to the least-loaded rep. Best when reps own stable beats.",
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type'],
  },
  {
    id: 'geo_cluster',
    label: 'Geographic clusters',
    tagline: 'Group nearby outlets, one cluster per rep',
    description:
      'Clusters the day’s due outlets by location and assigns each compact cluster to its nearest field executive. Produces tight, low-travel routes without any pre-drawn territories.',
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type'],
  },
  {
    id: 'nearest_fe',
    label: 'Nearest field executive',
    tagline: 'Each outlet to the closest available rep',
    description:
      'Assigns every due outlet to the nearest field executive who still has capacity (by their live location or base). Great for reactive, same-day planning.',
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type', 'max_radius_km'],
  },
  {
    id: 'balanced_workload',
    label: 'Balanced workload',
    tagline: 'Even out stops across the team',
    description:
      'Distributes due outlets so every field executive gets a similar number of stops, preferring the nearest rep under the average. Prevents one rep getting 25 stops while another gets 4.',
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type', 'max_radius_km'],
  },
  {
    id: 'recurring_pjp',
    label: 'Recurring journey plan',
    tagline: 'Fixed weekday beats from preferred day',
    description:
      "A permanent journey plan: only outlets whose preferred day matches the plan date's weekday (or that have no preferred day set) are scheduled, then assigned by territory. Set preferred days in Outlet Priorities to build a repeating weekly beat.",
    automatic: true,
    uses: ['max_outlets_per_fe', 'vehicle_type'],
  },
  {
    id: 'manual',
    label: 'Manual only',
    tagline: 'No auto-assignment — plan by hand',
    description:
      'Turns automatic assignment off. Managers build each route plan themselves. You can switch to an automatic method at any time.',
    automatic: false,
    uses: [],
  },
];

/** kg CO₂ per km — the same eight vehicle types the real backend offers. */
export const DEMO_VEHICLE_FACTORS: Record<string, number> = {
  '2w_petrol': 0.072,
  '2w_ev': 0.022,
  '4w_petrol': 0.145,
  '4w_diesel': 0.171,
  '4w_ev': 0.045,
  'public_bus': 0.082,
  'auto_rickshaw': 0.108,
  'walking': 0,
};
export const DEMO_VEHICLE_TYPES = Object.keys(DEMO_VEHICLE_FACTORS);
export const AUTO_NOTE_PREFIX = 'Auto-assigned';

const isMethod = (v: unknown): v is AutoPlanMethodId =>
  typeof v === 'string' && DEMO_AUTOPLAN_METHODS.some((m) => m.id === v);

// ── Policy (what "Save method" persists) ──────────────────────────────────────
export interface AutoPlanPolicy {
  method: AutoPlanMethodId;
  params: { max_outlets_per_fe: number; vehicle_type: string; max_radius_km: number };
  schedule: { enabled: boolean; time: string };
}

/** Coerce anything (a saved value or a request body) into a valid policy — the
 *  same rules as the backend's normalizeAutoPlanPolicy. */
export function normalizePolicy(input: unknown): AutoPlanPolicy {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = (i.params && typeof i.params === 'object' ? i.params : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const sch = (i.schedule && typeof i.schedule === 'object' ? i.schedule : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cap = parseInt(String(p.max_outlets_per_fe ?? ''), 10);
  const radius = Number(p.max_radius_km);
  const vehicle = DEMO_VEHICLE_TYPES.includes(String(p.vehicle_type)) ? String(p.vehicle_type) : '2w_petrol';
  return {
    method: isMethod(i.method) ? i.method : 'cadence_priority',
    params: {
      max_outlets_per_fe: Math.min(Math.max(Number.isFinite(cap) ? cap : 15, 1), 50),
      vehicle_type: vehicle,
      max_radius_km: Math.min(Math.max(Number.isFinite(radius) && radius > 0 ? radius : 25, 1), 500),
    },
    schedule: {
      enabled: sch.enabled === true,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(sch.time)) ? String(sch.time) : '06:00',
    },
  };
}

// Session state — resets on a full page reload, like every other demo write.
let savedPolicy: AutoPlanPolicy = normalizePolicy({});
let savedAt: string | null = null;
const baseOverrides = new Map<string, { lat: number; lng: number }>();

/** Tests only. */
export function resetDemoAutoPlan(): void {
  savedPolicy = normalizePolicy({});
  savedAt = null;
  baseOverrides.clear();
}

export function getDemoPolicy() {
  return { ...savedPolicy, updated_at: savedAt, methods: DEMO_AUTOPLAN_METHODS, vehicle_types: DEMO_VEHICLE_TYPES };
}

export function setDemoPolicy(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.method != null && !isMethod(b.method)) {
    throw new Error(`method must be one of ${DEMO_AUTOPLAN_METHODS.map((m) => m.id).join(', ')}`);
  }
  savedPolicy = normalizePolicy(b);
  savedAt = new Date().toISOString();
  return { ...savedPolicy, updated_at: savedAt, methods: DEMO_AUTOPLAN_METHODS };
}

// ── Geometry ──────────────────────────────────────────────────────────────────
interface Pt { lat: number; lng: number }
const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}
const round = (n: number, dp: number) => { const m = 10 ** dp; return Math.round((Number(n) || 0) * m) / m; };
/** Straight-line → road distance. */
const ROAD_FACTOR = 1.25;

// ── Demo outlets ──────────────────────────────────────────────────────────────
const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, bi_weekly: 14, monthly: 30, quarterly: 90 };

interface DemoOutlet {
  id: string; name: string; code: string; city: string; lat: number | null; lng: number | null;
  priority: 'high' | 'normal' | 'low'; frequency: keyof typeof FREQ_DAYS;
  /** Days since last visit; null = never visited. */
  lastVisitDays: number | null;
  /** 0 = Sunday … 6 = Saturday; null = no preferred day. */
  preferredDay: number | null;
}
type OT = [string, string, string, string, number | null, number | null, DemoOutlet['priority'], string, number | null, number | null];
const OUTLET_ROWS: OT[] = [
  // Bangalore
  ['st-blr-1', 'Reliance Fresh - Koramangala',      'STR-30001', 'Bangalore', 12.9352, 77.6245, 'high',   'weekly',    9,    1],
  ['st-blr-2', 'Big Bazaar - Indiranagar',          'STR-30002', 'Bangalore', 12.9784, 77.6408, 'high',   'monthly',   12,   null],
  ['st-blr-3', 'Star Market - HSR Layout',          'STR-30003', 'Bangalore', 12.9116, 77.6389, 'normal', 'bi_weekly', null, 1],
  ['st-blr-4', "Spencer's - MG Road",               'STR-30005', 'Bangalore', 12.9757, 77.6050, 'normal', 'weekly',    8,    2],
  ['st-blr-5', 'Metro Cash & Carry - Whitefield',   'STR-30004', 'Bangalore', 12.9698, 77.7500, 'high',   'monthly',   40,   null],
  ['st-blr-6', 'More Supermarket - Jayanagar',      'STR-30006', 'Bangalore', 12.9308, 77.5838, 'normal', 'weekly',    3,    null],
  ['st-blr-7', 'Nilgiris - Malleshwaram',           'STR-30007', 'Bangalore', 13.0035, 77.5700, 'low',    'monthly',   35,   null],
  ['st-blr-8', "Namdhari's Fresh - Hebbal",         'STR-30008', 'Bangalore', 13.0358, 77.5970, 'normal', 'bi_weekly', 20,   null],
  ['st-blr-9', 'Food World - JP Nagar',             'STR-30009', 'Bangalore', 12.9063, 77.5857, 'normal', 'weekly',    10,   2],
  ['st-blr-10', 'D-Mart - Electronic City',         'STR-30010', 'Bangalore', 12.8452, 77.6602, 'high',   'bi_weekly', 6,    null],
  // Mumbai
  ['st-mum-1', 'Reliance Smart - Andheri',          'STR-31001', 'Mumbai', 19.1136, 72.8697, 'high',   'weekly',    11,   3],
  ['st-mum-2', 'Big Bazaar - Phoenix Marketcity',   'STR-31002', 'Mumbai', 19.0866, 72.8886, 'normal', 'monthly',   45,   null],
  ['st-mum-3', 'Star Bazaar - Powai',               'STR-31003', 'Mumbai', 19.1197, 72.9051, 'normal', 'bi_weekly', null, null],
  ['st-mum-4', 'D-Mart - Borivali',                 'STR-31004', 'Mumbai', 19.2307, 72.8567, 'normal', 'weekly',    9,    2],
  ['st-mum-5', 'Apna Bazaar - Dadar',               'STR-31005', 'Mumbai', 19.0178, 72.8478, 'low',    'monthly',   10,   null],
  ['st-mum-6', 'Spar Hypermarket - Bandra',         'STR-31006', 'Mumbai', 19.0596, 72.8295, 'high',   'monthly',   14,   null],
  // Delhi
  ['st-del-1', 'Star Market - Select Citywalk',     'STR-32001', 'Delhi', 28.5286, 77.2193, 'high',   'weekly',    8,    1],
  ['st-del-2', 'Big Bazaar - Rajouri Garden',       'STR-32002', 'Delhi', 28.6492, 77.1219, 'normal', 'bi_weekly', 22,   null],
  ['st-del-3', 'Easyday - Lajpat Nagar',            'STR-32003', 'Delhi', 28.5677, 77.2433, 'normal', 'weekly',    2,    null],
  ['st-del-4', "Spencer's - Connaught Place",       'STR-32004', 'Delhi', 28.6315, 77.2167, 'normal', 'monthly',   null, null],
  ['st-del-5', 'Reliance Fresh - Dwarka',           'STR-32005', 'Delhi', 28.5921, 77.0460, 'low',    'bi_weekly', 30,   null],
  ['st-del-6', 'Maharaja Bazaar - Karol Bagh',      'STR-32006', 'Delhi', 28.6519, 77.1909, 'high',   'weekly',    9,    1],
  // Hyderabad
  ['st-hyd-1', 'Reliance Fresh - Banjara Hills',    'STR-33001', 'Hyderabad', 17.4126, 78.4482, 'high',   'weekly',    8,    3],
  ['st-hyd-2', 'Heritage Fresh - Madhapur',         'STR-33002', 'Hyderabad', 17.4486, 78.3908, 'normal', 'bi_weekly', 17,   null],
  ['st-hyd-3', 'Ratnadeep - Kukatpally',            'STR-33003', 'Hyderabad', 17.4948, 78.3996, 'normal', 'monthly',   4,    null],
  // Pune
  ['st-pun-1', 'Vinayak Traders - Kothrud',         'STR-34001', 'Pune', 18.5074, 73.8077, 'high',   'bi_weekly', 16,   null],
  ['st-pun-2', 'D-Mart - Wakad',                    'STR-34002', 'Pune', 18.5989, 73.7606, 'normal', 'weekly',    7,    null],
  ['st-pun-3', 'Kumar Supermarket - Camp',          'STR-34003', 'Pune', 18.5144, 73.8788, 'low',    'monthly',   null, null],
  // Not yet geo-tagged — counted as "skipped (no coordinates)" like a real account.
  ['st-blr-x', 'Sai Provisions - Bangalore (no GPS)', 'STR-39001', 'Bangalore', null, null, 'normal', 'weekly', null, null],
  ['st-mum-x', 'Gupta Kirana - Mumbai (no GPS)',     'STR-39002', 'Mumbai',    null, null, 'normal', 'weekly', null, null],
];
const OUTLETS: DemoOutlet[] = OUTLET_ROWS.map(([id, name, code, city, lat, lng, priority, frequency, lastVisitDays, preferredDay]) => ({
  id, name, code, city, lat, lng, priority, frequency, lastVisitDays, preferredDay,
}));

interface DueOutlet {
  store_id: string; store_name: string; store_code: string; lat: number; lng: number; city: string;
  reason: 'overdue' | 'high_priority'; priority: string; frequency: string;
  overdue_days: number | null; never_visited: boolean; preferred_day: number | null; score: number;
}

/** Outlets due on the plan date: overdue against their cadence, or high priority. */
function dueOutlets(): { pool: DueOutlet[]; considered: number; skippedNoGeo: number } {
  const pool: DueOutlet[] = [];
  let skippedNoGeo = 0;
  for (const o of OUTLETS) {
    const cadence = FREQ_DAYS[o.frequency] ?? 7;
    const never = o.lastVisitDays == null;
    const overdue = never || (o.lastVisitDays as number) >= cadence;
    const high = o.priority === 'high';
    if (!overdue && !high) continue;
    if (o.lat == null || o.lng == null) { skippedNoGeo++; continue; }
    const overdueDays = never ? null : Math.max(0, (o.lastVisitDays as number) - cadence);
    const score = (high ? 50 : o.priority === 'normal' ? 10 : 0) + (never ? 30 : 0) + Math.min(overdueDays ?? 0, 30) * 2;
    pool.push({
      store_id: o.id, store_name: o.name, store_code: o.code, lat: o.lat, lng: o.lng, city: o.city,
      reason: overdue ? 'overdue' : 'high_priority', priority: o.priority, frequency: o.frequency,
      overdue_days: overdueDays, never_visited: never, preferred_day: o.preferredDay, score,
    });
  }
  pool.sort((a, b) => b.score - a.score || a.store_name.localeCompare(b.store_name));
  return { pool, considered: OUTLETS.length, skippedNoGeo };
}

// ── Field executives ──────────────────────────────────────────────────────────
export interface DemoUser { id: string; name: string; role?: string; city?: string; employee_id?: string; mobile?: string; zones?: { name?: string } | null }

const CITY_CENTRES: Record<string, Pt> = {
  bangalore: { lat: 12.9716, lng: 77.5946 }, bengaluru: { lat: 12.9716, lng: 77.5946 },
  mumbai: { lat: 19.0760, lng: 72.8777 }, delhi: { lat: 28.6139, lng: 77.2090 },
  hyderabad: { lat: 17.3850, lng: 78.4867 }, pune: { lat: 18.5204, lng: 73.8567 },
};
const centreFor = (city?: string): Pt => CITY_CENTRES[String(city || '').trim().toLowerCase()] ?? CITY_CENTRES.bangalore;
const ADMIN_ROLES = new Set(['admin', 'super_admin', 'main_admin', 'sub_admin', 'client']);

interface FeInfo {
  user_id: string; name: string; cities: string[];
  has_live: boolean; base: Pt | null; last_capture: (Pt & { at: string }) | null;
  start: Pt | null; start_source: 'live_location' | 'base_location' | 'last_capture' | 'zone_meeting' | 'none';
}

/** Each rep's location readiness. The demo team deliberately shows every state a
 *  real account does: live GPS, a manager-set base, only a last known fix, and a
 *  rep with no location at all. */
function loadFes(users: DemoUser[]): FeInfo[] {
  const eligible = users.filter((u) => !ADMIN_ROLES.has(String(u.role || '').toLowerCase()));
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  return eligible.map((u, idx) => {
    const c = centreFor(u.city);
    const profile = idx % 5; // 0 live · 1 base · 2 live · 3 last known · 4 none
    const live = profile === 0 || profile === 2;
    const jitter = (k: number): Pt => ({ lat: round(c.lat + 0.012 * k, 5), lng: round(c.lng - 0.009 * k, 5) });
    const override = baseOverrides.get(u.id) ?? null;
    const base: Pt | null = override ?? (profile === 1 ? jitter(1) : null);
    const last_capture = profile === 3 || live ? { ...jitter(profile === 3 ? 2 : 0), at: hoursAgo(profile === 3 ? 26 : 1) } : null;
    let start: Pt | null = null;
    let start_source: FeInfo['start_source'] = 'none';
    if (live && last_capture) { start = { lat: last_capture.lat, lng: last_capture.lng }; start_source = 'live_location'; }
    else if (base) { start = base; start_source = 'base_location'; }
    else if (last_capture) { start = { lat: last_capture.lat, lng: last_capture.lng }; start_source = 'last_capture'; }
    return {
      user_id: u.id, name: u.name || 'Field executive',
      cities: [String(u.city || '').trim().toLowerCase()].filter(Boolean),
      has_live: live, base, last_capture, start, start_source,
    };
  });
}

export function listDemoFieldExecs(users: DemoUser[]) {
  return loadFes(users).map((e) => ({
    user_id: e.user_id, name: e.name, start_source: e.start_source,
    has_location: e.start_source !== 'none', has_live: e.has_live,
    base: e.base, last_capture: e.last_capture, cities: e.cities,
  }));
}

export function setDemoFieldExecBase(users: DemoUser[], body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const uid = String(b.user_id || '');
  const fe = loadFes(users).find((f) => f.user_id === uid);
  if (!fe) throw new Error('User not found in your organisation');
  if (b.use_last_capture === true) {
    if (!fe.last_capture) throw new Error('No last captured location for this user');
    baseOverrides.set(uid, { lat: fe.last_capture.lat, lng: fe.last_capture.lng });
  } else {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error('lat and lng must be valid coordinates');
    }
    baseOverrides.set(uid, { lat, lng });
  }
  return { user_id: uid, base: baseOverrides.get(uid) };
}

// ── The engine ────────────────────────────────────────────────────────────────
export interface DraftStop {
  store_id: string; store_name: string; store_code: string; visit_order: number;
  reason: string; priority: string; lat: number; lng: number;
}
export interface FeDraft {
  user_id: string; user_name: string; total_km: number; est_co2_kg: number;
  start_source: string; stops: DraftStop[];
}
export interface TeamPlanResult {
  method: string; plan_date: string; vehicle_type: string; fes: FeDraft[];
  summary: {
    fe_count: number; considered: number; due_pool: number; assigned_outlets: number;
    unassigned_outlets: number; skipped_no_geo: number; skipped_already_planned: number; cap_per_fe: number;
  };
}

export interface TeamPlanOptions { plan_date?: string; method?: unknown; params?: Record<string, unknown> }

const weekdayOf = (iso: string): number => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().getDay() : d.getDay();
};
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Greedy nearest-neighbour order from a start point. */
function orderStops(start: Pt | null, stops: DueOutlet[]): DueOutlet[] {
  const left = stops.slice();
  const out: DueOutlet[] = [];
  let cur: Pt | null = start ?? (left[0] ? { lat: left[0].lat, lng: left[0].lng } : null);
  while (left.length && cur) {
    let bi = 0, bd = Infinity;
    left.forEach((s, i) => { const d = haversineKm(cur as Pt, s); if (d < bd) { bd = d; bi = i; } });
    const [nx] = left.splice(bi, 1);
    out.push(nx);
    cur = { lat: nx.lat, lng: nx.lng };
  }
  return out;
}

/** Merge request overrides over the saved policy → the effective method + params. */
export function effectivePolicy(opts: TeamPlanOptions): AutoPlanPolicy {
  return normalizePolicy({
    method: opts.method ?? savedPolicy.method,
    params: { ...savedPolicy.params, ...(opts.params || {}) },
    schedule: savedPolicy.schedule,
  });
}

export function buildDemoTeamPlan(users: DemoUser[], opts: TeamPlanOptions): TeamPlanResult {
  const eff = effectivePolicy(opts);
  const planDate = opts.plan_date || todayIso();
  const cap = eff.params.max_outlets_per_fe;
  const radius = eff.params.max_radius_km;
  const factor = DEMO_VEHICLE_FACTORS[eff.params.vehicle_type] ?? 0;

  const fes = loadFes(users);
  const { pool: fullPool, considered, skippedNoGeo } = dueOutlets();
  let pool = fullPool;
  if (eff.method === 'recurring_pjp') {
    const wd = weekdayOf(planDate);
    pool = pool.filter((o) => o.preferred_day == null || o.preferred_day === wd);
  }

  const load = new Map<string, DueOutlet[]>(fes.map((f) => [f.user_id, []]));
  const room = (f: FeInfo) => (load.get(f.user_id) as DueOutlet[]).length < cap;
  const leastLoaded = (cands: FeInfo[]): FeInfo | null => {
    const open = cands.filter(room);
    if (!open.length) return null;
    return open.reduce((a, b) => ((load.get(b.user_id) as DueOutlet[]).length < (load.get(a.user_id) as DueOutlet[]).length ? b : a));
  };
  const place = (o: DueOutlet, f: FeInfo | null): boolean => {
    if (!f) return false;
    (load.get(f.user_id) as DueOutlet[]).push(o);
    return true;
  };
  const dist = (f: FeInfo, o: DueOutlet) => (f.start ? haversineKm(f.start, o) : Infinity);
  let unassigned = 0;

  if (fes.length) {
    switch (eff.method) {
      case 'cadence_priority': {
        // Most urgent first, dealt round-robin so every rep gets a fair share.
        pool.forEach((o, i) => {
          for (let k = 0; k < fes.length; k++) {
            const f = fes[(i + k) % fes.length];
            if (room(f)) { place(o, f); return; }
          }
          unassigned++;
        });
        break;
      }
      case 'territory':
      case 'recurring_pjp': {
        for (const o of pool) {
          const owners = fes.filter((f) => f.cities.includes(o.city.toLowerCase()));
          if (!place(o, leastLoaded(owners) ?? leastLoaded(fes))) unassigned++;
        }
        break;
      }
      case 'geo_cluster': {
        // Farthest-point seeds → nearest-seed clusters → each cluster to its nearest rep.
        const k = Math.min(fes.length, pool.length);
        const seeds: DueOutlet[] = pool.length ? [pool[0]] : [];
        while (seeds.length < k) {
          let best: DueOutlet | null = null, bd = -1;
          for (const o of pool) {
            const d = Math.min(...seeds.map((s) => haversineKm(s, o)));
            if (d > bd) { bd = d; best = o; }
          }
          if (!best) break;
          seeds.push(best);
        }
        const clusters = seeds.map(() => [] as DueOutlet[]);
        for (const o of pool) {
          let bi = 0, bd = Infinity;
          seeds.forEach((s, i) => { const d = haversineKm(s, o); if (d < bd) { bd = d; bi = i; } });
          clusters[bi].push(o);
        }
        const centroid = (c: DueOutlet[]): Pt => ({ lat: c.reduce((n, o) => n + o.lat, 0) / c.length, lng: c.reduce((n, o) => n + o.lng, 0) / c.length });
        // Pair clusters with reps closest-first (a rep with no start point is the
        // last resort), so each cluster lands on the rep nearest to it.
        const pairs: Array<{ ci: number; f: FeInfo; d: number }> = [];
        clusters.forEach((c, ci) => {
          if (!c.length) return;
          const cen = centroid(c);
          fes.forEach((f) => pairs.push({ ci, f, d: f.start ? haversineKm(f.start, cen) : 1e9 }));
        });
        pairs.sort((x, y) => x.d - y.d || x.ci - y.ci);
        const usedC = new Set<number>(), usedF = new Set<string>();
        for (const { ci, f } of pairs) {
          if (usedC.has(ci) || usedF.has(f.user_id)) continue;
          usedC.add(ci); usedF.add(f.user_id);
          for (const o of clusters[ci]) if (!place(o, room(f) ? f : null)) unassigned++;
        }
        break;
      }
      case 'nearest_fe': {
        for (const o of pool) {
          const cands = fes.filter((f) => f.start && room(f) && dist(f, o) <= radius);
          const best = cands.length ? cands.reduce((a, b) => (dist(b, o) < dist(a, o) ? b : a)) : null;
          if (!place(o, best)) unassigned++;
        }
        break;
      }
      case 'balanced_workload': {
        const avg = Math.max(1, Math.ceil(pool.length / fes.length));
        for (const o of pool) {
          const under = fes.filter((f) => room(f) && (load.get(f.user_id) as DueOutlet[]).length < avg);
          const near = under.filter((f) => f.start && dist(f, o) <= radius);
          const best = near.length ? near.reduce((a, b) => (dist(b, o) < dist(a, o) ? b : a)) : leastLoaded(under.length ? under : fes);
          if (!place(o, best)) unassigned++;
        }
        break;
      }
      default:
        unassigned = pool.length; // 'manual' — nothing is auto-assigned
    }
  } else {
    unassigned = pool.length;
  }

  const drafts: FeDraft[] = fes.map((f) => {
    const stops = orderStops(f.start, load.get(f.user_id) as DueOutlet[]);
    const begin: Pt | null = f.start ?? (stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : null);
    let km = 0, prev = begin;
    for (const s of stops) { if (prev) km += haversineKm(prev, s); prev = s; }
    const total_km = round(km * ROAD_FACTOR, 1);
    return {
      user_id: f.user_id, user_name: f.name, total_km, est_co2_kg: round(total_km * factor, 2),
      start_source: f.start ? f.start_source : 'first_outlet',
      stops: stops.map((s, i) => ({
        store_id: s.store_id, store_name: s.store_name, store_code: s.store_code, visit_order: i + 1,
        reason: s.reason, priority: s.priority, lat: s.lat, lng: s.lng,
      })),
    };
  });

  const assigned = drafts.reduce((n, d) => n + d.stops.length, 0);
  return {
    method: eff.method, plan_date: planDate, vehicle_type: eff.params.vehicle_type,
    fes: drafts,
    summary: {
      fe_count: fes.length, considered, due_pool: pool.length, assigned_outlets: assigned,
      unassigned_outlets: Math.max(0, pool.length - assigned), skipped_no_geo: skippedNoGeo,
      skipped_already_planned: 0, cap_per_fe: cap,
    },
  };
}

/** POST /autoplan/run — generate AND assign. Idempotent per date: this date's
 *  earlier auto-assigned plans for the same reps are replaced; manual plans stay. */
export function runDemoTeamPlan(
  plans: Array<Record<string, any>>, // eslint-disable-line @typescript-eslint/no-explicit-any
  users: DemoUser[],
  opts: TeamPlanOptions,
) {
  const eff = effectivePolicy(opts);
  if (eff.method === 'manual') {
    throw new Error('The active method is "Manual only" — pick an automatic method to auto-assign, or add plans by hand.');
  }
  const result = buildDemoTeamPlan(users, opts);
  const drafts = result.fes.filter((f) => f.stops.length);
  if (!drafts.length) {
    throw new Error('No outlets are due for this date — set visit cadence / priority in Outlet Priorities first, or check that field executives have coordinates.');
  }

  const feIds = new Set(drafts.map((d) => d.user_id));
  let replaced = 0;
  for (let i = plans.length - 1; i >= 0; i--) {
    const p = plans[i];
    if (p.plan_date === result.plan_date && feIds.has(String(p.user_id)) && String(p.notes || '').startsWith(AUTO_NOTE_PREFIX)) {
      plans.splice(i, 1); replaced++;
    }
  }

  const label = DEMO_AUTOPLAN_METHODS.find((m) => m.id === eff.method)?.label || eff.method;
  const created: Array<{ user_id: string; plan_id: string; outlets: number; total_km: number }> = [];
  const stamp = Date.now();
  drafts.forEach((d, i) => {
    const u = users.find((x) => x.id === d.user_id);
    const id = `demo-plan-auto-${stamp}-${i}`;
    plans.unshift({
      id, user_id: d.user_id, plan_date: result.plan_date,
      total_outlets: d.stops.length, visited_outlets: 0, missed_outlets: 0, completion_pct: 0,
      status: 'pending', notes: `${AUTO_NOTE_PREFIX} · ${label}`,
      frequency: 'daily', territory_label: `Auto Plan · ${label}`,
      fe_name: d.user_name, fe_employee_id: String(u?.employee_id ?? ''), fe_mobile: String(u?.mobile ?? ''),
      zone_name: String(u?.zones?.name ?? ''), city_name: String(u?.city ?? ''),
      vehicle_type: result.vehicle_type, co2_kg_planned: d.est_co2_kg, co2_kg_actual: 0,
      outlets: d.stops.map((s) => ({
        id: `${id}-stop-${s.visit_order}`, visit_order: s.visit_order, target_type: 'general', status: 'pending',
        planned_duration_min: 25, store_id: s.store_id, store_name: s.store_name, store_code: s.store_code,
        store_lat: s.lat, store_lng: s.lng, zone_name: String(u?.zones?.name ?? ''),
      })),
    });
    created.push({ user_id: d.user_id, plan_id: id, outlets: d.stops.length, total_km: d.total_km });
  });

  return {
    method: eff.method, plan_date: result.plan_date, vehicle_type: result.vehicle_type,
    replaced, plans_created: created.length, plans: created, summary: result.summary, fes: result.fes,
  };
}
