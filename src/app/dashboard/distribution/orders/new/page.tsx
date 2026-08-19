'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { OrderCatalogue, OrderCatalogueItem, OrderPreview, OrderCredit } from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, Th, Td, inr } from '../../../../../components/distribution/Atoms';
import StoreSelect from '../../../../../components/StoreSelect';

// Order-booking cart (dashboard order entry). Picks an outlet, loads its priced
// catalogue, builds a cart with MOQ-enforced steppers, previews server-side
// pricing (discounts / schemes / tax), surfaces the outlet credit banner, and
// places the order (sending client_total for the anti-tamper check). Lives
// inside the existing distribution module — no new module id.

type CartMap = Record<string, number>; // sku_id -> qty

const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--s2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
};

// Snap a requested qty into the SKU's [min_qty, max_qty] window. Backend hard-
// blocks BELOW_MIN_QTY / ABOVE_MAX_QTY (409), so the cart is kept valid up front.
function clampQty(item: OrderCatalogueItem, requested: number): number {
  let v = Math.floor(Number(requested) || 0);
  if (v <= 0) return 0;
  if (item.min_qty != null && v < item.min_qty) v = item.min_qty;
  if (item.max_qty != null && v > item.max_qty) v = item.max_qty;
  return v;
}

export default function NewOrderPage() {
  const router = useRouter();

  const [outletId, setOutletId] = useState('');
  const [outletLabel, setOutletLabel] = useState('');

  const [catalogue, setCatalogue] = useState<OrderCatalogue | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [catErr, setCatErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartMap>({});
  const [warns, setWarns] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);

  // sku_id -> catalogue item, so cart lines render even when the search hides the row.
  const itemMap = useMemo(() => {
    const m = new Map<string, OrderCatalogueItem>();
    (catalogue?.items || []).forEach((it) => m.set(it.sku_id, it));
    return m;
  }, [catalogue]);

  const loadCatalogue = useCallback(async (id: string) => {
    setCatLoading(true); setCatErr(null); setCatalogue(null);
    setCart({}); setWarns({}); setPreview(null); setPreviewErr(null); setPlaceErr(null);
    try {
      const r = await api.getOrderCatalogue(id);
      setCatalogue(r?.data ?? (r as unknown as OrderCatalogue));
    } catch (e: any) {
      setCatErr(e?.message || 'Failed to load catalogue');
    }
    setCatLoading(false);
  }, []);

  // Refetch the catalogue whenever the picked outlet changes.
  useEffect(() => { if (outletId) loadCatalogue(outletId); }, [outletId, loadCatalogue]);

  const onOutletChange = (id: string, label: string) => {
    setOutletId(id);
    setOutletLabel(label);
  };

  // Any cart mutation invalidates the last server preview so the totals / credit
  // shown are never stale, and Place (which sends the previewed grand_total as
  // client_total) can't fire against a changed cart.
  const setQty = (item: OrderCatalogueItem, requested: number) => {
    const clamped = clampQty(item, requested);
    setCart((c) => {
      const next = { ...c };
      if (clamped <= 0) delete next[item.sku_id];
      else next[item.sku_id] = clamped;
      return next;
    });
    setWarns((w) => {
      const next = { ...w };
      if (clamped > 0 && item.max_qty != null && clamped === item.max_qty && requested > item.max_qty) {
        next[item.sku_id] = `Max ${item.max_qty} ${item.uom}`;
      } else if (clamped > 0 && item.min_qty != null && clamped === item.min_qty && requested < item.min_qty) {
        next[item.sku_id] = `Min ${item.min_qty} ${item.uom}`;
      } else {
        delete next[item.sku_id];
      }
      return next;
    });
    setPreview(null); setPreviewErr(null); setPlaceErr(null);
  };

  const addToCart = (item: OrderCatalogueItem) => setQty(item, item.min_qty ?? 1);
  const inc = (item: OrderCatalogueItem) => setQty(item, (cart[item.sku_id] || 0) + 1);
  const dec = (item: OrderCatalogueItem) => {
    const cur = cart[item.sku_id] || 0;
    const floor = item.min_qty ?? 1;
    // Stepping below the MOQ removes the line rather than snapping back up to min.
    setQty(item, cur - 1 < floor ? 0 : cur - 1);
  };

  const cartCount = Object.keys(cart).length;
  const cartQtyTotal = Object.values(cart).reduce((s, q) => s + q, 0);
  // Pre-preview estimate from base_price (authoritative pricing comes from Preview).
  const estSubtotal = Object.entries(cart).reduce((s, [sku, q]) => {
    const it = itemMap.get(sku);
    return s + (it ? it.base_price * q : 0);
  }, 0);

  const cartBody = () => ({
    outlet_id: outletId,
    items: Object.entries(cart).map(([sku_id, qty]) => {
      const it = itemMap.get(sku_id);
      return { sku_id, qty, uom: it?.uom };
    }),
    notes: notes.trim() || undefined,
  });

  const doPreview = async () => {
    if (!outletId || !cartCount) return;
    setPreviewing(true); setPreviewErr(null); setPlaceErr(null);
    try {
      const r = await api.previewDistOrder(cartBody());
      setPreview(r?.data ?? (r as unknown as OrderPreview));
    } catch (e: any) {
      setPreviewErr(e?.message || 'Preview failed');
    }
    setPreviewing(false);
  };

  const doPlace = async () => {
    if (!outletId || !cartCount || !preview) return;
    setPlacing(true); setPlaceErr(null);
    try {
      const r = await api.createDistOrder({ ...cartBody(), client_total: preview.totals.grand_total });
      const order = (r?.data ?? r) as any;
      if (order?.id) router.push(`/dashboard/distribution/orders/${order.id}`);
      else router.push('/dashboard/distribution/orders');
    } catch (e: any) {
      setPlaceErr(e?.message || 'Could not place order');
      setPlacing(false);
    }
  };

  // Group the (searched) catalogue by category for the browse list.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (catalogue?.items || []).filter((it) =>
      !q || [it.sku_name, it.sku_code, it.category].some((f) => (f || '').toLowerCase().includes(q)));
    const map = new Map<string, OrderCatalogueItem[]>();
    rows.forEach((it) => {
      const k = it.category || 'Uncategorised';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries());
  }, [catalogue, search]);

  // Credit: prefer the preview (real order value) over the catalogue (value 0).
  const credit: OrderCredit | null = preview?.credit || catalogue?.credit || null;

  return (
    <div>
      <PageHeader
        title="New order"
        subtitle="Pick an outlet, build the cart, preview pricing, and place"
        right={<a href="/dashboard/distribution/orders" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All orders</a>}
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outlet</div>
        <StoreSelect value={outletId} onChange={onOutletChange} placeholder="Select an outlet to load its catalogue…" />
        {catalogue && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
            {catalogue.customer_class && <Pill color="blue">{catalogue.customer_class}</Pill>}
            {catalogue.price_list_version != null && <span>Price list v{catalogue.price_list_version}</span>}
            <span>· {catalogue.items.length} SKU{catalogue.items.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </Card>

      {credit && <CreditBanner credit={credit} />}

      {!outletId ? (
        <Card><div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>Select an outlet to begin.</div></Card>
      ) : (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Catalogue */}
          <div style={{ flex: '2 1 460px', minWidth: 0 }}>
            <Card>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Catalogue</div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU / code / category" style={{ ...fieldStyle, flex: 1, minWidth: 180, width: 'auto' }} />
              </div>

              {catLoading ? (
                <div style={{ color: 'var(--text-dim)', padding: 16 }}>Loading catalogue…</div>
              ) : catErr ? (
                <div style={{ color: 'var(--primary)', padding: 16 }}>{catErr}</div>
              ) : !catalogue?.items.length ? (
                <div style={{ color: 'var(--text-dim)', padding: 16 }}>No orderable SKUs on this outlet&apos;s active price list.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <Th>SKU</Th>
                      <Th style={{ textAlign: 'right' }}>MRP</Th>
                      <Th style={{ textAlign: 'right' }}>Price</Th>
                      <Th>MOQ</Th>
                      <Th style={{ textAlign: 'right' }}>Qty</Th>
                    </tr></thead>
                    <tbody>
                      {grouped.map(([cat, rows]) => (
                        <FragmentGroup key={cat} cat={cat} count={rows.length}>
                          {rows.map((it) => {
                            const qty = cart[it.sku_id] || 0;
                            return (
                              <tr key={it.sku_id}>
                                <Td>
                                  <div style={{ fontWeight: 700 }}>{it.sku_name || it.sku_id.slice(0, 8) + '…'}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{it.sku_code || '—'} · {it.uom} · GST {it.gst_rate}%</div>
                                </Td>
                                <Td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{inr(it.mrp)}</Td>
                                <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(it.base_price)}</Td>
                                <Td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                  {it.min_qty != null || it.max_qty != null
                                    ? `${it.min_qty != null ? `min ${it.min_qty}` : ''}${it.min_qty != null && it.max_qty != null ? ' · ' : ''}${it.max_qty != null ? `max ${it.max_qty}` : ''}`
                                    : '—'}
                                </Td>
                                <Td style={{ textAlign: 'right' }}>
                                  {qty > 0 ? (
                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <Stepper item={it} qty={qty} onInc={() => inc(it)} onDec={() => dec(it)} onSet={(v) => setQty(it, v)} />
                                      {warns[it.sku_id] && <span style={{ fontSize: 10, color: '#F59E0B' }}>{warns[it.sku_id]}</span>}
                                    </div>
                                  ) : (
                                    <Btn variant="ghost" onClick={() => addToCart(it)}>Add</Btn>
                                  )}
                                </Td>
                              </tr>
                            );
                          })}
                        </FragmentGroup>
                      ))}
                      {!grouped.length && <tr><Td colSpan={5 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No SKUs match.</Td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Cart + preview */}
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Cart</div>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{cartCount} line{cartCount === 1 ? '' : 's'} · {cartQtyTotal} units</span>
              </div>

              {!cartCount ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '6px 0' }}>Add SKUs from the catalogue.</div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {Object.entries(cart).map(([sku, qty]) => {
                        const it = itemMap.get(sku);
                        if (!it) return null;
                        return (
                          <tr key={sku}>
                            <Td style={{ borderBottom: 'none', padding: '6px 0' }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{it.sku_name || sku.slice(0, 8) + '…'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{qty} {it.uom} × {inr(it.base_price)}</div>
                            </Td>
                            <Td style={{ borderBottom: 'none', padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <Stepper item={it} qty={qty} onInc={() => inc(it)} onDec={() => dec(it)} onSet={(v) => setQty(it, v)} />
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-dim)' }}>
                    <span>Estimated subtotal</span>
                    <span style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{inr(estSubtotal)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Preview for discounts, schemes &amp; tax.</div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</div>
                    <input value={notes} onChange={(e) => { setNotes(e.target.value); }} placeholder="Optional order notes" style={fieldStyle} />
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" onClick={doPreview} disabled={previewing || !cartCount}>{previewing ? 'Pricing…' : 'Preview'}</Btn>
                    <Btn onClick={doPlace} disabled={placing || !preview || !cartCount}>{placing ? 'Placing…' : 'Place order'}</Btn>
                  </div>
                  {!preview && !previewErr && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>Preview to enable placing.</div>}
                  {previewErr && <div style={{ color: 'var(--primary)', fontSize: 12, marginTop: 8 }}>{previewErr}</div>}
                  {placeErr && <div style={{ color: 'var(--primary)', fontSize: 12, marginTop: 8 }}>{placeErr}</div>}
                </>
              )}
            </Card>

            {preview && (
              <Card>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Priced preview</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <Th>SKU</Th>
                      <Th style={{ textAlign: 'right' }}>Qty</Th>
                      <Th style={{ textAlign: 'right' }}>Unit</Th>
                      <Th style={{ textAlign: 'right' }}>Disc</Th>
                      <Th style={{ textAlign: 'right' }}>Total</Th>
                    </tr></thead>
                    <tbody>
                      {preview.lines.map((l, i) => (
                        <tr key={`${l.sku_id}-${l.line_no ?? i}`}>
                          <Td>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{l.sku_name || l.sku_id.slice(0, 8) + '…'}</div>
                            {l.is_free_good && <Pill color="amber">FREE</Pill>}
                          </Td>
                          <Td style={{ textAlign: 'right' }}>{l.qty} {l.uom}</Td>
                          <Td style={{ textAlign: 'right' }}>{inr(l.unit_price)}</Td>
                          <Td style={{ textAlign: 'right', color: l.discount_amt ? 'var(--green)' : 'var(--text-dim)' }}>
                            {l.discount_amt ? `- ${inr(l.discount_amt)}` : '—'}
                            {l.discount_pct ? <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{l.discount_pct}%</div> : null}
                          </Td>
                          <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(l.total)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12 }}>
                  <TotalRow k="Subtotal" v={inr(preview.totals.subtotal)} />
                  <TotalRow k="Discount" v={`- ${inr(preview.totals.discount_total)}`} />
                  {!!preview.scheme_total && <TotalRow k="Scheme" v={`- ${inr(preview.scheme_total)}`} />}
                  <TotalRow k="Taxable" v={inr(preview.totals.taxable_value)} />
                  {preview.intra_state ? (
                    <>
                      <TotalRow k="CGST" v={inr(preview.totals.cgst)} />
                      <TotalRow k="SGST" v={inr(preview.totals.sgst)} />
                    </>
                  ) : (
                    <TotalRow k="IGST" v={inr(preview.totals.igst)} />
                  )}
                  {!!preview.totals.cess && <TotalRow k="Cess" v={inr(preview.totals.cess)} />}
                  {!!preview.totals.round_off && <TotalRow k="Round off" v={inr(preview.totals.round_off)} />}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                    <span>Grand total</span><span>{inr(preview.totals.grand_total)}</span>
                  </div>
                </div>
                {preview.applied_schemes?.length ? (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>{preview.applied_schemes.length} scheme(s) applied</div>
                ) : null}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Category header + its rows (a table body fragment).
function FragmentGroup({ cat, count, children }: { cat: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <Td colSpan={5 as any} style={{ background: 'var(--s2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)', fontWeight: 700 }}>
          {cat} · {count}
        </Td>
      </tr>
      {children}
    </>
  );
}

function Stepper({ item, qty, onInc, onDec, onSet }: { item: OrderCatalogueItem; qty: number; onInc: () => void; onDec: () => void; onSet: (v: number) => void }) {
  const atMax = item.max_qty != null && qty >= item.max_qty;
  const btn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s2)',
    color: 'var(--text)', fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button style={btn} onClick={onDec} aria-label="decrease">−</button>
      <input
        value={qty}
        onChange={(e) => onSet(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
        inputMode="numeric"
        style={{ width: 46, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px', color: 'var(--text)', fontSize: 13 }}
      />
      <button style={{ ...btn, opacity: atMax ? 0.4 : 1, cursor: atMax ? 'not-allowed' : 'pointer' }} onClick={atMax ? undefined : onInc} aria-label="increase">+</button>
    </div>
  );
}

function TotalRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--text-dim)' }}>
      <span>{k}</span>
      <span style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>
    </div>
  );
}

// Credit banner driven by credit.status: ok = subtle green, warning = amber,
// exceeded = red, na = hidden. Never hard-blocks placement (backend allows it).
function CreditBanner({ credit }: { credit: OrderCredit }) {
  if (credit.status === 'na') return null;
  const theme = {
    ok:       { bg: 'rgba(34,197,94,0.10)',  br: 'rgba(34,197,94,0.35)',  fg: 'var(--green)' },
    warning:  { bg: 'rgba(245,158,11,0.10)', br: 'rgba(245,158,11,0.40)', fg: '#F59E0B' },
    exceeded: { bg: 'rgba(224,30,44,0.10)',  br: 'rgba(224,30,44,0.40)',  fg: 'var(--primary)' },
  }[credit.status];
  const headline =
    credit.status === 'exceeded'
      ? `Over credit limit by ${inr(Math.max(0, credit.projected_balance - (credit.credit_limit ?? 0)))}`
      : credit.status === 'warning'
        ? `Nearing credit limit — ${inr(credit.available ?? 0)} left`
        : 'Within credit limit';
  return (
    <div style={{ background: theme.bg, border: `1px solid ${theme.br}`, borderRadius: 12, padding: '12px 16px', marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, color: theme.fg, fontSize: 14 }}>
          {headline}
          {credit.utilization_pct != null && <span style={{ fontWeight: 500, color: 'var(--text-dim)', marginLeft: 8, fontSize: 12 }}>{credit.utilization_pct}% utilised</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
          <span>Limit <b style={{ color: 'var(--text)' }}>{inr(credit.credit_limit ?? 0)}</b></span>
          <span>Current <b style={{ color: 'var(--text)' }}>{inr(credit.current_balance)}</b></span>
          <span>Projected <b style={{ color: 'var(--text)' }}>{inr(credit.projected_balance)}</b></span>
        </div>
      </div>
    </div>
  );
}
