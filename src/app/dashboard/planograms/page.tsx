'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import planogramApi from '../../../lib/planogramApi';
import { useCityScope } from '../../../context/CityScopeContext';
import type {
  PlanogramOverview,
  OverviewTrendPoint,
  NeedsAttentionItem,
  OverviewRecentItem,
  CaptureListItem,
} from '../../../types/planogram';
import {
  PC,
  useIsCompact,
  scoreTone,
  toneColor,
  toneWash,
  fmtScore,
  fmtPct,
  fmtDateTime,
  ScorePill,
  CaptureFlags,
  SectionCard,
  StateBlock,
  selyStyle,
  TableScroll,
  th,
  thR,
  td,
  tdR,
} from './_components/planogramUi';

const PERIODS: { label: string; days: number }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export default function PlanogramOverviewPage() {
  const { selectedCity } = useCityScope();
  const isCompact = useIsCompact();
  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState<PlanogramOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const city = selectedCity || undefined;
      let ov: PlanogramOverview | null = null;
      // Primary: the pinned overview endpoint. It may not exist yet — fall back.
      try {
        const res = await planogramApi.getOverview({ city, period_days: period });
        ov = res?.data ?? null;
      } catch {
        ov = null;
      }
      if (!ov || isEmptyOverview(ov)) {
        ov = await buildFallbackOverview(city, period);
      }
      setOverview(ov);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [selectedCity, period]);

  useEffect(() => {
    load();
  }, [load]);

  const trend = overview?.trend ?? [];
  const needsAttention = overview?.needs_attention ?? [];
  const recent = overview?.recent ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Period control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: PC.muted, fontWeight: 600 }}>Shelf intelligence across your stores</span>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: PC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Period
          </span>
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            style={selyStyle}
            aria-label="Time period"
          >
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <StateBlock tone="error">{error}</StateBlock>}

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        <Kpi
          dot={PC.warn}
          label="Avg compliance"
          value={overview?.avg_compliance != null ? fmtScore(overview.avg_compliance) : '—'}
          unit="%"
          loading={loading}
        />
        <Kpi
          dot={PC.good}
          label="Own shelf-share"
          value={overview?.own_shelf_share != null ? fmtScore(overview.own_shelf_share) : '—'}
          unit="%"
          loading={loading}
        />
        <Kpi
          dot={PC.info}
          label="Captures"
          value={overview?.captures_count != null ? String(overview.captures_count) : '—'}
          sub={overview?.stores_count != null ? `${overview.stores_count} stores` : undefined}
          loading={loading}
        />
        <Kpi
          dot={PC.bad}
          label="Flagged"
          value={overview?.flagged_count != null ? String(overview.flagged_count) : '—'}
          sub="needs review"
          loading={loading}
        />
      </div>

      {/* Needs attention + trend */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1.5fr 1fr',
          gap: 14,
        }}
      >
        <SectionCard title="Needs attention" caption="Lowest-scoring & flagged captures — act on these first">
          {loading ? (
            <StateBlock>Loading…</StateBlock>
          ) : needsAttention.length === 0 ? (
            <StateBlock>Nothing flagged — every recent capture is in good shape.</StateBlock>
          ) : (
            <div>
              {needsAttention.map((item, i) => (
                <AttentionRow key={item.capture_id || i} item={item} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Compliance trend" caption="Rolling average over the period">
          {loading ? (
            <StateBlock>Loading…</StateBlock>
          ) : trend.length === 0 ? (
            <StateBlock>Not enough data yet.</StateBlock>
          ) : (
            <TrendChart points={trend} />
          )}
        </SectionCard>
      </div>

      {/* Recent captures */}
      <SectionCard title="Recent captures" caption="Latest shelf audits across stores" bodyPad={false}>
        {loading ? (
          <StateBlock>Loading…</StateBlock>
        ) : recent.length === 0 ? (
          <StateBlock>No captures yet. Field executives capture shelves from the mobile app.</StateBlock>
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Store</th>
                  <th style={th}>Category bay</th>
                  <th style={th}>Date</th>
                  <th style={thR}>Compliance</th>
                  <th style={th}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <RecentRow key={r.capture_id || i} row={r} />
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </SectionCard>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function AttentionRow({ item }: { item: NeedsAttentionItem }) {
  const t = scoreTone(item.score);
  return (
    <Link
      href={`/dashboard/planograms/captures/${item.capture_id}`}
      style={{
        display: 'flex',
        gap: 11,
        alignItems: 'center',
        padding: '11px 0',
        borderTop: `1px solid ${PC.border}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 15,
          flex: 'none',
          color: toneColor(t),
          background: toneWash(t),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtScore(item.score)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.store_name || 'Unknown store'}
        </div>
        <div style={{ fontSize: 12, color: PC.muted }}>{item.reason || 'Flagged for review'}</div>
      </div>
      <span aria-hidden style={{ color: PC.muted, fontSize: 18 }}>
        ›
      </span>
    </Link>
  );
}

function RecentRow({ row }: { row: OverviewRecentItem }) {
  return (
    <tr
      data-clickable="true"
      onClick={() => {
        window.location.href = `/dashboard/planograms/captures/${row.capture_id}`;
      }}
    >
      <td style={td}>
        <Link
          href={`/dashboard/planograms/captures/${row.capture_id}`}
          style={{ color: PC.text, fontWeight: 600, textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.store_name || 'Unknown store'}
        </Link>
      </td>
      <td style={{ ...td, color: PC.muted }}>{row.category || '—'}</td>
      <td style={{ ...td, color: PC.muted, whiteSpace: 'nowrap' }}>{fmtDateTime(row.captured_at)}</td>
      <td style={tdR}>
        <ScorePill score={row.score} />
      </td>
      <td style={td}>
        <CaptureFlags
          recovered_count={row.recovered_count}
          needs_review={row.needs_review}
          competitor_present={row.competitor_present}
        />
      </td>
    </tr>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────

function Kpi({
  dot,
  label,
  value,
  unit,
  sub,
  loading,
}: {
  dot: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  loading?: boolean;
}) {
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
        }}
      >
        {loading ? '·' : value}
        {!loading && unit && value !== '—' && (
          <span style={{ fontSize: 14, color: PC.muted }}>{unit}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 5, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

// ── Trend chart (inline SVG) ─────────────────────────────────────────────────

function TrendChart({ points }: { points: OverviewTrendPoint[] }) {
  const W = 300;
  const H = 90;
  const scores = points.map((p) => p.avg_score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const span = max - min || 1;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - min) / span) * (H - 10) - 5;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.avg_score).toFixed(1)}`).join(' ');
  const area = `${line} ${W},${H} 0,${H}`;
  const last = points[n - 1];
  const first = points[0];
  return (
    <div style={{ paddingTop: 4 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={96} preserveAspectRatio="none" role="img" aria-label="Compliance trend">
        <polygon fill={PC.brandWash} points={area} />
        <polyline fill="none" stroke={PC.brand} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" points={line} />
        {n > 0 && <circle cx={x(n - 1)} cy={y(last.avg_score)} r={3.5} fill={PC.brand} />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: PC.muted, marginTop: 4 }}>
        <span>{fmtShortDate(first?.date)}</span>
        <span>{fmtShortDate(last?.date)}</span>
      </div>
    </div>
  );
}

function fmtShortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Fallback overview composition ────────────────────────────────────────────
// The pinned /overview endpoint may not exist yet. Compose an equivalent view
// from the endpoints that DO work today (captures list + analytics trend), so
// the page shows real numbers instead of an empty shell.

function isEmptyOverview(ov: PlanogramOverview): boolean {
  return (
    ov.avg_compliance == null &&
    ov.captures_count == null &&
    (!ov.recent || ov.recent.length === 0) &&
    (!ov.trend || ov.trend.length === 0)
  );
}

async function buildFallbackOverview(city: string | undefined, periodDays: number): Promise<PlanogramOverview> {
  const [capRes, trendRes] = await Promise.all([
    planogramApi.listCaptures({ city, limit: 300 }).catch(() => ({ success: false, data: { total: 0, captures: [] as CaptureListItem[] } })),
    planogramApi.trend(periodDays).catch(() => ({ success: false, data: [] as { day: string; avg_score: number; captures: number }[] })),
  ]);

  const allCaps = capRes.data.captures;
  const cutoff = Date.now() - periodDays * 86_400_000;
  const caps = allCaps.filter((c) => {
    const t = new Date(c.captured_at).getTime();
    return Number.isNaN(t) ? true : t >= cutoff;
  });

  const trendData = trendRes.data || [];
  const trend: OverviewTrendPoint[] = trendData.map((t) => ({ date: t.day, avg_score: t.avg_score }));

  const scored = caps.filter((c) => c.score != null);
  const avgFromCaps = scored.length ? scored.reduce((s, c) => s + (c.score || 0), 0) / scored.length : null;
  const avgFromTrend = trendData.length
    ? trendData.reduce((s, t) => s + t.avg_score, 0) / trendData.length
    : null;

  const shareVals = caps.filter((c) => c.shelf_share_own != null).map((c) => c.shelf_share_own as number);
  const ownShare = shareVals.length ? shareVals.reduce((a, b) => a + b, 0) / shareVals.length : null;

  const stores = new Set(caps.map((c) => c.store_id).filter(Boolean));
  const isFlagged = (c: CaptureListItem) => !!c.needs_review || (c.score != null && c.score < 65);
  const flaggedCount = caps.filter(isFlagged).length;

  const sortedByDate = [...caps].sort(
    (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
  );

  const needs_attention: NeedsAttentionItem[] = caps
    .filter(isFlagged)
    .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
    .slice(0, 5)
    .map((c) => ({
      capture_id: c.id,
      store_name: c.store_name || c.category || null,
      score: c.score ?? null,
      reason: c.needs_review
        ? 'Flagged for review'
        : c.competitor_present
        ? 'Competitor present · low compliance'
        : 'Low compliance score',
    }));

  const recent: OverviewRecentItem[] = sortedByDate.slice(0, 8).map((c) => ({
    capture_id: c.id,
    store_name: c.store_name || null,
    category: c.category || null,
    captured_at: c.captured_at,
    score: c.score ?? null,
    recovered_count: c.recovered_count ?? null,
    needs_review: c.needs_review,
    competitor_present: c.competitor_present,
  }));

  return {
    avg_compliance: avgFromTrend ?? avgFromCaps,
    own_shelf_share: ownShare,
    captures_count: caps.length,
    stores_count: stores.size,
    flagged_count: flaggedCount,
    trend,
    needs_attention,
    recent,
  };
}
