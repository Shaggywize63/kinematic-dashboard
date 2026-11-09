'use client';
// Incentives: one table per month, one detail sheet per person, and the pay run (approve, push to payroll).

import { useMemo, useState } from 'react';
import { Badge, Button, EmployeeCell, Loading, Stat, StatGrid, T, type Col } from '../ui';
import { inr } from '../../../lib/hrms/format';
import { computeIncentives } from '../../../lib/hrms/field/engines';
import { getFieldEvidence } from '../../../lib/hrms/field/evidence';
import type { IncentiveResult } from '../../../lib/hrms/field/types';
import { fieldStore, holdIncentive, releaseIncentive, type IncentiveRunState } from '../../../lib/hrms/field/store';
import { payrollPreview } from '../../../lib/hrms/fieldpay/engines';
import type { HrmsDb, Id, Month } from '../../../lib/hrms/types';
import { MonthSelect, ReasonModal, makeNamer, FIELD_MONTH_LABEL, linkButtonStyle, DataTable } from './common';
import IncentiveSheet from './IncentiveSheet';
import RunPanel from './RunPanel';
import PlanCard from './PlanCard';

interface Row { id: string; employeeId: Id; name: string; res: IncentiveResult; held?: string }

const EMPTY_RUN: IncentiveRunState = { status: 'draft', holds: {} };

