'use client';
// Candidate detail: contact (masked), profile, notes, interview scorecards side by side, the offer builder with the
// payroll engine's monthly breakup, and the step from an accepted offer to a new employee. Scorecards inform; they never decide.

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, ConfidenceBadge, KeyValue, Modal, Note, StatusBadge, T } from '../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../ui';
import { fmtDate, inr, inrShort, addDays } from '../../../lib/hrms/format';
import { maskMobile } from '../../../lib/hrms/validators';
import { LABOUR_CODES } from '../../../lib/hrms/rules';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import {
  COMPETENCIES, ROUNDS, SOURCE_LABEL, STAGES, STAGE_LABEL, REJECT_REASONS, rejectLabel, type Candidate, type HiringState, type RejectCode, type Stage,
} from '../../../lib/hrms/hiring/types';
import { candidateAverage, canMove, offerBreakup, scorecardAverage, scorecardMatrix, validateOffer } from '../../../lib/hrms/hiring/engines';
import {
  addScorecard, convertToEmployee, decideOffer, extendOffer, moveCandidate, removeScorecard, saveOffer, setCandidateNotes,
} from '../../../lib/hrms/hiring/store';
import { RatingInput, RatingValue, Row, Simulation, empName, report, subtle, mono, toast } from './shared';

const stageTone = (s: Stage) => (s === 'hired' ? 'ok' : s === 'rejected' ? 'red' : s === 'offer' ? 'warn' : 'info') as 'ok' | 'red' | 'warn' | 'info';
const h3: React.CSSProperties = { margin: 0, fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text };
const box: React.CSSProperties = { border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: T.card };

export default function CandidateModal({ db, st, id, onClose }: { db: HrmsDb; st: HiringState; id: string; onClose: () => void }) {
  const c = st.candidates.find((x) => x.id === id);
  const [rejecting, setRejecting] = useState(false);
  if (!c) return null;
  const opening = st.openings.find((o) => o.id === c.openingId);
  const locked = !!c.convertedEmployeeId;

  return (
    <Modal title={c.name} width={920} onClose={onClose}>
      <div data-testid="candidate-modal" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Row gap={10}>
          <Badge tone={stageTone(c.stage)} dot>{STAGE_LABEL[c.stage]}</Badge>
          <span style={{ fontSize: 13.5, color: T.dim }}>{opening?.title} · {opening ? db.locations.find((l) => l.id === opening.locationId)?.name : ''}</span>
          {c.rejectReason && <Badge tone="red">{rejectLabel(c.rejectReason)}</Badge>}
        </Row>

        <StageControls c={c} onReject={() => setRejecting(true)} />

        <section aria-label="Profile" style={box}>
          <h3 style={h3}>Profile</h3>
          <KeyValue columns={3} rows={[
            { label: 'Email', value: c.email },
            { label: 'Mobile', value: <span data-testid="masked-mobile" style={mono}>{maskMobile(c.mobile)}</span> },
            { label: 'Source', value: SOURCE_LABEL[c.source] },
            { label: 'Experience', value: `${c.experienceYears} ${c.experienceYears === 1 ? 'year' : 'years'}` },
            { label: 'Expected CTC', value: inr(c.expectedCtc) },
            { label: 'Notice period', value: `${c.noticeDays} days` },
            { label: 'Applied on', value: fmtDate(c.appliedOn) },
          ]} />
          <div style={subtle}>The full mobile number is hidden in this preview. In the live product it would be shown to the recruiter only, and each reveal would be logged.</div>
          <Notes c={c} />
        </section>

        <Scorecards db={db} c={c} locked={locked} />
        {c.stage !== 'rejected' && <OfferBuilder db={db} st={st} c={c} />}
        <History c={c} />
      </div>
      {rejecting && <RejectDialog name={c.name} onClose={() => setRejecting(false)} onConfirm={(code, note) => { const ok = report(moveCandidate(c.id, 'rejected', code, note), `${c.name} moved to Rejected.`); if (ok) setRejecting(false); }} />}
    </Modal>
  );
}

