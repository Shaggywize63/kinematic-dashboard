'use client';
// My HR: the employee self-service preview. HR picks whose view to look at; everything below is that person's own data.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Avatar, Badge, Button, Card, CardTitle, DataTable, HrmsPage, KeyValue, Modal, Note, Stat, StatGrid, StatusBadge, T, type Col } from '../ui';
import { Select } from '../../ui';
import type { Employee, EmployeeDocument, HrmsDb, IssuedLetter, LetterType, PayRun, Payslip } from '../../../lib/hrms/types';
import { fmtDate, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { releasedPayslips, ytdFor } from './logic';
import { LinkButton } from './shared';
import MyTax from './MyTax';
import MyLeave, { type LeaveRequest } from './MyLeave';

const LETTER_LABEL: Record<LetterType, string> = { offer: 'Offer letter', appointment: 'Appointment letter', confirmation: 'Confirmation letter', increment: 'Increment letter', relieving: 'Relieving letter', experience: 'Experience letter', warning: 'Warning letter' };

export default function MyHrView({ db }: { db: HrmsDb }) {
  const people = db.employees.filter((e) => e.status !== 'onboarding');
  const firstActive = people.find((e) => e.status === 'active') ?? people[0];
  const [empId, setEmpId] = useState(firstActive?.id ?? '');
  const e = people.find((x) => x.id === empId) ?? firstActive;
  const [requests, setRequests] = useState<Record<string, LeaveRequest[]>>({});

  if (!e) {
    return <HrmsPage title="My HR"><Note>There is no employee in the sample data.</Note></HrmsPage>;
  }
  const mine = requests[e.id] ?? [];

  return (
    <HrmsPage
      eyebrow="Employee self-service preview"
      title="My HR"
      description="Payslips, tax declaration, leave, letters and documents, as the employee sees them"
      actions={
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.dim }}>
          Viewing as
          <Select aria-label="Employee" value={e.id} onChange={(ev) => setEmpId(ev.target.value)} style={{ width: 280 }}>
            {people.map((p) => <option key={p.id} value={p.id}>{fullName(p)} ({p.code}){p.status === 'active' ? '' : `, ${p.status.replace('_', ' ')}`}</option>)}
          </Select>
        </label>
      }
    >
      <Header db={db} e={e} />
      <Payslips db={db} e={e} />
      <MyTax key={e.id} db={db} e={e} />
      <MyLeave db={db} e={e} requests={mine} setRequests={(fn) => setRequests((all) => ({ ...all, [e.id]: fn(all[e.id] ?? []) }))} />
      <LettersAndDocs db={db} e={e} />
    </HrmsPage>
  );
}

function Header({ db, e }: { db: HrmsDb; e: Employee }) {
  const desig = db.designations.find((d) => d.id === e.designationId)?.name;
  const dept = db.departments.find((d) => d.id === e.departmentId)?.name;
  const entity = db.entities.find((x) => x.id === e.entityId)?.name;
  return (
    <Card>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Avatar name={fullName(e)} size={52} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text }} data-testid="my-name">{fullName(e)}</div>
          <div style={{ fontSize: 13.5, color: T.dim }}>{desig ?? '—'} · {dept ?? '—'} · {e.code}</div>
        </div>
        <StatusBadge status={e.status} />
      </div>
      <div style={{ marginTop: 16 }}>
        <KeyValue columns={4} rows={[
          { label: 'Legal entity', value: entity }, { label: 'Date of joining', value: fmtDate(e.joinDate) },
          { label: 'Tax regime', value: e.taxRegime === 'new' ? 'New regime' : 'Old regime' }, { label: 'Notice period', value: `${e.noticeDays} days` },
        ]} />
      </div>
    </Card>
  );
}

