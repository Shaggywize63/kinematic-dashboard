'use client';
// Rules and rates: every effective-dated table in lib/hrms/rules.ts, with its confidence tag and source string, plus a
// what-if panel that runs the payroll engine for one employee.

import { ReactNode, useMemo, useState } from 'react';
import type { HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { addMonths, fmtDate, fmtMonth, fullName } from '../../../lib/hrms/format';
import { inr, inr2 } from '../../../lib/hrms/format';
import {
  ESI, HRA_METROS, LABOUR_CODES, LAW_VERSION, LWF_RULES, MIN_WAGES, PF, PT_NONE_STATES, PT_RULES, TDS, isMetroCity, rowOn,
  type Confidence, type TaxSlab,
} from '../../../lib/hrms/rules';
import { buildBreakup } from '../../../lib/hrms/engine';
import { Select, Segmented, Field } from '../../ui';
import { Badge, Card, CardTitle, ConfidenceBadge, KeyValue, Note, Stat, StatGrid, T, useIsCompact } from '../ui';
import { PREVIEW_MONTH, lineAmount, regularPayslip } from './builders';
import { Muted, NotTagged, PlainTable, Stack } from './parts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SECTIONS = [
  { id: 'rules-pf', label: 'PF' }, { id: 'rules-esi', label: 'ESI' }, { id: 'rules-pt', label: 'Professional tax' }, { id: 'rules-lwf', label: 'LWF' },
  { id: 'rules-tds', label: 'Income tax' }, { id: 'rules-hra', label: 'HRA metros' }, { id: 'rules-minwage', label: 'Minimum wages' },
  { id: 'rules-codes', label: 'Labour Codes' }, { id: 'rules-whatif', label: 'What-if' },
];

function Section({ id, title, right, children, hint }: { id: string; title: ReactNode; right?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80 }} aria-labelledby={`${id}-h`}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: hint ? 4 : 14 }}>
          <h2 id={`${id}-h`} style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</h2>
          {right}
        </div>
        {hint && <Muted style={{ marginBottom: 14 }}>{hint}</Muted>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </Card>
    </section>
  );
}

const SubTitle = ({ children }: { children: ReactNode }) => <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.dim }}>{children}</h3>;

/** Slab bounds as the rules apply them: "monthlyGross <= upTo" picks the slab. */
function slabLabel(slabs: { upTo: number }[], i: number, money = inr): string {
  const s = slabs[i]!;
  const prev = i > 0 ? slabs[i - 1]!.upTo : null;
  if (!Number.isFinite(s.upTo)) return prev == null ? 'Any amount' : `Above ${money(prev)}`;
  return prev == null ? `Up to ${money(s.upTo)}` : `${money(prev + 1)} to ${money(s.upTo)}`;
}

function TaxSlabTable({ slabs, caption }: { slabs: TaxSlab[]; caption: string }) {
  return (
    <PlainTable caption={caption} minWidth={300} rows={slabs.map((s, i) => ({ s, i }))}
      columns={[
        { key: 'range', label: 'Taxable income', render: (r) => slabLabel(slabs, r.i) },
        { key: 'rate', label: 'Rate', align: 'right', render: (r) => `${r.s.rate}%` },
      ]} />
  );
}

