'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Gauge, LayoutDashboard, LineChart, Sparkles } from 'lucide-react';
import {
  crmReports,
  type BusinessReportPayload,
  type BusinessReportRow,
  type EngineerScorecardPayload,
  type EngineerScorecardRow,
  type BusinessGroupBy,
  type BusinessScope,
} from '../../../../../lib/crmApi';
import type { ApiError } from '../../../../../lib/api';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { isManagerOrAdmin } from '../../../../../lib/clientFeatures';
import { useAuth } from '../../../../../hooks/useAuth';
import { usePageTitle } from '../../../../../lib/pageTitle';
import {
  ReportRangePicker,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';
import { fmtInr, fmtInt, fmtPct, DASH } from '../../../../../lib/crm/plusFormat';
import { toCsv, downloadCsv, type CsvColumn } from '../../../../../components/ffm/reports/reportUtils';
import { PageHeader, Button, EmptyState, T, useIsCompact } from '../../../../../components/ui';

/** First day of the current month → today, ISO YYYY-MM-DD. Matches the backend's
 *  default window (current IST month) closely enough for the picker to open on
 *  the same range the two endpoints would use with no `from`/`to`. */
function defaultMonthRange(): ReportRange {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(first), to: iso(now) };
}

/** Per-source fetch result: a card can show its own data or its own error
 *  without blanking the whole page. */
type Res<T> = { ok: true; data: T } | { ok: false; message: string };

const TOP_N = 5;

/** Saved-question shortcuts — each deep-links into the Business Report with a
 *  preset grouping / scope (the report reads these from the URL on load). The
 *  current range rides along so the question opens on the same window. */
const SAVED_QUESTIONS: Array<{ label: string; params: Partial<Record<'group_by' | 'scope', string>> }> = [
  { label: 'Orders by engineer', params: { group_by: 'engineer' } },
  { label: 'Value by brand', params: { group_by: 'brand' } },
  { label: 'Value by account', params: { group_by: 'account' } },
  { label: 'By product', params: { group_by: 'product' } },
  { label: 'By industry', params: { group_by: 'industry' } },
  { label: 'My team', params: { scope: 'supervised' } },
];

/**
 * Management Dashboard — a single directors' overview for the connected-B2B
 * tenant (Spark & Ray) that ties the Engineer Scorecard and the Business Report
 * together. It is a pure CONSUMER of the two existing report endpoints (no
 * backend change): a KPI strip + top-engineer / top-brand / top-account cards,
 * saved-question deep links, and a CSV export of the current overview.
 *
 * Gated exactly like the Scorecard and Business Report: `isB2bClientActive()`
 * AND admin / manager visibility (`isManagerOrAdmin`); a non-B2B tenant also
 * gets a 404 { code:'NOT_AVAILABLE' } from either endpoint, which drops the
 * page to the shared "not available" state.
 *
 * City scope is automatic: `/crm/reports/*` is a city-aware path, so api.get
 * appends the global `?city=` picker — we list `cityKey` in the fetch deps so a
 * picker change refetches.
 */
