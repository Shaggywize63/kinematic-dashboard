'use client';
// On-screen invoice / quote — the HTML twin of the backend PDF
// (Kinematic: src/services/finance/pdf.service.ts). Used by the invoice detail
// page, the public customer link and the template preview in Finance Settings.
// Always a white "paper" regardless of the dashboard theme.

import { CSSProperties } from 'react';
import { amountInWords, fmtDate, num, plainAmount } from '../../lib/financeFormat';
import { stateLabel } from '../../lib/gstStates';
import type { Address, DocLine, PublicSettings, FinanceSettings } from '../../lib/financeApi';

export interface PaperDoc {
  doc_type: 'invoice' | 'quote'; number: string; status: string; display_status?: string;
  issue_date: string; due_date?: string | null; expiry_date?: string | null; payment_terms_days?: number;
  reference_number?: string | null; subject?: string | null; place_of_supply?: string | null;
  customer_snapshot: { name?: string; gstin?: string };
  bill_to?: Address; ship_to?: Address;
  subtotal: number; discount_total: number; taxable_value: number; cgst: number; sgst: number; igst: number; tax_total: number;
  adjustment: number; adjustment_label?: string | null; round_off: number; total: number; amount_paid: number; balance: number;
  notes?: string | null; terms?: string | null;
}

const INK = '#1f2328', DIM = '#6b7280', LINE = '#e5e7eb';

function addressLines(a?: Address | null): string[] {
  if (!a) return [];
  const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(', ');
  return [a.attention, a.line1, a.line2, cityLine, a.country && a.country !== 'India' ? a.country : '', a.phone ? `Phone: ${a.phone}` : '']
    .filter((x): x is string => !!x && !!String(x).trim());
}

