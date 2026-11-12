'use client';
import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import {
  crmReports,
  type BusinessReportPayload,
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
import { fmtInr, fmtInt, DASH } from '../../../../../lib/crm/plusFormat';
import { PageHeader, Segmented, Select, EmptyState, Badge, T, useIsCompact } from '../../../../../components/ui';

/** First day of the current month → today, ISO YYYY-MM-DD. Matches the
 *  backend's default window (current IST month) closely enough for the picker
 *  to open on the same range the API would use with no `from`/`to`. */
function defaultMonthRange(): ReportRange {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(first), to: iso(now) };
}

const GROUP_BY: Array<{ value: BusinessGroupBy; label: string }> = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'industry', label: 'Industry' },
  { value: 'brand', label: 'Brand' },
  { value: 'product', label: 'Product' },
  { value: 'account', label: 'Account' },
];

const SCOPES: Array<{ value: BusinessScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'My own' },
  { value: 'supervised', label: 'My team' },
];

const GROUP_LABEL: Record<BusinessGroupBy, string> = {
  engineer: 'Engineer', industry: 'Industry', brand: 'Brand', product: 'Product', account: 'Account',
};

/**
 * Business Report — a flexible directors' report for the connected-B2B tenant
 * (Spark & Ray). Pick a grouping (engineer / industry / brand / product /
 * account) and a scope, and see deal value, orders and cost per group over a
 * date range. Gated to `isB2bClientActive()` AND admin / manager visibility
 * (`isManagerOrAdmin`), mirroring the Engineer Scorecard; a non-B2B tenant also
 * gets a 404 from the backend, which we handle with the "not available" state.
 *
 * City scope is automatic: `/crm/reports/*` is a city-aware path, so api.get
 * appends the global `?city=` picker — we list `cityKey` in the fetch deps so a
 * picker change refetches.
 */
