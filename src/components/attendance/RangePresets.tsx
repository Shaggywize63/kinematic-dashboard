'use client';
/**
 * Shared date-range picker for the attendance report downloads: quick presets
 * (This week / 14 days / This month / Custom) plus From/To inputs. Used by the
 * Attendance → Export CSV modal, the Monthly summary tab, and the FFM
 * Attendance Summary report so every attendance download offers the same ranges.
 *
 * All dates are plain YYYY-MM-DD IST calendar dates (the attendance `date`
 * column is stored as the IST day), inclusive of both ends.
 *   - This week  = the last 7 days ending today (today − 6 … today)
 *   - 14 days    = the last 14 days ending today (today − 13 … today)
 *   - This month = the 1st of the current calendar month … today (month-to-date)
 *   - Custom     = whatever From/To the user types
 */
import { useState } from 'react';
import { Field, Input, Segmented } from '../ui';

/** Today as a YYYY-MM-DD string in IST (UTC+05:30). */
export const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/** Shift a YYYY-MM-DD date by whole days, staying on calendar-date boundaries. */
const addDays = (ymd: string, days: number) => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type RangeKey = 'week' | 'fortnight' | 'month' | 'custom';

/** Inclusive from/to for a non-custom preset, ending today (IST). */
export function presetRange(key: Exclude<RangeKey, 'custom'>): { from: string; to: string } {
  const to = istToday();
  if (key === 'week') return { from: addDays(to, -6), to };
  if (key === 'fortnight') return { from: addDays(to, -13), to };
  return { from: `${to.slice(0, 7)}-01`, to }; // month-to-date
}

const PRESETS: Array<{ value: Exclude<RangeKey, 'custom'>; label: string }> = [
  { value: 'week', label: 'This week' },
  { value: 'fortnight', label: '14 days' },
  { value: 'month', label: 'This month' },
];

/** The preset whose range equals from/to exactly today, else 'custom'. */
export function matchPreset(from: string, to: string): RangeKey {
  for (const p of PRESETS) {
    const r = presetRange(p.value);
    if (r.from === from && r.to === to) return p.value;
  }
  return 'custom';
}

/**
 * Controlled range picker. The parent owns from/to; this renders the preset
 * tabs and the two date inputs and calls onChange with the new pair.
 */
export function RangePresetPicker({
  from, to, onChange, idPrefix = 'range', maxToday = true,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  idPrefix?: string;
  /** Cap both inputs at today (IST). Default true — attendance never runs into the future. */
  maxToday?: boolean;
}) {
  // Once the user edits a date (or picks the Custom tab) we stay on Custom even
  // if the dates happen to line up with a preset, so the tab doesn't jump back.
  const [manual, setManual] = useState(false);
  const active: RangeKey = manual ? 'custom' : matchPreset(from, to);
  const today = istToday();

  const options: Array<{ value: RangeKey; label: string }> = [
    ...PRESETS.map((p) => ({ value: p.value as RangeKey, label: p.label })),
    { value: 'custom', label: 'Custom' },
  ];

  const pick = (v: RangeKey) => {
    if (v === 'custom') { setManual(true); return; }
    setManual(false);
    const r = presetRange(v);
    onChange(r.from, r.to);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Segmented value={active} onChange={pick} options={options} style={{ flexWrap: 'wrap' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="From" htmlFor={`${idPrefix}-from`}>
          <Input
            id={`${idPrefix}-from`}
            type="date"
            value={from}
            max={maxToday ? today : undefined}
            onChange={(e) => { setManual(true); onChange(e.target.value, to); }}
          />
        </Field>
        <Field label="To" htmlFor={`${idPrefix}-to`}>
          <Input
            id={`${idPrefix}-to`}
            type="date"
            value={to}
            min={from || undefined}
            max={maxToday ? today : undefined}
            onChange={(e) => { setManual(true); onChange(from, e.target.value); }}
          />
        </Field>
      </div>
    </div>
  );
}
