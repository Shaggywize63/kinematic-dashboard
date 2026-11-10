'use client';
// One report, driven by the config map in components/hrms/reports/reportConfig.ts: filters, a table with a totals row and
// sorting, a chart where it helps, and Export CSV.

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { useHrmsDb } from '../../../../../lib/hrms/db';
import { liveBankFiles } from '../../../../../lib/hrms/live/payrollCommands';
import { useLiveStatus } from '../../../../../lib/hrms/live/store';
import type { HrmsDb } from '../../../../../lib/hrms/types';
import { logAccess } from '../../../../../lib/hrms/actions';
import { fmtMonth } from '../../../../../lib/hrms/format';
import { Button, Card, EmptyState, HrmsPage, Loading, Note, T, downloadRows, monthOptions, useIsCompact } from '../../../../../components/hrms/ui';
import { Field, Select } from '../../../../../components/ui';
import { PREVIEW_MONTH, runsFor } from '../../../../../components/hrms/statutory/builders';
import ReportTable, { sortRows, type SortState } from '../../../../../components/hrms/reports/ReportTable';
import {
  ALL, computeTotals, csvValue, defaultFilters, reportDef, type Filters, type ReportDef,
} from '../../../../../components/hrms/reports/reportConfig';

const ReportChart = dynamic(() => import('../../../../../components/hrms/reports/ReportChart'), {
  ssr: false,
  loading: () => <div style={{ height: 200, display: 'grid', placeItems: 'center', color: T.dim, fontSize: 13 }}>Loading chart…</div>,
});

export default function ReportPage() {
  const params = useParams();
  const raw = params?.name;
  const name = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const db = useHrmsDb();
  const def = reportDef(name);
  if (!db) return <Loading />;
  if (!def) {
    return (
      <HrmsPage title="Report not found" eyebrow="HRMS · Reports">
        <Card>
          <EmptyState title={`There is no report called “${name}”`} description="The name in the address does not match any report. Pick one from the list."
            action={<Button variant="primary" href="/dashboard/hrms/reports">Back to reports</Button>} />
        </Card>
      </HrmsPage>
    );
  }
  return <Viewer key={def.name} db={db} def={def} />;
}

function readFilters(db: HrmsDb, def: ReportDef): Filters {
  const base = defaultFilters(db, def);
  if (typeof window === 'undefined') return base;
  const q = new URLSearchParams(window.location.search);
  const pick = (k: keyof Filters, valid: (v: string) => boolean) => { const v = q.get(k); return v && valid(v) ? v : base[k]; };
  return {
    month: pick('month', (v) => /^\d{4}-\d{2}$/.test(v) || (def.monthAll === true && v === ALL)),
    entity: pick('entity', (v) => v === ALL || db.entities.some((e) => e.id === v)),
    department: pick('department', (v) => v === ALL || db.departments.some((d) => d.id === v)),
    location: pick('location', (v) => v === ALL || db.locations.some((l) => l.id === v)),
  };
}

