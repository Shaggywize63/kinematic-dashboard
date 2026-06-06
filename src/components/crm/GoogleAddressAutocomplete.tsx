'use client';
/**
 * Google Places address autocomplete for the lead form. Type an address and
 * pick from Google's suggestions; we fill address_line1 (still editable) plus
 * city / state / postal code / lat-long.
 *
 * Works with BOTH Google Places offerings:
 *   - "Places API (New)" → google.maps.places.PlaceAutocompleteElement (preferred)
 *   - legacy "Places API" → google.maps.places.Autocomplete (fallback)
 * so it doesn't matter which one the project has enabled.
 *
 * The Maps JS key is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (set it in the
 * Vercel project env, then REDEPLOY — NEXT_PUBLIC_* vars are inlined at build
 * time). With no key the component renders nothing, so the form degrades
 * gracefully to the plain address fields.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let loaderPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === 'undefined' || !KEY) return Promise.reject(new Error('no-key'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
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
  // Container for the new web-component element; input ref for the legacy path.
  const hostRef = useRef<HTMLDivElement>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;
  const [err, setErr] = useState<string | null>(null);
  // Which widget we ended up mounting, so we render the right host element.
  const [mode, setMode] = useState<'new' | 'legacy'>('new');

  useEffect(() => {
    if (!KEY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gm_authFailure = () => {
      setErr('Google rejected this API key. Check the key, that Maps JavaScript API + Places API are enabled, billing is on, and this domain is in the key’s allowed referrers.');
    };
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mounted: any;

    // small helper: read an address component by type from either API shape
    // (new API: longText/types; legacy: long_name/types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compGetter = (comps: any[]) => (type: string) => {
      const c = comps.find((x) => (x.types || []).includes(type));
      return (c?.longText ?? c?.long_name) as string | undefined;
    };

    loadMaps().then(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let places: any = g?.maps?.places;
      try {
        if (g?.maps?.importLibrary) places = await g.maps.importLibrary('places');
      } catch { /* fall through to the guards below */ }
      if (cancelled) return;
      places = places || g?.maps?.places;

      // ── Preferred: Places API (New) — PlaceAutocompleteElement ──────────
      if (places?.PlaceAutocompleteElement && hostRef.current) {
        setMode('new');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el: any = new places.PlaceAutocompleteElement({ includedRegionCodes: ['in'] });
        el.style.width = '100%';
        hostRef.current.innerHTML = '';
        hostRef.current.appendChild(el);
        mounted = el;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        el.addEventListener('gmp-select', async (event: any) => {
          try {
            const place = event?.placePrediction?.toPlace?.() ?? event?.place;
            if (!place) return;
            await place.fetchFields({ fields: ['addressComponents', 'formattedAddress', 'location', 'displayName'] });
            const get = compGetter(place.addressComponents || []);
            const loc = place.location;
            const lat = loc ? (typeof loc.lat === 'function' ? loc.lat() : loc.lat) : undefined;
            const lng = loc ? (typeof loc.lng === 'function' ? loc.lng() : loc.lng) : undefined;
            cb.current({
              address_line1: place.formattedAddress || place.displayName || '',
              city: get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2'),
              state: get('administrative_area_level_1'),
              postal_code: get('postal_code'),
              latitude: typeof lat === 'number' ? lat.toFixed(6) : undefined,
              longitude: typeof lng === 'number' ? lng.toFixed(6) : undefined,
            });
          } catch { /* ignore a single bad selection */ }
        });
        return;
      }

      // ── Fallback: legacy "Places API" — Autocomplete widget ─────────────
      if (places?.Autocomplete && legacyInputRef.current) {
        setMode('legacy');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ac: any = new places.Autocomplete(legacyInputRef.current, {
          componentRestrictions: { country: 'in' },
          fields: ['address_components', 'geometry', 'formatted_address', 'name'],
        });
        mounted = ac;
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const get = compGetter(place.address_components || []);
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
        return;
      }

      setErr('Google Maps loaded but no Places autocomplete is available — enable “Places API (New)” (or the legacy “Places API”) for this key in Google Cloud.');
    }).catch((e) => {
      setErr(e?.message === 'maps-load-failed'
        ? 'Could not load Google Maps. The key may be invalid/restricted, or the network blocked maps.googleapis.com.'
        : 'Google address search is unavailable.');
    });

    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mounted?.remove) mounted.remove();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else if (mounted && (window as any).google) (window as any).google.maps.event.clearInstanceListeners(mounted);
    };
  }, []);

  if (!KEY) return null;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>🔍 Search address (Google)</label>
      {/* New PlaceAutocompleteElement mounts here; it renders its own input. */}
      <div ref={hostRef} style={{ width: '100%', display: mode === 'new' ? 'block' : 'none' }} />
      {/* Legacy Autocomplete binds to this input. */}
      <input
        ref={legacyInputRef}
        placeholder="Start typing an address — e.g. F 2587 4th Floor Ansal Esencia…"
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        style={{ display: mode === 'legacy' ? 'block' : 'none', background: 'var(--s3)', border: `1px solid ${err ? '#ef4444' : 'var(--border)'}`, color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
      />
      {err
        ? <span style={{ fontSize: 11, color: '#ef4444' }}>⚠️ {err}</span>
        : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pick a suggestion to fill the address &amp; pin; you can still edit Address Line 1 below.</span>}
    </div>
  );
}
