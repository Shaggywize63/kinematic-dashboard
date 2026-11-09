'use client';
// One contractor, one month: facts, risk with its reasons, the checks, the proof checklist and the workers' wage test.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, ConfidenceBadge, DataTable, KeyValue, Modal, T, type Col } from '../ui';
import { Field, Input } from '../../ui';
import { fmtDate, fmtMonth, inr } from '../../../lib/hrms/format';
import { PROOF_SPECS, SKILL_LABEL, WORKING_DAYS, type ContractorMonth, type WorkerResult } from '../../../lib/hrms/workforce/contractEngine';
import { rejectProof, removeProof, setInvoiceHeadcount, submitProof, verifyProof } from '../../../lib/hrms/workforce/store';
import type { Proof, ProofKind } from '../../../lib/hrms/workforce/types';
import { Panel, ReasonModal, RiskMeter, Row, muted, strong, twoCol } from './shared';
import { licenceBadge } from './contractParts';

const CHECK_TONE = { pass: 'ok', warn: 'warn', fail: 'red' } as const;
const CHECK_WORD = { pass: 'Pass', warn: 'Look', fail: 'Fail' } as const;
const PROOF_TONE = { received: 'ok', missing: 'red', rejected: 'red' } as const;
const PROOF_WORD = { received: 'Received', missing: 'Missing', rejected: 'Rejected' } as const;

function UploadModal({ r, kind, onClose }: { r: ContractorMonth; kind: ProofKind; onClose: () => void }) {
  const id = useId();
  const spec = PROOF_SPECS.find((s) => s.kind === kind)!;
  const stem = { wage_payment: 'bank-statement', pf_challan: 'pf-challan', esi_challan: 'esi-challan', wage_register: 'wage-register', attendance_register: 'attendance-register', licence_copy: 'licence' }[kind];
  const [name, setName] = useState(`${r.contractor.id.slice(4)}-${stem}-${r.month}.pdf`);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const res = submitProof(r.contractor.id, r.month, kind, name);
    if (!res.ok) { setError(res.error); return; }
    toast.success(`${spec.label} marked as received.`);
    onClose();
  };
  return (
    <Modal title={`Add file: ${spec.label}`} width={500} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Mark as received</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{spec.plain} For {r.contractor.name}, {fmtMonth(r.month)}.</div>
      <Field label="File name" htmlFor={`${id}-n`} error={error} hint="Preview only: nothing is uploaded. The file name is all that is kept.">
        <Input id={`${id}-n`} value={name} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null); }} />
      </Field>
      <Field label="Or pick a file from this computer" htmlFor={`${id}-f`}>
        <input id={`${id}-f`} type="file" aria-label="Pick a file" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); setError(null); } }} style={{ fontSize: 13, color: T.text }} />
      </Field>
    </Modal>
  );
}

