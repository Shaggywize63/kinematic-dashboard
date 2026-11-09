// Rule radar. Pure functions: the feed of rule changes, and what each one means for the sample company.
//
// Where the items come from:
//   - "rule" items are read from the dated tables in rules.ts. Their date, source text and confidence are used as they are.
//     Nothing here adds a rate, a date or a figure that rules.ts does not hold.
//   - "sample" items are advisories written for this preview. They are labelled as such and tagged 'indicative'. Their dates are
//     placeholders, and their "impact" shows what the change would touch in the sample data, not what will happen.
//
// "Impact on us" is worked out from the sample company with the core engine (buildBreakup / computePayRunPayslips), with dates
// either side of the effective date where the rule has a before and an after.

import type { ComplianceTask, HrmsDb, Id, ISODate, Month } from '../types';
import { annualTax, buildBreakup } from '../engine';
import {
  ESI, HRA_METROS, LABOUR_CODES, LWF_RULES, MIN_WAGES, PF, PT_RULES, TDS, isMetroCity, lwfFor, minWageFor, monthEnd, valueOn,
} from '../rules';
import type { Confidence } from '../rules';
import { addDays, addMonths, diffDays, fmtDate, fmtMonth, fullName, inr } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { cleanCopy, hasEsi, runScenario, slipsForMonth, wageRuleStats } from './simulate';

export type RadarCategory = 'PF' | 'ESI' | 'PT' | 'LWF' | 'TDS' | 'Wages' | 'Labour Codes';
export const RADAR_CATEGORIES: RadarCategory[] = ['PF', 'ESI', 'PT', 'LWF', 'TDS', 'Wages', 'Labour Codes'];
export const RADAR_STATUS_LABEL = { new: 'New', acknowledged: 'Acknowledged', applied: 'Applied in config', not_applicable: 'Not applicable' } as const;

export type DateLabel = 'Effective' | 'Notified' | 'Next applies' | 'Placeholder date';
export interface RadarItem {
  id: string;
  title: string;
  category: RadarCategory;
  effectiveOn: ISODate;
  dateLabel: DateLabel;
  confidence: Confidence;
  /** The source text, as rules.ts has it, or a plain statement that this is a sample advisory. */
  source: string;
  summary: string;
  kind: 'rule' | 'sample';
  /** The compliance-calendar law a task made from this item is filed under. The closest fit, since the calendar has a fixed list. */
  law: ComplianceTask['law'];
  state?: string;
}

/** The ESI ceiling that the source note in rules.ts says was discussed in August 2026 and not notified. */
export const ESI_DISCUSSED_CEILING = 30000;
/** Date of the bonus-ceiling notification, from the source note in rules.ts (S.O. 4711(E), 25 Aug 2026, as reported). */
const BONUS_NOTIFIED_ON: ISODate = '2026-08-25';
export const RADAR_REF_MONTH: Month = PREVIEW_TODAY.slice(0, 7);
const SAMPLE_SOURCE = 'Sample advisory written for this preview. It is not a real notification.';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The next first-of-month on or after today when a state fund collects (months are numbers 1 to 12). */
function nextContributionMonth(months: number[], today: ISODate): Month {
  const first = today.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const m = addMonths(first, i);
    if (months.includes(Number(m.slice(5, 7)))) return m;
  }
  return first;
}

