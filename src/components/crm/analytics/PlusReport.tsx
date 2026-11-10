'use client';
/**
 * Shared shell for the Lead Management "plus" report pages.
 *
 * A report page supplies its data, columns (one definition drives the screen
 * AND the CSV, so an export always matches what is shown), KPI strip and
 * optional charts; this component supplies the page chrome: back link, title,
 * date range, CSV button, KPI cards, error + retry, loading, empty state, a
 * sortable table that scrolls inside its own container (never the page), a
 * totals row, and plain-language notes on how each number is computed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from 'recharts';
import { Button, Card, EmptyState, Eyebrow, PageHeader, T, useIsCompact } from '../../ui';
import { ReportRangePicker, type ReportRange } from '../reports/ReportFilters';
import { SortLabel, useTableSort } from '../../../lib/tableSort';
import { downloadCsv } from '../../../lib/exportCsv';
import { CHART, GLASS_TOOLTIP, seriesColor } from '../../../lib/chartTheme';
import { DASH, cellText, columnsToCsvRows, type Column } from '../../../lib/crm/plusFormat';

export interface Kpi { label: string; value: string; hint?: string }

/** Fetch a report payload; reload on `deps` or `reload()`. Exposes loading + error so the page never shows stale data silently. */
export function usePlusReportData<D>(fetcher: () => Promise<D>, deps: ReadonlyArray<unknown>) {
  const [data, setData] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    fetcher()
      .then((d) => { if (mine === seq.current) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (mine === seq.current) setError((e as Error)?.message || 'Could not load this report'); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

interface Props<Row extends object> {
  title: string;
  description: ReactNode;
  range?: { value: ReportRange; onChange: (r: ReportRange) => void };
  /** Extra controls (selects, toggles) shown next to the date range. */
  controls?: ReactNode;
  kpis?: Kpi[];
  columns: Array<Column<Row>>;
  rows: Row[];
  totals?: Row | null;
  rowKey: (row: Row, index: number) => string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyHint?: string;
  /** CSV file name base (the date is appended by the shared downloader). */
  csvName: string;
  /** Charts / extra blocks shown between the KPIs and the table. */
  children?: ReactNode;
  /** How the numbers are computed + honest caveats. */
  notes?: ReactNode;
  /** Set when the admin hides a field this report groups by: replaces the whole report. */
  blockedMessage?: string | null;
  testId: string;
}

/**
 * Sorting state for a table whose columns are `Column<Row>` definitions, plus the rows a CSV of that table must
 * contain (sorted rows, then the totals row), so the export always matches the screen.
 */
export function usePlusTable<Row extends object>(columns: Array<Column<Row>>, rows: Row[], totals?: Row | null) {
  const { sorted, sort, toggle } = useTableSort<Row>(rows, (row, key) => columns[Number(key)]?.value(row));
  const exportRows = totals ? [...sorted, totals] : sorted;
  return { columns, sorted, sort, toggle, totals: totals ?? null, exportRows, csvRows: () => columnsToCsvRows(columns, exportRows) };
}
export type PlusTable<Row extends object> = ReturnType<typeof usePlusTable<Row>>;

/** CSV button shared by the report pages (disabled while there is nothing to export). */
export function CsvButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button variant="secondary" disabled={disabled} onClick={onClick} aria-label="Download CSV">
      <Download size={14} /> CSV
    </Button>
  );
}

/** Sortable table in its own horizontal scroll container (the page never scrolls sideways), with a totals row. */
export function PlusDataTable<Row extends object>({ tbl, rowKey }: { tbl: PlusTable<Row>; rowKey: (row: Row, index: number) => string }) {
  const { columns, sorted, sort, toggle, totals } = tbl;
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }} data-testid="plus-table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: Math.max(480, columns.length * 112) }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.label} style={{ ...th, textAlign: c.numeric ? 'right' : 'left', position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined, background: T.card, zIndex: i === 0 ? 1 : undefined }}>
                  <SortLabel label={c.label} sortKey={String(i)} sort={sort} onToggle={toggle} align={c.numeric ? 'right' : 'left'} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => (
              <tr key={rowKey(r, ri)} data-testid="plus-row">
                {columns.map((c, i) => <td key={c.label} style={tdStyle(c, i, false)}>{cellText(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr data-testid="plus-totals">
                {columns.map((c, i) => <td key={c.label} style={tdStyle(c, i, true)}>{cellText(c, totals)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

export default function PlusReport<Row extends object>(p: Props<Row>) {
  const narrow = useIsCompact(900);
  const tbl = usePlusTable(p.columns, p.rows, p.totals);
  const canExport = !p.loading && tbl.exportRows.length > 0;
  const showTable = !p.loading && !p.error && p.rows.length > 0;
  const showEmpty = !p.loading && !p.error && p.rows.length === 0;

  return (
    <div data-testid={p.testId} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <Link href="/dashboard/crm/reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim, textDecoration: 'none', width: 'fit-content' }}>
        <ArrowLeft size={14} /> All reports
      </Link>

      <PageHeader
        compact={narrow}
        title={p.title}
        description={p.description}
        actions={p.blockedMessage ? undefined : (
          <>
            {p.range && <ReportRangePicker range={p.range.value} onChange={p.range.onChange} />}
            {p.controls}
            <CsvButton disabled={!canExport} onClick={() => downloadCsv(p.csvName, tbl.csvRows())} />
          </>
        )}
      />

      {p.blockedMessage && (
        <EmptyState title="This report is hidden" description={p.blockedMessage} />
      )}

      {!p.blockedMessage && (
        <>
          {p.kpis && p.kpis.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {p.kpis.map((k) => (
                <div key={k.label} data-testid="plus-kpi" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: '12px 14px', minWidth: 0 }}>
                  <Eyebrow>{k.label}</Eyebrow>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginTop: 6, fontFamily: T.heading, overflowWrap: 'anywhere' }}>{p.loading ? DASH : k.value}</div>
                  {k.hint && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{k.hint}</div>}
                </div>
              ))}
            </div>
          )}

          {p.error && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }}>
              <span>Could not load this report: {p.error}</span>
              <Button size="sm" variant="secondary" onClick={p.onRetry}>Retry</Button>
            </div>
          )}

          {p.loading && <div aria-busy="true" style={{ color: T.dim, fontSize: 13, padding: '20px 0' }}>Loading…</div>}

          {!p.loading && !p.error && p.children}

          {showEmpty && <EmptyState title={p.emptyTitle} description={p.emptyHint} />}

          {showTable && <PlusDataTable tbl={tbl} rowKey={p.rowKey} />}

          {p.notes && !p.loading && (
            <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.55 }}>{p.notes}</div>
          )}
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
  borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
};
function tdStyle<Row>(c: Column<Row>, i: number, total: boolean): React.CSSProperties {
  return {
    padding: '9px 12px', borderBottom: `1px solid ${T.border}`, textAlign: c.numeric ? 'right' : 'left', whiteSpace: 'nowrap',
    fontFamily: c.numeric ? T.mono : undefined, fontWeight: total ? 700 : undefined, color: T.text,
    background: total ? 'var(--s3)' : i === 0 ? T.card : undefined,
    position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined,
  };
}

// ── Charts used by the report pages ──────────────────────────────────────────

export function ChartCard({ title, children, height = 240 }: { title: string; children: ReactNode; height?: number }) {
  return (
    <Card padding={14} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8 }}>{title}</Eyebrow>
      <div style={{ width: '100%', height }}>{children}</div>
    </Card>
  );
}

