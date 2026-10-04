'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Eyebrow, Segmented, T, useIsCompact } from '../../../../../components/ui';
import { Col, DataTable, FinancePage, Pager, Stat, StatusPill, fail, inr, useConfirm } from '../../../../../components/finance/ui';
import {
  ErrorNote, gstTreatmentLabel, paymentModeLabel, paymentTermsLabel, usePage, useRemote,
} from '../../../../../components/finance/masterBits';
import { fmtDate } from '../../../../../lib/financeFormat';
import { stateLabel } from '../../../../../lib/gstStates';
import { Address, DocRow, FinanceCustomer, PaymentRow, financeApi } from '../../../../../lib/financeApi';

type Tab = 'overview' | 'invoices' | 'payments';
const LIMIT = 25;

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const narrow = useIsCompact(900);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [ask, dialog] = useConfirm();

  const { data, loading, error, reload } = useRemote(() => financeApi.customers.get(id), [id]);
  const c = data?.data;

  const toggleActive = async () => {
    if (!c || busy) return;
    setBusy(true);
    try {
      await financeApi.customers.update(c.id, { is_active: !c.is_active });
      toast.success(c.is_active ? 'Customer marked inactive' : 'Customer marked active');
      reload();
    } catch (e) { fail(e); }
    setBusy(false);
  };

  const remove = async () => {
    if (!c || busy) return;
    const ok = await ask({
      title: 'Delete customer?', danger: true, confirmLabel: 'Delete',
      message: `“${c.display_name}” will be deleted. Customers that already have invoices, quotes or payments cannot be deleted — mark them inactive instead.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await financeApi.customers.remove(c.id);
      toast.success('Customer deleted');
      router.push('/dashboard/finance/customers');
      return;
    } catch (e) { fail(e); }
    setBusy(false);
  };

  if (!c) {
    return (
      <FinancePage title="Customer" actions={<Button href="/dashboard/finance/customers">Back to customers</Button>}>
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !error && <div style={{ color: T.mute, fontSize: 14 }}>Loading…</div>}
      </FinancePage>
    );
  }

  const q = `customer_id=${encodeURIComponent(c.id)}`;
  return (
    <FinancePage
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{c.display_name}{c.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>}</span>}
      description={c.company_name && c.company_name !== c.display_name ? c.company_name : undefined}
      actions={
        <>
          <Button href={`/dashboard/finance/customers/${c.id}/edit`}>Edit</Button>
          <Button variant="primary" href={`/dashboard/finance/invoices/new?${q}`}>New Invoice</Button>
          <Button href={`/dashboard/finance/quotes/new?${q}`}>New Quote</Button>
          <Button href={`/dashboard/finance/payments/new?${q}`}>Record Payment</Button>
          <Button onClick={toggleActive} disabled={busy}>{c.is_active ? 'Mark inactive' : 'Mark active'}</Button>
          <Button variant="danger" onClick={remove} disabled={busy}>Delete</Button>
        </>
      }>
      {dialog}
      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
        <Stat label="Outstanding receivables" value={inr(c.outstanding)} />
        <Stat label="Overdue" value={inr(c.overdue)} tone={(c.overdue ?? 0) > 0 ? 'red' : undefined} />
        <Stat label="Total billed" value={inr(c.total_billed)} />
      </Card>

      <div style={{ overflowX: 'auto' }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' }, { value: 'invoices', label: 'Invoices' }, { value: 'payments', label: 'Payments' },
        ]} />
      </div>

      {tab === 'overview' && <Overview c={c} narrow={narrow} />}
      {tab === 'invoices' && <InvoicesTab customerId={c.id} />}
      {tab === 'payments' && <PaymentsTab customerId={c.id} />}
    </FinancePage>
  );
}

// ── overview ────────────────────────────────────────────────────────────────
function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 40%) 1fr', gap: 10, padding: '7px 0', fontSize: 13.5, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ color: T.mute }}>{label}</div>
      <div style={{ color: T.text, minWidth: 0, overflowWrap: 'anywhere' }}>{children || '—'}</div>
    </div>
  );
}

function AddressView({ a }: { a?: Address | null }) {
  const lines = [a?.attention, a?.line1, a?.line2, [a?.city, a?.state, a?.pincode].filter(Boolean).join(', '), a?.country, a?.phone ? `Phone: ${a.phone}` : '']
    .filter((x): x is string => !!x && !!x.trim());
  if (!lines.length) return <div style={{ color: T.mute, fontSize: 13.5 }}>No address added.</div>;
  return <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
}

function Overview({ c, narrow }: { c: FinanceCustomer; narrow: boolean }) {
  const person = [c.salutation, c.first_name, c.last_name].filter(Boolean).join(' ');
  const persons = c.contact_persons ?? [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card>
        <Eyebrow style={{ marginBottom: 8 }}>Contact</Eyebrow>
        <KV label="Customer type">{c.customer_type === 'individual' ? 'Individual' : 'Business'}</KV>
        <KV label="Primary contact">{person}</KV>
        <KV label="Company">{c.company_name}</KV>
        <KV label="Email">{c.email ? <a href={`mailto:${c.email}`} style={{ color: T.info }}>{c.email}</a> : null}</KV>
        <KV label="Work phone">{c.work_phone}</KV>
        <KV label="Mobile">{c.mobile}</KV>
        <KV label="Language">{c.language}</KV>
        <KV label="Currency">{c.currency || 'INR'}</KV>
      </Card>
      <Card>
        <Eyebrow style={{ marginBottom: 8 }}>Tax details</Eyebrow>
        <KV label="GST treatment">{gstTreatmentLabel(c.gst_treatment)}</KV>
        <KV label="GSTIN">{c.gstin}</KV>
        <KV label="Place of supply">{stateLabel(c.place_of_supply)}</KV>
        <KV label="PAN">{c.pan}</KV>
        <KV label="Tax preference">{c.tax_preference === 'exempt' ? 'Tax Exempt' : 'Taxable'}</KV>
        <KV label="Payment terms">{paymentTermsLabel(c.payment_terms_days)}</KV>
        <KV label="Portal">{c.portal_enabled ? 'Enabled' : 'Disabled'}</KV>
        <KV label="Created">{fmtDate(c.created_at)}</KV>
      </Card>
      <Card>
        <Eyebrow style={{ marginBottom: 10 }}>Billing address</Eyebrow>
        <AddressView a={c.billing_address} />
      </Card>
      <Card>
        <Eyebrow style={{ marginBottom: 10 }}>Shipping address</Eyebrow>
        <AddressView a={c.shipping_address} />
      </Card>
      <Card style={{ gridColumn: narrow ? undefined : '1 / -1' }} padding={0}>
        <div style={{ padding: '16px 20px 8px' }}><Eyebrow>Contact persons</Eyebrow></div>
        {persons.length === 0 ? <div style={{ padding: '0 20px 18px', color: T.mute, fontSize: 13.5 }}>No contact persons added.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>{['Name', 'Email', 'Work phone', 'Mobile', 'Designation'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 20px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {persons.map((p, i) => (
                  <tr key={i}>
                    {[[p.salutation, p.first_name, p.last_name].filter(Boolean).join(' '), p.email, p.work_phone, p.mobile, p.designation].map((v, j) => (
                      <td key={j} style={{ padding: '10px 20px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}` }}>{v || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card style={{ gridColumn: narrow ? undefined : '1 / -1' }}>
        <Eyebrow style={{ marginBottom: 8 }}>Remarks</Eyebrow>
        <div style={{ fontSize: 13.5, color: c.remarks ? T.text : T.mute, whiteSpace: 'pre-wrap' }}>{c.remarks || 'No remarks.'}</div>
      </Card>
    </div>
  );
}

