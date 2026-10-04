'use client';
// Generic report viewer: /dashboard/finance/reports/<ReportName>

import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Input, Select, T, useIsCompact } from '../../../../../components/ui';
import { FinancePage, errMsg, fail } from '../../../../../components/finance/ui';
import { PRESET_LABELS, isIsoDate, presetRange, type RangePreset } from '../../../../../components/finance/dateRanges';
import { reportMeta, type ReportMeta } from '../../../../../components/finance/reportMeta';
import { financeApi, type ReportColumn, type ReportData, type ReportName } from '../../../../../lib/financeApi';
import { downloadBlob, fmtDate, inr, num, todayIso } from '../../../../../lib/financeFormat';

/** The route wraps every payload as {success,data}; tolerate both shapes (see report notes). */
function unwrapReport(r: unknown): ReportData {
  const o = r as { data?: ReportData } | ReportData | null;
  if (o && typeof o === 'object' && 'data' in o && o.data && Array.isArray(o.data.rows)) return o.data;
  return o as ReportData;
}

function cellText(col: ReportColumn, v: unknown): string {
  if (v === null || v === undefined || v === '') return col.type === 'money' || col.type === 'number' ? '—' : '';
  switch (col.type) {
    case 'money': return inr(v);
    case 'number': return num(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
    case 'date': return fmtDate(String(v));
    default: return String(v);
  }
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .fin-report-print, .fin-report-print * { visibility: visible !important; }
  .fin-report-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; padding: 12px;
    --text: #000; --dim: #333; --mute: #555; --border: #ccc; --card: #fff; --panel: #f3f3f3; --s3: #f3f3f3; }
  .fin-noprint { display: none !important; }
}`;

export default function ReportViewerPage() {
  const params = useParams();
  const raw = params?.name;
  const name = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const meta = reportMeta(name);
  if (!meta) {
    return (
      <FinancePage title="Report not found">
        <Card padding={32} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: T.dim, marginBottom: 14 }}>There is no report called “{name}”.</div>
          <Button variant="primary" href="/dashboard/finance/reports">Back to reports</Button>
        </Card>
      </FinancePage>
    );
  }
  return <Viewer meta={meta} />;
}

function Viewer({ meta }: { meta: ReportMeta }) {
  const name: ReportName = meta.name;
  const narrow = useIsCompact(900);
  const [fyStart, setFyStart] = useState(4);
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [report, setReport] = useState<{ name: ReportName; data: ReportData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let off = false;
    financeApi.settings.get().then((r) => { if (!off && r.data?.fiscal_year_start_month) setFyStart(r.data.fiscal_year_start_month); }).catch(() => undefined);
    return () => { off = true; };
  }, []);

  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset, fyStart)),
    [preset, custom, fyStart],
  );
  const { from, to } = range;
  const rangeError = meta.asOfToday ? null
    : !isIsoDate(from) || !isIsoDate(to) ? 'Choose both a start and an end date.'
    : from > to ? 'The start date must be on or before the end date.' : null;

  const pickPreset = (p: RangePreset) => {
    if (p === 'custom') setCustom(preset === 'custom' ? custom : presetRange(preset, fyStart));
    setPreset(p);
  };

  // Refetch whenever the report or range changes; a stale response never overwrites a newer one.
  useEffect(() => {
    if (rangeError) { setLoading(false); return; }
    let off = false;
    setLoading(true);
    setError(null);
    financeApi.reports.run(name, meta.asOfToday ? {} : { from, to })
      .then((r) => { if (!off) setReport({ name, data: unwrapReport(r) }); })
      .catch((e) => { if (!off) setError(errMsg(e, 'Could not run this report')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [name, from, to, rangeError, meta.asOfToday, reloadKey]);

  const data = report && report.name === name ? report.data : null;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await financeApi.reports.csv(name, meta.asOfToday ? {} : { from, to });
      downloadBlob(blob, `${name}.csv`);
    } catch (e) { fail(e, 'Could not export the CSV'); }
    finally { setExporting(false); }
  };

  const th: CSSProperties = { padding: '10px 14px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', background: T.panel };
  const td: CSSProperties = { padding: '11px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
  const numeric = (c: ReportColumn) => c.type === 'money' || c.type === 'number';

  const periodText = meta.asOfToday
    ? `As of ${fmtDate((data?.meta?.as_of as string | undefined) ?? todayIso())}`
    : isIsoDate(from) && isIsoDate(to) ? `From ${fmtDate(from)} to ${fmtDate(to)}` : '';

  const actions = (
    <span className="fin-noprint" style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      <Button onClick={exportCsv} disabled={exporting || loading || !!rangeError}>{exporting ? 'Exporting…' : 'Export CSV'}</Button>
      <Button onClick={() => window.print()} disabled={!data}>Print</Button>
    </span>
  );

  return (
    <FinancePage title={meta.title} description={meta.description} actions={actions}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="fin-noprint"><Link href="/dashboard/finance/reports" style={{ fontSize: 13, color: T.info }}>← All reports</Link></div>

      <Card padding={16} className="fin-noprint">
        {meta.asOfToday ? (
          <div style={{ fontSize: 13.5, color: T.dim }}>This report is always as of today ({fmtDate(todayIso())}), so it has no date range.</div>
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Date range" style={{ width: narrow ? '100%' : 210 }}>
              <Select aria-label="Date range" value={preset} onChange={(e) => pickPreset(e.target.value as RangePreset)}>
                {PRESET_LABELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            {preset === 'custom' ? (
              <>
                <Field label="From" style={{ width: narrow ? 'calc(50% - 7px)' : 170 }}>
                  <Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                </Field>
                <Field label="To" style={{ width: narrow ? 'calc(50% - 7px)' : 170 }}>
                  <Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                </Field>
              </>
            ) : (
              <div style={{ fontSize: 13, color: T.dim, paddingBottom: 9 }}>{fmtDate(from)} – {fmtDate(to)}</div>
            )}
          </div>
        )}
        {rangeError && <div role="alert" style={{ fontSize: 12.5, color: T.red, marginTop: 10 }}>{rangeError}</div>}
      </Card>

      <div className="fin-report-print">
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: T.heading, fontSize: 16, fontWeight: 700, color: T.text }}>{data?.title ?? meta.title}</div>
            {periodText && <div style={{ fontSize: 12.5, color: T.mute, marginTop: 3 }}>{periodText}</div>}
          </div>

          {error ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{error}</div>
              <span className="fin-noprint"><Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button></span>
            </div>
          ) : !data ? (
            <div style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>{rangeError ? 'Pick a valid date range to run the report.' : 'Loading report…'}</div>
          ) : (
            <div style={{ overflowX: 'auto', opacity: loading ? 0.55 : 1, transition: 'opacity .15s ease' }} aria-busy={loading}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(520, data.columns.length * 120) }}>
                <thead>
                  <tr>{data.columns.map((c) => <th key={c.key} scope="col" style={{ ...th, textAlign: numeric(c) ? 'right' : 'left' }}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={data.columns.length} style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>No data for this period.</td></tr>
                  ) : data.rows.map((row, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td key={c.key} style={{ ...td, textAlign: numeric(c) ? 'right' : 'left', fontVariantNumeric: numeric(c) ? 'tabular-nums' : undefined }}>{cellText(c, row[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totals && data.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      {data.columns.map((c, i) => {
                        const v = data.totals?.[c.key];
                        return (
                          <td key={c.key} style={{ ...td, fontWeight: 700, background: T.panel, borderTop: `2px solid ${T.borderStrong}`, borderBottom: 0, textAlign: numeric(c) ? 'right' : 'left', fontVariantNumeric: numeric(c) ? 'tabular-nums' : undefined }}>
                            {v === undefined || v === null ? (i === 0 ? 'Total' : '') : cellText(c, v)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      </div>
    </FinancePage>
  );
}
