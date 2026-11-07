'use client';
// Onboarding board: one column per stage, one card per joiner. Opening a card shows the checklist
// (toggle, add, remove tasks), a link to the profile, and "Mark as joined".

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, EmptyState, ProgressBar, SearchBox, Toolbar, T, useIsCompact } from '../ui';
import { Field, Input, Select } from '../../ui';
import { ConfirmDialog, CheckRow, Dialog, RemoveButton, isIsoDate, useOneShotParam, sectionTitle } from './common';
import NewJoinerModal from './NewJoinerModal';
import {
  ONBOARDING_STAGES, STAGE_LABEL, TASK_OWNERS, addTask, markJoined, removeTask, setOnboardingStage, setTaskDone,
} from '../../../lib/hrms/lifecycleActions';
import { TODAY, relDays } from '../overview/insights';
import { diffDays, fmtDate } from '../../../lib/hrms/format';
import type { HrmsDb, OnboardingCase } from '../../../lib/hrms/types';

const progress = (c: OnboardingCase) => ({ done: c.tasks.filter((t) => t.done).length, total: c.tasks.length });
const overdueTasks = (c: OnboardingCase) => c.tasks.filter((t) => !t.done && t.dueOn && t.dueOn < TODAY).length;

function joinLabel(c: OnboardingCase): { text: string; late: boolean } {
  if (c.stage === 'done') return { text: 'Joined', late: false };
  const d = diffDays(TODAY, c.joinDate);
  if (d < 0) return { text: `Join date passed ${-d} ${d === -1 ? 'day' : 'days'} ago`, late: true };
  return { text: d === 0 ? 'Joins today' : `Joins ${relDays(d)}`, late: false };
}

function CaseCard({ c, onOpen }: { c: OnboardingCase; onOpen: () => void }) {
  const p = progress(c);
  const jl = joinLabel(c);
  const late = overdueTasks(c);
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', padding: 12, border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{c.name}</span>
      <span style={{ fontSize: 12.5, color: T.dim, overflowWrap: 'anywhere' }}>{c.role}</span>
      <span style={{ fontSize: 12, color: T.dim }}>{fmtDate(c.joinDate)}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: jl.late ? T.red : T.dim }}>{jl.text}</span>
      <ProgressBar pct={p.total ? (p.done / p.total) * 100 : 0} tone={p.done === p.total && p.total > 0 ? 'ok' : 'info'} />
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 12, color: T.dim }}>
        <span>{p.done} of {p.total} tasks</span>
        {late > 0 && c.stage !== 'done' && <Badge tone="red">{late} overdue</Badge>}
      </span>
    </button>
  );
}

