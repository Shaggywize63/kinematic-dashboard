'use client';
// Acknowledgement tracking: one row per policy with a rate bar, a drill-down of who has and has not acknowledged,
// reminders (logged, not sent) and a per-person view.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Note, ProgressBar, T, useIsCompact, type Col } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fmtDateTime, fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { ackRows, ackSummary, audienceOf, currentVersion, personView, type AckRow } from '../../../lib/hrms/assist/policies';
import { acknowledge, sendReminders } from '../../../lib/hrms/assist/store';
import type { PolicyState } from '../../../lib/hrms/assist/types';
import { rateTone } from './PolicyLibrary';
import { Labelled } from './shared';

type Mode = 'policy' | 'person';

export default function AckTab({ db, state, policyId, onPolicy }: { db: HrmsDb; state: PolicyState; policyId: string; onPolicy: (id: string) => void }) {
  const narrow = useIsCompact(800);
  const [mode, setMode] = useState<Mode>('policy');
  const [personId, setPersonId] = useState('emp_9');
  const people = useMemo(() => db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice').sort((a, b) => fullName(a).localeCompare(fullName(b))), [db.employees]);
  const rowsFor = (id: string) => { const p = state.policies.find((x) => x.id === id)!; return ackRows(db, p, state.acks, state.reminders, PREVIEW_TODAY); };

  const remind = (pid: string, ids: string[], label: string) => {
    const n = sendReminders(pid, ids);
    toast.success(`${n} reminder${n === 1 ? '' : 's'} logged for ${label}. Nothing was sent: the preview has no email or WhatsApp.`);
  };

  const summaryRows = state.policies.map((p) => {
    const rows = rowsFor(p.id); const s = ackSummary(rows); const v = currentVersion(p);
    return { id: p.id, p, v, s, pendingIds: rows.filter((r) => r.status === 'pending').map((r) => r.employee.id) };
  });
  const cols: Col<(typeof summaryRows)[number]>[] = [
    { key: 'policy', label: 'Policy', render: (r) => <button type="button" onClick={() => onPolicy(r.id)} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left', color: T.text, fontWeight: r.id === policyId ? 700 : 600, textDecoration: 'underline', textDecorationColor: T.border }}>{r.p.title}</button> },
    { key: 'ver', label: 'Version', render: (r) => <Badge tone="neutral" mono>v{r.v.version}</Badge>, nowrap: true },
    { key: 'rate', label: 'Acknowledged', render: (r) => r.s.rate == null ? <span style={{ color: T.mute }}>Not required</span> : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
        <div style={{ flex: 1 }}><ProgressBar pct={r.s.rate} tone={rateTone(r.s.rate)} /></div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: T.dim, whiteSpace: 'nowrap' }}>{r.s.acknowledged}/{r.s.acknowledged + r.s.pending} · {Math.round(r.s.rate)}%</span>
      </div>) },
    { key: 'pending', label: 'Pending', align: 'right', render: (r) => (r.s.rate == null ? '—' : r.s.pending) },
    { key: 'days', label: 'Avg days pending', align: 'right', render: (r) => (r.s.pending ? r.s.avgDaysPending : '—') },
    { key: 'act', label: '', align: 'right', render: (r) => (
      <Button size="sm" disabled={!r.pendingIds.length} title={r.pendingIds.length ? undefined : 'Nobody is pending'} data-testid={`remind-all-${r.id}`} aria-label={`Send a reminder to everyone pending on ${r.p.title}`}
        onClick={() => remind(r.id, r.pendingIds, `${r.pendingIds.length} people on ${r.p.title}`)}>Send reminder</Button>) },
  ];

  const sel = state.policies.find((p) => p.id === policyId) ?? state.policies[0]!;
  const selRows = rowsFor(sel.id);
  const selSummary = ackSummary(selRows);
  const recent = state.reminders.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return (
    <div data-testid="ack-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding={16}>
        <CardTitle>Acknowledgement by policy</CardTitle>
        <DataTable columns={cols} rows={summaryRows} minWidth={760} />
        <div style={{ marginTop: 10 }}>
          <Note>Reminders are logged here and not sent, because the preview has no email or WhatsApp. People acknowledge in their own app in the live product. The buttons that record an acknowledgement here stand in for that.</Note>
        </div>
      </Card>

      <div role="tablist" aria-label="Detail view" style={{ display: 'inline-flex', gap: 2, padding: 3, background: T.raised, borderRadius: T.radius.md, alignSelf: 'flex-start' }}>
        {(['policy', 'person'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)} style={{ height: 28, padding: '0 12px', border: 0, borderRadius: T.radius.sm, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === m ? T.card : 'transparent', color: mode === m ? T.text : T.dim }}>{m === 'policy' ? 'By policy' : 'By person'}</button>
        ))}
      </div>

      {mode === 'policy' ? (
        <Card padding={16}>
          <CardTitle right={<Select aria-label="Policy" value={sel.id} onChange={(e) => onPolicy(e.target.value)} style={{ width: narrow ? '100%' : 260 }}>{state.policies.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>}>
            {sel.title}, v{currentVersion(sel).version}
          </CardTitle>
          {selSummary.rate == null ? <Note>This version does not need acknowledgement.</Note> : (
            <>
              <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 10 }}>{selSummary.acknowledged} acknowledged, {selSummary.pending} pending{selSummary.pending ? `, the longest for ${selSummary.oldestPending} days` : ''}. The list is the {audienceOf(db, sel).length} people this policy applies to.</div>
              <PersonTable rows={selRows} onRemind={(id, name) => remind(sel.id, [id], name)} onAck={(id) => { acknowledge(sel.id, id); toast.success('Acknowledgement recorded'); }} />
            </>
          )}
        </Card>
      ) : (
        <Card padding={16}>
          <CardTitle right={<Select aria-label="Person" value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ width: narrow ? '100%' : 260 }}>{people.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>}>
            What {fullName(db.employees.find((e) => e.id === personId) ?? people[0]!)} has to acknowledge
          </CardTitle>
          <PersonPolicies db={db} state={state} personId={personId} onRemind={(pid, name) => remind(pid, [personId], name)} onAck={(pid) => { acknowledge(pid, personId); toast.success('Acknowledgement recorded'); }} />
        </Card>
      )}

      <Card padding={16}>
        <CardTitle>Reminder log</CardTitle>
        {recent.length ? (
          <ul data-testid="reminder-log" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ color: T.dim }}>
                {fmtDateTime(r.at)} · {fullName(db.employees.find((e) => e.id === r.employeeId) ?? { firstName: r.employeeId, lastName: '' })} · {state.policies.find((p) => p.id === r.policyId)?.title} v{r.version} · <span style={{ color: T.mute }}>logged, not sent</span>
              </li>
            ))}
          </ul>
        ) : <div style={{ fontSize: 13.5, color: T.dim }}>No reminders logged yet.</div>}
      </Card>
    </div>
  );
}