export function buildRadarItems(today: ISODate = PREVIEW_TODAY): RadarItem[] {
  const items: RadarItem[] = [];

  PF.ceiling.forEach((row, i) => {
    const prev = PF.ceiling[i - 1];
    items.push({
      id: `pf-ceiling-${row.from}`, kind: 'rule', category: 'PF', law: 'PF', effectiveOn: row.from, dateLabel: 'Effective',
      title: prev ? `PF wage ceiling rises from ${inr(prev.value)} to ${inr(row.value)}` : `PF wage ceiling set at ${inr(row.value)}`,
      confidence: row.confidence, source: row.source,
      summary: prev
        ? 'PF is worked out on wages up to the ceiling. When the ceiling rises, the employee and the employer both pay more for everyone whose wages are above the old ceiling.'
        : 'PF is worked out on wages up to the ceiling, unless the company pays on full wages.',
    });
  });

  ESI.ceiling.forEach((row) => {
    items.push({
      id: `esi-ceiling-${row.from}`, kind: 'rule', category: 'ESI', law: 'ESI', effectiveOn: row.from, dateLabel: 'Effective',
      title: `ESI wage ceiling ${inr(row.value)} a month`, confidence: row.confidence, source: row.source,
      summary: 'ESI covers people whose gross pay is at or below the ceiling. Above it, the person leaves the scheme.',
    });
  });

  HRA_METROS.forEach((row, i) => {
    const prev = HRA_METROS[i - 1]?.value ?? [];
    const added = row.value.filter((c) => !prev.includes(c));
    items.push({
      id: `hra-metro-${row.from}`, kind: 'rule', category: 'TDS', law: 'TDS', effectiveOn: row.from, dateLabel: 'Effective',
      title: i === 0 ? `HRA metro list: ${row.value.join(', ')}` : `${added.join(', ')} join the 50% HRA rate`,
      confidence: row.confidence, source: row.source,
      summary: 'In the old tax regime, people in a metro city can claim house rent allowance up to 50% of basic instead of 40%. It changes the TDS of people who rent and chose the old regime.',
    });
  });

  items.push({
    id: 'tds-new-regime', kind: 'rule', category: 'TDS', law: 'TDS', effectiveOn: '2026-04-01', dateLabel: 'Effective',
    title: 'Salary TDS under the Income-tax Act 2025, new regime slabs',
    confidence: TDS.newRegime.confidence, source: 'Income-tax Act 2025, from 1 April 2026 (as reported). Slabs are sample values in the rules tables.',
    summary: 'The new regime is the default. TDS on salary follows the slabs, the standard deduction and the rebate in the sample rules.',
  });

  const wageStates = Array.from(new Set(MIN_WAGES.map((m) => m.state)));
  for (const state of wageStates) {
    const rows = MIN_WAGES.filter((m) => m.state === state);
    const un = rows.find((r) => r.skill === 'unskilled');
    items.push({
      id: `min-wage-${slug(state)}`, kind: 'rule', category: 'Wages', law: 'Bonus', state,
      effectiveOn: rows.map((r) => r.asOn).sort()[0]!, dateLabel: 'Effective',
      title: `Minimum wage reference, ${state}`,
      confidence: rows.some((r) => r.confidence === 'indicative') ? 'indicative' : 'reported',
      source: 'Sample minimum wage table in the rules tables. Each state revises on its own cycle.',
      summary: `${un ? `Unskilled ${inr(un.monthly)} a month. ` : ''}${rows.filter((r) => r.skill !== 'unskilled').map((r) => `${r.skill.replace('_', '-')} ${inr(r.monthly)}`).join(', ')}${rows.length > 1 ? '. ' : ''}Pay below the minimum is an offence, so the lowest paid person is the one to watch.`,
    });
  }

  items.push({
    id: 'labour-codes-in-force', kind: 'rule', category: 'Labour Codes', law: 'Shops', effectiveOn: LABOUR_CODES.inForceFrom, dateLabel: 'Effective',
    title: 'Labour Codes in force: the 50% wages rule, overtime and settlement time',
    confidence: 'reported', source: `Labour Codes, in force from ${fmtDate(LABOUR_CODES.inForceFrom)} (as reported).`,
    summary: `Wages must be at least ${LABOUR_CODES.minWagePercent}% of total pay. Overtime is paid at not less than ${LABOUR_CODES.overtimeMultiplier} times the rate, up to ${LABOUR_CODES.overtimeQuarterlyCapHours} hours a quarter. Full and final settlement is due within ${LABOUR_CODES.settlementWorkingDays} working days of the last day.`,
  });
  items.push({
    id: 'gratuity-fixed-term', kind: 'rule', category: 'Labour Codes', law: 'Gratuity', effectiveOn: LABOUR_CODES.inForceFrom, dateLabel: 'Effective',
    title: `Gratuity for fixed-term staff after ${LABOUR_CODES.gratuity.fixedTermYears} year`,
    confidence: 'reported', source: `Labour Codes, from ${fmtDate(LABOUR_CODES.inForceFrom)} (as reported).`,
    summary: `Fixed-term employees become eligible for gratuity after ${LABOUR_CODES.gratuity.fixedTermYears} year of service. Permanent staff need ${LABOUR_CODES.gratuity.permanentYears} years.`,
  });
  items.push({
    id: 'bonus-ceiling', kind: 'rule', category: 'Wages', law: 'Bonus', effectiveOn: BONUS_NOTIFIED_ON, dateLabel: 'Notified',
    title: `Bonus eligibility ceiling ${inr(LABOUR_CODES.bonus.eligibilityCeiling)} a month`,
    confidence: 'reported', source: 'S.O. 4711(E), 25 Aug 2026 (as reported).',
    summary: 'People whose monthly wages are at or below the ceiling are eligible for the statutory bonus. The date is the notification date; the start date is not stated in the rules tables.',
  });

  for (const rule of LWF_RULES) {
    const month = nextContributionMonth(rule.months, today);
    items.push({
      id: `lwf-${slug(rule.state)}`, kind: 'rule', category: 'LWF', law: 'LWF', state: rule.state, effectiveOn: `${month}-01`, dateLabel: 'Next applies',
      title: `Labour welfare fund, ${rule.state}: next deduction in ${fmtMonth(month)}`,
      confidence: rule.confidence, source: 'Sample state table in the rules tables (contribution months and amounts).',
      summary: `The fund is collected in month ${rule.months.join(' and ')} of the year. The amounts are sample values and each state sets its own.`,
    });
  }

  const febStates = PT_RULES.filter((r) => r.februaryAmount);
  const feb = Number(today.slice(5, 7)) >= 2 ? `${Number(today.slice(0, 4)) + 1}-02` : `${today.slice(0, 4)}-02`;
  items.push({
    id: 'pt-february-balance', kind: 'rule', category: 'PT', law: 'PT', effectiveOn: `${feb}-01`, dateLabel: 'Next applies',
    title: `Professional tax: higher February amount in ${febStates.map((r) => r.state).join(' and ')}`,
    confidence: febStates.some((r) => r.confidence === 'indicative') ? 'indicative' : 'reported',
    source: 'Sample state tables in the rules tables. Some states collect the annual balance in February.',
    summary: 'In February these states charge a different amount from the other eleven months, so the February payroll shows more professional tax.',
  });

  items.push({
    id: 'sample-pt-revision', kind: 'sample', category: 'PT', law: 'PT', state: 'Karnataka', effectiveOn: '2027-04-01', dateLabel: 'Placeholder date',
    title: 'State professional tax slab revision under review (Karnataka)',
    confidence: 'indicative', source: SAMPLE_SOURCE,
    summary: 'States revise their slabs from time to time, usually from the start of a financial year. No revision has been notified. The date is a placeholder.',
  });
  items.push({
    id: 'sample-labour-state-rules', kind: 'sample', category: 'Labour Codes', law: 'Shops', effectiveOn: '2027-01-01', dateLabel: 'Placeholder date',
    title: 'Labour Codes: notification of state rules pending',
    confidence: 'indicative', source: SAMPLE_SOURCE,
    summary: 'The Codes need rules from each state before every detail can be applied. Until a state notifies them, practice differs. The date is a placeholder.',
  });
  items.push({
    id: 'sample-esi-ceiling', kind: 'sample', category: 'ESI', law: 'ESI', effectiveOn: '2027-01-01', dateLabel: 'Placeholder date',
    title: `ESI ceiling rise to ${inr(ESI_DISCUSSED_CEILING)} discussed, not notified`,
    confidence: 'indicative', source: `${SAMPLE_SOURCE} The figure is the one named in the ESI source note in the rules tables.`,
    summary: 'If the ceiling rose, more people would come under ESI and their take-home would fall. Test it in the What-if simulator before it is notified.',
  });
  items.push({
    id: 'sample-min-wage-revision', kind: 'sample', category: 'Wages', law: 'Bonus', effectiveOn: '2027-01-01', dateLabel: 'Placeholder date',
    title: 'Next minimum wage revision (central dearness allowance)',
    confidence: 'indicative', source: `${SAMPLE_SOURCE} The note in the rules tables says the central VDA changed twice in 2026.`,
    summary: 'Minimum wages move with the dearness allowance. Any rise narrows the gap for the lowest paid people. The date is a placeholder.',
  });

  return items;
}

