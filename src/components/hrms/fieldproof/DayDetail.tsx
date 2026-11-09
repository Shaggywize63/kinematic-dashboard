'use client';
// One person-day of visit evidence, with the suggestion and the decision. Opened from the review list and from the
// team calendar. Approve, ask for more information or reject; a decided day shows who decided and can be reopened.

import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../ui';
import { Badge, Button, Modal, Note, T, type Tone } from '../ui';
import type { Employee } from '../../../lib/hrms/types';
import { fmtDate, fmtDateTime, fullName } from '../../../lib/hrms/format';
import type { FieldEvidence, RegularisationSuggestion } from '../../../lib/hrms/field/types';
import { regularisationFor } from '../../../lib/hrms/field/engines';
import { decideRegularisation, undoRegularisation, type RegDecision } from '../../../lib/hrms/field/store';
import { DAY_STATUS_LABEL, DECISION_LABEL, VERDICT_LABEL, dayStatus, evidenceSummary, finalTimes, regKey, spanText, validateTimes } from '../../../lib/hrms/fieldproof/logic';
import { DayMap, DayTimeline } from './DayViews';
import { Block, Bullets, Facts, LinkButton, NoteField } from './shared';

export const VERDICT_TONE: Record<RegularisationSuggestion['verdict'], Tone> = { auto_approve: 'ok', needs_review: 'warn', no_evidence: 'red', not_needed: 'neutral' };
export const DECISION_TONE: Record<RegDecision['status'], Tone> = { approved: 'ok', rejected: 'red', info_requested: 'info' };

export function VerdictBadge({ verdict }: { verdict: RegularisationSuggestion['verdict'] }) {
  return <Badge tone={VERDICT_TONE[verdict]} dot>{VERDICT_LABEL[verdict]}</Badge>;
}

