'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlarmClock, CalendarOff, Coffee, LogOut, Navigation, Sunrise, UserCheck, UserX, type LucideIcon } from 'lucide-react';
import { T } from '../ui';
import { useTileSize } from '../../lib/useTileSize';

/**
 * Aurora charts — the New design's signature graphs (see app/aurora.css, "A · Aurora" in the design exploration).
 *
 *  • AttendanceAurora — the Attendance card: a ring where each TICK is one field executive, coloured by status, with a
 *    gap between status groups; the check-in rate in the middle; a status list with icon chips and one-line captions;
 *    a live clock; and a footer of facts (shown only when the API sends them).
 *  • AuroraArea — a smoothed area chart with a crosshair readout (hover, or arrow keys).
 *
 * Every colour comes from a token (--au-* status colours and --a-* glass tokens, defined in aurora.css), so both themes work.
 */

// ── helpers ─────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const nf = (n: number) => n.toLocaleString('en-IN');

/** "4:40 PM" in India time, ticking every `ms`. */
function useClock(ms = 30_000): string {
  const fmt = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), ms); return () => clearInterval(id); }, [ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return t;
}

/** "8:02 am" from an ISO timestamp, in India time; null when it isn't a date. */
export function timeIST(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toLowerCase();
}

// ── Attendance ──────────────────────────────────────────────────────────────

export interface AttendanceAuroraProps {
  present: number;        // active in the field now
  on_break: number;
  checked_out: number;
  absent: number;
  on_leave?: number | null;
  /** ISO timestamp of today's first check-in. */
  first_check_in?: string | null;
  /** How many checked in after the shift-start cut-off. */
  late_checkins?: number | null;
  /** Label for that cut-off, e.g. "10:00 am". */
  late_after?: string;
}

type GroupKey = 'active' | 'break' | 'out' | 'absent';
const GROUPS: { key: GroupKey; label: string; caption: string; color: string; icon: LucideIcon; pick: (p: AttendanceAuroraProps) => number }[] = [
  { key: 'active', label: 'Active',      caption: 'In the field now',      color: 'var(--au-good, #0AAC23)',    icon: Navigation, pick: (p) => p.present },
  { key: 'break',  label: 'On break',    caption: 'Paused their day',      color: 'var(--au-warn, #FBB315)',    icon: Coffee,     pick: (p) => p.on_break },
  { key: 'out',    label: 'Checked out', caption: 'Done for the day',      color: 'var(--au-neutral, #97A1B2)', icon: LogOut,     pick: (p) => p.checked_out },
  { key: 'absent', label: 'Absent',      caption: 'No check-in, no leave', color: 'var(--au-crit, #DC3C3D)',    icon: UserX,      pick: (p) => p.absent },
];

const BASE_SIZE = 220;

