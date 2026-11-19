'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api';
import { financeApi, type DocRow } from '../../lib/financeApi';

/**
 * Client Management → Account & Billing.
 *
 * Shows this client's seat usage (allocated vs active) and its next payment —
 * the due date / amount of the next unpaid invoice, pulled from the finance
 * customer the client is linked to (GET /clients/:id/account). The link is
 * edited here (PATCH /clients/:id with finance_customer_id) and saves on pick,
 * independent of the client form's own Save. Two transactional emailers —
 * welcome and payment reminder — post to /clients/:id/send-welcome and
 * /send-payment-reminder.
 */

interface NextPayment {
  invoice_id: string | null; number: string | null; due_date: string | null; total: number | null; balance: number | null;
  status: string; share_token: string | null; scheduled: boolean;
}
interface Account {
  name: string; contact_person: string | null; contact_email: string | null; allocated: number | null; active: number;
  finance_customer_id: string | null; next_payment: NextPayment | null; price_per_user: number | null;
  detected_price_per_user: number | null;
}
interface Customer { id: string; display_name: string; email?: string | null; company_name?: string | null; gstin?: string | null }
interface SeatCharge {
  id: string; user_label: string; added_on: string; cycle_days: number | null; days_charged: number | null; prorated_amount: number;
}

function unwrap<T>(r: unknown): T { const o = r as { data?: T }; return (o?.data ?? o) as T; }
const inr = (n?: number | null) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const todayIso = () => new Date().toISOString().slice(0, 10);

const box: React.CSSProperties = { background: 'var(--s3)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' };
const ACCENT = '#3E9EFF';