function PersonTable({ rows, onRemind, onAck }: { rows: AckRow[]; onRemind: (id: string, name: string) => void; onAck: (id: string) => void }) {
  const sorted = [...rows].sort((a, b) => (a.status === b.status ? b.daysPending - a.daysPending : a.status === 'pending' ? -1 : 1));
  const cols: Col<AckRow & { id: string }>[] = [
    { key: 'p', label: 'Person', render: (r) => <EmployeeCell e={r.employee} /> },
    { key: 's', label: 'Status', render: (r) => (r.status === 'acknowledged' ? <Badge tone="ok" dot>Acknowledged {r.at ? fmtDate(r.at) : ''}</Badge> : <Badge tone="warn" dot>Pending</Badge>), nowrap: true },
    { key: 'd', label: 'Days pending', align: 'right', render: (r) => (r.status === 'pending' ? r.daysPending : '—') },
    { key: 'prev', label: 'Earlier version', render: (r) => (r.previouslyAcknowledged ? `Acknowledged v${r.previouslyAcknowledged}` : <span style={{ color: T.mute }}>None</span>), nowrap: true },
    { key: 'rem', label: 'Reminders', render: (r) => (r.remindersSent ? `${r.remindersSent}, last ${fmtDate(r.lastReminder!.slice(0, 10))}` : <span style={{ color: T.mute }}>None</span>), nowrap: true },
    { key: 'a', label: '', align: 'right', render: (r) => (r.status === 'pending' ? (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <Button size="sm" onClick={() => onRemind(r.employee.id, fullName(r.employee))} aria-label={`Send a reminder to ${fullName(r.employee)}`} data-testid={`remind-${r.employee.id}`}>Remind</Button>
        <Button size="sm" onClick={() => onAck(r.employee.id)} aria-label={`Record that ${fullName(r.employee)} acknowledged`} data-testid={`ack-${r.employee.id}`}>Mark as read</Button>
      </div>) : null), nowrap: true },
  ];
  return <div data-testid="ack-people"><DataTable columns={cols} rows={sorted.map((r) => ({ ...r, id: r.employee.id }))} minWidth={860} /></div>;
}

function PersonPolicies({ db, state, personId, onRemind, onAck }: { db: HrmsDb; state: PolicyState; personId: string; onRemind: (pid: string, name: string) => void; onAck: (pid: string) => void }) {
  const items = personView(db, state.policies, state.acks, state.reminders, personId, PREVIEW_TODAY).map((x) => ({ id: x.policy.id, ...x }));
  const cols: Col<(typeof items)[number]>[] = [
    { key: 'p', label: 'Policy', render: (r) => <b>{r.policy.title}</b> },
    { key: 'v', label: 'Version', render: (r) => <Badge tone="neutral" mono>v{r.version.version}</Badge>, nowrap: true },
    { key: 's', label: 'Status', render: (r) => (r.row.status === 'acknowledged' ? <Badge tone="ok" dot>Acknowledged {r.row.at ? fmtDate(r.row.at) : ''}</Badge> : r.row.status === 'pending' ? <Badge tone="warn" dot>Pending</Badge> : <Badge tone="neutral">Not required</Badge>), nowrap: true },
    { key: 'd', label: 'Days pending', align: 'right', render: (r) => (r.row.status === 'pending' ? r.row.daysPending : '—') },
    { key: 'a', label: '', align: 'right', render: (r) => (r.row.status === 'pending' ? (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <Button size="sm" onClick={() => onRemind(r.policy.id, r.policy.title)} aria-label={`Send a reminder for ${r.policy.title}`}>Remind</Button>
        <Button size="sm" onClick={() => onAck(r.policy.id)} aria-label={`Record acknowledgement of ${r.policy.title}`}>Mark as read</Button>
      </div>) : null), nowrap: true },
  ];
  return <div data-testid="ack-person-view"><DataTable columns={cols} rows={items} minWidth={720} empty="No policy applies to this person." /></div>;
}