// ───────────────────────────── stage buttons ─────────────────────────────
export function RejectDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: (code: RejectCode, note: string) => void }) {
  const [code, setCode] = useState<RejectCode | ''>('');
  const [note, setNote] = useState('');
  return (
    <Modal title={`Reject ${name}`} width={480} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!code} onClick={() => code && onConfirm(code, note)}>Reject candidate</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>A reason code is required. Codes are about the role and the process only, so the decision can be reviewed later.</div>
      <Field label="Reason code" required htmlFor="reject-code">
        <Select id="reject-code" value={code} onChange={(e) => setCode(e.target.value as RejectCode)}>
          <option value="">Choose a reason</option>
          {REJECT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor="reject-note"><Textarea id="reject-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function StageControls({ c, onReject }: { c: Candidate; onReject: () => void }) {
  const checks = STAGES.map((s) => ({ s, chk: canMove(c, s) }));
  const reasons = [...new Set(checks.filter((x) => !x.chk.ok && x.s !== c.stage && x.chk.reason).map((x) => x.chk.reason!))];
  return (
    <div role="group" aria-label="Move stage" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row gap={6}>
        <span style={{ fontSize: 12.5, color: T.dim, marginRight: 4 }}>Move to</span>
        {checks.map(({ s, chk }) => (
          <Button key={`${s}-${s === c.stage}`} size="sm" variant={s === c.stage ? 'primary' : 'secondary'} disabled={!chk.ok} aria-pressed={s === c.stage} title={chk.reason}
            onClick={() => { if (s === 'rejected') onReject(); else report(moveCandidate(c.id, s), `${c.name} moved to ${STAGE_LABEL[s]}.`); }}>
            {s === 'rejected' && c.stage === 'rejected' ? 'Rejected' : STAGE_LABEL[s]}
          </Button>
        ))}
      </Row>
      {reasons.length > 0 && <div data-testid="move-blocked" style={subtle}>{reasons.join(' ')}</div>}
    </div>
  );
}

function Notes({ c }: { c: Candidate }) {
  const [text, setText] = useState(c.notes);
  const dirty = text !== c.notes;
  return (
    <Field label="Recruiter notes" htmlFor="cand-notes" hint="Work-related notes only. Do not record age, marital status, religion, caste, health or family plans.">
      <Textarea id="cand-notes" rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!!c.convertedEmployeeId} />
      <div><Button size="sm" disabled={!dirty} onClick={() => report(setCandidateNotes(c.id, text), 'Notes saved.')}>Save notes</Button></div>
    </Field>
  );
}

