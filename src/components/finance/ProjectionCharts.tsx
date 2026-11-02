'use client';
// Charts for the Finance projection and hiring plan (recharts). Every chart sits in a role="img" wrapper with a
// text alternative; the numbers are also available in the tables on the page.

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { T } from '../ui';
import { inr } from '../../lib/financeFormat';
import { inrAxis } from './SalesReceiptsChart';
import type { GrowthPlan, ProjectionData } from '../../lib/financeApi';

const C = { actual: T.info, contracted: 'var(--mute)', conservative: T.red, base: T.warn, upside: T.ok, payroll: T.red, mrr: T.info };
const AXIS = { fill: 'var(--mute)', fontSize: 11 };
const SHORT: Record<string, string> = { accounts: 'Accounts', cs: 'Customer success', sales: 'Sales', dev: 'Developer', marketing: 'Marketing', senior: 'Tech lead' };
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

interface TipRow { name?: string; value?: number | string; color?: string; dataKey?: string | number }
function Tip({ active, payload, label, extra }: { active?: boolean; payload?: TipRow[]; label?: string; extra?: (p: TipRow[]) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', padding: '8px 10px', fontSize: 12.5, color: T.text, minWidth: 190 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => (
        <div key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.8 }}>
          <span aria-hidden style={{ width: 10, height: 3, borderRadius: 2, background: p.color, flex: '0 0 auto' }} />
          <span style={{ color: T.dim }}>{p.name}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(p.value)}</span>
        </div>
      ))}
      {extra?.(payload)}
    </div>
  );
}

const Frame = ({ height, alt, children }: { height: number; alt: string; children: React.ReactElement }) => (
  <div role="img" aria-label={alt} style={{ width: '100%', height }}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
  </div>
);

/** Actual billings by month (bars) continuing into the contracted bills and the three scenario lines. */
export function BillingsChart({ data, compact }: { data: ProjectionData; compact?: boolean }) {
  const rows = new Map<string, Record<string, number | string>>();
  for (const h of data.history) rows.set(h.month, { month: h.month, label: monthName(h.month), actual: h.billed });
  for (const m of data.months) {
    const r = rows.get(m.month) ?? { month: m.month, label: monthName(m.month) };
    Object.assign(r, { contracted: m.contracted, conservative: m.conservative, base: m.base, upside: m.upside });
    rows.set(m.month, r);
  }
  const series = Array.from(rows.values()).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const alt = `Monthly billings before GST. Bars show what was billed so far and the bills already scheduled; lines show the conservative (${inr(data.scenarios.conservative)}), base (${inr(data.scenarios.base)}) and upside (${inr(data.scenarios.upside)}) totals for the next 12 months.`;
  return (
    <Frame height={compact ? 280 : 340} alt={alt}>
      <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={AXIS} interval={compact ? 1 : 0} />
        <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={58} tick={AXIS} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} />
        <Bar dataKey="actual" name="Billed so far" fill={C.actual} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="contracted" name="Already scheduled (renewals)" fill={C.contracted} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Line dataKey="conservative" name="Conservative" stroke={C.conservative} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="base" name="Base" stroke={C.base} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        <Line dataKey="upside" name="Upside" stroke={C.upside} strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

/** Running total of billings over the next 12 months, per scenario. */
export function CumulativeChart({ data, compact }: { data: ProjectionData; compact?: boolean }) {
  const rows = data.months.map((m) => ({ label: monthName(m.month), conservative: m.cum_conservative, base: m.cum_base, upside: m.cum_upside }));
  return (
    <Frame height={compact ? 240 : 280} alt={`Cumulative billings over the next 12 months: conservative ${inr(data.scenarios.conservative)}, base ${inr(data.scenarios.base)}, upside ${inr(data.scenarios.upside)}.`}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={AXIS} interval={compact ? 1 : 0} />
        <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={58} tick={AXIS} />
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} />
        <Line dataKey="conservative" name="Conservative" stroke={C.conservative} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="base" name="Base" stroke={C.base} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        <Line dataKey="upside" name="Upside" stroke={C.upside} strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </Frame>
  );
}

