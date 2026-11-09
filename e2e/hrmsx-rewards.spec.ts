import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { inr } from '../src/lib/hrms/format';
import { PF, rowOn } from '../src/lib/hrms/rules';
import { makeRewardsSeed } from '../src/lib/hrms/rewards/seed';
import type { RewardsState } from '../src/lib/hrms/rewards/types';
import type { HrmsDb } from '../src/lib/hrms/types';
import {
  CLAIM_NEXT, MIN_GROUP, ageOn, agedAssets, bandPeople, basicMonthlyOf, bookValue, checkProposal, claimSla, claimsStatement, compaByGender, compaRatio, costByDepartment,
  cycleMembership, deductionPreview, duplicateIssue, enrolmentEligibility, enrolmentProgress, equityByGrade, financeSummary, groupMedian, meritTotals, newCtc, nextTag,
  pfImpact, planOf, positionInBand, quoteEnrolment, reconcileExit, recoveryAdvice, replayAsset, validateBand, validateDependants, validateGuideline, warrantyExpiring,
  windowStatus, zoneOf, baseCtcFor, median, type PfImpact,
} from '../src/lib/hrms/rewards/engines';
import type { Asset } from '../src/lib/hrms/rewards/types';

/**
 * Rewards: Assets, Benefits and Compensation. Two kinds of test:
 *  - pure checks of the engines behind the screens (no browser), and
 *  - browser flows on the seeded sample data, where changes are checked on screen, in the area store and, for the two writes into
 *    the core database (Send to payroll, Issue increment), on the pages that read that data (Payroll, Employees, Letters).
 */

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const AREA_KEY = 'kinematic_hrms_area_rewards_v1';
const DB_KEY = 'kinematic_hrms_preview_v3';
const seed: RewardsState = makeRewardsSeed();
const core: HrmsDb = makeSeed();
const TODAY = PREVIEW_TODAY;
const COVER = '2027-01-01';

