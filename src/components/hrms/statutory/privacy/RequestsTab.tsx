'use client';
// Data-subject requests: access, correction and erasure, each on a 30-day clock with a short status workflow.
// The requests live in the page's component state (not in the shared database), so a reload starts from the samples.

import { useMemo, useState } from 'react';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { addDays, diffDays, fmtDate, fullName } from '../../../../lib/hrms/format';
import { uid } from '../../../../lib/hrms/types';
import { Field, Input, Select, Textarea } from '../../../ui';
import { Badge, Button, Card, CardTitle, EmployeeCell, Modal, Note, Stat, StatGrid, Toolbar, type Tone } from '../../ui';
import { Muted, Stack } from '../parts';
import { DSR_DAYS, DSR_LABEL, DSR_STATUS_LABEL, dsrDaysLeft, dsrDue, dsrOpen, type Dsr, type DsrStatus, type DsrType } from './model';

const STATUS_TONE: Record<DsrStatus, Tone> = { received: 'info', in_review: 'warn', done: 'ok', rejected: 'neutral' };

export default function RequestsTab({ db, requests, setRequests }: { db: HrmsDb; requests: Dsr[]; setRequests: (f: (r: Dsr[]) => Dsr[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<{ req: Dsr; to: 'done' | 'rejected' } | null>(null);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  const emp = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const open = requests.filter(dsrOpen);
  const overdue = open.filter((r) => dsrDaysLeft(r) < 0);
  const rows = useMemo(
    () => requests.filter((r) => (type === 'all' || r.type === type) && (status === 'all' || (status === 'open' ? dsrOpen(r) : r.status === status)))
      .sort((a, b) => Number(dsrOpen(b)) - Number(dsrOpen(a)) || dsrDue(a).localeCompare(dsrDue(b))),
    [requests, type, status],
  );
  const move = (id: string, patch: Partial<Dsr>) => setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const clockOf = (r: Dsr) => {
    if (!dsrOpen(r)) {
      const took = r.closedOn ? diffDays(r.receivedOn, r.closedOn) : null;
      return <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>Closed {fmtDate(r.closedOn)}{took != null ? `, after ${took} ${took === 1 ? 'day' : 'days'}` : ''}</span>;
    }
    const left = dsrDaysLeft(r);
    return (
      <span data-testid={`clock-${r.id}`}>
        <span style={{ fontSize: 13, fontWeight: 600, color: left < 0 ? 'var(--red)' : left <= 7 ? 'var(--warn)' : 'var(--text)' }}>
          {left < 0 ? `Overdue by ${-left} ${left === -1 ? 'day' : 'days'}` : left === 0 ? 'Due today' : `${left} ${left === 1 ? 'day' : 'days'} left`}
        </span>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}> · due {fmtDate(dsrDue(r))}</span>
      </span>
    );
  };

  const actionsOf = (r: Dsr) => {
    const who = emp(r.employeeId) ? fullName(emp(r.employeeId)!) : '';
    if (r.status === 'received') return <Button size="sm" aria-label={`Start review: ${DSR_LABEL[r.type]} request from ${who}`} style={{ minHeight: 40 }} onClick={() => move(r.id, { status: 'in_review' })}>Start review</Button>;
    if (r.status === 'in_review') {
      return (
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Button size="sm" variant="primary" aria-label={`Mark done: ${DSR_LABEL[r.type]} request from ${who}`} style={{ minHeight: 40 }} onClick={() => setClosing({ req: r, to: 'done' })}>Mark done</Button>
          <Button size="sm" variant="danger" aria-label={`Reject: ${DSR_LABEL[r.type]} request from ${who}`} style={{ minHeight: 40 }} onClick={() => setClosing({ req: r, to: 'rejected' })}>Reject</Button>
        </span>
      );
    }
    return null;
  };

  return (
    <Stack>
      <StatGrid min={150}>
        <Stat label="Open" value={open.length} hint="Received or in review" />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'red' : undefined} hint={`Past ${DSR_DAYS} days`} />
        <Stat label="Done" value={requests.filter((r) => r.status === 'done').length} tone="ok" />
        <Stat label="Rejected" value={requests.filter((r) => r.status === 'rejected').length} />
      </StatGrid>

      <Note>
        Requests here are kept in this browser tab only and are lost on reload. The {DSR_DAYS}-day clock is the preview’s target for a reply: the period the law sets, and which requests it covers, is to be confirmed with counsel.
      </Note>

      <Card padding={16}>
        <CardTitle right={<Button variant="primary" onClick={() => setAdding(true)} style={{ minHeight: 40 }}>New request</Button>}>Data requests</CardTitle>
        <Toolbar>
          <Select aria-label="Filter by request type" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}>
            <option value="all">All types</option>
            {(Object.keys(DSR_LABEL) as DsrType[]).map((t) => <option key={t} value={t}>{DSR_LABEL[t]}</option>)}
          </Select>
          <Select aria-label="Filter by request status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 170 }}>
            <option value="all">Any status</option>
            <option value="open">Open</option>
            {(Object.keys(DSR_STATUS_LABEL) as DsrStatus[]).map((s) => <option key={s} value={s}>{DSR_STATUS_LABEL[s]}</option>)}
          </Select>
          <Muted>{rows.length} of {requests.length} requests</Muted>
        </Toolbar>
        {rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--mute)', fontSize: 13.5 }}>No requests match these filters. Use “New request” to log one.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <li key={r.id} data-testid={`request-${r.id}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {emp(r.employeeId) ? <EmployeeCell e={emp(r.employeeId)!} /> : '—'}
                    <Badge tone="neutral">{DSR_LABEL[r.type]}</Badge>
                    <Badge tone={STATUS_TONE[r.status]} dot>{DSR_STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>Received {fmtDate(r.receivedOn)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--dim)', lineHeight: 1.5 }}>
                  {r.details}
                  {r.note && <div style={{ marginTop: 4, color: 'var(--mute)' }}>Outcome: {r.note}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div>{clockOf(r)}</div>
                  <div>{actionsOf(r)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding && <NewRequest db={db} onClose={() => setAdding(false)} onAdd={(r) => { setRequests((rs) => [r, ...rs]); setAdding(false); }} />}
      {closing && (
        <CloseRequest req={closing.req} to={closing.to} who={emp(closing.req.employeeId) ? fullName(emp(closing.req.employeeId)!) : ''} onClose={() => setClosing(null)}
          onSave={(note) => { move(closing.req.id, { status: closing.to, closedOn: PREVIEW_TODAY, note }); setClosing(null); }} />
      )}
    </Stack>
  );
}

function NewRequest({ db, onClose, onAdd }: { db: HrmsDb; onClose: () => void; onAdd: (r: Dsr) => void }) {
  const people = db.employees.filter((e) => e.status !== 'onboarding').sort((a, b) => a.code.localeCompare(b.code));
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? '');
  const [type, setType] = useState<DsrType>('access');
  const [receivedOn, setReceivedOn] = useState(PREVIEW_TODAY);
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    employee: employeeId ? '' : 'Choose the employee.',
    date: !receivedOn ? 'Enter the date it was received.' : receivedOn > PREVIEW_TODAY ? 'A request cannot be received after today.' : '',
    details: details.trim().length < 10 ? 'Describe the request in at least 10 characters.' : details.length > 500 ? 'Keep it under 500 characters.' : '',
  };
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (errors.employee || errors.date || errors.details) return;
    onAdd({ id: uid('dsr'), type, employeeId, details: details.trim(), receivedOn, status: 'received' });
  };

  return (
    <Modal title="New data request" onClose={onClose} width={520}
      footer={(<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="dsr-form" style={{ minHeight: 40 }}>Log request</Button></>)}>
      <form id="dsr-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Employee" required htmlFor="dsr-emp" error={submitted ? errors.employee : ''}>
          <Select id="dsr-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {people.map((e) => <option key={e.id} value={e.id}>{e.code} · {fullName(e)}</option>)}
          </Select>
        </Field>
        <Field label="Type of request" htmlFor="dsr-type">
          <Select id="dsr-type" value={type} onChange={(e) => setType(e.target.value as DsrType)}>
            <option value="access">Access: a copy of the data held</option>
            <option value="correction">Correction: fix wrong data</option>
            <option value="erasure">Erasure: delete the data</option>
          </Select>
        </Field>
        <Field label="Received on" required htmlFor="dsr-date" error={submitted ? errors.date : ''} hint={receivedOn ? `The ${DSR_DAYS}-day clock ends on ${fmtDate(addDays(receivedOn, DSR_DAYS))}.` : undefined}>
          <Input id="dsr-date" type="date" value={receivedOn} max={PREVIEW_TODAY} onChange={(e) => setReceivedOn(e.target.value)} invalid={submitted && !!errors.date} aria-invalid={submitted && !!errors.date} />
        </Field>
        <Field label="Details" required htmlFor="dsr-details" error={submitted ? errors.details : ''}>
          <Textarea id="dsr-details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What did the employee ask for?" invalid={submitted && !!errors.details} aria-invalid={submitted && !!errors.details} />
        </Field>
        {type === 'erasure' && <Note tone="warn">Erasure can be limited where a law requires a record to be kept, for example payroll and tax records. Confirm with counsel before anything is deleted.</Note>}
      </form>
    </Modal>
  );
}

