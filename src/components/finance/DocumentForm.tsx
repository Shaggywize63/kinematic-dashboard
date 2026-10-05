'use client';
// Shared create / edit form for invoices AND quotes (Zoho-Invoice layout).
// The totals shown here are a live preview from computeDraft(); the server recomputes on save.

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, Field, FormGrid, Input, Section, Select, Textarea, T, useIsCompact } from '../ui';
import { CustomerPicker, FinancePage, fail, inr, useDebounced } from './ui';
import SendDialog from './SendDialog';
import {
  Address, DocDetail, DocInput, DocLine, FinanceCustomer, FinanceItem, FinanceSettings, financeApi,
} from '../../lib/financeApi';
import { DURATION_PRESETS, addDaysIso, computeDraft, durationOf, num, todayIso } from '../../lib/financeFormat';
import { GST_STATES, GST_STATE_OPTIONS, stateCodeForName } from '../../lib/gstStates';

// ── helpers ─────────────────────────────────────────────────────────────────
interface Line {
  key: string; item_id: string | null; name: string; description: string; hsn_sac: string; unit: string;
  quantity: string; rate: string; discount_pct: string; gst_rate: string;
  /** '' = one-time; otherwise whole months (1, 3, 6, 12, …). The rate is per month. */
  duration: string;
}
let seq = 0;
const newKey = () => `l${++seq}`;
const blankLine = (): Line => ({ key: newKey(), item_id: null, name: '', description: '', hsn_sac: '', unit: '', quantity: '1', rate: '', discount_pct: '0', gst_rate: '18', duration: '' });
const isBlank = (l: Line) => !l.name.trim() && !l.description.trim() && !l.rate.trim() && !l.hsn_sac.trim() && !l.item_id;
const fromDocLine = (l: DocLine): Line => ({
  key: newKey(), item_id: l.item_id ?? null, name: l.name ?? '', description: l.description ?? '', hsn_sac: l.hsn_sac ?? '', unit: l.unit ?? '',
  quantity: String(num(l.quantity, 1)), rate: String(num(l.rate)), discount_pct: String(num(l.discount_pct)), gst_rate: String(num(l.gst_rate)),
  duration: durationOf(l.duration_months) ? String(durationOf(l.duration_months)) : '',
});

const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
const TERM_PRESETS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Due on Receipt' }, { value: '7', label: 'Net 7' }, { value: '15', label: 'Net 15' }, { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' }, { value: '60', label: 'Net 60' }, { value: 'custom', label: 'Custom…' },
];
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Customer place_of_supply may be a GST code ("27") or a state name — normalise to a code. */
function normState(v?: string | null): string {
  if (!v) return '';
  const t = String(v).trim();
  const code = t.padStart(2, '0');
  if (GST_STATES[code]) return code;
  return stateCodeForName(t) ?? '';
}

function addrText(a?: Address | null): string {
  if (!a) return '';
  return [a.attention, a.line1, a.line2, [a.city, a.state, a.pincode].filter(Boolean).join(', '), a.country && a.country !== 'India' ? a.country : '']
    .filter((x): x is string => !!x && !!String(x).trim()).join('\n');
}

