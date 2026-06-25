'use client';
/**
 * Google Places address autocomplete for the lead form.
 *
 * Uses the New Places API *programmatically* (AutocompleteSuggestion) and
 * renders our OWN input + dropdown, so it matches the form's theme exactly
 * (the <gmp-place-autocomplete> web component renders an un-themeable dark
 * box). Type an address, pick a suggestion → fills address_line1 + city /
 * state / postal code / lat-long.
 *
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Vercel env, then REDEPLOY). Needs
 * "Places API (New)" + "Maps JavaScript API" enabled, and this domain in the
 * key's HTTP-referrer allowlist. No key → renders nothing.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Official Google Maps "Dynamic Library Import" bootstrap (defines
// google.maps.importLibrary). Loads once.
function bootstrapMaps(key: string) {
  /* eslint-disable */
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
  const [query, setQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenRef = useRef<any>(null);
  // Browser-geo bias for the New Places API. We capture the rep's
  // current latitude/longitude once on mount and feed it as
  // `locationBias` so suggestions surface the *nearest* outlets/
  // colonies first instead of the alphabetic top-of-India list. Reps
  // who decline the permission still get useful results (the bias is
  // optional — autocomplete just falls back to country-only ranking).
  const biasRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!KEY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!w.google?.maps?.importLibrary) bootstrapMaps(KEY);
    w.gm_authFailure = () => setErr('Google rejected this API key. Check the key, billing, and the domain’s referrer allowlist.');
    (async () => {
      try {
        const places = await w.google.maps.importLibrary('places');
        placesRef.current = places;
        if (!places?.AutocompleteSuggestion) {
          setErr('Enable “Places API (New)” for this key in Google Cloud (programmatic autocomplete needs it).');
        }
      } catch (e) {
        setErr('Could not load Google Places: ' + ((e as Error)?.message || 'unknown error') + '.');
      }
    })();

    // Best-effort browser geolocation for the nearest-first bias AND
    // for the one-shot reverse geocode below. The user is asked only
    // once (browser caches the prompt); we cache the fix for the
    // lifetime of the component.
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          biasRef.current = { lat, lng };
          // Reverse geocode the fix and auto-populate the address
          // fields. Reps repeatedly asked for the form to "fill
          // itself" when they're standing at the lead's site — the
          // typed autocomplete still works for cases where the GPS
          // dropped them at the wrong gate / building. Best-effort:
          // a Geocoder failure just leaves the form blank for manual
          // entry, no toast or banner.
          void autoFillFromCoords(lat, lng);
        },
        () => { /* permission denied / timeout — fall through to no bias */ },
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 4_000 },
      );
    }
  }, []);

  /**
   * One-shot reverse geocode → fires onSelect with the resolved
   * address. Only the FIRST run matters; subsequent runs are no-ops
   * so a re-render doesn't overwrite a coord the rep manually picked
   * from the autocomplete dropdown afterwards.
   */
  const autoFilledRef = useRef(false);
  const autoFillFromCoords = async (lat: number, lng: number) => {
    if (autoFilledRef.current) return;
    autoFilledRef.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      // The Geocoding library is part of the core Maps SDK — same
      // bootstrap as Places, just a different importLibrary slug.
      const geo = await w.google?.maps?.importLibrary?.('geocoding');
      if (!geo?.Geocoder) return;
      const geocoder = new geo.Geocoder();
      const { results } = await geocoder.geocode({ location: { lat, lng } });
      const result = results?.[0];
      if (!result) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comps: any[] = result.address_components || [];
      const get = (type: string) => comps.find((c) => (c.types || []).includes(type))?.long_name as string | undefined;
      onSelect({
        address_line1: result.formatted_address || '',
        city: get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2'),
        state: get('administrative_area_level_1'),
        postal_code: get('postal_code'),
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      });
    } catch {
      /* silent — manual typing still works */
    }
  };

  // Debounced suggestion fetch.
  useEffect(() => {
    const q = query.trim();
    const places = placesRef.current;
    if (q.length < 3 || !places?.AutocompleteSuggestion) { setSuggestions([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        if (!tokenRef.current && places.AutocompleteSessionToken) tokenRef.current = new places.AutocompleteSessionToken();
        // Build the request. `locationBias` is the Google-recommended
        // way to tell the New Places API "rank by proximity to this
        // point" — we feed a ~50 km circle around the rep's current
        // GPS fix so colonies/branches near their site jump to the
        // top of the list. Falls back to country-only ranking when
        // we couldn't get a fix.
        const bias = biasRef.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req: any = {
          input: q,
          includedRegionCodes: ['in'],
          sessionToken: tokenRef.current ?? undefined,
        };
        if (bias) {
          req.locationBias = {
            circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50_000 },
          };
        }
        const resp = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        if (active) { setSuggestions(resp?.suggestions ?? []); setOpen(true); }
      } catch {
        if (active) setSuggestions([]);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pick = async (s: any) => {
    try {
      const pred = s.placePrediction;
      if (!pred) return;
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress', 'location', 'displayName'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comps: any[] = place.addressComponents || [];
      const get = (type: string) => comps.find((c) => (c.types || []).includes(type))?.longText as string | undefined;
      const loc = place.location;
      const lat = loc ? (typeof loc.lat === 'function' ? loc.lat() : loc.lat) : undefined;
      const lng = loc ? (typeof loc.lng === 'function' ? loc.lng() : loc.lng) : undefined;
      onSelect({
        address_line1: place.formattedAddress || place.displayName || (pred.text?.text ?? ''),
        city: get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2'),
        state: get('administrative_area_level_1'),
        postal_code: get('postal_code'),
        latitude: typeof lat === 'number' ? lat.toFixed(6) : undefined,
        longitude: typeof lng === 'number' ? lng.toFixed(6) : undefined,
      });
      tokenRef.current = null; // end the billing session
      setQuery('');
      setSuggestions([]);
      setOpen(false);
    } catch { /* ignore a single bad selection */ }
  };

  if (!KEY) return null;

  return (
    <div style={{ gridColumn: '1 / -1', position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>🔍 Search address (Google)</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        placeholder="Start typing an address — e.g. F 2587 4th Floor Ansal Esencia…"
        style={{ background: 'var(--s3)', border: `1px solid ${err ? '#ef4444' : 'var(--border)'}`, color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 260, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          {suggestions.map((s, i) => {
            const text = s.placePrediction?.text?.text || '';
            if (!text) return null;
            return (
              <div
                key={i}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--s3)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                📍 {text}
              </div>
            );
          })}
        </div>
      )}
      {err
        ? <span style={{ fontSize: 11, color: '#ef4444' }}>⚠️ {err}</span>
        : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pick a suggestion to fill the address &amp; pin; you can still edit Address Line 1 below.</span>}
    </div>
  );
}