function CloseRequest({ req, to, who, onClose, onSave }: { req: Dsr; to: 'done' | 'rejected'; who: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const error = note.trim().length < 5 ? (to === 'done' ? 'Say in a few words what was done.' : 'Give the reason for rejecting it.') : '';
  const submit = (ev: React.FormEvent) => { ev.preventDefault(); setSubmitted(true); if (!error) onSave(note.trim()); };
  return (
    <Modal title={to === 'done' ? 'Mark request as done' : 'Reject request'} onClose={onClose} width={500}
      footer={(<><Button onClick={onClose}>Cancel</Button><Button variant={to === 'done' ? 'primary' : 'danger'} type="submit" form="dsr-close" style={{ minHeight: 40 }}>{to === 'done' ? 'Mark done' : 'Reject request'}</Button></>)}>
      <form id="dsr-close" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13.5, color: 'var(--dim)' }}>{DSR_LABEL[req.type]} request from <b style={{ color: 'var(--text)' }}>{who}</b>, received {fmtDate(req.receivedOn)}.</div>
        <Field label={to === 'done' ? 'What was done' : 'Reason'} required htmlFor="dsr-note" error={submitted ? error : ''}>
          <Textarea id="dsr-note" value={note} onChange={(e) => setNote(e.target.value)} invalid={submitted && !!error} aria-invalid={submitted && !!error} autoFocus />
        </Field>
        {req.type === 'erasure' && to === 'done' && <Note tone="warn">The preview erases nothing. Mark this done only once the data has really been erased or anonymised.</Note>}
      </form>
    </Modal>
  );
}
