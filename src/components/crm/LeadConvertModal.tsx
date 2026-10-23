'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmProducts } from '../../lib/crmApi';
import { useClient } from '../../context/ClientContext';
import type { Product } from '../../types/crm';
import { STEEL_DEALER_CLIENT_IDS, BMW_CLIENT_ID } from '../../lib/clientFeatures';

interface Props {
  leadId: string;
  defaultDealName?: string;
  open: boolean;
  onClose: () => void;
  onConverted?: () => void;
}

// Convert flow supports three ways to size the new deal:
//   - Amount (₹) — direct rupee amount (everyone)
//   - Volume (kg) + Product — backend derives amount from product
//     price/weight (single-product Tata legacy path; still works for
//     backward-compat callers)
//   - Multiple product line items — pick several products, enter
//     pieces (preferred) or kg per row; the modal auto-computes the
//     row subtotal and the deal total.
// Bespoke for the steel-dealer tenants (Tata Tiscon / SRS's TMT bar sold by
// metric tonne, plus BMW and PASA); no other client sells by mass, so the
// line-item section is gated to STEEL_DEALER_CLIENT_IDS — the single canonical
// set in clientFeatures.ts, so a newly onboarded steel-dealer tenant is never
// missed here — to keep the form clean for everyone else.

type LineItem = {
  // Stable per-row id so React keys + remove() don't trip over
  // duplicate product picks (the same product can legitimately
  // appear twice if the rep wants two separate line entries).
  rowId: string;
  product_id: string;
  pieces: string;
  volume_kg: string;
  subtotal: string;
};

const emptyLine = (): LineItem => ({ rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, product_id: '', pieces: '', volume_kg: '', subtotal: '' });

