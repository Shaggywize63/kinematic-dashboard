'use client';
// My HR: leave balances and an Apply leave form. There is no leave-request collection yet, so requests live in page state.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Modal, Note, T, useIsCompact, type Col } from '../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../ui';
import type { Employee, HrmsDb, LeaveType } from '../../../lib/hrms/types';
import { addDays, fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { leaveBalanceDays, leaveDays } from './logic';
import { report } from './shared';

export interface LeaveRequest { id: string; typeId: string; from: string; to: string; days: number; half: boolean; reason: string }

export default function MyLeave({ db, e, requests, setRequests }: {
  db: HrmsDb; e: Employee; requests: LeaveRequest[]; setRequests: (fn: (r: LeaveRequest[]) => LeaveRequest[]) => void;
}) {
  const [applying, setApplying] = useState(false);
  const balances = db.leaveBalances.filter((b) => b.employeeId === e.id);
  const typeOf = (id: string) => db.leaveTypes.find((t) => t.id === id);
  const pendingFor = (typeId: string) => requests.filter((r) => r.typeId === typeId).reduce((s, r) => s + r.days, 0);

  const rows = balances.map((b) => {
    const t = typeOf(b.leaveTypeId);
    const bal = leaveBalanceDays(b);
    return { id: b.leaveTypeId, name: t?.name ?? b.leaveTypeId, code: t?.code ?? '', opening: b.opening, accrued: b.accrued, taken: b.taken, pending: pendingFor(b.leaveTypeId), balance: bal, available: bal - pendingFor(b.leaveTypeId) };
  });
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'name', label: 'Leave type', render: (r) => <span><b>{r.name}</b> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 12 }}>{r.code}</span></span> },
    { key: 'opening', label: 'Opening', align: 'right', render: (r) => r.opening },
    { key: 'accrued', label: 'Accrued', align: 'right', render: (r) => r.accrued },
    { key: 'taken', label: 'Taken', align: 'right', render: (r) => r.taken },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => <b>{r.balance}</b> },
    { key: 'pending', label: 'Pending requests', align: 'right', render: (r) => (r.pending ? <Badge tone="info">{r.pending}</Badge> : '—') },
    { key: 'available', label: 'Available', align: 'right', render: (r) => <b style={{ color: r.available < 0 ? T.red : T.text }}>{r.available}</b> },
  ];
  const reqRows = requests.map((r) => ({ ...r, type: typeOf(r.typeId) }));
  const reqCols: Col<(typeof reqRows)[number]>[] = [
    { key: 'type', label: 'Type', render: (r) => r.type?.name ?? '—' },
    { key: 'dates', label: 'Dates', render: (r) => (r.from === r.to ? fmtDate(r.from) + (r.half ? ' (half day)' : '') : `${fmtDate(r.from)} to ${fmtDate(r.to)}`), nowrap: true },
    { key: 'days', label: 'Days', align: 'right', render: (r) => r.days },
    { key: 'reason', label: 'Reason', render: (r) => <span style={{ color: T.dim }}>{r.reason}</span> },
    { key: 'status', label: 'Status', render: () => <Badge tone="info" dot>Pending, preview only</Badge>, nowrap: true },
    { key: 'cancel', label: '', align: 'right', render: (r) => <Button size="sm" variant="danger" aria-label={`Cancel the ${r.type?.name ?? ''} request`} onClick={() => setRequests((list) => list.filter((x) => x.id !== r.id))}>Cancel</Button> },
  ];

  return (
    <Card>
      <CardTitle right={<Button variant="primary" style={{ height: 40 }} onClick={() => setApplying(true)}>Apply leave</Button>}>Leave</CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DataTable columns={cols} rows={rows} minWidth={640} empty="No leave balance is set up for this employee." />
        {reqRows.length > 0 && (
          <div data-testid="leave-requests">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: T.heading }}>Your requests in this session</div>
            <DataTable columns={reqCols} rows={reqRows} minWidth={640} />
          </div>
        )}
        <Note>There is no leave-request store in this preview yet, so requests are kept in this page&apos;s memory: they disappear when you reload, and they do not reach attendance, approvals or payroll.</Note>
      </div>
      {applying && <ApplyLeave db={db} e={e} requests={requests} onClose={() => setApplying(false)} onSubmit={(r) => { setRequests((list) => [...list, r]); report({ ok: true }, 'Leave request added (preview only)'); }} />}
    </Card>
  );
}

