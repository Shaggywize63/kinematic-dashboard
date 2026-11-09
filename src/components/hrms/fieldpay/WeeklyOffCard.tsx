'use client';
// Weekly-off compliance: people who worked more than 6 days in a row. This one is about the law, not wellbeing,
// so HR sees names. "Schedule a rest day" records a note; it does not change the roster.

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, Modal, Note, T, type Col } from '../ui';
import { Field, Input, Textarea } from '../../ui';
import { addDays, fmtDate, fmtDateTime } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { cancelRestNote, scheduleRestDay } from '../../../lib/hrms/fieldpay/store';
import { MAX_DAYS_IN_A_ROW } from '../../../lib/hrms/fieldpay/engines';
import type { FieldPayState, Streak } from '../../../lib/hrms/fieldpay/types';
import { weekdayName, type Namer, DataTable } from './common';

type Row = Streak & { id: string };

export default function WeeklyOffCard({ streaks, state, namer, windowText }: { streaks: Streak[]; state: FieldPayState; namer: Namer; windowText: string }) {
  const [scheduling, setScheduling] = useState<Streak | null>(null);
  const cols: Col<Row>[] = [
    { key: 'who', label: 'Person', render: (r) => <b>{namer.name(r.employeeId)}</b>, sortValue: (r) => namer.name(r.employeeId), nowrap: true },
    { key: 'days', label: 'Days in a row', align: 'right', render: (r) => <span data-testid={`streak-days-${r.employeeId}`}>{r.days}</span>, sortValue: (r) => r.days },
    { key: 'from', label: 'From', render: (r) => `${weekdayName(r.from)} ${fmtDate(r.from)}`, nowrap: true, sortValue: (r) => r.from },
    { key: 'to', label: 'To', render: (r) => `${weekdayName(r.to)} ${fmtDate(r.to)}`, nowrap: true, sortValue: (r) => r.to },
    { key: 'notes', label: 'Rest-day note', render: (r) => {
      const n = state.restNotes.filter((x) => x.employeeId === r.employeeId && x.streakFrom === r.from);
      return n.length ? <span style={{ fontSize: 13 }}>{n.map((x) => fmtDate(x.date)).join(', ')}</span> : <span style={{ color: T.mute, fontSize: 13 }}>None yet</span>;
    } },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Action</span>, align: 'right', render: (r) => (
      <Button size="sm" aria-label={`Schedule a rest day for ${namer.name(r.employeeId)}`} onClick={() => setScheduling(r)}>Schedule a rest day</Button>
    ) },
  ];
  return (
    <div data-testid="weekly-off">
      <Card>
        <CardTitle right={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Badge tone="neutral">Names shown to HR</Badge><ConfidenceBadge level="reported" /></span>}>
          Weekly-off compliance
        </CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            This card is about the law, not wellbeing, which is why it names people and the charts above do not. The rule used here is: more than {MAX_DAYS_IN_A_ROW} working days in a row without a day off. {windowText}
          </div>
          <Note tone="warn">
            Check the state&apos;s Shops &amp; Establishments rule and the Labour Codes position with the advisor before acting on this. The {MAX_DAYS_IN_A_ROW}-day limit is a sample setting, not a legal finding.
          </Note>
          <DataTable<Row> columns={cols} rows={streaks.map((s) => ({ ...s, id: `${s.employeeId}|${s.from}` }))} minWidth={820} empty="Nobody worked more than 6 days in a row in the evidence window." />
          {state.restNotes.length > 0 && (
            <div>
              <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Rest-day notes</div>
              <ul data-testid="rest-notes" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state.restNotes.map((n) => (
                  <li key={n.id} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                      <b>{namer.name(n.employeeId)}</b>: rest day noted for {weekdayName(n.date)} {fmtDate(n.date)}, after working {fmtDate(n.streakFrom)} to {fmtDate(n.streakTo)}.
                      {n.note ? ` ${n.note}` : ''} <span style={{ color: T.dim }}>Noted by {n.by}, {fmtDateTime(n.at)}. This is a note only. It does not change the roster.</span>
                    </span>
                    <Button size="sm" aria-label={`Remove the rest-day note for ${namer.name(n.employeeId)} on ${fmtDate(n.date)}`} onClick={() => cancelRestNote(n.id)}>Remove note</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ fontSize: 13, color: T.dim }}>To change the actual roster, use <Link href="/dashboard/hrms/time" style={{ color: T.info }}>Time &amp; leave</Link>.</div>
        </div>
      </Card>
      {scheduling && <ScheduleModal streak={scheduling} namer={namer} onClose={() => setScheduling(null)} />}
    </div>
  );
}

function ScheduleModal({ streak, namer, onClose }: { streak: Streak; namer: Namer; onClose: () => void }) {
  const [date, setDate] = useState(addDays(PREVIEW_TODAY, 2));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const r = scheduleRestDay({ employeeId: streak.employeeId, date, streakFrom: streak.from, streakTo: streak.to, note });
    if (r.ok) onClose(); else setError(r.error);
  };
  const name = namer.name(streak.employeeId);
  return (
    <Modal title={`Schedule a rest day for ${name}`} onClose={onClose} width={500}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} style={{ minHeight: 40 }}>Save note</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
          {name} worked {streak.days} days in a row, {fmtDate(streak.from)} to {fmtDate(streak.to)}. This records a note that a rest day should be given. It does not change the roster or attendance, so the manager still has to arrange it.
        </div>
        <Field label="Rest day" required htmlFor="rest-date" error={error || undefined}>
          <Input id="rest-date" type="date" value={date} invalid={!!error} min={addDays(PREVIEW_TODAY, 1)} onChange={(e) => { setDate(e.target.value); setError(''); }} style={{ maxWidth: 200 }} />
        </Field>
        <Field label="Note (optional)" htmlFor="rest-note">
          <Textarea id="rest-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: agreed with the manager as a compensatory day" />
        </Field>
      </div>
    </Modal>
  );
}
