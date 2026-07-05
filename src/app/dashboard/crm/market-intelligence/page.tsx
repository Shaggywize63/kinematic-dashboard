'use client';

/**
 * Market Intelligence — the competitive/market "ground truth" mined from rep
 * field notes. Every lead update (typed or voice-dictated) is run through KINI
 * server-side to extract structured signals (competitor mentions, price deltas,
 * stock-outs, timelines, intent); this page rolls them up so a manufacturer can
 * see which competitor is winning which city, the price gaps, and the trend.
 *
 * Subscribes to the global city scope + date range, so changing either refetches.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { useCityScope } from '../../../../context/CityScopeContext';
import {
  crmMarketIntel,
  type IntelCompetitorShare, type IntelCompetitorPrice, type IntelSignalBreakdown,
  type IntelByCity, type IntelTrendPoint, type IntelSignal,
} from '../../../../lib/crmAnalyticsExtApi';
import { ChartCard, ChartTooltip, GradientDefs, grad, CHART, CHART_PALETTE, CHART_SEMANTIC } from '../../../../lib/chartTheme';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

const BRAND = CHART_SEMANTIC.lost;
const WIN = CHART_SEMANTIC.won;
const PIE_COLORS = CHART_PALETTE;

const SIGNAL_LABELS: Record<string, string> = {
  competitor_mention: 'Competitor', price: 'Price', stockout: 'Stock-out',
  timeline: 'Timeline', quality: 'Quality', intent: 'Intent', other: 'Other',
};

// Delegate to the shared animated, gradient-accented chart frame so every card
// on this page picks up the new visual language + entrance animation.
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <ChartCard title={title} subtitle={subtitle}>{children}</ChartCard>;
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? BRAND : 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function MarketIntelligencePage() {
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  const { selectedCity } = useCityScope();

  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<IntelCompetitorShare[]>([]);
  const [price, setPrice] = useState<IntelCompetitorPrice[]>([]);
  const [breakdown, setBreakdown] = useState<IntelSignalBreakdown[]>([]);
  const [byCity, setByCity] = useState<IntelByCity[]>([]);
  const [trend, setTrend] = useState<IntelTrendPoint[]>([]);
  const [feed, setFeed] = useState<IntelSignal[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Each call is independent; one failing (e.g. pre-migration) must not blank
    // the whole page, so settle them individually.
    Promise.allSettled([
      crmMarketIntel.competitorShare(range),
      crmMarketIntel.competitorPrice(range),
      crmMarketIntel.signalBreakdown(range),
      crmMarketIntel.byCity(range),
      crmMarketIntel.trend(range),
      crmMarketIntel.feed(range, 50),
    ]).then((res) => {
      if (cancelled) return;
      const val = <T,>(r: PromiseSettledResult<{ data: T }>, fallback: T): T =>
        r.status === 'fulfilled' ? (r.value.data ?? fallback) : fallback;
      setShare(val(res[0] as PromiseSettledResult<{ data: IntelCompetitorShare[] }>, []));
      setPrice(val(res[1] as PromiseSettledResult<{ data: IntelCompetitorPrice[] }>, []));
      setBreakdown(val(res[2] as PromiseSettledResult<{ data: IntelSignalBreakdown[] }>, []));
      setByCity(val(res[3] as PromiseSettledResult<{ data: IntelByCity[] }>, []));
      setTrend(val(res[4] as PromiseSettledResult<{ data: IntelTrendPoint[] }>, []));
      setFeed(val(res[5] as PromiseSettledResult<{ data: IntelSignal[] }>, []));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range.from, range.to, selectedCity]);

  const totals = useMemo(() => {
    const mentions = share.reduce((s, r) => s + r.mentions, 0);
    const losing = share.reduce((s, r) => s + r.we_losing, 0);
    return { mentions, losing, competitors: share.length };
  }, [share]);

  const pieData = useMemo(
    () => breakdown.map((b) => ({ name: SIGNAL_LABELS[b.signal_type] || b.signal_type, value: b.count })),
    [breakdown],
  );

  const hasAny = totals.mentions > 0 || feed.length > 0 || breakdown.length > 0;

  // Type-aware client-side column sorting for the "By city" breakdown table.
  const cityVal = useCallback((c: IntelByCity, key: string): unknown => {
    switch (key) {
      case 'city': return c.city;
      case 'mentions': return c.mentions;
      case 'winning': return c.we_winning;
      case 'losing': return c.we_losing;
      default: return (c as unknown as Record<string, unknown>)[key];
    }
  }, []);
  const { sorted: sortedCities, sort: citySort, toggle: cityToggle } = useTableSort<IntelByCity>(byCity, cityVal, { key: null, dir: 'asc' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Market Intelligence</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '6px 0 0', maxWidth: 760 }}>
          Competitive ground-truth mined automatically from your reps&apos; field notes — who&apos;s winning which
          city, the price gaps, stock-outs and buying signals. Respects the global city &amp; date filters.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading market signals…</div>
      ) : !hasAny ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          No market signals yet. As reps log lead updates (by typing or voice), KINI extracts competitor and
          pricing intelligence here automatically.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi label="Signals" value={totals.mentions} />
            <Kpi label="Competitors seen" value={totals.competitors} />
            <Kpi label="We're losing (mentions)" value={totals.losing} accent />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <Card title="Competitor share of voice" subtitle="Mentions in the field, with where we're losing">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={share} layout="vertical" margin={{ left: 12 }}>
                  <GradientDefs colors={[BRAND, WIN]} />
                  <CartesianGrid {...CHART.grid} horizontal={false} />
                  <XAxis type="number" {...CHART.axis} />
                  <YAxis type="category" dataKey="competitor" width={110} {...CHART.axis} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--s3)', opacity: 0.4 }} />
                  <Legend />
                  <Bar dataKey="we_losing" name="We're losing" stackId="a" fill={grad(BRAND)} {...CHART.animation} />
                  <Bar dataKey="we_winning" name="We're winning" stackId="a" fill={grad(WIN)} radius={CHART.hBarRadius} {...CHART.animation} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Price gap vs competitors" subtitle="Avg competitor price minus ours (negative = they're cheaper)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={price} layout="vertical" margin={{ left: 12 }}>
                  <GradientDefs colors={[BRAND, WIN]} />
                  <CartesianGrid {...CHART.grid} horizontal={false} />
                  <XAxis type="number" {...CHART.axis} />
                  <YAxis type="category" dataKey="competitor" width={110} {...CHART.axis} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--s3)', opacity: 0.4 }} />
                  <Bar dataKey="avg_price_delta" name="Avg price delta" radius={CHART.hBarRadius} {...CHART.animation}>
                    {price.map((p, i) => (
                      <Cell key={i} fill={p.avg_price_delta < 0 ? grad(BRAND) : grad(WIN)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Signal mix" subtitle="What the field is telling us">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={3} stroke="var(--s2)" strokeWidth={2} {...CHART.animation}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Trend" subtitle="Monthly signals and competitive losses">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid {...CHART.grid} />
                  <XAxis dataKey="month" {...CHART.axis} />
                  <YAxis {...CHART.axis} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="mentions" name="Signals" stroke={CHART_SEMANTIC.primary} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} {...CHART.animation} />
                  <Line type="monotone" dataKey="we_losing" name="We're losing" stroke={BRAND} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} {...CHART.animation} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="By city" subtitle="Where we're winning and losing on the ground">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}><SortLabel label="City" sortKey="city" sort={citySort} onToggle={cityToggle} /></th>
                    <th style={{ padding: '6px 8px' }}><SortLabel label="Signals" sortKey="mentions" sort={citySort} onToggle={cityToggle} /></th>
                    <th style={{ padding: '6px 8px' }}><SortLabel label="Winning" sortKey="winning" sort={citySort} onToggle={cityToggle} /></th>
                    <th style={{ padding: '6px 8px' }}><SortLabel label="Losing" sortKey="losing" sort={citySort} onToggle={cityToggle} /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCities.map((c) => (
                    <tr key={c.city} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{c.city}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{c.mentions}</td>
                      <td style={{ padding: '6px 8px', color: '#16A34A' }}>{c.we_winning}</td>
                      <td style={{ padding: '6px 8px', color: BRAND }}>{c.we_losing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Recent signals" subtitle="The raw field notes behind the numbers">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {feed.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.stance === 'we_losing' ? 'rgba(224,30,44,0.12)' : 'var(--s3)', color: s.stance === 'we_losing' ? BRAND : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {SIGNAL_LABELS[s.signal_type] || s.signal_type}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{s.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {[s.competitor_name, s.city, s.price_delta != null ? `Δ ${s.price_delta}` : null]
                        .filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
