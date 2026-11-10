/**
 * Derived measures for the existing FFM analytics datasets — PURE, no imports.
 *
 * The backend rows for the original widgets carry the raw counts; the "missing
 * measure" a manager reaches for next (how many were missed, share of total, per-visit
 * value …) is a subtraction or a division of fields already there. Doing it here keeps
 * the endpoints unchanged and gives the widget tables and the custom-chart builder the
 * same extra fields (fetchFfmDataset runs every dataset through enrichFfmRows).
 *
 * Every function tolerates sparse rows: a missing / non-numeric field reads as 0 and a
 * ratio with a zero denominator is 0 (or null where "0" would mislead).
 */
type Row = Record<string, unknown>;

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const has = (v: unknown): boolean => v !== undefined && v !== null && Number.isFinite(Number(v));
const r1 = (x: number): number => Math.round(x * 10) / 10;

export function enrichFfmRows(id: string, input: unknown[]): unknown[] {
  const rows = (Array.isArray(input) ? input : []) as Row[];
  switch (id) {
    case 'beat_adherence':
      return rows.map((r) => ({ ...r, missed: Math.max(0, n(r.planned) - n(r.visited)) }));
    case 'outlet_coverage':
      return rows.map((r) => ({ ...r, not_visited: Math.max(0, n(r.universe) - n(r.visited_mtd)) }));
    case 'frequency':
      return rows.map((r) => ({ ...r, missed: Math.max(0, n(r.due_visits) - n(r.on_time)) }));
    case 'productive_calls':
      return rows.map((r) => ({ ...r, unproductive: Math.max(0, n(r.visits) - n(r.productive)) }));
    case 'aov':
      // revenue_inr comes from the backend; an older backend only sends the average and the count.
      return rows.map((r) => ({ ...r, revenue_inr: has(r.revenue_inr) ? n(r.revenue_inr) : Math.round(n(r.aov_inr) * n(r.orders)) }));
    case 'distance':
      return rows.map((r) => {
        const reps = has(r.reps) ? n(r.reps) : null;
        return { ...r, reps, km_per_rep: reps && reps > 0 ? r1(n(r.km_total) / reps) : null };
      });
    case 'punctuality':
      return rows.map((r) => {
        const present = n(r.on_time) + n(r.late);
        return { ...r, days_total: present + n(r.absent), punctual_pct: present > 0 ? r1((n(r.on_time) / present) * 100) : 0 };
      });
    case 'form_completion':
      return rows.map((r) => ({ ...r, missing: Math.max(0, n(r.required) - n(r.submitted)) }));
    case 'top_performers': {
      const total = rows.reduce((s, r) => s + n(r.revenue_inr), 0);
      return rows.map((r) => ({
        ...r,
        aov_inr: n(r.orders) > 0 ? Math.round(n(r.revenue_inr) / n(r.orders)) : 0,
        share_pct: total > 0 ? r1((n(r.revenue_inr) / total) * 100) : 0,
      }));
    }
    case 'visit_duration': {
      const total = rows.reduce((s, r) => s + n(r.visit_count), 0);
      return rows.map((r) => ({ ...r, share_pct: total > 0 ? r1((n(r.visit_count) / total) * 100) : 0 }));
    }
    default:
      return rows;
  }
}