type ChartRow = Record<string, string | number | null>;

/** Grouped (optionally stacked) vertical bars over `xKey`; `keys` are the series. */
export function BarsChart({ data, xKey, keys, stacked, format }: { data: ChartRow[]; xKey: string; keys: string[]; stacked?: boolean; format?: (v: number) => string }) {
  const show = (v: unknown) => (format && typeof v === 'number' ? format(v) : String(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey={xKey} {...CHART.axis} interval="preserveStartEnd" />
        <YAxis {...CHART.axis} tickFormatter={show} width={48} />
        <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.25 }} contentStyle={GLASS_TOOLTIP} formatter={show} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stacked ? 's' : undefined} fill={seriesColor(i)} radius={stacked ? undefined : CHART.barRadius} maxBarSize={44} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Lines over `xKey`; null values leave a gap rather than drawing a zero. */
export function LinesChart({ data, xKey, keys, format }: { data: ChartRow[]; xKey: string; keys: string[]; format?: (v: number) => string }) {
  const show = (v: unknown) => (format && typeof v === 'number' ? format(v) : String(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey={xKey} {...CHART.axis} interval="preserveStartEnd" />
        <YAxis {...CHART.axis} tickFormatter={show} width={48} />
        <Tooltip contentStyle={GLASS_TOOLTIP} formatter={show} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
        {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={seriesColor(i)} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Two charts side by side on a wide screen, stacked on a narrow one (never a horizontal page scroll). */
export function ChartGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 12 }}>{children}</div>;
}