export default function InvoicePaper({ doc, items, settings }: { doc: PaperDoc; items: DocLine[]; settings: PublicSettings | FinanceSettings }) {
  const isInvoice = doc.doc_type === 'invoice';
  const accent = /^#[0-9a-fA-F]{6}$/.test(settings.template?.accent_color || '') ? (settings.template!.accent_color as string) : '#E01E2C';
  const bank = settings.bank_details || {};
  const intra = num(doc.igst) === 0;
  const status = String(doc.display_status || doc.status || '');

  const seller = [
    ...addressLines({ line1: settings.address_line1, line2: settings.address_line2, city: settings.city, state: settings.state, pincode: settings.pincode, country: settings.country }),
    settings.gstin ? `GSTIN: ${settings.gstin}` : '', settings.email || '', settings.phone || '', settings.website || '',
  ].filter(Boolean);

  const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const it of items) {
    const r = num(it.gst_rate);
    const cur = byRate.get(r) ?? { cgst: 0, sgst: 0, igst: 0 };
    cur.cgst += num(it.cgst); cur.sgst += num(it.sgst); cur.igst += num(it.igst);
    byRate.set(r, cur);
  }
  const totalRows: Array<[string, string, boolean?]> = [];
  totalRows.push(num(doc.discount_total) > 0 ? ['Sub Total (before discount)', plainAmount(doc.subtotal)] : ['Sub Total', plainAmount(doc.subtotal)]);
  if (num(doc.discount_total) > 0) totalRows.push(['Discount', `(-) ${plainAmount(doc.discount_total)}`]);
  Array.from(byRate.entries()).sort((a, b) => a[0] - b[0]).forEach(([rate, t]) => {
    if (rate === 0) return;
    if (intra) { totalRows.push([`CGST (${rate / 2}%)`, plainAmount(t.cgst)], [`SGST (${rate / 2}%)`, plainAmount(t.sgst)]); }
    else totalRows.push([`IGST (${rate}%)`, plainAmount(t.igst)]);
  });
  if (num(doc.adjustment)) totalRows.push([doc.adjustment_label || 'Adjustment', plainAmount(doc.adjustment)]);
  if (num(doc.round_off)) totalRows.push(['Round Off', plainAmount(doc.round_off)]);
  totalRows.push(['Total', `₹${plainAmount(doc.total)}`, true]);
  if (isInvoice && num(doc.amount_paid) > 0) {
    totalRows.push(['Payment Made', `(-) ${plainAmount(doc.amount_paid)}`]);
    totalRows.push(['Balance Due', `₹${plainAmount(doc.status === 'void' ? 0 : doc.balance)}`, true]);
  }

  const bankLine = [
    bank.account_name && `Account Name: ${bank.account_name}`, bank.bank_name && `Bank: ${bank.bank_name}`,
    bank.account_number && `Account No: ${bank.account_number}`, bank.ifsc && `IFSC: ${bank.ifsc}`,
    bank.branch && `Branch: ${bank.branch}`, bank.upi_id && `UPI: ${bank.upi_id}`,
  ].filter(Boolean).join('   |   ');

  const meta: Array<[string, string]> = [
    [isInvoice ? 'Invoice Date' : 'Quote Date', fmtDate(doc.issue_date)],
    ...(isInvoice
      ? [['Terms', num(doc.payment_terms_days) ? `Net ${doc.payment_terms_days}` : 'Due on Receipt'] as [string, string], ['Due Date', fmtDate(doc.due_date)] as [string, string]]
      : [['Expiry Date', fmtDate(doc.expiry_date)] as [string, string]]),
    ...(doc.reference_number ? [['Order / Ref #', doc.reference_number] as [string, string]] : []),
    ...(doc.place_of_supply ? [['Place of Supply', stateLabel(doc.place_of_supply)] as [string, string]] : []),
  ];

  // Header cells are <td role=columnheader>, not <th>: the dashboard's global `main table th` rule forces its own colours and would make the white-on-accent header unreadable.
  const th: CSSProperties = { background: accent, color: '#fff', fontSize: 11, fontWeight: 700, padding: '8px 8px', textAlign: 'left' };
  const td: CSSProperties = { fontSize: 12, padding: '9px 8px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };
  const shipLines = addressLines(doc.ship_to);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', background: '#fff', color: INK, width: '100%', maxWidth: 794, minWidth: 620, margin: '0 auto', padding: '40px 44px', boxSizing: 'border-box', borderRadius: 6, boxShadow: '0 1px 8px rgba(0,0,0,.18)', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden' }}>
        {doc.status === 'void' && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 150, fontWeight: 800, color: 'rgba(156,163,175,.18)', transform: 'rotate(-35deg)' }}>VOID</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            {settings.logo_url && settings.template?.show_logo !== false && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="" style={{ maxWidth: 72, maxHeight: 58, objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{settings.business_name || 'Your business name'}</div>
              <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.55, marginTop: 4, whiteSpace: 'pre-line' }}>{seller.join('\n')}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: accent, letterSpacing: '0.01em' }}>{isInvoice ? 'TAX INVOICE' : 'QUOTE'}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}># {doc.number}</div>
            {status && status !== 'draft' && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: status === 'paid' ? '#16a34a' : status === 'void' ? '#9ca3af' : accent }}>{status.replace(/_/g, ' ').toUpperCase()}</div>}
            {isInvoice && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: DIM }}>Balance Due</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>₹{plainAmount(doc.status === 'void' ? 0 : doc.balance)}</div>
              </div>
            )}
          </div>
        </div>

        <hr style={{ border: 0, borderTop: `1px solid ${LINE}`, margin: '18px 0 14px' }} />

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            {meta.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', fontSize: 12, lineHeight: '20px' }}>
                <span style={{ width: 104, color: DIM }}>{k}</span><b>{v}</b>
              </div>
            ))}
          </div>
          <div style={{ flex: '2 1 320px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Party title="BILL TO" accent={accent} name={doc.customer_snapshot?.name} lines={[...addressLines(doc.bill_to), doc.customer_snapshot?.gstin ? `GSTIN: ${doc.customer_snapshot.gstin}` : '']} />
            {shipLines.length > 0 && <Party title="SHIP TO" accent={accent} name={doc.customer_snapshot?.name} lines={shipLines} />}
          </div>
        </div>

        {doc.subject && <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 16 }}>Subject: {doc.subject}</div>}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
          <thead>
            <tr>
              <td role="columnheader" style={{ ...th, width: 28 }}>#</td><td role="columnheader" style={th}>Item &amp; Description</td><td role="columnheader" style={{ ...th, width: 70 }}>HSN/SAC</td>
              <td role="columnheader" style={{ ...th, textAlign: 'right', width: 56 }}>Qty</td><td role="columnheader" style={{ ...th, textAlign: 'right', width: 80 }}>Rate</td>
              <td role="columnheader" style={{ ...th, textAlign: 'right', width: 50 }}>Disc %</td><td role="columnheader" style={{ ...th, textAlign: 'right', width: 50 }}>GST %</td>
              <td role="columnheader" style={{ ...th, textAlign: 'right', width: 96 }}>Amount</td>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id ?? i}>
                <td style={td}>{i + 1}</td>
                <td style={td}><div style={{ fontWeight: 700 }}>{it.name}</div>{it.description && <div style={{ fontSize: 10.5, color: DIM, marginTop: 2, whiteSpace: 'pre-line' }}>{it.description}</div>}</td>
                <td style={td}>{it.hsn_sac || ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>{num(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>{plainAmount(it.rate)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{num(it.discount_pct) ? num(it.discount_pct) : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>{num(it.gst_rate)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{plainAmount(it.taxable_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', maxWidth: 300 }}>
            <div style={{ fontSize: 11, color: DIM }}>Total In Words</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontStyle: 'italic', marginTop: 3 }}>{amountInWords(num(doc.total), settings.currency || 'INR')}</div>
          </div>
          <div style={{ flex: '0 0 250px' }}>
            {totalRows.map(([k, v, strong]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: strong ? '5px 6px' : '3px 6px', fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 400, background: strong ? '#f3f4f6' : undefined }}>
                <span>{k}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <Block title="Notes" body={doc.notes} />
        {isInvoice && settings.template?.show_bank_details !== false && <Block title="Bank Details" body={bankLine} />}
        <Block title="Terms & Conditions" body={doc.terms} />

        {settings.template?.signature_name && (
          <div style={{ marginTop: 34, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 190, textAlign: 'center', borderTop: `1px solid ${DIM}`, paddingTop: 6, fontSize: 11, color: DIM }}>
              For {settings.business_name}<br />{settings.template.signature_name}
            </div>
          </div>
        )}
        {settings.template?.footer_text && <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11, color: DIM }}>{settings.template.footer_text}</div>}
      </div>
    </div>
  );
}

function Party({ title, accent, name, lines }: { title: string; accent: string; name?: string; lines: string[] }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM }}>{title}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 3 }}>{name}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{lines.filter(Boolean).join('\n')}</div>
    </div>
  );
}

function Block({ title, body }: { title: string; body?: string | null }) {
  if (!body || !body.trim()) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{body}</div>
    </div>
  );
}
