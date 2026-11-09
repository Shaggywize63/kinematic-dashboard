'use client';
// The ledger itself: one card per monitoring practice, with a switch that is locked for blocked practices.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, T, type Tone } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { STATUS_LABEL, coveredPeople, policyWindow, retentionText } from '../../../lib/hrms/control/monitoring';
import { dropConsidering, markReviewed, turnOffMonitoring } from '../../../lib/hrms/control/store';
import type { MonitoringRow } from '../../../lib/hrms/control/types';
import { fmtDate } from '../../../lib/hrms/format';
import { Conf, ConfirmModal, Muted, Row, Stack } from './parts';
import { TurnOnModal } from './MonModals';

export const STATUS_TONE: Record<MonitoringRow['status'], Tone> = { on: 'ok', off: 'neutral', blocked: 'red', considering: 'warn' };

function Switch({ on, disabled, label, onClick, testId }: { on: boolean; disabled?: boolean; label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} aria-disabled={disabled || undefined} disabled={disabled} data-testid={testId} onClick={onClick}
      style={{
        width: 46, height: 26, borderRadius: 999, border: `1px solid ${on ? T.ok : T.borderStrong}`, background: on ? T.ok : T.raised, padding: 2, flex: '0 0 auto',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
      }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: on ? '#fff' : T.mute, display: 'block' }} />
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.mute, fontFamily: T.mono, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

export default function MonLedger({ db, rows }: { db: HrmsDb; rows: MonitoringRow[] }) {
  const [turnOn, setTurnOn] = useState<MonitoringRow | null>(null);
  const [turnOff, setTurnOff] = useState<MonitoringRow | null>(null);
  return (
    <Stack gap={12}>
      {rows.map((r) => {
        const w = policyWindow(db, r);
        const over = (r.status === 'on' || r.status === 'considering') && r.retentionDays > w.days && !r.retentionReason;
        const people = coveredPeople(db, r).length;
        const locked = r.status === 'blocked';
        return (
          <div key={r.id} data-testid={`row-${r.id}`} data-status={r.status}>
            <Card padding={18}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <Row gap={8} style={{ marginBottom: 6 }}>
                    <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
                    <span style={{ fontSize: 12.5, color: T.dim }}>{r.coverage.label} · {people} {people === 1 ? 'person' : 'people'}</span>
                  </Row>
                  <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15.5, fontWeight: 700, color: T.text }}>{r.name}</h3>
                </div>
                <Switch on={r.status === 'on'} disabled={locked} testId={`switch-${r.id}`} label={`${r.name}: ${locked ? 'blocked' : r.status === 'on' ? 'on, press to turn off' : 'off, press to turn on'}`}
                  onClick={() => (r.status === 'on' ? setTurnOff(r) : setTurnOn(r))} />
              </div>

              {locked && (
                <div role="note" data-testid={`blocked-${r.id}`} style={{ marginTop: 10, padding: '8px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13, lineHeight: 1.5 }}>
                  Cannot be turned on. {r.blockedReason}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '14px 20px', marginTop: 14 }}>
                <Field label="What is collected">{r.collects}</Field>
                <Field label="Purpose">{r.purpose}</Field>
                <Field label="Legal basis">
                  <Row gap={8}>{r.legalBasis === 'consent' ? 'Consent' : 'Employment purpose'}<Conf level="indicative" /></Row>
                  <Muted>Advisor to confirm.</Muted>
                </Field>
                <Field label="Who can see it">{r.visibleTo.length ? r.visibleTo.join('; ') : 'No one. Nothing is collected.'}</Field>
                <Field label="Kept for">
                  {r.status === 'on' || r.status === 'considering' ? retentionText(r.retentionDays) : '—'}
                  {over && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: T.warn }}>Over the {w.days}-day window</span>}
                  {r.retentionReason && r.retentionDays > w.days && <Muted>Kept longer because: {r.retentionReason}</Muted>}
                </Field>
                <Field label="Last reviewed">{fmtDate(r.reviewedOn)}{r.reviewer ? ` by ${r.reviewer}` : ''}</Field>
              </div>

              <Row gap={8} style={{ marginTop: 14 }}>
                {(r.status === 'off' || r.status === 'considering') && <Button size="sm" variant="primary" onClick={() => setTurnOn(r)} aria-label={`Turn on: ${r.name}`}>Turn on</Button>}
                {r.status === 'considering' && <Button size="sm" onClick={() => { dropConsidering(r.id); toast.success('Proposal dropped.'); }} aria-label={`Decide not to use: ${r.name}`}>Decide not to use</Button>}
                {r.status === 'on' && <Button size="sm" onClick={() => setTurnOff(r)} aria-label={`Turn off: ${r.name}`}>Turn off</Button>}
                {!locked && <Button size="sm" variant="ghost" onClick={() => { markReviewed(r.id); toast.success('Marked as reviewed today.'); }} aria-label={`Mark reviewed: ${r.name}`}>Mark reviewed today</Button>}
                {locked && <Muted>Locked. This practice is not offered, so there is nothing to switch.</Muted>}
              </Row>
            </Card>
          </div>
        );
      })}

      {turnOn && <TurnOnModal db={db} row={turnOn} onClose={() => setTurnOn(null)} />}
      {turnOff && (
        <ConfirmModal title={`Turn off ${turnOff.name}?`} confirmLabel="Turn off" onClose={() => setTurnOff(null)} onConfirm={() => { turnOffMonitoring(turnOff.id); toast.success('Turned off.'); setTurnOff(null); }}>
          Collection stops. Data already collected stays until its retention period ends. The change is written to the change log.
        </ConfirmModal>
      )}
    </Stack>
  );
}