export default function DayDetail({ ev, person, date, regs, onClose }: {
  ev: FieldEvidence; person: Employee; date: string; regs: Record<string, RegDecision>; onClose: () => void;
}) {
  const name = fullName(person);
  const s = regularisationFor(ev, person.id, date);
  const decision = regs[regKey(person.id, date)];
  const st = dayStatus(ev, regs, person.id, date);
  const sum = evidenceSummary(ev, person.id, date);

  const init = s ? finalTimes(ev, s) : { in: '', out: '' };
  const [tin, setTin] = useState(decision?.in ?? init.in);
  const [tout, setTout] = useState(decision?.out ?? init.out);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const needsNote = !!s && s.verdict !== 'auto_approve';
  const act = (status: RegDecision['status']) => {
    setErr(null);
    if (status === 'approved') {
      const bad = validateTimes(tin, tout);
      if (bad) { setErr(bad); return; }
      if (needsNote && note.trim().length < 3) { setErr(`This day is "${VERDICT_LABEL[s!.verdict].toLowerCase()}". Say in a note why you are approving it.`); return; }
      decideRegularisation(person.id, date, 'approved', { in: tin, out: tout, note: note.trim() || undefined });
      toast.success(`Approved ${name}, ${fmtDate(date)}`);
    } else {
      if (note.trim().length < 3) { setErr(status === 'rejected' ? 'Say in a note why you are rejecting it.' : 'Say in a note what you need to know from the person.'); return; }
      decideRegularisation(person.id, date, status, { note: note.trim() });
      toast.success(status === 'rejected' ? `Rejected ${name}, ${fmtDate(date)}` : `Asked ${name} for more information`);
    }
    onClose();
  };

  return (
    <Modal title={`${name}, ${fmtDate(date)}`} onClose={onClose} width={1000}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {s ? <VerdictBadge verdict={s.verdict} /> : <Badge tone="neutral" dot>{st.label}</Badge>}
        {decision && <Badge tone={DECISION_TONE[decision.status]} dot>{DECISION_LABEL[decision.status]}</Badge>}
        <span style={{ fontSize: 13, color: T.dim }}>{person.code}</span>
        <LinkButton href={`/dashboard/hrms/employees/${person.id}`} label={`Open employee ${name}`}>Open employee</LinkButton>
      </div>

      <Facts items={[
        { label: 'Punch in', value: sum.punchIn ?? 'missing' }, { label: 'Punch out', value: sum.punchOut ?? 'missing' },
        { label: 'Visits', value: `${sum.verified} verified of ${sum.visits}` }, { label: 'First to last verified', value: sum.spanMin ? spanText(sum.spanMin) : 'none' },
        { label: 'GPS trail', value: `${sum.trailKm.toFixed(1)} km` },
      ]} />

      {s ? (
        <Block title="What the system found">
          <Bullets items={s.reasons} />
          {s.verdict !== 'auto_approve' && <Note tone={s.verdict === 'no_evidence' ? 'red' : 'warn'}>This one is advisory. {s.verdict === 'no_evidence' ? 'No time is suggested, because nothing proves the person was working.' : 'It is below the auto-approve rule, so a manager decides.'} A missed punch is never a reason to cut pay on its own.</Note>}
        </Block>
      ) : (
        <Note>{st.status === 'present' ? 'Both punches are there, so there is nothing to regularise.' : st.status === 'absent' ? 'There is no punch and no visit on record. This may be leave. Nothing here to regularise.' : st.status === 'off' ? `${st.label}. No work is expected.` : 'There is no evidence for this day yet.'}</Note>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 20, alignItems: 'start' }}>
      <Block title="The day">
        <DayTimeline ev={ev} employeeId={person.id} date={date} />
      </Block>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <Block title="Where the phone was"><DayMap ev={ev} employeeId={person.id} date={date} height={240} /></Block>

      {s && decision && (
        <Block title="Decision">
          <div data-testid="decision-card" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, background: T.raised, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 14, color: T.text }}><b>{DECISION_LABEL[decision.status]}</b> by {decision.by}, {fmtDateTime(decision.at)}</div>
            {decision.in && decision.out && <div style={{ fontSize: 13.5, color: T.dim }}>Punch times recorded: {decision.in} to {decision.out}.</div>}
            {decision.note && <div style={{ fontSize: 13.5, color: T.dim }}>Note: {decision.note}</div>}
            <div><Button size="sm" onClick={() => { undoRegularisation(person.id, date); toast.success('Reopened for a decision'); onClose(); }}>Reopen</Button></div>
          </div>
        </Block>
      )}

      {s && !decision && (
        <Block title="Your decision">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: T.dim }}>Punch in
              <Input type="time" aria-label="Punch in time" value={tin} onChange={(e) => { setTin(e.target.value); setErr(null); }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: T.dim }}>Punch out
              <Input type="time" aria-label="Punch out time" value={tout} onChange={(e) => { setTout(e.target.value); setErr(null); }} />
            </label>
          </div>
          <div style={{ fontSize: 12.5, color: T.mute }}>
            {s.suggestedIn || s.suggestedOut
              ? `Prefilled from the suggestion (${[s.suggestedIn && `in ${s.suggestedIn}`, s.suggestedOut && `out ${s.suggestedOut}`].filter(Boolean).join(', ')}). The punch that exists is kept. You can change the times.`
              : 'No time is suggested for this day. Enter the times you accept, if you approve.'}
          </div>
          <NoteField id="reg-note" label="Note" required={needsNote} value={note} onChange={(v) => { setNote(v); setErr(null); }}
            placeholder="Why you decided this. Required to approve a day that is not auto-approvable, to reject, or to ask for more information."
            hint="The person can read this note." rows={2} />
          {err && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => act('approved')}>Approve with these times</Button>
            <Button onClick={() => act('info_requested')}>Ask for more info</Button>
            <Button variant="danger" onClick={() => act('rejected')}>Reject</Button>
          </div>
          <div style={{ fontSize: 12, color: T.mute }}>Status now: {DAY_STATUS_LABEL[st.status].toLowerCase()}. Nothing is cut from pay by any of these buttons. They only record what attendance shows.</div>
        </Block>
      )}
      </div>
      </div>
    </Modal>
  );
}
