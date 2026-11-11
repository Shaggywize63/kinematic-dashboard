'use client';
// Finance → Expenses & GST. One ledger of everything you spend GST on:
//   • business bills entered here (rent, cloud, vendors …)
//   • approved / reimbursed Field Expense claim lines that carry GST details (read live, read-only here)
// with the GST paid, the input tax credit you can claim, and net GST payable against sales.

import Link from 'next/link';
import { FormEvent, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { Badge, Button, Card, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../../../../components/ui';
import { Col, DataTable, FinancePage, Modal, Pager, SearchBox, Stat, Toolbar, fail, inr, useConfirm, useDebounced } from '../../../../components/finance/ui';
import { ReceiptField, type ReceiptValue } from '../../../../components/finance/ReceiptField';
import { ReceiptViewer, RECEIPT_MAX_BYTES, prepareReceipt } from '../../../../components/expenses/kit';
import { ErrorNote, RadioGroup, RupeeInput, GSTIN_RE, usePage, useRemote } from '../../../../components/finance/masterBits';
import { PRESET_LABELS, RangePreset, presetRange } from '../../../../components/finance/dateRanges';
import { fmtDate, num } from '../../../../lib/financeFormat';
import { GST_STATE_OPTIONS } from '../../../../lib/gstStates';
import { ExpenseBill, ExpenseInput, ExpenseRecord, financeApi } from '../../../../lib/financeApi';

const LIMIT = 25;
const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
const EXPENSE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'rent', label: 'Rent' }, { value: 'software', label: 'Software & cloud' }, { value: 'professional_fees', label: 'Professional fees' },
  { value: 'telecom', label: 'Phone & internet' }, { value: 'utilities', label: 'Utilities' }, { value: 'office', label: 'Office & supplies' },
  { value: 'marketing', label: 'Marketing & ads' }, { value: 'equipment', label: 'Equipment' }, { value: 'travel', label: 'Travel' },
  { value: 'lodging', label: 'Lodging' }, { value: 'fuel', label: 'Fuel' }, { value: 'toll', label: 'Toll' },
  { value: 'food', label: 'Food & beverages' }, { value: 'entertainment', label: 'Entertainment' }, { value: 'personal', label: 'Personal' },
  { value: 'misc', label: 'Miscellaneous' }, { value: 'other', label: 'Other' },
];
const catLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const todayIso = () => new Date().toISOString().slice(0, 10);
const GST_SLABS = [5, 12, 18, 28];
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function ExpensesPage() {
  const narrow = useIsCompact(900);
  const [preset, setPreset] = useState<RangePreset>('this_fy');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState('all');
  const [itc, setItc] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [editing, setEditing] = useState<ExpenseBill | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  const settings = useRemote(() => financeApi.settings.get(), []);
  const fyStart = settings.data?.data?.fiscal_year_start_month ?? 4;
  const businessStateCode = settings.data?.data?.state_code ?? null;
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset, fyStart)), [preset, custom, fyStart]);
  const { from, to } = range;
  const rangeOk = !!from && !!to && from <= to;
  const [page, setPage] = usePage(`${q}|${source}|${itc}|${from}|${to}`);

  const list = useRemote(
    () => (rangeOk ? financeApi.expenses.list({ from, to, source, itc, q, page, limit: LIMIT }) : Promise.resolve(null)),
    [from, to, source, itc, q, page, rangeOk],
  );
  const summary = useRemote(
    () => (rangeOk ? financeApi.reports.run('gst-expenses', { from, to }) : Promise.resolve(null)),
    [from, to, rangeOk],
  );
  const net = useRemote(
    () => (rangeOk ? financeApi.reports.run('net-gst-payable', { from, to }) : Promise.resolve(null)),
    [from, to, rangeOk],
  );
  const reloadAll = () => { list.reload(); summary.reload(); net.reload(); };

  const rows = list.data?.data ?? [];
  const totals = list.data?.totals;
  const pagination = list.data?.pagination;
  const sumRep = summary.data?.data;
  const netRep = net.data?.data;
  const netTotal = (netRep?.totals as { output?: number; input?: number; net?: number } | undefined) ?? {};

  const openBill = async (r: ExpenseRecord) => {
    if (r.source !== 'bill') return;
    try { setEditing((await financeApi.expenses.get(r.id)).data); } catch (e) { fail(e, 'Could not open this expense'); }
  };
  const remove = async (r: ExpenseRecord) => {
    if (!(await ask({ title: 'Delete expense?', message: `${r.vendor} · ${inr(r.total)} will be removed from your GST report.`, confirmLabel: 'Delete', danger: true }))) return;
    setBusyId(r.id);
    try { await financeApi.expenses.remove(r.id); toast.success('Expense deleted'); reloadAll(); } catch (e) { fail(e); } finally { setBusyId(null); }
  };
  const download = async (name: 'gst-expenses' | 'expense-gst-details') => {
    try { await financeApi.reports.csv(name, { from, to }); } catch (e) { fail(e, 'Could not download the report'); }
  };

  const columns: Col<ExpenseRecord>[] = [
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fmtDate(r.date) },
    { key: 'vendor', label: 'Vendor', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.vendor}
          {r.receipt_url && <span title="Receipt attached" aria-label="Receipt attached" data-testid="row-has-receipt" style={{ display: 'inline-flex', color: T.mute }}><Paperclip size={13} strokeWidth={1.8} /></span>}
        </div>
        <div style={{ fontSize: 12, color: T.mute }}>{r.vendor_gstin || 'No GSTIN'}{r.bill_number ? ` · ${r.bill_number}` : ''}</div>
      </div>
    ) },
    { key: 'category', label: 'Category', render: (r) => catLabel(r.category) },
    { key: 'source', label: 'Source', render: (r) => r.source === 'claim'
      ? <Link href={`/dashboard/expenses/${r.claim_id}`} style={{ color: T.info, fontWeight: 600, fontSize: 12.5 }}>Field claim{r.claimed_by ? ` · ${r.claimed_by}` : ''}</Link>
      : <Badge tone="neutral">Bill</Badge> },
    { key: 'tax', label: 'GST', align: 'right', render: (r) => (
      <span title={`Taxable ${inr(r.taxable_value)} · ${r.igst ? `IGST ${inr(r.igst)}` : `CGST ${inr(r.cgst)} + SGST ${inr(r.sgst)}`}`}>{inr(r.total_tax)} <span style={{ color: T.mute, fontSize: 11.5 }}>@{r.gst_rate}%</span></span>
    ) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => inr(r.total) },
    { key: 'itc', label: 'Input credit', render: (r) => r.itc_eligible
      ? <span style={{ color: T.ok, fontWeight: 600 }}>{inr(r.itc_total)}</span>
      : <span style={{ color: T.mute, fontSize: 12 }} title={r.itc_reason ?? undefined}>{r.total_tax > 0 ? 'Not claimable' : '—'}</span> },
    { key: 'actions', label: '', align: 'right', render: (r) => r.source === 'bill'
      ? <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => openBill(r)} disabled={busyId === r.id}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={busyId === r.id}>Delete</Button>
        </span>
      : null },
  ];

  return (
    <FinancePage title="Expenses & GST" description="Bills and approved field-expense claims, the GST you paid on them and the input credit you can claim."
      actions={<Button variant="primary" onClick={() => setEditing('new')}>+ New expense</Button>}>
      <Toolbar>
        <Select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} style={{ width: 190 }}>
          {PRESET_LABELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {preset === 'custom' && (<>
          <Input type="date" aria-label="From" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={{ width: 150 }} />
          <Input type="date" aria-label="To" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={{ width: 150 }} />
        </>)}
        {rangeOk && <span style={{ fontSize: 12.5, color: T.mute }}>{fmtDate(from)} – {fmtDate(to)}</span>}
      </Toolbar>
      {!rangeOk && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>Pick a valid date range.</div>}

      <Card padding={16}>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          <Stat label="Total spend" value={inr(totals?.spend ?? 0)} hint={`${totals?.count ?? 0} expenses`} />
          <Stat label="GST paid" value={inr(totals?.gst_paid ?? 0)} hint={`On ${inr(totals?.taxable ?? 0)} taxable`} tone="info" />
          <Stat label="Input credit (claimable)" value={inr(totals?.itc_claimable ?? 0)} tone="ok" hint="Needs a valid supplier GSTIN" />
          <Stat label="Not claimable" value={inr(totals?.itc_blocked ?? 0)} tone="warn" hint="Blocked or no GST invoice" />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '3fr 2fr', gap: 12, alignItems: 'start' }}>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 14.5, color: T.text }}>GST summary of expenses</div>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Button size="sm" onClick={() => download('gst-expenses')}>Download CSV</Button>
              <Button size="sm" variant="ghost" href={`/dashboard/finance/reports/gst-expenses`}>Full report</Button>
            </span>
          </div>
          {summary.error && <div style={{ padding: '0 16px 12px' }}><ErrorNote message={summary.error} onRetry={summary.reload} /></div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>{['Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'GST paid', 'Claimable'].map((h, i) => (
                <th key={h} style={{ padding: '8px 14px', textAlign: i ? 'right' : 'left', fontSize: 11.5, color: T.mute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>))}</tr></thead>
              <tbody>
                {(sumRep?.rows ?? []).map((r) => (
                  <tr key={String(r.gst_rate)}>
                    <td style={td(false)}>{String(r.gst_rate)}</td>
                    {(['taxable', 'cgst', 'sgst', 'igst', 'total_tax', 'itc_claimable'] as const).map((k) => <td key={k} style={td(true)}>{inr(r[k])}</td>)}
                  </tr>
                ))}
                {sumRep && sumRep.rows.length === 0 && <tr><td colSpan={7} style={{ ...td(false), color: T.mute }}>No GST-bearing expenses in this period.</td></tr>}
                {sumRep && sumRep.rows.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ ...td(false), borderTop: `1px solid ${T.border}` }}>Total</td>
                    {(['taxable', 'cgst', 'sgst', 'igst', 'total_tax', 'itc_claimable'] as const).map((k) => <td key={k} style={{ ...td(true), borderTop: `1px solid ${T.border}` }}>{inr(sumRep.totals?.[k])}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padding={16}>
          <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 14.5, color: T.text }}>Net GST payable</div>
          <div style={{ fontSize: 12.5, color: T.mute, marginTop: 2 }}>GST on sales − input credit on expenses</div>
          {net.error ? <div style={{ marginTop: 10 }}><ErrorNote message={net.error} onRetry={net.reload} /></div> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 12, fontSize: 13.5 }}>
              <Line label="GST collected on sales" value={inr(netTotal.output ?? 0)} />
              <Line label="Input credit on expenses" value={`− ${inr(netTotal.input ?? 0)}`} tone={T.ok} />
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <Line label={num(netTotal.net) < 0 ? 'Credit to carry forward' : 'Net payable'} value={inr(Math.abs(num(netTotal.net)))} strong tone={num(netTotal.net) < 0 ? T.ok : T.text} />
              </div>
              <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.45 }}>Head-wise difference for planning. Set-off follows GST rules (IGST credit first) — confirm with your CA before filing.</div>
              <Button size="sm" variant="ghost" href="/dashboard/finance/reports/net-gst-payable">Open by tax head →</Button>
            </div>
          )}
        </Card>
      </div>

      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search vendor, GSTIN, bill #" />
        <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} style={{ width: 190 }}>
          <option value="all">All sources</option><option value="bill">Business bills</option><option value="claim">Field expense claims</option>
        </Select>
        <Select aria-label="Input credit" value={itc} onChange={(e) => setItc(e.target.value)} style={{ width: 190 }}>
          <option value="all">Any credit status</option><option value="eligible">Claimable</option><option value="blocked">Not claimable</option>
        </Select>
        <Button size="sm" onClick={() => download('expense-gst-details')}>Export details (CSV)</Button>
      </Toolbar>
      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<ExpenseRecord> columns={columns} rows={rows} loading={list.loading}
          empty={<div style={{ padding: 28, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>No expenses in this period. Add a bill, or add GST details to a Field Expense claim line and get it approved.</div>} />
      </Card>
      {pagination && <Pager page={pagination.page} limit={pagination.limit} total={pagination.total} onPage={setPage} />}

      {editing && <ExpenseModal bill={editing === 'new' ? null : editing} businessState={businessStateCode} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadAll(); }} />}
      {dialog}
    </FinancePage>
  );
}