// ───────────────────────────── filters and groups ─────────────────────────────
export function daysUntil(item: Pick<RadarItem, 'effectiveOn'>, today: ISODate = PREVIEW_TODAY): number {
  return diffDays(today, item.effectiveOn);
}
/** Items that take effect from today up to `days` days ahead. */
export function effectiveWithin(items: RadarItem[], days: number, today: ISODate = PREVIEW_TODAY): RadarItem[] {
  return items.filter((i) => { const d = daysUntil(i, today); return d >= 0 && d <= days; }).sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
}
/** Upcoming items first (soonest first), then items already in force (most recent first). */
export function sortFeed(items: RadarItem[], today: ISODate = PREVIEW_TODAY): RadarItem[] {
  const up = items.filter((i) => i.effectiveOn >= today).sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.id.localeCompare(b.id));
  const past = items.filter((i) => i.effectiveOn < today).sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || a.id.localeCompare(b.id));
  return [...up, ...past];
}
export function whenText(item: RadarItem, today: ISODate = PREVIEW_TODAY): string {
  const d = daysUntil(item, today);
  const label = item.dateLabel === 'Placeholder date' ? 'Placeholder' : item.dateLabel;
  if (d === 0) return `${label} today`;
  const n = Math.abs(d);
  const span = n >= 365 ? `${(n / 365).toFixed(n >= 730 ? 0 : 1).replace(/\.0$/, '')} years` : n >= 60 ? `${Math.round(n / 30)} months` : `${n} ${n === 1 ? 'day' : 'days'}`;
  return d > 0 ? `${label} ${fmtDate(item.effectiveOn)}, in ${span}` : `${label} ${fmtDate(item.effectiveOn)}, ${span} ago`;
}

// ───────────────────────────── impact on us ─────────────────────────────
export interface Impact {
  /** One plain sentence, shown on the card. */
  headline: string;
  /** People the change touches. */
  employees: number;
  /** Rupees a month, each with what it is. */
  money: { label: string; value: number }[];
  lines: { label: string; value: string }[];
  people: { employeeId: Id; detail: string }[];
  /** Names of the legal entities and states touched. */
  scopes: string[];
  /** How it was worked out. */
  basis: string;
  entityId?: Id;
  state?: string;
}

interface Ctx {
  base: HrmsDb;
  month: (m: Month) => ReturnType<typeof slipsForMonth>;
  live: HrmsDb['employees'];
  loc: (e: HrmsDb['employees'][number]) => HrmsDb['locations'][number] | undefined;
  entName: (id: Id) => string;
}

