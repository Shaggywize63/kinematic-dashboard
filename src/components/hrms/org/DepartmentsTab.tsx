'use client';
// Departments and designations: plain lists with headcount. A row cannot be removed while any employee still has it.

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, DataTable, Modal, SearchBox, Toolbar, T, type Col } from '../ui';
import type { Department, Designation, Employee, HrmsDb } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { fullName } from '../../../lib/hrms/format';
import { remove, upsert } from '../../../lib/hrms/actions';
import { usageOf, usageText, validateName } from './orgLogic';
import { BlockedDialog, ConfirmDialog } from './Confirm';
import { SelectField, TextField, focusFirstInvalid, primaryStyle } from './formKit';

type Kind = 'department' | 'designation';
interface Row { id: string; name: string; headId?: string; grade?: string }
interface Form { name: string; headId: string; grade: string }

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const;

function ListTab({ db, kind }: { db: HrmsDb; kind: Kind }) {
  const dept = kind === 'department';
  const rows: Row[] = dept ? db.departments : db.designations;
  const key = dept ? 'departmentId' : 'designationId';
  const noun = dept ? 'Department' : 'Designation';
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ edit?: Row } | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const people = (id: string) => usageOf(db.employees, key, id).current;
  const headOf = (id?: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : undefined; };
  const shown = rows.filter((r) => `${r.name} ${r.grade ?? ''} ${headOf(r.headId) ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  const askRemove = (r: Row) => {
    const u = usageOf(db.employees, key, r.id);
    if (u.total > 0) setBlocked({ title: `Cannot remove ${r.name}`, body: `${usageText(u)} still ${u.total === 1 ? 'has' : 'have'} the ${noun.toLowerCase()} ${r.name}. Reassign them first, then remove it.` });
    else setConfirm(r);
  };

  const cols: Col<Row>[] = [
    { key: 'name', label: noun, sortValue: (r) => r.name.toLowerCase(), render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    dept
      ? { key: 'head', label: 'Department head', sortValue: (r) => headOf(r.headId) ?? '', render: (r) => headOf(r.headId) ?? <span style={{ color: T.mute }}>Not set</span> }
      : { key: 'grade', label: 'Grade', sortValue: (r) => r.grade ?? '', render: (r) => (r.grade ? <span style={{ fontFamily: T.mono }}>{r.grade}</span> : <span style={{ color: T.mute }}>—</span>) },
    { key: 'people', label: 'Headcount', align: 'right', sortValue: (r) => people(r.id), render: (r) => <span data-testid={`headcount-${r.id}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{people(r.id)}</span> },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setModal({ edit: r })} aria-label={`Edit ${r.name}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => askRemove(r)} aria-label={`Remove ${r.name}`}>Remove</Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${dept ? 'departments' : 'designations'}`} />
        <div style={{ flex: 1 }} />
        <Button variant="primary" style={primaryStyle} onClick={() => setModal({})}>Add {noun.toLowerCase()}</Button>
      </Toolbar>
      <DataTable columns={cols} rows={shown} minWidth={560}
        empty={rows.length === 0 ? `No ${dept ? 'departments' : 'designations'} yet.` : 'Nothing matches this search.'} />
      <div style={{ fontSize: 12.5, color: T.mute }}>Headcount counts people who have not exited. Exited employees keep their {noun.toLowerCase()} for history and also block removal.</div>

      {modal && <RowModal db={db} kind={kind} edit={modal.edit} onClose={() => setModal(null)} />}
      {confirm && (
        <ConfirmDialog title={`Remove ${noun.toLowerCase()}`} confirmLabel={`Remove ${noun.toLowerCase()}`} onCancel={() => setConfirm(null)}
          onConfirm={() => { remove(dept ? 'departments' : 'designations', confirm.id); toast.success(`${confirm.name} removed`); setConfirm(null); }}>
          Remove the {noun.toLowerCase()} <b>{confirm.name}</b>? Nobody has it.
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

function RowModal({ db, kind, edit, onClose }: { db: HrmsDb; kind: Kind; edit?: Row; onClose: () => void }) {
  const dept = kind === 'department';
  const noun = dept ? 'Department' : 'Designation';
  const [f, setF] = useState<Form>({ name: edit?.name ?? '', headId: edit?.headId ?? '', grade: edit?.grade ?? '' });
  const [tried, setTried] = useState(false);
  const formId = 'org-list-form';
  const others = (dept ? db.departments : db.designations).filter((r) => r.id !== edit?.id).map((r) => r.name);
  const nameErr = validateName(f.name, others, noun);
  const gradeErr = f.grade.trim().length > 12 ? 'Grade is short, like M2 or E3' : undefined;
  const candidates: Employee[] = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice' || e.id === edit?.headId).sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (nameErr || gradeErr) { focusFirstInvalid(formId); return; }
    if (dept) {
      const item: Department = { id: edit?.id ?? uid('dep'), name: f.name.trim(), headId: f.headId || undefined };
      upsert('departments', item);
    } else {
      const item: Designation = { id: edit?.id ?? uid('des'), name: f.name.trim(), grade: f.grade.trim() || undefined };
      upsert('designations', item);
    }
    toast.success(edit ? `${f.name.trim()} updated` : `${f.name.trim()} added`);
    onClose();
  };

  let extra: ReactNode;
  if (dept) {
    extra = (
      <SelectField label="Department head" value={f.headId} onChange={(v) => setF((p) => ({ ...p, headId: v }))} hint="Optional. Leave blank if the department has no single head.">
        <option value="">Not set</option>
        {candidates.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
      </SelectField>
    );
  } else {
    extra = <TextField label="Grade" value={f.grade} onChange={(v) => setF((p) => ({ ...p, grade: v }))} error={tried ? gradeErr : undefined} hint="Optional. Used for bands and leave rules, like M2, E3 or W1." maxLength={12} />;
  }

  return (
    <Modal title={edit ? `Edit ${edit.name}` : `Add ${noun.toLowerCase()}`} onClose={onClose} width={480}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : `Add ${noun.toLowerCase()}`}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TextField label={`${noun} name`} required value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} error={tried ? nameErr : undefined} autoComplete="off" />
        {extra}
      </form>
    </Modal>
  );
}

export const DepartmentsTab = ({ db }: { db: HrmsDb }) => <ListTab db={db} kind="department" />;
export const DesignationsTab = ({ db }: { db: HrmsDb }) => <ListTab db={db} kind="designation" />;
