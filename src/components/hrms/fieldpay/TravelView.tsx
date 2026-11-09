'use client';
// Travel & GPS: the monthly travel statement per person, the day behind each line, disputes, and what goes to payroll.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, Loading, Note, Stat, StatGrid, T, type Col } from '../ui';
import { fmtDate, inr } from '../../../lib/hrms/format';
import { getFieldEvidence } from '../../../lib/hrms/field/evidence';
import { fieldStore, type Dispute } from '../../../lib/hrms/field/store';
import { defaultTravelDay, effectiveTravel, payrollPreview, pushedSummary } from '../../../lib/hrms/fieldpay/engines';
import type { EffectiveTravelDay } from '../../../lib/hrms/fieldpay/types';
import type { HrmsDb, Id, Month } from '../../../lib/hrms/types';
import { MonthSelect, PersonSelect, hm, linkButtonStyle, makeNamer, num1, FIELD_MONTH_LABEL, DataTable } from './common';
import DayPanel, { dayLabel } from './DayPanel';
import { DISPUTE_TONE, DisputeSheet, RaiseDisputeModal, disputeStatusLabel } from './Disputes';

const TRAVEL_MONTHS = ['2026-10', '2026-11'];   // the GPS evidence starts on 1 Oct 2026
type DayRow = EffectiveTravelDay & { id: string };

