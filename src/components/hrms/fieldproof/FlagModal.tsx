'use client';
// One integrity flag: the evidence sentences, a picture where it helps, the employee's reply, and the reviewer's
// decision. Confirm is disabled until the person has had a chance to reply. Nothing here changes pay or attendance.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Modal, Note, T, type Tone } from '../ui';
import type { Employee } from '../../../lib/hrms/types';
import { fmtDate, fmtDateTime, fullName, inr } from '../../../lib/hrms/format';
import type { FieldEvidence, FlagType } from '../../../lib/hrms/field/types';
import { FLAG_LABEL, INTEGRITY_RULES } from '../../../lib/hrms/field/engines';
import { replyToFlag, reviewFlag, type FlagStatus } from '../../../lib/hrms/field/store';
import {
  NO_REPLY_DAYS, STATUS_LABEL, claimsForReceipt, confirmGate, dayNumbers, decisionNote, devicePunches, travelPair, type FlagRow,
} from '../../../lib/hrms/fieldproof/flags';
import { DayMap, DayTimeline, TravelMap } from './DayViews';
import { Block, Bullets, Facts, NoteField, PersonLink, SeverityBadge } from './shared';

export const STATUS_TONE: Record<FlagStatus, Tone> = { open: 'warn', cleared: 'ok', confirmed: 'red', escalated: 'info' };

const outletName = (ev: FieldEvidence, id: string) => ev.outlets.find((o) => o.id === id)?.name ?? id;

function Table({ head, rows, label }: { head: string[]; rows: (string | number)[][]; label: string }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
      <table aria-label={label} style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, fontSize: 13 }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11.5, fontWeight: 600, color: T.mute, borderBottom: `1px solid ${T.border}`, background: T.panel }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '8px 12px', borderTop: i ? `1px solid ${T.border}` : undefined, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** The picture or numbers that go with each kind of flag. */
function Visual({ ev, row, nameOf }: { ev: FieldEvidence; row: FlagRow; nameOf: (id: string) => string }) {
  const type: FlagType = row.type;
  if (type === 'impossible_travel') {
    const t = travelPair(ev, row);
    return (
      <>
        {t ? <TravelMap ev={ev} employeeId={row.employeeId} date={row.date} a={t.a} b={t.b} km={t.km} mins={t.mins} /> : <DayMap ev={ev} employeeId={row.employeeId} date={row.date} height={260} />}
        {t && (
          <Facts items={[
            { label: 'Left', value: `${outletName(ev, t.a.outletId)} at ${t.a.end}` }, { label: 'Checked in', value: `${outletName(ev, t.b.outletId)} at ${t.b.start}` },
            { label: 'Straight line', value: `${t.km.toFixed(1)} km` }, { label: 'Time between', value: `${t.mins} min` },
            { label: 'Implied speed', value: `${t.kmh.toFixed(0)} km/h (limit ${INTEGRITY_RULES.maxSpeedKmh})` },
          ]} />
        )}
      </>
    );
  }
  if (type === 'fuel_route_mismatch' || type === 'odometer_mismatch') {
    const n = dayNumbers(ev, row);
    return (
      <>
        <DayMap ev={ev} employeeId={row.employeeId} date={row.date} height={240} />
        <Table label="The day's numbers" head={['', 'Figure']} rows={[
          ['GPS trail', `${n.trailKm.toFixed(1)} km`],
          ['Longest gap in GPS', `${n.gapMin} min`],
          ...(n.odometerKm != null ? [['Odometer, start to end', `${n.startKm?.toLocaleString('en-IN')} to ${n.endKm?.toLocaleString('en-IN')} (${n.odometerKm} km)`]] : []),
          ...(type === 'fuel_route_mismatch' ? [['Fuel claimed', inr(n.fuelClaimed)], [`Fuel the trail could burn (₹${n.fuelRate}/km, ${n.vehicle})`, inr(n.fuelExpected)]] : []),
        ]} />
      </>
    );
  }
  if (type === 'receipt_reuse') {
    const claims = claimsForReceipt(ev, row.id);
    return <Table label="Claims with the same receipt" head={['Person', 'Date', 'Kind', 'Amount', 'Vendor']} rows={claims.map((c) => [nameOf(c.employeeId), fmtDate(c.date), c.category, inr(c.amount), c.vendor ?? '—'])} />;
  }
  if (type === 'device_shared') {
    const d = devicePunches(ev, row);
    return (
      <>
        <Table label="Punches on that day" head={['Person', 'Punch in', 'Punch out', 'Device']} rows={d.punches.map((p) => [nameOf(p.employeeId), p.in ?? 'missing', p.out ?? 'missing', p.deviceId])} />
        <div style={{ fontSize: 13, color: T.dim }}>Device {d.deviceId ?? ''} is registered to {d.ownerId ? nameOf(d.ownerId) : 'someone else'}.</div>
      </>
    );
  }
  return <DayTimeline ev={ev} employeeId={row.employeeId} date={row.date} />;
}

