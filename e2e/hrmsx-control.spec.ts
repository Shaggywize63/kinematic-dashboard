import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { buildBreakup, buildEcr } from '../src/lib/hrms/engine';
import { ESI, PF, HRA_METROS, valueOn, monthEnd } from '../src/lib/hrms/rules';
import { addDays } from '../src/lib/hrms/format';
import {
  cleanCopy, defaultInput, hasEsi, runScenario, simFromMonths, slipsForMonth, summaryText, totalsOf, validateInput, withCeilingOverride, wageRuleStats,
} from '../src/lib/hrms/control/simulate';
import { RADAR_REF_MONTH, buildComplianceTask, buildRadarItems, computeImpacts, effectiveWithin, sortFeed, suggestedTaskDue, validateTaskDue } from '../src/lib/hrms/control/radar';
import {
  LATE_NOTE, autopilotSummary, calendarWeeks, dueLabel, prepareArtefact, readinessFor, taskKind, taskStatus,
} from '../src/lib/hrms/control/autopilot';
import {
  DEFAULT_WINDOW_DAYS, consentCoverage, coveredPeople, noticeText, policyWindow, retentionFlags, validateTurnOn, monitoringCounts, canTurnOn,
} from '../src/lib/hrms/control/monitoring';
import { seedControl } from '../src/lib/hrms/control/seed';
import type { ScenarioInput } from '../src/lib/hrms/control/types';

/**
 * Control pages of the HRMS preview: What-if simulator, Rule radar, Compliance autopilot and Monitoring ledger.
 * Pure-logic tests first (no browser), then UI tests per page. The browser starts from the seeded sample data every time, so
 * expected figures are worked out here from the same seed and the engine, not typed in.
 */

const nav = { timeout: 45_000 };
test.setTimeout(150_000);
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

