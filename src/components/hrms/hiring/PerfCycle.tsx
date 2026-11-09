'use client';
// The review cycle: five stages with dates and status (from today's date), and how far each department has got.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Modal, Note, ProgressBar, T, type Col } from '../ui';
import { Field, Input } from '../../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { CycleStage, HiringState } from '../../../lib/hrms/hiring/types';
import { completion, stageState } from '../../../lib/hrms/hiring/perfEngines';
import { logReminder, saveCycleDates } from '../../../lib/hrms/hiring/store';
import { Lead, Row, Simulation, deptName, subtle, toast, mono } from './shared';
import { participants } from './perfShared';

const STATE_LABEL = { done: 'Done', in_progress: 'In progress', upcoming: 'Upcoming' } as const;
const STATE_TONE = { done: 'ok', in_progress: 'info', upcoming: 'neutral' } as const;

export default function PerfCycle({ db, st }: { db: HrmsDb; st: HiringState }) {
  const [editing, setEditing] = useState(false);
  const people = participants(db, st);
  const depts = db.departments.map((d) => ({ id: d.id, rs: people.filter((p) => p.departmentId === d.id).map((p) => p.review) })).filter((d) => d.rs.length > 0);
  const total = completion(people.map((p) => p.review));
  type R = { id: string; name: string; c: ReturnType<typeof completion> };
  const rows: R[] = depts.map((d) => ({ id: d.id, name: deptName(db, d.id), c: completion(d.rs) }));

  const cols: Col<R>[] = [
    { key: 'd', label: 'Department', sortValue: (r) => r.name, render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'n', label: 'People', align: 'right', render: (r) => r.c.total },
    { key: 's', label: 'Self review', width: 230, sortValue: (r) => r.c.self / r.c.total, render: (r) => <Bar done={r.c.self} total={r.c.total} /> },
    { key: 'm', label: 'Manager review', width: 230, sortValue: (r) => r.c.manager / r.c.total, render: (r) => <Bar done={r.c.manager} total={r.c.total} /> },
    { key: 'a', label: '', align: 'right', render: (r) => {
      const waiting = r.c.total * 2 - r.c.self - r.c.manager;
      return <Button size="sm" disabled={waiting === 0} title={waiting === 0 ? 'Everyone has submitted' : undefined} aria-label={`Remind ${r.name}`} onClick={() => { logReminder(r.id); toast.success(`Reminder logged for ${r.name} (simulation, nothing was sent).`); }}>Remind</Button>;
    } },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="cycle">
      <Card padding={16}>
        <CardTitle right={<Button size="sm" onClick={() => setEditing(true)}>Edit dates</Button>}>{st.cycle.name}</CardTitle>
        <Lead>Performance period {fmtDate(st.cycle.periodFrom)} to {fmtDate(st.cycle.periodTo)}. Today is {fmtDate(PREVIEW_TODAY)}. Each stage shows as done, in progress or upcoming from its dates.</Lead>
        <ol data-testid="timeline" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 10 }}>
          {st.cycle.stages.map((s, i) => {
            const state = stageState(s, PREVIEW_TODAY);
            return (
              <li key={s.key} data-testid={`stage-${s.key}`} data-state={state} style={{ border: `1px solid ${T.border}`, borderTop: `3px solid ${state === 'in_progress' ? T.info : state === 'done' ? T.ok : T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: T.card }}>
                <Row gap={6} style={{ justifyContent: 'space-between' }}><span style={{ ...mono, fontSize: 11.5, color: T.mute }}>STEP {i + 1}</span><Badge tone={STATE_TONE[state]} dot>{STATE_LABEL[state]}</Badge></Row>
                <b style={{ fontSize: 14, color: T.text }}>{s.label}</b>
                <span style={{ fontSize: 12.5, color: T.dim }}>{fmtDate(s.start)} to {fmtDate(s.end)}</span>
                <span style={subtle}>{s.blurb}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card padding={16}>
        <CardTitle right={<span data-testid="cycle-total" style={{ fontSize: 12.5, color: T.dim }}>All: self {total.self}/{total.total} · manager {total.manager}/{total.total}</span>}>Completion by department</CardTitle>
        <Lead>Counts of submitted reviews only. A department is a count of people, not a score for anyone. Managers see their own team in their own view.</Lead>
        <DataTable columns={cols} rows={rows} minWidth={680} empty="No one is in this cycle." />
        <div style={{ marginTop: 12 }}><Simulation>Reminders are logged here but this preview sends no e-mail or message.</Simulation></div>
        {st.cycle.reminders.length > 0 && (
          <ul data-testid="reminder-log" style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {st.cycle.reminders.slice(0, 4).map((r, i) => <li key={i} style={subtle}>{fmtDate(r.on)}: reminder to {r.departmentId ? deptName(db, r.departmentId) : 'everyone'} by {r.by}</li>)}
          </ul>
        )}
      </Card>
      {editing && <DatesModal stages={st.cycle.stages} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><ProgressBar pct={pct} tone={pct === 100 ? 'ok' : pct >= 60 ? 'info' : 'warn'} /></div><span style={{ ...mono, fontSize: 12.5, color: T.text, minWidth: 40, textAlign: 'right' }}>{done}/{total}</span></div>;
}

function DatesModal({ stages, onClose }: { stages: CycleStage[]; onClose: () => void }) {
  const [d, setD] = useState<Record<string, { start: string; end: string }>>(Object.fromEntries(stages.map((s) => [s.key, { start: s.start, end: s.end }])));
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const r = saveCycleDates(d);
    if (!r.ok) { setErr(r.error); return; }
    toast.success('Dates saved.');
    onClose();
  };
  return (
    <Modal title="Edit cycle dates" width={560} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save dates</Button></>}>
      <div style={subtle}>Stages run in order and must not overlap. Status changes with the dates.</div>
      {stages.map((s) => (
        <div key={s.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 1fr 1fr', gap: 10, alignItems: 'end' }}>
          <b style={{ fontSize: 13.5, color: T.text, paddingBottom: 8 }}>{s.label}</b>
          <Field label="Start" htmlFor={`cy-${s.key}-s`}><Input id={`cy-${s.key}-s`} type="date" value={d[s.key]!.start} onChange={(e) => { setD((x) => ({ ...x, [s.key]: { ...x[s.key]!, start: e.target.value } })); setErr(null); }} /></Field>
          <Field label="End" htmlFor={`cy-${s.key}-e`}><Input id={`cy-${s.key}-e`} type="date" value={d[s.key]!.end} onChange={(e) => { setD((x) => ({ ...x, [s.key]: { ...x[s.key]!, end: e.target.value } })); setErr(null); }} /></Field>
        </div>
      ))}
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
