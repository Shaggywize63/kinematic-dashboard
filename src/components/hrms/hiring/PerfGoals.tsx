'use client';
// Goals, OKR style: an objective has key results with a start, a target and a current value. Status is worked out from
// progress against the time that has passed (using today's date), never typed in. Team roll-up sits at the top.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, Modal, Note, ProgressBar, T, type Col } from '../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { Goal, HiringState, KeyResult, KrUnit } from '../../../lib/hrms/hiring/types';
import { STATUS_BANDS, goalStatus, krProgress, personProgress, teamRollups, validateGoal, weightTotal } from '../../../lib/hrms/hiring/perfEngines';
import { addProgress, deleteGoal, saveGoal } from '../../../lib/hrms/hiring/store';
import { Lead, Row, empName, report, subtle, toast, mono } from './shared';
import { ProgressWithClock, STATUS_TONE, StatusPill, fmtVal, participants } from './perfShared';

const UNITS: KrUnit[] = ['count', '₹', '%', 'days'];

export default function PerfGoals({ db, st }: { db: HrmsDb; st: HiringState }) {
  const people = participants(db, st);
  const reports = Object.fromEntries(st.reviews.map((r) => [r.employeeId, r.managerId]));
  const rollups = teamRollups(st.goals, reports, PREVIEW_TODAY).filter((r) => r.withGoals > 0);
  const [team, setTeam] = useState('all');
  const inTeam = people.filter((p) => team === 'all' || p.review.managerId === team);
  const withGoals = (id: string) => st.goals.filter((g) => g.employeeId === id);
  const firstWith = inTeam.find((p) => withGoals(p.review.employeeId).length > 0)?.review.employeeId ?? inTeam[0]?.review.employeeId ?? '';
  const [personRaw, setPerson] = useState<string>('');
  const person = inTeam.some((p) => p.review.employeeId === personRaw) ? personRaw : firstWith;
  const goals = withGoals(person);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [updating, setUpdating] = useState<{ goal: Goal; kr: KeyResult } | null>(null);

  type RU = (typeof rollups)[number] & { id: string };
  const cols: Col<RU>[] = [
    { key: 'm', label: 'Manager', sortValue: (r) => empName(db, r.managerId), render: (r) => <button type="button" onClick={() => { setTeam(r.managerId); setPerson(''); }} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, color: T.info }} aria-label={`Show the team of ${empName(db, r.managerId)}`}>{empName(db, r.managerId)}</button> },
    { key: 'p', label: 'People with goals', align: 'right', nowrap: true, render: (r) => `${r.withGoals} of ${r.people}` },
    { key: 'pr', label: 'Average progress', width: 220, sortValue: (r) => r.progress, render: (r) => <Row gap={8} wrap={false}><div style={{ flex: 1 }}><ProgressBar pct={r.progress} tone="info" /></div><span style={{ ...mono, fontSize: 12.5, minWidth: 42, textAlign: 'right' }}>{r.progress}%</span></Row> },
    { key: 's', label: 'Goals by status', render: (r) => <Row gap={4}>{r.counts.done > 0 && <Badge tone="ok">{r.counts.done} done</Badge>}{r.counts.on_track > 0 && <Badge tone="ok">{r.counts.on_track} on track</Badge>}{r.counts.at_risk > 0 && <Badge tone="warn">{r.counts.at_risk} at risk</Badge>}{r.counts.behind > 0 && <Badge tone="red">{r.counts.behind} behind</Badge>}</Row> },
  ];
  const emp = db.employees.find((e) => e.id === person);
  const total = weightTotal(goals);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="goals">
      <Card padding={16}>
        <CardTitle>Team roll-up</CardTitle>
        <Lead>Goals of everyone who reports to a manager, added up. Status compares progress with time passed: on track when within {STATUS_BANDS.atRisk} points of the clock, at risk when {STATUS_BANDS.atRisk} to {STATUS_BANDS.behind} behind, behind when more than {STATUS_BANDS.behind} behind. Click a manager to see their team.</Lead>
        <div data-testid="rollup"><DataTable columns={cols} rows={rollups.map((r) => ({ ...r, id: r.managerId }))} minWidth={640} empty="No team has goals yet." /></div>
      </Card>

      <Row>
        <div style={{ width: 230 }}><Select aria-label="Team" value={team} onChange={(e) => { setTeam(e.target.value); setPerson(''); }}>
          <option value="all">Everyone</option>{[...new Set(st.reviews.map((r) => r.managerId))].map((m) => <option key={m} value={m}>Team of {empName(db, m)}</option>)}</Select></div>
        <div style={{ width: 260 }}><Select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
          {inTeam.map((p) => <option key={p.review.employeeId} value={p.review.employeeId}>{empName(db, p.review.employeeId)} ({withGoals(p.review.employeeId).length} goals)</option>)}</Select></div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" disabled={!person} onClick={() => setEditing('new')}>Add goal</Button>
      </Row>

      {emp && (
        <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <div><h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 16, fontWeight: 700, color: T.text }}>{empName(db, person)}</h3>
              <div style={subtle}>{db.designations.find((d) => d.id === emp.designationId)?.name} · {db.departments.find((d) => d.id === emp.departmentId)?.name}</div></div>
            {goals.length > 0 && <div style={{ textAlign: 'right' }}><div data-testid="person-progress" style={{ ...mono, fontSize: 20, fontWeight: 700, color: T.text }}>{personProgress(goals)}%</div><div style={subtle}>overall, weighted by goal</div></div>}
          </Row>
          {goals.length > 0 && total !== 100 && <Note tone="warn">Goal weights add up to {total}%. They are usually set to total 100%.</Note>}
          {goals.length === 0 && <EmptyState title="No goals yet" description="Add the first objective and its key results." />}
          {goals.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onUpdate={(kr) => setUpdating({ goal: g, kr })} />)}
        </Card>
      )}
      {editing && <GoalModal employeeId={person} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {updating && <ProgressModal goal={updating.goal} kr={updating.kr} onClose={() => setUpdating(null)} />}
    </div>
  );
}