function Viewer({ db, def }: { db: HrmsDb; def: ReportDef }) {
  const narrow = useIsCompact(900);
  const [f, setF] = useState<Filters>(() => readFilters(db, def));
  const [sort, setSort] = useState<SortState>(null);
  const [exporting, setExporting] = useState(false);
  const isLive = useLiveStatus().source === 'live';

  // Keep the filters in the address so a report can be bookmarked or shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    (['month', 'entity', 'department', 'location'] as const).forEach((k) => {
      if (k !== 'month' || def.filters.includes('month')) url.searchParams.set(k, f[k]);
    });
    window.history.replaceState(null, '', url.toString());
  }, [f, def.filters]);

  const cols = useMemo(() => def.columns(db), [def, db]);
  const rows = useMemo(() => def.rows(db, f), [def, db, f]);
  const shown = useMemo(() => sortRows(cols, rows, sort), [cols, rows, sort]);
  const notes = useMemo(() => def.notes?.(db, f, rows) ?? [], [def, db, f, rows]);
  const months = useMemo(() => monthOptions(PREVIEW_MONTH, 12, 1), []);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const width = narrow ? '100%' : 190;

  // Live bank advice: the table above is a masked preview; the file with the full account numbers is built by the server, which records the download.
  const exportBankAdviceFromServer = async () => {
    setExporting(true);
    try {
      const codes = new Set(rows.map((r) => String(r.code)));
      const file = await liveBankFiles(runsFor(db, f.month, f.entity, ['frozen', 'paid']).map((r) => r.id));
      downloadRows(`${def.name}_${f.month}.csv`, file.header, file.rows.filter((r) => codes.has(r[0] ?? '')));
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not get the bank file from the server.');
    } finally { setExporting(false); }
  };

  const exportCsv = () => {
    if (isLive && def.name === 'bank-advice') { void exportBankAdviceFromServer(); return; }
    const totals = computeTotals(cols, rows);
    const body = shown.map((r) => cols.map((c) => csvValue(c, r)));
    if (totals) body.push(cols.map((c, i) => (totals[c.key] != null ? totals[c.key]! : i === 0 ? 'Total' : '')));
    if (def.exportLog) rows.forEach((r) => { if (r.employeeId) logAccess(r.employeeId, def.exportLog!, `Exported from the ${def.title} report`); });
    downloadRows(`${def.name}${def.filters.includes('month') ? `_${f.month}` : ''}.csv`, cols.map((c) => c.label), body);
  };

  const periodText = def.filters.includes('month') ? (f.month === ALL ? 'Last 12 months' : `${def.monthHelp ? `${def.monthHelp} ` : ''}${fmtMonth(f.month)}`) : null;

  return (
    <HrmsPage
      eyebrow="HRMS · Reports"
      title={def.title}
      description={def.description}
      actions={<Button variant="primary" onClick={exportCsv} disabled={rows.length === 0 || exporting} style={{ minHeight: 40 }}>Export CSV</Button>}
    >
      <div><Link href="/dashboard/hrms/reports" style={{ fontSize: 13, color: T.info }}>← All reports</Link></div>

      <Card padding={16}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {def.filters.includes('month') && (
            <Field label={def.monthHelp ?? 'Month'} style={{ width }}>
              <Select aria-label="Month" value={f.month} onChange={set('month')}>
                {def.monthAll && <option value={ALL}>Last 12 months</option>}
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          )}
          {def.filters.includes('entity') && (
            <Field label="Legal entity" style={{ width: narrow ? '100%' : 250 }}>
              <Select aria-label="Legal entity" value={f.entity} onChange={set('entity')}>
                <option value={ALL}>All entities</option>
                {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
          {def.filters.includes('department') && (
            <Field label="Department" style={{ width }}>
              <Select aria-label="Department" value={f.department} onChange={set('department')}>
                <option value={ALL}>All departments</option>
                {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          )}
          {def.filters.includes('location') && (
            <Field label="Location" style={{ width: narrow ? '100%' : 220 }}>
              <Select aria-label="Location" value={f.location} onChange={set('location')}>
                <option value={ALL}>All locations</option>
                {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
          {def.filters.length === 0 && <div style={{ fontSize: 13.5, color: T.dim }}>This report has no filters.</div>}
        </div>
      </Card>

      {notes.length > 0 && (
        <Note>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Note>
      )}

      {def.chart && rows.length > 0 && (
        <Card><ReportChart spec={def.chart} rows={sortRows(cols, rows, null)} compact={narrow} /></Card>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{def.title}</h2>
          <span data-testid="report-count" style={{ fontSize: 12.5, color: T.mute }}>{periodText ? `${periodText} · ` : ''}{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
        </div>
        <ReportTable cols={cols} rows={shown} label={def.title} sort={sort} onSort={setSort}
          empty={def.empty?.(db, f) ?? 'No data for these filters.'} />
      </Card>
    </HrmsPage>
  );
}