export default function BusinessReportPage() {
  usePageTitle('Business Report');
  const { user, loading: authLoading } = useAuth();
  const narrow = useIsCompact(760);
  const cityKey = useReportCityKey();

  const [range, setRange] = useState<ReportRange>(() => defaultMonthRange());
  const [groupBy, setGroupBy] = useState<BusinessGroupBy>('engineer');
  const [scope, setScope] = useState<BusinessScope>('all');
  const [industry, setIndustry] = useState('');
  const [brand, setBrand] = useState('');
  const [data, setData] = useState<BusinessReportPayload | null>(null);
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
        const res = await crmReports.businessReport({
          from: range.from,
          to: range.to,
          group_by: groupBy,
          scope,
          industry: industry.trim() || undefined,
          brand: brand.trim() || undefined,
        });
        if (cancelled) return;
        setData(res.data);
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err?.status === 404) { setNotAvailable(true); setData(null); }
        else setError(err?.message || 'Failed to load the business report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, groupBy, scope, industry, brand, cityKey, allowed, authLoading]);

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  // Cost is withheld unless the workspace has it wired AND the row has a number.
  const costOn = !!data?.cost_available;
  const fanOut = groupBy === 'brand' || groupBy === 'product';
  const groupHeading = GROUP_LABEL[groupBy];

  const controls = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <ReportRangePicker range={range} onChange={setRange} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={labelCap}>Group by</span>
        <Segmented<BusinessGroupBy> value={groupBy} onChange={setGroupBy} options={GROUP_BY} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={labelCap}>Scope</span>
        <Select value={scope} onChange={(e) => setScope(e.target.value as BusinessScope)} style={{ width: 130 }} aria-label="Scope">
          {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <TextFilter label="Industry" value={industry} onChange={setIndustry} />
      <TextFilter label="Brand" value={brand} onChange={setBrand} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="business-report">
      <PageHeader
        title="Business Report"
        description="Deal value, orders and cost grouped by engineer, industry, brand, product or account over the chosen window."
        compact={narrow}
      />

      {!authLoading && !allowed ? (
        <div style={card}>
          <EmptyState
            icon={<LineChart size={20} />}
            title="Not available for this workspace"
            description="The Business Report is a directors' report for the connected-B2B workspace, visible to admins and managers."
          />
          <div data-testid="business-unavailable" style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 16 }}>{controls}</div>

          {fanOut && (
            <div data-testid="business-fanout-note" style={{
              fontSize: 12.5, color: T.dim, background: 'var(--s3)', border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '8px 12px', marginBottom: 14,
            }}>
              A deal with several {groupBy === 'brand' ? 'brands' : 'products'} is counted in each of its rows,
              so the rows can sum to more than the totals — the totals count each deal once.
            </div>
          )}

          {loading ? (
            <div style={{ color: T.dim, fontSize: 13, padding: 12 }}>Loading…</div>
          ) : notAvailable ? (
            <>
              <EmptyState
                icon={<LineChart size={20} />}
                title="Not available for this workspace"
                description="This report is only available for the connected-B2B workspace."
              />
              <div data-testid="business-unavailable" style={{ display: 'none' }} />
            </>
          ) : error ? (
            <div role="alert" style={{ fontSize: 13, color: T.red, background: T.redWash, borderRadius: 8, padding: '10px 12px' }}>{error}</div>
          ) : rows.length === 0 ? (
            <div data-testid="business-empty">
              <EmptyState icon={<LineChart size={20} />} title="No data in this range" description="No activity for the selected grouping and window. Try a wider date range, a different scope or city." />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: narrow ? 12 : 13, minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={th}>{groupHeading}</th>
                    <th style={thNum}>Leads</th>
                    <th style={thNum}>Orders won</th>
                    <th style={thNum}>Quoted ₹</th>
                    <th style={thNum}>Order ₹</th>
                    <th style={th}>Brands</th>
                    <th style={thNum}>Cost ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} data-testid="business-row">
                      <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                      <td style={tdNum}>{fmtInt(r.leads_count)}</td>
                      <td style={tdNum}>{fmtInt(r.orders_won)}</td>
                      <td style={tdNum}>{fmtInr(r.quoted_value)}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: T.text }}>{fmtInr(r.order_value)}</td>
                      <td style={td}><Brands brands={r.brands} /></td>
                      <td style={tdNum} data-testid="business-cost">
                        {costOn && r.cost !== null ? fmtInr(r.cost) : DASH}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr data-testid="business-totals" style={{ borderTop: `2px solid ${T.border}` }}>
                      <td style={{ ...td, fontWeight: 800 }}>Total</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInt(totals.leads_count)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInt(totals.orders_won)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtInr(totals.quoted_value)}</td>
                      <td style={{ ...tdNum, fontWeight: 800, color: T.text }}>{fmtInr(totals.order_value)}</td>
                      <td style={td}><Brands brands={totals.brands} /></td>
                      <td style={{ ...tdNum, fontWeight: 700 }} data-testid="business-totals-cost">
                        {costOn && totals.cost !== null ? fmtInr(totals.cost) : DASH}
                      </td>
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

/** A clearable free-text filter for a single dimension (industry / brand). */
function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={labelCap}>{label}</span>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Filter ${label.toLowerCase()}…`}
          aria-label={`Filter by ${label.toLowerCase()}`}
          style={{
            background: 'var(--s2)', border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.text, padding: '8px 26px 8px 10px', fontSize: 13, width: 150,
          }}
        />
        {value && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()} filter`}
            onClick={() => onChange('')}
            style={{
              position: 'absolute', right: 6, border: 0, background: 'transparent', cursor: 'pointer',
              color: T.mute, fontSize: 15, lineHeight: 1, padding: 2,
            }}
          >×</button>
        )}
      </span>
    </label>
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
        <span key={b} data-testid="business-brand" style={{
          fontSize: 11, fontWeight: 600, color: T.dim, background: 'var(--s3)',
          border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap',
        }}>{b}</span>
      ))}
      {extra > 0 && <Badge tone="neutral">+{extra}</Badge>}
    </span>
  );
}

const labelCap: React.CSSProperties = { fontSize: 11, color: T.dim, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 };
const card: React.CSSProperties = { background: 'var(--s2)', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: T.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: T.text, borderBottom: `1px solid ${T.border}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
