'use client';
// One chart component for every report that has a chart. Loaded through next/dynamic (ssr: false) by the report page.
// Thin bars with a rounded data end, hairline grid, tooltip, a legend for two or more series, value labels at the tip of a
// single series, and a table view so every value is available without the chart. Colours are CSS variables.

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inr, inrShort, num } from '../../../lib/hrms/format';
import { T } from '../ui';
import type { ChartSpec, ColType, ReportRow } from './reportConfig';

const COLORS = [T.info, T.ok];
const fmtFull = (t: ColType, v: number) => (t === 'money' ? inr(v) : t === 'decimal' ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : t === 'percent' ? `${v.toFixed(1)}%` : num(v));
const fmtAxis = (t: ColType, v: number) => (t === 'money' ? inrShort(v) : fmtFull(t, v));

type Datum = ReportRow & { __x: string };

interface TipProps { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | string }>; label?: string; spec: ChartSpec }
function Tip({ active, payload, label, spec }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', padding: '8px 10px', fontSize: 12.5, color: T.text, minWidth: 150 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {spec.series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.8 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flex: '0 0 auto' }} />
            <span style={{ color: T.dim }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtFull(spec.type, Number(p?.value ?? 0))}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReportChart({ spec, rows, compact }: { spec: ChartSpec; rows: ReportRow[]; compact?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  const multi = spec.series.length > 1;
  const data: Datum[] = (spec.horizontal ? rows.slice(0, 12) : rows).map((r): Datum => ({ ...r, __x: String(r[spec.x] ?? '') }));
  const first = spec.series[0]!;
  const top = [...data].sort((a, b) => Number(b[first.key]) - Number(a[first.key]))[0];
  const alt = data.length
    ? `${spec.title}: ${data.length} ${spec.horizontal ? 'bars' : 'columns'}.${top ? ` Highest ${first.label.toLowerCase()}: ${top.__x}, ${fmtFull(spec.type, Number(top[first.key]))}.` : ''} Use the “View as table” button for every value.`
    : `${spec.title}: no data.`;
  const height = spec.horizontal ? Math.max(170, data.length * 34 + 30) : compact ? 230 : 270;
  const axis = { fill: 'var(--mute)', fontSize: 11 };

  const th = { padding: '8px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}` };
  const td = { padding: '8px 12px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

  return (
    <div style={{ minWidth: 0 }} data-testid="report-chart">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text }}>{spec.title}</h2>
          {multi && (
            <div style={{ display: 'flex', gap: 14 }} aria-label="Legend">
              {spec.series.map((s, i) => (
                <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />{s.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {data.length > 0 && (
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            style={{ border: 0, background: 'transparent', color: T.info, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 6, minHeight: 32 }}>
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        )}
      </div>

      {data.length === 0 ? (
        <div role="img" aria-label={alt} style={{ height: 120, display: 'grid', placeItems: 'center', color: T.mute, fontSize: 13.5 }}>Nothing to chart for these filters.</div>
      ) : asTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{spec.title}</caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: 'left' }}> </th>
                {spec.series.map((s) => <th key={s.key} scope="col" style={{ ...th, textAlign: 'right' }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{d.__x}</th>
                  {spec.series.map((s) => <td key={s.key} style={td}>{fmtFull(spec.type, Number(d[s.key] ?? 0))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={alt} style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {spec.horizontal ? (
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 0 }} barCategoryGap="30%" maxBarSize={20}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtAxis(spec.type, v)} tickLine={false} axisLine={false} tick={axis} />
                <YAxis type="category" dataKey="__x" width={compact ? 110 : 150} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axis} interval={0} />
                <Tooltip content={<Tip spec={spec} />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
                {spec.series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {!multi && <LabelList dataKey={s.key} position="right" formatter={(v: number) => fmtAxis(spec.type, Number(v))} style={{ fill: 'var(--dim)', fontSize: 11.5 }} />}
                  </Bar>
                ))}
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%" maxBarSize={24}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="__x" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axis} interval={0} />
                <YAxis tickFormatter={(v: number) => fmtAxis(spec.type, v)} tickLine={false} axisLine={false} width={46} tick={axis} allowDecimals={false} />
                <Tooltip content={<Tip spec={spec} />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
                {spec.series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {!multi && <LabelList dataKey={s.key} position="top" formatter={(v: number) => fmtAxis(spec.type, Number(v))} style={{ fill: 'var(--dim)', fontSize: 11.5 }} />}
                  </Bar>
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