export default function TravelView({ db }: { db: HrmsDb }) {
  const ev = getFieldEvidence();
  const fs = fieldStore.use();
  const [month, setMonth] = useState<Month>('2026-10');
  const [empId, setEmpId] = useState<Id>('emp_8');
  const [picked, setPicked] = useState<{ key: string; date: string } | null>(null);
  const [openId, setOpenId] = useState<Id | null>(null);
  const [raising, setRaising] = useState<{ employeeId: Id; date: string; km?: number } | null>(null);
  const namer = useMemo(() => makeNamer(db), [db]);
  const repIds = useMemo(() => ev.reps.map((r) => r.employeeId).filter((id) => namer.emp(id)), [ev, namer]);

  if (!fs) return <Loading />;
  const overrides = fs.travelOverrides;
  const eff = effectiveTravel(ev, empId, month, overrides);
  const key = `${empId}|${month}`;
  const date = picked?.key === key && eff.days.some((d) => d.date === picked.date) ? picked.date : defaultTravelDay(eff);
  const day = eff.days.find((d) => d.date === date);
  const travelDisputes = fs.disputes.filter((d) => d.kind === 'travel');
  const existing = (employeeId: Id, ref: string): Dispute | undefined => travelDisputes.find((d) => d.employeeId === employeeId && d.ref === ref);
  const monthDisputes = travelDisputes.filter((d) => d.ref.startsWith(month));
  const open = openId ? fs.disputes.find((d) => d.id === openId) : undefined;
  const vehicleLabel = eff.vehicle === 'car' ? 'Car' : eff.vehicle === 'bike' ? 'Bike' : 'Public transport';

  // Dispute candidates across the team for the month that nobody has raised yet.
  const candidates = repIds.flatMap((id) => effectiveTravel(ev, id, month, overrides).days
    .filter((d) => d.disputeCandidate && !existing(id, d.date)).map((d) => ({ employeeId: id, day: d })));

  const preview = payrollPreview(ev, month, fs.incentiveRuns[month]?.holds ?? {}, overrides, new Set(db.employees.map((e) => e.id)));
  const pushed = pushedSummary(db.adjustments, month);
  const runStatus = fs.incentiveRuns[month]?.status ?? 'draft';
  const decidedExtra = repIds.reduce((s, id) => s + effectiveTravel(ev, id, month, overrides).extraAmount, 0);

  const dayCols: Col<DayRow>[] = [
    { key: 'date', label: 'Day', sortValue: (r) => r.date, nowrap: true, render: (r) => (
      <button type="button" aria-label={`Show ${dayLabel(r.date)} on the map`} aria-pressed={r.date === date} onClick={() => setPicked({ key, date: r.date })}
        style={{ ...linkButtonStyle, fontWeight: r.date === date ? 700 : 500, color: r.date === date ? T.info : T.text, textDecoration: r.date === date ? 'underline' : 'none' }}>
        {dayLabel(r.date)}
      </button>
    ) },
    { key: 'gps', label: 'GPS km', align: 'right', sortValue: (r) => r.trailKm, render: (r) => num1(r.trailKm), nowrap: true },
    { key: 'odo', label: 'Odometer km', align: 'right', sortValue: (r) => r.odometerKm ?? -1, render: (r) => (r.odometerKm != null ? String(r.odometerKm) : '—'), nowrap: true },
    { key: 'gap', label: 'Longest GPS gap', align: 'right', sortValue: (r) => r.gapMin, render: (r) => <span style={{ color: r.gapMin >= 60 ? T.warn : T.text }}>{hm(r.gapMin)}</span>, nowrap: true },
    { key: 'pay', label: 'Payable km', align: 'right', sortValue: (r) => r.effectiveKm, nowrap: true, render: (r) => (
      <span>{num1(r.effectiveKm)}{r.decidedKm != null && <span style={{ marginLeft: 6 }}><Badge tone="ok">HR decided</Badge></span>}</span>
    ) },
    { key: 'amt', label: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => inr(r.amount), nowrap: true },
    { key: 'note', label: 'Note', render: (r) => (
      <span style={{ fontSize: 13, color: T.dim }}>
        {r.decidedKm != null ? `HR decided ${num1(r.decidedKm)} km. ${r.decidedNote ?? ''}` : r.disputeCandidate ? (existing(empId, r.date) ? 'Dispute raised, see below.' : 'Dispute candidate. ') + (existing(empId, r.date) ? '' : (r.note ?? '')) : r.note ?? ''}
      </span>
    ) },
  ];

  const sumOdo = eff.days.reduce((s, d) => s + (d.odometerKm ?? 0), 0);
  const disputeCols: Col<Dispute>[] = [
    { key: 'who', label: 'Person', render: (d) => namer.name(d.employeeId), nowrap: true },
    { key: 'day', label: 'Day', render: (d) => dayLabel(d.ref), nowrap: true },
    { key: 'sys', label: 'System km', align: 'right', render: (d) => (d.systemValue != null ? num1(d.systemValue) : '—') },
    { key: 'claim', label: 'Claimed km', align: 'right', render: (d) => (d.claimedValue != null ? num1(d.claimedValue) : '—') },
    { key: 'dec', label: 'Decided km', align: 'right', render: (d) => (d.decidedValue != null ? num1(d.decidedValue) : '—') },
    { key: 'status', label: 'Status', render: (d) => <Badge tone={DISPUTE_TONE[d.status]} dot>{disputeStatusLabel(d.status)}</Badge>, nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Open</span>, align: 'right', render: (d) => (
      <Button size="sm" variant={d.status === 'open' ? 'primary' : 'secondary'} aria-label={`Open the dispute of ${namer.name(d.employeeId)} on ${fmtDate(d.ref)}`} onClick={(e) => { e.stopPropagation(); setOpenId(d.id); }}>
        {d.status === 'open' ? 'Review and decide' : 'View'}
      </Button>
    ) },
  ];

  const personRows = preview.rows.map((r) => ({ ...r, id: r.employeeId, name: namer.name(r.employeeId) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div data-testid="gps-principle">
        <Note>GPS is the default because it is objective: it is what the phone recorded, the same for everyone. The person can always dispute a day with their odometer photo. HR decides, and the decision is kept on the record.</Note>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <MonthSelect value={month} onChange={setMonth} months={TRAVEL_MONTHS} />
        <PersonSelect value={empId} onChange={setEmpId} ids={repIds} namer={namer} width={230} />
      </div>

      <StatGrid min={170}>
        <div data-testid="trv-stat-days"><Stat label="Days with a trail" value={eff.days.length} hint={`${namer.name(empId)}, ${FIELD_MONTH_LABEL[month]}`} /></div>
        <div data-testid="trv-stat-gps"><Stat label="GPS distance" value={`${num1(eff.gpsKm)} km`} hint={`${inr(eff.gpsAmount)} on GPS alone`} /></div>
        <div data-testid="trv-stat-pay"><Stat label="Payable distance" value={`${num1(eff.effectiveKm)} km`} tone={eff.extraKm > 0 ? 'ok' : undefined} hint={eff.extraKm > 0 ? `Includes ${num1(eff.extraKm)} km HR decided` : 'No decided disputes'} /></div>
        <div data-testid="trv-stat-amount"><Stat label="Travel allowance" value={inr(eff.amount)} hint={eff.extraAmount ? `Includes ${inr(eff.extraAmount)} from disputes` : 'From the GPS trail'} /></div>
        <div data-testid="trv-stat-rate"><Stat label="Vehicle and rate" value={eff.vehicle === 'public' ? 'No rate' : `₹${eff.rate} per km`} hint={`${vehicleLabel}. ${ev.travel.source}`} /></div>
      </StatGrid>

      <div data-testid="statement">
        <DataTable<DayRow> columns={dayCols} rows={eff.days.map((d) => ({ ...d, id: d.date }))} minWidth={900} empty="No GPS trail for this person in this month."
          footer={<tfoot><tr>
            <td style={tf}>Total, {eff.days.length} days</td>
            <td style={{ ...tf, textAlign: 'right' }}>{num1(eff.gpsKm)}</td>
            <td style={{ ...tf, textAlign: 'right' }}>{sumOdo || '—'}</td>
            <td style={tf} />
            <td style={{ ...tf, textAlign: 'right' }} data-testid="statement-km">{num1(eff.effectiveKm)}</td>
            <td style={{ ...tf, textAlign: 'right' }} data-testid="statement-amount">{inr(eff.amount)}</td>
            <td style={tf} />
          </tr></tfoot>} />
      </div>

      {day ? (
        <DayPanel ev={ev} employeeId={empId} day={day} rate={eff.rate} name={namer.name(empId)} existingDispute={existing(empId, day.date)}
          onRaise={() => setRaising({ employeeId: empId, date: day.date, km: day.proposedKm ?? day.odometerKm })} />
      ) : (
        <Card><div style={{ color: T.dim, fontSize: 13.5 }}>Pick a day in the statement to see its GPS trail.</div></Card>
      )}

      <div data-testid="disputes-card">
        <Card>
          <CardTitle>Disputes and dispute candidates, {FIELD_MONTH_LABEL[month]}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DataTable<Dispute> columns={disputeCols} rows={monthDisputes} minWidth={760} empty="No travel disputes this month." onRowClick={(d) => setOpenId(d.id)} />
            <div>
              <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Days where a GPS gap probably hides distance</div>
              {candidates.length === 0 ? (
                <div data-testid="no-candidates" style={{ fontSize: 13.5, color: T.dim }}>No other day this month has a long GPS gap with a higher odometer reading.</div>
              ) : (
                <ul data-testid="candidates" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidates.map((c) => (
                    <li key={`${c.employeeId}|${c.day.date}`} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px' }}>
                      <span style={{ fontSize: 13.5 }}><b>{namer.name(c.employeeId)}</b>, {dayLabel(c.day.date)}. {c.day.note}</span>
                      <Button size="sm" onClick={() => setRaising({ employeeId: c.employeeId, date: c.day.date, km: c.day.proposedKm })}>Raise on behalf of the employee</Button>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ fontSize: 12.5, color: T.dim, marginTop: 8 }}>A candidate is only a hint that the person may be under-paid. Nothing changes until the person disputes the day and HR decides.</div>
            </div>
          </div>
        </Card>
      </div>

      <div data-testid="payroll-summary">
        <Card>
          <CardTitle right={<Badge tone={runStatus === 'in_payroll' ? 'ok' : runStatus === 'approved' ? 'info' : 'neutral'} dot>{runStatus === 'in_payroll' ? 'In payroll' : runStatus === 'approved' ? 'Run approved' : 'Run not yet approved'}</Badge>}>
            What will go to payroll for {FIELD_MONTH_LABEL[month]}
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <StatGrid min={170}>
              <Stat label="Travel allowance" value={<span data-testid="sum-travel">{inr(preview.travel)}</span>} hint={decidedExtra ? `Includes ${inr(decidedExtra)} from decided disputes` : 'From the GPS trail'} />
              <Stat label="Incentives" value={<span data-testid="sum-incentives">{inr(preview.incentives)}</span>} hint={preview.heldPeople ? `${preview.heldPeople} held by HR` : 'Net of clawbacks'} />
              <Stat label="People" value={preview.people} hint={`${preview.rows.length} in the field team`} />
              <Stat label="Already in payroll" value={pushed.rows ? inr(pushed.travel + pushed.incentives) : 'Not pushed'} hint={pushed.rows ? `${pushed.rows} adjustment rows` : 'Nothing handed over yet'} />
            </StatGrid>
            <DataTable<(typeof personRows)[number]> minWidth={520} rows={personRows} columns={[
              { key: 'name', label: 'Person', render: (r) => r.name, sortValue: (r) => r.name },
              { key: 'travel', label: 'Travel allowance', align: 'right', render: (r) => inr(r.travel), nowrap: true, sortValue: (r) => r.travel },
              { key: 'inc', label: 'Incentive', align: 'right', render: (r) => (r.held ? `Held (${inr(r.withheld)})` : inr(r.incentive)), nowrap: true, sortValue: (r) => r.incentive },
            ]} />
            <div style={{ fontSize: 13.5, color: T.dim }}>
              This is a read-only summary. Approving the run and pushing it to payroll is done on the{' '}
              <Link href="/dashboard/hrms/incentives" style={{ color: T.info }}>Incentives page</Link>.
            </div>
          </div>
        </Card>
      </div>

      {open && <DisputeSheet dispute={open} ev={ev} namer={namer} rate={effectiveTravel(ev, open.employeeId, open.ref.slice(0, 7), {}).rate} onClose={() => setOpenId(null)} />}
      {raising && (
        <RaiseDisputeModal ev={ev} employeeId={raising.employeeId} date={raising.date} defaultKm={raising.km} namer={namer} existing={existing}
          onClose={() => setRaising(null)}
          onRaised={(d) => { setRaising(null); setOpenId(d.id); toast.success('Dispute raised. HR can now review it.'); }} />
      )}
    </>
  );
}

const tf = { padding: '10px 14px', fontSize: 13.5, fontWeight: 700, borderTop: `1px solid ${T.border}`, color: T.text } as const;
