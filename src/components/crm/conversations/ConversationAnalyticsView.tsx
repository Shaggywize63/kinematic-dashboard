'use client';
/**
 * Conversation Analytics — the manager charts over the Conversation Intelligence
 * insights (intent, sentiment, objections, competitors, talk-ratio, coaching).
 * Everything is aggregated server-side (`/crm/conversations/analytics`); this
 * view only shapes the returned series into charts.
 *
 * Colour is assigned by JOB (per the dataviz method): single-hue bars for pure
 * magnitude comparisons (intent stages, competitors, calls-over-time, rep
 * scores) and a CVD-separable status trio (green / amber / red) for polarity &
 * quality (sentiment, objection handling). Status hues always ship with text
 * labels + a legend, never colour alone.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, AreaChart, Area, LabelList,
} from 'recharts';
import {
  ChartCard, ChartTooltip, ChartEmpty, GradientDefs, grad, CHART,
} from '../../../lib/chartTheme';
import { conversationsApi, type ConversationAnalytics } from '../../../lib/conversationsApi';

// Single-hue accents for magnitude (identity is on the axis, so no palette cycle).
const ACCENT = '#6366F1';   // intent journey + timeline
const ACCENT2 = '#06B6D4';  // competitors
// Status trio — polarity / quality. Validated CVD-separable on the dark surface.
const OK = '#10B981';       // positive / handled well
const WARN = '#F59E0B';     // neutral / partially
const BAD = '#F43F5E';      // negative / poorly-ignored

const SENTIMENT_COLOR: Record<string, string> = { positive: OK, neutral: WARN, negative: BAD };

function pretty(k: string): string {
  return String(k || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const RANGES = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

export default function ConversationAnalyticsView({ championId, city, compact }: {
  championId?: string;
  city?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<ConversationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);

  // Refetch whenever the champion, city scope, or range changes — all three are
  // in the dependency array so a filter change actually re-queries.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await conversationsApi.analytics({ user_id: championId || undefined, city: city || undefined, days });
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load analytics'); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [championId, city, days]);

  const t = data?.totals;
  const gridCols = compact ? '1fr' : 'repeat(2, minmax(0, 1fr))';

  const intentData = useMemo(
    () => (data?.intent_stages || []).map((s) => ({ name: pretty(s.key), count: s.count })),
    [data],
  );
  const sentimentData = useMemo(
    () => (data?.sentiment || []).filter((s) => s.count > 0).map((s) => ({ name: pretty(s.key), key: s.key, value: s.count })),
    [data],
  );
  const objData = useMemo(
    () => (data?.objections || []).map((o) => ({ name: pretty(o.type), well: o.well, partially: o.partially, poor: o.poor })),
    [data],
  );
  const compData = useMemo(
    () => (data?.competitors || []).map((c) => ({ name: c.name, count: c.count })),
    [data],
  );
  const timeData = useMemo(
    () => (data?.timeline || []).map((d) => ({
      name: new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
      count: d.count,
    })),
    [data],
  );
  const reps = data?.reps || [];

  if (error) {
    return <div style={{ color: '#ef4444', fontSize: 13, padding: '16px 2px' }}>{error}</div>;
  }
  if (loading && !data) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 2px' }}>Loading analytics…</div>;
  }
  const noData = !t || t.analyzed === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Range selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          {noData ? 'No analyzed calls in this window yet.' : `Based on ${t!.analyzed} analyzed call${t!.analyzed === 1 ? '' : 's'}${city ? ` · ${city}` : ''}.`}
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                background: days === r.days ? 'var(--s3)' : 'transparent',
                color: days === r.days ? 'var(--text)' : 'var(--text-dim)',
                border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: days === r.days ? 700 : 500,
                cursor: 'pointer',
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: 10 }}>
        <StatTile label="Analyzed calls" value={t ? String(t.analyzed) : '—'} />
        <StatTile label="Avg intent" value={t?.avg_intent_score != null ? `${t.avg_intent_score}` : '—'} sub="/ 100" accent={ACCENT} />
        <StatTile label="Rep talk-share" value={t?.avg_talk_pct != null ? `${t.avg_talk_pct}%` : '—'} sub="of call time" />
        <StatTile label="Leads touched" value={t ? String(t.leads) : '—'} />
        <StatTile label="Reps active" value={t ? String(t.reps) : '—'} />
        <StatTile label="Risk-flag calls" value={t ? String(t.risk_calls) : '—'} accent={t && t.risk_calls > 0 ? BAD : undefined} />
      </div>

      {/* Charts grid */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
        {/* Intent journey — magnitude by stage (single hue; ordered on the axis) */}
        <ChartCard title="Where leads sit in the journey" subtitle="Analyzed calls by detected intent stage" minHeight={260}>
          {intentData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart layout="vertical" data={intentData} margin={{ top: 6, right: 34, left: 6, bottom: 6 }}>
                <GradientDefs colors={[ACCENT]} />
                <CartesianGrid {...CHART.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={compact ? 92 : 116} {...CHART.axis} />
                <Tooltip cursor={{ fill: 'var(--s3)', opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Calls" fill={grad(ACCENT)} radius={CHART.hBarRadius} {...CHART.animation}>
                  <LabelList dataKey="count" position="right" style={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Sentiment — polarity (status trio, legend + labels) */}
        <ChartCard title="Call sentiment" subtitle="Overall tone across analyzed calls" minHeight={260}>
          {sentimentData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={54} outerRadius={82} paddingAngle={2} stroke="var(--s2)" strokeWidth={2}
                  label={(p: any) => `${p.value}`} labelLine={false} {...CHART.animation}
                >
                  {sentimentData.map((s) => <Cell key={s.key} fill={SENTIMENT_COLOR[s.key] || WARN} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Objections — magnitude by type, stacked by handling quality (status) */}
        <ChartCard title="Top objections & how they're handled" subtitle="Green handled well · amber partially · red poorly / ignored" minHeight={280}>
          {objData.length === 0 ? <ChartEmpty message="No objections logged yet" /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, objData.length * 40)}>
              <BarChart layout="vertical" data={objData} margin={{ top: 6, right: 18, left: 6, bottom: 6 }}>
                <CartesianGrid {...CHART.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={compact ? 92 : 120} {...CHART.axis} />
                <Tooltip cursor={{ fill: 'var(--s3)', opacity: 0.4 }} content={<ChartTooltip />} />
                <Legend verticalAlign="top" height={26} iconType="circle" wrapperStyle={{ fontSize: 11.5 }} />
                <Bar dataKey="well" stackId="h" name="Handled well" fill={OK} radius={[0, 0, 0, 0]} {...CHART.animation} />
                <Bar dataKey="partially" stackId="h" name="Partially" fill={WARN} {...CHART.animation} />
                <Bar dataKey="poor" stackId="h" name="Poorly / ignored" fill={BAD} radius={CHART.hBarRadius} {...CHART.animation} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Competitors — magnitude by name (single hue) */}
        <ChartCard title="Competitors mentioned" subtitle="Brands customers raised on calls" minHeight={280}>
          {compData.length === 0 ? <ChartEmpty message="No competitors mentioned yet" /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, compData.length * 40)}>
              <BarChart layout="vertical" data={compData} margin={{ top: 6, right: 34, left: 6, bottom: 6 }}>
                <GradientDefs colors={[ACCENT2]} />
                <CartesianGrid {...CHART.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...CHART.axis} />
                <YAxis type="category" dataKey="name" width={compact ? 92 : 120} {...CHART.axis} />
                <Tooltip cursor={{ fill: 'var(--s3)', opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Mentions" fill={grad(ACCENT2)} radius={CHART.hBarRadius} {...CHART.animation}>
                  <LabelList dataKey="count" position="right" style={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Calls over time — change over time (single hue area) */}
        <div style={{ gridColumn: compact ? 'auto' : '1 / -1' }}>
          <ChartCard title="Analyzed calls over time" subtitle="Daily volume of completed analyses" minHeight={220}>
            {timeData.length === 0 ? <ChartEmpty /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeData} margin={CHART.margin}>
                  <GradientDefs colors={[ACCENT]} top={0.5} bottom={0.02} />
                  <CartesianGrid {...CHART.grid} />
                  <XAxis dataKey="name" {...CHART.axis} minTickGap={18} />
                  <YAxis allowDecimals={false} {...CHART.axis} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name="Calls" stroke={ACCENT} strokeWidth={2}
                    fill={grad(ACCENT)} dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }} {...CHART.animation} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Rep leaderboard — a table is the right form for a ranked, multi-metric list */}
      <ChartCard title="Rep leaderboard" subtitle="Calls, average intent, talk-share and sentiment split per Consumer Champion">
        {reps.length === 0 ? <ChartEmpty message="No rep activity yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={thTd}>Champion</th>
                  <th style={{ ...thTd, textAlign: 'right' }}>Calls</th>
                  <th style={{ ...thTd, textAlign: 'right' }}>Avg intent</th>
                  <th style={{ ...thTd, textAlign: 'right' }}>Talk-share</th>
                  <th style={thTd}>Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r) => {
                  const total = r.positive + r.neutral + r.negative || 1;
                  return (
                    <tr key={r.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...thTd, fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                      <td style={{ ...thTd, textAlign: 'right' }}>{r.calls}</td>
                      <td style={{ ...thTd, textAlign: 'right' }}>
                        {r.avg_intent_score != null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <span style={{ width: 54, height: 5, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${Math.min(100, r.avg_intent_score)}%`, background: ACCENT }} />
                            </span>
                            <span style={{ fontWeight: 700 }}>{r.avg_intent_score}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ ...thTd, textAlign: 'right' }}>{r.avg_talk_pct != null ? `${r.avg_talk_pct}%` : '—'}</td>
                      <td style={thTd}>
                        <span style={{ display: 'inline-flex', width: 120, height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--s3)' }}
                          title={`${r.positive} positive · ${r.neutral} neutral · ${r.negative} negative`}>
                          <span style={{ width: `${(r.positive / total) * 100}%`, background: OK }} />
                          <span style={{ width: `${(r.neutral / total) * 100}%`, background: WARN }} />
                          <span style={{ width: `${(r.negative / total) * 100}%`, background: BAD }} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

const thTd: React.CSSProperties = { padding: '8px 10px', whiteSpace: 'nowrap' };

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: accent || 'var(--text)', lineHeight: 1.05 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>}
      </div>
    </div>
  );
}
