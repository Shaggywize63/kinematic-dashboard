'use client';

import React, { useEffect, useMemo, useState } from 'react';
import proposalsApi, { ProposalItemInput, ProposalDetail } from '../../lib/proposalsApi';
import { crmProducts } from '../../lib/crmApi';

// "Generate Proposal" — pick the products a lead is interested in, generate an
// AI-tailored, branded PDF on the backend, then share by WhatsApp / email or
// download & save to phone via the returned signed URL.

interface Product { id: string; name: string; sku?: string | null; unit?: string | null; price?: number | null; description?: string | null; }

interface Row extends ProposalItemInput { key: string; }

const fmt = (n: number) => 'INR ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProposalBuilder(props: {
  leadId: string;
  leadName?: string;
  leadPhone?: string | null;
  leadEmail?: string | null;
  onClose: () => void;
}) {
  const { leadId, leadName, leadPhone, leadEmail, onClose } = props;
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('Product Proposal');
  const [picker, setPicker] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalDetail | null>(null);
  const [waPhone, setWaPhone] = useState(leadPhone || '');
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await crmProducts.list();
        setProducts(((res as unknown as { data?: Product[] }).data) ?? (res as unknown as Product[]) ?? []);
      } catch { /* products optional; rep can still add custom lines */ }
    })();
  }, []);

  const addProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setRows((r) => [...r, {
      key: `${id}-${Date.now()}`, product_id: p.id, name: p.name, sku: p.sku ?? null,
      unit: p.unit ?? null, unit_price: Number(p.price ?? 0), quantity: 1, discount_pct: 0, tax_rate_pct: 18,
    }]);
    setPicker('');
  };
  const update = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => x.key === key ? { ...x, ...patch } : x));
  const remove = (key: string) => setRows((r) => r.filter((x) => x.key !== key));

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0, grand = 0;
    for (const it of rows) {
      const base = Number(it.unit_price || 0) * Number(it.quantity || 0);
      const disc = base * (Number(it.discount_pct || 0) / 100);
      const net = base - disc;
      const t = net * (Number(it.tax_rate_pct ?? 18) / 100);
      subtotal += base; discount += disc; tax += t; grand += net + t;
    }
    return { subtotal, discount, tax, grand };
  }, [rows]);

  const generate = async () => {
    setError(null); setBusy(true);
    try {
      const items: ProposalItemInput[] = rows.map(({ key, ...rest }) => rest);
      const res = await proposalsApi.create(leadId, { title, items });
      setResult((res as unknown as { data: ProposalDetail }).data);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Failed to generate proposal');
    } finally { setBusy(false); }
  };

  const doShare = async (channel: 'whatsapp' | 'email' | 'link') => {
    if (!result) return;
    setShareMsg(null);
    try {
      if (channel === 'whatsapp') {
        if (!waPhone.trim()) { setShareMsg('Enter a WhatsApp number first.'); return; }
        await proposalsApi.share(result.id, { channel: 'whatsapp', to: waPhone.trim() });
        setShareMsg('Proposal sent on WhatsApp ✓');
        return;
      }
      const res = await proposalsApi.share(result.id, { channel });
      const url = (res as unknown as { data: { pdf_url: string | null } }).data?.pdf_url || result.pdf_url;
      if (channel === 'email' && url) {
        const subject = encodeURIComponent(`Proposal ${result.proposal_number ?? ''}`.trim());
        const body = encodeURIComponent(`Dear ${leadName || 'Customer'},\n\nPlease find your proposal here:\n${url}\n\nRegards`);
        window.open(`mailto:${leadEmail || ''}?subject=${subject}&body=${body}`, '_blank');
        setShareMsg('Opened your email with the proposal link.');
      } else if (url) {
        await navigator.clipboard?.writeText(url).catch(() => {});
        setShareMsg('Proposal link copied to clipboard.');
      }
    } catch (e: unknown) {
      setShareMsg((e as { message?: string })?.message || 'Share failed');
    }
  };

  const card: React.CSSProperties = { background: 'var(--surface, #fff)', color: 'var(--text, #111)', borderRadius: 12, width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: 'var(--text-dim,#6b7280)', fontWeight: 700, textTransform: 'uppercase', padding: '6px 8px' };
  const td: React.CSSProperties = { padding: '4px 8px', fontSize: 13 };
  const num: React.CSSProperties = { width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border,#e5e7eb)', textAlign: 'right' };
  const btn = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Generate Proposal</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim,#6b7280)' }}>{leadName ? `For ${leadName}` : 'Select the products the customer is interested in'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-dim,#6b7280)' }}>×</button>
        </div>

        {!result ? (
          <div style={{ padding: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim,#6b7280)' }}>Proposal title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ display: 'block', width: '100%', margin: '6px 0 16px', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)' }} />

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={picker} onChange={(e) => addProduct(e.target.value)} style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)' }}>
                <option value="">+ Add a product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price ? ` — ${fmt(Number(p.price))}` : ''}</option>)}
              </select>
            </div>

            {rows.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-dim,#6b7280)', fontSize: 13 }}>No products added yet. Pick from the list above.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Qty</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unit Price</th><th style={{ ...th, textAlign: 'right' }}>Disc %</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const net = Number(r.unit_price || 0) * Number(r.quantity || 0) * (1 - Number(r.discount_pct || 0) / 100);
                    return (
                      <tr key={r.key} style={{ borderTop: '1px solid var(--border,#f0f0f0)' }}>
                        <td style={td}>{r.name}{r.sku ? <span style={{ color: 'var(--text-dim,#9ca3af)', fontSize: 11 }}> · {r.sku}</span> : null}</td>
                        <td style={{ ...td, textAlign: 'right' }}><input type="number" min={0} value={r.quantity} onChange={(e) => update(r.key, { quantity: Number(e.target.value) })} style={num} /></td>
                        <td style={{ ...td, textAlign: 'right' }}><input type="number" min={0} value={r.unit_price} onChange={(e) => update(r.key, { unit_price: Number(e.target.value) })} style={num} /></td>
                        <td style={{ ...td, textAlign: 'right' }}><input type="number" min={0} max={100} value={r.discount_pct ?? 0} onChange={(e) => update(r.key, { discount_pct: Number(e.target.value) })} style={{ ...num, width: 56 }} /></td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(net)}</td>
                        <td style={td}><button onClick={() => remove(r.key)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {rows.length > 0 && (
              <div style={{ marginTop: 16, marginLeft: 'auto', width: 260, fontSize: 13 }}>
                <Row2 k="Subtotal" v={fmt(totals.subtotal)} />
                {totals.discount > 0 && <Row2 k="Discount" v={'- ' + fmt(totals.discount)} />}
                <Row2 k="GST" v={fmt(totals.tax)} />
                <div style={{ borderTop: '2px solid var(--border,#e5e7eb)', margin: '6px 0' }} />
                <Row2 k="Grand Total" v={fmt(totals.grand)} bold />
              </div>
            )}

            {error && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={busy || rows.length === 0} onClick={generate} style={{ ...btn('#0a3d91'), opacity: (busy || rows.length === 0) ? 0.6 : 1 }}>{busy ? 'Generating…' : 'Generate proposal'}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16 }}>
              Proposal <strong>{result.proposal_number}</strong> generated · {fmt(Number(result.grand_total))}
            </div>
            {result.cover_note && <div style={{ fontSize: 12.5, color: 'var(--text-dim,#6b7280)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 16, maxHeight: 140, overflow: 'auto' }}>{result.cover_note}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              {result.pdf_url && <a href={result.pdf_url} target="_blank" rel="noreferrer" style={{ ...btn('#0a3d91'), textDecoration: 'none' }}>Download / Save PDF</a>}
              <button onClick={() => doShare('email')} style={btn('#374151')}>Email</button>
              <button onClick={() => doShare('link')} style={btn('#374151')}>Copy link</button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="WhatsApp number (with country code)" style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)' }} />
              <button onClick={() => doShare('whatsapp')} style={btn('#25D366')}>Send on WhatsApp</button>
            </div>
            {shareMsg && <div style={{ fontSize: 12.5, color: 'var(--text-dim,#6b7280)', marginTop: 4 }}>{shareMsg}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row2({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: bold ? 800 : 400, color: bold ? '#0a3d91' : 'inherit', fontSize: bold ? 15 : 13 }}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}
