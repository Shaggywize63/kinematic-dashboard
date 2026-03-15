'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

/* ─── colour palette — matches the rest of the dashboard ─── */
const C = {
  bg:      '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border:  '#1E2D45', borderL: '#253650',
  white:   '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E', graydd: '#1A2738',
  red:     '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.2)',
  green:   '#00D97E', greenD: 'rgba(0,217,126,0.08)',
  blue:    '#3E9EFF', blueD: 'rgba(62,158,255,0.10)',
  yellow:  '#FFB800', yellowD: 'rgba(255,184,0,0.08)',
  purple:  '#9B6EFF',
};

/* ─── API response types ─── */
interface HourCell { hour: number; cc: number; ecc: number; total: number; }
interface DayRow   { day: string; day_index: number; hours: HourCell[]; }
interface HeatmapResponse {
  since: string;
  total_records: number;
  grid: DayRow[];
}

/* ─── tiny helpers ─── */
const Shimmer = ({ w = '100%', h = 16, br = 4 }: { w?: string|number; h?: number; br?: number }) => (
  <div style={{ width: w, height: h, borderRadius: br, background: C.s3, overflow: 'hidden', position: 'relative' }}>
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(90deg, transparent 0%, ${C.border} 50%, transparent 100%)`,
      animation: 'km-shimmer 1.3s ease-in-out infinite',
    }}/>
  </div>
);

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/* cell fill colour: empty → low red → full red */
const cellBg = (cc: number, max: number): string => {
  if (!cc || !max) return C.s3;
  const p = cc / max;
  if (p < 0.10) return 'rgba(224,30,44,0.18)';
  if (p < 0.30) return 'rgba(224,30,44,0.38)';
  if (p < 0.55) return 'rgba(224,30,44,0.62)';
  if (p < 0.80) return 'rgba(224,30,44,0.82)';
  return C.red;
};

/* ─── tooltip ─── */
interface TipData { day: string; hour: number; cc: number; ecc: number; x: number; y: number; }
const Tooltip = ({ tip }: { tip: TipData | null }) => {
  if (!tip) return null;
  return (
    <div style={{
      position:   'fixed',
      left:       tip.x + 16,
      top:        tip.y - 56,
      background: C.s2,
      border:     `1px solid ${C.borderL}`,
      borderRadius: 10,
      padding:    '10px 14px',
      fontSize:   12,
      color:      C.white,
      pointerEvents: 'none',
      zIndex:     9999,
      boxShadow:  '0 8px 28px rgba(0,0,0,.55)',
      minWidth:   170,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>
        {tip.day} · {String(tip.hour).padStart(2,'0')}:00–{String(tip.hour + 1).padStart(2,'0')}:00
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>Contacts (CC)</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: C.blue, lineHeight: 1 }}>{tip.cc}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>Effective (ECC)</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: C.green, lineHeight: 1 }}>{tip.ecc}</div>
        </div>
        {tip.cc > 0 && (
          <div>
            <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>Rate</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: C.yellow, lineHeight: 1 }}>
              {Math.round((tip.ecc / tip.cc) * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════ */
export default function AnalyticsPage() {

  const [data,     setData]    = useState<HeatmapResponse | null>(null);
  const [loading,  setLoading] = useState(true);
  const [err,      setErr]     = useState('');
  const [tip,      setTip]     = useState<TipData | null>(null);
  const [lastSync, setSync]    = useState('');

  /* ── fetch ── */
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await api.get<any>('/api/v1/analytics/contact-heatmap');
      // api.get may return { data: ... } or the object directly
      const payload: HeatmapResponse = res?.data ?? res;
      setData(payload);
      setSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setErr(e?.message || 'Failed to load heatmap data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── derived values ── */
  const grid = data?.grid ?? [];

  const maxCC = grid.length
    ? Math.max(...grid.flatMap(d => d.hours.map(h => h.cc)), 1)
    : 1;

  const hourSums: number[] = HOURS.map(h =>
    grid.reduce((sum, day) => sum + (day.hours[h]?.cc ?? 0), 0)
  );
  const maxHourSum = Math.max(...hourSums, 1);
  const peakHourIdx = hourSums.indexOf(Math.max(...hourSums));

  const dayTotals = grid.map(d => ({
    cc:  d.hours.reduce((s, h) => s + h.cc, 0),
    ecc: d.hours.reduce((s, h) => s + h.ecc, 0),
  }));
  const grandCC  = dayTotals.reduce((s, t) => s + t.cc, 0);
  const grandECC = dayTotals.reduce((s, t) => s + t.ecc, 0);

  /* ──────────────────────────────────── RENDER ── */
  return (
    <>
      <style>{`
        @keyframes km-shimmer  { 0% { transform:translateX(-100%) } 100% { transform:translateX(100%) } }
        @keyframes km-fadein   { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes kspin       { to { transform:rotate(360deg) } }
        .km-cell {
          height: 22px;
          border-radius: 3px;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .km-cell[data-hot='true'] {
          cursor: pointer;
        }
        .km-cell[data-hot='true']:hover {
          transform: scale(1.4);
          position: relative;
          z-index: 10;
          box-shadow: 0 0 10px rgba(224,30,44,0.65);
        }
        .km-heatmap { animation: km-fadein .35s ease both; }
        .kbtn { transition: opacity .13s, transform .13s; cursor: pointer; }
        .kbtn:hover  { opacity: .82; }
        .kbtn:active { transform: scale(.96); }
      `}</style>

      <Tooltip tip={tip}/>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'km-fadein .3s ease' }}>

        {/* ── page title ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: C.white }}>
              Analytics
            </div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>
              Contact activity · last 7 days
              {lastSync && <span style={{ color: C.grayd, marginLeft: 8 }}>· synced {lastSync}</span>}
            </div>
          </div>
          <button
            className="kbtn"
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: C.s2, border: `1px solid ${C.border}`,
              borderRadius: 10, fontSize: 12, fontWeight: 600,
              color: loading ? C.grayd : C.gray,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              style={loading ? { animation: 'kspin .8s linear infinite' } : {}}>
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* ── error banner ── */}
        {err && (
          <div style={{
            background: C.redD, border: `1px solid ${C.redB}`,
            borderRadius: 12, padding: '11px 16px',
            fontSize: 13, color: C.red, display: 'flex', gap: 9, alignItems: 'center',
          }}>
            ⚠ {err}
            <button onClick={() => setErr('')}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            HEATMAP CARD
        ══════════════════════════════════════════════ */}
        <div style={{
          background:   C.s2,
          border:       `1px solid ${C.border}`,
          borderRadius: 18,
          overflow:     'hidden',
        }}>

          {/* card header */}
          <div style={{
            padding:      '18px 22px',
            borderBottom: `1px solid ${C.border}`,
            display:      'flex',
            justifyContent: 'space-between',
            alignItems:   'center',
          }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: C.white }}>
                Contact Activity Heatmap
              </div>
              <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                Density by day &amp; hour · submissions from the field
              </div>
            </div>

            {/* colour legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gray }}>
              <span>Low</span>
              {[0, 0.25, 0.50, 0.75, 1].map((p, i) => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: 2,
                  background: p === 0 ? C.s3 : cellBg(p * maxCC, maxCC),
                  border: p === 0 ? `1px solid ${C.border}` : 'none',
                }}/>
              ))}
              <span>High</span>
            </div>
          </div>

          {/* ── summary stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${C.border}` }}>
            {[
              { label: 'Total CC (7d)',  value: loading ? null : grandCC,  color: C.blue   },
              { label: 'Total ECC (7d)', value: loading ? null : grandECC, color: C.green  },
              { label: 'ECC Rate',
                value: loading ? null : (grandCC > 0 ? `${Math.round((grandECC / grandCC) * 100)}%` : '—'),
                color: C.yellow },
              { label: 'Peak Hour',
                value: loading ? null : (hourSums[peakHourIdx] > 0 ? `${String(peakHourIdx).padStart(2,'0')}:00` : '—'),
                color: C.red },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 20px', borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}>
                {s.value === null
                  ? <Shimmer w="55%" h={24} br={5}/>
                  : <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                }
                <div style={{ fontSize: 11, color: C.gray, marginTop: s.value === null ? 6 : 5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── grid body ── */}
          <div style={{ padding: '20px 22px' }}>

            {loading ? (
              /* skeleton */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(24,1fr)', gap: 3, marginBottom: 4 }}>
                  <div/>
                  {HOURS.map(h => <Shimmer key={h} h={10} br={2}/>)}
                </div>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px repeat(24,1fr)', gap: 3, alignItems: 'center' }}>
                    <Shimmer w="70%" h={12} br={3}/>
                    {HOURS.map(h => <Shimmer key={h} h={22} br={3}/>)}
                  </div>
                ))}
              </div>
            ) : grid.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: C.grayd, fontSize: 13 }}>
                No form submissions in the last 7 days
              </div>
            ) : (
              <div className="km-heatmap">

                {/* hour axis labels */}
                <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(24,1fr)', gap: 3, marginBottom: 5 }}>
                  <div/>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      fontSize: 9, textAlign: 'center',
                      color:     h === peakHourIdx && hourSums[h] > 0 ? C.red : C.grayd,
                      fontWeight: h === peakHourIdx && hourSums[h] > 0 ? 700 : 400,
                    }}>
                      {h % 6 === 0 ? h : ''}
                    </div>
                  ))}
                </div>

                {/* day rows */}
                {grid.map((row) => (
                  <div key={row.day} style={{
                    display: 'grid',
                    gridTemplateColumns: '44px repeat(24,1fr)',
                    gap: 3, marginBottom: 3, alignItems: 'center',
                  }}>
                    {/* day label */}
                    <div style={{
                      fontSize: 11, color: C.gray, fontWeight: 600,
                      textAlign: 'right', paddingRight: 6, whiteSpace: 'nowrap',
                    }}>
                      {row.day}
                    </div>

                    {/* cells */}
                    {row.hours.map((cell) => {
                      const hot = cell.cc > 0;
                      return (
                        <div
                          key={cell.hour}
                          className="km-cell"
                          data-hot={hot ? 'true' : 'false'}
                          style={{ background: cellBg(cell.cc, maxCC) }}
                          onMouseEnter={e => hot && setTip({ day: row.day, hour: cell.hour, cc: cell.cc, ecc: cell.ecc, x: e.clientX, y: e.clientY })}
                          onMouseMove={e  => hot && setTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                          onMouseLeave={()  => setTip(null)}
                        />
                      );
                    })}
                  </div>
                ))}

                {/* hour-sum bar chart (micro sparkline) */}
                <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(24,1fr)', gap: 3, marginTop: 10, alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 9, color: C.grayd, textAlign: 'right', paddingRight: 6, lineHeight: 1 }}>total</div>
                  {hourSums.map((sum, h) => {
                    const barH = Math.max((sum / maxHourSum) * 30, sum > 0 ? 2 : 0);
                    return (
                      <div
                        key={h}
                        style={{
                          height:        barH,
                          borderRadius:  '2px 2px 0 0',
                          background:    h === peakHourIdx && sum > 0 ? C.red : 'rgba(224,30,44,0.35)',
                          alignSelf:     'flex-end',
                          transition:    'height .4s ease',
                        }}
                        title={`${String(h).padStart(2,'0')}:00 — ${sum} contacts total`}
                      />
                    );
                  })}
                </div>

                {/* hour axis guide */}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 47, marginTop: 5 }}>
                  {['Midnight', '6am', 'Noon', '6pm', '11pm'].map(l => (
                    <span key={l} style={{ fontSize: 9, color: C.graydd }}>{l}</span>
                  ))}
                </div>

              </div>
            )}
          </div>

          {/* ── per-day totals footer ── */}
          {!loading && grid.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 22px' }}>
              <div style={{ fontSize: 10, color: C.grayd, marginBottom: 9, fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                Per-day summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                {grid.map((row, i) => {
                  const t = dayTotals[i];
                  return (
                    <div key={row.day} style={{
                      background:   C.s3,
                      border:       `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding:      '9px 0',
                      textAlign:    'center',
                    }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: t.cc > 0 ? C.blue : C.grayd, lineHeight: 1 }}>
                        {t.cc}
                      </div>
                      <div style={{ fontSize: 10, color: t.ecc > 0 ? C.green : C.grayd, marginTop: 3 }}>
                        {t.ecc > 0 ? `${t.ecc} ECC` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: C.grayd, marginTop: 3, fontWeight: 600 }}>
                        {row.day}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>{/* end heatmap card */}

      </div>
    </>
  );
}
