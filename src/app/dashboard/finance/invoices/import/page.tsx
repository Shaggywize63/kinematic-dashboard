'use client';
// Import previously issued invoices (e.g. a Zoho Invoice export) from a CSV or XLSX file.
// Three steps: choose a file → review what will happen (nothing is written yet) → result.
// The file is posted for the preview and again for the import; the server re-validates both times.

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Segmented, T, useIsCompact } from '../../../../../components/ui';
import { Col, DataTable, FinancePage, Stat, StatusPill, errMsg, inr } from '../../../../../components/finance/ui';
import { financeApi, type ImportOptions, type ImportPreview, type ImportPreviewInvoice, type ImportResult } from '../../../../../lib/financeApi';
import { downloadBlob, fmtDate } from '../../../../../lib/financeFormat';

const MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_OPTIONS: ImportOptions = { create_customers: true, allow_total_mismatch: false, advance_numbering: true };

const TEMPLATE_CSV = [
  'Invoice Number,Invoice Date,Due Date,Invoice Status,Customer Name,Customer Email,GST Identification Number (GSTIN),Place of Supply,Item Name,Item Desc,HSN/SAC,Quantity,Item Price,Discount %,Item Tax %,Balance,Notes',
  'INV-000001,10/08/2026,25/08/2026,Paid,Example Customer Pvt Ltd,accounts@example.com,27AAACB1234C1Z9,MH,Platform seat,Annual subscription,998314,2,15000,0,18,0,Thank you',
  'INV-000001,10/08/2026,25/08/2026,Paid,Example Customer Pvt Ltd,accounts@example.com,27AAACB1234C1Z9,MH,Onboarding,One-time,999293,1,5000,10,18,0,',
  'INV-000002,02/09/2026,17/09/2026,Sent,Another Customer,billing@another.example,,KA,Support plan,,998313,1,10000,0,18,10000,',
].join('\n');

type Step = 'choose' | 'review' | 'done';
type Filter = 'all' | 'import' | 'skip_duplicate' | 'error';

