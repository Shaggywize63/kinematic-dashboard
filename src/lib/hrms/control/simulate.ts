// What-if simulator. Pure functions: give it the HRMS database and a scenario, get the before and after back.
//
// How it stays safe and honest:
//   - It never touches the real database. It works on a copy (structuredClone) with attendance, one-time pay and loans
//     taken out, so the only thing that moves between "before" and "after" is the change being tested.
//   - The numbers come from the core payroll engine (computePayRunPayslips, buildBreakup), not from a second formula.
//   - A statutory what-if has to change a value in rules.ts for a moment. That is done by adding one dated row to the
//     table, running the engine and removing the row again in a finally block, so nothing is left behind.
//   - It is a planning tool. The preview engine has known limits (see engine.ts) and every rule it leans on is listed
//     in the result with its confidence tag.

import type { Employee, HrmsDb, Id, Month, Payslip } from '../types';
import { buildBreakup, computePayRunPayslips } from '../engine';
import { ESI, LABOUR_CODES, LWF_RULES, PF, PT_RULES, TDS, monthEnd, monthStart, rowOn } from '../rules';
import type { Confidence } from '../rules';
import { addMonths, fmtMonth, fullName, inr, inrShort } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type { HiringInput, IncrementInput, IncrementScope, ScenarioInput, ScenarioType, StatutoryInput, StructureInput } from './types';

export const SIM_WINDOW_MONTHS = 12;
const r0 = (n: number) => Math.round(n);

export const SCENARIO_TYPES: { type: ScenarioType; label: string; blurb: string }[] = [
  { type: 'increment', label: 'Increment', blurb: 'Give a team a percentage rise from a month.' },
  { type: 'hiring', label: 'Hiring', blurb: 'Add people at a CTC in a location.' },
  { type: 'structure', label: 'Salary structure', blurb: 'Change how much of the CTC is basic.' },
  { type: 'statutory', label: 'Statutory change', blurb: 'Test a PF or ESI ceiling that is not in force.' },
];

/** The months a scenario can start from: this month and the next five. */
export function simFromMonths(): Month[] {
  const first = PREVIEW_TODAY.slice(0, 7);
  return Array.from({ length: 6 }, (_, i) => addMonths(first, i));
}

// ───────────────────────────── building blocks ─────────────────────────────
/** A deep copy of the database with the things that would blur a comparison taken out. The original is never changed. */
export function cleanCopy(db: HrmsDb): HrmsDb {
  return structuredClone({ ...db, payRuns: [], attendance: [], adjustments: [], loans: [] }) as HrmsDb;
}

/** Payslips of every entity for a month, for a standard month (full attendance, no one-time pay, no loans). */
export function slipsForMonth(db: HrmsDb, month: Month): Payslip[] {
  return db.entities.flatMap((ent) => computePayRunPayslips(db, month, ent.id, 'sim'));
}

export interface Totals {
  headcount: number;
  gross: number;
  employerCost: number;
  /** Employee PF plus the employer's EPF and EPS share. */
  pf: number;
  pfEmployee: number;
  pfEmployer: number;
  /** EDLI and PF admin charges, paid by the employer on top. */
  pfOther: number;
  /** Employee plus employer ESI. */
  esi: number;
  esiCovered: number;
  pt: number;
  lwf: number;
  tds: number;
  net: number;
}

const code = (lines: { code: string; amount: number }[], c: string) => lines.find((l) => l.code === c)?.amount ?? 0;
export const hasEsi = (s: Payslip): boolean => code(s.deductions, 'ESI') > 0 || code(s.employer, 'ESI_ER') > 0;

