'use client';
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './googleMaps';

/**
 * Human-readable place names for GPS fixes (Live Trailing).
 *
 * The live-locations API only returns coordinates, so "where is this person
 * right now?" needs a reverse-geocode. This wraps Google's Geocoder with
 *  - a cache keyed by ~11 m cells (4 decimals), so a rep standing still, a
 *    60-second refresh, or two reps at one site cost a single lookup;
 *  - de-duplication of in-flight lookups;
 *  - a small concurrency cap, so a long list can't burst the Geocoding quota;
 *  - a short negative cache, so a key without the Geocoding API enabled doesn't
 *    retry on every render.
 * Every caller falls back to the raw lat/long when this resolves to null.
 */

export interface PlaceName {
  /** Full formatted address, plus-code prefix removed. */
  full: string;
  /** Compact "street / area, locality" label for tight spaces. */
  short: string;
}

interface GeoComponent { long_name: string; short_name?: string; types: string[] }
export interface GeoResult { formatted_address?: string; types?: string[]; address_components?: GeoComponent[] }

const PLUS_CODE_PREFIX = /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3},?\s*/;

/** Component long-name of the first of `types` that is present, in priority order. */
function component(comps: GeoComponent[], types: string[]): string | undefined {
  for (const t of types) {
    const c = comps.find((x) => (x.types || []).includes(t));
    if (c?.long_name) return c.long_name;
  }
  return undefined;
}

/**
 * Pick the most useful result and derive full + short labels. Rural fixes often
 * come back with a bare plus-code ("GQ2V+R4") as result[0]; prefer a result
 * that has a real address, and strip a leading plus-code from the text.
 */
export function pickPlace(results: GeoResult[] | null | undefined): PlaceName | null {
  if (!results?.length) return null;
  const best = results.find((r) => !(r.types || []).includes('plus_code')) ?? results[0];
  const full = (best.formatted_address || '').replace(PLUS_CODE_PREFIX, '').trim();
  const comps = best.address_components || [];

  const street = component(comps, ['premise', 'route', 'neighborhood', 'sublocality_level_3', 'sublocality_level_2']);
  const area = component(comps, ['sublocality_level_1', 'sublocality']);
  const city = component(comps, ['locality', 'administrative_area_level_2']);
  const parts: string[] = [];
  for (const p of [street, area, city]) {
    if (p && parts[parts.length - 1] !== p && !parts.includes(p)) parts.push(p);
  }
  const short = parts.join(', ') || full;
  if (!full && !short) return null;
  return { full: full || short, short: short || full };
}

/** "12.971600, 77.594600" — 6 decimals is ~0.1 m, far finer than GPS. */
export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Compact variant for lists: "12.9716, 77.5946". */
export function formatLatLngShort(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

const cellKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

const cache = new Map<string, PlaceName>();
const failedAt = new Map<string, number>();
const inflight = new Map<string, Promise<PlaceName | null>>();
const FAIL_TTL_MS = 60_000;
const CACHE_MAX = 2000;

// Tiny FIFO limiter — at most MAX_CONCURRENT geocodes in flight.
const MAX_CONCURRENT = 2;
let active = 0;
const waiting: Array<() => void> = [];
function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(() => { active++; resolve(); }));
}
function release() {
  active--;
  waiting.shift()?.();
}

const valid = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat as number) <= 90 && Math.abs(lng as number) <= 180;

/** Synchronous cache read — lets a component paint a known name immediately. */
export function peekPlaceName(lat?: number | null, lng?: number | null): PlaceName | null {
  if (!valid(lat, lng)) return null;
  return cache.get(cellKey(lat, lng as number)) ?? null;
}

export function getPlaceName(lat?: number | null, lng?: number | null): Promise<PlaceName | null> {
  if (!valid(lat, lng)) return Promise.resolve(null);
  const key = cellKey(lat, lng as number);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const failed = failedAt.get(key);
  if (failed && Date.now() - failed < FAIL_TTL_MS) return Promise.resolve(null);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    await acquire();
    try {
      const maps = await loadGoogleMaps(['geocoding']);
      const geo = await maps.importLibrary?.('geocoding');
      const Geocoder = geo?.Geocoder ?? maps.Geocoder;
      if (!Geocoder) throw new Error('Geocoding library unavailable');
      const { results } = await new Geocoder().geocode({ location: { lat, lng: lng as number } });
      const place = pickPlace(results as GeoResult[]);
      if (!place) { failedAt.set(key, Date.now()); return null; }
      if (cache.size >= CACHE_MAX) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
      }
      cache.set(key, place);
      return place;
    } catch {
      // No key, Geocoding API not enabled for it, quota, or offline — callers
      // fall back to coordinates. Remember briefly so we don't hammer.
      failedAt.set(key, Date.now());
      return null;
    } finally {
      release();
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export interface PlaceState {
  place: PlaceName | null;
  /** True until the lookup settles (success or failure). */
  loading: boolean;
}

/**
 * Resolve a place name for a fix. `enabled=false` skips the lookup (used by
 * rows that haven't scrolled into view yet).
 */
export function usePlaceName(lat?: number | null, lng?: number | null, enabled = true): PlaceState {
  const [state, setState] = useState<PlaceState>(() => {
    const hit = peekPlaceName(lat, lng);
    return { place: hit, loading: !hit && enabled && valid(lat, lng) };
  });
  useEffect(() => {
    if (!enabled || !valid(lat, lng)) { setState({ place: null, loading: false }); return; }
    const hit = peekPlaceName(lat, lng);
    if (hit) { setState({ place: hit, loading: false }); return; }
    let alive = true;
    setState((s) => ({ place: s.place, loading: true }));
    getPlaceName(lat, lng).then((place) => { if (alive) setState({ place, loading: false }); });
    return () => { alive = false; };
  }, [lat, lng, enabled]);
  return state;
}

/** True once the element has been on screen at least once. */
export function useSeen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref as React.RefObject<T>, seen];
}
