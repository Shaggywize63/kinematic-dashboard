'use client';
// 1:1s: one thread per manager and report, with shared notes, private notes, action items and the next date.
// A private note is visible only to the person who wrote it. HR sees shared notes only and is told how many are hidden.

import { useState } from 'react';
import { Badge, Button, Card, Modal, Note, T } from '../ui';
import { Field, Input, Segmented, Select, Textarea } from '../../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { ActionItem, HiringState, OneThread, Role } from '../../../lib/hrms/hiring/types';
import { hiddenNoteCount, isOverdue, visibleNotes } from '../../../lib/hrms/hiring/perfEngines';
import { addActionItem, addNote, setActionStatus, setNextOn, startThread } from '../../../lib/hrms/hiring/store';
import { Row, empName, report, subtle, toast } from './shared';

const CADENCE = { weekly: 'Weekly', fortnightly: 'Every two weeks', monthly: 'Monthly' } as const;
const STATUS: Record<ActionItem['status'], string> = { open: 'Open', in_progress: 'In progress', done: 'Done' };

export default function PerfOneOnOnes({ db, st }: { db: HrmsDb; st: HiringState }) {
  const threads = [...st.threads].sort((a, b) => ((a.nextOn ?? '9') < (b.nextOn ?? '9') ? -1 : 1));
  const [sel, setSel] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const t = st.threads.find((x) => x.id === sel) ?? threads[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="one-on-ones">
      <Note>A 1:1 is a conversation between a manager and one person. Notes marked private can be read only by whoever wrote them. HR can see shared notes and action items, and never the private ones.</Note>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
        <Card padding={0}>
          <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${T.border}` }}>
            <b style={{ fontFamily: T.heading, fontSize: 14.5, color: T.text }}>Manager and report pairs</b>
            <Button size="sm" onClick={() => setAdding(true)}>Add a pair</Button>
          </div>
          <ul data-testid="thread-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {threads.map((x) => {
              const open = x.actions.filter((a) => a.status !== 'done');
              const overdue = open.filter((a) => isOverdue(a, PREVIEW_TODAY)).length;
              const on = x.id === t?.id;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => setSel(x.id)} aria-current={on} aria-label={`1:1 ${empName(db, x.managerId)} with ${empName(db, x.reportId)}`}
                    style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '12px 14px', display: 'block', borderBottom: `1px solid ${T.border}`, background: on ? T.raised : 'transparent' }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: T.text }}>{empName(db, x.reportId)} <span style={{ color: T.mute, fontWeight: 400 }}>1:1 with {empName(db, x.managerId)}</span></div>
                    <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>{CADENCE[x.cadence]} · next {x.nextOn ? fmtDate(x.nextOn) : 'not set'} · {open.length} open action{open.length === 1 ? '' : 's'}{overdue > 0 && <span style={{ color: T.warn }}> ({overdue} overdue)</span>}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        {t && <Thread key={t.id} db={db} t={t} />}
      </div>
      {adding && <PairModal db={db} st={st} onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
    </div>
  );
}

function Thread({ db, t }: { db: HrmsDb; t: OneThread }) {
  const [role, setRole] = useState<Role>('manager');
  const [text, setText] = useState('');
  const [priv, setPriv] = useState(false);
  const [action, setAction] = useState({ text: '', owner: 'report' as 'manager' | 'report', due: '' });
  const [next, setNext] = useState(t.nextOn ?? '');
  const notes = visibleNotes(t.notes, role);
  const hidden = hiddenNoteCount(t.notes, role);
  const author: 'manager' | 'report' | null = role === 'manager' ? 'manager' : role === 'employee' ? 'report' : null;
  const mgr = empName(db, t.managerId), rep = empName(db, t.reportId);
  return (
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div data-testid="thread" data-role={role} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{rep}, 1:1 with {mgr}</h3>
          <Row gap={8}><span style={{ fontSize: 12.5, color: T.dim }}>Viewing as</span><Segmented value={role} onChange={setRole} options={[{ value: 'hr', label: 'HR' }, { value: 'manager', label: 'Manager' }, { value: 'employee', label: 'Report' }]} /></Row>
        </Row>

        <Row>
          <label htmlFor="next-on" style={{ fontSize: 13, color: T.dim }}>Next 1:1</label>
          <Input id="next-on" type="date" value={next} min={PREVIEW_TODAY} disabled={role === 'hr'} onChange={(e) => setNext(e.target.value)} style={{ width: 170 }} />
          <Button size="sm" disabled={role === 'hr' || next === (t.nextOn ?? '')} onClick={() => report(setNextOn(t.id, next), 'Next 1:1 saved.')}>Save date</Button>
          {role === 'hr' && <span style={subtle}>HR cannot change a 1:1 date.</span>}
        </Row>

        <div>
          <b style={{ fontSize: 13.5, color: T.text }}>Notes</b>
          {author ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0 12px' }}>
              <Textarea aria-label="New note" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write as ${author === 'manager' ? mgr : rep}`} />
              <Row>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private (only I can read it)</label>
                <div style={{ flex: 1 }} />
                <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => { if (report(addNote(t.id, author, text, priv), priv ? 'Private note saved.' : 'Note saved.')) { setText(''); setPriv(false); } }}>Add note</Button>
              </Row>
            </div>
          ) : <div style={{ ...subtle, margin: '6px 0 10px' }}>HR reads shared notes but does not write in a 1:1.</div>}
          <ul data-testid="notes" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notes.map((n) => (
              <li key={n.id} data-private={n.private ? 'true' : 'false'} style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${n.private ? T.warn : T.border}`, borderRadius: T.radius.md, padding: '8px 12px' }}>
                <Row gap={8} style={{ marginBottom: 2 }}><span style={{ fontSize: 12, color: T.mute }}>{fmtDate(n.on)} · {n.authorRole === 'manager' ? mgr : rep}</span>{n.private && <Badge tone="warn">Private</Badge>}</Row>
                <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{n.text}</div>
              </li>
            ))}
            {notes.length === 0 && <li style={subtle}>No notes you can see yet.</li>}
          </ul>
          {hidden > 0 && <div data-testid="hidden-notes" style={{ ...subtle, marginTop: 8 }}>{hidden} private note{hidden === 1 ? ' is' : 's are'} hidden from you. Only the author can read {hidden === 1 ? 'it' : 'them'}.</div>}
        </div>

        <div>
          <b style={{ fontSize: 13.5, color: T.text }}>Action items</b>
          <ul data-testid="actions" style={{ margin: '8px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {t.actions.map((a) => (
              <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5, color: T.text }}>
                <span style={{ flex: '1 1 220px', textDecoration: a.status === 'done' ? 'line-through' : undefined, color: a.status === 'done' ? T.mute : T.text }}>{a.text} <span style={{ color: T.mute }}>· {a.owner === 'manager' ? mgr : rep}{a.due ? `, due ${fmtDate(a.due)}` : ''}</span></span>
                {isOverdue(a, PREVIEW_TODAY) && <Badge tone="warn">Overdue</Badge>}
                <div style={{ width: 140 }}><Select aria-label={`Status of ${a.text}`} value={a.status} disabled={role === 'hr'} onChange={(e) => setActionStatus(t.id, a.id, e.target.value as ActionItem['status'])}>{(Object.keys(STATUS) as ActionItem['status'][]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</Select></div>
              </li>
            ))}
            {t.actions.length === 0 && <li style={subtle}>No action items yet.</li>}
          </ul>
          {role !== 'hr' && (
            <Row>
              <Input aria-label="New action item" placeholder="What needs to happen" value={action.text} onChange={(e) => setAction({ ...action, text: e.target.value })} style={{ flex: '1 1 220px', width: 'auto' }} />
              <div style={{ width: 120 }}><Select aria-label="Owner" value={action.owner} onChange={(e) => setAction({ ...action, owner: e.target.value as 'manager' | 'report' })}><option value="report">{rep.split(' ')[0]}</option><option value="manager">{mgr.split(' ')[0]}</option></Select></div>
              <Input aria-label="Due date" type="date" value={action.due} min={PREVIEW_TODAY} onChange={(e) => setAction({ ...action, due: e.target.value })} style={{ width: 160 }} />
              <Button size="sm" disabled={!action.text.trim()} onClick={() => { if (report(addActionItem(t.id, { text: action.text, owner: action.owner, due: action.due }), 'Action added.')) setAction({ text: '', owner: 'report', due: '' }); }}>Add action</Button>
            </Row>
          )}
        </div>
      </div>
    </Card>
  );
}

function PairModal({ db, st, onClose, onCreated }: { db: HrmsDb; st: HiringState; onClose: () => void; onCreated: (id: string) => void }) {
  void st;
  const people = db.employees.filter((e) => e.status === 'active');
  const [m, setM] = useState('');
  const [r, setR] = useState('');
  const [c, setC] = useState<'weekly' | 'fortnightly' | 'monthly'>('fortnightly');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Add a 1:1 pair" width={480} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!m || !r} onClick={() => { const x = startThread(m, r, c); if (x.ok) { toast.success('1:1 pair added.'); onCreated(x.value); onClose(); } else setErr(x.error); }}>Add pair</Button></>}>
      <Field label="Manager" required htmlFor="pr-m"><Select id="pr-m" value={m} onChange={(e) => { setM(e.target.value); setErr(null); }}><option value="">Choose</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</Select></Field>
      <Field label="Report" required htmlFor="pr-r"><Select id="pr-r" value={r} onChange={(e) => { setR(e.target.value); setErr(null); }}><option value="">Choose</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</Select></Field>
      <Field label="How often" htmlFor="pr-c"><Select id="pr-c" value={c} onChange={(e) => setC(e.target.value as typeof c)}><option value="weekly">Weekly</option><option value="fortnightly">Every two weeks</option><option value="monthly">Monthly</option></Select></Field>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
