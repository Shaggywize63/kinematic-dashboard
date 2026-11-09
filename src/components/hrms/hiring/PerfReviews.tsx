'use client';
// Reviews: a self review and a manager review per person, plus anonymous 360 feedback. Two rules are enforced in the store
// and shown here: a submitted review is locked, and the employee sees what the manager wrote only after the manager submits.

import { useState } from 'react';
import { Badge, Button, DataTable, EmployeeCell, Modal, Note, T, Toolbar, type Col } from '../ui';
import { Field, Input, Segmented, Select, Textarea } from '../../ui';
import { fmtDate } from '../../../lib/hrms/format';
import type { HrmsDb } from '../../../lib/hrms/types';
import { PERF_COMPETENCIES, RATING_LABEL, type HiringState, type Review, type ReviewForm, type Role } from '../../../lib/hrms/hiring/types';
import { MIN_FEEDBACK, canEditForm, canSeeManagerReview, canSeeSelf, feedbackSummary, isSubmitted, submitProblems } from '../../../lib/hrms/hiring/perfEngines';
import { requestFeedback, respondFeedback, saveReviewDraft, submitReview } from '../../../lib/hrms/hiring/store';
import { RatingInput, Row, Simulation, deptName, empName, report, subtle, toast, mono } from './shared';
import { participants } from './perfShared';

type Filter = 'all' | 'self' | 'manager' | 'done';
const formState = (f: ReviewForm): 'none' | 'draft' | 'submitted' => (isSubmitted(f) ? 'submitted' : Object.keys(f.ratings).length || f.strengths || f.development ? 'draft' : 'none');
const FORM_BADGE = { none: { tone: 'neutral', label: 'Not started' }, draft: { tone: 'warn', label: 'Draft' }, submitted: { tone: 'ok', label: 'Submitted' } } as const;

