'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, Select, T } from '../../../../components/ui';
import { DataTable, Col, FinancePage, Pager, SearchBox, Toolbar, inr, useDebounced } from '../../../../components/finance/ui';
import { ErrorNote, gstTreatmentLabel, usePage, useRemote } from '../../../../components/finance/masterBits';
import { FinanceCustomer, financeApi } from '../../../../lib/financeApi';

const LIMIT = 25;
type Row = FinanceCustomer & { outstanding: number };

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = usePage(`${q}|${status}`);

  const { data, loading, error, reload } = useRemote(
    () => financeApi.customers.list({ q, status, page, limit: LIMIT }),
    [q, status, page],
  );
  const rows = data?.data ?? [];
  const total = data?.pagination?.total ?? rows.length;

  const columns: Col<Row>[] = [
    {
      key: 'name', label: 'Name', render: (c) => (
        <div>
          <Link href={`/dashboard/finance/customers/${c.id}`} style={{ color: T.text, fontWeight: 600 }}>{c.display_name}</Link>
          {c.company_name && c.company_name !== c.display_name && <div style={{ fontSize: 12, color: T.mute }}>{c.company_name}</div>}
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (c) => c.email || '—' },
    { key: 'phone', label: 'Phone', render: (c) => c.mobile || c.work_phone || '—' },
    { key: 'gst', label: 'GST Treatment', render: (c) => gstTreatmentLabel(c.gst_treatment) },
    { key: 'status', label: 'Status', render: (c) => (c.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>) },
    { key: 'outstanding', label: 'Receivables', align: 'right', render: (c) => inr(c.outstanding) },
  ];

  return (
    <FinancePage title="Customers" description="People and businesses you invoice."
      actions={<Button variant="primary" href="/dashboard/finance/customers/new">+ New</Button>}>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, company, email, phone, GSTIN" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ width: 150 }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Toolbar>
      {error && <ErrorNote message={error} onRetry={reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<Row> columns={columns} rows={rows} loading={loading}
          empty={q || status !== 'all' ? 'No customers match these filters.' : 'No customers yet. Click “+ New” to add your first customer.'}
          onRowClick={(c) => router.push(`/dashboard/finance/customers/${c.id}`)} />
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </Card>
    </FinancePage>
  );
}