function Payslips({ db, e }: { db: HrmsDb; e: Employee }) {
  const slips = useMemo(() => releasedPayslips(db, e.id), [db, e.id]);
  const ytd = ytdFor(db, e.id);
  type Row = { id: string; run: PayRun; slip: Payslip };
  const rows: Row[] = slips.map((x) => ({ id: x.slip.id, ...x }));
  const cols: Col<Row>[] = [
    { key: 'month', label: 'Month', render: (r) => <b>{fmtMonth(r.slip.month)}</b>, sortValue: (r) => r.slip.month },
    { key: 'entity', label: 'Legal entity', render: (r) => db.entities.find((x) => x.id === r.run.entityId)?.name ?? '—' },
    { key: 'gross', label: 'Gross', align: 'right', render: (r) => inr(r.slip.gross), sortValue: (r) => r.slip.gross, nowrap: true },
    { key: 'ded', label: 'Deductions', align: 'right', render: (r) => inr(r.slip.totalDeductions), sortValue: (r) => r.slip.totalDeductions, nowrap: true },
    { key: 'net', label: 'Net pay', align: 'right', render: (r) => <b>{inr(r.slip.net)}</b>, sortValue: (r) => r.slip.net, nowrap: true },
    { key: 'status', label: 'Run', render: (r) => <StatusBadge status={r.run.status} /> },
    { key: 'open', label: '', align: 'right', render: (r) => <LinkButton href={`/dashboard/hrms/payslips/${r.slip.id}`} label={`Open the payslip for ${fmtMonth(r.slip.month)}`}>Open</LinkButton> },
  ];
  return (
    <>
      <StatGrid>
        <Stat label={`Gross, ${ytd.label} to date`} value={inr(ytd.gross)} hint={ytd.months ? `${ytd.months} payslip${ytd.months === 1 ? '' : 's'} on file` : 'No payslip on file yet'} />
        <Stat label="Tax deducted (TDS)" value={inr(ytd.tds)} hint="Income tax withheld so far" />
        <Stat label="Provident fund (employee)" value={inr(ytd.pf)} hint="Employee share, 12% of PF wage" />
        <Stat label="Net pay received" value={inr(ytd.net)} tone="ok" />
      </StatGrid>
      {ytd.months > 0 && ytd.from && ytd.to && (
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: -6 }} data-testid="ytd-note">
          Year-to-date covers {fmtMonth(ytd.from)} to {fmtMonth(ytd.to)}, the months present in the sample data. Earlier months of {ytd.label} were not loaded, so these totals are lower than a real year-to-date.
        </div>
      )}
      <Card>
        <CardTitle>Payslips</CardTitle>
        <DataTable columns={cols} rows={rows} minWidth={760} empty="No payslip has been released for this employee yet. Payslips appear once a pay run that includes them is frozen." />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>Only payslips from frozen or paid runs are shown. A run that is only computed is still a draft.</div>
      </Card>
    </>
  );
}

function LettersAndDocs({ db, e }: { db: HrmsDb; e: Employee }) {
  const [viewing, setViewing] = useState<IssuedLetter | null>(null);
  const letters = db.letters.filter((l) => l.employeeId === e.id);
  const mandatory = e.documents.filter((d) => d.mandatory);
  const done = mandatory.filter((d) => d.status === 'verified' || d.status === 'uploaded').length;
  const letterCols: Col<IssuedLetter>[] = [
    { key: 'type', label: 'Letter', render: (l) => <b>{LETTER_LABEL[l.type] ?? l.type}</b> },
    { key: 'on', label: 'Issued on', render: (l) => fmtDate(l.issuedOn), sortValue: (l) => l.issuedOn, nowrap: true },
    { key: 'signed', label: 'Signed', render: (l) => (l.signed ? <Badge tone="ok" dot>Signed</Badge> : <Badge tone="neutral" dot>Not signed</Badge>) },
    { key: 'view', label: '', align: 'right', render: (l) => <Button size="sm" aria-label={`Read the ${LETTER_LABEL[l.type] ?? l.type}`} onClick={() => setViewing(l)}>Read</Button> },
  ];
  const docCols: Col<EmployeeDocument>[] = [
    { key: 'name', label: 'Document', render: (d) => <span>{d.name}{d.mandatory && <span style={{ color: T.mute }}> · required</span>}</span> },
    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    { key: 'on', label: 'Uploaded', render: (d) => (d.status === 'pending' ? '—' : fmtDate(d.uploadedOn)), nowrap: true },
    { key: 'file', label: 'File', render: (d) => <span style={{ color: T.dim }}>{d.fileName ?? '—'}</span> },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 18, alignItems: 'start' }}>
      <Card>
        <CardTitle>Letters issued</CardTitle>
        <DataTable columns={letterCols} rows={letters} minWidth={420}
          empty={<>No letter has been issued to {fullName(e)} yet. HR issues letters from <Link href="/dashboard/hrms/lifecycle" style={{ color: T.info }}>Lifecycle</Link>.</>} />
      </Card>
      <Card>
        <CardTitle right={<Badge tone={done === mandatory.length ? 'ok' : 'warn'} dot>{done} of {mandatory.length} required in</Badge>}>Documents</CardTitle>
        <DataTable columns={docCols} rows={e.documents} minWidth={480} empty="No document is listed for this employee." />
      </Card>
      {viewing && (
        <Modal title={LETTER_LABEL[viewing.type] ?? 'Letter'} onClose={() => setViewing(null)} width={620} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: T.text }}>{viewing.body}</div>
        </Modal>
      )}
    </div>
  );
}
