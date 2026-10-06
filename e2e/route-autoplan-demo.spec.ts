import { test, expect } from '@playwright/test';
import {
  DEMO_AUTOPLAN_METHODS, DEMO_VEHICLE_TYPES, DEMO_VEHICLE_FACTORS, normalizePolicy,
  getDemoPolicy, setDemoPolicy, resetDemoAutoPlan, listDemoFieldExecs, setDemoFieldExecBase,
  buildDemoTeamPlan, runDemoTeamPlan, haversineKm, type DemoUser,
} from '../src/lib/demo/routeAutoplanDemo';

/**
 * The demo account's Automated Route Plans engine (pure, no browser): it must
 * offer everything a real account does — all seven methods, all eight vehicle
 * types, the same policy rules — and each method must actually assign
 * differently and obey the caps, radius and cadence a real run would.
 */
const USERS: DemoUser[] = [
  { id: 'u1', name: 'Arjun Sharma', role: 'executive', city: 'Bangalore', employee_id: 'KIN-001', zones: { name: 'Bangalore North' } },
  { id: 'u2', name: 'Priya Patel',  role: 'executive', city: 'Mumbai',    employee_id: 'KIN-002', zones: { name: 'Mumbai West' } },
  { id: 'u3', name: 'Rahul Verma',  role: 'executive', city: 'Delhi',     employee_id: 'KIN-003', zones: { name: 'Delhi Central' } },
  { id: 'u4', name: 'Sneha Rao',    role: 'supervisor', city: 'Hyderabad', employee_id: 'KIN-004', zones: { name: 'Hyderabad East' } },
  { id: 'u5', name: 'Amit Singh',   role: 'executive', city: 'Pune',      employee_id: 'KIN-005', zones: { name: 'Pune Central' } },
];
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';
const AUTOMATIC = DEMO_AUTOPLAN_METHODS.filter((m) => m.automatic).map((m) => m.id);

test.beforeEach(() => resetDemoAutoPlan());

test.describe('catalog', () => {
  test('offers all seven methods, and only "manual" is non-automatic', () => {
    expect(DEMO_AUTOPLAN_METHODS.map((m) => m.id)).toEqual([
      'cadence_priority', 'territory', 'geo_cluster', 'nearest_fe', 'balanced_workload', 'recurring_pjp', 'manual',
    ]);
    expect(DEMO_AUTOPLAN_METHODS.filter((m) => !m.automatic).map((m) => m.id)).toEqual(['manual']);
    for (const m of DEMO_AUTOPLAN_METHODS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.tagline.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(20);
    }
  });

  test('only the radius-based methods use the max-radius control', () => {
    const usesRadius = DEMO_AUTOPLAN_METHODS.filter((m) => m.uses.includes('max_radius_km')).map((m) => m.id);
    expect(usesRadius).toEqual(['nearest_fe', 'balanced_workload']);
  });

  test('offers all eight vehicle types, including walking (zero emissions)', () => {
    expect(DEMO_VEHICLE_TYPES).toEqual(['2w_petrol', '2w_ev', '4w_petrol', '4w_diesel', '4w_ev', 'public_bus', 'auto_rickshaw', 'walking']);
    expect(DEMO_VEHICLE_FACTORS.walking).toBe(0);
  });
});

test.describe('policy', () => {
  test('is coerced into valid ranges, like the real backend', () => {
    expect(normalizePolicy({ method: 'nope' }).method).toBe('cadence_priority');
    expect(normalizePolicy({ params: { max_outlets_per_fe: 0 } }).params.max_outlets_per_fe).toBe(1);
    expect(normalizePolicy({ params: { max_outlets_per_fe: 999 } }).params.max_outlets_per_fe).toBe(50);
    expect(normalizePolicy({ params: { max_radius_km: 9999 } }).params.max_radius_km).toBe(500);
    expect(normalizePolicy({ params: { max_radius_km: -3 } }).params.max_radius_km).toBe(25);
    expect(normalizePolicy({ params: { vehicle_type: 'jetpack' } }).params.vehicle_type).toBe('2w_petrol');
    expect(normalizePolicy({ schedule: { time: '25:99' } }).schedule.time).toBe('06:00');
  });

  test('starts on Cadence & priority, saves, and rejects an unknown method', () => {
    expect(getDemoPolicy().method).toBe('cadence_priority');
    expect(getDemoPolicy().updated_at).toBeNull();
    const saved = setDemoPolicy({ method: 'territory', params: { max_outlets_per_fe: 8, vehicle_type: '4w_ev', max_radius_km: 40 } });
    expect(saved.method).toBe('territory');
    expect(getDemoPolicy()).toMatchObject({ method: 'territory', params: { max_outlets_per_fe: 8, vehicle_type: '4w_ev', max_radius_km: 40 } });
    expect(getDemoPolicy().updated_at).not.toBeNull();
    expect(() => setDemoPolicy({ method: 'telepathy' })).toThrow(/method must be one of/);
  });

  test('a saved method is used by a preview that names no method', () => {
    setDemoPolicy({ method: 'territory' });
    expect(buildDemoTeamPlan(USERS, { plan_date: MONDAY }).method).toBe('territory');
  });
});

