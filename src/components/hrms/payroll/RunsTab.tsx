'use client';
// Payroll hub, Runs tab: start a run for a month and legal entity, and list every run.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, CardTitle, DataTable, Note, SearchBox, StatusBadge, Toolbar, monthOptions, useIsCompact, T, type Col } from '../ui';
import { Field, Select } from '../../ui';
import type { HrmsDb, PayRun } from '../../../lib/hrms/types';
import { createPayRun } from '../../../lib/hrms/actions';
import { useLiveStatus } from '../../../lib/hrms/live/store';
import { employeesForRun, runTotals } from '../../../lib/hrms/engine';
import { fmtMonth, inr } from '../../../lib/hrms/format';
import { PREVIEW_MONTH } from './logic';
import { LinkButton, bigBtn, entityName } from './shared';

type Row = PayRun & { entityLabel: string; totals: ReturnType<typeof runTotals> };

export default function RunsTab({ db }: { db: HrmsDb }) {
  const router = useRouter();
  const narrow = useIsCompact(900);
  const [month, setMonth] = useState(PREVIEW_MONTH);
  const [entityId, setEntityId] = useState(db.entities[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [starting, setStarting] = useState(false);
  const isLive = useLiveStatus().source === 'live';

  const existing = db.payRuns.find((r) => r.month === month && r.entityId === entityId && r.type === 'regular');
  const inScope = useMemo(() => employeesForRun(db, month, entityId).length, [db, month, entityId]);

  const rows: Row[] = useMemo(() => db.payRuns
    .map((r) => ({ ...r, entityLabel: entityName(db, r.entityId), totals: runTotals(r) }))
    .filter((r) => (statusFilter === 'all' || r.status === statusFilter) && (entityFilter === 'all' || r.entityId === entityFilter)
      && (!q.trim() || `${fmtMonth(r.month)} ${r.month} ${r.entityLabel}`.toLowerCase().includes(q.trim().toLowerCase()))), [db, q, statusFilter, entityFilter]);

  // On live data the server creates the run (or returns the one that exists), so this waits for its answer; in sample mode it is instant.
  const start = async () => {
    setStarting(true);
    try {
      const run = await createPayRun(month, entityId);
      router.push(`/dashboard/hrms/payroll/runs/${run.id}`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not start the run.');
    } finally { setStarting(false); }
  };

  const cols: Col<Row>[] = [
    { key: 'month', label: 'Month', render: (r) => <Link href={`/dashboard/hrms/payroll/runs/${r.id}`} style={{ color: T.text, fontWeight: 600, textDecoration: 'none' }}>{fmtMonth(r.month)}</Link>, sortValue: (r) => r.month, nowrap: true },
    { key: 'entity', label: 'Legal entity', render: (r) => r.entityLabel, sortValue: (r) => r.entityLabel },
    { key: 'type', label: 'Type', render: (r) => (r.type === 'regular' ? 'Regular' : 'Off-cycle'), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
    { key: 'headcount', label: 'Headcount', align: 'right', render: (r) => (r.payslips.length ? r.totals.headcount : '—'), sortValue: (r) => r.totals.headcount },
    { key: 'gross', label: 'Gross', align: 'right', render: (r) => (r.payslips.length ? inr(r.totals.gross) : '—'), sortValue: (r) => r.totals.gross, nowrap: true },
    { key: 'net', label: 'Net pay', align: 'right', render: (r) => (r.payslips.length ? inr(r.totals.net) : '—'), sortValue: (r) => r.totals.net, nowrap: true },
    { key: 'cost', label: 'Employer cost', align: 'right', render: (r) => (r.payslips.length ? inr(r.totals.employerCost) : '—'), sortValue: (r) => r.totals.employerCost, nowrap: true },
    { key: 'law', label: 'Law version', render: (r) => <span style={{ fontSize: 12.5, color: T.dim }}>{r.lawVersion || '—'}</span>, nowrap: true },
    { key: 'open', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Open</span>, align: 'right', render: (r) => <LinkButton href={`/dashboard/hrms/payroll/runs/${r.id}`} label={`Open the ${fmtMonth(r.month)} run for ${r.entityLabel}`}>Open</LinkButton> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <CardTitle>Start a pay run</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(160px, 220px) minmax(220px, 1fr) auto', gap: 14, alignItems: 'end' }}>
          <Field label="Month" htmlFor="run-month">
            <Select id="run-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions(PREVIEW_MONTH, 12, 1).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Legal entity" htmlFor="run-entity">
            <Select id="run-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Button variant="primary" style={bigBtn} onClick={() => void start()} disabled={!entityId || starting}>{existing ? `Open ${existing.status} run` : 'Start run'}</Button>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: T.dim }} data-testid="run-scope">
          {inScope} employee{inScope === 1 ? '' : 's'} in scope for {fmtMonth(month)}.{' '}
          {existing ? `A ${existing.status} run already exists for this month and entity, so Start run opens it.` : 'No run exists yet for this month and entity.'}
        </div>
      </Card>

      <Note tone="warn">
        {isLive ? 'Payslips are computed on the server.' : 'Preview on sample data.'} The statutory rates behind these runs (PF and ESI ceilings, professional tax, TDS slabs) are reported or sample values and are not confirmed
        for live payroll. Each run page shows the confidence of every parameter it used.
      </Note>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search month or entity" />
        <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 150 }}>
          <option value="all">All statuses</option>
          {['draft', 'computed', 'frozen', 'paid'].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
        </Select>
        <Select aria-label="Legal entity filter" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} style={{ width: 230 }}>
          <option value="all">All legal entities</option>
          {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Toolbar>

      <DataTable columns={cols} rows={rows} minWidth={980} onRowClick={(r) => router.push(`/dashboard/hrms/payroll/runs/${r.id}`)}
        empty={db.payRuns.length ? 'No run matches these filters.' : 'No pay run yet. Pick a month and legal entity above, then start one.'} />
    </div>
  );
}