function makeCtx(db: HrmsDb): Ctx {
  const base = cleanCopy(db);
  const cache = new Map<Month, ReturnType<typeof slipsForMonth>>();
  return {
    base,
    month: (m) => { let s = cache.get(m); if (!s) { s = slipsForMonth(base, m); cache.set(m, s); } return s; },
    live: base.employees.filter((e) => (e.status === 'active' || e.status === 'on_notice') && !!e.annualCtc && !!e.structureId),
    loc: (e) => base.locations.find((l) => l.id === e.locationId),
    entName: (id) => base.entities.find((x) => x.id === id)?.name ?? id,
  };
}

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const topEntity = (c: Ctx, ids: Id[]): Id | undefined => {
  const count = new Map<Id, number>();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const none = (headline: string, basis: string): Impact => ({ headline, employees: 0, money: [], lines: [], people: [], scopes: [], basis });

function pfImpact(c: Ctx, item: RadarItem, index: number): Impact {
  const row = PF.ceiling[index]!;
  const prev = PF.ceiling[index - 1];
  const asOn = row.from;
  const basis = prev
    ? `Salary breakup for every PF member on ${fmtDate(addDays(asOn, -1))} and on ${fmtDate(asOn)}, with the ceiling in force on each date.`
    : 'Salary breakup for every PF member on the effective date, with the ceiling in force then.';
  if (!prev) {
    const members = c.live.filter((e) => e.pfMember);
    const capped = members.filter((e) => {
      const st = c.base.structures.find((s) => s.id === e.structureId)!;
      const b = buildBreakup(st, e.annualCtc!, { asOn: PREVIEW_TODAY, pfMember: true, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
      return !e.pfOnActualWage && b.wageTest.codeWages > row.value;
    });
    return {
      headline: `${plural(members.length, 'person is a', 'people are')} PF member${members.length === 1 ? '' : 's'}. ${capped.length} of them have wages above this ${inr(row.value)} ceiling. Today's ceiling is ${inr(valueOn(PF.ceiling, PREVIEW_TODAY))}.`,
      employees: members.length, money: [], lines: [{ label: 'PF members', value: String(members.length) }], people: [], scopes: [], basis,
    };
  }
  let emp = 0; let er = 0;
  const people: Impact['people'] = [];
  const ents: Id[] = [];
  const states = new Set<string>();
  for (const e of c.live.filter((x) => x.pfMember)) {
    const st = c.base.structures.find((s) => s.id === e.structureId)!;
    const o = { pfMember: true, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides };
    const b0 = buildBreakup(st, e.annualCtc!, { asOn: addDays(asOn, -1), ...o });
    const b1 = buildBreakup(st, e.annualCtc!, { asOn, ...o });
    const d = b1.pfWage - b0.pfWage;
    if (!d) continue;
    const dEmp = Math.round((d * PF.employeeRate) / 100);
    const cap0 = valueOn(PF.ceiling, addDays(asOn, -1)); const cap1 = valueOn(PF.ceiling, asOn);
    const dEr = Math.round((d * PF.employerRate) / 100) + Math.round(((Math.min(b1.pfWage, cap1) - Math.min(b0.pfWage, cap0)) * (PF.edliRate + PF.adminRate)) / 100);
    emp += dEmp; er += dEr;
    people.push({ employeeId: e.id, detail: `PF wage ${inr(b0.pfWage)} to ${inr(b1.pfWage)}, employee PF +${inr(dEmp)} a month` });
    ents.push(e.entityId);
    const l = c.loc(e); if (l) states.add(l.state);
  }
  return {
    headline: people.length
      ? `${plural(people.length, 'person pays', 'people pay')} more PF: ${inr(emp + er)} a month in total (${inr(emp)} from employees, ${inr(er)} from the company).`
      : 'Nobody on payroll has wages above the old ceiling, so PF does not change.',
    employees: people.length,
    money: [{ label: 'Employee PF, a month', value: emp }, { label: 'Employer PF and charges, a month', value: er }],
    lines: [{ label: 'Old ceiling', value: inr(prev.value) }, { label: 'New ceiling', value: inr(row.value) }, { label: 'People affected', value: String(people.length) }],
    people: people.slice(0, 12), scopes: [...new Set(ents.map(c.entName)), ...states], basis, entityId: topEntity(c, ents), state: undefined,
  };
}

function esiImpact(c: Ctx): Impact {
  const slips = c.month(RADAR_REF_MONTH);
  const covered = slips.filter(hasEsi);
  const ceiling = valueOn(ESI.ceiling, monthEnd(RADAR_REF_MONTH));
  const money = sum(covered.map((s) => (s.deductions.find((d) => d.code === 'ESI')?.amount ?? 0) + (s.employer.find((d) => d.code === 'ESI_ER')?.amount ?? 0)));
  const near = [...slips].sort((a, b) => Math.abs(a.gross - ceiling) - Math.abs(b.gross - ceiling)).slice(0, 4);
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  return {
    headline: `${plural(covered.length, 'person is', 'people are')} covered by ESI at the ${inr(ceiling)} ceiling: ${inr(money)} a month, employee and employer together.`,
    employees: covered.length, money: [{ label: 'ESI, employee and employer, a month', value: money }],
    lines: [{ label: 'Ceiling', value: inr(ceiling) }, { label: 'Covered', value: `${covered.length} of ${slips.length}` }],
    people: near.map((s) => ({ employeeId: s.employeeId, detail: `Gross ${inr(s.gross)}, ${s.gross <= ceiling ? `${inr(ceiling - s.gross)} under` : `${inr(s.gross - ceiling)} over`} the ceiling` })),
    scopes: [...new Set(covered.map((s) => c.entName(byId.get(s.employeeId)!.entityId)))],
    basis: `A standard ${fmtMonth(RADAR_REF_MONTH)} payroll run through the engine. The four people nearest the ceiling are listed.`,
    entityId: topEntity(c, covered.map((s) => byId.get(s.employeeId)!.entityId)),
  };
}

function hraImpact(c: Ctx, index: number): Impact {
  const row = HRA_METROS[index]!;
  const prev = HRA_METROS[index - 1];
  const slips = c.month(RADAR_REF_MONTH);
  const slipOf = new Map(slips.map((s) => [s.employeeId, s]));
  if (!prev) {
    const inMetro = c.live.filter((e) => isMetroCity(c.loc(e)?.city ?? '', row.from) || isMetroCity(c.loc(e)?.city ?? '', PREVIEW_TODAY));
    return {
      headline: `${plural(inMetro.length, 'person works', 'people work')} in a metro city under the first list. The list today has ${valueOn(HRA_METROS, PREVIEW_TODAY).length} cities.`,
      employees: inMetro.length, money: [], lines: [{ label: 'Cities today', value: valueOn(HRA_METROS, PREVIEW_TODAY).join(', ') }], people: [],
      scopes: [], basis: 'Each person\'s work city checked against the metro list on the effective date.',
    };
  }
  const flips = c.live.filter((e) => { const city = c.loc(e)?.city ?? ''; return !isMetroCity(city, addDays(row.from, -1)) && isMetroCity(city, row.from); });
  const cities = [...new Set(flips.map((e) => c.loc(e)!.city))];
  let saving = 0; let realOld = 0;
  const people: Impact['people'] = [];
  for (const e of flips) {
    const s = slipOf.get(e.id);
    const l = c.loc(e)!;
    if (!s || e.taxRegime !== 'old') { people.push({ employeeId: e.id, detail: `${l.city}, new tax regime: no HRA claim, no change` }); continue; }
    const st = c.base.structures.find((x) => x.id === e.structureId)!;
    const b = buildBreakup(st, e.annualCtc!, { asOn: monthEnd(RADAR_REF_MONTH), pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    const tax = (metro: boolean) => annualTax({
      regime: e.taxRegime, annualGross: s.wages.taxableMonthly * 12, basicAnnual: b.basic * 12, hraAnnual: (s.earnings.find((x) => x.code === 'HRA')?.amount ?? 0) * 12, metro,
      employeePfAnnual: (s.deductions.find((x) => x.code === 'PF')?.amount ?? 0) * 12, ptAnnual: (s.deductions.find((x) => x.code === 'PT')?.amount ?? 0) * 12, declaration: e.declaration,
    }).total / 12;
    const gain = Math.round(tax(false) - tax(true));
    realOld += 1;
    if (l.metro) { people.push({ employeeId: e.id, detail: `${l.city}, old regime: payroll already treats ${l.name} as metro, no change` }); continue; }
    saving += gain;
    people.push({ employeeId: e.id, detail: `${l.city}, old regime: TDS falls by about ${inr(gain)} a month` });
  }
  const flagged = flips.every((e) => c.loc(e)?.metro);
  return {
    headline: flips.length
      ? `${plural(flips.length, 'person works', 'people work')} in ${cities.join(', ')}, which ${cities.length === 1 ? 'joins' : 'join'} the 50% rate. ${flagged ? `The location master already marks ${cities.length === 1 ? 'it' : 'them'} as metro, so payroll shows no TDS change today.` : `Old-regime renters save about ${inr(saving)} a month in TDS.`}`
      : 'Nobody works in the cities that join the list.',
    employees: flips.length, money: saving ? [{ label: 'TDS saved by renters on the old regime, a month', value: saving }] : [],
    lines: [{ label: 'Cities joining', value: cities.join(', ') || 'None of ours' }, { label: 'On the old regime', value: String(realOld) }],
    people: people.slice(0, 12), scopes: cities,
    basis: 'Each person\'s work city checked against the metro list the day before and on the effective date. For the old regime, TDS is worked out with the engine\'s own tax function, with and without the metro rate.',
    entityId: topEntity(c, flips.map((e) => e.entityId)),
  };
}

function tdsImpact(c: Ctx): Impact {
  const slips = c.month(RADAR_REF_MONTH);
  const tds = sum(slips.map((s) => s.deductions.find((d) => d.code === 'TDS')?.amount ?? 0));
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const newRegime = slips.filter((s) => byId.get(s.employeeId)?.taxRegime === 'new').length;
  return {
    headline: `${newRegime} of ${slips.length} people are on the new regime. Salary TDS comes to ${inr(tds)} for a standard ${fmtMonth(RADAR_REF_MONTH)}.`,
    employees: slips.length, money: [{ label: 'Salary TDS, a month', value: tds }],
    lines: [{ label: 'New regime', value: String(newRegime) }, { label: 'Old regime', value: String(slips.length - newRegime) }],
    people: [], scopes: c.base.entities.map((e) => e.name),
    basis: 'A standard payroll run through the engine. This shows the size of what the slabs govern, not a before and after: the rules tables hold only the current slabs.',
    entityId: topEntity(c, slips.map((s) => byId.get(s.employeeId)!.entityId)),
  };
}

function minWageImpact(c: Ctx, item: RadarItem): Impact {
  const state = item.state!;
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const slips = c.month(RADAR_REF_MONTH).filter((s) => c.loc(byId.get(s.employeeId)!)?.state === state);
  const mw = minWageFor(state, 'unskilled');
  if (!slips.length) return none(`Nobody works in ${state}, so this does not touch us today.`, 'Work locations of everyone on payroll.');
  const lowest = [...slips].sort((a, b) => a.gross - b.gross)[0]!;
  const below = mw == null ? [] : slips.filter((s) => s.gross < mw);
  const gap = mw == null ? null : lowest.gross - mw;
  const who = fullName(byId.get(lowest.employeeId)!);
  return {
    headline: mw == null
      ? `${plural(slips.length, 'person works', 'people work')} in ${state}. The sample table has no unskilled rate for it.`
      : `Lowest monthly gross in ${state} is ${inr(lowest.gross)} (${who}), ${inr(Math.abs(gap!))} ${gap! >= 0 ? 'above' : 'below'} the sample unskilled minimum of ${inr(mw)}.`,
    employees: slips.length,
    money: [],
    lines: [{ label: 'People in the state', value: String(slips.length) }, { label: 'Below the minimum', value: String(below.length) }, ...(mw != null ? [{ label: 'Sample unskilled minimum', value: inr(mw) }] : [])],
    people: [...slips].sort((a, b) => a.gross - b.gross).slice(0, 4).map((s) => ({ employeeId: s.employeeId, detail: `Gross ${inr(s.gross)} a month` })),
    scopes: [state], basis: `A standard ${fmtMonth(RADAR_REF_MONTH)} payroll run through the engine, compared with the sample table for ${state}.`,
    entityId: topEntity(c, slips.map((s) => byId.get(s.employeeId)!.entityId)), state,
  };
}

function labourCodesImpact(c: Ctx): Impact {
  const slips = c.month(RADAR_REF_MONTH);
  const w = wageRuleStats(c.base, slips, RADAR_REF_MONTH);
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const ceiling = valueOn(PF.ceiling, monthEnd(RADAR_REF_MONTH));
  let emp = 0; let er = 0;
  const people: Impact['people'] = [];
  for (const id of w.failing) {
    const e = byId.get(id)!;
    const st = c.base.structures.find((s) => s.id === e.structureId)!;
    const b = buildBreakup(st, e.annualCtc!, { asOn: monthEnd(RADAR_REF_MONTH), pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    const without = !e.pfMember ? 0 : e.pfOnActualWage ? b.wageTest.wages : Math.min(b.wageTest.wages, ceiling);
    const d = b.pfWage - without;
    emp += Math.round((d * PF.employeeRate) / 100);
    er += Math.round((d * PF.employerRate) / 100);
    people.push({ employeeId: id, detail: `Wages are ${b.wageTest.wagePct.toFixed(0)}% of pay; ${inr(b.wageTest.addBack)} a month is added back` });
  }
  return {
    headline: `${w.fail} of ${slips.length} people fail the 50% wages rule. Payroll adds ${inr(w.addBack)} a month back to their wages${emp + er ? `, which adds ${inr(emp + er)} a month of PF` : ''}.`,
    employees: w.fail, money: [{ label: 'Wages added back, a month', value: w.addBack }, { label: 'Extra PF caused by the add-back, a month', value: emp + er }],
    lines: [{ label: 'People failing the rule', value: `${w.fail} of ${slips.length}` }, { label: 'Structures involved', value: [...new Set(w.failing.map((id) => c.base.structures.find((s) => s.id === byId.get(id)!.structureId)?.name))].join(', ') || 'None' }],
    people: people.slice(0, 12), scopes: c.base.entities.map((e) => e.name),
    basis: 'Salary breakup of everyone on payroll, with and without the wages add-back.',
    entityId: topEntity(c, w.failing.map((id) => byId.get(id)!.entityId)),
  };
}

function gratuityImpact(c: Ctx): Impact {
  const years = LABOUR_CODES.gratuity.fixedTermYears;
  const fixed = c.live.filter((e) => e.employmentType === 'fixed_term');
  const people: Impact['people'] = [];
  const lines: Impact['lines'] = [];
  for (const e of fixed) {
    const eligibleOn = `${Number(e.joinDate.slice(0, 4)) + years}${e.joinDate.slice(4)}`;
    const endsFirst = !!e.contractEndDate && e.contractEndDate < eligibleOn;
    people.push({ employeeId: e.id, detail: `Joined ${fmtDate(e.joinDate)}; reaches ${years} year on ${fmtDate(eligibleOn)}${e.contractEndDate ? `; contract ends ${fmtDate(e.contractEndDate)}${endsFirst ? ', before that date. Renewing it would make the person eligible.' : ''}` : ''}` });
    lines.push({ label: fullName(e), value: `eligible from ${fmtDate(eligibleOn)}` });
  }
  return {
    headline: fixed.length ? `${plural(fixed.length, 'fixed-term person', 'fixed-term people')} on payroll. ${people[0] ? people[0].detail : ''}` : 'Nobody on payroll is on a fixed-term contract.',
    employees: fixed.length, money: [], lines, people, scopes: [...new Set(fixed.map((e) => c.entName(e.entityId)))],
    basis: 'Join dates and contract end dates of fixed-term staff, against the one-year rule.', entityId: topEntity(c, fixed.map((e) => e.entityId)),
  };
}

function bonusImpact(c: Ctx): Impact {
  const ceiling = LABOUR_CODES.bonus.eligibilityCeiling;
  const rows = c.live.map((e) => {
    const st = c.base.structures.find((s) => s.id === e.structureId)!;
    const b = buildBreakup(st, e.annualCtc!, { asOn: PREVIEW_TODAY, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    return { e, wages: b.wageTest.codeWages };
  });
  const eligible = rows.filter((r) => r.wages <= ceiling);
  return {
    headline: `${eligible.length} of ${rows.length} people have monthly wages at or below ${inr(ceiling)}, so they may be eligible for the statutory bonus.`,
    employees: eligible.length, money: [],
    lines: [{ label: 'Eligibility ceiling', value: inr(ceiling) }, { label: 'Eligible', value: `${eligible.length} of ${rows.length}` }],
    people: eligible.slice(0, 12).map((r) => ({ employeeId: r.e.id, detail: `Monthly wages ${inr(r.wages)}` })),
    scopes: [...new Set(eligible.map((r) => c.entName(r.e.entityId)))],
    basis: 'Monthly wages after the 50% add-back, from each person\'s salary breakup. The bonus percentage and calculation ceiling are not applied here.',
    entityId: topEntity(c, eligible.map((r) => r.e.entityId)),
  };
}

function lwfImpact(c: Ctx, item: RadarItem): Impact {
  const state = item.state!;
  const month = item.effectiveOn.slice(0, 7);
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const slips = c.month(month).filter((s) => c.loc(byId.get(s.employeeId)!)?.state === state && (s.deductions.some((d) => d.code === 'LWF')));
  if (!slips.length) {
    const inState = c.live.filter((e) => c.loc(e)?.state === state).length;
    return none(inState ? `${plural(inState, 'person works', 'people work')} in ${state} but none has the fund switched on.` : `Nobody works in ${state}, so this does not apply to us.`, `A standard ${fmtMonth(month)} payroll run through the engine.`);
  }
  const emp = sum(slips.map((s) => s.deductions.find((d) => d.code === 'LWF')?.amount ?? 0));
  const er = sum(slips.map((s) => s.employer.find((d) => d.code === 'LWF_ER')?.amount ?? 0));
  const per = lwfFor(state, month);
  return {
    headline: `${plural(slips.length, 'person', 'people')} in ${state}: ${inr(emp)} from employees and ${inr(er)} from the company in ${fmtMonth(month)}.`,
    employees: slips.length, money: [{ label: `Employee share in ${fmtMonth(month)}`, value: emp }, { label: `Employer share in ${fmtMonth(month)}`, value: er }],
    lines: [{ label: 'Per person (employee / employer)', value: `${inr(per.employee)} / ${inr(per.employer)}` }],
    people: slips.slice(0, 12).map((s) => ({ employeeId: s.employeeId, detail: `Employee ${inr(s.deductions.find((d) => d.code === 'LWF')?.amount ?? 0)}` })),
    scopes: [state], basis: `A standard ${fmtMonth(month)} payroll run through the engine.`, entityId: topEntity(c, slips.map((s) => byId.get(s.employeeId)!.entityId)), state,
  };
}

function ptFebruaryImpact(c: Ctx, item: RadarItem): Impact {
  const febMonth = item.effectiveOn.slice(0, 7);
  const janMonth = addMonths(febMonth, -1);
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const pt = (m: Month) => new Map(c.month(m).map((s) => [s.employeeId, s.deductions.find((d) => d.code === 'PT')?.amount ?? 0]));
  const jan = pt(janMonth); const feb = pt(febMonth);
  const people: Impact['people'] = [];
  const perState = new Map<string, number>();
  const ents: Id[] = [];
  let extra = 0;
  for (const [id, f] of feb) {
    const j = jan.get(id) ?? 0;
    if (f === j) continue;
    const e = byId.get(id)!;
    const st = c.loc(e)?.state ?? '';
    extra += f - j; perState.set(st, (perState.get(st) ?? 0) + (f - j)); ents.push(e.entityId);
    people.push({ employeeId: id, detail: `${st}: ${inr(j)} in ${fmtMonth(janMonth)}, ${inr(f)} in ${fmtMonth(febMonth)}` });
  }
  return {
    headline: people.length ? `${plural(people.length, 'person pays', 'people pay')} ${inr(extra)} more professional tax in ${fmtMonth(febMonth)} than in ${fmtMonth(janMonth)}.` : `No change in professional tax between ${fmtMonth(janMonth)} and ${fmtMonth(febMonth)}.`,
    employees: people.length, money: [{ label: `Extra PT in ${fmtMonth(febMonth)}`, value: extra }],
    lines: [...perState.entries()].map(([s, v]) => ({ label: s, value: `+${inr(v)}` })),
    people: people.slice(0, 12), scopes: [...perState.keys()],
    basis: `Standard payroll runs for ${fmtMonth(janMonth)} and ${fmtMonth(febMonth)} through the engine; the difference is the February amount.`, entityId: topEntity(c, ents),
  };
}

function samplePtImpact(c: Ctx, item: RadarItem): Impact {
  const state = item.state!;
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const paying = c.month(RADAR_REF_MONTH).filter((s) => c.loc(byId.get(s.employeeId)!)?.state === state && s.deductions.some((d) => d.code === 'PT'));
  const total = sum(paying.map((s) => s.deductions.find((d) => d.code === 'PT')?.amount ?? 0));
  return {
    headline: paying.length
      ? `${plural(paying.length, 'person pays', 'people pay')} professional tax in ${state} today: ${inr(total)} a month. Every ${inr(10)} change in the monthly amount moves that by ${inr(10 * paying.length)}.`
      : `Nobody pays professional tax in ${state} today.`,
    employees: paying.length, money: [{ label: `PT paid in ${state} today, a month`, value: total }],
    lines: [{ label: 'Sample advisory', value: 'No new amounts are assumed' }],
    people: paying.slice(0, 12).map((s) => ({ employeeId: s.employeeId, detail: `PT ${inr(s.deductions.find((d) => d.code === 'PT')?.amount ?? 0)} a month` })),
    scopes: [state], basis: 'This is exposure, not a forecast: it shows who pays today and how a change per person would add up. No new rate is assumed.',
    entityId: topEntity(c, paying.map((s) => byId.get(s.employeeId)!.entityId)), state,
  };
}

function sampleLabourImpact(c: Ctx): Impact {
  const slips = c.month(RADAR_REF_MONTH);
  const states = [...new Set(c.live.map((e) => c.loc(e)?.state).filter(Boolean) as string[])];
  const w = wageRuleStats(c.base, slips, RADAR_REF_MONTH);
  return {
    headline: `This would reach all ${slips.length} people on payroll, across ${plural(c.base.entities.length, 'entity', 'entities')} and ${plural(states.length, 'state', 'states')} (${states.join(', ')}).`,
    employees: slips.length, money: [],
    lines: [{ label: 'People on payroll', value: String(slips.length) }, { label: 'States', value: states.join(', ') }, { label: 'Failing the 50% rule today', value: String(w.fail) }],
    people: [], scopes: [...c.base.entities.map((e) => e.name), ...states],
    basis: 'Sample advisory: it shows who the change would reach. It does not predict what the rules will say.',
  };
}

function sampleEsiImpact(db: HrmsDb): Impact {
  const r = runScenario(db, { type: 'statutory', rule: 'esi_ceiling', value: ESI_DISCUSSED_CEILING, fromMonth: RADAR_REF_MONTH });
  const dEsi = r.after.esi - r.before.esi;
  return {
    headline: r.esiMovedIn.length
      ? `At ${inr(ESI_DISCUSSED_CEILING)}, ${plural(r.esiMovedIn.length, 'more person would come', 'more people would come')} under ESI: ${inr(dEsi)} a month more in ESI, and take-home falls by ${inr(Math.abs(r.avgTakeHomeChange))} on average.`
      : `At ${inr(ESI_DISCUSSED_CEILING)}, nobody new would come under ESI.`,
    employees: r.esiMovedIn.length,
    money: [{ label: 'Extra ESI, employee and employer, a month', value: dEsi }, { label: 'Average take-home change per person, a month', value: Math.round(r.avgTakeHomeChange) }],
    lines: [{ label: 'Hypothetical ceiling', value: inr(ESI_DISCUSSED_CEILING) }, { label: 'Today\'s ceiling', value: inr(valueOn(ESI.ceiling, PREVIEW_TODAY)) }],
    people: r.esiMovedIn.map((p) => ({ employeeId: p.employeeId, detail: `Take-home ${inr(p.beforeNet ?? 0)} to ${inr(p.afterNet ?? 0)} a month` })),
    scopes: [...new Set(r.esiMovedIn.map((p) => db.entities.find((en) => en.id === db.employees.find((e) => e.id === p.employeeId)?.entityId)?.name ?? ''))].filter(Boolean),
    basis: 'Run through the What-if simulator with the ESI ceiling set to the discussed figure. It is a hypothetical, not a notified rule.',
    entityId: db.employees.find((e) => e.id === r.esiMovedIn[0]?.employeeId)?.entityId,
  };
}

function sampleMinWageImpact(c: Ctx): Impact {
  const byId = new Map(c.base.employees.map((e) => [e.id, e]));
  const slips = c.month(RADAR_REF_MONTH);
  const rows = [...new Set(MIN_WAGES.map((m) => m.state))].map((state) => {
    const mine = slips.filter((s) => c.loc(byId.get(s.employeeId)!)?.state === state);
    const mw = minWageFor(state, 'unskilled');
    if (!mine.length || mw == null) return null;
    const lowest = [...mine].sort((a, b) => a.gross - b.gross)[0]!;
    return { state, gap: lowest.gross - mw, id: lowest.employeeId };
  }).filter((x): x is { state: string; gap: number; id: Id } => !!x);
  const tight = [...rows].sort((a, b) => a.gap - b.gap)[0];
  return {
    headline: tight ? `The smallest gap between the lowest gross pay and the sample minimum wage is ${inr(tight.gap)}, in ${tight.state}. A revision of that size would put ${fullName(byId.get(tight.id)!)} on the line.` : 'No state in the sample table has people on payroll.',
    employees: rows.length, money: [], lines: rows.map((r) => ({ label: r.state, value: `${inr(r.gap)} above the sample minimum` })),
    people: rows.map((r) => ({ employeeId: r.id, detail: `Lowest paid in ${r.state}: ${inr(r.gap)} above the sample minimum` })),
    scopes: rows.map((r) => r.state), basis: 'Exposure only: the gap between the lowest gross pay in each state and the sample unskilled minimum. No new rate is assumed.',
    entityId: tight ? byId.get(tight.id)?.entityId : undefined, state: tight?.state,
  };
}

/** Work out "impact on us" for every item. Cheap enough to run on every data change. */
export function computeImpacts(db: HrmsDb, items: RadarItem[] = buildRadarItems()): Record<string, Impact> {
  const c = makeCtx(db);
  const out: Record<string, Impact> = {};
  for (const item of items) {
    let impact: Impact;
    if (item.id.startsWith('pf-ceiling-')) impact = pfImpact(c, item, PF.ceiling.findIndex((r) => item.id === `pf-ceiling-${r.from}`));
    else if (item.id.startsWith('esi-ceiling-')) impact = esiImpact(c);
    else if (item.id.startsWith('hra-metro-')) impact = hraImpact(c, HRA_METROS.findIndex((r) => item.id === `hra-metro-${r.from}`));
    else if (item.id === 'tds-new-regime') impact = tdsImpact(c);
    else if (item.id.startsWith('min-wage-')) impact = minWageImpact(c, item);
    else if (item.id === 'labour-codes-in-force') impact = labourCodesImpact(c);
    else if (item.id === 'gratuity-fixed-term') impact = gratuityImpact(c);
    else if (item.id === 'bonus-ceiling') impact = bonusImpact(c);
    else if (item.id.startsWith('lwf-')) impact = lwfImpact(c, item);
    else if (item.id === 'pt-february-balance') impact = ptFebruaryImpact(c, item);
    else if (item.id === 'sample-pt-revision') impact = samplePtImpact(c, item);
    else if (item.id === 'sample-labour-state-rules') impact = sampleLabourImpact(c);
    else if (item.id === 'sample-esi-ceiling') impact = sampleEsiImpact(db);
    else if (item.id === 'sample-min-wage-revision') impact = sampleMinWageImpact(c);
    else impact = none('No impact worked out for this item.', '');
    out[item.id] = impact;
  }
  return out;
}

// ───────────────────────────── compliance task ─────────────────────────────
/** A sensible due date for the task: two weeks before the effective date, never in the past; a week out if it is already in force. */
export function suggestedTaskDue(item: Pick<RadarItem, 'effectiveOn'>, today: ISODate = PREVIEW_TODAY): ISODate {
  if (item.effectiveOn <= today) return addDays(today, 7);
  const prefer = addDays(item.effectiveOn, -14);
  const latest = addDays(item.effectiveOn, -1);
  if (prefer >= today) return prefer;
  return latest >= today ? latest : today;
}
export function validateTaskDue(item: Pick<RadarItem, 'effectiveOn'>, due: string, today: ISODate = PREVIEW_TODAY): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(new Date(`${due}T00:00:00Z`).getTime())) return 'Enter a valid date.';
  if (due < today) return 'The due date cannot be in the past.';
  if (item.effectiveOn > today && due >= item.effectiveOn) return `The task must be due before the effective date, ${fmtDate(item.effectiveOn)}.`;
  return null;
}
export function buildComplianceTask(db: HrmsDb, item: RadarItem, impact: Impact, dueOn: ISODate): Omit<ComplianceTask, 'id'> {
  const title = `Rule radar: ${item.title}`;
  return {
    name: title.length > 110 ? `${title.slice(0, 107)}...` : title,
    law: item.law, dueOn, entityId: impact.entityId ?? db.entities[0]!.id, state: item.state ?? impact.state, status: 'upcoming',
  };
}
