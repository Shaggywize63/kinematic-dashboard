'use client';
// Cost and payroll: monthly outlay by plan, the renewal calendar, the payroll deduction preview, and the one write into
// payroll ("Send to payroll"), which is idempotent: rows tagged [benefits <month>] are replaced, never doubled.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmployeeCell, Note, Stat, StatGrid, T, type Col } from '../../ui';
import { Field, Select } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { addMonths, fmtDate, fmtMonth, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import {
  basicMonthlyOf, benefitsTag, deductionPreview, enrolmentEligibility, planOf, quoteEnrolment, renewalCalendar, type DeductionRow,
} from '../../../../lib/hrms/rewards/engines';
import { sendToPayroll } from '../../../../lib/hrms/rewards/store';
import type { Plan, RewardsState } from '../../../../lib/hrms/rewards/types';
import { BarRows, ConfirmModal, Muted, report } from '../common';

const KINDS: Plan['kind'][] = ['health', 'accident', 'meal', 'nps', 'flex'];
const NAMES: Record<Plan['kind'], string> = { health: 'Group health insurance', accident: 'Group accident cover', meal: 'Meal coupons', nps: 'NPS contribution', flex: 'Flexible allowance' };

export default function CostTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const health = planOf(st.benefits.plans, 'health')!;
  const coverMonth = health.coverStart.slice(0, 7);
  const [month, setMonth] = useState(coverMonth);
  const [confirming, setConfirming] = useState(false);

  const { byPlan, covered, total } = useMemo(() => {
    const by = Object.fromEntries(KINDS.map((k) => [k, { employee: 0, employer: 0 }])) as Record<Plan['kind'], { employee: number; employer: number }>;
    const cov = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Plan['kind'], number>;
    for (const e of db.employees) {
      if (!enrolmentEligibility(e, health.coverStart).eligible) continue;
      const en = st.benefits.enrolments.find((x) => x.employeeId === e.id);
      const q = quoteEnrolment(st.benefits.plans, en, basicMonthlyOf(db, e, PREVIEW_TODAY));
      for (const k of KINDS) {
        by[k].employee += q.byPlan[k].employee; by[k].employer += q.byPlan[k].employer;
        if (q.byPlan[k].employee + q.byPlan[k].employer > 0) cov[k] += 1;
      }
    }
    return { byPlan: by, covered: cov, total: KINDS.reduce((t, k) => ({ employee: t.employee + by[k].employee, employer: t.employer + by[k].employer }), { employee: 0, employer: 0 }) };
  }, [db, st.benefits, health.coverStart]);

  const calendar = useMemo(() => renewalCalendar(st.benefits.plans, st.benefits.window, PREVIEW_TODAY), [st.benefits]);
  const preview = useMemo(() => deductionPreview(db, st.benefits.plans, st.benefits.enrolments, PREVIEW_TODAY, health.coverStart).filter((r) => r.total > 0), [db, st.benefits, health.coverStart]);
  const sumOf = (k: 'health' | 'meal' | 'nps' | 'total' | 'employer') => preview.reduce((s, r) => s + r[k], 0);

  const locked = db.payRuns.some((r) => r.month === month && (r.status === 'frozen' || r.status === 'paid'));
  const tag = benefitsTag(month);
  const earlier = db.adjustments.filter((a) => a.month === month && (a.note ?? '').startsWith(tag)).length;
  const sent = st.benefits.sent[month];
  const months = [addMonths(coverMonth, -1), coverMonth];

  const cols: Col<DeductionRow>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => r.name.toLowerCase(), render: (r) => { const e = db.employees.find((x) => x.id === r.employeeId); return e ? <EmployeeCell e={e} href={false} /> : r.name; } },
    { key: 'health', label: 'Health, your share', align: 'right', sortValue: (r) => r.health, render: (r) => (r.health ? inr(r.health) : <span style={{ color: T.mute }}>—</span>) },
    { key: 'meal', label: 'Meal coupons', align: 'right', sortValue: (r) => r.meal, render: (r) => (r.meal ? inr(r.meal) : <span style={{ color: T.mute }}>—</span>) },
    { key: 'nps', label: 'NPS', align: 'right', sortValue: (r) => r.nps, render: (r) => (r.nps ? inr(r.nps) : <span style={{ color: T.mute }}>—</span>) },
    { key: 'total', label: 'Off take-home a month', align: 'right', sortValue: (r) => r.total, render: (r) => <b>{inr(r.total)}</b> },
    { key: 'employer', label: 'Company cost a month', align: 'right', sortValue: (r) => r.employer, render: (r) => inr(r.employer) },
  ];
  const tdF = { padding: '10px 14px', borderTop: `2px solid ${T.border}`, textAlign: 'right' as const, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const, fontSize: 13.5 };

  function send() {
    const r = sendToPayroll(month);
    if (report(r, r.ok ? `Sent ${r.added} deductions to payroll for ${fmtMonth(month)}${r.removed ? `, replacing ${r.removed} earlier rows` : ''}.` : '')) setConfirming(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatGrid min={190}>
        <Stat label="Company cost a month" value={inr(total.employer)} hint={`${inr(total.employer * 12)} a year`} />
        <Stat label="Off employees' pay a month" value={inr(total.employee)} hint="Their share and salary reductions" />
        <Stat label="Deduction rows for payroll" value={preview.length} hint="People with a deduction" />
      </StatGrid>

      <Card>
        <CardTitle right={<ConfidenceBadge level="indicative" />}>Monthly outlay by plan</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="outlay-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 13.5 }}>
            <thead>
              <tr>{['Plan', 'People', 'Company pays', 'Employees pay'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {KINDS.map((k) => (
                <tr key={k}>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}` }}>{NAMES[k]}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{covered[k]}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(byPlan[k].employer)}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(byPlan[k].employee)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdF, textAlign: 'left' }}>Total</td><td style={tdF} />
                <td style={tdF} data-testid="outlay-employer">{inr(total.employer)}</td><td style={tdF} data-testid="outlay-employee">{inr(total.employee)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          <BarRows rows={KINDS.filter((k) => byPlan[k].employer > 0).map((k) => ({ key: k, label: NAMES[k], value: byPlan[k].employer }))} format={(n) => `${inr(n)} a month`} />
        </div>
        <Muted style={{ marginTop: 8 }}>Premiums are samples. Health is split by the company share for each relation. Accident cover is paid by the company for every eligible employee. NPS and meal coupons are paid from the employee&apos;s own pay, so they cost the company nothing extra.</Muted>
      </Card>

      <Card>
        <CardTitle>Renewal calendar</CardTitle>
        <ul data-testid="renewal-calendar" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {calendar.map((c, i) => (
            <li key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13.5 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: T.dim, flex: '0 0 100px' }}>{fmtDate(c.on)}</span>
              <span style={{ flex: '1 1 0', minWidth: 0 }}>{c.label}</span>
              <Badge tone={c.kind === 'renewal' ? (c.days <= 60 ? 'warn' : 'neutral') : 'info'}>{c.days === 0 ? 'Today' : c.days > 0 ? `In ${c.days} days` : `${-c.days} days ago`}</Badge>
            </li>
          ))}
        </ul>
        <Muted style={{ marginTop: 8 }}>Renewal dates are samples. Ask the insurer for quotes well before the health renewal.</Muted>
      </Card>

      <Card>
        <CardTitle right={<Badge tone="info">Preview of what would feed payroll</Badge>}>Payroll deduction preview</CardTitle>
        <Muted style={{ marginBottom: 12 }}>Rupees a month by employee. Nothing here is in payroll until you press <b>Send to payroll</b> below.</Muted>
        <div data-testid="deduction-preview">
          <DataTable columns={cols} rows={preview} minWidth={820} empty="Nobody has a deduction yet. Enrol people on the Enrolment tab."
            footer={(
              <tfoot>
                <tr>
                  <td style={{ ...tdF, textAlign: 'left' }}>Total, {preview.length} people</td>
                  <td style={tdF}>{inr(sumOf('health'))}</td><td style={tdF}>{inr(sumOf('meal'))}</td><td style={tdF}>{inr(sumOf('nps'))}</td>
                  <td style={tdF} data-testid="preview-total">{inr(sumOf('total'))}</td><td style={tdF}>{inr(sumOf('employer'))}</td>
                </tr>
              </tfoot>
            )} />
        </div>

        <div style={{ marginTop: 16, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Payroll month" htmlFor="send-month" style={{ width: 200 }}>
              <Select id="send-month" value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</Select>
            </Field>
            <Button variant="primary" style={{ height: 40 }} disabled={!preview.length || locked} onClick={() => setConfirming(true)}
              title={locked ? 'That month is frozen or paid' : !preview.length ? 'Nothing to send' : undefined}>Send to payroll</Button>
          </div>
          <div style={{ fontSize: 13, color: T.dim }}>
            Adds one one-time deduction per person in {fmtMonth(month)}, tagged <code style={{ fontFamily: T.mono }}>{tag}</code>.
            Sending again <b>replaces</b> those rows, so nothing is deducted twice. {earlier > 0 ? <>There {earlier === 1 ? 'is' : 'are'} <b data-testid="earlier-rows">{earlier}</b> from an earlier send.</> : 'None have been sent for this month yet.'}
          </div>
          {locked && <Note tone="warn">The {fmtMonth(month)} payroll run is frozen or paid, so its adjustments are locked.</Note>}
          {sent && (
            <Note tone="ok" >
              <span data-testid="sent-banner">Sent on {fmtDate(sent.on)}: {sent.rows} deductions, {inr(sent.total)} a month.</span>{' '}
              <Link href="/dashboard/hrms/payroll?tab=adjustments" style={{ color: 'inherit', fontWeight: 700 }}>Open payroll adjustments</Link>
            </Note>
          )}
        </div>
      </Card>
      {confirming && (
        <ConfirmModal title="Send to payroll" confirmLabel="Send to payroll" onClose={() => setConfirming(false)} onConfirm={send}>
          <div>This writes <b>{preview.length}</b> one-time deductions totalling <b>{inr(sumOf('total'))}</b> a month into the sample payroll for <b>{fmtMonth(month)}</b>, each tagged <code style={{ fontFamily: T.mono }}>{tag}</code>.</div>
          <div>{earlier > 0 ? `${earlier} rows from an earlier send for this month are removed first.` : 'No earlier rows exist for this month.'} Other adjustments are not touched.</div>
          <Muted>Employees can reply to their deduction with HR before the run is frozen.</Muted>
        </ConfirmModal>
      )}
    </div>
  );
}
