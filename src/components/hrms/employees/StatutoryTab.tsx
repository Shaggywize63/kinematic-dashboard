'use client';
// Statutory and bank: identifiers, PF / ESI / PT / LWF flags, tax regime and Form 124 declaration, bank details.
// Aadhaar and the bank account number are masked; revealing either asks for a reason and writes to the access log.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, KeyValue, Modal, Note, StatusBadge, T, useIsCompact } from '../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { logAccess } from '../../../lib/hrms/actions';
import { ESI, LWF_RULES, PF, PT_NONE_STATES, PT_RULES, TDS, lwfFor, professionalTax, rowOn } from '../../../lib/hrms/rules';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate, inr } from '../../../lib/hrms/format';
import { maskAadhaar, maskAccount } from '../../../lib/hrms/validators';
import { isLive, revealSensitive } from '../../../lib/hrms/live/store';
import { looksMaskedPan } from '../../../lib/hrms/live/masking';
import { DeclarationFields, StatutoryFields, TextAreaField } from './fields';
import { EditBar, ErrorSummary, SubHeading } from './shared';
import { useEditForm } from './useEditForm';
import { PAY_MODES, TAX_REGIMES, UAN_STATUSES, breakupFor, labelOf, statutoryPatch, validateStatutory } from './logic';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

function RevealModal({ what, onConfirm, onClose, busy, failure }: { what: string; onConfirm: (reason: string) => void; onClose: () => void; busy?: boolean; failure?: string }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { document.getElementById('reveal-reason')?.focus(); }, []);
  const submit = () => {
    if (busy) return;
    if (reason.trim().length < 5) { setErr('Enter a reason of at least 5 characters'); return; }
    onConfirm(reason.trim());
  };
  return (
    <Modal title={`Reveal ${what}`} onClose={onClose} width={480} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy} style={{ minHeight: 40 }}>{busy ? 'Revealing' : 'Reveal for one minute'}</Button>
      </>
    }>
      <Note tone="info">This is personal data under the DPDP Act. The reveal is written to the access log with your name, the time and your reason. It hides again after a minute or when you leave this tab.</Note>
      <form onSubmit={(ev) => { ev.preventDefault(); submit(); }} noValidate>
        <TextAreaField id="reveal-reason" label="Reason" required value={reason} onChange={(v) => { setReason(v); setErr(''); }} error={err} hint="For example: checking against the PAN card" rows={3} />
        {failure && <div role="alert" data-testid="reveal-error" style={{ marginTop: 10, color: T.red, fontSize: 13 }}>{failure}</div>}
      </form>
    </Modal>
  );
}

function AppliesRow({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5, color: T.text }}>{title}</strong>
        {badge}
      </div>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/** Which schemes apply to this person today, read from the rules file and the salary engine. */
