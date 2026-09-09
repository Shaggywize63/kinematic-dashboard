'use client';
import { useEffect, useState } from 'react';

/**
 * One Google Maps loader for the dashboard.
 *
 * Every map surface (Live Trailing, route plans, the leads geo map and heat
 * map, address autocomplete, reverse geocoding) shares this: the official
 * "Dynamic Library Import" bootstrap (no <script> tag — the CSP already
 * allows maps.googleapis.com), a `useGoogleMaps()` hook, the light / dark
 * basemap styles that match the app's surface tokens, and a few small
 * helpers so each component doesn't re-implement fit-to-bounds or symbols.
 *
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (needs "Maps JavaScript API"; the
 * heat map additionally uses the visualization library, autocomplete the
 * "Places API (New)"). No key → `useGoogleMaps` reports an error and the
 * surface renders its "not configured" placeholder instead of a map.
 */

// The JS API is typed loosely on purpose — the app doesn't ship
// @types/google.maps, and every call site already treated it as `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GMaps = any;

export const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function bootstrapMaps(key: string) {
  /* eslint-disable */
  // @ts-ignore — official Google Maps Dynamic Library Import bootstrap
  ((g:any)=>{let h:any,a:any,k:any,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b:any=window;b=b[c]||(b[c]={});let d=b.maps||(b.maps={}),r=new Set<string>(),e=new URLSearchParams(),u=()=>h||(h=new Promise(async(f:any,n:any)=>{a=m.createElement("script");e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,(t:string)=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=(m.querySelector("script[nonce]") as any)?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f:any,...n:any[])=>r.add(f)&&u().then(()=>d[l](f,...n))})({key,v:"weekly"});
  /* eslint-enable */
}

/** Resolve the `google.maps` namespace with the given libraries loaded. */
export async function loadGoogleMaps(libraries: string[] = ['maps']): Promise<GMaps> {
  if (typeof window === 'undefined') throw new Error('Google Maps needs a browser.');
  if (!GMAPS_KEY) throw new Error('Google Maps is not configured (missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).');
  const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!w.google?.maps?.importLibrary) bootstrapMaps(GMAPS_KEY);
  const libs = Array.from(new Set(['maps', ...libraries]));
  await Promise.all(libs.map((l) => w.google.maps.importLibrary(l)));
  return w.google.maps;
}

/** `{ maps, error }` — `maps` is the namespace once loaded, else null. */
export function useGoogleMaps(libraries: string[] = ['maps']): { maps: GMaps | null; error: string | null } {
  const [state, setState] = useState<{ maps: GMaps | null; error: string | null }>({ maps: null, error: null });
  const key = libraries.join(',');
  useEffect(() => {
    let alive = true;
    loadGoogleMaps(key.split(','))
      .then((m) => { if (alive) setState({ maps: m, error: null }); })
      .catch((e: unknown) => { if (alive) setState({ maps: null, error: (e as Error)?.message || 'Could not load Google Maps.' }); });
    return () => { alive = false; };
  }, [key]);
  return state;
}

// ── Theme ─────────────────────────────────────────────────────────────────
export type MapTheme = 'light' | 'dark';

export function readDocumentTheme(): MapTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Follows `<html data-theme>` so a map restyles when the user flips the theme. */
export function useDocumentTheme(): MapTheme {
  const [theme, setTheme] = useState<MapTheme>('dark');
  useEffect(() => {
    setTheme(readDocumentTheme());
    const obs = new MutationObserver(() => setTheme(readDocumentTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// Basemaps built from the app's own surface tokens: quiet, no POIs or
// transit, roads a step lighter than the ground, water a step darker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MAP_STYLES: Record<MapTheme, any[]> = {
  light: [
    { elementType: 'geometry', stylers: [{ color: '#F1F5F9' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#CBD5E1' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#0A0E1A' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E4EFE6' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E2E8F0' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E2E8F0' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#CBD5E1' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E3F0' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7A8BA0' }] },
  ],
  dark: [
    { elementType: 'geometry', stylers: [{ color: '#131B2A' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#7A8BA0' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0E1A2E' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#253650' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#C3CCDA' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14261F' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E2A3D' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A2438' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7A8BA0' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2A3A55' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#253650' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#C3CCDA' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1220' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3D5A80' }] },
  ],
};

export const MAP_GROUND: Record<MapTheme, string> = { light: '#F1F5F9', dark: '#131B2A' };

/** Marker / line colours per theme (maps can't read CSS variables). */
export const MAP_COLORS: Record<MapTheme, { red: string; info: string; ok: string; warn: string; mute: string; violet: string; stroke: string; text: string }> = {
  light: { red: '#D01E2C', info: '#0066FF', ok: '#0A8A4E', warn: '#C97A00', mute: '#94A3B8', violet: '#7C3AED', stroke: '#FFFFFF', text: '#0A0E1A' },
  dark: { red: '#E5364A', info: '#4D9DFF', ok: '#2BB673', warn: '#E0A030', mute: '#55657D', violet: '#A78BFA', stroke: '#0E1A2E', text: '#E8EDF8' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function baseMapOptions(theme: MapTheme, extra: Record<string, any> = {}) {
  return {
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    backgroundColor: MAP_GROUND[theme],
    styles: MAP_STYLES[theme],
    ...extra,
  };
}

export function applyMapTheme(map: GMaps, theme: MapTheme) {
  if (!map) return;
  map.setOptions({ styles: MAP_STYLES[theme], backgroundColor: MAP_GROUND[theme] });
}

/** A filled circle symbol for `Marker.icon`. */
export function circleSymbol(maps: GMaps, fill: string, scale = 6, stroke = '#FFFFFF') {
  return { path: maps.SymbolPath.CIRCLE, fillColor: fill, fillOpacity: 0.95, strokeColor: stroke, strokeWeight: 1.5, scale };
}

/** Fit the viewport to the points; a single point gets `singleZoom`. */
export function fitToPoints(
  maps: GMaps, map: GMaps,
  points: Array<{ lat: number; lng: number }>,
  { padding = 48, maxZoom = 12, singleZoom = 13 }: { padding?: number; maxZoom?: number; singleZoom?: number } = {},
) {
  if (!maps || !map || points.length === 0) return;
  if (points.length === 1) { map.setCenter(points[0]); map.setZoom(singleZoom); return; }
  const bounds = new maps.LatLngBounds();
  for (const p of points) bounds.extend(p);
  map.fitBounds(bounds, padding);
  // fitBounds is async — clamp the zoom once the viewport settles.
  maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** InfoWindow body — Google paints the bubble white, so the copy stays ink. */
export function infoHtml(title: string, lines: string[] = [], extraHtml = ''): string {
  return `<div style="font:13px/1.45 Inter,system-ui,sans-serif;color:#0A0E1A;min-width:160px;max-width:260px">`
    + `<div style="font-weight:600">${escapeHtml(title)}</div>`
    + lines.filter(Boolean).map((l) => `<div style="color:#64748B;font-size:12px">${escapeHtml(l)}</div>`).join('')
    + extraHtml
    + `</div>`;
}