function ApplyLeave({ db, e, requests, onClose, onSubmit }: { db: HrmsDb; e: Employee; requests: LeaveRequest[]; onClose: () => void; onSubmit: (r: LeaveRequest) => void }) {
  const narrow = useIsCompact(700);
  const inProbation = addDays(e.joinDate, e.probationMonths * 30) > PREVIEW_TODAY;
  const hasBalance = new Set(db.leaveBalances.filter((b) => b.employeeId === e.id).map((b) => b.leaveTypeId));
  const types = db.leaveTypes.filter((t) => (hasBalance.has(t.id) || !t.paid) && (t.audience === 'all' || t.audience === e.gender) && (t.probationEligible || !inProbation));
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [from, setFrom] = useState(PREVIEW_TODAY);
  const [to, setTo] = useState(PREVIEW_TODAY);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const type: LeaveType | undefined = db.leaveTypes.find((t) => t.id === typeId);
  const days = type && from && to ? leaveDays(db, e, type, from, to, half) : 0;
  const bal = db.leaveBalances.find((b) => b.employeeId === e.id && b.leaveTypeId === typeId);
  const available = bal ? leaveBalanceDays(bal) - requests.filter((r) => r.typeId === typeId).reduce((s, r) => s + r.days, 0) : null;

  const errors: Record<string, string> = {};
  if (!type) errors.typeId = 'Choose a leave type';
  if (!from) errors.from = 'Choose the first day';
  if (!to) errors.to = 'Choose the last day';
  else if (from && to < from) errors.to = 'The last day is before the first day';
  else if (from && to > addDays(from, 90)) errors.to = 'A single request can span at most 90 days';
  if (from && from < addDays(PREVIEW_TODAY, -60)) errors.from = 'Leave can be applied up to 60 days back';
  if (!errors.from && !errors.to && type && days <= 0) errors.to = 'These dates fall on weekly offs or holidays, so no leave is needed';
  if (!errors.to && type?.maxConsecutiveDays && days > type.maxConsecutiveDays) errors.to = `${type.name} can be taken for at most ${type.maxConsecutiveDays} days at a time`;
  if (!errors.to && type && type.paid && available != null && days > available) errors.to = `You have ${available} day${available === 1 ? '' : 's'} of ${type.name} available`;
  if (!errors.to && requests.some((r) => from <= r.to && to >= r.from)) errors.to = 'These dates overlap a request you already made';
  if (reason.trim().length < 3) errors.reason = 'Give a short reason';
  else if (reason.length > 200) errors.reason = 'Keep the reason under 200 characters';
  const show = (k: string) => (touched ? errors[k] : undefined);

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length || !type) return;
    onSubmit({ id: `lr_${Date.now().toString(36)}`, typeId, from, to, days, half: half && from === to, reason: reason.trim() });
    onClose();
  };

  return (
    <Modal title="Apply leave" onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>Submit request</Button></>}>
      <form onSubmit={(ev) => { ev.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Leave type" required htmlFor="lv-type" error={show('typeId')} hint={available != null ? `${available} day${available === 1 ? '' : 's'} available` : type && !type.paid ? 'Unpaid: reduces pay for the days taken' : undefined}>
            <Select id="lv-type" value={typeId} invalid={!!show('typeId')} onChange={(ev) => setTypeId(ev.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <div />
          <Field label="From" required htmlFor="lv-from" error={show('from')}>
            <Input id="lv-from" type="date" value={from} invalid={!!show('from')} onChange={(ev) => { setFrom(ev.target.value); if (!to || to < ev.target.value) setTo(ev.target.value); }} />
          </Field>
          <Field label="To" required htmlFor="lv-to" error={show('to')}>
            <Input id="lv-to" type="date" value={to} invalid={!!show('to')} onChange={(ev) => setTo(ev.target.value)} />
          </Field>
        </FormGrid>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 14, color: from === to ? T.text : T.mute }}>
          <input type="checkbox" checked={half && from === to} disabled={from !== to} onChange={(ev) => setHalf(ev.target.checked)} style={{ width: 18, height: 18 }} /> Half day <span style={{ fontSize: 12.5 }}>(single day only)</span>
        </label>
        <div style={{ fontSize: 14, color: T.dim }} data-testid="leave-days">This request uses <b style={{ color: T.text }}>{days}</b> day{days === 1 ? '' : 's'}{type && !type.includeWeeklyOffs ? ', not counting Sundays and fixed holidays' : ''}.</div>
        {type?.documentAfterDays != null && days > type.documentAfterDays && <Note tone="warn">{type.name} of more than {type.documentAfterDays} day{type.documentAfterDays === 1 ? '' : 's'} needs a supporting document.</Note>}
        <Field label="Reason" required htmlFor="lv-reason" error={show('reason')}>
          <Textarea id="lv-reason" value={reason} invalid={!!show('reason')} onChange={(ev) => setReason(ev.target.value)} placeholder="For example, family function" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