function ProofRow({ p, r }: { p: Proof; r: ContractorMonth }) {
  const spec = PROOF_SPECS.find((s) => s.kind === p.kind)!;
  const [upload, setUpload] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const verified = p.status === 'received' && !!p.verifiedBy;
  return (
    <Row testId={`proof-${p.kind}`} tone={p.status === 'received' ? undefined : 'red'}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...strong, fontSize: 14 }}>{spec.label}</span>
            <Badge tone={PROOF_TONE[p.status]} dot>{PROOF_WORD[p.status]}</Badge>
            {verified && <Badge tone="ok">Verified</Badge>}
          </div>
          <div style={{ ...muted, marginTop: 2 }}>{spec.plain}</div>
          <div style={{ ...muted, marginTop: 4 }}>{spec.legal} <ConfidenceBadge level="indicative" /></div>
          {p.status !== 'missing' && p.fileName && <div style={{ fontSize: 12.5, marginTop: 6 }}>File: <span style={{ fontFamily: T.mono }}>{p.fileName}</span> · added {fmtDate(p.uploadedOn)}</div>}
          {verified && <div style={{ fontSize: 12.5, color: T.ok, marginTop: 2 }}>Verified by {p.verifiedBy} on {fmtDate(p.verifiedOn)}</div>}
          {p.status === 'received' && !verified && <div style={{ fontSize: 12.5, color: T.warn, marginTop: 2 }}>Received, not yet checked by a person.</div>}
          {p.status === 'rejected' && <div style={{ fontSize: 12.5, color: T.red, marginTop: 2 }}>Rejected: {p.rejectReason ?? 'no reason given'}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.status !== 'received' && <Button size="sm" variant="primary" aria-label={`Add file for ${spec.label}`} onClick={() => setUpload(true)}>{p.status === 'rejected' ? 'Add new file' : 'Add file'}</Button>}
          {p.status === 'received' && !verified && <Button size="sm" aria-label={`Verify ${spec.label}`} onClick={() => { verifyProof(p.id); toast.success(`${spec.label} verified.`); }}>Verify</Button>}
          {p.status === 'received' && <Button size="sm" aria-label={`Reject ${spec.label}`} onClick={() => setRejecting(true)}>Reject</Button>}
          {p.status === 'received' && <Button size="sm" variant="ghost" aria-label={`Replace file for ${spec.label}`} onClick={() => setUpload(true)}>Replace</Button>}
          {p.status !== 'missing' && <Button size="sm" variant="ghost" aria-label={`Remove file for ${spec.label}`} onClick={() => removeProof(p.id)}>Remove</Button>}
        </div>
      </div>
      {upload && <UploadModal r={r} kind={p.kind} onClose={() => setUpload(false)} />}
      {rejecting && (
        <ReasonModal title={`Reject: ${spec.label}`} intro={`${r.contractor.name}, ${fmtMonth(r.month)}. The contractor is asked for a correct copy.`} label="Why is it rejected?" placeholder="For example: pages missing, wrong month, not signed"
          confirmLabel="Reject" danger onSubmit={(t) => { const x = rejectProof(p.id, t); return x.ok ? null : x.error; }} onClose={() => setRejecting(false)} />
      )}
    </Row>
  );
}

