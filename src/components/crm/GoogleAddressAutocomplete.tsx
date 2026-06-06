'use client';
/**
 * Google Places address autocomplete for the lead form. Type an address and
 * pick from Google's suggestions; we fill address_line1 (still editable) plus
 * city / state / postal code / lat-long.
 *
 * Loads Maps via Google's official "dynamic library import" bootstrap (the
 * supported async path that reliably exposes the New Places library), then
 * prefers the new PlaceAutocompleteElement and falls back to the legacy
 * Autocomplete widget — so it works whether the project has "Places API (New)"
 * or the legacy "Places API" enabled.
 *
 * The Maps JS key is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (set it in the
 * Vercel project env, then REDEPLOY — NEXT_PUBLIC_* vars are inlined at build
 * time). With no key the component renders nothing.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Official Google Maps "Dynamic Library Import" bootstrap. Defines
// google.maps.importLibrary (loads once); subsequent importLibrary('places')
// calls pull in the New Places library on demand.
// https://developers.google.com/maps/documentation/javascript/load-maps-js-api
function bootstrapMaps(key: string) {
  /* eslint-disable */
  // @ts-nocheck
  // prettier-ignore
  // @ts-ignore
  ((g:any)=>{let h:any,a:any,k:any,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b:any=window;b=b[c]||(b[c]={});let d=b.maps||(b.maps={}),r=new Set<string>(),e=new URLSearchParams(),u=()=>h||(h=new Promise(async(f:any,n:any)=>{a=m.createElement("script");e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,(t:string)=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=(m.querySelector("script[nonce]") as any)?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f:any,...n:any[])=>r.add(f)&&u().then(()=>d[l](f,...n))})({key,v:"weekly"});
  /* eslint-enable */
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
  const hostRef = useRef<HTMLDivElement>(null);       // host for the new element
  const legacyInputRef = useRef<HTMLInputElement>(null); // input for legacy widget
  const cb = useRef(onSelect);
  cb.current = onSelect;
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'new' | 'legacy'>('new');

  useEffect(() => {
    if (!KEY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!w.google?.maps?.importLibrary) bootstrapMaps(KEY);
    // Google calls this on auth failures (bad key / referrer / billing).
    w.gm_authFailure = () => setErr('Google rejected this API key. Check the key is correct, billing is on, and this domain is in the key’s allowed HTTP referrers.');

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mounted: any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compGetter = (comps: any[]) => (type: string) => {
      const c = comps.find((x) => (x.types || []).includes(type));
      return (c?.longText ?? c?.long_name) as string | undefined;
    };

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let places: any;
      try {
        places = await w.google.maps.importLibrary('places');
      } catch (e) {
        setErr('Could not load Google Places: ' + ((e as Error)?.message || 'unknown error')
          + '. Enable “Places API (New)” for this key, ensure billing is on, and allow this domain.');
        return;
      }
      if (cancelled) return;

      // ── Preferred: Places API (New) — PlaceAutocompleteElement ──────────
      if (places?.PlaceAutocompleteElement && hostRef.current) {
        setMode('new');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let el: any;
        try {
          el = new places.PlaceAutocompleteElement({ includedRegionCodes: ['in'] });
        } catch {
          el = new places.PlaceAutocompleteElement();
        }
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

      setErr('Google Places loaded but no autocomplete widget was returned. Enable “Places API (New)” for this key in Google Cloud (and make sure the key belongs to that project).');
    })();

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
      {/* The new <gmp-place-autocomplete> renders its own input in shadow DOM;
          theme it to the dark dashboard via ::part(input) (it defaults to a
          light/black input otherwise). */}
      <style>{`
        gmp-place-autocomplete { width: 100%; }
        gmp-place-autocomplete::part(input) {
          background: var(--s3);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 13px;
          width: 100%;
          box-sizing: border-box;
        }
        gmp-place-autocomplete::part(input)::placeholder { color: var(--text-dim); }
      `}</style>
      <label style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>🔍 Search address (Google)</label>
      <div ref={hostRef} style={{ width: '100%', display: mode === 'new' ? 'block' : 'none' }} />
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