export function totalsOf(slips: Payslip[]): Totals {
  const sum = (f: (s: Payslip) => number) => slips.reduce((t, s) => t + f(s), 0);
  const pfEmployee = sum((s) => code(s.deductions, 'PF'));
  const pfEmployer = sum((s) => code(s.employer, 'EPF_ER') + code(s.employer, 'EPS_ER'));
  return {
    headcount: slips.length,
    gross: sum((s) => s.gross),
    employerCost: sum((s) => s.employerCost),
    pf: pfEmployee + pfEmployer,
    pfEmployee,
    pfEmployer,
    pfOther: sum((s) => code(s.employer, 'EDLI') + code(s.employer, 'PF_ADM')),
    esi: sum((s) => code(s.deductions, 'ESI') + code(s.employer, 'ESI_ER')),
    esiCovered: slips.filter(hasEsi).length,
    pt: sum((s) => code(s.deductions, 'PT')),
    lwf: sum((s) => code(s.deductions, 'LWF') + code(s.employer, 'LWF_ER')),
    tds: sum((s) => code(s.deductions, 'TDS')),
    net: sum((s) => s.net),
  };
}

/** How many people fail the Labour Codes 50% wages rule in a month, and the monthly add-back that causes. */
export function wageRuleStats(db: HrmsDb, slips: Payslip[], month: Month): { fail: number; addBack: number; failing: Id[] } {
  const byId = new Map(db.employees.map((e) => [e.id, e]));
  const failing: Id[] = [];
  let addBack = 0;
  for (const s of slips) {
    const e = byId.get(s.employeeId);
    const st = db.structures.find((x) => x.id === e?.structureId);
    if (!e || !st || !e.annualCtc) continue;
    const b = buildBreakup(st, e.annualCtc, { asOn: monthEnd(month), pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    if (!b.wageTest.passes) { failing.push(e.id); addBack += b.wageTest.addBack; }
  }
  return { fail: failing.length, addBack: r0(addBack), failing };
}

/**
 * Run `fn` with a hypothetical ceiling in force from `fromMonth`. The dated table in rules.ts is the only place the engine
 * reads these from, so one row is added and then taken out again, even if `fn` throws.
 */
export function withCeilingOverride<T>(rule: StatutoryInput['rule'], value: number, fromMonth: Month, fn: () => T): T {
  const table = rule === 'pf_ceiling' ? PF.ceiling : ESI.ceiling;
  table.push({ from: monthStart(fromMonth), value, source: 'Hypothetical value from the what-if simulator', confidence: 'indicative' });
  const at = table.length - 1;
  try { return fn(); } finally { table.splice(at, 1); }
}

// ───────────────────────────── scenario inputs ─────────────────────────────
export function scopeOptions(db: HrmsDb, scope: IncrementScope): { value: string; label: string }[] {
  if (scope === 'department') return db.departments.map((d) => ({ value: d.id, label: d.name }));
  if (scope === 'location') return db.locations.map((l) => ({ value: l.id, label: l.name }));
  if (scope === 'grade') {
    const grades = Array.from(new Set(db.designations.map((d) => d.grade).filter((g): g is string => !!g)));
    return grades.map((g) => ({ value: g, label: `Grade ${g} (${db.designations.filter((d) => d.grade === g).map((d) => d.name).join(', ')})` }));
  }
  return [];
}

const isLive = (e: Employee): boolean => (e.status === 'active') && !!e.annualCtc && !!e.structureId;

export function inIncrementScope(db: HrmsDb, e: Employee, i: Pick<IncrementInput, 'scope' | 'scopeValue'>): boolean {
  if (!isLive(e)) return false;
  if (i.scope === 'all') return true;
  if (i.scope === 'department') return e.departmentId === i.scopeValue;
  if (i.scope === 'location') return e.locationId === i.scopeValue;
  return db.designations.find((d) => d.id === e.designationId)?.grade === i.scopeValue;
}

export function currentBasicPct(db: HrmsDb, structureId: Id): number | null {
  const st = db.structures.find((s) => s.id === structureId);
  const basic = st?.components.find((c) => c.code === 'BASIC');
  return basic && basic.calc.type === 'pct_ctc' ? basic.calc.value : null;
}

export function currentCeiling(rule: StatutoryInput['rule'], fromMonth: Month): number {
  return rowOn(rule === 'pf_ceiling' ? PF.ceiling : ESI.ceiling, monthEnd(fromMonth)).value;
}

export function defaultInput(db: HrmsDb, type: ScenarioType): ScenarioInput {
  const fromMonth = simFromMonths()[1]!;
  if (type === 'increment') {
    // Warehouse by default: some of that team sit close to the ESI ceiling, so the result shows more than a plain rise.
    const dep = db.departments.find((d) => d.id === 'dep_wh') ?? db.departments[0]!;
    return { type, percent: 12, scope: 'department', scopeValue: dep.id, fromMonth };
  }
  if (type === 'hiring') {
    const des = db.designations.find((d) => d.id === 'des_fe') ?? db.designations[0]!;
    const loc = db.locations[0]!;
    return { type, count: 3, designationId: des.id, annualCtc: 360000, locationId: loc.id, structureId: usualStructure(db, des.id), fromMonth };
  }
  if (type === 'structure') {
    const st = db.structures.find((s) => s.id === 'str_field') ?? db.structures[0]!;
    return { type, structureId: st.id, basicPct: 50, pfOnActual: false, fromMonth };
  }
  return { type, rule: 'esi_ceiling', value: 30000, fromMonth };
}

/** The salary structure most people with this designation are on. */
export function usualStructure(db: HrmsDb, designationId: Id): Id {
  const count = new Map<Id, number>();
  for (const e of db.employees) if (e.designationId === designationId && e.structureId) count.set(e.structureId, (count.get(e.structureId) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? db.structures[0]!.id;
}

export function validateInput(db: HrmsDb, input: ScenarioInput): Record<string, string> {
  const err: Record<string, string> = {};
  if (!simFromMonths().includes(input.fromMonth)) err.fromMonth = 'Choose a month from the list.';
  if (input.type === 'increment') {
    if (!Number.isFinite(input.percent) || input.percent <= 0 || input.percent > 100) err.percent = 'Enter a percentage above 0 and up to 100.';
    if (input.scope !== 'all') {
      if (!scopeOptions(db, input.scope).some((o) => o.value === input.scopeValue)) err.scopeValue = 'Choose who gets the increment.';
      else if (!db.employees.some((e) => inIncrementScope(db, e, input))) err.scopeValue = 'Nobody with a salary is in this group.';
    }
  } else if (input.type === 'hiring') {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 100) err.count = 'Enter a whole number from 1 to 100.';
    if (!Number.isFinite(input.annualCtc) || input.annualCtc < 100000 || input.annualCtc > 50000000) err.annualCtc = 'Enter an annual CTC between ₹1,00,000 and ₹5,00,00,000.';
    if (!db.designations.some((d) => d.id === input.designationId)) err.designationId = 'Choose a designation.';
    if (!db.locations.some((l) => l.id === input.locationId)) err.locationId = 'Choose a location.';
    if (!db.structures.some((s) => s.id === input.structureId)) err.structureId = 'Choose a salary structure.';
  } else if (input.type === 'structure') {
    if (!db.structures.some((s) => s.id === input.structureId)) err.structureId = 'Choose a salary structure.';
    else if (currentBasicPct(db, input.structureId) == null) err.structureId = 'This structure does not set basic as a percentage of CTC, so it cannot be tested here.';
    if (!Number.isFinite(input.basicPct) || input.basicPct < 10 || input.basicPct > 90) err.basicPct = 'Enter a share between 10 and 90.';
  } else {
    if (!Number.isFinite(input.value) || input.value < 1000 || input.value > 1000000) err.value = 'Enter a monthly amount between ₹1,000 and ₹10,00,000.';
  }
  return err;
}

const RULE_NAME: Record<StatutoryInput['rule'], string> = { pf_ceiling: 'PF wage ceiling', esi_ceiling: 'ESI wage ceiling' };

export function describeInput(db: HrmsDb, input: ScenarioInput): string {
  const from = `from ${fmtMonth(input.fromMonth)}`;
  if (input.type === 'increment') {
    const who = input.scope === 'all' ? 'everyone'
      : scopeOptions(db, input.scope).find((o) => o.value === input.scopeValue)?.label.replace(/ \(.*\)$/, '') ?? 'a group';
    return `${input.percent}% increment for ${who}, ${from}`;
  }
  if (input.type === 'hiring') {
    const des = db.designations.find((d) => d.id === input.designationId)?.name ?? 'staff';
    const loc = db.locations.find((l) => l.id === input.locationId)?.name ?? 'a location';
    return `${input.count} ${des}${input.count === 1 ? '' : 's'} at ${inrShort(input.annualCtc)} in ${loc}, ${from}`;
  }
  if (input.type === 'structure') {
    const st = db.structures.find((s) => s.id === input.structureId);
    const cur = currentBasicPct(db, input.structureId);
    return `${st?.name ?? 'Structure'}: basic ${cur ?? '?'}% to ${input.basicPct}% of CTC${input.pfOnActual ? ', PF on full wages' : ''}, ${from}`;
  }
  return `${RULE_NAME[input.rule]} ${inr(currentCeiling(input.rule, input.fromMonth))} to ${inr(input.value)}, ${from}`;
}

// ───────────────────────────── applying a scenario to the copy ─────────────────────────────
function addHires(db: HrmsDb, i: HiringInput): Id[] {
  const loc = db.locations.find((l) => l.id === i.locationId)!;
  const dep = db.employees.find((e) => e.designationId === i.designationId)?.departmentId ?? db.departments[0]!.id;
  const ids: Id[] = [];
  for (let n = 1; n <= i.count; n++) {
    const id = `sim_hire_${n}`;
    ids.push(id);
    db.employees.push({
      id, code: `NEW-${String(n).padStart(3, '0')}`, firstName: 'New hire', lastName: String(n), email: `new.hire${n}@meridian.example`, mobile: '9000000000',
      gender: 'male', dob: '1998-01-01', address: { city: loc.city, state: loc.state },
      entityId: loc.entityId, locationId: loc.id, departmentId: dep, designationId: i.designationId,
      employmentType: 'permanent', status: 'active', joinDate: monthStart(i.fromMonth), probationMonths: 6, noticeDays: 30,
      uanStatus: 'aadhaar_seeded', pfMember: true, pfOnActualWage: false, ptApplicable: true, lwfApplicable: loc.state === 'Maharashtra' || loc.state === 'Karnataka',
      taxRegime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
      payMode: 'bank', structureId: i.structureId, annualCtc: i.annualCtc, documents: [], history: [],
    });
  }
  return ids;
}

/** Change the copy as the scenario says. */
function applyInput(db: HrmsDb, input: ScenarioInput): void {
  if (input.type === 'increment') {
    for (const e of db.employees) {
      if (inIncrementScope(db, e, input)) e.annualCtc = r0((e.annualCtc ?? 0) * (1 + input.percent / 100));
    }
    return;
  }
  if (input.type === 'hiring') { addHires(db, input); return; }
  if (input.type === 'structure') {
    const st = db.structures.find((s) => s.id === input.structureId);
    const basic = st?.components.find((c) => c.code === 'BASIC');
    if (basic) basic.calc.value = input.basicPct;
    if (input.pfOnActual) for (const e of db.employees) if (e.structureId === input.structureId && isLive(e)) e.pfOnActualWage = true;
  }
}

// ───────────────────────────── result ─────────────────────────────
export interface RuleUsed { key: string; label: string; value: string; confidence?: Confidence; hypothetical?: boolean; note?: string }
export interface SimPerson { employeeId: Id; name: string; code: string; beforeNet: number | null; afterNet: number | null; delta: number; flags: string[] }
export interface SimResult {
  input: ScenarioInput;
  title: string;
  month: Month;
  months: Month[];
  before: Totals;
  after: Totals;
  /** Existing people whose net pay changes. */
  affected: number;
  newPeople: number;
  avgTakeHomeChange: number;
  avgTakeHomeChangePct: number;
  esiMovedOut: SimPerson[];
  esiMovedIn: SimPerson[];
  wageRule: { failBefore: number; failAfter: number; addBackBefore: number; addBackAfter: number };
  /** People whose fixed components add up to more than their CTC, before and after. */
  misfit: { before: number; after: number };
  twelve: { month: Month; before: number; after: number; netBefore: number; netAfter: number }[];
  /** Change in employer cost over the 12 months. */
  twelveDelta: number;
  /** Change in staff net pay over the 12 months. */
  twelveNetDelta: number;
  /** Plain sentences that explain what the numbers mean, worked out from the result. */
  insights: string[];
  people: SimPerson[];
  peopleTotal: number;
  rules: RuleUsed[];
  assumptions: string[];
}

function rulesUsed(db: HrmsDb, input: ScenarioInput, month: Month): RuleUsed[] {
  const end = monthEnd(month);
  const out: RuleUsed[] = [];
  const pfRow = rowOn(PF.ceiling, end);
  out.push({ key: 'pf_ceiling', label: 'PF wage ceiling', value: inr(pfRow.value), confidence: pfRow.confidence, note: pfRow.source });
  if (input.type === 'statutory' && input.rule === 'pf_ceiling') {
    out.push({ key: 'pf_ceiling_what_if', label: 'PF wage ceiling in this scenario', value: inr(input.value), confidence: 'indicative', hypothetical: true, note: 'A value you typed in. It is not a notified rule.' });
  }
  const esiRow = rowOn(ESI.ceiling, end);
  out.push({ key: 'esi_ceiling', label: 'ESI wage ceiling', value: inr(esiRow.value), confidence: esiRow.confidence, note: esiRow.source });
  if (input.type === 'statutory' && input.rule === 'esi_ceiling') {
    out.push({ key: 'esi_ceiling_what_if', label: 'ESI wage ceiling in this scenario', value: inr(input.value), confidence: 'indicative', hypothetical: true, note: 'A value you typed in. It is not a notified rule.' });
  }
  const states = Array.from(new Set(db.employees.filter((e) => e.status === 'active').map((e) => db.locations.find((l) => l.id === e.locationId)?.state).filter((s): s is string => !!s)));
  for (const st of states) {
    const pt = PT_RULES.find((r) => r.state === st);
    if (pt) out.push({ key: `pt_${st}`, label: `Professional tax, ${st}`, value: 'Sample slabs', confidence: pt.confidence, note: pt.note });
    const lwf = LWF_RULES.find((r) => r.state === st);
    if (lwf) out.push({ key: `lwf_${st}`, label: `Labour welfare fund, ${st}`, value: `Months ${lwf.months.join(', ')}`, confidence: lwf.confidence });
  }
  out.push({ key: 'wages_50', label: 'Labour Codes 50% wages rule', value: `${LABOUR_CODES.minWagePercent}% of remuneration`, note: `In force from ${LABOUR_CODES.inForceFrom} (as reported)` });
  out.push({ key: 'tds_new', label: 'Income-tax slabs, new regime', value: 'Sample slabs', confidence: TDS.newRegime.confidence });
  out.push({ key: 'pf_rates', label: 'PF rates', value: `${PF.employeeRate}% employee, ${PF.employerRate}% employer` });
  return out;
}

function assumptionsFor(input: ScenarioInput): string[] {
  const base = [
    'Each month is a standard month: full attendance, no overtime, no arrears, bonuses, loans or advances. Only the change you entered moves the numbers.',
    `The 12 months start at ${fmtMonth(input.fromMonth)}. People who leave inside the window drop out of both sides.`,
    'Income tax (TDS) assumes a full financial year of the same pay. The preview engine does not model ESIC contribution periods.',
  ];
  if (input.type === 'increment') base.push('People on notice and joiners without a salary are left out of the increment.');
  if (input.type === 'hiring') base.push('New hires join on the first of the month, are PF members on the new tax regime, and pay professional tax at the standard slab (not the women-only slab).');
  if (input.type === 'structure') base.push('Fixed allowances keep their amounts and the balancing allowance absorbs the change. Gross pay moves only where a component is a percentage of basic.');
  if (input.type === 'statutory') base.push('The new ceiling is a hypothetical. Nothing has been notified and nothing in your configuration changes.');
  return base;
}

/** The engine sets the balancing allowance to zero and says so when the fixed components add up to more than the CTC. */
export const structureMisfit = (s: Payslip): boolean => s.warnings.some((w) => w.includes('balancing allowance was set to zero'));

function personLine(db: HrmsDb, id: Id, before?: Payslip, after?: Payslip, wage?: { b: Set<Id>; a: Set<Id> }): SimPerson {
  const e = db.employees.find((x) => x.id === id)!;
  const flags: string[] = [];
  if (!before && after) flags.push('New hire');
  if (before && after) {
    if (hasEsi(before) && !hasEsi(after)) flags.push('Leaves ESI');
    if (!hasEsi(before) && hasEsi(after)) flags.push('Joins ESI');
    if (!structureMisfit(before) && structureMisfit(after)) flags.push('Structure no longer fits the CTC');
    if (wage) {
      if (wage.b.has(id) && !wage.a.has(id)) flags.push('Now passes the 50% rule');
      if (!wage.b.has(id) && wage.a.has(id)) flags.push('Now fails the 50% rule');
    }
  }
  return { employeeId: id, name: fullName(e), code: e.code, beforeNet: before ? before.net : null, afterNet: after ? after.net : null, delta: (after?.net ?? 0) - (before?.net ?? 0), flags };
}

export function runScenario(db: HrmsDb, input: ScenarioInput): SimResult {
  const months = Array.from({ length: SIM_WINDOW_MONTHS }, (_, i) => addMonths(input.fromMonth, i));
  const baseDb = cleanCopy(db);
  const scnDb = cleanCopy(db);
  applyInput(scnDb, input);
  function compute<T>(fn: () => T): T { return input.type === 'statutory' ? withCeilingOverride(input.rule, input.value, input.fromMonth, fn) : fn(); }

  const twelve: SimResult['twelve'] = [];
  let beforeHead: Payslip[] = [];
  let afterHead: Payslip[] = [];
  for (const [i, m] of months.entries()) {
    const b = slipsForMonth(baseDb, m);
    const a = compute(() => slipsForMonth(scnDb, m));
    twelve.push({
      month: m,
      before: b.reduce((t, s) => t + s.employerCost, 0), after: a.reduce((t, s) => t + s.employerCost, 0),
      netBefore: b.reduce((t, s) => t + s.net, 0), netAfter: a.reduce((t, s) => t + s.net, 0),
    });
    if (i === 0) { beforeHead = b; afterHead = a; }
  }
  const month = months[0]!;
  const beforeBy = new Map(beforeHead.map((s) => [s.employeeId, s]));
  const afterBy = new Map(afterHead.map((s) => [s.employeeId, s]));
  const wb = wageRuleStats(baseDb, beforeHead, month);
  const wa = compute(() => wageRuleStats(scnDb, afterHead, month));
  const wage = { b: new Set(wb.failing), a: new Set(wa.failing) };

  const ids = Array.from(new Set([...beforeBy.keys(), ...afterBy.keys()]));
  const lines = ids.map((id) => personLine(scnDb, id, beforeBy.get(id), afterBy.get(id), wage));
  const existing = lines.filter((l) => l.beforeNet != null && l.afterNet != null);
  const changed = existing.filter((l) => l.delta !== 0);
  const hires = lines.filter((l) => l.beforeNet == null);
  const avg = changed.length ? changed.reduce((t, l) => t + l.delta, 0) / changed.length : 0;
  const avgPct = changed.length ? changed.reduce((t, l) => t + (l.delta / (l.beforeNet || 1)) * 100, 0) / changed.length : 0;
  const people = [...hires, ...changed, ...existing.filter((l) => l.delta === 0 && l.flags.length)]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));

  const result: SimResult = {
    input, title: describeInput(db, input), month, months,
    before: totalsOf(beforeHead), after: totalsOf(afterHead),
    affected: changed.length, newPeople: hires.length,
    avgTakeHomeChange: avg, avgTakeHomeChangePct: avgPct,
    esiMovedOut: existing.filter((l) => l.flags.includes('Leaves ESI')),
    esiMovedIn: existing.filter((l) => l.flags.includes('Joins ESI')),
    wageRule: { failBefore: wb.fail, failAfter: wa.fail, addBackBefore: wb.addBack, addBackAfter: wa.addBack },
    misfit: { before: beforeHead.filter(structureMisfit).length, after: afterHead.filter(structureMisfit).length },
    twelve, twelveDelta: twelve.reduce((t, x) => t + (x.after - x.before), 0), twelveNetDelta: twelve.reduce((t, x) => t + (x.netAfter - x.netBefore), 0),
    insights: [],
    people: people.slice(0, 10), peopleTotal: people.length,
    rules: rulesUsed(db, input, month),
    assumptions: assumptionsFor(input),
  };
  result.insights = insightsFor(result);
  return result;
}

/** Plain sentences that say what the numbers mean. Only statements the numbers support are made. */
function insightsFor(r: SimResult): string[] {
  const out: string[] = [];
  const dCost = r.after.employerCost - r.before.employerCost;
  const dNet = r.after.net - r.before.net;
  const dPf = r.after.pf - r.before.pf;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const w = r.wageRule;
  if (r.misfit.after > r.misfit.before) {
    out.push(`${plural(r.misfit.after - r.misfit.before, 'person has', 'people have')} fixed components that add up to more than the CTC under this structure. Their gross pay would be above CTC, so their numbers are not meaningful until the structure is fixed.`);
  }
  if (r.input.type === 'structure' && w.failAfter < w.failBefore && Math.abs(dPf) < 1 && Math.abs(dNet) < 1) {
    out.push('PF and take-home do not move. Payroll already adds wages back up to 50% of remuneration before it works out PF, gratuity and bonus, so this changes who is flagged, not the PF bill.');
  } else if (w.failAfter < w.failBefore) {
    out.push(`${plural(w.failBefore - w.failAfter, 'person stops', 'people stop')} failing the 50% wages rule. Their add-back is no longer needed (${inr(w.addBackBefore)} a month before, ${inr(w.addBackAfter)} after).`);
  } else if (w.failAfter > w.failBefore) {
    out.push(`${plural(w.failAfter - w.failBefore, 'more person fails', 'more people fail')} the 50% wages rule. Payroll adds ${inr(w.addBackAfter)} a month back to wages (${inr(w.addBackBefore)} before), so PF, gratuity and bonus are still worked out on at least half of pay.`);
  }
  if (r.input.type === 'hiring' && r.newPeople && w.failAfter - w.failBefore >= r.newPeople) {
    out.push('Every new hire fails the 50% wages rule on this structure. A structure with a higher basic share avoids the add-back.');
  }
  if (r.esiMovedOut.length) out.push(`${plural(r.esiMovedOut.length, 'person moves', 'people move')} out of ESI because gross pay is now above the ceiling.`);
  if (r.esiMovedIn.length) out.push(`${plural(r.esiMovedIn.length, 'person comes', 'people come')} under ESI because gross pay is within the ceiling.`);
  if (r.input.type === 'statutory' && dNet < 0 && Math.abs(dCost) <= Math.abs(dNet) * 0.1) {
    out.push('Salaries here are fixed as CTC, so a higher employer contribution comes out of the balancing allowance. Employer cost barely moves and take-home falls. Check your offer letters before relying on this.');
  }
  if (r.input.type === 'increment' && dCost > 0 && r.before.employerCost > 0) {
    out.push(`Employer cost for the month rises ${((dCost / r.before.employerCost) * 100).toFixed(1)}% across the company.`);
  }
  if (!out.length && Math.abs(dCost) < 1 && Math.abs(dNet) < 1) out.push('This change does not move any of the numbers for the month you chose.');
  return out;
}

// ───────────────────────────── text summary ─────────────────────────────
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${inr(Math.abs(n))}`;
const CONF_TEXT: Record<Confidence, string> = { verified: 'verified', reported: 'reported, confirm', indicative: 'sample, confirm' };

export function summaryText(r: SimResult, name?: string): string {
  const row = (label: string, b: number, a: number) => `  ${label.padEnd(26)} ${inr(b).padStart(14)} ${inr(a).padStart(14)} ${signed(a - b).padStart(14)}`;
  const out: string[] = [
    `What-if scenario: ${name || r.title}`,
    `Change: ${r.title}`,
    `Month compared: ${fmtMonth(r.month)}`,
    '',
    'PLANNING ONLY. This is a simulation on sample data. It is not a payroll run and not a statutory filing.',
    '',
    `  ${'Per month'.padEnd(26)} ${'Before'.padStart(14)} ${'After'.padStart(14)} ${'Change'.padStart(14)}`,
    row('Gross pay', r.before.gross, r.after.gross),
    row('Employer cost', r.before.employerCost, r.after.employerCost),
    row('PF (employee + employer)', r.before.pf, r.after.pf),
    row('ESI (employee + employer)', r.before.esi, r.after.esi),
    row('Professional tax', r.before.pt, r.after.pt),
    row('Income tax (TDS)', r.before.tds, r.after.tds),
    row('Net pay', r.before.net, r.after.net),
    '',
    `Average take-home change: ${signed(r.avgTakeHomeChange)} a month across ${r.affected} affected ${r.affected === 1 ? 'person' : 'people'}${r.newPeople ? `; ${r.newPeople} new ${r.newPeople === 1 ? 'hire' : 'hires'}` : ''}`,
    `People who leave ESI: ${r.esiMovedOut.length}. People who join ESI: ${r.esiMovedIn.length}.`,
    `People failing the 50% wages rule: ${r.wageRule.failBefore} before, ${r.wageRule.failAfter} after.`,
    `Employer cost over 12 months from ${fmtMonth(r.month)}: ${signed(r.twelveDelta)}`,
    `Staff net pay over the same 12 months: ${signed(r.twelveNetDelta)}`,
    ...(r.insights.length ? ['', 'What it means', ...r.insights.map((x) => `  - ${x}`)] : []),
    '',
    'Most affected people (net pay a month)',
    ...r.people.map((p) => `  ${p.name} (${p.code}): ${p.beforeNet == null ? 'new' : inr(p.beforeNet)} to ${p.afterNet == null ? 'gone' : inr(p.afterNet)}${p.flags.length ? ` [${p.flags.join('; ')}]` : ''}`),
    '',
    'Rules this relies on',
    ...r.rules.map((x) => `  ${x.label}: ${x.value}${x.hypothetical ? ' (hypothetical)' : ''} [${x.confidence ? CONF_TEXT[x.confidence] : 'not tagged'}]`),
    '',
    'Assumptions',
    ...r.assumptions.map((x) => `  - ${x}`),
    '',
    'Confirm every statutory figure with your advisor before acting on it.',
  ];
  return out.join('\n');
}
