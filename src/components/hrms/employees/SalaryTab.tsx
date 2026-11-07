'use client';
// Salary: structure and CTC (editable), live breakup from the engine, the 50% wage-rule test, a take-home estimate for
// the preview month, per-component overrides, and the revision history from the change log.

import { Fragment, useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, Note, T, useIsCompact, type Col } from '../ui';
import type { Employee, HrmsDb, SalaryComponent } from '../../../lib/hrms/types';
import { attendanceFor, buildBreakup, computePayslip } from '../../../lib/hrms/engine';
import { ESI, LABOUR_CODES, PF, valueOn } from '../../../lib/hrms/rules';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate, fmtDateTime, fmtMonth, inr, pct } from '../../../lib/hrms/format';
import { saveSalary } from '../../../lib/hrms/employeeActions';
import { SelectField, TextField } from './fields';
import { Flash, useFlash, useReportDirty } from './shared';
import { amountCheck, blankDraft, formatHistoryValue, toAmount, validatePay } from './logic';

const MONTH = PREVIEW_TODAY.slice(0, 7);
const KIND_LABEL: Record<string, string> = { earning: 'Earning', employer: 'Employer cost', reimbursement: 'Reimbursement', deduction: 'Deduction' };
const OVERRIDABLE: SalaryComponent['calc']['type'][] = ['fixed', 'pct_ctc', 'pct_basic'];

function ruleText(c: SalaryComponent): string {
  switch (c.calc.type) {
    case 'fixed': return `${inr(c.calc.value)} fixed`;
    case 'pct_ctc': return `${c.calc.value}% of CTC`;
    case 'pct_basic': return `${c.calc.value}% of basic`;
    case 'balance': return 'Balance of CTC';
    case 'pf_employer': return `${c.calc.value}% of PF wage`;
    case 'esi_employer': return `${c.calc.value}% of ESI wages`;
    case 'gratuity_provision': return `${c.calc.value}% of basic`;
    default: return '';
  }
}