export default function ImportInvoicesPage() {
  const narrow = useIsCompact(900);
  const [step, setStep] = useState<Step>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Preview whenever the file or an option changes; ignore answers that arrive out of order.
  useEffect(() => {
    if (!file) return;
    const id = ++reqId.current;
    setLoading(true); setError(null);
    financeApi.importInvoices.preview(file, options)
      .then((r) => { if (id === reqId.current) { setPreview(r.data); setStep('review'); } })
      .catch((e) => { if (id === reqId.current) { setError(errMsg(e, 'Could not read that file')); setPreview(null); setStep('choose'); } })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [file, options]);

  const pick = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) { setError('Choose a .csv or .xlsx file. In Zoho Invoice use Export → CSV.'); return; }
    if (f.size > MAX_BYTES) { setError('That file is larger than 5 MB. Split it into parts and import them one at a time.'); return; }
    setError(null); setFile(f);
  }, []);

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); };

  const reset = () => { reqId.current++; setFile(null); setPreview(null); setResult(null); setError(null); setStep('choose'); setOptions(DEFAULT_OPTIONS); setFilter('all'); if (inputRef.current) inputRef.current.value = ''; };

  const commit = async () => {
    if (!file || !preview) return;
    setCommitting(true);
    try {
      const r = await financeApi.importInvoices.commit(file, options);
      setResult(r.data); setStep('done');
      toast.success(`Imported ${r.data.imported} invoice${r.data.imported === 1 ? '' : 's'}`);
    } catch (e) { toast.error(errMsg(e, 'Import failed')); }
    finally { setCommitting(false); }
  };

  const shown = useMemo(() => (preview?.invoices ?? []).filter((i) => filter === 'all' || i.action === filter), [preview, filter]);

  const columns: Col<ImportPreviewInvoice & { id: string }>[] = [
    { key: 'number', label: 'Invoice #', render: (r) => <b>{r.number}</b> },
    { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
    { key: 'customer', label: 'Customer', render: (r) => <span>{r.customer || '—'} {r.customer_action === 'create' && <Badge tone="info" style={{ marginLeft: 6 }}>new</Badge>}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
    { key: 'total', label: 'Total', align: 'right', render: (r) => inr(r.total) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => (r.status === 'void' || r.status === 'draft' ? '—' : inr(r.balance)) },
    { key: 'action', label: 'Result', nowrap: false, render: (r) => (
      <div style={{ minWidth: 190 }}>
        {r.action === 'import' && <Badge tone="ok" dot>Will import</Badge>}
        {r.action === 'skip_duplicate' && <Badge tone="neutral" dot>Already exists, skipped</Badge>}
        {r.action === 'error' && <Badge tone="red" dot>Needs fixing</Badge>}
        {r.problems.map((p, i) => <div key={`p${i}`} style={{ fontSize: 12, color: T.red, marginTop: 4, lineHeight: 1.4 }}>{p}</div>)}
        {r.warnings.map((w, i) => <div key={`w${i}`} style={{ fontSize: 12, color: T.warn, marginTop: 4, lineHeight: 1.4 }}>{w}</div>)}
      </div>
    ) },
  ];

  const stepper = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }} aria-label="Progress">
      {([['choose', '1  Choose file'], ['review', '2  Review'], ['done', '3  Done']] as const).map(([k, label]) => (
        <span key={k} aria-current={step === k ? 'step' : undefined}
          style={{ padding: '4px 12px', borderRadius: 999, background: step === k ? T.redWash : 'transparent', color: step === k ? T.red : T.mute, fontWeight: step === k ? 600 : 500, border: `1px solid ${step === k ? 'transparent' : T.border}` }}>{label}</span>
      ))}
    </div>
  );

  const backLink = <Button href="/dashboard/finance/invoices" variant="ghost">← Invoices</Button>;

  // ── step 3
  if (step === 'done' && result) {
    return (
      <FinancePage title="Import complete" actions={backLink} maxWidth={900}>
        {stepper}
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 20 }}>
            <Stat label="Imported" value={result.imported} tone={result.imported ? 'ok' : undefined} />
            <Stat label="Already existed" value={result.skipped_duplicates} hint="skipped" />
            <Stat label="Customers created" value={result.customers_created} />
            <Stat label="Failed" value={result.failed.length} tone={result.failed.length ? 'red' : undefined} />
          </div>
          <ul style={{ margin: '18px 0 0', paddingLeft: 18, fontSize: 13.5, color: T.dim, lineHeight: 1.7 }}>
            {result.payments_created > 0 && <li>{result.payments_created} payment{result.payments_created === 1 ? '' : 's'} recorded as <b>Imported</b> so each invoice shows the right balance. The original payment dates were not in the file, so the invoice dates were used.</li>}
            {result.next_invoice_number && <li>New invoices will continue from number <b>{result.next_invoice_number}</b>.</li>}
            {result.imported === 0 && result.failed.length === 0 && <li>Nothing new to import: every invoice in the file already exists.</li>}
          </ul>
          {result.failed.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.red, marginBottom: 6 }}>These invoices were not imported</div>
              {result.failed.map((f) => <div key={f.number} style={{ fontSize: 13, color: T.dim, padding: '4px 0', borderTop: `1px solid ${T.border}` }}><b style={{ color: T.text }}>{f.number}</b>: {f.reason}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
            <Button variant="primary" href="/dashboard/finance/invoices">View invoices</Button>
            <Button onClick={reset}>Import another file</Button>
          </div>
        </Card>
      </FinancePage>
    );
  }

  // ── step 2
  if (step === 'review' && preview) {
    const sm = preview.summary;
    const rows = shown.map((i) => ({ ...i, id: i.number }));
    return (
      <FinancePage title="Review before importing" description={<span>{preview.file.name} · {preview.file.rows} rows · nothing has been imported yet</span>} actions={backLink}>
        {stepper}
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 20 }}>
            <Stat label="Invoices in file" value={sm.invoices} />
            <Stat label="Ready to import" value={sm.importable} tone={sm.importable ? 'ok' : undefined} hint={sm.importable ? `${inr(sm.total_value)} billed` : undefined} />
            <Stat label="Already exist" value={sm.duplicates} hint="will be skipped" />
            <Stat label="Need fixing" value={sm.errors} tone={sm.errors ? 'red' : undefined} hint={sm.errors ? 'will not be imported' : undefined} />
            <Stat label="New customers" value={sm.new_customers} hint={sm.importable ? `${inr(sm.outstanding)} outstanding` : undefined} />
          </div>
          {preview.file.rows_without_number > 0 && <div role="status" style={{ marginTop: 14, fontSize: 13, color: T.warn }}>{preview.file.rows_without_number} row(s) have no invoice number and were ignored.</div>}
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>Options</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Check id="opt-cust" checked={options.create_customers} onChange={(v) => setOptions({ ...options, create_customers: v })}
              label="Create customers that don't exist yet" hint="Matched by GSTIN or name. If off, invoices for unknown customers are not imported." />
            <Check id="opt-num" checked={options.advance_numbering} onChange={(v) => setOptions({ ...options, advance_numbering: v })}
              label="Continue invoice numbering after the imported numbers" hint="So your next new invoice does not reuse a number you already issued." />
            <Check id="opt-mismatch" checked={options.allow_total_mismatch} onChange={(v) => setOptions({ ...options, allow_total_mismatch: v })}
              label="Import invoices even if the total differs from the file" hint="By default these are held back. If allowed they are imported with the total calculated from the lines and tax %." />
          </div>
          {loading && <div role="status" style={{ marginTop: 12, fontSize: 12.5, color: T.mute }}>Updating preview…</div>}
        </Card>

        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Segmented<Filter> value={filter} onChange={setFilter} options={[
                { value: 'all', label: `All (${preview.invoices.length})` },
                { value: 'import', label: `Ready (${preview.invoices.filter((i) => i.action === 'import').length})` },
                { value: 'skip_duplicate', label: `Skipped (${preview.invoices.filter((i) => i.action === 'skip_duplicate').length})` },
                { value: 'error', label: `Need fixing (${preview.invoices.filter((i) => i.action === 'error').length})` },
              ]} />
            </div>
          </div>
          <DataTable columns={columns} rows={rows} loading={loading && !rows.length} empty="No invoices in this view." />
          {preview.truncated && <div style={{ padding: '10px 14px', fontSize: 12.5, color: T.mute }}>Showing the first {preview.invoices.length} of {sm.invoices} invoices. All of them are imported.</div>}
        </Card>

        <details style={{ fontSize: 13, color: T.dim }}>
          <summary style={{ cursor: 'pointer' }}>Columns we recognised ({preview.columns.detected.length})</summary>
          <div style={{ marginTop: 8, lineHeight: 1.7 }}>
            {preview.columns.detected.map((c) => <span key={c.field} style={{ display: 'inline-block', marginRight: 14 }}><b style={{ color: T.text }}>{c.label}</b> ← {c.header}</span>)}
            {preview.columns.ignored.length > 0 && <div style={{ marginTop: 6 }}>Ignored: {preview.columns.ignored.join(', ')}</div>}
          </div>
        </details>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '12px 0', background: T.canvas }}>
          <Button variant="primary" onClick={commit} disabled={committing || loading || sm.importable === 0}>
            {committing ? 'Importing…' : sm.importable === 0 ? 'Nothing to import' : `Import ${sm.importable} invoice${sm.importable === 1 ? '' : 's'}`}
          </Button>
          <Button onClick={reset} disabled={committing}>Choose a different file</Button>
        </div>
      </FinancePage>
    );
  }

  // ── step 1
  return (
    <FinancePage title="Import invoices" description="Bring in invoices you issued before using Kinematic, for example an export from Zoho Invoice." actions={backLink} maxWidth={900}>
      {stepper}
      <Card>
        <label
          htmlFor="import-file"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', textAlign: 'center', cursor: 'pointer', borderRadius: T.radius.md,
            border: `2px dashed ${dragging ? T.red : T.borderStrong}`, background: dragging ? T.redWash : T.field, color: T.dim }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{loading ? 'Reading your file…' : 'Drop a CSV or Excel file here, or click to choose'}</span>
          <span style={{ fontSize: 12.5 }}>.csv or .xlsx, up to 5 MB and 2,000 invoices</span>
        </label>
        <input ref={inputRef} id="import-file" type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        {error && <div role="alert" style={{ marginTop: 14, padding: '10px 12px', borderRadius: T.radius.sm, background: T.redWash, color: T.red, fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>}
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>How to prepare the file</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.dim, lineHeight: 1.75 }}>
          <li><b>From Zoho Invoice:</b> open Invoices, choose the ⋯ menu, then Export Invoices, and pick CSV. The columns are recognised automatically.</li>
          <li><b>From anywhere else:</b> use the template below. One row per line item; rows with the same invoice number become one invoice.</li>
          <li>You will see a preview first. <b>Nothing is imported until you confirm</b>, and importing the same file twice never creates duplicates.</li>
        </ol>
        <div style={{ marginTop: 14 }}><Button onClick={() => downloadBlob(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }), 'invoice-import-template.csv')}>Download CSV template</Button></div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: T.mute, lineHeight: 1.6 }}>
          Needed: Invoice Number, Invoice Date, Customer Name and either line items (Item Name, Quantity, Item Price, Item Tax %) or an invoice Total.
          Optional: Due Date, Invoice Status, Balance (to carry over what is already paid), GSTIN, Place of Supply, Customer Email, HSN/SAC, Discount %, Notes.
          Dates are read as DD/MM/YYYY or YYYY-MM-DD.
        </div>
      </Card>
    </FinancePage>
  );
}

function Check({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--red)' }} />
      <span><span style={{ fontSize: 13.5, color: T.text, fontWeight: 500 }}>{label}</span><br /><span style={{ fontSize: 12.5, color: T.mute }}>{hint}</span></span>
    </label>
  );
}
