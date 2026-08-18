'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import planogramApi from '../../../../../lib/planogramApi';
import PlanogramShelfOverlay, { categoryColor, type MarkableSku } from '../../../../../components/PlanogramShelfOverlay';
import { PC, scoreTone, toneColor, fmtDateTime, ScorePill } from '../../_components/planogramUi';
import type {
  Capture,
  Compliance,
  Recognition,
  DetectedSKU,
  CategoryBreakdown,
  ZoneBreakdown,
  PricingRow,
  MethodologyEntry,
  MethodologyKey,
  ShelfZone,
  OfferType,
  DetectionFeedbackBody,
  StockSummary,
  StockStatus,
  PosmCompliance,
  PosmType,
  PosmCondition,
} from '../../../../../types/planogram';

// Colour tokens for this page. Semantic good / warn / bad are kept separate from
// the KINI brand red: brand identifies competitors, red flags a bad metric.
const C = {
  brand: PC.brand, // KINI red — competitor identity / brand accents
  red: PC.bad, // semantic BAD
  green: PC.good,
  yellow: PC.warn,
  blue: PC.info,
  gray: 'var(--text-dim)',
  grayd: 'var(--text-dim)',
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

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey =
  | 'overview'
  | 'skus'
  | 'stock'
  | 'categories'
  | 'placement'
  | 'competitors'
  | 'pricing'
  | 'promotions'
  | 'posm'
  | 'methodology';

// ── Feedback loop ────────────────────────────────────────────────────────────
type FeedbackReason =
  | 'wrong_product'
  | 'not_a_product'
  | 'wrong_facings'
  | 'wrong_price'
  | 'other';

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: 'wrong_product', label: 'Wrong product' },
  { value: 'not_a_product', label: 'Not a product' },
  { value: 'wrong_facings', label: 'Wrong facings' },
  { value: 'wrong_price', label: 'Wrong price' },
  { value: 'other', label: 'Other' },
];

/** Per-detection state for the "Confirm & save as reference" action. */
interface ConfirmState {
  status: 'pending' | 'done' | 'error';
  message?: string;
  refUrl?: string;
}
/** Per-detection state for the "Fix" feedback submission. */
interface FeedbackState {
  status: 'pending' | 'done' | 'error';
  message?: string;
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
  const [tab, setTab] = useState<TabKey>('overview');

  // Planogram SKU catalog (own + competitors) for the "Mark a product" teaching
  // tool on the shelf image. Loaded once we know the capture's planogram.
  const [markSkus, setMarkSkus] = useState<MarkableSku[]>([]);

  // "Re-analyze": re-run the AI on the stored image to bring an older capture up
  // to the current analysis. A ref-backed guard blocks double-clicks even before
  // React re-renders the disabled button.
  const [reprocessing, setReprocessing] = useState(false);
  const reprocessInFlight = useRef(false);

  // "Confirm & save as reference": per-detection status keyed by the detection's
  // index in recognition.detected_skus (stable within a load). A ref-backed set
  // of in-flight keys guards against double-submits even before a re-render.
  const [confirmState, setConfirmState] = useState<Record<string, ConfirmState>>({});
  const confirmInFlight = useRef<Set<string>>(new Set());
  // "Fix" feedback: same keying + double-submit guard.
  const [feedbackState, setFeedbackState] = useState<Record<string, FeedbackState>>({});
  const feedbackInFlight = useRef<Set<string>>(new Set());

  const handleConfirmDetection = useCallback(
    async (key: string, skuId: string, bbox: number[]) => {
      if (!id) return;
      if (confirmInFlight.current.has(key)) return; // double-submit guard
      setConfirmState((s) => {
        if (s[key]?.status === 'done') return s; // already saved — don't re-fire
        return { ...s, [key]: { status: 'pending' } };
      });
      if (confirmState[key]?.status === 'done') return;
      confirmInFlight.current.add(key);
      try {
        const res = await planogramApi.confirmDetection(id, { sku_id: skuId, bbox });
        const refUrl =
          (res as { data?: { ref_image_url?: string } })?.data?.ref_image_url ??
          (res as unknown as { ref_image_url?: string })?.ref_image_url;
        setConfirmState((s) => ({ ...s, [key]: { status: 'done', refUrl } }));
      } catch (e) {
        setConfirmState((s) => ({
          ...s,
          [key]: { status: 'error', message: (e as Error)?.message || 'Failed to save reference' },
        }));
      } finally {
        confirmInFlight.current.delete(key);
      }
    },
    [id, confirmState],
  );

  const handleSubmitFeedback = useCallback(
    async (
      key: string,
      sku: DetectedSKU,
      partial: { reason: FeedbackReason; correct_sku_id?: string; note?: string },
    ) => {
      if (!id) return;
      if (feedbackInFlight.current.has(key)) return; // double-submit guard
      if (feedbackState[key]?.status === 'done') return;
      feedbackInFlight.current.add(key);
      setFeedbackState((s) => ({ ...s, [key]: { status: 'pending' } }));
      try {
        const body: DetectionFeedbackBody = {
          reason: partial.reason,
          ...(sku.sku_id ? { sku_id: sku.sku_id } : {}),
          ...(Array.isArray(sku.bbox) && sku.bbox.length === 4 ? { bbox: sku.bbox } : {}),
          ...(partial.correct_sku_id ? { correct_sku_id: partial.correct_sku_id } : {}),
          ...(partial.note ? { note: partial.note } : {}),
        };
        await planogramApi.submitDetectionFeedback(id, body);
        setFeedbackState((s) => ({ ...s, [key]: { status: 'done' } }));
      } catch (e) {
        setFeedbackState((s) => ({
          ...s,
          [key]: { status: 'error', message: (e as Error)?.message || 'Failed to save feedback' },
        }));
      } finally {
        feedbackInFlight.current.delete(key);
      }
    },
    [id, feedbackState],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await planogramApi.getCapture(id);
      setCapture(r.data.capture);
      setRecognition(r.data.recognition);
      setCompliance(r.data.compliance);
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load capture');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Load the planogram's SKU catalog (own products + tracked competitors) so the
  // "Mark a product" tool can offer a label picker. Best-effort: if it fails the
  // tool just stays hidden — the rest of the page is unaffected.
  const planogramId = capture?.planogram_id;
  useEffect(() => {
    if (!planogramId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await planogramApi.get(planogramId);
        const p = r.data;
        const own: MarkableSku[] = (p.expected_skus || []).map((s) => ({
          sku_id: s.sku_id,
          sku_name: s.sku_name,
          brand: s.brand ?? null,
          is_competitor: false,
        }));
        const competitors: MarkableSku[] = (p.layout?.competitors || []).map((c) => ({
          sku_id: c.sku_id,
          sku_name: c.sku_name,
          brand: c.brand ?? null,
          is_competitor: true,
        }));
        if (!cancelled) setMarkSkus([...own, ...competitors]);
      } catch {
        if (!cancelled) setMarkSkus([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planogramId]);

  // Save a hand-drawn box as a labeled reference pack-shot. The backend crops
  // that region from the shelf photo and adds it to the SKU's reference set, so
  // KINI AI recognises the product better on future captures. Throws on failure
  // so the overlay keeps the box for a retry.
  const handleMarkProduct = useCallback(
    async (skuId: string, bbox: [number, number, number, number]) => {
      if (!id) return;
      try {
        await planogramApi.confirmDetection(id, { sku_id: skuId, bbox });
        toast.success('Saved — KINI AI will use this to recognise the product.');
      } catch (e) {
        toast.error((e as Error)?.message || 'Could not save the marked product');
        throw e;
      }
    },
    [id],
  );

  // Re-run recognition + scoring on the stored image and swap in the fresh rows.
  // Resets the per-detection confirm/feedback state, whose keys (detection index)
  // no longer match the new detections.
  const handleReprocess = useCallback(async () => {
    if (!id) return;
    if (reprocessInFlight.current) return; // double-submit guard
    reprocessInFlight.current = true;
    setReprocessing(true);
    try {
      const r = await planogramApi.reprocessCapture(id);
      if (r?.data?.capture) {
        setCapture(r.data.capture);
        setRecognition(r.data.recognition);
        setCompliance(r.data.compliance);
      } else {
        // Unexpected shape — fall back to a fresh fetch so the page still updates.
        await load();
      }
      setConfirmState({});
      confirmInFlight.current.clear();
      setFeedbackState({});
      feedbackInFlight.current.clear();
      setError('');
      toast.success('Analysis updated — results reflect the latest KINI AI pass.');
    } catch (e) {
      toast.error((e as Error)?.message || 'Re-analysis failed. Please try again.');
    } finally {
      reprocessInFlight.current = false;
      setReprocessing(false);
    }
  }, [id, load]);

  // ── Derived data (all null-safe for older captures) ───────────────────────
  const detected = useMemo(() => recognition?.detected_skus || [], [recognition]);
  const method = compliance?.methodology;

  // Retail-execution rollups (stock + POSM). Scalar mirrors are preferred; fall
  // back to the nested summaries so older/partial payloads still render.
  const stockSummary = compliance?.stock_summary ?? null;
  const availabilityRate =
    compliance?.availability_rate ?? stockSummary?.availability_rate ?? null;
  const availabilityOos = compliance?.oos_count ?? stockSummary?.oos_count ?? 0;
  const posmComp = compliance?.posm ?? null;
  const posmScore = compliance?.posm_score ?? posmComp?.score ?? null;

  // SKUs the first vision pass missed but a second targeted recall pass found.
  const recoveredSkus = useMemo(() => detected.filter((d) => d.recovered), [detected]);

  // Every detection, sorted so recovered + low-confidence float to the top — the
  // ones worth confirming/correcting first. Original index kept as the state key
  // so per-row pending/done status stays stable regardless of sort order.
  const detectionRows = useMemo(
    () =>
      detected
        .map((d, i) => ({ sku: d, key: String(i) }))
        .sort((a, b) => confirmPriority(a.sku) - confirmPriority(b.sku)),
    [detected],
  );

  // Name → sku_id lookup so a typed "correct product" can resolve to a known SKU
  // (→ correct_sku_id) rather than falling back to a free-text note.
  const knownSkus = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of detected) if (d.sku_id) m.set(d.sku_name.trim().toLowerCase(), d.sku_id);
    for (const mk of compliance?.missing_skus ?? []) m.set(mk.sku_name.trim().toLowerCase(), mk.sku_id);
    return m;
  }, [detected, compliance]);

  // High-priority quality-gate recommendation (image too poor to trust).
  const reshoot = compliance?.recommendations?.find((r) => /re-?shoot/i.test(r.action));

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
  const competitorRows: CompetitorRow[] = detected
    .filter((d) => d.is_competitor)
    .map((d) => ({
      name: d.sku_name,
      brand: d.brand ?? null,
      category: d.category ?? null,
      facings: d.facings,
      zone: d.zone ?? null,
      price: d.price ?? null,
      currency: d.price_currency ?? null,
      recovered: d.recovered,
    }));
  const ownPricingRows: OwnPriceRow[] =
    ownPricing.length > 0
      ? ownPricing.map((p) => ({
          name: p.sku_name,
          price: p.price,
          expected: p.expected_price,
          currency: p.currency,
          delta: p.delta,
          source: p.source,
        }))
      : detected
          .filter((d) => !d.is_competitor && d.price != null)
          .map((d) => ({
            name: d.sku_name,
            price: d.price ?? null,
            expected: null,
            currency: d.price_currency ?? null,
            delta: null,
            source: d.price_source ?? null,
          }));

  const promotions = compliance?.promotions?.length
    ? compliance.promotions
    : (recognition?.promotions || []).map((p) => ({
        text: p.text,
        offer_type: p.offer_type,
        confidence: p.confidence,
        linked_sku_ids: p.linked_sku_ids,
      }));

  // Top 3 prioritized recommendations for the "At a glance" panel.
  const rankedRecs = [...(compliance?.recommendations || [])].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  );

