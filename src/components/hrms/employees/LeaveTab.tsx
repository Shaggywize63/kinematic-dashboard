'use client';
// Leave balances per leave type, from the leave balance rows and the leave type definitions.
// The master admin can edit a balance per leave type, or add one for a type that has none yet: the editor routes through
// setLeaveBalance (actions.ts), which in live mode diff-syncs a PUT /time/balances/:emp/:type and in sample mode writes the store.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, Modal, Note, ProgressBar, T, useIsCompact, type Col } from '../ui';
import { FormGrid, Section } from '../../ui';
import { TextField, SelectField, focusFirstInvalid, primaryStyle, srOnly } from '../org/formKit';
import { setLeaveBalance, type LeaveBalanceValues } from '../../../lib/hrms/actions';
import type { Employee, HrmsDb, LeaveBalance, LeaveType } from '../../../lib/hrms/types';

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

function eligibility(t: LeaveType, e: Employee): string {
  if (t.audience !== 'all' && t.audience !== (e.gender === 'female' ? 'female' : e.gender === 'male' ? 'male' : 'none')) return `For ${t.audience} employees only`;
  if (t.accrual.mode === 'none') return 'No automatic accrual: granted when earned or approved';
  const when = t.accrual.mode === 'monthly' ? `${n(t.accrual.days)} days a month` : t.accrual.mode === 'yearly' ? `${n(t.accrual.days)} days a year` : `${n(t.accrual.days)} days on joining`;
  return `${when}${t.accrual.afterMonths ? `, after ${t.accrual.afterMonths} months of service` : ''}`;
}

export default function LeaveTab({ e, db }: { e: Employee; db: HrmsDb }) {
  // `modal` open with no leaveTypeId means "add, pick a type"; with one means "edit (or add) that type".
  const [modal, setModal] = useState<{ leaveTypeId?: string } | null>(null);
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
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true,
      render: (r) => <Button size="sm" data-testid={`edit-balance-${r.t!.code}`} aria-label={`Edit ${r.t!.name} balance`} onClick={() => setModal({ leaveTypeId: r.id })}>Edit</Button>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle right={<Button size="sm" variant="primary" data-testid="add-balance" disabled={others.length === 0} onClick={() => setModal({})} title={others.length === 0 ? 'Every leave type already has a balance' : undefined}>Add balance</Button>}>
          Leave balances
        </CardTitle>
        {rows.length === 0 ? (
          <EmptyState title="No leave balances on file" description={e.status === 'onboarding' ? 'Balances are set up once the employee is active. You can still add one now.' : 'No leave balance rows exist for this employee in the sample data. Add one to get started.'} />
        ) : (
          <>
            <DataTable columns={cols} rows={rows} minWidth={780} />
            <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Balance = opening + accrued - taken - encashed - lapsed, in days. Requests and approvals are on the Time and Leave page.</div>
          </>
        )}
      </Card>
      {others.length > 0 && rows.length > 0 && (
        <Card>
          <CardTitle>Other leave types</CardTitle>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
            {others.map((t) => (
              <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
                <span style={{ minWidth: 0 }}><strong style={{ fontWeight: 600 }}>{t.name}</strong> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5 }}>{t.code}</span></span>
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: T.dim }}>{eligibility(t, e)}</span>
                  <Button size="sm" data-testid={`add-balance-${t.code}`} aria-label={`Add ${t.name} balance`} onClick={() => setModal({ leaveTypeId: t.id })}>Add balance</Button>
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10 }}><Note tone="info">These types have no balance row for this employee yet.</Note></div>
        </Card>
      )}
      {modal && <LeaveBalanceModal e={e} db={db} leaveTypeId={modal.leaveTypeId} onClose={() => setModal(null)} />}
    </div>
  );
}

const FIELDS = ['opening', 'accrued', 'taken', 'encashed', 'lapsed'] as const;
type FieldKey = (typeof FIELDS)[number];
type BalanceForm = Record<FieldKey, string>;

const parse = (s: string): number => (s.trim() === '' ? NaN : Number(s));
const fieldError = (s: string): string | undefined => {
  const x = parse(s);
  if (!Number.isFinite(x)) return 'Enter a number';
  if (x < 0) return 'Days cannot be negative';
  return undefined;
};
const amount = (s: string): number => { const x = parse(s); return Number.isFinite(x) && x >= 0 ? x : 0; };