const readArea = (page: Page): Promise<RewardsState> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), AREA_KEY);
const readDb = (page: Page): Promise<HrmsDb> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);
async function reload(page: Page) {
  await page.reload();
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
async function patchArea(page: Page, fn: string) {
  // fn is the body of a function (s) => void, run in the page on the stored area state
  await page.evaluate(([k, body]) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null');
    new Function('s', body)(s);
    localStorage.setItem(k, JSON.stringify(s));
  }, [AREA_KEY, fn]);
}
/** Page errors and console errors, ignoring resource-load noise that has nothing to do with the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_/.test(m.text())) errors.push(m.text()); });
  return errors;
}
const emp = (id: string) => core.employees.find((e) => e.id === id)!;
const tab = (page: Page, name: string | RegExp) => page.getByRole('tab', { name });
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const asset = (tag: string): Asset => seed.assets.items.find((a) => a.tag === tag)!;

// ═════════════════════════════ pure checks: Assets ═════════════════════════════
test.describe('assets engine (no browser)', () => {
  test('the seed is deterministic, has about 40 unique assets, and never an event without an asset', () => {
    expect(makeRewardsSeed()).toEqual(makeRewardsSeed());
    const items = seed.assets.items;
    expect(items.length).toBeGreaterThanOrEqual(40);
    expect(items.length).toBeLessThanOrEqual(48);
    expect(new Set(items.map((a) => a.tag)).size).toBe(items.length);
    expect(new Set(items.map((a) => a.serial)).size).toBe(items.length);
    expect(seed.assets.events.every((e) => items.some((a) => a.id === e.assetId))).toBe(true);
    for (const t of ['laptop', 'phone', 'sim', 'vehicle', 'id_card', 'uniform', 'tool'] as const) expect(items.some((a) => a.type === t), t).toBe(true);
    for (const s of ['in_stock', 'issued', 'in_repair', 'lost', 'retired'] as const) expect(items.some((a) => a.status === s), s).toBe(true);
  });

  test('book value is straight line over the stated life, in whole months, never below zero', () => {
    // A laptop (4-year life) bought for 80,000 is worth half after 24 months.
    expect(bookValue({ cost: 80000, purchaseDate: '2024-11-07', type: 'laptop' }, '2026-11-07')).toBe(40000);
    // A phone (3-year life): 18 of 36 months used.
    expect(bookValue({ cost: 36000, purchaseDate: '2025-05-07', type: 'phone' }, '2026-11-07')).toBe(18000);
    // Not yet a whole month: full cost. After the life: zero, and it stays zero.
    expect(bookValue({ cost: 50000, purchaseDate: '2026-10-08', type: 'laptop' }, '2026-11-07')).toBe(50000);
    expect(bookValue({ cost: 50000, purchaseDate: '2020-01-01', type: 'laptop' }, '2026-11-07')).toBe(0);
    expect(bookValue({ cost: 50000, purchaseDate: '2026-11-07', type: 'laptop' }, '2026-11-07')).toBe(50000);
  });

  test('recovery advice is the book value on the date, with a stated basis, and is only a number', () => {
    const a = asset('AST-PHN-005'); // 22,000 phone bought 28 May 2024
    const adv = recoveryAdvice(a, '2026-11-30');
    expect(adv.monthsUsed).toBe(30);
    expect(adv.lifeYears).toBe(3);
    expect(adv.recommended).toBe(adv.bookValue);
    expect(adv.recommended).toBe(Math.round(22000 * (1 - 30 / 36)));
    expect(adv.basis).toContain('30 of 36 months');
    expect(Object.keys(adv).sort()).toEqual(['basis', 'bookValue', 'lifeYears', 'monthsUsed', 'recommended']);
  });

  test('warranty ending within 60 days, and assets older than four years, come out of the seed as designed', () => {
    expect(warrantyExpiring(seed.assets.items, TODAY, 60).map((a) => a.tag)).toEqual(['AST-PHN-006', 'AST-LAP-001', 'AST-PHN-007', 'AST-TLS-001']);
    expect(agedAssets(seed.assets.items, TODAY, 4).map((a) => a.tag)).toEqual(['AST-VEH-003', 'AST-VEH-002', 'AST-LAP-006', 'AST-LAP-005', 'AST-TLS-004']);
    // Lost and retired assets never appear in either list.
    const bad = seed.assets.items.map((a) => ({ ...a, status: 'retired' as const }));
    expect(warrantyExpiring(bad, TODAY)).toEqual([]);
    expect(agedAssets(bad, TODAY)).toEqual([]);
    // A warranty that ended yesterday is not "expiring".
    expect(warrantyExpiring([{ ...asset('AST-LAP-001'), warrantyEnd: '2026-11-06' }], TODAY)).toEqual([]);
    expect(warrantyExpiring([{ ...asset('AST-LAP-001'), warrantyEnd: '2026-11-07' }], TODAY)).toHaveLength(1);
  });

  test('a second single-issue asset of the same type is flagged; uniforms and tools are not', () => {
    const items = seed.assets.items;
    const spare = asset('AST-LAP-009');
    expect(duplicateIssue(items, 'emp_4', spare)?.tag).toBe('AST-LAP-012');       // Rohit already has a laptop
    expect(duplicateIssue(items, 'emp_20', spare)).toBeUndefined();                // Farhan has none
    expect(duplicateIssue(items, 'emp_13', asset('AST-UNI-004'))).toBeUndefined(); // a second uniform set is fine
    expect(duplicateIssue(items, 'emp_13', asset('AST-TLS-004'))).toBeUndefined();
    expect(duplicateIssue(items, 'emp_5', asset('AST-LAP-001'))).toBeUndefined();  // the asset itself does not count
  });

  test('history is the source of truth: replaying it reproduces every stored status and holder', () => {
    for (const a of seed.assets.items) {
      const r = replayAsset(seed.assets.events, a.id)!;
      expect(r.status, a.tag).toBe(a.status);
      expect(r.holderId, a.tag).toBe(a.status === 'issued' ? a.holderId : undefined);
    }
    // Events never go backwards in time for one asset.
    for (const a of seed.assets.items) {
      const dates = seed.assets.events.filter((e) => e.assetId === a.id).map((e) => e.on);
      expect([...dates].sort()).toEqual(dates);
    }
  });

  test('exit reconciliation: every state, strong matches first, nothing invented', () => {
    const phone = { ...asset('AST-PHN-005') };                        // issued to emp_22, serial ends 4471
    const core1 = [{ id: 'c1', name: 'Android phone (IMEI ending 4471)', returned: false }];
    expect(reconcileExit([phone], 'emp_22', core1)[0]!.state).toBe('return_pending');
    expect(reconcileExit([phone], 'emp_22', [{ ...core1[0]!, returned: true }])[0]!.state).toBe('checklist_returned_register_open');
    const back = { ...phone, status: 'in_stock' as const, holderId: undefined };
    expect(reconcileExit([back], 'emp_22', core1)[0]!.state).toBe('register_returned_checklist_open');
    expect(reconcileExit([back], 'emp_22', [{ ...core1[0]!, returned: true }])[0]!.state).toBe('both_returned');
    // Held but nothing on the checklist; on the checklist but not in the register.
    const rows = reconcileExit([phone, asset('AST-SIM-003')], 'emp_22', core1);
    expect(rows.map((r) => r.state)).toEqual(['return_pending', 'not_on_checklist']);
    expect(reconcileExit([], 'emp_22', core1).map((r) => r.state)).toEqual(['checklist_only']);
    expect(reconcileExit([phone], 'emp_22', undefined).map((r) => r.state)).toEqual(['not_on_checklist']);
    // A tag in the checklist text wins over a mere "laptop" mention.
    const l1 = { ...asset('AST-LAP-009'), status: 'issued' as const, holderId: 'emp_22' };
    const l2 = { ...asset('AST-LAP-010'), status: 'issued' as const, holderId: 'emp_22' };
    const pairs = reconcileExit([l1, l2], 'emp_22', [{ id: 'c9', name: `Laptop ${l2.tag}`, returned: false }]);
    expect(pairs.find((r) => r.asset?.tag === l2.tag)!.core?.id).toBe('c9');
    expect(pairs.find((r) => r.asset?.tag === l1.tag)!.state).toBe('not_on_checklist');
  });

  test('cost by department adds up to the cost of every usable asset', () => {
    const dept = (id: string) => core.departments.find((d) => d.id === emp(id).departmentId)?.name;
    const rows = costByDepartment(seed.assets.items, dept, TODAY);
    const usable = seed.assets.items.filter((a) => a.status !== 'retired' && a.status !== 'lost');
    expect(rows.reduce((s, r) => s + r.cost, 0)).toBe(usable.reduce((s, a) => s + a.cost, 0));
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(usable.length);
    expect(rows.reduce((s, r) => s + r.book, 0)).toBe(usable.reduce((s, a) => s + bookValue(a, TODAY), 0));
    expect(rows.map((r) => r.cost)).toEqual([...rows.map((r) => r.cost)].sort((a, b) => b - a));
    expect(rows.some((r) => r.name === 'Not issued')).toBe(true);
  });

  test('tags continue the sequence per type', () => {
    expect(nextTag(seed.assets.items, 'laptop')).toBe('AST-LAP-013');
    expect(nextTag([], 'tool')).toBe('AST-TLS-001');
  });
});

// ═════════════════════════════ pure checks: Benefits ═════════════════════════════
const health = planOf(seed.benefits.plans, 'health')!;
test.describe('benefits engine (no browser)', () => {
  test('age is counted in whole years on the cover start date', () => {
    expect(ageOn('2014-05-03', COVER)).toBe(12);
    expect(ageOn('2001-01-02', COVER)).toBe(25);
    expect(ageOn('2001-01-01', COVER)).toBe(26);
    expect(ageOn('2027-02-01', COVER)).toBe(0);
  });

  test('dependant rules: children to 25, parents to 80, plan limits, names and dates', () => {
    const rules = health.dependants!;
    const d = (name: string, relation: 'spouse' | 'child' | 'parent', dob: string, id = name) => ({ id, name, relation, dob });
    expect(validateDependants(rules, [d('A', 'child', '2001-01-02')], COVER)).toEqual([]);
    expect(validateDependants(rules, [d('A', 'child', '2000-12-31')], COVER).join(' ')).toContain('Children are covered up to 25');
    expect(validateDependants(rules, [d('P', 'parent', '1946-01-01')], COVER).join(' ')).toContain('Parents are covered up to 80');
    expect(validateDependants(rules, [d('P', 'parent', '1947-01-01')], COVER)).toEqual([]);
    expect(validateDependants(rules, [d('a', 'child', '2015-01-01'), d('b', 'child', '2016-01-01'), d('c', 'child', '2017-01-01')], COVER).join(' ')).toContain('2 children at most');
    expect(validateDependants(rules, [d('a', 'spouse', '1990-01-01'), d('b', 'spouse', '1991-01-01')], COVER).join(' ')).toContain('1 spouse at most');
    expect(validateDependants(rules, [d('a', 'parent', '1960-01-01'), d('b', 'parent', '1961-01-01'), d('c', 'parent', '1962-01-01')], COVER).join(' ')).toContain('2 parents at most');
    expect(validateDependants(rules, [d('', 'spouse', '1990-01-01')], COVER).join(' ')).toContain('Add a name');
    expect(validateDependants(rules, [d('X', 'child', 'not a date')], COVER).join(' ')).toContain('valid date of birth');
    expect(validateDependants(rules, [d('X', 'child', '2027-06-01')], COVER).join(' ')).toContain('after the cover starts');
  });

  test('a dependant record holds a name, relation and date of birth, and nothing like an ID number', () => {
    for (const e of seed.benefits.enrolments) for (const dep of e.dependants) expect(Object.keys(dep).sort()).toEqual(['dob', 'id', 'name', 'relation']);
  });

  test('premium split: the company share is applied per line and the two sides add up', () => {
    const deps = [
      { id: 'd1', name: 'S', relation: 'spouse' as const, dob: '1990-01-01' }, { id: 'd2', name: 'C', relation: 'child' as const, dob: '2015-01-01' },
      { id: 'd3', name: 'P1', relation: 'parent' as const, dob: '1960-01-01' }, { id: 'd4', name: 'P2', relation: 'parent' as const, dob: '1961-01-01' },
    ];
    const q = quoteEnrolment(seed.benefits.plans, { status: 'enrolled', healthTier: 'h5', dependants: deps, flex: {} }, 0);
    // Employee 7,400 at 100% company; spouse 7,400 at 50%; child 3,600 at 50%; parents 2 x 16,800 at 0%. Plus accident 900 at 100%.
    expect(q.employeeMonthly).toBe(Math.round((3700 + 1800 + 33600) / 12));
    expect(q.employerMonthly).toBe(Math.round((7400 + 3700 + 1800 + 900) / 12));
    expect(q.totalMonthly).toBe(q.employeeMonthly + q.employerMonthly);
    for (const l of q.lines) expect(l.employeeAnnual + l.employerAnnual).toBeCloseTo(l.annual, 5);
    // Meal coupons come entirely off the employee's pay; NPS is a share of basic and costs the company nothing extra.
    const q2 = quoteEnrolment(seed.benefits.plans, { status: 'enrolled', healthTier: 'h5', dependants: deps, mealTier: 'm2', npsTier: 'n10', flex: {} }, 50000);
    expect(q2.byPlan.meal).toEqual({ employee: 2200, employer: 0 });
    expect(q2.byPlan.nps).toEqual({ employee: 5000, employer: 0 });
    expect(q2.employerMonthly).toBe(q.employerMonthly);
    // A waived person still gets the automatic accident cover, and nothing else.
    const q3 = quoteEnrolment(seed.benefits.plans, { status: 'waived', dependants: [], flex: {} }, 50000);
    expect(q3.employeeMonthly).toBe(0);
    expect(q3.employerMonthly).toBe(75);
  });

  test('the window opens today and runs 14 days; the edges are exact', () => {
    const w = seed.benefits.window;
    expect(w.opensOn).toBe(TODAY);
    expect(w.closesOn).toBe('2026-11-21');
    expect(windowStatus(w, TODAY)).toMatchObject({ state: 'open', daysLeft: 14 });
    expect(windowStatus(w, '2026-11-21')).toMatchObject({ state: 'open', daysLeft: 0 });
    expect(windowStatus(w, '2026-11-22').state).toBe('closed');
    expect(windowStatus(w, '2026-11-06').state).toBe('not_open');
  });

  test('eligibility and progress: leavers and joiners are not counted, the departments add up', () => {
    const elig = (id: string) => enrolmentEligibility(emp(id), COVER);
    expect(elig('emp_22').eligible).toBe(false);   // on notice, leaves 30 Nov
    expect(elig('emp_24').eligible).toBe(false);   // joins 16 Nov
    expect(elig('emp_23').eligible).toBe(false);   // exited
    expect(elig('emp_5').eligible).toBe(true);
    const p = enrolmentProgress(core, seed.benefits.enrolments, COVER);
    expect(p.total).toMatchObject({ eligible: 21, enrolled: 11, waived: 1, pending: 9, pct: 57 });
    expect(p.pendingIds).toHaveLength(9);
    expect(p.pendingIds).not.toContain('emp_22');
    expect(p.rows.reduce((s, r) => s + r.eligible, 0)).toBe(21);
    expect(p.rows.every((r) => r.enrolled + r.waived + r.pending === r.eligible)).toBe(true);
  });

  test('claims ageing against the sample turnaround: open claims age to today, closed ones stop at the closing date', () => {
    const c = (kind: 'cashless' | 'reimbursement', filedOn: string, status: 'submitted' | 'settled' | 'rejected', closedOn?: string) => claimSla({ kind, filedOn, status, closedOn }, TODAY);
    expect(c('cashless', '2026-11-05', 'submitted')).toMatchObject({ tat: 3, age: 2, state: 'on_track' });
    expect(c('cashless', '2026-11-04', 'submitted')).toMatchObject({ age: 3, state: 'at_risk' });
    expect(c('cashless', '2026-11-03', 'submitted')).toMatchObject({ age: 4, state: 'breached' });
    expect(c('reimbursement', '2026-10-27', 'submitted')).toMatchObject({ tat: 15, age: 11, state: 'at_risk' });
    expect(c('reimbursement', '2026-10-28', 'submitted').state).toBe('on_track');
    expect(c('reimbursement', '2026-10-11', 'submitted')).toMatchObject({ age: 27, state: 'breached' });
    expect(c('reimbursement', '2026-09-18', 'settled', '2026-10-06')).toMatchObject({ age: 18, state: 'missed' });
    expect(c('reimbursement', '2026-09-12', 'settled', '2026-09-25')).toMatchObject({ age: 13, state: 'met' });
    expect(c('cashless', '2026-10-14', 'rejected', '2026-10-16').state).toBe('met');
  });

  test('claim status flow only moves forward, a rejection can be reopened, a settled claim is final', () => {
    expect(CLAIM_NEXT.submitted).toEqual(['in_review', 'rejected']);
    expect(CLAIM_NEXT.approved).toEqual(['settled']);
    expect(CLAIM_NEXT.settled).toEqual([]);
    expect(CLAIM_NEXT.rejected).toEqual(['in_review']);
    for (const s of Object.keys(CLAIM_NEXT) as (keyof typeof CLAIM_NEXT)[]) expect(CLAIM_NEXT[s]).not.toContain('submitted');
  });

  test('the family-floater statement: approved and settled count, rejected do not, pending shows separately', () => {
    const ritu = claimsStatement(seed.benefits.claims, 'emp_1', 1000000);
    expect(ritu).toMatchObject({ paid: 46500 + 61000, inProcess: 0, availableNow: 1000000 - 107500 });
    const vikram = claimsStatement(seed.benefits.claims, 'emp_10', 500000);
    expect(vikram).toMatchObject({ paid: 165000, availableNow: 335000 });                    // approved, awaiting payment
    const neha = claimsStatement(seed.benefits.claims, 'emp_3', 300000);
    expect(neha).toMatchObject({ paid: 0, inProcess: 36800, availableNow: 300000, availableIfAllPaid: 300000 - 36800 });
    const manoj = claimsStatement(seed.benefits.claims, 'emp_12', 300000);                   // one rejected claim
    expect(manoj).toMatchObject({ paid: 0, inProcess: 0, availableNow: 300000 });
  });

  test('payroll deduction preview: each person is the sum of their own plan shares', () => {
    const rows = deductionPreview(core, seed.benefits.plans, seed.benefits.enrolments, TODAY, COVER);
    const ritu = rows.find((r) => r.employeeId === 'emp_1')!;
    // Health 10 lakh: spouse 5,950 + children 5,200 + parent 26,500 = 37,650 a year. Meal 1,100. NPS 5% of a basic of 100,000.
    expect(ritu).toMatchObject({ health: 3138, meal: 1100, nps: 5000, total: 9238 });
    const arvind = rows.find((r) => r.employeeId === 'emp_2')!;
    expect(arvind).toMatchObject({ health: 3258, meal: 0, nps: 8750, total: 12008 });
    expect(basicMonthlyOf(core, emp('emp_2'), TODAY)).toBe(87500);
    expect(rows.every((r) => r.total === r.health + r.meal + r.nps)).toBe(true);
    expect(rows.some((r) => r.employeeId === 'emp_22' || r.employeeId === 'emp_24')).toBe(false);
  });
});

// ═════════════════════════════ pure checks: Compensation ═════════════════════════════
const cyc = seed.comp.cycle;
const bands = seed.comp.bands;
const people = bandPeople(core, bands);
const compaOf = (id: string) => people.find((p) => p.employee.id === id)!;
test.describe('compensation engine (no browser)', () => {
  test('compa-ratio, position in band and zones', () => {
    expect(compaRatio(720000, 600000)).toBe(1.2);
    expect(compaRatio(540000, 600000)).toBe(0.9);
    expect(positionInBand(288000, bands.find((b) => b.grade === 'E1')!)).toBe('below');
    expect(positionInBand(300000, bands.find((b) => b.grade === 'E1')!)).toBe('in');
    expect(positionInBand(400000, bands.find((b) => b.grade === 'E1')!)).toBe('in');
    expect(positionInBand(720000, bands.find((b) => b.grade === 'E2')!)).toBe('above');
    expect([zoneOf(0.89), zoneOf(0.9), zoneOf(1.1), zoneOf(1.11)]).toEqual(['low', 'mid', 'mid', 'high']);
  });

  test('bands are built from the core designations, and leavers and joiners without CTC are left out', () => {
    expect(people).toHaveLength(22);
    expect(people.some((p) => ['emp_23', 'emp_24', 'emp_25'].includes(p.employee.id))).toBe(false);
    expect(compaOf('emp_3').position).toBe('above');
    expect(compaOf('emp_22').position).toBe('below');
    expect(people.filter((p) => p.position !== 'in')).toHaveLength(2);
    expect(compaOf('emp_1')).toMatchObject({ grade: 'M3', compa: 1 });
    for (const d of core.designations) expect(bands.some((b) => b.grade === d.grade), d.name).toBe(true);
  });

  test('a group statistic is released only for five people or more, and a withheld one carries no number', () => {
    expect(MIN_GROUP).toBe(5);
    const four = groupMedian([1, 2, 3, 4]);
    expect(four.shown).toBe(false);
    expect('median' in four).toBe(false);
    expect(groupMedian([10, 20, 30, 40, 50])).toEqual({ shown: true, n: 5, median: 30 });
    expect(groupMedian([10, 20, 30, 40, 50, 60])).toMatchObject({ shown: true, median: 35 });
    expect(groupMedian([])).toEqual({ shown: false, n: 0 });
  });

  test('equity signals: inside a grade every gender group of this company is under five, so nothing is shown; compa-ratio by gender is', () => {
    const eq = equityByGrade(people, bands.map((b) => b.grade));
    expect(eq).toHaveLength(6);
    for (const r of eq) { expect(r.women.shown, r.label).toBe(false); expect(r.men.shown, r.label).toBe(false); }
    const g = compaByGender(people);
    expect(g.women).toMatchObject({ shown: true, n: 10 });
    expect(g.men).toMatchObject({ shown: true, n: 12 });
    // Add enough people to one grade and the grade-level figure appears.
    const many = Array.from({ length: 5 }, (_, i) => ({ ...compaOf('emp_6'), ctc: 500000 + i * 1000, employee: { ...emp('emp_6'), id: `x${i}`, gender: 'female' as const } }));
    expect(equityByGrade(many, ['E2'])[0]!.women).toMatchObject({ shown: true, n: 5, median: 502000 });
  });

  test('new CTC rounds to the nearest 100 and the guidance check follows the rating and the compa zone', () => {
    expect(newCtc(960000, 10)).toBe(1056000);
    expect(newCtc(252000, 9)).toBe(274700);
    expect(newCtc(222000, 4)).toBe(230900);
    const g = cyc.guidelines;
    const w1 = bands.find((b) => b.grade === 'W1')!;
    const rekha = checkProposal(222000, w1, 'meets', g, { pct: 4 });            // compa 0.89: low zone, meets = 6 to 9
    expect(rekha.guide).toEqual({ min: 6, max: 9 });
    expect(rekha).toMatchObject({ outside: true, needsReason: true });
    expect(checkProposal(222000, w1, 'meets', g, { pct: 4, reason: 'Taking on a lead role' })).toMatchObject({ outside: true, needsReason: false });
    expect(checkProposal(222000, w1, 'meets', g, { pct: 7 })).toMatchObject({ outside: false, needsReason: false });
    expect(checkProposal(216000, w1, 'unrated', g, { pct: 8 })).toMatchObject({ outside: true, needsReason: true }); // unrated low = 3 to 5
    expect(checkProposal(216000, w1, undefined, g, undefined)).toMatchObject({ outside: false, delta: 0 });
    expect(checkProposal(720000, bands.find((b) => b.grade === 'E2')!, 'exceeds', g, { pct: 5 }).aboveMax).toBe(true);
  });

  test('guideline and band validation', () => {
    expect(validateGuideline(2, 4)).toBeNull();
    expect(validateGuideline(5, 4)).toContain('cannot be above');
    expect(validateGuideline(-1, 4)).toContain('0 to 50');
    expect(validateGuideline(0, 60)).toContain('0 to 50');
    expect(validateBand({ min: 100, mid: 150, max: 200, market: 160 })).toBeNull();
    expect(validateBand({ min: 200, mid: 150, max: 300, market: 160 })).toContain('minimum must be below');
    expect(validateBand({ min: 100, mid: 150, max: 400, market: 160 })).toContain('2.5 times');
    expect(validateBand({ min: 0, mid: 150, max: 200, market: 160 })).toContain('positive');
  });

  test('who is in the cycle, and why the others are not', () => {
    const m = cycleMembership(core, cyc);
    const inCycle = m.filter((x) => x.included).map((x) => x.employee.id);
    expect(inCycle).toEqual(Array.from({ length: 20 }, (_, i) => `emp_${i + 1}`));
    const why = (id: string) => m.find((x) => x.employee.id === id)?.reason ?? '';
    expect(why('emp_21')).toContain('Contract ends');
    expect(why('emp_22')).toContain('Serving notice');
    expect(why('emp_24')).toContain('not joined');
    expect(m.some((x) => x.employee.id === 'emp_23')).toBe(false);                     // exited people are not listed at all
    // Moving the effective date back past a join date drops that person.
    const early = cycleMembership(core, { effectiveOn: '2025-01-01' }).filter((x) => x.included).length;
    expect(early).toBeLessThan(20);
  });

  test('merit totals: the seeded proposals come to 8,97,300 against a budget of 11,96,480', () => {
    const members = cycleMembership(core, cyc).filter((x) => x.included);
    const rows = members.map((m) => {
      const e = m.employee;
      const band = bands.find((b) => b.grade === core.designations.find((d) => d.id === e.designationId)!.grade)!;
      const p = cyc.proposals[e.id];
      const chk = checkProposal(baseCtcFor(e, cyc), band, seed.comp.perf[e.id], cyc.guidelines, p);
      return { base: baseCtcFor(e, cyc), delta: p ? chk.delta : 0, hasProposal: !!p };
    });
    expect(meritTotals(rows, cyc.budgetPct)).toMatchObject({ payroll: 14956000, budget: 1196480, proposed: 897300, remaining: 299180, withProposal: 15, people: 20, over: false });
    expect(meritTotals(rows, 5)).toMatchObject({ budget: 747800, over: true });
    expect(meritTotals([], 8)).toMatchObject({ payroll: 0, budget: 0, usedPct: 0, avgPct: 0 });
  });

  test('employer PF impact uses the payroll engine: nothing at the ceiling, 12% on actual wages, 1% off-CTC below it', () => {
    const asOn = cyc.effectiveOn;
    expect(valueOnCeiling(asOn)).toBe(25000);
    // Neha's PF wage is already above the 25,000 ceiling, so a raise adds no PF.
    const neha = pfImpact(core, emp('emp_3'), 720000, newCtc(720000, 5), asOn)!;
    expect(neha).toMatchObject({ epfErDelta: 0, offCtcDelta: 0, atCeiling: true });
    // Ritu contributes on actual wages: basic 100,000 to 105,000 is a PF wage change of 5,000, so 12% = 600 a month.
    const ritu = pfImpact(core, emp('emp_1'), 2400000, 2520000, asOn)!;
    expect(ritu).toMatchObject({ pfWageBefore: 100000, pfWageAfter: 105000, epfErDelta: 7200, offCtcDelta: 0, atCeiling: false, ctcDelta: 120000 });
    // Manoj is below the ceiling: employer PF moves 12% of the wage change, EDLI and admin 1% (outside CTC).
    const manoj = pfImpact(core, emp('emp_12'), 252000, 274700, asOn)!;
    const dw = manoj.pfWageAfter - manoj.pfWageBefore;
    expect(dw).toBeGreaterThan(0);
    expect(Math.abs(manoj.epfErDelta - dw * 0.12 * 12)).toBeLessThanOrEqual(2);
    expect(Math.abs(manoj.offCtcDelta - dw * 0.01 * 12)).toBeLessThanOrEqual(2);
    expect(manoj.atCeiling).toBe(false);
    expect(rowOn(PF.ceiling, asOn).confidence).toBe('reported');
  });

  test('finance summary: the pool plus the off-CTC charges, monthly is a twelfth', () => {
    const impacts: (PfImpact | null)[] = [
      { ctcDelta: 120000, epfErDelta: 7200, offCtcDelta: 0, pfWageBefore: 0, pfWageAfter: 0, atCeiling: false },
      { ctcDelta: 22700, epfErDelta: 1770, offCtcDelta: 150, pfWageBefore: 0, pfWageAfter: 0, atCeiling: false },
      null,
    ];
    const s = financeSummary(impacts, [120000, 22700, 5000, 0]);
    expect(s).toMatchObject({ ctcAnnual: 147700, epfAnnual: 8970, offCtcAnnual: 150, totalAnnual: 147850, totalMonthly: Math.round(147850 / 12), people: 3, noStructure: 1 });
  });

  test('every market figure is a sample the UI tags, and no band overlaps a nonsense order', () => {
    for (const b of bands) { expect(b.min).toBeLessThan(b.mid); expect(b.mid).toBeLessThan(b.max); expect(validateBand(b)).toBeNull(); }
    expect(bands.filter((b) => b.published)).toHaveLength(5);
  });
});
function valueOnCeiling(on: string): number { return rowOn(PF.ceiling, on).value; }

// ═════════════════════════════ ASSETS: browser ═════════════════════════════
test.describe('assets page', () => {
  test('renders the seeded register, the stats and the tabs without console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/assets');
    await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
    const usable = seed.assets.items.filter((a) => a.status !== 'retired' && a.status !== 'lost');
    const stats = page.getByTestId('assets-stats');
    await expect(stats).toContainText(String(usable.length));
    await expect(stats).toContainText(inr(usable.reduce((s, a) => s + bookValue(a, TODAY), 0)));
    await expect(stats).toContainText('Warranty ends in 60 days');
    await expect(page.getByTestId('asset-count')).toHaveText(`Showing ${seed.assets.items.length} of ${seed.assets.items.length} assets`);
    for (const name of ['Inventory', 'People', 'Leavers', 'Insights']) await expect(tab(page, new RegExp(name))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('search and filters narrow the list, and clear filters restores it', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    const count = page.getByTestId('asset-count');
    await page.getByLabel('Filter by type').selectOption('laptop');
    await expect(count).toHaveText(`Showing ${seed.assets.items.filter((a) => a.type === 'laptop').length} of ${seed.assets.items.length} assets`);
    await page.getByLabel('Filter by status').selectOption('in_stock');
    await expect(count).toHaveText(`Showing ${seed.assets.items.filter((a) => a.type === 'laptop' && a.status === 'in_stock').length} of ${seed.assets.items.length} assets`);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(count).toHaveText(`Showing ${seed.assets.items.length} of ${seed.assets.items.length} assets`);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('divya');
    await expect(count).toHaveText(`Showing 1 of ${seed.assets.items.length} assets`);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('zzzz-nothing');
    await expect(page.getByText('No asset matches these filters.')).toBeVisible();
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('');
    await page.getByLabel('Warranty ends in 60 days').check();
    await expect(count).toHaveText(`Showing 4 of ${seed.assets.items.length} assets`);
  });

  test('issuing a spare laptop to someone who has one warns, needs the acknowledgement, and is recorded with it', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await page.getByRole('button', { name: 'Open AST-LAP-009' }).click();
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    const d = dialog(page, 'Issue asset');
    const issue = d.getByRole('button', { name: 'Issue asset' });
    await expect(issue).toBeDisabled();                                       // no person yet
    await d.getByLabel('Issue to').selectOption('emp_20');                   // Farhan has no laptop
    await expect(page.getByTestId('duplicate-warning')).toHaveCount(0);
    await d.getByLabel('Issue to').selectOption('emp_4');                    // Rohit already holds AST-LAP-012
    await expect(page.getByTestId('duplicate-warning')).toContainText('already holds a laptop');
    await expect(page.getByTestId('duplicate-warning')).toContainText('AST-LAP-012');
    await expect(issue).toBeDisabled();                                       // still no acknowledgement
    await expect(d.getByText('I have received AST-LAP-009 Dell Latitude 3440 in working condition.')).toBeVisible();
    await d.getByTestId('ack-check').check();
    await expect(issue).toBeEnabled();
    await issue.click();
    await expect(d).toHaveCount(0);
    const st = await readArea(page);
    const a = st.assets.items.find((x) => x.tag === 'AST-LAP-009')!;
    expect(a).toMatchObject({ status: 'issued', holderId: 'emp_4' });
    const last = st.assets.events.filter((e) => e.assetId === a.id).pop()!;
    expect(last).toMatchObject({ kind: 'issued', toId: 'emp_4', ack: true, status: 'issued', on: TODAY });
    await reload(page);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('AST-LAP-009');
    await expect(page.getByRole('row', { name: /AST-LAP-009/ })).toContainText('Rohit Chauhan');
    await expect(page.getByRole('row', { name: /AST-LAP-009/ })).toContainText('Issued');
  });

  test('a return needs a condition check and says when the item is worse than it was', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await page.getByRole('button', { name: 'Open AST-LAP-005' }).click();    // Ritu's laptop, recorded as fair when issued
    await page.getByRole('button', { name: 'Record return' }).click();
    const d = dialog(page, 'Record return');
    const go = d.getByRole('button', { name: 'Record return' });
    await expect(go).toBeDisabled();
    await d.getByLabel('Condition on return').selectOption('new');                    // it was issued as new
    await expect(d.getByText(/worse than when it was issued/)).toHaveCount(0);
    await d.getByLabel('Condition on return').selectOption('damaged');
    await expect(d.getByText(/worse than when it was issued/)).toBeVisible();
    await expect(d.getByLabel('Where does it go next')).toHaveValue('in_repair');
    await d.getByLabel('Note').fill('Screen cracked, hinge loose.');
    await go.click();
    const st = await readArea(page);
    const a = st.assets.items.find((x) => x.tag === 'AST-LAP-005')!;
    expect(a).toMatchObject({ status: 'in_repair', condition: 'damaged' });
    expect(a.holderId).toBeUndefined();
    expect(st.assets.events.filter((e) => e.assetId === a.id).pop()).toMatchObject({ kind: 'returned', fromId: 'emp_1', condition: 'damaged', note: 'Screen cracked, hinge loose.' });
  });

  test('a transfer moves the holder, needs the new holder to acknowledge, and keeps both sides in the history', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await page.getByRole('button', { name: 'Open AST-LAP-007' }).click();   // Tanvi Kapoor
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    const d = dialog(page, 'Transfer asset');
    await expect(d.getByLabel('Transfer to').locator('option', { hasText: 'Tanvi Kapoor' })).toHaveCount(0);   // not to themselves
    await d.getByLabel('Transfer to').selectOption('emp_20');
    const go = d.getByRole('button', { name: 'Transfer asset' });
    await expect(go).toBeDisabled();
    await d.getByTestId('ack-check').check();
    await go.click();
    const st = await readArea(page);
    expect(st.assets.items.find((x) => x.tag === 'AST-LAP-007')).toMatchObject({ status: 'issued', holderId: 'emp_20' });
    expect(st.assets.events.filter((e) => e.assetId === st.assets.items.find((x) => x.tag === 'AST-LAP-007')!.id).pop()).toMatchObject({ kind: 'transferred', fromId: 'emp_18', toId: 'emp_20', ack: true });
    // The history list on the detail view shows the transfer, newest first.
    await expect(page.getByTestId('asset-history').locator('li').first()).toContainText('Transferred from Tanvi Kapoor to Farhan Ali');
  });

  test('history is append-only: earlier events never change, and the page offers no way to edit or delete one', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    const before = await readArea(page);
    await page.getByRole('button', { name: 'Open AST-PHN-008' }).click();
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    const d = dialog(page, 'Issue asset');
    await d.getByLabel('Issue to').selectOption('emp_9');
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Issue asset' }).click();
    await page.getByRole('button', { name: 'Record return' }).click();
    const r = dialog(page, 'Record return');
    await r.getByLabel('Condition on return').selectOption('good');
    await r.getByRole('button', { name: 'Record return' }).click();
    const after = await readArea(page);
    expect(after.assets.events.length).toBe(before.assets.events.length + 2);
    expect(after.assets.events.slice(0, before.assets.events.length)).toEqual(before.assets.events);
    const history = page.getByTestId('asset-history');
    await expect(history.locator('li')).toHaveCount(3);
    await expect(history.getByRole('button')).toHaveCount(0);
    await expect(page.getByText('Nothing here can be edited or deleted.').first()).toBeVisible();
  });

  test('the People tab shows what each person holds and their own history', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets?tab=people');
    await page.getByRole('button', { name: 'Open assets of Neha Bansal' }).click();
    const d = dialog(page, 'Assets: Neha Bansal');
    await expect(d).toContainText('AST-LAP-003');
    const hist = d.getByTestId('person-history');
    // Neha handed back a retired laptop in 2024 and received a new one: both are in her history.
    await expect(hist).toContainText('Returned');
    await expect(hist).toContainText('AST-LAP-011');
    await expect(hist).toContainText('Received');
    await expect(hist).toContainText('receipt acknowledged');
  });

  test('leavers: held assets show "Return before clearance" next to the exit checklist, with an advisory figure and a link to Lifecycle', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets?tab=exits');
    const yash = page.getByTestId('exit-person-emp_22');
    await expect(yash).toContainText('Yash Rathore');
    await expect(yash).toContainText('30 Nov 2026');
    await expect(page.getByText('Return before clearance', { exact: true })).toHaveCount(2);                       // phone and ID card match the checklist
    await expect(page.getByText('Return before clearance, not on the checklist', { exact: true })).toHaveCount(2);  // Yash's SIM and uniform
    await expect(page.getByText('Android phone (IMEI ending 4471)')).toBeVisible();
    // The advisory figure is the book value on the last working day, worked out by the same engine.
    const held = seed.assets.items.filter((a) => a.holderId === 'emp_22' && a.status === 'issued');
    expect(held).toHaveLength(4);
    const total = held.reduce((s, a) => s + recoveryAdvice(a, '2026-11-30').recommended, 0);
    await expect(page.getByTestId('exit-recovery-emp_22')).toContainText(inr(total));
    await expect(page.getByTestId('exit-recovery-emp_22')).toContainText('Sample, confirm');
    await expect(page.getByText(/lawful basis and the employee.s agreement/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open this exit in Lifecycle' })).toHaveAttribute('href', /\/dashboard\/hrms\/lifecycle\?tab=exits/);
    // Deepa left on 30 Sep with a laptop and no exit case.
    await expect(page.getByTestId('exit-person-emp_23')).toContainText('No exit case in Lifecycle');
    await expect(page.getByText('Not returned after leaving')).toBeVisible();
  });

  test('recording a return here updates the comparison, and never touches the core exit or payroll', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets?tab=exits');
    const before = await readDb(page);
    await page.getByRole('button', { name: 'Record return of AST-PHN-005' }).click();
    const d = dialog(page, 'Record return');
    await d.getByLabel('Condition on return').selectOption('good');
    await d.getByRole('button', { name: 'Record return' }).click();
    await expect(page.getByText('Returned here, tick the checklist')).toBeVisible();
    await expect(page.getByText('Return before clearance', { exact: true })).toHaveCount(1);
    const after = await readDb(page);
    expect(after.exits).toEqual(before.exits);                       // the core checklist is read, never edited
    expect(after.adjustments).toEqual(before.adjustments);           // nothing is posted to payroll
    expect(after.fnfCases).toEqual(before.fnfCases);
    // The recovery figure drops by the phone's book value.
    const rest = seed.assets.items.filter((a) => a.holderId === 'emp_22' && a.status === 'issued' && a.tag !== 'AST-PHN-005');
    await expect(page.getByTestId('exit-recovery-emp_22')).toContainText(inr(rest.reduce((s, a) => s + recoveryAdvice(a, '2026-11-30').recommended, 0)));
  });

  test('insights: warranties ending in 60 days, assets older than 4 years, and cost by department', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets?tab=insights');
    await expect(page.getByTestId('warranty-soon').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('warranty-soon').locator('tbody tr').first()).toContainText('AST-PHN-006');
    await expect(page.getByTestId('aged-assets').locator('tbody tr')).toHaveCount(5);
    const dept = (id: string) => core.departments.find((d) => d.id === emp(id).departmentId)?.name;
    const rows = costByDepartment(seed.assets.items, dept, TODAY);
    const bars = page.getByTestId('cost-by-dept');
    for (const r of rows) { await expect(bars).toContainText(r.name); await expect(bars).toContainText(inr(r.cost)); }
  });

  test('the inventory downloads as CSV with the filtered rows', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await page.getByLabel('Filter by type').selectOption('laptop');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('assets.csv');
    const lines = readFileSync(await file.path(), 'utf8').trim().split('\n');
    expect(lines[0]).toBe('Tag,Type,Make,Model,Serial,Purchase date,Cost (INR),Book value (INR),Warranty ends,Condition,Status,Held by,Department');
    expect(lines).toHaveLength(1 + seed.assets.items.filter((a) => a.type === 'laptop').length);
    expect(lines.some((l) => l.startsWith('AST-LAP-001,Laptop,Apple,MacBook Air M2'))).toBe(true);
  });

  test('adding an asset validates, assigns the next tag and survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await page.getByRole('button', { name: 'Add asset' }).click();
    const d = dialog(page, 'Add asset');
    await d.getByRole('button', { name: 'Add to register' }).click();
    await expect(d.getByText('Enter the make.')).toBeVisible();
    await expect(d.getByText('Enter the cost in rupees.')).toBeVisible();
    await d.getByLabel('Make').fill('Acer');
    await d.getByLabel('Model').fill('Aspire 5');
    await d.getByLabel('Serial number').fill('ACER-TEST-0001');
    await d.getByLabel('Cost (₹)').fill('45000');
    await d.getByRole('button', { name: 'Add to register' }).click();
    await expect(d).toHaveCount(0);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('Aspire');
    await expect(page.getByRole('row', { name: /AST-LAP-013/ })).toContainText('In stock');
    await reload(page);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('ACER-TEST');
    await expect(page.getByRole('row', { name: /AST-LAP-013/ })).toBeVisible();
    // The same serial cannot be added twice.
    await page.getByRole('button', { name: 'Add asset' }).click();
    const d2 = dialog(page, 'Add asset');
    await d2.getByLabel('Make').fill('Acer'); await d2.getByLabel('Model').fill('Aspire 7'); await d2.getByLabel('Serial number').fill('acer-test-0001'); await d2.getByLabel('Cost (₹)').fill('1000');
    await d2.getByRole('button', { name: 'Add to register' }).click();
    await expect(page.getByText('This serial number is already in the register.')).toBeVisible();
  });

  test('the recent changes list records what was done', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/assets');
    await expect(page.getByTestId('activity-log')).toContainText('Nothing has been changed');
    await page.getByRole('button', { name: 'Open AST-LAP-009' }).click();
    await page.getByRole('button', { name: 'Send for repair' }).click();
    await dialog(page, 'Send for repair').getByRole('button', { name: 'Send for repair' }).click();
    await expect(page.getByTestId('activity-log')).toContainText('Sent AST-LAP-009 Dell Latitude 3440 for repair');
  });

  test.describe('narrow screen', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['inventory', 'people', 'exits', 'insights']) {
      test(`no sideways page scroll at 390px: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/assets?tab=${t}`);
        await page.waitForTimeout(700);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over).toBeLessThanOrEqual(1);
        const tableOverflow = await page.evaluate(() => Array.from(document.querySelectorAll('table')).every((t) => getComputedStyle(t.parentElement!).overflowX === 'auto' || t.scrollWidth <= t.parentElement!.clientWidth + 1));
        expect(tableOverflow).toBe(true);
      });
    }
  });
});

// ═════════════════════════════ BENEFITS: browser ═════════════════════════════
test.describe('benefits page', () => {
  test('renders the seeded enrolment, the window and the stats without console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/benefits');
    await expect(page.getByRole('heading', { name: 'Benefits', exact: true })).toBeVisible();
    const stats = page.getByTestId('benefits-stats');
    await expect(stats).toContainText('57%');
    await expect(stats).toContainText('12 of 21 eligible have answered');
    await expect(stats).toContainText('14 days left');
    await expect(page.getByTestId('window-closes')).toHaveText('21 Nov 2026');
    const prog = page.getByTestId('progress-table');
    await expect(prog).toContainText('Sales & Field');
    await expect(prog.locator('tbody tr')).toHaveCount(6);
    await expect(page.getByText(/Not eligible now: Yash Rathore \(leaves before the cover starts\)/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('HR can extend the window: a reason is required, and the new date survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByTestId('window-card').getByRole('button', { name: 'Extend window' }).click();
    const d = dialog(page, 'Extend the enrolment window');
    await d.getByRole('button', { name: 'Extend window' }).click();
    await expect(d.getByText('Write a short reason for the extension.')).toBeVisible();
    await d.getByLabel('Reason').fill('Many people were on Diwali leave');
    await d.getByRole('button', { name: 'Extend window' }).click();
    await expect(page.getByTestId('window-closes')).toHaveText('28 Nov 2026');
    await expect(page.getByTestId('window-card')).toContainText('Extended by 7 days on 7 Nov 2026: Many people were on Diwali leave');
    const st = await readArea(page);
    expect(st.benefits.window.closesOn).toBe('2026-11-28');
    expect(st.benefits.window.extensions).toHaveLength(1);
    await reload(page);
    await expect(page.getByTestId('window-closes')).toHaveText('28 Nov 2026');
    await expect(page.getByTestId('benefits-stats')).toContainText('21 days left');
  });

  test('enrolling an employee checks family ages and plan limits, shows the cost split, and updates progress', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByRole('button', { name: 'Enrol Imran Sheikh' }).click();
    const d = dialog(page, 'Enrolment: Imran Sheikh');
    const save = d.getByRole('button', { name: 'Save enrolment' });
    await expect(save).toBeDisabled();
    await expect(d.getByText('Choose a health cover amount, or opt out.')).toBeVisible();
    await d.getByLabel('Cover amount').selectOption('h5');
    await expect(save).toBeEnabled();
    // A child who will be 26 when cover starts is refused.
    await d.getByRole('button', { name: 'Add a family member' }).click();
    await d.getByLabel('Family member 1 relation').selectOption('child');
    await d.getByLabel('Family member 1 name').fill('Zoya');
    await d.getByLabel('Family member 1 date of birth').fill('2000-12-31');
    await expect(d.getByTestId('dependant-errors')).toContainText('Zoya will be 26 when cover starts. Children are covered up to 25.');
    await expect(save).toBeDisabled();
    // Three children is over the limit.
    await d.getByLabel('Family member 1 date of birth').fill('2015-03-01');
    await expect(d.getByTestId('dependant-errors')).toHaveCount(0);
    for (const n of [2, 3]) {
      await d.getByRole('button', { name: 'Add a family member' }).click();
      await d.getByLabel(`Family member ${n} relation`).selectOption('child');
      await d.getByLabel(`Family member ${n} name`).fill(`Kid ${n}`);
      await d.getByLabel(`Family member ${n} date of birth`).fill('2018-01-01');
    }
    await expect(d.getByTestId('dependant-errors')).toContainText('2 children at most');
    await d.getByRole('button', { name: 'Remove family member 3' }).click();
    await d.getByRole('button', { name: 'Remove family member 2' }).click();
    // Employee 7,400 (company 100%) + child 3,600 (company 50%) + accident 900 (company 100%).
    await expect(d.getByTestId('cost-employee')).toHaveText(inr(Math.round(1800 / 12)));
    await expect(d.getByTestId('cost-employer')).toHaveText(inr(Math.round((7400 + 1800 + 900) / 12)));
    await expect(d.getByText('We keep a name, relation and date of birth only.')).toBeVisible();
    await save.click();
    await expect(d).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Imran Sheikh/ })).toContainText('Enrolled, ₹5 lakh');
    await expect(page.getByTestId('benefits-stats')).toContainText('13 of 21 eligible have answered');
    const en = (await readArea(page)).benefits.enrolments.find((e) => e.employeeId === 'emp_6')!;
    expect(en).toMatchObject({ status: 'enrolled', healthTier: 'h5' });
    expect(en.dependants).toHaveLength(1);
    expect(Object.keys(en.dependants[0]!).sort()).toEqual(['dob', 'id', 'name', 'relation']);
    await reload(page);
    await expect(page.getByRole('row', { name: /Imran Sheikh/ })).toContainText('Enrolled, ₹5 lakh');
  });

  test('a parent over the plan age, and a flexible allowance over budget, are both refused', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByRole('button', { name: 'Enrol Pooja Verma' }).click();
    const d = dialog(page, 'Enrolment: Pooja Verma');
    await d.getByLabel('Cover amount').selectOption('h3');
    await d.getByRole('button', { name: 'Add a family member' }).click();
    await d.getByLabel('Family member 1 relation').selectOption('parent');
    await d.getByLabel('Family member 1 name').fill('Elder');
    await d.getByLabel('Family member 1 date of birth').fill('1945-05-05');
    await expect(d.getByTestId('dependant-errors')).toContainText('Parents are covered up to 80');
    await d.getByLabel('Family member 1 date of birth').fill('1960-05-05');
    await expect(d.getByTestId('dependant-errors')).toHaveCount(0);
    await d.getByLabel('Books and learning').fill('2000');
    await d.getByLabel('Wellness and gym').fill('1000');
    await expect(d.getByText('You have allocated 3000 but the monthly budget is 2500.').first()).toBeVisible();
    await expect(d.getByRole('button', { name: 'Save enrolment' })).toBeDisabled();
    await d.getByLabel('Wellness and gym').fill('500');
    await expect(d.getByRole('button', { name: 'Save enrolment' })).toBeEnabled();
  });

  test('opting out is recorded, and accident cover stays automatic', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByRole('button', { name: 'Enrol Anita Desai' }).click();
    const d = dialog(page, 'Enrolment: Anita Desai');
    await d.getByRole('tab', { name: 'Opt out of group health' }).click();
    await expect(d.getByText(/Accident cover is automatic and stays/)).toBeVisible();
    await expect(d.getByTestId('cost-employee')).toHaveText('₹0');
    await d.getByRole('button', { name: 'Save enrolment' }).click();
    await expect(page.getByRole('row', { name: /Anita Desai/ })).toContainText('Opted out');
    expect((await readArea(page)).benefits.enrolments.find((e) => e.employeeId === 'emp_11')).toMatchObject({ status: 'waived', dependants: [] });
  });

  test('when the window is closed the form is read-only and says why', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await patchArea(page, "s.benefits.window.closesOn = '2026-11-06';");
    await reload(page);
    await expect(page.getByTestId('benefits-stats')).toContainText('Closed');
    await page.getByRole('button', { name: 'Enrol Imran Sheikh' }).click();
    const d = dialog(page, 'Enrolment: Imran Sheikh');
    await expect(d.getByText('The enrolment window is closed. HR can extend it on the Enrolment tab.').first()).toBeVisible();
    await expect(d.getByRole('button', { name: 'Save enrolment' })).toBeDisabled();
    await expect(d.getByRole('button', { name: 'Add a family member' })).toBeDisabled();
    await expect(d.getByLabel('Cover amount')).toBeDisabled();
  });

  test('reminders are a labelled simulation: they are recorded, nothing is sent, and the record survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await expect(page.getByText(/Nothing is sent from this preview/)).toBeVisible();
    const btn = page.getByRole('button', { name: /Log reminder for 9 not yet enrolled/ });
    await btn.click();
    await expect(page.getByText('Simulation: 9 reminders logged. Nothing was sent.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Imran Sheikh/ })).toContainText('Reminded 7 Nov 2026');
    await expect(page.getByRole('button', { name: /Log reminder for 0 not yet enrolled/ })).toBeDisabled();
    expect(Object.keys((await readArea(page)).benefits.reminders)).toHaveLength(9);
    await reload(page);
    await expect(page.getByRole('row', { name: /Imran Sheikh/ })).toContainText('Reminded 7 Nov 2026');
  });

  test('the filter shows who has not enrolled', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByLabel('Filter by enrolment').selectOption('pending');
    const pending = enrolmentProgress(core, seed.benefits.enrolments, COVER).pendingIds;
    await expect(page.locator('tbody tr').filter({ hasText: 'MER-' })).toHaveCount(pending.length);
    await expect(page.getByRole('row', { name: /Imran Sheikh/ })).toContainText('Not yet');
    await expect(page.getByRole('row', { name: /Ritu Malhotra/ })).toHaveCount(0);
  });

  test('plans: every plan has its terms, a sample tag and an advisor note, and no tax limit is stated', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=plans');
    for (const kind of ['health', 'accident', 'meal', 'nps', 'flex']) {
      const card = page.getByTestId(`plan-${kind}`);
      await expect(card).toBeVisible();
      await expect(card.getByText('Sample, confirm')).toBeVisible();
      await expect(card.getByText('Confirm with your advisor.')).toBeVisible();
      await expect(card).toContainText('Tax treatment');
    }
    const h = page.getByTestId('plan-health');
    await expect(h).toContainText('Family rules (sample plan terms)');
    await expect(h).toContainText('never an ID number');
    await expect(h).toContainText('₹3 lakh');
    await expect(h).toContainText('Company pays');
    // No tax limit is quoted anywhere on the plans.
    const text = (await page.getByTestId('plan-meal').innerText()) + (await page.getByTestId('plan-nps').innerText()) + (await page.getByTestId('plan-health').innerText());
    expect(text).not.toMatch(/section \d|80C|80D|₹\s?50,000|₹\s?1,50,000/i);
  });

  test('claims: seeded tracker with ageing against the sample turnaround, and rejections with reasons', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=claims');
    const table = page.getByTestId('claims-table');
    await expect(table.locator('tbody tr')).toHaveCount(seed.benefits.claims.length);
    await expect(table.getByRole('row', { name: /TPA-26-04248/ })).toContainText('Day 27 of 15: Over the limit');
    await expect(table.getByRole('row', { name: /TPA-26-04174/ })).toContainText('Closed late');
    await expect(table.getByRole('row', { name: /TPA-26-04396/ })).toContainText('Day 2 of 3: On track');
    const rej = page.getByTestId('rejected-claims');
    await expect(rej.locator('li')).toHaveCount(2);
    await expect(rej).toContainText('Condition existed before cover and was not disclosed');
    await expect(rej).toContainText('Documents incomplete after two reminders');
    await page.getByLabel('Filter claims by status').selectOption('rejected');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('Filter claims by status').selectOption('');
    await page.getByRole('searchbox', { name: /Search ref/ }).fill('Nila');
    await expect(table.locator('tbody tr')).toHaveCount(1);
  });

  test('a claim moves through submitted, review, approved and settled; the approved amount and reasons are checked', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=claims');
    await page.getByRole('button', { name: 'Open claim TPA-26-04396' }).click();
    const d = dialog(page, 'Claim TPA-26-04396');
    await expect(d.getByRole('button', { name: 'Mark settled' })).toHaveCount(0);   // cannot skip ahead
    await d.getByRole('button', { name: 'Move to review' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect(d.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await d.getByRole('button', { name: 'Approve', exact: true }).click();
    await d.getByLabel('Approved amount').fill('99999');
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect(d.getByText(/not more than the amount claimed/)).toBeVisible();
    await d.getByLabel('Approved amount').fill('9000');
    await d.getByRole('button', { name: 'Confirm' }).click();
    await d.getByRole('button', { name: 'Mark settled' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect(d.getByText('A settled claim is final.')).toBeVisible();
    const c = (await readArea(page)).benefits.claims.find((x) => x.ref === 'TPA-26-04396')!;
    expect(c).toMatchObject({ status: 'settled', approved: 9000, closedOn: TODAY });
    expect(c.trail.map((t) => t.status)).toEqual(['submitted', 'in_review', 'approved', 'settled']);
    await d.getByRole('button', { name: 'Close' }).click();
    await reload(page);
    await expect(page.getByTestId('claims-table').getByRole('row', { name: /TPA-26-04396/ })).toContainText('Settled');
  });

  test('a rejection needs a reason, appears in the rejected list, and can be reopened only with the employee\'s reply', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=claims');
    await page.getByRole('button', { name: 'Open claim TPA-26-04322' }).click();    // Lakshmi, in review
    const d = dialog(page, 'Claim TPA-26-04322');
    await d.getByRole('button', { name: 'Reject' }).click();
    await d.getByLabel('Reason for rejection').selectOption('Claim filed after the allowed filing period');
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect(d.getByText(/Share this with the employee/)).toBeVisible();
    await d.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('rejected-claims')).toContainText('Claim filed after the allowed filing period');
    await expect(page.getByTestId('rejected-claims').locator('li')).toHaveCount(3);
    // Reopen: the employee's reply is required, then the claim is back in review and off the rejected list.
    await page.getByRole('button', { name: 'Open claim TPA-26-04322' }).click();
    const d2 = dialog(page, 'Claim TPA-26-04322');
    await d2.getByRole('button', { name: 'Reopen for review' }).click();
    await d2.getByRole('button', { name: 'Confirm' }).click();
    await expect(d2.getByText(/Write the employee.s reply/)).toBeVisible();
    await d2.getByLabel(/reply or reason for review/).fill('The bill was filed on time, here is the stamped copy.');
    await d2.getByRole('button', { name: 'Confirm' }).click();
    await d2.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('rejected-claims').locator('li')).toHaveCount(2);
    const c = (await readArea(page)).benefits.claims.find((x) => x.ref === 'TPA-26-04322')!;
    expect(c.status).toBe('in_review');
    expect(c.closedOn).toBeUndefined();
    expect(c.trail.at(-1)!.note).toContain('stamped copy');
  });

  test('the employee statement shows claimed against the family sum insured', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=claims');
    const s = page.getByTestId('claims-statement');
    await expect(s).toContainText('Family floater of ₹10 lakh');
    await expect(page.getByTestId('stmt-sum')).toHaveText('₹10,00,000');
    await expect(page.getByTestId('stmt-paid')).toHaveText('₹1,07,500');
    await expect(page.getByTestId('stmt-available')).toHaveText('₹8,92,500');
    await page.getByLabel('Employee for the statement').selectOption({ label: 'Neha Bansal' });
    await expect(page.getByTestId('stmt-sum')).toHaveText('₹3,00,000');
    await expect(page.getByTestId('stmt-process')).toHaveText('₹36,800');
    await expect(page.getByTestId('stmt-ifpaid')).toHaveText('₹2,63,200');
    await expect(page.getByTestId('claims-statement')).toContainText('Rejected claims use none of the sum insured.');
  });

  test('registering a claim: only covered patients, an amount is required, and it starts as submitted', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=claims');
    await page.getByRole('button', { name: 'Register a claim' }).click();
    const d = dialog(page, 'Register a claim');
    await d.getByRole('button', { name: 'Register claim' }).click();
    await expect(d.getByText('Only an enrolled employee can claim.')).toBeVisible();
    await d.getByLabel('Employee').selectOption('emp_4');
    await expect(d.getByLabel('Patient').locator('option')).toHaveText(['Self', 'Pallavi Chauhan (spouse)', 'Reyansh Chauhan (child)']);
    await d.getByLabel('Patient').selectOption({ label: 'Reyansh Chauhan (child)' });
    await d.getByLabel('Hospital or clinic').fill('Test Children Clinic');
    await d.getByRole('button', { name: 'Register claim' }).click();
    await expect(d.getByText('Enter the amount claimed.')).toBeVisible();
    await d.getByLabel('Amount claimed').fill('5000');
    await d.getByRole('button', { name: 'Register claim' }).click();
    await expect(d).toHaveCount(0);
    const claims = (await readArea(page)).benefits.claims;
    expect(claims).toHaveLength(seed.benefits.claims.length + 1);
    expect(claims.at(-1)).toMatchObject({ employeeId: 'emp_4', patient: 'Reyansh Chauhan', relation: 'child', claimed: 5000, status: 'submitted', filedOn: TODAY });
    await expect(page.getByTestId('claims-table').locator('tbody tr')).toHaveCount(seed.benefits.claims.length + 1);
  });

  test('cost: outlay by plan, the renewal calendar and the deduction preview match the engine', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=cost');
    const rows = deductionPreview(core, seed.benefits.plans, seed.benefits.enrolments, TODAY, COVER).filter((r) => r.total > 0);
    expect(rows).toHaveLength(10);
    await expect(page.getByTestId('preview-total')).toHaveText(inr(rows.reduce((s, r) => s + r.total, 0)));
    let employer = 0; let employee = 0;
    for (const e of core.employees) {
      if (!enrolmentEligibility(e, COVER).eligible) continue;
      const q = quoteEnrolment(seed.benefits.plans, seed.benefits.enrolments.find((x) => x.employeeId === e.id), basicMonthlyOf(core, e, TODAY));
      employer += q.employerMonthly; employee += q.employeeMonthly;
    }
    await expect(page.getByTestId('outlay-employer')).toHaveText(inr(employer));
    await expect(page.getByTestId('outlay-employee')).toHaveText(inr(employee));
    await expect(page.getByTestId('outlay-table')).toContainText('Group accident cover');
    const cal = page.getByTestId('renewal-calendar');
    await expect(cal.locator('li')).toHaveCount(7);
    await expect(cal.locator('li').first()).toContainText('Enrolment window closes');
    await expect(cal).toContainText('31 Dec 2026');
    await expect(page.getByTestId('deduction-preview').getByRole('row', { name: /Arvind Nair/ })).toContainText('₹12,008');
    await expect(page.getByText(/Nothing here is in payroll until you press/)).toBeVisible();
  });

  test('Send to payroll is idempotent: rows tagged [benefits 2027-01] are replaced, never doubled, and show on the Payroll page', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=cost');
    const preview = deductionPreview(core, seed.benefits.plans, seed.benefits.enrolments, TODAY, COVER).filter((r) => r.total > 0);
    const baseline = (await readDb(page)).adjustments.length;
    const send = async () => {
      await page.getByRole('button', { name: 'Send to payroll' }).click();
      const d = dialog(page, 'Send to payroll');
      await d.getByRole('button', { name: 'Send to payroll' }).click();
      await expect(d).toHaveCount(0);
    };
    await send();
    const tagged = (db: HrmsDb) => db.adjustments.filter((a) => (a.note ?? '').startsWith('[benefits 2027-01]'));
    let db = await readDb(page);
    expect(tagged(db)).toHaveLength(preview.length);
    expect(db.adjustments.length).toBe(baseline + preview.length);
    for (const r of preview) expect(tagged(db).find((a) => a.employeeId === r.employeeId)).toMatchObject({ month: '2027-01', kind: 'one_time_deduction', amount: r.total, taxable: false });
    await expect(page.getByTestId('sent-banner')).toContainText(`Sent on 7 Nov 2026: ${preview.length} deductions`);
    const firstIds = tagged(db).map((a) => a.id).sort();
    // Send again: still the same number of rows, all new ids.
    await expect(page.getByTestId('earlier-rows')).toHaveText(String(preview.length));
    await send();
    db = await readDb(page);
    expect(tagged(db)).toHaveLength(preview.length);
    expect(db.adjustments.length).toBe(baseline + preview.length);
    expect(tagged(db).map((a) => a.id).some((id) => firstIds.includes(id))).toBe(false);
    // The Payroll page reads the same rows.
    await openHrms(page, '/dashboard/hrms/payroll?tab=adjustments');
    await page.getByRole('combobox', { name: 'Month' }).selectOption({ label: 'Jan 2027' });
    await expect(page.getByTestId('adj-summary')).toContainText(`${preview.length} shown`);
    await expect(page.getByText('[benefits 2027-01]').first()).toBeVisible();
    await expect(page.getByTestId('adj-summary')).toContainText(inr(preview.reduce((s, r) => s + r.total, 0)));
  });

  test('changing an enrolment and sending again replaces the earlier rows with the new picture', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits?tab=cost');
    const n0 = deductionPreview(core, seed.benefits.plans, seed.benefits.enrolments, TODAY, COVER).filter((r) => r.total > 0).length;
    const sendNow = async () => {
      await page.getByRole('button', { name: 'Send to payroll' }).click();
      const d = dialog(page, 'Send to payroll');
      await d.getByRole('button', { name: 'Send to payroll' }).click();
      await expect(d).toHaveCount(0);
    };
    await sendNow();
    // Ritu opts out of group health, meal coupons and NPS: her row disappears.
    await page.goto('/dashboard/hrms/benefits');
    await page.getByRole('button', { name: 'Open enrolment of Ritu Malhotra' }).click();
    const d = dialog(page, 'Enrolment: Ritu Malhotra');
    await d.getByRole('tab', { name: 'Opt out of group health' }).click();
    await d.getByRole('button', { name: 'Update enrolment' }).click();
    await expect(d).toHaveCount(0);
    await page.getByRole('tab', { name: 'Cost and payroll' }).click();
    await expect(page.getByTestId('earlier-rows')).toHaveText(String(n0));
    await sendNow();
    const db = await readDb(page);
    const tagged = db.adjustments.filter((a) => (a.note ?? '').startsWith('[benefits 2027-01]'));
    expect(tagged).toHaveLength(n0 - 1);
    expect(tagged.some((a) => a.employeeId === 'emp_1')).toBe(false);
  });

  test('the recent changes list records an enrolment', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/benefits');
    await page.getByRole('button', { name: 'Enrol Anita Desai' }).click();
    const d = dialog(page, 'Enrolment: Anita Desai');
    await d.getByRole('tab', { name: 'Opt out of group health' }).click();
    await d.getByRole('button', { name: 'Save enrolment' }).click();
    await expect(page.getByTestId('activity-log')).toContainText('Recorded an opt-out for Anita Desai');
  });

  test.describe('narrow screen', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['enrolment', 'plans', 'claims', 'cost']) {
      test(`no sideways page scroll at 390px: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/benefits?tab=${t}`);
        await page.waitForTimeout(700);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over).toBeLessThanOrEqual(1);
      });
    }
    test('the enrolment form fits a phone', async ({ page }) => {
      await openHrms(page, '/dashboard/hrms/benefits');
      await page.getByRole('button', { name: 'Enrol Imran Sheikh' }).click();
      const d = dialog(page, 'Enrolment: Imran Sheikh');
      await d.getByLabel('Cover amount').selectOption('h5');
      await d.getByRole('button', { name: 'Add a family member' }).click();
      const over = await d.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      const box = await d.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    });
  });
});

// ═════════════════════════════ COMPENSATION: browser ═════════════════════════════
const statOf = (page: Page, id: string) => page.getByTestId(`stat-${id}`);
async function setPct(page: Page, id: string, value: string) {
  const input = page.getByTestId(`pct-${id}`);
  await input.fill(value);
  await input.press('Enter');
}
async function approveCycle(page: Page) {
  // The seed has one proposal outside its guidance with no reason (Dinesh Kamble): give it one, then submit and approve.
  const reason = page.getByTestId('reason-emp_15');
  await reason.fill('Moving onto the night shift roster with a shift allowance (test reason)');
  await reason.press('Enter');
  await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
  await expect(page.getByTestId('cycle-status')).toHaveText('With HR for approval');
  await page.getByRole('button', { name: 'Approve as HR' }).click();
  await dialog(page, 'Approve the merit cycle').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('cycle-status')).toHaveText('Approved');
}

test.describe('compensation page', () => {
  test('pay bands render from the core designations, with dots placed by position and names only in the HR view', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/compensation');
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible();
    await expect(statOf(page, 'people-in-bands')).toHaveText('22');
    await expect(statOf(page, 'below-the-band')).toHaveText('1');
    await expect(statOf(page, 'above-the-band')).toHaveText('1');
    await expect(statOf(page, 'median-compa-ratio')).toHaveText(median(people.map((p) => p.compa)).toFixed(2));
    for (const g of bands) await expect(page.getByTestId(`range-${g.grade}`)).toBeVisible();
    await expect(page.locator('[data-testid^="dot-"]')).toHaveCount(22);
    await expect(page.getByTestId('dot-emp_3')).toHaveAttribute('data-position', 'above');
    await expect(page.getByTestId('dot-emp_22')).toHaveAttribute('data-position', 'below');
    await expect(page.getByTestId('dot-emp_5')).toHaveAttribute('data-position', 'in');
    // Names are on hover (an SVG title), and the page says they are for HR only.
    await expect(page.getByTestId('dot-emp_3').locator('title')).toHaveText(/Neha Bansal, ₹7,20,000, compa-ratio 1\.20, above the band/);
    await expect(page.getByText(/Names appear on the chart dots/)).toBeVisible();
    await expect(page.getByTestId('band-E2')).toContainText('Area Sales Executive, Accounts Executive, HR Executive');
    await expect(page.getByTestId('band-E2')).toContainText('Sample, confirm');   // the market median is tagged
    expect(errors).toEqual([]);
  });

  test('equity signals are team-level and withheld under five people; nothing offers to correct pay', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation');
    const eq = page.getByTestId('equity-grade');
    await expect(eq.getByTestId('withheld')).toHaveCount(12);
    await expect(eq.getByTestId('withheld').first()).toHaveText('Not shown: fewer than 5 people');
    const text = await eq.innerText();
    expect(text).not.toMatch(/₹/);                    // no pay figure leaks for a small group
    expect(text).not.toMatch(/\(\d\)/);               // and no head count of the small group either
    const g = compaByGender(people);
    if (!g.women.shown || !g.men.shown) throw new Error('expected both groups to be shown');
    await expect(page.getByTestId('equity-compa')).toContainText(`women ${g.women.median.toFixed(2)} (10 people)`);
    await expect(page.getByTestId('equity-compa')).toContainText(`men ${g.men.median.toFixed(2)} (12 people)`);
    await expect(page.getByText(/Nothing on this page corrects anyone.s pay automatically/)).toBeVisible();
    await expect(page.getByRole('button', { name: /correct|adjust pay|fix pay/i })).toHaveCount(0);
  });

  test('editing a band is validated, moves people in and out of "below", and survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation');
    await page.getByRole('button', { name: 'Edit band E1' }).click();
    const d = dialog(page, 'Edit band E1');
    await d.getByLabel('Minimum CTC').fill('400000');
    await expect(d.getByText('The minimum must be below the midpoint, and the midpoint below the maximum.').first()).toBeVisible();
    await expect(d.getByRole('button', { name: 'Save band' })).toBeDisabled();
    await d.getByLabel('Minimum CTC').fill('280000');
    await d.getByRole('button', { name: 'Save band' }).click();
    await expect(d).toHaveCount(0);
    await expect(statOf(page, 'below-the-band')).toHaveText('0');
    await expect(page.getByTestId('dot-emp_22')).toHaveAttribute('data-position', 'in');
    expect((await readArea(page)).comp.bands.find((b) => b.grade === 'E1')!.min).toBe(280000);
    await reload(page);
    await expect(statOf(page, 'below-the-band')).toHaveText('0');
  });

  test('the compa-ratio table filters by grade and position, shows the ratio, and downloads as CSV', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation');
    const table = page.getByTestId('compa-table');
    await expect(table.locator('tbody tr')).toHaveCount(22);
    await expect(table.getByRole('row', { name: /Neha Bansal/ })).toContainText('1.20');
    await expect(table.getByRole('row', { name: /Neha Bansal/ })).toContainText('Above band');
    await page.getByLabel('Filter by grade').selectOption('E2');
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await page.getByLabel('Filter by position').selectOption('above');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Filter by position').selectOption('');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const lines = readFileSync(await (await dl).path(), 'utf8').trim().split('\n');
    expect(lines[0]).toBe('Code,Name,Grade,CTC (INR),Band min,Band mid,Band max,Compa-ratio,Position');
    expect(lines).toHaveLength(7);
  });

  test('merit: totals against the budget match the engine, the budget is editable and kept', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await expect(page.getByTestId('cycle-status')).toHaveText('Draft, with managers');
    await expect(page.getByTestId('total-budget')).toHaveText('₹11,96,480');
    await expect(page.getByTestId('total-proposed')).toContainText('₹8,97,300');
    await expect(page.getByTestId('total-remaining')).toContainText('₹2,99,180 left in the budget');
    await expect(page.getByTestId('total-remaining')).toContainText('15 of 20 people have a proposal');
    await expect(page.getByTestId('merit-table').locator('tbody tr')).toHaveCount(20);
    const b = page.getByTestId('budget-pct');
    await b.fill('10');
    await b.press('Enter');
    await expect(page.getByTestId('total-budget')).toHaveText('₹14,95,600');
    expect((await readArea(page)).comp.cycle.budgetPct).toBe(10);
    await reload(page);
    await expect(page.getByTestId('total-budget')).toHaveText('₹14,95,600');
    // A budget that is too low shows the overspend in words.
    await page.getByTestId('budget-pct').fill('3');
    await page.getByTestId('budget-pct').press('Enter');
    await expect(page.getByTestId('total-remaining')).toContainText('Over budget by');
    // An impossible budget is refused and the old value stays.
    await page.getByTestId('budget-pct').fill('45');
    await page.getByTestId('budget-pct').press('Enter');
    await expect(page.getByText('Use a budget from 0 to 30 percent.')).toBeVisible();
    expect((await readArea(page)).comp.cycle.budgetPct).toBe(3);
  });

  test('guidance: the suggested range follows the rating, a proposal outside it needs a reason, and submit says why it is blocked', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await expect(page.getByTestId('guide-emp_7')).toHaveText('1 to 3%');                 // Pooja: partly meets, middle zone
    await page.getByLabel('Performance band for Pooja Verma').selectOption('exceeds');
    await expect(page.getByTestId('guide-emp_7')).toHaveText('8 to 12%');
    await page.getByLabel('Performance band for Pooja Verma').selectOption('meets');
    await expect(page.getByTestId('guide-emp_7')).toHaveText('4 to 7%');
    // Seeded: Dinesh Kamble has 8% against a 3 to 5% guide and no reason.
    const submit = page.getByRole('button', { name: 'Submit to HR for approval' });
    await expect(submit).toBeDisabled();
    await expect(page.getByTestId('submit-blockers')).toContainText('1 proposal is outside the guidance and needs a reason.');
    await expect(page.getByTestId('reason-emp_15')).toBeVisible();
    await expect(page.getByRole('row', { name: /Dinesh Kamble/ })).toContainText('A reason is needed.');
    // Pooja at 9% is outside 4 to 7%: a second reason is needed.
    await setPct(page, 'emp_7', '9');
    await expect(page.getByRole('row', { name: /Pooja Verma/ })).toContainText('Outside guidance');
    await expect(page.getByTestId('submit-blockers')).toContainText('2 proposals are outside the guidance and need a reason.');
    await page.getByTestId('reason-emp_7').fill('Covering two beats since a colleague left.');
    await page.getByTestId('reason-emp_7').press('Enter');
    await expect(page.getByTestId('submit-blockers')).toContainText('1 proposal is outside');
    await page.getByTestId('reason-emp_15').fill('Night roster allowance moves into pay.');
    await page.getByTestId('reason-emp_15').press('Enter');
    await expect(submit).toBeEnabled();
    await expect(page.getByTestId('submit-blockers')).toHaveCount(0);
    // The reasons are kept.
    const p = (await readArea(page)).comp.cycle.proposals;
    expect(p.emp_7).toMatchObject({ pct: 9, reason: 'Covering two beats since a colleague left.' });
    expect(p.emp_15!.reason).toContain('Night roster');
    // Clearing a proposal removes it, and a non-number is refused.
    await page.getByTestId('pct-emp_7').fill('');
    await page.getByTestId('pct-emp_7').press('Enter');
    expect((await readArea(page)).comp.cycle.proposals.emp_7).toBeUndefined();
  });

  test('the rating details show the evidence and keep the employee\'s reply', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await page.getByRole('button', { name: 'Rating details for Pooja Verma' }).click();
    const d = dialog(page, 'Rating details: Pooja Verma');
    await expect(d).toContainText('Visit completion 68% against an 85% plan');
    await expect(d.getByLabel("Employee's reply")).toHaveValue(/I was on leave for three weeks/);
    await expect(d.getByText(/A rating without evidence should not drive pay/)).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Save reply' })).toBeDisabled();
    await d.getByLabel("Employee's reply").fill('I was on leave for three weeks and also covered a vacancy.');
    await d.getByRole('button', { name: 'Save reply' }).click();
    expect((await readArea(page)).comp.perfNotes.emp_7!.reply).toBe('I was on leave for three weeks and also covered a vacancy.');
    // Someone with no evidence on record is told so.
    await page.getByRole('button', { name: 'Rating details for Tanvi Kapoor' }).click();
    await expect(dialog(page, 'Rating details: Tanvi Kapoor')).toContainText('No evidence recorded. A rating without evidence should not drive pay.');
    await expect(dialog(page, 'Rating details: Tanvi Kapoor')).toContainText('manager and HR decide each increment');
  });

  test('approval is a human step: managers submit, HR approves or returns, and proposals lock', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    const reason = page.getByTestId('reason-emp_15');
    await reason.fill('Test reason for the night roster.');
    await reason.press('Enter');
    await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('With HR for approval');
    await expect(page.getByTestId('pct-emp_1')).toBeDisabled();
    await expect(page.getByTestId('budget-pct')).toBeDisabled();
    await expect(page.getByLabel('Performance band for Ritu Malhotra')).toBeDisabled();
    // HR returns it: a note is required.
    await page.getByRole('button', { name: 'Return to managers' }).click();
    const r = dialog(page, 'Return to managers');
    await r.getByRole('button', { name: 'Return' }).click();
    await expect(r.getByText('Tell the managers what to change.')).toBeVisible();
    await r.getByLabel('What should managers change').fill('Please lower the two largest increases.');
    await r.getByRole('button', { name: 'Return' }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('Returned to managers');
    await expect(page.getByTestId('cycle-decision')).toContainText('Returned by You (HR admin) on 7 Nov 2026: Please lower the two largest increases.');
    await expect(page.getByTestId('pct-emp_1')).toBeEnabled();
    // Resubmit and approve.
    await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
    await page.getByRole('button', { name: 'Approve as HR' }).click();
    await dialog(page, 'Approve the merit cycle').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('Approved');
    await expect(page.getByTestId('cycle-decision')).toContainText('Approved by You (HR admin)');
    await reload(page);
    await expect(page.getByTestId('cycle-status')).toHaveText('Approved');
    await expect(page.getByTestId('pct-emp_1')).toBeDisabled();
    // Reopen is available while nothing has been issued.
    await page.getByRole('button', { name: 'Reopen for changes' }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('Draft, with managers');
  });

  test('approving over budget needs a written reason', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await page.getByTestId('budget-pct').fill('2');
    await page.getByTestId('budget-pct').press('Enter');
    await expect(page.getByTestId('total-remaining')).toContainText('Over budget by');
    const reason = page.getByTestId('reason-emp_15');
    await reason.fill('Test reason.');
    await reason.press('Enter');
    await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
    await expect(page.getByText('The total is over budget, so approving needs a reason.')).toBeVisible();
    await page.getByRole('button', { name: 'Approve as HR' }).click();
    const d = dialog(page, 'Approve the merit cycle');
    await d.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(d.getByText('The total is over budget. Write why you are approving it.').first()).toBeVisible();
    await d.getByLabel('Reason for approving over budget').fill('Retention risk in the field team, agreed with finance.');
    await d.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('Approved');
    await expect(page.getByTestId('cycle-decision')).toContainText('Retention risk in the field team');
  });

  test('the guideline matrix is editable, validated, and changes the suggestion for people in that cell', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    const hi = page.getByLabel('Meets, mid zone, highest percent', { exact: true });
    await hi.fill('9');
    await hi.press('Enter');
    await expect(page.getByTestId('guide-emp_6')).toHaveText('4 to 9%');           // Imran: meets, compa 0.90 = middle zone
    const lo = page.getByLabel('Meets, mid zone, lowest percent', { exact: true });
    await lo.fill('12');
    await lo.press('Enter');
    await expect(page.getByText('The lowest value cannot be above the highest.')).toBeVisible();
    expect((await readArea(page)).comp.cycle.guidelines.meets.mid).toEqual({ min: 4, max: 9 });
  });

  test('the finance view: extra cost monthly and annual with employer PF, as the engine works it out', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    const members = cycleMembership(core, cyc).filter((m) => m.included);
    const impacts: (PfImpact | null)[] = []; const deltas: number[] = [];
    for (const m of members) {
      const p = cyc.proposals[m.employee.id];
      if (!p) continue;
      const base = m.employee.annualCtc!;
      const after = newCtc(base, p.pct);
      deltas.push(after - base);
      impacts.push(pfImpact(core, m.employee, base, after, cyc.effectiveOn));
    }
    const fin = financeSummary(impacts, deltas);
    await expect(page.getByTestId('fin-ctc')).toHaveText(inr(fin.ctcAnnual));
    await expect(page.getByTestId('fin-epf')).toHaveText(inr(fin.epfAnnual));
    await expect(page.getByTestId('fin-off')).toHaveText(inr(fin.offCtcAnnual));
    await expect(page.getByTestId('fin-total-annual')).toHaveText(inr(fin.totalAnnual));
    await expect(page.getByTestId('fin-total-monthly')).toHaveText(inr(fin.totalMonthly));
    expect(fin.ctcAnnual).toBe(897300);
    await expect(page.getByTestId('finance-table')).toContainText('Extra EDLI and PF admin charges, outside CTC');
    await expect(page.getByText(/PF wage ceiling in force on 1 Dec 2026 is ₹25,000 a month/)).toBeVisible();
    await expect(page.getByText('How this is worked out')).toBeVisible();
    // A proposal moves the figures live.
    await setPct(page, 'emp_7', '3');
    const added = newCtc(emp('emp_7').annualCtc!, 3) - emp('emp_7').annualCtc!;
    await expect(page.getByTestId('fin-ctc')).toHaveText(inr(fin.ctcAnnual + added));
  });

  test('issuing an increment changes the core CTC, issues the letter once, and shows on Employees and Letters', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    // Before approval there is nothing to issue.
    await expect(page.getByRole('button', { name: 'Issue increment to Rohit Chauhan' })).toHaveCount(0);
    await approveCycle(page);
    const before = await readDb(page);
    await page.getByRole('button', { name: 'Issue increment to Rohit Chauhan' }).click();
    const d = dialog(page, 'Issue increment to Rohit Chauhan');
    const preview = d.getByTestId('issue-preview');
    await expect(preview).toContainText('₹9,60,000');
    await expect(preview).toContainText('₹10,56,000');
    await expect(preview).toContainText('1 Dec 2026');
    await expect(d.getByText(/changes it now/)).toBeVisible();
    await d.getByRole('button', { name: 'Issue increment' }).click();
    await expect(d).toHaveCount(0);
    await expect(page.getByTestId('issued-banner')).toContainText('CTC ₹9,60,000 to ₹10,56,000');
    await expect(page.getByRole('row', { name: /Rohit Chauhan/ })).toContainText('Issued 7 Nov 2026');
    await expect(page.getByRole('button', { name: 'Issue increment to Rohit Chauhan' })).toHaveCount(0);   // once per person per cycle
    await expect(page.getByTestId('pct-emp_4')).toBeDisabled();
    // Core data: new CTC, a change-log row, and one increment letter that carries the new figure and the effective date.
    const db = await readDb(page);
    expect(db.employees.find((e) => e.id === 'emp_4')!.annualCtc).toBe(1056000);
    expect(db.employees.find((e) => e.id === 'emp_4')!.history[0]).toMatchObject({ field: 'Annual CTC', from: '960000', to: '1056000' });
    const letters = db.letters.filter((l) => l.employeeId === 'emp_4' && l.type === 'increment');
    expect(letters).toHaveLength(1);
    expect(letters[0]!.body).toContain('₹10,56,000');
    expect(letters[0]!.body).toContain('1 Dec 2026');
    expect(letters[0]).toMatchObject({ issuedOn: TODAY, signed: false });
    expect(db.letters.length).toBe(before.letters.length + 1);
    // Nobody else changed.
    for (const e of db.employees.filter((x) => x.id !== 'emp_4')) expect(e.annualCtc, e.id).toBe(before.employees.find((x) => x.id === e.id)!.annualCtc);
    const st = await readArea(page);
    expect(st.comp.cycle.applied.emp_4).toMatchObject({ from: 960000, to: 1056000, on: TODAY, letterId: letters[0]!.id });
    expect(st.log[0]!.action).toContain('Issued an increment to Rohit Chauhan');
    // The cycle's totals still count it once: the base is the pre-increment CTC.
    await expect(page.getByTestId('total-proposed')).toContainText('₹8,97,300');
    // Employees page: the new CTC and the revision history.
    await page.goto('/dashboard/hrms/employees/emp_4?tab=salary');
    await expect(page.locator('#sal-ctc')).toHaveValue('1056000');
    await expect(page.getByText('Revision history')).toBeVisible();
    await expect(page.getByRole('row', { name: /Annual CTC/ }).first()).toContainText('₹10,56,000');
    // Letters list: the increment letter is in the register.
    await page.goto('/dashboard/hrms/lifecycle?tab=letters');
    await expect(page.getByRole('row', { name: /Rohit Chauhan.*Increment/ })).toBeVisible();
    // And it survives a reload of the Compensation page.
    await page.goto('/dashboard/hrms/compensation?tab=merit');
    await expect(page.getByTestId('cycle-status')).toHaveText('Approved');
    await expect(page.getByRole('row', { name: /Rohit Chauhan/ })).toContainText('Issued 7 Nov 2026');
    await expect(page.getByRole('button', { name: 'Reopen for changes' })).toBeDisabled();
  });

  test('after an increment is issued the bands page shows the new compa-ratio', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await approveCycle(page);
    await page.getByRole('button', { name: 'Issue increment to Rohit Chauhan' }).click();
    await dialog(page, 'Issue increment to Rohit Chauhan').getByRole('button', { name: 'Issue increment' }).click();
    await page.getByRole('tab', { name: /Pay bands/ }).click();
    await expect(page.getByTestId('compa-table').getByRole('row', { name: /Rohit Chauhan/ })).toContainText('1.06');
    await expect(page.getByTestId('compa-table').getByRole('row', { name: /Rohit Chauhan/ })).toContainText('₹10,56,000');
  });

  test('pay transparency: publishing a grade controls the employee view, which shows no names, dots, midpoints or other people', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=transparency');
    await expect(page.getByText('5 of 6 grades published')).toBeVisible();
    await expect(page.getByTestId('publish-M3')).not.toBeChecked();
    await expect(page.getByTestId('publish-E1')).toBeChecked();
    await page.getByRole('tab', { name: 'Employee view' }).click();
    const view = page.getByTestId('employee-view');
    await page.getByLabel('Preview as').selectOption('emp_3');                         // Neha, grade E2
    await expect(page.getByTestId('emp-band-E2')).toContainText('₹4,80,000 to ₹7,00,000 a year');
    await expect(page.getByTestId('emp-own')).toContainText('Your CTC is ₹7,20,000, which is above this range');
    await expect(page.getByTestId('emp-band-M3')).toHaveCount(0);                      // unpublished and not her grade
    const text = await view.innerText();
    for (const e of core.employees) expect(text, e.firstName).not.toContain(fullNameOf(e));
    expect(text).not.toMatch(/Mid ₹|Market median/);
    await expect(view.locator('circle')).toHaveCount(0);
    await expect(view.getByTestId('range-E2').locator('title')).toHaveCount(1);       // the chart's own label only, no per-person titles
    // Someone in the unpublished grade is told their range is not out yet.
    await page.getByLabel('Preview as').selectOption('emp_1');
    await expect(page.getByTestId('emp-band-M3')).toContainText('the range is not published yet');
    // Publish it, and the range appears; unpublish E1 and it disappears for others.
    await page.getByRole('tab', { name: 'HR view' }).click();
    await page.getByTestId('publish-M3').check();
    await page.getByTestId('publish-E1').uncheck();
    await expect(page.getByText('5 of 6 grades published')).toBeVisible();
    await reload(page);
    await expect(page.getByTestId('publish-M3')).toBeChecked();
    await expect(page.getByTestId('publish-E1')).not.toBeChecked();
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await page.getByLabel('Preview as').selectOption('emp_3');
    await expect(page.getByTestId('emp-band-M3')).toContainText('₹18,00,000 to ₹30,00,000 a year');
    await expect(page.getByTestId('emp-band-E1')).toHaveCount(0);
  });

  test('the recent changes list on the Merit tab records approvals and issues', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
    await expect(page.getByTestId('activity-log')).toContainText('Nothing has been changed');
    await page.getByLabel('Performance band for Pooja Verma').selectOption('meets');
    await expect(page.getByTestId('activity-log')).toContainText('Set the performance band for Pooja Verma to meets');
  });

  test.describe('narrow screen', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['bands', 'merit', 'transparency']) {
      test(`no sideways page scroll at 390px: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/compensation?tab=${t}`);
        await page.waitForTimeout(700);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over).toBeLessThanOrEqual(1);
      });
    }
    test('the merit table scrolls inside its own container', async ({ page }) => {
      await openHrms(page, '/dashboard/hrms/compensation?tab=merit');
      const ok = await page.getByTestId('merit-table').evaluate((el) => { const box = el.firstElementChild as HTMLElement; return box.scrollWidth > box.clientWidth && getComputedStyle(box).overflowX === 'auto'; });
      expect(ok).toBe(true);
    });
  });
});

function fullNameOf(e: { firstName: string; lastName: string }): string { return `${e.firstName} ${e.lastName}`; }