  // Header meta: expected-SKU + shelf counts.
  const matchedOwn = new Set(
    detected.filter((d) => !d.is_competitor && d.sku_id).map((d) => d.sku_id as string),
  );
  const missingList = compliance?.missing_skus || [];
  const expectedSkuCount = new Set([...matchedOwn, ...missingList.map((m) => m.sku_id)]).size;
  const shelfCount = recognition?.shelf_map?.shelf_count;

  const competitorFacings = detected
    .filter((d) => d.is_competitor)
    .reduce((s, d) => s + (d.facings || 0), 0);

  if (loading)
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
    );
  if (error)
    return (
      <div
        style={{
          background: PC.badWash,
          border: `1px solid ${C.red}55`,
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 13,
          color: C.red,
        }}
      >
        {error}
      </div>
    );

  const tone = scoreTone(compliance?.score);
  const scoreColor = toneColor(tone);
  const scoreLabel = tone === 'good' ? 'On track' : tone === 'warn' ? 'Needs attention' : 'Action needed';

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'skus', label: 'SKUs', count: detected.length || undefined },
    { key: 'stock', label: 'Stock' },
    { key: 'categories', label: 'Categories', count: categoryRows.length || undefined },
    { key: 'placement', label: 'Placement' },
    { key: 'competitors', label: 'Competitors', count: competitorRows.length || undefined },
    { key: 'pricing', label: 'Pricing' },
    { key: 'promotions', label: 'Promotions', count: promotions.length || undefined },
    { key: 'posm', label: 'POSM', count: posmComp?.found.length || undefined },
    { key: 'methodology', label: 'Methodology' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Panel fade — respects prefers-reduced-motion. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.pg-fade{animation:pgFade .18s ease}@keyframes pgFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.pg-spin{animation:pgSpin .7s linear infinite;transform-origin:center}@keyframes pgSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.pg-fade{animation:none}.pg-spin{animation:none}}`,
        }}
      />

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.grayd, marginBottom: 6 }}>
            <Link
              href="/dashboard/planograms/captures"
              style={{ color: C.gray, textDecoration: 'none', fontWeight: 600 }}
            >
              Planograms
            </Link>
            <span style={{ margin: '0 7px', opacity: 0.6 }}>›</span>
            <span style={{ color: C.gray, fontWeight: 600 }}>
              {capture?.store?.name || capture?.device_meta?.outlet_label || capture?.store_id?.slice(0, 8) || 'Store'}
            </span>
            <span style={{ margin: '0 7px', opacity: 0.6 }}>›</span>
            Capture
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-manrope)',
              fontSize: 23,
              fontWeight: 800,
              margin: 0,
              color: 'var(--text)',
            }}
          >
            {capture?.planogram?.name ? `Shelf audit — ${capture.planogram.name}` : 'Shelf capture'}
          </h1>
          <div
            style={{
              fontSize: 12.5,
              color: C.gray,
              marginTop: 8,
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <span>📅 {fmtDateTime(capture?.captured_at)}</span>
            <span>👤 {capture?.fe?.name || 'FE Executive'}</span>
            {capture?.capture_lat != null && capture?.capture_lng != null && (
              <span>
                📍 {capture.capture_lat.toFixed(5)}, {capture.capture_lng.toFixed(5)}
              </span>
            )}
            {(expectedSkuCount > 0 || shelfCount) && (
              <span>
                🧴 {expectedSkuCount > 0 ? `${expectedSkuCount} expected SKU${expectedSkuCount === 1 ? '' : 's'}` : ''}
                {expectedSkuCount > 0 && shelfCount ? ' · ' : ''}
                {shelfCount ? `${shelfCount} shelf${shelfCount === 1 ? '' : 'ves'}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Right-side actions: Re-analyze + compliance score ring */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <ReanalyzeButton busy={reprocessing} onRun={handleReprocess} />
          {compliance && (
          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              background: 'var(--s1)',
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '12px 18px',
              boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
            }}
          >
            <ScoreRing score={compliance.score} color={scoreColor} />
            <div>
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: C.grayd,
                  fontWeight: 700,
                }}
              >
                Compliance
              </div>
              <div style={{ fontWeight: 700, color: scoreColor, marginTop: 2 }}>{scoreLabel}</div>
              {recognition?.needs_review && (
                <div
                  style={{
                    display: 'inline-flex',
                    gap: 5,
                    alignItems: 'center',
                    marginTop: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: C.yellow,
                    background: PC.warnWash,
                    border: `1px solid ${C.yellow}55`,
                    padding: '3px 9px',
                    borderRadius: 100,
                  }}
                >
                  ⚠ Flagged for review
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* ── 2. KPI strip ───────────────────────────────────────────────────── */}
      {compliance && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(7, minmax(0, 1fr))',
            gap: 9,
          }}
        >
          <KpiTile label="Presence" value={compliance.presence_score} pctValue metricTone sub="on-shelf vs expected" />
          <KpiTile label="Facings" value={compliance.facing_score} pctValue metricTone sub="detected vs planned" />
          <KpiTile label="Position" value={compliance.position_score} pctValue metricTone sub="on the right shelf" />
          <KpiTile
            label="Occupancy"
            value={compliance.occupancy_score ?? null}
            pctValue
            color={C.blue}
            sub="of shelf space filled"
          />
          <KpiTile
            label="Shelf share"
            value={compliance.shelf_share_own ?? null}
            pctValue
            metricTone
            sub="own vs competitor"
          />
          <KpiTile
            label="Availability"
            value={availabilityRate}
            pctValue
            metricTone
            sub={availabilityOos > 0 ? `${availabilityOos} out of stock` : 'all SKUs in stock'}
          />
          <KpiTile
            label="POSM"
            value={posmScore}
            pctValue
            metricTone
            emptyLabel="N/A"
            sub={
              posmComp && posmComp.expected_count > 0
                ? `${posmComp.found_count}/${posmComp.expected_count} found`
                : 'none expected'
            }
          />
        </div>
      )}

      {/* ── 3. Hero ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '2fr 1fr',
          gap: 16,
        }}
      >
        {/* LEFT: shelf recognition overlay + its Category/Zone/Status toggle + legend */}
        <div style={cardStyle}>
          <div style={{ padding: 14 }}>
            <div
              style={{
                fontFamily: 'var(--font-manrope)',
                fontSize: 14,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              Shelf recognition
            </div>
            {capture && recognition ? (
              <PlanogramShelfOverlay
                imageUrl={capture.image_url}
                detectedSkus={recognition.detected_skus}
                promotions={recognition.promotions}
                annotation={markSkus.length > 0 ? { skus: markSkus, onSave: handleMarkProduct } : undefined}
              />
            ) : (
              <div style={{ color: C.grayd, fontSize: 13, padding: 24, textAlign: 'center' }}>
                No shelf image available.
              </div>
            )}
            {recoveredSkus.length > 0 && <RecoveredSummary skus={recoveredSkus} />}
          </div>
        </div>

        {/* RIGHT: At a glance + prioritized recommendations */}
        <div style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: C.grayd,
                fontWeight: 800,
              }}
            >
              At a glance
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 11 }}>
              <Finding
                count={competitorRows.length}
                tone={competitorRows.length > 0 ? 'brand' : 'good'}
                title="Competitor on shelf"
                detail={
                  competitorRows.length > 0
                    ? `${competitorFacings} facing${competitorFacings === 1 ? '' : 's'} · ${round1(
                        compliance?.competitor_share ?? 0,
                      )}% of shelf — ${competitorRows.map((c) => c.name).slice(0, 3).join(', ')}`
                    : 'No competitor products detected'
                }
              />
              <Finding
                count={recoveredSkus.length}
                tone="info"
                title="Recovered on 2nd pass"
                detail={
                  recoveredSkus.length > 0
                    ? recoveredSkus.map((s) => s.sku_name).slice(0, 4).join(', ')
                    : 'No recall-pass recoveries on this capture'
                }
              />
              <Finding
                count={promotions.length}
                tone={promotions.length > 0 ? 'good' : 'neutral'}
                title="Promotions live"
                detail={
                  promotions.length > 0
                    ? promotions.map((p) => p.text).slice(0, 3).join(' · ')
                    : 'No shelf promotions detected'
                }
              />
            </div>
          </div>

          {rankedRecs.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: C.grayd,
                  fontWeight: 800,
                  marginBottom: 9,
                }}
              >
                Do next
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {rankedRecs.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5 }}>
                    <PriorityBadge p={r.priority} />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>{r.action}</span>
                      {r.rationale ? <span style={{ color: C.gray }}> — {r.rationale}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Tab bar ─────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Capture detail sections"
        style={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          border: `1px solid ${C.border}`,
          background: 'var(--s2)',
          borderRadius: 12,
          padding: 4,
        }}
      >
        {tabs.map((t) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`panel-${t.key}`}
              onClick={() => setTab(t.key)}
              style={{
                appearance: 'none',
                border: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 13px',
                borderRadius: 8,
                display: 'inline-flex',
                gap: 7,
                alignItems: 'center',
                background: selected ? 'var(--s1)' : 'transparent',
                color: selected ? 'var(--text)' : C.gray,
                boxShadow: selected ? '0 1px 2px rgba(16,20,30,0.06)' : 'none',
              }}
            >
              {t.label}
              {t.count != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 7px',
                    borderRadius: 100,
                    background: selected ? PC.brandWash : 'var(--s3)',
                    color: selected ? C.brand : C.gray,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 5. Tab panels ──────────────────────────────────────────────────── */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pg-fade" key={tab}>
        {tab === 'overview' && (
          <OverviewTab
            categoryRows={categoryRows}
            recognition={recognition}
            capture={capture}
            reshoot={reshoot}
            recommendations={compliance?.recommendations || []}
            isCompact={isCompact}
          />
        )}

        {tab === 'skus' && (
          <SkusTab
            rows={detectionRows}
            confirmState={confirmState}
            feedbackState={feedbackState}
            onConfirm={handleConfirmDetection}
            onSubmitFeedback={handleSubmitFeedback}
            knownSkus={knownSkus}
            misplaced={compliance?.misplaced_skus || []}
            isCompact={isCompact}
          />
        )}

        {tab === 'stock' && (
          <StockTab
            stock={stockSummary}
            availabilityRate={availabilityRate}
            detected={detected}
            isCompact={isCompact}
          />
        )}

        {tab === 'categories' && (
          <CategoriesTab rows={categoryRows} computed={categoryComputed} info={method?.category} />
        )}

        {tab === 'placement' && <PlacementTab rows={zoneRows} info={method?.zone} isCompact={isCompact} />}

        {tab === 'competitors' && (
          <CompetitorsTab
            rows={competitorRows}
            competitorShare={compliance?.competitor_share ?? null}
          />
        )}

        {tab === 'pricing' && <PricingTab rows={ownPricingRows} />}

        {tab === 'promotions' && <PromotionsTab promotions={promotions} />}

        {tab === 'posm' && <PosmTab posm={posmComp} isCompact={isCompact} />}

        {tab === 'methodology' && <MethodologyTab compliance={compliance} method={method} />}
      </div>
    </div>
  );
}

