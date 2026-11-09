'use client';
// The pipeline board for one opening: a column per stage, a card per candidate. Stage moves are explicit buttons
// (keyboard and screen-reader friendly); there is no drag. The card shows competencies and work facts only: no photo, age or gender.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, EmptyState, Note, SearchBox, T, Toolbar, useIsCompact } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import { inrShort } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import { SOURCES, SOURCE_LABEL, STAGES, STAGE_LABEL, rejectLabel, type Candidate, type HiringState, type Source, type Stage } from '../../../lib/hrms/hiring/types';
import { candidateAverage, canMove, daysInStage, nextStage, prevStage, seatsLeft } from '../../../lib/hrms/hiring/engines';
import { addCandidate, moveCandidate } from '../../../lib/hrms/hiring/store';
import { Modal } from '../ui';
import { RejectDialog } from './CandidateModal';
import { OPENING_TONE, Row, locName, report, subtle, toast, mono } from './shared';
import { OPENING_STATUS_LABEL } from '../../../lib/hrms/hiring/types';

export default function PipelineTab({ db, st, openingId, setOpeningId, onOpen }: { db: HrmsDb; st: HiringState; openingId: string; setOpeningId: (id: string) => void; onOpen: (id: string) => void }) {
  const compact = useIsCompact(900);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<Candidate | null>(null);
  const opening = st.openings.find((o) => o.id === openingId);
  const choices = st.openings.filter((o) => o.status === 'open' || o.status === 'on_hold' || o.status === 'filled' || st.candidates.some((c) => c.openingId === o.id));
  const all = st.candidates.filter((c) => c.openingId === openingId && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())));
  const byStage = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, all.filter((c) => c.stage === s)])) as Record<Stage, Candidate[]>, [all]);

  if (!opening) return <EmptyState title="No opening to show" description="Create an opening on the Openings tab first." />;
  const canAdd = opening.status === 'open';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <div style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 380 }}>
          <Select aria-label="Opening" value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
            {choices.map((o) => <option key={o.id} value={o.id}>{o.title}, {locName(db, o.locationId)} ({OPENING_STATUS_LABEL[o.status]})</option>)}
          </Select>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search candidates" width={220} />
        <div style={{ flex: 1 }} />
        <Button variant="primary" disabled={!canAdd} onClick={() => setAdding(true)}>Add candidate</Button>
      </Toolbar>
      <Row gap={8}>
        <Badge tone={OPENING_TONE[opening.status]} dot>{OPENING_STATUS_LABEL[opening.status]}</Badge>
        <span style={subtle}>{opening.filled} of {opening.headcount} filled · {seatsLeft(opening)} seat{seatsLeft(opening) === 1 ? '' : 's'} open · band {inrShort(opening.bandMin)} to {inrShort(opening.bandMax)}</span>
        {!canAdd && <span data-testid="add-disabled-reason" style={{ ...subtle, color: T.warn }}>{opening.status === 'on_hold' ? 'On hold: resume the opening to add candidates.' : opening.status === 'filled' ? 'Filled: every seat is taken.' : 'Not open yet: candidates can be added once it is approved.'}</span>}
      </Row>
      {opening.status === 'on_hold' && opening.holdReason && <Note tone="info">On hold: {opening.holdReason}</Note>}

      <div data-testid="board" style={compact
        ? { display: 'flex', flexDirection: 'column', gap: 14 }
        : { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(176px, 1fr)) minmax(150px, 0.85fr) minmax(165px, 0.95fr)', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
        {STAGES.map((s) => (
          <section key={s} aria-label={`${STAGE_LABEL[s]} stage`} data-testid={`col-${s}`} style={{ background: T.raised, borderRadius: T.radius.lg, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px' }}>
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{STAGE_LABEL[s]}</h3>
              <span style={{ fontSize: 12, color: T.dim, ...mono }}>{byStage[s].length}</span>
            </div>
            {byStage[s].length === 0 && <div style={{ ...subtle, padding: '6px 8px 10px' }}>{s === 'applied' ? 'No new applications.' : 'No one here.'}</div>}
            {byStage[s].map((c) => <CandidateCard key={c.id} c={c} onOpen={() => onOpen(c.id)} onReject={() => setRejecting(c)} />)}
          </section>
        ))}
      </div>

      {adding && <AddCandidate opening={opening.id} onClose={() => setAdding(false)} />}
      {rejecting && <RejectDialog name={rejecting.name} onClose={() => setRejecting(null)} onConfirm={(code, note) => { if (report(moveCandidate(rejecting.id, 'rejected', code, note), `${rejecting.name} moved to Rejected.`)) setRejecting(null); }} />}
    </div>
  );
}

function CandidateCard({ c, onOpen, onReject }: { c: Candidate; onOpen: () => void; onReject: () => void }) {
  const { average, rounds } = candidateAverage(c);
  const next = nextStage(c.stage);
  const prev = prevStage(c.stage);
  const nextCheck = next ? canMove(c, next) : null;
  const prevCheck = prev ? canMove(c, prev) : null;
  const final = !!c.convertedEmployeeId;
  const offerOut = c.offer?.status === 'extended';
  return (
    <Card padding={10} className="" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: T.radius.md }}>
      <div data-testid={`card-${c.id}`}>
        <button type="button" onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: T.text, textAlign: 'left', display: 'block', width: '100%', overflowWrap: 'anywhere' }}
          aria-label={`Open ${c.name}`}>{c.name}</button>
        <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{c.experienceYears} {c.experienceYears === 1 ? 'yr' : 'yrs'} · wants {inrShort(c.expectedCtc)} · notice {c.noticeDays}d</div>
      </div>
      <Row gap={6}>
        <Badge>{SOURCE_LABEL[c.source]}</Badge>
        {average != null ? <Badge tone="info" mono>{average.toFixed(1)} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</Badge> : <Badge>No scorecards</Badge>}
        {c.offer && c.offer.status !== 'draft' && <Badge tone={c.offer.status === 'accepted' ? 'ok' : c.offer.status === 'declined' ? 'red' : 'warn'}>Offer {c.offer.status}</Badge>}
      </Row>
      <div style={{ fontSize: 11.5, color: T.mute }}>{c.stage === 'rejected' ? rejectLabel(c.rejectReason) : `${daysInStage(c, PREVIEW_TODAY)} days at this stage`}</div>
      {final ? (
        <div style={{ fontSize: 12, color: T.ok }}>Now an employee. <Link href={`/dashboard/hrms/employees/${c.convertedEmployeeId}`} style={{ color: 'inherit', fontWeight: 600 }}>Open profile</Link></div>
      ) : (
        <Row gap={6}>
          {c.stage === 'rejected' ? (
            <Button size="sm" aria-label={`Reopen ${c.name}`} onClick={() => report(moveCandidate(c.id, 'applied'), `${c.name} reopened.`)}>Reopen</Button>
          ) : (
            <>
              {prev && <Button size="sm" aria-label={`Move ${c.name} back to ${STAGE_LABEL[prev]}`} disabled={!prevCheck?.ok} title={prevCheck?.reason} onClick={() => report(moveCandidate(c.id, prev), `${c.name} moved to ${STAGE_LABEL[prev]}.`)}>Back</Button>}
              {next && c.stage === 'offer'
                ? <Button size="sm" variant="primary" aria-label={`Open offer for ${c.name}`} onClick={onOpen}>{c.offer?.status === 'accepted' ? 'Convert' : 'Open offer'}</Button>
                : next && <Button size="sm" aria-label={`Move ${c.name} to ${STAGE_LABEL[next]}`} disabled={!nextCheck?.ok} title={nextCheck?.reason} onClick={() => report(moveCandidate(c.id, next), `${c.name} moved to ${STAGE_LABEL[next]}.`)}>To {STAGE_LABEL[next]}</Button>}
              {c.stage === 'hired' && <Button size="sm" variant="primary" onClick={onOpen}>Convert</Button>}
              <Button size="sm" variant="ghost" aria-label={`Reject ${c.name}`} disabled={offerOut} title={offerOut ? 'An offer is out. Record the answer first.' : undefined} onClick={onReject}>Reject</Button>
            </>
          )}
        </Row>
      )}
      {offerOut && <div style={{ fontSize: 11.5, color: T.warn }}>Offer is out. Record the answer to move on.</div>}
    </Card>
  );
}

