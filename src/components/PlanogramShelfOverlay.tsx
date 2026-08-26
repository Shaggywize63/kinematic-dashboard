'use client';
import { useMemo, useRef, useState } from 'react';
import type { DetectedSKU, Promotion, ShelfZone } from '../types/planogram';

/** A product the reviewer can tag a hand-drawn box with. */
export interface MarkableSku {
  sku_id: string;
  sku_name: string;
  brand?: string | null;
  is_competitor?: boolean;
}

/** Enables the "Mark a product" teaching tool on the overlay. When present, the
 *  reviewer can drag a box on the shelf photo and tag it with a SKU; `onSave`
 *  persists it (the backend crops that box into a reference pack-shot so KINI AI
 *  learns the product). Absent → the overlay is display-only, unchanged. */
export interface AnnotationConfig {
  skus: MarkableSku[];
  onSave: (skuId: string, bbox: [number, number, number, number]) => Promise<void>;
}

interface Props {
  imageUrl: string;
  detectedSkus: DetectedSKU[];
  missingSkuIds?: Set<string>;
  /** Optional detected promotions — drawn as dashed offer boxes. */
  promotions?: Promotion[];
  /** Optional teaching tool — draw a box + tag a SKU to grow the reference set. */
  annotation?: AnnotationConfig;
}

interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARK_COLOR = '#E01E2C';
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const rectFrom = (ax: number, ay: number, bx: number, by: number): NormRect => ({
  x: Math.min(ax, bx),
  y: Math.min(ay, by),
  w: Math.abs(ax - bx),
  h: Math.abs(ay - by),
});

type ColorMode = 'status' | 'category' | 'zone';

// Deterministic category palette — shared visual language with the
// category-analysis panel on the capture-detail screen.
const CAT_PALETTE = [
  '#E01E2C', '#3E9EFF', '#00D97E', '#FFB800',
  '#9B7BFF', '#FF7A59', '#00C2CB', '#E86FC5',
];
export function categoryColor(cat: string): string {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}
const ZONE_COLOR: Record<ShelfZone, string> = { low: '#9B7BFF', eye: '#00D97E', top: '#3E9EFF' };
const ZONE_LABEL: Record<ShelfZone, string> = { low: 'Low shelf', eye: 'Eye-level', top: 'Top shelf' };
const PROMO_COLOR = '#FF7A59';
// SKUs the first vision pass missed but a second targeted pass recovered.
const RECOVERED_COLOR = '#3E9EFF';
const RECOVERED_HINT =
  'Missed on the first scan, found on a second targeted pass using its pack-shot.';

/**
 * Renders the shelf image with bounding-box overlays for every detected SKU.
 *
 * Boxes recolor by the active mode:
 *   status   — green matched · amber missing/misplaced · red competitor · gray unknown
 *   category — one hue per product category (Beverages, Noodles…)
 *   zone     — placement band (low / eye-level / top)
 *
 * Detected promotions render as dashed offer boxes. Hovering any box shows the
 * SKU name, brand, category, facings, price and confidence.
 */
