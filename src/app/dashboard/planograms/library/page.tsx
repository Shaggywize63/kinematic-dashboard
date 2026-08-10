'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import planogramApi from '../../../../lib/planogramApi';
import type { Planogram, TrendPoint, StoreRanking } from '../../../../types/planogram';
import {
  PC,
  SectionCard,
  StateBlock,
  useIsCompact,
  scoreTone,
  toneColor,
  fmtDate,
  fmtPct,
  TableScroll,
  th,
  thR,
  td,
  tdR,
} from '../_components/planogramUi';

/**
 * Planograms library — the planogram-definitions directory.
 *
 * The list endpoint returns summary columns only (id, name, category,
 * store_format, version, is_active, updated_at) — NOT expected_skus or layout.
 * So we paint the directory instantly from the summary, then enrich each row
 * with its expected-SKU and tracked-competitor counts by fetching detail in the
 * background (the api client de-dupes + caches GETs, mirroring the Competitors
 * page). Rolling compliance trend + top stores are kept as supporting analytics.
 */

const BASE = '/dashboard/planograms';

const FORMAT_LABELS: Record<string, string> = {
  modern_trade: 'Modern trade',
  general_trade: 'General trade',
  hyper: 'Hyper',
};
function formatLabel(f: string | null | undefined): string {
  if (!f) return '—';
  return FORMAT_LABELS[f] || f;
}

