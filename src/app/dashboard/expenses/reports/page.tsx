'use client';
// Expense reports — every report the expense data can produce, in one place, for
// managers and admins. All reports run on real endpoints and real data, so they
// work for every client:
//   • summary-derived  → GET /expenses/claims/summary  (overview KPIs, by category,
//     by employee, monthly trend, by policy, by status)
//   • claim registers  → GET /expenses/claims/all      (reimbursements, pending &
//     aging, rejected) with the server CSV export sharing the same filters
//   • mileage           → GET /expenses/odometer-history (only for vehicle-rate clients)
// Filters (date range · user · category · policy · city scope) feed every report.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, AreaChart, Area, LabelList,
} from 'recharts';
import { useCityScope } from '../../../../context/CityScopeContext';
import { Badge, Button, Card, EmptyState, Input, Select, T, useIsCompact } from '../../../../components/ui';
import { Col, DataTable, Pager, Stat, Toolbar } from '../../../../components/finance/ui';
import {
  ClaimStatusBadge, ExpensesShell, errText, fmtDate, money, payable, saveBlob, vehicleName,
} from '../../../../components/expenses/kit';
import { ChartCard, ChartTooltip, ChartEmpty, GradientDefs, grad, CHART } from '../../../../lib/chartTheme';
import { formatINRCompact } from '../../../../lib/formatCurrency';
import {
  CATEGORIES, CLAIM_STATUS_LABEL, ClaimFilters, ClaimStatus, ClaimsSummary, ExpenseClaim, ExpensePolicy, MyPolicy,
  OdometerHistoryRow, categoryLabel, expensesApi, mergeCategoryRules, singleCategory, vehicleFlowOn,
} from '../../../../lib/expensesApi';

// Single hue for magnitude-by-identity (the identity is on the axis, so no palette cycle).
const ACCENT = '#6366F1';
// Reserved status palette — each state keeps its own colour across every report, and is
// never colour-alone (donut carries a legend + labels, tables name the status).
const STATUS_COLOR: Record<ClaimStatus, string> = {
  draft: '#94A3B8', submitted: '#F59E0B', approved: '#10B981', rejected: '#E0282C', reimbursed: '#06B6D4', cancelled: '#64748B',
};

type ReportKind = 'summary' | 'list' | 'odometer';
interface ReportDef { id: string; label: string; kind: ReportKind; status?: ClaimStatus }
const REPORTS: ReportDef[] = [
  { id: 'overview', label: 'Overview', kind: 'summary' },
  { id: 'category', label: 'By category', kind: 'summary' },
  { id: 'employee', label: 'By employee', kind: 'summary' },
  { id: 'trend', label: 'Monthly trend', kind: 'summary' },
  { id: 'policy', label: 'By policy', kind: 'summary' },
  { id: 'status', label: 'By status', kind: 'summary' },
  { id: 'reimbursements', label: 'Reimbursement register', kind: 'list', status: 'reimbursed' },
  { id: 'pending', label: 'Pending & aging', kind: 'list', status: 'submitted' },
  { id: 'rejected', label: 'Rejected', kind: 'list', status: 'rejected' },
  { id: 'mileage', label: 'Mileage & odometer', kind: 'odometer' },
];

const LIMIT = 25;         // reimbursement / rejected registers paginate
const PENDING_SCAN = 200; // pending aging is computed over one wider fetch (oldest first)

const prettyMonth = (m: string): string => {
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return m;
  return new Date(Number(mm[1]), Number(mm[2]) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};
const daysSince = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

// ── client-side CSV (for the summary + mileage reports, which have no server export) ──
const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const text = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8;' }), filename);
}

