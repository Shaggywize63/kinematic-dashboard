'use client';
import { useEffect, useRef, useState } from 'react';

// Module-level cache so we don't re-fetch the same trail on every
// 60-second polling tick. Keyed by a cheap signature (length + first +
// last point) so additional pings invalidate the cache automatically.
const cache = new Map<string, [number, number][]>();

/**
 * Hit the free OSRM public demo and ask for a road-snapped route
 * through the given lat/lng points. Returns coordinates ready for
 * Leaflet (`[lat, lng]`).
 *
 * OSRM expects `lng,lat` semicolon-separated. The `overview=full` flag
 * returns the full geometry (every road vertex, not just turn-by-turn);
 * `geometries=geojson` formats it as `[ [lng,lat], ... ]`.
 */
async function fetchOsrmRoute(points: [number, number][]): Promise<[number, number][]> {
  if (points.length < 2) return points;
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const j: any = await r.json();
  const geom = j?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
  if (!Array.isArray(geom) || geom.length === 0) throw new Error('OSRM: no route geometry');
  return geom.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/**
 * Chunked router. OSRM's public demo gets unhappy past ~25 waypoints,
 * so we split larger trails into overlapping batches (last point of
 * each chunk = first point of the next) and stitch the results back
 * together.
 */
async function fetchChunked(points: [number, number][], chunkSize = 25): Promise<[number, number][]> {
  if (points.length <= chunkSize) return fetchOsrmRoute(points);
  const merged: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, points.length);
    const chunk = points.slice(i, end);
    let routed: [number, number][];
    try {
      routed = await fetchOsrmRoute(chunk);
    } catch {
      // If a chunk fails, fall back to the raw points for that segment
      // so the rest of the trail still routes cleanly.
      routed = chunk;
    }
    if (merged.length > 0 && routed.length > 0) routed.shift(); // dedup the overlap
    merged.push(...routed);
    if (end === points.length) break;
  }
  return merged;
}

interface Result {
  /** Coordinates to draw on Leaflet. While routing is in flight (or if it
   * fails), this is the raw straight-line array so the user always sees
   * a trail — just without road-snap until OSRM returns. */
  coords: [number, number][] | null;
  /** True once OSRM has returned a road-snapped path. False while loading
   * or after a fallback. Drives the dashed/solid styling on the map. */
  routed: boolean;
  loading: boolean;
}

/**
 * React hook that road-snaps an FE's GPS pings through OSRM.
 * Returns the routed polyline points + flags for loading / fallback state.
 *
 * Usage:
 *   const trailPoints = useMemo(() => trail.map(p => [p.lat, p.lng]), [trail]);
 *   const { coords, routed } = useOsrmTrail(trailPoints);
 *   L.polyline(coords, { dashArray: routed ? undefined : '4 6' });
 */
export default function useOsrmTrail(points: [number, number][] | null): Result {
  const [coords, setCoords] = useState<[number, number][] | null>(null);
  const [routed, setRouted] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastSig = useRef<string>('');

  useEffect(() => {
    if (!points || points.length < 2) {
      setCoords(null);
      setRouted(false);
      setLoading(false);
      return;
    }

    // Signature — length + first + last point. Catches "new ping added"
    // without rebuilding the full coord array.
    const first = points[0];
    const last = points[points.length - 1];
    const sig = `${points.length}|${first[0].toFixed(5)},${first[1].toFixed(5)}|${last[0].toFixed(5)},${last[1].toFixed(5)}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    const hit = cache.get(sig);
    if (hit) {
      setCoords(hit);
      setRouted(true);
      setLoading(false);
      return;
    }

    // Show the raw straight-line path immediately so the user gets feedback
    // while we wait on OSRM. Switches to routed once the response lands.
    setCoords(points);
    setRouted(false);
    setLoading(true);

    let cancelled = false;
    fetchChunked(points)
      .then((r) => {
        if (cancelled) return;
        cache.set(sig, r);
        setCoords(r);
        setRouted(true);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[osrm-trail] routing failed, falling back to straight line', e);
        if (!cancelled) {
          setCoords(points);
          setRouted(false);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [points]);

  return { coords, routed, loading };
}
