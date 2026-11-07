'use client';
// My HR: tax declaration (Form 124, old regime) and a both-regimes comparison on the employee's real salary.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, Note, T, useIsCompact } from '../ui';
import { Field, FormGrid, Input } from '../../ui';
import type { Employee, HrmsDb, TaxDeclaration, TaxRegime } from '../../../lib/hrms/types';
import { PF, TDS } from '../../../lib/hrms/rules';
import { inr } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { saveDeclaration } from '../../../lib/hrms/payrollActions';
import { PREVIEW_MONTH, RENT_PAN_THRESHOLD, taxComparison, validateDeclaration, type DeclarationDraft } from './logic';
import { report } from './shared';

const toDraft = (d: TaxDeclaration): DeclarationDraft => ({
  sec80C: String(d.sec80C), sec80D: String(d.sec80D), nps80CCD1B: String(d.nps80CCD1B), homeLoanInterest: String(d.homeLoanInterest),
  rentPaidAnnual: String(d.rentPaidAnnual), landlordPan: d.landlordPan ?? '', other: String(d.other),
});
const n = (s: string): number => { const v = Number(s); return Number.isFinite(v) && v > 0 ? v : 0; };
const STATUS_LABEL: Record<TaxDeclaration['status'], string> = { not_submitted: 'Not submitted', submitted: 'Submitted, awaiting HR', verified: 'Verified by HR' };

