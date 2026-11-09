'use client';
// The two dialogs of the rule radar: the details of one item (with its status and note), and the "create a compliance task" form.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Field, Input, Select, Textarea } from '../../ui';
import { Badge, Button, KeyValue, Modal, Note, T } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { RADAR_STATUS_LABEL, suggestedTaskDue, validateTaskDue, whenText, type Impact, type RadarItem } from '../../../lib/hrms/control/radar';
import type { RadarState, RadarStatus } from '../../../lib/hrms/control/types';
import { fmtDate, inr } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { Conf, Muted, Row, Stack } from './parts';
import { RadarStatusBadge } from './RadarCard';

const CONF_EXPLAIN = {
  verified: 'Verified: taken from the official text. Still check the date that applies to you.',
  reported: 'Reported: from reliable reporting. Confirm it with the notification before you rely on it.',
  indicative: 'Indicative: a placeholder or an estimate. Do not use it as the rule.',
} as const;

export function DetailModal({ db, item, impact, state, taskName, onClose, onSave }: {
  db: HrmsDb; item: RadarItem; impact: Impact; state?: RadarState; taskName?: string; onClose: () => void; onSave: (status: RadarStatus, note: string) => void;
}) {
  const [status, setStatus] = useState<RadarStatus>(state?.status ?? 'new');
  const [note, setNote] = useState(state?.note ?? '');
  const name = (id: string) => db.employees.find((e) => e.id === id);
  return (
    <Modal title={item.title} onClose={onClose} width={680}
      footer={(<><Button onClick={onClose}>Close</Button><Button variant="primary" data-testid="radar-save" onClick={() => { onSave(status, note); toast.success('Saved.'); onClose(); }}>Save status and note</Button></>)}>
      <Row gap={8}>
        <Badge tone="neutral" mono>{item.category}</Badge><Conf level={item.confidence} /><RadarStatusBadge status={state?.status ?? 'new'} />
        {item.kind === 'sample' && <Badge tone="info">Sample advisory</Badge>}
      </Row>
      <Muted>{whenText(item)}</Muted>
      <Note tone={item.confidence === 'verified' ? 'ok' : item.confidence === 'reported' ? 'warn' : 'red'}>{CONF_EXPLAIN[item.confidence]}</Note>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{item.summary}</div>
      <KeyValue columns={1} rows={[{ label: 'Source', value: item.source }, { label: item.dateLabel === 'Placeholder date' ? 'Placeholder date (no date has been notified)' : item.dateLabel, value: fmtDate(item.effectiveOn) }]} />

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Impact on us</div>
        <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{impact.headline}</div>
        {impact.money.length > 0 && (
          <Row gap={8} style={{ marginTop: 8 }}>
            {impact.money.map((m) => <Badge key={m.label} tone="neutral">{m.label}: {inr(m.value)}</Badge>)}
          </Row>
        )}
        {impact.lines.length > 0 && <div style={{ marginTop: 10 }}><KeyValue columns={2} rows={impact.lines} /></div>}
        {impact.scopes.length > 0 && <Muted style={{ marginTop: 8 }}>Touches: {impact.scopes.join(', ')}</Muted>}
        {impact.people.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: T.dim }}>
            {impact.people.map((p) => (
              <li key={p.employeeId}>
                {name(p.employeeId) ? <Link href={`/dashboard/hrms/employees/${p.employeeId}`} style={{ color: T.text, fontWeight: 600 }}>{name(p.employeeId)!.firstName} {name(p.employeeId)!.lastName}</Link> : p.employeeId}: {p.detail}
              </li>
            ))}
          </ul>
        )}
        <Muted style={{ marginTop: 10 }}>How this was worked out: {impact.basis}</Muted>
      </div>

      <Stack gap={12}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Status and owner note</div>
        <Field label="Status" htmlFor="radar-status">
          <Select id="radar-status" value={status} onChange={(e) => setStatus(e.target.value as RadarStatus)}>
            {(Object.keys(RADAR_STATUS_LABEL) as RadarStatus[]).map((s) => <option key={s} value={s}>{RADAR_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Owner note" htmlFor="radar-note" hint="What was decided, and by whom. Saved with the status.">
          <Textarea id="radar-note" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {taskName && <Muted>Compliance task: {taskName}. <Link href="/dashboard/hrms/autopilot" style={{ color: T.info }}>Open Autopilot</Link></Muted>}
      </Stack>
    </Modal>
  );
}

export function TaskModal({ db, item, impact, onClose, onCreate }: {
  db: HrmsDb; item: RadarItem; impact: Impact; onClose: () => void; onCreate: (dueOn: string) => void;
}) {
  const [due, setDue] = useState(suggestedTaskDue(item));
  const [touched, setTouched] = useState(false);
  const error = validateTaskDue(item, due);
  const entity = db.entities.find((e) => e.id === impact.entityId) ?? db.entities[0];
  return (
    <Modal title="Create a compliance task" onClose={onClose} width={500}
      footer={(<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="task-confirm" onClick={() => { setTouched(true); if (!error) onCreate(due); }}>Add task</Button></>)}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>
        This adds a task to the compliance calendar so someone checks the change before it bites: <b>{item.title}</b>.
      </div>
      <KeyValue columns={1} rows={[
        { label: 'Filed under', value: `${item.law} (the closest law in the calendar)` },
        { label: 'Legal entity', value: entity?.name },
        ...(item.state || impact.state ? [{ label: 'State', value: item.state ?? impact.state }] : []),
        { label: item.effectiveOn > PREVIEW_TODAY ? 'Takes effect' : 'Already in force since', value: fmtDate(item.effectiveOn) },
      ]} />
      <Field label="Due date" required htmlFor="task-due" error={touched || due !== suggestedTaskDue(item) ? error ?? undefined : undefined}
        hint={item.effectiveOn > PREVIEW_TODAY ? 'Before the effective date, so there is time to act.' : 'The change is already in force, so this is a check that the configuration matches.'}>
        <Input id="task-due" type="date" value={due} invalid={!!error && (touched || due !== suggestedTaskDue(item))} onChange={(e) => setDue(e.target.value)} />
      </Field>
    </Modal>
  );
}
