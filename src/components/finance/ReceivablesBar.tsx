'use client';
// Total Receivables: one segmented horizontal bar (Current, then four overdue buckets).
// Colour is never the only channel: every segment is also listed below with its label, amount and share.

import { useState } from 'react';
import { T } from '../ui';
import { inr, num } from '../../lib/financeFormat';
import type { DashboardData } from '../../lib/financeApi';

type R = DashboardData['receivables'];

// Current = informational blue; overdue buckets = one red hue stepping darker with age (sequential, not rainbow).
const surface = 'var(--card)';
const shade = (pct: number) => `color-mix(in srgb, var(--red) ${pct}%, ${surface})`;
const SEGMENTS: Array<{ key: keyof Pick<R, 'current' | 'd1_15' | 'd16_30' | 'd31_45' | 'd45_plus'>; label: string; color: string }> = [
  { key: 'current', label: 'Current', color: T.info },
  { key: 'd1_15', label: '1–15 days overdue', color: shade(40) },
  { key: 'd16_30', label: '16–30 days overdue', color: shade(60) },
  { key: 'd31_45', label: '31–45 days overdue', color: shade(80) },
  { key: 'd45_plus', label: '> 45 days overdue', color: T.red },
];

export default function ReceivablesBar({ data, compact }: { data: R; compact?: boolean }) {
  const [hot, setHot] = useState<number | null>(null);
  const segs = SEGMENTS.map((s) => ({ ...s, amount: Math.max(0, num(data[s.key])) }));
  const sum = segs.reduce((x, s) => x + s.amount, 0);
  const total = num(data.total) || sum;
  const overdueAmount = segs.slice(1).reduce((x, s) => x + s.amount, 0);
  const pct = (a: number) => (sum > 0 ? (a / sum) * 100 : 0);
  const summary = total > 0
    ? `Total receivables ${inr(total)}. ${segs.map((s) => `${s.label}: ${inr(s.amount)}`).join('; ')}.`
    : 'No outstanding receivables.';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: T.heading, fontSize: compact ? 26 : 32, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{inr(total)}</div>
        <div style={{ fontSize: 13, color: T.dim }}>
          {num(data.open_invoices)} open {num(data.open_invoices) === 1 ? 'invoice' : 'invoices'}
          {' · '}
          <span style={{ color: num(data.overdue_invoices) > 0 ? T.red : T.dim, fontWeight: num(data.overdue_invoices) > 0 ? 600 : 400 }}>
            {num(data.overdue_invoices)} overdue{overdueAmount > 0 ? ` (${inr(overdueAmount)})` : ''}
          </span>
        </div>
      </div>

      <div role="img" aria-label={summary}
        style={{ display: 'flex', gap: 2, height: 14, marginTop: 14, borderRadius: 4, overflow: 'hidden', background: sum > 0 ? 'transparent' : 'var(--s3)' }}>
        {sum > 0 && segs.map((s, i) => s.amount > 0 && (
          <div key={s.key} title={`${s.label}: ${inr(s.amount)}`}
            onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
            style={{ width: `${pct(s.amount)}%`, minWidth: 4, background: s.color, opacity: hot === null || hot === i ? 1 : 0.45, transition: 'opacity .12s ease' }} />
        ))}
      </div>

      {sum === 0 && <div style={{ fontSize: 13, color: T.mute, marginTop: 10 }}>Nothing is outstanding right now. Sent invoices with a balance will show up here.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: compact ? '14px 12px' : 12, marginTop: 16 }}>
        {segs.map((s, i) => (
          <div key={s.key} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
            style={{ minWidth: 0, opacity: hot === null || hot === i ? 1 : 0.6, transition: 'opacity .12s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.dim }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flex: '0 0 auto' }} />
              <span>{s.label}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{inr(s.amount)}</div>
            <div style={{ fontSize: 11.5, color: T.mute, fontVariantNumeric: 'tabular-nums' }}>{sum > 0 ? `${pct(s.amount).toFixed(1)}% of total` : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
