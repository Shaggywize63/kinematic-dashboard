'use client';
// Approvals: weeks waiting for a manager. Approve (locks the week) or return with a comment. Over-cap weeks are flagged.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Modal, Note, Stat, StatGrid, T, type Col } from '../../ui';
import { Field, Textarea } from '../../../ui';
import { fmtDate, fullName } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { decideSheet } from '../../../../lib/hrms/people/timesheetActions';
import { billableHours, overCap, sheetTotal, validateSheet, weekLabel } from '../../../../lib/hrms/people/timesheetEngine';
import type { Sheet, TimesheetState } from '../../../../lib/hrms/people/types';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { ActivityList, Muted, Stack } from '../shared';
import SheetGrid from './SheetGrid';
import { STATUS_TEXT, STATUS_TONE } from './WeekTab';

function ReviewModal({ db, ts, sheet, onClose }: { db: HrmsDb; ts: TimesheetState; sheet: Sheet; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const person = db.employees.find((e) => e.id === sheet.employeeId)!;
  const issues = validateSheet(sheet, ts.policy, PREVIEW_TODAY);
  const decide = (d: 'approved' | 'returned') => {
    const r = decideSheet(sheet.id, d, comment);
    if (!r.ok) { setError(r.error); return; }
    toast.success(d === 'approved' ? 'Approved. The week is locked.' : 'Returned with your comment.');
    onClose();
  };
  return (
    <Modal title={`Review: ${fullName(person)}, ${weekLabel(sheet.weekStart)}`} onClose={onClose} width={900}
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="danger" onClick={() => decide('returned')}>Return with comment</Button>
          <Button variant="primary" onClick={() => decide('approved')}>Approve and lock</Button>
        </>
      )}>
      <Stack gap={12}>
        <SheetGrid sheet={sheet} weekStart={sheet.weekStart} projects={ts.projects} policy={ts.policy} editable={false} />
        {issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{issues.map((i, k) => <li key={k} style={{ color: i.level === 'error' ? T.red : T.warn }}>{i.level === 'error' ? 'Problem: ' : 'Flag: '}{i.message}</li>)}</ul>}
        <Field label="Comment" htmlFor="rev-comment" hint="Needed when you return the week. Say what to fix.">
          <Textarea id="rev-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {error && <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div>}
        <Muted>Approving locks the week: nobody can edit it afterwards. The decision is yours; the sheet is evidence, not a verdict on the person.</Muted>
      </Stack>
    </Modal>
  );
}

export default function ApprovalsTab({ db, ts }: { db: HrmsDb; ts: TimesheetState }) {
  const [review, setReview] = useState<string | null>(null);
  const emp = new Map(db.employees.map((e) => [e.id, e]));
  const waiting = ts.sheets.filter((s) => s.status === 'submitted').sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }));
  const decided = ts.sheets.filter((s) => s.status === 'approved' || s.status === 'returned').sort((a, b) => (b.decidedOn ?? '').localeCompare(a.decidedOn ?? '') || b.weekStart.localeCompare(a.weekStart)).slice(0, 12);
  const approved = ts.sheets.filter((s) => s.status === 'approved').length;
  const flagged = waiting.filter((s) => overCap(s, ts.policy)).length;
  const cur = review ? ts.sheets.find((s) => s.id === review) : undefined;

  const waitCols: Col<Sheet>[] = [
    { key: 'p', label: 'Person', render: (s) => { const e = emp.get(s.employeeId)!; return <EmployeeCell e={e} sub={db.designations.find((d) => d.id === e.designationId)?.name} />; } },
    { key: 'w', label: 'Week', nowrap: true, sortValue: (s) => s.weekStart, render: (s) => weekLabel(s.weekStart) },
    { key: 'h', label: 'Hours', align: 'right', sortValue: (s) => sheetTotal(s), render: (s) => sheetTotal(s) },
    { key: 'b', label: 'Billable', align: 'right', render: (s) => billableHours(s, ts.projects) },
    { key: 'f', label: 'Flags', render: (s) => (overCap(s, ts.policy) ? <Badge tone="warn" dot>Over the {ts.policy.weeklyCap} h cap</Badge> : <span style={{ color: T.mute }}>None</span>) },
    { key: 'on', label: 'Submitted', nowrap: true, render: (s) => fmtDate(s.submittedOn) },
    { key: 'act', label: '', align: 'right', render: (s) => <Button size="sm" variant="primary" aria-label={`Review ${fullName(emp.get(s.employeeId)!)}, week of ${s.weekStart}`} onClick={() => setReview(s.id)}>Review</Button> },
  ];
  const doneCols: Col<Sheet>[] = [
    { key: 'p', label: 'Person', render: (s) => fullName(emp.get(s.employeeId)!) },
    { key: 'w', label: 'Week', nowrap: true, render: (s) => weekLabel(s.weekStart) },
    { key: 'h', label: 'Hours', align: 'right', render: (s) => sheetTotal(s) },
    { key: 'st', label: 'Decision', nowrap: true, render: (s) => <Badge tone={STATUS_TONE[s.status]} dot>{STATUS_TEXT[s.status]}</Badge> },
    { key: 'by', label: 'By', render: (s) => `${s.decidedBy ?? ''}, ${fmtDate(s.decidedOn)}` },
    { key: 'c', label: 'Comment', render: (s) => s.comment ?? '' },
  ];

  return (
    <Stack gap={16}>
      <StatGrid min={160}>
        <Stat label="Waiting for approval" value={waiting.length} tone={waiting.length ? 'info' : 'ok'} />
        <Stat label="Flagged over the cap" value={flagged} tone={flagged ? 'warn' : 'ok'} hint={`More than ${ts.policy.weeklyCap} hours in the week`} />
        <Stat label="Approved and locked" value={approved} tone="ok" />
        <Stat label="Returned" value={ts.sheets.filter((s) => s.status === 'returned').length} tone="warn" />
      </StatGrid>
      <Card padding={0}>
        <div style={{ padding: '14px 16px 0' }}><CardTitle>Waiting for approval</CardTitle></div>
        <div data-testid="approvals-waiting"><DataTable columns={waitCols} rows={waiting} minWidth={820} empty="Nothing is waiting. Submitted weeks appear here." /></div>
      </Card>
      <Card padding={0}>
        <div style={{ padding: '14px 16px 0' }}><CardTitle>Recent decisions</CardTitle></div>
        <div data-testid="approvals-done"><DataTable columns={doneCols} rows={decided} minWidth={820} empty="No decisions yet." /></div>
      </Card>
      <Card padding={16}>
        <CardTitle>Recent activity</CardTitle>
        <ActivityList entries={ts.log} testId="timesheet-log" />
      </Card>
      <Note>A week over the cap is flagged for the approver, not blocked: long weeks happen. What counts as overtime, and how it is paid, is set in Time &amp; Leave.</Note>
      {cur && cur.status === 'submitted' && <ReviewModal db={db} ts={ts} sheet={cur} onClose={() => setReview(null)} />}
    </Stack>
  );
}
