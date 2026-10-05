'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../../../lib/api';
import * as demoMocks from '../../../lib/demoMocks';
import { getStoredUser } from '../../../lib/auth';
import { getStoredIndustryScope } from '../../../context/IndustryScopeContext';
import { LowBatteryKpi, LowBatteryAlert, LowBatteryFilter } from '../../../components/live-tracking/LowBattery';
import { escapeHtml } from '../../../lib/googleMaps';
import { usePlaceName, useSeen, getPlaceName, peekPlaceName, formatLatLng, formatLatLngShort, googleMapsUrl, type PlaceName } from '../../../lib/placeName';

const C = {
  bg: 'var(--bg)', s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', borderL: 'var(--border-l)',
  white: 'var(--text)', gray: 'var(--text-dim)', grayd: 'var(--text-dim)', graydd: 'var(--text-dim)',
  red: 'var(--primary)', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.2)',
  green: 'var(--green)', greenD: 'rgba(0,217,126,0.08)',
  blue: 'var(--accent)', blueD: 'rgba(62,158,255,0.10)',
  yellow: '#FFB800', yellowD: 'rgba(255,184,0,0.08)',
  purple: '#9B6EFF', purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1', tealD: 'rgba(0,201,177,0.08)',
  orange: '#FF7A30',
};

/* ── Types ── */
interface FELoc {
  id: string; name: string; employee_id?: string;
  role: string; zone_name?: string; city?: string;
  status: 'active'|'on_break'|'checked_out'|'absent';
  lat: number|null; lng: number|null;
  // Where lat/lng came from and when it was captured: 'live' = latest GPS ping,
  // 'checkin' = today's check-in point, 'zone' = the zone meeting point (the rep
  // has no fix at all). Absent on older backends / demo data.
  location_source?: 'live'|'checkin'|'zone'|null;
  location_captured_at?: string|null;
  checkin_at?: string; checkout_at?: string;
  last_location_updated_at?: string;
  // Device location state (see locationOff()): 'on' | 'services_off' | 'denied'
  // | 'restricted' | 'unknown' | null. When off, lat/lng is the last KNOWN fix,
  // rendered stale — never live.
  location_status?: string | null;
  location_precise?: boolean | null;
  location_status_updated_at?: string | null;
  total_hours?: number; address?: string;
  today_engagements?: number; today_tff?: number;
  battery_percentage?: number;
  device_model?: string; device_brand?: string; os_version?: string;
  // GPS-integrity signals from the latest heartbeat (GPS-spoof hardening).
  is_mock?: boolean; is_suspect?: boolean; suspect_reason?: string; location_accuracy_m?: number;
}
interface Outlet {
  id: string; name: string; store_type?: string;
  lat: number|null; lng: number|null;
  address?: string; zone_name?: string; is_active: boolean;
}
interface Warehouse {
  id: string; name: string; type?: string;
  latitude: number|null; longitude: number|null;
  address?: string; city?: string; is_active: boolean;
}
interface Zone { id: string; name: string; city?: string; }
interface TrailPoint { lat: number; lng: number; battery_percentage?: number; captured_at: string; activity_type?: string; }

/* ── Layer config ── */
// Live Trailing is field-executive-only: Supervisors / Outlets / Warehouses
// layers were removed on request, so the map + side list show FEs alone.
const LAYERS = [
  { id:'fe',         label:'Field Executives', icon:'👤', color:C.green  },
];

const STATUS_COLOR: Record<string, string> = {
  active:      C.green,
  on_break:    C.yellow,
  checked_out: C.blue,
  absent:      C.grayd,
};

/* ── Location-off helper ──
 * The device reports its permission/services state to the backend (there is no
 * way to read GPS when it's turned off, and we don't try). We flag ONLY the
 * explicit off states; 'on' and an unknown/null status (older app builds that
 * don't report yet) are left un-flagged to avoid false alarms. When off, the
 * rep's lat/lng is the LAST KNOWN fix and must be shown as stale, never live. */
const LOC_OFF_LABEL: Record<string, string> = {
  services_off: 'Location off',
  denied:       'Location denied',
  restricted:   'Location blocked',
};
function shortSince(ts?: string | null): string {
  if (!ts) return '';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (!isFinite(mins) || mins < 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
/** Off-state + human label for a rep, or null when location is on/unknown. */
function locationOff(fe: { location_status?: string | null; location_status_updated_at?: string | null }):
  { label: string; since: string } | null {
  const s = fe.location_status;
  if (!s || !(s in LOC_OFF_LABEL)) return null;
  return { label: LOC_OFF_LABEL[s], since: shortSince(fe.location_status_updated_at) };
}

/* ── Position helpers ──
 * What the pin on the map actually represents, in words, plus the timestamp it
 * was captured at. A pin from the check-in point or the zone meeting point is
 * NOT where the rep is now — the UI must say so instead of implying a live fix. */
const SOURCE_LABEL: Record<string, string> = {
  live:    'Live GPS',
  checkin: 'Check-in point',
  zone:    'Zone meeting point',
};
function sourceNote(fe: { location_source?: string | null }): string | null {
  if (fe.location_source === 'checkin') return 'No GPS ping in the last 24h — showing where they checked in.';
  if (fe.location_source === 'zone')    return 'No GPS fix yet — showing the zone meeting point, not their position.';
  return null;
}
/** When the pin's position was captured (null for the zone fallback / unknown). */
function capturedAt(fe: { location_source?: string | null; location_captured_at?: string | null; last_location_updated_at?: string | null }): string | null {
  if (fe.location_source === 'zone') return null;
  return fe.location_captured_at ?? fe.last_location_updated_at ?? null;
}
const IST = 'Asia/Kolkata';
function fmtIst(ts?: string | null, withSeconds = false): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST, hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hour12: true,
  });
}
function agoText(ts?: string | null): string {
  if (!ts) return '';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (!isFinite(mins) || mins < 0) return '';
  if (mins === 0) return 'just now';
  const s = shortSince(ts);
  return s ? `${s} ago` : '';
}
/** YYYY-MM-DD for the IST calendar day `daysAgo` days back. The trail endpoint
 *  windows by IST day, so the date picker must too (UTC `today` is yesterday
 *  between 00:00 and 05:30 IST). */
function istDay(daysAgo = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/* ── Google Maps loader ──
 * Same Dynamic Library Import bootstrap used by googleGeocode.ts /
 * GoogleAddressAutocomplete.tsx (defines google.maps.importLibrary). No
 * <script> tag — the app CSP already allows maps.googleapis.com. */
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function bootstrapMaps(key: string) {
  /* eslint-disable */
  // @ts-ignore — official Google Maps Dynamic Library Import bootstrap
  ((g:any)=>{let h:any,a:any,k:any,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b:any=window;b=b[c]||(b[c]={});let d=b.maps||(b.maps={}),r=new Set<string>(),e=new URLSearchParams(),u=()=>h||(h=new Promise(async(f:any,n:any)=>{a=m.createElement("script");e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,(t:string)=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=(m.querySelector("script[nonce]") as any)?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f:any,...n:any[])=>r.add(f)&&u().then(()=>d[l](f,...n))})({key,v:"weekly"});
  /* eslint-enable */
}

// Dark basemap approximating the previous CartoDB dark tiles.
const DARK_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b1b1b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9aa0a6' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c0c0c0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#16241a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d3d3d' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1622' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5a80' }] },
];

// Zoomed-in variant: the base style hides every POI so the overview stays
// quiet, but that also leaves nothing but road names once you zoom to street
// level. Past DETAIL_ZOOM we bring back place names (shops, landmarks, schools,
// hospitals…) and neighbourhood labels. Google already thins labels by zoom, so
// this only adds names where there's room for them.
const DETAIL_ZOOM = 14;
const DETAIL_MAP_STYLE: any[] = [
  ...DARK_MAP_STYLE.filter((r) => !(r.featureType === 'poi' && !r.elementType)),
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#222a33' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#aab3c0' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -60 }, { lightness: -15 }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#c0c8d4' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#9aa0a6' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'on' }] },
];

/* ── Atoms ── */
const Spin = () => (
  <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.blue,
    borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);
const Dot = ({ color, size=8 }: { color:string; size?:number }) => (
  <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
    <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:color, opacity:.3, animation:'kpulse 2s infinite' }}/>
    <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:color }}/>
  </div>
);

