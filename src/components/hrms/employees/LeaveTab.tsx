'use client';
// Leave balances per leave type, from the leave balance rows and the leave type definitions.

import { Badge, Card, CardTitle, DataTable, EmptyState, Note, ProgressBar, T, type Col } from '../ui';
import type { Employee, HrmsDb, LeaveType } from '../../../lib/hrms/types';

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

function eligibility(t: LeaveType, e: Employee): string {
  if (t.audience !== 'all' && t.audience !== (e.gender === 'female' ? 'female' : e.gender === 'male' ? 'male' : 'none')) return `For ${t.audience} employees only`;
  if (t.accrual.mode === 'none') return 'No automatic accrual: granted when earned or approved';
  const when = t.accrual.mode === 'monthly' ? `${n(t.accrual.days)} days a month` : t.accrual.mode === 'yearly' ? `${n(t.accrual.days)} days a year` : `${n(t.accrual.days)} days on joining`;
  return `${when}${t.accrual.afterMonths ? `, after ${t.accrual.afterMonths} months of service` : ''}`;
}

export default function LeaveTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const bal = db.leaveBalances.filter((b) => b.employeeId === e.id);
  const rows = bal.map((b) => {
    const t = db.leaveTypes.find((x) => x.id === b.leaveTypeId);
    const available = b.opening + b.accrued - b.taken - b.encashed - b.lapsed;
    return { id: b.leaveTypeId, b, t, available };
  }).filter((r) => r.t);
  const others = db.leaveTypes.filter((t) => !bal.some((b) => b.leaveTypeId === t.id));

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'type', label: 'Leave type', sortValue: (r) => r.t!.name, render: (r) => <span><strong style={{ fontWeight: 600 }}>{r.t!.name}</strong> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5 }}>{r.t!.code}</span></span> },
    { key: 'paid', label: 'Pay', render: (r) => <Badge tone={r.t!.paid ? 'ok' : 'neutral'}>{r.t!.paid ? 'Paid' : 'Unpaid'}</Badge> },
    { key: 'opening', label: 'Opening', align: 'right', render: (r) => n(r.b.opening), sortValue: (r) => r.b.opening },
    { key: 'accrued', label: 'Accrued', align: 'right', render: (r) => n(r.b.accrued), sortValue: (r) => r.b.accrued },
    { key: 'taken', label: 'Taken', align: 'right', render: (r) => n(r.b.taken), sortValue: (r) => r.b.taken },
    { key: 'other', label: 'Encashed / lapsed', align: 'right', render: (r) => `${n(r.b.encashed)} / ${n(r.b.lapsed)}` },
    {
      key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.available,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 110 }}>
          <div style={{ width: 54 }}><ProgressBar pct={r.b.opening + r.b.accrued ? (r.available / (r.b.opening + r.b.accrued)) * 100 : 0} tone={r.available <= 0 ? 'red' : 'ok'} /></div>
          <strong data-testid={`balance-${r.t!.code}`} style={{ fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>{n(r.available)}</strong>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle>Leave balances</CardTitle>
        {rows.length === 0 ? (
          <EmptyState title="No leave balances on file" description={e.status === 'onboarding' ? 'Balances are set up once the employee is active.' : 'No leave balance rows exist for this employee in the sample data.'} />
        ) : (
          <>
            <DataTable columns={cols} rows={rows} minWidth={720} />
            <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Balance = opening + accrued - taken - encashed - lapsed, in days. Requests and approvals are on the Time and Leave page.</div>
          </>
        )}
      </Card>
      {others.length > 0 && rows.length > 0 && (
        <Card>
          <CardTitle>Other leave types</CardTitle>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
            {others.map((t) => (
              <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', fontSize: 13.5 }}>
                <span><strong style={{ fontWeight: 600 }}>{t.name}</strong> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5 }}>{t.code}</span></span>
                <span style={{ color: T.dim }}>{eligibility(t, e)}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10 }}><Note tone="info">These types have no balance row for this employee yet.</Note></div>
        </Card>
      )}
    </div>
  );
}
