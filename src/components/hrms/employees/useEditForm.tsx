'use client';
// One Edit / Save / Cancel workflow for the profile tabs: draft state, validation after the first attempt, unsaved-changes
// guard, discard confirmation and the inline "saved" note. Saving goes through saveEmployee() so the change log is written.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Employee } from '../../../lib/hrms/types';
import { saveEmployee } from '../../../lib/hrms/employeeActions';
import { whenSynced } from '../../../lib/hrms/live/store';
import { ConfirmDialog, useFlash, useReportDirty } from './shared';
import { employeeToDraft, type EmployeeDraft, type Errors } from './logic';

export interface EditForm {
  editing: boolean; d: EmployeeDraft; set: (patch: Partial<EmployeeDraft>) => void; errors: Errors; dirty: boolean; flash: string;
  start: () => void; cancel: () => void;
  /** Validate; on failure show the errors and focus the first one. */
  check: () => boolean;
  /** Write the patch and leave edit mode (no validation: call check() first). */
  commit: () => void;
  save: () => void;
  dialog: ReactNode;
}

export function useEditForm({ key, e, validate, toPatch }: {
  key: string; e: Employee; validate: (d: EmployeeDraft) => Errors; toPatch: (d: EmployeeDraft) => Partial<Employee>;
}): EditForm {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<EmployeeDraft>(() => employeeToDraft(e));
  const [tried, setTried] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [flash, doFlash] = useFlash();
  const baseline = useRef('');
  const committing = useRef(false);
  const dirty = editing && JSON.stringify(d) !== baseline.current;
  useReportDirty(key, dirty);

  const errors = useMemo<Errors>(() => (editing && tried ? validate(d) : {}), [editing, tried, d, validate]);

  const start = () => {
    const fresh = employeeToDraft(e);
    baseline.current = JSON.stringify(fresh);
    setD(fresh); setTried(false); setEditing(true);
  };
  const cancel = () => { if (dirty) setAskCancel(true); else setEditing(false); };
  const check = () => {
    setTried(true);
    const errs = validate(d);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return false;
    }
    return true;
  };
  const commit = () => {
    if (committing.current) return;
    committing.current = true;
    let n = 0;
    try { n = saveEmployee(e.id, toPatch(d)); } catch (err) { committing.current = false; throw err; }
    // Sample data: this runs at once. Live data: it runs when the server has answered. If the server refused the change it
    // has been undone and an error toast says why, so the form stays open with what was typed for another try.
    whenSynced((ok) => {
      committing.current = false;
      if (!ok) return;
      setEditing(false);
      doFlash(n ? `Saved. ${n === 1 ? '1 field' : `${n} fields`} changed and written to the change log.` : 'Nothing changed.');
    });
  };
  const save = () => { if (check()) commit(); };

  const dialog = askCancel ? (
    <ConfirmDialog title="Discard your changes?" confirmLabel="Discard changes" danger onClose={() => setAskCancel(false)} onConfirm={() => { setAskCancel(false); setEditing(false); }}>
      You have unsaved edits on this tab. They will be lost.
    </ConfirmDialog>
  ) : null;

  return { editing, d, set: (patch) => setD((prev) => ({ ...prev, ...patch })), errors, dirty, flash, start, cancel, check, commit, save, dialog };
}
