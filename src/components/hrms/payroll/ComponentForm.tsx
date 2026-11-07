'use client';
// Add or edit one salary component. Validates with validateComponent and only hands a valid component back.

import { useState } from 'react';
import { Button, Modal, Note, T, useIsCompact } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import type { CalcType, ComponentKind, SalaryComponent } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { ESI, PF } from '../../../lib/hrms/rules';
import {
  CALC_LABEL, CALC_TYPES_BY_KIND, COMPONENT_KINDS, componentFromDraft, draftFromComponent, flagDefaults, validateComponent, type ComponentDraft,
} from './logic';

const BLANK: ComponentDraft = {
  code: '', name: '', kind: 'earning', calcType: 'fixed', value: '', isWage: false, taxable: true, pfApplicable: false, esiApplicable: true, prorate: true, showInPayslip: true,
};

export default function ComponentForm({ initial, siblings, onClose, onSave }: {
  initial?: SalaryComponent; siblings: SalaryComponent[]; onClose: () => void; onSave: (c: SalaryComponent) => void;
}) {
  const narrow = useIsCompact(700);
  const [d, setD] = useState<ComponentDraft>(initial ? draftFromComponent(initial) : BLANK);
  const [touched, setTouched] = useState(false);
  const others = siblings.filter((s) => s.id !== initial?.id);
  const errors = validateComponent(d, others);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof ComponentDraft>(k: K, v: ComponentDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const types = CALC_TYPES_BY_KIND[d.kind];
  const valueless = d.calcType === 'balance' || d.calcType === 'pf_employer' || d.calcType === 'esi_employer';
  const unit = d.calcType === 'fixed' ? '₹ a month' : '%';

  const changeKind = (kind: ComponentKind) => {
    const allowed = CALC_TYPES_BY_KIND[kind];
    setD((x) => ({ ...x, kind, calcType: allowed.includes(x.calcType) ? x.calcType : allowed[0]!, ...flagDefaults(kind) }));
  };
  const changeCalc = (t: CalcType) => setD((x) => ({
    ...x, calcType: t,
    value: t === 'pf_employer' ? String(PF.employerRate) : t === 'esi_employer' ? String(ESI.employerRate) : t === 'balance' ? '0' : t === 'gratuity_provision' ? '4.81' : x.calcType === t ? x.value : '',
  }));

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSave(componentFromDraft(d, initial?.id ?? uid('c')));
    onClose();
  };

  const flag = (k: 'isWage' | 'taxable' | 'pfApplicable' | 'esiApplicable' | 'prorate' | 'showInPayslip', label: string, hint?: string, disabled?: boolean) => (
    <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 36, fontSize: 14, color: disabled ? T.mute : T.text, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={d[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 12, color: T.mute }}>{hint}</span>}</span>
    </label>
  );

  return (
    <Modal title={initial ? `Edit ${initial.code}` : 'Add component'} onClose={onClose} width={640}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>{initial ? 'Apply changes' : 'Add component'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Code" required htmlFor="cf-code" error={show('code')} hint="Capital letters, digits and underscores">
            <Input id="cf-code" value={d.code} invalid={!!show('code')} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="HRA" autoFocus />
          </Field>
          <Field label="Name" required htmlFor="cf-name" error={show('name')}>
            <Input id="cf-name" value={d.name} invalid={!!show('name')} onChange={(e) => set('name', e.target.value)} placeholder="House Rent Allowance" />
          </Field>
          <Field label="Kind" required htmlFor="cf-kind" error={show('kind')}>
            <Select id="cf-kind" value={d.kind} invalid={!!show('kind')} onChange={(e) => changeKind(e.target.value as ComponentKind)}>
              {COMPONENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="How it is calculated" required htmlFor="cf-calc" error={show('calcType')}>
            <Select id="cf-calc" value={d.calcType} invalid={!!show('calcType')} onChange={(e) => changeCalc(e.target.value as CalcType)}>
              {types.map((t) => <option key={t} value={t}>{CALC_LABEL[t]}</option>)}
            </Select>
          </Field>
          {!valueless && (
            <Field label={`Value (${unit})`} required htmlFor="cf-value" error={show('value')}>
              <Input id="cf-value" inputMode="decimal" value={d.value} invalid={!!show('value')} onChange={(e) => set('value', e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          )}
        </FormGrid>
        {d.calcType === 'pf_employer' && <Note>Uses the employer PF rate in the PF rules ({PF.employerRate}% of the PF wage), so there is no value to enter.</Note>}
        {d.calcType === 'esi_employer' && <Note>Uses the employer ESI rate in the ESI rules ({ESI.employerRate}% of ESI wages while the gross is under the ceiling).</Note>}
        {d.calcType === 'balance' && <Note>Takes whatever is left of the CTC after the other components, so the breakup always adds up. A structure can have only one.</Note>}
        {d.kind === 'deduction' && <Note tone="warn">The preview payroll engine does not apply deduction components. Statutory deductions come from the rules and loans from the Loans tab.</Note>}

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginBottom: 6 }}>Treatment</div>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: '2px 20px' }}>
            {flag('isWage', 'Counts as wages', show('isWage') ?? 'Basic, DA and retaining allowance: used for the 50% test, PF and gratuity', d.kind !== 'earning')}
            {flag('taxable', 'Taxable')}
            {flag('pfApplicable', 'PF applicable', 'Informational: the PF wage is built from the wage components')}
            {flag('esiApplicable', 'ESI applicable')}
            {flag('prorate', 'Reduced by loss of pay')}
            {flag('showInPayslip', 'Show on the payslip')}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
