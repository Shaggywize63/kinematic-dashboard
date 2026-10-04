// Client-side date-range presets for finance reports. All values are YYYY-MM-DD strings (no timezone maths).

export type RangePreset = 'this_month' | 'last_month' | 'this_quarter' | 'this_fy' | 'last_fy' | 'custom';
export interface DateRange { from: string; to: string }

export const PRESET_LABELS: Array<{ value: RangePreset; label: string }> = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_fy', label: 'This Fiscal Year' },
  { value: 'last_fy', label: 'Last Fiscal Year' },
  { value: 'custom', label: 'Custom' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1-based
/** Absolute month index: year*12 + (month-1). */
const abs = (y: number, m: number) => y * 12 + (m - 1);
const firstOf = (a: number) => ymd(Math.floor(a / 12), (a % 12) + 1, 1);
const lastOf = (a: number) => { const y = Math.floor(a / 12), m = (a % 12) + 1; return ymd(y, m, daysIn(y, m)); };

export function presetRange(preset: Exclude<RangePreset, 'custom'>, fyStartMonth: number, now = new Date()): DateRange {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const fy = Math.min(12, Math.max(1, Math.round(fyStartMonth) || 4));
  const cur = abs(y, m);
  switch (preset) {
    case 'this_month': return { from: firstOf(cur), to: lastOf(cur) };
    case 'last_month': return { from: firstOf(cur - 1), to: lastOf(cur - 1) };
    case 'this_quarter': {
      const sinceFy = (m - fy + 12) % 12;
      const start = cur - (sinceFy % 3);
      return { from: firstOf(start), to: lastOf(start + 2) };
    }
    case 'this_fy':
    case 'last_fy': {
      const sinceFy = (m - fy + 12) % 12;
      const start = cur - sinceFy - (preset === 'last_fy' ? 12 : 0);
      return { from: firstOf(start), to: lastOf(start + 11) };
    }
  }
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
