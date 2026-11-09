'use client';
// Travel disputes: the sheet where HR reads the thread and the evidence and decides, and the form that raises a new
// dispute on behalf of an employee. HR decides; the decision, the note and the person's side stay on the record.

import { useState } from 'react';
import { Badge, Button, Card, KeyValue, Modal, Note, T } from '../ui';
import { Field, Input, Select, Textarea } from '../../ui';
import { fmtDate, fmtDateTime, inr } from '../../../lib/hrms/format';
import { ACTOR } from '../../../lib/hrms/actions';
import { decideDispute, raiseDispute, replyToDispute, type Dispute } from '../../../lib/hrms/field/store';
import { dayEvidence } from '../../../lib/hrms/field/engines';
import type { FieldEvidence } from '../../../lib/hrms/field/types';
import type { Id } from '../../../lib/hrms/types';
import { gapWindow } from '../../../lib/hrms/fieldpay/engines';
import { hm, num1, type Namer } from './common';
import { dayLabel } from './DayPanel';

export const DISPUTE_TONE = { open: 'warn', accepted: 'ok', partly_accepted: 'info', rejected: 'neutral' } as const;
export const disputeStatusLabel = (s: Dispute['status']): string => ({ open: 'Open', accepted: 'Accepted', partly_accepted: 'Partly accepted', rejected: 'Rejected' }[s]);

