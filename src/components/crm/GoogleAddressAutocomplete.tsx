'use client';
/**
 * Google Places address autocomplete for the lead form. Type an address and
 * pick from Google's suggestions; we fill address_line1 (still editable) plus
 * city / state / postal code / lat-long. Other address lines are handled by
 * custom fields.
 *
 * The Maps JS key is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (set it in the
 * Vercel project env). With no key the component renders nothing, so the form
 * degrades gracefully to the plain address fields.
 */
import { useEffect, useRef } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let loaderPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === 'undefined' || !KEY) return Promise.reject(new Error('no-key'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`;
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

  useEffect(() => {
    if (!KEY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ac: any;
    loadMaps().then(() => {
      if (!inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
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
    }).catch(() => { /* key invalid / blocked — fall back to manual fields */ });
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
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pick a suggestion to fill the address & pin; you can still edit Address Line 1 below.</span>
    </div>
  );
}
