'use client';
// Returns: for each frozen or paid pay run, the PF ECR, an ESI contribution statement, a professional tax statement by
// state and a TDS summary (the working for Form 138). Form 130 per employee sits below.

import { useMemo } from 'react';
import type { HrmsDb, PayRun } from '../../../lib/hrms/types';
import { buildEcr, runTotals } from '../../../lib/hrms/engine';
import { fmtMonth, fmtMonthLong, fullName, inr, num } from '../../../lib/hrms/format';
import { ESI } from '../../../lib/hrms/rules';
import { Badge, Button, Card, EmptyState, Note, StatusBadge, T, downloadRows, downloadText, useIsCompact } from '../ui';
import { Form130Section } from './Form130';
import { closedRuns, employeeOf, entityName, esiRows, ptRows, sumBy, tdsRows } from './builders';
import { Muted, Stack } from './parts';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function ReturnsTab({ db }: { db: HrmsDb }) {
  const runs = useMemo(() => closedRuns(db), [db]);
  return (
    <Stack>
      <Note>
        Statements are built from frozen or paid pay runs, so they match the payslips to the rupee. The files are working drafts on sample data: the ECR layout and the
        statement formats must be checked against the portals before a live filing.
      </Note>
      {runs.length === 0 ? (
        <Card><EmptyState title="No frozen or paid runs yet" description="Freeze a pay run in Payroll and its returns will be listed here." /></Card>
      ) : runs.map((r) => <RunCard key={r.id} db={db} run={r} />)}
      <Form130Section db={db} />
    </Stack>
  );
}