// ───────────────────────────── case detail ─────────────────────────────
function CaseDetail({ db, caseId, onClose }: { db: HrmsDb; caseId: string; onClose: () => void }) {
  const c = db.onboarding.find((x) => x.id === caseId);
  const uid = useId();
  const [label, setLabel] = useState('');
  const [owner, setOwner] = useState<string>('HR');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<{ label?: string; due?: string }>({});
  const [confirmJoin, setConfirmJoin] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  if (!c) return null;
  const emp = c.employeeId ? db.employees.find((e) => e.id === c.employeeId) : undefined;
  const p = progress(c);
  const open = p.total - p.done;
  const jl = joinLabel(c);
  const removingTask = c.tasks.find((t) => t.id === removing);

  function add() {
    const e: { label?: string; due?: string } = {};
    if (label.trim().length < 3) e.label = 'Describe the task in a few words';
    else if (label.trim().length > 120) e.label = 'Keep it under 120 characters';
    else if (c!.tasks.some((t) => t.label.toLowerCase() === label.trim().toLowerCase())) e.label = 'This task is already on the list';
    if (due && !isIsoDate(due)) e.due = 'Enter a valid date';
    setErrors(e);
    if (e.label || e.due) return;
    addTask(c!.id, { label, owner, dueOn: due || undefined });
    setLabel(''); setDue('');
    toast.success('Task added.');
  }

  return (
    <Dialog title={`Onboarding: ${c.name}`} width={760} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} style={{ height: 44 }}>Close</Button>
          {c.stage === 'done'
            ? <Badge tone="ok" dot>Joined</Badge>
            : <Button variant="primary" onClick={() => setConfirmJoin(true)} style={{ height: 44 }}>Mark as joined</Button>}
        </>
      )}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{c.role}</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 2 }}>Joining {fmtDate(c.joinDate)} · <span style={{ color: jl.late ? T.red : undefined, fontWeight: jl.late ? 600 : undefined }}>{jl.text}</span></div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 2 }}>
            {emp
              ? <>Employee record {emp.code} is <b style={{ color: T.text }}>{emp.status.replace('_', ' ')}</b>. <Link href={`/dashboard/hrms/employees/${emp.id}`} style={{ color: T.info, fontWeight: 600 }}>Open employee profile</Link></>
              : 'No employee record is linked to this case.'}
          </div>
        </div>
        <div style={{ width: 220, maxWidth: '100%' }}>
          <Field label="Stage" htmlFor={`${uid}-stage`}>
            <Select id={`${uid}-stage`} value={c.stage} disabled={c.stage === 'done'} onChange={(e) => setOnboardingStage(c.id, e.target.value as OnboardingCase['stage'])}>
              {ONBOARDING_STAGES.map((s) => <option key={s} value={s} disabled={s === 'done' && c.stage !== 'done'}>{STAGE_LABEL[s]}{s === 'done' && c.stage !== 'done' ? ' (use Mark as joined)' : ''}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      <section aria-labelledby={`${uid}-list`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <h3 id={`${uid}-list`} style={sectionTitle}>Checklist</h3>
          <span style={{ fontSize: 12.5, color: T.dim }}>{p.done} of {p.total} done</span>
        </div>
        <ProgressBar pct={p.total ? (p.done / p.total) * 100 : 0} tone={open === 0 && p.total > 0 ? 'ok' : 'info'} />
        {c.tasks.length === 0 ? <EmptyState title="No tasks" description="Add the first task below." style={{ padding: '20px 8px' }} /> : (
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
            {c.tasks.map((t, i) => {
              const late = !t.done && !!t.dueOn && t.dueOn < TODAY;
              return (
                <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: i ? `1px solid ${T.border}` : 0 }}>
                  <CheckRow checked={t.done} onChange={(v) => setTaskDone(c.id, t.id, v)}>
                    <span style={{ fontSize: 13.5, color: t.done ? T.mute : T.text, textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                  </CheckRow>
                  <Badge>{t.owner}</Badge>
                  {t.dueOn && <span style={{ fontSize: 12, color: late ? T.red : T.dim, fontWeight: late ? 600 : 400, whiteSpace: 'nowrap' }}>{late ? 'Overdue, ' : 'Due '}{fmtDate(t.dueOn)}</span>}
                  <RemoveButton label={`Remove task: ${t.label}`} onClick={() => setRemoving(t.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${uid}-add`} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
        <h3 id={`${uid}-add`} style={{ ...sectionTitle, marginBottom: 10 }}>Add a task</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'start' }}>
          <Field label="Task" htmlFor={`${uid}-label`} error={errors.label} style={{ gridColumn: 'span 2' }}>
            <Input id={`${uid}-label`} value={label} invalid={!!errors.label} placeholder="e.g. Collect address proof" onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </Field>
          <Field label="Owner" htmlFor={`${uid}-owner`}>
            <Select id={`${uid}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)}>{TASK_OWNERS.map((o) => <option key={o}>{o}</option>)}</Select>
          </Field>
          <Field label="Due date" htmlFor={`${uid}-due`} error={errors.due}>
            <Input id={`${uid}-due`} type="date" value={due} invalid={!!errors.due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}><Button onClick={add} style={{ height: 44 }}>Add task</Button></div>
      </section>

      {confirmJoin && (
        <ConfirmDialog title="Confirm joining" confirmLabel="Mark as joined" onCancel={() => setConfirmJoin(false)}
          onConfirm={() => { markJoined(c.id); setConfirmJoin(false); toast.success(`${c.name} is marked as joined and the employee is now active.`); onClose(); }}>
          <span>{c.name}&rsquo;s employee record changes from Onboarding to Active, and this case moves to Done.</span>
          {open > 0 && <span style={{ color: T.warn }}>{open} {open === 1 ? 'task is' : 'tasks are'} still open.</span>}
          {diffDays(TODAY, c.joinDate) > 0 && <span style={{ color: T.warn }}>The join date, {fmtDate(c.joinDate)}, is {relDays(diffDays(TODAY, c.joinDate))}.</span>}
        </ConfirmDialog>
      )}
      {removingTask && (
        <ConfirmDialog title="Remove task" danger confirmLabel="Remove" onCancel={() => setRemoving(null)}
          onConfirm={() => { removeTask(c.id, removingTask.id); setRemoving(null); }}>
          <span>Remove &ldquo;{removingTask.label}&rdquo; from {c.name}&rsquo;s checklist?</span>
        </ConfirmDialog>
      )}
    </Dialog>
  );
}

// ───────────────────────────── the tab ─────────────────────────────
export default function OnboardingTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useOneShotParam('new', () => setAdding(true));

  const needle = q.trim().toLowerCase();
  const cases = useMemo(() => db.onboarding.filter((c) => !needle || `${c.name} ${c.role}`.toLowerCase().includes(needle)), [db.onboarding, needle]);
  const closeDetail = useMemo(() => () => setOpenId(null), []);
  const closeAdd = useMemo(() => () => setAdding(false), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search joiners by name or role" width={320} />
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" onClick={() => setAdding(true)} style={{ height: 44 }}>New joiner</Button></div>
      </Toolbar>

      {db.onboarding.length === 0 ? (
        <Card><EmptyState title="No joiners yet" description="Add a joiner to create the employee record and the joining checklist together."
          action={<Button variant="primary" onClick={() => setAdding(true)} style={{ height: 44 }}>New joiner</Button>} /></Card>
      ) : (
        <>
          {needle && cases.length === 0 && <div role="status" style={{ fontSize: 13, color: T.dim }}>No joiner matches &ldquo;{q}&rdquo;.</div>}
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(6, minmax(158px, 1fr))', gap: 10, alignItems: 'start' }}>
              {ONBOARDING_STAGES.map((stage) => {
                const col = cases.filter((c) => c.stage === stage).sort((a, b) => (stage === 'done' ? (a.joinDate < b.joinDate ? 1 : -1) : (a.joinDate < b.joinDate ? -1 : 1)));
                return (
                  <section key={stage} aria-label={`${STAGE_LABEL[stage]}, ${col.length} ${col.length === 1 ? 'case' : 'cases'}`}
                    style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: narrow ? undefined : 120 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.dim }}>
                      {STAGE_LABEL[stage]}
                      <span style={{ background: T.raised, borderRadius: 999, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{col.length}</span>
                    </h3>
                    {col.length === 0
                      ? <div style={{ fontSize: 12.5, color: T.mute, padding: '6px 2px' }}>No one here</div>
                      : col.map((c) => <CaseCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} />)}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {openId && <CaseDetail db={db} caseId={openId} onClose={closeDetail} />}
      {adding && <NewJoinerModal db={db} onClose={closeAdd} onCreated={() => setAdding(false)} />}
    </div>
  );
}
