'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';

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

const STATUS_COLOR: Record<string, string> = {
  visited: '#28B463', completed: '#28B463', in_progress: '#3E9EFF',
  pending: '#94a3b8', missed: '#E01E2C',
};

/**
 * Lightweight Leaflet map for a single route plan — numbered, status-coloured
 * markers in visit order, joined by a route polyline. Loads Leaflet from the
 * bundled npm package (the app CSP blocks CDN script-src).
 */
export default function RoutePlanMap({ stops, height = 300 }: { stops: RoutePlanStop[]; height?: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const layer = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Bundled Leaflet (not CDN — CSP-safe).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).L) { setReady(true); return; }
    let cancelled = false;
    import('leaflet')
      .then((mod) => { if (cancelled) return; (window as any).L = (mod as any).default ?? mod; setReady(true); })
      .catch(() => { /* leave placeholder */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInst.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([20.59, 78.96], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    mapInst.current = map;
    setTimeout(() => map.invalidateSize(), 200);
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapInst.current) return;
    const L = (window as any).L;
    if (!L) return;
    if (layer.current) { layer.current.remove(); layer.current = null; }

    const pts = [...stops]
      .filter((s) => typeof s.store_lat === 'number' && typeof s.store_lng === 'number')
      .sort((a, b) => a.visit_order - b.visit_order);
    if (pts.length === 0) return;

    const group: any[] = [];
    const line: [number, number][] = [];
    pts.forEach((s) => {
      const color = STATUS_COLOR[(s.status || 'pending').toLowerCase()] ?? '#94a3b8';
      const html = `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #0b0d12;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.6)">${s.visit_order}</div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
      const m = L.marker([s.store_lat as number, s.store_lng as number], { icon })
        .bindPopup(`<div style="font:600 12px system-ui">#${s.visit_order} ${s.store_name ?? ''}<br/><span style="color:#888;font-weight:400">${s.store_address ?? ''}</span></div>`);
      group.push(m);
      line.push([s.store_lat as number, s.store_lng as number]);
    });
    if (line.length > 1) {
      group.push(L.polyline(line, { color: '#3E9EFF', weight: 3, opacity: 0.8, dashArray: '6 6' }));
    }
    layer.current = L.featureGroup(group).addTo(mapInst.current);
    mapInst.current.fitBounds(layer.current.getBounds().pad(0.2));
  }, [ready, stops]);

  const plottable = stops.filter((s) => typeof s.store_lat === 'number' && typeof s.store_lng === 'number').length;

  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--s3)' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {plottable === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          No mapped coordinates for this plan&apos;s stops.
        </div>
      )}
    </div>
  );
}
