export function formatINR(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return '₹0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

export function formatINRCompact(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v) || v === 0) return '₹0';
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (abs >= 100_000) return `₹${(v / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 1_000) return `₹${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return formatINR(v);
}

// Backend returns weights in kilograms. Render kg under a tonne, tonnes
// otherwise, and a compact T / KT form for the chart axes.
export function formatKg(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return '0 kg';
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const t = v / 1000;
    return `${t.toLocaleString('en-IN', { maximumFractionDigits: t < 100 ? 2 : 0 })} T`;
  }
  return `${Math.round(v).toLocaleString('en-IN')} kg`;
}

export function formatKgCompact(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v) || v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}KT`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}T`;
  return `${Math.round(v)} kg`;
}

// Unit-aware combo formatters — the dashboard passes `unit` and these route
// to the right pair so call sites stay readable.
export type DashboardUnit = 'inr' | 'weight';
export const fmtValue = (n: number | string | null | undefined, unit: DashboardUnit) =>
  unit === 'weight' ? formatKg(n) : formatINR(n);
export const fmtValueCompact = (n: number | string | null | undefined, unit: DashboardUnit) =>
  unit === 'weight' ? formatKgCompact(n) : formatINRCompact(n);