export default function RulesTab({ db }: { db: HrmsDb }) {
  const tallies = useMemo(() => {
    const all: Confidence[] = [
      ...PF.ceiling.map((r) => r.confidence), ...ESI.ceiling.map((r) => r.confidence), ...PT_RULES.map((r) => r.confidence),
      ...LWF_RULES.map((r) => r.confidence), TDS.newRegime.confidence, TDS.oldRegime.confidence,
      ...HRA_METROS.map((r) => r.confidence), ...MIN_WAGES.map((r) => r.confidence),
    ];
    return { verified: all.filter((c) => c === 'verified').length, reported: all.filter((c) => c === 'reported').length, indicative: all.filter((c) => c === 'indicative').length };
  }, []);
  const pfNow = rowOn(PF.ceiling, PREVIEW_TODAY);
  const esiNow = rowOn(ESI.ceiling, PREVIEW_TODAY);

  return (
    <Stack>
      <Note tone="warn">
        <b>These figures are not gazette-verified.</b> They come from press and law-firm summaries and sample values, and every row carries a tag showing how far it can be trusted.
        Confirm each “Reported” and “Sample” row against the notification before a live payroll run.
      </Note>

      <StatGrid min={170}>
        <Stat label="Law version" value={<span style={{ fontSize: 17 }}>{LAW_VERSION}</span>} hint="Stamped on every pay run" />
        <Stat label="PF wage ceiling today" value={inr(pfNow.value)} hint={`Since ${fmtDate(pfNow.from)}`} />
        <Stat label="ESI wage ceiling today" value={inr(esiNow.value)} hint={`Since ${fmtDate(esiNow.from)}`} />
        <Stat label="Tagged rows" value={<span style={{ fontSize: 17 }}>{tallies.verified} / {tallies.reported} / {tallies.indicative}</span>} hint="Verified / reported / sample" />
      </StatGrid>

      <nav aria-label="Jump to a rule table" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={{ padding: '6px 12px', minHeight: 32, display: 'inline-flex', alignItems: 'center', borderRadius: T.radius.pill, border: `1px solid ${T.border}`, background: T.card, color: T.dim, fontSize: 12.5, fontWeight: 500, textDecoration: 'none' }}>{s.label}</a>
        ))}
      </nav>

      <Section id="rules-pf" title="Provident fund" hint="The wage ceiling moved on a notified date, so a run uses the ceiling in force at the end of its month.">
        <SubTitle>Wage ceiling history</SubTitle>
        <PlainTable caption="PF wage ceiling history" rows={PF.ceiling} minWidth={560}
          highlight={(r) => r === pfNow}
          columns={[
            { key: 'from', label: 'From', render: (r) => fmtDate(r.from) },
            { key: 'value', label: 'Ceiling', align: 'right', render: (r) => <b>{inr(r.value)}</b> },
            { key: 'now', label: 'In force', render: (r) => (r === pfNow ? <Badge tone="info">Today</Badge> : '') },
            { key: 'source', label: 'Source', nowrap: false, render: (r) => r.source },
            { key: 'conf', label: 'Confidence', render: (r) => <ConfidenceBadge level={r.confidence} /> },
          ]} />
        <SubTitle>Rates</SubTitle>
        <PlainTable caption="PF rates" minWidth={560}
          rows={[
            { item: 'Employee contribution', rate: PF.employeeRate, base: 'PF wage' },
            { item: 'Employer contribution (total)', rate: PF.employerRate, base: 'PF wage' },
            { item: 'of which EPS (pension)', rate: PF.epsRate, base: 'PF wage up to the ceiling' },
            { item: 'EDLI (employer only)', rate: PF.edliRate, base: 'PF wage up to the ceiling' },
            { item: 'Admin charges (employer only)', rate: PF.adminRate, base: 'PF wage up to the ceiling' },
          ]}
          columns={[
            { key: 'item', label: 'Item' },
            { key: 'rate', label: 'Rate', align: 'right', render: (r) => `${r.rate}%` },
            { key: 'base', label: 'Applied to' },
            { key: 'conf', label: 'Confidence', render: () => <NotTagged /> },
          ]} />
        <Muted>rules.ts tags the ceilings but not the percentage rates. It cites EPF 12% as the example of a stable figure, but the rest should be confirmed too.</Muted>
      </Section>

      <Section id="rules-esi" title="Employees’ State Insurance">
        <SubTitle>Wage ceiling history</SubTitle>
        <PlainTable caption="ESI wage ceiling history" rows={ESI.ceiling} minWidth={560}
          columns={[
            { key: 'from', label: 'From', render: (r) => fmtDate(r.from) },
            { key: 'value', label: 'Ceiling (gross a month)', align: 'right', render: (r) => <b>{inr(r.value)}</b> },
            { key: 'source', label: 'Source', nowrap: false, render: (r) => r.source },
            { key: 'conf', label: 'Confidence', render: (r) => <ConfidenceBadge level={r.confidence} /> },
          ]} />
        <PlainTable caption="ESI rates" minWidth={420}
          rows={[{ item: 'Employee contribution', rate: ESI.employeeRate }, { item: 'Employer contribution', rate: ESI.employerRate }]}
          columns={[
            { key: 'item', label: 'Item' },
            { key: 'rate', label: 'Rate of ESI wages', align: 'right', render: (r) => `${r.rate}%` },
            { key: 'conf', label: 'Confidence', render: () => <NotTagged /> },
          ]} />
        <Muted>Contribution-period continuity (staying covered until the period ends after crossing the ceiling) is not modelled in the preview.</Muted>
      </Section>

      <PtSection />

      <Section id="rules-lwf" title="Labour welfare fund" hint="Collected only in the months listed for each state.">
        <PlainTable caption="Labour welfare fund by state" rows={LWF_RULES} minWidth={560}
          columns={[
            { key: 'state', label: 'State' },
            { key: 'employee', label: 'Employee', align: 'right', render: (r) => inr(r.employee) },
            { key: 'employer', label: 'Employer', align: 'right', render: (r) => inr(r.employer) },
            { key: 'months', label: 'Collected in', render: (r) => r.months.map((m) => MONTH_NAMES[m - 1]).join(', ') },
            { key: 'conf', label: 'Confidence', render: (r) => <ConfidenceBadge level={r.confidence} /> },
          ]} />
      </Section>

      <Section id="rules-tds" title="Income tax on salary (TDS)"
        hint="Salary TDS sits under section 392 of the Income-tax Act 2025 from 1 Apr 2026, with Form 16 becoming Form 130, 24Q becoming Form 138 and 12BB becoming Form 124 (as reported in rules.ts). Surcharge above Rs 50 lakh is not modelled.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><SubTitle>New regime</SubTitle><ConfidenceBadge level={TDS.newRegime.confidence} /></div>
            <TaxSlabTable slabs={TDS.newRegime.slabs} caption="New regime slabs" />
            <KeyValue columns={1} rows={[
              { label: 'Standard deduction', value: inr(TDS.newRegime.standardDeduction) },
              { label: 'Rebate', value: `No tax up to ${inr(TDS.newRegime.rebateLimit)} of taxable income (rebate up to ${inr(TDS.newRegime.rebateMax)}), with marginal relief just above it` },
            ]} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><SubTitle>Old regime</SubTitle><ConfidenceBadge level={TDS.oldRegime.confidence} /></div>
            <TaxSlabTable slabs={TDS.oldRegime.slabs} caption="Old regime slabs" />
            <KeyValue columns={1} rows={[
              { label: 'Standard deduction', value: inr(TDS.oldRegime.standardDeduction) },
              { label: 'Rebate', value: `Up to ${inr(TDS.oldRegime.rebateMax)} for taxable income up to ${inr(TDS.oldRegime.rebateLimit)}` },
              { label: 'Deduction limits', value: `80C ${inr(TDS.oldRegime.limits.sec80C)}, NPS 80CCD(1B) ${inr(TDS.oldRegime.limits.nps80CCD1B)}, home loan interest ${inr(TDS.oldRegime.limits.homeLoanInterest)}` },
            ]} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5, color: T.text }}>
          Health and education cess <b>{TDS.cess}%</b> on the tax <NotTagged />
        </div>
      </Section>

      <Section id="rules-hra" title="HRA metro cities" hint="Metro cities get the 50% HRA rate, the rest 40%. From 1 Apr 2026 four more cities are on the list (as reported).">
        <PlainTable caption="HRA metro list by date" rows={HRA_METROS} minWidth={640}
          highlight={(r) => r === rowOn(HRA_METROS, PREVIEW_TODAY)}
          columns={[
            { key: 'from', label: 'From', render: (r) => fmtDate(r.from) },
            { key: 'cities', label: 'Cities', nowrap: false, render: (r) => r.value.join(', ') },
            { key: 'now', label: 'In force', render: (r) => (r === rowOn(HRA_METROS, PREVIEW_TODAY) ? <Badge tone="info">Today</Badge> : '') },
            { key: 'source', label: 'Source', nowrap: false, render: (r) => r.source },
            { key: 'conf', label: 'Confidence', render: (r) => <ConfidenceBadge level={r.confidence} /> },
          ]} />
        <SubTitle>Your locations against today’s list</SubTitle>
        <PlainTable caption="Locations against the HRA metro list" rows={db.locations} minWidth={520}
          columns={[
            { key: 'name', label: 'Location' },
            { key: 'city', label: 'City' },
            { key: 'flag', label: 'Metro flag on the location', render: (l) => (l.metro ? 'Yes' : 'No') },
            { key: 'list', label: 'On today’s list', render: (l) => { const on = isMetroCity(l.city, PREVIEW_TODAY); return <Badge tone={on === l.metro ? 'ok' : 'warn'}>{on ? 'Yes' : 'No'}{on === l.metro ? '' : ', differs'}</Badge>; } },
          ]} />
      </Section>

      <Section id="rules-minwage" title="Minimum wages" hint="Sample values only. Each state revises on its own cycle.">
        <PlainTable caption="Minimum wages" rows={MIN_WAGES} minWidth={640}
          columns={[
            { key: 'state', label: 'State' },
            { key: 'zone', label: 'Zone' },
            { key: 'skill', label: 'Skill', render: (r) => r.skill.replace('_', '-').replace(/^./, (c) => c.toUpperCase()) },
            { key: 'monthly', label: 'Monthly', align: 'right', render: (r) => inr(r.monthly) },
            { key: 'asOn', label: 'As on', render: (r) => fmtDate(r.asOn) },
            { key: 'conf', label: 'Confidence', render: (r) => <ConfidenceBadge level={r.confidence} /> },
          ]} />
      </Section>

      <CodesSection />

      <WhatIf db={db} />
    </Stack>
  );
}