export default function LeadConvertModal({ leadId, defaultDealName, open, onClose, onConverted }: Props) {
  const router = useRouter();
  // Tata Tiscon flow: conversion creates a Deal (and a Contact for
  // the lead) — the rep does not separately model an Account. The
  // createAccount toggle was confusing reps into spawning duplicate
  // partner records, so it's wired off-by-default and hidden from the
  // modal. The backend still respects the flag if a future callsite
  // explicitly opts in.
  const [createAccount] = useState(false);
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState(defaultDealName || '');
  const [dealAmount, setDealAmount] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  // True once the rep has manually edited the amount field — stops the
  // auto-sum from clobbering their override on every keystroke.
  const [amountOverridden, setAmountOverridden] = useState(false);

  // Pre-fill the deal name from the lead — caller usually passes a
  // sensible default (the lead's own name). If they didn't, fetch the
  // lead and compose one from full_name / first+last / email so the
  // field is never blank on open. The deal name mirrors the lead name
  // verbatim (no "Opportunity" suffix).
  useEffect(() => {
    if (!open) return;
    if (defaultDealName) { setDealName(defaultDealName); return; }
    let cancelled = false;
    crmLeads.get(leadId).then((r) => {
      if (cancelled) return;
      const l: any = r.data;
      const name =
        l?.full_name ||
        `${l?.first_name || ''} ${l?.last_name || ''}`.trim() ||
        l?.company ||
        l?.email ||
        '';
      if (name) setDealName(name);
    }).catch(() => { /* leave blank, rep can type */ });
    return () => { cancelled = true; };
  }, [open, defaultDealName, leadId]);

  // Tata Tiscon detection mirrors the dashboard ₹/Weight toggle gate:
  // a client-pinned user whose JWT carries Tata's client_id, OR a
  // platform admin (Sagar) who picked Tata via the global filter.
  const { selectedClientId } = useClient();
  const userClientId = useMemo<string | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.client_id ?? null) : null;
    } catch { return null; }
  }, []);
  const allowWeight = STEEL_DEALER_CLIENT_IDS.includes(userClientId ?? '') || STEEL_DEALER_CLIENT_IDS.includes(selectedClientId ?? '');
  // BMW (a steel-dealer tenant) hides ALL rupee/amount UI in the convert flow —
  // the rep books a VOLUME (kg), never a price — and gets a Balance summary
  // (interested quantity − booked volume). Mirrors how allowWeight resolves the
  // active tenant (bound client_id OR super-admin picker). Other steel dealers
  // (Tata/PASA) keep the amount UI exactly as before.
  const isBmw = userClientId === BMW_CLIENT_ID || selectedClientId === BMW_CLIENT_ID;

  // The lead's own custom_fields — needed for BMW's Balance line (the rep's
  // interested quantity was captured on the lead as estimated_tonnage, or
  // quantity + measuring_unit). Fetched once per open for BMW only.
  const [leadCustomFields, setLeadCustomFields] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!open || !isBmw) { setLeadCustomFields(null); return; }
    let cancelled = false;
    crmLeads.get(leadId).then((r) => {
      if (cancelled) return;
      const cf = (r.data as { custom_fields?: Record<string, unknown> | null } | undefined)?.custom_fields;
      setLeadCustomFields(cf && typeof cf === 'object' ? cf : {});
    }).catch(() => { if (!cancelled) setLeadCustomFields({}); });
    return () => { cancelled = true; };
  }, [open, isBmw, leadId]);

  // Interested quantity → kg. Prefer estimated_tonnage (TONNE); otherwise
  // quantity + measuring_unit (Tonne→×1000, Kg→×1, Piece→can't convert without
  // a product weight, so leave 0 and skip the kg balance line).
  const interestedKg = useMemo(() => {
    const cf = leadCustomFields;
    if (!cf) return 0;
    const tonnage = Number(cf.estimated_tonnage);
    if (Number.isFinite(tonnage) && tonnage > 0) return tonnage * 1000;
    const qty = Number(cf.quantity);
    const unit = String(cf.measuring_unit ?? '').trim().toLowerCase();
    if (Number.isFinite(qty) && qty > 0) {
      if (unit === 'tonne') return qty * 1000;
      if (unit === 'kg') return qty;
    }
    return 0;
  }, [leadCustomFields]);

  // Lazy-load weight-based products only when the modal opens AND the
  // weight UI is in scope (no point fetching for non-Tata clients).
  useEffect(() => {
    if (!open || !allowWeight) return;
    crmProducts.list().then((r) => {
      const list = (r.data || []).filter((p: any) => p.is_active !== false && p.price && p.weight_kg);
      setProducts(list as Product[]);
    }).catch(() => setProducts([]));
  }, [open, allowWeight]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // Reset the line items every time the modal opens — stale state from
  // a previous convert could otherwise bleed into the next one.
  useEffect(() => {
    if (open) {
      setLines([emptyLine()]);
      setDealAmount('');
      setAmountOverridden(false);
    }
  }, [open]);

  // Per-row math. Updating one of (pieces / kg / subtotal) recomputes
  // the others when a product (and therefore unit price + weight) is
  // selected. Editing without a product leaves the entered string as-is
  // — the rep can still pick a product afterwards and the values stay.
  const updateLine = (rowId: string, patch: Partial<LineItem> & { _source?: 'pieces' | 'kg' | 'product' | 'subtotal' }) => {
    setLines((prev) => prev.map((l) => {
      if (l.rowId !== rowId) return l;
      const { _source, ...rest } = patch;
      const next: LineItem = { ...l, ...rest };
      const p = productById.get(next.product_id);
      const price = Number(p?.price ?? 0);
      const weight = Number(p?.weight_kg ?? 0);
      if (!p || price <= 0 || weight <= 0) return next;
      if (_source === 'pieces' || _source === 'product') {
        const pieces = Number(next.pieces);
        if (!Number.isNaN(pieces) && pieces > 0) {
          next.volume_kg = (pieces * weight).toFixed(2);
          next.subtotal  = String(Math.round(pieces * price));
        }
      } else if (_source === 'kg') {
        const kg = Number(next.volume_kg);
        if (!Number.isNaN(kg) && kg > 0) {
          const pieces = kg / weight;
          next.pieces   = pieces.toFixed(2);
          next.subtotal = String(Math.round(pieces * price));
        }
      } else if (_source === 'subtotal') {
        const sub = Number(next.subtotal);
        if (!Number.isNaN(sub) && sub > 0) {
          const pieces = sub / price;
          next.pieces    = pieces.toFixed(2);
          next.volume_kg = (pieces * weight).toFixed(2);
        }
      }
      return next;
    }));
  };

  const addLine    = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (rowId: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.rowId !== rowId) : prev));

  // Aggregate totals across every line that has a product selected.
  const totals = useMemo(() => {
    let amount = 0, kg = 0, count = 0;
    for (const l of lines) {
      if (!l.product_id) continue;
      const sub = Number(l.subtotal);
      const w   = Number(l.volume_kg);
      if (!Number.isNaN(sub)) amount += sub;
      if (!Number.isNaN(w))   kg     += w;
      count++;
    }
    return { amount, kg: Math.round(kg * 100) / 100, count };
  }, [lines]);

  // Auto-fill the deal amount field with the line-items total whenever
  // it changes, unless the rep has typed their own override.
  useEffect(() => {
    if (!amountOverridden && totals.amount > 0) {
      setDealAmount(String(totals.amount));
    }
  }, [totals.amount, amountOverridden]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      // Build line items payload — strip any rows the rep started but
      // never finished (no product picked). The backend dedups + recomputes
      // canonical figures from the product table so trailing whitespace
      // in our numbers doesn't matter.
      const lineItems = lines
        .filter((l) => l.product_id && (Number(l.pieces) > 0 || Number(l.volume_kg) > 0))
        .map((l) => ({
          product_id: l.product_id,
          pieces:    Number(l.pieces)    || undefined,
          volume_kg: Number(l.volume_kg) || undefined,
          subtotal:  Number(l.subtotal)  || undefined,
        }));

      const r = await crmLeads.convert(leadId, {
        create_account: createAccount,
        create_deal: createDeal,
        deal_name: dealName || undefined,
        // BMW never books a rupee amount — omit it so the backend derives the
        // deal value from the line items (volume_kg × product). Other tenants
        // keep sending the (possibly auto-summed) amount.
        deal_amount: isBmw ? undefined : (dealAmount ? Number(dealAmount) : undefined),
        deal_line_items: allowWeight && lineItems.length > 0 ? lineItems : undefined,
      } as any);
      toast.success('Lead converted successfully');
      onConverted?.();
      onClose();

      // After conversion, jump straight to the new Deal page so the rep
      // can keep working there. The convert endpoint returns either a
      // nested deal object or a flat deal_id depending on backend rev —
      // try both, fall back to the deals list if neither is present.
      const data: any = (r as any)?.data ?? r;
      const dealId = data?.deal?.id || data?.deal_id;
      if (createDeal && dealId) {
        router.push(`/dashboard/crm/deals/${dealId}`);
      } else if (createDeal) {
        router.push('/dashboard/crm/deals');
      }
    } catch (e: any) {
      toast.error(e.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 14px', color: 'var(--text)' }}>Convert Lead</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> Create Deal
        </label>
        {createDeal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <Field label="Deal name (editable)">
              <input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="e.g. Acme Steel" style={inputCss} />
            </Field>

            {/* Multi-product line items — Tata Tiscon only. Lets the rep
                enter several products with pieces or kg per row; the
                modal computes the per-row subtotal and the deal total.
                Hidden entirely for every other client. */}
            {allowWeight && (
              <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
                    Products (line items)
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    Add one row per product. Pieces ↔ kg ↔ amount auto-sync.
                  </span>
                </div>

                {lines.map((l, idx) => {
                  const p = productById.get(l.product_id);
                  const rate = p && p.price && p.weight_kg ? (Number(p.price) / Number(p.weight_kg)) : 0;
                  return (
                    <div key={l.rowId} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                        <Field label={`Product #${idx + 1}`}>
                          <select
                            value={l.product_id}
                            onChange={(e) => updateLine(l.rowId, { product_id: e.target.value, _source: 'product' })}
                            style={inputCss}
                          >
                            <option value="">— Select product —</option>
                            {products.map((pp) => (
                              <option key={pp.id} value={pp.id}>
                                {pp.name} (₹{Number(pp.price).toFixed(0)}/pc · {pp.weight_kg} kg)
                              </option>
                            ))}
                          </select>
                        </Field>
                        <button
                          type="button"
                          onClick={() => removeLine(l.rowId)}
                          disabled={lines.length === 1}
                          title={lines.length === 1 ? 'At least one line is required' : 'Remove this product'}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.4 : 1 }}
                        >✕ Remove</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isBmw ? 2 : 3}, 1fr)`, gap: 8 }}>
                        <Field label="Pieces">
                          <input
                            type="number"
                            step="0.01"
                            value={l.pieces}
                            onChange={(e) => updateLine(l.rowId, { pieces: e.target.value, _source: 'pieces' })}
                            placeholder="e.g. 250"
                            style={inputCss}
                          />
                        </Field>
                        <Field label="Volume (kg)">
                          <input
                            type="number"
                            step="0.01"
                            value={l.volume_kg}
                            onChange={(e) => updateLine(l.rowId, { volume_kg: e.target.value, _source: 'kg' })}
                            placeholder="e.g. 12500"
                            style={inputCss}
                          />
                        </Field>
                        {/* Subtotal (₹) hidden for BMW — they book volume, never price. */}
                        {!isBmw && (
                          <Field label="Subtotal (₹)">
                            <input
                              type="number"
                              step="0.01"
                              value={l.subtotal}
                              onChange={(e) => updateLine(l.rowId, { subtotal: e.target.value, _source: 'subtotal' })}
                              placeholder="auto"
                              style={inputCss}
                            />
                          </Field>
                        )}
                      </div>
                      {!isBmw && rate > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                          Rate: ₹{rate.toFixed(2)}/kg · ₹{Number(p?.price ?? 0).toFixed(0)}/piece · {p?.weight_kg} kg/piece
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addLine}
                  style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed var(--primary)', color: 'var(--primary)', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >+ Add another product</button>

                {totals.count > 0 && (
                  <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap', padding: '8px 10px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
                    <span><strong>Lines:</strong> {totals.count}</span>
                    <span><strong>Total kg:</strong> {totals.kg.toLocaleString()}</span>
                    {/* Total ₹ hidden for BMW — the booked "value in KG" is the volume total. */}
                    {!isBmw && <span><strong>Total ₹:</strong> {totals.amount.toLocaleString()}</span>}
                  </div>
                )}

                {/* BMW Balance summary — interested quantity (from the lead) vs
                    the volume being booked now. Rendered only when the lead's
                    interested quantity is known (> 0 kg). */}
                {isBmw && interestedKg > 0 && (() => {
                  const bookedKg = totals.kg;
                  const balanceKg = Math.max(0, interestedKg - bookedKg);
                  const t = (kg: number) => (kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
                  const k = (kg: number) => Math.round(kg).toLocaleString('en-IN');
                  return (
                    <div style={{ padding: '8px 10px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                      <strong>Interested:</strong> {t(interestedKg)} t ({k(interestedKg)} kg) ·{' '}
                      <strong>Booking now:</strong> {t(bookedKg)} t ({k(bookedKg)} kg) ·{' '}
                      <strong>Balance:</strong> {t(balanceKg)} t ({k(balanceKg)} kg)
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Amount (INR) field — hidden entirely for BMW; the rep never sees
                or enters an amount (the backend derives it from the volume). */}
            {!isBmw && (
              <Field label={allowWeight && totals.count > 0 ? 'Amount (auto-summed from line items, editable)' : 'Amount (INR)'}>
                <input
                  value={dealAmount}
                  onChange={(e) => { setDealAmount(e.target.value); setAmountOverridden(true); }}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  style={inputCss}
                />
              </Field>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? 'Converting...' : 'Convert & open deal'}</button>
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
