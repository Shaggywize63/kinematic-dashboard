'use client';
// A small map-like plot drawn in plain SVG (no map library, no network): paths and markers placed by latitude and
// longitude, scaled to fit with the aspect ratio kept, with a scale bar. Shared by the field-force screens.

import { useMemo } from 'react';
import { T } from '../ui';
import type { GeoPoint } from '../../../lib/hrms/field/types';

export interface MapPath { id: string; points: GeoPoint[]; color?: string; dashed?: boolean; width?: number }
export interface MapMarker { id: string; pos: GeoPoint; label?: string; color?: string; shape?: 'dot' | 'ring' | 'square'; r?: number; title?: string }

const W = 640;

export function GeoPlot({ paths = [], markers = [], height = 300, onMarkerClick, ariaLabel = 'Map', testId }: {
  paths?: MapPath[]; markers?: MapMarker[]; height?: number; onMarkerClick?: (id: string) => void; ariaLabel?: string; testId?: string;
}) {
  const geo = useMemo(() => {
    const pts = [...paths.flatMap((p) => p.points), ...markers.map((m) => m.pos)];
    if (!pts.length) return null;
    let minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
    let minLng = Math.min(...pts.map((p) => p.lng)), maxLng = Math.max(...pts.map((p) => p.lng));
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    // a floor on the extent so a single point or a tiny cluster does not zoom to nothing (about 400 m)
    const minSpan = 0.004;
    if (maxLat - minLat < minSpan) { const c = (maxLat + minLat) / 2; minLat = c - minSpan / 2; maxLat = c + minSpan / 2; }
    if (maxLng - minLng < minSpan / k) { const c = (maxLng + minLng) / 2; minLng = c - minSpan / k / 2; maxLng = c + minSpan / k / 2; }
    const wDeg = (maxLng - minLng) * k, hDeg = maxLat - minLat;
    const pad = 28;
    const scale = Math.min((W - 2 * pad) / wDeg, (height - 2 * pad) / hDeg);
    const offX = (W - wDeg * scale) / 2, offY = (height - hDeg * scale) / 2;
    const px = (p: GeoPoint) => ({ x: offX + (p.lng - minLng) * k * scale, y: offY + (maxLat - p.lat) * scale });
    // scale bar: pick a round length that is roughly a fifth of the width
    const kmPerPx = 111.32 / scale;
    const target = kmPerPx * (W / 5);
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    return { px, barPx: nice / kmPerPx, barKm: nice };
  }, [paths, markers, height]);

  if (!geo) return <div style={{ height, display: 'grid', placeItems: 'center', color: T.dim, fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 10 }}>Nothing to plot</div>;
  const { px } = geo;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} data-testid={testId} style={{ width: '100%', height: 'auto', maxHeight: height * 1.4, background: T.field, border: `1px solid ${T.border}`, borderRadius: 10, display: 'block' }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <g key={f}>
          <line x1={W * f} x2={W * f} y1={0} y2={height} stroke={T.border} strokeWidth={0.5} strokeDasharray="2 4" />
          <line x1={0} x2={W} y1={height * f} y2={height * f} stroke={T.border} strokeWidth={0.5} strokeDasharray="2 4" />
        </g>
      ))}
      {paths.map((p) => (
        <polyline key={p.id} fill="none" stroke={p.color ?? T.info} strokeWidth={p.width ?? 2} strokeDasharray={p.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" opacity={0.9}
          points={p.points.map((q) => { const { x, y } = px(q); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ')} />
      ))}
      {markers.map((m) => {
        const { x, y } = px(m.pos);
        const r = m.r ?? 5, c = m.color ?? T.text;
        const click = onMarkerClick ? { onClick: () => onMarkerClick(m.id), style: { cursor: 'pointer' } } : {};
        return (
          <g key={m.id} {...click}>
            <title>{m.title ?? m.label ?? m.id}</title>
            {m.shape === 'ring' ? <circle cx={x} cy={y} r={r + 3} fill="none" stroke={c} strokeWidth={2} />
              : m.shape === 'square' ? <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={c} />
              : <circle cx={x} cy={y} r={r} fill={c} stroke={T.card} strokeWidth={1.5} />}
            {m.label && <text x={x + r + 4} y={y + 4} fontSize={11} fill={T.text} stroke={T.field} strokeWidth={3} paintOrder="stroke">{m.label}</text>}
          </g>
        );
      })}
      <g transform={`translate(16, ${height - 16})`}>
        <line x1={0} x2={geo.barPx} y1={0} y2={0} stroke={T.dim} strokeWidth={2} />
        <line x1={0} x2={0} y1={-4} y2={4} stroke={T.dim} strokeWidth={2} />
        <line x1={geo.barPx} x2={geo.barPx} y1={-4} y2={4} stroke={T.dim} strokeWidth={2} />
        <text x={geo.barPx + 6} y={4} fontSize={11} fill={T.dim}>{geo.barKm} km</text>
      </g>
    </svg>
  );
}