function RunCard({ db, run }: { db: HrmsDb; run: PayRun }) {
  const narrow = useIsCompact(900);
  const entity = db.entities.find((e) => e.id === run.entityId);
  const label = `${fmtMonth(run.month)}, ${entityName(db, run.entityId)}`;
  const pfReg = entity?.registrations.find((r) => r.type === 'pf');
  const ecr = useMemo(() => buildEcr(db, run), [db, run]);
  const esi = useMemo(() => esiRows(db, run), [db, run]);
  const pt = useMemo(() => ptRows(db, run), [db, run]);
  const tds = useMemo(() => tdsRows(db, run), [db, run]);
  const totals = useMemo(() => runTotals(run), [run]);
  const states = [...new Set(pt.map((r) => r.state))];
  const base = `${run.month}_${slug(entityName(db, run.entityId))}`;

  const block = (title: string, children: React.ReactNode, action: React.ReactNode) => (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: T.dim }}>{children}</div>
      <div>{action}</div>
    </div>
  );

  return (
    <Card padding={0} className="hrms-run-card">
      <div data-testid={`run-${run.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{fmtMonthLong(run.month)} · {entityName(db, run.entityId)}</h2>
        <StatusBadge status={run.status} />
        <span style={{ fontSize: 12.5, color: T.mute }}>{totals.headcount} employees · gross {inr(totals.gross)} · law version {run.lawVersion}</span>
      </div>
      <div style={{ padding: 18, display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        {block('PF ECR', (
          <>
            <div><b data-testid={`ecr-rows-${run.id}`} style={{ color: T.text }}>{ecr.rows}</b> {ecr.rows === 1 ? 'row' : 'rows'} ready{pfReg ? <> · establishment {pfReg.number}</> : null}</div>
            {!pfReg && <div style={{ color: T.red }}>No PF registration on this entity, so an ECR cannot be filed.</div>}
            {ecr.blocked.length > 0 && (
              <div data-testid={`ecr-blocked-${run.id}`} style={{ border: `1px solid ${T.border}`, background: T.warnWash, borderRadius: T.radius.sm, padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, color: T.warn, marginBottom: 4 }}>{ecr.blocked.length} {ecr.blocked.length === 1 ? 'row' : 'rows'} blocked</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: T.text }}>
                  {ecr.blocked.map((b) => {
                    const e = employeeOf(db, b.employeeId);
                    return <li key={b.employeeId}>{e ? fullName(e) : b.employeeId}: {b.reason}</li>;
                  })}
                </ul>
              </div>
            )}
          </>
        ), (
          <Button size="sm" disabled={ecr.rows === 0} aria-label={`Download ECR for ${label}`} style={{ minHeight: 40 }}
            onClick={() => downloadText(`ECR_${pfReg?.number ?? 'PF'}_${run.month}.txt`, ecr.text)}>
            Download ECR
          </Button>
        ))}

        {block('ESI contribution', (
          <>
            <div><b style={{ color: T.text }}>{esi.length}</b> {esi.length === 1 ? 'employee' : 'employees'} covered</div>
            <div>Employee {inr(sumBy(esi, (r) => r.employee))} · employer {inr(sumBy(esi, (r) => r.employer))}</div>
            <div style={{ color: T.mute }}>Total {inr(sumBy(esi, (r) => r.total))}</div>
          </>
        ), (
          <Button size="sm" disabled={esi.length === 0} aria-label={`Download ESI statement for ${label}`} style={{ minHeight: 40 }}
            onClick={() => downloadRows(`ESI_${base}.csv`,
              ['Employee code', 'Name', 'ESIC number', 'Paid days', 'Gross', 'ESI wage', `Employee (${ESI.employeeRate}%)`, `Employer (${ESI.employerRate}%)`, 'Total'],
              esi.map((r) => [r.code, r.name, r.esic, r.days, r.gross, r.esiWage, r.employee, r.employer, r.total]))}>
            Download ESI CSV
          </Button>
        ))}

        {block('Professional tax by state', (
          <>
            {states.length === 0 ? <div>No professional tax was deducted.</div> : states.map((s) => {
              const rows = pt.filter((r) => r.state === s);
              return <div key={s}><span style={{ color: T.text }}>{s}</span>: {inr(sumBy(rows, (r) => r.pt))} from {rows.length}</div>;
            })}
            <div style={{ color: T.mute }}>Total {inr(sumBy(pt, (r) => r.pt))}</div>
          </>
        ), (
          <Button size="sm" disabled={pt.length === 0} aria-label={`Download PT statement for ${label}`} style={{ minHeight: 40 }}
            onClick={() => downloadRows(`PT_${base}.csv`, ['State', 'Employee code', 'Name', 'Gender', 'Gross', 'Professional tax'], pt.map((r) => [r.state, r.code, r.name, r.gender, r.gross, r.pt]))}>
            Download PT CSV
          </Button>
        ))}

        {block('TDS summary (Form 138 working)', (
          <>
            <div><b style={{ color: T.text }}>{tds.filter((r) => r.tds > 0).length}</b> of {tds.length} employees had TDS</div>
            <div>Taxable earnings {inr(sumBy(tds, (r) => r.taxable))}</div>
            <div style={{ color: T.mute }}>TDS {inr(sumBy(tds, (r) => r.tds))}</div>
            {tds.some((r) => !r.pan) && <Badge tone="warn">{tds.filter((r) => !r.pan).length} without PAN</Badge>}
          </>
        ), (
          <Button size="sm" disabled={tds.length === 0} aria-label={`Download TDS summary for ${label}`} style={{ minHeight: 40 }}
            onClick={() => downloadRows(`TDS_${base}.csv`, ['Employee code', 'Name', 'PAN', 'Tax regime', 'Gross', 'Taxable earnings', 'TDS'], tds.map((r) => [r.code, r.name, r.pan, r.regime, r.gross, r.taxable, r.tds]))}>
            Download TDS CSV
          </Button>
        ))}
      </div>
      <Muted style={{ padding: '0 18px 14px' }}>{num(run.payslips.length)} payslips in this run. Amounts are the frozen figures, not recalculated.</Muted>
    </Card>
  );
}
