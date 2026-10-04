'use client';
// Server-driven list page shared by Invoices and Quotes: status tabs, search, date range,
// sortable columns and a server pager. Every filter lives in the fetch effect's dependencies.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Segmented, T, useIsCompact } from '../ui';
import { Col, DataTable, FinancePage, Pager, SearchBox, StatusPill, Toolbar, errMsg, inr, useDebounced } from './ui';
import { DocRow, financeApi } from '../../lib/financeApi';
import { fmtDate } from '../../lib/financeFormat';

const LIMIT = 25;

const INVOICE_TABS = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' },
];
const QUOTE_TABS = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }, { value: 'expired', label: 'Expired' },
  { value: 'invoiced', label: 'Invoiced' },
];

// column key → server sort field
const INVOICE_SORT: Record<string, string> = { issue_date: 'issue_date', number: 'number', total: 'total', balance: 'balance', due_date: 'due_date' };
const QUOTE_SORT: Record<string, string> = { issue_date: 'issue_date', number: 'number', total: 'total' };

export default function DocumentList({ type }: { type: 'invoice' | 'quote' }) {
  const router = useRouter();
  const narrow = useIsCompact(900);
  const isInvoice = type === 'invoice';
  const noun = isInvoice ? 'Invoice' : 'Quote';
  const base = `/dashboard/finance/${type}s`;
  const tabs = isInvoice ? INVOICE_TABS : QUOTE_TABS;
  const sortable = isInvoice ? INVOICE_SORT : QUOTE_SORT;
  const api = isInvoice ? financeApi.invoices : financeApi.quotes;

  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'issue_date', dir: 'desc' });
  const dq = useDebounced(search.trim(), 300);

  // The page is tied to the filter set it was chosen under, so changing any filter lands on page 1
  // without firing a second request for the old page number.
  const filterKey = `${type}|${status}|${dq}|${from}|${to}|${sort.key}|${sort.dir}`;
  const [pageState, setPageState] = useState({ page: 1, key: filterKey });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ page: p, key: filterKey });

  const [rows, setRows] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    api.list({ status, q: dq, from, to, sort: sort.key, order: sort.dir, page, limit: LIMIT })
      .then((r) => {
        if (id !== reqId.current) return; // a newer request superseded this one
        setRows(r.data); setTotal(r.pagination?.total ?? r.data.length); setError(null);
      })
      .catch((e) => { if (id === reqId.current) { setError(errMsg(e, `Could not load ${noun.toLowerCase()}s`)); setRows([]); setTotal(0); } })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [api, noun, status, dq, from, to, sort.key, sort.dir, page, reload]);

  const onSort = (key: string) => {
    const field = sortable[key];
    if (!field) return;
    setSort((s) => (s.key === field ? { key: field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: field, dir: field === 'number' ? 'asc' : 'desc' }));
  };

  const columns = useMemo<Col<DocRow>[]>(() => {
    const cols: Col<DocRow>[] = [
      { key: 'issue_date', label: 'Date', sortable: true, render: (r) => fmtDate(r.issue_date) },
      { key: 'number', label: `${noun} #`, sortable: true, render: (r) => <span style={{ fontWeight: 600 }}>{r.number}</span> },
      ...(isInvoice ? [] : [{ key: 'reference_number', label: 'Reference', render: (r: DocRow) => r.reference_number || '—' } as Col<DocRow>]),
      { key: 'customer', label: 'Customer', nowrap: false, render: (r) => r.customer_snapshot?.name || '—' },
      { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.display_status || r.status} /> },
    ];
    if (isInvoice) cols.push({ key: 'due_date', label: 'Due date', sortable: true, render: (r) => fmtDate(r.due_date) });
    else cols.push({ key: 'expiry_date', label: 'Expiry date', render: (r) => fmtDate(r.expiry_date) });
    cols.push({ key: 'total', label: 'Amount', align: 'right', sortable: true, render: (r) => inr(r.total) });
    if (isInvoice) {
      cols.push({
        key: 'balance', label: 'Balance due', align: 'right', sortable: true,
        render: (r) => (r.status === 'void' ? '—' : <span style={{ color: r.display_status === 'overdue' ? T.red : undefined, fontWeight: r.balance > 0 ? 600 : 400 }}>{inr(r.balance)}</span>),
      });
    }
    return cols;
  }, [isInvoice, noun]);

  // DataTable passes column keys to onSort; the arrow shows on the active server sort field.
  const tableSort = { key: sort.key, dir: sort.dir };
  const filtered = status !== 'all' || !!dq || !!from || !!to;

  return (
    <FinancePage
      title={`${noun}s`}
      description={isInvoice ? 'Bill customers, track what is owed and record payments.' : 'Send estimates and convert accepted quotes into invoices.'}
      actions={<Button variant="primary" href={`${base}/new`}>＋ New</Button>}>
      <Toolbar>
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Segmented value={status} onChange={setStatus} options={tabs} />
        </div>
      </Toolbar>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder={`Search ${noun.toLowerCase()} #, reference or customer`} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="From" htmlFor="doc-from"><Input id="doc-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} /></Field>
          <Field label="To" htmlFor="doc-to"><Input id="doc-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} /></Field>
          {(from || to) && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</Button>}
        </div>
      </Toolbar>

      {error && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13.5, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}</span>
          <Button size="sm" onClick={() => setReload((n) => n + 1)}>Retry</Button>
        </div>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<DocRow>
          columns={columns} rows={rows} loading={loading} sort={tableSort} onSort={onSort}
          onRowClick={(r) => router.push(`${base}/${r.id}`)}
          empty={filtered
            ? `No ${noun.toLowerCase()}s match these filters.`
            : <span>No {noun.toLowerCase()}s yet. <a href={`${base}/new`} onClick={(e) => { e.preventDefault(); router.push(`${base}/new`); }} style={{ color: T.info }}>Create your first {noun.toLowerCase()}</a>.</span>} />
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </Card>
      {narrow && <div style={{ fontSize: 12, color: T.mute }}>Tip: scroll the table sideways to see all columns.</div>}
    </FinancePage>
  );
}
