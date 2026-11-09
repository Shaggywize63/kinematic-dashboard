'use client';
// The dialog that runs one SIMULATED check. It shows what is checked and why (the consent line), asks for the details, and
// needs a tick that the person has agreed. An Aadhaar number is typed here once, checked, and thrown away: only the last
// four digits ever reach the store.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button, Modal, T } from '../ui';
import { Field, Input } from '../../ui';
import { sampleAadhaar } from '../../../lib/hrms/validators';
import { runVerifyStep } from '../../../lib/hrms/workforce/store';
import { SIMULATION_LABEL, STEP_META, consentLine } from '../../../lib/hrms/workforce/verifyEngine';
import type { StepKey, VerifyCase, VerifyInputs } from '../../../lib/hrms/workforce/types';
import { ErrorLine, SimBadge, muted } from './shared';

type FieldSpec = { key: keyof VerifyInputs; label: string; type?: string; placeholder?: string; hint?: string };
const FIELDS: Record<StepKey, FieldSpec[]> = {
  pan: [{ key: 'pan', label: 'PAN', placeholder: 'ABCDE1234F' }],
  aadhaar: [],
  bank: [
    { key: 'bankAccount', label: 'Account number', placeholder: '9 to 18 digits' },
    { key: 'ifsc', label: 'IFSC', placeholder: 'HDFC0001234' },
    { key: 'accountHolder', label: 'Account holder name' },
  ],
  uan: [{ key: 'uan', label: 'Existing UAN (12 digits)', placeholder: 'Leave blank if none', hint: 'Blank means a sample UAN is generated.' }],
  education: [
    { key: 'degree', label: 'Degree', placeholder: 'B.Com' },
    { key: 'institution', label: 'Institution' },
    { key: 'gradYear', label: 'Year of graduation', placeholder: '2021' },
  ],
  employer: [
    { key: 'employerName', label: 'Previous employer' },
    { key: 'employerFrom', label: 'Joined', type: 'date' },
    { key: 'employerTo', label: 'Left', type: 'date' },
    { key: 'employerEmail', label: 'HR email there (optional)', type: 'email' },
  ],
};

export default function RunStepModal({ c, stepKey, sampleSeed, onClose }: { c: VerifyCase; stepKey: StepKey; sampleSeed: number; onClose: () => void }) {
  const id = useId();
  const meta = STEP_META[stepKey];
  const specs = FIELDS[stepKey];
  const [values, setValues] = useState<Partial<VerifyInputs>>(() => Object.fromEntries(specs.map((s) => [s.key, c.inputs[s.key]])));
  const [aadhaar, setAadhaar] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const r = runVerifyStep({ caseId: c.id, key: stepKey, inputs: values, aadhaar: stepKey === 'aadhaar' ? aadhaar : undefined, consent });
    if (!r.ok) { setError(r.error); return; }
    setAadhaar('');
    toast[r.value.status === 'verified' ? 'success' : 'message'](`${meta.label}: ${r.value.status.replace('_', ' ')}. ${SIMULATION_LABEL}`);
    onClose();
  };

  return (
    <Modal title={`${meta.label}: ${c.name}`} width={540} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="run-check" onClick={run}>Run check</Button></>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SimBadge>Simulation</SimBadge>
        <span data-testid="sim-label" style={{ fontSize: 13, color: T.warn }}>{SIMULATION_LABEL}</span>
      </div>
      <div data-testid="consent-line" style={{ fontSize: 13.5, lineHeight: 1.6, color: T.text, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px' }}>{consentLine(stepKey)}</div>

      {stepKey === 'aadhaar' && (
        <Field label="Aadhaar number" htmlFor={`${id}-a`} hint="Typed once for this check, then thrown away. Only the last four digits are kept.">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Input id={`${id}-a`} inputMode="numeric" autoComplete="off" maxLength={14} placeholder="12 digits" value={aadhaar} onChange={(e) => { setAadhaar(e.target.value.replace(/[^\d ]/g, '')); setError(null); }} style={{ flex: '1 1 200px', fontFamily: T.mono }} />
            <Button size="sm" onClick={() => setAadhaar(sampleAadhaar(sampleSeed).replace(/(\d{4})(?=\d)/g, '$1 '))}>Use a sample number</Button>
          </div>
        </Field>
      )}
      {specs.map((s) => (
        <Field key={s.key} label={s.label} htmlFor={`${id}-${s.key}`} hint={s.hint}>
          <Input id={`${id}-${s.key}`} type={s.type ?? 'text'} placeholder={s.placeholder} value={values[s.key] ?? ''} onChange={(e) => { setValues({ ...values, [s.key]: e.target.value }); setError(null); }} />
        </Field>
      ))}

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
        <input type="checkbox" aria-label="The person has agreed to this check" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(null); }} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--info)' }} />
        <span>{c.name} has agreed to this check, as described above.</span>
      </label>
      <ErrorLine>{error}</ErrorLine>
      <div style={muted}>A live version would call the registry through a vendor with a signed agreement. Here the answer is canned and repeatable: the same input gives the same result.</div>
    </Modal>
  );
}
