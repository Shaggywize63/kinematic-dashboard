'use client';
// Dialogs of the monitoring ledger: switching a practice on (purpose, retention and a named reviewer are required) and
// writing down why a longer retention is kept.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input, Select, Textarea } from '../../ui';
import { Button, Modal, Note, T } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { consentCoverage, policyWindow, retentionText, validateTurnOn } from '../../../lib/hrms/control/monitoring';
import { keepWithReason, turnOnMonitoring } from '../../../lib/hrms/control/store';
import type { MonitoringRow } from '../../../lib/hrms/control/types';
import { fullName } from '../../../lib/hrms/format';
import { Muted } from './parts';

export function TurnOnModal({ db, row, onClose }: { db: HrmsDb; row: MonitoringRow; onClose: () => void }) {
  const [purpose, setPurpose] = useState(row.status === 'considering' ? row.purpose : '');
  const [days, setDays] = useState<string>(row.retentionDays > 0 ? String(row.retentionDays) : '');
  const [reviewer, setReviewer] = useState('');
  const [touched, setTouched] = useState(false);
  const people = useMemo(() => db.employees.filter((e) => e.status === 'active').map(fullName).sort((a, b) => a.localeCompare(b)), [db.employees]);
  const input = { purpose, retentionDays: days.trim() === '' ? NaN : Number(days), reviewer };
  const errors = validateTurnOn(input);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const cov = consentCoverage(db, row);
  const w = policyWindow(db, row);
  const over = Number.isFinite(input.retentionDays) && input.retentionDays > w.days;
  return (
    <Modal title={`Turn on: ${row.name}`} onClose={onClose} width={560}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" data-testid="turnon-confirm" onClick={() => {
            setTouched(true);
            if (Object.keys(errors).length) return;
            turnOnMonitoring(row.id, input);
            toast.success(`${row.name} is on. Written to the change log.`);
            onClose();
          }}>Turn on</Button>
        </>
      )}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>Before this starts, say why it is needed, how long the data is kept, and who reviews it. Employees will see it in the notice.</div>
      {cov.applicable && cov.missing.length > 0 && (
        <Note tone="warn">Consent is the basis, and {cov.missing.length} of {cov.covered} covered {cov.covered === 1 ? 'person has' : 'people have'} no current consent. See the Consent tab before you turn this on.</Note>
      )}
      <Field label="Purpose" required htmlFor="on-purpose" error={show('purpose')} hint="One plain sentence an employee would understand.">
        <Textarea id="on-purpose" value={purpose} maxLength={240} invalid={!!show('purpose')} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <Field label="Keep the data for (days)" required htmlFor="on-days" error={show('retentionDays')} hint={`Policy window: ${retentionText(w.days)} (${w.source}).`}>
        <Input id="on-days" type="number" inputMode="numeric" min="1" max="3650" value={days} invalid={!!show('retentionDays')} onChange={(e) => setDays(e.target.value)} />
      </Field>
      {over && <Muted style={{ color: T.warn }}>That is longer than the policy window. It will show up in the retention check until you write down a reason.</Muted>}
      <Field label="Named reviewer" required htmlFor="on-reviewer" error={show('reviewer')} hint="The person who checks, each quarter, that this is still needed.">
        <Select id="on-reviewer" value={reviewer} invalid={!!show('reviewer')} onChange={(e) => setReviewer(e.target.value)}>
          <option value="">Choose a person</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}

export function KeepReasonModal({ row, windowDays, onClose }: { row: MonitoringRow; windowDays: number; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const err = reason.trim().length < 15 ? 'Write a full sentence (at least 15 characters).' : '';
  return (
    <Modal title="Why keep it longer?" onClose={onClose} width={500}
      footer={(<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="keep-confirm" onClick={() => { setTouched(true); if (!err) { keepWithReason(row.id, reason); toast.success('Reason recorded.'); onClose(); } }}>Save reason</Button></>)}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>
        <b>{row.name}</b> is kept for {retentionText(row.retentionDays)}, longer than the {retentionText(windowDays)} window. Write down why. The reason shows on the ledger and is reviewed with it.
      </div>
      <Field label="Reason" required htmlFor="keep-reason" error={touched ? err : undefined}>
        <Textarea id="keep-reason" value={reason} maxLength={240} invalid={touched && !!err} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}