export default function MyTax({ db, e }: { db: HrmsDb; e: Employee }) {
  const narrow = useIsCompact(900);
  const [regime, setRegime] = useState<TaxRegime>(e.taxRegime);
  const [d, setD] = useState<DeclarationDraft>(toDraft(e.declaration));
  const [touched, setTouched] = useState(false);
  const errors = validateDeclaration(d);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof DeclarationDraft>(k: K, v: DeclarationDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const decl: TaxDeclaration = {
    sec80C: n(d.sec80C), sec80D: n(d.sec80D), nps80CCD1B: n(d.nps80CCD1B), homeLoanInterest: n(d.homeLoanInterest), rentPaidAnnual: n(d.rentPaidAnnual),
    landlordPan: d.landlordPan.trim().toUpperCase() || undefined, other: n(d.other), submittedOn: e.declaration.submittedOn, status: e.declaration.status,
  };
  const cmp = useMemo(() => taxComparison(db, e, decl), [db, e, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(toDraft(e.declaration)) !== JSON.stringify(d) || regime !== e.taxRegime;
  const limits = TDS.oldRegime.limits;

  const persist = (submit: boolean) => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const changed = JSON.stringify(toDraft(e.declaration)) !== JSON.stringify(d);
    const status: TaxDeclaration['status'] = submit ? 'submitted' : e.declaration.status === 'verified' && changed ? 'submitted' : e.declaration.status;
    saveDeclaration(e.id, { ...decl, status, submittedOn: submit || (status === 'submitted' && changed) ? PREVIEW_TODAY : e.declaration.submittedOn }, regime);
    report({ ok: true }, submit ? 'Declaration submitted for verification' : 'Saved');
  };

  const money = (k: keyof DeclarationDraft, label: string, hint?: React.ReactNode) => (
    <Field label={label} htmlFor={`tx-${k}`} error={show(k)} hint={hint}>
      <Input id={`tx-${k}`} inputMode="numeric" value={d[k]} invalid={!!show(k)} onChange={(ev) => set(k, ev.target.value.replace(/[^\d.]/g, ''))} />
    </Field>
  );

  const rows: { label: string; a: string; b: string; strong?: boolean }[] = cmp ? [
    { label: 'Taxable salary for the year', a: inr(cmp.annualGross), b: inr(cmp.annualGross) },
    { label: 'Standard deduction', a: inr(TDS.newRegime.standardDeduction), b: inr(TDS.oldRegime.standardDeduction) },
    { label: 'Other exemptions and deductions', a: inr(cmp.newR.exemptions - TDS.newRegime.standardDeduction), b: inr(cmp.oldR.exemptions - TDS.oldRegime.standardDeduction) },
    { label: 'Taxable income', a: inr(cmp.newR.taxable), b: inr(cmp.oldR.taxable) },
    { label: 'Tax on slabs, after rebate', a: inr(cmp.newR.tax), b: inr(cmp.oldR.tax) },
    { label: `Cess (${TDS.cess}%)`, a: inr(cmp.newR.cess), b: inr(cmp.oldR.cess) },
    { label: 'Total tax for the year', a: inr(cmp.newR.total), b: inr(cmp.oldR.total), strong: true },
    { label: 'Monthly TDS', a: inr(cmp.monthlyNew), b: inr(cmp.monthlyOld), strong: true },
  ] : [];

  const better = cmp?.better;
  const recommendation = !cmp ? '' : cmp.newR.total === cmp.oldR.total
    ? 'Both regimes give the same tax on your numbers, so the choice does not change what you pay.'
    : `On your salary and this declaration the ${better} regime gives the lower tax: ${inr(Math.min(cmp.newR.total, cmp.oldR.total))} a year against ${inr(Math.max(cmp.newR.total, cmp.oldR.total))}, which is ${inr(Math.abs(cmp.newR.total - cmp.oldR.total))} less (about ${inr(Math.abs(cmp.monthlyNew - cmp.monthlyOld))} a month). `
      + (regime === better ? `You have chosen the ${regime} regime, which is the cheaper one.` : `You have chosen the ${regime} regime; switching to the ${better} regime would save ${inr(Math.abs(cmp.newR.total - cmp.oldR.total))} a year.`);

  return (
    <Card>
      <CardTitle right={<Badge tone={e.declaration.status === 'verified' ? 'ok' : e.declaration.status === 'submitted' ? 'info' : 'neutral'} dot>{STATUS_LABEL[e.declaration.status]}</Badge>}>
        Tax declaration (Form 124)
      </CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div role="radiogroup" aria-label="Tax regime" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['new', 'old'] as const).map((r) => (
            <label key={r} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: T.radius.md, border: `1px solid ${regime === r ? T.red : T.border}`, background: regime === r ? T.redWash : T.card, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              <input type="radio" name="regime" value={r} checked={regime === r} onChange={() => setRegime(r)} style={{ width: 18, height: 18 }} />
              {r === 'new' ? 'New regime' : 'Old regime'}
            </label>
          ))}
        </div>
        {regime === 'new' && <Note>Deductions below do not reduce tax under the new regime. They are kept here so the comparison can show what the old regime would give.</Note>}

        <FormGrid narrow={narrow} columns={3}>
          {money('sec80C', 'Section 80C investments (₹ a year)', <>Limit {inr(limits.sec80C)} including your own PF, which is added automatically.</>)}
          {money('sec80D', 'Health insurance, 80D (₹ a year)', 'Premium paid; the preview does not cap this.')}
          {money('nps80CCD1B', 'NPS, 80CCD(1B) (₹ a year)', <>Counted up to {inr(limits.nps80CCD1B)}.</>)}
          {money('homeLoanInterest', 'Home loan interest (₹ a year)', <>Counted up to {inr(limits.homeLoanInterest)}.</>)}
          {money('rentPaidAnnual', 'Rent paid (₹ a year)', 'Used for the HRA exemption.')}
          <Field label="Landlord PAN" htmlFor="tx-landlordPan" required={n(d.rentPaidAnnual) > RENT_PAN_THRESHOLD} error={show('landlordPan')} hint={`Needed when rent is above ${inr(RENT_PAN_THRESHOLD)} a year.`}>
            <Input id="tx-landlordPan" value={d.landlordPan} invalid={!!show('landlordPan')} onChange={(ev) => set('landlordPan', ev.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
          </Field>
          {money('other', 'Other deductions (₹ a year)', 'Anything else HR has approved.')}
        </FormGrid>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button style={{ height: 40 }} onClick={() => persist(false)} disabled={!dirty}>Save changes</Button>
          <Button variant="primary" style={{ height: 44, padding: '0 20px', fontSize: 14 }} onClick={() => persist(true)}>Submit for verification</Button>
          {e.declaration.submittedOn && <span style={{ fontSize: 12.5, color: T.mute }}>Last submitted {e.declaration.submittedOn}</span>}
          {e.declaration.status === 'verified' && <span style={{ fontSize: 12.5, color: T.mute }}>Changing a verified declaration sends it back for verification.</span>}
        </div>

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <b style={{ fontSize: 14, fontFamily: T.heading }}>Which regime costs less?</b>
            <span style={{ fontSize: 12.5, color: T.mute }}>New regime</span><ConfidenceBadge level={TDS.newRegime.confidence} />
            <span style={{ fontSize: 12.5, color: T.mute }}>Old regime</span><ConfidenceBadge level={TDS.oldRegime.confidence} />
          </div>
          {!cmp ? <Note tone="warn">This employee has no salary structure or CTC yet, so there is nothing to compare.</Note> : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }} data-testid="tax-compare">
                  <thead>
                    <tr>
                      <th scope="col" style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}` }}>Per year</th>
                      <th scope="col" style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}` }}>New regime {better === 'new' && <Badge tone="ok">Lower</Badge>}</th>
                      <th scope="col" style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}` }}>Old regime {better === 'old' && <Badge tone="ok">Lower</Badge>}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td style={{ padding: '8px 10px', fontSize: 13.5, borderBottom: `1px solid ${T.border}`, fontWeight: r.strong ? 700 : 400 }}>{r.label}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13.5, borderBottom: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: r.strong ? 700 : 400 }}>{r.a}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13.5, borderBottom: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: r.strong ? 700 : 400 }}>{r.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: 14, color: T.text, lineHeight: 1.6 }} data-testid="tax-recommendation">{recommendation}</div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: T.mute }}>
                Computed by the payroll engine on this employee&apos;s salary for {PREVIEW_MONTH}, with PF of {PF.employeeRate}% counted under 80C. Surcharge and one-time pay are not modelled; slabs are reported values, not confirmed.
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