function downloadTrailCsv(fe: FELoc | null | undefined, trail: TrailPoint[]) {
  if (!fe || !trail.length) return;
  const date = istDay(0);
  const safeName = (fe.name || 'fe').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'fe';
  const filename = `${safeName}-trail-${date}.csv`;

  const esc = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = ['#', 'Date (IST)', 'Time (IST)', 'Latitude', 'Longitude', 'Activity', 'Battery %', 'Captured At (UTC)'];
  const lines: string[] = [header.map(esc).join(',')];
  trail.forEach((p, i) => {
    const dt = new Date(p.captured_at);
    const istDate = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istTime = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
    lines.push([
      i + 1,
      istDate,
      istTime,
      p.lat,
      p.lng,
      p.activity_type ?? '',
      p.battery_percentage ?? '',
      p.captured_at,
    ].map(esc).join(','));
  });

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACTIVITY_LABEL: Record<string, string> = {
  HEARTBEAT:   'Location ping',
  CHECK_IN:    'Check-in',
  CHECK_OUT:   'Check-out',
  FORM_SUBMIT: 'Form submitted',
};

const POPUP_BASE = 'font-family:DM Sans,sans-serif;font-size:12px;color:var(--text);background:var(--s1);padding:10px 12px;border-radius:12px;min-width:200px;max-width:280px';

/** The shared "where exactly" block of every location popup: place name (or a
 *  lookup placeholder), coordinates, and a link out to Google Maps. */
function placeBlockHtml(lat: number, lng: number, place: PlaceName | null, resolved: boolean, heading: string): string {
  const name = place
    ? `<div style="font-size:12px;font-weight:600;line-height:1.35;margin-top:3px;color:var(--text)">${escapeHtml(place.full)}</div>`
    : (!resolved ? `<div style="font-size:11px;margin-top:3px;color:var(--text-dim)">Looking up place name…</div>` : '');
  return `<div style="border-top:1px solid var(--border);margin-top:8px;padding-top:7px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-dim)">${escapeHtml(heading)}</div>
      ${name}
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--text-dim);margin-top:3px;user-select:all">${escapeHtml(formatLatLng(lat, lng))}</div>
      <a href="${escapeHtml(googleMapsUrl(lat, lng))}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:4px;font-size:10px;font-weight:600;color:var(--accent);text-decoration:none">Open in Google Maps ↗</a>
    </div>`;
}

/** Popup for a rep's pin. `fe.lat/lng` must be set. */
function popupHtml(
  fe: FELoc, role: string, color: string,
  off: { label: string; since: string } | null,
  place: PlaceName | null, resolved: boolean,
): string {
  const seen = capturedAt(fe);
  const diff = seen ? Math.round((Date.now() - new Date(seen).getTime()) / 60000) : null;
  const notLive = fe.location_source === 'checkin' || fe.location_source === 'zone';
  const isStale = off != null || notLive || (diff != null && diff > 10);
  const src = fe.location_source ? SOURCE_LABEL[fe.location_source] : null;
  const note = sourceNote(fe);
  const heading = (off || notLive || isStale) ? 'Last known location' : 'Current location';
  const when = seen ? `${fmtIst(seen)} IST${agoText(seen) ? ` · ${agoText(seen)}` : ''}` : '';
  const acc = fe.location_accuracy_m != null && fe.location_source === 'live' ? ` · ±${Math.round(fe.location_accuracy_m)} m` : '';
  const badge = off ? `<div style="font-size:10px;font-weight:700;color:${C.grayd}">Last known</div>`
    : notLive ? `<div style="font-size:10px;font-weight:700;color:${C.yellow}">Not live</div>`
    : (diff != null ? `<div style="font-size:10px;font-weight:600;color:${isStale ? C.red : C.green}">${diff === 0 ? 'Live now' : escapeHtml(agoText(seen))}</div>` : '');

  return `<div style="${POPUP_BASE};border:1px solid ${isStale ? C.redB : C.border}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-weight:700;margin-bottom:2px;color:${isStale ? C.gray : C.white}">${escapeHtml(fe.name)}</div>
        ${badge}
      </div>
      <div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">${escapeHtml(role)}${fe.zone_name ? ` · ${escapeHtml(fe.zone_name)}` : ''}</div>
      ${off ? `<div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:${C.red};background:${C.redD};border:1px solid ${C.redB};border-radius:6px;padding:3px 7px;margin-bottom:6px">📍✕ ${escapeHtml(off.label)}${off.since ? ` · since ${escapeHtml(off.since)} ago` : ''}</div>` : ''}
      ${(fe.device_model || fe.os_version) ? `<div style="color:var(--text-dim);font-size:10px;margin-bottom:6px;display:flex;align-items:center;gap:4px">📱 ${escapeHtml(fe.device_model || 'Device')}${fe.os_version ? ` · Android ${escapeHtml(fe.os_version)}` : ''}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:inline-flex;padding:2px 8px;border-radius:20px;background:${color}20;color:${color};font-size:10px;font-weight:700;text-transform:capitalize">${escapeHtml(String(fe.status).replace('_', ' '))}</div>
        ${fe.battery_percentage != null ? `<div style="font-size:10px;color:${fe.battery_percentage < 20 ? C.red : C.green};display:flex;align-items:center;gap:3px;background:${fe.battery_percentage < 20 ? C.redD : C.greenD};padding:2px 6px;border-radius:6px">🔋 ${fe.battery_percentage}%</div>` : ''}
      </div>
      ${placeBlockHtml(fe.lat as number, fe.lng as number, place, resolved, heading)}
      ${(src || when) ? `<div style="font-size:10px;color:var(--text-dim);margin-top:5px">${escapeHtml([src, when].filter(Boolean).join(' · '))}${escapeHtml(acc)}</div>` : ''}
      ${note ? `<div style="font-size:10px;color:${C.yellow};margin-top:4px;line-height:1.35">${escapeHtml(note)}</div>` : ''}
    </div>`;
}

/** Popup for one captured ping on a rep's trail. */
function trailPopupHtml(row: TrailPoint | undefined, i: number, n: number, place: PlaceName | null, resolved: boolean): string {
  if (!row) return '';
  const tag = i === 0 ? 'Start of trail' : i === n - 1 ? 'Latest ping' : '';
  const label = ACTIVITY_LABEL[String(row.activity_type || '').toUpperCase()] || 'Location ping';
  return `<div style="${POPUP_BASE}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-weight:700;color:${C.white}">${escapeHtml(fmtIst(row.captured_at, true))} <span style="font-weight:500;color:var(--text-dim)">IST</span></div>
        ${tag ? `<div style="font-size:10px;font-weight:700;color:${i === 0 ? C.green : C.red}">${tag}</div>` : ''}
      </div>
      <div style="color:var(--text-dim);font-size:11px;margin-top:2px">${escapeHtml(label)} · ping ${i + 1} of ${n}${agoText(row.captured_at) ? ` · ${escapeHtml(agoText(row.captured_at))}` : ''}</div>
      ${row.battery_percentage != null ? `<div style="margin-top:6px"><span style="font-size:10px;color:${row.battery_percentage < 20 ? C.red : C.green};background:${row.battery_percentage < 20 ? C.redD : C.greenD};padding:2px 6px;border-radius:6px">🔋 ${row.battery_percentage}%</span></div>` : ''}
      ${placeBlockHtml(row.lat, row.lng, place, resolved, 'Location')}
    </div>`;
}

function LiveMap({
  fes, supervisors, outlets, warehouses,
  activeLayers, selectedId, onSelect,
  mapLoaded, trail, trailColor,
}: {
  fes: FELoc[]; supervisors: FELoc[]; outlets: Outlet[]; warehouses: Warehouse[];
  activeLayers: Set<string>; selectedId: string|null; onSelect:(id:string,type:string)=>void;
  mapLoaded: boolean;
  trail?: TrailPoint[];
  trailColor?: string;
}) {
  const mapRef   = useRef<HTMLDivElement>(null);
  const mapInst  = useRef<any>(null);
  const infoWin  = useRef<any>(null);
  const markers  = useRef<any[]>([]);
  const trailLines = useRef<any[]>([]);
  const trailDots  = useRef<any[]>([]);
  // The popup currently open, so the 60-second data refresh (which rebuilds
  // every marker) can re-open it on the new marker instead of snapping it shut,
  // and the last viewport we framed, so a refresh doesn't undo the user's zoom.
  const openPopup  = useRef<{ id: string; kind: string } | null>(null);
  const fittedKey  = useRef<string>('');
  const lastAutoOpen = useRef<string | null>(null);

  // Captured GPS pings for the selected FE (only those with usable coordinates;
  // kept as rows so a ping's time / battery / activity stay aligned with its dot).
  // The polyline prefers a road-snapped path (see snappedPath below) and falls
  // back to straight segments.
  const trailRows = useMemo<TrailPoint[]>(
    () => (trail || []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [trail],
  );
  const trailPoints = useMemo<[number, number][] | null>(
    () => (trailRows.length > 1 ? trailRows.map((p) => [p.lat, p.lng] as [number, number]) : null),
    [trailRows],
  );

  // Road-snapped trail via the Google Directions JS SDK. maps.googleapis.com is
  // allow-listed in BOTH script-src and connect-src (unlike the old OSRM host
  // the CSP blocked), so DirectionsService's XHRs are permitted. Best-effort:
  // on any failure — Directions API not enabled on the key, ZERO_RESULTS, or a
  // near-stationary rep — snappedPath stays null and the polyline falls back to
  // straight segments, so the trail always renders.
  const [snappedPath, setSnappedPath] = useState<{ lat: number; lng: number }[] | null>(null);
  useEffect(() => {
    const g = (window as any).google;
    if (!mapLoaded || !g?.maps?.DirectionsService || !trailPoints || trailPoints.length < 2) {
      setSnappedPath(null);
      return;
    }
    // Skip a rep who effectively hasn't moved — a route between coincident
    // points is meaningless and just spends a Directions call.
    const lats = trailPoints.map((p) => p[0]);
    const lngs = trailPoints.map((p) => p[1]);
    const spanM = Math.max(
      (Math.max(...lats) - Math.min(...lats)) * 111_000,
      (Math.max(...lngs) - Math.min(...lngs)) * 111_000 * Math.cos((lats[0] * Math.PI) / 180),
    );
    if (spanM < 60) { setSnappedPath(null); return; }
    // Directions allows origin + destination + up to 23 waypoints. Sample the
    // pings down evenly, preserving order and both endpoints.
    const MAX = 25;
    let pts = trailPoints;
    if (pts.length > MAX) {
      const step = (pts.length - 1) / (MAX - 1);
      pts = Array.from({ length: MAX }, (_, i) => trailPoints[Math.round(i * step)]);
    }
    const origin = { lat: pts[0][0], lng: pts[0][1] };
    const destination = { lat: pts[pts.length - 1][0], lng: pts[pts.length - 1][1] };
    const waypoints = pts.slice(1, -1).map(([lat, lng]) => ({ location: { lat, lng }, stopover: false }));
    let cancelled = false;
    try {
      const svc = new g.maps.DirectionsService();
      svc.route(
        { origin, destination, waypoints, travelMode: g.maps.TravelMode.DRIVING, optimizeWaypoints: false },
        (res: any, status: any) => {
          if (cancelled) return;
          if (status === 'OK' && res?.routes?.[0]?.overview_path?.length) {
            setSnappedPath(res.routes[0].overview_path.map((p: any) => ({ lat: p.lat(), lng: p.lng() })));
          } else {
            setSnappedPath(null); // fall back to straight segments
          }
        },
      );
    } catch { setSnappedPath(null); }
    return () => { cancelled = true; };
  }, [mapLoaded, trailPoints]);

  // Map init — one Google map, dark-styled, plus a single shared InfoWindow.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInst.current) return;
    const g = (window as any).google;
    if (!g?.maps?.Map) return;
    const map = new g.maps.Map(mapRef.current, {
      center: { lat: 28.6139, lng: 77.209 },
      zoom: 10,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: g.maps.ControlPosition.RIGHT_BOTTOM },
      clickableIcons: false,
      backgroundColor: '#1b1b1b',
      styles: DARK_MAP_STYLE,
    });
    infoWin.current = new g.maps.InfoWindow();
    infoWin.current.addListener('closeclick', () => { openPopup.current = null; });
    mapInst.current = map;
    // Swap to the place-name style when the user zooms in to street level (and
    // back out). setOptions only fires when the threshold is actually crossed.
    let detailed = false;
    map.addListener('zoom_changed', () => {
      const want = (map.getZoom() ?? 0) >= DETAIL_ZOOM;
      if (want !== detailed) {
        detailed = want;
        map.setOptions({ styles: want ? DETAIL_MAP_STYLE : DARK_MAP_STYLE });
      }
    });
  }, [mapLoaded]);

  // Resize handler — when the layout flips between desktop (sidebar+map row)
  // and mobile (sidebar above, map below), the map container changes size.
  // Google Maps mostly auto-handles this, but nudging a resize event keeps
  // the tiles from rendering into a stale (grey) box after rotation/resize.
  useEffect(() => {
    if (!mapInst.current) return;
    const g = (window as any).google;
    const onResize = () => { if (mapInst.current) g?.maps?.event?.trigger(mapInst.current, 'resize'); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const t = setTimeout(onResize, 250); // initial pass after first paint
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      clearTimeout(t);
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapInst.current) return;
    const g = (window as any).google;
    if (!g?.maps?.Marker) return;
    const map = mapInst.current;

    markers.current.forEach(m => m.setMap(null));
    markers.current = [];

    // Every clickable marker registers how to (re)build its popup. The popup
    // body can depend on a reverse-geocoded place name that arrives later, so
    // the builder takes the name (if known) and whether the lookup has settled.
    type Build = (place: PlaceName | null, resolved: boolean) => string;
    const popups = new Map<string, { m: any; build: Build; lat: number; lng: number; kind: string; withPlace: boolean }>();

    const showPopup = (id: string) => {
      const e = popups.get(id);
      if (!e || !infoWin.current) return;
      const cached = e.withPlace ? peekPlaceName(e.lat, e.lng) : null;
      infoWin.current.setContent(e.build(cached, !e.withPlace || !!cached));
      infoWin.current.open(map, e.m);
      openPopup.current = { id, kind: e.kind };
      if (e.withPlace && !cached) {
        getPlaceName(e.lat, e.lng).then((place) => {
          // Only repaint if this popup is still the one on screen.
          if (openPopup.current?.id === id && popups.get(id)?.m === e.m) infoWin.current?.setContent(e.build(place, true));
        });
      }
    };

    const addMarker = (
      lat: number, lng: number, icon: any, label: any,
      build: Build, id: string, type: string, zIndex: number, withPlace = false,
    ) => {
      const m = new g.maps.Marker({ position: { lat, lng }, map, icon, label, zIndex });
      popups.set(id, { m, build, lat, lng, kind: type, withPlace });
      m.addListener('click', () => { showPopup(id); onSelect(id, type); });
      markers.current.push(m);
    };

    const circleIcon = (fill: string, scale: number, stroke: string, weight: number, opacity = 1) => ({
      path: g.maps.SymbolPath.CIRCLE, fillColor: fill, fillOpacity: opacity,
      strokeColor: stroke, strokeWeight: weight, scale,
    });

    if (activeLayers.has('fe')) {
      fes.filter(fe => fe.lat && fe.lng).forEach(fe => {
        const c = STATUS_COLOR[fe.status] || '#94a3b8';
        const sel = selectedId === fe.id;
        const off = locationOff(fe);
        // Location off → the fix is stale (last known). Draw it hollow + faded,
        // grey stroke, so it never reads as a live position.
        const icon = off
          ? circleIcon(C.grayd, sel ? 12 : 10, sel ? '#ffffff' : C.grayd, sel ? 3 : 2, 0.35)
          : circleIcon(c, sel ? 13 : 11, sel ? '#ffffff' : '#1b1b1b', sel ? 3 : 2);
        const label = { text: fe.name?.[0] || '?', color: off ? C.grayd : '#000', fontSize: '12px', fontWeight: '800' };
        addMarker(fe.lat!, fe.lng!, icon, label,
          (place, resolved) => popupHtml(fe, fe.role, c, off, place, resolved),
          fe.id, 'fe', sel ? 60 : 30, true);
      });
    }

    if (activeLayers.has('supervisor')) {
      supervisors.filter(s => s.lat && s.lng).forEach(sup => {
        const c = STATUS_COLOR[sup.status] || C.grayd;
        const supOff = locationOff(sup);
        const icon = supOff
          ? circleIcon(C.grayd, 11, C.grayd, 2, 0.35)
          : circleIcon(C.blue, 12, '#1b1b1b', 2);
        const label = { text: sup.name?.[0] || '?', color: supOff ? C.grayd : '#fff', fontSize: '12px', fontWeight: '800' };
        addMarker(sup.lat!, sup.lng!, icon, label,
          (place, resolved) => popupHtml(sup, 'Supervisor', c, supOff, place, resolved),
          sup.id, 'supervisor', 25, true);
      });
    }

    if (activeLayers.has('outlet')) {
      outlets.filter(o => o.lat && o.lng).forEach(o => {
        const icon = circleIcon(C.yellow, 11, '#1b1b1b', 2);
        const label = { text: '🏪', fontSize: '13px' };
        const popup = `<div style="font-family:DM Sans,sans-serif;font-size:12px;color:var(--text);background:var(--s1);padding:10px 12px;border-radius:8px;min-width:150px"><div style="font-weight:700;margin-bottom:4px">${escapeHtml(o.name)}</div>${o.store_type?`<div style="color:var(--text-dim);font-size:11px">${escapeHtml(o.store_type)}</div>`:''}<div style="color:var(--text-dim);font-size:11px;margin-top:4px">${escapeHtml(o.zone_name||'')}</div>${o.address?`<div style="color:var(--text-dim);font-size:10px;margin-top:2px">${escapeHtml(o.address)}</div>`:''}</div>`;
        addMarker(o.lat!, o.lng!, icon, label, () => popup, o.id, 'outlet', 15);
      });
    }

    if (activeLayers.has('warehouse')) {
      warehouses.filter(w => w.latitude && w.longitude).forEach(w => {
        const icon = circleIcon(C.purple, 12, '#1b1b1b', 2);
        const label = { text: '🏭', fontSize: '13px' };
        const popup = `<div style="font-family:DM Sans,sans-serif;font-size:12px;color:var(--text);background:var(--s1);padding:10px 12px;border-radius:8px;min-width:150px"><div style="font-weight:700;margin-bottom:4px">${escapeHtml(w.name)}</div>${w.type?`<div style="color:var(--text-dim);font-size:11px">${escapeHtml(w.type)}</div>`:''}<div style="color:var(--text-dim);font-size:11px;margin-top:4px">${escapeHtml(w.city||'')}</div></div>`;
        addMarker(w.latitude!, w.longitude!, icon, label, () => popup, w.id, 'warehouse', 15);
      });
    }

    // Trail: a subtle wide glow polyline under a solid main polyline, plus
    // small circle markers at each captured ping (start=green, end=trail
    // colour, middle=white).
    trailLines.current.forEach(l => l.setMap(null)); trailLines.current = [];
    trailDots.current.forEach(d => d.setMap(null)); trailDots.current = [];
    if (trailPoints && trailPoints.length > 1) {
      const colour = trailColor || '#E01E2C';
      // Prefer the road-snapped path; fall back to straight segments between the
      // raw pings. The per-ping dots below always sit on the raw GPS points.
      const path = (snappedPath && snappedPath.length > 1)
        ? snappedPath
        : trailPoints.map(([lat, lng]) => ({ lat, lng }));
      const glow = new g.maps.Polyline({ path, strokeColor: colour, strokeOpacity: 0.18, strokeWeight: 8, map, zIndex: 5 });
      const main = new g.maps.Polyline({ path, strokeColor: colour, strokeOpacity: 0.95, strokeWeight: 4, map, zIndex: 6 });
      trailLines.current = [glow, main];

      trailPoints.forEach(([lat, lng], i) => {
        const isFirst = i === 0;
        const isLast  = i === trailPoints.length - 1;
        const radius  = isFirst || isLast ? 7 : 4;
        const fill    = isLast ? colour : isFirst ? '#10b981' : '#ffffff';
        const stroke  = isLast ? '#ffffff' : isFirst ? '#ffffff' : colour;
        const row = trailRows[i];
        const id = `trail:${i}`;
        // Clickable: tap any ping for its exact time, coordinates and place name.
        const dot = new g.maps.Marker({
          position: { lat, lng }, map, clickable: true, zIndex: isLast ? 9 : 7,
          title: `${fmtIst(row?.captured_at)} · ping ${i + 1} of ${trailPoints.length}`,
          icon: circleIcon(fill, radius, stroke, 2),
        });
        popups.set(id, {
          m: dot, lat, lng, kind: 'trail', withPlace: true,
          build: (place, resolved) => trailPopupHtml(row, i, trailPoints.length, place, resolved),
        });
        dot.addListener('click', () => showPopup(id));
        trailDots.current.push(dot);
      });
    }

    // Frame the view — but only when WHAT we're looking at changes (a different
    // rep selected, a different day's trail, a different set of pins), never on
    // the 60-second data refresh. Re-fitting on every refresh used to snap the
    // map back out and undo whatever the user had just zoomed in to read.
    const livePins = Array.from(popups.keys()).filter((k) => !k.startsWith('trail:')).sort();
    const selEntry = selectedId ? popups.get(selectedId) : undefined;
    let fitKey: string;
    const bounds = new g.maps.LatLngBounds();
    let has = false;
    if (selectedId && trailPoints && trailPoints.length > 0) {
      // A rep is selected — frame THEIR trail so the day's breadcrumb is
      // actually visible. Fitting to every FE marker instead (they can be
      // hundreds of km apart) zooms the map out so far the selected rep's
      // path collapses to a single dot — the "trail not visible" bug.
      fitKey = `trail:${selectedId}:${trailPoints[0][0]},${trailPoints[0][1]}`;
      trailPoints.forEach(([lat, lng]) => { bounds.extend({ lat, lng }); has = true; });
    } else if (selectedId && selEntry && selEntry.kind === 'fe') {
      // A rep is selected but has no trail (yet) — centre on their pin at
      // street zoom so "where are they now" is the first thing you see.
      fitKey = `pin:${selectedId}`;
      bounds.extend({ lat: selEntry.lat, lng: selEntry.lng }); has = true;
    } else {
      fitKey = `all:${livePins.join('|')}`;
      markers.current.forEach(m => { const p = m.getPosition(); if (p) { bounds.extend(p); has = true; } });
      if (trailPoints) trailPoints.forEach(([lat, lng]) => { bounds.extend({ lat, lng }); has = true; });
    }
    if (has && fittedKey.current !== fitKey) {
      fittedKey.current = fitKey;
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
        // A single point / stationary rep — recentre at street zoom so the
        // location and any stacked pings are clearly visible.
        map.setCenter(bounds.getCenter());
        if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
      } else {
        map.fitBounds(bounds, 60);
      }
    }

    // Popups. A newly selected rep (e.g. picked from the list) opens its popup
    // so the place name + coordinates are on the map straight away. Otherwise a
    // popup the user already has open follows its marker through the refresh.
    const prev = openPopup.current;
    if (!selectedId) lastAutoOpen.current = null;
    if (selectedId && selEntry?.kind === 'fe' && lastAutoOpen.current !== selectedId) {
      lastAutoOpen.current = selectedId;
      showPopup(selectedId);
    } else if (prev && popups.has(prev.id) && (prev.kind !== 'fe' || prev.id === selectedId)) {
      showPopup(prev.id);
    } else {
      infoWin.current?.close();
      openPopup.current = null;
    }

  }, [mapLoaded, fes, supervisors, outlets, warehouses, activeLayers, selectedId, onSelect, trail, trailColor, trailPoints, trailRows, snappedPath]);

  return (
    <>
      {/* Trim Google's default white InfoWindow chrome so the dark popup
          card sits flush inside it. */}
      <style>{`.gm-style .gm-style-iw-c{background:var(--s1)!important;border:1px solid var(--border)!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,.35)!important;padding:0!important}.gm-style .gm-style-iw-d{overflow:hidden!important}.gm-style .gm-style-iw-tc::after{background:var(--s1)!important}.gm-style .gm-style-iw-chr{position:absolute;top:0;right:0;height:0}.gm-style .gm-style-iw-chr .gm-ui-hover-effect{opacity:.6}`}</style>
      <div ref={mapRef} style={{ width:'100%', height:'100%' }}/>
      {!mapLoaded && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:C.s3, color:C.gray, fontSize:13, gap:10 }}>
          <Spin/> Loading map…
        </div>
      )}
    </>
  );
}

