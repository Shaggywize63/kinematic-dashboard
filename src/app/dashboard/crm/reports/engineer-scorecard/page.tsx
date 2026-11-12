'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { crmReports, type EngineerScorecardPayload, type ScorecardGranularity } from '../../../../../lib/crmApi';
import type { ApiError } from '../../../../../lib/api';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { isManagerOrAdmin } from '../../../../../lib/clientFeatures';
import { useAuth } from '../../../../../hooks/useAuth';
import { usePageTitle } from '../../../../../lib/pageTitle';
import {
  defaultReportRange,
  ReportRangePicker,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';
import { fmtInr, fmtInt } from '../../../../../lib/crm/plusFormat';
import { PageHeader, Segmented, EmptyState, Badge, T, useIsCompact } from '../../../../../components/ui';

/** First day of the current month → today, ISO YYYY-MM-DD. Matches the
 *  backend's default window (current IST month) closely enough for the
 *  picker to open on the same range the API would use with no `from`/`to`. */
function defaultMonthRange(): ReportRange {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(first), to: iso(now) };
}

const GRANULARITIES: Array<{ value: ScorecardGranularity; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/**
 * Engineer Scorecard — a directors' report for the connected-B2B tenant
 * (Spark & Ray). One row per sales engineer over a date range, with a
 * day / week / month granularity toggle. Gated to `isB2bClientActive()` and to
 * admin / manager visibility (`isManagerOrAdmin`), mirroring how other
 * admin-only report screens gate; a non-B2B tenant also gets a 404 from the
 * backend, which we handle by showing the "not available" state.
 *
 * City scope is automatic: `/crm/reports/*` is a city-aware path, so api.get
 * appends the global `?city=` picker — we only list `cityKey` in the fetch
 * deps so a picker change refetches.
 */
export default function EngineerScorecardPage() {
  usePageTitle('Engineer Scorecard');
  const { user, loading: authLoading } = useAuth();
  const narrow = useIsCompact(760);
  const cityKey = useReportCityKey();

  const [range, setRange] = useState<ReportRange>(() => defaultMonthRange());
  const [granularity, setGranularity] = useState<ScorecardGranularity>('month');
  const [data, setData] = useState<EngineerScorecardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notAvailable, setNotAvailable] = useState(false);

  // Resolve the gate only once the session has hydrated — isB2bClientActive()
  // reads localStorage (null during SSR), and the user arrives after mount.
  const allowed = !authLoading && isB2bClientActive() && isManagerOrAdmin(user as any);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotAvailable(false);
    (async () => {
      try {
        const res = await crmReports.engineerScorecard({ from: range.from, to: range.to, granularity });
        if (cancelled) return;
        setData(res.data);
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err?.status === 404) { setNotAvailable(true); setData(null); }
        else setError(err?.message || 'Failed to load the scorecard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, granularity, cityKey, allowed, authLoading]);

  const engineers = data?.engineers ?? [];
  const totals = data?.totals;
  // Attendance is withheld unless the workspace has it wired AND the row has a number.
  const attendanceOn = !!data?.attendance_available;

  const headerActions = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <ReportRangePicker range={range} onChange={setRange} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 11, color: T.dim, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Granularity</span>
        <Segmented<ScorecardGranularity> value={granularity} onChange={setGranularity} options={GRANULARITIES} />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="engineer-scorecard">
      <PageHeader
        title="Engineer Scorecard"
        description="Each sales engineer's leads, orders and value over the chosen window — switch the granularity to see day, week or month buckets."
        compact={narrow}
      />

      {!authLoading && !allowed ? (
        <div style={card}>
          <EmptyState
            icon={<BarChart3 size={20} />}
            title="Not available for this workspace"
            description="The Engineer Scorecard is a directors' report for the connected-B2B workspace, visible to admins and managers."
          />
          <div data-testid="scorecard-unavailable" style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 16 }}>{headerActions}</div>

          {loading ? (
            <div style={{ color: T.dim, fontSize: 13, padding: 12 }}>Loading…</div>
          ) : notAvailable ? (
            <>
              <EmptyState
                icon={<BarChart3 size={20} />}
                title="Not available for this workspace"
                description="This report is only available for the connected-B2B workspace."
              />
              <div data-testid="scorecard-unavailable" style={{ display: 'none' }} />
            </>
          ) : error ? (
            <div role="alert" style={{ fontSize: 13, color: T.red, background: T.redWash, borderRadius: 8, padding: '10px 12px' }}>{error}</div>
          ) : engineers.length === 0 ? (
            <div data-testid="scorecard-empty">
              <EmptyState icon={<BarChart3 size={20} />} title="No data in this range" description="No engineers or activity for the selected window. Try a wider date range or a different city." />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: narrow ? 12 : 13, minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={th}>Engineer</th>
                    <th style={thNum}>Attendance</th>
                    <th style={thNum}>Leads</th>
                    <th style={thNum}>Orders won</th>
                    <th style={thNum}>Quoted value</th>
                    <th style={thNum}>Order value</th>
                    <th style={th}>Brands</th>
                  </tr>
                </thead>
                <tbody>
                  {engineers.map((e) => (
                    <tr key={e.user_id} data-testid="scorecard-row">
                      <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                      <td style={tdNum} data-testid="scorecard-attendance">
                        {attendanceOn && e.attendance_days !== null ? fmtInt(e.attendance_days) : '—'}
                      </td>
                      <td style={tdNum}>{fmtInt(e.leads_count)}</td>
                      <td style={tdNum}>{fmtInt(e.orders_won)}</td>
                      <td style={tdNum}>{fmtInr(e.quoted_value)}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: T.text }}>{fmtInr(e.order_value)}</td>
                      <td style={td}><Brands brands={e.brands} /></td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr data-testid="scorecard-totals" style={{ borderTop: `2px solid ${T.border}` }}>
                      <td style={{ ...td, fontWeight: 800 }}>Total</td>
                      <td style={tdNum}>—</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInt(totals.leads_count)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInt(totals.orders_won)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInr(totals.quoted_value)}</td>
                      <td style={{ ...tdNum, fontWeight: 800, color: T.text }}>{fmtInr(totals.order_value)}</td>
                      <td style={td}><Brands brands={totals.brands} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Brand chips, truncated to the first few with a "+N" count so a long list
 *  stays on one row. */
function Brands({ brands, max = 3 }: { brands: string[]; max?: number }) {
  if (!brands || brands.length === 0) return <span style={{ color: T.mute }}>—</span>;
  const shown = brands.slice(0, max);
  const extra = brands.length - shown.length;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {shown.map((b) => (
        <span key={b} data-testid="scorecard-brand" style={{
          fontSize: 11, fontWeight: 600, color: T.dim, background: 'var(--s3)',
          border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap',
        }}>{b}</span>
      ))}
      {extra > 0 && <Badge tone="neutral">+{extra}</Badge>}
    </span>
  );
}

const card: React.CSSProperties = { background: 'var(--s2)', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: T.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: T.text, borderBottom: `1px solid ${T.border}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
