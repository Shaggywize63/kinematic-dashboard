'use client';
// One verification step for one person: status, evidence, who ran it and when, the consent line, and the actions that fit
// the status. A mismatch shows both sides and lets HR accept it with a reason or ask for a correction.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, T } from '../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { acceptMismatch, requestCorrection, runVerifyStep } from '../../../lib/hrms/workforce/store';
import { MANDATORY, SIMULATION_LABEL, STATUS_LABEL, STEP_META, aadhaarShown, consentLine } from '../../../lib/hrms/workforce/verifyEngine';
import type { StepKey, StepStatus, VerifyCase } from '../../../lib/hrms/workforce/types';
import { ReasonModal, Row, SimBadge, muted, strong } from './shared';
import RunStepModal from './RunStepModal';

const TONE: Record<StepStatus, 'neutral' | 'info' | 'ok' | 'warn' | 'red'> = { not_started: 'neutral', in_progress: 'info', verified: 'ok', mismatch: 'warn', failed: 'red' };

export default function VerifyStepRow({ c, k, sampleSeed }: { c: VerifyCase; k: StepKey; sampleSeed: number }) {
  const s = c.steps[k];
  const meta = STEP_META[k];
  const [running, setRunning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const locked = !!c.cleared;
  const lockTitle = locked ? 'This person is already cleared to join.' : undefined;
  const required = MANDATORY.includes(k);

  const recheck = () => {
    const r = runVerifyStep({ caseId: c.id, key: k, consent: true });
    if (!r.ok) toast.error(r.error); else toast.message(`${meta.label}: ${r.value.status.replace('_', ' ')}. ${SIMULATION_LABEL}`);
  };

  return (
    <Row testId={`step-${k}`} tone={s.status === 'failed' ? 'red' : s.status === 'mismatch' && !s.accepted ? 'warn' : undefined} status={s.status}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...strong, fontSize: 14.5 }}>{meta.label}</span>
            <Badge tone={TONE[s.status]} dot>{STATUS_LABEL[s.status]}</Badge>
            {s.accepted && <Badge tone="ok">Accepted by HR</Badge>}
            <Badge tone={required ? 'info' : 'neutral'}>{required ? 'Required to join' : 'Recommended'}</Badge>
          </div>
          <div style={{ ...muted, marginTop: 4 }} data-testid={`consent-${k}`}>{consentLine(k)}</div>
          {k === 'aadhaar' && c.aadhaarLast4 && <div style={{ fontSize: 13, marginTop: 6 }} data-testid="aadhaar-shown">Aadhaar kept: <span style={{ fontFamily: T.mono }}>{aadhaarShown(c.aadhaarLast4)}</span></div>}
          {s.evidence && (
            <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55 }}>
              {s.evidence}
              <div style={{ ...muted, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SimBadge>Simulated</SimBadge>
                <span>Run on {fmtDate(s.ranAt)} by {s.ranBy}. Consent recorded {fmtDate(s.consentAt)}. {SIMULATION_LABEL}</span>
              </div>
            </div>
          )}
          {s.status === 'mismatch' && s.compare && (
            <div data-testid={`compare-${k}`} style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '8px 10px', background: T.card }}>
                <div style={{ fontSize: 11.5, color: T.mute }}>Our record ({s.compare.label.toLowerCase().includes('date') ? 'as the person said' : 'offer letter'})</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.compare.ours}</div>
              </div>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '8px 10px', background: T.card }}>
                <div style={{ fontSize: 11.5, color: T.mute }}>Registry says (simulated)</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.compare.theirs}</div>
              </div>
            </div>
          )}
          {s.accepted && <div style={{ fontSize: 13, marginTop: 8, color: T.ok }}>Accepted by {s.accepted.by} on {fmtDate(s.accepted.on)}: {s.accepted.reason}</div>}
          {s.correction && !s.accepted && <div style={{ fontSize: 13, marginTop: 8, color: T.warn }}>Correction requested by {s.correction.by} on {fmtDate(s.correction.on)}: {s.correction.note}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {s.status === 'not_started' && <Button size="sm" variant="primary" disabled={locked} title={lockTitle} aria-label={`Run ${meta.label}`} onClick={() => setRunning(true)}>Run check</Button>}
          {s.status === 'in_progress' && <Button size="sm" variant="primary" disabled={locked} title={lockTitle} aria-label={`Check for a reply: ${meta.label}`} onClick={recheck}>Check for a reply</Button>}
          {s.status === 'mismatch' && !s.accepted && (
            <>
              <Button size="sm" disabled={locked} title={lockTitle} aria-label={`Accept the mismatch: ${meta.label}`} onClick={() => setAccepting(true)}>Accept with a reason</Button>
              <Button size="sm" disabled={locked} title={lockTitle} aria-label={`Request a correction: ${meta.label}`} onClick={() => setCorrecting(true)}>Request a correction</Button>
            </>
          )}
          {(s.status === 'mismatch' || s.status === 'failed' || s.status === 'verified') && (
            <Button size="sm" variant={s.status === 'failed' ? 'primary' : 'ghost'} disabled={locked} title={lockTitle} aria-label={`Re-run ${meta.label}`} onClick={() => setRunning(true)}>Re-run</Button>
          )}
        </div>
      </div>
      {running && <RunStepModal c={c} stepKey={k} sampleSeed={sampleSeed} onClose={() => setRunning(false)} />}
      {accepting && s.compare && (
        <ReasonModal title={`Accept the mismatch: ${meta.label}`} intro={<>Our record says <b>{s.compare.ours}</b>. The registry says <b>{s.compare.theirs}</b>. Accepting means HR is satisfied they are the same person. The reason is kept on the record.</>}
          label="Why is this acceptable?" placeholder="For example: spelling differs on the PAN card, ID proof shows the same person" confirmLabel="Accept"
          onSubmit={(t) => { const r = acceptMismatch(c.id, k, t); if (!r.ok) return r.error; toast.success('Mismatch accepted with your reason.'); return null; }} onClose={() => setAccepting(false)} />
      )}
      {correcting && (
        <ReasonModal title={`Request a correction: ${meta.label}`} intro={`${c.name} is asked to fix this and send the corrected detail. Run the check again once it arrives. In this preview no message is sent.`}
          label="What should be corrected?" placeholder="For example: ask NSDL to correct the spelling on the PAN, or send the new PAN card" confirmLabel="Record request"
          onSubmit={(t) => { const r = requestCorrection(c.id, k, t); if (!r.ok) return r.error; toast.success('Correction request recorded.'); return null; }} onClose={() => setCorrecting(false)} />
      )}
    </Row>
  );
}
