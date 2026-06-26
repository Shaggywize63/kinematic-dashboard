/**
 * Google Maps reverse-geocode helper.
 *
 * Standalone because the lead-create form (and any future form that
 * captures GPS) needs to fire reverse geocoding RIGHT AFTER its own
 * navigator.geolocation success, without depending on the autocomplete
 * component being mounted. The autocomplete still uses this same
 * helper internally so there's a single code path.
 *
 * Returns null when Maps SDK / Geocoding API is unreachable — the
 * caller's address field stays blank for manual entry, no toast.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let bootstrapped = false;

/** Load the dynamic Maps SDK if it hasn't been already. Idempotent. */
function bootstrapMaps() {
  if (typeof window === 'undefined' || !KEY) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.google?.maps?.importLibrary || bootstrapped) return;
  bootstrapped = true;
  /* eslint-disable */
  // @ts-ignore — official Dynamic Library Import bootstrap
  ((g:any)=>{let h:any,a:any,k:any,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b:any=window;b=b[c]||(b[c]={});let d=b.maps||(b.maps={}),r=new Set<string>(),e=new URLSearchParams(),u=()=>h||(h=new Promise(async(f:any,n:any)=>{a=m.createElement("script");e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,(t:string)=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=(m.querySelector("script[nonce]") as any)?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f:any,...n:any[])=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:KEY,v:"weekly"});
  /* eslint-enable */
}

export interface ReverseGeocodeResult {
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  if (!KEY || typeof window === 'undefined') return null;
  try {
    bootstrapMaps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const geo = await w.google?.maps?.importLibrary?.('geocoding');
    if (!geo?.Geocoder) {
      // eslint-disable-next-line no-console
      console.warn('[reverseGeocode] Geocoding library unavailable — enable "Geocoding API" for this key in Google Cloud.');
      return null;
    }
    const geocoder = new geo.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const result = results?.[0];
    if (!result) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comps: any[] = result.address_components || [];
    const get = (type: string) => comps.find((c) => (c.types || []).includes(type))?.long_name as string | undefined;
    return {
      address_line1: result.formatted_address || '',
      city: get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2'),
      state: get('administrative_area_level_1'),
      postal_code: get('postal_code'),
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[reverseGeocode] failed:', e);
    return null;
  }
}