export default function ManagementDashboardPage() {
  usePageTitle('Management Dashboard');
  const { user, loading: authLoading } = useAuth();
  const narrow = useIsCompact(760);
  const cityKey = useReportCityKey();

  const [range, setRange] = useState<ReportRange>(() => defaultMonthRange());
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  // Each endpoint resolves into its own slot so one failing card doesn't take
  // the others down with it.
  const [kpi, setKpi] = useState<Res<BusinessReportPayload> | null>(null);       // business, group_by=engineer, scope=all
  const [engineers, setEngineers] = useState<Res<EngineerScorecardPayload> | null>(null);
  const [brands, setBrands] = useState<Res<BusinessReportPayload> | null>(null); // business, group_by=brand
  const [accounts, setAccounts] = useState<Res<BusinessReportPayload> | null>(null); // business, group_by=account

  // Resolve the gate only once the session has hydrated — isB2bClientActive()
  // reads localStorage (null during SSR), and the user arrives after mount.
  const allowed = !authLoading && isB2bClientActive() && isManagerOrAdmin(user as any);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setNotAvailable(false);
    const { from, to } = range;
    const msg = (e: unknown, fallback: string) => (e as ApiError)?.message || fallback;
    (async () => {
      const [eng, score, brand, acct] = await Promise.allSettled([
        crmReports.businessReport({ from, to, group_by: 'engineer', scope: 'all' }),
        crmReports.engineerScorecard({ from, to }),
        crmReports.businessReport({ from, to, group_by: 'brand', scope: 'all' }),
        crmReports.businessReport({ from, to, group_by: 'account', scope: 'all' }),
      ]);
      if (cancelled) return;

      // A 404 from EITHER report means the workspace isn't entitled — drop the
      // whole page to the shared "not available" state.
      const settled = [eng, score, brand, acct];
      const any404 = settled.some((r) => r.status === 'rejected' && (r.reason as ApiError)?.status === 404);
      if (any404) { setNotAvailable(true); setLoading(false); return; }

      setKpi(eng.status === 'fulfilled' ? { ok: true, data: eng.value.data } : { ok: false, message: msg(eng.reason, 'Failed to load totals.') });
      setEngineers(score.status === 'fulfilled' ? { ok: true, data: score.value.data } : { ok: false, message: msg(score.reason, 'Failed to load the scorecard.') });
      setBrands(brand.status === 'fulfilled' ? { ok: true, data: brand.value.data } : { ok: false, message: msg(brand.reason, 'Failed to load brands.') });
      setAccounts(acct.status === 'fulfilled' ? { ok: true, data: acct.value.data } : { ok: false, message: msg(acct.reason, 'Failed to load accounts.') });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, cityKey, allowed, authLoading]);

  // Business Report deep-link carrying the current range.
  const businessHref = (params: Record<string, string>) =>
    `/dashboard/crm/reports/business?${new URLSearchParams({ ...params, from: range.from, to: range.to }).toString()}`;

  const totals = kpi?.ok ? kpi.data.totals : null;
  const costOn = !!(kpi?.ok && kpi.data.cost_available);
  const costPct = totals && costOn && totals.cost !== null && totals.order_value > 0
    ? (totals.cost / totals.order_value) * 100
    : null;

  // Top 5 for each card — sorted by order value desc client-side so we don't
  // depend on the backend's row order.
  const topEngineers: EngineerScorecardRow[] = useMemo(() => {
    const list = engineers?.ok ? engineers.data.engineers : [];
    return [...list].sort((a, b) => b.order_value - a.order_value).slice(0, TOP_N);
  }, [engineers]);
  const attendanceOn = !!(engineers?.ok && engineers.data.attendance_available);

  const topBrands = useMemo(() => topRows(brands), [brands]);
  const topAccounts = useMemo(() => topRows(accounts), [accounts]);

  // CSV: every business-report row we have, tagged with its section, with raw
  // (spreadsheet-summable) numbers. `csvCell` already defuses a leading = + - @
  // so a name typed as a formula never runs when the file is opened.
  const csvRows = useMemo<CsvRow[]>(() => {
    const out: CsvRow[] = [];
    const push = (section: string, rows: BusinessReportRow[] | undefined) =>
      (rows ?? []).forEach((r) => out.push({
        section, label: r.label, leads: r.leads_count, orders: r.orders_won,
        order_value: r.order_value, quoted_value: r.quoted_value,
      }));
    if (kpi?.ok) push('Engineer', kpi.data.rows);
    if (brands?.ok) push('Brand', brands.data.rows);
    if (accounts?.ok) push('Account', accounts.data.rows);
    return out;
  }, [kpi, brands, accounts]);

  const exportCsv = () => {
    if (csvRows.length === 0) return;
    downloadCsv(`management-overview-${range.from}-to-${range.to}.csv`, toCsv(CSV_COLUMNS, csvRows));
  };

  const headerActions = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <ReportRangePicker range={range} onChange={setRange} />
      <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv} disabled={csvRows.length === 0}>
        Export CSV
      </Button>
    </div>
  );

  // Gate: withheld before the data even loads (non-B2B / non-manager).
  if (!authLoading && !allowed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="management-dashboard">
        <PageHeader title="Management Dashboard" description="A directors' overview for the connected-B2B workspace." compact={narrow} />
        <div style={card}>
          <EmptyState
            icon={<LayoutDashboard size={20} />}
            title="Not available for this workspace"
            description="The Management Dashboard is a directors' overview for the connected-B2B workspace, visible to admins and managers."
          />
          <div data-testid="management-unavailable" style={{ display: 'none' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="management-dashboard">
      <PageHeader
        title="Management Dashboard"
        description="One directors' overview — headline KPIs, your top engineers, brands and accounts, with saved questions that open the full Business Report."
        actions={headerActions}
        compact={narrow}
      />

      {notAvailable ? (
        <div style={card}>
          <EmptyState
            icon={<LayoutDashboard size={20} />}
            title="Not available for this workspace"
            description="This overview is only available for the connected-B2B workspace."
          />
          <div data-testid="management-unavailable" style={{ display: 'none' }} />
        </div>
      ) : loading ? (
        <div style={card}><div style={{ color: T.dim, fontSize: 13, padding: 12 }}>Loading…</div></div>
      ) : (
        <>
          {/* KPI strip */}
          {kpi && !kpi.ok ? (
            <div style={card}><ErrorNote message={kpi.message} /></div>
          ) : (
            <div data-testid="management-kpis" style={kpiGrid}>
              <Kpi testid="kpi-orders" label="Orders won" value={fmtInt(totals?.orders_won)} />
              <Kpi testid="kpi-order-value" label="Order value" value={fmtInr(totals?.order_value)} strong />
              <Kpi testid="kpi-quoted" label="Quoted value" value={fmtInr(totals?.quoted_value)} />
              <Kpi testid="kpi-leads" label="Leads" value={fmtInt(totals?.leads_count)} />
              {costOn && <Kpi testid="kpi-cost" label="Cost" value={fmtInr(totals?.cost)} />}
              {costOn && <Kpi testid="kpi-cost-pct" label="Cost % of order value" value={costPct === null ? DASH : fmtPct(costPct)} />}
            </div>
          )}

          {/* Saved questions */}
          <div style={card}>
            <SectionTitle icon={<Sparkles size={15} />} title="Saved questions" hint="Open the Business Report, preset and ready." />
            <div data-testid="management-saved-questions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {SAVED_QUESTIONS.map((q) => (
                <Link
                  key={q.label}
                  href={businessHref(q.params as Record<string, string>)}
                  data-testid="management-saved-question"
                  className="km-clickable"
                  style={chip}
                >
                  {q.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Top engineers */}
          <div style={card}>
            <SectionTitle
              icon={<Gauge size={15} />}
              title="Top engineers"
              hint="By order value in this window."
              action={<Link href="/dashboard/crm/reports/engineer-scorecard" style={linkStyle}>View full scorecard →</Link>}
            />
            {engineers && !engineers.ok ? (
              <ErrorNote message={engineers.message} />
            ) : topEngineers.length === 0 ? (
              <MiniEmpty label="No engineer activity in this range." />
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={tableStyle(narrow, 520)} data-testid="management-top-engineers">
                  <thead>
                    <tr>
                      <th style={th}>Engineer</th>
                      <th style={thNum}>Attendance</th>
                      <th style={thNum}>Orders won</th>
                      <th style={thNum}>Order value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEngineers.map((e) => (
                      <tr key={e.user_id} data-testid="management-engineer-row">
                        <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                        <td style={tdNum}>{attendanceOn && e.attendance_days !== null ? fmtInt(e.attendance_days) : DASH}</td>
                        <td style={tdNum}>{fmtInt(e.orders_won)}</td>
                        <td style={{ ...tdNum, fontWeight: 700, color: T.text }}>{fmtInr(e.order_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top by brand + Top by account */}
          <div style={twoCol(narrow)}>
            <TopCard
              testid="management-top-brands"
              rowTestid="management-brand-row"
              title="Top by brand"
              heading="Brand"
              res={brands}
              rows={topBrands}
              href={businessHref({ group_by: 'brand' })}
            />
            <TopCard
              testid="management-top-accounts"
              rowTestid="management-account-row"
              title="Top by account"
              heading="Account"
              res={accounts}
              rows={topAccounts}
              href={businessHref({ group_by: 'account' })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function topRows(res: Res<BusinessReportPayload> | null): BusinessReportRow[] {
  const list = res?.ok ? res.data.rows : [];
  return [...list].sort((a, b) => b.order_value - a.order_value).slice(0, TOP_N);
}

/** One of the "Top by brand" / "Top by account" cards. */
function TopCard({ testid, rowTestid, title, heading, res, rows, href }: {
  testid: string; rowTestid: string; title: string; heading: string;
  res: Res<BusinessReportPayload> | null; rows: BusinessReportRow[]; href: string;
}) {
  return (
    <div style={card}>
      <SectionTitle
        icon={<LineChart size={15} />}
        title={title}
        hint="By order value in this window."
        action={<Link href={href} style={linkStyle}>View report →</Link>}
      />
      {res && !res.ok ? (
        <ErrorNote message={res.message} />
      ) : rows.length === 0 ? (
        <MiniEmpty label="No activity in this range." />
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={tableStyle(false, 360)} data-testid={testid}>
            <thead>
              <tr>
                <th style={th}>{heading}</th>
                <th style={thNum}>Orders won</th>
                <th style={thNum}>Order value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={rowTestid}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                  <td style={tdNum}>{fmtInt(r.orders_won)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: T.text }}>{fmtInr(r.order_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, strong, testid }: { label: string; value: string; strong?: boolean; testid?: string }) {
  return (
    <div data-testid={testid} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: T.dim, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: strong ? 24 : 20, fontWeight: 800, color: T.text, fontFamily: T.mono, lineHeight: 1.1 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700, color: T.text }}>
          <span aria-hidden style={{ color: T.dim, display: 'inline-flex' }}>{icon}</span>{title}
        </span>
        {hint && <span style={{ fontSize: 12.5, color: T.dim }}>{hint}</span>}
      </div>
      {action}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" style={{ marginTop: 12, fontSize: 13, color: T.red, background: T.redWash, borderRadius: 8, padding: '10px 12px' }}>{message}</div>
  );
}

function MiniEmpty({ label }: { label: string }) {
  return <div style={{ marginTop: 12, color: T.dim, fontSize: 13, padding: '10px 2px' }}>{label}</div>;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
interface CsvRow { section: string; label: string; leads: number; orders: number; order_value: number; quoted_value: number }
const CSV_COLUMNS: Array<CsvColumn<CsvRow>> = [
  { label: 'Section', csv: (r) => r.section },
  { label: 'Name', csv: (r) => r.label },
  { label: 'Leads', csv: (r) => r.leads },
  { label: 'Orders won', csv: (r) => r.orders },
  { label: 'Order value', csv: (r) => r.order_value },
  { label: 'Quoted value', csv: (r) => r.quoted_value },
];
// Text cells (Section / Name) pass through `csvCell` inside `toCsv`, which
// prefixes a leading = + - @ (and tab / CR) with an apostrophe so a name typed
// as a spreadsheet formula never runs when the file is opened.

// ── styles ─────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: 'var(--s2)', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 };
const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 };
const twoCol = (narrow: boolean): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 });
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px', borderRadius: 999,
  border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12.5, fontWeight: 600,
  textDecoration: 'none', whiteSpace: 'nowrap',
};
const linkStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: T.red, textDecoration: 'none', whiteSpace: 'nowrap' };
const tableStyle = (narrow: boolean, minWidth: number): React.CSSProperties => ({ width: '100%', borderCollapse: 'collapse', fontSize: narrow ? 12 : 13, minWidth });
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: T.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: T.text, borderBottom: `1px solid ${T.border}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
