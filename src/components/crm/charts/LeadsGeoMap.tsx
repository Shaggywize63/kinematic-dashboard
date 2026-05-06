'use client';
import { useMemo, useState } from 'react';

// Minimal lat/lng for the cities used by the demo data + common Indian metros.
// Anything not in this map is silently dropped from the geo view; add more as
// needed.
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

// Approximate India outline (~22 points). Roughly tracing the country at low
// resolution — enough to anchor the bubbles to a recognisable shape without
// shipping a full GeoJSON.
const INDIA_OUTLINE: Array<[number, number]> = [
  [74, 35], [77, 36], [80, 35], [83, 34], [88, 30], [92, 28], [97, 28],
  [95, 25], [93, 23], [89, 22], [88, 22], [86, 21], [84, 19], [82, 17],
  [80, 13], [78, 9], [77, 8], [75, 12], [73, 16], [73, 19], [72, 21],
  [70, 22], [68, 24], [70, 28], [73, 30], [75, 33], [74, 35],
];

const W = 560, H = 560;
const LNG_MIN = 68, LNG_MAX = 98;
const LAT_MIN = 7,  LAT_MAX = 37;

const project = (lat: number, lng: number) => ({
  x: ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
});

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

export default function LeadsGeoMap({ leads, height = 520 }: { leads: LeadGeoPoint[]; height?: number }) {
  // Group leads by mapped city. Anything we can't geocode goes to an unmapped
  // bucket so it's still visible in the legend.
  const { groups, unmapped } = useMemo(() => {
    const m = new Map<string, { city: string; lat: number; lng: number; count: number; statuses: Record<string, number>; sample: LeadGeoPoint[] }>();
    let unmappedCount = 0;
    for (const l of leads) {
      const key = (l.city || '').trim();
      const coord = key ? CITY_COORDS[key] : undefined;
      if (!coord) { unmappedCount += 1; continue; }
      const cur = m.get(key) ?? { city: key, lat: coord[0], lng: coord[1], count: 0, statuses: {}, sample: [] };
      cur.count += 1;
      const status = l.status ?? 'unknown';
      cur.statuses[status] = (cur.statuses[status] ?? 0) + 1;
      if (cur.sample.length < 5) cur.sample.push(l);
      m.set(key, cur);
    }
    return {
      groups: Array.from(m.values()).sort((a, b) => b.count - a.count),
      unmapped: unmappedCount,
    };
  }, [leads]);

  const max = groups.reduce((m, g) => Math.max(m, g.count), 1);
  const total = groups.reduce((s, g) => s + g.count, 0);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const outlinePath = INDIA_OUTLINE.map(([lng, lat], i) => {
    const { x, y } = project(lat, lng);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';

  const active = selected ?? hover;
  const activeGroup = groups.find((g) => g.city === active);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 14, height }}>
      {/* Map canvas */}
      <div style={{ position: 'relative', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* Subtle latitude/longitude grid */}
          <g stroke="var(--border)" strokeWidth="0.5" opacity="0.4">
            {[10, 15, 20, 25, 30, 35].map((lat) => {
              const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
              return <line key={`lat${lat}`} x1={0} x2={W} y1={y} y2={y} />;
            })}
            {[70, 75, 80, 85, 90, 95].map((lng) => {
              const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W;
              return <line key={`lng${lng}`} x1={x} x2={x} y1={0} y2={H} />;
            })}
          </g>
          {/* Country outline */}
          <path d={outlinePath} fill="var(--s2)" stroke="var(--text-dim)" strokeWidth="1.2" opacity="0.85" />
          {/* City bubbles */}
          {groups.map((g) => {
            const { x, y } = project(g.lat, g.lng);
            const r = 6 + (g.count / max) * 22;
            const isActive = active === g.city;
            const dominantStatus = Object.entries(g.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'new';
            const fill = STATUS_COLOR[dominantStatus] ?? '#3E9EFF';
            return (
              <g key={g.city} style={{ cursor: 'pointer' }}
                 onMouseEnter={() => setHover(g.city)}
                 onMouseLeave={() => setHover((h) => h === g.city ? null : h)}
                 onClick={() => setSelected((s) => s === g.city ? null : g.city)}>
                <circle cx={x} cy={y} r={r + 6} fill={fill} opacity={isActive ? 0.18 : 0.08} />
                <circle cx={x} cy={y} r={r} fill={fill} opacity={isActive ? 1 : 0.85} stroke="#fff" strokeWidth={isActive ? 2 : 1.2} />
                <text x={x} y={y + 4} textAnchor="middle" fill="#fff" fontWeight={800} fontSize={Math.min(13, 8 + g.count)}>{g.count}</text>
              </g>
            );
          })}
        </svg>
        {/* Floating tooltip near the active bubble */}
        {activeGroup && (() => {
          const { x, y } = project(activeGroup.lat, activeGroup.lng);
          const left = `${(x / W) * 100}%`;
          const top = `${(y / H) * 100}%`;
          return (
            <div style={{
              position: 'absolute', left, top, transform: 'translate(-50%, calc(-100% - 16px))',
              background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 12px', minWidth: 180, pointerEvents: 'none',
              boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{activeGroup.city}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{activeGroup.count} lead{activeGroup.count === 1 ? '' : 's'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(activeGroup.statuses).map(([st, n]) => (
                  <span key={st} style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${STATUS_COLOR[st] ?? '#888'}33`, color: STATUS_COLOR[st] ?? '#888' }}>
                    {st}: {n}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {/* Legend */}
        <div style={{ position: 'absolute', left: 10, bottom: 10, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_COLOR).map(([st, c]) => (
            <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{st}
            </span>
          ))}
        </div>
      </div>

      {/* Side panel: top cities + drill-down */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ padding: '10px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Geo summary</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{total.toLocaleString()} mapped</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{groups.length} cit{groups.length === 1 ? 'y' : 'ies'}{unmapped > 0 ? ` · ${unmapped} unmapped` : ''}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid var(--border)' }}>Top cities</div>
          {groups.length === 0 ? (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-dim)' }}>No leads with mapped cities yet.</div>
          ) : groups.map((g) => {
            const isSelected = selected === g.city;
            const dominantStatus = Object.entries(g.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'new';
            return (
              <button key={g.city}
                onClick={() => setSelected((s) => s === g.city ? null : g.city)}
                onMouseEnter={() => setHover(g.city)}
                onMouseLeave={() => setHover((h) => h === g.city ? null : h)}
                style={{
                  width: '100%', textAlign: 'left', background: isSelected ? 'var(--s4)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  padding: '8px 12px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[dominantStatus] }} />
                  {g.city}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{g.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