function PtSection() {
  const states = [...PT_RULES.map((r) => r.state), ...PT_NONE_STATES].sort();
  const [state, setState] = useState(PT_RULES[0]!.state);
  const rule = PT_RULES.find((r) => r.state === state);
  return (
    <Section id="rules-pt" title="Professional tax" hint="Slabs are applied to the month’s gross pay. Pick a state to see its table."
      right={
        <Field label="State" style={{ width: 220 }}>
          <Select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}>
            {states.map((s) => <option key={s} value={s}>{s}{PT_NONE_STATES.includes(s) ? ' (no PT)' : ''}</option>)}
          </Select>
        </Field>
      }>
      {!rule ? (
        <Note>No professional tax is modelled for {state}. It is on the “no PT” list in rules.ts, so payroll deducts nothing there.</Note>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ConfidenceBadge level={rule.confidence} />
            {rule.note && <span style={{ fontSize: 13, color: T.dim }}>{rule.note}</span>}
          </div>
          <PlainTable caption={`Professional tax slabs, ${rule.state}`} rows={rule.slabs.map((s, i) => ({ s, i }))} minWidth={360}
            columns={[
              { key: 'range', label: 'Monthly gross', render: (r) => slabLabel(rule.slabs, r.i) },
              { key: 'amount', label: 'Tax a month', align: 'right', render: (r) => inr(r.s.amount) },
            ]} />
          {rule.womenSlabs && (
            <>
              <SubTitle>Women</SubTitle>
              <PlainTable caption={`Professional tax slabs for women, ${rule.state}`} rows={rule.womenSlabs.map((s, i) => ({ s, i }))} minWidth={360}
                columns={[
                  { key: 'range', label: 'Monthly gross', render: (r) => slabLabel(rule.womenSlabs!, r.i) },
                  { key: 'amount', label: 'Tax a month', align: 'right', render: (r) => inr(r.s.amount) },
                ]} />
            </>
          )}
          {rule.februaryAmount != null && <Muted>In February the amount in a taxed slab is {inr(rule.februaryAmount)} (the annual balance is collected then).</Muted>}
        </>
      )}
    </Section>
  );
}

