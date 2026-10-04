'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Input, Select, T } from '../../../../components/ui';
import { Col, DataTable, FinancePage, Pager, SearchBox, Toolbar, inr, useDebounced } from '../../../../components/finance/ui';
import { ErrorNote, PAYMENT_MODES, paymentModeLabel, usePage, useRemote } from '../../../../components/finance/masterBits';
import { fmtDate } from '../../../../lib/financeFormat';
import { PaymentRow, financeApi } from '../../../../lib/financeApi';

const LIMIT = 25;

export default function PaymentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = usePage(`${q}|${mode}|${from}|${to}`);

  const { data, loading, error, reload } = useRemote(
    () => financeApi.payments.list({ q, mode, from, to, page, limit: LIMIT }),
    [q, mode, from, to, page],
  );
  const rows = data?.data ?? [];
  const filtered = !!(q || from || to || mode !== 'all');
  const badRange = !!(from && to && from > to);

  const columns: Col<PaymentRow>[] = [
    { key: 'payment_date', label: 'Date', render: (r) => fmtDate(r.payment_date) },
    { key: 'payment_number', label: 'Payment #', render: (r) => <Link href={`/dashboard/finance/payments/${r.id}`} style={{ color: T.info, fontWeight: 600 }}>{r.payment_number}</Link> },
    { key: 'customer', label: 'Customer', render: (r) => r.customer?.display_name ?? '—' },
    { key: 'mode', label: 'Mode', render: (r) => paymentModeLabel(r.mode) },
    { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
    { key: 'unused', label: 'Unused', align: 'right', render: (r) => (r.unused_amount > 0 ? <span style={{ color: T.warn, fontWeight: 600 }}>{inr(r.unused_amount)}</span> : '') },
  ];

  return (
    <FinancePage title="Payments Received" description="Money received from customers and where it was applied."
      actions={<Button variant="primary" href="/dashboard/finance/payments/new">+ Record payment</Button>}>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search payment # or reference" />
        <Select aria-label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: 160 }}>
          <option value="all">All modes</option>
          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
          From <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
          To <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        </label>
        {(from || to) && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</Button>}
      </Toolbar>
      {badRange && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>The “From” date is after the “To” date, so nothing will match.</div>}
      {error && <ErrorNote message={error} onRetry={reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<PaymentRow> columns={columns} rows={rows} loading={loading}
          empty={filtered ? 'No payments match these filters.' : 'No payments recorded yet. Click “+ Record payment” to add one.'}
          onRowClick={(r) => router.push(`/dashboard/finance/payments/${r.id}`)} />
        <Pager page={page} limit={LIMIT} total={data?.pagination?.total ?? rows.length} onPage={setPage} />
      </Card>
    </FinancePage>
  );
}