// ───────────────────────────── the decision sheet ─────────────────────────────
export function DisputeSheet({ dispute, ev, namer, rate, onClose }: { dispute: Dispute; ev: FieldEvidence; namer: Namer; rate: number; onClose: () => void }) {
  const name = namer.name(dispute.employeeId);
  const de = dayEvidence(ev, dispute.employeeId, dispute.ref);
  const odo = ev.odometer.find((o) => o.employeeId === dispute.employeeId && o.date === dispute.ref);
  const trail = ev.trails.find((t) => t.employeeId === dispute.employeeId && t.date === dispute.ref);
  const gap = trail ? gapWindow(trail.points) : undefined;
  const system = dispute.systemValue ?? trail?.km ?? 0;
  const claim = dispute.claimedValue ?? (odo ? odo.endKm - odo.startKm : undefined);
  const isOpen = dispute.status === 'open';

  // reply
  const [writeAs, setWriteAs] = useState<'hr' | 'employee'>('hr');
  const [msg, setMsg] = useState('');
  const send = () => {
    if (!msg.trim()) return;
    replyToDispute(dispute.id, writeAs, writeAs === 'hr' ? ACTOR : name, msg.trim());
    setMsg('');
  };

  // decision
  const [choice, setChoice] = useState<'accepted' | 'partly_accepted' | 'rejected' | ''>('');
  const [km, setKm] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const kmNum = Number(km);
  const errors: Record<string, string> = {};
  if (!choice) errors.choice = 'Choose a decision.';
  if (choice === 'accepted' && claim == null) errors.km = 'There is no claimed distance on file. Use "Partly accept" and enter the distance.';
  if (choice === 'partly_accepted') {
    if (km.trim() === '' || Number.isNaN(kmNum)) errors.km = 'Enter the distance you accept, in km.';
    else if (kmNum <= system) errors.km = `Enter more than the GPS figure (${num1(system)} km), or reject.`;
    else if (claim != null && kmNum >= claim) errors.km = `Enter less than the claim (${num1(claim)} km), or accept the full claim.`;
  }
  if (note.trim().length < 8) errors.note = 'Write the reason for your decision, at least a few words. It is kept on the record.';
  const show = (k: string) => (touched ? errors[k] : undefined);
  const decide = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const value = choice === 'accepted' ? claim : choice === 'partly_accepted' ? kmNum : undefined;
    decideDispute(dispute.id, choice as 'accepted' | 'partly_accepted' | 'rejected', value, note.trim());
  };

  return (
    <Modal title={`Travel dispute: ${name}, ${dayLabel(dispute.ref)}`} onClose={onClose} width={760} footer={<Button onClick={onClose}>Close</Button>}>
      <div data-testid="dispute-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={DISPUTE_TONE[dispute.status]} dot>{disputeStatusLabel(dispute.status)}</Badge>
          <span style={{ fontSize: 13, color: T.dim }}>Raised {fmtDate(dispute.raisedOn)}. {dispute.title}.</span>
        </div>

        <KeyValue columns={3} rows={[
          { label: 'What the system pays (GPS)', value: <span data-testid="dispute-system"><b>{num1(system)} km</b>, {inr(Math.round(system * rate))}</span> },
          { label: 'What the person says', value: <span data-testid="dispute-claim"><b>{claim != null ? `${num1(claim)} km` : 'Not stated'}</b>{claim != null ? `, ${inr(Math.round(claim * rate))}` : ''}</span> },
          { label: 'Difference at ₹' + rate + ' per km', value: claim != null ? `${num1(claim - system)} km, ${inr(Math.round((claim - system) * rate))}` : '—' },
        ]} />

        <div>
          <h3 style={h3}>The evidence</h3>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.65 }}>
            <li>GPS trail: {num1(trail?.km ?? 0)} km{gap ? `, with a ${hm(gap.minutes)} stretch of no fixes from ${gap.from} to ${gap.to}` : ', no meaningful gap'}.</li>
            <li>Odometer: {odo ? `${odo.endKm - odo.startKm} km (${odo.startKm.toLocaleString('en-IN')} to ${odo.endKm.toLocaleString('en-IN')}), photos at start ${odo.photoStart ? 'present' : 'missing'} and end ${odo.photoEnd ? 'present' : 'missing'}` : 'no reading that day'}.</li>
            <li>Visits that day: {de.visits.length}, of which {de.verifiedVisits.length} verified{de.punch?.in ? `. Punched ${de.punch.in} to ${de.punch.out ?? 'no punch-out'}` : ''}.</li>
          </ul>
        </div>

        <div>
          <h3 style={h3}>Thread</h3>
          <ul data-testid="dispute-thread" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dispute.messages.map((m, i) => (
              <li key={i}>
                <Card padding={12} style={{ background: m.role === 'hr' ? T.panel : T.card }}>
                  <div style={{ fontSize: 12, color: T.mute, marginBottom: 4 }}>{m.role === 'employee' ? 'Employee' : 'HR'}: {m.by}, {fmtDateTime(m.at)}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{m.text}</div>
                </Card>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select aria-label="Write as" value={writeAs} onChange={(e) => setWriteAs(e.target.value as 'hr' | 'employee')} style={{ width: 280 }}>
                <option value="hr">Write as HR</option>
                <option value="employee">Record a reply for the employee</option>
              </Select>
            </div>
            <Textarea aria-label="Message" value={msg} placeholder={writeAs === 'hr' ? 'Ask a question or explain what you need' : 'What the employee said, as they said it'} onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 64 }} />
            <div><Button onClick={send} disabled={!msg.trim()}>Add to thread</Button></div>
            <div style={{ fontSize: 12.5, color: T.dim }}>In the live product the employee writes their own messages from their app. Here you can record a reply on their behalf to try the flow.</div>
          </div>
        </div>

        {isOpen ? (
          <div data-testid="decision-form">
            <h3 style={h3}>Your decision</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Note>Read the person&apos;s message and the evidence first. Your decision and note are shown to the person and kept on the record. The person can reply in the thread before you decide.</Note>
              <div role="radiogroup" aria-label="Decision" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={radioRow}><input type="radio" name="decision" checked={choice === 'accepted'} onChange={() => setChoice('accepted')} />
                  Accept the odometer figure{claim != null ? ` (${num1(claim)} km)` : ''}</label>
                <label style={radioRow}><input type="radio" name="decision" checked={choice === 'partly_accepted'} onChange={() => setChoice('partly_accepted')} />
                  Partly accept</label>
                <label style={radioRow}><input type="radio" name="decision" checked={choice === 'rejected'} onChange={() => setChoice('rejected')} />
                  Reject and keep the GPS figure ({num1(system)} km)</label>
              </div>
              {show('choice') && <div style={{ fontSize: 12, color: T.red }}>{show('choice')}</div>}
              {choice === 'partly_accepted' && (
                <Field label="Distance you accept (km)" required htmlFor="dec-km" error={show('km')} hint={`More than ${num1(system)}${claim != null ? ` and less than ${num1(claim)}` : ''}.`}>
                  <Input id="dec-km" inputMode="decimal" value={km} invalid={!!show('km')} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ''))} style={{ maxWidth: 200 }} />
                </Field>
              )}
              {choice === 'accepted' && show('km') && <div style={{ fontSize: 12, color: T.red }}>{show('km')}</div>}
              <Field label="Note for the record" required htmlFor="dec-note" error={show('note')}>
                <Textarea id="dec-note" value={note} invalid={!!show('note')} onChange={(e) => setNote(e.target.value)} placeholder="Why you decided this, in plain words" />
              </Field>
              <div><Button variant="primary" onClick={decide}>Record decision</Button></div>
            </div>
          </div>
        ) : (
          <div data-testid="decision-summary">
            <h3 style={h3}>Decision on the record</h3>
            <Note tone={dispute.status === 'rejected' ? 'info' : 'ok'}>
              {disputeStatusLabel(dispute.status)}{dispute.decidedValue != null ? `: ${num1(dispute.decidedValue)} km` : ''}. {dispute.decisionNote}
              {dispute.decidedValue != null && dispute.status !== 'rejected' && ` The statement now pays ${num1(dispute.decidedValue)} km for this day.`}
            </Note>
          </div>
        )}
      </div>
    </Modal>
  );
}

