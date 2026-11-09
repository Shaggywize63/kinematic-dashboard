'use client';
// One item in the rule radar feed.

import Link from 'next/link';
import { Badge, Button, Card, StatusBadge, T, type Tone } from '../ui';
import { RADAR_STATUS_LABEL, whenText, type Impact, type RadarItem } from '../../../lib/hrms/control/radar';
import type { RadarState, RadarStatus } from '../../../lib/hrms/control/types';
import { fmtDate } from '../../../lib/hrms/format';
import { Conf, Muted, Row } from './parts';

export const RADAR_STATUS_TONE: Record<RadarStatus, Tone> = { new: 'info', acknowledged: 'neutral', applied: 'ok', not_applicable: 'neutral' };

export function RadarStatusBadge({ status }: { status: RadarStatus }) {
  return <Badge tone={RADAR_STATUS_TONE[status]} dot>{RADAR_STATUS_LABEL[status]}</Badge>;
}

export default function RadarCard({ item, impact, state, taskExists, onAcknowledge, onTask, onDetails }: {
  item: RadarItem; impact: Impact; state?: RadarState; taskExists: boolean; onAcknowledge: () => void; onTask: () => void; onDetails: () => void;
}) {
  const status: RadarStatus = state?.status ?? 'new';
  return (
    <div data-testid={`radar-item-${item.id}`}>
      <Card padding={18}>
        <Row gap={8} style={{ marginBottom: 8 }}>
          <Badge tone="neutral" mono>{item.category}</Badge>
          <Conf level={item.confidence} />
          <RadarStatusBadge status={status} />
          {item.kind === 'sample' && <Badge tone="info">Sample advisory</Badge>}
        </Row>
        <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>{item.title}</h3>
        <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }} data-testid={`radar-when-${item.id}`}>{whenText(item)}</div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{item.summary}</p>

        <div style={{ marginTop: 12, padding: '10px 12px', background: T.raised, borderRadius: T.radius.md }} data-testid={`radar-impact-${item.id}`}>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.mute, fontFamily: T.mono, marginBottom: 3 }}>Impact on us</div>
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{impact.headline}</div>
        </div>

        <Muted style={{ marginTop: 10 }}>Source: {item.source}</Muted>
        {state && (state.note || status !== 'new') && (
          <Muted style={{ marginTop: 4 }}>{RADAR_STATUS_LABEL[status]} by {state.by}, {fmtDate(state.at.slice(0, 10))}{state.note ? `. Note: ${state.note}` : ''}</Muted>
        )}

        <Row gap={8} style={{ marginTop: 14 }}>
          {status === 'new' && <Button size="sm" variant="primary" onClick={onAcknowledge} data-testid={`ack-${item.id}`} aria-label={`Acknowledge: ${item.title}`}>Acknowledge</Button>}
          {taskExists
            ? <Link href="/dashboard/hrms/autopilot" style={{ fontSize: 13, color: T.info, textDecoration: 'none' }} data-testid={`task-done-${item.id}`}>Task added to the compliance calendar. Open Autopilot</Link>
            : <Button size="sm" onClick={onTask} data-testid={`task-${item.id}`} aria-label={`Create a compliance task: ${item.title}`}>Create a compliance task</Button>}
          <Button size="sm" variant="ghost" onClick={onDetails} data-testid={`details-${item.id}`} aria-label={`Details: ${item.title}`}>Details</Button>
        </Row>
      </Card>
    </div>
  );
}
