'use client';
// Compliance view: mandatory-training coverage by department and location, who is overdue (with a logged reminder) and
// which certificates lapse in the next 60 days.

import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Note, Stat, StatGrid, T, type Col } from '../../ui';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { fmtDate } from '../../../../lib/hrms/format';
import { assignRefresher, sendReminder } from '../../../../lib/hrms/people/learningActions';
import { EXPIRY_WINDOW_DAYS, type ExpiringItem, type OverdueItem } from '../../../../lib/hrms/people/learningEngine';
import type { LearningState } from '../../../../lib/hrms/people/types';
import { ActivityList, CoverageBars, Muted, SimulationBadge, Stack } from '../shared';
import type { LearningView } from './view';

export default function ComplianceTab({ db, st, view }: { db: HrmsDb; st: LearningState; view: LearningView }) {
  const lastReminder = new Map<string, string>();
  for (const r of st.reminders) if (!lastReminder.has(r.assignmentId)) lastReminder.set(r.assignmentId, r.on);
  const wide = view.byDept.length > 0;

  const overdueCols: Col<OverdueItem & { id: string }>[] = [
    { key: 'p', label: 'Person', render: (r) => <EmployeeCell e={r.employee} sub={`${view.names.dep(r.employee.departmentId)} · ${view.names.loc(r.employee.locationId)}`} /> },
    { key: 'c', label: 'Course', render: (r) => r.course.title },
    { key: 'due', label: 'Was due', nowrap: true, render: (r) => fmtDate(r.assignment.dueOn) },
    { key: 'late', label: 'Overdue by', nowrap: true, align: 'right', render: (r) => <b style={{ color: T.red }}>{r.daysOverdue} days</b>, sortValue: (r) => r.daysOverdue },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => {
        const last = lastReminder.get(r.assignment.id);
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            {last && <span style={{ fontSize: 12, color: T.mute }}>Reminded {fmtDate(last)}</span>}
            <Button size="sm" aria-label={`Send reminder to ${r.employee.firstName} ${r.employee.lastName} for ${r.course.title}`}
              onClick={() => { sendReminder(r.assignment.id); toast.success('Reminder logged. Nothing was sent in this preview.'); }}>{last ? 'Remind again' : 'Send reminder'}</Button>
          </div>
        );
      },
    },
  ];
  const overdueRows = view.overdue.map((o) => ({ ...o, id: o.assignment.id }));

  const expCols: Col<ExpiringItem & { id: string }>[] = [
    { key: 'p', label: 'Person', render: (r) => <EmployeeCell e={r.employee} sub={view.names.dep(r.employee.departmentId)} /> },
    { key: 'c', label: 'Course', render: (r) => r.course.title },
    { key: 'id', label: 'Certificate', nowrap: true, render: (r) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.cert.id}</span> },
    { key: 'exp', label: 'Lapses', nowrap: true, sortValue: (r) => r.daysLeft, render: (r) => <div><div>{fmtDate(r.cert.expiresOn)}</div><div style={{ fontSize: 12, color: r.daysLeft < 0 ? T.red : T.mute }}>{r.daysLeft < 0 ? `lapsed ${-r.daysLeft} days ago` : `in ${r.daysLeft} days`}</div></div> },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => r.refresherAssigned
        ? <Badge tone="info">Refresher assigned</Badge>
        : <Button size="sm" aria-label={`Assign refresher to ${r.employee.firstName} ${r.employee.lastName} for ${r.course.title}`} onClick={() => { assignRefresher(r.cert.id); toast.success('Refresher assigned.'); }}>Assign refresher</Button>,
    },
  ];
  const expRows = view.expiring.map((x) => ({ ...x, id: x.cert.id }));

  return (
    <Stack gap={18}>
      <StatGrid>
        <Stat label="Mandatory coverage" value={`${view.overall.pct}%`} tone={view.overall.pct >= 90 ? 'ok' : view.overall.pct >= 70 ? 'warn' : 'red'} hint={`${view.overall.covered} of ${view.overall.required} person-and-course pairs are done and valid`} />
        <Stat label="Overdue" value={view.overdue.length} tone={view.overdue.length ? 'red' : 'ok'} hint="Mandatory courses past their due date" />
        <Stat label={`Certificates lapsing in ${EXPIRY_WINDOW_DAYS} days`} value={view.expiring.length} tone={view.expiring.length ? 'warn' : 'ok'} hint="Includes any that have already lapsed" />
        <Stat label="Missing assignments" value={view.missing.length} tone={view.missing.length ? 'warn' : 'ok'} hint="Covered by a rule, not yet assigned" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>Coverage by department</CardTitle>
          {wide ? <CoverageBars rows={view.byDept} label="Mandatory training coverage by department" /> : <Muted>No mandatory courses apply yet.</Muted>}
        </Card>
        <Card>
          <CardTitle>Coverage by location</CardTitle>
          {view.byLoc.length ? <CoverageBars rows={view.byLoc} label="Mandatory training coverage by location" /> : <Muted>No mandatory courses apply yet.</Muted>}
        </Card>
      </div>
      <Muted>Covered means the latest assignment is completed and, for courses with a refresher, the certificate has not lapsed. Green is 90% or more, amber 70% to 89%, red below 70%.</Muted>

      <Card>
        <CardTitle right={<SimulationBadge>Reminders are logged, not sent</SimulationBadge>}>Overdue mandatory training</CardTitle>
        {overdueRows.length === 0
          ? <Note tone="ok">Nobody is overdue on a mandatory course.</Note>
          : <div data-testid="overdue-table"><DataTable columns={overdueCols} rows={overdueRows} minWidth={760} /></div>}
        {st.reminders.length > 0 && (
          <div data-testid="reminder-log" style={{ marginTop: 12, fontSize: 12.5, color: T.dim }}>
            Last reminders logged: {st.reminders.slice(0, 3).map((r) => `${db.employees.find((e) => e.id === r.employeeId)?.firstName ?? r.employeeId} (${st.courses.find((c) => c.id === r.courseId)?.title ?? r.courseId})`).join(', ')}.
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Certificates lapsing in the next {EXPIRY_WINDOW_DAYS} days</CardTitle>
        {expRows.length === 0
          ? <Note tone="ok">No certificate lapses in the next {EXPIRY_WINDOW_DAYS} days.</Note>
          : <div data-testid="expiring-table"><DataTable columns={expCols} rows={expRows} minWidth={760} /></div>}
      </Card>
      <Card>
        <CardTitle>Recent activity</CardTitle>
        <ActivityList entries={st.log} testId="learning-log" />
      </Card>
    </Stack>
  );
}
