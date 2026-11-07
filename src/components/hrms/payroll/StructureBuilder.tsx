'use client';
// Salary structure builder: edit components, see the breakup for any CTC through the payroll engine, and see who is affected.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, HrmsPage, Note, StatGrid, Stat, StatusBadge, T, useIsCompact, type Col } from '../ui';
import { Field, FormGrid, Input } from '../../ui';
import type { HrmsDb, SalaryComponent, SalaryStructure } from '../../../lib/hrms/types';
import { buildBreakup, type Breakup } from '../../../lib/hrms/engine';
import { PF, LABOUR_CODES, monthEnd, rowOn } from '../../../lib/hrms/rules';
import { fmtDate, fullName, inr } from '../../../lib/hrms/format';
import { saveStructure } from '../../../lib/hrms/payrollActions';
import {
  COMPONENT_KINDS, PREVIEW_MONTH, breakupTotal, calcShort, employeeBreakup, validateStructure, wageEffect,
} from './logic';
import ComponentForm from './ComponentForm';
import { ConfirmModal, report } from './shared';

const kindLabel = (k: SalaryComponent['kind']) => COMPONENT_KINDS.find((x) => x.value === k)?.label ?? k;
const yes = (b: boolean) => (b ? 'Yes' : '—');
const kindShort: Record<SalaryComponent['kind'], string> = { earning: 'Earning', employer: 'Employer', reimbursement: 'Reimb.', deduction: 'Deduction' };
const thc = { padding: '9px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const, background: T.panel, textAlign: 'left' as const };
const th = { padding: '9px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const, background: T.panel, textAlign: 'left' as const };
const tdc = { padding: '9px 8px', fontSize: 13, borderTop: `1px solid ${T.border}`, color: T.text, verticalAlign: 'middle' as const };
const td = { padding: '9px 12px', fontSize: 13.5, borderTop: `1px solid ${T.border}`, color: T.text, verticalAlign: 'middle' as const };

export default function StructureBuilder({ db, structure }: { db: HrmsDb; structure: SalaryStructure }) {
  const narrow = useIsCompact(1000);
  const [draft, setDraft] = useState<SalaryStructure>(() => structuredClone(structure));
  const [ctcInput, setCtcInput] = useState('1200000');
  const [pfMember, setPfMember] = useState(true);
  const [pfOnActual, setPfOnActual] = useState(false);
  const [editing, setEditing] = useState<SalaryComponent | 'new' | null>(null);
  const [removing, setRemoving] = useState<SalaryComponent | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(structure);
  const validation = useMemo(() => validateStructure(draft), [draft]);
  const people = db.employees.filter((e) => e.structureId === structure.id);

  const ctc = Number(ctcInput);
  const ctcError = ctcInput.trim() === '' || Number.isNaN(ctc) ? 'Enter an annual CTC' : ctc <= 0 ? 'CTC must be more than zero' : ctc > 100_000_000 ? 'More than ₹10 crore; check the amount' : '';
  const asOn = monthEnd(PREVIEW_MONTH);
  const breakup: { b: Breakup | null; error: string } = useMemo(() => {
    if (ctcError) return { b: null, error: '' };
    try { return { b: buildBreakup(draft, ctc, { asOn, pfMember, pfOnActual }), error: '' }; } catch { return { b: null, error: 'The breakup could not be computed from these components.' }; }
  }, [draft, ctc, ctcError, asOn, pfMember, pfOnActual]);
  const b = breakup.b;
  const effect = b ? wageEffect(b, asOn, pfMember, pfOnActual) : null;
  const pfCeiling = rowOn(PF.ceiling, asOn);

  const setComps = (fn: (c: SalaryComponent[]) => SalaryComponent[]) => setDraft((s) => ({ ...s, components: fn(s.components) }));
  const move = (i: number, d: -1 | 1) => setComps((cs) => { const next = [...cs]; const j = i + d; if (j < 0 || j >= next.length) return cs; [next[i], next[j]] = [next[j]!, next[i]!]; return next; });
  const upsertComp = (c: SalaryComponent) => setComps((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]));
  const save = () => {
    if (report(saveStructure(draft), `${draft.name.trim()} saved. The next compute uses it for ${people.length} employee${people.length === 1 ? '' : 's'}; frozen runs are unchanged.`)) {
      setDraft((s) => ({ ...s, name: s.name.trim() })); // the stored copy is trimmed, so the unsaved badge clears
    }
  };
  const overrideCount = (c: SalaryComponent) => db.employees.filter((e) => e.structureId === structure.id && e.structureOverrides && c.id in e.structureOverrides).length;
  const amountOf = (c: SalaryComponent): number | null => b?.lines.find((l) => l.componentId === c.id)?.monthly ?? null;

  const personRows = useMemo(() => people.map((e) => {
    const eb = employeeBreakup(db, e, draft, PREVIEW_MONTH);
    return { id: e.id, e, eb };
  }), [people, db, draft]);

  const empCols: Col<(typeof personRows)[number]>[] = [
    { key: 'emp', label: 'Employee', render: (r) => <Link href={`/dashboard/hrms/employees/${r.e.id}`} style={{ color: T.text, fontWeight: 600, textDecoration: 'none' }}>{fullName(r.e)} <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 12 }}>{r.e.code}</span></Link>, sortValue: (r) => fullName(r.e) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.e.status} /> },
    { key: 'ctc', label: 'Annual CTC', align: 'right', render: (r) => inr(r.e.annualCtc), sortValue: (r) => r.e.annualCtc ?? 0, nowrap: true },
    { key: 'gross', label: 'Monthly gross', align: 'right', render: (r) => (r.eb ? inr(r.eb.monthlyGross) : '—'), sortValue: (r) => r.eb?.monthlyGross ?? 0, nowrap: true },
    { key: 'total', label: 'Monthly total', align: 'right', render: (r) => (r.eb ? inr(breakupTotal(r.eb)) : '—'), sortValue: (r) => (r.eb ? breakupTotal(r.eb) : 0), nowrap: true },
    { key: 'wage', label: 'Wages share', align: 'right', render: (r) => (r.eb ? `${r.eb.wageTest.wagePct.toFixed(1)}%` : '—'), sortValue: (r) => r.eb?.wageTest.wagePct ?? 0 },
    { key: 'test', label: '50% test', render: (r) => (r.eb ? <Badge tone={r.eb.wageTest.passes ? 'ok' : 'warn'} dot>{r.eb.wageTest.passes ? 'Pass' : `Add-back ${inr(r.eb.wageTest.addBack)}`}</Badge> : '—'), nowrap: true },
    { key: 'pfwage', label: 'PF wage', align: 'right', render: (r) => (r.eb ? inr(r.eb.pfWage) : '—'), sortValue: (r) => r.eb?.pfWage ?? 0, nowrap: true },
  ];

  const diff = b ? Math.round(breakupTotal(b)) - Math.round(b.monthlyCtc) : 0;

  return (
    <HrmsPage
      eyebrow={<Link href="/dashboard/hrms/payroll?tab=structures" style={{ color: T.mute, textDecoration: 'none' }}>Payroll / Structures</Link>}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{structure.name}{dirty && <Badge tone="warn" dot>Unsaved changes</Badge>}</span>}
      description={`${people.length} employee${people.length === 1 ? '' : 's'} on this structure · effective ${fmtDate(structure.effectiveFrom)}`}
      actions={<>
        <Button disabled={!dirty} onClick={() => setDraft(structuredClone(structure))}>Discard changes</Button>
        <Button variant="primary" style={{ height: 40 }} disabled={!dirty || validation.errors.length > 0} onClick={save}>Save structure</Button>
      </>}
    >
      {validation.errors.length > 0 && (
        <Note tone="red"><b>Fix before saving:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }} data-testid="structure-errors">{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Note>
      )}

      <Card>
        <CardTitle>Details</CardTitle>
        <FormGrid narrow={narrow} columns={3}>
          <Field label="Name" required htmlFor="st-name" error={!draft.name.trim() ? 'Give the structure a name' : undefined}>
            <Input id="st-name" value={draft.name} invalid={!draft.name.trim()} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Description" htmlFor="st-desc">
            <Input id="st-desc" value={draft.description ?? ''} onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))} />
          </Field>
          <Field label="Effective from" required htmlFor="st-eff" hint="The date new pay under this structure starts">
            <Input id="st-eff" type="date" value={draft.effectiveFrom} onChange={(e) => setDraft((s) => ({ ...s, effectiveFrom: e.target.value }))} />
          </Field>
        </FormGrid>
      </Card>

      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}>
          <CardTitle right={<Button variant="primary" style={{ height: 40 }} onClick={() => setEditing('new')}>Add component</Button>}>Components</CardTitle>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }} data-testid="component-table">
            <thead>
              <tr>
                <th scope="col" style={thc}>Code</th><th scope="col" style={thc}>Name</th><th scope="col" style={thc}>Kind</th><th scope="col" style={thc}>Calculation</th>
                <th scope="col" style={{ ...thc, textAlign: 'right' }}>At CTC {b ? inr(ctc) : ''}</th>
                <th scope="col" style={thc}><abbr title="Counts as wages for the 50% test, PF and gratuity">Wage</abbr></th>
                <th scope="col" style={thc}><abbr title="Taxable">Tax</abbr></th>
                <th scope="col" style={thc}><abbr title="PF applicable (informational)">PF</abbr></th>
                <th scope="col" style={thc}><abbr title="ESI applicable">ESI</abbr></th>
                <th scope="col" style={thc}><abbr title="Reduced by loss of pay">Prorate</abbr></th>
                <th scope="col" style={thc}><abbr title="Shown on the payslip">Slip</abbr></th>
                <th scope="col" style={thc}>Order and actions</th>
              </tr>
            </thead>
            <tbody>
              {draft.components.length === 0 && <tr><td colSpan={12} style={{ ...tdc, textAlign: 'center', color: T.mute, padding: 32 }}>No components. Add a BASIC component to start.</td></tr>}
              {draft.components.map((c, i) => (
                <tr key={c.id} data-testid="component-row">
                  <td style={{ ...tdc, fontFamily: T.mono, fontSize: 12.5, fontWeight: 600 }}>{c.code}</td>
                  <td style={tdc}>{c.name}</td>
                  <td style={{ ...tdc, whiteSpace: 'nowrap' }}><Badge tone={c.kind === 'earning' ? 'info' : c.kind === 'employer' ? 'neutral' : c.kind === 'reimbursement' ? 'ok' : 'warn'}>{kindShort[c.kind]}</Badge></td>
                  <td style={{ ...tdc, whiteSpace: 'nowrap' }}>{calcShort(c.calc)}</td>
                  <td style={{ ...tdc, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{amountOf(c) != null ? inr(amountOf(c)) : '—'}</td>
                  <td style={tdc}>{c.isWage ? <Badge tone="ok">Wage</Badge> : '—'}</td>
                  <td style={tdc}>{yes(c.taxable)}</td><td style={tdc}>{yes(c.pfApplicable)}</td><td style={tdc}>{yes(c.esiApplicable)}</td><td style={tdc}>{yes(c.prorate)}</td><td style={tdc}>{yes(c.showInPayslip)}</td>
                  <td style={{ ...tdc, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button type="button" aria-label={`Move ${c.code} up`} disabled={i === 0} onClick={() => move(i, -1)} style={arrowBtn(i === 0)}>↑</button>
                      <button type="button" aria-label={`Move ${c.code} down`} disabled={i === draft.components.length - 1} onClick={() => move(i, 1)} style={arrowBtn(i === draft.components.length - 1)}>↓</button>
                      <Button size="sm" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="sm" variant="danger" aria-label={`Remove ${c.code}`} onClick={() => setRemoving(c)}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 20px 16px', fontSize: 12.5, color: T.mute }}>
          The arrows set the order of the lines on the payslip. The PF flag is informational: the PF wage comes from the wage components and the 50% rule. Changes stay in this draft until you save.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 3fr) minmax(0, 2fr)', gap: 18, alignItems: 'start' }}>
        <Card>
          <CardTitle>Breakup preview</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(180px, 1fr) auto auto', gap: 16, alignItems: 'end', marginBottom: 14 }}>
            <Field label="Annual CTC (₹)" htmlFor="st-ctc" error={ctcError || undefined}>
              <Input id="st-ctc" inputMode="numeric" value={ctcInput} invalid={!!ctcError} onChange={(e) => setCtcInput(e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40, fontSize: 13.5 }}>
              <input type="checkbox" checked={pfMember} onChange={(e) => setPfMember(e.target.checked)} style={{ width: 18, height: 18 }} /> PF member
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40, fontSize: 13.5, color: pfMember ? T.text : T.mute }}>
              <input type="checkbox" checked={pfOnActual} disabled={!pfMember} onChange={(e) => setPfOnActual(e.target.checked)} style={{ width: 18, height: 18 }} /> PF on actual wage
            </label>
          </div>
          {breakup.error && <Note tone="red">{breakup.error}</Note>}
          {b && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }} data-testid="breakup-table">
                <thead><tr><th scope="col" style={th}>Component</th><th scope="col" style={th}>Kind</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Monthly</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Annual</th></tr></thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.componentId}>
                      <td style={td}><span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute }}>{l.code}</span> {l.name}{l.isWage && <Badge tone="ok" style={{ marginLeft: 8 }}>Wage</Badge>}</td>
                      <td style={{ ...td, color: T.dim }}>{kindLabel(l.kind)}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(l.monthly)}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.dim }}>{inr(l.monthly * 12)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Monthly gross (earnings)</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }} data-testid="breakup-gross">{inr(b.monthlyGross)}</td><td style={{ ...td, textAlign: 'right', color: T.dim }}>{inr(b.monthlyGross * 12)}</td></tr>
                  <tr><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total of all components</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }} data-testid="breakup-total">{inr(breakupTotal(b))}</td><td style={{ ...td, textAlign: 'right', color: T.dim }}>{inr(breakupTotal(b) * 12)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
          {!b && !breakup.error && <div style={{ fontSize: 13.5, color: T.mute }}>Enter a CTC to see the breakup.</div>}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <CardTitle right={<ConfidenceBadge level="reported" />}>50% wage test</CardTitle>
            {b && effect ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="wage-test">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Badge tone={b.wageTest.passes ? 'ok' : 'warn'} dot>{b.wageTest.passes ? 'Pass' : 'Fail, add-back applied'}</Badge>
                  <span style={{ fontSize: 13.5, color: T.dim }}>Wages are <b style={{ color: T.text }}>{b.wageTest.wagePct.toFixed(1)}%</b> of remuneration; the Labour Codes ask for at least {LABOUR_CODES.minWagePercent}%.</span>
                </div>
                <StatGrid min={130}>
                  <Stat label="Wages" value={inr(b.wageTest.wages)} hint="Wage components, monthly" />
                  <Stat label="Add-back" value={inr(b.wageTest.addBack)} tone={b.wageTest.addBack ? 'warn' : undefined} hint="Added to reach 50%" />
                  <Stat label="Code wages" value={inr(b.wageTest.codeWages)} hint="Base for PF and gratuity" />
                </StatGrid>
                <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.6 }} data-testid="wage-effect">
                  {pfMember ? (
                    <>PF wage is <b style={{ color: T.text }}>{inr(effect.pfWageWith)}</b> against <b style={{ color: T.text }}>{inr(effect.pfWageWithout)}</b> without the add-back
                      {effect.pfWageDelta ? <>: <b style={{ color: T.warn }}>{inr(effect.pfWageDelta)}</b> more wage and <b style={{ color: T.warn }}>{inr(effect.employerPfDelta)}</b> more employer PF a month.</> : ', so the add-back does not change PF here.'}
                    </>
                  ) : 'This employee is not a PF member, so the add-back does not change PF.'}
                  {' '}PF wage ceiling <b style={{ color: T.text }}>{inr(pfCeiling.value)}</b> <ConfidenceBadge level={pfCeiling.confidence} />
                </div>
              </div>
            ) : <div style={{ fontSize: 13.5, color: T.mute }}>Enter a valid CTC to run the test.</div>}
          </Card>

          <Card>
            <CardTitle>Reconciliation to the CTC</CardTitle>
            {b ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="reconciliation">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: T.dim }}>Monthly CTC ({inr(ctc)} ÷ 12)</span><b>{inr(b.monthlyCtc)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: T.dim }}>Sum of components</span><b>{inr(breakupTotal(b))}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                  <span style={{ color: T.dim }}>Difference</span>
                  <span><b>{diff >= 0 ? '+' : ''}{inr(diff)}</b> <Badge tone={Math.abs(diff) <= 1 ? 'ok' : 'warn'} dot>{Math.abs(diff) <= 1 ? 'Reconciles (rounding only)' : 'Does not reconcile'}</Badge></span>
                </div>
              </div>
            ) : <div style={{ fontSize: 13.5, color: T.mute }}>Enter a valid CTC to reconcile.</div>}
          </Card>

          {(validation.warnings.length > 0 || (b && b.warnings.length > 0)) && (
            <Card>
              <CardTitle>Warnings</CardTitle>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.warn, lineHeight: 1.6 }} data-testid="structure-warnings">
                {validation.warnings.map((w) => <li key={w}>{w}</li>)}
                {b?.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, marginBottom: 4 }}>Employees on this structure</div>
        <div style={{ fontSize: 13, color: T.dim, marginBottom: 10 }}>Each person&apos;s own CTC through {dirty ? 'the draft above (not saved yet)' : 'this structure'}, for {PREVIEW_MONTH}. Individual overrides are applied.</div>
        <DataTable columns={empCols} rows={personRows} minWidth={900} empty="Nobody is on this structure yet. Assign it from an employee's salary tab." />
      </div>

      {editing && <ComponentForm initial={editing === 'new' ? undefined : editing} siblings={draft.components} onClose={() => setEditing(null)} onSave={upsertComp} />}
      {removing && (
        <ConfirmModal title={`Remove ${removing.code}`} danger confirmLabel="Remove component" onClose={() => setRemoving(null)}
          onConfirm={() => { setComps((cs) => cs.filter((c) => c.id !== removing.id)); setRemoving(null); }}>
          Remove <b>{removing.name}</b> ({removing.code}) from this draft?
          {overrideCount(removing) > 0 && <> {overrideCount(removing)} employee{overrideCount(removing) === 1 ? ' has' : 's have'} an individual override on it, which will stop applying.</>}
          {' '}Nothing changes for payroll until you save the structure.
        </ConfirmModal>
      )}
    </HrmsPage>
  );
}

const arrowBtn = (disabled: boolean): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.card, color: disabled ? T.mute : T.text, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1, opacity: disabled ? 0.5 : 1,
});

