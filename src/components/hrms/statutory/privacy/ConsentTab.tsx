'use client';
// Consent ledger: who agreed to what, under which notice, and whether they have withdrawn. Withdrawing keeps the row.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ConsentRecord, Employee, HrmsDb } from '../../../../lib/hrms/types';
import { fmtDate, fmtDateTime, fullName } from '../../../../lib/hrms/format';
import { addConsent, withdrawConsent } from '../../../../lib/hrms/statutoryActions';
import { whenSynced } from '../../../../lib/hrms/live/store';
import { Field, Input, Select } from '../../../ui';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Modal, SearchBox, Stat, StatGrid, Toolbar, type Col } from '../../ui';
import { ConfirmModal, Muted, Stack } from '../parts';

export default function ConsentTab({ db }: { db: HrmsDb }) {
  const [purpose, setPurpose] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<ConsentRecord | null>(null);
  const [recording, setRecording] = useState(false);

  const emp = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const purposes = useMemo(() => [...new Set(db.consents.map((c) => c.purpose))].sort(), [db.consents]);
  const rows = db.consents
    .filter((c) => (purpose === 'all' || c.purpose === purpose) && (status === 'all' || (status === 'withdrawn') === !!c.withdrawnAt)
      && (!q.trim() || `${emp(c.employeeId) ? fullName(emp(c.employeeId)!) : ''} ${c.purpose}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));

  const cols: Col<ConsentRecord>[] = [
    { key: 'emp', label: 'Employee', sortValue: (c) => (emp(c.employeeId) ? fullName(emp(c.employeeId)!) : ''), render: (c) => (emp(c.employeeId) ? <EmployeeCell e={emp(c.employeeId)!} /> : '—') },
    { key: 'purpose', label: 'Purpose', sortValue: (c) => c.purpose, render: (c) => c.purpose },
    { key: 'notice', label: 'Notice version', sortValue: (c) => c.noticeVersion, render: (c) => c.noticeVersion },
    { key: 'granted', label: 'Granted', sortValue: (c) => c.grantedAt, render: (c) => fmtDate(c.grantedAt.slice(0, 10)), nowrap: true },
    { key: 'status', label: 'Status', sortValue: (c) => (c.withdrawnAt ? 1 : 0), render: (c) => (c.withdrawnAt ? <Badge tone="neutral" dot>Withdrawn {fmtDate(c.withdrawnAt.slice(0, 10))}</Badge> : <Badge tone="ok" dot>Active</Badge>) },
    {
      key: 'act', label: '', align: 'right', render: (c) => (c.withdrawnAt ? null : (
        <Button size="sm" variant="danger" aria-label={`Withdraw consent: ${emp(c.employeeId) ? fullName(emp(c.employeeId)!) : ''}, ${c.purpose}`} style={{ minHeight: 40 }} onClick={() => setTarget(c)}>Withdraw</Button>
      )),
    },
  ];

  return (
    <Stack>
      <StatGrid min={200}>
        {purposes.map((p) => {
          const all = db.consents.filter((c) => c.purpose === p);
          const live = all.filter((c) => !c.withdrawnAt).length;
          return <Stat key={p} label={p} value={live} tone="ok" hint={`${all.length - live} withdrawn of ${all.length}`} />;
        })}
        {purposes.length === 0 && <Stat label="Consents" value={0} hint="Nothing on the ledger yet" />}
      </StatGrid>

      <Card padding={16}>
        <CardTitle right={<Button size="sm" variant="primary" data-testid="record-consent" style={{ minHeight: 36 }} onClick={() => setRecording(true)}>Record consent</Button>}>Consent ledger</CardTitle>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search employee or purpose" />
          <Select aria-label="Filter by purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: 240 }}>
            <option value="all">All purposes</option>
            {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 170 }}>
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
          <Muted>{rows.length} of {db.consents.length} records</Muted>
        </Toolbar>
        <div style={{ marginTop: 12 }}>
          <DataTable columns={cols} rows={rows} minWidth={820} empty="No consent records match these filters." />
        </div>
        <Muted style={{ marginTop: 10 }}>A withdrawn consent stays on the ledger with its date, because the ledger is the evidence of what was agreed and when it stopped.</Muted>
      </Card>

      {target && (
        <ConfirmModal title="Withdraw this consent?" confirmLabel="Withdraw consent" danger onClose={() => setTarget(null)}
          onConfirm={() => { withdrawConsent(target.id); setTarget(null); }}>
          <p style={{ margin: '0 0 8px' }}>
            <b>{emp(target.employeeId) ? fullName(emp(target.employeeId)!) : 'This employee'}</b> will no longer have consented to “{target.purpose}” (given {fmtDateTime(target.grantedAt)}, notice {target.noticeVersion}).
          </p>
          <p style={{ margin: 0 }}>The row stays on the ledger with today’s date as the withdrawal. The preview does not stop collecting the data: that needs the matching feature switched off in the real build.</p>
        </ConfirmModal>
      )}

      {recording && <RecordConsentModal db={db} purposes={purposes} onClose={() => setRecording(false)} />}
    </Stack>
  );
}

function RecordConsentModal({ db, purposes, onClose }: { db: HrmsDb; purposes: string[]; onClose: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [noticeVersion, setNoticeVersion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const emps = [...db.employees].sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const empError = !employeeId ? 'Choose the employee who gave consent.' : '';
  const purposeError = !purpose.trim() ? 'Enter what they consented to.' : '';
  const noticeError = !noticeVersion.trim() ? 'Enter the notice version they saw.' : '';
  const error = empError || purposeError || noticeError;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (error) return;
    addConsent({ employeeId, purpose: purpose.trim(), noticeVersion: noticeVersion.trim() });
    whenSynced((ok) => { if (ok) toast.success('Consent recorded on the ledger'); });
    onClose();
  };

  return (
    <Modal title="Record a consent" onClose={onClose} width={500}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="consent-form" style={{ minHeight: 40 }}>Record consent</Button>
        </>
      )}>
      <form id="consent-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Employee" required htmlFor="consent-emp" error={submitted ? empError : ''}>
          <Select id="consent-emp" aria-label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} invalid={submitted && !!empError}>
            <option value="">Choose an employee</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
          </Select>
        </Field>
        <Field label="Purpose" required htmlFor="consent-purpose" hint="What they agreed to, e.g. location during duty hours." error={submitted ? purposeError : ''}>
          <Input id="consent-purpose" list="consent-purposes" value={purpose} onChange={(e) => setPurpose(e.target.value)} invalid={submitted && !!purposeError} autoFocus />
          <datalist id="consent-purposes">{purposes.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Notice version" required htmlFor="consent-notice" hint="The privacy notice they saw, e.g. v2 (Apr 2026)." error={submitted ? noticeError : ''}>
          <Input id="consent-notice" value={noticeVersion} onChange={(e) => setNoticeVersion(e.target.value)} invalid={submitted && !!noticeError} />
        </Field>
      </form>
    </Modal>
  );
}
