'use client';
import { useEffect, useMemo, useRef } from 'react';
import { INDIA_CENTRE } from '../../../lib/indiaStates';
import { applyMapTheme, baseMapOptions, fitToPoints, useDocumentTheme, useGoogleMaps, type GMaps } from '../../../lib/googleMaps';

/** A single lat/lng row from /api/v1/crm/leads/geo. Only the coords are
 *  used by the heatmap; the rest of the geo payload (status, score…) is
 *  ignored so the layer stays cheap to redraw on widget resize. */
export interface HeatPoint {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

interface LeadsGeoHeatmapProps {
  points: HeatPoint[];
  /** Pixel radius of each heat blob. Larger values produce broader, softer
   *  hotspots; smaller values surface pinpoint clusters. */
  radius?: number;
  /** Kept for API compatibility with the widget config; Google's layer has
   *  no separate blur control (radius covers it). */
  blur?: number;
  /** Max weight per cell before the heat saturates at the warmest gradient
   *  stop. Defaults to 12 which reads well for ~5k Indian-city leads. */
  maxIntensity?: number;
}

// Cool → warm: navy → cyan → green → yellow → orange → brand red. The first
// stop must be transparent so empty cells show the basemap.
const GRADIENT = [
  'rgba(30, 58, 138, 0)',
  'rgba(30, 58, 138, 0.9)',
  'rgba(34, 211, 238, 0.95)',
  'rgba(34, 197, 94, 0.95)',
  'rgba(250, 204, 21, 0.95)',
  'rgba(249, 115, 22, 0.95)',
  'rgba(208, 30, 44, 1)',
];

/**
 * Density heat map of captured lead coordinates on Google Maps
 * (visualization library). Sits inside the Lead Analytics grid as the
 * `leads_geo_heatmap` widget — same data source as LeadsGeoMap, but trades
 * individual markers for a gradient that reads at a glance.
 */
export default function LeadsGeoHeatmap({ points, radius = 28, maxIntensity = 12 }: LeadsGeoHeatmapProps) {
  const usable = useMemo(
    () => points.filter(
      (p): p is { latitude: number; longitude: number } =>
        typeof p.latitude === 'number' && typeof p.longitude === 'number' && !(p.latitude === 0 && p.longitude === 0),
    ),
    [points],
  );
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<GMaps>(null);
  const layerRef = useRef<GMaps>(null);
  const fitted = useRef(false);
  const { maps, error } = useGoogleMaps(['maps', 'visualization']);
  const theme = useDocumentTheme();

  useEffect(() => {
    if (!maps || !mapRef.current || mapInst.current || usable.length === 0) return;
    mapInst.current = new maps.Map(mapRef.current, baseMapOptions(theme, { center: { lat: INDIA_CENTRE.lat, lng: INDIA_CENTRE.lng }, zoom: 5, minZoom: 4 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, usable.length]);

  useEffect(() => { applyMapTheme(mapInst.current, theme); }, [theme]);

  useEffect(() => {
    const map = mapInst.current;
    if (!maps || !map) return;
    if (layerRef.current) { layerRef.current.setMap(null); layerRef.current = null; }
    if (usable.length === 0) return;
    layerRef.current = new maps.visualization.HeatmapLayer({
      map,
      data: usable.map((p) => new maps.LatLng(p.latitude, p.longitude)),
      radius,
      opacity: 0.85,
      maxIntensity,
      gradient: GRADIENT,
    });
    // Fit once on first paint so the user's pan/zoom survives widget refreshes.
    if (!fitted.current) {
      fitted.current = true;
      fitToPoints(maps, map, usable.map((p) => ({ lat: p.latitude, lng: p.longitude })), { padding: 40, maxZoom: 9 });
    }
  }, [maps, usable, radius, maxIntensity]);

  if (usable.length === 0 || error) {
    return (
      <div style={{ height: '100%', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13, background: 'var(--s3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
        {error || 'No leads with saved coordinates yet.'}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', minHeight: 280, position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 5,
        background: 'var(--card)', border: '1px solid var(--border)', padding: '6px 10px',
        borderRadius: 8, boxShadow: 'var(--shadow-pop)', fontSize: 11, color: 'var(--text-dim)',
        display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains)',
      }}>
        <span>LOW</span>
        <span style={{ width: 110, height: 6, borderRadius: 3, display: 'inline-block', background: 'linear-gradient(to right, #1e3a8a 0%, #22d3ee 25%, #22c55e 45%, #facc15 65%, #f97316 85%, #D01E2C 100%)' }} />
        <span>HIGH</span>
      </div>
    </div>
  );
}