/** Collect uncaught page errors and console errors (React hydration problems show up as console errors). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
async function noOverflowAt390(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${label} overflows by ${over}px at 390px`).toBeLessThanOrEqual(1);
}
async function tab(page: Page, name: RegExp | string) { await page.getByRole('tab', { name }).click(); }
const fresh = () => makeSeed();

// ═══════════════════════════════════ simulator: pure logic ═══════════════════════════════════
test.describe('simulator logic', () => {
  test('an increment changes only the people in scope, and never touches the real database', () => {
    const db = fresh();
    const before = JSON.stringify(db);
    const input: ScenarioInput = { type: 'increment', percent: 12, scope: 'department', scopeValue: 'dep_wh', fromMonth: '2026-12' };
    const r = runScenario(db, input);
    expect(JSON.stringify(db)).toBe(before);
    const wh = db.employees.filter((e) => e.departmentId === 'dep_wh' && e.status === 'active');
    expect(r.affected).toBe(wh.length);
    expect(r.after.employerCost).toBeGreaterThan(r.before.employerCost);
    expect(r.after.net).toBeGreaterThan(r.before.net);
    expect(r.people.every((p) => wh.some((e) => e.id === p.employeeId))).toBe(true);
    expect(r.title).toBe('12% increment for Warehouse, from Dec 2026');
  });

  test('a warehouse increment pushes the person nearest the ESI ceiling out of ESI', () => {
    const db = fresh();
    const r = runScenario(db, { type: 'increment', percent: 12, scope: 'department', scopeValue: 'dep_wh', fromMonth: '2026-12' });
    expect(r.esiMovedOut.map((p) => p.name)).toEqual(['Manoj Patil']);
    expect(r.esiMovedIn).toHaveLength(0);
    expect(r.after.esiCovered).toBe(r.before.esiCovered - 1);
    expect(r.insights.join(' ')).toMatch(/move.* out of ESI/);
  });

  test('a hypothetical ESI ceiling brings in everyone whose gross is under it, and the rules table is restored', () => {
    const db = fresh();
    const esiRows = ESI.ceiling.length;
    const r = runScenario(db, { type: 'statutory', rule: 'esi_ceiling', value: 30000, fromMonth: '2026-12' });
    expect(ESI.ceiling).toHaveLength(esiRows);
    expect(valueOn(ESI.ceiling, '2026-12-31')).toBe(21000);
    // Cross-check against the engine directly: people with gross between 21,000 and 30,000 in a standard December.
    const slips = slipsForMonth(cleanCopy(db), '2026-12');
    const expected = slips.filter((s) => s.gross > 21000 && s.gross <= 30000 && !hasEsi(s)).length;
    expect(expected).toBeGreaterThan(0);
    expect(r.esiMovedIn.length).toBeGreaterThanOrEqual(expected);
    expect(r.after.esi).toBeGreaterThan(r.before.esi);
    expect(r.avgTakeHomeChange).toBeLessThan(0);
    expect(r.rules.find((x) => x.key === 'esi_ceiling_what_if')).toMatchObject({ hypothetical: true, confidence: 'indicative' });
  });

  test('the ceiling override is removed even when the engine throws', () => {
    const rows = PF.ceiling.length;
    expect(() => withCeilingOverride('pf_ceiling', 99999, '2026-12', () => { throw new Error('boom'); })).toThrow('boom');
    expect(PF.ceiling).toHaveLength(rows);
    expect(valueOn(PF.ceiling, '2026-12-31')).toBe(25000);
    expect(withCeilingOverride('pf_ceiling', 40000, '2026-12', () => valueOn(PF.ceiling, '2026-12-31'))).toBe(40000);
  });

  test('hiring adds the planned people at the CTC, flagged as new, with the 50% rule applied', () => {
    const db = fresh();
    const input: ScenarioInput = { type: 'hiring', count: 4, designationId: 'des_fe', annualCtc: 360000, locationId: 'loc_del', structureId: 'str_field', fromMonth: '2026-12' };
    const r = runScenario(db, input);
    expect(r.after.headcount).toBe(r.before.headcount + 4);
    expect(r.newPeople).toBe(4);
    expect(r.people.every((p) => p.flags.includes('New hire') && p.beforeNet == null)).toBe(true);
    // Employer cost rises by about the CTC of each hire (a month of it), plus EDLI and admin on top.
    expect(r.after.employerCost - r.before.employerCost).toBeGreaterThanOrEqual(4 * Math.round(360000 / 12) - 4);
    expect(r.wageRule.failAfter - r.wageRule.failBefore).toBe(4);
    expect(r.insights.join(' ')).toMatch(/Every new hire fails the 50% wages rule/);
    expect(r.twelveDelta).toBeGreaterThan(12 * 4 * 29000);
  });

  test('a salary structure change moves who fails the 50% rule; PF stays put because payroll already adds wages back', () => {
    const db = fresh();
    const r = runScenario(db, { type: 'structure', structureId: 'str_field', basicPct: 50, pfOnActual: false, fromMonth: '2026-12' });
    expect(r.wageRule.failBefore).toBe(7);
    expect(r.wageRule.failAfter).toBe(0);
    expect(r.wageRule.addBackAfter).toBe(0);
    expect(r.after.pf).toBe(r.before.pf);
    expect(r.after.net).toBe(r.before.net);
    expect(r.insights.join(' ')).toMatch(/PF and take-home do not move/);
    // The original structure is untouched.
    expect(db.structures.find((s) => s.id === 'str_field')!.components.find((c) => c.code === 'BASIC')!.calc.value).toBe(35);
  });

  test('a structure that no longer fits the CTC is flagged, not presented as a saving', () => {
    const r = runScenario(fresh(), { type: 'structure', structureId: 'str_std', basicPct: 60, pfOnActual: false, fromMonth: '2026-12' });
    expect(r.misfit.after).toBeGreaterThan(r.misfit.before);
    expect(r.insights.join(' ')).toMatch(/not meaningful until the structure is fixed/);
  });

  test('the 12-month figure is the sum of twelve monthly differences', () => {
    const r = runScenario(fresh(), defaultInput(fresh(), 'increment'));
    expect(r.twelve).toHaveLength(12);
    expect(r.months[0]).toBe('2026-12');
    expect(r.months[11]).toBe('2027-11');
    expect(Math.round(r.twelve.reduce((t, m) => t + (m.after - m.before), 0))).toBe(Math.round(r.twelveDelta));
    // February carries a higher professional tax in Karnataka and Maharashtra (paid by staff), so net pay in February is lower.
    const feb = r.twelve.find((m) => m.month === '2027-02')!;
    const jan = r.twelve.find((m) => m.month === '2027-01')!;
    expect(feb.netBefore).toBeLessThan(jan.netBefore);
  });

  test('inputs are validated with plain messages', () => {
    const db = fresh();
    expect(validateInput(db, { type: 'increment', percent: 0, scope: 'all', scopeValue: '', fromMonth: '2026-12' }).percent).toMatch(/above 0/);
    expect(validateInput(db, { type: 'increment', percent: 5, scope: 'department', scopeValue: 'nope', fromMonth: '2026-12' }).scopeValue).toBeTruthy();
    expect(validateInput(db, { type: 'hiring', count: 0, designationId: 'des_fe', annualCtc: 50, locationId: 'loc_del', structureId: 'str_field', fromMonth: '2026-12' })).toMatchObject({ count: expect.any(String), annualCtc: expect.any(String) });
    expect(validateInput(db, { type: 'structure', structureId: 'str_field', basicPct: 5, pfOnActual: false, fromMonth: '2026-12' }).basicPct).toBeTruthy();
    expect(validateInput(db, { type: 'statutory', rule: 'pf_ceiling', value: NaN, fromMonth: '2026-12' }).value).toBeTruthy();
    expect(validateInput(db, { type: 'statutory', rule: 'pf_ceiling', value: 30000, fromMonth: '2025-01' }).fromMonth).toBeTruthy();
    for (const t of ['increment', 'hiring', 'structure', 'statutory'] as const) expect(validateInput(db, defaultInput(db, t))).toEqual({});
    expect(simFromMonths()[0]).toBe(PREVIEW_TODAY.slice(0, 7));
  });

  test('the text summary says it is planning only and lists every rule with its confidence', () => {
    const db = fresh();
    const r = runScenario(db, defaultInput(db, 'statutory'));
    const t = summaryText(r, 'ESI test');
    expect(t).toContain('What-if scenario: ESI test');
    expect(t).toContain('PLANNING ONLY');
    expect(t).toMatch(/ESI wage ceiling in this scenario: ₹30,000 \(hypothetical\) \[sample, confirm\]/);
    expect(t).toMatch(/PF wage ceiling: ₹25,000 \[reported, confirm\]/);
    expect(t).toMatch(/Labour Codes 50% wages rule: .* \[not tagged\]/);
    expect(t).toContain('Confirm every statutory figure with your advisor');
  });

  test('totals add up: employer cost is the sum of payslip employer costs', () => {
    const db = fresh();
    const slips = slipsForMonth(cleanCopy(db), '2026-12');
    const t = totalsOf(slips);
    expect(t.headcount).toBe(slips.length);
    expect(t.employerCost).toBe(slips.reduce((s, x) => s + x.employerCost, 0));
    expect(wageRuleStats(cleanCopy(db), slips, '2026-12').fail).toBe(7);
  });
});

// ═══════════════════════════════════ radar: pure logic ═══════════════════════════════════
test.describe('radar logic', () => {
  const items = buildRadarItems();

  test('rule items carry the date, source and confidence of the rules tables, and sample items are indicative', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const row of PF.ceiling) {
      const it = items.find((i) => i.id === `pf-ceiling-${row.from}`)!;
      expect(it).toMatchObject({ effectiveOn: row.from, source: row.source, confidence: row.confidence, category: 'PF', kind: 'rule' });
    }
    for (const row of ESI.ceiling) expect(items.find((i) => i.id === `esi-ceiling-${row.from}`)).toMatchObject({ source: row.source, confidence: row.confidence });
    for (const row of HRA_METROS) expect(items.find((i) => i.id === `hra-metro-${row.from}`)).toMatchObject({ source: row.source, confidence: row.confidence });
    const samples = items.filter((i) => i.kind === 'sample');
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const s of samples) { expect(s.confidence).toBe('indicative'); expect(s.dateLabel).toBe('Placeholder date'); expect(s.source).toMatch(/Sample advisory/); }
    // Every level of confidence appears, and every category has at least one item.
    expect(new Set(items.map((i) => i.confidence))).toEqual(new Set(['verified', 'reported', 'indicative']));
    expect(new Set(items.map((i) => i.category)).size).toBe(7);
    // The discussed ESI figure the sample advisory uses is the one named in the rules table's source note.
    expect(ESI.ceiling[0]!.source).toContain('30,000');
  });

  test('the PF ceiling impact matches the engine run with and without the old ceiling', () => {
    const db = fresh();
    const item = items.find((i) => i.id === 'pf-ceiling-2026-09-17')!;
    const impact = computeImpacts(db, [item])[item.id]!;
    const base = cleanCopy(db);
    const pfEmp = (slips: ReturnType<typeof slipsForMonth>) => slips.reduce((t, s) => t + (s.deductions.find((d) => d.code === 'PF')?.amount ?? 0), 0);
    const now = pfEmp(slipsForMonth(base, RADAR_REF_MONTH));
    const old = withCeilingOverride('pf_ceiling', 15000, RADAR_REF_MONTH, () => pfEmp(slipsForMonth(base, RADAR_REF_MONTH)));
    expect(now).toBeGreaterThan(old);
    expect(Math.abs(impact.money[0]!.value - (now - old))).toBeLessThanOrEqual(impact.employees);
    // And the people it names are exactly those whose PF wage differs either side of the date.
    const differ = base.employees.filter((e) => {
      if (!e.pfMember || !e.annualCtc || !e.structureId || (e.status !== 'active' && e.status !== 'on_notice')) return false;
      const st = base.structures.find((s) => s.id === e.structureId)!;
      const o = { pfMember: true, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides };
      return buildBreakup(st, e.annualCtc, { asOn: addDays(item.effectiveOn, -1), ...o }).pfWage !== buildBreakup(st, e.annualCtc, { asOn: item.effectiveOn, ...o }).pfWage;
    });
    expect(impact.employees).toBe(differ.length);
    expect(impact.headline).toContain(`${differ.length} people pay more PF`);
  });

  test('every item has an impact, and money items name a scope', () => {
    const db = fresh();
    const impacts = computeImpacts(db, items);
    for (const i of items) expect(impacts[i.id]!.headline.length, i.id).toBeGreaterThan(10);
    expect(impacts['lwf-tamil-nadu']!.employees).toBe(0);
    expect(impacts['lwf-karnataka']!.employees).toBe(db.employees.filter((e) => e.locationId === 'loc_blr' && e.status === 'active').length);
    expect(impacts['lwf-karnataka']!.money.reduce((t, m) => t + m.value, 0)).toBe(6 * (50 + 100));
    expect(impacts['labour-codes-in-force']!.employees).toBe(8);
    expect(impacts['gratuity-fixed-term']!.headline).toMatch(/Renewing it would make the person eligible/);
    expect(impacts['sample-esi-ceiling']!.employees).toBeGreaterThanOrEqual(6);
    expect(impacts['min-wage-maharashtra']!.headline).toMatch(/Dinesh Kamble/);
  });

  test('the 90-day strip uses the preview date and is sorted; the feed puts upcoming items first', () => {
    const soon = effectiveWithin(items, 90);
    expect(soon.length).toBeGreaterThan(3);
    expect(soon.every((i) => i.effectiveOn >= PREVIEW_TODAY && i.effectiveOn <= addDays(PREVIEW_TODAY, 90))).toBe(true);
    expect(soon.map((i) => i.effectiveOn)).toEqual([...soon.map((i) => i.effectiveOn)].sort());
    expect(soon.find((i) => i.id === 'sample-pt-revision')).toBeUndefined();
    const feed = sortFeed(items);
    const firstPast = feed.findIndex((i) => i.effectiveOn < PREVIEW_TODAY);
    expect(feed.slice(0, firstPast).every((i) => i.effectiveOn >= PREVIEW_TODAY)).toBe(true);
    expect(feed.slice(firstPast).every((i) => i.effectiveOn < PREVIEW_TODAY)).toBe(true);
  });

  test('a task is due before the effective date, or a week out when the rule is already in force', () => {
    const upcoming = items.find((i) => i.id === 'lwf-karnataka')!;
    const inForce = items.find((i) => i.id === 'pf-ceiling-2026-09-17')!;
    const due = suggestedTaskDue(upcoming);
    expect(due < upcoming.effectiveOn && due >= PREVIEW_TODAY).toBe(true);
    expect(suggestedTaskDue(inForce)).toBe(addDays(PREVIEW_TODAY, 7));
    expect(validateTaskDue(upcoming, upcoming.effectiveOn)).toMatch(/before the effective date/);
    expect(validateTaskDue(upcoming, '2026-11-01')).toMatch(/past/);
    expect(validateTaskDue(upcoming, 'not a date')).toMatch(/valid date/);
    expect(validateTaskDue(upcoming, due)).toBeNull();
    // A rule due tomorrow still gets a due date that is not in the past.
    expect(suggestedTaskDue({ effectiveOn: addDays(PREVIEW_TODAY, 1) })).toBe(PREVIEW_TODAY);
  });

  test('the task for an item is filed under its law, for the entity most affected', () => {
    const db = fresh();
    const item = items.find((i) => i.id === 'lwf-maharashtra')!;
    const impact = computeImpacts(db, [item])[item.id]!;
    const t = buildComplianceTask(db, item, impact, '2026-11-20');
    expect(t).toMatchObject({ law: 'LWF', entityId: 'ent_logistics', state: 'Maharashtra', dueOn: '2026-11-20', status: 'upcoming' });
    expect(t.name.startsWith('Rule radar: ')).toBe(true);
  });
});

// ═══════════════════════════════════ autopilot: pure logic ═══════════════════════════════════
test.describe('autopilot logic', () => {
  test('status and kind come from the task and the preview date', () => {
    const db = fresh();
    const by = (id: string) => db.compliance.find((c) => c.id === id)!;
    expect(taskStatus(by('cmp_clra'))).toBe('overdue');
    expect(taskStatus(by('cmp_tds_oct'))).toBe('due_soon');
    expect(taskStatus(by('cmp_pf_oct'))).toBe('upcoming');
    expect(taskStatus(by('cmp_pf_sep'))).toBe('filed');
    expect(dueLabel(by('cmp_tds_oct'))).toBe('Due today');
    expect(dueLabel(by('cmp_pf_oct'))).toBe('Due in 8 days');
    expect(dueLabel(by('cmp_clra'))).toMatch(/days late$/);
    expect(dueLabel(by('cmp_pf_sep'))).toBe('Filed on time');
    expect(taskKind(by('cmp_24q'))).toBe('tds_return');
    expect(taskKind(by('cmp_tds_oct'))).toBe('tds_deposit');
    expect(taskKind(by('cmp_posh'))).toBe('posh');
    // A task made from the Rule radar is a review task, not a filing: it gets the general checklist whatever its law.
    expect(taskKind({ law: 'PF', name: 'Rule radar: PF wage ceiling rises from ₹15,000 to ₹25,000' })).toBe('generic');
    expect(taskKind({ law: 'Shops', name: 'Rule radar: Labour Codes in force' })).toBe('generic');
    const radarTask = { id: 'cmp_x', name: 'Rule radar: ESI ceiling', law: 'ESI' as const, dueOn: '2026-11-20', entityId: 'ent_retail', status: 'upcoming' as const };
    const r = readinessFor(db, radarTask);
    expect(r.checks.every((c) => c.kind === 'manual')).toBe(true);
    expect(r.pct).toBe(0);
  });

  test('PF blockers are exactly the people the ECR would leave out', () => {
    const db = fresh();
    const task = db.compliance.find((c) => c.id === 'cmp_pf_oct')!;
    const r = readinessFor(db, task);
    const run = db.payRuns.find((x) => x.id === 'run_2026-10_ent_retail')!;
    const ecr = buildEcr(db, run);
    const blocked = r.blockers.flatMap((b) => b.people.map((p) => p.employeeId)).sort();
    expect(blocked).toEqual(ecr.blocked.map((b) => b.employeeId).sort());
    expect(r.blockers.map((b) => b.id).sort()).toEqual(['uan_missing', 'uan_seeded']);
    expect(r.checks.find((c) => c.id === 'bank')!.people.map((p) => p.employeeId)).toEqual(['emp_9']);
    expect(r.pct).toBe(Math.round((r.passed / r.total) * 100));
    expect(r.facts).toEqual(expect.arrayContaining([{ label: 'ECR rows ready', value: String(ecr.rows) }]));
  });

  test('readiness follows the data: remove a UAN and one more blocker appears; fix it and it clears', () => {
    const db = fresh();
    const task = db.compliance.find((c) => c.id === 'cmp_pf_oct')!;
    const before = readinessFor(db, task);
    db.employees.find((e) => e.id === 'emp_6')!.uan = undefined;
    const worse = readinessFor(db, task);
    expect(worse.blockers.find((b) => b.id === 'uan_missing')!.people.map((p) => p.employeeId).sort()).toEqual(['emp_6', 'emp_7']);
    expect(worse.pct).toBe(before.pct);   // the same checks fail, but with one more person under them
    db.employees.find((e) => e.id === 'emp_7')!.uan = '100200300999';
    db.employees.find((e) => e.id === 'emp_7')!.uanStatus = 'generated';
    const moved = readinessFor(db, task);
    expect(moved.checks.find((c) => c.id === 'uan_active')!.people.map((p) => p.employeeId)).toEqual(['emp_7']);
    // Without a frozen run there is nothing to file from.
    db.payRuns.find((r) => r.id === 'run_2026-10_ent_retail')!.status = 'computed';
    const open = readinessFor(db, task);
    expect(open.checks.find((c) => c.id === 'run')).toMatchObject({ passed: false, severity: 'blocker' });
  });

  test('registrations: an expired CLRA licence blocks, a Shops registration near its end warns', () => {
    const db = fresh();
    const clra = readinessFor(db, db.compliance.find((c) => c.id === 'cmp_clra')!);
    expect(clra.checks.find((c) => c.id === 'valid')).toMatchObject({ passed: false, severity: 'blocker' });
    expect(clra.checks.find((c) => c.id === 'valid')!.detail).toMatch(/Expired on 30 Apr 2026/);
    const shops = readinessFor(db, db.compliance.find((c) => c.id === 'cmp_shops')!);
    expect(shops.checks.find((c) => c.id === 'valid')!.passed).toBe(true);
    expect(shops.checks.find((c) => c.id === 'runway')).toMatchObject({ passed: false, severity: 'warning' });
    expect(shops.checks.find((c) => c.id === 'runway')!.detail).toMatch(/54 days left/);
    // PT without a registration for the state is a blocker.
    const pt = db.compliance.find((c) => c.id === 'cmp_pt_ka')!;
    db.entities.find((e) => e.id === 'ent_retail')!.registrations = db.entities.find((e) => e.id === 'ent_retail')!.registrations.filter((r) => r.type !== 'pt');
    expect(readinessFor(db, pt).blockers.map((b) => b.id)).toContain('reg_pt');
  });

  test('checks only a person can confirm count when ticked', () => {
    const db = fresh();
    const posh = db.compliance.find((c) => c.id === 'cmp_posh')!;
    const none = readinessFor(db, posh);
    expect(none.pct).toBe(0);
    expect(none.checks.every((c) => c.kind === 'manual')).toBe(true);
    const manual = Object.fromEntries(none.checks.map((c) => [`${posh.id}|${c.id}`, true]));
    const all = readinessFor(db, posh, manual);
    expect(all.pct).toBe(100);
    expect(all.blockers).toHaveLength(0);
  });

  test('prepare builds the ECR from the engine, and says plainly when there is only a checklist', () => {
    const db = fresh();
    const pf = prepareArtefact(db, db.compliance.find((c) => c.id === 'cmp_pf_oct')!);
    const ecr = buildEcr(db, db.payRuns.find((x) => x.id === 'run_2026-10_ent_retail')!);
    expect(pf.kind).toBe('ecr');
    expect(pf.text).toBe(ecr.text);
    expect(pf.text!.split('\n')).toHaveLength(ecr.rows);
    expect(pf.issues.filter((i) => i.excluded)).toHaveLength(ecr.blocked.length);
    expect(pf.filename).toBe('ECR-meridian-2026-10.txt');
    const total = pf.summary.find((s) => s.label === 'Total to deposit')!.value;
    expect(total).toMatch(/^₹/);
    const posh = prepareArtefact(db, db.compliance.find((c) => c.id === 'cmp_posh')!);
    expect(posh).toMatchObject({ kind: 'list' });
    expect(posh.text).toBeUndefined();
    expect(posh.note).toMatch(/no file, only the checklist/);
    const tds = prepareArtefact(db, db.compliance.find((c) => c.id === 'cmp_tds_oct')!);
    expect(tds.kind).toBe('sheet');
    expect(tds.note).toMatch(/not the portal's upload format/);
    // Next month's pay run does not exist, so the LWF sheet is projected and says so.
    const lwf = prepareArtefact(db, db.compliance.find((c) => c.id === 'cmp_lwf')!);
    expect(lwf.rows).toHaveLength(6);
    expect(lwf.note).toMatch(/Projected/);
    // No run for the month: an honest empty result, not a fake file.
    db.payRuns = [];
    expect(prepareArtefact(db, db.compliance.find((c) => c.id === 'cmp_pf_oct')!).kind).toBe('list');
  });

  test('summary, calendar and late-filing text', () => {
    const db = fresh();
    expect(autopilotSummary(db)).toMatchObject({ filed: 3, onTime: 3, onTimePct: 100, overdue: 1, dueThisWeek: 1, open: 10 });
    db.compliance.find((c) => c.id === 'cmp_pf_sep')!.filedOn = '2026-10-20';
    expect(autopilotSummary(db)).toMatchObject({ onTime: 2, onTimePct: 67 });
    const weeks = calendarWeeks(db);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(new Date(`${weeks[0]![0]!.date}T00:00:00Z`).getUTCDay()).toBe(1);   // Monday first
    expect(weeks.flat().filter((d) => d.inRange)).toHaveLength(60);
    const due = weeks.flat().filter((d) => d.inRange && d.tasks.length);
    expect(due.map((d) => d.date)).toContain('2026-11-15');
    expect(due.reduce((n, d) => n + d.tasks.length, 0)).toBe(9);   // the open tasks due in the window; the CLRA one is long overdue
    // Late-filing text never quotes a rate or an amount.
    for (const t of Object.values(LATE_NOTE)) expect(t).not.toMatch(/\d|%|₹|Rs/);
  });
});

// ═══════════════════════════════════ monitoring: pure logic ═══════════════════════════════════
test.describe('monitoring logic', () => {
  const rows = () => seedControl().monitoring.rows;
  const row = (id: string) => rows().find((r) => r.id === id)!;

  test('the ledger starts with every kind of monitoring, and blocked ones cannot be turned on', () => {
    const r = rows();
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(['mon_gps', 'mon_visit_photo', 'mon_device_id', 'mon_odometer', 'mon_kiosk', 'mon_email_scan', 'mon_screen', 'mon_keystroke']));
    expect(monitoringCounts(r)).toEqual({ on: 5, off: 2, blocked: 1, considering: 1 });
    expect(canTurnOn(row('mon_keystroke'))).toBe(false);
    expect(canTurnOn(row('mon_screen'))).toBe(true);
    expect(row('mon_keystroke').blockedReason).toMatch(/Disproportionate/);
    for (const x of r) { expect(['consent', 'employment']).toContain(x.legalBasis); expect(x.purpose.length).toBeGreaterThan(5); }
  });

  test('field staff are the people the field practices cover', () => {
    const db = fresh();
    expect(coveredPeople(db, row('mon_gps')).map((e) => e.id).sort()).toEqual(['emp_19', 'emp_20', 'emp_22', 'emp_4', 'emp_6', 'emp_7', 'emp_8', 'emp_9']);
    expect(coveredPeople(db, row('mon_kiosk')).every((e) => e.locationId === 'loc_del')).toBe(true);
    expect(coveredPeople(db, row('mon_device_id'))).toHaveLength(db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice').length);
  });

  test('consent coverage counts current consents and lists who is missing, with withdrawn consent told apart', () => {
    const db = fresh();
    const gps = consentCoverage(db, row('mon_gps'));
    expect(gps).toMatchObject({ applicable: true, covered: 8, withConsent: 5, purpose: 'Location during duty hours' });
    expect(gps.missing.map((m) => m.employee.id).sort()).toEqual(['emp_19', 'emp_20', 'emp_22']);
    expect(gps.missing.every((m) => m.reason === 'never')).toBe(true);
    const kiosk = consentCoverage(db, row('mon_kiosk'));
    const withdrawn = kiosk.missing.find((m) => m.employee.id === 'emp_4')!;
    expect(withdrawn).toMatchObject({ reason: 'withdrawn', since: '2026-09-02' });
    expect(kiosk.withConsent + kiosk.missing.length).toBe(kiosk.covered);
    // Employment-purpose rows have no consent to count.
    expect(consentCoverage(db, row('mon_odometer')).applicable).toBe(false);
    // Recording a consent for a missing person moves them across.
    db.consents.push({ id: 'cs_new', employeeId: 'emp_19', purpose: 'Location during duty hours', noticeVersion: 'v2', grantedAt: '2026-11-07T10:00:00.000Z' });
    expect(consentCoverage(db, row('mon_gps'))).toMatchObject({ withConsent: 6 });
  });

  test('retention is checked against the policy window: the Privacy rule when there is one, 90 days otherwise', () => {
    const db = fresh();
    expect(policyWindow(db, row('mon_gps'))).toMatchObject({ days: 92 });          // 0.25 years
    expect(policyWindow(db, row('mon_kiosk'))).toMatchObject({ days: 30 });        // 0.08 years rounds up to the 30 days its note states
    expect(policyWindow(db, row('mon_odometer'))).toMatchObject({ days: DEFAULT_WINDOW_DAYS });
    const all = rows();
    const flags = retentionFlags(db, all);
    expect(flags.map((f) => f.row.id).sort()).toEqual(['mon_odometer', 'mon_visit_photo']);
    expect(flags.find((f) => f.row.id === 'mon_visit_photo')).toMatchObject({ windowDays: 90, overBy: 90 });
    expect(flags[0]!.action).toMatch(/Shorten to .*or write down why/);
    // A reason clears the flag; a short retention does too; off and blocked rows are never flagged.
    all.find((r) => r.id === 'mon_odometer')!.retentionReason = 'Travel allowance audits look back a year.';
    all.find((r) => r.id === 'mon_visit_photo')!.retentionDays = 90;
    expect(retentionFlags(db, all)).toHaveLength(0);
    all.find((r) => r.id === 'mon_screen')!.retentionDays = 999;
    expect(retentionFlags(db, all)).toHaveLength(0);
  });

  test('switching a practice on needs a purpose, a retention period and a named reviewer', () => {
    expect(Object.keys(validateTurnOn({ purpose: '', retentionDays: NaN, reviewer: '' })).sort()).toEqual(['purpose', 'retentionDays', 'reviewer']);
    expect(validateTurnOn({ purpose: 'short', retentionDays: 30, reviewer: 'Tanvi Kapoor' }).purpose).toBeTruthy();
    expect(validateTurnOn({ purpose: 'Check that the right person is at the desk.', retentionDays: 0, reviewer: 'Tanvi Kapoor' }).retentionDays).toBeTruthy();
    expect(validateTurnOn({ purpose: 'Check that the right person is at the desk.', retentionDays: 30, reviewer: 'Tanvi Kapoor' })).toEqual({});
  });

  test('the employee notice is generated from the ledger and says what is not done', () => {
    const all = rows();
    const text = noticeText(all);
    expect(text).toContain('How we use technology to see how work is done');
    expect(text).toContain('1. GPS trail while punched in');
    expect(text).toMatch(/Who it covers: Field staff only/);
    expect(text).toMatch(/How long we keep it: 90 days, then it is deleted/);
    expect(text).toMatch(/What we do not do[\s\S]*- Keystroke logging: we do not do this and we do not offer it\./);
    expect(text).toMatch(/What we are thinking about[\s\S]*Vehicle tracker on company trucks/);
    expect(text).toContain('We never use it to rank or score people.');
    // Turning one on moves it into the "collect" list.
    all.find((r) => r.id === 'mon_vehicle')!.status = 'on';
    const after = noticeText(all);
    expect(after).not.toContain('What we are thinking about');
    expect(after).toMatch(/\d+\. Vehicle tracker on company trucks/);
    expect(noticeText(all.map((r) => ({ ...r, status: 'off' as const })))).toContain('We do not collect anything through monitoring tools at the moment.');
  });
});

// ═══════════════════════════════════ simulator: UI ═══════════════════════════════════
test.describe('simulator page', () => {
  const seed = fresh();
  const whRun = runScenario(seed, { type: 'increment', percent: 12, scope: 'department', scopeValue: 'dep_wh', fromMonth: '2026-12' });

  test('opens on a worked example, says it is planning only, and has no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/simulator');
    await expect(page.getByRole('heading', { name: 'What-if simulator', level: 1 })).toBeVisible(nav);
    await expect(page.getByTestId('result-title')).toHaveText('12% increment for Warehouse, from Dec 2026');
    await expect(page.getByText('Planning only, not for filing').first()).toBeVisible();
    await expect(page.getByText('Simulation', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-esi')).toContainText('1 out, 0 in');
    await expect(page.getByTestId('stat-wages')).toContainText('7');
    // The people table is named, with before and after net pay.
    const people = page.getByTestId('people-table');
    await expect(people).toContainText('Manoj Patil');
    await expect(people).toContainText('Leaves ESI');
    await expect(page.getByTestId('sim-chart')).toBeVisible();
    await expect(page.getByTestId('rule-pf_ceiling')).toContainText('Reported, confirm');
    await expect(page.getByTestId('rule-wages_50')).toContainText('Not tagged');
    expect(whRun.people.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the numbers need a press of Run simulation, and bad inputs are refused with a message', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator');
    await page.getByLabel('Increment (%)').fill('20');
    await expect(page.getByText('You changed the inputs. Run the simulation to update the numbers below.')).toBeVisible();
    await expect(page.getByTestId('result-title')).toHaveText('12% increment for Warehouse, from Dec 2026');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByTestId('result-title')).toHaveText('20% increment for Warehouse, from Dec 2026');
    await expect(page.getByText('You changed the inputs.')).toHaveCount(0);
    await page.getByLabel('Increment (%)').fill('0');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByText('Enter a percentage above 0 and up to 100.')).toBeVisible();
    await expect(page.getByTestId('result-title')).toHaveText('20% increment for Warehouse, from Dec 2026');
  });

  test('hiring: planned people appear as new, and the structure that fails the 50% rule is called out', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator');
    await page.getByTestId('type-hiring').click();
    await expect(page.getByTestId('type-hiring')).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Number of people').fill('5');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByTestId('result-title')).toContainText('5 Field Executives at ₹3.6L in Delhi HQ');
    await expect(page.getByTestId('people-table')).toContainText('New hire 1');
    await expect(page.getByTestId('people-table')).toContainText('(planned)');
    await expect(page.getByText('Every new hire fails the 50% wages rule on this structure.')).toBeVisible();
    await expect(page.getByTestId('stat-takehome')).toContainText('No one existing');
    await page.getByLabel('Salary structure').selectOption({ label: 'Office staff' });
    await page.getByTestId('run-simulation').click();
    await expect(page.getByText('Every new hire fails the 50% wages rule on this structure.')).toHaveCount(0);
  });

  test('statutory change: the ceiling in force and the hypothetical both carry a confidence badge', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator');
    await page.getByTestId('type-statutory').click();
    const base = page.getByTestId('statutory-baseline');
    await expect(base).toContainText('ESI wage ceiling ₹21,000');
    await expect(base).toContainText('Reported, confirm');
    await expect(base).toContainText('Sample, confirm');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByTestId('result-title')).toHaveText('ESI wage ceiling ₹21,000 to ₹30,000, from Dec 2026');
    await expect(page.getByTestId('people-table')).toContainText('Joins ESI');
    await expect(page.getByTestId('rule-esi_ceiling_what_if')).toContainText('hypothetical');
    await expect(page.getByTestId('rule-esi_ceiling_what_if')).toContainText('Sample, confirm');
    await page.getByLabel('Which ceiling').selectOption('pf_ceiling');
    await expect(base).toContainText('PF wage ceiling ₹25,000');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByTestId('result-title')).toHaveText('PF wage ceiling ₹25,000 to ₹30,000, from Dec 2026');
  });

  test('a structure change shows the 50% rule moving and says why PF stays put', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator');
    await page.getByTestId('type-structure').click();
    await page.getByTestId('run-simulation').click();
    await expect(page.getByTestId('result-title')).toContainText('Field sales: basic 35% to 50% of CTC');
    await expect(page.getByTestId('stat-wages')).toContainText('7 to 0');
    await expect(page.getByText(/PF and take-home do not move/)).toBeVisible();
    await page.getByLabel('Salary structure').selectOption({ label: 'Office staff' });
    await page.getByLabel('Basic as a share of CTC (%)').fill('60');
    await page.getByTestId('run-simulation').click();
    await expect(page.getByText(/not meaningful until the structure is fixed/)).toBeVisible();
    await expect(page.getByTestId('people-table')).toContainText('Structure no longer fits the CTC');
  });

  test('a saved scenario survives a reload, and downloads as a plain-text summary', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator');
    await page.getByTestId('type-hiring').click();
    await page.getByTestId('run-simulation').click();
    await page.locator('#scenario-name').fill('Delhi hiring plan');
    await page.getByTestId('save-scenario').click();
    await tab(page, /Saved scenarios/);
    await expect(page.getByTestId('saved-list')).toContainText('Delhi hiring plan');
    await expect(page.getByRole('tab', { name: /Saved scenarios/ })).toContainText('4');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await tab(page, /Saved scenarios/);
    await expect(page.getByTestId('saved-list')).toContainText('Delhi hiring plan');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Delhi hiring plan' }).click()]);
    const text = readFileSync((await dl.path())!, 'utf8');
    expect(dl.suggestedFilename()).toBe('delhi-hiring-plan.txt');
    expect(text).toContain('What-if scenario: Delhi hiring plan');
    expect(text).toContain('PLANNING ONLY');
    expect(text).toMatch(/Employer cost over 12 months from Dec 2026: \+₹/);
  });

  test('saved scenarios can be renamed, opened and deleted', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator?tab=saved');
    const list = page.getByTestId('saved-list');
    await expect(list).toContainText('Warehouse increment from December');
    await expect(list).toContainText('Field sales basic to 50%');
    await expect(list).toContainText('Three field executives in Delhi');
    await expect(list).toContainText('12% increment for Warehouse, from Dec 2026');
    // The 12-month cost shown here is the one the simulator works out.
    await expect(list).toContainText(`+₹${(whRun.twelveDelta / 100000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}L`);

    await page.getByRole('button', { name: 'Rename Field sales basic to 50%' }).click();
    const dlg = page.getByRole('dialog', { name: 'Rename scenario' });
    await dlg.getByLabel('Name').fill('ab');
    await expect(dlg.getByRole('button', { name: 'Save name' })).toBeDisabled();
    await dlg.getByLabel('Name').fill('Field basic share, option B');
    await dlg.getByRole('button', { name: 'Save name' }).click();
    await expect(list).toContainText('Field basic share, option B');
    await expect(list).not.toContainText('Field sales basic to 50%');

    await page.getByRole('button', { name: 'Open Warehouse increment from December' }).click();
    await expect(page.getByRole('tab', { name: 'Run a scenario' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Increment (%)')).toHaveValue('12');
    await expect(page.getByTestId('result-title')).toHaveText('12% increment for Warehouse, from Dec 2026');

    await tab(page, /Saved scenarios/);
    await page.getByRole('button', { name: 'Delete Three field executives in Delhi' }).click();
    await page.getByRole('dialog', { name: 'Delete this scenario?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('saved-list')).not.toContainText('Three field executives in Delhi');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('saved-list')).not.toContainText('Three field executives in Delhi');
    await expect(page.getByTestId('saved-list')).toContainText('Field basic share, option B');
  });

  test('two saved scenarios are compared side by side, with a plain verdict', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator?tab=compare');
    await page.getByLabel('Scenario A', { exact: true }).selectOption({ label: 'Warehouse increment from December' });
    await page.getByLabel('Scenario B', { exact: true }).selectOption({ label: 'Three field executives in Delhi' });
    const hire = runScenario(seed, { type: 'hiring', count: 3, designationId: 'des_fe', annualCtc: 360000, locationId: 'loc_del', structureId: 'str_field', fromMonth: '2026-12' });
    const diff = Math.abs(hire.twelveDelta - whRun.twelveDelta);
    const inrText = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
    await expect(page.getByTestId('compare-verdict')).toContainText(`costs ${inrText(diff)} ${hire.twelveDelta >= whRun.twelveDelta ? 'more' : 'less'}`);
    const table = page.getByTestId('compare-table');
    await expect(table).toContainText('Employer cost over 12 months');
    await expect(table).toContainText('Failing the 50% wages rule after');
    await expect(table).toContainText('Scenario A');
    await expect(table).toContainText('Scenario B');
    await expect(page.getByTestId('compare-chart')).toBeVisible();
    // Picking the same one twice is called out.
    await page.getByLabel('Scenario B', { exact: true }).selectOption({ label: 'Warehouse increment from December' });
    await expect(page.getByText('You picked the same scenario twice.')).toBeVisible();
  });

  test('comparing needs two scenarios, and says so', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/simulator?tab=saved');
    for (const n of ['Warehouse increment from December', 'Field sales basic to 50%']) {
      await page.getByRole('button', { name: `Delete ${n}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    }
    await tab(page, 'Compare');
    await expect(page.getByText('Save at least two scenarios to compare them')).toBeVisible();
    await tab(page, /Saved scenarios/);
    await page.getByRole('button', { name: 'Delete Three field executives in Delhi' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No saved scenarios yet')).toBeVisible();
  });

  test('phone width: no horizontal page scroll on any tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/simulator');
    await expect(page.getByTestId('result-title')).toBeVisible(nav);
    await noOverflowAt390(page, 'simulator run');
    for (const t of ['hiring', 'structure', 'statutory'] as const) {
      await page.getByTestId(`type-${t}`).click();
      await page.getByTestId('run-simulation').click();
      await noOverflowAt390(page, `simulator ${t}`);
    }
    await tab(page, /Saved scenarios/);
    await noOverflowAt390(page, 'simulator saved');
    await tab(page, 'Compare');
    await expect(page.getByTestId('compare-table')).toBeVisible();
    await noOverflowAt390(page, 'simulator compare');
  });
});

// ═══════════════════════════════════ rule radar: UI ═══════════════════════════════════
test.describe('rule radar page', () => {
  const items = buildRadarItems();
  const seed = fresh();
  const impacts = computeImpacts(seed, items);

  test('says plainly what the confidence labels mean, and lists every item with its label', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/rule-radar');
    await expect(page.getByRole('heading', { name: 'Rule radar', level: 1 })).toBeVisible(nav);
    await expect(page.getByTestId('honesty-note')).toContainText('Confidence labels are the honesty feature of this product');
    for (const level of ['verified', 'reported', 'indicative']) await expect(page.getByText(level, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('From the official text.')).toBeVisible();
    await expect(page.getByText('From reliable reporting.')).toBeVisible();
    await expect(page.getByText('A placeholder or an estimate.')).toBeVisible();
    await expect(page.getByTestId('radar-count')).toHaveText(`Showing ${items.length} of ${items.length}`);
    for (const i of items) await expect(page.getByTestId(`radar-item-${i.id}`)).toBeAttached();
    // A reported item and a verified one and a sample advisory, each with the right badge.
    await expect(page.getByTestId('radar-item-pf-ceiling-2026-09-17')).toContainText('Reported, confirm');
    await expect(page.getByTestId('radar-item-pf-ceiling-2014-09-01')).toContainText('Verified');
    await expect(page.getByTestId('radar-item-sample-pt-revision')).toContainText('Sample advisory');
    await expect(page.getByTestId('radar-item-sample-pt-revision')).toContainText('Sample, confirm');
    expect(errors).toEqual([]);
  });

  test('each item shows its source, date and what it means for us, from the sample company', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    const pf = page.getByTestId('radar-item-pf-ceiling-2026-09-17');
    await expect(pf).toContainText('PF wage ceiling rises from ₹15,000 to ₹25,000');
    await expect(pf).toContainText('PIB, S.O. 5109(E) (as reported)');
    await expect(page.getByTestId('radar-when-pf-ceiling-2026-09-17')).toHaveText('Effective 17 Sep 2026, 51 days ago');
    await expect(page.getByTestId('radar-impact-pf-ceiling-2026-09-17')).toContainText(impacts['pf-ceiling-2026-09-17']!.headline);
    await expect(page.getByTestId('radar-impact-pf-ceiling-2026-09-17')).toContainText('9 people pay more PF');
    await expect(page.getByTestId('radar-impact-lwf-tamil-nadu')).toContainText('Nobody works in Tamil Nadu');
    await expect(page.getByTestId('radar-impact-min-wage-maharashtra')).toContainText('Dinesh Kamble');
    await expect(page.getByTestId('radar-item-esi-ceiling-2017-01-01')).toContainText('discussed in Aug 2026, not notified');
  });

  test('the next-90-days strip counts from the preview date', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    const strip = page.getByTestId('radar-strip');
    const soon = effectiveWithin(items, 90);
    await expect(strip.locator('[data-testid^="strip-"]')).toHaveCount(soon.length);
    await expect(strip.getByTestId('strip-lwf-karnataka')).toContainText('1 Dec 2026');
    await expect(strip.getByTestId('strip-sample-esi-ceiling')).toContainText('Placeholder');
    await expect(strip.getByTestId('strip-sample-pt-revision')).toHaveCount(0);
    await strip.getByTestId('strip-lwf-karnataka').click();
    await expect(page.getByRole('dialog', { name: /Labour welfare fund, Karnataka/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('filters by category, status, confidence and search, and clears', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    const count = page.getByTestId('radar-count');
    await page.getByRole('combobox', { name: 'Category' }).selectOption('PT');
    await expect(count).toHaveText(`Showing ${items.filter((i) => i.category === 'PT').length} of ${items.length}`);
    await expect(page.getByTestId('radar-item-pt-february-balance')).toBeVisible();
    await expect(page.getByTestId('radar-item-lwf-karnataka')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Confidence' }).selectOption('indicative');
    await page.getByRole('combobox', { name: 'Category' }).selectOption('all');
    await expect(count).toHaveText(`Showing ${items.filter((i) => i.confidence === 'indicative').length} of ${items.length}`);
    await page.getByRole('combobox', { name: 'Confidence' }).selectOption('all');
    await page.getByRole('combobox', { name: 'Status' }).selectOption('applied');
    await expect(count).toHaveText(`Showing 1 of ${items.length}`);
    await expect(page.getByTestId('radar-item-pf-ceiling-2026-09-17')).toBeVisible();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('all');
    await page.getByRole('searchbox', { name: 'Search the radar' }).fill('minimum wage');
    await expect(page.locator('[data-testid^="radar-item-"]')).toHaveCount(items.filter((i) => /minimum wage/i.test(`${i.title} ${i.summary} ${i.source} ${i.category}`)).length);
    await page.getByRole('searchbox', { name: 'Search the radar' }).fill('zzzz nothing');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(count).toHaveText(`Showing ${items.length} of ${items.length}`);
  });

  test('acknowledging an item changes its status and survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    const card = page.getByTestId('radar-item-esi-ceiling-2017-01-01');
    await expect(card).toContainText('New');
    await page.getByTestId('ack-esi-ceiling-2017-01-01').click();
    await expect(card).toContainText('Acknowledged by You (HR admin)');
    await expect(page.getByTestId('ack-esi-ceiling-2017-01-01')).toHaveCount(0);
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('radar-item-esi-ceiling-2017-01-01')).toContainText('Acknowledged by You (HR admin)');
    await page.getByRole('combobox', { name: 'Status' }).selectOption('acknowledged');
    await expect(page.getByTestId('radar-count')).toHaveText(`Showing 2 of ${items.length}`);   // the seeded HRA item and this one
  });

  test('status and an owner note are set from the details, and persist', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    await page.getByTestId('details-bonus-ceiling').click();
    const dlg = page.getByRole('dialog', { name: /Bonus eligibility ceiling/ });
    await expect(dlg).toContainText('Reported: from reliable reporting.');
    await expect(dlg).toContainText('S.O. 4711(E), 25 Aug 2026 (as reported)');
    await expect(dlg).toContainText('How this was worked out');
    await dlg.getByLabel('Status').selectOption('applied');
    await dlg.getByLabel('Owner note').fill('Eligibility list checked by Finance.');
    await dlg.getByTestId('radar-save').click();
    const card = page.getByTestId('radar-item-bonus-ceiling');
    await expect(card).toContainText('Applied in config');
    await expect(card).toContainText('Note: Eligibility list checked by Finance.');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('radar-item-bonus-ceiling')).toContainText('Note: Eligibility list checked by Finance.');
    await expect(page.getByTestId('radar-item-bonus-ceiling')).toContainText('Applied in config');
  });

  test('a compliance task is added to the core calendar with a due date before the effective date', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/rule-radar');
    await page.getByTestId('task-lwf-karnataka').click();
    const dlg = page.getByRole('dialog', { name: 'Create a compliance task' });
    await expect(dlg).toContainText('Karnataka');
    await expect(dlg).toContainText('Meridian Retail Pvt Ltd');
    await expect(dlg.getByLabel('Due date')).toHaveValue('2026-11-17');
    await dlg.getByLabel('Due date').fill('2026-12-05');
    await expect(dlg.getByText('The task must be due before the effective date, 1 Dec 2026.')).toBeVisible();
    await dlg.getByTestId('task-confirm').click();
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Due date').fill('2026-11-01');
    await expect(dlg.getByText('The due date cannot be in the past.')).toBeVisible();
    await dlg.getByLabel('Due date').fill('2026-11-20');
    await dlg.getByTestId('task-confirm').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('task-done-lwf-karnataka')).toBeVisible();
    await expect(page.getByTestId('radar-item-lwf-karnataka')).toContainText('Acknowledged by');
    // The task now shows on the Autopilot page, from the core compliance list, and survives a reload.
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('task-done-lwf-karnataka')).toBeVisible();
    await page.goto('/dashboard/hrms/autopilot');
    const card = page.locator('[data-testid^="task-"]').filter({ hasText: 'Rule radar: Labour welfare fund, Karnataka' });
    await expect(card).toBeVisible(nav);
    await expect(card).toContainText('Due in 13 days');
    await expect(card).toContainText('Meridian Retail Pvt Ltd, Karnataka');
    await page.goto('/dashboard/hrms/statutory?tab=calendar');
    await expect(page.getByText('Rule radar: Labour welfare fund, Karnataka').first()).toBeVisible(nav);
  });

  test('phone width: no horizontal page scroll, and the details dialog fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/rule-radar');
    await expect(page.getByTestId('radar-strip')).toBeVisible(nav);
    await noOverflowAt390(page, 'rule radar');
    await page.getByTestId('details-pf-ceiling-2026-09-17').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflowAt390(page, 'rule radar dialog');
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

// ═══════════════════════════════════ autopilot: UI ═══════════════════════════════════
test.describe('autopilot page', () => {
  const seed = fresh();
  const pf = readinessFor(seed, seed.compliance.find((c) => c.id === 'cmp_pf_oct')!);
  const summary = autopilotSummary(seed);

  test('summarises filing, shows each open task with a readiness worked out from the data', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/autopilot');
    await expect(page.getByRole('heading', { name: 'Compliance autopilot', level: 1 })).toBeVisible(nav);
    await expect(page.getByTestId('sum-ontime')).toContainText(`${summary.onTimePct}%`);
    await expect(page.getByTestId('sum-ontime')).toContainText('3 of 3 filed');
    await expect(page.getByTestId('sum-overdue')).toContainText('1');
    await expect(page.getByTestId('sum-week')).toContainText('1');
    await expect(page.getByTestId('sum-ready')).toContainText(`${summary.avgReadiness}%`);
    await expect(page.locator('[data-testid^="task-cmp_"]')).toHaveCount(summary.open);
    await expect(page.getByTestId('task-cmp_clra')).toContainText('176 days late');
    await expect(page.getByTestId('task-cmp_tds_oct')).toContainText('Due today');
    await expect(page.getByTestId('task-cmp_pf_oct')).toContainText('Due in 8 days');
    await expect(page.getByTestId('readiness-cmp_pf_oct')).toHaveText(`Readiness ${pf.pct}%: ${pf.passed} of ${pf.total} checks pass, 2 blockers`);
    await expect(page.getByTestId('blockers-cmp_pf_oct')).toContainText('Pooja Verma');
    await expect(page.getByTestId('blockers-cmp_pf_oct')).toContainText('Sana Qureshi');
    await expect(page.getByTestId('readiness-cmp_tds_oct')).toContainText('Readiness 100%');
    // Overdue first, then by due date.
    const ids = await page.locator('[data-testid^="task-cmp_"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids[0]).toBe('task-cmp_clra');
    expect(ids[1]).toBe('task-cmp_tds_oct');
    expect(errors).toEqual([]);
  });

  test('the checklist names who is blocking, links to them, and carries a hedged late-filing note', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot');
    await page.getByTestId('checks-cmp_pf_oct').click();
    const card = page.getByTestId('task-cmp_pf_oct');
    await expect(card.getByTestId('check-uan_missing')).toHaveAttribute('data-passed', 'no');
    await expect(card.getByTestId('check-uan_missing')).toContainText('No UAN. The ECR row is left out.');
    await expect(card.getByTestId('check-run')).toHaveAttribute('data-passed', 'yes');
    const link = card.getByRole('link', { name: 'Pooja Verma' });
    await expect(link).toHaveAttribute('href', '/dashboard/hrms/employees/emp_7?tab=statutory');
    await expect(card.getByText('If it is late')).toBeVisible();
    await expect(card.getByText(LATE_NOTE.pf)).toBeVisible();
    await expect(card.getByText('Sample, confirm')).toBeVisible();
    await expect(card.getByText(/Confirm pf rules with your advisor/)).toBeVisible();
    await page.getByTestId('checks-cmp_clra').click();
    await expect(page.getByTestId('task-cmp_clra').getByTestId('check-valid')).toContainText('Expired on 30 Apr 2026');
    await expect(page.getByTestId('task-cmp_clra').getByRole('link', { name: 'Update in Organization' })).toHaveAttribute('href', '/dashboard/hrms/organization');
  });

  test('prepare builds the ECR from the latest run, previews it and downloads exactly that text', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot');
    await page.getByTestId('prepare-cmp_pf_oct').click();
    const dlg = page.getByRole('dialog', { name: 'Prepare: PF contribution and ECR for October' });
    const ecr = buildEcr(seed, seed.payRuns.find((r) => r.id === 'run_2026-10_ent_retail')!);
    await expect(dlg).toContainText('ECR file');
    await expect(dlg.getByTestId('prepare-summary')).toContainText(`${ecr.rows} of 17 members`);
    await expect(dlg.getByTestId('prepare-issues')).toContainText('Pooja Verma');
    await expect(dlg.getByTestId('prepare-issues')).toContainText('Left out of the file');
    await expect(dlg.getByTestId('ecr-preview')).toContainText('#~#');
    await expect(dlg.getByTestId('ecr-preview')).toContainText('more rows');
    await expect(dlg).toContainText('2 blockers are still open');
    const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('prepare-download').click()]);
    expect(dl.suggestedFilename()).toBe('ECR-meridian-2026-10.txt');
    expect(readFileSync((await dl.path())!, 'utf8')).toBe(ecr.text);
  });

  test('a filing with no honest file is a checklist, and the checks that need a person are ticked by hand and kept', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot');
    await expect(page.getByTestId('readiness-cmp_posh')).toContainText('Readiness 0%');
    await page.getByTestId('prepare-cmp_posh').click();
    const dlg = page.getByRole('dialog', { name: /Prepare: POSH/ });
    await expect(dlg).toContainText('Checklist only');
    await expect(dlg).toContainText('no file, only the checklist');
    await expect(dlg.getByTestId('prepare-download')).toBeDisabled();
    await expect(dlg.getByTestId('prepare-download')).toHaveText('No file for this one');
    await dlg.getByRole('checkbox', { name: /Internal Committee is in place/ }).check();
    await expect(dlg.getByTestId('check-ic')).toHaveAttribute('data-passed', 'yes');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('readiness-cmp_posh')).toContainText('Readiness 33%');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('readiness-cmp_posh')).toContainText('Readiness 33%');
  });

  test('mark filed asks for a reference, moves the task to Filed with its evidence, and survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot');
    await page.getByTestId('file-cmp_tds_oct').click();
    const dlg = page.getByRole('dialog', { name: 'Mark as filed' });
    await dlg.getByTestId('file-confirm').click();
    await expect(dlg.getByText('Enter the challan or acknowledgement number.')).toBeVisible();
    await dlg.getByLabel('Reference').fill('x');
    await expect(dlg.getByText('A reference is at least 4 characters.')).toBeVisible();
    await dlg.getByLabel('Reference').fill('CHL-90210');
    await dlg.getByLabel('Challan or payment receipt').check();
    await dlg.getByLabel('Note').fill('Paid from the main account.');
    await dlg.getByTestId('file-confirm').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Filed, with evidence/ })).toHaveAttribute('aria-selected', 'true');
    const row = page.getByTestId('filed-table').getByRole('row', { name: /TDS deposit for October/ });
    await expect(row).toContainText('CHL-90210');
    await expect(row).toContainText('7 Nov 2026');
    await expect(row).toContainText('On time');
    await row.getByRole('button', { name: /Evidence pack/ }).click();
    const ev = page.getByRole('dialog', { name: 'Evidence pack' });
    await expect(ev.getByTestId('evidence-pack')).toContainText('CHL-90210');
    await expect(ev.getByTestId('evidence-pack')).toContainText('You (HR admin)');
    await expect(ev).toContainText('Challan or payment receipt');
    await expect(ev).toContainText('Note: Paid from the main account.');
    await expect(ev).toContainText('not the files themselves');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sum-ontime')).toContainText('4 of 4 filed');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('task-cmp_tds_oct')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /To file/ })).toContainText('9');
    // The same filing shows as filed on the Statutory page (one source of truth: the core compliance list).
    await page.goto('/dashboard/hrms/statutory?tab=calendar');
    await expect(page.getByTestId('task-cmp_tds_oct')).toContainText('CHL-90210', nav);
  });

  test('the filed list carries the seeded evidence, and a filing can be reopened', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot?tab=filed');
    const table = page.getByTestId('filed-table');
    await expect(table.getByRole('row')).toHaveCount(4);   // header and three filings
    await expect(table).toContainText('PF contribution and ECR for September');
    await table.getByRole('button', { name: 'Evidence pack: PF contribution and ECR for September' }).click();
    const ev = page.getByRole('dialog', { name: 'Evidence pack' });
    await expect(ev).toContainText('Neha Bansal');
    await expect(ev).toContainText('ECR text file');
    await expect(ev).toContainText('Two members were left out of the ECR');
    await expect(ev).toContainText('Filed on time');
    await ev.getByTestId('evidence-reopen').click();
    await page.getByRole('dialog', { name: 'Reopen this filing?' }).getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('tab', { name: /To file/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('task-cmp_pf_sep')).toBeVisible();
    await expect(page.getByTestId('task-cmp_pf_sep')).toContainText('late');
    await expect(page.getByTestId('sum-ontime')).toContainText('2 of 2 filed');
  });

  test('the 60-day calendar marks due dates and lists what falls on a clicked day', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/autopilot');
    const strip = page.getByTestId('calendar-strip');
    await expect(strip.locator('[data-testid^="cal-"]')).toHaveCount(weeksWithDue(seed));
    await strip.getByTestId('cal-2026-11-15').click();
    const day = page.getByTestId('calendar-day');
    await expect(day).toContainText('Due on 15 Nov 2026');
    await expect(day).toContainText('PF contribution and ECR for October (Meridian Logistics LLP)');
    await expect(day).toContainText('ESI contribution for October');
    await strip.getByTestId('cal-2026-12-31').click();
    await expect(page.getByTestId('calendar-day')).toContainText('POSH annual report');
    await expect(strip.getByRole('gridcell', { name: /7 Nov 2026.*today/ })).toBeVisible();
  });

  test('phone width: no horizontal page scroll on either tab, and the prepare dialog fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/autopilot');
    await expect(page.getByTestId('calendar-strip')).toBeVisible(nav);
    await noOverflowAt390(page, 'autopilot to file');
    await page.getByTestId('checks-cmp_pf_oct').click();
    await noOverflowAt390(page, 'autopilot checklist');
    await page.getByTestId('prepare-cmp_pf_oct').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflowAt390(page, 'autopilot prepare dialog');
    await page.keyboard.press('Escape');
    await tab(page, /Filed, with evidence/);
    await noOverflowAt390(page, 'autopilot filed');
  });
});

function weeksWithDue(db: ReturnType<typeof makeSeed>): number {
  return calendarWeeks(db).flat().filter((d) => d.inRange && d.tasks.length).length;
}

// ═══════════════════════════════════ monitoring ledger: UI ═══════════════════════════════════
test.describe('monitoring page', () => {
  const seed = fresh();
  const gps = consentCoverage(seed, seedControl().monitoring.rows.find((r) => r.id === 'mon_gps')!);

  test('lists every kind of monitoring with what is collected, why, who sees it and for how long', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/monitoring');
    await expect(page.getByRole('heading', { name: 'Monitoring ledger', level: 1 })).toBeVisible(nav);
    await expect(page.locator('[data-testid^="row-mon_"]')).toHaveCount(9);
    await expect(page.getByTestId('count-on')).toContainText('5');
    await expect(page.getByTestId('count-off')).toContainText('2');
    await expect(page.getByTestId('count-blocked')).toContainText('1');
    await expect(page.getByTestId('count-considering')).toContainText('1');
    const gpsRow = page.getByTestId('row-mon_gps');
    await expect(gpsRow).toContainText('GPS trail while punched in');
    await expect(gpsRow).toContainText('Field staff only');
    await expect(gpsRow).toContainText('The location of your phone every few minutes while you are punched in');
    await expect(gpsRow).toContainText('Your reporting manager');
    await expect(gpsRow).toContainText('90 days');
    await expect(gpsRow).toContainText('15 Sep 2026 by Tanvi Kapoor');
    await expect(gpsRow).toContainText('Consent');
    await expect(gpsRow).toContainText('Sample, confirm');
    await expect(gpsRow).toContainText('Advisor to confirm.');
    await expect(page.getByTestId('row-mon_email_scan')).toHaveAttribute('data-status', 'off');
    await expect(page.getByTestId('row-mon_screen')).toHaveAttribute('data-status', 'off');
    await expect(page.getByTestId('row-mon_keystroke')).toHaveAttribute('data-status', 'blocked');
    // The principle box.
    const principles = page.getByTestId('principles').locator('xpath=..');
    for (const t of ['Collect the least that does the job', 'Tell people', 'Keep it for a short time', 'Never use it to rank people']) await expect(principles).toContainText(t);
    expect(errors).toEqual([]);
  });

  test('a blocked practice cannot be turned on and says why', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/monitoring');
    const sw = page.getByTestId('switch-mon_keystroke');
    await expect(sw).toBeDisabled();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('blocked-mon_keystroke')).toContainText('Cannot be turned on.');
    await expect(page.getByTestId('blocked-mon_keystroke')).toContainText('Disproportionate for the purpose');
    await expect(page.getByTestId('blocked-mon_keystroke')).toContainText('Not offered.');
    await expect(page.getByRole('button', { name: /Turn on: Keystroke logging/ })).toHaveCount(0);
    await sw.click({ force: true }).catch(() => undefined);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('row-mon_keystroke')).toHaveAttribute('data-status', 'blocked');
  });

  test('turning something on needs a purpose, a retention period and a named reviewer, and writes a change log', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/monitoring');
    await page.getByRole('button', { name: 'Turn on: Screen capture' }).click();
    const dlg = page.getByRole('dialog', { name: 'Turn on: Screen capture' });
    await dlg.getByTestId('turnon-confirm').click();
    await expect(dlg.getByText('Say in a full sentence why this is needed (at least 15 characters).')).toBeVisible();
    await expect(dlg.getByText('Enter a whole number of days from 1 to 3650.')).toBeVisible();
    await expect(dlg.getByText('Name the person who will review this.')).toBeVisible();
    await expect(page.getByTestId('row-mon_screen')).toHaveAttribute('data-status', 'off');
    await dlg.getByLabel('Purpose').fill('Check how a shared kiosk is used during the audit.');
    await dlg.getByLabel('Keep the data for (days)').fill('120');
    await expect(dlg.getByText('That is longer than the policy window.')).toBeVisible();
    await dlg.getByLabel('Named reviewer').selectOption('Ritu Malhotra');
    await dlg.getByTestId('turnon-confirm').click();
    await expect(dlg).toHaveCount(0);
    const row = page.getByTestId('row-mon_screen');
    await expect(row).toHaveAttribute('data-status', 'on');
    await expect(row).toContainText('Check how a shared kiosk is used during the audit.');
    await expect(row).toContainText('120 days');
    await expect(row).toContainText('7 Nov 2026 by Ritu Malhotra');
    await expect(page.getByTestId('count-on')).toContainText('6');
    await expect(page.getByTestId('count-off')).toContainText('1');
    await expect(page.getByTestId('switch-mon_screen')).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('row-mon_screen')).toHaveAttribute('data-status', 'on');
    await tab(page, /Change log/);
    const log = page.getByTestId('monitoring-log');
    await expect(log).toContainText('Screen capture');
    await expect(log).toContainText('Turned on');
    await expect(log).toContainText('Reviewer: Ritu Malhotra');
    await expect(log).toContainText('You (HR admin)');
    // The seeded entries are still there, newest first.
    await expect(log.getByRole('row').nth(1)).toContainText('Screen capture');
    await expect(log).toContainText('Vehicle tracker on company trucks');
  });

  test('turning off asks first, stops collection and is logged; a proposal can be dropped', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/monitoring');
    await page.getByTestId('switch-mon_gps').click();
    await page.getByRole('dialog', { name: 'Turn off GPS trail while punched in?' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('row-mon_gps')).toHaveAttribute('data-status', 'on');
    await page.getByRole('button', { name: 'Turn off: GPS trail while punched in' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByTestId('row-mon_gps')).toHaveAttribute('data-status', 'off');
    await expect(page.getByTestId('count-on')).toContainText('4');
    await page.getByRole('button', { name: 'Decide not to use: Vehicle tracker on company trucks' }).click();
    await expect(page.getByTestId('row-mon_vehicle')).toHaveAttribute('data-status', 'off');
    await expect(page.getByTestId('count-considering')).toContainText('0');
    await tab(page, /Change log/);
    await expect(page.getByTestId('monitoring-log')).toContainText('Turned off');
    await expect(page.getByTestId('monitoring-log')).toContainText('Decided not to use');
    // Turning GPS back on is allowed again, with the same checks.
    await tab(page, 'Ledger');
    await page.getByRole('button', { name: 'Turn on: GPS trail while punched in' }).click();
    const dlg = page.getByRole('dialog', { name: /Turn on: GPS trail/ });
    await expect(dlg).toContainText('3 of 8 covered people have no current consent');
  });

  test('the employee notice is written from the ledger, can be copied, and changes with it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHrms(page, '/dashboard/hrms/monitoring?tab=notice');
    const notice = page.getByTestId('notice-text');
    await expect(notice).toContainText('How we use technology to see how work is done');
    await expect(notice).toContainText('1. GPS trail while punched in');
    await expect(notice).toContainText('How long we keep it: 90 days, then it is deleted');
    await expect(notice).toContainText('What we do not do');
    await expect(notice).toContainText('- Keystroke logging: we do not do this and we do not offer it.');
    await expect(notice).toContainText('What we are thinking about');
    await expect(notice).toContainText('We never use it to rank or score people.');
    await expect(page.getByText('Sample, confirm').first()).toBeVisible();
    await expect(page.getByText('have your advisor read it before you share it')).toBeVisible();
    const shown = await notice.innerText();
    await page.getByTestId('copy-notice').click();
    await expect(page.getByTestId('copy-notice')).toHaveText('Copied');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.replace(/\s+/g, ' ').trim()).toBe(shown.replace(/\s+/g, ' ').trim());
    expect(clip).toBe(noticeText(seedControl().monitoring.rows));
    // Turn off Odometer photo and it moves to the "do not do" list.
    await tab(page, 'Ledger');
    await page.getByRole('button', { name: 'Turn off: Odometer photo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    await tab(page, 'What an employee sees');
    await expect(page.getByTestId('notice-text')).not.toContainText('4. Odometer photo');
    await expect(page.getByTestId('notice-text')).toContainText('- Odometer photo: we do not do this.');
  });

  test('consent coverage counts current consents from the Privacy records and lists who is missing', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/monitoring?tab=consent');
    await expect(page.getByTestId('consent-count-mon_gps')).toContainText(`${gps.withConsent} of ${gps.covered} covered people have a current consent (63%)`);
    for (const id of ['emp_19', 'emp_20', 'emp_22']) await expect(page.getByTestId(`missing-mon_gps-${id}`)).toContainText('No consent on record.');
    await expect(page.getByTestId('missing-mon_gps-emp_6')).toHaveCount(0);
    await expect(page.getByTestId('missing-mon_gps-emp_19')).toContainText('Gaurav Saxena');
    // A consent that was withdrawn is told apart from one never given.
    await expect(page.getByTestId('missing-mon_kiosk-emp_4')).toContainText('Withdrew consent on 2 Sep 2026');
    await expect(page.getByTestId('consent-count-mon_kiosk')).toContainText('5 of 11');
    await expect(page.getByRole('tab', { name: /Consent coverage/ })).toContainText('9');
    // Employment-purpose practices say consent is not their basis.
    await expect(page.getByText('Practices where consent is not the stated basis')).toBeVisible();
    await expect(page.getByText(/Odometer photo.*employment purpose/)).toBeVisible();
    // Requesting consent is a simulation: it records, it does not send.
    await page.getByRole('button', { name: 'Request consent from Gaurav Saxena for GPS trail while punched in' }).click();
    await expect(page.getByTestId('missing-mon_gps-emp_19')).toContainText('Requested 7 Nov 2026 (simulation, nothing sent)');
    await expect(page.getByTestId('consent-mon_gps')).toContainText('Simulation');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('missing-mon_gps-emp_19')).toContainText('Requested 7 Nov 2026 (simulation, nothing sent)');
    await tab(page, /Change log/);
    await expect(page.getByTestId('monitoring-log')).toContainText('Consent request recorded (simulation)');
  });

  test('the retention check flags anything kept longer than its window, and the recommended action works', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/monitoring?tab=retention');
    await expect(page.getByRole('tab', { name: /Retention check/ })).toContainText('2');
    await expect(page.getByTestId('retention-flags')).toContainText('2 practices keep data longer than the window');
    const table = page.getByTestId('retention-table');
    await expect(table.getByRole('row', { name: /Visit photo with location/ })).toContainText('Over by 90 days');
    await expect(table.getByRole('row', { name: /Odometer photo/ })).toContainText('Over by 275 days');
    await expect(table.getByRole('row', { name: /GPS trail/ })).toContainText('Within the window');
    await expect(table.getByRole('row', { name: /GPS trail/ })).toContainText('Retention rule "Location trail" on the Privacy page');
    await expect(table.getByRole('row', { name: /Attendance kiosk photo/ })).toContainText('Within the window');
    await expect(table.getByRole('row', { name: /Visit photo with location/ })).toContainText('Shorten to 90 days, or write down why 180 days is needed.');
    await expect(page.getByText(/confirm them with your advisor/)).toBeVisible();
    await expect(page.getByText('Sample, confirm').first()).toBeVisible();
    // Shorten one: the flag clears, the ledger shows the new period, and the log says so.
    await page.getByTestId('shorten-mon_visit_photo').click();
    await expect(page.getByTestId('retention-flags')).toContainText('1 practice keeps data longer than the window');
    await expect(table.getByRole('row', { name: /Visit photo with location/ })).toContainText('Within the window');
    // Keep the other with a reason: it needs a full sentence.
    await page.getByTestId('keepreason-mon_odometer').click();
    const dlg = page.getByRole('dialog', { name: 'Why keep it longer?' });
    await dlg.getByTestId('keep-confirm').click();
    await expect(dlg.getByText('Write a full sentence (at least 15 characters).')).toBeVisible();
    await dlg.getByLabel('Reason').fill('Travel allowance audits look back a full year.');
    await dlg.getByTestId('keep-confirm').click();
    await expect(page.getByTestId('retention-flags')).toContainText('Every active practice is within its window');
    await expect(table.getByRole('row', { name: /Odometer photo/ })).toContainText('Longer, with a reason');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor(nav);
    await expect(page.getByTestId('retention-flags')).toContainText('Every active practice is within its window');
    await tab(page, 'Ledger');
    await expect(page.getByTestId('row-mon_visit_photo')).toContainText('90 days');
    await expect(page.getByTestId('row-mon_odometer')).toContainText('Kept longer because: Travel allowance audits look back a full year.');
    await tab(page, /Change log/);
    await expect(page.getByTestId('monitoring-log')).toContainText('Retention shortened');
    await expect(page.getByTestId('monitoring-log')).toContainText('From 180 days to 90 days.');
    await expect(page.getByTestId('monitoring-log')).toContainText('Longer retention justified');
  });

  test('phone width: no horizontal page scroll on any tab, and the turn-on dialog fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/monitoring');
    await expect(page.getByTestId('row-mon_gps')).toBeVisible(nav);
    await noOverflowAt390(page, 'monitoring ledger');
    for (const [name, probe] of [[/What an employee sees/, 'notice-text'], [/Consent coverage/, 'consent-mon_gps'], [/Retention check/, 'retention-table'], [/Change log/, 'monitoring-log']] as const) {
      await tab(page, name);
      await expect(page.getByTestId(probe)).toBeVisible();
      await noOverflowAt390(page, `monitoring ${probe}`);
    }
    await tab(page, 'Ledger');
    await page.getByRole('button', { name: 'Turn on: Screen capture' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflowAt390(page, 'monitoring dialog');
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

// A last cross-page check that nothing here reads or writes the real clock for what it shows.
test('every date these pages show comes from the preview date', async ({ page }) => {
  await openHrms(page, '/dashboard/hrms/autopilot');
  await expect(page.getByTestId('task-cmp_tds_oct')).toContainText('Due today');
  await page.goto('/dashboard/hrms/rule-radar');
  await expect(page.getByTestId('radar-when-lwf-karnataka')).toHaveText('Next applies 1 Dec 2026, in 24 days');
  expect(monthEnd(PREVIEW_TODAY.slice(0, 7))).toBe('2026-11-30');
});