/** The tick ring: one rounded tick per person, a one-slot gap between status groups, clockwise from the top. */
function TickRing({ counts, hover, onHover, centre, size }: { counts: number[]; hover: GroupKey | null; onHover: (k: GroupKey | null) => void; centre: ReactNode; size: number }) {
  const people = counts.reduce((a, b) => a + b, 0);
  const slots = people + counts.filter((n) => n > 0).length;                 // + a gap after each non-empty group
  const cx = size / 2, r1 = size / 2 - 4, r0 = r1 - 18 * (size / BASE_SIZE);
  const pitch = (2 * Math.PI * ((r0 + r1) / 2)) / Math.max(slots, 1);        // px between neighbouring ticks
  const sw = clamp(pitch * 0.52, 1.1, 5 * (size / BASE_SIZE));

  const ticks: ReactNode[] = [];
  let i = 0;
  GROUPS.forEach((g, gi) => {
    for (let n = 0; n < counts[gi]; n++, i++) {
      const a = ((i + 0.5) / slots) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      ticks.push(
        <line key={`${g.key}-${n}`} x1={cx + c * r0} y1={cx + s * r0} x2={cx + c * r1} y2={cx + s * r1} stroke={g.color} strokeWidth={sw} strokeLinecap="round"
          opacity={hover === null || hover === g.key ? 1 : 0.2} style={{ transition: 'opacity .12s ease' }} onMouseEnter={() => onHover(g.key)} />,
      );
    }
    if (counts[gi] > 0) i++;                                                  // the gap
  });

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} onMouseLeave={() => onHover(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Attendance today: ${GROUPS.map((g, gi) => `${counts[gi]} ${g.label.toLowerCase()}`).join(', ')}.`}>
        {ticks}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', gap: 4, pointerEvents: 'none' }}>{centre}</div>
    </div>
  );
}

export function AttendanceAurora(props: AttendanceAuroraProps) {
  const { on_leave, first_check_in, late_checkins, late_after = '10:00 am' } = props;
  const clock = useClock();
  const [hover, setHover] = useState<GroupKey | null>(null);
  // In a movable tile the ring takes the room the tile has (never smaller than the designed size).
  const tile = useTileSize();
  const ringSize = tile ? Math.round(clamp(Math.min(tile.width * 0.42, tile.height - 170), BASE_SIZE, 340)) : BASE_SIZE;
  const k = ringSize / BASE_SIZE;

  const counts = GROUPS.map((g) => g.pick(props));
  const people = counts.reduce((a, b) => a + b, 0);
  const checkedIn = props.present + props.on_break + props.checked_out;
  const pct = people > 0 ? Math.round((checkedIn / people) * 100) : 0;
  const focus = hover ? GROUPS.find((g) => g.key === hover) ?? null : null;

  const first = timeIST(first_check_in);
  const facts: { icon: LucideIcon; node: ReactNode }[] = [];
  if (typeof late_checkins === 'number') facts.push({ icon: AlarmClock, node: <><b>{nf(late_checkins)}</b> checked in after {late_after}</> });
  if (first) facts.push({ icon: Sunrise, node: <>First check-in <b>{first}</b></> });
  if (typeof on_leave === 'number') facts.push({ icon: CalendarOff, node: <><b>{nf(on_leave)}</b> on approved leave</> });

  const centre = focus ? (
    <>
      <span className="km-au-num" style={{ fontSize: Math.round(52 * k) }}>{nf(counts[GROUPS.indexOf(focus)])}</span>
      <small style={{ fontSize: 12, color: 'var(--a-ink-2, var(--dim))' }}>{focus.label.toLowerCase()}</small>
    </>
  ) : (
    <>
      <span className="km-au-num" style={{ fontSize: Math.round(52 * k) }}>{pct}%</span>
      <small style={{ fontSize: 12, color: 'var(--a-ink-2, var(--dim))' }}>{nf(checkedIn)} of {nf(people)} checked in</small>
    </>
  );

  return (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      <CardHead tint="var(--au-good, #0AAC23)" icon={UserCheck} title="Attendance today" sub="Each tick is one field executive"
        right={<span className="km-livepill"><span className="km-livedot" />{clock}</span>} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center' }}>
        <TickRing counts={counts} hover={hover} onHover={setHover} centre={centre} size={ringSize} />
        <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 2 }} onMouseLeave={() => setHover(null)}>
          {GROUPS.map((g, gi) => {
            const Ico = g.icon;
            return (
              <div key={g.key} onMouseEnter={() => setHover(g.key)} className="km-au-row" data-on={hover === g.key ? '1' : undefined}
                style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12,
                  opacity: hover === null || hover === g.key ? 1 : 0.55, transition: 'background .12s ease, opacity .12s ease' }}>
                <span aria-hidden className="km-au-ic" style={{ position: 'relative', width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center' }}>
                  <Ico size={15} strokeWidth={1.7} />
                  <span style={{ position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 999, background: g.color, boxShadow: '0 0 0 2px var(--a-ring, var(--card))' }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text, minWidth: 0 }}>
                  {g.label}
                  <small style={{ display: 'block', color: 'var(--a-ink-3, var(--mute))', fontSize: 11.5, fontWeight: 400 }}>{g.caption}</small>
                </span>
                <span className="km-au-num" style={{ fontSize: 18 }}>{nf(counts[gi])}</span>
              </div>
            );
          })}
        </div>
      </div>

      {facts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', paddingTop: 12, borderTop: '1px solid var(--a-grid, var(--border))', fontSize: 12, color: 'var(--a-ink-2, var(--dim))' }}>
          {facts.map((f, i) => {
            const Ico = f.icon;
            return <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico size={14} strokeWidth={1.7} aria-hidden />{f.node}</span>;
          })}
        </div>
      )}
    </div>
  );
}

/** A card heading in the Aurora style: tinted glass icon chip, title, caption, and a slot on the right. */
export function CardHead({ icon: Ico, tint, title, sub, right }: { icon: LucideIcon; tint: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden className="km-lz" style={{ ['--tint' as string]: tint, width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'inline-grid', placeItems: 'center' } as CSSProperties}>
        <Ico size={18} strokeWidth={1.7} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--a-ink-3, var(--mute))' }}>{sub}</div>}
      </div>
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}

// ── Area chart ──────────────────────────────────────────────────────────────

/** Monotone cubic through the points — smooth, and never overshoots the data. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1].x - pts[i].x); dy.push(pts[i + 1].y - pts[i].y); m.push(dy[i] / (dx[i] || 1)); }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

export interface AreaPoint { label: string; short?: string; value: number }

/** Smoothed area with a crosshair readout: hover it, or focus it and use ← →. */
export function AuroraArea({ data, color = 'var(--au-good, #0AAC23)', height: heightProp = 210, unit = '', ariaLabel, fill = false, reserve = 200 }: {
  data: AreaPoint[]; color?: string; height?: number; unit?: string; ariaLabel?: string;
  /** In a movable tile, use the room the tile has (its height minus `reserve` px for what sits around the chart). */
  fill?: boolean; reserve?: number;
}) {
  const tile = useTileSize();
  const height = fill && tile ? Math.round(clamp(tile.height - reserve, heightProp, 640)) : heightProp;
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [idx, setIdx] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el); setW(Math.max(240, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const m = { l: 40, r: 14, t: 12, b: 26 };
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const X = (i: number) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const Y = (v: number) => m.t + ih - (v / top) * ih;
  const pts = useMemo(() => data.map((d, i) => ({ x: X(i), y: Y(d.value) })), [data, w, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = smoothPath(pts);
  const base = m.t + ih;
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z` : '';
  const avg = n ? data.reduce((s, d) => s + d.value, 0) / n : 0;

  const grid: ReactNode[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid.push(<g key={v}><line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--a-axis)' : 'var(--a-grid)'} strokeWidth={1} />
      <text x={m.l - 8} y={Y(v) + 4} textAnchor="end" className="km-au-tick">{abbr(v)}</text></g>);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));

  const pick = (clientX: number) => {
    const el = wrap.current; if (!el || n === 0) return;
    const x = clientX - el.getBoundingClientRect().left;
    setIdx(clamp(Math.round(((x - m.l) / (iw || 1)) * (n - 1)), 0, n - 1));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setIdx((i) => clamp((i ?? -1) + 1, 0, n - 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx((i) => clamp((i ?? n) - 1, 0, n - 1)); }
    else if (e.key === 'Escape') setIdx(null);
  };

  const cur = idx != null ? data[idx] : null;
  const tipLeft = idx != null ? clamp(X(idx), 70, w - 70) : 0;

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" tabIndex={0} aria-label={ariaLabel ?? 'Area chart'}
        onMouseMove={(e) => pick(e.clientX)} onMouseLeave={() => setIdx(null)} onKeyDown={onKey} onBlur={() => setIdx(null)} style={{ display: 'block', outline: 'none', width: '100%', height }}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.42} /><stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        {avg > 0 && <line x1={m.l} x2={w - m.r} y1={Y(avg)} y2={Y(avg)} stroke="var(--a-axis)" strokeDasharray="4 4" />}
        {area && <path d={area} fill={`url(#g${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 4px 10px color-mix(in srgb, currentColor 30%, transparent))' }} />}
        {data.map((d, i) => (i % every === 0 || i === n - 1) && (
          <text key={i} x={X(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className="km-au-tick">{d.short ?? d.label}</text>
        ))}
        {idx != null && (
          <g pointerEvents="none">
            <line x1={X(idx)} x2={X(idx)} y1={m.t} y2={base} stroke="var(--a-axis)" strokeWidth={1} />
            <circle cx={X(idx)} cy={Y(data[idx].value)} r={9} fill={color} opacity={0.18} />
            <circle cx={X(idx)} cy={Y(data[idx].value)} r={4.5} fill={color} stroke="var(--a-solid, var(--card))" strokeWidth={2} />
          </g>
        )}
      </svg>
      {cur && (
        <div className="km-chart-tip" role="status" style={{ position: 'absolute', top: 0, left: tipLeft, transform: 'translate(-50%, -4px)', pointerEvents: 'none', padding: '6px 10px', borderRadius: 10,
          fontSize: 12, whiteSpace: 'nowrap', background: 'var(--card)', border: '1px solid var(--border)', color: T.text, boxShadow: 'var(--shadow-pop)' }}>
          <div style={{ color: 'var(--a-ink-3, var(--mute))', fontSize: 11 }}>{cur.label}</div>
          <div style={{ fontFamily: T.heading, fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{nf(cur.value)}{unit && <span style={{ fontWeight: 500, fontSize: 11, marginLeft: 4, color: 'var(--a-ink-2, var(--dim))' }}>{unit}</span>}</div>
        </div>
      )}
    </div>
  );
}

function niceStep(max: number, target: number): number {
  const raw = max / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const abbr = (v: number) => (v >= 10000 ? `${+(v / 1000).toFixed(1)}K` : nf(v));


/** A small trend line under a number: smoothed, with a soft fill. Scales to its container's width. */
export function AuroraSpark({ values, color = 'var(--au-good, #0AAC23)', height = 48, label }: { values: number[]; color?: string; height?: number; label?: string }) {
  const gid = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const W = 100, pad = 3;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => ({ x: (W * i) / (values.length - 1), y: pad + (height - pad * 2) * (1 - (v - lo) / span) }));
  const line = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label ?? 'Trend'} style={{ display: 'block', width: '100%', height }}>
      <defs><linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={`url(#s${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
