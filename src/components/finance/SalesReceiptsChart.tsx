'use client';
// Sales vs Receipts by fiscal-year month: grouped columns, one baseline, one axis.
// Colour: sales = T.info, receipts = T.ok (legend + tooltip + table carry identity too).

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { T } from '../ui';
import { inr, num } from '../../lib/financeFormat';
import type { DashboardData } from '../../lib/financeApi';

type Month = DashboardData['months'][number];

/** ₹ axis ticks: 12500 → ₹12.5K, 250000 → ₹2.5L, 30000000 → ₹3Cr. */
export function inrAxis(v: number): string {
  const a = Math.abs(v);
  const f = (n: number) => String(Math.round(n * 10) / 10);
  if (a >= 1e7) return `₹${f(v / 1e7)}Cr`;
  if (a >= 1e5) return `₹${f(v / 1e5)}L`;
  if (a >= 1e3) return `₹${f(v / 1e3)}K`;
  return `₹${Math.round(v)}`;
}

const SERIES = [
  { key: 'sales' as const, label: 'Sales', color: T.info },
  { key: 'receipts' as const, label: 'Receipts', color: T.ok },
];

interface TipProps { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | string; payload?: Month }>; label?: string }
function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const month = payload[0]?.payload?.month;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', padding: '8px 10px', fontSize: 12.5, color: T.text, minWidth: 170 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}{month ? ` · ${month}` : ''}</div>
      {SERIES.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.8 }}>
            <span aria-hidden style={{ width: 10, height: 3, borderRadius: 2, background: s.color, flex: '0 0 auto' }} />
            <span style={{ color: T.dim }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(p?.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesReceiptsChart({ months, periodLabel, compact }: { months: Month[]; periodLabel: string; compact?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  const has = months.some((m) => num(m.sales) > 0 || num(m.receipts) > 0);
  const totalSales = months.reduce((x, m) => x + num(m.sales), 0);
  const totalReceipts = months.reduce((x, m) => x + num(m.receipts), 0);
  const best = months.reduce<Month | null>((b, m) => (!b || num(m.sales) > num(b.sales) ? m : b), null);
  const alt = has
    ? `Grouped column chart of monthly sales and receipts for fiscal year ${periodLabel}. Total sales ${inr(totalSales)}, total receipts ${inr(totalReceipts)}.${best ? ` Highest sales month: ${best.label} at ${inr(best.sales)}.` : ''} Use the "View as table" button for every value.`
    : `No sales or receipts recorded for fiscal year ${periodLabel}.`;

  const th = { padding: '8px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}` };
  const td = { padding: '8px 12px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} aria-label="Legend">
          {SERIES.map((s) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />{s.label}
            </span>
          ))}
        </div>
        {has && (
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            style={{ border: 0, background: 'transparent', color: T.info, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}>
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        )}
      </div>

      {!has ? (
        <div role="img" aria-label={alt} style={{ height: 240, display: 'grid', placeItems: 'center', color: T.mute, fontSize: 13.5, textAlign: 'center', padding: 16 }}>
          No sales or receipts in {periodLabel}. Invoices that are sent and payments you record will appear here.
        </div>
      ) : asTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Monthly sales and receipts, fiscal year {periodLabel}</caption>
            <thead><tr><th scope="col" style={{ ...th, textAlign: 'left' }}>Month</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Sales</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Receipts</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}><th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{m.label} {m.month.slice(0, 4)}</th><td style={td}>{inr(m.sales)}</td><td style={td}>{inr(m.receipts)}</td></tr>
              ))}
              <tr><th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Total</th><td style={{ ...td, fontWeight: 700 }}>{inr(totalSales)}</td><td style={{ ...td, fontWeight: 700 }}>{inr(totalReceipts)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={alt} style={{ width: '100%', height: compact ? 240 : 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap={compact ? '18%' : '28%'} maxBarSize={20}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--mute)', fontSize: 11 }} interval={0} />
              <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={58} tick={{ fill: 'var(--mute)', fontSize: 11 }} />
              <Tooltip content={<Tip />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
