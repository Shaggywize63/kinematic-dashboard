'use client';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  PieChart, Pie, AreaChart, Area, Tooltip, Legend, LabelList,
} from 'recharts';
import {
  CHART, CHART_PALETTE, seriesColor, gradId, grad, GradientDefs, ChartCard, ChartTooltip,
} from '../../../lib/chartTheme';

/**
 * Auto-derived analytics for ANY report — no per-report config, so every
 * current and future report that renders <ReportRunner> gets charts for free.
 * Three brand-styled recharts surfaces are picked from the report's own
 * columns:
 *   • a donut of a categorical breakdown (identity)  → e.g. by Lead Source
 *   • a bar chart of the metric totals (magnitude)   → visits / calls / ₹ …
 *   • an area over time (change) when a Date column exists
 * Uses the shared chartTheme kit so it matches the rest of the dashboard's
 * analytics — vibrant palette, gradient fills, glassy tooltips, animation.
 */

const SUMMABLE = new Set([
  'Total Visits', 'Total Calls', 'Estimated Qty', 'Deal Tonnage', 'Deal Amount',
  'Attendees', 'Total Activity', 'Unique Lead', 'Lead Visit', 'Lead Call',
  'Dealer Visit', 'Other Visit', 'Deals', 'Tonnage (MT)',
]);
// Preferred categorical dimensions for the donut, best-insight first.
const CATEGORICAL_PRIORITY = [
  'Lead Source', 'Activity Type', 'Directory Type', 'Construction Stage',
  'Brand', 'Hierarchy', 'Owner Name', 'City', 'Dealer Name', 'Occupation',
];
const DATE_PRIORITY = ['Activity Date', 'Date', 'Creation Date', 'Lead Creation Date', 'Latest Activity Date'];

type Cellv = string | number | null;
type Data = { columns: string[]; rows: Cellv[][] };

function num(v: Cellv): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const isTotalRow = (r: Cellv[]) => String(r[0] ?? '').toLowerCase() === 'grand total';

export default function ReportCharts({ data }: { data: Data }) {
  const cols = data.columns;
  const rows = data.rows.filter((r) => !isTotalRow(r));
  if (rows.length === 0 || cols.length === 0) return null;

  const idx = (label: string) => cols.indexOf(label);

  // ── 1. Categorical breakdown → donut (top 6 + Other). ──────────────────
  let donut: { title: string; slices: Array<{ name: string; value: number }> } | null = null;
  for (const label of CATEGORICAL_PRIORITY) {
    const i = idx(label);
    if (i < 0) continue;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = String(r[i] ?? '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size < 2 || counts.size > 40) continue;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6).map(([name, value]) => ({ name, value }));
    const restTotal = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
    if (restTotal > 0) top.push({ name: 'Other', value: restTotal });
    donut = { title: `By ${label}`, slices: top };
    break;
  }

  // ── 2. Metric totals → bar chart. ──────────────────────────────────────
  const metricBars = cols
    .map((label, i) => ({ label, i }))
    .filter(({ label }) => SUMMABLE.has(label))
    .map(({ label, i }) => ({ name: label, value: Math.round(rows.reduce((s, r) => s + num(r[i]), 0) * 100) / 100 }))
    .filter((b) => b.value > 0);

  // ── 3. Over time → area (row count per day). ───────────────────────────
  let series: Array<{ date: string; value: number }> | null = null;
  const dateLabel = DATE_PRIORITY.find((l) => idx(l) >= 0);
  if (dateLabel) {
    const di = idx(dateLabel);
    const perDay = new Map<string, number>();
    for (const r of rows) {
      const raw = String(r[di] ?? '').trim();
      const day = raw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    if (perDay.size >= 2) {
      series = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
    }
  }

  if (!donut && metricBars.length === 0 && !series) return null;

  const donutColors = donut ? donut.slices.map((_, i) => seriesColor(i)) : [];
  const areaColor = CHART_PALETTE[0];

  return (
    <div style={{
      display: 'grid', gap: 12, marginBottom: 16,
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    }}>
      {donut && (
        <ChartCard title={donut.title} subtitle="Share of records">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <GradientDefs colors={donutColors} top={0.98} bottom={0.55} />
              <Pie
                data={donut.slices} dataKey="value" nameKey="name"
                innerRadius={52} outerRadius={82} paddingAngle={2}
                stroke="var(--s2)" strokeWidth={2}
                isAnimationActive animationDuration={700}
              >
                {donut.slices.map((_, i) => <Cell key={i} fill={grad(seriesColor(i))} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom" height={30} iconType="circle" iconSize={9}
                formatter={(v) => <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {metricBars.length > 0 && (
        <ChartCard title="Totals" subtitle="Summed across the period">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={metricBars} margin={CHART.margin}>
              <GradientDefs colors={metricBars.map((_, i) => seriesColor(i))} />
              <CartesianGrid {...CHART.grid} />
              <XAxis dataKey="name" {...CHART.axis} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis {...CHART.axis} width={44} />
              <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.25 }} content={<ChartTooltip />} />
              <Bar dataKey="value" radius={CHART.barRadius} {...CHART.animation}>
                {metricBars.map((_, i) => <Cell key={i} fill={grad(seriesColor(i))} />)}
                <LabelList dataKey="value" position="top" style={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} formatter={(v: number) => v.toLocaleString('en-IN')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {series && (
        <ChartCard title="Over time" subtitle="Records per day">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={CHART.margin}>
              <defs>
                <linearGradient id={gradId(areaColor)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={areaColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={areaColor} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid {...CHART.grid} />
              <XAxis dataKey="date" {...CHART.axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={18} />
              <YAxis {...CHART.axis} width={36} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="value" stroke={areaColor} strokeWidth={2} fill={`url(#${gradId(areaColor)})`} {...CHART.animation} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
