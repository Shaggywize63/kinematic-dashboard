import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DateRangePreset = 'today' | '7d' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd' | 'all' | 'custom';

export interface DateRangeState {
  preset: DateRangePreset;
  // ISO strings; undefined means "unbounded"
  from?: string;
  to?: string;
  setPreset: (preset: DateRangePreset) => void;
  setCustom: (from: string, to: string) => void;
  // Returns { from, to } as a stable object to spread into API params.
  // Filtered out when sent over the wire if undefined.
  asParams: () => { from?: string; to?: string };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function computeRange(preset: DateRangePreset): { from?: string; to?: string } {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  switch (preset) {
    case 'today':
      return { from: today.toISOString(), to: todayEnd.toISOString() };
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: todayEnd.toISOString() };
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: todayEnd.toISOString() };
    case '90d':
      return { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: todayEnd.toISOString() };
    case 'mtd':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: todayEnd.toISOString() };
    case 'qtd': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qStartMonth, 1).toISOString(), to: todayEnd.toISOString() };
    }
    case 'ytd':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: todayEnd.toISOString() };
    case 'all':
    case 'custom':
      return {};
  }
}

export const useCrmDateRange = create<DateRangeState>()(
  persist(
    (set, get) => ({
      preset: '30d',
      ...computeRange('30d'),
      setPreset: (preset) => {
        if (preset === 'custom') {
          // Keep current from/to; UI will surface inputs.
          set({ preset });
          return;
        }
        set({ preset, ...computeRange(preset) });
      },
      setCustom: (from, to) => set({ preset: 'custom', from, to }),
      asParams: () => {
        const { from, to } = get();
        return { from, to };
      },
    }),
    { name: 'crm:date-range' }
  )
);