export default function ClientAccountPanel({ clientId }: { clientId: string }) {
  const [acct, setAcct] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [financeAvailable, setFinanceAvailable] = useState(true);

  // Pro-rated mid-cycle seat charges.
  const [priceDraft, setPriceDraft] = useState('');
  const [charges, setCharges] = useState<SeatCharge[]>([]);
  const [chargesTotal, setChargesTotal] = useState(0);
  const [invoiceOptions, setInvoiceOptions] = useState<DocRow[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const loadCharges = useCallback(() => {
    api.get(`/api/v1/clients/${clientId}/seat-charges`, { noCache: true } as RequestInit)
      .then((r) => {
        const d = unwrap<{ price_per_user: number | null; charges: SeatCharge[]; total: number }>(r);
        setCharges(d.charges || []);
        setChargesTotal(d.total || 0);
      })
      .catch(() => { setCharges([]); setChargesTotal(0); });
  }, [clientId]);

  const load = useCallback(() => {
    setLoading(true); setErr('');
    api.get(`/api/v1/clients/${clientId}/account`, { noCache: true } as RequestInit)
      .then((r) => { const a = unwrap<Account>(r); setAcct(a); setPriceDraft(a.price_per_user != null ? String(a.price_per_user) : ''); })
      .catch((e: any) => setErr(e?.response?.data?.error || e?.message || 'Could not load account info'))
      .finally(() => setLoading(false));
    loadCharges();
  }, [clientId, loadCharges]);
  useEffect(() => { load(); }, [load]);

  // Draft invoices for the linked finance customer, to pick which one gets the pending charges.
  useEffect(() => {
    if (!acct?.finance_customer_id || charges.length === 0) { setInvoiceOptions([]); setSelectedInvoiceId(''); return; }
    let alive = true;
    financeApi.invoices.list({ customer_id: acct.finance_customer_id, status: 'draft', limit: 50 })
      .then((r) => { if (alive) setInvoiceOptions(r.data || []); })
      .catch(() => { if (alive) setInvoiceOptions([]); });
    return () => { alive = false; };
  }, [acct?.finance_customer_id, charges.length]);

  // Debounced finance-customer search (only while the picker is open).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      api.get(`/api/v1/finance/customers?q=${encodeURIComponent(q)}&limit=20`, { noCache: true } as RequestInit)
        .then((r) => { if (alive) { setResults(unwrap<Customer[]>(r) || []); setFinanceAvailable(true); } })
        .catch(() => { if (alive) { setResults([]); setFinanceAvailable(false); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);

  const saveLink = async (customerId: string | null) => {
    setBusy('link'); setErr(''); setNote('');
    try {
      await api.patch(`/api/v1/clients/${clientId}`, { finance_customer_id: customerId });
      setOpen(false); setQ('');
      load();
      setNote(customerId ? 'Linked — next payment now follows this customer’s invoices.' : 'Billing link cleared.');
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Could not update the billing link'); }
    finally { setBusy(''); }
  };

  const savePriceValue = async (raw: string) => {
    setBusy('price'); setErr(''); setNote('');
    try {
      const trimmed = raw.trim();
      const price = trimmed === '' ? null : Number(trimmed);
      if (price != null && (!Number.isFinite(price) || price <= 0)) { setErr('Enter a positive price, or clear it to turn pro-rated billing off.'); return; }
      await api.put(`/api/v1/clients/${clientId}/seat-price`, { price_per_user: price });
      setPriceDraft(price != null ? String(price) : '');
      load();
      setNote(price == null ? 'Pro-rated seat billing turned off.' : `Price per seat set to ${inr(price)} — new or reactivated seats will now be pro-rated.`);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Could not save the price'); }
    finally { setBusy(''); }
  };

  const applyCharges = async () => {
    if (!selectedInvoiceId) return;
    setBusy('apply'); setErr(''); setNote('');
    try {
      const r = await api.post(`/api/v1/clients/${clientId}/seat-charges/apply`, { document_id: selectedInvoiceId });
      const d = unwrap<{ applied: number; total: number }>(r);
      setNote(`Added ${d.applied} seat charge${d.applied === 1 ? '' : 's'} (${inr(d.total)}) to the invoice.`);
      setSelectedInvoiceId('');
      loadCharges();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Could not apply the pending charges to that invoice'); }
    finally { setBusy(''); }
  };

  const sendEmail = async (kind: 'welcome' | 'payment-reminder') => {
    setBusy(kind); setErr(''); setNote('');
    try {
      const r = await api.post(`/api/v1/clients/${clientId}/send-${kind}`, {});
      const d = unwrap<{ sent?: boolean; live?: boolean; to?: string }>(r);
      const label = kind === 'welcome' ? 'Welcome email' : 'Payment reminder';
      const where = d.to || acct?.contact_email || 'the client';
      setNote(d.sent === false
        ? `${label} could not be delivered.`
        : `${label} ${d.live ? 'sent to' : 'queued (email provider is in test mode) for'} ${where}.`);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Could not send the email'); }
    finally { setBusy(''); }
  };

  if (loading) return <div style={{ ...box, fontSize: 12, color: 'var(--textTert)' }}>Loading account…</div>;
  if (!acct) return <div style={{ ...box, fontSize: 12, color: '#E01E2C' }} role="alert">{err || 'Account info is unavailable.'}</div>;

  const np = acct.next_payment;
  const overdue = !!np?.due_date && String(np.due_date).slice(0, 10) < todayIso();
  const noEmail = !acct.contact_email;

  const tile = (label: string, value: React.ReactNode, hint?: React.ReactNode, valueColor?: string) => (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: valueColor || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint != null && <div style={{ fontSize: 11, color: 'var(--textTert)', marginTop: 2 }}>{hint}</div>}
    </div>
  );

  const btn = (label: string, onClick: () => void, opts?: { disabled?: boolean; primary?: boolean; title?: string }) => (
    <button
      type="button" onClick={onClick} disabled={opts?.disabled || !!busy} title={opts?.title}
      style={{
        padding: '9px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
        border: opts?.primary ? 'none' : '1px solid var(--border)',
        background: opts?.primary ? (opts?.disabled ? 'var(--s4)' : ACCENT) : 'transparent',
        color: opts?.primary ? (opts?.disabled ? 'var(--textTert)' : '#fff') : 'var(--textSec)',
        cursor: opts?.disabled || busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
      }}
    >{label}</button>
  );

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Seat usage + next payment */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {tile('Users allocated', acct.allocated == null ? 'No limit' : acct.allocated, acct.allocated == null ? 'No seat cap set' : 'Seat cap')}
        {tile('Users active', acct.active,
          acct.allocated == null ? 'Currently active' : `${Math.max(0, acct.allocated - acct.active)} seat${acct.allocated - acct.active === 1 ? '' : 's'} left`,
          acct.allocated != null && acct.active >= acct.allocated ? '#E01E2C' : undefined)}
        {tile(np?.scheduled ? 'Next payment (scheduled)' : 'Next payment',
          np ? fmtDate(np.due_date) : '—',
          np
            ? (np.scheduled ? 'Not yet invoiced — recurring invoice due around this date' : <>Invoice {np.number} · {inr(np.balance)} due{overdue ? ' · overdue' : ''}</>)
            : (acct.finance_customer_id ? 'No unpaid or recurring invoice' : 'Link a customer'),
          np ? (!np.scheduled && overdue ? '#E01E2C' : undefined) : undefined)}
      </div>

      {/* Billing link */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--textSec)' }}>
            Billed as:{' '}
            <strong style={{ color: 'var(--text)' }}>{acct.finance_customer_id ? 'linked finance customer' : 'not linked'}</strong>
            <span style={{ color: 'var(--textTert)' }}> — the next payment date is read from this customer’s next unpaid invoice.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {acct.finance_customer_id && !open && btn('Clear link', () => saveLink(null))}
            {!open && btn(acct.finance_customer_id ? 'Change' : 'Link customer', () => { setOpen(true); setQ(''); }, { primary: !acct.finance_customer_id })}
          </div>
        </div>
        {open && (
          <div style={{ marginTop: 10, position: 'relative' }}>
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search finance customers by name…"
              style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 }}
            />
            {!financeAvailable && (
              <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 6 }}>
                Couldn’t load finance customers — the Finance module may not be enabled for your org. Enable it (and add the client as a customer) to link invoices.
              </div>
            )}
            <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--s2)' }}>
              {results.length === 0
                ? <div style={{ padding: 12, fontSize: 12, color: 'var(--textTert)' }}>{financeAvailable ? 'No customers found.' : '—'}</div>
                : results.map((c) => (
                  <button key={c.id} type="button" onClick={() => saveLink(c.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: c.id === acct.finance_customer_id ? 'rgba(62,158,255,0.1)' : 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.display_name}{c.id === acct.finance_customer_id ? ' · linked' : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--textTert)' }}>{[c.company_name, c.email, c.gstin].filter(Boolean).join(' · ') || '—'}</div>
                  </button>
                ))}
            </div>
            <button type="button" onClick={() => { setOpen(false); setQ(''); }} style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: ACCENT, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Pro-rated mid-cycle seat charges */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--textSec)' }}>
            Price per seat:{' '}
            <strong style={{ color: 'var(--text)' }}>{acct.price_per_user != null ? inr(acct.price_per_user) : 'not set'}</strong>
            <span style={{ color: 'var(--textTert)' }}> — when set, a seat added or reactivated mid-cycle is queued below, pro-rated for the days left in the billing cycle.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} placeholder="e.g. 500" inputMode="decimal"
              style={{ width: 110, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 }}
            />
            {btn('Save', () => savePriceValue(priceDraft), { primary: true })}
          </div>
        </div>
        {acct.detected_price_per_user != null && acct.detected_price_per_user !== acct.price_per_user && (
          <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 6 }}>
            Detected {inr(acct.detected_price_per_user)}/seat from this client's own invoice.{' '}
            <button
              type="button" onClick={() => savePriceValue(String(acct.detected_price_per_user))}
              style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >Use this</button>
          </div>
        )}

        {charges.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--textTert)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Pending — {charges.length} seat{charges.length === 1 ? '' : 's'} · {inr(chargesTotal)}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {charges.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.user_label}</div>
                    <div style={{ fontSize: 11, color: 'var(--textTert)' }}>
                      Added {fmtDate(c.added_on)}{c.cycle_days ? ` · ${c.days_charged} of ${c.cycle_days} days` : ' · full price (no billing cycle found)'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{inr(c.prorated_amount)}</div>
                </div>
              ))}
            </div>

            {!acct.finance_customer_id ? (
              <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 8 }}>Link a finance customer above to apply these to an invoice.</div>
            ) : invoiceOptions.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 8 }}>No draft invoice found for this customer — create one in Finance, then come back here.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <select
                  value={selectedInvoiceId} onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  style={{ flex: '1 1 220px', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 12.5 }}
                >
                  <option value="">Apply to draft invoice…</option>
                  {invoiceOptions.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} · {inr(inv.total)}</option>)}
                </select>
                {btn(`Apply ${charges.length} charge${charges.length === 1 ? '' : 's'}`, applyCharges, { primary: true, disabled: !selectedInvoiceId })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Emailers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        {btn('Send welcome email', () => sendEmail('welcome'), { disabled: noEmail, title: noEmail ? 'Add a contact email first' : undefined })}
        {btn('Send payment reminder', () => sendEmail('payment-reminder'), { disabled: noEmail || !np, title: noEmail ? 'Add a contact email first' : (!np ? 'No unpaid invoice to remind about' : undefined) })}
        <span style={{ fontSize: 11, color: 'var(--textTert)' }}>
          {acct.contact_email ? <>To: {acct.contact_email}</> : 'No contact email on this client'}
        </span>
      </div>

      {(note || err) && (
        <div role={err ? 'alert' : 'status'} style={{ fontSize: 11.5, fontWeight: 600, color: err ? '#E01E2C' : '#00A862' }}>{err || note}</div>
      )}
    </div>
  );
}