// ───────────────────────────── scorecards ─────────────────────────────
function Scorecards({ db, c, locked }: { db: HrmsDb; c: Candidate; locked: boolean }) {
  const [adding, setAdding] = useState(false);
  const m = scorecardMatrix(c.scorecards);
  const { average, rounds } = candidateAverage(c);
  return (
    <section aria-label="Interview scorecards" style={box}>
      <Row style={{ justifyContent: 'space-between' }}>
        <h3 style={h3}>Interview scorecards</h3>
        {!locked && !adding && <Button size="sm" onClick={() => setAdding(true)}>Add scorecard</Button>}
      </Row>
      <div style={subtle}>Each round rates competencies from 1 to 5 with a comment. The numbers are for people to read side by side. This page never recommends a hire or a reject.</div>
      {c.scorecards.length === 0 && !adding && <div style={{ ...subtle, padding: '6px 0' }}>No scorecards yet. Add one after each interview round.</div>}
      {c.scorecards.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="scorecard-matrix" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + c.scorecards.length * 150 }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Competency</th>
                {c.scorecards.map((s) => (
                  <th key={s.id} scope="col" style={{ ...th, textAlign: 'left' }}>
                    <div style={{ color: T.text, textTransform: 'none', letterSpacing: 0, fontSize: 12.5 }}>{s.round}</div>
                    <div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{empName(db, s.interviewerId)} · {fmtDate(s.on)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.competencies.map((comp, i) => (
                <tr key={comp}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{comp}</th>
                  {m.cells[i]!.map((v, k) => <td key={k} style={td}><RatingValue value={v} /></td>)}
                </tr>
              ))}
              <tr>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 700, borderTop: `2px solid ${T.border}` }}>Average</th>
                {m.averages.map((a, k) => <td key={k} data-testid={`round-average-${k}`} style={{ ...td, fontWeight: 700, borderTop: `2px solid ${T.border}` }}><RatingValue value={a} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {c.scorecards.length > 0 && (
        <div data-testid="scorecard-overall" style={{ fontSize: 13, color: T.dim }}>
          Average across {rounds} {rounds === 1 ? 'round' : 'rounds'}: <b style={{ color: T.text, fontFamily: T.mono }}>{average?.toFixed(1) ?? '—'}</b> out of 5. For information only.
        </div>
      )}
      {c.scorecards.map((s) => {
        const notes = s.ratings.filter((r) => r.comment);
        return (
          <div key={s.id} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.round} <span style={{ fontWeight: 400, color: T.dim }}>· average {scorecardAverage(s)?.toFixed(1) ?? '—'}</span></span>
              {!locked && <Button size="sm" variant="ghost" aria-label={`Remove scorecard ${s.round}`} onClick={() => { removeScorecard(c.id, s.id); toast.success('Scorecard removed.'); }}>Remove</Button>}
            </Row>
            {s.summary && <div style={{ fontSize: 13, color: T.text }}>{s.summary}</div>}
            {notes.map((r) => <div key={r.competency} style={subtle}><b style={{ color: T.dim }}>{r.competency}:</b> {r.comment}</div>)}
          </div>
        );
      })}
      {adding && <ScorecardForm db={db} c={c} onDone={() => setAdding(false)} />}
    </section>
  );
}
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${T.border}`, verticalAlign: 'bottom', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}` };

function ScorecardForm({ db, c, onDone }: { db: HrmsDb; c: Candidate; onDone: () => void }) {
  const [round, setRound] = useState<string>(ROUNDS[0]);
  const [who, setWho] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const people = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const rated = COMPETENCIES.filter((k) => ratings[k]);
  return (
    <div data-testid="scorecard-form" style={{ ...box, background: T.panel }}>
      <FormGrid columns={2} narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Field label="Round" required htmlFor="sc-round"><Select id="sc-round" value={round} onChange={(e) => setRound(e.target.value)}>{ROUNDS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Interviewer" required htmlFor="sc-who">
          <Select id="sc-who" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Choose a person</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</Select>
        </Field>
      </FormGrid>
      <div style={{ ...subtle }}>Rate only the competencies this round asked about. Leave the rest unrated.</div>
      {COMPETENCIES.map((k) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) auto 1fr', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: T.text }}>{k}</span>
          <RatingInput label={k} value={ratings[k]} onChange={(n) => setRatings((r) => ({ ...r, [k]: r[k] === n ? 0 : n }))} />
          <Input aria-label={`${k} comment`} placeholder="Comment (what you saw)" value={comments[k] ?? ''} onChange={(e) => setComments((x) => ({ ...x, [k]: e.target.value }))} style={{ minWidth: 0 }} />
        </div>
      ))}
      <Field label="Summary" htmlFor="sc-summary"><Textarea id="sc-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      {err && <Note tone="red">{err}</Note>}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={rated.length === 0} onClick={() => {
          const r = addScorecard(c.id, { round, interviewerId: who, ratings: rated.map((k) => ({ competency: k, rating: ratings[k]!, comment: comments[k] })), summary });
          if (r.ok) { toast.success('Scorecard saved.'); onDone(); } else setErr(r.error);
        }}>Save scorecard</Button>
      </Row>
    </div>
  );
}

