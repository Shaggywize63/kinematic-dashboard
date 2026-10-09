// Rupee amounts for the Sales / Collection targets: Indian digit grouping (12,34,567), whole-rupee targets and
// two-decimal entries, with the same ceiling the API enforces.

export const MAX_RUPEES = 1_000_000_000;

const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** 1234567 -> "₹12,34,567"; 99.5 -> "₹99.5". */
export const fmtRupees = (n: number | null | undefined): string => `₹${IN.format(Number(n) || 0)}`;

/** The bare grouped number, no symbol: 1500000 -> "15,00,000". */
export const fmtGrouped = (n: number | null | undefined): string => IN.format(Number(n) || 0);

/** The ceiling as a user reads it, "₹1,00,00,00,000". */
export const MAX_RUPEES_LABEL = fmtRupees(MAX_RUPEES);

/**
 * What a rupee box shows as the person types: digits only (plus one decimal point and two decimals when
 * `decimals`), grouped the Indian way. "" stays "". At most 12 integer digits, so the ceiling check below can
 * report an over-large number instead of losing precision.
 */
export function groupRupeeInput(raw: string, decimals = false): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [intPart = '', ...rest] = cleaned.split('.');
  const digits = intPart.replace(/^0+(?=\d)/, '').slice(0, 12);
  const grouped = digits ? IN.format(Number(digits)) : '';
  if (!decimals || !rest.length) return grouped;
  return `${grouped || '0'}.${rest.join('').slice(0, 2)}`;
}

/** The number in a rupee box, or null when it is blank / not a number. */
export function parseRupeeInput(text: string): number | null {
  const t = text.replace(/,/g, '').trim();
  if (!t || !/^\d*\.?\d*$/.test(t) || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
