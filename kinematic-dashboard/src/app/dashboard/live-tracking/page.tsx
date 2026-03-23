'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1', tealD:'rgba(0,201,177,0.08)',
  orange:'#FF7A30',
};

/* ── Types ── */
interface FELoc {
  id: string; name: string; employee_id?: string;
  role: string; zone_name?: string; city?: string;
  status: 'active'|'on_break'|'checked_out'|'absent';
  lat: number|null; lng: number|null;
  checkin_at?: string; checkout_at?: string;
  total_hours?: number; address?: string;
  today_engagements?: number; today_tff?: number;
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

/* ── Layer config ── */
const LAYERS = [
  { id:'fe',         label:'Field Executives', icon:'👤', color:C.green  },
  { id:'supervisor', label:'Supervisors',       icon:'👔', color:C.blue   },
  { id:'outlet',     label:'Outlets',           icon:'🏪', color:C.yellow },
  { id:'warehouse',  label:'Warehouses',        icon:'🏭', color:C.purple },
];

const STATUS_COLOR: Record<string, string> = {
  active:      C.green,
  on_break:    C.yellow,
  checked_out: C.blue,
  absent:      C.grayd,
};

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

/* ── Map Component ── */
function LiveMap({
  fes, supervisors, outlets, warehouses,
  activeLayers, selectedId, onSelect,
  mapLoaded,
}: {
  fes: FELoc[]; supervisors: FELoc[]; outlets: Outlet[]; warehouses: Warehouse[];
  activeLayers: Set<string>; selectedId: string|null; onSelect:(id:string,type:string)=>void;
  mapLoaded: boolean;
}) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markers = useRef<any[]>([]);