export default function PerfReviews({ db, st }: { db: HrmsDb; st: HiringState }) {
  const [dept, setDept] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const people = participants(db, st).filter((p) => (dept === 'all' || p.departmentId === dept) && (
    filter === 'all' || (filter === 'self' && !isSubmitted(p.review.self)) || (filter === 'manager' && !isSubmitted(p.review.manager)) || (filter === 'done' && isSubmitted(p.review.self) && isSubmitted(p.review.manager))));
  type R = (typeof people)[number] & { id: string };
  const cols: Col<R>[] = [
    { key: 'e', label: 'Employee', sortValue: (r) => empName(db, r.review.employeeId), render: (r) => <EmployeeCell e={r.employee!} sub={deptName(db, r.departmentId)} href={false} /> },
    { key: 'm', label: 'Manager', sortValue: (r) => empName(db, r.review.managerId), render: (r) => empName(db, r.review.managerId) },
    { key: 's', label: 'Self review', nowrap: true, sortValue: (r) => formState(r.review.self), render: (r) => <Badge tone={FORM_BADGE[formState(r.review.self)].tone} dot>{FORM_BADGE[formState(r.review.self)].label}</Badge> },
    { key: 'mg', label: 'Manager review', nowrap: true, sortValue: (r) => formState(r.review.manager), render: (r) => <Badge tone={FORM_BADGE[formState(r.review.manager)].tone} dot>{FORM_BADGE[formState(r.review.manager)].label}</Badge> },
    { key: 'f', label: '360 feedback', align: 'right', nowrap: true, render: (r) => { const f = feedbackSummary(r.review.feedback); return f.requested ? `${f.responded} of ${f.requested}` : <span style={{ color: T.mute }}>None asked</span>; } },
    { key: 'a', label: '', align: 'right', render: (r) => <Button size="sm" aria-label={`Open review for ${empName(db, r.review.employeeId)}`} onClick={(e) => { e.stopPropagation(); setOpenId(r.review.id); }}>Open</Button> },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="reviews">
      <Note>Open a review and use <b>Viewing as</b> to see it the way HR, the manager or the employee would. The employee does not see the manager&apos;s review until the manager submits it. Submitted reviews are locked.</Note>
      <Toolbar>
        <div style={{ width: 200 }}><Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}><option value="all">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
        <div style={{ width: 220 }}><Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}><option value="all">Everyone</option><option value="self">Waiting on self review</option><option value="manager">Waiting on manager review</option><option value="done">Both submitted</option></Select></div>
      </Toolbar>
      <DataTable columns={cols} rows={people.map((p) => ({ ...p, id: p.review.id }))} onRowClick={(r) => setOpenId(r.review.id)} minWidth={780} empty="No one matches this filter." />
      {openId && <ReviewModal db={db} st={st} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ───────────────────────────── one review ─────────────────────────────
function ReviewModal({ db, st, id, onClose }: { db: HrmsDb; st: HiringState; id: string; onClose: () => void }) {
  const r = st.reviews.find((x) => x.id === id);
  const [role, setRole] = useState<Role>('hr');
  if (!r) return null;
  const emp = empName(db, r.employeeId), mgr = empName(db, r.managerId);
  return (
    <Modal title={`Review: ${emp}`} width={900} onClose={onClose}>
      <div data-testid="review-modal" data-role={role} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <div style={subtle}>{deptName(db, db.employees.find((e) => e.id === r.employeeId)?.departmentId)} · manager {mgr}</div>
          <Row gap={8}><span style={{ fontSize: 12.5, color: T.dim }}>Viewing as</span>
            <Segmented value={role} onChange={setRole} options={[{ value: 'hr', label: 'HR' }, { value: 'manager', label: `Manager` }, { value: 'employee', label: 'Employee' }]} /></Row>
        </Row>
        <div data-testid="role-note" style={subtle}>{role === 'hr' ? 'HR can read both reviews and chase submissions. HR does not write either one.' : role === 'manager' ? `You are ${mgr}. You write the manager review and can read ${emp}'s self review once it is submitted.` : `You are ${emp}. You write the self review. You will see your manager's review after they submit it.`}</div>

        <section aria-label="Self review"><h3 style={h3}>Self review {isSubmitted(r.self) && <Badge tone="ok">Submitted {fmtDate(r.self.submittedOn)} · locked</Badge>}</h3>
          {canSeeSelf(r, role)
            ? <FormPanel review={r} which="self" role={role} />
            : <Hidden testId="self-hidden">{emp} has not submitted the self review yet. A manager sees it after it is submitted.</Hidden>}
        </section>
        <section aria-label="Manager review"><h3 style={h3}>Manager review {isSubmitted(r.manager) && <Badge tone="ok">Submitted {fmtDate(r.manager.submittedOn)} · locked</Badge>}</h3>
          {canSeeManagerReview(r, role)
            ? <FormPanel review={r} which="manager" role={role} />
            : <Hidden testId="manager-hidden">Your manager has not submitted their review yet. You will see it here once they do. Until then nothing they have written, drafted or rated is shown to you.</Hidden>}
        </section>
        <Feedback360 db={db} st={st} r={r} role={role} />
      </div>
    </Modal>
  );
}
const h3: React.CSSProperties = { margin: '0 0 10px', fontFamily: T.heading, fontSize: 14.5, fontWeight: 700, color: T.text, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };
const Hidden = ({ children, testId }: { children: React.ReactNode; testId: string }) => <div data-testid={testId} style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, padding: 14, fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{children}</div>;

function FormPanel({ review, which, role }: { review: Review; which: 'self' | 'manager'; role: Role }) {
  const form = review[which];
  const editable = canEditForm(review, which, role);
  const [local, setLocal] = useState<ReviewForm>(form);
  const [err, setErr] = useState<string | null>(null);
  const shown = editable ? local : form;
  const dirty = editable && JSON.stringify(local) !== JSON.stringify(form);
  const problems = submitProblems(local);
  const set = (patch: Partial<ReviewForm>) => { setLocal((l) => ({ ...l, ...patch })); setErr(null); };
  const save = () => saveReviewDraft(review.id, which, role, { ratings: local.ratings, strengths: local.strengths, development: local.development, overall: local.overall });

  return (
    <div data-testid={`form-${which}`} data-locked={isSubmitted(form) ? 'true' : 'false'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {PERF_COMPETENCIES.map((c) => (
        <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: T.text }}>{c}</span>
          <RatingInput label={`${which === 'self' ? 'Self' : 'Manager'} rating, ${c}`} value={shown.ratings[c]} labels={RATING_LABEL} disabled={!editable} onChange={editable ? (n) => set({ ratings: { ...local.ratings, [c]: n } }) : undefined} />
        </div>
      ))}
      <Field label="Strengths" htmlFor={`${which}-str`}><Textarea id={`${which}-str`} rows={2} value={shown.strengths} disabled={!editable} onChange={(e) => set({ strengths: e.target.value })} /></Field>
      <Field label="Areas to develop" htmlFor={`${which}-dev`}><Textarea id={`${which}-dev`} rows={2} value={shown.development} disabled={!editable} onChange={(e) => set({ development: e.target.value })} /></Field>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6 }}>Overall rating (5-point scale)</div>
        <Row gap={10}>
          <RatingInput label={`${which === 'self' ? 'Self' : 'Manager'} overall rating`} value={shown.overall} labels={RATING_LABEL} disabled={!editable} onChange={editable ? (n) => set({ overall: n }) : undefined} />
          {shown.overall != null && <span data-testid={`${which}-overall`} style={{ fontSize: 13, color: T.text }}>{shown.overall} · {RATING_LABEL[shown.overall]}</span>}
        </Row>
        <div style={{ ...subtle, marginTop: 4 }}>1 Needs improvement · 2 Partly meets · 3 Meets expectations · 4 Exceeds · 5 Outstanding. The rating is an input to a conversation. It does not set pay.</div>
      </div>
      {isSubmitted(form) && <Note tone="ok">Submitted on {fmtDate(form.submittedOn)}. This review is locked and cannot be edited.</Note>}
      {!isSubmitted(form) && !editable && <div style={subtle}>{role === 'hr' ? 'HR reads this review but does not write it. Switch to the author to edit.' : 'Only the author can edit this review.'}</div>}
      {err && <Note tone="red">{err}</Note>}
      {editable && (
        <Row>
          <Button disabled={!dirty} onClick={() => report(save(), 'Draft saved.')}>Save draft</Button>
          <Button variant="primary" disabled={problems.length > 0} title={problems[0]} onClick={() => {
            if (dirty) { const s = save(); if (!s.ok) { setErr(s.error); return; } }
            const r = submitReview(review.id, which, role);
            if (r.ok) toast.success('Submitted. The review is now locked.'); else setErr(r.error);
          }}>Submit and lock</Button>
          {problems.length > 0 && <span data-testid={`${which}-problems`} style={subtle}>{problems[0]}</span>}
        </Row>
      )}
    </div>
  );
}

