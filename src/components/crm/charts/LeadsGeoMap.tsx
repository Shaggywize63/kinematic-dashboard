'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { INDIA_STATES, INDIA_CENTRE } from '../../../lib/indiaStates';
import { breakdownFactors } from '../../../lib/crm/scoreFactors';
import { applyMapTheme, baseMapOptions, circleSymbol, escapeHtml, infoHtml, MAP_COLORS, useDocumentTheme, useGoogleMaps, type GMaps, type MapTheme } from '../../../lib/googleMaps';
import { Eyebrow, Input, T, useIsCompact } from '../../ui';

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

// Status → marker colour, per theme (maps can't read CSS variables). The
// side panel uses the matching tokens so both read as one legend.
function statusColor(status: string | null | undefined, theme: MapTheme): string {
  const c = MAP_COLORS[theme];
  switch ((status ?? 'new').toLowerCase()) {
    case 'working': return c.warn;
    case 'qualified': return c.violet;
    case 'converted': return c.ok;
    case 'unqualified': case 'lost': return c.red;
    default: return c.info;
  }
}
const STATUS_TOKEN: Record<string, string> = {
  new: 'var(--info)', working: 'var(--warn)', qualified: '#7C3AED', converted: 'var(--ok)', unqualified: 'var(--red)', lost: 'var(--red)',
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

// Zoom thresholds drive the level-of-detail label in the corner chip.
const ZOOM_STATE_MAX = 6;
const ZOOM_CITY_MAX  = 9;

interface SearchHit {
  type: 'state' | 'city';
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  count?: number;
  state?: string;
}

// InfoWindow body for a lead pin — name, place, status pill, score
// breakdown and a link into the lead.
function leadPopupHtml(lead: LeadGeoPoint, place: string, color: string): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';
  const status = (lead.status ?? 'new').toLowerCase();
  let extra = `<span style="display:inline-block;margin-top:6px;padding:1px 8px;border-radius:999px;background:${color}1f;color:${color};font-size:11px;font-weight:600">${escapeHtml(status)}</span>`;
  if (lead.score != null) {
    const sc = Math.round(lead.score as number);
    const gr = lead.score_grade ?? (sc >= 75 ? 'A' : sc >= 50 ? 'B' : sc >= 25 ? 'C' : 'D');
    const gc = sc >= 70 ? '#0A8A4E' : sc >= 40 ? '#C97A00' : '#D01E2C';
    const top = breakdownFactors(lead.score_breakdown).slice(0, 4);
    extra += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #E4E6EB">`
      + `<div style="display:flex;align-items:center;gap:6px"><span style="font-family:JetBrains Mono,monospace;font-weight:600;font-size:11px;padding:1px 6px;border-radius:999px;background:${gc}1f;color:${gc}">${gr} · ${sc}</span><span style="color:#94A3B8;font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-family:JetBrains Mono,monospace">Lead score</span></div>`
      + (top.length ? `<ul style="margin:4px 0 0;padding:0;list-style:none">${top.map((f) => `<li style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#64748B"><span>${escapeHtml(f.label)}</span><span style="color:#0A8A4E;font-weight:600">+${escapeHtml(f.value)}</span></li>`).join('')}</ul>` : '')
      + `</div>`;
  }
  extra += `<div style="margin-top:8px"><a href="/dashboard/crm/leads/${encodeURIComponent(lead.id)}" style="color:#0066FF;font-weight:600;font-size:12px;text-decoration:none">Open lead →</a></div>`;
  return infoHtml(name, [place], extra);
}

export default function LeadsGeoMap({ leads, height = 620 }: { leads: LeadGeoPoint[]; height?: number }) {
  const [zoom, setZoom] = useState<number>(INDIA_CENTRE.zoom);
  const [search, setSearch] = useState('');
  // Below this width we stack the map + side panel vertically and shrink the
  // map height so both fit on a phone screen.
  const isCompact = useIsCompact(820);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<GMaps>(null);
  const infoRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  const { maps, error } = useGoogleMaps(['maps']);
  const theme = useDocumentTheme();

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
      // jittered). Includes leads whose city has no centroid.
      pinnedLeads: leads.filter(hasRealCoords),
    };
  }, [leads]);

  const totalMapped = byCity.reduce((s, c) => s + c.count, 0);

  // Search hits — dynamic over states + cities.
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

  // ── Map lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!maps || !mapRef.current || mapInst.current) return;
    const map = new maps.Map(mapRef.current, baseMapOptions(theme, {
      center: { lat: INDIA_CENTRE.lat, lng: INDIA_CENTRE.lng }, zoom: INDIA_CENTRE.zoom, minZoom: 4, maxZoom: 16,
    }));
    map.addListener('zoom_changed', () => setZoom(map.getZoom() ?? INDIA_CENTRE.zoom));
    mapInst.current = map;
    infoRef.current = new maps.InfoWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);

  useEffect(() => { applyMapTheme(mapInst.current, theme); }, [theme]);

  // Lead pins — only leads with an exact captured position are plotted (no
  // city-centroid approximation). Rebuilt when the data or theme changes.
  useEffect(() => {
    const map = mapInst.current;
    if (!maps || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    for (const lead of pinnedLeads) {
      const color = statusColor(lead.status, theme);
      const place = [lead.city, lead.state].filter(Boolean).join(', ') || 'Pinned location';
      const marker = new maps.Marker({
        map, position: { lat: lead.latitude, lng: lead.longitude },
        title: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead',
        icon: circleSymbol(maps, color, 6, MAP_COLORS[theme].stroke),
      });
      marker.addListener('click', () => {
        infoRef.current?.setContent(leadPopupHtml(lead, place, color));
        infoRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    }
  }, [maps, pinnedLeads, theme]);

  const flyTo = (h: { lat: number; lng: number; zoom: number }) => {
    const map = mapInst.current;
    if (!map) return;
    map.panTo({ lat: h.lat, lng: h.lng });
    map.setZoom(h.zoom);
  };
  const resetView = () => {
    setSearch('');
    flyTo({ lat: INDIA_CENTRE.lat, lng: INDIA_CENTRE.lng, zoom: INDIA_CENTRE.zoom });
  };

  const level = zoom <= ZOOM_STATE_MAX ? 'States' : zoom <= ZOOM_CITY_MAX ? 'Cities' : 'Leads';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) 280px',
      gap: 14,
      height: isCompact ? 'auto' : height,
    }}>
      {/* Map */}
      <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'relative', height: isCompact ? 360 : '100%' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12.5, padding: 16, textAlign: 'center' }}>{error}</div>
        )}
        {!error && (
          <div style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 5, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 4px 4px 10px', fontSize: 11.5, color: 'var(--text-dim)', display: 'flex', gap: 8, alignItems: 'center', boxShadow: 'var(--shadow-pop)' }}>
            <span style={{ fontFamily: T.mono }}>z{zoom}</span>
            <span style={{ color: 'var(--text-mute)' }}>·</span>
            <span>{level}</span>
            <button type="button" onClick={resetView} className="km-iconbtn" title="Reset view" aria-label="Reset view" style={{ width: 24, height: 24, borderRadius: 5, border: 0, background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LocateFixed size={13} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      {/* Side panel — search + summary + top cities */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Find on map</Eyebrow>
          <div style={{ position: 'relative' }}>
            <Search size={14} strokeWidth={1.6} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)', pointerEvents: 'none' }} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="State, city, district…" style={{ paddingLeft: 30, height: 32, fontSize: 13 }} />
          </div>
          {searchHits.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
              {searchHits.map((h, i) => (
                <button
                  key={`${h.type}-${h.name}-${i}`}
                  type="button"
                  onClick={() => flyTo(h)}
                  className="km-navrow"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', height: 30, padding: '0 8px', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', minWidth: 36, fontFamily: T.mono, fontSize: 9.5, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h.type}</span>
                    {h.name}{h.state ? <span style={{ color: 'var(--text-dim)' }}> · {h.state}</span> : null}
                  </span>
                  {typeof h.count === 'number' && h.count > 0 && (
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{h.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <Eyebrow>Geo summary</Eyebrow>
          <div style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginTop: 4, lineHeight: 1.15 }}>{totalMapped.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', fontFamily: 'inherit' }}>mapped</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{byState.length} state{byState.length === 1 ? '' : 's'} · {byCity.length} cit{byCity.length === 1 ? 'y' : 'ies'}{unmapped > 0 ? ` · ${unmapped} unmapped` : ''}</div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--border)' }}><Eyebrow>Top cities</Eyebrow></div>
          {byCity.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-dim)' }}>No leads with mapped cities yet.</div>
          ) : byCity.map((c) => {
            const dominant = Object.entries(c.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'new';
            return (
              <button
                key={c.city}
                type="button"
                onClick={() => flyTo({ lat: c.lat, lng: c.lng, zoom: 10 })}
                className="km-navrow"
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', padding: '0 12px', height: 34, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_TOKEN[dominant] ?? 'var(--text-mute)' }} />
                  {c.city}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 11.5, color: 'var(--text-dim)' }}>{c.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