const h3 = { margin: '0 0 8px', fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text } as const;
const radioRow = { display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer', minHeight: 32 } as const;

// ───────────────────────────── raise on behalf ─────────────────────────────
export function RaiseDisputeModal({ ev, employeeId, date, defaultKm, namer, existing, onClose, onRaised }: {
  ev: FieldEvidence; employeeId: Id; date: string; defaultKm?: number; namer: Namer;
  existing: (employeeId: Id, date: string) => Dispute | undefined; onClose: () => void; onRaised: (d: Dispute) => void;
}) {
  const name = namer.name(employeeId);
  const trail = ev.trails.find((t) => t.employeeId === employeeId && t.date === date);
  const odo = ev.odometer.find((o) => o.employeeId === employeeId && o.date === date);
  const [km, setKm] = useState(defaultKm != null ? String(defaultKm) : odo ? String(odo.endKm - odo.startKm) : '');
  const [msg, setMsg] = useState('');
  const [touched, setTouched] = useState(false);
  const dup = existing(employeeId, date);
  const system = trail?.km ?? 0;
  const kmNum = Number(km);
  const errors: Record<string, string> = {};
  if (dup) errors.date = `A dispute for this day already exists (${disputeStatusLabel(dup.status).toLowerCase()}).`;
  if (!trail) errors.date = 'There is no GPS trail for this day, so there is nothing to compare.';
  if (km.trim() === '' || Number.isNaN(kmNum) || kmNum <= 0) errors.km = 'Enter the distance the person says they rode, in km.';
  else if (kmNum <= system) errors.km = `That is not more than the GPS figure (${num1(system)} km), so there is nothing to dispute.`;
  if (msg.trim().length < 10) errors.msg = 'Write what the person told you, at least a few words.';
  const show = (k: string) => (touched ? errors[k] : undefined);
  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const d = raiseDispute({
      employeeId, kind: 'travel', ref: date, title: `Travel distance on ${fmtDate(date).replace(/ \d{4}$/, '')} looks too low`,
      systemValue: system, claimedValue: kmNum, unit: 'km', message: msg.trim(), by: name,
    });
    onRaised(d);
  };
  return (
    <Modal title={`Raise a dispute for ${name}, ${dayLabel(date)}`} onClose={onClose} width={520}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} style={{ minHeight: 40 }}>Raise dispute</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
          Use this when the person tells you the GPS missed part of a ride, for example a phone that died. You are recording it on their behalf. They keep the right to reply, and HR decides.
        </div>
        {show('date') && <Note tone="warn">{show('date')}</Note>}
        <KeyValue columns={2} rows={[
          { label: 'GPS distance the system pays', value: `${num1(system)} km` },
          { label: 'Odometer', value: odo ? `${odo.endKm - odo.startKm} km` : 'No reading' },
        ]} />
        <Field label="Distance the person says (km)" required htmlFor="raise-km" error={show('km')}>
          <Input id="raise-km" inputMode="decimal" value={km} invalid={!!show('km')} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ''))} style={{ maxWidth: 200 }} />
        </Field>
        <Field label="What the person says" required htmlFor="raise-msg" error={show('msg')}>
          <Textarea id="raise-msg" value={msg} invalid={!!show('msg')} onChange={(e) => setMsg(e.target.value)} placeholder="For example: my phone died at 1 pm, the odometer photos are attached" />
        </Field>
      </div>
    </Modal>
  );
}
