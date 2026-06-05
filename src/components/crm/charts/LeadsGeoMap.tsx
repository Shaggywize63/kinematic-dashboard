'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { INDIA_STATES, INDIA_CENTRE } from '../../../lib/indiaStates';
import { breakdownFactors } from '../../../lib/crm/scoreFactors';

// City catalog — coords + state for ~120 Indian cities. Each entry is
// `[lat, lng, state]`. The state is used to derive a sensible
// state-level fallback when the lead row has no `state` set (which
// happens via integrations + the bulk import path) so the lead still
// appears in the state aggregation at low zooms.
//
// Keep adding cities here as new beat geographies show up. The list is
// roughly: every state capital + major commercial city + all the
// district HQs we've already seeded in crm_cities for active clients.
const CITY_TABLE: Array<readonly [string, number, number, string]> = [
  // Metros + state capitals
  ['Ahmedabad', 23.03, 72.58, 'Gujarat'],
  ['Bengaluru', 12.97, 77.59, 'Karnataka'],
  ['Bhopal',    23.26, 77.41, 'Madhya Pradesh'],
  ['Bhubaneswar', 20.30, 85.82, 'Odisha'],
  ['Chandigarh', 30.73, 76.78, 'Chandigarh'],
  ['Chennai',   13.08, 80.27, 'Tamil Nadu'],
  ['Coimbatore', 11.02, 76.96, 'Tamil Nadu'],
  ['Delhi',     28.61, 77.21, 'Delhi'],
  ['New Delhi', 28.61, 77.21, 'Delhi'],
  ['Gurugram',  28.46, 77.03, 'Haryana'],
  ['Gurgaon',   28.46, 77.03, 'Haryana'],
  ['Guwahati',  26.14, 91.74, 'Assam'],
  ['Hyderabad', 17.39, 78.49, 'Telangana'],
  ['Indore',    22.72, 75.86, 'Madhya Pradesh'],
  ['Jaipur',    26.92, 75.79, 'Rajasthan'],
  ['Kanpur',    26.45, 80.33, 'Uttar Pradesh'],
  ['Kolkata',   22.57, 88.36, 'West Bengal'],
  ['Kochi',      9.93, 76.27, 'Kerala'],
  ['Lucknow',   26.85, 80.95, 'Uttar Pradesh'],
  ['Ludhiana',  30.90, 75.85, 'Punjab'],
  ['Mumbai',    19.08, 72.88, 'Maharashtra'],
  ['Mysuru',    12.30, 76.64, 'Karnataka'],
  ['Nagpur',    21.15, 79.09, 'Maharashtra'],
  ['Noida',     28.54, 77.39, 'Uttar Pradesh'],
  ['Panaji',    15.49, 73.83, 'Goa'],
  ['Patna',     25.59, 85.14, 'Bihar'],
  ['Pune',      18.52, 73.86, 'Maharashtra'],
  ['Raipur',    21.25, 81.63, 'Chhattisgarh'],
  ['Ranchi',    23.34, 85.32, 'Jharkhand'],
  ['Surat',     21.17, 72.83, 'Gujarat'],
  ['Thiruvananthapuram', 8.52, 76.94, 'Kerala'],
  ['Trivandrum', 8.52, 76.94, 'Kerala'],
  ['Vadodara',  22.31, 73.18, 'Gujarat'],
  ['Varanasi',  25.32, 82.97, 'Uttar Pradesh'],
  ['Visakhapatnam', 17.69, 83.22, 'Andhra Pradesh'],
  ['Vizag',     17.69, 83.22, 'Andhra Pradesh'],
  // Jharkhand district HQs — Tata Tiscon's full beat. Without these
  // the Deoghar / Dhanbad / etc. leads showed up as "unmapped" and
  // never landed on the map.
  ['Bokaro',    23.67, 86.15, 'Jharkhand'],
  ['Bokaro Steel City', 23.67, 86.15, 'Jharkhand'],
  ['Deoghar',   24.48, 86.69, 'Jharkhand'],
  ['Dhanbad',   23.79, 86.43, 'Jharkhand'],
  ['Dumka',     24.27, 87.25, 'Jharkhand'],
  ['Giridih',   24.18, 86.30, 'Jharkhand'],
  ['Godda',     24.83, 87.21, 'Jharkhand'],
  ['Hazaribagh', 23.99, 85.36, 'Jharkhand'],
  ['Jamshedpur', 22.80, 86.20, 'Jharkhand'],
  ['Jamtara',   23.96, 86.80, 'Jharkhand'],
  ['Madhupur',  24.27, 86.65, 'Jharkhand'],
  ['Mihijam',   23.92, 86.91, 'Jharkhand'],
  ['Pakur',     24.63, 87.85, 'Jharkhand'],
  ['Sahibganj', 25.24, 87.64, 'Jharkhand'],
  // Misc commercial centres we see most often
  ['Faridabad', 28.41, 77.31, 'Haryana'],
  ['Ghaziabad', 28.67, 77.45, 'Uttar Pradesh'],
  ['Greater Noida', 28.47, 77.50, 'Uttar Pradesh'],
  ['Agra',      27.18, 78.01, 'Uttar Pradesh'],
  ['Allahabad', 25.44, 81.85, 'Uttar Pradesh'],
  ['Prayagraj', 25.44, 81.85, 'Uttar Pradesh'],
  ['Meerut',    28.98, 77.71, 'Uttar Pradesh'],
  ['Aligarh',   27.88, 78.08, 'Uttar Pradesh'],
  ['Bareilly',  28.37, 79.43, 'Uttar Pradesh'],
  ['Gorakhpur', 26.76, 83.37, 'Uttar Pradesh'],
  ['Jodhpur',   26.24, 73.02, 'Rajasthan'],
  ['Udaipur',   24.58, 73.71, 'Rajasthan'],
  ['Ajmer',     26.45, 74.64, 'Rajasthan'],
  ['Kota',      25.21, 75.86, 'Rajasthan'],
  ['Bikaner',   28.02, 73.31, 'Rajasthan'],
  ['Amritsar',  31.63, 74.87, 'Punjab'],
  ['Jalandhar', 31.33, 75.58, 'Punjab'],
  ['Mohali',    30.71, 76.72, 'Punjab'],
  ['Patiala',   30.34, 76.39, 'Punjab'],
  ['Karnal',    29.69, 76.99, 'Haryana'],
  ['Panipat',   29.39, 76.96, 'Haryana'],
  ['Hisar',     29.16, 75.72, 'Haryana'],
  ['Ambala',    30.38, 76.78, 'Haryana'],
  ['Sonipat',   28.99, 77.02, 'Haryana'],
  ['Rohtak',    28.90, 76.61, 'Haryana'],
  ['Thane',     19.22, 72.97, 'Maharashtra'],
  ['Navi Mumbai', 19.03, 73.03, 'Maharashtra'],
  ['Nashik',    20.00, 73.78, 'Maharashtra'],
  ['Aurangabad', 19.88, 75.34, 'Maharashtra'],
  ['Solapur',   17.66, 75.91, 'Maharashtra'],
  ['Kolhapur',  16.71, 74.24, 'Maharashtra'],
  ['Ahmednagar', 19.10, 74.75, 'Maharashtra'],
  ['Mangaluru', 12.91, 74.86, 'Karnataka'],
  ['Mangalore', 12.91, 74.86, 'Karnataka'],
  ['Hubballi',  15.36, 75.12, 'Karnataka'],
  ['Belagavi',  15.85, 74.50, 'Karnataka'],
  ['Madurai',    9.93, 78.12, 'Tamil Nadu'],
  ['Tiruchirappalli', 10.79, 78.70, 'Tamil Nadu'],
  ['Salem',     11.66, 78.15, 'Tamil Nadu'],
  ['Tirunelveli', 8.71, 77.76, 'Tamil Nadu'],
  ['Vellore',   12.92, 79.13, 'Tamil Nadu'],
  ['Erode',     11.34, 77.72, 'Tamil Nadu'],
  ['Tiruppur',  11.11, 77.34, 'Tamil Nadu'],
  ['Vijayawada', 16.51, 80.65, 'Andhra Pradesh'],
  ['Guntur',    16.31, 80.43, 'Andhra Pradesh'],
  ['Tirupati',  13.63, 79.42, 'Andhra Pradesh'],
  ['Warangal',  17.97, 79.59, 'Telangana'],
  ['Bhilai',    21.21, 81.43, 'Chhattisgarh'],
  ['Bilaspur',  22.08, 82.16, 'Chhattisgarh'],
  ['Jabalpur',  23.18, 79.95, 'Madhya Pradesh'],
  ['Gwalior',   26.22, 78.18, 'Madhya Pradesh'],
  ['Ujjain',    23.18, 75.78, 'Madhya Pradesh'],
  ['Ratlam',    23.33, 75.04, 'Madhya Pradesh'],
  ['Cuttack',   20.46, 85.88, 'Odisha'],
  ['Rourkela',  22.26, 84.85, 'Odisha'],
  ['Sambalpur', 21.46, 83.97, 'Odisha'],
  ['Berhampur', 19.32, 84.79, 'Odisha'],
  ['Dehradun',  30.32, 78.03, 'Uttarakhand'],
  ['Haridwar',  29.95, 78.16, 'Uttarakhand'],
  ['Roorkee',   29.86, 77.89, 'Uttarakhand'],
  ['Shimla',    31.10, 77.17, 'Himachal Pradesh'],
  ['Dharamshala', 32.22, 76.32, 'Himachal Pradesh'],
  ['Jammu',     32.73, 74.86, 'Jammu and Kashmir'],
  ['Srinagar',  34.08, 74.79, 'Jammu and Kashmir'],
  ['Leh',       34.16, 77.58, 'Ladakh'],
  ['Imphal',    24.81, 93.94, 'Manipur'],
  ['Shillong',  25.58, 91.89, 'Meghalaya'],
  ['Aizawl',    23.73, 92.72, 'Mizoram'],
  ['Kohima',    25.67, 94.11, 'Nagaland'],
  ['Itanagar',  27.10, 93.62, 'Arunachal Pradesh'],
  ['Agartala',  23.83, 91.28, 'Tripura'],
  ['Gangtok',   27.33, 88.61, 'Sikkim'],
  ['Dibrugarh', 27.48, 94.91, 'Assam'],
  ['Silchar',   24.83, 92.78, 'Assam'],
  ['Siliguri',  26.71, 88.43, 'West Bengal'],
  ['Durgapur',  23.55, 87.32, 'West Bengal'],
  ['Asansol',   23.68, 86.99, 'West Bengal'],
  ['Howrah',    22.59, 88.31, 'West Bengal'],
  ['Bhagalpur', 25.24, 86.97, 'Bihar'],
  ['Gaya',      24.79, 84.99, 'Bihar'],
  ['Muzaffarpur', 26.12, 85.39, 'Bihar'],
  ['Darbhanga', 26.15, 85.90, 'Bihar'],
  ['Puducherry', 11.94, 79.83, 'Puducherry'],
  ['Port Blair', 11.62, 92.73, 'Andaman and Nicobar Islands'],
];