function AppliesToday({ e, db }: { e: Employee; db: HrmsDb }) {
  const asOn = PREVIEW_TODAY;
  const month = asOn.slice(0, 7);
  const b = breakupFor(db, e, asOn);
  const loc = db.locations.find((l) => l.id === e.locationId);
  const state = loc?.state ?? '';
  const pfRow = rowOn(PF.ceiling, asOn);
  const esiRow = rowOn(ESI.ceiling, asOn);
  const ptRule = PT_RULES.find((r) => r.state === state);
  const lwfRule = LWF_RULES.find((r) => r.state === state);
  const esiWage = b ? b.lines.filter((l) => l.kind === 'earning' && l.esiApplicable).reduce((s, l) => s + l.monthly, 0) : 0;
  const tdsConf = e.taxRegime === 'new' ? TDS.newRegime.confidence : TDS.oldRegime.confidence;

  return (
    <Card>
      <CardTitle>What applies today</CardTitle>
      <div style={{ fontSize: 12.5, color: T.mute, marginTop: -8, marginBottom: 6 }}>As on {fmtDate(asOn)}, at full attendance. Each rate carries a tag showing how far it can be trusted.</div>

      <AppliesRow title="Provident fund" badge={<ConfidenceBadge level={pfRow.confidence} />}>
        {!e.pfMember ? 'Not a PF member, so no PF is deducted.' : (
          <>
            PF wage ceiling in force: <strong>{inr(pfRow.value)}</strong> (from {fmtDate(pfRow.from)}).
            {b ? (
              <>
                {' '}PF wage for this employee is <strong>{inr(b.pfWage)}</strong>
                {e.pfOnActualWage ? ', on actual wage' : b.wageTest.codeWages > pfRow.value ? ', capped at the ceiling' : ', below the ceiling so on the full wage'}.
                {' '}Employee {PF.employeeRate}% = {inr(Math.round((b.pfWage * PF.employeeRate) / 100))}, employer {PF.employerRate}% = {inr(Math.round((b.pfWage * PF.employerRate) / 100))} a month.
              </>
            ) : ' Add a salary structure and CTC on the Salary tab to see the PF wage.'}
          </>
        )}
      </AppliesRow>

      <AppliesRow title="ESI" badge={<ConfidenceBadge level={esiRow.confidence} />}>
        ESI applies up to a gross of <strong>{inr(esiRow.value)}</strong> a month.
        {b ? (
          <>
            {' '}Gross here is <strong>{inr(b.monthlyGross)}</strong>, so ESI <strong>{b.esiApplicable ? 'applies' : 'does not apply'}</strong>.
            {b.esiApplicable && <> Employee {ESI.employeeRate}% = {inr(Math.ceil((esiWage * ESI.employeeRate) / 100))}, employer {ESI.employerRate}% = {inr(Math.ceil((esiWage * ESI.employerRate) / 100))} a month.</>}
            {b.esiApplicable && !e.esicIp && <> <strong style={{ color: T.warn }}>No ESIC number is on file.</strong></>}
          </>
        ) : ' Add a salary structure and CTC to test this.'}
      </AppliesRow>

      <AppliesRow title="Professional tax" badge={ptRule ? <ConfidenceBadge level={ptRule.confidence} /> : <Badge tone="neutral">Not modelled</Badge>}>
        {!e.ptApplicable ? 'Switched off for this employee.' : ptRule ? (
          <>
            {state}: {b ? <><strong>{inr(professionalTax(state, b.monthlyGross, e.gender, month))}</strong> a month at this gross.</> : 'add a salary to see the amount.'}
            {ptRule.note ? ` ${ptRule.note}.` : ''}
          </>
        ) : PT_NONE_STATES.includes(state) ? `${state} has no professional tax in the rules, so nothing is deducted.` : `${state || 'This state'} is not modelled in the preview, so the engine deducts nothing.`}
        {e.ptApplicable && !ptRule && PT_NONE_STATES.includes(state) ? ' The "Professional tax applies" flag can stay on; it has no effect here.' : ''}
      </AppliesRow>

      <AppliesRow title="Labour welfare fund" badge={lwfRule ? <ConfidenceBadge level={lwfRule.confidence} /> : <Badge tone="neutral">Not modelled</Badge>}>
        {!e.lwfApplicable ? 'Switched off for this employee.' : lwfRule ? (
          <>
            {state}: employee {inr(lwfRule.employee)}, employer {inr(lwfRule.employer)}, in {lwfRule.months.map((m) => MONTH_NAMES[m - 1]).join(' and ')}.
            {' '}This month: {lwfFor(state, month).employee ? inr(lwfFor(state, month).employee) : 'nothing due'}.
          </>
        ) : `No labour welfare fund is modelled for ${state || 'this state'}.`}
      </AppliesRow>

      <AppliesRow title="Income tax (TDS)" badge={<ConfidenceBadge level={tdsConf} />}>
        {e.taxRegime === 'new' ? 'New regime' : 'Old regime'}: standard deduction {inr(e.taxRegime === 'new' ? TDS.newRegime.standardDeduction : TDS.oldRegime.standardDeduction)}.
        {e.taxRegime === 'new' ? ` No tax up to a taxable income of ${inr(TDS.newRegime.rebateLimit)}.` : ' Declared deductions reduce the tax; limits are on the declaration card.'}
        {!e.pan && <> <strong style={{ color: T.warn }}>No PAN, so TDS goes at a higher rate.</strong></>}
      </AppliesRow>

      <div style={{ marginTop: 6 }}>
        <Note tone="warn">Preview rates only. A live payroll run needs every row tagged &quot;Reported&quot; or &quot;Sample&quot; confirmed against the notification.</Note>
      </div>
    </Card>
  );
}

