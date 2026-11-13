'use client';
// Enrolment: the window, progress by department, who has not enrolled, and the form (opened on an employee's behalf).

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Modal, Note, ProgressBar, SearchBox, T, Toolbar, type Col } from '../../ui';
import { Field, Input, Select } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import { basicMonthlyOf, enrolmentEligibility, enrolmentProgress, planOf, quoteEnrolment, tierOf, windowStatus } from '../../../../lib/hrms/rewards/engines';
import { extendWindow, logReminders } from '../../../../lib/hrms/rewards/store';
import type { RewardsState } from '../../../../lib/hrms/rewards/types';
import { Muted, SimulationNote, report } from '../common';
import EnrolForm from './EnrolForm';

type StatusFilter = '' | 'enrolled' | 'waived' | 'pending';
interface Row { id: string; e: Employee; dept: string; status: 'enrolled' | 'waived' | 'pending'; tier?: string; employeeMonthly: number; reminded?: string }

function ExtendModal({ closesOn, onClose }: { closesOn: string; onClose: () => void }) {
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    const r = await extendWindow(Number(days), reason);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    report(r, 'The enrolment window was extended.');
    onClose();
  }
  return (
    <Modal title="Extend the enrolment window" onClose={onClose} width={460}
      footer={<><Button style={{ height: 40 }} onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} disabled={busy} onClick={go}>Extend window</Button></>}>
      <div style={{ fontSize: 14 }}>It closes on <b>{fmtDate(closesOn)}</b> now.</div>
      <Field label="Extend by" htmlFor="ext-days">
        <Select id="ext-days" value={days} onChange={(e) => setDays(e.target.value)}>
          {[3, 7, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
        </Select>
      </Field>
      <Field label="Reason" required htmlFor="ext-reason" error={err} hint="Kept in the activity log.">
        <Input id="ext-reason" value={reason} invalid={!!err} onChange={(e) => { setReason(e.target.value); setErr(''); }} placeholder="For example, many people were on Diwali leave" />
      </Field>
    </Modal>
  );
}

