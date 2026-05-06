'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { INDIA_STATES, INDIA_CENTRE } from '../../../lib/indiaStates';

// City lat/lng catalog — extends incrementally as new cities show up. Anything
// not in this map gets placed at the state centroid as a fallback so it still
// surfaces in counts; the search panel can also refer to these.
const CITY_COORDS: Record<string, [number, number]> = {
  'Ahmedabad':      [23.03, 72.58],
  'Bengaluru':      [12.97, 77.59],
  'Bhopal':         [23.26, 77.41],
  'Bhubaneswar':    [20.30, 85.82],
  'Chandigarh':     [30.73, 76.78],
  'Chennai':        [13.08, 80.27],
  'Coimbatore':     [11.02, 76.96],
  'Delhi':          [28.61, 77.21],
  'New Delhi':      [28.61, 77.21],
  'Gurugram':       [28.46, 77.03],
  'Gurgaon':        [28.46, 77.03],
  'Guwahati':       [26.14, 91.74],
  'Hyderabad':      [17.39, 78.49],
  'Indore':         [22.72, 75.86],
  'Jaipur':         [26.92, 75.79],
  'Kanpur':         [26.45, 80.33],
  'Kolkata':        [22.57, 88.36],
  'Kochi':          [9.93, 76.27],
  'Lucknow':        [26.85, 80.95],
  'Ludhiana':       [30.90, 75.85],
  'Mumbai':         [19.08, 72.88],
  'Mysuru':         [12.30, 76.64],
  'Nagpur':         [21.15, 79.09],
  'Noida':          [28.54, 77.39],
  'Panaji':         [15.49, 73.83],
  'Patna':          [25.59, 85.14],
  'Pune':           [18.52, 73.86],
  'Raipur':         [21.25, 81.63],
  'Ranchi':         [23.34, 85.32],
  'Surat':          [21.17, 72.83],
  'Thiruvananthapuram': [8.52, 76.94],
  'Trivandrum':     [8.52, 76.94],
  'Vadodara':       [22.31, 73.18],
  'Varanasi':       [25.32, 82.97],
  'Visakhapatnam':  [17.69, 83.22],
  'Vizag':          [17.69, 83.22],
};

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
}

// Zoom thresholds drive the level-of-detail switch.
const ZOOM_STATE_MAX = 6;     // ≤ this zoom: show state-level chips
const ZOOM_CITY_MAX  = 9;     // ≤ this zoom: show city-level circles. ≥ 10: individual lead markers.

