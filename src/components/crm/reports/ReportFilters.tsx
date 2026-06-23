'use client';
import { useEffect, useState } from 'react';
import { useCityScope } from '../../../context/CityScopeContext';

/**
 * Shared filter strip for CRM reports.
 *
 * Why this exists: every report page used to roll its own filter UI
 * (or skip filters entirely), and almost none of them subscribed to
 * the global CityScopeContext. Because the city is silently appended
 * to GET requests by api.ts but isn't part of any useEffect dep, the
 * data stayed stale after the user changed the picker mid-session.
 * This component centralises:
 *
 *   1. Date range pickers (From / To) — wraps an ISO YYYY-MM-DD pair.
 *   2. Subscription to useCityScope so the parent's data-fetch
 *      useEffect can list `scopeKey` in its dep array and refetch on
 *      any city-picker change.
 *
 * Reports without a date range can just call `useReportCityKey()`
 * and skip the <Filters /> render.
 */

export interface ReportRange { from: string; to: string }

export function defaultReportRange(days = 30): ReportRange {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(past), to: iso(today) };
}

/** Hook that returns the current city-scope string. Reports add this
 *  to their useEffect deps so changing the picker refetches data. */
export function useReportCityKey(): string {
  const { selectedCity } = useCityScope();
  return selectedCity;
}

/** Stateful range + city wrapper. Use when a report needs both a
 *  date-range filter strip AND a city-aware refetch trigger. */
export function useReportFilters(defaultDays = 30): {
  range: ReportRange;
  setRange: (r: ReportRange) => void;
  scopeKey: string;
} {
  const scopeKey = useReportCityKey();
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(defaultDays));
  // Re-derive default only on first mount; admins changing the city
  // shouldn't reset the picked window underneath them.
  useEffect(() => { /* noop placeholder so future changes can subscribe */ }, []);
  return { range, setRange, scopeKey };
}

export function ReportRangePicker({ range, onChange }: { range: ReportRange; onChange: (r: ReportRange) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <DateInput label="From" value={range.from} onChange={(v) => onChange({ ...range, from: v })} />
      <DateInput label="To"   value={range.to}   onChange={(v) => onChange({ ...range, to: v })} />
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--s2)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13,
        }}
      />
    </label>
  );
}
