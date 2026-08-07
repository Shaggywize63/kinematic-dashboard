'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import planogramApi from '../../../../../lib/planogramApi';
import PlanogramShelfOverlay, { categoryColor } from '../../../../../components/PlanogramShelfOverlay';
import type {
  Capture,
  Compliance,
  Recognition,
  DetectedSKU,
  CategoryBreakdown,
  ZoneBreakdown,
  PricingRow,
  MethodologyEntry,
  ShelfZone,
  OfferType,
} from '../../../../../types/planogram';

const C = {
  red: '#E01E2C',
  green: '#00D97E',
  yellow: '#FFB800',
  blue: '#3E9EFF',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  s2: 'var(--s2)',
  border: 'var(--border)',
};

function useIsCompact(breakpoint = 860): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const check = () => setV(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return v;
}

export default function CaptureDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const isCompact = useIsCompact();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await planogramApi.getCapture(id);
      setCapture(r.data.capture);
      setRecognition(r.data.recognition);
      setCompliance(r.data.compliance);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load capture');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const missingIds = new Set(compliance?.missing_skus.map((m) => m.sku_id) || []);
  const detected = recognition?.detected_skus || [];
  const method = compliance?.methodology;

  // Category rows: prefer the backend rollup, else compute from detections.
  const categoryRows: CategoryBreakdown[] =
    compliance?.category_breakdown && compliance.category_breakdown.length > 0
      ? compliance.category_breakdown
      : computeCategoryBreakdown(detected);
  const categoryComputed = !(
    compliance?.category_breakdown && compliance.category_breakdown.length > 0
  );

  // Zone rows: prefer the backend rollup, else compute from detections.
  const zoneRows: ZoneBreakdown[] =
    compliance?.zone_breakdown && compliance.zone_breakdown.length > 0
      ? [...compliance.zone_breakdown].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone))
      : computeZoneBreakdown(detected);

  // Pricing: own SKUs (price vs expected) and competitors.
  const ownPricing: PricingRow[] = (compliance?.pricing || []).filter((p) => !p.is_competitor);
  const competitorPricing: PricingRow[] = (compliance?.pricing || []).filter((p) => p.is_competitor);
  const competitorRows: CompetitorRow[] =
    competitorPricing.length > 0
      ? competitorPricing.map((p) => ({
          name: p.sku_name,
          category: null,
          price: p.price,
          currency: p.currency,
        }))
      : detected
          .filter((d) => d.is_competitor)
          .map((d) => ({
            name: d.sku_name,
            category: d.category ?? null,
            price: d.price ?? null,
            currency: d.price_currency ?? null,
          }));
  const ownPricingRows: OwnPriceRow[] =
    ownPricing.length > 0
      ? ownPricing.map((p) => ({
          name: p.sku_name,
          price: p.price,
          expected: p.expected_price,
          currency: p.currency,
          delta: p.delta,
        }))
      : detected
          .filter((d) => !d.is_competitor && d.price != null)
          .map((d) => ({
            name: d.sku_name,
            price: d.price ?? null,
            expected: null,
            currency: d.price_currency ?? null,
            delta: null,
          }));

  const promotions = compliance?.promotions?.length
    ? compliance.promotions
    : (recognition?.promotions || []).map((p) => ({
        text: p.text,
        offer_type: p.offer_type,
        confidence: p.confidence,
        linked_sku_ids: p.linked_sku_ids,
      }));

  if (loading)
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
    );
  if (error)
    return (
      <div
        style={{
          background: 'rgba(224,30,44,0.08)',
          border: '1px solid rgba(224,30,44,0.2)',
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 13,
          color: C.red,
        }}
      >
        {error}
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>
          Shelf capture
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.gray,
            marginTop: 4,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span>📅 {capture && new Date(capture.captured_at).toLocaleString()}</span>
          <span>🏬 Store: {capture?.store?.name || capture?.store_id?.slice(0, 8) || '—'}</span>
          <span>👤 Auditor: {capture?.fe?.name || 'FE Executive'}</span>
          <span>📍 {capture?.capture_lat?.toFixed(5)}, {capture?.capture_lng?.toFixed(5)}</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1.4fr 1fr',
          gap: 14,
        }}
      >
        {/* Image with overlay */}
        <div>
          {capture && recognition && (
            <PlanogramShelfOverlay
              imageUrl={capture.image_url}
              detectedSkus={recognition.detected_skus}
              missingSkuIds={missingIds}
              promotions={recognition.promotions}
            />
          )}
          {recognition?.needs_review && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: 'rgba(255,184,0,0.12)',
                border: '1px solid rgba(255,184,0,0.3)',
                borderRadius: 10,
                fontSize: 12,
                color: C.yellow,
              }}
            >
              ⚠ Low confidence ({Math.round(recognition.overall_confidence * 100)}%) — flag for review.
            </div>
          )}
        </div>

        {/* Score panel */}
        {compliance && (
          <div
            style={{
              background: 'var(--s1)',
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 56,
                  fontWeight: 800,
                  color:
                    compliance.score >= 80 ? C.green : compliance.score >= 65 ? C.yellow : C.red,
                  lineHeight: 1,
                }}
              >
                {compliance.score}%
              </div>
              <InfoDot method={method?.composite} />
            </div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>compliance score</div>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ScoreBar label="Presence" value={compliance.presence_score} method={method?.presence} />
              <ScoreBar label="Facings" value={compliance.facing_score} method={method?.facing} />
              <ScoreBar label="Position" value={compliance.position_score} method={method?.position} />
              {compliance.occupancy_score != null && (
                <ScoreBar label="Occupancy" value={compliance.occupancy_score} method={method?.occupancy} />
              )}
              {compliance.shelf_share_own != null && (
                <ScoreBar
                  label="Shelf share — own"
                  value={compliance.shelf_share_own}
                  method={method?.shelf_share}
                />
              )}
              <ScoreBar
                label="Competitor share"
                value={compliance.competitor_share}
                inverted
                method={method?.shelf_share}
              />
            </div>
          </div>
        )}
      </div>

      {/* Category-wise analysis */}
      {categoryRows.length > 0 && (
        <Panel
          title="Category analysis"
          subtitle={
            categoryComputed
              ? 'Estimated from detected facings on this shelf'
              : 'Computed by the compliance engine'
          }
          info={method?.occupancy}
        >
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ ...catGrid, ...catHeadStyle }}>
                <span>Category</span>
                <span style={num}>Occupancy</span>
                <span style={num}>Own share</span>
                <span style={num}>Comp share</span>
                <span style={num}>Facings</span>
                <span style={num}>SKUs</span>
                <span style={num}>Avg own</span>
                <span style={num}>Avg comp</span>
              </div>
              {categoryRows.map((r) => (
                <div key={r.category} style={{ ...catGrid, ...catRowStyle }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: categoryColor(r.category),
                        flexShrink: 0,
                      }}
                    />
                    {r.category}
                  </span>
                  <span style={num}>{pct(r.occupancy)}</span>
                  <ShareCell style={num} value={r.own_share} tone="own" />
                  <ShareCell style={num} value={r.competitor_share} tone="comp" />
                  <span style={num}>{r.facings}</span>
                  <span style={num}>{r.sku_count}</span>
                  <span style={num}>{money(r.avg_own_price)}</span>
                  <span style={num}>{money(r.avg_competitor_price)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* Placement zones */}
      {zoneRows.length > 0 && (
        <Panel title="Placement zones" subtitle="Own vs competitor facings by shelf band" info={method?.zone}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr' : `repeat(${zoneRows.length}, 1fr)`,
              gap: 12,
              padding: 16,
            }}
          >
            {zoneRows.map((z) => {
              const total = z.own_facings + z.competitor_facings;
              return (
                <div
                  key={z.zone}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 14,
                    background: 'var(--s2)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                    {ZONE_LABEL[z.zone]}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.green }}>Own {z.own_facings}</span>
                    <span style={{ color: C.red }}>Comp {z.competitor_facings}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'var(--s1)' }}>
                    <div style={{ width: `${total ? (z.own_facings / total) * 100 : 0}%`, background: C.green }} />
                    <div style={{ width: `${total ? (z.competitor_facings / total) * 100 : 0}%`, background: C.red }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 8 }}>
                    Own share <span style={{ fontWeight: 700, color: 'var(--text)' }}>{pct(z.own_share)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Pricing tables */}
      {(ownPricingRows.length > 0 || competitorRows.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
          {ownPricingRows.length > 0 && (
            <Panel title={`Own-SKU pricing (${ownPricingRows.length})`} subtitle="Shelf price vs expected">
              <div style={{ padding: '4px 0' }}>
                <div style={{ ...priceGrid, ...priceHeadStyle }}>
                  <span>SKU</span>
                  <span style={num}>Shelf</span>
                  <span style={num}>Expected</span>
                  <span style={num}>Δ</span>
                </div>
                {ownPricingRows.map((r, i) => (
                  <div key={i} style={{ ...priceGrid, ...priceRowStyle }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={num}>{money(r.price, r.currency)}</span>
                    <span style={num}>{money(r.expected, r.currency)}</span>
                    <DeltaCell delta={r.delta} currency={r.currency} />
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {competitorRows.length > 0 && (
            <Panel title={`Competitors (${competitorRows.length})`} subtitle="Detected competitor placements">
              <div style={{ padding: '4px 0' }}>
                <div style={{ ...compGrid, ...priceHeadStyle }}>
                  <span>SKU</span>
                  <span>Category</span>
                  <span style={num}>Price</span>
                </div>
                {competitorRows.map((r, i) => (
                  <div key={i} style={{ ...compGrid, ...priceRowStyle }}>
                    <span style={{ fontWeight: 600, color: C.red }}>{r.name}</span>
                    <span style={{ color: C.gray }}>{r.category || '—'}</span>
                    <span style={num}>{money(r.price, r.currency)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* Promotions */}
      {promotions.length > 0 && (
        <Panel title={`Promotions (${promotions.length})`} subtitle="Offers detected on the shelf">
          {promotions.map((p, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 18px',
                borderBottom: '1px solid rgba(122,139,160,0.15)',
                fontSize: 13,
              }}
            >
              <OfferBadge type={p.offer_type} />
              <span style={{ flex: 1, fontWeight: 600 }}>{p.text}</span>
              <span style={{ fontSize: 12, color: C.gray }}>{Math.round(p.confidence * 100)}%</span>
            </div>
          ))}
        </Panel>
      )}

      {/* Recommendations */}
      {compliance && compliance.recommendations.length > 0 && (
        <div
          style={{
            background: 'var(--s1)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${C.border}`,
              fontFamily: "'Syne',sans-serif",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Recommended actions
          </div>
          {compliance.recommendations.map((r, i) => (
            <div
              key={i}
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${C.border}40`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <PriorityBadge p={r.priority} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.action}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{r.rationale}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing & misplaced lists */}
      {compliance && (compliance.missing_skus.length > 0 || compliance.misplaced_skus.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
          {compliance.missing_skus.length > 0 && (
            <Panel title={`Missing SKUs (${compliance.missing_skus.length})`}>
              {compliance.missing_skus.map((m) => (
                <Row key={m.sku_id} left={m.sku_name} right={`${m.expected_facings} expected`} />
              ))}
            </Panel>
          )}
          {compliance.misplaced_skus.length > 0 && (
            <Panel title={`Misplaced (${compliance.misplaced_skus.length})`}>
              {compliance.misplaced_skus.map((m) => (
                <Row
                  key={m.sku_id}
                  left={m.sku_name}
                  right={`shelf ${m.actual_shelf} → ${m.expected_shelf}`}
                />
              ))}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compute fallbacks ──────────────────────────────────────────────────────

interface CompetitorRow {
  name: string;
  category: string | null;
  price: number | null;
  currency: string | null;
}
interface OwnPriceRow {
  name: string;
  price: number | null;
  expected: number | null;
  currency: string | null;
  delta: number | null;
}

const ZONE_LABEL: Record<ShelfZone, string> = { low: 'Low shelf', eye: 'Eye-level', top: 'Top shelf' };
function zoneOrder(z: ShelfZone): number {
  return z === 'top' ? 0 : z === 'eye' ? 1 : 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeCategoryBreakdown(detected: DetectedSKU[]): CategoryBreakdown[] {
  if (detected.length === 0) return [];
  const totalFacings = detected.reduce((s, d) => s + (d.facings || 0), 0) || 1;
  const groups = new Map<string, DetectedSKU[]>();
  for (const d of detected) {
    const key = (d.category && d.category.trim()) || 'Uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return Array.from(groups.entries())
    .map(([category, items]) => {
      const facings = items.reduce((s, d) => s + (d.facings || 0), 0);
      const ownFacings = items
        .filter((d) => !d.is_competitor)
        .reduce((s, d) => s + (d.facings || 0), 0);
      const compFacings = facings - ownFacings;
      const ownPrices = items
        .filter((d) => !d.is_competitor && d.price != null)
        .map((d) => d.price as number);
      const compPrices = items
        .filter((d) => d.is_competitor && d.price != null)
        .map((d) => d.price as number);
      return {
        category,
        occupancy: round1((facings / totalFacings) * 100),
        own_share: facings ? round1((ownFacings / facings) * 100) : 0,
        competitor_share: facings ? round1((compFacings / facings) * 100) : 0,
        facings,
        sku_count: items.length,
        avg_own_price: avg(ownPrices),
        avg_competitor_price: avg(compPrices),
      };
    })
    .sort((a, b) => b.facings - a.facings);
}

function computeZoneBreakdown(detected: DetectedSKU[]): ZoneBreakdown[] {
  const zones: ShelfZone[] = ['top', 'eye', 'low'];
  const rows: ZoneBreakdown[] = [];
  for (const z of zones) {
    const items = detected.filter((d) => d.zone === z);
    if (items.length === 0) continue;
    const own = items.filter((d) => !d.is_competitor).reduce((s, d) => s + (d.facings || 0), 0);
    const comp = items.filter((d) => d.is_competitor).reduce((s, d) => s + (d.facings || 0), 0);
    const total = own + comp;
    rows.push({
      zone: z,
      own_facings: own,
      competitor_facings: comp,
      own_share: total ? round1((own / total) * 100) : 0,
      sku_ids: items.map((d) => d.sku_id).filter((x): x is string => !!x),
    });
  }
  return rows;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${round1(n)}%`;
}
function money(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return '—';
  return `${currency || '₹'}${round1(n)}`;
}

// ── Helper components ────────────────────────────────────────────────────────

function InfoDot({ method, align = 'left' }: { method?: MethodologyEntry; align?: 'left' | 'right' }) {
  if (!method) return null;
  return (
    <span
      className="kini-info"
      style={{ position: 'relative', cursor: 'help', color: C.gray, display: 'inline-flex', opacity: 0.7 }}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span
        className="kini-info-pop"
        style={{
          display: 'none',
          position: 'absolute',
          top: '165%',
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          zIndex: 60,
          width: 250,
          background: 'var(--s3)',
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 11,
          lineHeight: 1.5,
          color: C.gray,
          fontWeight: 400,
          textAlign: 'left',
          whiteSpace: 'normal',
          boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
        }}
      >
        <span
          style={{
            display: 'block',
            fontWeight: 800,
            color: 'var(--text)',
            fontSize: 9.5,
            letterSpacing: '0.5px',
            marginBottom: 5,
          }}
        >
          HOW THIS IS CALCULATED
        </span>
        <span style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>{method.formula}</span>
        {method.inputs?.length > 0 && (
          <span style={{ display: 'block' }}>Inputs: {method.inputs.join(', ')}</span>
        )}
        {method.notes && (
          <span style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>{method.notes}</span>
        )}
      </span>
    </span>
  );
}

function ScoreBar({
  label,
  value,
  inverted = false,
  method,
}: {
  label: string;
  value: number;
  inverted?: boolean;
  method?: MethodologyEntry;
}) {
  const good = inverted ? value <= 25 : value >= 80;
  const ok = inverted ? value <= 40 : value >= 65;
  const color = good ? C.green : ok ? C.yellow : C.red;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: C.gray,
          marginBottom: 5,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {label}
          <InfoDot method={method} />
        </span>
        <span style={{ fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

function ShareCell({
  value,
  tone,
  style,
}: {
  value: number;
  tone: 'own' | 'comp';
  style?: React.CSSProperties;
}) {
  return (
    <span style={{ ...style, color: tone === 'own' ? C.green : value > 0 ? C.red : C.gray, fontWeight: 600 }}>
      {pct(value)}
    </span>
  );
}

function DeltaCell({ delta, currency }: { delta: number | null; currency: string | null }) {
  if (delta == null) return <span style={num}>—</span>;
  const color = delta > 0 ? C.red : delta < 0 ? C.green : C.gray;
  const sign = delta > 0 ? '+' : '';
  return (
    <span style={{ ...num, color, fontWeight: 700 }}>
      {sign}
      {currency || '₹'}
      {round1(delta)}
    </span>
  );
}

function OfferBadge({ type }: { type: OfferType }) {
  const map: Record<OfferType, { label: string; color: string }> = {
    price_off: { label: 'PRICE OFF', color: '#E01E2C' },
    bundle: { label: 'BUNDLE', color: '#3E9EFF' },
    bogo: { label: 'BOGO', color: '#00D97E' },
    combo: { label: 'COMBO', color: '#9B7BFF' },
    other: { label: 'OFFER', color: '#FFB800' },
  };
  const t = map[type] || map.other;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.5px',
        padding: '4px 9px',
        borderRadius: 20,
        background: `${t.color}18`,
        color: t.color,
        border: `1px solid ${t.color}30`,
        whiteSpace: 'nowrap',
      }}
    >
      {t.label}
    </span>
  );
}

function PriorityBadge({ p }: { p: 'critical' | 'high' | 'medium' | 'low' }) {
  const tone: Record<string, { bg: string; color: string }> = {
    critical: { bg: 'rgba(224,30,44,0.18)', color: '#E01E2C' },
    high: { bg: 'rgba(255,184,0,0.16)', color: '#FFB800' },
    medium: { bg: 'rgba(62,158,255,0.14)', color: '#3E9EFF' },
    low: { bg: 'rgba(122,139,160,0.10)', color: '#7A8BA0' },
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '5px 10px',
        borderRadius: 20,
        ...tone[p],
        whiteSpace: 'nowrap',
      }}
    >
      {p.toUpperCase()}
    </span>
  );
}

function Panel({
  title,
  subtitle,
  info,
  children,
}: {
  title: string;
  subtitle?: string;
  info?: MethodologyEntry;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>{title}</span>
          <InfoDot method={info} />
        </div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--textSec)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        borderBottom: '1px solid rgba(122,139,160,0.15)',
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600 }}>{left}</span>
      <span style={{ color: 'var(--textSec)' }}>{right}</span>
    </div>
  );
}

// ── Grid style tokens ────────────────────────────────────────────────────────

const num: React.CSSProperties = { textAlign: 'right' };
const catGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.8fr 0.7fr 0.9fr 0.9fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const catHeadStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--textSec)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: '1px solid var(--border)',
};
const catRowStyle: React.CSSProperties = {
  fontSize: 13,
  borderBottom: '1px solid rgba(122,139,160,0.15)',
};
const priceGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 1fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const compGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr 1fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const priceHeadStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--textSec)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: '1px solid var(--border)',
};
const priceRowStyle: React.CSSProperties = {
  fontSize: 13,
  borderBottom: '1px solid rgba(122,139,160,0.15)',
};