const CITY_COORDS: Record<string, [number, number]> =
  Object.fromEntries(CITY_TABLE.map(([n, lat, lng]) => [n, [lat, lng] as [number, number]]));

const CITY_TO_STATE: Record<string, string> =
  Object.fromEntries(CITY_TABLE.map(([n, , , state]) => [n, state]));

const STATE_BY_NAME = new Map(INDIA_STATES.map((s) => [s.name.toLowerCase(), s]));

const STATUS_COLOR: Record<string, string> = {
  new:         '#3E9EFF',
  working:     '#F7B538',
  qualified:   '#7B61FF',
  converted:   '#28B463',
  unqualified: '#E01E2C',
};

export interface LeadGeoPoint {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  // Exact captured position. When present the lead is plotted here instead
  // of being jittered around its city centroid.
  latitude?: number | null;
  longitude?: number | null;
  // Score + breakdown so the map popup can explain the lead's score inline.
  score?: number | null;
  score_grade?: 'A' | 'B' | 'C' | 'D' | null;
  score_breakdown?: Record<string, unknown> | null;
}

// True when a lead carries a usable real position. Rejects null-island
// (0,0) which is almost always a missing-coordinate artefact, not a lead.
function hasRealCoords(l: LeadGeoPoint): l is LeadGeoPoint & { latitude: number; longitude: number } {
  return typeof l.latitude === 'number' && typeof l.longitude === 'number'
    && Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
    && Math.abs(l.latitude) <= 90 && Math.abs(l.longitude) <= 180
    && !(l.latitude === 0 && l.longitude === 0);
}

