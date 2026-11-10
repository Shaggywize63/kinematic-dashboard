/**
 * Pure roll-up for the Activity Heatmap report (kept out of the page file: a Next.js page may only export the page).
 */
import type { ActivityHeatPoint } from '../../types/crm';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export interface DayRow { weekday: string; order: number; activities: number; share_pct: number | null; days_in_window: number; avg_per_day: number | null; busiest_hour: string }

/**
 * Pure: roll the date x hour grid up by weekday. The grid carries every day of the window (including empty days), so
 * "days in window" is the number of that weekday in it. Dates and hours are UTC, as in the heatmap.
 */
export function weekdayRows(data: ActivityHeatPoint[]): DayRow[] {
  const perDay = new Map<number, { total: number; days: Set<string>; byHour: Map<number, number> }>();
  let all = 0;
  for (const p of data) {
    if (typeof p.hour !== 'number') continue;
    const dow = new Date(`${p.date}T00:00:00Z`).getUTCDay();
    const e = perDay.get(dow) ?? { total: 0, days: new Set<string>(), byHour: new Map<number, number>() };
    e.total += p.count; e.days.add(p.date); e.byHour.set(p.hour, (e.byHour.get(p.hour) ?? 0) + p.count);
    perDay.set(dow, e);
    all += p.count;
  }
  return Array.from(perDay.entries()).map(([dow, e]) => {
    let hour = -1, best = 0;
    e.byHour.forEach((v, h) => { if (v > best) { best = v; hour = h; } });
    return {
      weekday: DOW[dow], order: dow === 0 ? 7 : dow, activities: e.total, share_pct: all ? Math.round((e.total / all) * 1000) / 10 : null,
      days_in_window: e.days.size, avg_per_day: e.days.size ? Math.round((e.total / e.days.size) * 10) / 10 : null,
      busiest_hour: best > 0 ? `${String(hour).padStart(2, '0')}:00` : '—',
    };
  }).sort((a, b) => a.order - b.order);
}

