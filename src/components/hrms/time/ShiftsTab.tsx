'use client';
// Shift definitions: timing, break, grace and the hours that make a full or half day. The night flag is derived from
// the times, and a shift that people or roster days still use cannot be deleted.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, DataTable, Modal, Note, SearchBox, Toolbar, T, useIsCompact, type Col } from '../ui';
import { Field, FormGrid } from '../../ui';
import type { HrmsDb, Shift } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { remove, upsert } from '../../../lib/hrms/actions';
import { BlockedDialog, ConfirmDialog } from '../org/Confirm';
import { TextField, focusFirstInvalid, primaryStyle, srOnly } from '../org/formKit';
import { SHIFT_COLORS, crossesMidnight, durationText, emptyShiftForm, formToShift, paidMinutes, shiftToForm, spanMinutes, validateShift, type ShiftForm } from './timeLogic';


function usage(db: HrmsDb, shiftId: string) {
  const employees = db.employees.filter((e) => e.shiftId === shiftId && e.status !== 'exited').length;
  const rosterDays = db.roster.reduce((t, r) => t + r.days.filter((d) => d === shiftId).length, 0);
  return { employees, rosterDays };
}

export function ShiftsTab({ db }: { db: HrmsDb }) {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ edit?: Shift } | null>(null);
  const [confirm, setConfirm] = useState<Shift | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const rows = db.shifts.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));

  const askRemove = (s: Shift) => {
    const u = usage(db, s.id);
    if (u.employees || u.rosterDays) {
      const parts = [u.employees ? `${u.employees} employee${u.employees === 1 ? '' : 's'} as their shift` : '', u.rosterDays ? `${u.rosterDays} roster day${u.rosterDays === 1 ? '' : 's'}` : ''].filter(Boolean);
      setBlocked({ title: `Cannot delete ${s.name}`, body: `${s.name} is still used by ${parts.join(' and ')}. Move them to another shift first, then delete it.` });
    } else setConfirm(s);
  };

  const cols: Col<Shift>[] = [
    {
      key: 'name', label: 'Shift', sortValue: (s) => s.name.toLowerCase(), render: (s) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          {s.isNight && <Badge tone="info">Night</Badge>}
        </span>
      ),
    },
    {
      key: 'time', label: 'Timing', nowrap: true, sortValue: (s) => s.start,
      render: (s) => (
        <span style={{ fontFamily: T.mono, fontSize: 13 }}>
          {s.start} to {s.end}
          {crossesMidnight(s.start, s.end) ? <div style={{ fontSize: 11.5, color: T.mute }}>ends next day</div> : null}
        </span>
      ),
    },
    {
      key: 'paid', label: 'Paid duration', nowrap: true, sortValue: (s) => paidMinutes(s), render: (s) => {
        const p = paidMinutes(s);
        return (
          <span data-testid={`paid-${s.id}`}>
            {durationText(p)}
            {p < s.fullDayHours * 60 && <div style={{ fontSize: 12, color: T.warn, whiteSpace: 'normal' }}>Under the {s.fullDayHours} h full day</div>}
          </span>
        );
      },
    },
    { key: 'break', label: 'Break / grace', nowrap: true, sortValue: (s) => s.breakMinutes, render: (s) => `${s.breakMinutes} / ${s.graceMinutes} min` },
    { key: 'day', label: 'Full / half day', align: 'right', nowrap: true, sortValue: (s) => s.fullDayHours, render: (s) => `${s.fullDayHours} h / ${s.halfDayHours} h` },
    {
      key: 'used', label: 'People', align: 'right', sortValue: (s) => usage(db, s.id).employees, render: (s) => {
        const u = usage(db, s.id);
        return <span title={`${u.employees} ${u.employees === 1 ? 'person' : 'people'} and ${u.rosterDays} roster days`} style={{ fontVariantNumeric: 'tabular-nums' }}>{u.employees}</span>;
      },
    },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (s) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setModal({ edit: s })} aria-label={`Edit ${s.name}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => askRemove(s)} aria-label={`Delete ${s.name}`}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search shifts" />
        <div style={{ flex: 1 }} />
        <Button variant="primary" style={primaryStyle} onClick={() => setModal({})}>Add shift</Button>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={760} empty={db.shifts.length === 0 ? 'No shifts yet. Add the first one to start rostering.' : 'No shift matches this search.'} />
      <div style={{ fontSize: 12.5, color: T.mute }}>Paid duration is the time on duty less the unpaid break. Payroll divides pay by the full-day hours of each person&apos;s shift when it prices overtime.</div>

      {modal && <ShiftModal db={db} edit={modal.edit} onClose={() => setModal(null)} />}
      {confirm && (
        <ConfirmDialog title="Delete shift" confirmLabel="Delete shift" onCancel={() => setConfirm(null)}
          onConfirm={() => { remove('shifts', confirm.id); toast.success(`${confirm.name} deleted`); setConfirm(null); }}>
          Delete the shift <b>{confirm.name}</b> ({confirm.start} to {confirm.end})? Nobody is assigned to it.
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

function ShiftModal({ db, edit, onClose }: { db: HrmsDb; edit?: Shift; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [f, setF] = useState<ShiftForm>(edit ? shiftToForm(edit) : emptyShiftForm());
  const [tried, setTried] = useState(false);
  const formId = 'shift-form';
  const { errors, warnings } = validateShift(f, db.shifts.filter((s) => s.id !== edit?.id));
  const shown = (k: keyof ShiftForm) => (tried ? errors[k] : undefined);
  const set = (k: keyof ShiftForm) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const night = crossesMidnight(f.start, f.end);
  const span = spanMinutes(f.start, f.end);
  const paid = Math.max(0, span - (Number(f.breakMinutes) || 0));
  const palette = SHIFT_COLORS.some((c) => c.value.toLowerCase() === f.color.toLowerCase()) ? SHIFT_COLORS : [...SHIFT_COLORS, { value: f.color, name: 'Current colour' }];

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const saved = formToShift(f, edit?.id ?? uid('sh'));
    upsert('shifts', saved);
    toast.success(edit ? `${saved.name} updated` : `${saved.name} added`);
    onClose();
  };

  return (
    <Modal title={edit ? `Edit ${edit.name}` : 'Add shift'} onClose={onClose} width={640}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : 'Add shift'}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TextField label="Shift name" required value={f.name} onChange={set('name')} error={shown('name')} autoComplete="off" />
        <FormGrid narrow={narrow} columns={3}>
          <TextField label="Starts" required type="time" value={f.start} onChange={set('start')} error={shown('start')} />
          <TextField label="Ends" required type="time" value={f.end} onChange={set('end')} error={shown('end')} />
          <TextField label="Unpaid break (min)" required type="number" min={0} max={240} step={5} value={f.breakMinutes} onChange={set('breakMinutes')} error={shown('breakMinutes')} />
          <TextField label="Grace (min)" required type="number" min={0} max={120} value={f.graceMinutes} onChange={set('graceMinutes')} error={shown('graceMinutes')} hint="Late arrival allowed" />
          <TextField label="Full day (hours)" required type="number" min={1} max={16} step={0.5} value={f.fullDayHours} onChange={set('fullDayHours')} error={shown('fullDayHours')} />
          <TextField label="Half day (hours)" required type="number" min={0.5} max={16} step={0.5} value={f.halfDayHours} onChange={set('halfDayHours')} error={shown('halfDayHours')} />
        </FormGrid>
        <Field label="Colour" hint="Shown on the roster grid and legend.">
          <div role="radiogroup" aria-label="Shift colour" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {palette.map((c) => {
              const on = c.value.toLowerCase() === f.color.toLowerCase();
              return (
                <button key={c.value} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name} onClick={() => set('color')(c.value)}
                  style={{ width: 44, height: 36, borderRadius: T.radius.sm, background: c.value, cursor: 'pointer', border: `2px solid ${on ? T.text : 'transparent'}`, outline: on ? `2px solid ${T.card}` : 'none', outlineOffset: -4 }}>
                  <span style={srOnly}>{c.name}{on ? ', selected' : ''}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <div data-testid="shift-derived" aria-live="polite" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.raised, fontSize: 13.5, lineHeight: 1.6 }}>
          <div><b>Paid duration:</b> {span ? `${durationText(paid)} (${durationText(span)} on duty less ${Number(f.breakMinutes) || 0} min break)` : 'enter a start and end time'}</div>
          <div><b>Night shift:</b> {night ? 'Yes, it ends the next day' : 'No'} <span style={{ color: T.mute }}>(worked out from the times: a shift that ends before it starts runs past midnight)</span></div>
        </div>
        {warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        {tried && Object.keys(errors).length > 0 && <div role="alert" style={{ fontSize: 13, color: T.red }}>Fix the {Object.keys(errors).length} highlighted field{Object.keys(errors).length === 1 ? '' : 's'} to save.</div>}
      </form>
    </Modal>
  );
}
