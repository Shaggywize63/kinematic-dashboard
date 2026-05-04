// INR (₹) currency formatting. Uses Indian numbering system (lakhs, crores).
// Default currency for the CRM module per ops decision (Apr 2026).

export function formatINR(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (!isFinite(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

// Compact form for chart axes/tooltips: ₹1.2L, ₹50Cr, ₹500k.
export function formatINRCompact(n: number | string | null | undefined): string {
  const raw = Number(n ?? 0);
  if (!isFinite(raw)) return '₹0';
  const num = Math.abs(raw);
  const sign = raw < 0 ? '-' : '';
  if (num >= 1_00_00_000) {
    const v = num / 1_00_00_000;
    return `${sign}₹${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}Cr`;
  }
  if (num >= 1_00_000) {
    const v = num / 1_00_000;
    return `${sign}₹${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}L`;
  }
  if (num >= 1_000) return `${sign}₹${(num / 1_000).toFixed(0)}k`;
  return `${sign}₹${num}`;
}