export default function SalaryTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const savedOverrides = useMemo(() => Object.fromEntries(Object.entries(e.structureOverrides ?? {}).map(([k, v]) => [k, String(v)])), [e.structureOverrides]);
  const [structureId, setStructureId] = useState(e.structureId ?? '');
  const [ctcText, setCtcText] = useState(e.annualCtc ? String(e.annualCtc) : '');
  const [ovText, setOvText] = useState<Record<string, string>>(savedOverrides);
  const [tried, setTried] = useState(false);
  const [includeOneTime, setIncludeOneTime] = useState(false);
  const [flash, doFlash] = useFlash();

  const structure = db.structures.find((s) => s.id === structureId);
  const ctc = toAmount(ctcText);
  const ctcErr = amountCheck(ctcText, 'Annual CTC', { max: 500_000_000 });

  // Overrides: blank = none. Anything typed must be a whole, non-negative rupee amount.
  const ovErrors: Record<string, string> = {};
  const overrides: Record<string, number> = {};
  Object.entries(ovText).forEach(([k, v]) => {
    if (!v.trim()) return;
    const m = amountCheck(v, 'Override', { max: 100_000_000 });
    if (m) ovErrors[k] = m; else overrides[k] = toAmount(v);
  });
  const payErrors = validatePay({ ...blankDraft(), structureId, annualCtc: ctcText });
  const errors = tried ? { ...payErrors, ...Object.fromEntries(Object.entries(ovErrors).map(([k, v]) => [`ov-${k}`, v])) } : {};

  const savedKey = JSON.stringify([e.structureId ?? '', e.annualCtc ?? 0, e.structureOverrides ?? {}]);
  const draftKey = JSON.stringify([structureId, ctc, overrides]);
  const dirty = savedKey !== draftKey;
  useReportDirty('salary', dirty);

  const usable = !!structure && ctc > 0 && !ctcErr;
  const breakup = usable ? buildBreakup(structure!, ctc, { asOn: PREVIEW_TODAY, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides }) : null;
  const baseline = usable ? buildBreakup(structure!, ctc, { asOn: PREVIEW_TODAY, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage }) : null;

  // Take-home for the preview month, computed on the draft so the numbers move as the person edits.
  const att = attendanceFor(db, e.id, MONTH);
  const oneTime = db.adjustments.filter((a) => a.employeeId === e.id && a.month === MONTH);
  const location = db.locations.find((l) => l.id === e.locationId);
  const slip = useMemo(() => {
    if (!usable || !structure || !location) return null;
    const draftEmp: Employee = { ...e, structureId, annualCtc: ctc, structureOverrides: Object.keys(overrides).length ? overrides : undefined };
    return computePayslip({
      employee: draftEmp, structure, location, attendance: att, adjustments: includeOneTime ? db.adjustments : [], loans: db.loans,
      overtimeRule: db.overtimeRules[0], shiftHours: db.shifts.find((s) => s.id === e.shiftId)?.fullDayHours ?? 8, month: MONTH, runId: 'estimate',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable, structure, location, e, structureId, ctc, JSON.stringify(overrides), att, includeOneTime, db.adjustments, db.loans, db.overtimeRules, db.shifts]);

  function onSave() {
    setTried(true);
    if (Object.keys(payErrors).length || Object.keys(ovErrors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    saveSalary(e.id, { structureId: structureId || undefined, annualCtc: ctc > 0 ? ctc : undefined, overrides });
    setTried(false);
    doFlash('Salary saved. The revision is in the history below.');
  }
  function onReset() {
    setStructureId(e.structureId ?? ''); setCtcText(e.annualCtc ? String(e.annualCtc) : ''); setOvText(savedOverrides); setTried(false);
  }

  // 50% rule
  const wt = breakup?.wageTest;
  const pfCeiling = valueOn(PF.ceiling, PREVIEW_TODAY);
  const pfWageWithout = wt && e.pfMember ? (e.pfOnActualWage ? wt.wages : Math.min(wt.wages, pfCeiling)) : 0;
  const pfWageWith = breakup?.pfWage ?? 0;
  const erPf = (w: number) => Math.round((w * PF.employerRate) / 100);

  const lineRows = (breakup?.lines ?? []).map((l) => ({ ...l, id: l.componentId }));
  const lineCols: Col<(typeof lineRows)[number]>[] = [
    {
      key: 'name', label: 'Component',
      render: (l) => (
        <div>
          <strong style={{ fontWeight: 600 }}>{l.name}</strong> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5 }}>{l.code}</span>
          <div style={{ fontSize: 12, color: T.mute }}>{KIND_LABEL[l.kind] ?? l.kind}</div>
        </div>
      ),
    },
    { key: 'monthly', label: 'Monthly', align: 'right', render: (l) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(l.monthly)}</span>, nowrap: true },
    { key: 'annual', label: 'Annual', align: 'right', render: (l) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(l.monthly * 12)}</span>, nowrap: true },
    { key: 'wage', label: 'Wage', align: 'center', render: (l) => (l.isWage ? <Badge tone="info">Wage</Badge> : <span style={{ color: T.mute }}>No</span>), nowrap: true },
  ];

  const overridable = (structure?.components ?? []).filter((c) => c.kind !== 'deduction' && OVERRIDABLE.includes(c.calc.type));
  const history = e.history.filter((h) => h.field === 'Annual CTC' || h.field === 'Salary structure' || h.field.startsWith('Override:'))
    .map((h) => ({ ...h })).sort((a, b) => (a.at < b.at ? 1 : -1));
  const histCols: Col<(typeof history)[number]>[] = [
    { key: 'at', label: 'When', render: (h) => fmtDateTime(h.at), sortValue: (h) => h.at, nowrap: true },
    { key: 'field', label: 'What changed', render: (h) => h.field, sortValue: (h) => h.field },
    { key: 'from', label: 'From', render: (h) => (h.field.startsWith('Override:') ? (h.from ? inr(Number(h.from)) : '—') : formatHistoryValue(db, h.field, h.from)), align: 'right' },
    { key: 'to', label: 'To', render: (h) => (h.field.startsWith('Override:') ? (h.to && /^\d+$/.test(h.to) ? inr(Number(h.to)) : h.to ?? '—') : formatHistoryValue(db, h.field, h.to)), align: 'right' },
    { key: 'by', label: 'By', render: (h) => h.by },
  ];

  const sumLines = breakup ? breakup.lines.reduce((s, l) => s + l.monthly, 0) : 0;
  const deductionTotal = slip?.totalDeductions ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Flash msg={flash} />
            {dirty && <Badge tone="warn" dot>Unsaved changes</Badge>}
            <Button onClick={onReset} disabled={!dirty}>Reset</Button>
            <Button variant="primary" onClick={onSave} disabled={!dirty} style={{ minHeight: 40 }}>Save salary</Button>
          </div>
        }>Structure and CTC</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '16px 20px' }}>
          <SelectField id="sal-structure" label="Salary structure" value={structureId} placeholder="No structure"
            onChange={(v) => { setStructureId(v); setOvText({}); }} options={db.structures.map((s) => ({ value: s.id, label: s.name }))} error={errors.structureId}
            hint={structure?.description} />
          <TextField id="sal-ctc" label="Annual CTC (₹)" required inputMode="numeric" value={ctcText} onChange={setCtcText} error={errors.annualCtc}
            hint={ctc > 0 && !ctcErr ? `${inr(ctc / 12)} a month` : 'Whole rupees'} />
        </div>
        {!e.structureId && !structureId && <div style={{ marginTop: 12 }}><Note tone="warn">No salary structure is set, so no payslip can be generated for this employee. Choose a structure and an annual CTC.</Note></div>}
      </Card>

      {!breakup ? (
        <Card><div style={{ padding: 24, textAlign: 'center', color: T.dim, fontSize: 14 }}>Choose a structure and enter the annual CTC to see the monthly breakup, the 50% rule test and the take-home estimate.</div></Card>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <Card padding={0} style={{ overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 0' }}><CardTitle>Monthly breakup</CardTitle></div>
              <div style={{ padding: '0 20px 20px' }}>
                <DataTable columns={lineCols} rows={lineRows} minWidth={460} footer={
                  <tfoot>
                    <tr>
                      <td style={{ padding: '10px 14px', fontWeight: 700, borderTop: `1px solid ${T.border}`, background: T.panel }}>Gross (earnings)</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, borderTop: `1px solid ${T.border}`, background: T.panel, fontVariantNumeric: 'tabular-nums' }} data-testid="gross-monthly">{inr(breakup.monthlyGross)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, borderTop: `1px solid ${T.border}`, background: T.panel, fontVariantNumeric: 'tabular-nums' }}>{inr(breakup.monthlyGross * 12)}</td>
                      <td style={{ borderTop: `1px solid ${T.border}`, background: T.panel }} />
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 14px', fontWeight: 700, background: T.panel }}>Total cost to company</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, background: T.panel, fontVariantNumeric: 'tabular-nums' }} data-testid="ctc-monthly">{inr(sumLines)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, background: T.panel, fontVariantNumeric: 'tabular-nums' }}>{inr(sumLines * 12)}</td>
                      <td style={{ background: T.panel }} />
                    </tr>
                  </tfoot>
                } />
                <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Rounded to the rupee per component, so the total can differ from the CTC by a rupee or two. Rates as on {fmtDate(PREVIEW_TODAY)}.</div>
                {breakup.warnings.filter((w) => !w.startsWith('Wages are')).map((w, i) => <div key={i} style={{ marginTop: 10 }}><Note tone="warn">{w}</Note></div>)}
              </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <Card>
                <CardTitle right={<ConfidenceBadge level="reported" />}>50% wage rule</CardTitle>
                <div data-testid="wage-rule" data-pass={wt!.passes ? 'pass' : 'fail'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone={wt!.passes ? 'ok' : 'red'} dot>{wt!.passes ? 'Passes' : 'Fails: wages are topped up'}</Badge>
                    <span style={{ fontSize: 13, color: T.dim }}>Wages must be at least {LABOUR_CODES.minWagePercent}% of total remuneration.</span>
                  </div>
                  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', gap: '6px 16px', fontSize: 13.5 }}>
                    <dt style={{ color: T.dim }}>Monthly remuneration</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(wt!.remuneration)}</dd>
                    <dt style={{ color: T.dim }}>Wages (basic, DA)</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(wt!.wages)} ({pct(wt!.wagePct, 1)})</dd>
                    <dt style={{ color: T.dim }}>Needed ({LABOUR_CODES.minWagePercent}%)</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr((wt!.remuneration * LABOUR_CODES.minWagePercent) / 100)}</dd>
                    <dt style={{ color: T.dim }}>Add-back to wages</dt><dd data-testid="addback" style={{ margin: 0, textAlign: 'right', fontWeight: 700, color: wt!.addBack ? T.red : T.text, fontVariantNumeric: 'tabular-nums' }}>{inr(wt!.addBack)}</dd>
                    <dt style={{ color: T.dim }}>Wages after add-back</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(wt!.codeWages)}</dd>
                  </dl>
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, fontSize: 13, color: T.dim, lineHeight: 1.55 }} data-testid="wage-rule-impact">
                    {!e.pfMember ? 'Not a PF member, so the add-back changes gratuity and bonus wages only.' : wt!.passes ? (
                      <>No add-back, so the PF wage stays at <strong style={{ color: T.text }}>{inr(pfWageWith)}</strong> and employer PF at <strong style={{ color: T.text }}>{inr(erPf(pfWageWith))}</strong> a month.</>
                    ) : pfWageWith === pfWageWithout ? (
                      <>
                        The add-back does not change PF here: the PF wage is capped at <strong style={{ color: T.text }}>{inr(pfWageWith)}</strong> either way, so employer PF stays
                        {' '}<strong style={{ color: T.text }}>{inr(erPf(pfWageWith))}</strong> a month. Gratuity and bonus wages rise by {inr(wt!.addBack)} a month.
                      </>
                    ) : (
                      <>
                        PF wage <strong style={{ color: T.text }}>{inr(pfWageWith)}</strong> instead of {inr(pfWageWithout)}; employer PF{' '}
                        <strong style={{ color: T.text }}>{inr(erPf(pfWageWith))}</strong> instead of {inr(erPf(pfWageWithout))} a month.
                        {' '}Gratuity and bonus wages rise by {inr(wt!.addBack)} a month.
                      </>
                    )}
                  </div>
                </div>
              </Card>

              <Card>
                <CardTitle right={<span style={{ fontSize: 12.5, color: T.mute }}>{fmtMonth(MONTH)}</span>}>Take-home estimate</CardTitle>
                {slip ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.mute }}>Estimated net pay</div>
                      <div data-testid="net-estimate" style={{ fontFamily: T.heading, fontSize: 28, fontWeight: 700, color: T.ok, fontVariantNumeric: 'tabular-nums' }}>{inr(slip.net)}</div>
                    </div>
                    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 12px', fontSize: 13.5 }}>
                      <dt style={{ color: T.dim }}>Gross earnings</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-testid="slip-gross">{inr(slip.gross)}</dd>
                      {slip.reimbursements.length > 0 && <Fragment><dt style={{ color: T.dim }}>Reimbursements</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(slip.reimbursements.reduce((s, l) => s + l.amount, 0))}</dd></Fragment>}
                      {slip.deductions.map((d, i) => <Fragment key={`${d.code}-${i}`}><dt style={{ color: T.dim }}>{d.name}</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>-{inr(d.amount)}</dd></Fragment>)}
                      <dt style={{ color: T.dim, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>Total deductions</dt><dd style={{ margin: 0, textAlign: 'right', borderTop: `1px solid ${T.border}`, paddingTop: 6, fontVariantNumeric: 'tabular-nums' }}>-{inr(deductionTotal)}</dd>
                      <dt style={{ color: T.dim }}>Employer cost for the month</dt><dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(slip.employerCost)}</dd>
                    </dl>
                    <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.5 }}>
                      {att ? `${slip.paidDays} paid days of ${slip.daysInMonth}, loss of pay ${slip.lopDays}. Attendance for ${fmtMonth(MONTH)} is ${att.locked ? 'locked' : 'still open'} (${att.presentDays} days present so far).` : `No attendance logged for ${fmtMonth(MONTH)}, so a full month is assumed.`}
                      {' '}Loan EMIs are included. Tax uses the {e.taxRegime} regime on sample rates.
                    </div>
                    {oneTime.length > 0 && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text, minHeight: 32, cursor: 'pointer' }}>
                        <input type="checkbox" checked={includeOneTime} onChange={(ev) => setIncludeOneTime(ev.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} />
                        Include this month&apos;s one-time items ({oneTime.map((a) => a.note ?? a.kind).join(', ')})
                      </label>
                    )}
                    {slip.warnings.map((w, i) => <Note key={i} tone="warn">{w}</Note>)}
                  </div>
                ) : <div style={{ fontSize: 13.5, color: T.dim }}>The estimate needs a work location on the Employment tab.</div>}
              </Card>
            </div>
          </div>

          <Card>
            <CardTitle right={Object.keys(overrides).length > 0 ? <Button size="sm" variant="ghost" onClick={() => setOvText({})}>Clear all overrides</Button> : undefined}>Component overrides</CardTitle>
            <div style={{ fontSize: 13, color: T.dim, marginBottom: 12 }}>
              Fix a component at a monthly amount instead of its rule. The balancing allowance and employer contributions recalculate around it. Blank means the rule applies.
            </div>
            {overridable.length === 0 ? <div style={{ fontSize: 13.5, color: T.dim }}>This structure has no component that can be overridden.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>{['Component', 'Rule', 'Calculated', 'Override (monthly ₹)', 'Result'].map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 2 && i !== 3 ? 'right' : 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {overridable.map((c) => {
                      const calc = baseline!.lines.find((l) => l.componentId === c.id)?.monthly ?? 0;
                      const res = breakup.lines.find((l) => l.componentId === c.id)?.monthly ?? 0;
                      const err = errors[`ov-${c.id}`];
                      return (
                        <tr key={c.id}>
                          <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontSize: 13.5 }}>{c.name}</td>
                          <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.dim }}>{ruleText(c)}</td>
                          <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(calc)}</td>
                          <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, width: 190 }}>
                            <input aria-label={`Override for ${c.name}`} inputMode="numeric" value={ovText[c.id] ?? ''} placeholder="Use rule"
                              onChange={(ev) => setOvText((o) => ({ ...o, [c.id]: ev.target.value }))} className="km-input" aria-invalid={!!err || undefined} data-invalid={err ? 'true' : undefined}
                              style={{ height: 34, width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.field, borderRadius: T.radius.sm, padding: '0 10px', fontSize: 14, color: T.text, fontFamily: 'inherit', textAlign: 'right' }} />
                            {err && <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{err}</div>}
                          </td>
                          <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontSize: 13.5, textAlign: 'right', fontWeight: overrides[c.id] != null ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{inr(res)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Revision history</CardTitle>
        <DataTable columns={histCols} rows={history} minWidth={640} empty="No salary revisions recorded yet. Saving a new structure, CTC or override adds a row here." />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Taken from the employee&apos;s change log. PF ceiling in force today is {inr(pfCeiling)} and the ESI ceiling {inr(valueOn(ESI.ceiling, PREVIEW_TODAY))}, both preview values.</div>
      </Card>
    </div>
  );
}