type CodeRow = { id: string; param: string; value: string; source: string; level?: Confidence | null };
function CodesSection() {
  const L = LABOUR_CODES;
  const reported = (s: string) => /as reported/i.test(s);
  const rows: CodeRow[] = [
    { id: 'inforce', param: 'Labour Codes in force from', value: fmtDate(L.inForceFrom), source: 'rules.ts' },
    { id: 'wages', param: '50% rule: wages as a share of remuneration', value: `At least ${L.minWagePercent}%`, source: 'The shortfall is added back to wages for PF, gratuity and bonus.' },
    { id: 'otmult', param: 'Overtime rate', value: `${L.overtimeMultiplier} times the ordinary rate`, source: 'rules.ts' },
    { id: 'otcap', param: 'Overtime cap', value: `${L.overtimeQuarterlyCapHours} hours a quarter`, source: 'rules.ts' },
    { id: 'settle', param: 'Full and final settlement', value: `Within ${L.settlementWorkingDays} working days of the last working day`, source: 'rules.ts' },
    { id: 'grat', param: 'Gratuity rate', value: `${L.gratuity.rate} of wages for each year`, source: 'rules.ts' },
    { id: 'gcap', param: 'Gratuity ceiling', value: inr(L.gratuity.cap), source: 'rules.ts' },
    { id: 'gperm', param: 'Gratuity: years of service, permanent', value: `${L.gratuity.permanentYears} years`, source: 'rules.ts' },
    { id: 'gfixed', param: 'Gratuity: years of service, fixed-term', value: `${L.gratuity.fixedTermYears} year`, source: 'Fixed-term employees from 21 Nov 2025 (as reported)' },
    { id: 'belig', param: 'Bonus: eligibility ceiling', value: `${inr(L.bonus.eligibilityCeiling)} a month`, source: 'S.O. 4711(E), 25 Aug 2026 (as reported)' },
    { id: 'bcalc', param: 'Bonus: calculation ceiling floor', value: inr(L.bonus.calcCeilingFloor), source: 'rules.ts' },
    { id: 'bmin', param: 'Bonus: minimum', value: `${L.bonus.minPercent}%`, source: 'rules.ts' },
    { id: 'bmax', param: 'Bonus: maximum', value: `${L.bonus.maxPercent}%`, source: 'rules.ts' },
  ];
  rows.forEach((r) => { r.level = reported(r.source) ? 'reported' : null; });
  return (
    <Section id="rules-codes" title="Labour Codes parameters: gratuity, bonus, overtime, settlement"
      hint="Where rules.ts records a source, it is shown. Rows without one are not tagged and should be confirmed.">
      <PlainTable caption="Labour Codes parameters" rows={rows} minWidth={680}
        columns={[
          { key: 'param', label: 'Parameter', nowrap: false },
          { key: 'value', label: 'Value', nowrap: false, render: (r) => <b>{r.value}</b> },
          { key: 'source', label: 'Source or note', nowrap: false },
          { key: 'conf', label: 'Confidence', render: (r) => (r.level ? <ConfidenceBadge level={r.level} /> : <NotTagged />) },
        ]} />
    </Section>
  );
}

