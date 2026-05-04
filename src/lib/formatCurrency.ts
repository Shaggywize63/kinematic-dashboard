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