export default function IncentivesView({ db }: { db: HrmsDb }) {
  const ev = getFieldEvidence();
  const fs = fieldStore.use();
  const [month, setMonth] = useState<Month>('2026-10');
  const [openId, setOpenId] = useState<Id | null>(null);
  const [holdFor, setHoldFor] = useState<Id | null>(null);
  const namer = useMemo(() => makeNamer(db), [db]);

  const results = useMemo(() => {
    const m = new Map<Id, IncentiveResult>();
    for (const r of ev.reps) if (namer.emp(r.employeeId)) m.set(r.employeeId, computeIncentives(ev, r.employeeId, month));
    return m;
  }, [ev, month, namer]);

  if (!fs) return <Loading />;
  const run = fs.incentiveRuns[month] ?? EMPTY_RUN;
  const onPayroll = new Set(db.employees.map((e) => e.id));
  const preview = payrollPreview(ev, month, run.holds, fs.travelOverrides, onPayroll);

  const rows: Row[] = Array.from(results.entries())
    .map(([employeeId, res]) => ({ id: employeeId, employeeId, name: namer.name(employeeId), res, held: run.holds[employeeId] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const total = (f: (r: IncentiveResult) => number) => rows.reduce((s, r) => s + f(r.res), 0);
  const statusOf = (r: Row): { label: string; tone: 'warn' | 'ok' | 'info' | 'neutral' } =>
    r.held ? { label: 'Held by HR', tone: 'warn' }
      : run.status === 'in_payroll' ? { label: 'In payroll', tone: 'ok' }
        : run.status === 'approved' ? { label: 'Approved', tone: 'info' }
          : { label: 'Draft', tone: 'neutral' };

  const cols: Col<Row>[] = [
    { key: 'name', label: 'Person', sortValue: (r) => r.name, render: (r) => (
      <button type="button" aria-label={`Open the workings for ${r.name}`} onClick={(e) => { e.stopPropagation(); setOpenId(r.employeeId); }} style={linkButtonStyle}>
        <EmployeeCell e={namer.emp(r.employeeId)!} href={false} />
      </button>
    ) },
    { key: 'target', label: 'Target', align: 'right', sortValue: (r) => r.res.target, render: (r) => inr(r.res.target), nowrap: true },
    { key: 'booked', label: 'Booked', align: 'right', sortValue: (r) => r.res.achieved, render: (r) => inr(r.res.achieved), nowrap: true },
    { key: 'att', label: 'Attainment', align: 'right', sortValue: (r) => r.res.attainmentPct, render: (r) => `${Math.round(r.res.attainmentPct)}%`, nowrap: true },
    { key: 'payable', label: 'Payable now', align: 'right', sortValue: (r) => r.res.gross, render: (r) => inr(r.res.gross), nowrap: true },
    { key: 'held', label: 'Held for collection', align: 'right', sortValue: (r) => r.res.heldTotal, render: (r) => inr(r.res.heldTotal), nowrap: true },
    { key: 'claw', label: 'Clawback', align: 'right', sortValue: (r) => r.res.clawbackTotal, render: (r) => (r.res.clawbackTotal ? <span style={{ color: T.warn }}>-{inr(r.res.clawbackTotal)}</span> : '—'), nowrap: true },
    { key: 'net', label: 'Net', align: 'right', sortValue: (r) => r.res.net, render: (r) => <b>{inr(r.res.net)}</b>, nowrap: true },
    { key: 'status', label: 'Status', sortValue: (r) => statusOf(r).label, render: (r) => <Badge tone={statusOf(r).tone} dot>{statusOf(r).label}</Badge>, nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (r) => (
      r.held
        ? <Button size="sm" aria-label={`Release the hold on ${r.name}`} onClick={(e) => { e.stopPropagation(); releaseIncentive(month, r.employeeId); }}>Release</Button>
        : <Button size="sm" aria-label={`Hold the incentive of ${r.name}`} onClick={(e) => { e.stopPropagation(); setHoldFor(r.employeeId); }}>Hold</Button>
    ) },
  ];

  const open = openId ? rows.find((r) => r.employeeId === openId) : undefined;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <MonthSelect value={month} onChange={setMonth} months={['2026-09', '2026-10', '2026-11']} />
        <span style={{ fontSize: 13, color: T.dim }}>Sorted by name. The order is not a ranking.</span>
      </div>

      <StatGrid min={170}>
        <div data-testid="inc-stat-booked"><Stat label="Total booked" value={inr(total((r) => r.achieved))} hint={`${rows.length} people`} /></div>
        <div data-testid="inc-stat-payable"><Stat label="Payable now" value={inr(total((r) => r.gross))} tone="ok" hint="Collected enough to pay" /></div>
        <div data-testid="inc-stat-held"><Stat label="Held for collection" value={inr(total((r) => r.heldTotal))} tone="warn" hint="Paid when invoices are collected" /></div>
        <div data-testid="inc-stat-clawback"><Stat label="Clawbacks taken" value={inr(total((r) => r.clawbackTotal))} hint="Signed plan, inside the window" /></div>
        <div data-testid="inc-stat-net"><Stat label="Net" value={inr(total((r) => r.net))} hint="Payable now less clawbacks" /></div>
      </StatGrid>

      <DataTable<Row> columns={cols} rows={rows} minWidth={1000} onRowClick={(r) => setOpenId(r.employeeId)} empty="No field people are on payroll in the sample data." />

      <RunPanel db={db} month={month} run={run} preview={preview} namer={namer} />

      <PlanCard plan={ev.plan} />

      {open && (
        <IncentiveSheet ev={ev} month={month} employeeId={open.employeeId} res={open.res} name={open.name} code={namer.code(open.employeeId)}
          holdReason={open.held} onClose={() => setOpenId(null)}
          onHold={() => setHoldFor(open.employeeId)} onRelease={() => releaseIncentive(month, open.employeeId)} />
      )}
      {holdFor && (
        <ReasonModal title={`Hold the incentive of ${namer.name(holdFor)}`} confirmLabel="Hold incentive"
          intro={`The ${FIELD_MONTH_LABEL[month]} incentive stays out of the pay run until you release it. A hold is not a decision against the person. Write the reason in plain words, because they can ask to see it.`}
          placeholder="For example: waiting for the customer's cancellation to be confirmed"
          onClose={() => setHoldFor(null)}
          onConfirm={(text) => { holdIncentive(month, holdFor, text); setHoldFor(null); }} />
      )}
    </>
  );
}
