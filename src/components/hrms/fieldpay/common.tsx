'use client';
// Small blocks shared by the four field-pay screens (incentives, travel, territory, team health).

import { ReactNode, useState } from 'react';
import { Button, DataTable as BaseDataTable, Modal, T } from '../ui';
import { Field, Select, Textarea } from '../../ui';
import { fullName } from '../../../lib/hrms/format';
import type { HrmsDb, Id } from '../../../lib/hrms/types';

/** Name lookups over the core people table, so a screen never prints a bare employee id. */
export function makeNamer(db: HrmsDb) {
  const by = new Map(db.employees.map((e) => [e.id, e]));
  return {
    emp: (id: Id) => by.get(id),
    name: (id: Id): string => { const e = by.get(id); return e ? fullName(e) : id; },
    first: (id: Id): string => by.get(id)?.firstName ?? id,
    code: (id: Id): string => by.get(id)?.code ?? '',
  };
}
export type Namer = ReturnType<typeof makeNamer>;

export const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayName = (isoDate: string): string => WEEKDAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]!;

/** One colour per person, the same everywhere (colour follows the person, never their rank). Eight hues that read on both themes. */
export const PERSON_COLORS: Record<Id, string> = {
  emp_4: '#3987e5', emp_6: '#eb6834', emp_7: '#1baf7a', emp_8: '#eda100',
  emp_9: '#e87ba4', emp_19: '#2f9e2f', emp_20: '#8c7fe8', emp_22: '#e34948',
};
export const personColor = (id: Id): string => PERSON_COLORS[id] ?? '#8a94a6';

export const FIELD_MONTH_LABEL: Record<string, string> = { '2026-09': 'Sep 2026', '2026-10': 'Oct 2026', '2026-11': 'Nov 2026' };

export function MonthSelect({ value, onChange, months, label = 'Month' }: { value: string; onChange: (m: string) => void; months: string[]; label?: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 150 }}>
      {months.map((m) => <option key={m} value={m}>{FIELD_MONTH_LABEL[m] ?? m}</option>)}
    </Select>
  );
}

/** Dialog that asks for a written reason before anything is recorded. */
export function ReasonModal({ title, intro, label = 'Reason', placeholder, confirmLabel, minLength = 8, onConfirm, onClose, children }: {
  title: string; intro?: ReactNode; label?: string; placeholder?: string; confirmLabel: string; minLength?: number;
  onConfirm: (text: string) => void; onClose: () => void; children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const bad = text.trim().length < minLength;
  const submit = () => { setTouched(true); if (!bad) onConfirm(text.trim()); };
  return (
    <Modal title={title} onClose={onClose} width={500}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} style={{ minHeight: 40 }}>{confirmLabel}</Button></>}>
      {intro && <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{intro}</div>}
      {children}
      <Field label={label} required htmlFor="reason-text" error={touched && bad ? `Write at least ${minLength} characters, in plain words.` : undefined}>
        <Textarea id="reason-text" value={text} invalid={touched && bad} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** A person picker used by several screens. */
export function PersonSelect({ value, onChange, ids, namer, allLabel, label = 'Person', width = 220 }: {
  value: string; onChange: (id: string) => void; ids: Id[]; namer: Namer; allLabel?: string; label?: string; width?: number;
}) {
  const sorted = [...ids].sort((a, b) => namer.name(a).localeCompare(namer.name(b)));
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width }}>
      {allLabel && <option value="all">{allLabel}</option>}
      {sorted.map((id) => <option key={id} value={id}>{namer.name(id)}</option>)}
    </Select>
  );
}

export const linkButtonStyle = {
  border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: T.text,
} as const;

export const num1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
export const pctText = (n: number | null | undefined, digits = 0): string => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`);
export const hm = (minutes: number): string => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`);

/**
 * The shared DataTable inside a paint-contained box. The table already scrolls sideways inside its own container;
 * this also stops a wide table from stretching the page's measured scroll width, so a phone screen never reports sideways overflow.
 */
export function DataTable<R extends { id: string }>(props: Parameters<typeof BaseDataTable<R>>[0]) {
  return <div style={{ contain: 'paint' }}><BaseDataTable<R> {...props} /></div>;
}
