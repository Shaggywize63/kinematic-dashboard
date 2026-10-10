'use client';
/**
 * A place name for a point on the Daily Travel Report, from the same reverse-geocode helper the Live Trailing page
 * uses (src/lib/placeName.ts: cached per ~11 m cell, in-flight lookups shared, at most two at a time).
 *
 * It NEVER blocks the row: the coordinates are on screen immediately and are swapped for the name when (if) the
 * lookup answers. A lookup starts only once the row has scrolled into view — or when `eager` is set, which the
 * print / CSV buttons do so every row is named in the output.
 */
import { formatLatLngShort, getPlaceName, peekPlaceName, usePlaceName, useSeen } from '../../lib/placeName';
import { T } from '../ui';
import type { LatLng } from '../../lib/travelReport';

export default function PlaceText({ at, eager, label }: { at: LatLng | null; eager: boolean; label?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const { place } = usePlaceName(at?.lat, at?.lng, seen || eager);
  if (!at) return <span style={{ color: T.mute }}>—</span>;
  // When `eager` flips on, read the cache in the same render instead of waiting for the hook's effect to land.
  const name = place ?? (eager ? peekPlaceName(at.lat, at.lng) : null);
  return (
    <span ref={ref} data-testid="place" style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, minWidth: 0 }} title={name?.full}>
      <span style={{ color: T.text, overflowWrap: 'anywhere' }}>
        {label && <span style={{ color: T.mute }}>{label} </span>}
        {name ? name.short : formatLatLngShort(at.lat, at.lng)}
      </span>
      {name && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{formatLatLngShort(at.lat, at.lng)}</span>}
    </span>
  );
}

/**
 * Looks up every given point (shared cache, so repeats are free) and resolves when they are all answered or after
 * `timeoutMs`, whichever comes first — a slow or unavailable geocoder delays an export by seconds, never forever.
 */
export async function resolvePlaces(points: LatLng[], timeoutMs = 6000): Promise<void> {
  if (points.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  try {
    await Promise.race([Promise.all(points.map((p) => getPlaceName(p.lat, p.lng))).then(() => undefined), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The name known for a point right now ("" if none yet) — what the CSV carries. */
export function knownPlaceName(p: LatLng): string {
  return peekPlaceName(p.lat, p.lng)?.short ?? '';
}