test.describe('every automatic method', () => {
  for (const method of AUTOMATIC) {
    test(`${method}: assigns each due outlet at most once, within the cap, in visit order`, () => {
      const r = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method, params: { max_outlets_per_fe: 15 } });
      const ids = r.fes.flatMap((f) => f.stops.map((s) => s.store_id));
      expect(new Set(ids).size).toBe(ids.length);                                   // never twice
      expect(r.summary.assigned_outlets + r.summary.unassigned_outlets).toBe(r.summary.due_pool);
      expect(r.summary.assigned_outlets).toBe(ids.length);
      expect(r.summary.assigned_outlets).toBeGreaterThan(0);
      expect(r.summary.skipped_no_geo).toBe(2);                                      // two outlets have no GPS
      for (const f of r.fes) {
        expect(f.stops.length).toBeLessThanOrEqual(15);
        expect(f.stops.map((s) => s.visit_order)).toEqual(f.stops.map((_, i) => i + 1));
      }
      expect(r.fes).toHaveLength(5);
    });

    test(`${method}: honours a tight per-rep cap`, () => {
      const r = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method, params: { max_outlets_per_fe: 2 } });
      for (const f of r.fes) expect(f.stops.length).toBeLessThanOrEqual(2);
      expect(r.summary.cap_per_fe).toBe(2);
      expect(r.summary.unassigned_outlets).toBeGreaterThan(0);
    });
  }

  test('is deterministic', () => {
    for (const method of AUTOMATIC) {
      const a = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method });
      const b = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method });
      expect(b).toEqual(a);
    }
  });

  test('the methods really differ from one another', () => {
    const sig = (m: string) => JSON.stringify(buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: m }).fes.map((f) => f.stops.map((s) => s.store_id)));
    const sigs = new Set(AUTOMATIC.filter((m) => m !== 'recurring_pjp').map(sig));
    expect(sigs.size).toBeGreaterThanOrEqual(4);
  });
});