/** Annual recurring revenue by customer (largest first). */
export function CustomerBars({ data, compact }: { data: ProjectionData; compact?: boolean }) {
  const rows = data.customers.slice(0, 12).map((c) => ({ name: c.customer.length > 26 ? `${c.customer.slice(0, 25)}…` : c.customer, per_year: c.per_year, cadence: c.cadence, share: c.share }));
  const h = Math.max(200, rows.length * (compact ? 30 : 34) + 30);
  return (
    <Frame height={h} alt={`Annual recurring revenue by customer. Largest: ${rows[0]?.name ?? 'none'} at ${inr(rows[0]?.per_year ?? 0)}. Top two customers are ${data.summary.top2_share}% of the total.`}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={inrAxis} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={AXIS} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={compact ? 110 : 170} tick={{ ...AXIS, fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'var(--s3)', opacity: 0.6 }} content={<Tip extra={(p) => {
          const r = (p[0] as unknown as { payload?: { cadence: string; share: number } }).payload;
          return r ? <div style={{ color: T.mute, marginTop: 2 }}>{r.cadence} · {r.share}% of recurring revenue</div> : null;
        }} />} />
        <Bar dataKey="per_year" name="Per year" fill={C.actual} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

/** Monthly recurring revenue against the revenue each hire needs; dots mark the planned hires. */
export function MrrHiringChart({ plan, current, compact }: { plan: GrowthPlan; current: number; compact?: boolean }) {
  const rows = plan.timeline.map((t) => ({ label: monthName(t.month), mrr: t.mrr, hires: t.hires }));
  const top = Math.max(current, ...rows.map((r) => r.mrr));
  const lines = plan.roles.filter((r) => r.unlock_mrr <= top * 1.6);
  const marks = plan.timeline.map((t, k) => ({ t, k })).filter((x) => x.t.hires.length);
  return (
    <Frame height={compact ? 300 : 360} alt={`Monthly recurring revenue over the next 12 months against the revenue each hire needs. ${plan.headline.hires} hire${plan.headline.hires === 1 ? '' : 's'} planned in this scenario.`}>
      <ComposedChart data={rows} margin={{ top: 12, right: 120, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={AXIS} interval={compact ? 1 : 0} />
        <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={58} tick={AXIS} domain={[0, Math.ceil((top * 1.7) / 10000) * 10000]} />
        <Tooltip content={<Tip extra={(p) => {
          const r = (p[0] as unknown as { payload?: { hires: string[] } }).payload;
          return r?.hires?.length ? <div style={{ marginTop: 4, color: T.ok, fontWeight: 600 }}>Hire: {r.hires.join(', ')}</div> : null;
        }} />} />
        {lines.map((r) => (
          <ReferenceLine key={r.key} y={r.unlock_mrr} stroke="var(--mute)" strokeDasharray="4 4"
            label={{ value: `${SHORT[r.key] ?? r.title} · ${inrAxis(r.unlock_mrr)}`, position: 'right', fill: 'var(--mute)', fontSize: 10.5 }} />
        ))}
        <Line dataKey="mrr" name="Monthly recurring revenue" stroke={C.mrr} strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />
        {marks.map(({ t }) => (
          <ReferenceDot key={t.month} x={monthName(t.month)} y={t.mrr} r={7} fill={T.ok} stroke="var(--card)" strokeWidth={2} />
        ))}
      </ComposedChart>
    </Frame>
  );
}

/** Billings vs the team's cost, and what is left after payroll (cumulative). */
export function PayrollChart({ plan, compact }: { plan: GrowthPlan; compact?: boolean }) {
  const rows = plan.timeline.map((t) => ({ label: monthName(t.month), billings: t.billings, cost: t.payroll + t.one_time + t.existing, cum_net: t.cum_net }));
  return (
    <Frame height={compact ? 280 : 320} alt={`Monthly billings against team and other costs, and the running balance after those costs. Year-one hiring budget ${inr(plan.budget.year1_total)}.`}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="26%">
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={AXIS} interval={compact ? 1 : 0} />
        <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={58} tick={AXIS} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--s3)', opacity: 0.6 }} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} />
        <Bar dataKey="billings" name="Billings" fill={C.actual} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        <Bar dataKey="cost" name="Hiring + other costs" fill={C.payroll} fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        <Line dataKey="cum_net" name="Running balance after costs" stroke={T.ok} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