// ── Re-analyze control ───────────────────────────────────────────────────────

/** "Re-analyze" action: brings an older capture up to the current AI analysis.
 *  Owns its own confirm popover; the parent owns the async run + busy state and
 *  guards double-clicks. Uses an AI credit, so the click is gated behind a
 *  confirm step. */
function ReanalyzeButton({ busy, onRun }: { busy: boolean; onRun: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // While a run is in flight, keep the popover closed.
  useEffect(() => {
    if (busy) setConfirmOpen(false);
  }, [busy]);

  const btnBase: React.CSSProperties = {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 13px',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'DM Sans',sans-serif",
    whiteSpace: 'nowrap',
    cursor: busy ? 'default' : 'pointer',
    background: 'var(--s1)',
    border: `1px solid ${C.border}`,
    color: busy ? C.gray : 'var(--text)',
    opacity: busy ? 0.7 : 1,
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={busy ? undefined : () => setConfirmOpen((o) => !o)}
        disabled={busy}
        aria-busy={busy}
        aria-expanded={confirmOpen}
        title="Re-run KINI AI recognition + scoring on this capture's photo"
        style={btnBase}
      >
        {busy ? (
          <>
            <Spinner />
            Analyzing…
          </>
        ) : (
          <>
            <span aria-hidden style={{ fontSize: 14, lineHeight: 0 }}>
              ↻
            </span>
            Re-analyze
          </>
        )}
      </button>

      {confirmOpen && !busy && (
        <>
          <div
            onClick={() => setConfirmOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Confirm re-analysis"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 41,
              width: 300,
              maxWidth: '92vw',
              background: 'var(--s1)',
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(16,20,30,0.18)',
              padding: 14,
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Re-analyze this capture?</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6, lineHeight: 1.5 }}>
              Re-run the KINI AI analysis on this capture&apos;s photo. Results may change, and this uses a KINI AI credit.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  appearance: 'none',
                  border: `1px solid ${C.border}`,
                  background: 'var(--s1)',
                  color: C.gray,
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onRun();
                }}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: C.brand,
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Re-analyze
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Small rotating spinner (respects prefers-reduced-motion via `.pg-spin`). */
function Spinner() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden className="pg-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

// ── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  categoryRows,
  recognition,
  capture,
  reshoot,
  recommendations,
  isCompact,
}: {
  categoryRows: CategoryBreakdown[];
  recognition: Recognition | null;
  capture: Capture | null;
  reshoot?: { action: string; rationale: string };
  recommendations: Compliance['recommendations'];
  isCompact: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
        {/* Category shelf-share mini-bars */}
        <Panel title="Category shelf-share" subtitle="Own vs competitor facings, per category">
          <div style={{ padding: 16 }}>
            {categoryRows.length === 0 ? (
              <EmptyLine>No category data for this capture.</EmptyLine>
            ) : (
              categoryRows.map((r) => (
                <div key={r.category} style={{ marginBottom: 13 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          background: categoryColor(r.category),
                          display: 'inline-block',
                        }}
                      />
                      {r.category}
                    </span>
                    <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                      {pct(r.own_share)} own
                    </span>
                  </div>
                  <ShareSplit own={r.own_share} comp={r.competitor_share} />
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Capture quality */}
        <Panel title="Capture quality" subtitle="Why this audit may need a closer look">
          <div style={{ padding: 16 }}>
            <CaptureQuality
              needsReview={!!recognition?.needs_review}
              confidence={recognition?.overall_confidence}
              blur={capture?.blur_score}
              glare={capture?.glare_score}
              angle={capture?.angle_score}
              reshoot={reshoot}
            />
          </div>
        </Panel>
      </div>

      {/* Full recommendation list (top 3 also surface in the hero) */}
      {recommendations.length > 0 && (
        <Panel title="Recommended actions" subtitle="Prioritized fixes for this shelf">
          {[...recommendations]
            .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
            .map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 18px',
                  borderBottom: `1px solid rgba(122,139,160,0.15)`,
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
        </Panel>
      )}
    </div>
  );
}

// ── Tab: SKUs (accept / feedback learning loop) ──────────────────────────────

function SkusTab({
  rows,
  confirmState,
  feedbackState,
  onConfirm,
  onSubmitFeedback,
  knownSkus,
  misplaced,
  isCompact,
}: {
  rows: { sku: DetectedSKU; key: string }[];
  confirmState: Record<string, ConfirmState>;
  feedbackState: Record<string, FeedbackState>;
  onConfirm: (key: string, skuId: string, bbox: number[]) => void;
  onSubmitFeedback: (
    key: string,
    sku: DetectedSKU,
    partial: { reason: FeedbackReason; correct_sku_id?: string; note?: string },
  ) => void;
  knownSkus: Map<string, string>;
  misplaced: Compliance['misplaced_skus'];
  isCompact: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel
        title="Detected SKUs — is KINI AI right?"
        subtitle="Confirm a correct detection to save its crop as a new reference pack-shot, or give feedback to teach KINI AI. Recovered & low-confidence detections are sorted first."
      >
        {rows.length === 0 ? (
          <EmptyLine>No SKUs were detected on this shelf.</EmptyLine>
        ) : (
          rows.map(({ sku, key }) => (
            <DetectionRow
              key={key}
              sku={sku}
              confirmState={confirmState[key]}
              feedbackState={feedbackState[key]}
              onConfirm={() => onConfirm(key, sku.sku_id as string, sku.bbox)}
              onSubmitFeedback={(partial) => onSubmitFeedback(key, sku, partial)}
              knownSkus={knownSkus}
              isCompact={isCompact}
            />
          ))
        )}
      </Panel>

      {misplaced.length > 0 && (
        <Panel title={`Misplaced (${misplaced.length})`} subtitle="Detected on the wrong shelf band">
          {misplaced.map((m) => (
            <Row key={m.sku_id} left={m.sku_name} right={`shelf ${m.actual_shelf} → ${m.expected_shelf}`} />
          ))}
        </Panel>
      )}
    </div>
  );
}

/** One detected-SKU row with the two-way teaching actions:
 *  ✓ Correct → confirmDetection (save the crop as a reference pack-shot)
 *  ✎ Fix     → reveal an inline feedback form → submitDetectionFeedback
 *  Both guard double-submits and disable after success. */
function DetectionRow({
  sku,
  confirmState,
  feedbackState,
  onConfirm,
  onSubmitFeedback,
  knownSkus,
  isCompact,
}: {
  sku: DetectedSKU;
  confirmState?: ConfirmState;
  feedbackState?: FeedbackState;
  onConfirm: () => void;
  onSubmitFeedback: (partial: { reason: FeedbackReason; correct_sku_id?: string; note?: string }) => void;
  knownSkus: Map<string, string>;
  isCompact: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [correct, setCorrect] = useState('');
  const [note, setNote] = useState('');

  const eligible = canConfirm(sku);
  const lowConf = sku.confidence < LOW_CONF_THRESHOLD;

  const cStatus = confirmState?.status ?? 'idle';
  const confirmDone = cStatus === 'done';
  const confirmPending = cStatus === 'pending';
  const confirmError = cStatus === 'error';

  const fStatus = feedbackState?.status ?? 'idle';
  const fbDone = fStatus === 'done';
  const fbPending = fStatus === 'pending';
  const fbError = fStatus === 'error';

  const nameColor = sku.is_competitor ? C.brand : 'var(--text)';

  const submit = () => {
    if (!reason || fbPending || fbDone) return;
    const t = correct.trim();
    let correct_sku_id: string | undefined;
    const noteParts: string[] = [];
    if (t) {
      const matched = knownSkus.get(t.toLowerCase());
      if (matched) correct_sku_id = matched;
      else noteParts.push(`Suggested correct product: ${t}`);
    }
    if (note.trim()) noteParts.push(note.trim());
    onSubmitFeedback({ reason, correct_sku_id, note: noteParts.join(' — ') || undefined });
  };

  const cancel = () => {
    setFormOpen(false);
    setReason(null);
    setCorrect('');
    setNote('');
  };

  return (
    <div
      style={{
        padding: '12px 18px',
        borderBottom: `1px solid rgba(122,139,160,0.15)`,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: isCompact ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          flexDirection: isCompact ? 'column' : 'row',
          gap: isCompact ? 10 : 14,
        }}
      >
        {/* Identity + signals */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontWeight: 600,
                color: nameColor,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {sku.sku_name}
              {sku.is_competitor ? ' · competitor' : ''}
            </span>
            {sku.recovered && <RecoveredTag />}
            {lowConf && <LowConfTag confidence={sku.confidence} />}
          </div>
          <div style={{ fontSize: 11.5, color: C.gray, marginTop: 3 }}>
            {[
              sku.category || null,
              `${sku.facings} facing${sku.facings === 1 ? '' : 's'}`,
              sku.zone ? ZONE_LABEL[sku.zone] : null,
              `${Math.round(sku.confidence * 100)}% confidence`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>

        {/* Actions */}
        {!formOpen && !fbDone && (
          <div
            style={{
              display: 'flex',
              gap: 7,
              flexShrink: 0,
              alignSelf: isCompact ? 'stretch' : 'auto',
              justifyContent: isCompact ? 'stretch' : 'flex-end',
            }}
          >
            {confirmDone ? (
              <span style={doneMsgStyle}>✓ Saved as reference — KINI AI will use this photo</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={eligible && !confirmPending ? onConfirm : undefined}
                  disabled={!eligible || confirmPending}
                  aria-busy={confirmPending}
                  title={
                    !eligible
                      ? 'Needs a matched SKU and a bounding box to save as a reference'
                      : 'Confirm this detection and save its crop as a reference pack-shot'
                  }
                  style={actionBtnStyle('ok', !eligible || confirmPending)}
                >
                  {confirmPending ? 'Saving…' : confirmError ? '↻ Retry' : '✓ Correct'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  style={actionBtnStyle('fix', false)}
                  title="Tell KINI AI what it got wrong"
                >
                  ✎ Fix
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirm error hint (buttons stay so the user can retry) */}
      {confirmError && !formOpen && !fbDone && (
        <div style={{ fontSize: 11.5, color: C.red, marginTop: 6, fontWeight: 600 }}>
          {confirmState?.message || 'Failed to save reference.'}
        </div>
      )}

      {/* Feedback confirmation */}
      {fbDone && (
        <div style={{ ...doneMsgStyle, marginTop: 8 }}>
          ✓ Thanks — feedback saved. KINI AI will learn from this.
        </div>
      )}

      {/* Inline feedback form */}
      {formOpen && !fbDone && (
        <div
          style={{
            background: 'var(--s2)',
            border: `1px dashed ${PC.border}`,
            borderRadius: 10,
            padding: 13,
            marginTop: 10,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 9 }}>
            What did KINI AI get wrong?
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 11 }}>
            {REASONS.map((r) => {
              const active = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReason(r.value)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 100,
                    padding: '5px 11px',
                    cursor: 'pointer',
                    background: active ? PC.brandWash : 'var(--s1)',
                    border: `1px solid ${active ? C.brand : PC.border}`,
                    color: active ? C.brand : C.gray,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              placeholder="Correct product (optional)"
              aria-label="Correct product"
              style={inputStyle}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              aria-label="Note"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={submit}
              disabled={!reason || fbPending}
              aria-busy={fbPending}
              style={actionBtnStyle('fix', !reason || fbPending)}
            >
              {fbPending ? 'Sending…' : 'Send feedback'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={fbPending}
              style={actionBtnStyle('ghost', fbPending)}
            >
              Cancel
            </button>
            {fbError && (
              <span style={{ fontSize: 11.5, color: C.red, fontWeight: 600 }}>
                {feedbackState?.message || 'Failed to save feedback.'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.gray, marginTop: 9 }}>
            Feedback trains KINI AI — repeated corrections become new references so it improves over
            time.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Categories ──────────────────────────────────────────────────────────

function CategoriesTab({
  rows,
  computed,
  info,
}: {
  rows: CategoryBreakdown[];
  computed: boolean;
  info?: MethodologyEntry;
}) {
  return (
    <Panel
      title="Category analysis"
      subtitle={computed ? 'Estimated from detected facings on this shelf' : 'Computed by the compliance engine'}
      info={info}
    >
      {rows.length === 0 ? (
        <EmptyLine>No category data for this capture.</EmptyLine>
      ) : (
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
            {rows.map((r) => (
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
      )}
    </Panel>
  );
}

// ── Tab: Placement ───────────────────────────────────────────────────────────

function PlacementTab({
  rows,
  info,
  isCompact,
}: {
  rows: ZoneBreakdown[];
  info?: MethodologyEntry;
  isCompact: boolean;
}) {
  return (
    <Panel title="Placement zones" subtitle="Own vs competitor facings by shelf band" info={info}>
      {rows.length === 0 ? (
        <EmptyLine>No placement-band data for this capture.</EmptyLine>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : `repeat(${rows.length}, 1fr)`,
            gap: 12,
            padding: 16,
          }}
        >
          {rows.map((z) => {
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
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{ZONE_LABEL[z.zone]}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.green }}>Own {z.own_facings}</span>
                  <span style={{ color: C.brand }}>Comp {z.competitor_facings}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'var(--s1)' }}>
                  <div style={{ width: `${total ? (z.own_facings / total) * 100 : 0}%`, background: C.green }} />
                  <div style={{ width: `${total ? (z.competitor_facings / total) * 100 : 0}%`, background: C.brand }} />
                </div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 8 }}>
                  Own share <span style={{ fontWeight: 700, color: 'var(--text)' }}>{pct(z.own_share)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Tab: Competitors ─────────────────────────────────────────────────────────

function CompetitorsTab({
  rows,
  competitorShare,
}: {
  rows: CompetitorRow[];
  competitorShare: number | null;
}) {
  return (
    <Panel
      title={`Competitors on shelf${rows.length ? ` (${rows.length})` : ''}`}
      subtitle="Matched to your tracked catalogue for stable identity & price trending."
      action={
        <Link
          href="/dashboard/planograms/competitors"
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: C.brand,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Add or edit the competitor SKUs and product images this planogram tracks"
        >
          Manage tracked competitors →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyLine>No competitor products detected in this capture.</EmptyLine>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ ...compGrid, ...priceHeadStyle }}>
                <span>Product</span>
                <span>Brand</span>
                <span>Category</span>
                <span style={num}>Facings</span>
                <span>Zone</span>
                <span style={num}>Price</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} style={{ ...compGrid, ...priceRowStyle }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, fontWeight: 600, color: C.brand }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    {r.recovered && <RecoveredTag />}
                  </span>
                  <span style={{ color: C.gray }}>{r.brand || '—'}</span>
                  <span style={{ color: C.gray }}>{r.category || '—'}</span>
                  <span style={num}>{r.facings}</span>
                  <span style={{ color: C.gray }}>{r.zone ? ZONE_LABEL[r.zone] : '—'}</span>
                  <span style={num}>{money(r.price, r.currency)}</span>
                </div>
              ))}
            </div>
          </div>
          {competitorShare != null && (
            <div style={{ fontSize: 12, color: C.gray, padding: '12px 18px 0' }}>
              Competitor share of this bay: <b style={{ color: 'var(--text)' }}>{pct(competitorShare)}</b>.
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Tab: Pricing ─────────────────────────────────────────────────────────────

function PricingTab({ rows }: { rows: OwnPriceRow[] }) {
  return (
    <Panel title={`Own-SKU pricing${rows.length ? ` (${rows.length})` : ''}`} subtitle="Shelf price vs your expected MRP">
      {rows.length === 0 ? (
        <EmptyLine>No own-SKU prices were read on this shelf.</EmptyLine>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ ...priceGrid, ...priceHeadStyle }}>
              <span>SKU</span>
              <span style={num}>Shelf</span>
              <span style={num}>Expected</span>
              <span style={num}>Δ</span>
              <span>Source</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ ...priceGrid, ...priceRowStyle }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span style={num}>{money(r.price, r.currency)}</span>
                <span style={num}>{money(r.expected, r.currency)}</span>
                <DeltaCell delta={r.delta} currency={r.currency} />
                <span style={{ color: C.gray }}>{r.source ? PRICE_SOURCE_LABEL[r.source] : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Tab: Promotions ──────────────────────────────────────────────────────────

function PromotionsTab({
  promotions,
}: {
  promotions: { text: string; offer_type: OfferType; confidence: number; linked_sku_ids: string[] }[];
}) {
  return (
    <Panel title={`Promotions${promotions.length ? ` (${promotions.length})` : ''}`} subtitle="Offer signage visible on the shelf">
      {promotions.length === 0 ? (
        <EmptyLine>No promotions detected on this shelf.</EmptyLine>
      ) : (
        promotions.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              borderBottom: `1px solid rgba(122,139,160,0.15)`,
              fontSize: 13,
            }}
          >
            <OfferBadge type={p.offer_type} />
            <span style={{ flex: 1, fontWeight: 600 }}>{p.text}</span>
            <span style={{ fontSize: 12, color: C.gray }}>{Math.round(p.confidence * 100)}%</span>
          </div>
        ))
      )}
    </Panel>
  );
}

// ── Tab: Stock ───────────────────────────────────────────────────────────────

/** On-shelf stock / availability: availability rate + unit rollup, out-of-stock
 *  and low-stock lists, and a per-SKU units/status table. Null-safe — older
 *  captures that predate unit estimation degrade to a friendly empty state. */
function StockTab({
  stock,
  availabilityRate,
  detected,
  isCompact,
}: {
  stock: StockSummary | null;
  availabilityRate: number | null;
  detected: DetectedSKU[];
  isCompact: boolean;
}) {
  const oos = stock?.out_of_stock_skus ?? [];
  const low = stock?.low_stock_skus ?? [];
  const hasUnits = detected.some((d) => d.units_estimate != null || d.stock_status != null);

  if (!stock && !hasUnits && availabilityRate == null) {
    return (
      <Panel title="Stock & availability" subtitle="Estimated on-shelf units and availability">
        <EmptyLine>No stock estimate is available for this capture.</EmptyLine>
      </Panel>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel title="Stock & availability" subtitle="Estimated physical units on the shelf and availability rate">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
            padding: 16,
          }}
        >
          <StockStat label="Availability" pill={availabilityRate} sub="SKUs in stock" />
          <StockStat label="Total units" value={stock?.total_units ?? null} sub="on shelf (est.)" />
          <StockStat label="Own units" value={stock?.own_units ?? null} valueColor={C.green} sub="your products" />
          <StockStat
            label="Competitor units"
            value={stock?.competitor_units ?? null}
            valueColor={C.brand}
            sub="rival products"
          />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Panel
          title={`Out of stock${oos.length ? ` (${oos.length})` : ''}`}
          subtitle="Expected SKUs with no units detected on shelf"
        >
          {oos.length === 0 ? (
            <EmptyLine>Nothing out of stock — every tracked SKU has units on shelf.</EmptyLine>
          ) : (
            oos.map((s) => <Row key={s.sku_id} left={s.sku_name} right={<StatusChip status="out" />} />)
          )}
        </Panel>
        <Panel
          title={`Low stock${low.length ? ` (${low.length})` : ''}`}
          subtitle="Running low — restock before they sell out"
        >
          {low.length === 0 ? (
            <EmptyLine>No SKUs are running low.</EmptyLine>
          ) : (
            low.map((s) => (
              <Row
                key={s.sku_id}
                left={s.sku_name}
                right={
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <span style={num}>{s.units_estimate != null ? `${s.units_estimate} left` : '—'}</span>
                    <StatusChip status="low" />
                  </span>
                }
              />
            ))
          )}
        </Panel>
      </div>

      <Panel title="Per-SKU units & status" subtitle="Estimated units and stock status for each detected product">
        {detected.length === 0 ? (
          <EmptyLine>No SKUs were detected on this shelf.</EmptyLine>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ ...stockGrid, ...priceHeadStyle }}>
                <span>SKU</span>
                <span>Brand</span>
                <span style={num}>Facings</span>
                <span style={num}>Units (est.)</span>
                <span>Status</span>
              </div>
              {detected.map((d, i) => (
                <div key={i} style={{ ...stockGrid, ...priceRowStyle }}>
                  <span
                    style={{
                      fontWeight: 600,
                      color: d.is_competitor ? C.brand : 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.sku_name}
                    {d.is_competitor ? ' · competitor' : ''}
                  </span>
                  <span style={{ color: C.gray }}>{d.brand || '—'}</span>
                  <span style={num}>{d.facings}</span>
                  <span style={num}>{d.units_estimate != null ? d.units_estimate : '—'}</span>
                  <span>
                    <StatusChip status={d.stock_status} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** A stat block for the Stock header: either a ScorePill (banded 0..100) or a
 *  plain tabular number, with a small caption. */
function StockStat({
  label,
  value,
  pill,
  valueColor,
  sub,
}: {
  label: string;
  value?: number | null;
  pill?: number | null;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 14,
        background: 'var(--s2)',
      }}
    >
      <div style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 6 }}>
        {pill !== undefined ? (
          <ScorePill score={pill} />
        ) : (
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: value != null ? valueColor ?? 'var(--text)' : C.grayd,
            }}
          >
            {value != null ? value : '—'}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.grayd, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Tab: POSM ────────────────────────────────────────────────────────────────

/** POSM compliance: expected vs found point-of-sale materials, with missing +
 *  damaged lists and a found table. Empty state when nothing is expected. */
function PosmTab({ posm, isCompact }: { posm: PosmCompliance | null; isCompact: boolean }) {
  if (!posm || posm.expected_count === 0) {
    return (
      <Panel title="POSM compliance" subtitle="Point-of-sale materials expected vs found on shelf">
        <EmptyLine>No expected POSM defined for this planogram.</EmptyLine>
      </Panel>
    );
  }
  const missing = posm.missing ?? [];
  const damaged = posm.damaged ?? [];
  const found = posm.found ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel title="POSM compliance" subtitle="How much of the expected point-of-sale material is present and intact">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
            padding: 16,
          }}
        >
          <StockStat label="POSM score" pill={posm.score} sub="present & undamaged" />
          <StockStat label="Found" value={posm.found_count} sub={`of ${posm.expected_count} expected`} />
          <StockStat label="Required" value={posm.required_count} sub="mandatory elements" />
          <StockStat
            label="Missing"
            value={missing.length}
            valueColor={missing.length > 0 ? C.red : C.green}
            sub="not on shelf"
          />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Panel
          title={`Missing${missing.length ? ` (${missing.length})` : ''}`}
          subtitle="Expected POSM not detected on the shelf"
        >
          {missing.length === 0 ? (
            <EmptyLine>Nothing missing — all expected POSM was found.</EmptyLine>
          ) : (
            missing.map((m, i) => (
              <Row key={i} left={m.name} right={<PosmTypeTag type={m.type} />} />
            ))
          )}
        </Panel>
        <Panel
          title={`Damaged${damaged.length ? ` (${damaged.length})` : ''}`}
          subtitle="Present but damaged or obscured — needs replacing"
        >
          {damaged.length === 0 ? (
            <EmptyLine>No damaged POSM detected.</EmptyLine>
          ) : (
            damaged.map((d, i) => (
              <Row
                key={i}
                left={d.name}
                right={
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <PosmTypeTag type={d.type} />
                    <ConditionChip condition="damaged" />
                  </span>
                }
              />
            ))
          )}
        </Panel>
      </div>

      <Panel title={`Found${found.length ? ` (${found.length})` : ''}`} subtitle="Point-of-sale materials detected on this shelf">
        {found.length === 0 ? (
          <EmptyLine>No POSM was detected on this shelf.</EmptyLine>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ ...posmGrid, ...priceHeadStyle }}>
                <span>Type</span>
                <span>Name</span>
                <span>Brand</span>
                <span>Condition</span>
                <span style={num}>Confidence</span>
              </div>
              {found.map((f, i) => (
                <div key={i} style={{ ...posmGrid, ...priceRowStyle }}>
                  <span style={{ color: C.gray }}>{POSM_LABEL[f.type] ?? f.type}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.name}
                  </span>
                  <span style={{ color: C.gray }}>{f.brand || '—'}</span>
                  <span>
                    <ConditionChip condition={f.condition} />
                  </span>
                  <span style={num}>{Math.round(f.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Retail-execution chips ────────────────────────────────────────────────────

const POSM_LABEL: Record<PosmType, string> = {
  poster: 'Poster',
  dangler: 'Dangler',
  wobbler: 'Wobbler',
  shelf_strip: 'Shelf strip',
  standee: 'Standee',
  gondola_end: 'Gondola end',
  cooler: 'Cooler',
  branded_rack: 'Branded rack',
  tent_card: 'Tent card',
  bunting: 'Bunting',
  banner: 'Banner',
  other: 'Other',
};

/** Small colored chip helper (matches ScorePill's pill geometry + tone washes). */
function toneChip(label: string, color: string, wash: string) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 100,
        color,
        background: wash,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/** Stock-status chip: in_stock = green, low = amber, out = red. */
function StatusChip({ status }: { status: StockStatus | null | undefined }) {
  if (!status) return <span style={{ fontSize: 12, color: C.grayd }}>—</span>;
  switch (status) {
    case 'in_stock':
      return toneChip('In stock', C.green, PC.goodWash);
    case 'low':
      return toneChip('Low', C.yellow, PC.warnWash);
    case 'out':
      return toneChip('Out', C.red, PC.badWash);
    default:
      return <span style={{ fontSize: 12, color: C.grayd }}>—</span>;
  }
}

/** POSM condition chip: good = green, obscured = amber, damaged = red. */
function ConditionChip({ condition }: { condition: PosmCondition | null | undefined }) {
  if (!condition) return <span style={{ fontSize: 12, color: C.grayd }}>—</span>;
  switch (condition) {
    case 'good':
      return toneChip('Good', C.green, PC.goodWash);
    case 'obscured':
      return toneChip('Obscured', C.yellow, PC.warnWash);
    case 'damaged':
      return toneChip('Damaged', C.red, PC.badWash);
    default:
      return <span style={{ fontSize: 12, color: C.grayd }}>—</span>;
  }
}

/** A neutral tag naming a POSM type (poster, dangler…). */
function PosmTypeTag({ type }: { type: PosmType }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 100,
        color: C.gray,
        background: 'var(--s3)',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {POSM_LABEL[type] ?? type}
    </span>
  );
}

// ── Tab: Methodology ─────────────────────────────────────────────────────────

const METHOD_ORDER: { key: MethodologyKey; label: string }[] = [
  { key: 'composite', label: 'Composite score' },
  { key: 'presence', label: 'Presence' },
  { key: 'facing', label: 'Facings' },
  { key: 'position', label: 'Position' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'shelf_share', label: 'Shelf share' },
  { key: 'category', label: 'Category' },
  { key: 'zone', label: 'Placement zones' },
];

function MethodologyTab({
  compliance,
  method,
}: {
  compliance: Compliance | null;
  method?: Partial<Record<MethodologyKey, MethodologyEntry>>;
}) {
  const available = METHOD_ORDER.filter((m) => method?.[m.key]);
  return (
    <Panel
      title="How every number is calculated"
      subtitle="Full transparency — the real arithmetic and per-SKU breakdown behind each metric."
    >
      <div style={{ padding: 16 }}>
        {/* Metric-value recap — always present, even for older captures. */}
        {compliance && (
          <div style={{ overflowX: 'auto', marginBottom: available.length ? 16 : 0 }}>
            <div style={{ minWidth: 420 }}>
              <div style={{ ...methodRecapGrid, ...priceHeadStyle }}>
                <span>Metric</span>
                <span style={num}>Value</span>
                <span style={num}>Weight</span>
              </div>
              {[
                { label: 'Presence', v: compliance.presence_score, w: method?.presence?.weight },
                { label: 'Facings', v: compliance.facing_score, w: method?.facing?.weight },
                { label: 'Position', v: compliance.position_score, w: method?.position?.weight },
                { label: 'Occupancy', v: compliance.occupancy_score ?? null, w: method?.occupancy?.weight },
                { label: 'Shelf share (own)', v: compliance.shelf_share_own ?? null, w: method?.shelf_share?.weight },
                { label: 'Competitor share', v: compliance.competitor_share, w: undefined },
                { label: 'Composite score', v: compliance.score, w: undefined },
              ].map((m) => (
                <div key={m.label} style={{ ...methodRecapGrid, ...priceRowStyle }}>
                  <span style={{ fontWeight: 600 }}>{m.label}</span>
                  <span style={num}>{pct(m.v)}</span>
                  <span style={{ ...num, color: C.gray }}>{m.w != null ? m.w : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {available.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.gray }}>
            Detailed formulas aren&apos;t recorded for this capture — only the metric values above are
            available.
          </div>
        ) : (
          available.map((m, i) => (
            <details
              key={m.key}
              open={i === 0}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 11,
                marginBottom: 10,
                overflow: 'hidden',
                background: 'var(--s1)',
              }}
            >
              <summary
                style={{
                  listStyle: 'none',
                  cursor: 'pointer',
                  padding: '13px 15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  fontWeight: 700,
                  fontSize: 13.5,
                }}
              >
                <span>{m.label}</span>
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', color: C.gray, fontSize: 12 }}>
                  {method![m.key]!.weight != null && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.brand,
                        background: PC.brandWash,
                        padding: '2px 7px',
                        borderRadius: 100,
                      }}
                    >
                      weight {method![m.key]!.weight}
                    </span>
                  )}
                  {method![m.key]!.result != null && <span>result {round1(method![m.key]!.result as number)}</span>}
                </span>
              </summary>
              <div style={{ padding: '0 15px 15px' }}>
                <MethodologyDetails method={method![m.key]!} />
              </div>
            </details>
          ))
        )}
      </div>
    </Panel>
  );
}

// ── Small presentational pieces ──────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--s1)',
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
  overflow: 'hidden',
};

/** Compliance score ring (SVG), health-coloured. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 27;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const off = circ * (1 - clamped / 100);
  return (
    <div style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
      <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--s3)" strokeWidth={7} />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={off}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 19,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(score)}
      </div>
    </div>
  );
}

/** A KPI tile: label + value + meter bar + semantic colour. */
function KpiTile({
  label,
  value,
  pctValue,
  metricTone,
  color,
  meterPct,
  sub,
  emptyLabel,
}: {
  label: string;
  value: number | null;
  pctValue?: boolean;
  metricTone?: boolean;
  color?: string;
  meterPct?: number;
  sub?: string;
  /** Shown in place of the value when it is null (defaults to "—"). */
  emptyLabel?: string;
}) {
  const barColor = color ?? (metricTone && value != null ? toneColor(scoreTone(value)) : C.gray);
  const barPct =
    meterPct != null ? meterPct : pctValue && value != null ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div style={{ ...cardStyle, padding: '12px 13px' }}>
      <div style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
        {value != null ? (
          <>
            {round1(value)}
            {pctValue && <small style={{ fontSize: 13, color: C.grayd }}>%</small>}
          </>
        ) : (
          <span style={{ color: C.grayd, fontSize: 18 }}>{emptyLabel ?? '—'}</span>
        )}
      </div>
      <div style={{ height: 4, borderRadius: 100, background: 'var(--s3)', marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barPct}%`, background: barColor }} />
      </div>
      {sub && <div style={{ fontSize: 11, color: C.grayd, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/** Own-vs-competitor split bar. */
function ShareSplit({ own, comp }: { own: number; comp: number }) {
  const total = own + comp || 1;
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 100, overflow: 'hidden', background: 'var(--s3)' }}>
      <div style={{ width: `${(own / total) * 100}%`, background: C.green }} />
      <div style={{ width: `${(comp / total) * 100}%`, background: C.brand }} />
    </div>
  );
}

type FindTone = 'good' | 'bad' | 'brand' | 'info' | 'neutral';
function findToneColors(t: FindTone): { color: string; wash: string } {
  switch (t) {
    case 'bad':
      return { color: C.red, wash: PC.badWash };
    case 'brand':
      return { color: C.brand, wash: PC.brandWash };
    case 'info':
      return { color: C.blue, wash: PC.infoWash };
    case 'good':
      return { color: C.green, wash: PC.goodWash };
    default:
      return { color: C.gray, wash: 'var(--s3)' };
  }
}

/** One "At a glance" finding: a count chip + title + detail line. */
function Finding({
  count,
  tone,
  title,
  detail,
}: {
  count: number;
  tone: FindTone;
  title: string;
  detail: string;
}) {
  const { color, wash } = findToneColors(tone);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          fontWeight: 800,
          color,
          background: wash,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{title}</span>
        <div style={{ color: C.gray, fontSize: 12, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

/** Capture-quality chips + the escalating re-shoot / review callout. */
function CaptureQuality({
  needsReview,
  confidence,
  blur,
  glare,
  angle,
  reshoot,
}: {
  needsReview: boolean;
  confidence?: number;
  blur?: number;
  glare?: number;
  angle?: number;
  reshoot?: { action: string; rationale: string };
}) {
  const hasChips = confidence != null || blur != null || glare != null || angle != null;
  const clean = !needsReview && !reshoot;
  const accent = reshoot ? C.red : needsReview ? C.yellow : C.green;
  const tint = reshoot ? PC.badWash : needsReview ? PC.warnWash : PC.goodWash;
  const bord = `${accent}55`;
  return (
    <div>
      {hasChips && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <QualityChip label="Confidence" value={confidence} warnBelow={0.6} higherIsBetter />
          <QualityChip label="Blur" value={blur} warnBelow={0.5} />
          <QualityChip label="Glare" value={glare} warnBelow={0.5} />
          <QualityChip label="Angle" value={angle} warnBelow={0.5} />
        </div>
      )}
      <div style={{ padding: '11px 13px', background: tint, border: `1px solid ${bord}`, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: accent }}>
          <span aria-hidden>{clean ? '✓' : '⚠'}</span>
          <span>{reshoot ? 'Re-shoot recommended' : needsReview ? 'Flagged for review' : 'Capture looks clean'}</span>
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginTop: 4, lineHeight: 1.5 }}>
          {reshoot
            ? reshoot.rationale
            : needsReview
            ? `Low recognition confidence${
                confidence != null ? ` (${Math.round(confidence * 100)}%)` : ''
              } — verify the detections before trusting this capture. Recall already ran a second pass, so absent SKUs are probably genuine gaps rather than misses.`
            : 'Blur, glare, angle and confidence all cleared the quality floor. Detections can be trusted.'}
          {reshoot && needsReview ? ' Recognition also flagged this capture for review.' : ''}
        </div>
      </div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CompetitorRow {
  name: string;
  brand: string | null;
  category: string | null;
  facings: number;
  zone: ShelfZone | null;
  price: number | null;
  currency: string | null;
  recovered?: boolean;
}
interface OwnPriceRow {
  name: string;
  price: number | null;
  expected: number | null;
  currency: string | null;
  delta: number | null;
  source: PricingRow['source'];
}

// ── Compute fallbacks ────────────────────────────────────────────────────────

/** Detections below this confidence are the ones most worth confirming. */
const LOW_CONF_THRESHOLD = 0.6;

/** True when a detection can be turned into a reference: it needs a matched SKU
 *  id and a valid normalized bbox to crop. */
function canConfirm(sku: DetectedSKU): boolean {
  return !!sku.sku_id && Array.isArray(sku.bbox) && sku.bbox.length === 4;
}

/** Sort key: recovered first (0), then low-confidence (1), then the rest (2). */
function confirmPriority(sku: DetectedSKU): number {
  if (sku.recovered) return 0;
  if (sku.confidence < LOW_CONF_THRESHOLD) return 1;
  return 2;
}

function priorityRank(p: 'critical' | 'high' | 'medium' | 'low'): number {
  return p === 'critical' ? 0 : p === 'high' ? 1 : p === 'medium' ? 2 : 3;
}

const ZONE_LABEL: Record<ShelfZone, string> = { low: 'Low shelf', eye: 'Eye-level', top: 'Top shelf' };
function zoneOrder(z: ShelfZone): number {
  return z === 'top' ? 0 : z === 'eye' ? 1 : 2;
}

const PRICE_SOURCE_LABEL: Record<NonNullable<PricingRow['source']>, string> = {
  shelf_tag: 'Shelf tag',
  on_pack: 'On-pack',
  promo: 'Promo',
};

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

// ── Formatting ────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${round1(n)}%`;
}
function money(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return '—';
  return `${currency || '₹'}${round1(n)}`;
}
function fmtScore(v: number): string {
  return String(Math.round(v * 100) / 100);
}

// ── Helper components ─────────────────────────────────────────────────────────

/** The clickable ⓘ toggle. Controlled — the parent owns `open`. */
function InfoDotButton({
  method,
  open,
  onToggle,
}: {
  method?: MethodologyEntry;
  open: boolean;
  onToggle: () => void;
}) {
  if (!method) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="How this is calculated"
      title="How this is calculated"
      style={{
        appearance: 'none',
        background: open ? 'var(--s3)' : 'transparent',
        border: 'none',
        padding: 2,
        margin: 0,
        borderRadius: 6,
        cursor: 'pointer',
        color: open ? C.blue : C.gray,
        display: 'inline-flex',
        alignItems: 'center',
        opacity: open ? 1 : 0.7,
        lineHeight: 0,
      }}
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
    </button>
  );
}

/** Format a cell value for the audit table. */
function fmtCell(v: string | number | boolean | null): string {
  if (v == null) return '—';
  if (typeof v === 'number') return String(round1(v));
  return String(v);
}

/** Infer column alignment from its sampled row values. */
function inferAlign(
  rows: Array<Record<string, string | number | boolean | null>>,
  key: string,
): 'left' | 'right' | 'center' {
  let sawNumber = false;
  let sawBool = false;
  let sawOther = false;
  for (const r of rows) {
    const v = r[key];
    if (v == null) continue;
    if (typeof v === 'number') sawNumber = true;
    else if (typeof v === 'boolean') sawBool = true;
    else sawOther = true;
  }
  if (sawOther) return 'left';
  if (sawBool && !sawNumber) return 'center';
  if (sawNumber) return 'right';
  return 'left';
}

/** Scrollable per-SKU audit table driven by `columns` + `rows`. */
function MethodologyTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string }[];
  rows: Array<Record<string, string | number | boolean | null>>;
}) {
  const aligns = columns.map((c) => inferAlign(rows, c.key));
  return (
    <div style={{ overflowX: 'auto', marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          minWidth: Math.max(320, columns.length * 96),
          fontSize: 11.5,
        }}
      >
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{
                  textAlign: aligns[i],
                  padding: '7px 10px',
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: C.gray,
                  background: 'var(--s2)',
                  borderBottom: `1px solid ${C.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {columns.map((c, ci) => {
                const v = r[c.key];
                const isDelta = c.key.toLowerCase().includes('delta');
                let color: string | undefined;
                let content: React.ReactNode;
                if (typeof v === 'boolean') {
                  color = v ? C.green : C.red;
                  content = v ? '✓' : '✗';
                } else if (typeof v === 'number' && isDelta) {
                  color = v < 0 ? C.red : v > 0 ? C.green : C.gray;
                  content = `${v > 0 ? '+' : ''}${round1(v)}`;
                } else {
                  content = fmtCell(v);
                  if (v == null) color = C.grayd;
                }
                return (
                  <td
                    key={c.key}
                    style={{
                      textAlign: aligns[ci],
                      padding: '7px 10px',
                      color: color ?? 'var(--text)',
                      fontWeight: typeof v === 'boolean' || isDelta ? 700 : 400,
                      borderBottom: `1px solid rgba(122,139,160,0.15)`,
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The expanded, auditable explainer body: result + weight, prominent calc,
 *  plain-English formula/inputs/notes, and the per-SKU audit table. */
function MethodologyDetails({ method }: { method: MethodologyEntry }) {
  const hasTable = !!(method.columns && method.columns.length > 0 && method.rows && method.rows.length > 0);
  return (
    <div
      style={{
        marginTop: 10,
        background: 'var(--s3)',
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        fontSize: 12,
        lineHeight: 1.55,
        color: C.gray,
        textAlign: 'left',
      }}
    >
      <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 9.5, letterSpacing: 0.5, marginBottom: 8 }}>
        HOW THIS IS CALCULATED
      </div>

      {method.result != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
            {round1(method.result)}
          </span>
          <span style={{ fontSize: 11, color: C.gray }}>result</span>
          {method.weight != null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 20,
                background: PC.infoWash,
                color: C.blue,
                border: `1px solid ${C.blue}55`,
                whiteSpace: 'nowrap',
              }}
            >
              weight {method.weight} in composite
            </span>
          )}
        </div>
      )}

      {method.calc && (
        <div
          style={{
            fontFamily: "'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace",
            fontSize: 12.5,
            color: 'var(--text)',
            background: 'var(--s2)',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '9px 11px',
            marginBottom: 8,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {method.calc}
        </div>
      )}

      <div style={{ color: 'var(--text)', marginBottom: method.inputs?.length || method.notes ? 4 : 0 }}>
        {method.formula}
      </div>
      {method.inputs?.length > 0 && <div style={{ opacity: 0.9 }}>Inputs: {method.inputs.join(', ')}</div>}
      {method.notes && <div style={{ marginTop: 6, opacity: 0.85 }}>{method.notes}</div>}

      {hasTable && <MethodologyTable columns={method.columns!} rows={method.rows!} />}
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
    <span style={{ ...style, color: tone === 'own' ? C.green : value > 0 ? C.brand : C.gray, fontWeight: 600 }}>
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

// ── Recognition-accuracy surfaces ─────────────────────────────────────────────

const RECOVERED_HINT = 'Missed on the first scan, found on a second targeted pass using its pack-shot.';

const recoveredTagStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: 0.3,
  padding: '2px 6px',
  borderRadius: 5,
  color: C.blue,
  background: `${C.blue}1F`,
  border: `1px solid ${C.blue}55`,
  whiteSpace: 'nowrap',
};

function RecoveredTag() {
  return (
    <span title={RECOVERED_HINT} style={{ ...recoveredTagStyle, marginLeft: 8, flexShrink: 0 }}>
      Recovered · 2nd pass
    </span>
  );
}

function LowConfTag({ confidence }: { confidence: number }) {
  return (
    <span
      title="The recogniser was unsure about this detection — confirming it improves future accuracy the most."
      style={{
        display: 'inline-block',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: '2px 6px',
        borderRadius: 5,
        marginLeft: 8,
        flexShrink: 0,
        color: C.yellow,
        background: PC.warnWash,
        border: `1px solid ${C.yellow}55`,
        whiteSpace: 'nowrap',
      }}
    >
      Low confidence · {Math.round(confidence * 100)}%
    </span>
  );
}

/** Summary strip listing every detected SKU the second targeted pass recovered. */
function RecoveredSummary({ skus }: { skus: DetectedSKU[] }) {
  const names = skus.map((s) => s.sku_name);
  const shown = names.slice(0, 6);
  const extra = names.length - shown.length;
  return (
    <div
      style={{
        marginTop: 10,
        padding: '11px 14px',
        background: `${C.blue}14`,
        border: `1px solid ${C.blue}40`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={recoveredTagStyle}>Recovered · 2nd pass</span>
        <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>
          {skus.length} SKU{skus.length === 1 ? '' : 's'} found on a second targeted pass
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: C.gray, marginTop: 6, lineHeight: 1.5 }}>
        {shown.join(', ')}
        {extra > 0 ? `, +${extra} more` : ''} — missed on the first scan, matched against their pack-shots
        on a retry.
      </div>
    </div>
  );
}

/** One capture-quality metric as a chip. */
function QualityChip({
  label,
  value,
  warnBelow,
  higherIsBetter,
}: {
  label: string;
  value?: number | null;
  warnBelow: number;
  higherIsBetter?: boolean;
}) {
  if (value == null) return null;
  const warn = value < warnBelow;
  return (
    <span
      title={`${label} ${fmtScore(value)} — ${higherIsBetter ? 'higher is better' : 'lower is worse'}`}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 9px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        border: `1px solid ${warn ? `${C.yellow}66` : C.border}`,
        background: warn ? PC.warnWash : 'var(--s2)',
        color: warn ? C.yellow : C.gray,
      }}
    >
      {label} {fmtScore(value)}
      {warn ? ' ⚠' : ''}
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

/** A titled card. `info` renders a methodology ⓘ toggle in the header. */
function Panel({
  title,
  subtitle,
  info,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  info?: MethodologyEntry;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={cardStyle}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-manrope)', fontSize: 14, fontWeight: 800 }}>{title}</span>
            <InfoDotButton method={info} open={open} onToggle={() => setOpen((o) => !o)} />
          </div>
          {action}
        </div>
        {subtitle && <div style={{ fontSize: 11.5, color: C.gray, marginTop: 3 }}>{subtitle}</div>}
        {open && info && <MethodologyDetails method={info} />}
      </div>
      {children}
    </div>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 18px',
        borderBottom: `1px solid rgba(122,139,160,0.15)`,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</span>
      <span style={{ color: C.gray, flexShrink: 0 }}>{right}</span>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '24px 18px', textAlign: 'center', color: C.grayd, fontSize: 13 }}>{children}</div>;
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const doneMsgStyle: React.CSSProperties = {
  color: C.green,
  fontWeight: 700,
  fontSize: 12,
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 150,
  background: 'var(--s1)',
  border: `1px solid ${PC.border}`,
  borderRadius: 8,
  padding: '7px 10px',
  font: 'inherit',
  fontSize: 13,
  color: 'var(--text)',
};

function actionBtnStyle(kind: 'ok' | 'fix' | 'ghost', disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    appearance: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'DM Sans',sans-serif",
    whiteSpace: 'nowrap',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'inline-flex',
    gap: 5,
    alignItems: 'center',
  };
  if (kind === 'ok')
    return { ...base, color: C.green, background: PC.goodWash, border: `1px solid ${C.green}55` };
  if (kind === 'fix')
    return { ...base, color: C.yellow, background: PC.warnWash, border: `1px solid ${C.yellow}55` };
  return { ...base, color: C.gray, background: 'var(--s1)', border: `1px solid ${PC.border}` };
}

const catGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.8fr 0.7fr 0.9fr 0.9fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const catHeadStyle: React.CSSProperties = {
  fontSize: 10,
  color: C.gray,
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: `1px solid ${C.border}`,
};
const catRowStyle: React.CSSProperties = {
  fontSize: 13,
  borderBottom: `1px solid rgba(122,139,160,0.15)`,
};
const priceGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 0.8fr 1fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const compGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr 1.2fr 0.8fr 1fr 1fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const stockGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr 1fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const posmGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.6fr 1fr 1fr 0.9fr',
  gap: 8,
  padding: '10px 18px',
  alignItems: 'center',
};
const methodRecapGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr',
  gap: 8,
  padding: '9px 4px',
  alignItems: 'center',
};
const priceHeadStyle: React.CSSProperties = {
  fontSize: 10,
  color: C.gray,
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: `1px solid ${C.border}`,
};
const priceRowStyle: React.CSSProperties = {
  fontSize: 13,
  borderBottom: `1px solid rgba(122,139,160,0.15)`,
};