export default function FlagModal({ ev, row, people, onClose }: { ev: FieldEvidence; row: FlagRow; people: Employee[]; onClose: () => void }) {
  const nameOf = (id: string) => { const e = people.find((x) => x.id === id); return e ? fullName(e) : id; };
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decided = row.status !== 'open';
  const gate = confirmGate(row, ack);

  const decide = (status: FlagStatus) => {
    setErr(null);
    const text = note.trim();
    if ((status === 'confirmed' || status === 'escalated') && text.length < 3) { setErr(`A note is required to ${status === 'confirmed' ? 'confirm' : 'escalate'}. Say what you found and why.`); return; }
    if (status === 'confirmed' && !gate.allowed) return;
    reviewFlag(row.id, status, decisionNote(text, status === 'confirmed' && !row.replied && ack));
    toast.success(status === 'cleared' ? 'Cleared' : status === 'confirmed' ? 'Confirmed' : 'Escalated');
    onClose();
  };

  return (
    <Modal title={row.title} onClose={onClose} width={860}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <SeverityBadge severity={row.severity} />
        <Badge tone="neutral">{FLAG_LABEL[row.type]}</Badge>
        <Badge tone={STATUS_TONE[row.status]} dot>{STATUS_LABEL[row.status]}</Badge>
        <span style={{ fontSize: 13, color: T.dim }}>{fmtDate(row.date)}</span>
        <span style={{ fontSize: 13, color: T.dim }}>About {row.involves.map((id, i) => <span key={id}>{i ? ' and ' : ''}<PersonLink id={id} name={nameOf(id)} /></span>)}</span>
      </div>
      <Note tone="warn">This flag is advisory. It does not change pay or attendance. A person reviews it, and the employee can reply before anything is decided.</Note>

      <Block title="What the data shows"><Bullets items={row.evidence} /></Block>
      <Block title="The evidence"><Visual ev={ev} row={row} nameOf={nameOf} /></Block>
      <Block title="Suggested next step"><div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{row.suggestion}</div></Block>

      <Block title="Employee's reply">
        <div data-testid="reply-block" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, background: T.raised, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {row.review?.reply
            ? <><div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>“{row.review.reply.text}”</div><div style={{ fontSize: 12, color: T.mute }}>Reply on record, {fmtDateTime(row.review.reply.at)}</div></>
            : <div style={{ fontSize: 13.5, color: T.dim }}>No reply on record yet.</div>}
        </div>
        <NoteField id="flag-reply" label="Record the employee's reply" value={reply} onChange={setReply} rows={2}
          placeholder="What the employee said, in their words."
          hint="In the live product the employee writes this from their own app, so it arrives in their own words. Here you can record a reply to try the flow." />
        <div><Button size="sm" disabled={reply.trim().length < 3} onClick={() => { replyToFlag(row.id, reply.trim()); setReply(''); toast.success('Reply recorded'); }}>Save reply</Button></div>
      </Block>

      <Block title="Your decision">
        {decided ? (
          <div data-testid="flag-decision" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, background: T.raised, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 14, color: T.text }}><b>{STATUS_LABEL[row.status]}</b> by {row.review?.by}, {row.review ? fmtDateTime(row.review.at) : ''}</div>
            {row.review?.note && <div style={{ fontSize: 13.5, color: T.dim }}>Note: {row.review.note}</div>}
            <div><Button size="sm" onClick={() => { reviewFlag(row.id, 'open'); toast.success('Reopened'); onClose(); }}>Reopen</Button></div>
          </div>
        ) : (
          <>
            <NoteField id="flag-note" label="Note" value={note} onChange={(v) => { setNote(v); setErr(null); }} rows={2}
              placeholder="What you found. Optional to clear. Required to confirm or escalate." />
            {!row.replied && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: T.text, lineHeight: 1.45 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1 }} />
                I asked the employee and they did not reply within {NO_REPLY_DAYS} working days
              </label>
            )}
            {err && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button onClick={() => decide('cleared')}>Clear</Button>
              <Button variant="danger" disabled={!gate.allowed} aria-describedby="confirm-reason" onClick={() => decide('confirmed')}>Confirm</Button>
              <Button onClick={() => decide('escalated')}>Escalate</Button>
            </div>
            <div id="confirm-reason" data-testid="confirm-reason" style={{ fontSize: 12.5, color: gate.allowed ? T.mute : T.warn }}>{gate.reason}</div>
          </>
        )}
      </Block>
    </Modal>
  );
}
