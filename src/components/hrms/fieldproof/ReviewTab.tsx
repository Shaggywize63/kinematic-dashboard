'use client';
// To review: days where a punch is missing, with what the person's own visits show. Waiting list on top, decided
// history below. "Approve all auto-approvable" asks for confirmation and says which rule the days met.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, EmptyState, Modal, Note, Stat, StatGrid, T, type Col } from '../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fmtDateTime, fullName } from '../../../lib/hrms/format';
import type { FieldEvidence, RegularisationSuggestion } from '../../../lib/hrms/field/types';
import { decideRegularisation, undoRegularisation, type FieldState } from '../../../lib/hrms/field/store';
import { ACTOR } from '../../../lib/hrms/actions';
import { DECISION_LABEL, approveAllPlan, partition, policySentences, reviewStats, spanText, type DecidedRow } from '../../../lib/hrms/fieldproof/logic';
import { DECISION_TONE, VerdictBadge } from './DayDetail';
import { Bullets } from './shared';

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

function evidenceText(e: RegularisationSuggestion['evidence']): string {
  return `${e.verifiedVisits} verified visit${e.verifiedVisits === 1 ? '' : 's'}${e.verifiedVisits >= 2 && e.spanMin ? `, spread over ${spanText(e.spanMin)}` : ''}, ${e.trailKm.toFixed(1)} km`;
}
function suggestedText(s: RegularisationSuggestion): string {
  if (s.verdict === 'no_evidence') return 'None. No verified visit.';
  return [s.suggestedIn && `in ${s.suggestedIn}`, s.suggestedOut && `out ${s.suggestedOut}`].filter(Boolean).join(', ') || 'Keep the punches';
}

