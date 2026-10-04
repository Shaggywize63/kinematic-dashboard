'use client';

/**
 * Public customer page for a shared invoice / quote — /inv/<token>?p=<project>
 *
 * Sibling of dashboard/, so it inherits no auth gate and no dashboard chrome. It uses a raw
 * fetch (fetchPublicDoc): the customer has no session, and the token + ?p= pick the tenant.
 * Fixed light palette on purpose: the dashboard theme variables may not exist here.
 */

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import InvoicePaper from '../../../components/finance/InvoicePaper';
import { fetchPublicDoc, publicPdfUrl, type PublicDoc } from '../../../lib/financeApi';
import { fmtDate, inr, num } from '../../../lib/financeFormat';

const P = {
  bg: '#E5E7EB', bar: '#FFFFFF', ink: '#1F2328', dim: '#5B6470', border: '#D1D5DB', brand: '#1F2937',
  ok: { bg: '#E7F6EC', fg: '#14532D', bd: '#9FD8B2' }, bad: { bg: '#FDECEC', fg: '#7F1D1D', bd: '#F2B3B3' },
  warn: { bg: '#FEF5E0', fg: '#7A4B00', bd: '#F0CF8C' }, info: { bg: '#E8F0FE', fg: '#1E3A8A', bd: '#B5C8F5' }, mute: { bg: '#F3F4F6', fg: '#374151', bd: '#D1D5DB' },
};

const PRINT_CSS = `
.pub-btn { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 6px; border: 1px solid ${P.border}; background: #fff; color: ${P.ink}; font: 600 13.5px/1 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; text-decoration: none; cursor: pointer; white-space: nowrap; }
.pub-btn:hover { background: #F3F4F6; }
.pub-btn:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
@media print {
  .pub-topbar, .pub-banner { display: none !important; }
  .pub-page { background: #fff !important; }
  .pub-paper { padding: 0 !important; }
  .pub-paper > div > div { box-shadow: none !important; }
}`;

export default function PublicInvoicePage() {
  return (
    <Suspense fallback={null}>
      <PublicInvoiceInner />
    </Suspense>
  );
}

function Banner({ tone, children }: { tone: keyof Pick<typeof P, 'ok' | 'bad' | 'warn' | 'info' | 'mute'>; children: React.ReactNode }) {
  const c = P[tone];
  return (
    <div className="pub-banner" role="status" style={{ maxWidth: 794, margin: '0 auto 14px', padding: '11px 14px', borderRadius: 8, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, fontSize: 14, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

function PublicInvoiceInner() {
  const params = useParams();
  const search = useSearchParams();
  const token = String((Array.isArray(params?.token) ? params?.token[0] : params?.token) ?? '');
  const project = search?.get('p') ?? null;

  const [data, setData] = useState<PublicDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError('This link is invalid or has expired.'); setLoading(false); return; }
    let off = false;
    setLoading(true); setError(null);
    fetchPublicDoc(token, project)
      .then((d) => { if (!off) setData(d); })
      .catch((e) => { if (!off) setError(e instanceof Error && e.message ? e.message : 'This link is invalid or has expired.'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [token, project]);

  const shell: React.CSSProperties = { minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" };

  if (loading || error || !data) {
    return (
      <div className="pub-page" style={{ ...shell, display: 'grid', placeItems: 'center', padding: 16 }}>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
        {loading ? (
          <div role="status" style={{ color: P.dim, fontSize: 15 }}>Loading document…</div>
        ) : (
          <div role="alert" style={{ maxWidth: 420, textAlign: 'center', background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, padding: '28px 24px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>We couldn’t open this document</div>
            <div style={{ fontSize: 14, color: P.dim, lineHeight: 1.5 }}>{error || 'This link is invalid or has expired.'}</div>
            <div style={{ fontSize: 13, color: P.dim, marginTop: 12 }}>Please ask the sender for a fresh link.</div>
          </div>
        )}
      </div>
    );
  }

  const doc = data.document;
  const isInvoice = doc.doc_type === 'invoice';
  const status = String(doc.display_status || doc.status);
  const business = data.settings.business_name || 'Invoice';
  const label = isInvoice ? 'Invoice' : 'Quote';

  let banner: React.ReactNode = null;
  if (status === 'paid') banner = <Banner tone="ok"><strong>Payment received — thank you.</strong> This invoice has been paid in full.</Banner>;
  else if (status === 'partially_paid') banner = <Banner tone="info"><strong>Partial payment received.</strong> Balance due: {inr(doc.balance)}{doc.due_date ? `, by ${fmtDate(doc.due_date)}` : ''}.</Banner>;
  else if (status === 'overdue') banner = <Banner tone="bad"><strong>Overdue.</strong> {inr(doc.balance)} was due on {fmtDate(doc.due_date)}. Please arrange payment at your earliest convenience.</Banner>;
  else if (status === 'void') banner = <Banner tone="mute"><strong>This {label.toLowerCase()} has been cancelled</strong> and no payment is due.</Banner>;
  else if (status === 'expired') banner = <Banner tone="warn"><strong>Expired.</strong> This quote was valid until {fmtDate(doc.expiry_date)}. Contact {business} for an updated quote.</Banner>;
  else if (status === 'accepted') banner = <Banner tone="ok"><strong>Quote accepted.</strong> Thank you.</Banner>;
  else if (status === 'declined') banner = <Banner tone="mute"><strong>This quote was declined.</strong></Banner>;
  else if (isInvoice && num(doc.balance) > 0 && doc.due_date) banner = <Banner tone="info">Amount due: <strong>{inr(doc.balance)}</strong> by {fmtDate(doc.due_date)}.</Banner>;

  return (
    <div className="pub-page" style={shell}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <header className="pub-topbar" style={{ position: 'sticky', top: 0, zIndex: 10, background: P.bar, borderBottom: `1px solid ${P.border}` }}>
        <div style={{ maxWidth: 794, margin: '0 auto', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: P.brand, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business}</div>
            <div style={{ fontSize: 12, color: P.dim }}>{label} {doc.number}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="pub-btn" href={publicPdfUrl(token, project)} target="_blank" rel="noopener noreferrer">Download PDF</a>
            <button type="button" className="pub-btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </header>

      <main className="pub-paper" style={{ padding: '18px 12px 40px' }}>
        {banner}
        <InvoicePaper doc={doc} items={data.items} settings={data.settings} />
      </main>
    </div>
  );
}
