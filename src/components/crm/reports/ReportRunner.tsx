'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../../lib/api';
import { reportFetchHeaders } from '../../../lib/reportAuth';
import {
  useReportCityKey,
  ReportRangePicker,
  defaultReportRange,
  type ReportRange,
} from './ReportFilters';

type RunData = { columns: string[]; rows: Array<Array<string | number | null>>; count: number };

// Columns that make sense to total in the summary strip (metrics, not ids /
// phone numbers / pincodes). `Deal Amount` renders as ₹.
const SUMMABLE = new Set([
  'Total Visits', 'Total Calls', 'Estimated Qty', 'Deal Tonnage', 'Deal Amount',
  'Attendees', 'Total Activity', 'Unique Lead', 'Lead Visit', 'Lead Call',
  'Dealer Visit', 'Other Visit', 'Deals', 'Tonnage (MT)',
]);
const CURRENCY_COLS = new Set(['Deal Amount']);
// Cap how many rows we paint so a 10k-row report can't freeze the tab.
const MAX_RENDER_ROWS = 500;

function num(v: string | number | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Inline "Run Report" surface shared by every report page. Defaults to a
 * last-7-days window and auto-runs on mount (so the page opens with a 1-week
 * summary already showing), lets the user re-run after changing the range,
 * shows a totals strip + a scrollable data table, and keeps the CSV download.
 * Reuses the exact same endpoint as the download — the backend returns JSON
 * for `?format=json` and CSV otherwise.
 */
export default function ReportRunner({
  endpointPath,
  filenameBase,
}: {
  endpointPath: string;
  filenameBase: string;
}) {
  const cityKey = useReportCityKey();
  // Default to the last week — the report opens already run for this window.
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(7));
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState('');

  const buildQs = useCallback((extra?: Record<string, string>) => {
    const qs = new URLSearchParams();
    if (range.from) qs.set('from', range.from);
    if (range.to) qs.set('to', range.to);
    if (cityKey) qs.set('city', cityKey);
    if (extra) for (const [k, v] of Object.entries(extra)) qs.set(k, v);
    return qs;
  }, [range, cityKey]);

  const run = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      const url = `${API_BASE_URL}${endpointPath}?${buildQs({ format: 'json' }).toString()}`;
      const res = await fetch(url, { headers: reportFetchHeaders() });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.clone().json(); if (b?.error && typeof b.error === 'string') detail = b.error; } catch { /* not JSON */ }
        throw new Error(detail);
      }
      const body = await res.json();
      const d = (body?.data ?? body) as Partial<RunData>;
      setData({ columns: d.columns ?? [], rows: (d.rows as RunData['rows']) ?? [], count: d.count ?? (d.rows?.length ?? 0) });
    } catch (e: any) {
      setError(e?.message || 'Could not run the report');
      setData(null);
    } finally {
      setRunning(false);
    }
  }, [buildQs, endpointPath]);

  // Auto-run once on mount so the page lands with the default 1-week summary.
  const didAutoRun = useRef(false);
  useEffect(() => {
    if (didAutoRun.current) return;
    didAutoRun.current = true;
    void run();
  }, [run]);

  const download = async () => {
    setDownloading(true);
    try {
      const url = `${API_BASE_URL}${endpointPath}${buildQs().toString() ? `?${buildQs().toString()}` : ''}`;
      const res = await fetch(url, { headers: reportFetchHeaders() });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.clone().json(); if (b?.error && typeof b.error === 'string') detail = b.error; } catch { /* not JSON */ }
        throw new Error(`Download failed: ${detail}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success('Report downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  // Totals strip. Skips the "Grand Total" row (Day-Wise already carries one) so
  // metrics aren't double-counted.
  const summary = (() => {
    if (!data || data.columns.length === 0) return null;
    const dataRows = data.rows.filter((r) => String(r[0] ?? '').toLowerCase() !== 'grand total');
    const totals: Array<{ label: string; value: string }> = [];
    data.columns.forEach((col, i) => {
      if (!SUMMABLE.has(col)) return;
      const total = dataRows.reduce((s, r) => s + num(r[i]), 0);
      const rounded = Math.round(total * 100) / 100;
      totals.push({
        label: col,
        value: CURRENCY_COLS.has(col) ? `₹${rounded.toLocaleString('en-IN')}` : rounded.toLocaleString('en-IN'),
      });
    });
    return { rows: dataRows.length, totals };
  })();

  const shownRows = data ? data.rows.slice(0, MAX_RENDER_ROWS) : [];

  return (
    <div>
      {/* Controls: range + Run + Download. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <ReportRangePicker range={range} onChange={setRange} />
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
            cursor: running ? 'default' : 'pointer',
            background: running ? 'var(--s3)' : 'var(--primary)', color: running ? 'var(--text-dim)' : '#fff',
          }}
        >
          {running ? 'Running…' : '▶ Run Report'}
        </button>
        <button
          onClick={download}
          disabled={downloading}
          style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: '1px solid var(--border)', cursor: downloading ? 'default' : 'pointer',
            background: 'var(--s3)', color: downloading ? 'var(--text-dim)' : 'var(--text)',
          }}
        >
          {downloading ? 'Preparing…' : '⬇ Download CSV'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      {/* Summary strip. */}
      {summary && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <SummaryTile label="Rows" value={summary.rows.toLocaleString('en-IN')} highlight />
          {summary.totals.map((t) => (
            <SummaryTile key={t.label} label={t.label} value={t.value} />
          ))}
        </div>
      )}

      {/* Data table. */}
      {running && !data ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Running the report…</div>
      ) : data && data.rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          No data for this period. Try a wider date range.
        </div>
      ) : data ? (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c} style={{
                      position: 'sticky', top: 0, textAlign: 'left', whiteSpace: 'nowrap',
                      padding: '9px 12px', background: 'var(--s3)', color: 'var(--text)',
                      fontWeight: 700, borderBottom: '1px solid var(--border)',
                    }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row, ri) => {
                  const isTotal = String(row[0] ?? '').toLowerCase() === 'grand total';
                  return (
                    <tr key={ri} style={{ background: isTotal ? 'var(--s3)' : 'transparent', fontWeight: isTotal ? 700 : 400 }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text)',
                          borderBottom: '1px solid var(--border)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{cell === null || cell === undefined || cell === '' ? '—' : String(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.rows.length > MAX_RENDER_ROWS && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
              Showing the first {MAX_RENDER_ROWS.toLocaleString('en-IN')} of {data.rows.length.toLocaleString('en-IN')} rows — download the CSV for the full report.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'var(--primary)' : 'var(--s3)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', minWidth: 96,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: highlight ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: highlight ? '#fff' : 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
