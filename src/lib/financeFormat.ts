// Formatting + a client-side mirror of the backend's totals maths
// (Kinematic: src/services/finance/money.ts + src/services/tax.ts).
// The server recomputes on save and is authoritative; this only powers the live preview.

export const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : d;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const taxRound = (n: number) => Math.round(n * 100) / 100; // matches the backend tax helper

export const inr = (n: unknown): string =>
  `₹${num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const plainAmount = (n: unknown): string =>
  num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 2026-10-02 → 02/10/2026 */
export const fmtDate = (iso?: string | null): string => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Add whole months, clamping the day to the target month (Jan 31 + 1m → Feb 28). */
export const addMonthsIso = (iso: string, months: number): string => {
  const [y, m, dd] = iso.split('-').map(Number);
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12);
  const tm0 = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm0 + 1, 0)).getUTCDate();
  const day = Math.min(dd, last);
  return `${String(ty).padStart(4, '0')}-${String(tm0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Recurring-invoice date math — a client mirror of the backend's recurrence.ts,
// so the form can preview the next invoice date. The server recomputes on save.
export type RecurrenceInterval = 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'custom';
export interface RecurrencePreviewSpec { interval: RecurrenceInterval; customEvery?: number | null; customUnit?: 'day' | 'month' | null }
const REC_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

export function addRecurrence(iso: string, spec: RecurrencePreviewSpec): string {
  if (spec.interval === 'weekly') return addDaysIso(iso, 7);
  if (spec.interval === 'custom') {
    const n = Math.max(1, Math.floor(num(spec.customEvery, 1)));
    return spec.customUnit === 'day' ? addDaysIso(iso, n) : addMonthsIso(iso, n);
  }
  return addMonthsIso(iso, REC_MONTHS[spec.interval] ?? 1);
}

/** First occurrence strictly after `today`, anchored to `start`'s cadence (mirror of firstFutureFrom). */
export function nextInvoiceDatePreview(start: string, spec: RecurrencePreviewSpec, today: string): string {
  let next = addRecurrence(start, spec);
  for (let i = 0; i < 600 && next <= today; i++) next = addRecurrence(next, spec);
  return next;
}

export interface DraftLine {
  item_id?: string | null;
  name: string;
  description?: string | null;
  hsn_sac?: string | null;
  unit?: string | null;
  quantity: number | string;
  rate: number | string;
  discount_pct?: number | string;
  gst_rate?: number | string;
  duration_months?: number | string | null;
}

/** Whole months 1..120, else null (one-time). Mirrors the server. */
export const durationOf = (v: unknown): number | null => {
  const n = Math.round(num(v, NaN));
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : null;
};

/** Presets for a line's billing duration. The rate is per month, so Amount = Qty × Rate × months. */
export const DURATION_PRESETS: Array<{ months: number; label: string }> = [
  { months: 1, label: 'Monthly' }, { months: 3, label: 'Quarterly' }, { months: 6, label: 'Half-yearly' }, { months: 12, label: 'Yearly' },
];

/** "3 months (Quarter)" — printed under the item on the invoice. */
export function durationLabel(months: unknown): string | null {
  const m = durationOf(months);
  if (m === null) return null;
  const named: Record<number, string> = { 1: 'Month', 3: 'Quarter', 6: 'Half-year', 12: 'Year' };
  return named[m] ? `${m} month${m === 1 ? '' : 's'} (${named[m]})` : `${m} months`;
}

export interface DraftLineResult { taxable_value: number; cgst: number; sgst: number; igst: number; total: number }
export interface DraftTotals {
  subtotal: number; discount_total: number; taxable_value: number; cgst: number; sgst: number; igst: number;
  tax_total: number; adjustment: number; round_off: number; total: number;
}

export function isIntraState(sellerStateCode?: string | null, placeOfSupply?: string | null): boolean {
  if (!sellerStateCode || !placeOfSupply) return true;
  return String(sellerStateCode).trim() === String(placeOfSupply).trim();
}

export function computeDraft(
  lines: DraftLine[],
  o: { sellerStateCode?: string | null; placeOfSupply?: string | null; adjustment?: number | string; taxExempt?: boolean },
): { lines: DraftLineResult[]; totals: DraftTotals; intraState: boolean } {
  const intra = isIntraState(o.sellerStateCode, o.placeOfSupply);
  const out = lines.map((l) => {
    const gross = round2(num(l.quantity, 1) * num(l.rate) * (durationOf(l.duration_months) ?? 1));
    const pct = Math.min(100, Math.max(0, num(l.discount_pct)));
    const discount = round2((gross * pct) / 100);
    const taxable = round2(gross - discount);
    const rate = o.taxExempt ? 0 : Math.max(0, num(l.gst_rate));
    const gst = taxRound((taxable * rate) / 100);
    const half = taxRound(gst / 2);
    return {
      gross, discount, taxable_value: taxable,
      cgst: intra ? half : 0, sgst: intra ? taxRound(gst - half) : 0, igst: intra ? 0 : gst,
      total: taxRound(taxable + gst),
    };
  });
  const sum = (f: (l: (typeof out)[number]) => number) => round2(out.reduce((s, l) => s + f(l), 0));
  const taxable_value = sum((l) => l.taxable_value);
  const cgst = sum((l) => l.cgst), sgst = sum((l) => l.sgst), igst = sum((l) => l.igst);
  const tax_total = round2(cgst + sgst + igst);
  const adjustment = round2(num(o.adjustment));
  const exact = round2(taxable_value + tax_total + adjustment);
  const total = Math.round(exact);
  return {
    intraState: intra,
    lines: out.map(({ taxable_value, cgst, sgst, igst, total }) => ({ taxable_value, cgst, sgst, igst, total })),
    totals: {
      subtotal: sum((l) => l.gross), discount_total: sum((l) => l.discount), taxable_value, cgst, sgst, igst, tax_total,
      adjustment, round_off: round2(total - exact), total,
    },
  };
}

// ── Amount in words (Indian numbering) ──────────────────────────────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}
export function amountInWords(amount: number, currency = 'INR'): string {
  const abs = Math.abs(round2(amount));
  let rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  const segs: string[] = [];
  const crore = Math.floor(rupees / 10_000_000); rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000); rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  if (crore) segs.push(`${below1000(crore)} Crore`);
  if (lakh) segs.push(`${below1000(lakh)} Lakh`);
  if (thousand) segs.push(`${below1000(thousand)} Thousand`);
  if (rupees) segs.push(below1000(rupees));
  const main = segs.length ? segs.join(' ') : 'Zero';
  if (currency !== 'INR') return `${currency} ${main}${paise ? ` and ${below1000(paise)} Cents` : ''} Only`;
  return `Indian Rupee ${main}${paise ? ` and ${below1000(paise)} Paise` : ''} Only`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open a blob (e.g. a PDF) in a new tab. */
export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