// ───────────────────────────── 360 feedback ─────────────────────────────
function Feedback360({ db, st, r, role }: { db: HrmsDb; st: HiringState; r: Review; role: Role }) {
  const sum = feedbackSummary(r.feedback);
  const [pick, setPick] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [as, setAs] = useState('');
  const pool = db.employees.filter((e) => (e.status === 'active') && e.id !== r.employeeId && e.id !== 'emp_1');
  const asked = new Set(r.feedback.map((f) => f.reviewerId));
  const pending = r.feedback.filter((f) => f.status === 'requested');
  void st;
  return (
    <section aria-label="360 feedback" data-testid="feedback-360">
      <h3 style={h3}>360 feedback <Badge>Anonymous</Badge></h3>
      <div style={{ ...subtle, marginBottom: 10 }}>Peers rate the same five competencies and may add one comment. Answers are shown only as an average once at least {MIN_FEEDBACK} people have responded, so no single answer can be traced to a person.</div>
      <div data-testid="feedback-count" style={{ fontSize: 13.5, color: T.text, marginBottom: 10 }}>{sum.requested === 0 ? 'No feedback has been requested yet.' : `${sum.responded} of ${sum.requested} asked have responded.`}</div>
      {sum.requested > 0 && !sum.visible && <Note tone="info"><span data-testid="feedback-hidden">Results are not shown yet: {sum.remaining} more {sum.remaining === 1 ? 'response is' : 'responses are'} needed to reach the minimum of {MIN_FEEDBACK}.</span></Note>}
      {sum.visible && (
        <div data-testid="feedback-aggregate" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sum.averages.map((a) => <Row key={a.competency} style={{ justifyContent: 'space-between' }}><span style={{ fontSize: 13.5 }}>{a.competency}</span><b style={mono}>{a.average.toFixed(1)} / 5</b></Row>)}
          {sum.comments.length > 0 && <div><b style={{ fontSize: 12.5, color: T.dim }}>Comments, not attributed</b><ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: T.text }}>{sum.comments.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
        </div>
      )}

      {(role === 'hr' || role === 'manager') && r.feedback.length > 0 && (
        <div style={{ ...subtle, marginTop: 10 }}>Asked: {r.feedback.map((f) => `${empName(db, f.reviewerId)} (${f.status === 'submitted' ? 'responded' : 'waiting'})`).join(', ')}. Who said what is never shown.</div>
      )}
      {(role === 'hr' || role === 'manager') && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 13.5, color: T.text }}>Ask for feedback</b>
          <div role="group" aria-label="Peers to ask" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 4 }}>
            {pool.map((e) => (
              <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: asked.has(e.id) ? T.mute : T.text, minHeight: 32 }}>
                <input type="checkbox" disabled={asked.has(e.id)} checked={asked.has(e.id) || pick.includes(e.id)} onChange={(ev) => { setPick((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id))); setErr(null); }} />
                {e.firstName} {e.lastName}
              </label>
            ))}
          </div>
          {err && <Note tone="red">{err}</Note>}
          <div><Button disabled={pick.length === 0} onClick={() => { const x = requestFeedback(r.id, pick); if (x.ok) { toast.success(`Feedback requested from ${pick.length} people (simulation, nothing was sent).`); setPick([]); } else setErr(x.error); }}>Request feedback</Button></div>
          <Simulation>Requests are recorded here. This preview sends no message to the peers.</Simulation>
        </div>
      )}
      {role === 'hr' && pending.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="respond-panel">
          <b style={{ fontSize: 13.5, color: T.text }}>Respond as a peer</b>
          <Simulation>In the live product each peer answers from their own login. Here you can fill in a peer&apos;s answer to see how the anonymous result builds up.</Simulation>
          <div style={{ width: 280 }}><Select aria-label="Respond as" value={as} onChange={(e) => setAs(e.target.value)}><option value="">Choose a peer</option>{pending.map((f) => <option key={f.id} value={f.id}>{empName(db, f.reviewerId)}</option>)}</Select></div>
          {as && <RespondForm key={as} reviewId={r.id} requestId={as} onDone={() => setAs('')} />}
        </div>
      )}
    </section>
  );
}

function RespondForm({ reviewId, requestId, onDone }: { reviewId: string; requestId: string; onDone: () => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const complete = PERF_COMPETENCIES.every((c) => ratings[c]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PERF_COMPETENCIES.map((c) => <Row key={c} style={{ justifyContent: 'space-between' }}><span style={{ fontSize: 13.5 }}>{c}</span><RatingInput label={`Peer rating, ${c}`} value={ratings[c]} labels={RATING_LABEL} onChange={(n) => setRatings((x) => ({ ...x, [c]: n }))} /></Row>)}
      <Field label="One comment (optional)" htmlFor="peer-comment"><Input id="peer-comment" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      {err && <Note tone="red">{err}</Note>}
      <div><Button variant="primary" disabled={!complete} onClick={() => { const x = respondFeedback(reviewId, requestId, ratings, comment); if (x.ok) { toast.success('Feedback submitted and locked.'); onDone(); } else setErr(x.error); }}>Submit feedback</Button></div>
    </div>
  );
}
