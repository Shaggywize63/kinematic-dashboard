'use client';
// Small pieces used across the Assets tabs.

import type { ReactNode } from 'react';
import { Badge, T, type Tone } from '../../ui';
import { Select } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName } from '../../../../lib/hrms/format';
import type { Employee, HrmsDb, Id } from '../../../../lib/hrms/types';
import { CONDITION_LABEL, STATUS_LABEL, warrantyDaysLeft } from '../../../../lib/hrms/rewards/engines';
import type { Asset, AssetCondition, AssetStatus } from '../../../../lib/hrms/rewards/types';

export const STATUS_TONE: Record<AssetStatus, Tone> = { in_stock: 'info', issued: 'ok', in_repair: 'warn', lost: 'red', retired: 'neutral' };
export const COND_TONE: Record<AssetCondition, Tone> = { new: 'ok', good: 'ok', fair: 'neutral', poor: 'warn', damaged: 'red' };
export const CONDITIONS: AssetCondition[] = ['new', 'good', 'fair', 'poor', 'damaged'];

export const StatusPill = ({ status }: { status: AssetStatus }) => <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>;
export const ConditionPill = ({ c }: { c: AssetCondition }) => <Badge tone={COND_TONE[c]}>{CONDITION_LABEL[c]}</Badge>;

export const holderOf = (db: HrmsDb, a: Asset): Employee | undefined => (a.status === 'issued' && a.holderId ? db.employees.find((e) => e.id === a.holderId) : undefined);
export const nameOf = (db: HrmsDb, id: Id | undefined): string => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : '—'; };
export const deptNameOf = (db: HrmsDb, id: Id | undefined): string | undefined => {
  const e = db.employees.find((x) => x.id === id);
  return e ? db.departments.find((d) => d.id === e.departmentId)?.name : undefined;
};

export function WarrantyCell({ a }: { a: Asset }) {
  const left = warrantyDaysLeft(a, PREVIEW_TODAY);
  if (left == null) return <span style={{ color: T.mute }}>None</span>;
  const soon = left >= 0 && left <= 60;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span>{fmtDate(a.warrantyEnd)}</span>
      {left < 0 ? <Badge tone="neutral">Ended</Badge> : soon ? <Badge tone="warn">{left === 0 ? 'Ends today' : `${left} ${left === 1 ? 'day' : 'days'} left`}</Badge> : null}
    </span>
  );
}

/** People an asset can go to: working, on notice, or about to join. Leavers are not offered. */
export const recipients = (db: HrmsDb): Employee[] => db.employees.filter((e) => e.status !== 'exited').sort((a, b) => fullName(a).localeCompare(fullName(b)));

export function PersonSelect({ db, value, onChange, id, label, exclude }: { db: HrmsDb; value: string; onChange: (v: string) => void; id: string; label: string; exclude?: Id }): ReactNode {
  return (
    <Select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a person</option>
      {recipients(db).filter((e) => e.id !== exclude).map((e) => (
        <option key={e.id} value={e.id}>{fullName(e)} ({e.code}){e.status === 'onboarding' ? ', joining' : e.status === 'on_notice' ? ', on notice' : ''}</option>
      ))}
    </Select>
  );
}