export default function StatutoryTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const f = useEditForm({ key: 'statutory', e, validate: (d) => validateStatutory(d, { hasBank: !!e.bank }), toPatch: (d) => statutoryPatch(d, e) });
  const [ask, setAsk] = useState<null | 'aadhaar' | 'bank' | 'pan'>(null);
  const [shown, setShown] = useState({ aadhaar: false, bank: false, pan: false });
  // Live data only: the values the server returned for a reveal. They live in this component and nowhere else, and go after a minute.
  const [revealed, setRevealed] = useState<{ aadhaar?: string; bank?: string; pan?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const closeAsk = useCallback(() => { setAsk(null); setFailure(''); }, []);

  // A reveal lasts one minute, then masks again.
  useEffect(() => {
    if (!shown.aadhaar && !shown.bank && !shown.pan) return undefined;
    const t = setTimeout(() => { setShown({ aadhaar: false, bank: false, pan: false }); setRevealed({}); }, 60_000);
    return () => clearTimeout(t);
  }, [shown]);

  const confirmReveal = async (reason: string) => {
    if (!ask) return;
    if (isLive()) {
      // The server checks the reason, writes who / when / why to its access log, and only then returns the value.
      setBusy(true); setFailure('');
      try {
        const value = await revealSensitive(e.id, ask, reason);
        const text = ask === 'bank' ? String((value as { accountNumber?: string } | null)?.accountNumber ?? '') : String(value ?? '');
        setRevealed((r) => ({ ...r, [ask]: text }));
        setShown((s) => ({ ...s, [ask]: true }));
        setAsk(null);
      } catch (err) {
        setFailure(err instanceof Error && err.message ? err.message : 'The server did not answer. Nothing was revealed.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (ask === 'aadhaar') { logAccess(e.id, 'Aadhaar (last four digits)', reason); setShown((s) => ({ ...s, aadhaar: true })); }
    if (ask === 'bank') { logAccess(e.id, 'Bank account number', reason); setShown((s) => ({ ...s, bank: true })); }
    setAsk(null);
  };

  const dec = e.declaration;
  const old = e.taxRegime === 'old';
  const aadhaarText = !e.aadhaarLast4 ? 'Not on file' : shown.aadhaar ? maskAadhaar(revealed.aadhaar ?? e.aadhaarLast4) : 'XXXX XXXX ••••';
  const bankText = !e.bank ? 'Not on file' : shown.bank ? (revealed.bank ?? e.bank.accountNumber) : maskAccount(e.bank.accountNumber);
  // Live data shows a masked PAN until it is revealed with a reason; sample data has no masking, so no button.
  const panMasked = looksMaskedPan(e.pan);
  const panText = shown.pan && revealed.pan ? revealed.pan : e.pan;

  const revealBtn = (kind: 'aadhaar' | 'bank' | 'pan', label: string) => (
    <Button size="sm" style={{ marginLeft: 10, minHeight: 32 }} aria-label={label}
      onClick={() => (shown[kind] ? setShown((s) => ({ ...s, [kind]: false })) : setAsk(kind))}>{shown[kind] ? 'Hide' : 'Reveal'}</Button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Card>
          <CardTitle right={<EditBar editing={f.editing} onEdit={f.start} onSave={f.save} onCancel={f.cancel} flash={f.flash} editLabel="Edit statutory details" />}>Statutory and bank</CardTitle>
          {f.editing ? (
            <form onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate aria-label="Edit statutory details" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ErrorSummary errors={f.errors} />
              <StatutoryFields d={f.d} set={f.set} errors={f.errors} narrow={narrow} p="se" mode="edit" hasAadhaar={!!e.aadhaarLast4} hasBank={!!e.bank} maskedPan={panMasked ? e.pan : undefined} />
              <SubHeading>Tax declaration (Form 124)</SubHeading>
              <Note tone="info">These inputs are used only under the old tax regime. The new regime ignores them, but they are kept if you switch back.</Note>
              <DeclarationFields d={f.d} set={f.set} errors={f.errors} narrow={narrow} p="se" />
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <KeyValue rows={[
                {
                  label: 'PAN',
                  value: e.pan ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span data-testid="pan-value" style={{ fontFamily: T.mono }}>{panText}</span>
                      {panMasked && revealBtn('pan', shown.pan ? 'Hide PAN' : 'Reveal PAN')}
                    </span>
                  ) : <Badge tone="warn">Missing</Badge>,
                },
                {
                  label: 'Aadhaar',
                  value: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span data-testid="aadhaar-value" style={{ fontFamily: T.mono }}>{aadhaarText}</span>
                      {e.aadhaarLast4 && <Badge tone={e.aadhaarVerified ? 'ok' : 'neutral'}>{e.aadhaarVerified ? 'Verified' : 'Not verified'}</Badge>}
                      {e.aadhaarLast4 && revealBtn('aadhaar', shown.aadhaar ? 'Hide Aadhaar digits' : 'Reveal Aadhaar last four digits')}
                      {!e.aadhaarLast4 && <Badge tone="warn">Missing</Badge>}
                    </span>
                  ),
                },
                { label: 'UAN', value: e.uan ? <span style={{ fontFamily: T.mono }}>{e.uan}</span> : (e.pfMember ? <Badge tone="warn">Missing</Badge> : 'Not needed') },
                { label: 'UAN status', value: labelOf(UAN_STATUSES, e.uanStatus) },
                { label: 'PF member', value: yesNo(e.pfMember) },
                { label: 'Contribute PF on actual wage', value: e.pfMember ? yesNo(e.pfOnActualWage) : 'Not a PF member' },
                { label: 'PF join date', value: e.pfJoinDate ? fmtDate(e.pfJoinDate) : undefined },
                { label: 'ESIC number', value: e.esicIp ? <span style={{ fontFamily: T.mono }}>{e.esicIp}</span> : undefined },
                { label: 'Professional tax applies', value: yesNo(e.ptApplicable) },
                { label: 'Labour welfare fund applies', value: yesNo(e.lwfApplicable) },
              ]} columns={3} />

              <div>
                <SubHeading>Bank account</SubHeading>
                <div style={{ marginTop: 10 }}>
                  <KeyValue rows={[
                    { label: 'Account holder', value: e.bank?.accountHolder },
                    {
                      label: 'Account number',
                      value: (
                        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span data-testid="bank-value" style={{ fontFamily: T.mono }}>{bankText}</span>
                          {e.bank && revealBtn('bank', shown.bank ? 'Hide account number' : 'Reveal full account number')}
                        </span>
                      ),
                    },
                    { label: 'IFSC', value: e.bank ? <span style={{ fontFamily: T.mono }}>{e.bank.ifsc}</span> : undefined },
                    { label: 'Bank', value: e.bank ? `${e.bank.bankName} (${e.bank.accountType})` : undefined },
                    { label: 'Pay mode', value: labelOf(PAY_MODES, e.payMode) },
                  ]} columns={3} />
                  {!e.bank && e.payMode === 'bank' && <div style={{ marginTop: 10 }}><Note tone="warn">Pay mode is bank transfer but no account is on file. This employee cannot be paid in the next run until one is added.</Note></div>}
                </div>
              </div>
            </div>
          )}
        </Card>

        {!f.editing && (
          <Card>
            <CardTitle right={<StatusBadge status={dec.status} label={dec.status === 'not_submitted' ? 'Not submitted' : undefined} />}>Income tax</CardTitle>
            <KeyValue rows={[
              { label: 'Tax regime', value: labelOf(TAX_REGIMES, e.taxRegime) },
              { label: 'Declaration submitted on', value: dec.submittedOn ? fmtDate(dec.submittedOn) : undefined },
              { label: 'Section 80C (yearly)', value: old ? inr(dec.sec80C) : <span style={{ color: T.mute }}>{inr(dec.sec80C)} (not used)</span> },
              { label: 'Section 80D (yearly)', value: old ? inr(dec.sec80D) : <span style={{ color: T.mute }}>{inr(dec.sec80D)} (not used)</span> },
              { label: 'NPS 80CCD(1B) (yearly)', value: old ? inr(dec.nps80CCD1B) : <span style={{ color: T.mute }}>{inr(dec.nps80CCD1B)} (not used)</span> },
              { label: 'Home-loan interest (yearly)', value: old ? inr(dec.homeLoanInterest) : <span style={{ color: T.mute }}>{inr(dec.homeLoanInterest)} (not used)</span> },
              { label: 'Rent paid (yearly)', value: old ? inr(dec.rentPaidAnnual) : <span style={{ color: T.mute }}>{inr(dec.rentPaidAnnual)} (not used)</span> },
              { label: 'Landlord PAN', value: dec.landlordPan },
              { label: 'Other deductions (yearly)', value: old ? inr(dec.other) : <span style={{ color: T.mute }}>{inr(dec.other)} (not used)</span> },
            ]} columns={3} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, fontSize: 12.5, color: T.dim }}>
              <ConfidenceBadge level={TDS.oldRegime.confidence} />
              <span>
                Old-regime limits in the preview: 80C {inr(TDS.oldRegime.limits.sec80C)} (employee PF counts towards it), NPS {inr(TDS.oldRegime.limits.nps80CCD1B)}, home-loan interest {inr(TDS.oldRegime.limits.homeLoanInterest)}.
                {old && dec.sec80C > TDS.oldRegime.limits.sec80C ? ` The declared 80C is above the limit, so only ${inr(TDS.oldRegime.limits.sec80C)} counts.` : ''}
              </span>
            </div>
          </Card>
        )}
        {f.dialog}
      </div>

      <AppliesToday e={e} db={db} />

      {ask && <RevealModal what={ask === 'aadhaar' ? 'Aadhaar last four digits' : ask === 'pan' ? 'PAN' : 'bank account number'} onClose={closeAsk} onConfirm={confirmReveal} busy={busy} failure={failure} />}
    </div>
  );
}
