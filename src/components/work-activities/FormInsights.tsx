'use client';
/**
 * Work Activities → Insights.
 *
 * Turns field form-responses (MR / field-exec submissions) into an at-a-glance
 * analytics board: a KPI headline row plus pie / bar / stacked-bar / area / line
 * charts. Data is served vertical-aware from the demo fixtures
 * (api.getFormInsights → matchDemoMock); the pharma vertical answers "which
 * molecule do doctors prefer, what do they object to, how is trial-Rx intent
 * trending". Titles/labels ship with the payload so this component stays
 * vertical-agnostic.
 *
 * Visual language matches the shared chart kit (chartTheme.tsx) — themed CSS
 * vars, glassy tooltips, rounded bars — so it reads as one system with the rest
 * of the dashboard's analytics. Colour follows the data's job: single hue for
 * magnitude rankings, the categorical palette for identity (specialty / form),
 * reserved status colours for sentiment.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, AreaChart, Area, LineChart, Line, LabelList,
} from 'recharts';
import api from '../../lib/api';
import {
  CHART, CHART_PALETTE, GLASS_TOOLTIP, GradientDefs, grad, ChartTooltip, ChartCard,
} from '../../lib/chartTheme';

// ── data shapes ──────────────────────────────────────────────────────────
interface NameValue { name: string; value: number }
interface SentimentRow { name: string; positive: number; neutral: number; objection: number }
interface InsightsData {
  period_label?: string;
  labels?: Record<string, string>;
  kpis?: {
    total_responses?: number; unique_hcps?: number; avg_trial_intent?: number;
    sample_signoff_rate?: number; top_molecule?: string;
  };
  preferred_drug?: NameValue[];
  specialty_mix?: NameValue[];
  sentiment?: SentimentRow[];
  objections?: NameValue[];
  weekly_volume?: Array<{ week: string; responses: number }>;
  trial_intent_trend?: Array<{ week: string; intent: number }>;
  responses_by_form?: NameValue[];
}

// Job-driven hues. Magnitude rankings use ONE hue (so length, not colour,
// carries the value); identity uses the categorical palette; sentiment uses
// reserved status colours (green = positive, gray = neutral, red = objection).
const HUE_RX = CHART_PALETTE[0];      // indigo — preferred product ranking
const HUE_OBJ = '#F59E0B';            // amber  — objections ranking
const HUE_VOL = '#06B6D4';            // cyan   — volume trend
const HUE_INTENT = CHART_PALETTE[0];  // indigo — intent trend
const SENT = { pos: '#10B981', neu: '#64748B', obj: '#F43F5E' };

// Horizontal-bar grid: value gridlines only (vertical), category axis clean.
const HGRID = { stroke: 'var(--border)', strokeDasharray: '4 4', horizontal: false } as const;
const cursorFill = { fill: 'var(--s3)', opacity: 0.35 };
const truncTick = (v: string) => (v && v.length > 16 ? `${v.slice(0, 15)}…` : v);
const nfmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '—');

function label(d: InsightsData, key: string, fallback: string): string {
  return d.labels?.[key] || fallback;
}

// ── KPI tile ─────────────────────────────────────────────────────────────
function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 16,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: accent || 'var(--primary)' }} />
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  );
}

export default function FormInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    api.getFormInsights()
      .then((res: any) => { if (alive) setData((res?.data ?? res) as InsightsData); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-dim)' }}>Building insights…</div>;
  if (error || !data?.kpis) {
    return (
      <div style={{ padding: '80px', textAlign: 'center', background: 'var(--s1)', border: '1px dashed var(--border)', borderRadius: 24, color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>No insights yet</div>
        <div style={{ marginTop: 6 }}>Insights appear once field form-responses have been collected.</div>
      </div>
    );
  }

  const d = data;
  const k = d.kpis!;
  const gridCards: CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'stretch',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* period chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Form-response insights ·</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', padding: '4px 10px', borderRadius: 999 }}>
          {d.period_label || 'Last 30 days'}
        </span>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Kpi label={label(d, 'kpi_responses', 'Form responses')} value={nfmt(k.total_responses)} accent={CHART_PALETTE[0]} sub="submitted in period" />
        <Kpi label={label(d, 'kpi_people', 'HCPs covered')} value={nfmt(k.unique_hcps)} accent={CHART_PALETTE[4]} sub="unique respondents" />
        <Kpi label={label(d, 'kpi_intent', 'Avg intent')} value={`${k.avg_trial_intent ?? '—'}/10`} accent={CHART_PALETTE[1]} sub="mean across responses" />
        <Kpi label={label(d, 'kpi_signoff', 'Sign-off rate')} value={`${k.sample_signoff_rate ?? '—'}%`} accent="#10B981" sub="proof captured" />
        <Kpi label={label(d, 'kpi_top', 'Top item')} value={k.top_molecule || '—'} accent="#F43F5E" sub="most preferred" />
      </div>

      {/* charts */}
      <div style={gridCards}>
        {/* 1. Preferred molecule — magnitude ranking, single hue */}
        {d.preferred_drug?.length ? (
          <ChartCard title={label(d, 'preferred', 'Most-preferred product')} subtitle="Share of preference mentions">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart layout="vertical" data={d.preferred_drug} margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                <GradientDefs colors={[HUE_RX]} />
                <CartesianGrid {...HGRID} />
                <XAxis type="number" {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={92} {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                <Bar dataKey="value" name="Responses" radius={CHART.hBarRadius} fill={grad(HUE_RX)} barSize={18} {...CHART.animation}>
                  <LabelList dataKey="value" position="right" style={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 2. Respondent mix — part-to-whole, categorical donut */}
        {d.specialty_mix?.length ? (
          <ChartCard title={label(d, 'respondent_mix', 'Respondent mix')} subtitle="Share of respondents">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.specialty_mix} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={2} stroke="var(--s2)" strokeWidth={2}>
                  {d.specialty_mix.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={GLASS_TOOLTIP} itemStyle={{ color: 'var(--text)' }} labelStyle={{ color: 'var(--text)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 3. Sentiment — ordered-scale stacked bar (status colours) */}
        {d.sentiment?.length ? (
          <ChartCard title={label(d, 'sentiment', 'Sentiment')} subtitle="% positive / neutral / objection">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart layout="vertical" data={d.sentiment} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid {...HGRID} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={78} {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="positive" name="Positive" stackId="s" fill={SENT.pos} radius={[4, 0, 0, 4]} barSize={18} {...CHART.animation} />
                <Bar dataKey="neutral" name="Neutral" stackId="s" fill={SENT.neu} barSize={18} {...CHART.animation} />
                <Bar dataKey="objection" name="Objection" stackId="s" fill={SENT.obj} radius={[0, 4, 4, 0]} barSize={18} {...CHART.animation} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 4. Top objections — magnitude ranking, single hue */}
        {d.objections?.length ? (
          <ChartCard title={label(d, 'objections', 'Top objections')} subtitle="Times raised in the period">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart layout="vertical" data={d.objections} margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                <GradientDefs colors={[HUE_OBJ]} />
                <CartesianGrid {...HGRID} />
                <XAxis type="number" {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={150} tickFormatter={truncTick} {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                <Bar dataKey="value" name="Objections" radius={CHART.hBarRadius} fill={grad(HUE_OBJ)} barSize={16} {...CHART.animation}>
                  <LabelList dataKey="value" position="right" style={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 5. Weekly volume — trend, single-series area */}
        {d.weekly_volume?.length ? (
          <ChartCard title={label(d, 'volume', 'Weekly response volume')} subtitle="Responses per week">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={d.weekly_volume} margin={CHART.margin}>
                <defs>
                  <linearGradient id="fi-vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HUE_VOL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={HUE_VOL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART.grid} />
                <XAxis dataKey="week" {...CHART.axis} />
                <YAxis {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="responses" name="Responses" stroke={HUE_VOL} strokeWidth={2} fill="url(#fi-vol)" {...CHART.animation} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 6. Intent trend — single-series line, fixed 0–10 scale */}
        {d.trial_intent_trend?.length ? (
          <ChartCard title={label(d, 'intent', 'Avg intent by week')} subtitle="Mean 0–10 score">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={d.trial_intent_trend} margin={CHART.margin}>
                <CartesianGrid {...CHART.grid} />
                <XAxis dataKey="week" {...CHART.axis} />
                <YAxis domain={[0, 10]} {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="intent" name="Avg intent" stroke={HUE_INTENT} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: HUE_INTENT }} activeDot={{ r: 5 }} {...CHART.animation} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 7. Responses by form — categorical column */}
        {d.responses_by_form?.length ? (
          <ChartCard title={label(d, 'by_form', 'Responses by form')} subtitle="Which form drives responses">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={d.responses_by_form} margin={{ ...CHART.margin, bottom: 18 }}>
                <GradientDefs colors={CHART_PALETTE} />
                <CartesianGrid {...CHART.grid} />
                <XAxis dataKey="name" interval={0} height={40} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis {...CHART.axis} />
                <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                <Bar dataKey="value" name="Responses" radius={CHART.barRadius} barSize={40} {...CHART.animation}>
                  {d.responses_by_form.map((_, i) => <Cell key={i} fill={grad(CHART_PALETTE[i % CHART_PALETTE.length])} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}
      </div>
    </div>
  );
}
