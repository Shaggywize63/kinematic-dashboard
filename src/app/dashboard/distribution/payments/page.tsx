'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';
import { useClient } from '../../../../context/ClientContext';
import { useDistributionNames, shortId } from '../../../../lib/useDistributionNames';

const MODES = ['', 'cash', 'upi', 'cheque', 'credit_adjustment'];

/** One `applied_to_invoices` entry: which invoice a slice of the payment was set against. */
interface Allocation { invoice_id?: string; invoice_no?: string | null; amount?: number | string }
const MAX_LINES = 3;

const allocationsOf = (p: any): Allocation[] => (Array.isArray(p?.applied_to_invoices) ? p.applied_to_invoices.filter(Boolean) : []);
/** Rows written before invoice numbers were stored carry only the invoice id. */
const invoiceLabel = (a: Allocation) => a.invoice_no || (a.invoice_id ? `#${a.invoice_id.slice(0, 8)}` : 'Invoice');

/** Read-only: which invoices this payment was applied to (number + amount), and any part left on account. */
function Allocations({ payment }: { payment: any }) {
  const apps = allocationsOf(payment);
  if (!apps.length) return <span style={{ color: 'var(--text-dim)' }}>—</span>;
  const allocated = apps.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const onAccount = Number(payment.amount) - allocated;
  const full = apps.map((a) => `${invoiceLabel(a)} ${inr(Number(a.amount) || 0)}`).join('\n');
  return (
    <div title={full} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      {apps.slice(0, MAX_LINES).map((a, i) => (
        <div key={`${a.invoice_id || a.invoice_no || 'inv'}-${i}`} data-testid="allocation">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{invoiceLabel(a)}</span>
          <span style={{ color: 'var(--text-dim)' }}> · </span>
          <span style={{ fontWeight: 600 }}>{inr(Number(a.amount) || 0)}</span>
        </div>
      ))}
      {apps.length > MAX_LINES && <div style={{ color: 'var(--text-dim)' }}>+{apps.length - MAX_LINES} more</div>}
      {onAccount > 0.5 && <div style={{ color: 'var(--text-dim)' }}>On account {inr(onAccount)}</div>}
    </div>
  );
}

export default function PaymentsPage() {
  const { selectedClientId } = useClient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  // The list returns outlet_id / salesman_id only — resolve them to names.
  const names = useDistributionNames({ salesmen: true, outlets: true });
  const { outletName, salesmanName } = names;
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setErr('');
    const params: Record<string, string> = {};
    if (mode) params.mode = mode;
    if (status) params.status = status;
    try {
      const r: any = await api.getDistPayments(params);
      if (id !== reqId.current) return;
      const rows = r?.data || r || [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setItems([]);
      setErr(e?.message || 'Failed to load payments');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [mode, status]);
  useEffect(() => { load(); }, [load, selectedClientId]);

  const outletLabel = useCallback((p: any) => outletName(p.outlet_id) || shortId(p.outlet_id), [outletName]);
  const collectorLabel = useCallback((p: any) => salesmanName(p.salesman_id) || shortId(p.salesman_id), [salesmanName]);

  // Type-aware, client-side column sorting for the payment list (names sort by what the cell shows).
  const paymentVal = useCallback((p: any, key: string): unknown => {
    switch (key) {
      case 'payment_no': return p.payment_no;
      case 'outlet': return outletLabel(p);
      case 'collected_by': return collectorLabel(p);
      case 'mode': return p.mode;
      case 'reference': return p.reference;
      case 'received': return p.received_at;
      case 'status': return p.status;
      case 'amount': return Number(p.amount);
      default: return p[key];
    }
  }, [outletLabel, collectorLabel]);
  const { sorted, sort, toggle } = useTableSort<any>(items, paymentVal, { key: 'received', dir: 'desc' });
  const { pageItems: pagedPayments, bar } = usePagination(sorted);

  return (
    <div>
      <PageHeader title="Payments" subtitle="Cash, UPI, cheque (image-required), credit adjustment" />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Filter by mode" style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
            {MODES.map((m) => <option key={m} value={m}>{m || 'All modes'}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
            <option value="">All status</option><option value="pending">pending</option><option value="cleared">cleared</option><option value="bounced">bounced</option><option value="cancelled">cancelled</option>
          </select>
        </div>
      </Card>

      {err && <div role="alert" style={{ marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>{err}</div>}

      <Card>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead><tr>
            <Th><SortLabel label="Payment #" sortKey="payment_no" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Outlet" sortKey="outlet" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Collected by" sortKey="collected_by" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Mode" sortKey="mode" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Reference" sortKey="reference" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Received" sortKey="received" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th>Applied to invoices</Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Amount" sortKey="amount" sort={sort} onToggle={toggle} align="right" /></Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              pagedPayments.map((p) => (
                <tr key={p.id}>
                  <Td style={{ fontWeight: 700 }}>{p.payment_no}</Td>
                  <Td><a href={`/dashboard/distribution/ledger?outlet_id=${p.outlet_id}`} title={p.outlet_id} style={{ color: 'var(--primary)' }}>{outletLabel(p)}</a></Td>
                  <Td><span title={p.salesman_id}>{collectorLabel(p)}</span></Td>
                  <Td><Pill color={p.mode === 'cheque' ? 'amber' : p.mode === 'upi' ? 'blue' : 'gray'}>{p.mode}</Pill></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{p.reference || (p.cheque_image_url ? 'cheque img' : '—')}</Td>
                  <Td>{fmtDate(p.received_at)}</Td>
                  <Td><Pill color={statusColor(p.status)}>{p.status}</Pill></Td>
                  <Td><Allocations payment={p} /></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(p.amount)}</Td>
                </tr>
              ))}
            {!loading && !items.length && !err && <tr><Td colSpan={9 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No payments match.</Td></tr>}
          </tbody>
        </table>
        </div>
      </Card>
      {bar}
    </div>
  );
}
