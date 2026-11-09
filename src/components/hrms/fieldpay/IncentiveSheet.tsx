'use client';
// The detail sheet for one person's incentive in one month: the workings in plain words, a what-if slider and the
// first-person statement the rep would read in their app.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, KeyValue, Modal, Note, TabBar, T, type Col } from '../ui';
import { Input } from '../../ui';
import { inr } from '../../../lib/hrms/format';
import { repOf } from '../../../lib/hrms/field/engines';
import type { FieldEvidence, IncentiveLine, IncentiveResult } from '../../../lib/hrms/field/types';
import type { Id, Month } from '../../../lib/hrms/types';
import { collectedShareOf, payoutForBooked, repStatement } from '../../../lib/hrms/fieldpay/engines';
import { BandBar } from './BandBar';
import { FIELD_MONTH_LABEL, DataTable } from './common';

type SheetTab = 'workings' | 'whatif' | 'rep';
const pctLabel = (rate: number) => `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;

const LINE_STATUS: Record<IncentiveLine['status'], { tone: 'ok' | 'warn' | 'neutral'; label: string }> = {
  paid_now: { tone: 'ok', label: 'Paid now' }, held_collection: { tone: 'warn', label: 'Held for collection' }, excluded: { tone: 'neutral', label: 'Not counted' },
};

export default function IncentiveSheet({ ev, month, employeeId, res, name, code, holdReason, onClose, onHold, onRelease }: {
  ev: FieldEvidence; month: Month; employeeId: Id; res: IncentiveResult; name: string; code: string; holdReason?: string;
  onClose: () => void; onHold: () => void; onRelease: () => void;
}) {
  const [tab, setTab] = useState<SheetTab>('workings');
  const plan = ev.plan;
  const rep = repOf(ev, employeeId);
  const monthLabel = FIELD_MONTH_LABEL[month] ?? month;

  return (
    <Modal title={`${name}, ${monthLabel}`} onClose={onClose} width={840}
      footer={<Button onClick={onClose}>Close</Button>}>
      {/* One wrapper: the modal body is a flex column, and a direct child with its own overflow (the tab bar, a table) would shrink to nothing. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: T.dim }}>
          {code} · {rep?.city} · {rep?.vehicle === 'car' ? 'Car' : rep?.vehicle === 'bike' ? 'Bike' : 'Public transport'} ·{' '}
          <Link href={`/dashboard/hrms/employees/${employeeId}`} style={{ color: T.info }}>Open employee profile</Link>
        </div>
        {holdReason
          ? <Badge tone="warn" dot>Held by HR</Badge>
          : <Badge tone="neutral" dot>Not held</Badge>}
      </div>
      <TabBar<SheetTab> value={tab} onChange={setTab} tabs={[
        { key: 'workings', label: 'Workings' }, { key: 'whatif', label: 'What if' }, { key: 'rep', label: 'As the rep sees it' },
      ]} />
      <div role="tabpanel" aria-label={tab} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {tab === 'workings' && <Workings ev={ev} res={res} plan={plan} acknowledged={!!rep?.planAcknowledged} holdReason={holdReason} onHold={onHold} onRelease={onRelease} />}
        {tab === 'whatif' && <WhatIfTab res={res} ev={ev} />}
        {tab === 'rep' && <RepView res={res} ev={ev} holdReason={holdReason} name={name} />}
      </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── workings ─────────────────────────────
function Workings({ ev, res, plan, acknowledged, holdReason, onHold, onRelease }: {
  ev: FieldEvidence; res: IncentiveResult; plan: FieldEvidence['plan']; acknowledged: boolean; holdReason?: string; onHold: () => void; onRelease: () => void;
}) {
  const bandCols: Col<(typeof res.bandRows)[number] & { id: string }>[] = [
    { key: 'band', label: 'Band (share of target)', render: (b) => (b.to == null ? `Above ${b.from}%` : `${b.from}% to ${b.to}%`) },
    { key: 'rev', label: 'Revenue in the band', align: 'right', render: (b) => inr(b.revenueInBand), nowrap: true },
    { key: 'rate', label: 'Rate', align: 'right', render: (b) => pctLabel(b.rate) },
    { key: 'amt', label: 'Incentive', align: 'right', render: (b) => inr(b.amount), nowrap: true },
  ];
  const lineCols: Col<IncentiveLine & { id: string }>[] = [
    { key: 'customer', label: 'Customer', render: (l) => l.customer, nowrap: true },
    { key: 'value', label: 'Deal value', align: 'right', render: (l) => inr(l.value), nowrap: true },
    { key: 'amt', label: 'Incentive', align: 'right', render: (l) => inr(l.amount), nowrap: true },
    { key: 'status', label: 'Status', render: (l) => <Badge tone={LINE_STATUS[l.status].tone} dot>{LINE_STATUS[l.status].label}</Badge>, nowrap: true },
    { key: 'why', label: 'Why', render: (l) => <span style={{ color: T.dim, fontSize: 13 }}>{l.why}</span> },
  ];
  return (
    <>
      <KeyValue columns={3} rows={[
        { label: 'Target', value: inr(res.target) },
        { label: 'Booked', value: inr(res.achieved) },
        { label: 'Attainment', value: `${Math.round(res.attainmentPct)}%` },
        { label: 'Payable now', value: inr(res.gross) },
        { label: 'Held for collection', value: inr(res.heldTotal) },
        { label: 'Clawback taken', value: inr(res.clawbackTotal) },
        { label: 'Net', value: <b>{inr(res.net)}</b> },
        { label: 'Plan acknowledged in writing', value: acknowledged ? 'Yes' : 'No' },
      ]} />

      <div>
        <h3 style={h3}>In plain words</h3>
        <ul data-testid="sheet-explanation" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.6 }}>
          {res.explanation.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>

      <div>
        <h3 style={h3}>Where the month sits against the plan</h3>
        <BandBar plan={plan} target={res.target} booked={res.achieved} />
      </div>

      <div>
        <h3 style={h3}>How each band adds up</h3>
        <DataTable columns={bandCols} rows={res.bandRows.map((b, i) => ({ ...b, id: `band${i}` }))} minWidth={460}
          footer={<tfoot><tr>
            <td style={tf}>Total</td><td style={{ ...tf, textAlign: 'right' }}>{inr(res.bandRows.reduce((s, b) => s + b.revenueInBand, 0))}</td><td style={tf} />
            <td style={{ ...tf, textAlign: 'right' }}>{inr(res.bandRows.reduce((s, b) => s + b.amount, 0))}</td></tr></tfoot>} />
        <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>Each deal earns the month&apos;s average rate, so the order the deals were closed in does not change who gets the better rate.</div>
      </div>

      <div>
        <h3 style={h3}>Deals counted this month</h3>
        <DataTable columns={lineCols} rows={res.lines.map((l) => ({ ...l, id: l.dealId }))} minWidth={620} empty="No deals closed this month." />
      </div>

      <div>
        <h3 style={h3}>Cancelled deals and clawbacks</h3>
        <div data-testid="sheet-clawbacks" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {res.clawbacks.length === 0 && <div style={{ fontSize: 13.5, color: T.dim }}>No earlier deal was cancelled this month, so nothing is taken back.</div>}
          {res.clawbacks.map((c) => (
            <Card key={c.dealId} padding={12} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{c.customer}</b>
                <Badge tone={c.allowed ? 'warn' : 'neutral'} dot>{c.allowed ? `${inr(c.amount)} taken back` : 'Nothing taken back'}</Badge>
              </div>
              <div style={{ fontSize: 13.5, color: T.text }}>{c.why}</div>
            </Card>
          ))}
          <Note>A clawback is only taken when the rep has signed the plan and the cancellation falls inside the {plan.clawbackWindowDays}-day window. This is company policy, not a legal rule, so check it against the signed plan.</Note>
        </div>
      </div>

      <div>
        <h3 style={h3}>Hold this payout</h3>
        {holdReason ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Note tone="warn">Held by HR. Reason: {holdReason}</Note>
            <div><Button onClick={onRelease}>Release the hold</Button></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, color: T.dim }}>A hold keeps this person out of the pay run until you release it. It is not a decision against them, and you must write the reason.</div>
            <div><Button onClick={onHold}>Hold the incentive</Button></div>
          </div>
        )}
      </div>
    </>
  );
}

const h3 = { margin: '0 0 8px', fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text } as const;
const tf = { padding: '10px 14px', fontSize: 13.5, fontWeight: 700, borderTop: `1px solid ${T.border}`, color: T.text } as const;

// ───────────────────────────── what if ─────────────────────────────
function WhatIfTab({ res, ev }: { res: IncentiveResult; ev: FieldEvidence }) {
  const [booked, setBooked] = useState(Math.round(res.achieved));
  const share = collectedShareOf(res);
  const max = Math.max(Math.round(res.target * 1.6), Math.round(res.achieved * 1.1), 100000);
  const w = useMemo(() => payoutForBooked(ev.plan, res.target, booked, share), [ev.plan, res.target, booked, share]);
  // At the actual amount show the real figures (the per-deal rounding can differ from the smooth maths by a rupee or two).
  const atActual = booked === Math.round(res.achieved);
  const payable = atActual ? res.gross : w.payableNow;
  const held = atActual ? res.heldTotal : w.held;
  const diff = Math.round(payable) - res.gross;
  return (
    <>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
        Move the slider to see what the plan would pay if more or less had been booked. It uses the same bands as the real calculation.
        It assumes the same share of invoices is collected as now ({Math.round(share * 100)}%) and does not change any real figure.
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="range" aria-label="Booked revenue for the what-if" min={0} max={max} step={1000} value={Math.min(booked, max)}
          onChange={(e) => setBooked(Number(e.target.value))} style={{ flex: '1 1 260px', minWidth: 200, accentColor: 'var(--info)' }} data-testid="whatif-slider" />
        <div style={{ width: 150 }}>
          <Input aria-label="Booked revenue in rupees" inputMode="numeric" value={String(booked)}
            onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); setBooked(Math.min(n, 99999999)); }} />
        </div>
        <Button onClick={() => setBooked(Math.round(res.achieved))}>Back to actual</Button>
      </div>
      <BandBar plan={ev.plan} target={res.target} booked={res.achieved} whatIfBooked={booked} />
      <KeyValue columns={3} rows={[
        { label: 'Booked in the what-if', value: inr(booked) },
        { label: 'Attainment', value: <span data-testid="whatif-attainment">{Math.round(w.attainmentPct)}%</span> },
        { label: 'Incentive from the bands', value: <span data-testid="whatif-accrued">{inr(w.accrued)}</span> },
        { label: 'Average rate', value: pctLabel(w.effectiveRate) },
        { label: 'Payable now', value: <b data-testid="whatif-payable">{inr(payable)}</b> },
        { label: 'Held for collection', value: inr(held) },
        { label: 'Against the actual month', value: <span data-testid="whatif-diff">{diff === 0 ? 'No change' : `${diff > 0 ? '+' : '-'}${inr(Math.abs(diff))}`}</span> },
        { label: 'Clawback still taken', value: inr(res.clawbackTotal) },
        { label: 'Net after clawback', value: <b>{inr(payable - res.clawbackTotal)}</b> },
      ]} />
      {w.nextEdge && (
        <div style={{ fontSize: 13.5, color: T.dim }}>
          The next line is {w.nextEdge.pct}% of target, where the rate becomes {pctLabel(w.nextEdge.rate)}. That is {inr(w.nextEdge.moreBooked)} more than this what-if.
        </div>
      )}
    </>
  );
}

// ───────────────────────────── as the rep sees it ─────────────────────────────
function RepView({ res, ev, holdReason, name }: { res: IncentiveResult; ev: FieldEvidence; holdReason?: string; name: string }) {
  const lines = repStatement(res, ev.plan, { heldReason: holdReason });
  return (
    <>
      <div style={{ fontSize: 13.5, color: T.dim }}>This is the statement {name.split(' ')[0]} would read in their own app. It is a preview: nothing is sent to anyone.</div>
      <Card padding={18} style={{ maxWidth: 520, background: T.panel }}>
        <div data-testid="rep-statement" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14.5, lineHeight: 1.6 }}>
          <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15 }}>Your incentive for {FIELD_MONTH_LABEL[res.month] ?? res.month}</div>
          {lines.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
        </div>
      </Card>
    </>
  );
}
