'use client';
// The incentive run for one month: approve it, push it to payroll, and see what was handed over.
// Approving and pushing are human decisions, each with a confirmation that says who is held back.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, KeyValue, Modal, Note, T } from '../ui';
import { fmtDateTime, inr } from '../../../lib/hrms/format';
import type { HrmsDb, Month } from '../../../lib/hrms/types';
import { approveIncentiveRun, pushFieldPayToPayroll, type IncentiveRunState } from '../../../lib/hrms/field/store';
import { pushedSummary } from '../../../lib/hrms/fieldpay/engines';
import type { PayrollPreview } from '../../../lib/hrms/fieldpay/types';
import { FIELD_MONTH_LABEL, type Namer } from './common';

const RUN_LABEL = { draft: 'Draft', approved: 'Approved', in_payroll: 'In payroll' } as const;

export default function RunPanel({ db, month, run, preview, namer }: {
  db: HrmsDb; month: Month; run: IncentiveRunState; preview: PayrollPreview; namer: Namer;
}) {
  const [confirm, setConfirm] = useState<'approve' | 'push' | null>(null);
  const monthLabel = FIELD_MONTH_LABEL[month] ?? month;
  const pushed = pushedSummary(db.adjustments, month);
  const hasPushed = pushed.rows > 0;
  const stale = hasPushed && (pushed.incentives !== preview.incentives || pushed.travel !== preview.travel || pushed.people !== preview.people);
  const lockedRuns = db.payRuns.filter((r) => r.month === month && (r.status === 'frozen' || r.status === 'paid'));
  const held = preview.rows.filter((r) => r.held);
  const withClawback = preview.rows.filter((r) => r.clawback > 0);

  const approve = () => { approveIncentiveRun(month); setConfirm(null); toast.success(`${monthLabel} incentive run approved`); };
  const push = () => {
    const r = pushFieldPayToPayroll(month);
    setConfirm(null);
    toast.success(`Handed to payroll: ${inr(r.incentives)} incentives and ${inr(r.travel)} travel for ${r.people} people`);
  };

  return (
    <div data-testid="run-panel"><Card>
      <CardTitle right={<Badge tone={run.status === 'in_payroll' ? 'ok' : run.status === 'approved' ? 'info' : 'neutral'} dot>{RUN_LABEL[run.status]}</Badge>}>
        Pay run for {monthLabel}
      </CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <KeyValue columns={4} rows={[
          { label: 'Incentives going to payroll', value: <b data-testid="run-incentives">{inr(preview.incentives)}</b> },
          { label: 'Travel allowance going with it', value: <span data-testid="run-travel">{inr(preview.travel)}</span> },
          { label: 'People', value: String(preview.people) },
          { label: 'Held by HR', value: held.length ? `${held.length} (${inr(held.reduce((s, r) => s + r.withheld, 0))} kept back)` : 'Nobody' },
        ]} />
        <div style={{ fontSize: 13, color: T.dim }}>
          Travel allowance comes from the GPS trail and any distance HR decided in a dispute. See <Link href="/dashboard/hrms/travel" style={{ color: T.info }}>Travel &amp; GPS</Link>.
          Nothing reaches payroll until you approve the run and then push it.
        </div>

        {lockedRuns.length > 0 && (
          <Note tone="warn">
            The {monthLabel} pay run is already {lockedRuns[0]!.status} in the sample data. The rows will be added to Payroll as locked adjustments and will not change a paid payslip.
            November is the open month.
          </Note>
        )}
        {month === '2026-11' && <Note>November is in progress (evidence runs to 6 Nov), so almost everyone is below the first paying line and the incentive is nil. Travel allowance still applies.</Note>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary" disabled={run.status !== 'draft'} onClick={() => setConfirm('approve')}>Approve run</Button>
          <Button disabled={run.status === 'draft'} onClick={() => setConfirm('push')}>{run.status === 'in_payroll' ? 'Push again' : 'Push to payroll'}</Button>
          <span data-testid="run-status-line" style={{ fontSize: 13, color: T.dim }}>
            {run.status === 'draft' && 'Approve the run first. Pushing is switched on after that.'}
            {run.status === 'approved' && `Approved by ${run.approvedBy ?? 'HR'}${run.approvedAt ? `, ${fmtDateTime(run.approvedAt)}` : ''}. Ready to push.`}
            {run.status === 'in_payroll' && `Approved by ${run.approvedBy ?? 'HR'}${run.approvedAt ? `, ${fmtDateTime(run.approvedAt)}` : ''}. Pushing again replaces the earlier rows, it does not add to them.`}
          </span>
        </div>

        {hasPushed && (
          <div data-testid="push-result" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, background: T.panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 14 }}>Handed to payroll</div>
            <KeyValue columns={4} rows={[
              { label: 'Incentives', value: <b data-testid="push-incentives">{inr(pushed.incentives)}</b> },
              { label: 'Travel allowance', value: <b data-testid="push-travel">{inr(pushed.travel)}</b> },
              { label: 'People', value: <b data-testid="push-people">{pushed.people}</b> },
              { label: 'Adjustment rows', value: <span data-testid="push-rows">{pushed.rows}</span> },
            ]} />
            {stale && <Note tone="warn" >The figures have changed since the last push (for example a travel dispute was decided or a hold changed). Push again to update payroll.</Note>}
            <div style={{ fontSize: 13.5 }}>
              <Link href="/dashboard/hrms/payroll?tab=adjustments" style={{ color: T.info }}>Open payroll adjustments</Link>
              <span style={{ color: T.dim }}> and pick {monthLabel} in the Month filter to see the rows tagged &quot;[field {month}]&quot;.</span>
            </div>
          </div>
        )}
      </div>

      {confirm === 'approve' && (
        <Modal title={`Approve the ${monthLabel} incentive run?`} onClose={() => setConfirm(null)} width={520}
          footer={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={approve} style={{ minHeight: 40 }}>Approve run</Button></>}>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>
            Approving says a person has looked at these figures and agrees with them. It does not move any money. You still push the run to payroll as a second step.
          </div>
          <div data-testid="approve-held">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{held.length ? `Held by HR, not paid in this run (${held.length})` : 'Nobody is held'}</div>
            {held.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.6 }}>
                {held.map((r) => <li key={r.employeeId}><b>{namer.name(r.employeeId)}</b>, {inr(r.withheld)} kept back. Reason: {r.heldReason}</li>)}
              </ul>
            )}
          </div>
          {withClawback.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Clawbacks already taken off the net</div>
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.6 }}>
                {withClawback.map((r) => <li key={r.employeeId}>{namer.name(r.employeeId)}: {inr(r.clawback)}</li>)}
              </ul>
            </div>
          )}
          <div style={{ fontSize: 13.5, color: T.dim }}>{inr(preview.incentives)} of incentives and {inr(preview.travel)} of travel allowance, {preview.people} people.</div>
        </Modal>
      )}
      {confirm === 'push' && (
        <Modal title={`Push ${monthLabel} to payroll?`} onClose={() => setConfirm(null)} width={520}
          footer={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={push} style={{ minHeight: 40 }}>{run.status === 'in_payroll' ? 'Push again' : 'Push to payroll'}</Button></>}>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>
            This adds {inr(preview.incentives)} of incentives (taxable) and {inr(preview.travel)} of travel allowance (not taxable) to Payroll as adjustments for {preview.people} people.
            {hasPushed && ' Rows from the earlier push are replaced, so nothing is counted twice.'}
          </div>
          {held.length > 0 && <Note tone="warn">Left out because HR holds them: {held.map((r) => namer.name(r.employeeId)).join(', ')}.</Note>}
        </Modal>
      )}
    </Card></div>
  );
}
