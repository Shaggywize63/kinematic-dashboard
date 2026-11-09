'use client';
// The weekly timesheet for one person: enter hours, see the checks, submit for approval. Locked once approved.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, Note, Toolbar, T } from '../../ui';
import { Select } from '../../../ui';
import Link from 'next/link';
import { addDays, fmtDate, fullName } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { addProjectRow, removeProjectRow, setHours, submitSheet } from '../../../../lib/hrms/people/timesheetActions';
import { billableHours, isEditable, sheetId, sheetTotal, submitCheck, utilisationPct, validateSheet, weekLabel, weekStartOf } from '../../../../lib/hrms/people/timesheetEngine';
import { FIRST_WEEK } from '../../../../lib/hrms/people/seedTimesheets';
import type { Sheet, SheetStatus, TimesheetState } from '../../../../lib/hrms/people/types';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { Muted, Stack } from '../shared';
import SheetGrid from './SheetGrid';
import PolicyModal from './PolicyModal';

export const STATUS_TONE: Record<SheetStatus, 'neutral' | 'info' | 'ok' | 'warn'> = { draft: 'neutral', submitted: 'info', approved: 'ok', returned: 'warn' };
export const STATUS_TEXT: Record<SheetStatus, string> = { draft: 'Draft', submitted: 'With the approver', approved: 'Approved and locked', returned: 'Returned' };
const CURRENT_WEEK = weekStartOf(PREVIEW_TODAY);

export default function WeekTab({ db, ts }: { db: HrmsDb; ts: TimesheetState }) {
  const people = db.employees.filter((e) => ts.trackedIds.includes(e.id));
  const [empId, setEmpId] = useState(ts.trackedIds[0]!);
  const [week, setWeek] = useState(CURRENT_WEEK);
  const [rowError, setRowError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const person = db.employees.find((e) => e.id === empId)!;
  const found = ts.sheets.find((s) => s.id === sheetId(empId, week));
  const sheet: Pick<Sheet, 'lines' | 'weekStart' | 'status'> & Partial<Sheet> = found ?? { lines: [], weekStart: week, status: 'draft' };
  const editable = isEditable(sheet.status);
  const issues = validateSheet(sheet, ts.policy, PREVIEW_TODAY);
  const check = submitCheck(sheet, ts.policy, PREVIEW_TODAY);
  const total = sheetTotal(sheet);
  const billable = billableHours(sheet, ts.projects);
  const util = utilisationPct(billable, 1, 1, ts.policy);
  const weeks: string[] = [];
  for (let w = FIRST_WEEK; w <= CURRENT_WEEK; w = addDays(w, 7)) weeks.push(w);

  return (
    <Stack gap={14}>
      <Toolbar>
        <Select aria-label="Person" value={empId} onChange={(e) => { setEmpId(e.target.value); setRowError(null); }} style={{ width: 230 }}>
          {people.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
        </Select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="sm" aria-label="Previous week" disabled={week <= FIRST_WEEK} onClick={() => setWeek(addDays(week, -7))}>←</Button>
          <span data-testid="week-label" style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 190, textAlign: 'center' }}>{weekLabel(week)}</span>
          <Button size="sm" aria-label="Next week" disabled={week >= CURRENT_WEEK} onClick={() => setWeek(addDays(week, 7))}>→</Button>
        </div>
        <span data-testid="sheet-status"><Badge tone={STATUS_TONE[sheet.status]} dot>{STATUS_TEXT[sheet.status]}</Badge></span>
      </Toolbar>

      <Card padding={14}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, color: T.text }}>
            <b>Company limits (sample policy):</b> up to <b>{ts.policy.maxPerDay}</b> hours in a day, a flag above <b>{ts.policy.weeklyCap}</b> hours in a week, a standard week of {ts.policy.standardWeek} hours. <ConfidenceBadge level="reported" />
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }}>Overtime pay and consent rules live in <Link href="/dashboard/hrms/time?tab=overtime" data-testid="overtime-link" style={{ color: T.info, fontWeight: 600 }}>Time &amp; Leave</Link>, not here. Confirm limits with your advisor.</div>
          </div>
          <Button size="sm" onClick={() => setPolicyOpen(true)}>Edit limits</Button>
        </div>
      </Card>

      {sheet.status === 'returned' && sheet.comment && <Note tone="warn"><b>Returned by {sheet.decidedBy} on {fmtDate(sheet.decidedOn)}:</b> {sheet.comment} Fix it and submit again.</Note>}
      {sheet.status === 'approved' && <Note tone="ok">Approved by {sheet.decidedBy} on {fmtDate(sheet.decidedOn)}. This week is locked and cannot be edited.</Note>}
      {sheet.status === 'submitted' && <Note>Submitted on {fmtDate(sheet.submittedOn)}. It is locked while the approver reviews it (see the Approvals tab).</Note>}

      <SheetGrid sheet={sheet} weekStart={week} projects={ts.projects} policy={ts.policy} editable={editable} rowError={rowError}
        onSet={(p, d, h) => { const r = setHours(empId, week, p, d, h); if (!r.ok) setRowError(r.error); else setRowError(null); }}
        onAddRow={(p) => { const r = addProjectRow(empId, week, p); setRowError(r.ok ? null : r.error); }}
        onRemoveRow={(p) => { const r = removeProjectRow(empId, week, p); setRowError(r.ok ? null : r.error); }} />

      {issues.length > 0 && (
        <ul data-testid="sheet-issues" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }}>
          {issues.map((i, k) => <li key={k} style={{ color: i.level === 'error' ? T.red : T.warn }}>{i.level === 'error' ? 'Fix: ' : 'Flag: '}{i.message}</li>)}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={!check.ok} onClick={() => { const r = submitSheet(empId, week); if (r.ok) toast.success('Submitted for approval.'); else toast.error(r.error); }}>Submit for approval</Button>
        {!check.ok && editable && <span data-testid="submit-reason" style={{ fontSize: 13, color: T.dim }}>{check.reasons[0]}</span>}
        {check.ok && <Muted>Total {total} hours. Once submitted, the week is locked until the approver decides.</Muted>}
      </div>

      <Card padding={14}>
        <CardTitle>This week for {person.firstName}</CardTitle>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13.5, color: T.text }}>
          <span>Hours <b data-testid="my-hours">{total}</b></span>
          <span>Billable <b>{billable}</b></span>
          <span>Utilisation <b data-testid="my-util">{util}%</b> of a {ts.policy.standardWeek}-hour week</span>
        </div>
        <Muted style={{ marginTop: 8 }}>An individual's utilisation is visible to the person and their manager only. Teams see aggregates, never a ranking of people.</Muted>
      </Card>

      {trail(found)}
      {policyOpen && <PolicyModal policy={ts.policy} onClose={() => setPolicyOpen(false)} />}
    </Stack>
  );
}

function trail(s?: Sheet) {
  if (!s || s.trail.length === 0) return null;
  return (
    <Card padding={14}>
      <CardTitle>History of this week</CardTitle>
      <ul data-testid="sheet-trail" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
        {s.trail.map((t, i) => <li key={i}>{fmtDate(t.at)}: {t.action} by {t.by}{t.comment ? `. "${t.comment}"` : ''}</li>)}
      </ul>
    </Card>
  );
}