test.describe('method behaviour', () => {
  const byUser = (m: string, params: Record<string, unknown> = {}, date = MONDAY) =>
    Object.fromEntries(buildDemoTeamPlan(USERS, { plan_date: date, method: m, params: { max_outlets_per_fe: 50, ...params } }).fes.map((f) => [f.user_id, f]));

  test('Cadence & priority shares the work evenly (within one stop)', () => {
    const counts = Object.values(byUser('cadence_priority', { max_outlets_per_fe: 50 })).map((f) => f.stops.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  test('Territory gives each city to the rep who covers it', () => {
    const r = byUser('territory');
    const names = (uid: string) => r[uid].stops.map((s) => s.store_name);
    expect(names('u2').every((n) => /Andheri|Phoenix|Powai|Borivali|Dadar|Bandra/.test(n))).toBe(true);   // Mumbai rep: Mumbai outlets
    expect(names('u2').length).toBeGreaterThan(0);
    expect(names('u5').every((n) => /Kothrud|Wakad|Camp/.test(n))).toBe(true);                            // Pune rep
    expect(names('u1').every((n) => !/Andheri|Wakad|Kothrud/.test(n))).toBe(true);
  });

  test('Nearest field executive never goes beyond the max radius', () => {
    const tight = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'nearest_fe', params: { max_outlets_per_fe: 50, max_radius_km: 6 } });
    const wide = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'nearest_fe', params: { max_outlets_per_fe: 50, max_radius_km: 500 } });
    expect(tight.summary.assigned_outlets).toBeLessThan(wide.summary.assigned_outlets);
    const starts = new Map(listDemoFieldExecs(USERS).map((e) => [e.user_id, e]));
    for (const f of tight.fes) {
      // Every stop must be within 6 km (straight line) of the rep's own start point.
      const fe = starts.get(f.user_id)!;
      const start = fe.has_live ? fe.last_capture : (fe.base ?? fe.last_capture);
      for (const s of f.stops) expect(haversineKm(start!, s)).toBeLessThanOrEqual(6.0001);
    }
  });

  test('Balanced workload never gives a rep more than the average share', () => {
    const r = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'balanced_workload', params: { max_outlets_per_fe: 50 } });
    const max = Math.max(...r.fes.map((f) => f.stops.length));
    expect(max).toBeLessThanOrEqual(Math.ceil(r.summary.due_pool / r.fes.length));
  });

  test('Recurring journey plan only schedules outlets whose preferred day matches the weekday', () => {
    const ids = (date: string) => Object.values(byUser('recurring_pjp', {}, date)).flatMap((f) => f.stops.map((s) => s.store_id));
    const mon = ids(MONDAY), tue = ids(TUESDAY);
    expect(mon).toContain('st-blr-1');      // prefers Monday
    expect(mon).not.toContain('st-blr-4');  // prefers Tuesday
    expect(mon).not.toContain('st-mum-1');  // prefers Wednesday
    expect(tue).toContain('st-blr-4');
    expect(tue).not.toContain('st-blr-1');
    // outlets with no preferred day are scheduled on any day
    expect(mon).toContain('st-blr-5');
    expect(tue).toContain('st-blr-5');
  });

  test('Manual only assigns nothing, and cannot be run', () => {
    const p = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'manual' });
    expect(p.summary.assigned_outlets).toBe(0);
    expect(() => runDemoTeamPlan([], USERS, { plan_date: MONDAY, method: 'manual' })).toThrow(/Manual only/);
  });

  test('distance and CO₂ follow the chosen vehicle (walking emits nothing)', () => {
    const petrol = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'geo_cluster', params: { vehicle_type: '4w_diesel' } });
    const walk = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'geo_cluster', params: { vehicle_type: 'walking' } });
    expect(petrol.vehicle_type).toBe('4w_diesel');
    expect(petrol.fes.reduce((n, f) => n + f.est_co2_kg, 0)).toBeGreaterThan(0);
    expect(walk.fes.every((f) => f.est_co2_kg === 0)).toBe(true);
    expect(walk.fes.some((f) => f.total_km > 0)).toBe(true);
    for (const f of petrol.fes) expect(f.est_co2_kg).toBeCloseTo(f.total_km * DEMO_VEHICLE_FACTORS['4w_diesel'], 1);
  });
});

