'use client';
// Org chart dialogs: change a person's manager (choose, then confirm with a before/after) and add an open role.

import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Modal, Note, T } from '../ui';
import { Field, Input, Select } from '../../ui';
import type { Employee, HrmsDb, Id } from '../../../lib/hrms/types';
import { fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { canReportTo, subtreeIds, validManagers } from '../../../lib/hrms/assist/orgChart';
import { addVacancy, changeManager } from '../../../lib/hrms/assist/store';

const NONE = '__none__';

export function ChangeManagerModal({ db, person, onClose, onDone }: { db: HrmsDb; person: Employee; onClose: () => void; onDone: (newManagerId: Id | undefined) => void }) {
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const current = person.reportingToId && person.reportingToId !== person.id ? db.employees.find((e) => e.id === person.reportingToId) : undefined;
  const selfRefAtStart = person.reportingToId === person.id;
  const [pick, setPick] = useState<string>(selfRefAtStart ? '' : current?.id ?? NONE);
  const options = validManagers(db.employees, person.id);
  const blocked = subtreeIds(db.employees, person.id).size;
  const needsChoice = pick === '';
  const next = pick === NONE || pick === '' ? undefined : db.employees.find((e) => e.id === pick);
  const check = canReportTo(db.employees, person.id, next?.id);
  const des = (e?: Employee) => (e ? db.designations.find((d) => d.id === e.designationId)?.name ?? '' : '');
  const unchanged = (next?.id ?? null) === (current?.id ?? null) && person.reportingToId !== person.id;
  const selfRef = person.reportingToId === person.id;
  const label = (e?: Employee) => (e ? `${fullName(e)} (${des(e)})` : 'No manager (top of the chart)');

  const apply = () => {
    const r = changeManager(person.id, next?.id);
    if (!r.ok) { toast.error(r.reason ?? 'That change is not allowed'); return; }
    toast.success(`${fullName(person)} now reports to ${next ? fullName(next) : 'no one'}. It is in the change log.`);
    onDone(next?.id);
    onClose();
  };

  return (
    <Modal title={step === 'choose' ? `Change manager: ${fullName(person)}` : 'Confirm the change'} onClose={onClose} width={520}
      footer={step === 'choose'
        ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="mgr-continue" disabled={needsChoice || unchanged || !check.ok} title={needsChoice ? 'Choose a manager first' : unchanged ? 'Pick a different manager first' : check.reason} onClick={() => setStep('confirm')}>Review the change</Button></>
        : <><Button onClick={() => setStep('choose')}>Back</Button><Button variant="primary" data-testid="mgr-confirm" onClick={apply}>Confirm change</Button></>}>
      {step === 'choose' ? (
        <>
          {selfRef && <Note tone="warn">{fullName(person)} is recorded as reporting to themselves, which looks like a data mistake. Pick the right manager to fix it.</Note>}
          <Field label="New manager" htmlFor="mgr-pick" error={!check.ok ? check.reason : undefined} hint={blocked ? `${blocked} ${blocked === 1 ? 'person who reports' : 'people who report'} to ${person.firstName}, directly or through others, are not listed. Choosing them would make a loop.` : undefined}>
            <Select id="mgr-pick" data-testid="mgr-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              {needsChoice && <option value="" disabled>Choose a manager</option>}
              <option value={NONE}>No manager (top of the chart)</option>
              {options.map((e) => <option key={e.id} value={e.id}>{fullName(e)}, {des(e)}</option>)}
            </Select>
          </Field>
          <div style={{ fontSize: 13, color: T.dim }}>Now: {selfRef ? 'reports to themselves (data mistake)' : label(current)}</div>
        </>
      ) : (
        <>
          <div data-testid="mgr-summary" style={{ display: 'grid', gap: 10 }}>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12 }}>
              <div style={{ fontSize: 12, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Before</div>
              <div data-testid="mgr-before" style={{ fontSize: 14.5, marginTop: 2 }}>{fullName(person)} reports to {selfRef ? 'themselves (data mistake)' : label(current)}</div>
            </div>
            <div aria-hidden style={{ textAlign: 'center', color: T.mute }}>↓</div>
            <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: T.radius.md, padding: 12, background: T.raised }}>
              <div style={{ fontSize: 12, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>After</div>
              <div data-testid="mgr-after" style={{ fontSize: 14.5, marginTop: 2 }}>{fullName(person)} reports to {label(next)}</div>
            </div>
          </div>
          <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.5 }}>
            {fullName(person)}&apos;s own team stays with them. The Employees page shows the new manager, and the change log on their record notes who changed it.
          </div>
        </>
      )}
    </Modal>
  );
}

export function VacancyModal({ db, managerId, onClose }: { db: HrmsDb; managerId?: Id; onClose: () => void }) {
  const mgrs = db.employees.filter((e) => e.status !== 'exited').sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const [title, setTitle] = useState('');
  const [mgr, setMgr] = useState(managerId ?? 'emp_4');
  const [dept, setDept] = useState(db.employees.find((e) => e.id === (managerId ?? 'emp_4'))?.departmentId ?? db.departments[0]!.id);
  const [loc, setLoc] = useState(db.employees.find((e) => e.id === (managerId ?? 'emp_4'))?.locationId ?? db.locations[0]!.id);
  const [month, setMonth] = useState('2027-01');
  const [touched, setTouched] = useState(false);
  const errs: Record<string, string> = {};
  if (title.trim().length < 3) errs.title = 'Give the role a title, for example Field Executive.';
  if (month && month < PREVIEW_TODAY.slice(0, 7)) errs.month = 'The planned month cannot be in the past.';
  const save = () => {
    setTouched(true);
    if (Object.keys(errs).length) return;
    addVacancy({ title: title.trim(), managerId: mgr, departmentId: dept, locationId: loc, targetMonth: month || undefined });
    toast.success(`Open role added: ${title.trim()}`);
    onClose();
  };
  return (
    <Modal title="Add an open role" onClose={onClose} width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="vac-save" onClick={save}>Add open role</Button></>}>
      <Field label="Role title" required htmlFor="vac-title" error={touched ? errs.title : undefined}><Input id="vac-title" data-testid="vac-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={touched && !!errs.title} /></Field>
      <Field label="Reports to" htmlFor="vac-mgr">
        <Select id="vac-mgr" value={mgr} onChange={(e) => setMgr(e.target.value)}>{mgrs.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
      </Field>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
        <Field label="Department" htmlFor="vac-dept"><Select id="vac-dept" value={dept} onChange={(e) => setDept(e.target.value)}>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Location" htmlFor="vac-loc"><Select id="vac-loc" value={loc} onChange={(e) => setLoc(e.target.value)}>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
      </div>
      <Field label="Planned for (month)" htmlFor="vac-month" error={touched ? errs.month : undefined}><Input id="vac-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} invalid={touched && !!errs.month} /></Field>
      <Note>An open role is a plan, not a job post. It is drawn under the manager so you can see where the team will grow. It does not create an employee.</Note>
    </Modal>
  );
}
