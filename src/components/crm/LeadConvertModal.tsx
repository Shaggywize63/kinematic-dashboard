'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, crmProducts } from '../../lib/crmApi';
import type { Product } from '../../types/crm';

interface Props {
  leadId: string;
  defaultDealName?: string;
  open: boolean;
  onClose: () => void;
  onConverted?: () => void;
}

// Convert flow now supports two ways to size the new deal:
//   - Amount (₹) — direct rupee amount (legacy path)
//   - Volume (kg) + Product — backend derives amount from product price/weight
// Picking either fills the other when a product is selected.

export default function LeadConvertModal({ leadId, defaultDealName, open, onClose, onConverted }: Props) {
  const [createAccount, setCreateAccount] = useState(true);
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState(defaultDealName || '');
  const [dealAmount, setDealAmount] = useState<string>('');
  const [dealVolumeKg, setDealVolumeKg] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);

  // Lazy-load weight-based products only when the modal opens. Filters to
  // active products with both price and weight_kg so the kg → ₹ derivation
  // is always valid.
  useEffect(() => {
    if (!open) return;
    crmProducts.list().then((r) => {
      const list = (r.data || []).filter((p: any) => p.is_active !== false && p.price && p.weight_kg);
      setProducts(list as Product[]);
    }).catch(() => setProducts([]));
  }, [open]);

  const pricePerKg = useMemo(() => {
    const p = products.find((x) => x.id === productId);
    if (!p?.price || !p?.weight_kg) return 0;
    return Number(p.price) / Number(p.weight_kg);
  }, [products, productId]);

  // Volume ⇄ Amount autosync — only when a product (and therefore a rate) is set.
  const onVolume = (val: string) => {
    setDealVolumeKg(val);
    if (pricePerKg > 0 && val !== '') {
      const v = Number(val);
      if (!Number.isNaN(v)) setDealAmount(String(Math.round(v * pricePerKg)));
    }
  };
  const onAmount = (val: string) => {
    setDealAmount(val);
    if (pricePerKg > 0 && val !== '') {
      const a = Number(val);
      if (!Number.isNaN(a)) setDealVolumeKg((a / pricePerKg).toFixed(2));
    }
  };
  const onProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p?.price && p?.weight_kg && dealVolumeKg !== '') {
      const ppk = Number(p.price) / Number(p.weight_kg);
      const v = Number(dealVolumeKg);
      if (!Number.isNaN(v)) setDealAmount(String(Math.round(v * ppk)));
    }
  };

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await crmLeads.convert(leadId, {
        create_account: createAccount,
        create_deal: createDeal,
        deal_name: dealName || undefined,
        deal_amount: dealAmount ? Number(dealAmount) : undefined,
        // Send the volume + product through too so the backend can derive
        // amount when only those are set (and so the deal carries the
        // weight context for later analytics).
        deal_volume_kg: dealVolumeKg ? Number(dealVolumeKg) : undefined,
        deal_product_id: productId || undefined,
      } as any);
      toast.success('Lead converted successfully');
      onConverted?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 480, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 14px', color: 'var(--text)' }}>Convert Lead</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} /> Create Account
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> Create Deal
        </label>
        {createDeal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <Field label="Deal name">
              <input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="Auto-named if blank" style={inputCss} />
            </Field>
            <Field label="Product (optional)">
              <select value={productId} onChange={(e) => onProduct(e.target.value)} style={inputCss}>
                <option value="">— None —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{Number(p.price).toFixed(0)}/unit · {p.weight_kg} kg)</option>)}
              </select>
            </Field>
            {productId && (
              <Field label="Volume (kg)">
                <input value={dealVolumeKg} onChange={(e) => onVolume(e.target.value)} placeholder="e.g. 12500" type="number" step="0.01" style={inputCss} />
              </Field>
            )}
            <Field label="Amount (INR)">
              <input value={dealAmount} onChange={(e) => onAmount(e.target.value)} placeholder="0" type="number" step="0.01" style={inputCss} />
            </Field>
            {productId && pricePerKg > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 10px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                Rate: <strong style={{ color: 'var(--text)' }}>₹{pricePerKg.toFixed(2)}/kg</strong> — editing volume autofills amount and vice versa.
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? 'Converting...' : 'Convert'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const inputCss: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