function GoalCard({ g, onEdit, onUpdate }: { g: Goal; onEdit: () => void; onUpdate: (kr: KeyResult) => void }) {
  const [all, setAll] = useState(false);
  const s = goalStatus(g, PREVIEW_TODAY);
  const ups = all ? g.updates : g.updates.slice(0, 2);
  const krName = (id: string) => g.keyResults.find((k) => k.id === id)?.title ?? '';
  return (
    <div data-testid={`goal-${g.id}`} data-status={s.status} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <b style={{ fontSize: 14.5, color: T.text }}>{g.title}</b>
          <div style={subtle}>Weight {g.weight}% · {fmtDate(g.startDate)} to {fmtDate(g.dueDate)}</div>
          {g.note && <div style={{ ...subtle, marginTop: 2 }}>{g.note}</div>}
        </div>
        <Row gap={8}><StatusPill s={s.status} /><Button size="sm" onClick={onEdit} aria-label={`Edit ${g.title}`}>Edit</Button></Row>
      </Row>
      <div>
        <ProgressWithClock progress={s.progress} elapsed={s.elapsed} tone={STATUS_TONE[s.status]} />
        <div style={{ ...subtle, marginTop: 6 }}>{s.progress}% done · {Math.round(s.elapsed)}% of the time has passed (the tick on the bar)</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead><tr>{['Key result', 'Now', 'Target', 'Progress', ''].map((h, i) => <th key={i} scope="col" style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
          <tbody>
            {g.keyResults.map((k) => (
              <tr key={k.id}>
                <td style={td}>{k.title}<span style={{ color: T.mute }}> · weight {k.weight}</span></td>
                <td style={{ ...td, textAlign: 'right', ...mono }}>{fmtVal(k.current, k.unit)}</td>
                <td style={{ ...td, textAlign: 'right', ...mono }}>{fmtVal(k.target, k.unit)}</td>
                <td style={{ ...td, textAlign: 'right', ...mono }}>{krProgress(k)}%</td>
                <td style={{ ...td, textAlign: 'right' }}><Button size="sm" variant="ghost" aria-label={`Update ${k.title}`} onClick={() => onUpdate(k)}>Update</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.updates.length > 0 && (
        <div>
          <b style={{ fontSize: 12.5, color: T.dim }}>Progress updates</b>
          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ups.map((u) => <li key={u.id} style={{ fontSize: 13, color: T.text }}><span style={{ ...mono, color: T.mute }}>{fmtDate(u.on)}</span> {krName(u.krId)}: <b>{u.value}</b>. {u.comment} <span style={{ color: T.mute }}>({u.by})</span></li>)}
          </ul>
          {g.updates.length > 2 && <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${g.updates.length}`}</Button>}
        </div>
      )}
    </div>
  );
}
const th: React.CSSProperties = { padding: '6px 10px', fontSize: 11, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}` };

interface KrForm { id: string; title: string; unit: KrUnit; start: string; target: string; current: string; weight: string }
function GoalModal({ employeeId, initial, onClose }: { employeeId: string; initial?: Goal; onClose: () => void }) {
  const [f, setF] = useState({ title: initial?.title ?? '', weight: String(initial?.weight ?? 50), startDate: initial?.startDate ?? '2026-04-01', dueDate: initial?.dueDate ?? '2027-03-31', note: initial?.note ?? '' });
  const [krs, setKrs] = useState<KrForm[]>((initial?.keyResults ?? [{ id: '', title: '', unit: 'count' as KrUnit, start: 0, target: 0, current: 0, weight: 100 }]).map((k) => ({ id: k.id, title: k.title, unit: k.unit, start: String(k.start), target: String(k.target), current: String(k.current), weight: String(k.weight) })));
  const [err, setErr] = useState<string | null>(null);
  const setK = (i: number, patch: Partial<KrForm>) => { setKrs((a) => a.map((k, j) => (j === i ? { ...k, ...patch } : k))); setErr(null); };
  const build = () => ({
    id: initial?.id, employeeId, title: f.title, weight: Number(f.weight), startDate: f.startDate, dueDate: f.dueDate, note: f.note,
    keyResults: krs.map((k): KeyResult => ({ id: k.id, title: k.title, unit: k.unit, start: Number(k.start), target: Number(k.target), current: Number(k.current), weight: Number(k.weight) })),
  });
  const problems = validateGoal(build());
  return (
    <Modal title={initial ? 'Edit goal' : 'Add goal'} width={820} onClose={onClose}
      footer={<>
        {initial && <Button variant="danger" onClick={() => { if (report(deleteGoal(initial.id), 'Goal deleted.')) onClose(); }} style={{ marginRight: 'auto' }}>Delete goal</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={problems.length > 0} title={problems[0]} onClick={() => { const r = saveGoal(build()); if (r.ok) { toast.success('Goal saved.'); onClose(); } else setErr(r.error); }}>Save goal</Button>
      </>}>
      <FormGrid narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Objective" required htmlFor="gl-title" style={{ gridColumn: '1 / -1' }}><Input id="gl-title" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setErr(null); }} /></Field>
        <Field label="Weight (%)" required htmlFor="gl-weight"><Input id="gl-weight" inputMode="numeric" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
        <Field label="Start" required htmlFor="gl-start"><Input id="gl-start" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Due" required htmlFor="gl-due"><Input id="gl-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      </FormGrid>
      <b style={{ fontSize: 13.5, color: T.text }}>Key results</b>
      <div style={subtle}>Each has a start value, a target and where it stands now. For something that should go down (days to close, errors), set the target below the start.</div>
      {krs.map((k, i) => (
        <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <Field label={`Key result ${i + 1}`} htmlFor={`kr-${i}-t`} style={{ gridColumn: '1 / -1' }}><Input id={`kr-${i}-t`} value={k.title} onChange={(e) => setK(i, { title: e.target.value })} /></Field>
          <Field label="Unit" htmlFor={`kr-${i}-u`}><Select id={`kr-${i}-u`} value={k.unit} onChange={(e) => setK(i, { unit: e.target.value as KrUnit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Start" htmlFor={`kr-${i}-s`}><Input id={`kr-${i}-s`} inputMode="decimal" value={k.start} onChange={(e) => setK(i, { start: e.target.value })} /></Field>
          <Field label="Target" htmlFor={`kr-${i}-g`}><Input id={`kr-${i}-g`} inputMode="decimal" value={k.target} onChange={(e) => setK(i, { target: e.target.value })} /></Field>
          <Field label="Now" htmlFor={`kr-${i}-c`}><Input id={`kr-${i}-c`} inputMode="decimal" value={k.current} onChange={(e) => setK(i, { current: e.target.value })} /></Field>
          <Field label="Weight" htmlFor={`kr-${i}-w`}><Input id={`kr-${i}-w`} inputMode="numeric" value={k.weight} onChange={(e) => setK(i, { weight: e.target.value })} /></Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><Button size="sm" variant="ghost" disabled={krs.length < 2} title={krs.length < 2 ? 'A goal needs at least one key result' : undefined} onClick={() => setKrs((a) => a.filter((_, j) => j !== i))} aria-label={`Remove key result ${i + 1}`}>Remove</Button></div>
        </div>
      ))}
      <div><Button size="sm" onClick={() => setKrs((a) => [...a, { id: '', title: '', unit: 'count', start: '0', target: '0', current: '0', weight: '100' }])}>Add key result</Button></div>
      <Field label="Note (optional)" htmlFor="gl-note"><Textarea id="gl-note" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {problems.length > 0 && <div style={subtle}>{problems[0]}</div>}
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}

function ProgressModal({ goal, kr, onClose }: { goal: Goal; kr: KeyResult; onClose: () => void }) {
  const [value, setValue] = useState(String(kr.current));
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Update progress" width={480} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!comment.trim() || value.trim() === ''} onClick={() => { const r = addProgress(goal.id, kr.id, Number(value), comment); if (r.ok) { toast.success('Progress saved.'); onClose(); } else setErr(r.error); }}>Save update</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim }}>{goal.title}: <b style={{ color: T.text }}>{kr.title}</b>. Now {fmtVal(kr.current, kr.unit)}, target {fmtVal(kr.target, kr.unit)}.</div>
      <Field label={`New value (${kr.unit})`} required htmlFor="pg-value"><Input id="pg-value" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} /></Field>
      <Field label="Comment" required htmlFor="pg-comment" hint="What changed since the last update?"><Textarea id="pg-comment" rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setErr(null); }} /></Field>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
