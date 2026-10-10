'use client';
/**
 * The day's route on a Google map — the same map approach as Live Trailing (one google.maps.Map, the route as a
 * glow + main Polyline, the dashboard's own light / dark basemap) with the stops of the day on it:
 * visits and halts as NUMBERED markers (the numbers match the timeline), check-in and check-out as plain dots.
 *
 * The map never blocks the report: with no key, no network or no route it says so in its own box and the timeline
 * below is unaffected.
 */
import { useEffect, useRef } from 'react';
import {
  applyMapTheme, baseMapOptions, circleSymbol, fitToPoints, infoHtml, MAP_COLORS, useDocumentTheme, useGoogleMaps, type GMaps,
} from '../../lib/googleMaps';
import { formatLatLngShort, peekPlaceName } from '../../lib/placeName';
import { T } from '../ui';
import type { LatLng } from '../../lib/travelReport';

export interface RouteMarker {
  /** The timeline number. */
  n: number;
  kind: 'visit' | 'halt';
  at: LatLng;
  title: string;
  lines: string[];
}

export interface RouteMapProps {
  path: LatLng[];
  markers: RouteMarker[];
  start: LatLng | null;
  end: LatLng | null;
  height?: number;
}

export default function RouteMap({ path, markers, start, end, height = 360 }: RouteMapProps) {
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
    infoRef.current?.close();
    const c = MAP_COLORS[theme];

    // The route: a soft wide line under a crisp one, like the Live Trailing trail.
    if (path.length >= 2) {
      overlays.current.push(
        new maps.Polyline({ map, path, strokeColor: c.red, strokeOpacity: 0.18, strokeWeight: 8, zIndex: 5 }),
        new maps.Polyline({ map, path, strokeColor: c.red, strokeOpacity: 0.95, strokeWeight: 4, zIndex: 6 }),
      );
    }

    const dot = (at: LatLng, title: string, fill: string) => {
      overlays.current.push(new maps.Marker({ map, position: at, title, icon: circleSymbol(maps, fill, 6, c.stroke), zIndex: 7 }));
    };
    if (start) dot(start, 'Check-in', c.ok);
    if (end) dot(end, 'Check-out', c.mute);

    // Numbered stops: blue = customer visit, amber = halt.
    for (const m of markers) {
      const marker = new maps.Marker({
        map, position: m.at, title: m.title, zIndex: 10 + m.n,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: m.kind === 'visit' ? c.info : c.warn, fillOpacity: 1, strokeColor: c.stroke, strokeWeight: 2 },
        label: { text: String(m.n), color: '#FFFFFF', fontSize: '11px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace' },
      });
      marker.addListener('click', () => {
        // Same cache the timeline fills: the place name appears here too once it is known.
        const place = peekPlaceName(m.at.lat, m.at.lng);
        infoRef.current?.setContent(infoHtml(m.title, [...m.lines, place ? place.short : formatLatLngShort(m.at.lat, m.at.lng)]));
        infoRef.current?.open({ map, anchor: marker });
      });
      overlays.current.push(marker);
    }

    fitToPoints(maps, map, [...path, ...markers.map((m) => m.at), ...(start ? [start] : []), ...(end ? [end] : [])], { padding: 40, maxZoom: 16 });
  }, [maps, path, markers, start, end, theme]);

  const nothing = path.length < 2 && markers.length === 0 && !start && !end;
  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.raised }} data-testid="route-map">
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {(nothing || error) && (
        <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 12.5, padding: 16, textAlign: 'center', background: error ? T.raised : 'transparent' }}>
          {error ? `Map unavailable: ${error}` : 'No GPS route or mapped stops for this day.'}
        </div>
      )}
    </div>
  );
}
