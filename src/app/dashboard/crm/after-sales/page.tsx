'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmAfterSales } from '../../../../lib/crmApi';
import type {
  AfterSalesConfig, AfterSalesRecordInput, AfterSalesImportResult, AfterSalesRecordRow,
} from '../../../../types/crm';
import { useAuth } from '../../../../hooks/useAuth';
import { canManageAfterSales } from '../../../../lib/clientFeatures';

/**
 * After-Sales Feedback — admin data entry (telecaller Phase 1).
 *
 * Two ways to add after-sales customer records, plus the auto-assignment target:
 *   1. Manual Entry — a single customer (name + phone required, optional
 *      purchase context and feedback).
 *   2. Bulk Upload — a CSV / Excel file; the backend parses header-keyed rows,
 *      creates one lead each, skips duplicates, and reports a per-row summary.
 *   3. Assignment — the telecaller every new After-Sales record auto-assigns to
 *      (so it lands in that telecaller's "My Calls").
 *
 * Each record becomes a lead tagged campaign='After-Sales' and is owned by the
 * configured telecaller. Feedback itself is captured later by the telecaller on
 * the call; the optional feedback fields here let an admin record feedback that
 * arrived by other means.
 */

// Option sets — kept in lockstep with the backend contract + the Android Log
// Call sheet so a value reads consistently on every surface.
const SATISFACTION = ['Excellent', 'Good', 'Average', 'Poor'];
const RATING = ['5', '4', '3', '2', '1'];
const PRIORITY = ['High', 'Medium', 'Low'];
const PURCHASE_INTEREST = ['Yes', 'Maybe', 'No'];

const TEMPLATE_COLUMNS = [
  'name', 'phone', 'email', 'city', 'state',
  'product', 'purchase_date', 'invoice_no', 'amount',
  'product_satisfaction', 'staff_behaviour', 'billing_experience', 'after_sales_service',
  'customer_rating', 'complaint', 'complaint_priority', 'resolution_required',
  'next_purchase_interest', 'referral_potential', 'notes',
];

const emptyRecord = (): AfterSalesRecordInput => ({
  name: '', phone: '', email: '', city: '', state: '',
  product: '', purchase_date: '', invoice_no: '', purchase_amount: '',
  product_satisfaction: '', staff_behaviour: '', billing_experience: '', after_sales_service: '',
  customer_rating: '', complaint: '', complaint_priority: '', resolution_required: false,
  next_purchase_interest: '', referral_potential: '', notes: '',
});