export default function PlanogramLibraryPage() {
  const router = useRouter();
  const isCompact = useIsCompact();

  const [planograms, setPlanograms] = useState<Planogram[]>([]);
  const [detailById, setDetailById] = useState<Record<string, Planogram>>({});
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ranking, setRanking] = useState<StoreRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, r] = await Promise.all([
        planogramApi.list(),
        planogramApi.trend(30).catch(() => ({ data: [] as TrendPoint[] })),
        planogramApi.storeRanking(7).catch(() => ({ data: [] as StoreRanking[] })),
      ]);
      const summaries = p.data || [];
      setPlanograms(summaries);
      setTrend((t as { data: TrendPoint[] }).data || []);
      setRanking((r as { data: StoreRanking[] }).data || []);
      setError('');
      setLoading(false);

      // Enrich in the background: detail carries expected_skus + layout, which
      // the summary list omits. allSettled so one bad row can't blank the rest.
      if (summaries.length) {
        setEnriching(true);
        const results = await Promise.allSettled(summaries.map((x) => planogramApi.get(x.id)));
        const map: Record<string, Planogram> = {};
        results.forEach((res, i) => {
          if (res.status === 'fulfilled' && res.value?.data) map[summaries[i].id] = res.value.data;
        });
        setDetailById(map);
        setEnriching(false);
      } else {
        setDetailById({});
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load planograms');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Library-level stats derived from what the page loads (counts come from the
  // enriched detail, so they climb as detail resolves — safe while partial).
  const stats = useMemo(() => {
    const total = planograms.length;
    const active = planograms.filter((p) => p.is_active).length;
    let skus = 0;
    let competitors = 0;
    for (const id of Object.keys(detailById)) {
      const d = detailById[id];
      skus += d.expected_skus?.length || 0;
      competitors += d.layout?.competitors?.length || 0;
    }
    return { total, active, skus, competitors };
  }, [planograms, detailById]);

  // Compliance analytics kept as supporting context (owned primarily by Overview).
  const avgScore = trend.length
    ? Math.round((trend.reduce((s, p) => s + p.avg_score, 0) / trend.length) * 10) / 10
    : null;
  const totalCaptures = trend.reduce((s, p) => s + p.captures, 0);
  const trendDelta = computeTrendDelta(trend);

  const trendCaption =
    trend.length === 0
      ? 'Not enough data yet.'
      : `Rolling avg ${avgScore}%` +
        (trend.length >= 4 ? ` · ${trendDelta >= 0 ? '+' : ''}${trendDelta}% vs first half` : '') +
        ` · ${totalCaptures} capture${totalCaptures === 1 ? '' : 's'}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <StateBlock tone="error">{error}</StateBlock>}

      {/* Library summary stats — directory-relevant, derived from loaded data */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        <Stat dot={PC.info} label="Planograms" value={loading ? '·' : String(stats.total)} />
        <Stat dot={PC.good} label="Active" value={loading ? '·' : String(stats.active)} />
        <Stat
          dot={PC.brand}
          label="Expected SKUs"
          value={loading ? '·' : String(stats.skus)}
          soft={enriching}
        />
        <Stat
          dot={PC.warn}
          label="Tracked competitors"
          value={loading ? '·' : String(stats.competitors)}
          soft={enriching}
        />
      </div>

      {/* Planograms directory — the primary content */}
      <SectionCard
        title="Planograms"
        caption="Expected shelf layouts per store format — recognition scores captures against these."
        right={
          <Link
            href={`${BASE}/new`}
            style={{
              background: PC.brand,
              color: '#fff',
              borderRadius: 9,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden style={{ fontSize: 15, lineHeight: 0 }}>
              +
            </span>{' '}
            New planogram
          </Link>
        }
        bodyPad={false}
      >
        {loading ? (
          <StateBlock>Loading planograms…</StateBlock>
        ) : planograms.length === 0 ? (
          <div style={{ padding: 16 }}>
            <div
              style={{
                border: `1px dashed ${PC.border}`,
                borderRadius: 12,
                padding: '30px 20px',
                textAlign: 'center',
                background: PC.surface2,
              }}
            >
              <div style={{ fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 15, color: PC.text }}>
                No planograms yet
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: PC.muted,
                  marginTop: 6,
                  maxWidth: 460,
                  marginInline: 'auto',
                  lineHeight: 1.55,
                }}
              >
                Upload a brand planogram image and the AI extracts the expected shelf layout — then
                captures are scored against it.
              </div>
              <Link
                href={`${BASE}/new`}
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  background: PC.brand,
                  color: '#fff',
                  border: 0,
                  borderRadius: 9,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                + New planogram
              </Link>
            </div>
          </div>
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={th}>Planogram</th>
                  <th style={th}>Category</th>
                  <th style={th}>Store format</th>
                  <th style={thR}>Expected SKUs</th>
                  <th style={thR}>Competitors</th>
                  <th style={thR}>Updated</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {planograms.map((p) => {
                  const d = detailById[p.id];
                  const loaded = !!d;
                  const skuCount = d?.expected_skus?.length ?? 0;
                  const compCount = d?.layout?.competitors?.length ?? 0;
                  return (
                    <tr
                      key={p.id}
                      data-clickable="true"
                      onClick={() => router.push(`${BASE}/${p.id}`)}
                    >
                      <td style={td}>
                        <Link
                          href={`${BASE}/${p.id}`}
                          style={{ color: PC.text, fontWeight: 600, textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        <div style={{ fontSize: 11, color: PC.muted, marginTop: 2 }}>v{p.version}</div>
                      </td>
                      <td style={{ ...td, color: PC.muted }}>{p.category || 'Uncategorized'}</td>
                      <td style={{ ...td, color: PC.muted }}>{formatLabel(p.store_format)}</td>
                      <td style={tdR}>
                        <CountCell value={skuCount} loaded={loaded} />
                      </td>
                      <td style={tdR}>
                        <CountCell value={compCount} loaded={loaded} zeroDash />
                      </td>
                      <td style={{ ...tdR, color: PC.muted, whiteSpace: 'nowrap' }}>
                        {fmtDate(p.updated_at)}
                      </td>
                      <td style={td}>
                        <StatusPill active={!!p.is_active} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </SectionCard>

      {/* Supporting analytics — compliance trend + top stores */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1.5fr 1fr',
          gap: 16,
        }}
      >
        <SectionCard title="Compliance trend" caption={loading ? 'Loading…' : trendCaption}>
          {loading ? (
            <StateBlock>Loading…</StateBlock>
          ) : trend.length === 0 ? (
            <StateBlock>Not enough data yet.</StateBlock>
          ) : (
            <Sparkline data={trend.map((t) => t.avg_score)} />
          )}
        </SectionCard>

        <SectionCard title="Top stores" caption="Highest compliance over the last 7 days" bodyPad={false}>
          {loading ? (
            <StateBlock>Loading…</StateBlock>
          ) : ranking.length === 0 ? (
            <StateBlock>No captures yet.</StateBlock>
          ) : (
            <div>
              {ranking.slice(0, 8).map((r, i) => {
                const tone = scoreTone(r.avg_score);
                return (
                  <div
                    key={r.bucket}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 18px',
                      borderTop: i === 0 ? 'none' : `1px solid ${PC.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: PC.surface3,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: PC.muted,
                          flex: 'none',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: PC.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={r.bucket_label}
                        >
                          {r.bucket_label}
                        </div>
                        <div style={{ fontSize: 11, color: PC.muted, marginTop: 1 }}>
                          {r.captures} capture{r.captures === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 800,
                        color: toneColor(tone),
                        fontVariantNumeric: 'tabular-nums',
                        flex: 'none',
                      }}
                    >
                      {fmtPct(r.avg_score)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ dot, label, value, soft }: { dot: string; label: string; value: string; soft?: boolean }) {
  return (
    <div
      style={{
        background: PC.surface,
        border: `1px solid ${PC.border}`,
        borderRadius: 14,
        padding: '15px 16px',
        boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: PC.muted, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-manrope)',
          fontSize: 27,
          fontWeight: 800,
          marginTop: 4,
          color: PC.text,
          fontVariantNumeric: 'tabular-nums',
          opacity: soft ? 0.72 : 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** A right-aligned numeric count that stays muted while detail is still loading. */
function CountCell({ value, loaded, zeroDash }: { value: number; loaded: boolean; zeroDash?: boolean }) {
  if (!loaded) return <span style={{ color: PC.muted, fontWeight: 400 }}>·</span>;
  if (value === 0 && zeroDash) return <span style={{ color: PC.muted }}>—</span>;
  return <span style={{ color: value === 0 ? PC.muted : PC.text, fontWeight: 700 }}>{value}</span>;
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2px 9px',
        borderRadius: 100,
        letterSpacing: '0.03em',
        background: active ? PC.goodWash : PC.surface3,
        color: active ? PC.good : PC.muted,
        whiteSpace: 'nowrap',
      }}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length)
    return <div style={{ fontSize: 12, color: PC.muted, padding: '20px 0' }}>Not enough data yet.</div>;
  const W = 600;
  const H = 96;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const span = max - min || 1;
  const n = data.length;
  const x = (i: number) => (n <= 1 ? W : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - min) / span) * (H - 12) - 6;
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} ${W},${H} 0,${H}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label="Compliance trend, last 30 days"
    >
      <polygon fill={PC.brandWash} points={area} />
      <polyline
        fill="none"
        stroke={PC.brand}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line}
      />
      {n > 0 && <circle cx={x(n - 1)} cy={y(data[n - 1])} r={3.5} fill={PC.brand} />}
    </svg>
  );
}

function computeTrendDelta(trend: TrendPoint[]) {
  if (trend.length < 4) return 0;
  const n = trend.length;
  const head = trend.slice(0, Math.floor(n / 2));
  const tail = trend.slice(Math.floor(n / 2));
  const avg = (arr: TrendPoint[]) => arr.reduce((s, p) => s + p.avg_score, 0) / arr.length;
  return Math.round((avg(tail) - avg(head)) * 10) / 10;
}
