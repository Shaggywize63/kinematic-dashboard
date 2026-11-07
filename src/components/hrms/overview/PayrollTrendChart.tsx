'use client';
// Employer payroll cost by month, stacked by legal entity. Loaded through next/dynamic (ssr:false) so recharts
// only ships when the overview paints. Colours are CSS variables, so light and dark follow the theme.

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { T } from '../../ui';
import { fmtMonth, inr, inrShort } from '../../../lib/hrms/format';
import type { TrendPoint } from './insights';

const SERIES_COLOURS = ['var(--info)', 'var(--ok)', 'var(--warn)', 'var(--red)'];

interface Series { id: string; name: string; colour: string }
interface TipProps { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | string; payload?: TrendPoint & Record<string, number | string | boolean | object> }>; series: Series[] }

function Tip({ active, payload, series }: TipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', padding: '8px 10px', fontSize: 12.5, color: T.text, minWidth: 200 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{fmtMonth(point.month)}</div>
      {!point.hasRun ? <div style={{ color: T.dim }}>No payroll run yet</div> : (
        <>
          {series.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.colour, flex: '0 0 auto' }} />
              <span style={{ color: T.dim }}>{s.name}</span>
              <span style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(point.byEntity[s.id] ?? 0)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
            <span>Total</span><span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{inr(point.total)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function PayrollTrendChart({ points, entities, compact }: { points: TrendPoint[]; entities: { id: string; name: string }[]; compact?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  const series: Series[] = entities.map((e, i) => ({ id: e.id, name: e.name, colour: SERIES_COLOURS[i % SERIES_COLOURS.length]! }));
  const data = points.map((p) => ({ ...p, ...p.byEntity }));
  const withRuns = points.filter((p) => p.hasRun);
  const alt = withRuns.length
    ? `Stacked column chart of employer payroll cost per month for the last ${points.length} months. ${withRuns.map((p) => `${fmtMonth(p.month)} ${inr(p.total)}`).join(', ')}. Months without a run are empty. Use the View as table button for every value.`
    : 'No payroll runs exist for the last six months.';

  const th = { padding: '8px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}` };
  const td = { padding: '8px 12px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} aria-label="Legend">
          {series.map((s) => (
            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.colour }} />{s.name}
            </span>
          ))}
        </div>
        {withRuns.length > 0 && (
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            style={{ border: 0, background: 'transparent', color: T.info, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 4px' }}>
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        )}
      </div>

      {!withRuns.length ? (
        <div role="img" aria-label={alt} style={{ height: 220, display: 'grid', placeItems: 'center', color: T.mute, fontSize: 13.5, textAlign: 'center', padding: 16 }}>
          No payroll has been run yet. Computed runs will appear here month by month.
        </div>
      ) : asTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Employer payroll cost by month and legal entity</caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: 'left' }}>Month</th>
                {series.map((s) => <th key={s.id} scope="col" style={{ ...th, textAlign: 'right' }}>{s.name}</th>)}
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{fmtMonth(p.month)}</th>
                  {series.map((s) => <td key={s.id} style={td}>{p.hasRun ? inr(p.byEntity[s.id] ?? 0) : '—'}</td>)}
                  <td style={{ ...td, fontWeight: 700 }}>{p.hasRun ? inr(p.total) : 'No run yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={alt} style={{ width: '100%', height: compact ? 220 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={compact ? '18%' : '30%'} maxBarSize={44}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--mute)', fontSize: 11 }} interval={0} />
              <YAxis tickFormatter={(v: number) => inrShort(v)} tickLine={false} axisLine={false} width={62} tick={{ fill: 'var(--mute)', fontSize: 11 }} />
              <Tooltip content={<Tip series={series} />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
              {series.map((s, i) => (
                <Bar key={s.id} dataKey={s.id} name={s.name} stackId="cost" fill={s.colour} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