export default function ExpenseReportsPage() {
  const router = useRouter();
  const narrow = useIsCompact(900);
  const { selectedCity } = useCityScope();

  const [reportId, setReportId] = useState('overview');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [user, setUser] = useState('');
  const [category, setCategory] = useState('');
  const [policyId, setPolicyId] = useState('');

  const [summary, setSummary] = useState<ClaimsSummary | null>(null);
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [mine, setMine] = useState<MyPolicy | null>(null);
  const [policiesReady, setPoliciesReady] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);

  const [listRows, setListRows] = useState<ExpenseClaim[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [odoRows, setOdoRows] = useState<OdometerHistoryRow[]>([]);

  const [loading, setLoading] = useState(true);   // summary (always loaded)
  const [subLoading, setSubLoading] = useState(false); // list / odometer for the active report
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [nonce, setNonce] = useState(0); // bumped by "Try again" to re-run the summary fetch

  const filters = useMemo<ClaimFilters>(() => ({
    user_id: user || undefined, from: from || undefined, to: to || undefined,
    category: category || undefined, policy_id: policyId || undefined, city: selectedCity || undefined,
  }), [user, from, to, category, policyId, selectedCity]);

  // Category setup read across every active policy (a manager without policy access falls back to their own).
  const rules = useMemo(() => {
    const live = policies.filter((p) => p.is_active !== false && p.rules);
    return mergeCategoryRules(live.length ? live.map((p) => p.rules) : [mine?.rules]);
  }, [policies, mine]);
  const oneCategory = !!singleCategory(rules);
  const currency = mine?.currency || 'INR';
  const odometerFlow = useMemo(
    () => vehicleFlowOn(mine?.rules) || policies.some((p) => p.is_active !== false && vehicleFlowOn(p.rules)),
    [mine, policies],
  );

  const visibleReports = useMemo(() => REPORTS.filter((r) => r.kind !== 'odometer' || odometerFlow), [odometerFlow]);
  const active = visibleReports.find((r) => r.id === reportId) ?? visibleReports[0];

  // Policies + my policy (category labels, currency, odometer detection) — once.
  useEffect(() => {
    Promise.allSettled([
      expensesApi.listPolicies().then((r) => setPolicies(Array.isArray(r.data) ? r.data : [])),
      expensesApi.myPolicy().then((r) => setMine(r.data ?? null)),
    ]).finally(() => setPoliciesReady(true));
  }, []);

  // Summary powers the KPIs, every analytics report, and grows the people picker.
  useEffect(() => {
    let off = false;
    setLoading(true);
    setError(null);
    expensesApi.summary(filters)
      .then((r) => {
        if (off) return;
        setSummary(r.data);
        if (r.data?.top_people?.length) {
          setPeople((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            for (const tp of r.data!.top_people) if (tp.user_id && !map.has(tp.user_id)) map.set(tp.user_id, { id: tp.user_id, name: tp.name || tp.user_id });
            return Array.from(map.values());
          });
        }
      })
      .catch((e) => { if (!off) setError(errText(e, 'Could not load the report')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [filters, nonce]);

  useEffect(() => { setListPage(1); }, [filters, reportId]);

  // Claim registers (reimbursements / pending / rejected).
  const loadList = useCallback(async () => {
    if (active.kind !== 'list' || !active.status) return;
    setSubLoading(true);
    try {
      if (active.id === 'pending') {
        const r = await expensesApi.listAll({ ...filters, status: active.status, page: 1, limit: PENDING_SCAN });
        // Oldest-first so the aging table leads with what has waited longest.
        const rows = (r.data ?? []).slice().sort((a, b) =>
          new Date(a.submitted_at || a.created_at).getTime() - new Date(b.submitted_at || b.created_at).getTime());
        setListRows(rows);
        setListTotal(r.pagination?.total ?? rows.length);
      } else {
        const r = await expensesApi.listAll({ ...filters, status: active.status, page: listPage, limit: LIMIT });
        setListRows(r.data ?? []);
        setListTotal(r.pagination?.total ?? 0);
      }
    } catch (e) { toast.error(errText(e, 'Could not load the register')); }
    finally { setSubLoading(false); }
  }, [active.kind, active.status, active.id, filters, listPage]);
  useEffect(() => { loadList(); }, [loadList]);

  // Mileage / odometer.
  const loadOdo = useCallback(async () => {
    if (active.kind !== 'odometer') return;
    setSubLoading(true);
    try {
      const r = await expensesApi.odometerHistory({ all: true, limit: PENDING_SCAN, from: filters.from, to: filters.to, user_id: filters.user_id });
      setOdoRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) { toast.error(errText(e, 'Could not load the mileage history')); }
    finally { setSubLoading(false); }
  }, [active.kind, filters.from, filters.to, filters.user_id]);
  useEffect(() => { loadOdo(); }, [loadOdo]);

  // ── export ──────────────────────────────────────────────────────────────
  const onExport = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const s = summary;
    try {
      if (active.kind === 'list' && active.status) {
        setExporting(true);
        saveBlob(await expensesApi.exportCsv({ ...filters, status: active.status }), `expense-${active.id}-${stamp}.csv`);
      } else if (active.kind === 'odometer') {
        downloadCsv(`expense-mileage-${stamp}.csv`,
          ['Date', 'Person', 'Vehicle', 'Start', 'End', 'Distance (km)', 'Amount', 'Claim', 'Status'],
          odoRows.map((r) => [fmtDate(r.item_date || r.created_at), r.user_name || '', vehicleName(r.vehicle_type) || r.vehicle_label || '',
            r.odometer_start ?? '', r.odometer_end ?? '', r.distance_km ?? '', r.amount ?? '', r.claim_no || '', CLAIM_STATUS_LABEL[r.claim_status] ?? r.claim_status]));
      } else if (s) {
        if (active.id === 'overview') {
          const t = s.totals;
          downloadCsv(`expense-overview-${stamp}.csv`, ['Metric', 'Count', 'Amount'], [
            ['Claimed', t.claims, t.claimed], ['Awaiting approval', t.pending_count, t.pending_amount],
            ['Approved', t.approved_count, t.approved_amount], ['Reimbursed', t.reimbursed_count, t.reimbursed_amount],
            ['Rejected', t.rejected_count, t.rejected_amount], ['Auto-approved', t.auto_approved_count, ''],
            ['Avg decision (hours)', '', t.avg_turnaround_hours ?? ''],
          ]);
        } else if (active.id === 'category') {
          downloadCsv(`expense-by-category-${stamp}.csv`, ['Category', 'Amount'],
            s.by_category.map((c) => [categoryLabel(rules, c.category, s.by_category.map((x) => x.category)), c.amount]));
        } else if (active.id === 'employee') {
          downloadCsv(`expense-by-employee-${stamp}.csv`, ['Employee', 'Claims', 'Amount'],
            s.top_people.map((p) => [p.name || 'Unknown', p.claims, p.amount]));
        } else if (active.id === 'trend') {
          downloadCsv(`expense-monthly-${stamp}.csv`, ['Month', 'Claims', 'Amount'],
            s.by_month.map((m) => [m.month, m.claims, m.amount]));
        } else if (active.id === 'policy') {
          downloadCsv(`expense-by-policy-${stamp}.csv`, ['Policy', 'Claims', 'Amount'],
            s.by_policy.map((p) => [p.policy, p.claims, p.amount]));
        } else if (active.id === 'status') {
          downloadCsv(`expense-by-status-${stamp}.csv`, ['Status', 'Claims', 'Amount'],
            s.by_status.map((x) => [CLAIM_STATUS_LABEL[x.status] ?? x.status, x.claims, x.amount]));
        }
      }
    } catch (e) { toast.error(errText(e, 'Could not export')); }
    finally { setExporting(false); }
  };

  const hasData = !!summary && summary.totals.claims > 0;
  const canExport = active.kind === 'odometer' ? odoRows.length > 0 : hasData;

  return (
    <ExpensesShell tab="reports" title="Reports"
      description="Every report the expense data can produce — spend breakdowns, registers, aging and mileage. Filter by date, person, category, policy and city, then export."
      actions={<Button icon={<Download size={15} strokeWidth={1.7} />} disabled={exporting || !canExport} onClick={onExport}>{exporting ? 'Preparing…' : 'Export CSV'}</Button>}>

      {/* Report picker */}
      <div role="tablist" aria-label="Report" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {visibleReports.map((r) => {
          const on = r.id === active.id;
          return (
            <button key={r.id} role="tab" aria-selected={on} onClick={() => setReportId(r.id)} style={{
              padding: '7px 13px', fontSize: 13, fontWeight: on ? 700 : 500, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${on ? T.red : T.border}`, background: on ? T.redWash : 'transparent', color: on ? T.text : T.dim,
            }}>{r.label}</button>
          );
        })}
      </div>

      {/* Filters */}
      <Toolbar>
        {people.length > 0 && (
          <Select aria-label="User" value={user} onChange={(e) => setUser(e.target.value)} style={{ width: 180 }}>
            <option value="">All people</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {policiesReady && !oneCategory && (
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(rules, c, CATEGORIES)}</option>)}
          </Select>
        )}
        {policies.length > 0 && (
          <Select aria-label="Policy" value={policyId} onChange={(e) => setPolicyId(e.target.value)} style={{ width: 190 }}>
            <option value="">All policies</option>
            {policies.filter((p) => p.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Input aria-label="From" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ fontSize: 13, color: T.mute }}>to</span>
        <Input aria-label="To" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        {selectedCity && <Badge>{selectedCity}</Badge>}
      </Toolbar>

      {error ? (
        <Card><EmptyState title="Couldn’t load the report" description={error} action={<Button onClick={() => setNonce((n) => n + 1)}>Try again</Button>} /></Card>
      ) : loading && !summary ? (
        <Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card>
      ) : !hasData ? (
        <Card><EmptyState title="No expense data yet" description="No claims match these filters. Clear a filter or widen the date range." /></Card>
      ) : (
        <ReportBody
          report={active} summary={summary!} rules={rules} currency={currency} narrow={narrow}
          listRows={listRows} listTotal={listTotal} listPage={listPage} onListPage={setListPage}
          odoRows={odoRows} subLoading={subLoading} onOpenClaim={(id) => router.push(`/dashboard/expenses/${id}`)}
        />
      )}
    </ExpensesShell>
  );
}

// ── report bodies ────────────────────────────────────────────────────────────
function ReportBody({ report, summary, rules, currency, narrow, listRows, listTotal, listPage, onListPage, odoRows, subLoading, onOpenClaim }: {
  report: ReportDef; summary: ClaimsSummary; rules: ReturnType<typeof mergeCategoryRules>; currency: string; narrow: boolean;
  listRows: ExpenseClaim[]; listTotal: number; listPage: number; onListPage: (p: number) => void;
  odoRows: OdometerHistoryRow[]; subLoading: boolean; onOpenClaim: (id: string) => void;
}) {
  switch (report.id) {
    case 'overview': return <Overview summary={summary} currency={currency} narrow={narrow} />;
    case 'category': return <CategoryReport summary={summary} rules={rules} currency={currency} />;
    case 'employee': return <EmployeeReport summary={summary} currency={currency} />;
    case 'trend': return <TrendReport summary={summary} currency={currency} />;
    case 'policy': return <PolicyReport summary={summary} currency={currency} />;
    case 'status': return <StatusReport summary={summary} currency={currency} />;
    case 'reimbursements': return <RegisterReport kind="reimbursements" rows={listRows} total={listTotal} page={listPage} onPage={onListPage} loading={subLoading} onOpenClaim={onOpenClaim} />;
    case 'pending': return <PendingReport rows={listRows} total={listTotal} currency={currency} loading={subLoading} onOpenClaim={onOpenClaim} />;
    case 'rejected': return <RegisterReport kind="rejected" rows={listRows} total={listTotal} page={listPage} onPage={onListPage} loading={subLoading} onOpenClaim={onOpenClaim} />;
    case 'mileage': return <MileageReport rows={odoRows} currency={currency} loading={subLoading} onOpenClaim={onOpenClaim} />;
    default: return null;
  }
}

function KpiGrid({ t, currency }: { t: ClaimsSummary['totals']; currency: string }) {
  const decision = t.avg_turnaround_hours == null ? '—' : t.avg_turnaround_hours < 48 ? `${t.avg_turnaround_hours}h` : `${Math.round(t.avg_turnaround_hours / 24)}d`;
  return (
    <Card padding={20}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
        <Stat label="Claimed" value={money(t.claimed, currency)} hint={`${t.claims} ${t.claims === 1 ? 'claim' : 'claims'}`} />
        <Stat label="Awaiting approval" value={money(t.pending_amount, currency)} hint={`${t.pending_count} claims`} tone={t.pending_count ? 'warn' : undefined} />
        <Stat label="Approved" value={money(t.approved_amount, currency)} hint={`${t.approved_count} to be paid`} tone={t.approved_count ? 'ok' : undefined} />
        <Stat label="Reimbursed" value={money(t.reimbursed_amount, currency)} hint={`${t.reimbursed_count} claims`} tone="info" />
        <Stat label="Rejected" value={money(t.rejected_amount, currency)} hint={`${t.rejected_count} claims`} tone={t.rejected_count ? 'red' : undefined} />
        <Stat label="Decision time" value={decision} hint={t.auto_approved_count ? `${t.auto_approved_count} auto-approved` : 'Average, manual'} />
      </div>
    </Card>
  );
}

function Overview({ summary, currency, narrow }: { summary: ClaimsSummary; currency: string; narrow: boolean }) {
  const trend = summary.by_month.map((m) => ({ name: prettyMonth(m.month), amount: m.amount, claims: m.claims }));
  const donut = summary.by_status.filter((s) => s.amount > 0).map((s) => ({ name: CLAIM_STATUS_LABEL[s.status] ?? s.status, status: s.status, value: s.amount }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpiGrid t={summary.totals} currency={currency} />
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1.6fr 1fr', gap: 16 }}>
        <ChartCard title="Spend over time" subtitle="Claimed amount by month" minHeight={260}>
          {trend.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={trend} margin={CHART.margin}>
                <GradientDefs colors={[ACCENT]} top={0.5} bottom={0.02} />
                <CartesianGrid {...CHART.grid} />
                <XAxis dataKey="name" {...CHART.axis} minTickGap={18} />
                <YAxis {...CHART.axis} width={46} tickFormatter={(v) => formatINRCompact(v)} />
                <Tooltip content={<ChartTooltip unit="inr" />} />
                <Area type="monotone" dataKey="amount" name="Claimed" stroke={ACCENT} strokeWidth={2} fill={grad(ACCENT)} dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }} {...CHART.animation} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Where the money sits" subtitle="Claimed amount by status" minHeight={260}>
          {donut.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="var(--s2)" strokeWidth={2} labelLine={false} {...CHART.animation}>
                  {donut.map((d) => <Cell key={d.status} fill={STATUS_COLOR[d.status]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip unit="inr" />} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/** Horizontal single-hue magnitude bar shared by the category / employee / policy reports. */
function MagnitudeBars({ data, currency }: { data: Array<{ name: string; value: number }>; currency: string }) {
  if (!data.length) return <ChartEmpty />;
  // Pre-format the amount into a sibling field so the direct label needs no recharts formatter.
  const rows = data.map((d) => ({ ...d, label: money(d.value, currency) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 42)}>
      <BarChart layout="vertical" data={rows} margin={{ top: 6, right: 72, left: 6, bottom: 6 }}>
        <GradientDefs colors={[ACCENT]} />
        <CartesianGrid {...CHART.grid} horizontal={false} />
        <XAxis type="number" {...CHART.axis} tickFormatter={(v) => formatINRCompact(v)} />
        <YAxis type="category" dataKey="name" width={140} {...CHART.axis} />
        <Tooltip cursor={{ fill: 'var(--s3)', opacity: 0.4 }} content={<ChartTooltip unit="inr" />} />
        <Bar dataKey="value" name="Amount" fill={grad(ACCENT)} radius={CHART.hBarRadius} {...CHART.animation}>
          <LabelList dataKey="label" position="right" style={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReportTable<R extends { id: string }>({ cols, rows, empty, loading, onOpenClaim }: {
  cols: Col<R>[]; rows: R[]; empty: string; loading?: boolean; onOpenClaim?: (id: string) => void;
}) {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <DataTable<R> columns={cols} rows={rows} loading={loading} empty={empty} onRowClick={onOpenClaim ? (r) => onOpenClaim(r.id) : undefined} />
    </Card>
  );
}

function CategoryReport({ summary, rules, currency }: { summary: ClaimsSummary; rules: ReturnType<typeof mergeCategoryRules>; currency: string }) {
  const names = summary.by_category.map((c) => c.category);
  const rows = summary.by_category.slice().sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, c) => s + c.amount, 0) || 1;
  const bars = rows.map((c) => ({ name: categoryLabel(rules, c.category, names), value: c.amount }));
  const cols: Col<{ id: string; label: string; amount: number }>[] = [
    { key: 'label', label: 'Category' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount, currency) },
    { key: 'pct', label: 'Share', align: 'right', render: (r) => `${Math.round((r.amount / total) * 100)}%` },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartCard title="Spend by category" subtitle="Claimed amount per expense category"><MagnitudeBars data={bars} currency={currency} /></ChartCard>
      <ReportTable cols={cols} rows={bars.map((b, i) => ({ id: String(i), label: b.name, amount: b.value }))} empty="No categories." />
    </div>
  );
}

function EmployeeReport({ summary, currency }: { summary: ClaimsSummary; currency: string }) {
  const rows = summary.top_people.slice().sort((a, b) => b.amount - a.amount);
  const bars = rows.slice(0, 12).map((p) => ({ name: p.name || 'Unknown', value: p.amount }));
  const cols: Col<{ id: string; name: string; claims: number; amount: number }>[] = [
    { key: 'name', label: 'Employee' },
    { key: 'claims', label: 'Claims', align: 'right' },
    { key: 'amount', label: 'Total', align: 'right', render: (r) => money(r.amount, currency) },
    { key: 'avg', label: 'Avg / claim', align: 'right', render: (r) => money(r.claims ? r.amount / r.claims : 0, currency) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartCard title="Spend by employee" subtitle="Top claimants by total claimed"><MagnitudeBars data={bars} currency={currency} /></ChartCard>
      <ReportTable cols={cols} rows={rows.map((p) => ({ id: p.user_id, name: p.name || 'Unknown', claims: p.claims, amount: p.amount }))} empty="No claimants." />
    </div>
  );
}

function TrendReport({ summary, currency }: { summary: ClaimsSummary; currency: string }) {
  const data = summary.by_month.map((m) => ({ name: prettyMonth(m.month), amount: m.amount, claims: m.claims }));
  const rows = summary.by_month.slice().reverse();
  const cols: Col<{ id: string; month: string; claims: number; amount: number }>[] = [
    { key: 'month', label: 'Month' },
    { key: 'claims', label: 'Claims', align: 'right' },
    { key: 'amount', label: 'Claimed', align: 'right', render: (r) => money(r.amount, currency) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartCard title="Monthly trend" subtitle="Claimed amount by month" minHeight={260}>
        {data.length === 0 ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={CHART.margin}>
              <GradientDefs colors={[ACCENT]} top={0.5} bottom={0.02} />
              <CartesianGrid {...CHART.grid} />
              <XAxis dataKey="name" {...CHART.axis} minTickGap={18} />
              <YAxis {...CHART.axis} width={46} tickFormatter={(v) => formatINRCompact(v)} />
              <Tooltip content={<ChartTooltip unit="inr" />} />
              <Area type="monotone" dataKey="amount" name="Claimed" stroke={ACCENT} strokeWidth={2} fill={grad(ACCENT)} dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }} {...CHART.animation} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ReportTable cols={cols} rows={rows.map((m, i) => ({ id: String(i), month: prettyMonth(m.month), claims: m.claims, amount: m.amount }))} empty="No months." />
    </div>
  );
}

function PolicyReport({ summary, currency }: { summary: ClaimsSummary; currency: string }) {
  const rows = summary.by_policy.slice().sort((a, b) => b.amount - a.amount);
  const bars = rows.map((p) => ({ name: p.policy, value: p.amount }));
  const cols: Col<{ id: string; policy: string; claims: number; amount: number }>[] = [
    { key: 'policy', label: 'Policy' },
    { key: 'claims', label: 'Claims', align: 'right' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount, currency) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartCard title="Spend by policy" subtitle="Claimed amount per expense policy"><MagnitudeBars data={bars} currency={currency} /></ChartCard>
      <ReportTable cols={cols} rows={rows.map((p, i) => ({ id: String(i), policy: p.policy, claims: p.claims, amount: p.amount }))} empty="No policies." />
    </div>
  );
}

function StatusReport({ summary, currency }: { summary: ClaimsSummary; currency: string }) {
  const rows = summary.by_status.filter((s) => s.claims > 0);
  const donut = rows.filter((s) => s.amount > 0).map((s) => ({ name: CLAIM_STATUS_LABEL[s.status] ?? s.status, status: s.status, value: s.amount }));
  const cols: Col<{ id: string; status: ClaimStatus; claims: number; amount: number }>[] = [
    { key: 'status', label: 'Status', render: (r) => <ClaimStatusBadge status={r.status} /> },
    { key: 'claims', label: 'Claims', align: 'right' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount, currency) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartCard title="By status" subtitle="Claimed amount by claim status" minHeight={280}>
        {donut.length === 0 ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={92} paddingAngle={2} stroke="var(--s2)" strokeWidth={2} labelLine={false} {...CHART.animation}>
                {donut.map((d) => <Cell key={d.status} fill={STATUS_COLOR[d.status]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip unit="inr" />} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ReportTable cols={cols} rows={rows.map((s) => ({ id: s.status, status: s.status, claims: s.claims, amount: s.amount }))} empty="No claims." />
    </div>
  );
}

function RegisterReport({ kind, rows, total, page, onPage, loading, onOpenClaim }: {
  kind: 'reimbursements' | 'rejected'; rows: ExpenseClaim[]; total: number; page: number; onPage: (p: number) => void; loading: boolean; onOpenClaim: (id: string) => void;
}) {
  const base: Col<ExpenseClaim>[] = [
    { key: 'user', label: 'Claimant', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.user_name || '—'}</div>{c.employee_id && <div style={{ fontSize: 12, color: T.mute }}>{c.employee_id}</div>}</div> },
    { key: 'claim', label: 'Claim', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.title || c.claim_no || 'Expense claim'}</div><div style={{ fontSize: 12, color: T.mute }}>{c.claim_no && c.title ? `${c.claim_no} · ` : ''}{c.policy_name || 'No policy'}</div></div> },
  ];
  const cols: Col<ExpenseClaim>[] = kind === 'reimbursements'
    ? [...base,
      { key: 'reimbursed', label: 'Reimbursed on', render: (c) => fmtDate(c.reimbursed_at) },
      { key: 'ref', label: 'Reference', render: (c) => c.reimbursed_ref || <span style={{ color: T.mute }}>—</span> },
      { key: 'amount', label: 'Amount', align: 'right', render: (c) => <strong>{money(payable(c), c.currency)}</strong> }]
    : [...base,
      { key: 'rejected', label: 'Rejected on', render: (c) => fmtDate(c.reviewed_at) },
      { key: 'amount', label: 'Amount', align: 'right', render: (c) => money(c.total_amount, c.currency) },
      { key: 'note', label: 'Reason', nowrap: false, render: (c) => c.review_note ? <span style={{ fontSize: 12.5, color: T.dim, display: 'inline-block', maxWidth: 280, overflowWrap: 'anywhere' }}>{c.review_note}</span> : <span style={{ color: T.mute }}>—</span> }];
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <DataTable<ExpenseClaim> columns={cols} rows={rows} loading={loading} empty={kind === 'reimbursements' ? 'No reimbursements for these filters.' : 'No rejected claims for these filters.'} onRowClick={(c) => onOpenClaim(c.id)} />
      <Pager page={page} limit={LIMIT} total={total} onPage={onPage} />
    </Card>
  );
}

const AGING = [
  { key: '0-2', label: '0–2 days', min: 0, max: 2, tone: T.ok },
  { key: '3-7', label: '3–7 days', min: 3, max: 7, tone: T.info },
  { key: '8-14', label: '8–14 days', min: 8, max: 14, tone: T.warn },
  { key: '15+', label: '15+ days', min: 15, max: Infinity, tone: T.red },
];

function PendingReport({ rows, total, currency, loading, onOpenClaim }: { rows: ExpenseClaim[]; total: number; currency: string; loading: boolean; onOpenClaim: (id: string) => void }) {
  const buckets = AGING.map((b) => {
    const inBucket = rows.filter((c) => {
      const d = daysSince(c.submitted_at || c.created_at);
      return d != null && d >= b.min && d <= b.max;
    });
    return { ...b, count: inBucket.length, amount: inBucket.reduce((s, c) => s + Number(c.total_amount || 0), 0) };
  });
  const cols: Col<ExpenseClaim>[] = [
    { key: 'user', label: 'Claimant', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.user_name || '—'}</div>{c.employee_id && <div style={{ fontSize: 12, color: T.mute }}>{c.employee_id}</div>}</div> },
    { key: 'claim', label: 'Claim', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.title || c.claim_no || 'Expense claim'}</div><div style={{ fontSize: 12, color: T.mute }}>{c.policy_name || 'No policy'}</div></div> },
    { key: 'submitted', label: 'Submitted', render: (c) => fmtDate(c.submitted_at || c.created_at) },
    { key: 'age', label: 'Waiting', align: 'right', render: (c) => {
      const d = daysSince(c.submitted_at || c.created_at);
      const tone = d == null ? T.mute : d >= 15 ? T.red : d >= 8 ? T.warn : d >= 3 ? T.info : T.dim;
      return <span style={{ color: tone, fontWeight: 600 }}>{d == null ? '—' : `${d}d`}</span>;
    } },
    { key: 'amount', label: 'Amount', align: 'right', render: (c) => money(c.total_amount, c.currency) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding={20}>
        <div style={{ fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>How long claims have waited</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          {buckets.map((b) => (
            <div key={b.key} style={{ borderLeft: `3px solid ${b.tone}`, paddingLeft: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute }}>{b.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{b.count}</div>
              <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{money(b.amount, currency)}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<ExpenseClaim> columns={cols} rows={rows} loading={loading} empty="Nothing is awaiting approval for these filters." onRowClick={(c) => onOpenClaim(c.id)} />
        <div style={{ padding: '10px 14px', fontSize: 12.5, color: T.mute, borderTop: `1px solid ${T.border}` }}>
          {total > rows.length ? `Showing the ${rows.length} oldest of ${total} awaiting approval.` : `${rows.length} awaiting approval, oldest first.`}
        </div>
      </Card>
    </div>
  );
}

function MileageReport({ rows, currency, loading, onOpenClaim }: { rows: OdometerHistoryRow[]; currency: string; loading: boolean; onOpenClaim: (id: string) => void }) {
  const totalKm = rows.reduce((s, r) => s + Number(r.distance_km || 0), 0);
  const totalAmt = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const km = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
  const cols: Col<OdometerHistoryRow>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.item_date || r.created_at) },
    { key: 'person', label: 'Person', render: (r) => r.user_name || '—' },
    { key: 'vehicle', label: 'Vehicle', render: (r) => vehicleName(r.vehicle_type) || r.vehicle_label || '—' },
    { key: 'odo', label: 'Odometer', align: 'right', render: (r) => `${km(r.odometer_start)} → ${km(r.odometer_end)}` },
    { key: 'distance', label: 'Distance', align: 'right', render: (r) => `${km(r.distance_km)} km` },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount, currency) },
    { key: 'claim', label: 'Claim', render: (r) => <div><div style={{ fontWeight: 600 }}>{r.claim_no || 'Claim'}</div><div style={{ fontSize: 12, color: T.mute }}>{CLAIM_STATUS_LABEL[r.claim_status] ?? r.claim_status}</div></div> },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding={20}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
          <Stat label="Total distance" value={`${totalKm.toLocaleString('en-IN')} km`} hint={`${rows.length} ${rows.length === 1 ? 'reading' : 'readings'}`} />
          <Stat label="Mileage claimed" value={money(totalAmt, currency)} hint="Across shown readings" />
        </div>
      </Card>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<OdometerHistoryRow> columns={cols} rows={rows} loading={loading} empty="No odometer readings for these filters." onRowClick={(r) => onOpenClaim(r.claim_id)} />
      </Card>
    </div>
  );
}