/* ── Where is this person? ── */

/** One-line place for a sidebar row: the short place name, or the coordinates
 *  until/unless a name resolves. Looks up lazily — only once the row has
 *  scrolled into view — so a long list doesn't geocode everyone at once. */
function PlaceLine({ lat, lng }: { lat: number; lng: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { place, loading } = usePlaceName(lat, lng, seen);
  return (
    <div ref={ref} title={place ? `${place.full}\n${formatLatLng(lat, lng)}` : formatLatLng(lat, lng)}
      style={{ fontSize:10, color:C.gray, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
      📍 {place ? place.short : (loading ? 'Locating…' : formatLatLngShort(lat, lng))}
    </div>
  );
}

/** Full "last known location" card for the selected rep: place name,
 *  coordinates (copyable), when + how it was captured, and a Maps link. */
function LocationBlock({ fe }: { fe: FELoc }) {
  const { place, loading } = usePlaceName(fe.lat, fe.lng);
  const [copied, setCopied] = useState(false);
  if (fe.lat == null || fe.lng == null) return null;

  const off = locationOff(fe);
  const seen = capturedAt(fe);
  const note = sourceNote(fe);
  const src = fe.location_source ? SOURCE_LABEL[fe.location_source] : null;
  const fresh = !off && !note && !!seen && Date.now() - new Date(seen).getTime() <= 10 * 60000;
  const coords = formatLatLng(fe.lat, fe.lng);
  const copy = () => {
    try {
      navigator.clipboard?.writeText(coords).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
    } catch { /* clipboard blocked — the coordinates are selectable text anyway */ }
  };

  return (
    <div style={{ flexBasis:'100%', background:C.s3, border:`1px solid ${C.border}`, borderRadius:12,
      padding:'10px 14px', display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'1 1 280px', minWidth:0 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.7px', textTransform:'uppercase', color:C.grayd }}>
          {fresh ? 'Current location' : 'Last known location'}
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:C.white, marginTop:3, lineHeight:1.35 }}>
          {place ? place.full : (loading ? <span style={{ color:C.gray, fontWeight:500 }}>Looking up place name…</span>
            : <span style={{ color:C.gray, fontWeight:500 }}>Place name unavailable — showing coordinates</span>)}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginTop:4 }}>
          <span style={{ fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize:12, color:C.gray, userSelect:'all' }}>{coords}</span>
          <button onClick={copy}
            style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px',
              fontSize:10, fontWeight:600, color:copied ? C.green : C.gray, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a href={googleMapsUrl(fe.lat, fe.lng)} target="_blank" rel="noopener noreferrer"
            style={{ fontSize:11, fontWeight:600, color:C.blue, textDecoration:'none' }}>
            Open in Google Maps ↗
          </a>
        </div>
      </div>
      <div style={{ flex:'0 1 auto', fontSize:11, color:C.gray, lineHeight:1.5 }}>
        {src && (
          <div><span style={{ color:C.grayd }}>Source </span>
            <span style={{ color: fe.location_source === 'live' ? C.green : C.yellow, fontWeight:700 }}>{src}</span>
            {fe.location_source === 'live' && fe.location_accuracy_m != null && <span> · ±{Math.round(fe.location_accuracy_m)} m</span>}
          </div>
        )}
        {seen && (
          <div><span style={{ color:C.grayd }}>Captured </span>
            <span style={{ color:C.white, fontWeight:600 }}>{fmtIst(seen)} IST</span>
            {agoText(seen) && <span> · {agoText(seen)}</span>}
          </div>
        )}
        {off && (
          <div style={{ color:C.red, fontWeight:600 }}>📍✕ {off.label}{off.since ? ` since ${off.since} ago` : ''} — last known fix, not live</div>
        )}
      </div>
      {note && (
        <div style={{ flexBasis:'100%', fontSize:11, color:C.yellow, background:C.yellowD, borderRadius:8, padding:'5px 10px' }}>
          ⚠️ {note}
        </div>
      )}
    </div>
  );
}

/* ══ MAIN PAGE ══ */
export default function LiveTrackingPage() {
  const [fes,         setFEs]         = useState<FELoc[]>([]);
  const [supervisors, setSupervisors] = useState<FELoc[]>([]);
  const [outlets,     setOutlets]     = useState<Outlet[]>([]);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [zones,       setZones]       = useState<Zone[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [lastSync,    setLastSync]    = useState('');
  const [mapLoaded,   setMapLoaded]   = useState(false);
  const [error,       setError]       = useState<string|null>(null);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter,   setZoneFilter]   = useState('all');
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['fe']));

  const [selectedId,   setSelectedId]   = useState<string|null>(null);
  const [selectedType, setSelectedType] = useState<string|null>(null);
  const [selectedTrail, setSelectedTrail] = useState<TrailPoint[]>([]);
  // Trail time-window: which day's captured pings to draw for the selected FE.
  const [trailDate,    setTrailDate]    = useState<string>(() => istDay(0));

  const [lowBatteryFilter,    setLowBatteryFilter]    = useState(false);
  const [lowBatteryDismissed, setLowBatteryDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.google?.maps?.Map) { setMapLoaded(true); return; }
    if (!GMAPS_KEY) { setError('Google Maps is not configured (missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)'); return; }
    // Same Dynamic Library Import bootstrap as googleGeocode.ts — no <script>
    // tag; the app CSP already allows maps.googleapis.com. Load the `maps`
    // (Map/Polyline/InfoWindow) and `marker` (Marker) libraries, then flip
    // mapLoaded once google.maps.Map is available.
    let cancelled = false;
    if (!w.google?.maps?.importLibrary) bootstrapMaps(GMAPS_KEY);
    Promise.all([
      w.google.maps.importLibrary('maps'),
      w.google.maps.importLibrary('marker'),
      // `routes` gives DirectionsService for road-snapping the trail. Best-effort:
      // if it fails to load the trail simply falls back to straight segments.
      w.google.maps.importLibrary('routes').catch(() => null),
    ])
      .then(() => { if (!cancelled) setMapLoaded(true); })
      .catch(() => { if (!cancelled) setError('Could not load the map library'); });
    return () => { cancelled = true; };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = getStoredUser();
      const isDemo = user?.email === demoMocks.DEMO_USER_EMAIL;

      if (isDemo) {
        const locData = demoMocks.mockLocations();
        const locs: FELoc[] = locData.data.locations as FELoc[];
        setFEs(locs.filter((l: FELoc) => {
          const r = (l.role || '').toLowerCase().replace(/_/g, '-');
          const isRestricted = ['admin', 'main-admin', 'client', 'super-admin'].includes(r);
          const isSupervisor = ['supervisor', 'city-manager', 'program-manager', 'hr'].includes(r);
          return !isRestricted && !isSupervisor;
        }));
        setSupervisors(locs.filter((l: FELoc) => {
          const r = (l.role || '').toLowerCase().replace(/_/g, '-');
          return ['supervisor', 'city-manager', 'program-manager', 'hr'].includes(r);
        }));
        setOutlets([]);
        setWarehouses([]);
        setZones([]);
      } else {
        const [locRes, outletRes, whRes, zoneRes] = await Promise.allSettled([
          api.getLiveLocations(),
          api.getStores({ limit: '500' }),
          api.get<any>('/api/v1/warehouses'),
          api.getZones(),
        ]);

        if (locRes.status === 'fulfilled') {
          const locs: FELoc[] = (locRes.value?.data ?? locRes.value)?.locations || (locRes.value?.data ?? locRes.value) || [];
          setFEs(locs.filter((l: FELoc) => {
            const r = (l.role || '').toLowerCase().replace(/_/g, '-');
            const isRestricted = ['admin', 'main-admin', 'client', 'super-admin'].includes(r);
            const isSupervisor = ['supervisor', 'city-manager', 'program-manager', 'hr'].includes(r);
            return !isRestricted && !isSupervisor;
          }));
          setSupervisors(locs.filter((l: FELoc) => {
            const r = (l.role || '').toLowerCase().replace(/_/g, '-');
            return ['supervisor', 'city-manager', 'program-manager', 'hr'].includes(r);
          }));
        } else {
          setError(`Failed to load live locations: ${(locRes as PromiseRejectedResult).reason?.message || 'Unknown error'}`);
        }

        if (outletRes.status === 'fulfilled') {
          const raw = (outletRes.value as any)?.data ?? outletRes.value;
          setOutlets(Array.isArray(raw) ? raw : raw?.data || []);
        }
        if (whRes.status === 'fulfilled') {
          const raw = whRes.value?.data ?? whRes.value;
          setWarehouses(Array.isArray(raw) ? raw : raw?.data || []);
        }
        if (zoneRes.status === 'fulfilled') {
          const raw = (zoneRes.value as any)?.data ?? zoneRes.value;
          setZones(Array.isArray(raw) ? raw : []);
        }
      }

      setLastSync(new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }));
    } catch (err: any) {
      setError(err?.message || 'Failed to load live tracking data');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(fetchAll, 60000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { fetchAll(); start(); }
      else { stop(); }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAll]);

  useEffect(() => {
    if (selectedType !== 'fe' || !selectedId) {
      setSelectedTrail([]);
      return;
    }
    const date = trailDate;
    let cancelled = false;
    api.get<{ success: boolean; data: TrailPoint[] }>(`/api/v1/users/${selectedId}/location-trail?date=${date}`)
      .then((r) => { if (!cancelled) setSelectedTrail(r.data ?? []); })
      .catch(() => { if (!cancelled) setSelectedTrail([]); });
    return () => { cancelled = true; };
  }, [selectedId, selectedType, lastSync, trailDate]);

  const q = search.toLowerCase();

  const filteredFEs = fes.filter(fe => {
    const name = (fe.name || '').toLowerCase();
    const eid  = (fe.employee_id || '').toLowerCase();
    const zn   = (fe.zone_name || '').toLowerCase();
    const stat = fe.status || 'absent';
    
    const matchSearch = !search || name.includes(q) || eid.includes(q) || zn.includes(q);
    const matchStatus = statusFilter === 'all' || stat === statusFilter;
    const matchZone   = zoneFilter === 'all' || (fe.zone_name && zones.find(z => z.name === fe.zone_name)?.id === zoneFilter);
    const matchBattery = !lowBatteryFilter || (fe.battery_percentage != null && fe.battery_percentage < 20);
    
    return !!matchSearch && !!matchStatus && !!matchZone && !!matchBattery;
  });

  const filteredSups = supervisors.filter(s => {
    const name = (s.name || '').toLowerCase();
    const stat = s.status || 'absent';
    
    const matchSearch = !search || name.includes(q);
    const matchStatus = statusFilter === 'all' || stat === statusFilter;
    return !!matchSearch && !!matchStatus;
  });

  const filteredOutlets = outlets.filter(o => {
    const matchSearch = !search || o.name?.toLowerCase().includes(q) || o.zone_name?.toLowerCase().includes(q);
    const matchZone   = zoneFilter === 'all' || zones.find(z => z.name === o.zone_name)?.id === zoneFilter;
    return matchSearch && matchZone;
  });

  const filteredWarehouses = warehouses.filter(w => {
    const matchSearch = !search || w.name?.toLowerCase().includes(q) || w.city?.toLowerCase().includes(q);
    return matchSearch;
  });

  const toggleLayer = (id: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const activeCount  = fes.filter(f => f.status === 'active').length;
  const breakCount   = fes.filter(f => f.status === 'on_break').length;
  const outCount     = fes.filter(f => f.status === 'checked_out').length;
  const absentCount  = fes.filter(f => f.status === 'absent').length;
  const flaggedCount = fes.filter(f => f.is_mock || f.is_suspect).length;

  const selFE  = selectedType === 'fe'         ? fes.find(f => f.id === selectedId)
               : selectedType === 'supervisor'  ? supervisors.find(s => s.id === selectedId) : null;
  const selOut = selectedType === 'outlet'      ? outlets.find(o => o.id === selectedId) : null;
  const selWH  = selectedType === 'warehouse'   ? warehouses.find(w => w.id === selectedId) : null;

  const inp: React.CSSProperties = {
    padding:'8px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
    background:C.s3, color:C.white, fontSize:12, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  // Trail time-window quick options — IST calendar days, matching the trail
  // endpoint's day window.
  const todayISO     = istDay(0);
  const yesterdayISO = istDay(1);

  return (
    <>
      <style>{`
        @keyframes km-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes kspin     { to{transform:rotate(360deg)} }
        @keyframes kpulse    { 0%,100%{opacity:1} 50%{opacity:.2} }
        .lt-row:hover        { background:${C.s4} !important; }

        /* Mobile (<= 768px): stack the FE-list sidebar above the map so
           the page actually fits on a phone. Sidebar becomes a short
           horizontal-scroll list cap; map takes the rest. KPI strip
           becomes a horizontal scroller so all six tiles stay legible. */
        @media (max-width: 768px) {
          .lt-page       { height: auto !important; min-height: calc(100vh - 80px); }
          .lt-title      { font-size: 20px !important; }
          .lt-subtitle   { font-size: 11px !important; }
          .lt-kpis       { flex-wrap: nowrap !important; overflow-x: auto;
                           -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
          .lt-kpis > div { min-width: 110px; flex: 0 0 auto !important; }
          .lt-filters    { gap: 6px !important; }
          .lt-shell      { flex-direction: column !important; gap: 12px !important; }
          .lt-sidebar    { width: 100% !important; max-height: 38vh; }
          .lt-mapcol     { min-height: 50vh; }
          .lt-detail     { padding: 12px !important; gap: 10px !important; }
          .lt-detail > * { font-size: 12px !important; }
        }
        @media (max-width: 480px) {
          .lt-layer-pill { font-size: 11px !important; padding: 5px 9px !important; }
          .lt-kpi-val    { font-size: 17px !important; }
          .lt-sidebar    { max-height: 32vh; }
        }
      `}</style>

      <div className="lt-page" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', gap:16, animation:'km-fadein .3s ease' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12, flexShrink:0 }}>
          <div>
            <div className="lt-title" style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              Live Trailing
            </div>
            <div className="lt-subtitle" style={{ fontSize:12, color:C.gray, marginTop:3 }}>
              Real-time field-executive visibility &amp; trailing
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {lastSync && <span style={{ fontSize:11, color:C.grayd }}>Last sync: {lastSync}</span>}
            <button onClick={fetchAll} style={{ padding:'8px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, color:C.gray, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
              {loading ? <Spin/> : '↺'} Refresh
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding:'10px 14px', background:C.redD, border:`1px solid ${C.redB}`,
            borderRadius:10, fontSize:12, color:C.red, display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            ⚠️ {error}
          </div>
        )}

        <LowBatteryAlert fes={fes} dismissed={lowBatteryDismissed} onDismiss={() => setLowBatteryDismissed(true)} />

        <div className="lt-kpis" style={{ display:'flex', gap:10, flexShrink:0 }}>
          {[
            { l:'Active',      v:activeCount, c:C.green  },
            { l:'On Break',    v:breakCount,  c:C.yellow },
            { l:'Checked Out', v:outCount,    c:C.blue   },
            { l:'Absent',      v:absentCount, c:C.grayd  },
            // GPS-integrity flag — only surfaced when at least one rep is flagged.
            ...(flaggedCount > 0 ? [{ l:'⚠ Flagged GPS', v:flaggedCount, c:C.red }] : []),
          ].map((s,i) => (
            <div key={i} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 16px', textAlign:'center', flex:1 }}>
              <div className="lt-kpi-val" style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:s.c }}>{loading?'—':s.v}</div>
              <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
          <LowBatteryKpi fes={fes} loading={loading} />
        </div>

        <div className="lt-filters" style={{ display:'flex', gap:10, flexWrap:'wrap', flexShrink:0 }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
            <input placeholder="Search field executives…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inp, width:'100%', paddingLeft:30 }}/>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inp, minWidth:130 }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="on_break">On Break</option>
            <option value="checked_out">Checked Out</option>
            <option value="absent">Absent</option>
          </select>
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            style={{ ...inp, minWidth:140 }}>
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <LowBatteryFilter active={lowBatteryFilter} onToggle={() => setLowBatteryFilter(v => !v)} count={fes.filter(fe => fe.battery_percentage != null && fe.battery_percentage < 20).length} />
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {LAYERS.map(l => (
              <button key={l.id} onClick={() => toggleLayer(l.id)} className="lt-layer-pill"
                style={{ padding:'6px 12px', borderRadius:20, cursor:'pointer',
                  border:`1.5px solid ${activeLayers.has(l.id) ? l.color : C.border}`,
                  background: activeLayers.has(l.id) ? `${l.color}18` : C.s3,
                  color: activeLayers.has(l.id) ? l.color : C.gray,
                  fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', gap:5, transition:'all .15s' }}>
                <span>{l.icon}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lt-shell" style={{ flex:1, display:'flex', gap:16, minHeight:0 }}>

          <div className="lt-sidebar" style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:0,
            background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>

            <div style={{ flex:1, overflowY:'auto' }}>

              {activeLayers.has('fe') && filteredFEs.length > 0 && (
                <>
                  <div style={{ padding:'10px 14px 6px', fontSize:10, color:C.grayd, fontWeight:700,
                    letterSpacing:'0.8px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
                    👤 Field Executives ({filteredFEs.length})
                  </div>
                  {filteredFEs.map(fe => (
                    <div key={fe.id} className="lt-row"
                      onClick={() => { setSelectedId(fe.id); setSelectedType('fe'); }}
                      style={{ display:'flex', gap:10, padding:'10px 14px', cursor:'pointer',
                        borderBottom:`1px solid ${C.border}`, transition:'background .13s',
                        background: selectedId===fe.id ? C.s3 : 'transparent',
                        borderLeft: selectedId===fe.id ? `3px solid ${STATUS_COLOR[fe.status]||C.grayd}` : '3px solid transparent' }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                        background:`${STATUS_COLOR[fe.status]||C.grayd}20`,
                        border:`2px solid ${STATUS_COLOR[fe.status]||C.grayd}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13,
                        color:STATUS_COLOR[fe.status]||C.grayd }}>
                        {(fe.name||'?')[0]}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fe.name}</div>
                          {(() => { const o = locationOff(fe); return o ? (
                            <span title={`${o.label}${o.since ? ` since ${o.since} ago` : ''} — the pin shows the last known fix, not a live position`}
                              style={{ flexShrink:0, fontSize:9, fontWeight:800, letterSpacing:'0.4px', textTransform:'uppercase',
                                color:C.red, background:`${C.red}1f`, border:`1px solid ${C.red}55`, borderRadius:5, padding:'1px 5px' }}>
                              📍✕ {o.label}
                            </span>
                          ) : null; })()}
                          {(fe.is_mock || fe.is_suspect) && (
                            <span title={fe.suspect_reason || (fe.is_mock ? 'Mock/simulated GPS reported by the device' : 'Impossible-speed jump vs the previous fix')}
                              style={{ flexShrink:0, fontSize:9, fontWeight:800, letterSpacing:'0.4px', textTransform:'uppercase',
                                color:C.red, background:`${C.red}1f`, border:`1px solid ${C.red}55`, borderRadius:5, padding:'1px 5px' }}>
                              ⚠ {fe.is_mock ? 'Mock GPS' : 'Teleport'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>
                          {fe.employee_id||''} {fe.zone_name?`· ${fe.zone_name}`:''}
                          {(() => { const o = locationOff(fe); return o
                            ? <span style={{ marginLeft:6, color:C.red }}>• off{o.since ? ` ${o.since}` : ''}</span>
                            : (fe.last_location_updated_at && (
                              <span style={{ marginLeft:6, color: (new Date().getTime() - new Date(fe.last_location_updated_at).getTime()) > 600000 ? C.red : C.grayd }}>
                                • {Math.round((new Date().getTime() - new Date(fe.last_location_updated_at).getTime()) / 60000)}m ago
                              </span>
                            )); })()}
                        </div>
                        {fe.lat && fe.lng ? <PlaceLine lat={fe.lat} lng={fe.lng}/> : null}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                        <Dot color={STATUS_COLOR[fe.status]||C.grayd} size={7}/>
                        {fe.battery_percentage != null && (
                          <div style={{ fontSize:10, color:fe.battery_percentage < 20 ? C.red : C.grayd, fontWeight:600, display:'flex', alignItems:'center', gap:3 }}>
                            {fe.battery_percentage}% 🔋
                          </div>
                        )}
                        {fe.lat && fe.lng && <span style={{ fontSize:10, color: locationOff(fe) ? C.grayd : C.green, opacity: locationOff(fe) ? 0.6 : 1 }} title={locationOff(fe) ? 'Last known location — device location is off' : 'Live location'}>📍</span>}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {activeLayers.has('supervisor') && filteredSups.length > 0 && (
                <>
                  <div style={{ padding:'10px 14px 6px', fontSize:10, color:C.grayd, fontWeight:700,
                    letterSpacing:'0.8px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
                    👔 Supervisors ({filteredSups.length})
                  </div>
                  {filteredSups.map(s => (
                    <div key={s.id} className="lt-row"
                      onClick={() => { setSelectedId(s.id); setSelectedType('supervisor'); }}
                      style={{ display:'flex', gap:10, padding:'10px 14px', cursor:'pointer',
                        borderBottom:`1px solid ${C.border}`, transition:'background .13s',
                        background: selectedId===s.id ? C.s3 : 'transparent',
                        borderLeft: selectedId===s.id ? `3px solid ${C.blue}` : '3px solid transparent' }}>
                      <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                        background:`${C.blue}20`, border:`2px solid ${C.blue}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color:C.blue }}>
                        {(s.name||'?')[0]}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                          {(() => { const o = locationOff(s); return o ? (
                            <span title={`${o.label}${o.since ? ` since ${o.since} ago` : ''} — the pin shows the last known fix, not a live position`}
                              style={{ flexShrink:0, fontSize:9, fontWeight:800, letterSpacing:'0.4px', textTransform:'uppercase',
                                color:C.red, background:`${C.red}1f`, border:`1px solid ${C.red}55`, borderRadius:5, padding:'1px 5px' }}>
                              📍✕ {o.label}
                            </span>
                          ) : null; })()}
                        </div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>
                          {s.zone_name||'No zone'}
                          {(() => { const o = locationOff(s); return o
                            ? <span style={{ marginLeft:6, color:C.red }}>• off{o.since ? ` ${o.since}` : ''}</span>
                            : (s.last_location_updated_at && (
                              <span style={{ marginLeft:6, color: (new Date().getTime() - new Date(s.last_location_updated_at).getTime()) > 600000 ? C.red : C.grayd }}>
                                • {Math.round((new Date().getTime() - new Date(s.last_location_updated_at).getTime()) / 60000)}m ago
                              </span>
                            )); })()}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                        <Dot color={STATUS_COLOR[s.status]||C.grayd} size={7}/>
                        {s.battery_percentage != null && (
                          <div style={{ fontSize:10, color:s.battery_percentage < 20 ? C.red : C.grayd, fontWeight:600, display:'flex', alignItems:'center', gap:3 }}>
                            {s.battery_percentage}% 🔋
                          </div>
                        )}
                        {s.lat && s.lng && <span style={{ fontSize:10, color: locationOff(s) ? C.grayd : C.green, opacity: locationOff(s) ? 0.6 : 1 }} title={locationOff(s) ? 'Last known location — device location is off' : 'Live location'}>📍</span>}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {activeLayers.has('outlet') && filteredOutlets.length > 0 && (
                <>
                  <div style={{ padding:'10px 14px 6px', fontSize:10, color:C.grayd, fontWeight:700,
                    letterSpacing:'0.8px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
                    🏪 Outlets ({filteredOutlets.length})
                  </div>
                  {filteredOutlets.map(o => (
                    <div key={o.id} className="lt-row"
                      onClick={() => { setSelectedId(o.id); setSelectedType('outlet'); }}
                      style={{ display:'flex', gap:10, padding:'10px 14px', cursor:'pointer',
                        borderBottom:`1px solid ${C.border}`, transition:'background .13s',
                        background: selectedId===o.id ? C.s3 : 'transparent',
                        borderLeft: selectedId===o.id ? `3px solid ${C.yellow}` : '3px solid transparent' }}>
                      <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                        background:`${C.yellow}18`, border:`1px solid ${C.yellow}40`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                        🏪
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.name}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{o.store_type||''} {o.zone_name?`· ${o.zone_name}`:''}</div>
                      </div>
                      {o.lat && o.lng && <span style={{ fontSize:9, color:C.green, alignSelf:'center' }}>📍</span>}
                    </div>
                  ))}
                </>
              )}

              {activeLayers.has('warehouse') && filteredWarehouses.length > 0 && (
                <>
                  <div style={{ padding:'10px 14px 6px', fontSize:10, color:C.grayd, fontWeight:700,
                    letterSpacing:'0.8px', textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
                    🏭 Warehouses ({filteredWarehouses.length})
                  </div>
                  {filteredWarehouses.map(w => (
                    <div key={w.id} className="lt-row"
                      onClick={() => { setSelectedId(w.id); setSelectedType('warehouse'); }}
                      style={{ display:'flex', gap:10, padding:'10px 14px', cursor:'pointer',
                        borderBottom:`1px solid ${C.border}`, transition:'background .13s',
                        background: selectedId===w.id ? C.s3 : 'transparent',
                        borderLeft: selectedId===w.id ? `3px solid ${C.purple}` : '3px solid transparent' }}>
                      <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                        background:`${C.purple}18`, border:`1px solid ${C.purple}40`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                        🏭
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.white }}>{w.name}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{w.type||''} {w.city?`· ${w.city}`:''}</div>
                      </div>
                      {w.latitude && w.longitude && <span style={{ fontSize:9, color:C.green, alignSelf:'center' }}>📍</span>}
                    </div>
                  ))}
                </>
              )}

              {filteredFEs.length === 0 && filteredSups.length === 0 &&
               filteredOutlets.length === 0 && filteredWarehouses.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 16px', color:C.grayd, fontSize:12 }}>
                  {loading ? <Spin/> : (search ? `No results for "${search}"` : 'No items to show')}
                </div>
              )}
            </div>
          </div>

          <div className="lt-mapcol" style={{ flex:1, display:'flex', flexDirection:'column', gap:0, minWidth:0 }}>

            <div style={{ flex:1, position:'relative', background:C.s3, borderRadius:selectedId?'16px 16px 0 0':16, overflow:'hidden', border:`1px solid ${C.border}` }}>
              <LiveMap
                fes={filteredFEs}
                supervisors={filteredSups}
                outlets={filteredOutlets}
                warehouses={filteredWarehouses}
                activeLayers={activeLayers}
                selectedId={selectedId}
                onSelect={(id, type) => { setSelectedId(id); setSelectedType(type); }}
                mapLoaded={mapLoaded}
                trail={selectedType === 'fe' ? selectedTrail : undefined}
                trailColor={'#E01E2C'}
              />

              {selectedType === 'fe' && selectedId && (
                <div style={{ position:'absolute', top:12, right:12, zIndex:5,
                  background:'var(--s1)', border:`1px solid ${C.border}`, borderRadius:10,
                  padding:'6px 8px', display:'flex', alignItems:'center', gap:6,
                  fontFamily:"'DM Sans',sans-serif" }}>
                  <span style={{ fontSize:11, color:C.gray, fontWeight:600 }}>Trail day</span>
                  {[{ l:'Today', v:todayISO }, { l:'Yesterday', v:yesterdayISO }].map(d => {
                    const on = trailDate === d.v;
                    return (
                      <button key={d.v} onClick={() => setTrailDate(d.v)}
                        style={{ padding:'4px 9px', borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600,
                          border:`1px solid ${on ? C.blue : C.border}`,
                          background: on ? `${C.blue}18` : 'transparent',
                          color: on ? C.blue : C.gray, fontFamily:"'DM Sans',sans-serif" }}>
                        {d.l}
                      </button>
                    );
                  })}
                  <input type="date" value={trailDate} max={todayISO}
                    onChange={e => { if (e.target.value) setTrailDate(e.target.value); }}
                    style={{ padding:'4px 6px', borderRadius:7, border:`1px solid ${C.border}`,
                      background:C.s3, color:C.white, fontSize:11, fontFamily:"'DM Sans',sans-serif",
                      outline:'none', colorScheme:'dark' as any }}/>
                </div>
              )}

              {!loading && fes.length > 0 && fes.every(f => !f.lat || !f.lng) && (
                <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)',
                  background:'var(--s1)', border:`1px solid ${C.yellow}40`,
                  borderRadius:10, padding:'8px 14px', fontSize:12, color:C.yellow,
                  display:'flex', alignItems:'center', gap:7, pointerEvents:'none', whiteSpace:'nowrap' }}>
                  ⚠️ No GPS coordinates yet — FEs need to check in with location enabled
                </div>
              )}

              {selectedType === 'fe' && selectedTrail.length > 1 && (
                <button
                  onClick={() => downloadTrailCsv(selFE as FELoc | null, selectedTrail)}
                  title="Download today's trail as CSV (opens in Excel)"
                  style={{ position:'absolute', top:12, left:12,
                    background:'var(--s1)', border:`1px solid ${C.border}`,
                    borderRadius:10, padding:'6px 10px 6px 12px', fontSize:11, color:C.gray,
                    display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                    fontFamily:"'DM Sans',sans-serif" }}>
                  <svg width="20" height="3" style={{ flexShrink:0 }}>
                    <line x1="0" y1="1.5" x2="20" y2="1.5"
                      stroke="#E01E2C"
                      strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" />
                  </svg>
                  <span>Today&apos;s trail · {selectedTrail.length} pings</span>
                  <span style={{ marginLeft:4, padding:'2px 6px', borderRadius:6,
                    background:`${C.blue}18`, color:C.blue, fontSize:10, fontWeight:700,
                    display:'inline-flex', alignItems:'center', gap:3 }}>
                    ↓ CSV
                  </span>
                </button>
              )}

              <div style={{ position:'absolute', bottom:12, left:12,
                background:'var(--s1)', border:`1px solid ${C.border}`,
                borderRadius:10, padding:'8px 12px', display:'flex', gap:10, flexWrap:'wrap' }}>
                {LAYERS.filter(l => activeLayers.has(l.id)).map(l => (
                  <div key={l.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:C.gray }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:l.color }}/>
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {(selFE || selOut || selWH) && (
              <div className="lt-detail" style={{ background:C.s2, border:`1px solid ${C.border}`, borderTop:'none',
                borderRadius:'0 0 16px 16px', padding:'14px 18px',
                display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                <button onClick={() => { setSelectedId(null); setSelectedType(null); }}
                  style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8,
                    width:28, height:28, cursor:'pointer', color:C.gray, fontSize:14, flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>

                {selFE && (
                  <>
                    <div style={{ width:40, height:40, borderRadius:'50%', flexShrink:0,
                      background:`${STATUS_COLOR[selFE.status]||C.grayd}20`,
                      border:`2px solid ${STATUS_COLOR[selFE.status]||C.grayd}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:17,
                      color:STATUS_COLOR[selFE.status]||C.grayd }}>
                      {(selFE.name||'?')[0]}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white, display:'flex', alignItems:'center', gap:8 }}>
                        {selFE.name}
                        {selFE.battery_percentage != null && (
                          <span style={{ fontSize:11, color:selFE.battery_percentage < 20 ? C.red : C.gray, fontWeight:600 }}>
                            🔋 {selFE.battery_percentage}%
                          </span>
                        )}
                      </div>
                      {(selFE.device_model || selFE.os_version) && (
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1, display:'flex', alignItems:'center', gap:4 }}>
                          📱 {selFE.device_brand ? selFE.device_brand + ' ' : ''}{selFE.device_model || 'Device'}
                          {selFE.os_version && <span> · Android {selFE.os_version}</span>}
                        </div>
                      )}
                      {(selFE.is_mock || selFE.is_suspect) && (
                        <div style={{ fontSize:11, color:C.red, marginTop:4, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                          ⚠ {selFE.is_mock ? 'Mock/simulated GPS on the last fix' : 'Impossible-speed jump vs the previous fix'}
                          {selFE.suspect_reason && <span style={{ color:C.gray, fontWeight:500 }}>· {selFE.suspect_reason}</span>}
                        </div>
                      )}
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{selFE.employee_id||''} · {selFE.zone_name||'No zone'}</div>
                    </div>
                    {[
                      { l:'Status',    v: selFE.status.replace('_',' '), c: STATUS_COLOR[selFE.status]||C.gray },
                      { l:'Check-in',  v: selFE.checkin_at ? new Date(selFE.checkin_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—', c: C.white },
                      { l: (getStoredIndustryScope() === 'insurance' ? 'Meetings Today' : 'TFF Today'), v: String(selFE.today_tff ?? '—'), c: C.green },
                      { l:'Trail',     v: selectedTrail.length > 0 ? `${selectedTrail.length} pings` : '—', c: selectedTrail.length > 0 ? '#E01E2C' : C.gray },
                    ].map((s,i) => (
                      <div key={i} style={{ textAlign:'center' }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:s.c, textTransform:'capitalize' }}>{s.v}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{s.l}</div>
                      </div>
                    ))}
                    {selectedTrail.length > 0 && (
                      <button onClick={() => downloadTrailCsv(selFE as FELoc | null, selectedTrail)}
                        title="Download today's trail as CSV (opens in Excel)"
                        style={{ background:`${C.blue}18`, border:`1px solid ${C.blue}40`,
                          color:C.blue, padding:'8px 14px', borderRadius:10, fontSize:12,
                          fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                          display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        ↓ Download trail (Excel)
                      </button>
                    )}
                    {!selFE.lat && <div style={{ fontSize:11, color:C.yellow, padding:'4px 10px', background:C.yellowD, borderRadius:8 }}>⚠️ No GPS</div>}
                    <LocationBlock fe={selFE}/>
                  </>
                )}

                {selOut && (
                  <>
                    <div style={{ width:40, height:40, borderRadius:10, background:`${C.yellow}18`, border:`1px solid ${C.yellow}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏪</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{selOut.name}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{selOut.store_type||''} · {selOut.zone_name||'No zone'}</div>
                      {selOut.address && <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>📍 {selOut.address}</div>}
                    </div>
                    {!selOut.lat && <div style={{ fontSize:11, color:C.yellow, padding:'4px 10px', background:C.yellowD, borderRadius:8 }}>⚠️ No GPS — add lat/lng in Outlet Management</div>}
                  </>
                )}

                {selWH && (
                  <>
                    <div style={{ width:40, height:40, borderRadius:10, background:`${C.purple}18`, border:`1px solid ${C.purple}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏭</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{selWH.name}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{selWH.type||''} · {selWH.city||''}</div>
                      {selWH.address && <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>📍 {selWH.address}</div>}
                    </div>
                    {!selWH.latitude && <div style={{ fontSize:11, color:C.yellow, padding:'4px 10px', background:C.yellowD, borderRadius:8 }}>⚠️ No GPS — add coordinates in Warehouse</div>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
