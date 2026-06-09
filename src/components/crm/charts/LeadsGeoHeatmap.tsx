'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
// leaflet.heat is a vanilla Leaflet plugin (registers L.heatLayer on the
// global L). Imported for side effects only; the typings are loose so we
// declare the heatLayer signature inline below.
import 'leaflet.heat';
import { INDIA_CENTRE } from '../../../lib/indiaStates';

declare module 'leaflet' {
  function heatLayer(
    points: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    },
  ): L.Layer;
}

/** A single lat/lng row from /api/v1/crm/leads/geo. Only the coords are
 *  used by the heatmap; the rest of the geo payload (status, score…) is
 *  ignored so the layer stays cheap to redraw on widget resize. */
export interface HeatPoint {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

interface LeadsGeoHeatmapProps {
  points: HeatPoint[];
  /** Pixel radius of each heat blob at the current zoom level. Larger
   *  values produce broader, softer hotspots; smaller values surface
   *  pinpoint clusters. */
  radius?: number;
  blur?: number;
  /** Max points per cell before the heat saturates at the warmest
   *  gradient stop. Tune this to whatever "intense" means for the
   *  tenant — defaults to 12 which works well for ~5k Indian-city leads. */
  maxIntensity?: number;
}

/**
 * Density heatmap of captured lead coordinates. Wraps the standard
 * Kinematic map shell (Carto Voyager tiles, INDIA centre fallback) plus a
 * leaflet.heat layer that's rebuilt whenever the point set or sizing
 * controls change. Sits inside the Lead Analytics grid as the
 * `leads_geo_heatmap` widget — same data source as LeadsGeoMap, but
 * trades individual markers for a gradient that reads at a glance.
 */
export default function LeadsGeoHeatmap({
  points,
  radius = 28,
  blur = 22,
  maxIntensity = 12,
}: LeadsGeoHeatmapProps) {
  // Filter to rows with usable coords once, up-front. The heat plugin
  // skips invalid points, but pre-filtering also lets us decide whether
  // the empty-state placeholder applies before mounting the map.
  const usable = useMemo(
    () => points.filter(
      (p): p is { latitude: number; longitude: number } =>
        typeof p.latitude === 'number' &&
        typeof p.longitude === 'number' &&
        !(p.latitude === 0 && p.longitude === 0),
    ),
    [points],
  );

  if (usable.length === 0) {
    return (
      <div style={{
        height: '100%', minHeight: 280, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary, #6b7280)', fontSize: 13,
        background: 'var(--surface-1, #f3f4f6)', borderRadius: 12,
      }}>
        No leads with saved coordinates yet.
      </div>
    );
  }

  return (
    <div style={{ height: '100%', minHeight: 280, position: 'relative' }}>
      <MapContainer
        center={INDIA_CENTRE}
        zoom={5}
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
        scrollWheelZoom
        attributionControl={false}
      >
        <TileLayer
          // Carto Voyager — same base layer the LeadsGeoMap uses so the
          // two views feel like one product. The light tone keeps the
          // heatmap gradient legible without competing with the map.
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
        />
        <HeatLayer points={usable} radius={radius} blur={blur} maxIntensity={maxIntensity} />
        <FitToPoints points={usable} />
      </MapContainer>
      <Legend />
    </div>
  );
}

/**
 * Drops the leaflet.heat overlay onto the parent <MapContainer>. Lives
 * as its own component so the heat layer is added once on mount, rebuilt
 * only when its inputs change, and torn down cleanly on unmount —
 * preventing the duplicate-layer bug you get if you push L.heatLayer()
 * inside MapContainer's children block directly.
 */
function HeatLayer({
  points, radius, blur, maxIntensity,
}: { points: Array<{ latitude: number; longitude: number }>; radius: number; blur: number; maxIntensity: number }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Each point carries an intensity weight of 1 — the heat plugin
    // sums weights per cell, so denser clusters automatically read as
    // warmer. maxIntensity is the saturation cap on that sum.
    const heatPoints = points.map(p => [p.latitude, p.longitude, 1] as [number, number, number]);
    const layer = L.heatLayer(heatPoints, {
      radius,
      blur,
      maxZoom: 12,
      max: maxIntensity,
      minOpacity: 0.35,
      // Cool → warm gradient: navy → cyan → green → yellow → orange → red.
      // Reads like a typical thermal/density chart with brand red at the
      // top, so the warmest spots match Kinematic's primary accent.
      gradient: {
        0.0: '#1e3a8a',
        0.25: '#22d3ee',
        0.45: '#22c55e',
        0.65: '#facc15',
        0.85: '#f97316',
        1.0: '#dc2626',
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, radius, blur, maxIntensity]);

  return null;
}

/** Auto-fit the map to the bounding box of the heat points the first
 *  time the layer mounts. Skipped on re-renders so the user's zoom /
 *  pan state isn't reset whenever the widget refreshes. */
function FitToPoints({ points }: { points: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || points.length === 0) return;
    const bounds = L.latLngBounds(points.map(p => [p.latitude, p.longitude] as [number, number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
      fittedRef.current = true;
    }
  }, [map, points]);

  return null;
}

/** Tiny gradient legend sitting in the bottom-left corner of the widget
 *  so users can read the colour ramp without having to consult docs. */
function Legend() {
  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 10, zIndex: 500,
      background: 'rgba(255,255,255,0.92)', padding: '6px 10px',
      borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      fontSize: 11, color: '#374151', display: 'flex',
      alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontWeight: 600 }}>Low</span>
      <span style={{
        width: 120, height: 8, borderRadius: 4, display: 'inline-block',
        background: 'linear-gradient(to right, #1e3a8a 0%, #22d3ee 25%, #22c55e 45%, #facc15 65%, #f97316 85%, #dc2626 100%)',
      }} />
      <span style={{ fontWeight: 600 }}>High</span>
    </div>
  );
}
