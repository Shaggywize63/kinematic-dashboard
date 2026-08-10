'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import planogramApi from '../../../../lib/planogramApi';
import {
  PC,
  SectionCard,
  StateBlock,
  scoreTone,
  toneColor,
  fmtDate,
  useIsCompact,
  selyStyle,
} from '../_components/planogramUi';
import type {
  PlanogramInsights,
  InsightsCategoryShare,
  InsightsStoreRow,
  InsightsRegionRow,
  ChronicGap,
  RiskForecastRow,
} from '../../../../types/planogram';

// Module palette convention: own = green (PC.good), competitor = brand red
// (PC.brand). Compliance scores use the good/warn/bad tone scale.
const OWN = PC.good;
const COMP = PC.brand;

const PERIODS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 180 days' },
];

function money(v: number | null | undefined, currency = '₹'): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${currency}${Math.round(v).toLocaleString('en-IN')}`;
}
function pctText(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

export default function PlanogramInsightsPage() {
  const isCompact = useIsCompact();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<PlanogramInsights | null>(null);
  const [risk, setRisk] = useState<RiskForecastRow[]>([]);
  const [chronic, setChronic] = useState<ChronicGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Insights is the primary payload; the predictive watch-list endpoints are
      // best-effort (older, org-wide) so a failure there never blanks the page.
      const ins = await planogramApi.insights(days);
      setData(ins.data);
      const [r, g] = await Promise.allSettled([
        planogramApi.riskForecast(),
        planogramApi.chronicGaps(),
      ]);
      setRisk(r.status === 'fulfilled' ? r.value.data || [] : []);
      setChronic(g.status === 'fulfilled' ? g.value.data || [] : []);
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Refetch whenever the period changes (days is in fetchAll's deps).
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // store_id → display name, so the predictive watch-list rows (which return
  // only ids) can show real store names.
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data?.store_compliance || []) if (s.store_name) m.set(s.store_id, s.store_name);
    return m;
  }, [data]);

  const promo = data?.promo;
  const hasCategory = (data?.category_share.length ?? 0) > 0;
  const hasPrice = (data?.price_movement.some((p) => p.own_avg_price != null || p.competitor_avg_price != null)) ?? false;
  // Regions are only meaningful once stores carry a city; otherwise every row
  // collapses to "Unassigned".
  const regionsConfigured = (data?.region_compliance || []).some((r) => r.region !== 'Unassigned');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `.pg-fade{animation:pgFade .18s ease}@keyframes pgFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.pg-fade{animation:none}}`,
        }}
      />

      {/* Header + period scope */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-manrope)', fontSize: 22, fontWeight: 800, margin: 0, color: PC.text }}>
            Insights
          </h1>
          <div style={{ fontSize: 12.5, color: PC.muted, marginTop: 5 }}>
            Cross-store trends — compliance, category shelf-share, own-vs-competitor pricing & promotions.
          </div>
        </div>
        <select
          aria-label="Time period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ ...selyStyle, minWidth: 150 }}
        >
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error && <StateBlock tone="error">{error}</StateBlock>}

      {loading && !data ? (
        <StateBlock>Loading insights…</StateBlock>
      ) : data && data.captures_count === 0 ? (
        <SectionCard>
          <StateBlock>
            No scored captures in this window yet. As field reps capture shelves — and older captures are
            re-analyzed — trends build here.
          </StateBlock>
        </SectionCard>
      ) : data ? (
        <div className="pg-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Headline stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 9 }}>
            <Stat label="Captures analysed" value={String(data.captures_count)} sub={`across ${data.stores_count} store${data.stores_count === 1 ? '' : 's'}`} />
            <Stat
              label="Avg compliance"
              value={avgScoreText(data.compliance_trend)}
              valueColor={toneColor(scoreTone(avgScore(data.compliance_trend)))}
              sub="mean shelf score"
            />
            <Stat
              label="Own shelf share"
              value={pctText(avgOwnShare(data.store_compliance))}
              valueColor={OWN}
              sub="own vs competitor"
            />
            <Stat
              label="Promo presence"
              value={pctText(promo?.pct ?? 0)}
              valueColor={PC.info}
              sub={`${promo?.captures_with_promo ?? 0} of ${promo?.captures_total ?? 0} shelves`}
            />
          </div>

          {/* Compliance trend (full width) */}
          <SectionCard title="Compliance trend" caption="Org-wide average shelf-compliance score over time">
            <LineChart
              xLabels={data.compliance_trend.map((p) => fmtDate(p.date))}
              series={[{ label: 'Avg compliance', color: PC.info, points: data.compliance_trend.map((p) => p.avg_score), area: true }]}
              yDomain="pct"
              formatY={(v) => String(Math.round(v))}
              height={150}
            />
          </SectionCard>

          {/* Category share + Price movement */}
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 16 }}>
            <SectionCard title="Category shelf-share" caption="Own vs competitor facings share, per category">
              {hasCategory ? (
                <CategoryShare rows={data.category_share} />
              ) : (
                <StateBlock>No category breakdown yet — re-analyze captures to populate this.</StateBlock>
              )}
            </SectionCard>

            <SectionCard title="Price movement" caption="Average shelf price — MoiSoi vs competitor">
              {hasPrice ? (
                <>
                  <Legend items={[{ label: 'MoiSoi', color: OWN }, { label: 'Competitor', color: COMP }]} />
                  <LineChart
                    xLabels={data.price_movement.map((p) => fmtDate(p.date))}
                    series={[
                      { label: 'MoiSoi', color: OWN, points: data.price_movement.map((p) => p.own_avg_price) },
                      { label: 'Competitor', color: COMP, points: data.price_movement.map((p) => p.competitor_avg_price) },
                    ]}
                    yDomain="auto"
                    formatY={(v) => money(v)}
                    height={150}
                  />
                </>
              ) : (
                <StateBlock>No shelf prices read yet in this window.</StateBlock>
              )}
            </SectionCard>
          </div>

          {/* Store compliance (ranked) */}
          <SectionCard title="Compliance by store" caption="Average score, own shelf-share & competitor share per store — best first">
            {data.store_compliance.length === 0 ? (
              <StateBlock>No per-store data in this window.</StateBlock>
            ) : (
              <StoreRanking rows={data.store_compliance} isCompact={isCompact} />
            )}
          </SectionCard>

          {/* Region compliance + Promo presence */}
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 16 }}>
            <SectionCard title="Compliance by region" caption={regionsConfigured ? 'Average score per region (store city)' : 'Set store cities to break compliance down by region'}>
              {data.region_compliance.length === 0 ? (
                <StateBlock>No regional data in this window.</StateBlock>
              ) : (
                <RegionRanking rows={data.region_compliance} />
              )}
            </SectionCard>

            <SectionCard title="Promotions on shelf" caption="How often shelves carry a live offer, and the offers seen">
              <PromoCard promo={promo} />
            </SectionCard>
          </div>

          {/* Predictive watch-list (reuses the existing org-wide signals) */}
          {(risk.length > 0 || chronic.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 16 }}>
              <SectionCard title="Stores at risk" caption="Compliance trending down — likely to slip next visit">
                {risk.length === 0 ? (
                  <StateBlock>No at-risk stores.</StateBlock>
                ) : (
                  risk.slice(0, 6).map((r) => (
                    <WatchRow
                      key={r.store_id}
                      name={storeNameById.get(r.store_id) || `${r.store_id.slice(0, 8)}…`}
                      detail={`Latest ${Math.round(r.latest)}% · ${r.slope >= 0 ? '+' : ''}${r.slope}/day`}
                      right={<RiskBadge risk={r.risk} />}
                    />
                  ))
                )}
              </SectionCard>
              <SectionCard title="Chronic gaps" caption="Repeatedly below target over the last few captures">
                {chronic.length === 0 ? (
                  <StateBlock>No chronic gaps detected.</StateBlock>
                ) : (
                  chronic.slice(0, 6).map((c) => (
                    <WatchRow
                      key={c.store_id}
                      name={storeNameById.get(c.store_id) || `${c.store_id.slice(0, 8)}…`}
                      detail={`${c.failing} of last 5 captures failing`}
                      right={<span style={{ fontSize: 14, fontWeight: 800, color: toneColor(scoreTone(c.avg_score)), fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.avg_score)}%</span>}
                    />
                  ))
                )}
              </SectionCard>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Derived headline helpers ─────────────────────────────────────────────────
function avgScore(trend: PlanogramInsights['compliance_trend']): number | null {
  const totCaptures = trend.reduce((s, p) => s + p.captures, 0);
  if (!totCaptures) return null;
  // Weight each day's average by its capture count for a true mean.
  const weighted = trend.reduce((s, p) => s + p.avg_score * p.captures, 0);
  return Math.round((weighted / totCaptures) * 10) / 10;
}
function avgScoreText(trend: PlanogramInsights['compliance_trend']): string {
  const v = avgScore(trend);
  return v == null ? '—' : String(Math.round(v));
}
function avgOwnShare(rows: InsightsStoreRow[]): number | null {
  const vals = rows.map((r) => r.own_shelf_share).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// ── Stat tile ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div style={{ background: PC.surface, border: `1px solid ${PC.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: PC.muted, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: valueColor || PC.text, marginTop: 5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: PC.muted, fontWeight: 600 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: 'inline-block' }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Line / area chart (SVG, 1–2 series, theme-aware) ─────────────────────────
