'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { useCityScope } from '../../../../context/CityScopeContext';
import { Badge, Button, Card, EmptyState, Input, Select, T, useIsCompact } from '../../../../components/ui';
import { Col, DataTable, Pager, SearchBox, Stat, Toolbar, useDebounced } from '../../../../components/finance/ui';
import { ClaimStatusBadge, ExpensesShell, errText, fmtDate, isPartial, money, payable, saveBlob } from '../../../../components/expenses/kit';
import {
  CATEGORIES, CATEGORY_LABELS, ClaimFilters, ClaimsSummary, ExpenseClaim, ExpensePolicy, expensesApi,
} from '../../../../lib/expensesApi';

const LIMIT = 25;
const STATUSES = [
  ['', 'All (excluding drafts)'], ['submitted', 'Awaiting approval'], ['approved', 'Approved'], ['rejected', 'Rejected'],
  ['reimbursed', 'Reimbursed'], ['draft', 'Drafts'], ['cancelled', 'Cancelled'],
] as const;

function BarList({ rows, format }: { rows: Array<{ label: string; value: number; sub?: string }>; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div style={{ fontSize: 13, color: T.mute }}>No data for these filters.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}{r.sub ? <span style={{ color: T.mute }}> · {r.sub}</span> : null}</span>
            <span style={{ color: T.dim, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{format(r.value)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--s3)' }}><div style={{ height: 6, borderRadius: 3, width: `${Math.max(2, (r.value / max) * 100)}%`, background: T.red }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function AllClaimsPage() {
  const router = useRouter();
  const narrow = useIsCompact(900);
  const { selectedCity } = useCityScope();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ExpenseClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ClaimsSummary | null>(null);
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo<ClaimFilters>(() => ({
    status, category, policy_id: policyId, from, to, q: dq, city: selectedCity || undefined,
  }), [status, category, policyId, from, to, dq, selectedCity]);

  // Any filter change goes back to page 1.
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { expensesApi.listPolicies().then((r) => setPolicies(r.data ?? [])).catch(() => undefined); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, s] = await Promise.all([expensesApi.listAll({ ...filters, page, limit: LIMIT }), expensesApi.summary(filters)]);
      setRows(l.data ?? []);
      setTotal(l.pagination?.total ?? 0);
      setSummary(s.data);
    } catch (e) { setError(errText(e, 'Could not load claims')); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try { saveBlob(await expensesApi.exportCsv(filters), `expense-claims-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { toast.error(errText(e, 'Could not export')); }
    finally { setExporting(false); }
  };

  const t = summary?.totals;
  const cols: Col<ExpenseClaim>[] = [
    { key: 'user', label: 'Claimant', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.user_name || '—'}</div>{c.employee_id && <div style={{ fontSize: 12, color: T.mute }}>{c.employee_id}</div>}</div> },
    { key: 'claim', label: 'Claim', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.title || c.claim_no || 'Expense claim'}</div><div style={{ fontSize: 12, color: T.mute }}>{c.claim_no && c.title ? `${c.claim_no} · ` : ''}{c.policy_name || 'No policy'}</div></div> },
    { key: 'submitted', label: 'Submitted', render: (c) => fmtDate(c.submitted_at || c.created_at) },
    { key: 'amount', label: 'Amount', align: 'right', render: (c) => (
      <div><strong>{money(payable(c), c.currency)}</strong>{isPartial(c) && <div style={{ fontSize: 12, color: T.mute, textDecoration: 'line-through' }}>{money(c.total_amount, c.currency)}</div>}</div>) },
    { key: 'status', label: 'Status', render: (c) => <ClaimStatusBadge status={c.status} partial={isPartial(c)} /> },
    { key: 'note', label: 'Remark', nowrap: false, render: (c) => c.status === 'rejected' && c.review_note
      ? <span style={{ fontSize: 12.5, color: T.dim, display: 'inline-block', maxWidth: 260, overflowWrap: 'anywhere' }}>{c.review_note}</span> : <span style={{ color: T.mute }}>—</span> },
  ];

  return (
    <ExpensesShell tab="all" title="All claims" description="Every claim you can see, with filters, totals and a spreadsheet export."
      actions={<Button icon={<Download size={15} strokeWidth={1.7} />} disabled={exporting || total === 0} onClick={exportCsv}>{exporting ? 'Preparing…' : 'Export CSV'}</Button>}>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, claim no. or title" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 150 }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </Select>
        {policies.length > 0 && (
          <Select aria-label="Policy" value={policyId} onChange={(e) => setPolicyId(e.target.value)} style={{ width: 190 }}>
            <option value="">All policies</option>
            {policies.filter((p) => p.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Input aria-label="Submitted from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ fontSize: 13, color: T.mute }}>to</span>
        <Input aria-label="Submitted to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        {selectedCity && <Badge>{selectedCity}</Badge>}
      </Toolbar>

      {error ? (
        <Card><EmptyState title="Couldn’t load claims" description={error} action={<Button onClick={load}>Try again</Button>} /></Card>
      ) : (
        <>
          {t && (
            <Card padding={20}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
                <Stat label="Claimed" value={money(t.claimed)} hint={`${t.claims} ${t.claims === 1 ? 'claim' : 'claims'}`} />
                <Stat label="Awaiting approval" value={money(t.pending_amount)} hint={`${t.pending_count} claims`} tone={t.pending_count ? 'warn' : undefined} />
                <Stat label="Approved" value={money(t.approved_amount)} hint={`${t.approved_count} to be paid`} tone={t.approved_count ? 'ok' : undefined} />
                <Stat label="Reimbursed" value={money(t.reimbursed_amount)} hint={`${t.reimbursed_count} claims`} />
                <Stat label="Rejected" value={money(t.rejected_amount)} hint={`${t.rejected_count} claims`} tone={t.rejected_count ? 'red' : undefined} />
                <Stat label="Decision time" value={t.avg_turnaround_hours != null ? `${t.avg_turnaround_hours < 48 ? `${t.avg_turnaround_hours}h` : `${Math.round(t.avg_turnaround_hours / 24)}d`}` : '—'}
                  hint={t.auto_approved_count ? `${t.auto_approved_count} auto-approved` : 'Average, manual'} />
              </div>
            </Card>
          )}

          {summary && summary.totals.claims > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card padding={20}>
                <SectionTitle>By category</SectionTitle>
                <BarList rows={summary.by_category.map((c) => ({ label: CATEGORY_LABELS[c.category] ?? c.category, value: c.amount }))} format={(n) => money(n)} />
              </Card>
              <Card padding={20}>
                <SectionTitle>By month</SectionTitle>
                <BarList rows={summary.by_month.slice(-6).map((m) => ({ label: m.month, value: m.amount, sub: `${m.claims} claims` }))} format={(n) => money(n)} />
              </Card>
              <Card padding={20}>
                <SectionTitle>Top claimants</SectionTitle>
                <BarList rows={summary.top_people.slice(0, 6).map((p) => ({ label: p.name || 'Unknown', value: p.amount, sub: `${p.claims} claims` }))} format={(n) => money(n)} />
              </Card>
              {summary.by_policy.length > 1 && (
                <Card padding={20}>
                  <SectionTitle>By policy</SectionTitle>
                  <BarList rows={summary.by_policy.map((p) => ({ label: p.policy, value: p.amount, sub: `${p.claims} claims` }))} format={(n) => money(n)} />
                </Card>
              )}
            </div>
          )}

          <Card padding={0} style={{ overflow: 'hidden' }}>
            <DataTable<ExpenseClaim> columns={cols} rows={rows} loading={loading} empty="No claims match these filters." onRowClick={(c) => router.push(`/dashboard/expenses/${c.id}`)} />
            <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
          </Card>
        </>
      )}
    </ExpensesShell>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div style={{ fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>{children}</div>;
}