  // Init map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInst.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, { zoomControl:false, attributionControl:false })
      .setView([28.6139, 77.209], 10); // Default: Delhi
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(map);
    L.control.zoom({ position:'bottomright' }).addTo(map);
    mapInst.current = map;
  }, [mapLoaded]);

  // Update markers
  useEffect(() => {
    if (!mapLoaded || !mapInst.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear old markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    const addMarker = (lat: number, lng: number, html: string, popup: string, id: string, type: string) => {
      const icon = L.divIcon({ html, className:'', iconSize:[32,32], iconAnchor:[16,16] });
      const m = L.marker([lat, lng], { icon })
        .addTo(mapInst.current)
        .bindPopup(popup, { className:'km-popup' })
        .on('click', () => onSelect(id, type));
      markers.current.push(m);
    };

    // FEs
    if (activeLayers.has('fe')) {
      fes.filter(fe => fe.lat && fe.lng).forEach(fe => {
        const c = STATUS_COLOR[fe.status] || C.grayd;
        const sel = selectedId === fe.id;
        const html = `<div style="width:32px;height:32px;border-radius:50%;background:${c};border:${sel?'3px solid #fff':'2px solid #0E1420'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#000;box-shadow:0 2px 12px rgba(0,0,0,.6);${sel?'transform:scale(1.2)':''}">${fe.name[0]}</div>`;
        const popup = popupHtml(fe.name, fe.role, c, fe.status, fe.zone_name, fe.checkin_at, fe.today_engagements, fe.today_tff);
        addMarker(fe.lat!, fe.lng!, html, popup, fe.id, 'fe');
      });
    }

    // Supervisors
    if (activeLayers.has('supervisor')) {
      supervisors.filter(s => s.lat && s.lng).forEach(sup => {
        const c = STATUS_COLOR[sup.status] || C.grayd;
        const html = `<div style="width:32px;height:32px;border-radius:8px;background:${C.blue};border:2px solid #0E1420;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.6)">${sup.name[0]}</div>`;
        const popup = popupHtml(sup.name, 'Supervisor', c, sup.status, sup.zone_name, sup.checkin_at);
        addMarker(sup.lat!, sup.lng!, html, popup, sup.id, 'supervisor');
      });
    }

    // Outlets
    if (activeLayers.has('outlet')) {
      outlets.filter(o => o.lat && o.lng).forEach(o => {
        const html = `<div style="width:28px;height:28px;border-radius:6px;background:${C.yellow};border:2px solid #0E1420;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.5)">🏪</div>`;
        const popup = `<div style="font-family:DM Sans,sans-serif;font-size:12px;color:#E8EDF8;background:#0E1420;padding:10px 12px;border-radius:8px;min-width:150px"><div style="font-weight:700;margin-bottom:4px">${o.name}</div>${o.store_type?`<div style="color:#7A8BA0;font-size:11px">${o.store_type}</div>`:''}<div style="color:#7A8BA0;font-size:11px;margin-top:4px">${o.zone_name||''}</div>${o.address?`<div style="color:#2E445E;font-size:10px;margin-top:2px">${o.address}</div>`:''}</div>`;
        addMarker(o.lat!, o.lng!, html, popup, o.id, 'outlet');
      });
    }

    // Warehouses
    if (activeLayers.has('warehouse')) {
      warehouses.filter(w => w.latitude && w.longitude).forEach(w => {
        const html = `<div style="width:30px;height:30px;border-radius:6px;background:${C.purple};border:2px solid #0E1420;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.5)">🏭</div>`;
        const popup = `<div style="font-family:DM Sans,sans-serif;font-size:12px;color:#E8EDF8;background:#0E1420;padding:10px 12px;border-radius:8px;min-width:150px"><div style="font-weight:700;margin-bottom:4px">${w.name}</div>${w.type?`<div style="color:#7A8BA0;font-size:11px">${w.type}</div>`:''}<div style="color:#7A8BA0;font-size:11px;margin-top:4px">${w.city||''}</div></div>`;
        addMarker(w.latitude!, w.longitude!, html, popup, w.id, 'warehouse');
      });
    }

    // Auto-fit bounds if markers exist
    const hasPins = markers.current.length > 0;
    if (hasPins) {
      const group = L.featureGroup(markers.current);
      mapInst.current.fitBounds(group.getBounds().pad(0.15));
    }

  }, [mapLoaded, fes, supervisors, outlets, warehouses, activeLayers, selectedId, onSelect]);

  const popupHtml = (name:string, role:string, color:string, status:string, zone?:string, checkinAt?:string, engagements?:number, tff?:number) =>
    `<div style="font-family:DM Sans,sans-serif;font-size:12px;color:#E8EDF8;background:#0E1420;padding:10px 12px;border-radius:8px;min-width:160px">
      <div style="font-weight:700;margin-bottom:2px">${name}</div>
      <div style="color:#7A8BA0;font-size:11px;margin-bottom:6px">${role}${zone?` · ${zone}`:''}</div>
      <div style="display:inline-flex;padding:2px 8px;border-radius:20px;background:${color}20;color:${color};font-size:10px;font-weight:700;text-transform:capitalize">${status.replace('_',' ')}</div>
      ${tff!=null?`<div style="color:#7A8BA0;font-size:10px;margin-top:2px">TFF (Total forms filled): ${tff||0}</div>`:''}
    </div>`;

  return (
    <>
      <style>{`.km-popup .leaflet-popup-content-wrapper{background:#0E1420;border:1px solid #1E2D45;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);padding:0}.km-popup .leaflet-popup-content{margin:0}.km-popup .leaflet-popup-tip{background:#0E1420}`}</style>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
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

  // Filters
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter,   setZoneFilter]   = useState('all');
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['fe','supervisor','outlet','warehouse']));

  // Selection
  const [selectedId,   setSelectedId]   = useState<string|null>(null);
  const [selectedType, setSelectedType] = useState<string|null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') || '' : '';
  const headers = { Authorization: `Bearer ${token}` };

  /* ── Load Leaflet ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).L) { setMapLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => setMapLoaded(true);
    document.head.appendChild(s);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }, []);

  /* ── Fetch all data ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = { Authorization: `Bearer ${token}` };
      const [locRes, outletRes, whRes, zoneRes] = await Promise.allSettled([
        api.get<any>('/api/v1/analytics/live-locations', { headers: hdrs }),
        api.get<any>('/api/v1/stores?limit=500',         { headers: hdrs }),
        api.get<any>('/api/v1/warehouses',               { headers: hdrs }),
        api.get<any>('/api/v1/zones',                    { headers: hdrs }),
      ]);

      if (locRes.status === 'fulfilled') {
        const locs: FELoc[] = (locRes.value?.data ?? locRes.value)?.locations || (locRes.value?.data ?? locRes.value) || [];
        setFEs(locs.filter((l:FELoc) => ['executive', 'field_executive', 'field-executive'].includes(l.role) || !l.role));
        setSupervisors(locs.filter((l:FELoc) => ['supervisor', 'city_manager', 'program_manager'].includes(l.role)));
      }
      if (outletRes.status === 'fulfilled') {
        const raw = outletRes.value?.data ?? outletRes.value;
        setOutlets(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (whRes.status === 'fulfilled') {
        const raw = whRes.value?.data ?? whRes.value;
        setWarehouses(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (zoneRes.status === 'fulfilled') {
        const raw = zoneRes.value?.data ?? zoneRes.value;
        setZones(Array.isArray(raw) ? raw : []);
      }
      setLastSync(new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }));
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(fetchAll, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

  /* ── Derived / filtered ── */
  const q = search.toLowerCase();

  const filteredFEs = fes.filter(fe => {
    const matchSearch = !search || fe.name?.toLowerCase().includes(q) || fe.employee_id?.toLowerCase().includes(q) || fe.zone_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || fe.status === statusFilter;
    const matchZone   = zoneFilter === 'all' || zones.find(z => z.name === fe.zone_name)?.id === zoneFilter;
    return matchSearch && matchStatus && matchZone;
  });

  const filteredSups = supervisors.filter(s => {
    const matchSearch = !search || s.name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
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

  // Stats
  const activeCount  = fes.filter(f => f.status === 'active').length;
  const breakCount   = fes.filter(f => f.status === 'on_break').length;
  const outCount     = fes.filter(f => f.status === 'checked_out').length;
  const absentCount  = fes.filter(f => f.status === 'absent').length;

  // Selected entity details
  const selFE  = selectedType === 'fe'         ? fes.find(f => f.id === selectedId)
               : selectedType === 'supervisor'  ? supervisors.find(s => s.id === selectedId) : null;
  const selOut = selectedType === 'outlet'      ? outlets.find(o => o.id === selectedId) : null;
  const selWH  = selectedType === 'warehouse'   ? warehouses.find(w => w.id === selectedId) : null;

  const inp: React.CSSProperties = {
    padding:'8px 12px', borderRadius:10, border:`1.5px solid ${C.border}`,
    background:C.s3, color:C.white, fontSize:12, fontFamily:"'DM Sans',sans-serif",
    outline:'none', colorScheme:'dark' as any,
  };

  return (
    <>
      <style>{`
        @keyframes km-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes kspin     { to{transform:rotate(360deg)} }
        @keyframes kpulse    { 0%,100%{opacity:1} 50%{opacity:.2} }
        .leaflet-container   { background:#070D18 !important; }
        .lt-row:hover        { background:${C.s3} !important; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', gap:16, animation:'km-fadein .3s ease' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12, flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:C.white, letterSpacing:'-0.3px' }}>
              Live Tracking
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
              Real-time field visibility — FEs, supervisors, outlets & warehouses
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {lastSync && <span style={{ fontSize:11, color:C.grayd }}>Last sync: {lastSync}</span>}
            <button onClick={fetchAll} style={{ padding:'8px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, color:C.gray, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
              {loading ? <Spin/> : '↺'} Refresh
            </button>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div style={{ display:'flex', gap:10, flexShrink:0 }}>
          {[
            { l:'Active',      v:activeCount, c:C.green  },
            { l:'On Break',    v:breakCount,  c:C.yellow },
            { l:'Checked Out', v:outCount,    c:C.blue   },
            { l:'Absent',      v:absentCount, c:C.grayd  },
            { l:'Outlets',     v:outlets.filter(o=>o.is_active).length, c:C.yellow },
            { l:'Warehouses',  v:warehouses.filter(w=>w.is_active).length, c:C.purple },
          ].map((s,i) => (
            <div key={i} style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 16px', textAlign:'center', flex:1 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:s.c }}>{loading?'—':s.v}</div>
              <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── Filters row ── */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', flexShrink:0 }}>
          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.grayd }}>🔍</span>
            <input placeholder="Search FE, supervisor, outlet, warehouse…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inp, width:'100%', paddingLeft:30 }}/>
          </div>
          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inp, minWidth:130 }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="on_break">On Break</option>
            <option value="checked_out">Checked Out</option>
            <option value="absent">Absent</option>
          </select>
          {/* Zone */}
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            style={{ ...inp, minWidth:140 }}>
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {/* Layer toggles */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {LAYERS.map(l => (
              <button key={l.id} onClick={() => toggleLayer(l.id)}
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

        {/* ── Main content: map + sidebar ── */}
        <div style={{ flex:1, display:'flex', gap:16, minHeight:0 }}>

          {/* Sidebar list */}
          <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:0,
            background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>

            {/* Scrollable list */}
            <div style={{ flex:1, overflowY:'auto' }}>

              {/* FEs section */}
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
                        <div style={{ fontSize:13, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fe.name}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{fe.employee_id||''} {fe.zone_name?`· ${fe.zone_name}`:''}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                        <Dot color={STATUS_COLOR[fe.status]||C.grayd} size={7}/>
                        {fe.lat && fe.lng && <span style={{ fontSize:9, color:C.green }}>📍</span>}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Supervisors section */}
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
                        <div style={{ fontSize:13, fontWeight:700, color:C.white }}>{s.name}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:1 }}>{s.zone_name||'No zone'}</div>
                      </div>
                      <Dot color={STATUS_COLOR[s.status]||C.grayd} size={7}/>
                    </div>
                  ))}
                </>
              )}

              {/* Outlets section */}
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

              {/* Warehouses section */}
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

              {/* Empty state */}
              {filteredFEs.length === 0 && filteredSups.length === 0 &&
               filteredOutlets.length === 0 && filteredWarehouses.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 16px', color:C.grayd, fontSize:12 }}>
                  {loading ? <Spin/> : (search ? `No results for "${search}"` : 'No items to show')}
                </div>
              )}
            </div>
          </div>

          {/* Map + detail panel */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:0, minWidth:0 }}>

            {/* Map */}
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
              />

              {/* No GPS notice */}
              {!loading && fes.length > 0 && fes.every(f => !f.lat || !f.lng) && (
                <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)',
                  background:'rgba(14,20,32,.9)', border:`1px solid ${C.yellow}40`,
                  borderRadius:10, padding:'8px 14px', fontSize:12, color:C.yellow,
                  display:'flex', alignItems:'center', gap:7, pointerEvents:'none', whiteSpace:'nowrap' }}>
                  ⚠️ No GPS coordinates yet — FEs need to check in with location enabled
                </div>
              )}

              {/* Layer legend */}
              <div style={{ position:'absolute', bottom:12, left:12,
                background:'rgba(14,20,32,.9)', border:`1px solid ${C.border}`,
                borderRadius:10, padding:'8px 12px', display:'flex', gap:10, flexWrap:'wrap' }}>
                {LAYERS.filter(l => activeLayers.has(l.id)).map(l => (
                  <div key={l.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:C.gray }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:l.color }}/>
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Detail panel (shown when item selected) */}
            {(selFE || selOut || selWH) && (
              <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderTop:'none',
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
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:C.white }}>{selFE.name}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{selFE.employee_id||''} · {selFE.zone_name||'No zone'}</div>
                    </div>
                    {[
                      { l:'Status',    v: selFE.status.replace('_',' '), c: STATUS_COLOR[selFE.status]||C.gray },
                      { l:'Check-in',  v: selFE.checkin_at ? new Date(selFE.checkin_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—', c: C.white },
                      { l:'TFF Today', v: String(selFE.today_tff ?? '—'), c: C.green },
                    ].map((s,i) => (
                      <div key={i} style={{ textAlign:'center' }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:s.c, textTransform:'capitalize' }}>{s.v}</div>
                        <div style={{ fontSize:10, color:C.grayd, marginTop:2 }}>{s.l}</div>
                      </div>
                    ))}
                    {!selFE.lat && <div style={{ fontSize:11, color:C.yellow, padding:'4px 10px', background:C.yellowD, borderRadius:8 }}>⚠️ No GPS</div>}
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