type ChartSeries = { label: string; color: string; points: (number | null)[]; area?: boolean };
function LineChart({
  xLabels,
  series,
  yDomain,
  formatY,
  height = 150,
}: {
  xLabels: string[];
  series: ChartSeries[];
  yDomain: 'pct' | 'auto';
  formatY: (v: number) => string;
  height?: number;
}) {
  const n = xLabels.length;
  const allVals = series.flatMap((s) => s.points).filter((v): v is number => v != null);
  if (n === 0 || allVals.length === 0) return <StateBlock>No data in this window.</StateBlock>;

  const W = 640;
  const H = 180;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;

  let yMin: number;
  let yMax: number;
  if (yDomain === 'pct') {
    yMin = 0;
    yMax = 100;
  } else {
    const lo = Math.min(...allVals);
    const hi = Math.max(...allVals);
    if (lo === hi) {
      yMin = Math.max(0, lo - Math.max(1, lo * 0.1));
      yMax = hi + Math.max(1, hi * 0.1);
    } else {
      const pad = (hi - lo) * 0.15;
      yMin = Math.max(0, lo - pad);
      yMax = hi + pad;
    }
  }
  const span = yMax - yMin || 1;

  const x = (i: number) => (n <= 1 ? W / 2 : padL + (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - yMin) / span) * (H - padT - padB);

  // Build path segments per series, breaking on nulls.
  const buildPath = (pts: (number | null)[]) => {
    let d = '';
    let pen = false;
    pts.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const buildArea = (pts: (number | null)[]) => {
    // Simple area only makes sense for a single continuous series; fall back to
    // no area if there are gaps.
    if (pts.some((v) => v == null)) return '';
    const top = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v as number).toFixed(1)}`).join(' ');
    return `${top} L${x(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  };

  const gridVals = [yMax, (yMax + yMin) / 2, yMin];
  const labelIdx = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" role="img" style={{ display: 'block' }}>
          {/* gridlines */}
          {gridVals.map((gv, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke={PC.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {/* areas → lines → dots */}
          {series.map((s, si) => (s.area ? <path key={`a${si}`} d={buildArea(s.points)} fill={s.color} opacity={0.12} /> : null))}
          {series.map((s, si) => (
            <path key={`l${si}`} d={buildPath(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s, si) =>
            s.points.map((v, i) => (v == null ? null : <circle key={`d${si}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color} vectorEffect="non-scaling-stroke" />)),
          )}
        </svg>
        {/* Crisp y-axis reference labels, overlaid at the top/bottom-left. */}
        <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 10.5, color: PC.muted, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>{formatY(yMax)}</span>
        <span style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 10.5, color: PC.muted, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>{formatY(yMin)}</span>
      </div>
      {/* x labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: PC.muted, marginTop: 6 }}>
        {labelIdx.map((i) => (
          <span key={i}>{xLabels[i]}</span>
        ))}
      </div>
    </div>
  );
}

// ── Category shelf-share (stacked own/competitor bars) ───────────────────────
function CategoryShare({ rows }: { rows: InsightsCategoryShare[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Legend items={[{ label: 'Own', color: OWN }, { label: 'Competitor', color: COMP }]} />
      {rows.map((r) => {
        const total = r.own_share + r.competitor_share || 1;
        const ownPct = (r.own_share / total) * 100;
        const compPct = (r.competitor_share / total) * 100;
        return (
          <div key={r.category}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span style={{ fontWeight: 600, color: PC.text }}>{r.category}</span>
              <span style={{ color: PC.muted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(r.own_share)}% own · {r.facings} facings
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: PC.surface3 }}>
              <div style={{ width: `${ownPct}%`, background: OWN }} title={`Own ${Math.round(r.own_share)}%`} />
              <div style={{ width: `${compPct}%`, background: COMP }} title={`Competitor ${Math.round(r.competitor_share)}%`} />
            </div>
            {(r.avg_own_price != null || r.avg_competitor_price != null) && (
              <div style={{ fontSize: 11, color: PC.muted, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
                Avg price — own <b style={{ color: PC.text }}>{money(r.avg_own_price)}</b>
                {r.avg_competitor_price != null && (
                  <> · competitor <b style={{ color: PC.text }}>{money(r.avg_competitor_price)}</b></>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Store ranking (score meter + shares) ─────────────────────────────────────
function StoreRanking({ rows, isCompact }: { rows: InsightsStoreRow[]; isCompact: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => {
        const tone = toneColor(scoreTone(r.avg_score));
        return (
          <div
            key={r.store_id}
            style={{
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr auto' : '18px minmax(0,1.4fr) 1fr auto',
              alignItems: 'center',
              gap: 12,
              padding: '11px 2px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${PC.border}`,
            }}
          >
            {!isCompact && <span style={{ fontSize: 12, color: PC.muted, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.store_name || `${r.store_id.slice(0, 8)}…`}
              </div>
              <div style={{ fontSize: 11, color: PC.muted, marginTop: 2 }}>
                {r.region && r.region !== 'Unassigned' ? `${r.region} · ` : ''}
                {r.captures} capture{r.captures === 1 ? '' : 's'}
                {r.own_shelf_share != null ? ` · ${Math.round(r.own_shelf_share)}% own share` : ''}
              </div>
            </div>
            {!isCompact && (
              <div style={{ height: 8, borderRadius: 4, background: PC.surface3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, r.avg_score))}%`, height: '100%', background: tone }} />
              </div>
            )}
            <span style={{ fontSize: 14, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'right' }}>
              {Math.round(r.avg_score)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Region ranking ───────────────────────────────────────────────────────────
function RegionRanking({ rows }: { rows: InsightsRegionRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => {
        const tone = toneColor(scoreTone(r.avg_score));
        return (
          <div
            key={r.region}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 1fr auto',
              alignItems: 'center',
              gap: 12,
              padding: '11px 2px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${PC.border}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: PC.text }}>{r.region}</div>
              <div style={{ fontSize: 11, color: PC.muted, marginTop: 2 }}>
                {r.stores} store{r.stores === 1 ? '' : 's'} · {r.captures} capture{r.captures === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: PC.surface3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, r.avg_score))}%`, height: '100%', background: tone }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'right' }}>
              {Math.round(r.avg_score)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Promo presence ───────────────────────────────────────────────────────────
const OFFER_LABEL: Record<string, string> = {
  price_off: 'Price off',
  bundle: 'Bundle',
  bogo: 'BOGO',
  combo: 'Combo',
  other: 'Offer',
};
function PromoCard({ promo }: { promo: PlanogramInsights['promo'] | undefined }) {
  if (!promo) return <StateBlock>No promotion data.</StateBlock>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: PC.info, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {Math.round(promo.pct)}%
        </span>
        <span style={{ fontSize: 12.5, color: PC.muted }}>
          of shelves carried a live offer<br />
          <b style={{ color: PC.text }}>{promo.captures_with_promo}</b> of {promo.captures_total} captures
        </span>
      </div>

      {promo.trend.length > 1 && (
        <LineChart
          xLabels={promo.trend.map((p) => fmtDate(p.date))}
          series={[{ label: 'Promo %', color: PC.info, points: promo.trend.map((p) => p.pct), area: true }]}
          yDomain="pct"
          formatY={(v) => `${Math.round(v)}%`}
          height={90}
        />
      )}

      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: PC.muted, fontWeight: 700, marginBottom: 8 }}>
          Offers seen
        </div>
        {promo.top_offers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: PC.muted }}>No promotions detected in this window.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {promo.top_offers.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: PC.brandWash, color: PC.brand, whiteSpace: 'nowrap' }}>
                    {OFFER_LABEL[o.offer_type] || 'Offer'}
                  </span>
                  <span style={{ fontSize: 12.5, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.text}</span>
                </span>
                <span style={{ fontSize: 11.5, color: PC.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  ×{o.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Watch-list row + risk badge ──────────────────────────────────────────────
function WatchRow({ name, detail, right }: { name: string; detail: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 2px', borderBottom: `1px solid ${PC.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: PC.muted, marginTop: 2 }}>{detail}</div>
      </div>
      {right}
    </div>
  );
}

function RiskBadge({ risk }: { risk: number }) {
  const t = risk >= 70 ? { c: PC.bad, w: PC.badWash, l: 'HIGH' } : risk >= 50 ? { c: PC.warn, w: PC.warnWash, l: 'MED' } : { c: PC.good, w: PC.goodWash, l: 'LOW' };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: t.w, color: t.c, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {t.l} · {Math.round(risk)}
    </span>
  );
}