const plain = (n: number) => num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── item typeahead (one per line) ───────────────────────────────────────────
function ItemTypeahead({ value, onText, onPick, invalid, label }: {
  value: string; onText: (v: string) => void; onPick: (item: FinanceItem) => void; invalid?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<FinanceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(value, 250);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let off = false;
    setBusy(true);
    financeApi.items.list({ q, status: 'active', limit: 20 })
      .then((r) => { if (!off) { setResults(r.data); setActive(-1); } })
      .catch(() => { if (!off) setResults([]); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [q, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (it: FinanceItem) => { setOpen(false); onPick(it); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && e.key === 'ArrowDown') { setOpen(true); return; }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
  };

  return (
    <div ref={box} style={{ position: 'relative', minWidth: 0 }}>
      <Input value={value} invalid={invalid} placeholder="Type to search items or enter a name" aria-label={label}
        role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { onText(e.target.value); setOpen(true); }} onKeyDown={onKey} />
      {open && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 60, top: 40, left: 0, right: 0, minWidth: 260, background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', maxHeight: 260, overflowY: 'auto' }}>
          {busy && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: T.mute }}>Searching…</div>}
          {!busy && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: T.mute }}>No saved items match — keep typing to use “{value || 'a custom line'}” as a free-text line.</div>}
          {results.map((it, i) => (
            <button key={it.id} type="button" role="option" aria-selected={i === active} className="km-navrow"
              onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, background: i === active ? 'var(--s3)' : 'transparent', cursor: 'pointer', color: T.text, fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, fontWeight: 600 }}>
                <span>{it.name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(it.selling_price)}</span>
              </div>
              <div style={{ fontSize: 12, color: T.mute }}>
                {[it.item_type === 'service' ? 'Service' : 'Goods', it.hsn_sac && `HSN/SAC ${it.hsn_sac}`, it.tax_preference === 'exempt' ? 'Tax exempt' : `GST ${it.gst_rate}%`].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── one line row ────────────────────────────────────────────────────────────
const numStyle: CSSProperties = { textAlign: 'right' };
const LINE_COLS = 'minmax(0,3fr) 72px 132px 100px 76px 92px 108px 32px';

function LineRow({ line, index, compact, errs, amount, taxExempt, canRemove, onChange, onPick, onRemove }: {
  line: Line; index: number; compact: boolean; errs?: { name?: string; qty?: string; rate?: string; disc?: string };
  amount: number; taxExempt: boolean; canRemove: boolean;
  onChange: (patch: Partial<Line>) => void; onPick: (item: FinanceItem) => void; onRemove: () => void;
}) {
  const n = index + 1;
  const gstValue = taxExempt ? '0' : line.gst_rate;
  const rates = Array.from(new Set([...GST_RATES, num(gstValue)])).sort((a, b) => a - b);

  const nameCell = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <ItemTypeahead value={line.name} invalid={!!errs?.name} label={`Item name, line ${n}`}
        onText={(v) => onChange({ name: v, item_id: null })} onPick={onPick} />
      {errs?.name && <div style={{ fontSize: 12, color: T.red }}>{errs.name}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Description (optional)" aria-label={`Description, line ${n}`} style={{ flex: '1 1 160px', width: 'auto', height: 32, fontSize: 13 }} />
        <Input value={line.hsn_sac} onChange={(e) => onChange({ hsn_sac: e.target.value })} placeholder="HSN/SAC" aria-label={`HSN or SAC code, line ${n}`} style={{ flex: '0 0 96px', width: 96, height: 32, fontSize: 13 }} />
        <Input value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} placeholder="Unit" aria-label={`Unit, line ${n}`} style={{ flex: '0 0 70px', width: 70, height: 32, fontSize: 13 }} />
      </div>
    </div>
  );
  const qty = <Input type="number" min={0} step="any" inputMode="decimal" value={line.quantity} invalid={!!errs?.qty} onChange={(e) => onChange({ quantity: e.target.value })} aria-label={`Quantity, line ${n}`} style={numStyle} />;
  const rate = <Input type="number" min={0} step="any" inputMode="decimal" value={line.rate} invalid={!!errs?.rate} onChange={(e) => onChange({ rate: e.target.value })} aria-label={`Rate, line ${n}`} style={numStyle} placeholder="0.00" />;
  const disc = <Input type="number" min={0} max={100} step="any" inputMode="decimal" value={line.discount_pct} invalid={!!errs?.disc} onChange={(e) => onChange({ discount_pct: e.target.value })} aria-label={`Discount percent, line ${n}`} style={numStyle} />;
  const gst = (
    <Select value={gstValue} disabled={taxExempt} onChange={(e) => onChange({ gst_rate: e.target.value })} aria-label={`GST percent, line ${n}`}>
      {rates.map((r) => <option key={r} value={String(r)}>{r}%</option>)}
    </Select>
  );
  const months = durationOf(line.duration);
  const durOptions = months && !DURATION_PRESETS.some((p) => p.months === months) ? [...DURATION_PRESETS, { months, label: `${months} months` }] : DURATION_PRESETS;
  const duration = (
    <Select value={months ? String(months) : ''} onChange={(e) => onChange({ duration: e.target.value })} aria-label={`Duration, line ${n}`}>
      <option value="">One-time</option>
      {durOptions.map((p) => <option key={p.months} value={String(p.months)}>{p.label}</option>)}
    </Select>
  );
  const amountCell = (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: T.text, fontSize: 14 }}>{inr(amount)}</div>
      {months && <div style={{ fontSize: 11, color: T.mute, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{num(line.quantity, 1)} × {num(line.rate)} × {months} mo</div>}
    </div>
  );
  const remove = (
    <Button variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove} aria-label={`Remove line ${n}`} title="Remove line" style={{ padding: 0, width: 30 }}>✕</Button>
  );

  if (compact) {
    const lab = (t: string, c: ReactNode, e?: string) => <Field label={t} error={e}>{c}</Field>;
    return (
      <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.mute }}>Line {n}</span>{remove}
        </div>
        {nameCell}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {lab('Qty', qty, errs?.qty)}{lab('Duration', duration)}{lab('Rate (per month if a duration is set)', rate, errs?.rate)}{lab('Discount %', disc, errs?.disc)}{lab('GST %', gst)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: T.dim }}>Amount{amountCell}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: LINE_COLS, gap: 8, alignItems: 'start', padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
      {nameCell}
      <div>{qty}{errs?.qty && <div style={{ fontSize: 11.5, color: T.red, marginTop: 4 }}>{errs.qty}</div>}</div>
      <div>{duration}</div>
      <div>{rate}{errs?.rate && <div style={{ fontSize: 11.5, color: T.red, marginTop: 4 }}>{errs.rate}</div>}</div>
      <div>{disc}{errs?.disc && <div style={{ fontSize: 11.5, color: T.red, marginTop: 4 }}>{errs.disc}</div>}</div>
      {gst}
      <div style={{ paddingTop: 9 }}>{amountCell}</div>
      <div style={{ paddingTop: 3 }}>{remove}</div>
    </div>
  );
}

function TotalRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: strong ? '10px 0' : '5px 0', fontSize: strong ? 16 : 13.5, fontWeight: strong ? 700 : 400, color: strong ? T.text : T.dim, borderTop: strong ? `1px solid ${T.border}` : undefined, marginTop: strong ? 6 : 0 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: T.text }}>{children}</span>
    </div>
  );
}

// ── the form ────────────────────────────────────────────────────────────────
export interface DocumentFormProps {
  type: 'invoice' | 'quote';
  mode: 'create' | 'edit';
  initial?: DocDetail;
  /** Create mode: pre-select this customer (from ?customer_id=). */
  initialCustomerId?: string | null;
}

export default function DocumentForm({ type, mode, initial, initialCustomerId }: DocumentFormProps) {
  const router = useRouter();
  const page = useIsCompact(900);
  const compactLines = useIsCompact(1100);
  const isInvoice = type === 'invoice';
  const noun = isInvoice ? 'Invoice' : 'Quote';
  const api = isInvoice ? financeApi.invoices : financeApi.quotes;
  const listPath = `/dashboard/finance/${type}s`;
  const lockCustomer = mode === 'edit' && num(initial?.amount_paid) > 0;

  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const settingsRef = useRef<FinanceSettings | null>(null);
  const customerSeen = useRef(!!initial);
  const applyOnLoad = useRef(!initial && !!initialCustomerId);

  const [customerId, setCustomerId] = useState<string | null>(initial?.customer_id ?? initialCustomerId ?? null);
  const [customer, setCustomer] = useState<FinanceCustomer | null>(null);
  const [billTo, setBillTo] = useState<Address>(initial?.bill_to ?? {});
  const [shipTo, setShipTo] = useState<Address>(initial?.ship_to ?? {});
  const [reference, setReference] = useState(initial?.reference_number ?? '');
  const [issueDate, setIssueDate] = useState((initial?.issue_date ?? todayIso()).slice(0, 10));
  const initDays = initial ? num(initial.payment_terms_days) : 0;
  const [terms, setTerms] = useState(TERM_PRESETS.some((p) => p.value === String(initDays)) ? String(initDays) : 'custom');
  const [customDays, setCustomDays] = useState(String(initDays));
  const [dueOverride, setDueOverride] = useState<string | null>(
    initial?.due_date && initial.due_date.slice(0, 10) !== addDaysIso(initial.issue_date.slice(0, 10), initDays) ? initial.due_date.slice(0, 10) : null);
  const [expiryOverride, setExpiryOverride] = useState<string | null>(
    initial?.expiry_date && initial.expiry_date.slice(0, 10) !== addDaysIso(initial.issue_date.slice(0, 10), 30) ? initial.expiry_date.slice(0, 10) : null);
  const [place, setPlace] = useState(normState(initial?.place_of_supply));
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [lines, setLines] = useState<Line[]>(() => (initial?.items?.length ? initial.items.map(fromDocLine) : [blankLine()]));
  const [adjustment, setAdjustment] = useState(initial && num(initial.adjustment) ? String(num(initial.adjustment)) : '');
  const [adjLabel, setAdjLabel] = useState(initial?.adjustment_label ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [termsText, setTermsText] = useState(initial?.terms ?? '');

  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendDoc, setSendDoc] = useState<DocDetail | null>(null);

  const days = terms === 'custom' ? Math.max(0, Math.round(num(customDays))) : num(terms);
  const dueDate = dueOverride ?? (isIso(issueDate) ? addDaysIso(issueDate, days) : '');
  const expiryDate = expiryOverride ?? (isIso(issueDate) ? addDaysIso(issueDate, 30) : '');
  const taxExempt = customer?.tax_preference === 'exempt';

  const setTermsFromDays = (d: number) => {
    const s = String(Math.max(0, Math.round(d)));
    if (TERM_PRESETS.some((p) => p.value === s)) setTerms(s);
    else { setTerms('custom'); setCustomDays(s); }
  };

  // Seller settings: state code (intra / inter-state), default notes & terms (create only).
  useEffect(() => {
    let off = false;
    financeApi.settings.get().then((r) => {
      if (off) return;
      const s = r.data;
      settingsRef.current = s;
      setSettings(s);
      setPlace((p) => p || normState(s.state_code));
      if (mode === 'create') {
        setNotes((v) => v || s.default_notes || '');
        setTermsText((v) => v || s.default_terms || '');
        if (!customerSeen.current) setTermsFromDays(num(s.default_payment_terms_days));
      }
    }).catch((e) => { if (!off) fail(e, 'Could not load Finance settings'); });
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Customer-driven defaults: place of supply, terms, addresses, tax preference. */
  const applyCustomer = (c: FinanceCustomer) => {
    customerSeen.current = true;
    setCustomer(c);
    setCustomerId(c.id);
    setPlace(normState(c.place_of_supply) || normState(settingsRef.current?.state_code) || '');
    setTermsFromDays(num(c.payment_terms_days));
    setDueOverride(null);
    setBillTo(c.billing_address ?? {});
    setShipTo(c.shipping_address ?? {});
  };

  // Resolve the full customer when only an id is known (edit, ?customer_id= deep link).
  useEffect(() => {
    if (!customerId || customer?.id === customerId) return;
    let off = false;
    financeApi.customers.get(customerId).then((r) => {
      if (off) return;
      if (applyOnLoad.current) { applyOnLoad.current = false; applyCustomer(r.data); } else setCustomer(r.data);
    }).catch((e) => { if (!off) fail(e, 'Could not load the customer'); });
    return () => { off = true; };
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickCustomer = (c: FinanceCustomer | null) => {
    if (c) applyCustomer(c);
    else { setCustomer(null); setCustomerId(null); }
  };

  // ── lines ──
  const patchLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, it: FinanceItem) => patchLine(key, {
    item_id: it.id, name: it.name, description: it.description ?? '', hsn_sac: it.hsn_sac ?? '', unit: it.unit ?? '',
    rate: String(num(it.selling_price)), gst_rate: it.tax_preference === 'exempt' ? '0' : String(num(it.gst_rate)),
    quantity: '1',
  });
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blankLine()]));

  // ── live totals ──
  const calc = useMemo(() => computeDraft(
    lines.map((l) => ({ ...l, quantity: l.quantity.trim() === '' ? 0 : l.quantity, gst_rate: taxExempt ? 0 : l.gst_rate, duration_months: l.duration })),
    { sellerStateCode: settings?.state_code ?? initial?.seller_state_code, placeOfSupply: place || null, adjustment: num(adjustment), taxExempt },
  ), [lines, settings, initial, place, adjustment, taxExempt]);
  const t = calc.totals;

  const taxRows = useMemo(() => {
    const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
    lines.forEach((l, i) => {
      const r = taxExempt ? 0 : num(l.gst_rate);
      if (r === 0) return;
      const cur = byRate.get(r) ?? { cgst: 0, sgst: 0, igst: 0 };
      cur.cgst += calc.lines[i].cgst; cur.sgst += calc.lines[i].sgst; cur.igst += calc.lines[i].igst;
      byRate.set(r, cur);
    });
    const rows: Array<[string, number]> = [];
    Array.from(byRate.entries()).sort((a, b) => a[0] - b[0]).forEach(([r, v]) => {
      if (calc.intraState) rows.push([`CGST (${r / 2}%)`, v.cgst], [`SGST (${r / 2}%)`, v.sgst]);
      else rows.push([`IGST (${r}%)`, v.igst]);
    });
    return rows;
  }, [lines, calc, taxExempt]);

  // ── validation ──
  const check = useMemo(() => {
    const lineErrs: Record<string, { name?: string; qty?: string; rate?: string; disc?: string }> = {};
    let valid = 0;
    for (const l of lines) {
      if (isBlank(l)) continue;
      const e: { name?: string; qty?: string; rate?: string; disc?: string } = {};
      if (!l.name.trim()) e.name = 'Enter an item name';
      if (!(num(l.quantity) > 0)) e.qty = 'Qty must be > 0';
      if (l.rate.trim() !== '' && num(l.rate) < 0) e.rate = 'Cannot be negative';
      if (num(l.discount_pct) < 0 || num(l.discount_pct) > 100) e.disc = '0–100 only';
      if (Object.keys(e).length) lineErrs[l.key] = e; else valid++;
    }
    return {
      customer: customerId ? undefined : 'Select a customer',
      issue: isIso(issueDate) ? undefined : `Enter the ${noun.toLowerCase()} date`,
      due: isInvoice && dueDate && isIso(issueDate) && dueDate < issueDate ? 'Due date cannot be before the invoice date' : undefined,
      noLines: valid === 0 && Object.keys(lineErrs).length === 0 ? 'Add at least one line item with a name and quantity' : undefined,
      lineErrs,
      ok: !!customerId && isIso(issueDate) && valid > 0 && Object.keys(lineErrs).length === 0
        && !(isInvoice && dueDate && dueDate < issueDate),
    };
  }, [lines, customerId, issueDate, dueDate, isInvoice, noun]);
  const show = submitted;

  const save = async (andSend: boolean) => {
    setSubmitted(true);
    if (!check.ok) { toast.error('Please fix the highlighted fields'); return; }
    const items: DocLine[] = lines.filter((l) => !isBlank(l)).map((l) => ({
      ...(l.item_id ? { item_id: l.item_id } : {}),
      name: l.name.trim(), description: l.description.trim() || null, hsn_sac: l.hsn_sac.trim() || null, unit: l.unit.trim() || null,
      quantity: num(l.quantity), rate: num(l.rate), discount_pct: Math.min(100, Math.max(0, num(l.discount_pct))),
      gst_rate: taxExempt ? 0 : Math.max(0, num(l.gst_rate)),
      duration_months: durationOf(l.duration),
    }));
    const payload: DocInput = {
      customer_id: customerId as string,
      reference_number: reference.trim() || null, subject: subject.trim() || null,
      issue_date: issueDate,
      ...(isInvoice ? { due_date: dueDate || null, payment_terms_days: days } : { expiry_date: expiryDate || null }),
      place_of_supply: place || null,
      bill_to: billTo, ship_to: shipTo, items,
      adjustment: num(adjustment), adjustment_label: adjLabel.trim() || null,
      notes: notes.trim(), terms: termsText.trim(),
    };
    setBusy(true);
    try {
      const res = mode === 'edit' && initial ? await api.update(initial.id, payload) : await api.create(payload);
      const saved = res.data;
      toast.success(mode === 'edit' ? `${noun} ${saved.number} updated` : `${noun} ${saved.number} saved as draft`);
      if (andSend) setSendDoc(saved);
      else router.push(`${listPath}/${saved.id}`);
    } catch (e) {
      fail(e, `Could not save the ${noun.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => router.push(mode === 'edit' && initial ? `${listPath}/${initial.id}` : listPath);
  const draftLabel = mode === 'edit' && initial && initial.status !== 'draft' ? 'Save' : 'Save as Draft';
  const title = mode === 'edit' ? `Edit ${noun}${initial ? ` ${initial.number}` : ''}` : `New ${noun}`;
  const billText = addrText(billTo), shipText = addrText(shipTo);

  return (
    <FinancePage title={title} maxWidth={1180}>
      <Card>
        <Section eyebrow="Details" first style={{ paddingBottom: 0 }}>
          <Field label="Customer" required error={show ? check.customer : undefined}
            hint={lockCustomer ? 'The customer cannot be changed because payments are recorded against this invoice.' : undefined}>
            <CustomerPicker value={customerId} onChange={onPickCustomer} invalid={show && !!check.customer} disabled={lockCustomer} />
          </Field>
          {taxExempt && (
            <div role="status" style={{ padding: '8px 12px', borderRadius: T.radius.md, background: T.infoWash, color: T.info, fontSize: 13 }}>
              Customer is tax exempt — GST is not charged on this {noun.toLowerCase()}.
            </div>
          )}
          {(billText || shipText) && (
            <div style={{ display: 'grid', gridTemplateColumns: page ? '1fr' : '1fr 1fr', gap: 16 }}>
              {billText && <div><div style={{ fontSize: 11.5, fontWeight: 600, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Billing address</div><div style={{ fontSize: 13, color: T.dim, whiteSpace: 'pre-line', marginTop: 4 }}>{billText}</div></div>}
              {shipText && <div><div style={{ fontSize: 11.5, fontWeight: 600, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shipping address</div><div style={{ fontSize: 13, color: T.dim, whiteSpace: 'pre-line', marginTop: 4 }}>{shipText}</div></div>}
            </div>
          )}
          <FormGrid narrow={page} columns={3}>
            <Field label={`${noun} date`} required htmlFor="doc-date" error={show ? check.issue : undefined}>
              <Input id="doc-date" type="date" value={issueDate} invalid={show && !!check.issue} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            {isInvoice ? (
              <>
                <Field label="Terms" htmlFor="doc-terms">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Select id="doc-terms" value={terms} onChange={(e) => { setTerms(e.target.value); setDueOverride(null); }}>
                      {TERM_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                    {terms === 'custom' && (
                      <Input type="number" min={0} step={1} inputMode="numeric" value={customDays} aria-label="Custom payment terms in days" title="Days"
                        onChange={(e) => { setCustomDays(e.target.value); setDueOverride(null); }} style={{ width: 84, flex: '0 0 84px' }} />
                    )}
                  </div>
                </Field>
                <Field label="Due date" htmlFor="doc-due" error={show ? check.due : undefined} hint={dueOverride ? 'Set manually' : 'Calculated from the terms'}>
                  <Input id="doc-due" type="date" value={dueDate} invalid={show && !!check.due} onChange={(e) => setDueOverride(e.target.value || null)} />
                </Field>
              </>
            ) : (
              <Field label="Expiry date" htmlFor="doc-expiry" hint={expiryOverride ? 'Set manually' : 'Defaults to 30 days after the quote date'}>
                <Input id="doc-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryOverride(e.target.value || null)} />
              </Field>
            )}
            <Field label="Reference / Order number" htmlFor="doc-ref">
              <Input id="doc-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-1042" />
            </Field>
            <Field label="Place of supply" htmlFor="doc-pos"
              hint={place && (settings?.state_code ?? initial?.seller_state_code) ? (calc.intraState ? 'Intra-state supply: CGST + SGST' : 'Inter-state supply: IGST') : undefined}>
              <Select id="doc-pos" value={place} onChange={(e) => setPlace(e.target.value)}>
                <option value="">Select state / UT</option>
                {GST_STATE_OPTIONS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Subject" htmlFor="doc-subject">
              <Input id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this is for" />
            </Field>
          </FormGrid>
        </Section>
      </Card>

      <Card>
        <Section eyebrow="Item table" first style={{ paddingBottom: 0 }}>
          {!compactLines && (
            <div style={{ display: 'grid', gridTemplateColumns: LINE_COLS, gap: 8, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, paddingBottom: 8 }}>
              <span>Item details</span><span style={{ textAlign: 'right' }}>Qty</span><span>Duration</span><span style={{ textAlign: 'right' }}>Rate</span>
              <span style={{ textAlign: 'right' }}>Disc %</span><span>GST</span><span style={{ textAlign: 'right' }}>Amount</span><span />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: compactLines ? 12 : 0 }}>
            {lines.map((l, i) => (
              <LineRow key={l.key} line={l} index={i} compact={compactLines} errs={show ? check.lineErrs[l.key] : undefined}
                amount={calc.lines[i]?.taxable_value ?? 0} taxExempt={taxExempt} canRemove={lines.length > 1 || !isBlank(l)}
                onChange={(p) => patchLine(l.key, p)} onPick={(it) => pickItem(l.key, it)} onRemove={() => removeLine(l.key)} />
            ))}
          </div>
          {show && check.noLines && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{check.noLines}</div>}
          <div>
            <Button size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>＋ Add line</Button>
          </div>
        </Section>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: page ? '1fr' : 'minmax(0,1fr) 380px', gap: 18, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Customer notes" htmlFor="doc-notes" hint="Shown on the document.">
              <Textarea id="doc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thanks for your business." />
            </Field>
            <Field label="Terms & conditions" htmlFor="doc-terms-text">
              <Textarea id="doc-terms-text" rows={4} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <div aria-label="Totals">
            <TotalRow label={num(t.discount_total) > 0 ? 'Sub total (before discount)' : 'Sub total'}>{plain(t.subtotal)}</TotalRow>
            {t.discount_total > 0 && <TotalRow label="Discount">(-) {plain(t.discount_total)}</TotalRow>}
            {taxRows.map(([k, v]) => <TotalRow key={k} label={k}>{plain(v)}</TotalRow>)}
            {taxRows.length === 0 && t.taxable_value > 0 && <TotalRow label="GST">{plain(0)}</TotalRow>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 8, alignItems: 'center', padding: '6px 0' }}>
              <Input value={adjLabel} onChange={(e) => setAdjLabel(e.target.value)} placeholder="Adjustment" aria-label="Adjustment label" style={{ height: 32, fontSize: 13 }} />
              <Input type="number" step="any" inputMode="decimal" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="0.00" aria-label="Adjustment amount (negative to reduce)" style={{ height: 32, fontSize: 13, textAlign: 'right' }} />
            </div>
            {num(t.round_off) !== 0 && <TotalRow label="Round off">{plain(t.round_off)}</TotalRow>}
            <TotalRow label="Total (₹)" strong>{inr(t.total)}</TotalRow>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Save and Send'}</Button>
        <Button onClick={() => save(false)} disabled={busy}>{draftLabel}</Button>
        <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
        {show && !check.ok && <span role="alert" style={{ fontSize: 12.5, color: T.red }}>Some required fields need attention.</span>}
      </div>

      {sendDoc && (
        <SendDialog type={type} doc={sendDoc}
          onSent={() => undefined}
          onClose={() => router.push(`${listPath}/${sendDoc.id}`)} />
      )}
    </FinancePage>
  );
}