// ───────────────────────────── offer builder ─────────────────────────────
function OfferBuilder({ db, st, c }: { db: HrmsDb; st: HiringState; c: Candidate }) {
  const opening = st.openings.find((o) => o.id === c.openingId);
  const offer = c.offer;
  const closed = offer?.status === 'accepted' || offer?.status === 'declined';
  const [ctc, setCtc] = useState(String(offer?.ctc ?? c.expectedCtc));
  const [joining, setJoining] = useState(offer?.joiningDate ?? addDays(PREVIEW_TODAY, Math.max(14, c.noticeDays)));
  const [structureId, setStructureId] = useState(offer?.structureId ?? db.structures[0]?.id ?? '');
  const [converting, setConverting] = useState(false);
  const ctcN = Number(ctc.replace(/,/g, ''));
  const structure = db.structures.find((s) => s.id === structureId);
  const view = offerBreakup(structure, ctcN, joining);
  const check = validateOffer({ ctc: ctcN, joiningDate: joining, structureId }, opening, PREVIEW_TODAY);
  const b = view.breakup;
  const dirty = !offer || offer.ctc !== ctcN || offer.joiningDate !== joining || offer.structureId !== structureId;
  const earnings = b?.lines.filter((l) => l.kind === 'earning') ?? [];
  const employer = b?.lines.filter((l) => l.kind === 'employer') ?? [];

  return (
    <section aria-label="Offer" style={box}>
      <Row style={{ justifyContent: 'space-between' }}>
        <h3 style={h3}>Offer</h3>
        {offer && <StatusBadge status={offer.status === 'extended' ? 'upcoming' : offer.status === 'accepted' ? 'verified' : offer.status === 'declined' ? 'rejected' : 'draft'} label={`Offer ${offer.status}`} />}
      </Row>
      {!closed ? (
        <>
          <FormGrid columns={3} narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Field label="Annual CTC (₹)" required htmlFor="offer-ctc" hint={opening ? `Band ${inrShort(opening.bandMin)} to ${inrShort(opening.bandMax)}. Expected ${inrShort(c.expectedCtc)}.` : undefined}>
              <Input id="offer-ctc" inputMode="numeric" value={ctc} onChange={(e) => setCtc(e.target.value)} />
            </Field>
            <Field label="Joining date" required htmlFor="offer-join"><Input id="offer-join" type="date" value={joining} min={PREVIEW_TODAY} onChange={(e) => setJoining(e.target.value)} /></Field>
            <Field label="Salary structure" required htmlFor="offer-structure">
              <Select id="offer-structure" value={structureId} onChange={(e) => setStructureId(e.target.value)}>{db.structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
          </FormGrid>
          {check.errors.length > 0 && <Note tone="red">{check.errors[0]}</Note>}
          {check.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        </>
      ) : (
        <KeyValue columns={3} rows={[{ label: 'Annual CTC', value: inr(offer!.ctc) }, { label: 'Joining date', value: fmtDate(offer!.joiningDate) }, { label: 'Salary structure', value: db.structures.find((s) => s.id === offer!.structureId)?.name }]} />
      )}

      {b && (
        <div data-testid="offer-breakup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Row>
            <b style={{ fontSize: 13, color: T.text }}>Monthly breakup</b>
            <span style={subtle}>from the payroll engine, as on {fmtDate(joining)}</span>
            <ConfidenceBadge level="reported" />
          </Row>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
              <thead><tr><th scope="col" style={th}>Component</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Monthly</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Yearly</th></tr></thead>
              <tbody>
                {earnings.map((l) => <tr key={l.componentId}><td style={td}>{l.name}{l.isWage && <span style={{ color: T.mute }}> (wage)</span>}</td><td style={{ ...td, textAlign: 'right', ...mono }}>{inr(l.monthly)}</td><td style={{ ...td, textAlign: 'right', ...mono }}>{inr(l.monthly * 12)}</td></tr>)}
                {employer.map((l) => <tr key={l.componentId}><td style={{ ...td, color: T.dim }}>{l.name} <span style={{ color: T.mute }}>(employer, inside CTC)</span></td><td style={{ ...td, textAlign: 'right', color: T.dim, ...mono }}>{inr(l.monthly)}</td><td style={{ ...td, textAlign: 'right', color: T.dim, ...mono }}>{inr(l.monthly * 12)}</td></tr>)}
                <tr><td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${T.border}` }}>Cost to company</td><td style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${T.border}`, ...mono }}>{inr(b.monthlyCtc)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${T.border}`, ...mono }}>{inr(ctcN)}</td></tr>
              </tbody>
            </table>
          </div>
          <div data-testid="wage-test" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Badge tone={b.wageTest.passes ? 'ok' : 'warn'} dot>{b.wageTest.passes ? 'Passes the 50% wages rule' : 'Fails the 50% wages rule'}</Badge>
            <span style={{ ...subtle, flex: '1 1 260px' }}>
              Wages (basic and dearness allowance) are <b style={{ color: T.text }}>{b.wageTest.wagePct.toFixed(1)}%</b> of remuneration; the Labour Codes ask for at least {LABOUR_CODES.minWagePercent}%.
              {!b.wageTest.passes && <> {inr(b.wageTest.addBack)} a month is added back to wages, which raises PF and gratuity. Pick a structure with a higher basic, or accept the cost.</>}
              {' '}Confirm with your advisor.
            </span>
          </div>
        </div>
      )}

      {offer?.status === 'extended' && <Note tone="info">Offer extended on {fmtDate(offer.extendedOn)}. Record the candidate&apos;s answer below.</Note>}
      {!closed && (
        <Row>
          <Button disabled={check.errors.length > 0 || !dirty} onClick={() => report(saveOffer(c.id, { ctc: ctcN, joiningDate: joining, structureId }), 'Offer saved.')}>{offer ? 'Save changes' : 'Save offer'}</Button>
          {offer?.status === 'draft' && !dirty && <Button variant="primary" onClick={() => report(extendOffer(c.id), 'Offer marked as extended.')}>Extend offer</Button>}
          {offer?.status === 'extended' && !dirty && <>
            <Button variant="primary" onClick={() => report(decideOffer(c.id, 'accepted'), 'Offer accepted. The candidate is now Hired.')}>Mark offer accepted</Button>
            <Button onClick={() => report(decideOffer(c.id, 'declined'), 'Offer declined.')}>Mark offer declined</Button>
          </>}
          {dirty && offer && <span style={subtle}>Save your changes before extending or recording an answer.</span>}
          {!offer && <span style={subtle}>Save the offer to extend it.</span>}
        </Row>
      )}
      {!closed && <Simulation>Extending an offer here only records it. No letter, e-mail or e-signature is sent by this preview.</Simulation>}

      {offer?.status === 'accepted' && !c.convertedEmployeeId && (
        <div style={{ ...box, background: T.panel }}>
          <b style={{ fontSize: 13.5, color: T.text }}>Next: create the employee</b>
          <div style={subtle}>This adds {c.name} to Employees with status Onboarding, starts the joining checklist in Lifecycle, and fills one seat on the opening.</div>
          <div><Button variant="primary" onClick={() => setConverting(true)}>Convert to employee</Button></div>
        </div>
      )}
      {c.convertedEmployeeId && (
        <Note tone="ok">
          <span data-testid="converted-note">{c.name} is now an employee (Onboarding). </span>
          <Link href={`/dashboard/hrms/employees/${c.convertedEmployeeId}`} style={{ color: 'inherit', fontWeight: 600 }}>Open the employee</Link>{' · '}
          <Link href="/dashboard/hrms/lifecycle" style={{ color: 'inherit', fontWeight: 600 }}>See the joining checklist</Link>
        </Note>
      )}
      {converting && <ConvertDialog c={c} onClose={() => setConverting(false)} />}
    </section>
  );
}

function ConvertDialog({ c, onClose }: { c: Candidate; onClose: () => void }) {
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`Create the employee record for ${c.name}`} width={520} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = convertToEmployee(c.id, { dob, gender: gender as 'male' | 'female' | 'other' });
        if (r.ok) { toast.success(`${c.name} added to Employees and Lifecycle.`); onClose(); } else setErr(r.error);
      }}>Create employee</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
        Date of birth and gender are asked only now, because the employee record needs them. They were not part of the hiring decision and are not kept on the candidate.
      </div>
      <FormGrid narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Date of birth" required htmlFor="conv-dob"><Input id="conv-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
        <Field label="Gender" required htmlFor="conv-gender">
          <Select id="conv-gender" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
        </Field>
      </FormGrid>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}

// ───────────────────────────── history ─────────────────────────────
function History({ c }: { c: Candidate }) {
  return (
    <section aria-label="Stage history" style={box}>
      <h3 style={h3}>Stage history</h3>
      <ol data-testid="stage-history" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...c.history].reverse().map((h, i) => (
          <li key={i} style={{ fontSize: 13, color: T.text, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...mono, color: T.mute, minWidth: 92 }}>{fmtDate(h.on)}</span>
            <span>{h.from ? `${STAGE_LABEL[h.from]} to ${STAGE_LABEL[h.to]}` : `Applied (${h.by})`}</span>
            <span style={{ color: T.dim }}>{h.from ? `by ${h.by}` : ''}{h.reason ? ` · ${rejectLabel(h.reason)}` : ''}{h.note ? ` · ${h.note}` : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

