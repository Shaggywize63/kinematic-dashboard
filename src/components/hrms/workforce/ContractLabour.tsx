'use client';
// Contract labour: proof that contractors paid wages and deposited PF and ESI. The principal employer carries the risk if
// they did not, so every number here comes with the proof or the check behind it. Advice is advisory; a person decides.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, ConfidenceBadge, HrmsPage, Loading, Note, Stat, StatGrid, T, useIsCompact } from '../ui';
import { Segmented } from '../../ui';
import { useHrmsDb } from '../../../lib/hrms/db';
import { fmtDate, fmtMonth, inr } from '../../../lib/hrms/format';
import { workforceStore, TODAY, decideInvoice, reopenDecision } from '../../../lib/hrms/workforce/store';
import {
  CONTRACT_MONTHS, assessContractor, portfolio, registrationBlockers, type ContractorMonth,
} from '../../../lib/hrms/workforce/contractEngine';
import { ReasonModal, RiskMeter, Row, muted, strong } from './shared';
import ContractorDetail from './ContractorDetail';
import { decisionBadge, licenceBadge } from './contractParts';

export default function ContractLabour() {
  const db = useHrmsDb();
  const wf = workforceStore.use();
  const narrow = useIsCompact(900);
  const [month, setMonth] = useState<string>(CONTRACT_MONTHS[CONTRACT_MONTHS.length - 1]!);
  const [pick, setPick] = useState<string | null>(null);
  const [asking, setAsking] = useState<null | 'hold' | 'override'>(null);

  const rows = useMemo(() => {
    if (!db || !wf) return [] as ContractorMonth[];
    return wf.contract.contractors.map((c) => assessContractor(db, wf.contract, c.id, month, TODAY)).filter(Boolean) as ContractorMonth[];
  }, [db, wf, month]);
  const blockers = useMemo(() => (db && wf ? registrationBlockers(db, wf.contract.contractors, TODAY) : []), [db, wf]);

  if (!db || !wf) return <Loading />;
  const selectedId = pick && rows.some((r) => r.contractor.id === pick) ? pick : rows[0]?.contractor.id;
  const sel = rows.find((r) => r.contractor.id === selectedId);
  const stats = portfolio(rows);

  const clear = () => {
    if (!sel) return;
    if (sel.advice.advice === 'clear') {
      const r = decideInvoice({ contractorId: sel.contractor.id, month, decision: 'cleared', reason: '', advisory: 'clear' });
      if (r.ok) toast.success(`${sel.contractor.name}: ${fmtMonth(month)} invoice cleared to pay.`); else toast.error(r.error);
    } else setAsking('override');
  };

  return (
    <HrmsPage
      eyebrow="HRMS · Contract labour"
      title="Contract labour"
      description="If a contractor does not pay the minimum wage or deposit PF and ESI, the company that hired them can be asked to pay. This page keeps the proof."
      actions={<Segmented value={month} onChange={(m) => { setMonth(m); }} options={CONTRACT_MONTHS.map((m) => ({ value: m, label: fmtMonth(m) }))} />}
    >
      {blockers.map((b) => (
        <div key={b.entityId} data-testid="clra-blocker" role="alert" style={{ padding: '12px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13.5, lineHeight: 1.55, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <b>Blocker.</b>{' '}
            {b.kind === 'expired'
              ? <>{b.entityName} holds contract labour registration {b.number}, which ended on {fmtDate(b.validTo)}{b.daysAgo != null ? ` (${b.daysAgo} days ago)` : ''}.</>
              : <>{b.entityName} has no contract labour registration on file.</>}
            {' '}It covers the site where {b.sites.length} {b.sites.length === 1 ? 'contractor works' : 'contractors work'}. Renew it before relying on contractors there.{' '}
            <ConfidenceBadge level="indicative" />
          </span>
          <Button size="sm" href="/dashboard/hrms/organization?tab=entities">Open Organization</Button>
        </div>
      ))}

      <Note tone="info">
        The legal notes on this page are plain-words summaries, marked <b>Sample, confirm</b>. They are not legal advice and carry no section numbers. Confirm them with your advisor before you rely on them.
      </Note>

      <StatGrid>
        <Stat label="Contractors" value={stats.contractors} hint={`${fmtMonth(month)} invoices ${inr(stats.invoiceTotal)}`} />
        <Stat label="People on attendance" value={stats.workers} hint="Counted from attendance, not from invoices" />
        <Stat label="Proofs not held" value={stats.proofGaps} tone={stats.proofGaps ? 'warn' : 'ok'} hint={`Out of ${rows.length * 6} expected`} />
        <Stat label="High risk" value={stats.high} tone={stats.high ? 'red' : 'ok'} hint={stats.onHold ? `${stats.onHold} invoice${stats.onHold === 1 ? '' : 's'} on hold` : 'No invoice on hold'} />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }} role="list" aria-label="Contractors">
        {rows.map((r) => {
          const on = r.contractor.id === selectedId;
          return (
            <button key={r.contractor.id} type="button" role="listitem" aria-pressed={on} data-testid={`contractor-${r.contractor.id}`} onClick={() => setPick(r.contractor.id)}
              style={{ textAlign: 'left', padding: 14, borderRadius: T.radius.lg, border: `${on ? 2 : 1}px solid ${on ? T.info : T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15 }}>{r.contractor.name}</span>
              <span style={muted}>{r.contractor.site}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{licenceBadge(r.contractor)}</span>
              <RiskMeter level={r.risk.level} />
              <span style={{ fontSize: 12.5, color: T.dim }}>
                {r.attendance} on attendance · invoice {inr(r.invoice?.amount)} · {r.proofsHeld} of 6 proofs held
              </span>
              <span>{decisionBadge(r)}</span>
            </button>
          );
        })}
      </div>

      {sel && (
        <>
          <Row testId="invoice-advice" tone={sel.advice.advice === 'hold' ? 'warn' : sel.advice.advice === 'clear' ? 'ok' : undefined}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15 }}>
                  {sel.contractor.name}, {fmtMonth(month)} invoice {inr(sel.invoice?.amount)}
                  {sel.invoice && <span style={{ ...muted, fontWeight: 400 }}> · {sel.invoice.reference}</span>}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 4 }}><b>{sel.advice.headline}.</b> {sel.advice.detail}</div>
              </div>
              <Badge tone="info" mono>Advice only</Badge>
            </div>
            {sel.decision ? (
              <div data-testid="decision-summary" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 13.5, minWidth: 0 }}>
                  {decisionBadge(sel)}{' '}
                  <span style={strong}>{sel.decision.by}</span> on {fmtDate(sel.decision.on)}: {sel.decision.reason}
                  {sel.decision.decision === 'cleared' && sel.decision.advisory !== 'clear' && <span style={{ color: T.warn }}> (cleared against advice: {sel.decision.advisory === 'hold' ? 'hold' : 'review'} was advised)</span>}
                  {sel.decision.contractorReply && <div style={{ ...muted, marginTop: 4 }}>Contractor&rsquo;s reply: &ldquo;{sel.decision.contractorReply}&rdquo;</div>}
                </div>
                <Button size="sm" onClick={() => reopenDecision(sel.contractor.id, month)}>Change decision</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                <Button variant="primary" data-testid="clear-pay" onClick={clear}>Clear to pay</Button>
                <Button data-testid="hold-invoice" onClick={() => setAsking('hold')}>Hold invoice</Button>
                <span style={muted}>You decide. The decision, your reason and what the checks advised are kept.</span>
              </div>
            )}
          </Row>
          <ContractorDetail r={sel} narrow={narrow} />
        </>
      )}

      {asking && sel && (
        <ReasonModal
          title={asking === 'hold' ? `Hold ${sel.contractor.name}, ${fmtMonth(month)}` : `Clear ${sel.contractor.name} against advice`}
          intro={asking === 'hold'
            ? <>The invoice of {inr(sel.invoice?.amount)} stays unpaid until you clear it. Give the contractor the list of what is missing and a chance to reply.</>
            : <>The checks advised <b>{sel.advice.advice === 'hold' ? 'a hold' : 'a review'}</b>: {sel.advice.detail} If you clear it anyway, write why. The reason is kept next to the advice.</>}
          label={asking === 'hold' ? 'Why is it on hold?' : 'Why are you clearing it?'}
          placeholder={asking === 'hold' ? 'For example: ESI challan for October not received' : 'For example: challan received by email, verified on call'}
          confirmLabel={asking === 'hold' ? 'Hold invoice' : 'Clear to pay'}
          danger={asking === 'hold'}
          second={asking === 'hold' ? { label: 'Contractor’s reply (optional)', placeholder: 'What the contractor said, if they have replied' } : undefined}
          onSubmit={(text, reply) => {
            const r = decideInvoice({ contractorId: sel.contractor.id, month, decision: asking === 'hold' ? 'hold' : 'cleared', reason: text, advisory: sel.advice.advice, contractorReply: reply });
            if (!r.ok) return r.error;
            toast.success(asking === 'hold' ? 'Invoice put on hold.' : 'Invoice cleared to pay.');
            return null;
          }}
          onClose={() => setAsking(null)}
        />
      )}
      <div style={{ ...muted, marginTop: -6 }}>
        Minimum wages come from <Link href="/dashboard/hrms/statutory?tab=rules" style={{ color: T.info, fontWeight: 600 }}>Statutory, Rules and rates</Link>. They are sample values and need checking against the state notification.
      </div>
    </HrmsPage>
  );
}