test.describe('field executive locations', () => {
  test('shows every readiness state a real account does, and flags the rep with none', () => {
    const fes = listDemoFieldExecs(USERS);
    expect(fes).toHaveLength(5);
    expect(new Set(fes.map((f) => f.start_source))).toEqual(new Set(['live_location', 'base_location', 'last_capture', 'none']));
    expect(fes.filter((f) => !f.has_location)).toHaveLength(1);
  });

  test('a manager can set a base for the rep with no location, or use their last known fix', () => {
    const none = listDemoFieldExecs(USERS).find((f) => !f.has_location)!;
    setDemoFieldExecBase(USERS, { user_id: none.user_id, lat: 18.52, lng: 73.85 });
    const after = listDemoFieldExecs(USERS).find((f) => f.user_id === none.user_id)!;
    expect(after.start_source).toBe('base_location');
    expect(after.has_location).toBe(true);

    const last = listDemoFieldExecs(USERS).find((f) => f.start_source === 'last_capture')!;
    setDemoFieldExecBase(USERS, { user_id: last.user_id, use_last_capture: true });
    expect(listDemoFieldExecs(USERS).find((f) => f.user_id === last.user_id)!.start_source).toBe('base_location');
  });

  test('rejects bad input', () => {
    expect(() => setDemoFieldExecBase(USERS, { user_id: 'ghost', lat: 1, lng: 1 })).toThrow(/not found/i);
    expect(() => setDemoFieldExecBase(USERS, { user_id: 'u1', lat: 999, lng: 1 })).toThrow(/valid coordinates/);
    const none = listDemoFieldExecs(USERS).find((f) => !f.has_location)!;
    expect(() => setDemoFieldExecBase(USERS, { user_id: none.user_id, use_last_capture: true })).toThrow(/No last captured location/);
  });

  test('a rep with a base and no live fix starts from that base in the next plan', () => {
    const none = listDemoFieldExecs(USERS).find((f) => !f.has_location)!;
    expect(buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'geo_cluster' }).fes.find((f) => f.user_id === none.user_id)!.start_source).toBe('first_outlet');
    setDemoFieldExecBase(USERS, { user_id: none.user_id, lat: 18.52, lng: 73.85 });
    expect(buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'geo_cluster' }).fes.find((f) => f.user_id === none.user_id)!.start_source).toBe('base_location');
  });

  test('administrators are never treated as field executives', () => {
    const withAdmin = [...USERS, { id: 'adm', name: 'Boss', role: 'admin', city: 'Delhi' }];
    expect(listDemoFieldExecs(withAdmin).some((f) => f.user_id === 'adm')).toBe(false);
  });
});

test.describe('Generate & assign', () => {
  test('creates one pending plan per rep with stops, and tags it as auto-assigned', () => {
    const plans: Array<Record<string, unknown>> = [];
    const r = runDemoTeamPlan(plans, USERS, { plan_date: MONDAY, method: 'territory' });
    expect(r.plans_created).toBe(plans.length);
    expect(r.replaced).toBe(0);
    for (const p of plans) {
      expect(p.plan_date).toBe(MONDAY);
      expect(p.status).toBe('pending');
      expect(String(p.notes)).toMatch(/^Auto-assigned · Territory \/ beat$/);
      expect((p.outlets as unknown[]).length).toBe(p.total_outlets);
    }
  });

  test('running again replaces that date\'s auto plans but never touches manual ones', () => {
    const manual = { id: 'manual-1', user_id: 'u1', plan_date: MONDAY, notes: 'Built by hand', outlets: [] };
    const otherDay = { id: 'old-1', user_id: 'u1', plan_date: TUESDAY, notes: 'Auto-assigned · Territory / beat', outlets: [] };
    const plans: Array<Record<string, unknown>> = [manual, otherDay];
    const first = runDemoTeamPlan(plans, USERS, { plan_date: MONDAY, method: 'territory' });
    const total = plans.length;
    const second = runDemoTeamPlan(plans, USERS, { plan_date: MONDAY, method: 'geo_cluster' });
    expect(second.replaced).toBe(first.plans_created);
    expect(plans.length).toBe(total);                    // swapped, not stacked
    expect(plans).toContain(manual);
    expect(plans).toContain(otherDay);
  });

  test('says so when nothing is due', () => {
    expect(() => runDemoTeamPlan([], [], { plan_date: MONDAY, method: 'territory' })).toThrow(/No outlets are due/);
  });
});

test.describe('Geographic clusters', () => {
  test('hands each cluster to the rep nearest to it', () => {
    const r = buildDemoTeamPlan(USERS, { plan_date: MONDAY, method: 'geo_cluster', params: { max_outlets_per_fe: 50 } });
    const names = (uid: string) => r.fes.find((f) => f.user_id === uid)!.stops.map((s) => s.store_name).join('|');
    expect(names('u1')).toMatch(/Koramangala/);                // Bangalore rep ← Bangalore cluster
    expect(names('u2')).toMatch(/Andheri/);                    // Mumbai rep ← Mumbai cluster
    expect(names('u3')).toMatch(/Connaught Place/);            // Delhi rep ← Delhi cluster
    expect(names('u4')).toMatch(/Banjara Hills|Madhapur/);     // Hyderabad rep ← Hyderabad cluster
    expect(names('u5')).toMatch(/Kothrud|Wakad/);              // Pune rep (no GPS fix yet) still gets the Pune cluster
    expect(names('u4')).not.toMatch(/Kothrud|Wakad/);
  });
});