export default function ReviewTab({ db, ev, state, candidates, onOpen }: {
  db: HrmsDb; ev: FieldEvidence; state: FieldState; candidates: RegularisationSuggestion[]; onOpen: (employeeId: string, date: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const regs = state.regularisations;
  const { pending, decided } = useMemo(() => partition(candidates, regs), [candidates, regs]);
  const stats = reviewStats(candidates, regs);
  const plan = useMemo(() => approveAllPlan(ev, pending), [ev, pending]);
  const person = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const P = policySentences();

  const pendingCols: Col<RegularisationSuggestion & { id: string }>[] = [
    { key: 'who', label: 'Person', render: (r) => { const p = person(r.employeeId); return p ? <EmployeeCell e={p} href={false} /> : r.employeeId; }, sortValue: (r) => r.employeeId },
    { key: 'date', label: 'Date', render: (r) => <span>{fmtDate(r.date)} <span style={{ color: T.mute }}>{weekday(r.date)}</span></span>, sortValue: (r) => r.date, nowrap: true },
    { key: 'verdict', label: 'The system says', render: (r) => <VerdictBadge verdict={r.verdict} />, sortValue: (r) => r.verdict, nowrap: true },
    { key: 'ev', label: 'Evidence', render: (r) => <span style={{ color: T.dim }}>{evidenceText(r.evidence)}</span> },
    { key: 'sug', label: 'Suggested punch', render: (r) => <span style={{ color: T.dim }}>{suggestedText(r)}</span> },
    { key: 'act', label: 'Action', align: 'right', render: (r) => {
      const n = person(r.employeeId);
      return <Button size="sm" variant={r.verdict === 'auto_approve' ? 'primary' : 'secondary'} aria-label={`Review ${n ? fullName(n) : r.employeeId}, ${fmtDate(r.date).replace(/ \d{4}$/, '')}`} onClick={(e) => { e.stopPropagation(); onOpen(r.employeeId, r.date); }}>Review</Button>;
    } },
  ];
  const decidedCols: Col<{ id: string; row: DecidedRow }>[] = [
    { key: 'who', label: 'Person', render: (r) => { const p = person(r.row.s.employeeId); return p ? <EmployeeCell e={p} href={false} /> : r.row.s.employeeId; } },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.row.s.date), sortValue: (r) => r.row.s.date, nowrap: true },
    { key: 'dec', label: 'Decision', render: (r) => <Badge tone={DECISION_TONE[r.row.d.status]} dot>{DECISION_LABEL[r.row.d.status]}</Badge>, nowrap: true },
    { key: 'times', label: 'Punch recorded', render: (r) => (r.row.d.in && r.row.d.out ? `${r.row.d.in} to ${r.row.d.out}` : '—'), nowrap: true },
    { key: 'by', label: 'Decided', render: (r) => <span style={{ color: T.dim }}>{r.row.d.by}, {fmtDateTime(r.row.d.at)}</span> },
    { key: 'note', label: 'Note', render: (r) => <span style={{ color: T.dim }}>{r.row.d.note ?? '—'}</span> },
    { key: 'act', label: 'Action', align: 'right', render: (r) => {
      const n = person(r.row.s.employeeId);
      return (
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" aria-label={`Open ${n ? fullName(n) : ''}, ${fmtDate(r.row.s.date).replace(/ \d{4}$/, '')}`} onClick={(e) => { e.stopPropagation(); onOpen(r.row.s.employeeId, r.row.s.date); }}>View</Button>
          <Button size="sm" aria-label={`Reopen ${n ? fullName(n) : ''}, ${fmtDate(r.row.s.date).replace(/ \d{4}$/, '')}`} onClick={(e) => { e.stopPropagation(); undoRegularisation(r.row.s.employeeId, r.row.s.date); toast.success('Reopened for a decision'); }}>Reopen</Button>
        </div>
      );
    } },
  ];

  const approveAll = () => {
    for (const x of plan) decideRegularisation(x.employeeId, x.date, 'approved', { in: x.in, out: x.out, note: 'Met the auto-approve rule.' });
    toast.success(`Approved ${plan.length} day${plan.length === 1 ? '' : 's'} that met the rule`);
    setConfirming(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <StatGrid min={160}>
        <Stat label="Waiting" value={<span data-testid="stat-waiting">{stats.waiting}</span>} tone={stats.waiting ? 'warn' : 'ok'} hint="Missed punch, no decision yet" />
        <Stat label="Can be auto-approved" value={<span data-testid="stat-auto">{stats.autoApprovable}</span>} tone="info" hint="Meet the visit-proof rule" />
        <Stat label="Approved" value={<span data-testid="stat-approved">{stats.approved}</span>} tone="ok" hint={`Days from ${fmtDate(ev.from).replace(/ \d{4}$/, '')} to ${fmtDate(ev.to).replace(/ \d{4}$/, '')}`} />
        <Stat label="Rejected" value={<span data-testid="stat-rejected">{stats.rejected}</span>} hint={stats.infoRequested ? `${stats.infoRequested} more info asked` : 'None'} />
      </StatGrid>

      <Card>
        <CardTitle right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {stats.autoApprovable === 0 && <span style={{ fontSize: 12.5, color: T.mute }}>No waiting day meets the rule right now.</span>}
            <Button variant="primary" disabled={plan.length === 0} onClick={() => setConfirming(true)}>Approve all auto-approvable{plan.length ? ` (${plan.length})` : ''}</Button>
          </div>
        }>Waiting for a decision</CardTitle>
        <DataTable columns={pendingCols} rows={pending.map((s) => ({ ...s, id: `${s.employeeId}|${s.date}` }))} minWidth={860}
          onRowClick={(r) => onOpen(r.employeeId, r.date)}
          empty={candidates.length ? 'Every missed punch has a decision. Nice and quiet.' : 'No missed punches in the evidence.'} />
      </Card>

      <Card>
        <CardTitle>Decided ({decided.length})</CardTitle>
        {decided.length === 0
          ? <EmptyState title="No decisions yet" description="Days you approve, reject or ask about appear here, with who decided and when. A decision can be reopened." style={{ padding: '28px 16px' }} />
          : <DataTable columns={decidedCols} rows={decided.map((row) => ({ id: `${row.s.employeeId}|${row.s.date}`, row }))} minWidth={920} onRowClick={(r) => onOpen(r.row.s.employeeId, r.row.s.date)} />}
      </Card>

      {confirming && (
        <Modal title="Approve all auto-approvable days?" onClose={() => setConfirming(false)} width={560}
          footer={<><Button onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" onClick={approveAll}>Approve {plan.length} day{plan.length === 1 ? '' : 's'}</Button></>}>
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>
            This approves <b data-testid="approve-all-count">{plan.length}</b> day{plan.length === 1 ? '' : 's'}. Each one met the rule:
          </div>
          <Bullets items={P.rule} />
          <div style={{ fontSize: 13.5, color: T.dim }}>The suggested punch time is recorded for the punch that was missing. Days that did not meet the rule are left for a manager.</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.dim, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {plan.map((x) => { const p = person(x.employeeId); return <li key={`${x.employeeId}|${x.date}`}>{p ? fullName(p) : x.employeeId}, {fmtDate(x.date)}: {x.in} to {x.out}</li>; })}
          </ul>
          <Note>You are approving as {ACTOR}. Each decision can be reopened afterwards.</Note>
        </Modal>
      )}
    </div>
  );
}