export default function AfterSalesPage() {
  const { user } = useAuth();
  // Resolve the tenant gate after mount (reads the super-admin client picker off
  // localStorage, which is SSR-unsafe). Starting null avoids a hydration flash.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { setAllowed(canManageAfterSales(user as any)); }, [user]);

  const [tab, setTab] = useState<'manual' | 'bulk' | 'records'>('manual');

  if (allowed === false) {
    return (
      <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 14 }}>
        After-Sales Feedback is not enabled for this workspace.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>After-Sales Feedback</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Add after-sales customers for the telecaller to call. Each record is auto-assigned and appears in the telecaller&rsquo;s My Calls.
        </p>
      </div>

      <AssignmentCard />

      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        {([['manual', 'Manual Entry'], ['bulk', 'Bulk Upload'], ['records', 'Recent Records']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
            color: tab === key ? '#fff' : 'var(--text-dim)', background: tab === key ? 'var(--primary)' : 'transparent',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'manual' && <ManualEntry />}
      {tab === 'bulk' && <BulkUpload />}
      {tab === 'records' && <RecentRecords />}
    </div>
  );
}

// ── Assignment config ────────────────────────────────────────────────────
function AssignmentCard() {
  const [cfg, setCfg] = useState<AfterSalesConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    crmAfterSales.getAssignment()
      .then((r) => setCfg(r.data))
      .catch((e: any) => toast.error(e?.message || 'Failed to load assignment settings'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const telecallers = cfg?.telecallers ?? [];
  const current = cfg?.telecaller_id ?? '';

  const save = (telecaller_id: string | null) => {
    setSaving(true);
    crmAfterSales.setAssignment({ telecaller_id })
      .then((r) => { setCfg((prev) => ({ ...(prev as AfterSalesConfig), ...r.data })); toast.success('Assignment updated'); })
      .catch((e: any) => toast.error(e?.message || 'Failed to update assignment'))
      .finally(() => setSaving(false));
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Auto-assign new records to</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Every After-Sales record you add is assigned to this telecaller.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={current}
            disabled={saving || !cfg}
            onChange={(e) => save(e.target.value || null)}
            style={inputStyle(false, 260)}
          >
            <option value="">— No telecaller (unassigned) —</option>
            {telecallers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.email ? ` (${t.email})` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      {cfg && telecallers.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#F59E0B' }}>
          No telecaller users found in this workspace. Create a user with the Telecaller role first, then pick them here.
        </div>
      )}
      {cfg && !cfg.telecaller_id && telecallers.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#F59E0B' }}>
          No telecaller selected — new records won&rsquo;t appear in anyone&rsquo;s My Calls until you choose one.
        </div>
      )}
    </Card>
  );
}

// ── Manual entry ──────────────────────────────────────────────────────────
function ManualEntry() {
  const [rec, setRec] = useState<AfterSalesRecordInput>(emptyRecord);
  const [saving, setSaving] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const set = (k: keyof AfterSalesRecordInput, v: unknown) => setRec((p) => ({ ...p, [k]: v }));

  const canSave = !!(rec.name || '').toString().trim() && !!(rec.phone || '').toString().trim() && !saving;

  const submit = () => {
    if (!canSave) { toast.error('Name and phone are required'); return; }
    setSaving(true);
    crmAfterSales.createRecord(rec)
      .then((r) => {
        toast.success(r.data.assigned ? 'Record added and assigned to the telecaller' : 'Record added (no telecaller configured yet)');
        setRec(emptyRecord());
        setShowFeedback(false);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to add record'))
      .finally(() => setSaving(false));
  };

  return (
    <Card>
      <SectionTitle>Customer</SectionTitle>
      <Grid>
        <Field label="Customer name *"><input style={inputStyle()} value={rec.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Anita Sharma" /></Field>
        <Field label="Phone *"><input style={inputStyle()} value={rec.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" /></Field>
        <Field label="Email"><input style={inputStyle()} value={rec.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="City"><input style={inputStyle()} value={rec.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><input style={inputStyle()} value={rec.state ?? ''} onChange={(e) => set('state', e.target.value)} /></Field>
      </Grid>

      <SectionTitle>Purchase</SectionTitle>
      <Grid>
        <Field label="Product / item"><input style={inputStyle()} value={rec.product ?? ''} onChange={(e) => set('product', e.target.value)} placeholder="e.g. Gold necklace" /></Field>
        <Field label="Purchase date"><input type="date" style={inputStyle()} value={(rec.purchase_date as string) ?? ''} onChange={(e) => set('purchase_date', e.target.value)} /></Field>
        <Field label="Invoice no."><input style={inputStyle()} value={rec.invoice_no ?? ''} onChange={(e) => set('invoice_no', e.target.value)} /></Field>
        <Field label="Amount (₹)"><input type="number" style={inputStyle()} value={(rec.purchase_amount as string) ?? ''} onChange={(e) => set('purchase_amount', e.target.value)} /></Field>
      </Grid>

      <button onClick={() => setShowFeedback((s) => !s)} style={{
        marginTop: 6, alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--primary)', fontSize: 12, fontWeight: 700, padding: 0,
      }}>
        {showFeedback ? '− Hide feedback fields' : '+ Add feedback (optional)'}
      </button>

      {showFeedback && (
        <>
          <SectionTitle>Feedback (optional)</SectionTitle>
          <Grid>
            <Field label="Product satisfaction"><Select options={SATISFACTION} value={rec.product_satisfaction ?? ''} onChange={(v) => set('product_satisfaction', v)} /></Field>
            <Field label="Staff behaviour"><Select options={SATISFACTION} value={rec.staff_behaviour ?? ''} onChange={(v) => set('staff_behaviour', v)} /></Field>
            <Field label="Billing experience"><Select options={SATISFACTION} value={rec.billing_experience ?? ''} onChange={(v) => set('billing_experience', v)} /></Field>
            <Field label="After-sales service"><Select options={SATISFACTION} value={rec.after_sales_service ?? ''} onChange={(v) => set('after_sales_service', v)} /></Field>
            <Field label="Customer rating"><Select options={RATING} value={rec.customer_rating ?? ''} onChange={(v) => set('customer_rating', v)} /></Field>
            <Field label="Complaint priority"><Select options={PRIORITY} value={rec.complaint_priority ?? ''} onChange={(v) => set('complaint_priority', v)} /></Field>
            <Field label="Next purchase interest"><Select options={PURCHASE_INTEREST} value={rec.next_purchase_interest ?? ''} onChange={(v) => set('next_purchase_interest', v)} /></Field>
            <Field label="Referral potential"><Select options={PRIORITY} value={rec.referral_potential ?? ''} onChange={(v) => set('referral_potential', v)} /></Field>
          </Grid>
          <Field label="Complaint"><textarea style={{ ...inputStyle(), minHeight: 64, resize: 'vertical' }} value={rec.complaint ?? ''} onChange={(e) => set('complaint', e.target.value)} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', marginTop: 6 }}>
            <input type="checkbox" checked={rec.resolution_required === true} onChange={(e) => set('resolution_required', e.target.checked)} />
            Resolution required
          </label>
          <Field label="Notes"><textarea style={{ ...inputStyle(), minHeight: 56, resize: 'vertical' }} value={rec.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={submit} disabled={!canSave} style={primaryBtn(!canSave)}>{saving ? 'Saving…' : 'Add record'}</button>
        <button onClick={() => { setRec(emptyRecord()); setShowFeedback(false); }} disabled={saving} style={ghostBtn()}>Clear</button>
      </div>
    </Card>
  );
}

// ── Bulk upload ─────────────────────────────────────────────────────────────
function BulkUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<AfterSalesImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const example = ['Anita Sharma', '9876500000', 'anita@example.com', 'Jaipur', 'Rajasthan',
      'Gold necklace', '2026-01-15', 'INV-1001', '85000',
      'Good', 'Excellent', 'Good', 'Good', '4', '', 'Low', 'no', 'Maybe', 'Medium', 'Called after Diwali purchase'];
    const csv = `${TEMPLATE_COLUMNS.join(',')}\n${example.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'after-sales-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const upload = () => {
    if (!file) { toast.error('Choose a CSV or Excel file first'); return; }
    setUploading(true); setResult(null);
    crmAfterSales.importRecords(file)
      .then((r) => {
        setResult(r.data);
        const { created, skipped, failed } = r.data;
        toast.success(`Imported ${created} · skipped ${skipped} · failed ${failed}`);
      })
      .catch((e: any) => toast.error(e?.message || 'Upload failed'))
      .finally(() => setUploading(false));
  };

  return (
    <Card>
      <SectionTitle>Upload a CSV or Excel file</SectionTitle>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>
        The first row must be column headers. <strong>name</strong> and <strong>phone</strong> are required; every other column is optional.
        Duplicate phone numbers are skipped. Accepts <code>.csv</code>, <code>.xlsx</code> and <code>.xls</code>.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button onClick={downloadTemplate} style={ghostBtn()}>↓ Download template</button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          style={{ fontSize: 13, color: 'var(--text)' }}
        />
        <button onClick={upload} disabled={!file || uploading} style={primaryBtn(!file || uploading)}>
          {uploading ? 'Uploading…' : 'Upload & import'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            <Stat label="Rows" value={result.total} accent="#3E9EFF" />
            <Stat label="Created" value={result.created} accent="#10B981" />
            <Stat label="Skipped" value={result.skipped} accent="#F59E0B" />
            <Stat label="Failed" value={result.failed} accent="#EF4444" />
          </div>
          {result.unassigned && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#F59E0B' }}>
              No telecaller is configured, so imported records are unassigned. Set one above, then reassign from Leads.
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6 }}>Rows not imported</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {result.errors.map((er, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-dim)', minWidth: 54 }}>Row {er.row}</span>
                    <span style={{ color: 'var(--text)', minWidth: 110 }}>{er.phone ?? '—'}</span>
                    <span style={{ color: '#EF4444' }}>{er.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Recent records ──────────────────────────────────────────────────────────
function RecentRecords() {
  const [rows, setRows] = useState<AfterSalesRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback((q: string) => {
    setLoading(true);
    crmAfterSales.listRecords({ limit: 200, search: q || undefined })
      .then((r) => setRows(r.data))
      .catch((e: any) => toast.error(e?.message || 'Failed to load records'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [search, load]);

  const name = (r: AfterSalesRecordRow) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <SectionTitle>Recent after-sales records</SectionTitle>
        <input placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle(false, 240)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'var(--s2)' }}>
              <ThCell>Customer</ThCell>
              <ThCell>Phone</ThCell>
              <ThCell>City</ThCell>
              <ThCell>Assigned to</ThCell>
              <ThCell>Status</ThCell>
              <ThCell>Added</ThCell>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><TdCell colSpan={6} dim center>Loading…</TdCell></tr>}
            {!loading && rows.length === 0 && <tr><TdCell colSpan={6} dim center>No after-sales records yet.</TdCell></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <TdCell bold>{name(r)}</TdCell>
                <TdCell>{r.phone ?? '—'}</TdCell>
                <TdCell>{r.city ?? '—'}</TdCell>
                <TdCell>{r.owner_name ?? (r.owner_id ? '—' : 'Unassigned')}</TdCell>
                <TdCell>{r.status ?? '—'}</TdCell>
                <TdCell>{fmtDate(r.created_at)}</TdCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── UI atoms ──────────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-dim)', margin: '10px 0 8px' }}>{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}
function Select({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle()}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
function ThCell({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>;
}
function TdCell({ children, colSpan, bold, dim, center }: { children: React.ReactNode; colSpan?: number; bold?: boolean; dim?: boolean; center?: boolean }) {
  return <td colSpan={colSpan} style={{ padding: '10px 12px', fontSize: 13, color: dim ? 'var(--text-dim)' : 'var(--text)', fontWeight: bold ? 700 : undefined, textAlign: center ? 'center' : 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</td>;
}
function inputStyle(_error = false, width?: number): React.CSSProperties {
  return { background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, width: width ?? '100%', boxSizing: 'border-box' };
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return { background: disabled ? 'var(--s1)' : 'var(--primary)', color: disabled ? 'var(--text-dim)' : '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer' };
}
function ghostBtn(): React.CSSProperties {
  return { background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
