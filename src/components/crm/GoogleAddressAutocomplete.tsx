'use client';
/**
 * Google Places address autocomplete for the lead form. Type an address and
 * pick from Google's suggestions; we fill address_line1 (still editable) plus
 * city / state / postal code / lat-long. Other address lines are handled by
 * custom fields.
 *
 * The Maps JS key is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (set it in the
 * Vercel project env, then REDEPLOY — NEXT_PUBLIC_* vars are inlined at build
 * time). With no key the component renders nothing, so the form degrades
 * gracefully to the plain address fields. When a key IS present but Google
 * rejects it (invalid key, referrer not allowed, billing off, or the
 * Maps JavaScript / Places API not enabled) we surface the reason inline
 * instead of failing silently.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let loaderPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === 'undefined' || !KEY) return Promise.reject(new Error('no-key'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    // loading=async is required by the current Maps JS loader; without it
    // Google logs a performance warning and newer builds can misbehave.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('maps-load-failed'));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export interface PlaceResult {
  address_line1: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
}

export default function GoogleAddressAutocomplete({ onSelect }: { onSelect: (p: PlaceResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the latest callback in a ref so the loader effect runs exactly once.
  const cb = useRef(onSelect);
  cb.current = onSelect;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!KEY) return;
    // Google invokes this global on auth failures (invalid key, referrer not
    // allowed, billing disabled). It does NOT throw, so without this hook the
    // widget just silently shows no suggestions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gm_authFailure = () => {
      setErr('Google rejected this API key. Check that the key is correct, that Maps JavaScript API + Places API are enabled, billing is on, and this site’s domain is in the key’s allowed referrers.');
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ac: any;
    loadMaps().then(() => {
      if (!inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (!g?.maps?.places?.Autocomplete) {
        setErr('Google Maps loaded but the Places library is unavailable — enable the “Places API” for this key in Google Cloud.');
        return;
      }
      ac = new g.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['address_components', 'geometry', 'formatted_address', 'name'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comps: any[] = place.address_components || [];
        const get = (type: string) => comps.find((c) => c.types.includes(type))?.long_name as string | undefined;
        const loc = place.geometry?.location;
        const formatted = place.formatted_address || '';
        const name = place.name || '';
        const line1 = name && formatted && !formatted.startsWith(name) ? `${name}, ${formatted}` : (formatted || name);
        cb.current({
          address_line1: line1,
          city: get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2'),
          state: get('administrative_area_level_1'),
          postal_code: get('postal_code'),
          latitude: loc ? loc.lat().toFixed(6) : undefined,
          longitude: loc ? loc.lng().toFixed(6) : undefined,
        });
      });
    }).catch((e) => {
      setErr(e?.message === 'maps-load-failed'
        ? 'Could not load Google Maps. The key may be invalid/restricted, or the network blocked maps.googleapis.com.'
        : 'Google address search is unavailable.');
    });
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ac && (window as any).google) (window as any).google.maps.event.clearInstanceListeners(ac);
    };
  }, []);

  if (!KEY) return null;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>🔍 Search address (Google)</label>
      <input
        ref={inputRef}
        placeholder="Start typing an address — e.g. F 2587 4th Floor Ansal Esencia…"
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        style={{ background: 'var(--s3)', border: `1px solid ${err ? '#ef4444' : 'var(--border)'}`, color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
      />
      {err
        ? <span style={{ fontSize: 11, color: '#ef4444' }}>⚠️ {err}</span>
        : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pick a suggestion to fill the address &amp; pin; you can still edit Address Line 1 below.</span>}
    </div>
  );
}