// ───────────────────────────────── what-if ─────────────────────────────────
function WhatIf({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const emps = useMemo(() => db.employees.filter((e) => e.structureId && e.annualCtc && e.status !== 'exited').sort((a, b) => a.code.localeCompare(b.code)), [db.employees]);
  const [empId, setEmpId] = useState(emps[0]?.id ?? '');
  const emp = emps.find((e) => e.id === empId) ?? emps[0];
  const latest = PF.ceiling[PF.ceiling.length - 1]!;
  const oldRow = PF.ceiling[PF.ceiling.length - 2] ?? latest;
  const [ceiling, setCeiling] = useState<number>(latest.value);

  const model = useMemo(() => {
    if (!emp) return null;
    const structure = db.structures.find((s) => s.id === emp.structureId);
    if (!structure || !emp.annualCtc) return null;
    const scenario = (row: typeof latest, month: string) => {
      const b = buildBreakup(structure, emp.annualCtc!, { asOn: row.from, pfMember: emp.pfMember, pfOnActual: emp.pfOnActualWage, overrides: emp.structureOverrides });
      const capped = Math.min(b.pfWage, row.value);
      const employeePf = Math.round((b.pfWage * PF.employeeRate) / 100);
      const employerPf = b.lines.find((l) => l.code === 'PF_ER')?.monthly ?? Math.round((b.pfWage * PF.employerRate) / 100);
      const eps = Math.round((capped * PF.epsRate) / 100);
      const slip = regularPayslip(db, emp, month);
      return { row, pfWage: b.pfWage, employeePf, employerPf, eps, epf: employerPf - eps, edli: Math.round((capped * PF.edliRate) / 100), admin: Math.round((capped * PF.adminRate) / 100), gross: b.monthlyGross, net: slip?.net ?? 0, tds: slip ? lineAmount(slip.deductions, 'TDS') : 0 };
    };
    // The month before the notified change uses the old ceiling; the preview month uses the current one. Everything else
    // in those two months is the same under the rules, so the difference is the PF ceiling alone.
    const beforeMonth = addMonths(latest.from.slice(0, 7), -1);
    return { current: regularPayslip(db, emp, PREVIEW_MONTH), a: scenario(oldRow, beforeMonth), b: scenario(latest, PREVIEW_MONTH) };
  }, [db, emp, latest, oldRow]);

  const options = [
    { value: String(oldRow.value), label: inr(oldRow.value) },
    ...(latest.value !== oldRow.value ? [{ value: String(latest.value), label: inr(latest.value) }] : []),
  ];
  const sel = model ? (ceiling === oldRow.value ? model.a : model.b) : null;
  const other = model && sel ? (sel === model.a ? model.b : model.a) : null;
  const delta = (x: number) => (x === 0 ? '—' : `${x > 0 ? '+' : '-'}${inr(Math.abs(x))}`);

  return (
    <Section id="rules-whatif" title="What-if: one employee under today’s rules"
      hint="Runs the payroll engine for a regular month with no adjustments, loans or loss of pay. Nothing here is saved.">
      {!emp || !model || !sel || !other ? (
        <Muted>No employee with a salary structure and CTC to run.</Muted>
      ) : (
        <>
          <Field label="Employee" style={{ maxWidth: 380 }}>
            <Select aria-label="Employee for the what-if" value={emp.id} onChange={(e) => setEmpId(e.target.value)}>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.code} · {fullName(e)}</option>)}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SubTitle>Take-home for {fmtMonth(PREVIEW_MONTH)} (law version {LAW_VERSION})</SubTitle>
              {model.current ? (
                <>
                  <PlainTable caption="Take-home under current rules" minWidth={300}
                    rows={[
                      ...model.current.earnings.map((l) => ({ kind: 'e', name: l.name, amount: l.amount })),
                      { kind: 'g', name: 'Gross pay', amount: model.current.gross },
                      ...model.current.deductions.map((l) => ({ kind: 'd', name: l.name, amount: -l.amount })),
                      { kind: 'n', name: 'Take-home', amount: model.current.net },
                    ]}
                    columns={[
                      { key: 'name', label: 'Line', nowrap: false, render: (r) => (r.kind === 'g' || r.kind === 'n' ? <b>{r.name}</b> : r.name) },
                      { key: 'amount', label: 'Amount', align: 'right', render: (r) => (r.kind === 'g' || r.kind === 'n' ? <b data-testid={r.kind === 'n' ? 'whatif-net' : undefined}>{inr(r.amount)}</b> : inr(r.amount)) },
                    ]} />
                  {model.current.warnings.length > 0 && <Muted>{model.current.warnings.join(' ')}</Muted>}
                </>
              ) : <Muted>This employee has no pay data.</Muted>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SubTitle>PF wage ceiling</SubTitle>
              <div><Segmented value={String(ceiling)} onChange={(v) => setCeiling(Number(v))} options={options} /></div>
              {!emp.pfMember ? <Note>This employee is not a PF member, so the ceiling changes nothing.</Note>
                : emp.pfOnActualWage ? <Note>This employee contributes on actual wages (the higher-wage option), so the ceiling does not change their PF.</Note> : null}
              <PlainTable caption="PF under the selected ceiling" minWidth={340}
                rows={[
                  { id: 'wage', label: 'PF wage', v: sel.pfWage, d: sel.pfWage - other.pfWage },
                  { id: 'emp', label: 'Employee PF (12%)', v: sel.employeePf, d: sel.employeePf - other.employeePf },
                  { id: 'er', label: 'Employer PF (12%)', v: sel.employerPf, d: sel.employerPf - other.employerPf },
                  { id: 'eps', label: 'of which EPS', v: sel.eps, d: sel.eps - other.eps },
                  { id: 'epf', label: 'of which EPF', v: sel.epf, d: sel.epf - other.epf },
                  { id: 'edli', label: 'EDLI and admin (employer)', v: sel.edli + sel.admin, d: sel.edli + sel.admin - other.edli - other.admin },
                  { id: 'net', label: 'Take-home', v: sel.net, d: sel.net - other.net },
                ]}
                columns={[
                  { key: 'label', label: 'Item', nowrap: false },
                  { key: 'v', label: `At ${inr(sel.row.value)}`, align: 'right', render: (r) => <span data-testid={`pf-${r.id}`}>{inr(r.v)}</span> },
                  { key: 'd', label: `Against ${inr(other.row.value)}`, align: 'right', render: (r) => <span style={{ color: T.dim }}>{delta(r.d)}</span> },
                ]} />
              <Muted>
                Employer PF sits inside the CTC, so a higher ceiling lowers the balancing allowance and the gross. Employee PF is {inr2(sel.employeePf)} a month at this ceiling.
                The ceiling of {inr(oldRow.value)} applied until {fmtDate(latest.from)} ({latest.confidence}).
              </Muted>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
