'use client';
import { useState } from 'react';
import type { DetectedSKU } from '../types/planogram';

interface Props {
  imageUrl: string;
  detectedSkus: DetectedSKU[];
  missingSkuIds?: Set<string>;
}

/**
 * Renders the shelf image with bounding-box overlays for every detected SKU.
 * Boxes are color-coded by status:
 *   green = matched expected SKU
 *   amber = matched but misplaced or off-facing (caller decides via missingSkuIds vs detectedSkus)
 *   red   = competitor placement
 *   gray  = unknown SKU
 */
export default function PlanogramShelfOverlay({ imageUrl, detectedSkus, missingSkuIds }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
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
      <img
        src={imageUrl}
        alt="Shelf capture"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
      {detectedSkus.map((sku, i) => {
        const [x, y, w, h] = sku.bbox;
        const color = sku.is_competitor
          ? '#E01E2C'
          : sku.sku_id
          ? missingSkuIds?.has(sku.sku_id)
            ? '#FFB800'
            : '#00D97E'
          : '#7A8BA0';
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
            {hovered === i && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: '100%',
                  background: '#0F1419',
                  color: '#fff',
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                  marginBottom: 4,
                  border: `1px solid ${color}`,
                }}
              >
                {sku.sku_name} · {sku.facings} facing{sku.facings === 1 ? '' : 's'} ·{' '}
                {Math.round(sku.confidence * 100)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