// Builds a DivIcon-rendered "chip" that puts a count + label on the map at
// state centroids without needing a polygon layer.
function chipIcon(label: string, count: number, accent: string) {
  const html = `
    <div style="
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(20, 22, 28, 0.92); color: #fff;
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid ${accent}; box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      font: 700 11px 'DM Sans', sans-serif; white-space: nowrap;
    ">
      <span style="background:${accent}; color:#fff; min-width:18px; padding:0 6px;
                   border-radius: 999px; text-align: center; font-size:10px; line-height:14px;">
        ${count}
      </span>
      ${label}
    </div>`;
  return L.divIcon({
    html,
    className: 'kinematic-map-chip',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

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
  const { byState, byCity, unmapped } = useMemo(() => {
    const stateMap = new Map<string, { name: string; lat: number; lng: number; zoom: number; count: number; statuses: Record<string, number> }>();
    const cityMap = new Map<string, { city: string; state?: string; lat: number; lng: number; count: number; statuses: Record<string, number>; leads: LeadGeoPoint[] }>();
    let unmappedCount = 0;
    for (const l of leads) {
      const stateKey = (l.state ?? '').trim();
      const cityKey = (l.city ?? '').trim();
      const stateRow = stateKey ? STATE_BY_NAME.get(stateKey.toLowerCase()) : undefined;
      const cityCoord = cityKey ? CITY_COORDS[cityKey] : undefined;
      const status = (l.status ?? 'unknown').toLowerCase();

      if (stateRow) {
        const cur = stateMap.get(stateRow.name) ?? { name: stateRow.name, lat: stateRow.lat, lng: stateRow.lng, zoom: stateRow.zoom ?? 7, count: 0, statuses: {} };
        cur.count += 1;
        cur.statuses[status] = (cur.statuses[status] ?? 0) + 1;
        stateMap.set(stateRow.name, cur);
      }
      if (cityCoord) {
        const cur = cityMap.get(cityKey) ?? { city: cityKey, state: stateRow?.name, lat: cityCoord[0], lng: cityCoord[1], count: 0, statuses: {}, leads: [] };
        cur.count += 1;
        cur.statuses[status] = (cur.statuses[status] ?? 0) + 1;
        cur.leads.push(l);
        cityMap.set(cityKey, cur);
      } else {
        unmappedCount += 1;
      }
    }
    return {
      byState: Array.from(stateMap.values()).sort((a, b) => b.count - a.count),
      byCity: Array.from(cityMap.values()).sort((a, b) => b.count - a.count),
      unmapped: unmappedCount,
    };
  }, [leads]);

  const cityMax = byCity.reduce((m, c) => Math.max(m, c.count), 1);
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

          {/* State-level aggregation chips */}
          {showStates && byState.map((s) => (
            <Marker
              key={`st-${s.name}`}
              position={[s.lat, s.lng]}
              icon={chipIcon(s.name, s.count, '#E01E2C')}
              eventHandlers={{ click: () => setTarget({ lat: s.lat, lng: s.lng, zoom: s.zoom, key: `st-${s.name}-${Date.now()}` }) }}
            >
              <Popup>
                <div style={{ font: '12px/1.4 system-ui' }}>
                  <strong>{s.name}</strong><br />
                  {s.count} lead{s.count === 1 ? '' : 's'}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* City-level circles */}
          {showCities && byCity.map((c) => {
            const dominant = Object.entries(c.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'new';
            const color = STATUS_COLOR[dominant] ?? '#3E9EFF';
            const radius = 8 + (c.count / cityMax) * 18;
            return (
              <CircleMarker
                key={`city-${c.city}`}
                center={[c.lat, c.lng]}
                radius={radius}
                pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 0.85, weight: 2 }}
                eventHandlers={{ click: () => setTarget({ lat: c.lat, lng: c.lng, zoom: 11, key: `city-${c.city}-${Date.now()}` }) }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
                  <span style={{ font: '700 11px system-ui', color }}>{c.count}</span>
                </Tooltip>
                <Popup>
                  <div style={{ font: '12px/1.4 system-ui' }}>
                    <strong>{c.city}</strong>{c.state ? <span style={{ color: '#666' }}> · {c.state}</span> : null}
                    <br />
                    {c.count} lead{c.count === 1 ? '' : 's'}
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(c.statuses).map(([st, n]) => (
                        <span key={st} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${STATUS_COLOR[st] ?? '#888'}33`, color: STATUS_COLOR[st] ?? '#888' }}>
                          {st}: {n}
                        </span>
                      ))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Individual lead markers — one circle per lead, jittered so they
              don't overlap when many leads share a city centroid. Click navigates. */}
          {showLeads && byCity.flatMap((c) => c.leads.map((lead, i) => {
            const angle = (i / Math.max(c.leads.length, 1)) * 2 * Math.PI;
            const r = 0.04;
            const lat = c.lat + Math.sin(angle) * r;
            const lng = c.lng + Math.cos(angle) * r;
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
                    <span style={{ color: '#666' }}>{c.city}{c.state ? `, ${c.state}` : ''}</span>
                    <br />
                    <span style={{ display: 'inline-block', marginTop: 4, padding: '1px 6px', borderRadius: 4, background: `${color}33`, color, fontSize: 10, fontWeight: 700 }}>
                      {status}
                    </span>
                    <div style={{ marginTop: 8 }}>
                      <a href={`/dashboard/crm/leads/${lead.id}`} style={{ color: '#E01E2C', fontWeight: 700, fontSize: 11 }}>Open lead →</a>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          }))}
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
                onClick={() => flyTo({ type: 'city', name: c.city, lat: c.lat, lng: c.lng, zoom: 11, count: c.count, state: c.state })}
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
