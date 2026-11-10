'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { WinRatePoint } from '../../../../../types/crm';
import WinRateByRepChart from '../../../../../components/crm/charts/WinRateByRepChart';
import { downloadCsv } from '../../../../../lib/exportCsv';
import {
  ReportRangePicker,
  defaultReportRange,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { fmtInr, fmtInt, fmtPct, type Column, cellText, columnsToCsvRows } from '../../../../../lib/crm/plusFormat';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

// The API now also returns the value behind each rate (INR) and the open deals not
// yet counted in it. Optional so an older backend / demo data still renders.
type Row = WinRatePoint & { open?: number; won_value?: number; lost_value?: number; avg_won_deal?: number; value_win_rate?: number; total?: number };
type By = 'rep' | 'source' | 'stage';

/** Win rate by rep / source / stage: the chart, then every number behind it (counts and value) with a total and a CSV that matches. */
export default function WinLossReportPage() {
  const [data, setData] = useState<Row[]>([]);
  const [by, setBy] = useState<By>('rep');
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(90));
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();
  // "By source" groups by the built-in lead source field: offer it only while it is visible.
  const gate = useLeadFieldGate();
  const sourceHidden = gate.didLoad && gate.isHidden('source_id');
  useEffect(() => { if (by === 'source' && sourceHidden) setBy('rep'); }, [by, sourceHidden]);

  useEffect(() => {
    setLoading(true);
    crmAnalytics.winRate(by, range)
      .then((r) => setData((r.data || []) as Row[]))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [by, range.from, range.to, cityKey]);

  const hasValue = data.some((r) => r.won_value !== undefined);
  const columns: Array<Column<Row>> = useMemo(() => {
    const first = by === 'rep' ? 'Rep' : by === 'source' ? gate.labelFor('source_id', 'Source') : 'Stage';
    const cols: Array<Column<Row>> = [
      { label: first, value: (r) => r.bucket },
      { label: 'Won', value: (r) => r.won, display: (r) => fmtInt(r.won), numeric: true },
      { label: 'Lost', value: (r) => r.lost, display: (r) => fmtInt(r.lost), numeric: true },
      { label: 'Win rate %', value: (r) => Math.round(r.rate * 1000) / 10, display: (r) => fmtPct(r.rate * 100), numeric: true },
    ];
    if (by === 'source') cols.push({ label: 'Leads', value: (r) => r.total ?? null, display: (r) => fmtInt(r.total), numeric: true });
    if (hasValue && by !== 'source') {
      cols.push(
        { label: 'Open deals', value: (r) => r.open ?? null, display: (r) => fmtInt(r.open), numeric: true },
        { label: 'Won value (INR)', value: (r) => r.won_value ?? null, display: (r) => fmtInr(r.won_value), numeric: true },
        { label: 'Lost value (INR)', value: (r) => r.lost_value ?? null, display: (r) => fmtInr(r.lost_value), numeric: true },
        { label: 'Avg won deal (INR)', value: (r) => r.avg_won_deal ?? null, display: (r) => fmtInr(r.avg_won_deal), numeric: true },
        { label: 'Win rate by value %', value: (r) => (r.value_win_rate === undefined ? null : Math.round(r.value_win_rate * 1000) / 10), display: (r) => fmtPct(r.value_win_rate === undefined ? null : r.value_win_rate * 100), numeric: true },
      );
    }
    return cols;
  }, [by, hasValue, gate]);

  // Total row: sums, with rates recomputed from the sums (not an average of rates).
  const totals: Row | null = useMemo(() => {
    if (!data.length) return null;
    const sum = (k: 'won' | 'lost' | 'open' | 'won_value' | 'lost_value' | 'total') => data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const won = sum('won'), lost = sum('lost'), wv = sum('won_value'), lv = sum('lost_value');
    return {
      bucket: 'Total', won, lost, rate: won + lost > 0 ? won / (won + lost) : 0,
      ...(by === 'source' ? { total: sum('total') } : {}),
      ...(hasValue && by !== 'source' ? { open: sum('open'), won_value: wv, lost_value: lv, avg_won_deal: won ? Math.round(wv / won) : 0, value_win_rate: wv + lv > 0 ? wv / (wv + lv) : 0 } : {}),
    };
  }, [data, by, hasValue]);

  const { sorted, sort, toggle } = useTableSort<Row>(data, (r, key) => columns[Number(key)]?.value(r));
  const exportRows = totals ? [...sorted, totals] : sorted;

  const sel: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, height: 36 };
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Win Rate</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as By)} style={sel}>
            <option value="rep">By Rep</option>
            {!sourceHidden && <option value="source">By Source</option>}
            <option value="stage">By Stage</option>
          </select>
          <button
            onClick={() => downloadCsv(`win-rate-by-${by}`, columnsToCsvRows(columns, exportRows))}
            disabled={loading || data.length === 0}
            aria-label="Download CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <>
          <WinRateByRepChart data={data} />
          {data.length > 0 && (
            <>
              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table data-testid="winloss-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
                  <thead>
                    <tr>{columns.map((c, i) => (
                      <th key={c.label} style={{ ...th, textAlign: c.numeric ? 'right' : 'left' }}>
                        <SortLabel label={c.label} sortKey={String(i)} sort={sort} onToggle={toggle} align={c.numeric ? 'right' : 'left'} />
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => <tr key={r.bucket}>{columns.map((c) => <td key={c.label} style={{ ...td, textAlign: c.numeric ? 'right' : 'left' }}>{cellText(c, r)}</td>)}</tr>)}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr data-testid="winloss-totals">{columns.map((c) => <td key={c.label} style={{ ...td, fontWeight: 700, background: 'var(--s3)', textAlign: c.numeric ? 'right' : 'left' }}>{cellText(c, totals)}</td>)}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>
                Win rate % = won ÷ (won + lost); open deals are not in the rate. Win rate by value % = won value ÷ (won + lost value). Values are deal amounts in INR.
                {by === 'source' && ' By source counts leads: a lead that is not converted counts as lost.'}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