const td = (right: boolean): React.CSSProperties => ({ padding: '8px 14px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' });
function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: strong ? 700 : 500, color: tone ?? T.text }}><span style={{ color: strong ? tone ?? T.text : T.dim, fontWeight: strong ? 700 : 400 }}>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span></div>;
}

type ItcMode = 'auto' | 'yes' | 'no';

function ExpenseModal({ bill, businessState, onClose, onSaved }: { bill: ExpenseBill | null; businessState: string | null; onClose: () => void; onSaved: () => void }) {
  const narrow = useIsCompact(900);
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const [date, setDate] = useState(bill?.expense_date ?? todayIso());
  const [vendor, setVendor] = useState(bill?.vendor_name ?? '');
  const [gstin, setGstin] = useState(bill?.vendor_gstin ?? '');
  const [billNo, setBillNo] = useState(bill?.bill_number ?? '');
  const [category, setCategory] = useState(bill?.category ?? 'other');
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [incl, setIncl] = useState<'incl' | 'excl'>('incl');
  const [rate, setRate] = useState<number>(bill ? num(bill.gst_rate, 18) : 18);
  const [gstAmt, setGstAmt] = useState(bill ? String(Math.round((num(bill.cgst) + num(bill.sgst) + num(bill.igst)) * 100) / 100) : '');
  const [pos, setPos] = useState(bill?.place_of_supply ?? '');
  const [itc, setItc] = useState<ItcMode>(bill ? (bill.itc_eligible ? 'yes' : 'no') : 'auto');
  const [reason, setReason] = useState(bill && !bill.itc_eligible ? bill.itc_reason ?? '' : '');
  const [desc, setDesc] = useState(bill?.description ?? '');
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptValue | null>(bill?.receipt_url ? { url: bill.receipt_url, view: bill.receipt_signed_url ?? null, name: 'Receipt' } : null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const g = gstin.trim().toUpperCase();
  const supplierState = (/^\d{2}/.test(g) ? g.slice(0, 2) : pos) || null;
  const intra = !supplierState || !businessState || supplierState === businessState;
  const a = num(amount);
  const typed = gstAmt.trim() !== '' && Number.isFinite(Number(gstAmt));
  const tax = typed ? Math.min(num(gstAmt), incl === 'incl' ? a : 1e12) : incl === 'incl' ? a - a / (1 + rate / 100) : (a * rate) / 100;
  const taxable = incl === 'incl' ? a - tax : a;
  const rates = GST_RATES.includes(rate) ? GST_RATES : [...GST_RATES, rate].sort((x, y) => x - y);

  /** Store the file, then fill in only the boxes still empty from what was read off it. */
  const attach = async (file: File) => {
    setUploading(true);
    try {
      const ready = await prepareReceipt(file);
      if (ready.size > RECEIPT_MAX_BYTES) throw new Error('That file is larger than 10 MB');
      const { data: up } = await financeApi.expenses.uploadReceipt(ready, ready.name);
      setReceipt({ url: up.url, view: up.signed_url, name: ready.name });
      const sc = up.scan;
      const read: string[] = [];
      if (sc?.merchant && !vendor.trim()) { setVendor(sc.merchant); read.push(sc.merchant); }
      if (sc?.amount != null && amount.trim() === '') { setAmount(String(sc.amount)); setIncl('incl'); read.push(inr(sc.amount)); }
      if (sc?.txn_date && !bill && date === todayIso()) setDate(sc.txn_date);
      // A tax invoice names its seller's GSTIN and its own number: fill those too, only where still empty.
      if (sc?.supplier_gstin && !gstin.trim()) { setGstin(sc.supplier_gstin); read.push(sc.supplier_gstin); }
      if (sc?.invoice_number && !billNo.trim()) { setBillNo(sc.invoice_number); read.push(`Inv ${sc.invoice_number}`); }
      if (sc?.category && category === 'other' && EXPENSE_CATEGORIES.some((c) => c.value === sc.category)) setCategory(sc.category);
      if (sc?.tax_amount != null && sc.tax_amount > 0 && gstAmt.trim() === '') {
        setGstAmt(String(sc.tax_amount));
        const total = amount.trim() ? num(amount) : sc.amount ?? NaN;
        const guess = Number.isFinite(total) && total > sc.tax_amount ? GST_SLABS.find((r) => Math.abs(r - (sc.tax_amount! / (total - sc.tax_amount!)) * 100) <= 1.5) : undefined;
        const slab = sc.gst_rate != null && GST_SLABS.includes(sc.gst_rate) ? sc.gst_rate : guess;
        if (slab) setRate(slab);
      } else if (!bill && gstAmt.trim() === '' && sc?.amount != null && (sc.tax_amount === 0 || sc.gst_rate === 0)) {
        // The document says 0% / no tax (for example a foreign supplier): do not leave the default 18% on it.
        setRate(0);
        read.push('0% GST');
      }
      setScanNote(read.length ? `Read from the receipt: ${read.join(' · ')}. Check it looks right.` : null);
      toast.success(read.length ? 'Receipt attached and read' : 'Receipt attached');
    } catch (e) {
      toast.error(errMsg(e, 'Could not upload the receipt'));
    } finally { setUploading(false); }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (uploading) { toast.error('Wait for the receipt to finish uploading'); return; }
    const e: Record<string, string> = {};
    if (!vendor.trim()) e.vendor = 'Vendor is required';
    if (!date) e.date = 'Date is required';
    if (amount.trim() === '' || !Number.isFinite(Number(amount)) || Number(amount) <= 0) e.amount = 'Enter the amount on the bill';
    if (g && !GSTIN_RE.test(g)) e.gstin = 'Not a valid 15-character GSTIN';
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: ExpenseInput = {
      expense_date: date, vendor_name: vendor.trim(), vendor_gstin: g || null, bill_number: billNo.trim() || null, category,
      description: desc.trim() || null, place_of_supply: g ? null : pos || null, amount: num(amount), tax_inclusive: incl === 'incl',
      gst_rate: rate, gst_amount: typed ? num(gstAmt) : null,
      itc_eligible: itc === 'auto' ? null : itc === 'yes', itc_reason: itc === 'no' ? reason.trim() || null : null, notes: notes.trim() || null,
      receipt_url: receipt?.url ?? null,
    };
    setBusy(true);
    try {
      if (bill) await financeApi.expenses.update(bill.id, body); else await financeApi.expenses.create(body);
      toast.success(bill ? 'Expense updated' : 'Expense added');
      onSaved();
    } catch (err) { fail(err); setBusy(false); }
  };

  const canClaim = itc !== 'no' && /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g);
  return (
    <>
    <Modal title={bill ? 'Edit expense' : 'New expense'} onClose={() => { if (!busy && !viewing) onClose(); }} width={680}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form={fid('form')} disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form id={fid('form')} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Vendor" required htmlFor={fid('vendor')} error={errors.vendor}>
            <Input id={fid('vendor')} value={vendor} invalid={!!errors.vendor} autoFocus maxLength={200} autoComplete="off" onChange={(e) => setVendor(e.target.value)} />
          </Field>
          <Field label="Vendor GSTIN" htmlFor={fid('gstin')} error={errors.gstin} hint="Needed to claim input credit. The state is read from it.">
            <Input id={fid('gstin')} value={gstin} invalid={!!errors.gstin} maxLength={15} autoComplete="off" style={{ textTransform: 'uppercase' }} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Bill / invoice #" htmlFor={fid('bill')}>
            <Input id={fid('bill')} value={billNo} maxLength={60} autoComplete="off" onChange={(e) => setBillNo(e.target.value)} />
          </Field>
          <Field label="Date" required htmlFor={fid('date')} error={errors.date}>
            <Input id={fid('date')} type="date" value={date} invalid={!!errors.date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor={fid('cat')} hint={['food', 'entertainment', 'personal'].includes(category) ? 'Input credit is blocked for this category.' : undefined}>
            <Select id={fid('cat')} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          {!/^\d{2}/.test(g) && (
            <Field label="Supplier state" htmlFor={fid('pos')} hint="When there is no GSTIN. Decides CGST+SGST vs IGST.">
              <Select id={fid('pos')} value={pos} onChange={(e) => setPos(e.target.value)}>
                <option value="">Same state as my business</option>
                {GST_STATE_OPTIONS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </Select>
            </Field>
          )}
        </FormGrid>

        <FormGrid narrow={narrow}>
          <Field label="Amount on the bill" required htmlFor={fid('amt')} error={errors.amount}>
            <RupeeInput id={fid('amt')} value={amount} invalid={!!errors.amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <RadioGroup legend="This amount" value={incl} onChange={setIncl} options={[{ value: 'incl', label: 'includes GST' }, { value: 'excl', label: 'excludes GST' }]} />
          <Field label="GST rate" htmlFor={fid('rate')}>
            <Select id={fid('rate')} value={String(rate)} onChange={(e) => setRate(Number(e.target.value))}>
              {rates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </Field>
          <Field label="GST amount on the bill" htmlFor={fid('gst')} hint="Optional — type it if the bill's tax differs by a few paise.">
            <RupeeInput id={fid('gst')} value={gstAmt} placeholder="Auto" onChange={(e) => setGstAmt(e.target.value)} />
          </Field>
        </FormGrid>

        {a > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: T.radius.md, background: T.panel, fontSize: 13, color: T.dim, lineHeight: 1.5 }}>
            Taxable {inr(taxable)} · {intra ? `CGST ${inr(tax / 2)} + SGST ${inr(tax / 2)}` : `IGST ${inr(tax)}`} · Total {inr(taxable + tax)}
            {!businessState && <div style={{ color: T.warn }}>Set your state in Finance Settings so CGST/SGST vs IGST is exact.</div>}
          </div>
        )}

        <FormGrid narrow={narrow}>
          <Field label="Input tax credit" htmlFor={fid('itc')} hint="Automatic: claimable with a valid GSTIN unless the category is blocked.">
            <Select id={fid('itc')} value={itc} onChange={(e) => setItc(e.target.value as ItcMode)}>
              <option value="auto">Automatic</option><option value="yes">Claim credit</option><option value="no">Do not claim</option>
            </Select>
          </Field>
          {itc === 'no' && (
            <Field label="Why not" htmlFor={fid('why')}>
              <Input id={fid('why')} value={reason} maxLength={200} placeholder="e.g. client dinner" onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
        </FormGrid>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6 }}>Receipt</div>
          <ReceiptField value={receipt} uploading={uploading} onPick={attach} onView={setViewing}
            onClear={() => { setReceipt(null); setScanNote(null); }}
            hint={canClaim && !receipt ? 'Keep the tax invoice with the bill: you need it to claim input credit. Drop a photo or PDF, up to 10 MB.' : undefined} />
          {scanNote && <div data-testid="receipt-scan-note" style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>{scanNote}</div>}
          {bill && receipt && !receipt.view && <div style={{ fontSize: 12, color: T.mute, marginTop: 6 }}>The saved receipt cannot be previewed right now. Replace it to attach a new one.</div>}
        </div>
        <Field label="Description" htmlFor={fid('desc')}>
          <Input id={fid('desc')} value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor={fid('notes')}>
          <Textarea id={fid('notes')} value={notes} rows={2} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
    {viewing && <ReceiptViewer url={viewing} title="Receipt" onClose={() => setViewing(null)} />}
    </>
  );
}