export default function ContractorDetail({ r, narrow }: { r: ContractorMonth; narrow: boolean }) {
  const c = r.contractor;
  const [hc, setHc] = useState<string>('');
  const [hcError, setHcError] = useState<string | null>(null);
  const hcId = useId();

  const workerCols: Col<WorkerResult & { id: string }>[] = [
    { key: 'name', label: 'Worker', render: (w) => <span style={strong}>{w.name}</span>, sortValue: (w) => w.name },
    { key: 'source', label: 'Listed by', render: (w) => (w.source === 'hr' ? <Badge tone="info">HR records</Badge> : <Badge>Contractor</Badge>), nowrap: true },
    { key: 'skill', label: 'Skill', render: (w) => SKILL_LABEL[w.skill], nowrap: true },
    { key: 'days', label: 'Days', align: 'right', render: (w) => w.days, sortValue: (w) => w.days },
    { key: 'paid', label: 'Paid', align: 'right', render: (w) => inr(w.wagePaid), sortValue: (w) => w.wagePaid, nowrap: true },
    { key: 'need', label: 'Needed', align: 'right', render: (w) => (w.required == null ? '—' : inr(w.required)), nowrap: true },
    { key: 'result', label: 'Result', render: (w) => w.status === 'ok' ? <Badge tone="ok" dot>At or above</Badge> : w.status === 'below' ? <Badge tone="red" dot>{`Short by ${inr(w.shortfall)}`}</Badge> : w.status === 'absent' ? <Badge dot>No attendance</Badge> : <Badge tone="warn" dot>No sample rate</Badge>, nowrap: true },
  ];
  const minNote = r.workers.find((w) => w.minMonthly != null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="contractor-detail">
      <div style={twoCol(narrow, 380)}>
        <Panel title="Risk" testId="risk-panel" right={<RiskMeter level={r.risk.level} />}>
          {r.risk.reasons.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.ok }}>Nothing found. Every check passed for {fmtMonth(r.month)}.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Reasons for this risk level">
              {r.risk.reasons.map((x) => (
                <li key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
                  <Badge tone={x.severity === 'serious' ? 'red' : 'warn'} style={{ marginTop: 1 }}>{x.severity === 'serious' ? 'Serious' : 'Moderate'}</Badge>
                  <span style={{ minWidth: 0 }}>{x.text}</span>
                </li>
              ))}
            </ul>
          )}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: T.dim }}>How the risk level is decided</summary>
            <p style={{ ...muted, margin: '8px 0 0' }}>
              There is no score. <b>High</b>: two or more serious findings, or one serious plus two moderate. <b>Medium</b>: one serious finding or any moderate one. <b>Low</b>: everything passes.
              Serious means it can put the company on the hook: licence, minimum wage, PF proof, ESI proof. <ConfidenceBadge level="indicative" />
            </p>
          </details>
        </Panel>

        <Panel title="Contractor">
          <KeyValue columns={3} rows={[
            { label: 'Licence', value: <span style={{ fontFamily: T.mono }}>{c.licenceNo}</span> },
            { label: 'Licence valid', value: <span>{fmtDate(c.licenceFrom)} to {fmtDate(c.licenceTo)} {licenceBadge(c)}</span> },
            { label: 'Site', value: c.site },
            { label: 'Contact', value: c.contact },
            { label: 'PF code', value: <span style={{ fontFamily: T.mono }}>{c.pfCode}</span> },
            { label: 'ESI code', value: <span style={{ fontFamily: T.mono }}>{c.esiCode}</span> },
            { label: 'Monthly invoice (usual)', value: inr(c.monthlyInvoice) },
            { label: 'On attendance in the month', value: `${r.attendance} ${r.attendance === 1 ? 'person' : 'people'}` },
          ]} />
          {r.invoice && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label={`People billed on ${r.invoice.reference}`} htmlFor={`${hcId}-h`} error={hcError} style={{ width: 200 }}>
                <Input id={`${hcId}-h`} type="number" inputMode="numeric" min={0} value={hc === '' ? String(r.invoice.headcount) : hc} invalid={!!hcError} onChange={(e) => { setHc(e.target.value); setHcError(null); }} />
              </Field>
              <Button aria-label="Save people billed" disabled={hc === '' || Number(hc) === r.invoice.headcount}
                onClick={() => { const x = setInvoiceHeadcount(r.invoice!.id, Number(hc)); if (!x.ok) setHcError(x.error); else { setHc(''); toast.success('Invoice headcount updated.'); } }}>Save</Button>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Checks" testId="checks-panel" right={<span style={muted}>Worked out from the proofs and attendance below</span>}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <tbody>
              {r.checks.map((ch) => (
                <tr key={ch.id} data-testid={`check-${ch.id}`} data-status={ch.status}>
                  <td style={{ padding: '9px 10px 9px 0', borderTop: `1px solid ${T.border}`, width: 230, verticalAlign: 'top', fontSize: 13.5, ...strong }}>{ch.label}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, width: 80, verticalAlign: 'top' }}><Badge tone={CHECK_TONE[ch.status]} dot>{CHECK_WORD[ch.status]}</Badge></td>
                  <td style={{ padding: '9px 0', borderTop: `1px solid ${T.border}`, fontSize: 13.5, lineHeight: 1.5, color: T.text }}>
                    {ch.detail} {ch.confidence && <ConfidenceBadge level={ch.confidence} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Proofs for ${fmtMonth(r.month)}`} testId="proofs-panel" right={<span style={muted}>{r.proofsHeld} of {PROOF_SPECS.length} held</span>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PROOF_SPECS.map((s) => {
            const p = r.proofs.find((x) => x.kind === s.kind) ?? { id: `pr_${c.id.slice(4)}_${r.month}_${s.kind}`, contractorId: c.id, month: r.month, kind: s.kind, status: 'missing' as const };
            return <ProofRow key={s.kind} p={p} r={r} />;
          })}
        </div>
      </Panel>

      <Panel title="Workers and wages" testId="workers-panel" right={minNote ? <span style={muted}>Sample minimum {inr(minNote.minMonthly)} a month <ConfidenceBadge level={minNote.confidence ?? 'indicative'} /></span> : undefined}>
        <DataTable columns={workerCols} rows={r.workers.map((w) => ({ ...w, id: w.key }))} minWidth={720} empty="No workers listed for this month." />
        <div style={{ ...muted, marginTop: 10 }}>
          A worker who came for fewer days than a full month ({WORKING_DAYS} working days here) is held to a pro-rated minimum. Wages are as shown on the contractor&rsquo;s wage proof. People marked HR records are contract workers in the Employees list, and their days and pay come from there.
        </div>
      </Panel>
    </div>
  );
}