// Zoom thresholds drive the level-of-detail switch.
const ZOOM_STATE_MAX = 6;     // ≤ this zoom: show state-level chips
const ZOOM_CITY_MAX  = 9;     // ≤ this zoom: show city-level circles. ≥ 10: individual lead markers.

// Helper child component — exposes the live zoom level to the parent so it
// can switch aggregation modes without the parent owning a map ref.
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    const handler = () => onZoom(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoom]);
  return null;
}

// Helper child component — flies the map to a target location. Re-runs when
// the target changes; we use a serialised "key" to dedupe re-flights.
function FlyTo({ target }: { target: { lat: number; lng: number; zoom: number; key: string } | null }) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!target || target.key === lastKey.current) return;
    lastKey.current = target.key;
    map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.9 });
  }, [target, map]);
  return null;
}

interface SearchHit {
  type: 'state' | 'city';
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  count?: number;
  state?: string;
}

export default function LeadsGeoMap({ leads, height = 620 }: { leads: LeadGeoPoint[]; height?: number }) {
  const router = useRouter();
  const [zoom, setZoom] = useState<number>(INDIA_CENTRE.zoom);
  const [target, setTarget] = useState<{ lat: number; lng: number; zoom: number; key: string } | null>(null);
  const [search, setSearch] = useState('');
  // Below this width we stack the map + side panel vertically and shrink the
  // map height so both fit on a phone screen.
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 820px)');
    const handler = () => setIsCompact(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => { mq.removeEventListener('change', handler); };
  }, []);

  // Bucket leads by state + by city so both layers can read counts O(1).
  const { byState, byCity, unmapped, pinnedLeads } = useMemo(() => {
    const stateMap = new Map<string, { name: string; lat: number; lng: number; zoom: number; count: number; statuses: Record<string, number> }>();
    // `lat`/`lng` start at the catalog centroid; sumLat/sumLng/nCoords let us
    // refine them to the actual centroid of this city's geocoded leads, so
    // clicking a city flies to where its leads really are.
    const cityMap = new Map<string, { city: string; state?: string; lat: number; lng: number; sumLat: number; sumLng: number; nCoords: number; count: number; statuses: Record<string, number>; leads: LeadGeoPoint[] }>();
    let unmappedCount = 0;
    for (const l of leads) {
      const stateKey = (l.state ?? '').trim();
      const cityKey = (l.city ?? '').trim();
      // If the lead row has no `state`, fall back to the city catalog
      // — most leads created via integrations or bulk import only carry
      // a `city`, but the state name is implicit (Deoghar ⇒ Jharkhand).
      const inferredState = !stateKey && cityKey
        ? (CITY_TO_STATE[cityKey] ?? '')
        : stateKey;
      const stateRow = inferredState ? STATE_BY_NAME.get(inferredState.toLowerCase()) : undefined;
      const cityCoord = cityKey ? CITY_COORDS[cityKey] : undefined;
      const status = (l.status ?? 'unknown').toLowerCase();

      if (stateRow) {
        const cur = stateMap.get(stateRow.name) ?? { name: stateRow.name, lat: stateRow.lat, lng: stateRow.lng, zoom: stateRow.zoom ?? 7, count: 0, statuses: {} };
        cur.count += 1;
        cur.statuses[status] = (cur.statuses[status] ?? 0) + 1;
        stateMap.set(stateRow.name, cur);
      }
      if (cityCoord) {
        const cur = cityMap.get(cityKey) ?? { city: cityKey, state: stateRow?.name, lat: cityCoord[0], lng: cityCoord[1], sumLat: 0, sumLng: 0, nCoords: 0, count: 0, statuses: {}, leads: [] };
        cur.count += 1;
        cur.statuses[status] = (cur.statuses[status] ?? 0) + 1;
        cur.leads.push(l);
        if (hasRealCoords(l)) { cur.sumLat += l.latitude; cur.sumLng += l.longitude; cur.nCoords += 1; }
        cityMap.set(cityKey, cur);
      } else if (!hasRealCoords(l)) {
        // No city centroid AND no exact coordinates → can't place it.
        unmappedCount += 1;
      }
    }
    return {
      byState: Array.from(stateMap.values()).sort((a, b) => b.count - a.count),
      // Snap each city's marker/fly-to target to the real centroid of its
      // geocoded leads when we have coordinates; else keep the catalog point.
      byCity: Array.from(cityMap.values())
        .map((c) => c.nCoords > 0 ? { ...c, lat: c.sumLat / c.nCoords, lng: c.sumLng / c.nCoords } : c)
        .sort((a, b) => b.count - a.count),
      unmapped: unmappedCount,
      // Leads with an exact captured position — plotted precisely (not
      // jittered) at high zoom. Includes leads whose city has no centroid.
      pinnedLeads: leads.filter(hasRealCoords),
    };
  }, [leads]);

  const totalMapped = byCity.reduce((s, c) => s + c.count, 0);

  // Search hits — dynamic over states + cities (and a synthetic "All India"
  // entry to snap back).
  const searchHits = useMemo<SearchHit[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const s of INDIA_STATES) {
      if (s.name.toLowerCase().includes(q)) {
        const data = byState.find((b) => b.name === s.name);
        hits.push({ type: 'state', name: s.name, lat: s.lat, lng: s.lng, zoom: s.zoom ?? 7, count: data?.count ?? 0 });
      }
    }
    for (const c of byCity) {
      if (c.city.toLowerCase().includes(q) || (c.state ?? '').toLowerCase().includes(q)) {
        hits.push({ type: 'city', name: c.city, lat: c.lat, lng: c.lng, zoom: 11, count: c.count, state: c.state });
      }
    }
    // Fallback: cities not in our lead data but in the catalog
    for (const [name, [lat, lng]] of Object.entries(CITY_COORDS)) {
      if (name.toLowerCase().includes(q) && !hits.some((h) => h.type === 'city' && h.name === name)) {
        hits.push({ type: 'city', name, lat, lng, zoom: 11, count: 0 });
      }
    }
    return hits.slice(0, 30);
  }, [search, byState, byCity]);

  const flyTo = (h: SearchHit) => {
    setTarget({ lat: h.lat, lng: h.lng, zoom: h.zoom, key: `${h.type}-${h.name}-${Date.now()}` });
  };

  const resetView = () => {
    setSearch('');
    setTarget({ lat: INDIA_CENTRE.lat, lng: INDIA_CENTRE.lng, zoom: INDIA_CENTRE.zoom, key: `reset-${Date.now()}` });
  };

  // Choose which layer to render based on the live zoom level.
  const showStates = zoom <= ZOOM_STATE_MAX;
  const showCities = zoom > ZOOM_STATE_MAX && zoom <= ZOOM_CITY_MAX;
  const showLeads  = zoom > ZOOM_CITY_MAX;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) 280px',
      gap: 14,
      height: isCompact ? 'auto' : height,
    }}>
      {/* Map */}
      <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'relative', height: isCompact ? 360 : '100%' }}>
        <MapContainer
          center={[INDIA_CENTRE.lat, INDIA_CENTRE.lng]}
          zoom={INDIA_CENTRE.zoom}
          minZoom={4}
          maxZoom={16}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomTracker onZoom={setZoom} />
          <FlyTo target={target} />

          {/* Static city/state aggregate markers are intentionally removed:
              the map now only plots leads that carry real captured
              coordinates. Once more leads have coordinates they'll appear
              here automatically. */}

          {/* Individual lead markers — only leads with an exact captured
              position are plotted (no city-centroid approximation). Shown from
              zoom level 5 (roughly the India-wide default) upward, so the pins
              are visible without having to zoom right in. */}
          {zoom >= 5 && (() => {
            const markers: Array<{ lead: LeadGeoPoint; lat: number; lng: number; place: string }> = [];
            for (const lead of pinnedLeads) {
              markers.push({
                lead,
                lat: lead.latitude,
                lng: lead.longitude,
                place: [lead.city, lead.state].filter(Boolean).join(', ') || 'Pinned location',
              });
            }
            return markers.map(({ lead, lat, lng, place }) => {
              const status = (lead.status ?? 'new').toLowerCase();
              const color = STATUS_COLOR[status] ?? '#3E9EFF';
              return (
                <CircleMarker
                  key={`lead-${lead.id}`}
                  center={[lat, lng]}
                  radius={6}
                  pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 1.5 }}
                  eventHandlers={{ click: () => router.push(`/dashboard/crm/leads/${lead.id}`) }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <span style={{ font: '600 11px system-ui' }}>
                      {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead'}
                    </span>
                  </Tooltip>
                  <Popup>
                    <div style={{ font: '12px/1.4 system-ui' }}>
                      <strong>{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead'}</strong>
                      <br />
                      <span style={{ color: '#666' }}>{place}</span>
                      <br />
                      <span style={{ display: 'inline-block', marginTop: 4, padding: '1px 6px', borderRadius: 4, background: `${color}33`, color, fontSize: 10, fontWeight: 700 }}>
                        {status}
                      </span>
                      {lead.score != null && (() => {
                        const sc = Math.round(lead.score as number);
                        const gr = lead.score_grade ?? (sc >= 75 ? 'A' : sc >= 50 ? 'B' : sc >= 25 ? 'C' : 'D');
                        const gc = sc >= 70 ? '#10b981' : sc >= 40 ? '#f59e0b' : '#ef4444';
                        const top = breakdownFactors(lead.score_breakdown).slice(0, 4);
                        return (
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e5e5e5' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 800, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: `${gc}22`, color: gc, border: `1px solid ${gc}55` }}>{gr} · {sc}</span>
                              <span style={{ color: '#888', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }}>Lead score</span>
                            </div>
                            {top.length > 0 && (
                              <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none' }}>
                                {top.map((f) => (
                                  <li key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: '#444' }}>
                                    <span>{f.label}</span><span style={{ color: '#10b981', fontWeight: 700 }}>+{f.value}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ marginTop: 8 }}>
                        <a href={`/dashboard/crm/leads/${lead.id}`} style={{ color: '#E01E2C', fontWeight: 700, fontSize: 11 }}>Open lead →</a>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            });
          })()}
        </MapContainer>

        {/* Bottom-left zoom hint + reset */}
        <div style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 500, background: 'rgba(20,22,28,0.92)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#cbd2dd', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Zoom: <strong style={{ color: '#fff' }}>{zoom}</strong></span>
          <span style={{ color: '#888' }}>·</span>
          <span>{showStates ? 'States' : showCities ? 'Cities' : 'Leads'}</span>
          <button onClick={resetView} style={{ background: 'transparent', border: '1px solid #444', color: '#cbd2dd', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>Reset</button>
        </div>
      </div>

      {/* Side panel — search + summary + top cities */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ padding: '10px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>Find on map</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search state, city, district…"
            style={{ width: '100%', background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
          {searchHits.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8 }}>
              {searchHits.map((h, i) => (
                <button
                  key={`${h.type}-${h.name}-${i}`}
                  onClick={() => flyTo(h)}
                  style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', minWidth: 38, fontSize: 9, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h.type === 'state' ? 'State' : 'City'}</span>
                    {h.name}{h.state ? <span style={{ color: 'var(--text-dim)' }}> · {h.state}</span> : null}
                  </span>
                  {typeof h.count === 'number' && h.count > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{h.count} lead{h.count === 1 ? '' : 's'}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Geo summary</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{totalMapped.toLocaleString()} mapped</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{byState.length} state{byState.length === 1 ? '' : 's'} · {byCity.length} cit{byCity.length === 1 ? 'y' : 'ies'}{unmapped > 0 ? ` · ${unmapped} unmapped` : ''}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid var(--border)' }}>Top cities</div>
          {byCity.length === 0 ? (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-dim)' }}>No leads with mapped cities yet.</div>
          ) : byCity.map((c) => {
            const dominant = Object.entries(c.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'new';
            return (
              <button
                key={c.city}
                onClick={() => flyTo({ type: 'city', name: c.city, lat: c.lat, lng: c.lng, zoom: 10, count: c.count, state: c.state })}
                style={{
                  width: '100%', textAlign: 'left', background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  padding: '8px 12px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[dominant] }} />
                  {c.city}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
