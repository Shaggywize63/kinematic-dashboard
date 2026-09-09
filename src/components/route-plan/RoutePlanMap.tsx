'use client';
import { useEffect, useRef } from 'react';
import { applyMapTheme, baseMapOptions, fitToPoints, infoHtml, MAP_COLORS, useDocumentTheme, useGoogleMaps, type GMaps } from '../../lib/googleMaps';

// Stops we can plot — a subset of the route-plan OutletStop shape.
export interface RoutePlanStop {
  id: string;
  visit_order: number;
  status?: string;
  store_name?: string;
  store_address?: string;
  store_lat?: number;
  store_lng?: number;
}

function statusColor(status: string | undefined, theme: 'light' | 'dark'): string {
  const c = MAP_COLORS[theme];
  switch ((status || 'pending').toLowerCase()) {
    case 'visited': case 'completed': return c.ok;
    case 'in_progress': return c.info;
    case 'missed': return c.red;
    default: return c.mute;
  }
}

/**
 * Google Map for a single route plan — numbered, status-coloured markers in
 * visit order, joined by a dashed route line. Follows the app theme.
 */
export default function RoutePlanMap({ stops, height = 300 }: { stops: RoutePlanStop[]; height?: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<GMaps>(null);
  const infoRef = useRef<GMaps>(null);
  const overlays = useRef<GMaps[]>([]);
  const { maps, error } = useGoogleMaps(['maps']);
  const theme = useDocumentTheme();

  useEffect(() => {
    if (!maps || !mapRef.current || mapInst.current) return;
    mapInst.current = new maps.Map(mapRef.current, baseMapOptions(theme, { center: { lat: 20.59, lng: 78.96 }, zoom: 5 }));
    infoRef.current = new maps.InfoWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);

  useEffect(() => { applyMapTheme(mapInst.current, theme); }, [theme]);

  useEffect(() => {
    const map = mapInst.current;
    if (!maps || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];

    const pts = [...stops]
      .filter((s) => typeof s.store_lat === 'number' && typeof s.store_lng === 'number')
      .sort((a, b) => a.visit_order - b.visit_order);
    if (pts.length === 0) return;

    const path: Array<{ lat: number; lng: number }> = [];
    for (const s of pts) {
      const pos = { lat: s.store_lat as number, lng: s.store_lng as number };
      path.push(pos);
      const marker = new maps.Marker({
        map, position: pos, title: s.store_name || `Stop ${s.visit_order}`,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: statusColor(s.status, theme), fillOpacity: 1, strokeColor: MAP_COLORS[theme].stroke, strokeWeight: 2 },
        label: { text: String(s.visit_order), color: '#FFFFFF', fontSize: '11px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace' },
      });
      marker.addListener('click', () => {
        infoRef.current?.setContent(infoHtml(`#${s.visit_order} ${s.store_name ?? ''}`, [s.store_address ?? '', (s.status || 'pending').replace(/_/g, ' ')]));
        infoRef.current?.open({ map, anchor: marker });
      });
      overlays.current.push(marker);
    }
    if (path.length > 1) {
      overlays.current.push(new maps.Polyline({
        map, path, strokeOpacity: 0,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: MAP_COLORS[theme].info, scale: 2.5 }, offset: '0', repeat: '12px' }],
      }));
    }
    fitToPoints(maps, map, path, { padding: 40, maxZoom: 14 });
  }, [maps, stops, theme]);

  const plottable = stops.filter((s) => typeof s.store_lat === 'number' && typeof s.store_lng === 'number').length;

  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--s3)' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {(plottable === 0 || error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12.5, padding: 16, textAlign: 'center', background: error ? 'var(--s3)' : 'transparent' }}>
          {error ? error : 'No mapped coordinates for this plan’s stops.'}
        </div>
      )}
    </div>
  );
}