// ── invoices tab ────────────────────────────────────────────────────────────
function InvoicesTab({ customerId }: { customerId: string }) {
  const [page, setPage] = usePage(customerId);
  const { data, loading, error, reload } = useRemote(
    () => financeApi.invoices.list({ customer_id: customerId, page, limit: LIMIT }),
    [customerId, page],
  );
  const rows = data?.data ?? [];
  const columns: Col<DocRow>[] = [
    { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
    { key: 'number', label: 'Invoice #', render: (r) => <Link href={`/dashboard/finance/invoices/${r.id}`} style={{ color: T.info, fontWeight: 600 }}>{r.number}</Link> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.display_status} /> },
    { key: 'due_date', label: 'Due date', render: (r) => fmtDate(r.due_date) },
    { key: 'total', label: 'Amount', align: 'right', render: (r) => inr(r.total) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => inr(r.balance) },
  ];
  return (
    <>
      {error && <ErrorNote message={error} onRetry={reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<DocRow> columns={columns} rows={rows} loading={loading} empty="No invoices for this customer yet." />
        <Pager page={page} limit={LIMIT} total={data?.pagination?.total ?? rows.length} onPage={setPage} />
      </Card>
    </>
  );
}

// ── payments tab ────────────────────────────────────────────────────────────
function PaymentsTab({ customerId }: { customerId: string }) {
  const [page, setPage] = usePage(customerId);
  const { data, loading, error, reload } = useRemote(
    () => financeApi.payments.list({ customer_id: customerId, page, limit: LIMIT }),
    [customerId, page],
  );
  const rows = data?.data ?? [];
  const columns: Col<PaymentRow>[] = [
    { key: 'payment_date', label: 'Date', render: (r) => fmtDate(r.payment_date) },
    { key: 'payment_number', label: 'Payment #', render: (r) => <Link href={`/dashboard/finance/payments/${r.id}`} style={{ color: T.info, fontWeight: 600 }}>{r.payment_number}</Link> },
    { key: 'mode', label: 'Mode', render: (r) => paymentModeLabel(r.mode) },
    { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
    { key: 'unused', label: 'Unused', align: 'right', render: (r) => (r.unused_amount > 0 ? inr(r.unused_amount) : '') },
  ];
  return (
    <>
      {error && <ErrorNote message={error} onRetry={reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<PaymentRow> columns={columns} rows={rows} loading={loading} empty="No payments received from this customer yet." />
        <Pager page={page} limit={LIMIT} total={data?.pagination?.total ?? rows.length} onPage={setPage} />
      </Card>
    </>
  );
}