export default function PlanogramShelfOverlay({
  imageUrl,
  detectedSkus,
  missingSkuIds,
  promotions,
  annotation,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredPromo, setHoveredPromo] = useState<number | null>(null);
  const [mode, setMode] = useState<ColorMode>('status');

  // "Mark a product" teaching tool (only when `annotation` is provided).
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [markMode, setMarkMode] = useState(false);
  const [drawRect, setDrawRect] = useState<NormRect | null>(null); // live drag
  const [pending, setPending] = useState<NormRect | null>(null);   // drawn box awaiting a SKU
  const [skuQuery, setSkuQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const hasCategory = detectedSkus.some((s) => s.category);
  const hasZone = detectedSkus.some((s) => s.zone);
  const promoBoxes = (promotions || []).filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4);

  // Detections are shown as small NUMBERED pins (a dot at each product's centre)
  // keyed to the list below, rather than tight bounding boxes — a dot reads as
  // "on the product" even with a little position error, where a box that misses
  // by a few percent looks broken. Number them in reading order (top row → down,
  // left → right) so the pin numbers and the list line up intuitively.
  const ordered = useMemo(() => {
    return detectedSkus
      .map((sku, i) => ({ sku, i }))
      .sort((a, b) => {
        const ay = a.sku.bbox[1] + a.sku.bbox[3] / 2;
        const by = b.sku.bbox[1] + b.sku.bbox[3] / 2;
        if (Math.abs(ay - by) > 0.06) return ay - by; // different rows
        return a.sku.bbox[0] - b.sku.bbox[0]; // same row → left to right
      })
      .map((e, n) => ({ ...e, num: n + 1 }));
  }, [detectedSkus]);

  const normPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  };

  const onDrawDown = (e: React.MouseEvent) => {
    if (pending) return; // already have a box awaiting a label
    const p = normPoint(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    dragStart.current = p;
    setDrawRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onDrawMove = (e: React.MouseEvent) => {
    if (!dragStart.current || pending) return;
    const p = normPoint(e.clientX, e.clientY);
    if (!p) return;
    setDrawRect(rectFrom(dragStart.current.x, dragStart.current.y, p.x, p.y));
  };
  const onDrawUp = (e: React.MouseEvent) => {
    const s = dragStart.current;
    dragStart.current = null;
    if (!s) return;
    const p = normPoint(e.clientX, e.clientY) || { x: s.x, y: s.y };
    const r = rectFrom(s.x, s.y, p.x, p.y);
    setDrawRect(null);
    // Ignore stray clicks / slivers — need a real box to crop a reference.
    if (r.w > 0.02 && r.h > 0.02) {
      setPending(r);
      setSkuQuery('');
    }
  };

  const cancelMark = () => {
    setPending(null);
    setDrawRect(null);
    dragStart.current = null;
  };
  const exitMarkMode = () => {
    setMarkMode(false);
    cancelMark();
  };

  const saveMark = async (skuId: string) => {
    if (!annotation || !pending || saving) return;
    setSaving(true);
    try {
      await annotation.onSave(skuId, [pending.x, pending.y, pending.w, pending.h]);
      setPending(null); // ready for the next mark; stays in mark mode
    } catch {
      // Parent surfaces the error toast; keep `pending` so they can retry.
    } finally {
      setSaving(false);
    }
  };

  const markSkus = useMemo(() => {
    const list = annotation?.skus ?? [];
    const q = skuQuery.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (s) =>
            s.sku_name.toLowerCase().includes(q) ||
            (s.brand ? s.brand.toLowerCase().includes(q) : false),
        )
      : list;
    // Own products first, then competitors; alphabetical within each.
    return [...filtered].sort((a, b) => {
      const ac = a.is_competitor ? 1 : 0;
      const bc = b.is_competitor ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return a.sku_name.localeCompare(b.sku_name);
    });
  }, [annotation, skuQuery]);

  const boxColor = (sku: DetectedSKU): string => {
    if (mode === 'category') return categoryColor((sku.category || 'Uncategorized').trim());
    if (mode === 'zone') return sku.zone ? ZONE_COLOR[sku.zone] : '#7A8BA0';
    return sku.is_competitor
      ? '#E01E2C'
      : sku.sku_id
      ? missingSkuIds?.has(sku.sku_id)
        ? '#FFB800'
        : '#00D97E'
      : '#7A8BA0';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Mode toggle + (optional) teaching tool */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--textTert)', textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>
          Color by
        </span>
        <ModeBtn active={mode === 'status'} onClick={() => setMode('status')}>Status</ModeBtn>
        {hasCategory && <ModeBtn active={mode === 'category'} onClick={() => setMode('category')}>Category</ModeBtn>}
        {hasZone && <ModeBtn active={mode === 'zone'} onClick={() => setMode('zone')}>Zone</ModeBtn>}
        {annotation && (
          <button
            onClick={() => (markMode ? exitMarkMode() : setMarkMode(true))}
            title="Draw a box around a product the AI missed or mislabeled and tag it — KINI AI learns from it"
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
              background: markMode ? MARK_COLOR : 'rgba(224,30,44,0.12)',
              border: `1px solid ${markMode ? MARK_COLOR : 'rgba(224,30,44,0.4)'}`,
              color: markMode ? '#fff' : MARK_COLOR,
            }}
          >
            {markMode ? '✓ Done marking' : '✎ Mark a product'}
          </button>
        )}
      </div>

      {annotation && markMode && !pending && (
        <div style={{ fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }}>
          Drag a box around a product on the shelf, then tag which SKU it is. KINI AI saves the crop
          as a reference and uses it to recognise that product better next time.
        </div>
      )}

      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: '100%',
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Shelf capture"
          draggable={false}
          style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }}
        />

        {/* Promotion pins (a small tag marker at the offer's centre) */}
        {promoBoxes.map((p, i) => {
          const [x, y, w, h] = p.bbox as [number, number, number, number];
          const cx = (x + w / 2) * 100;
          const cy = (y + h / 2) * 100;
          return (
            <div
              key={`promo-${i}`}
              onMouseEnter={() => setHoveredPromo(i)}
              onMouseLeave={() => setHoveredPromo(null)}
              style={{
                position: 'absolute',
                left: `${cx}%`,
                top: `${cy}%`,
                transform: 'translate(-50%, -50%)',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: PROMO_COLOR,
                border: '2px solid #fff',
                boxShadow: '0 1px 4px rgba(16,20,30,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                cursor: 'pointer',
                zIndex: hoveredPromo === i ? 8 : 4,
              }}
            >
              🏷
              {hoveredPromo === i && (
                <div style={tooltipStyle(PROMO_COLOR)}>
                  {p.text} · {Math.round(p.confidence * 100)}%
                </div>
              )}
            </div>
          );
        })}

        {/* SKU pins — a small numbered dot at each product's centre, keyed to
            the list below. Deliberately NOT a tight box: the AI's exact box can
            drift a few percent, and a dot still reads as "on the product". */}
        {ordered.map(({ sku, i, num }) => {
          const [x, y, w, h] = sku.bbox;
          const cx = (x + w / 2) * 100;
          const cy = (y + h / 2) * 100;
          const color = boxColor(sku);
          const priceStr =
            sku.price != null ? ` · ${sku.price_currency || '₹'}${sku.price}` : '';
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                left: `${cx}%`,
                top: `${cy}%`,
                transform: 'translate(-50%, -50%)',
                width: hovered === i ? 28 : 24,
                height: hovered === i ? 28 : 24,
                borderRadius: '50%',
                background: color,
                color: '#fff',
                border: `2px solid ${sku.recovered ? RECOVERED_COLOR : '#fff'}`,
                boxShadow: hovered === i ? `0 0 0 3px ${color}66` : '0 1px 4px rgba(16,20,30,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'width 100ms, height 100ms',
                zIndex: hovered === i ? 8 : 3,
              }}
            >
              {num}
              {hovered === i && (
                <div style={tooltipStyle(color)}>
                  <div style={{ fontWeight: 700 }}>
                    {num}. {sku.sku_name}
                    {sku.is_competitor ? ' · competitor' : ''}
                  </div>
                  <div style={{ opacity: 0.85, fontWeight: 500, marginTop: 2 }}>
                    {[
                      sku.brand || null,
                      sku.category || null,
                      `${sku.facings} facing${sku.facings === 1 ? '' : 's'}`,
                      sku.zone ? ZONE_LABEL[sku.zone] : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div style={{ opacity: 0.85, fontWeight: 500, marginTop: 2 }}>
                    {Math.round(sku.confidence * 100)}%{priceStr}
                  </div>
                  {sku.recovered && (
                    <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 500 }}>{RECOVERED_HINT}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Teaching-tool draw layer — sits above the detection boxes and
            captures the drag; only present in mark mode so the display-only
            view is untouched. */}
        {annotation && markMode && (
          <div
            onMouseDown={onDrawDown}
            onMouseMove={onDrawMove}
            onMouseUp={onDrawUp}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 6,
              cursor: pending ? 'default' : 'crosshair',
            }}
          >
            {drawRect && <div style={markRectStyle(drawRect, true)} />}
            {pending && <div style={markRectStyle(pending, false)} />}
          </div>
        )}
      </div>

      {/* Numbered detections list — the record of what was found, keyed to the
          pins on the photo. This is the source of truth (scoring uses it), so it
          stays correct even when a pin's position is slightly off. */}
      {ordered.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--textTert)', textTransform: 'uppercase', letterSpacing: 1, margin: '2px 0 6px' }}>
            {ordered.length} product{ordered.length === 1 ? '' : 's'} detected
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
            {ordered.map(({ sku, num }) => {
              const color = boxColor(sku);
              const meta = [
                sku.brand || null,
                sku.category || null,
                `${sku.facings} facing${sku.facings === 1 ? '' : 's'}`,
                sku.price != null ? `${sku.price_currency || '₹'}${sku.price}` : null,
                sku.is_competitor ? 'competitor' : null,
              ].filter(Boolean).join(' · ');
              return (
                <div
                  key={num}
                  onMouseEnter={() => setHovered(detectedSkus.indexOf(sku))}
                  onMouseLeave={() => setHovered(null)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 6px', borderRadius: 8, background: hovered === detectedSkus.indexOf(sku) ? 'var(--s2)' : 'transparent' }}
                >
                  <span
                    style={{
                      flex: '0 0 auto', width: 20, height: 20, borderRadius: '50%',
                      background: color, color: '#fff', fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                    }}
                  >
                    {num}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--textPri)', lineHeight: 1.3 }}>{sku.sku_name}</div>
                    {meta && <div style={{ fontSize: 11, color: 'var(--textSec)', lineHeight: 1.3 }}>{meta}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Teaching-tool SKU picker — tag the box just drawn. */}
      {annotation && pending && (
        <div
          style={{
            border: `1px solid ${MARK_COLOR}55`,
            background: 'var(--s2)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--textPri)' }}>
            Which product did you mark?
          </div>
          <input
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            placeholder="Search products…"
            autoFocus
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--s1)',
              color: 'var(--textPri)',
              fontSize: 13,
              fontFamily: "'DM Sans',sans-serif",
            }}
          />
          <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {markSkus.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--textSec)', padding: '6px 2px' }}>
                No products match “{skuQuery}”.
              </div>
            ) : (
              markSkus.map((s) => (
                <button
                  key={s.sku_id}
                  onClick={() => saveMark(s.sku_id)}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--s1)',
                    color: 'var(--textPri)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <span>
                    {s.sku_name}
                    {s.brand ? <span style={{ color: 'var(--textSec)', fontWeight: 500 }}> · {s.brand}</span> : null}
                  </span>
                  {s.is_competitor && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#E01E2C' }}>competitor</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={cancelMark}
              disabled={saving}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--textSec)',
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {saving ? 'Saving…' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <Legend mode={mode} detectedSkus={detectedSkus} hasPromos={promoBoxes.length > 0} />
    </div>
  );
}

function Legend({
  mode,
  detectedSkus,
  hasPromos,
}: {
  mode: ColorMode;
  detectedSkus: DetectedSKU[];
  hasPromos: boolean;
}) {
  let items: Array<{ color: string; label: string }> = [];
  if (mode === 'status') {
    items = [
      { color: '#00D97E', label: 'Matched' },
      { color: '#FFB800', label: 'Missing / misplaced' },
      { color: '#E01E2C', label: 'Competitor' },
      { color: '#7A8BA0', label: 'Unknown' },
    ];
  } else if (mode === 'category') {
    const cats = Array.from(
      new Set(detectedSkus.map((s) => (s.category || 'Uncategorized').trim())),
    );
    items = cats.map((c) => ({ color: categoryColor(c), label: c }));
  } else {
    const zones = Array.from(new Set(detectedSkus.map((s) => s.zone).filter(Boolean))) as ShelfZone[];
    items = zones.map((z) => ({ color: ZONE_COLOR[z], label: ZONE_LABEL[z] }));
  }
  if (hasPromos) items = [...items, { color: PROMO_COLOR, label: 'Promotion' }];
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--textSec)' }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: 'inline-block' }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: "'DM Sans',sans-serif",
        background: active ? 'rgba(224,30,44,0.12)' : 'var(--s2)',
        border: `1px solid ${active ? 'rgba(224,30,44,0.4)' : 'var(--border)'}`,
        color: active ? '#E01E2C' : 'var(--textSec)',
      }}
    >
      {children}
    </button>
  );
}

function markRectStyle(r: NormRect, dashed: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
    border: `2px ${dashed ? 'dashed' : 'solid'} ${MARK_COLOR}`,
    background: `${MARK_COLOR}22`,
    pointerEvents: 'none',
  };
}

function tooltipStyle(color: string): React.CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    background: '#0F1419',
    color: '#fff',
    padding: '6px 10px',
    fontSize: 11,
    borderRadius: 8,
    whiteSpace: 'nowrap',
    marginBottom: 4,
    border: `1px solid ${color}`,
    zIndex: 5,
  };
}