function LeaveBalanceModal({ e, db, leaveTypeId, onClose }: { e: Employee; db: HrmsDb; leaveTypeId?: string; onClose: () => void }) {
  const narrow = useIsCompact(560);
  const formId = 'leave-balance-form';
  // Leave types this employee has no balance in — the only ones offered when adding without a fixed type.
  const withoutBalance = useMemo(
    () => db.leaveTypes.filter((t) => !db.leaveBalances.some((b) => b.employeeId === e.id && b.leaveTypeId === t.id)),
    [db.leaveTypes, db.leaveBalances, e.id],
  );
  const [selected, setSelected] = useState<string>(leaveTypeId ?? withoutBalance[0]?.id ?? '');
  const existing: LeaveBalance | undefined = db.leaveBalances.find((b) => b.employeeId === e.id && b.leaveTypeId === selected);
  // The field values are seeded once from the balance under the leave type the editor opened on (or zeros when adding).
  const [f, setF] = useState<BalanceForm>(() => {
    const start = leaveTypeId ? db.leaveBalances.find((b) => b.employeeId === e.id && b.leaveTypeId === leaveTypeId) : undefined;
    return start
      ? { opening: String(start.opening), accrued: String(start.accrued), taken: String(start.taken), encashed: String(start.encashed), lapsed: String(start.lapsed) }
      : { opening: '0', accrued: '0', taken: '0', encashed: '0', lapsed: '0' };
  });
  const [tried, setTried] = useState(false);

  const type = db.leaveTypes.find((t) => t.id === selected);
  const set = (k: FieldKey, v: string) => setF((p) => ({ ...p, [k]: v }));
  const errors = Object.fromEntries(FIELDS.map((k) => [k, fieldError(f[k])] as const)) as Record<FieldKey, string | undefined>;
  const hasError = FIELDS.some((k) => errors[k]) || !type;
  const available = amount(f.opening) + amount(f.accrued) - amount(f.taken) - amount(f.encashed) - amount(f.lapsed);
  const isEdit = !!existing;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (hasError) { focusFirstInvalid(formId); return; }
    const values: LeaveBalanceValues = { opening: amount(f.opening), accrued: amount(f.accrued), taken: amount(f.taken), encashed: amount(f.encashed), lapsed: amount(f.lapsed) };
    setLeaveBalance(e.id, selected, values);
    toast.success(`${type!.name} balance ${isEdit ? 'updated' : 'added'} for ${e.firstName}`);
    onClose();
  };

  const title = leaveTypeId
    ? `${isEdit ? 'Edit' : 'Add'} ${type?.name ?? 'leave'} balance`
    : 'Add leave balance';

  const label: Record<FieldKey, string> = { opening: 'Opening', accrued: 'Accrued', taken: 'Taken', encashed: 'Encashed', lapsed: 'Lapsed' };

  return (
    <Modal title={title} onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle} disabled={hasError}>{isEdit ? 'Save balance' : 'Add balance'}</Button></>}>
      <div style={{ fontSize: 13, color: T.dim }}>Balances for <strong style={{ color: T.text }}>{e.firstName} {e.lastName}</strong>, in days.</div>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
        <Section eyebrow="Leave type" first>
          {leaveTypeId ? (
            <div style={{ fontSize: 14, color: T.text }}>
              <strong style={{ fontWeight: 600 }}>{type?.name}</strong> <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 12 }}>{type?.code}</span>
              {isEdit ? <Badge tone="info">Editing existing balance</Badge> : null}
            </div>
          ) : withoutBalance.length === 0 ? (
            <Note tone="info">Every leave type already has a balance for this employee. Edit one from the table instead.</Note>
          ) : (
            <SelectField label="Leave type" value={selected} onChange={setSelected}>
              {withoutBalance.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </SelectField>
          )}
        </Section>
        <Section eyebrow="Days">
          <FormGrid narrow={narrow} columns={3}>
            {FIELDS.map((k) => (
              <TextField key={k} label={label[k]} type="number" min={0} step={0.5} inputMode="decimal"
                value={f[k]} onChange={(v) => set(k, v)} error={tried || f[k].trim() !== '' ? errors[k] : undefined} />
            ))}
          </FormGrid>
          <div data-testid="balance-available" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: T.radius.md, background: T.raised, border: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, color: T.dim }}>Available = opening + accrued − taken − encashed − lapsed</span>
            <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: available < 0 ? T.red : T.text }}>{n(available)}</strong>
          </div>
        </Section>
        {tried && hasError && <div role="alert" style={{ fontSize: 13, color: T.red }}>Fix the highlighted field{FIELDS.filter((k) => errors[k]).length === 1 ? '' : 's'} to save. Days cannot be negative.</div>}
      </form>
    </Modal>
  );
}