export default function EnrolmentTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const health = planOf(st.benefits.plans, 'health')!;
  const win = windowStatus(st.benefits.window, PREVIEW_TODAY);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('');
  const [form, setForm] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);

  const progress = useMemo(() => enrolmentProgress(db, st.benefits.enrolments, health.coverStart), [db, st.benefits.enrolments, health.coverStart]);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const e of db.employees) {
      if (!enrolmentEligibility(e, health.coverStart).eligible) continue;
      const en = st.benefits.enrolments.find((x) => x.employeeId === e.id);
      const q2 = en?.status === 'enrolled' ? quoteEnrolment(st.benefits.plans, en, basicMonthlyOf(db, e, PREVIEW_TODAY)) : null;
      out.push({
        id: e.id, e, dept: db.departments.find((d) => d.id === e.departmentId)?.name ?? '—', status: en?.status ?? 'pending',
        tier: en?.status === 'enrolled' ? tierOf(health, en.healthTier)?.label : undefined,
        employeeMonthly: q2 ? q2.byPlan.health.employee + q2.byPlan.meal.employee + q2.byPlan.nps.employee : 0, reminded: st.benefits.reminders[e.id],
      });
    }
    return out.sort((a, b) => a.e.code.localeCompare(b.e.code));
  }, [db, st.benefits, health]);
  const shown = rows.filter((r) => (!filter || r.status === filter) && (!q.trim() || `${fullName(r.e)} ${r.e.code}`.toLowerCase().includes(q.trim().toLowerCase())));
  const notEligible = db.employees.filter((e) => e.status !== 'exited' && !enrolmentEligibility(e, health.coverStart).eligible);

  const cols: Col<Row>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => fullName(r.e).toLowerCase(), render: (r) => <EmployeeCell e={r.e} href={false} /> },
    { key: 'dept', label: 'Department', sortValue: (r) => r.dept, render: (r) => r.dept },
    {
      key: 'status', label: 'Enrolment', nowrap: true, sortValue: (r) => r.status,
      render: (r) => r.status === 'enrolled' ? <Badge tone="ok" dot>Enrolled, {r.tier}</Badge> : r.status === 'waived' ? <Badge tone="neutral" dot>Opted out</Badge>
        : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><Badge tone="warn" dot>Not yet</Badge>{r.reminded && <span style={{ fontSize: 12, color: T.mute }}>Reminded {fmtDate(r.reminded)}</span>}</span>,
    },
    { key: 'pay', label: 'Payroll deduction a month', align: 'right', nowrap: true, sortValue: (r) => r.employeeMonthly, render: (r) => (r.status === 'enrolled' ? inr(r.employeeMonthly) : <span style={{ color: T.mute }}>—</span>) },
    { key: 'act', label: '', align: 'right', render: (r) => <Button size="sm" aria-label={`${r.status === 'pending' ? 'Enrol' : 'Open enrolment of'} ${fullName(r.e)}`} onClick={() => setForm(r.id)}>{r.status === 'pending' ? 'Enrol' : 'Open'}</Button> },
  ];
  const progCols: Col<(typeof progress.rows)[number]>[] = [
    { key: 'name', label: 'Department', render: (r) => r.name },
    { key: 'elig', label: 'Eligible', align: 'right', render: (r) => r.eligible },
    { key: 'enr', label: 'Enrolled', align: 'right', render: (r) => r.enrolled },
    { key: 'wav', label: 'Opted out', align: 'right', render: (r) => r.waived },
    { key: 'pen', label: 'Not yet', align: 'right', render: (r) => (r.pending ? <b style={{ color: T.warn }}>{r.pending}</b> : 0) },
    { key: 'bar', label: 'Done', width: 170, render: (r) => (<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><ProgressBar pct={r.pct} tone={r.pct >= 100 ? 'ok' : r.pct >= 50 ? 'info' : 'warn'} /></div><span style={{ fontSize: 12, color: T.dim, minWidth: 34, textAlign: 'right' }}>{r.pct}%</span></div>) },
  ];

  const remindIds = progress.pendingIds.filter((id) => st.benefits.reminders[id] !== PREVIEW_TODAY);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div data-testid="window-card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15 }}>Enrolment window</h2>
              <Badge tone={win.state === 'open' ? 'ok' : 'warn'} dot>{win.state === 'open' ? `Open, ${win.daysLeft} days left` : win.state === 'closed' ? 'Closed' : 'Not open yet'}</Badge>
            </div>
            <div style={{ fontSize: 13.5, color: T.dim }}>
              Opened {fmtDate(st.benefits.window.opensOn)}, closes <b data-testid="window-closes" style={{ color: T.text }}>{fmtDate(st.benefits.window.closesOn)}</b>. Cover starts {fmtDate(health.coverStart)}.
            </div>
            {st.benefits.window.extensions.map((x, i) => <div key={i} style={{ fontSize: 12.5, color: T.dim }}>Extended by {x.days} days on {fmtDate(x.on)}: {x.reason}</div>)}
          </div>
          <Button variant="primary" style={{ height: 40 }} onClick={() => setExtending(true)}>Extend window</Button>
        </div>
      </Card>

      <Card>
        <CardTitle right={<Badge tone={progress.total.pending ? 'warn' : 'ok'}>{progress.total.pct}% done</Badge>}>Progress by department</CardTitle>
        <div data-testid="progress-table"><DataTable columns={progCols} rows={progress.rows} minWidth={620} empty="Nobody is eligible yet." /></div>
        <Muted style={{ marginTop: 8 }}>
          {progress.total.enrolled} enrolled, {progress.total.waived} opted out and {progress.total.pending} not yet, out of {progress.total.eligible} eligible.
          {notEligible.length > 0 && <> Not eligible now: {notEligible.map((e) => `${fullName(e)} (${enrolmentEligibility(e, health.coverStart).reason?.replace(/\.$/, '').toLowerCase()})`).join('; ')}.</>}
        </Muted>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search by name or code" width={260} />
          <Select aria-label="Filter by enrolment" value={filter} style={{ width: 170 }} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
            <option value="">Everyone eligible</option>
            <option value="enrolled">Enrolled</option>
            <option value="waived">Opted out</option>
            <option value="pending">Not yet</option>
          </Select>
          <div style={{ marginLeft: 'auto' }}>
            <Button style={{ height: 40 }} disabled={!remindIds.length}
              title={remindIds.length ? undefined : progress.pendingIds.length ? 'A reminder was already logged today for everyone waiting.' : 'Nobody is waiting to enrol.'}
              onClick={async () => { const r = await logReminders(progress.pendingIds); if (r.ok) toast.success(`Simulation: ${r.count} reminders logged. Nothing was sent.`); else toast.error(r.error); }}>
              Log reminder for {remindIds.length} not yet enrolled
            </Button>
          </div>
        </Toolbar>
        <SimulationNote>Reminders are only recorded here. In the live product they would go out by email or WhatsApp. Nothing is sent from this preview.</SimulationNote>
        <DataTable columns={cols} rows={shown} minWidth={780} empty="Nobody matches this filter." />
      </div>
      {form && <EnrolForm db={db} st={st} employeeId={form} onClose={() => setForm(null)} />}
      {extending && <ExtendModal closesOn={st.benefits.window.closesOn} onClose={() => setExtending(false)} />}
      {win.state === 'closed' && <Note tone="warn">The window is closed. Forms are read-only until HR extends it.</Note>}
    </div>
  );
}