function AddCandidate({ opening, onClose }: { opening: string; onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', mobile: '', source: 'job_board' as Source, exp: '2', ctc: '', notice: '30' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Add candidate" width={620} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = addCandidate({ openingId: opening, name: f.name, email: f.email, mobile: f.mobile, source: f.source, experienceYears: Number(f.exp), expectedCtc: Number(f.ctc.replace(/,/g, '')), noticeDays: Number(f.notice) });
        if (r.ok) { toast.success(`${f.name.trim()} added to Applied.`); onClose(); } else setErr(r.error);
      }}>Add to Applied</Button></>}>
      <div style={subtle}>Add what the application gave you. No photo, age or gender is asked for: they play no part in the screening.</div>
      <FormGrid narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Field label="Full name" required htmlFor="ac-name"><Input id="ac-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></Field>
        <Field label="Email" required htmlFor="ac-email"><Input id="ac-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" /></Field>
        <Field label="Mobile" required htmlFor="ac-mobile" hint="10 digits"><Input id="ac-mobile" inputMode="tel" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} autoComplete="off" /></Field>
        <Field label="Source" required htmlFor="ac-source"><Select id="ac-source" value={f.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</Select></Field>
        <Field label="Experience (years)" htmlFor="ac-exp"><Input id="ac-exp" inputMode="decimal" value={f.exp} onChange={(e) => set('exp', e.target.value)} /></Field>
        <Field label="Expected CTC (₹ a year)" required htmlFor="ac-ctc"><Input id="ac-ctc" inputMode="numeric" value={f.ctc} onChange={(e) => set('ctc', e.target.value)} /></Field>
        <Field label="Notice period (days)" htmlFor="ac-notice"><Input id="ac-notice" inputMode="numeric" value={f.notice} onChange={(e) => set('notice', e.target.value)} /></Field>
      </FormGrid>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
