'use client';
import { FormEvent, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../../../../../components/ui';
import { CustomerPicker, FinancePage, fail, inr } from '../../../../../components/finance/ui';
import { ErrorNote, PAYMENT_MODES, RupeeInput, round2, useRemote } from '../../../../../components/finance/masterBits';
import { AllocationTable, EPS, allocationError, autoAllocate, sumAllocations } from '../../../../../components/finance/AllocationTable';
import { num, todayIso } from '../../../../../lib/financeFormat';
import { OpenInvoice, PaymentMode, financeApi } from '../../../../../lib/financeApi';

export default function NewPaymentPage() {
  return <Suspense fallback={null}><NewPayment /></Suspense>;
}

function NewPayment() {
  const router = useRouter();
  const sp = useSearchParams();
  const narrow = useIsCompact(900);
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const customerParam = sp?.get('customer_id') ?? '';
  const invoiceParam = sp?.get('invoice_id') ?? '';

  const [customerId, setCustomerId] = useState<string | null>(customerParam || null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<PaymentMode>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const prefilled = useRef(!invoiceParam);

  // ?invoice_id= without ?customer_id= — resolve the customer from the invoice.
  useEffect(() => {
    if (customerParam || !invoiceParam) return;
    let off = false;
    financeApi.invoices.get(invoiceParam).then((r) => { if (!off) setCustomerId(r.data.customer_id); }).catch((e) => { if (!off) fail(e); });
    return () => { off = true; };
  }, [customerParam, invoiceParam]);

  const open = useRemote(
    () => (customerId ? financeApi.customers.openInvoices(customerId) : Promise.resolve(null)),
    [customerId],
  );
  const invoices: OpenInvoice[] = useMemo(
    () => (open.data?.data ?? []).filter((i) => i.customer_id === customerId),
    [open.data, customerId],
  );

  // Prefill from ?invoice_id= once that customer's open invoices are in.
  useEffect(() => {
    if (prefilled.current || !invoices.length) return;
    const inv = invoices.find((i) => i.id === invoiceParam);
    if (!inv) return;
    prefilled.current = true;
    setAmount((prev) => (prev.trim() ? prev : String(inv.balance)));
    setAlloc({ [inv.id]: String(inv.balance) });
  }, [invoices, invoiceParam]);

  const amt = num(amount);
  const applied = sumAllocations(alloc);
  const unused = round2(amt - applied);
  const over = applied > amt + EPS;

  const errors = {
    customer: !customerId ? 'Select a customer' : '',
    amount: !(amt > 0) ? 'Enter the amount received (greater than 0)' : '',
    date: !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Select the payment date' : '',
    applied: over ? `Applied amount (${inr(applied)}) exceeds the amount received (${inr(amt)})` : '',
    rows: invoices.some((i) => allocationError(i, alloc[i.id])),
  };
  const hasErrors = !!(errors.customer || errors.amount || errors.date || errors.applied || errors.rows);

  const setRow = (id: string, v: string) => setAlloc((a) => ({ ...a, [id]: v }));
  const payFull = (inv: OpenInvoice) => {
    const others = round2(applied - Math.max(0, num(alloc[inv.id])));
    if (!(amt > 0)) { // nothing entered yet: the amount received follows the invoice
      setAmount(String(round2(others + inv.balance)));
      setRow(inv.id, String(inv.balance));
      return;
    }
    const remaining = round2(amt - others);
    if (remaining <= EPS) { toast.info('The amount received is already fully applied. Increase it to apply more.'); return; }
    setRow(inv.id, String(round2(Math.min(inv.balance, remaining))));
  };
  const auto = () => {
    if (!(amt > 0)) { toast.info('Enter the amount received first.'); return; }
    setAlloc(autoAllocate(invoices, amt));
  };
  const clearAlloc = () => setAlloc({});

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setSubmitted(true);
    if (hasErrors) { toast.error('Please fix the highlighted fields'); return; }
    const allocations = invoices
      .map((i) => ({ document_id: i.id, amount: round2(Math.max(0, num(alloc[i.id]))) }))
      .filter((a) => a.amount > 0);
    setBusy(true);
    try {
      const r = await financeApi.payments.create({
        customer_id: customerId as string, amount: round2(amt), payment_date: date, mode, reference: reference.trim(), notes: notes.trim(),
        ...(allocations.length ? { allocations } : {}),
      });
      toast.success(`Payment ${r.data.payment_number} recorded`);
      router.push(`/dashboard/finance/payments/${r.data.id}`);
    } catch (e) { fail(e); setBusy(false); }
  };

  return (
    <FinancePage title="Record Payment" description="Record money received and apply it to open invoices." maxWidth={960}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <FormGrid narrow={narrow}>
            <Field label="Customer" required error={submitted ? errors.customer : ''}>
              <CustomerPicker value={customerId} invalid={submitted && !!errors.customer}
                onChange={(c) => { setCustomerId(c?.id ?? null); setAlloc({}); prefilled.current = true; }} />
            </Field>
            <Field label="Amount Received" required htmlFor={fid('amt')} error={submitted ? errors.amount : ''}>
              <RupeeInput id={fid('amt')} value={amount} placeholder="0.00" invalid={submitted && !!errors.amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Payment Date" required htmlFor={fid('date')} error={submitted ? errors.date : ''}>
              <Input id={fid('date')} type="date" value={date} invalid={submitted && !!errors.date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Payment Mode" htmlFor={fid('mode')}>
              <Select id={fid('mode')} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Reference #" htmlFor={fid('ref')} hint="Cheque number, UTR / transaction id, etc.">
              <Input id={fid('ref')} value={reference} maxLength={120} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor={fid('notes')}>
              <Textarea id={fid('notes')} value={notes} rows={2} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormGrid>
        </Card>

        {customerId && (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15, color: T.text }}>Apply to invoices</div>
                <div style={{ fontSize: 12.5, color: T.mute }}>Unpaid invoices of this customer, oldest first.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={auto} disabled={!invoices.length}>Apply automatically (oldest first)</Button>
                <Button variant="ghost" onClick={clearAlloc} disabled={!applied}>Clear</Button>
              </div>
            </div>
            {open.error && <div style={{ padding: 12 }}><ErrorNote message={open.error} onRetry={open.reload} /></div>}
            {open.loading && !invoices.length
              ? <div style={{ padding: 24, color: T.mute, fontSize: 13.5 }}>Loading open invoices…</div>
              : invoices.length === 0
                ? <div style={{ padding: 24, color: T.mute, fontSize: 13.5 }}>This customer has no unpaid invoices. The full amount will be kept as customer credit.</div>
                : <AllocationTable invoices={invoices} values={alloc} onChange={setRow} onPayFull={payFull} disabled={busy} />}
          </Card>
        )}

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Totals label="Amount received" value={inr(amt)} />
          <Totals label="Applied to invoices" value={inr(applied)} />
          <Totals label="Unused / advance" value={inr(Math.max(0, unused))} strong tone={unused > EPS ? 'warn' : undefined} />
          {errors.applied && <div role="alert" style={{ fontSize: 13, color: T.red }}>{errors.applied}</div>}
          {!errors.applied && unused > EPS && amt > 0 && (
            <div style={{ fontSize: 13, color: T.warn }}>
              {inr(unused)} will be kept as customer credit (an advance). You can apply it to invoices later from the payment’s page.
            </div>
          )}
        </Card>

        <div style={{ position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', gap: 10, padding: '12px 0', background: T.canvas, borderTop: `1px solid ${T.border}` }}>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</Button>
          <Button onClick={() => router.push('/dashboard/finance/payments')} disabled={busy}>Cancel</Button>
        </div>
      </form>
    </FinancePage>
  );
}

function Totals({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'warn' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: strong ? 15 : 13.5, fontWeight: strong ? 700 : 500, color: tone ? T.warn : T.text, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: tone ? T.warn : T.dim }}>{label}</span><span>{value}</span>
    </div>
  );
}
