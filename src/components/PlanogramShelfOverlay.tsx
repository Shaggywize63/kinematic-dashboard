'use client';
import { useState } from 'react';
import type { DetectedSKU, Promotion, ShelfZone } from '../types/planogram';

interface Props {
  imageUrl: string;
  detectedSkus: DetectedSKU[];
  missingSkuIds?: Set<string>;
  /** Optional detected promotions — drawn as dashed offer boxes. */
  promotions?: Promotion[];
}

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
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredPromo, setHoveredPromo] = useState<number | null>(null);
  const [mode, setMode] = useState<ColorMode>('status');

  const hasCategory = detectedSkus.some((s) => s.category);
  const hasZone = detectedSkus.some((s) => s.zone);
  const promoBoxes = (promotions || []).filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4);

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
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--textTert)', textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>
          Color by
        </span>
        <ModeBtn active={mode === 'status'} onClick={() => setMode('status')}>Status</ModeBtn>
        {hasCategory && <ModeBtn active={mode === 'category'} onClick={() => setMode('category')}>Category</ModeBtn>}
        {hasZone && <ModeBtn active={mode === 'zone'} onClick={() => setMode('zone')}>Zone</ModeBtn>}
      </div>

      <div
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
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />

        {/* Promotion boxes (dashed) */}
        {promoBoxes.map((p, i) => {
          const [x, y, w, h] = p.bbox as [number, number, number, number];
          return (
            <div
              key={`promo-${i}`}
              onMouseEnter={() => setHoveredPromo(i)}
              onMouseLeave={() => setHoveredPromo(null)}
              style={{
                position: 'absolute',
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                border: `2px dashed ${PROMO_COLOR}`,
                background: hoveredPromo === i ? `${PROMO_COLOR}33` : 'transparent',
                cursor: 'pointer',
              }}
            >
              {hoveredPromo === i && (
                <div style={tooltipStyle(PROMO_COLOR)}>
                  🏷 {p.text} · {Math.round(p.confidence * 100)}%
                </div>
              )}
            </div>
          );
        })}

        {/* SKU boxes */}
        {detectedSkus.map((sku, i) => {
          const [x, y, w, h] = sku.bbox;
          const color = boxColor(sku);
          const priceStr =
            sku.price != null
              ? ` · ${sku.price_currency || '₹'}${sku.price}`
              : '';
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                border: `2px solid ${color}`,
                background: hovered === i ? `${color}33` : 'transparent',
                boxShadow: hovered === i ? `0 0 0 2px ${color}` : 'none',
                transition: 'background 120ms',
                cursor: 'pointer',
              }}
            >
              {/* Recovered marker — a small 2nd-pass dot in the corner. */}
              {sku.recovered && (
                <span
                  title={RECOVERED_HINT}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: RECOVERED_COLOR,
                    border: '2px solid #0F1419',
                    boxShadow: '0 0 0 1px ' + RECOVERED_COLOR,
                  }}
                />
              )}
              {hovered === i && (
                <div style={tooltipStyle(color)}>
                  <div style={{ fontWeight: 700 }}>
                    {sku.sku_name}
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
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          padding: '2px 6px',
                          borderRadius: 5,
                          color: RECOVERED_COLOR,
                          background: `${RECOVERED_COLOR}22`,
                          border: `1px solid ${RECOVERED_COLOR}55`,
                        }}
                      >
                        Recovered · 2nd pass
                      </span>
                      <div
                        style={{
                          whiteSpace: 'normal',
                          maxWidth: 210,
                          opacity: 0.8,
                          fontWeight: 500,
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {RECOVERED_HINT}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
