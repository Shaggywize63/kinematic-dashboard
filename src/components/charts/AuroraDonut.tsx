'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { CHART_PALETTE } from '../../lib/chartTheme';
import { useNewDesign } from '../../lib/useNewDesign';

/**
 * AuroraDonut — the New design's ring chart, the sibling of AttendanceAurora (see AuroraCharts.tsx and app/aurora.css).
 *
 * A thick ring of rounded-cap arcs with a small gap between slices and a soft glow in each slice's own colour, over a
 * quiet track; the total (or the hovered slice) in big Manrope numerals in the middle; a legend of colour dot, label,
 * caption, count and percent. Hovering or focusing a slice or a legend row dims the rest and the centre names it.
 *
 * Use it ONLY in the New design — at a call site wrap it with <NewDesignSwap classic={<original/>}>…</NewDesignSwap>
 * (Classic must keep rendering exactly what it always did).
 *
 * Gauge mode: pass `max` and the ring is value / max filled with the rest left as the track (a score or a probability);
 * pass `centre` to say what goes in the middle and `legend="none"`.
 *
 * Every colour is a token (--a-*, --text) or the slice's own colour, so light and dark both work.
 */

// ── types ───────────────────────────────────────────────────────────────────

export interface DonutSlice {
  /** Stable id (optional — the index is used when absent). */
  key?: string;
  label: string;
  value: number;
  /** Any CSS colour or var(); defaults to the shared chart palette by position. */
  color?: string;
  /** One line under the label in the legend. */
  caption?: string;
}

export interface AuroraDonutProps {
  data: DonutSlice[];
  /** Largest ring diameter in px (it shrinks to fit a narrow box). Default 176. */
  size?: number;
  /** Band width in px. Defaults to ~10% of the diameter for a donut, ~25% for a pie. */
  thickness?: number;
  /** 'pie' = the same ring with a much heavier band (a small hole), for the chart-type pickers' "Pie". */
  variant?: 'donut' | 'pie';
  /** What sits in the middle when nothing is hovered. Defaults to the total with the caption "total"; set a key to override it (undefined = nothing). */
  centre?: { value?: ReactNode; label?: ReactNode };
  /** 'right' = beside the ring, wrapping under it when the box is narrow; 'bottom' = always under it; 'none'. */
  legend?: 'right' | 'bottom' | 'none';
  /** Appended after every number, e.g. '%' or ' hrs'. */
  unit?: string;
  /** Formats a count / amount (legend, centre). Default: Indian digit grouping. */
  formatValue?: (n: number) => string;
  /** Show the percent column in the legend. Default true. */
  showPercent?: boolean;
  /** Gauge mode: the ring is filled value / max and the rest is the quiet track. Hover does not change the centre. */
  max?: number;
  /** Fit the parent's height (chart widgets with a fixed-height body); the legend scrolls if it has to. */
  fill?: boolean;
  /** Reserve this much height and centre the chart in it (match the Classic chart's footprint inside a card). */
  minHeight?: number;
  /** A fixed-size glyph for beside other content (a score ring): exactly `size` px, no legend, no measuring. */
  inline?: boolean;
  /** Makes slices and legend rows clickable (rows become focusable buttons). `index` is the position in `data`. */
  onSliceClick?: (slice: DonutSlice, index: number) => void;
  /** Title for the screen-reader label, e.g. "Claims by status"; the values are listed after it. */
  ariaLabel?: string;
  /** The caller labels the chart itself (e.g. wraps it in its own role="img"). */
  decorative?: boolean;
  /** Shown in the middle of an empty ring. */
  emptyLabel?: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const nf = (n: number) => n.toLocaleString('en-IN');
const fmtPct = (f: number) => { const p = f * 100; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };

const GAP = 18;          // px between the ring and the legend
const LEGEND_MIN = 176;  // the legend never gets narrower than this beside the ring…
const RING_MIN = 104;    // …and the ring shrinks to this before the legend drops underneath it

/** The element's own content box, kept current. {0,0} until measured (SSR / first paint). */
function useBox(ref: RefObject<HTMLElement>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox((b) => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
      return b.w === w && b.h === h ? b : { w, h };
    });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * Render `children` (the Aurora chart) in the New design and `classic` (the original chart, untouched) otherwise.
 * It is a component so call sites can use it anywhere without caring about the rules of hooks.
 */
export function NewDesignSwap({ classic, children }: { classic: ReactNode; children: ReactNode }) {
  const { enabled } = useNewDesign();
  return <>{enabled ? children : classic}</>;
}

// ── the chart ───────────────────────────────────────────────────────────────

export function AuroraDonut({
  data, size = 176, thickness, variant = 'donut', centre, legend = 'right', unit = '', formatValue, showPercent = true,
  max, fill = false, minHeight, inline = false, onSliceClick, ariaLabel, decorative = false, emptyLabel = 'No data',
}: AuroraDonutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { w: W, h: H } = useBox(rootRef);
  const [hover, setHover] = useState<number | null>(null);

  const gauge = typeof max === 'number' && max > 0;
  const fmt = formatValue ?? nf;
  const show = (n: number) => `${fmt(n)}${unit}`;

  const slices = useMemo(
    () => data
      .map((d, i) => ({ ...d, idx: i, color: d.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }))
      .filter((d) => Number.isFinite(d.value) && d.value > 0),
    [data],
  );
  const total = slices.reduce((s, d) => s + d.value, 0);
  const whole = gauge ? Math.max(max as number, total) : total;
  const empty = slices.length === 0;
  const hoverOk = !gauge && !empty;
  const focus = hoverOk && hover != null ? slices[hover] ?? null : null;
  const dimOthers = (i: number) => (focus == null || hover === i ? 1 : 0.25);

  // ── layout: ring beside the legend when there is room, else the legend drops under it ──
  const showLegend = legend !== 'none' && !empty && !inline;
  const maxD = Math.max(40, size);
  const sideD = Math.min(maxD, fill && H > 0 ? Math.max(72, H - 20) : maxD);      // fill: leave room for the glow
  const wide = showLegend && legend === 'right' && (W === 0 || W >= Math.min(sideD, RING_MIN) + GAP + LEGEND_MIN);
  const D = inline ? Math.floor(maxD) : Math.floor(
    !showLegend ? Math.min(maxD, W > 0 ? W : maxD, fill && H > 0 ? Math.max(48, H - 20) : maxD)
      : wide ? (W > 0 ? Math.min(sideD, W - GAP - LEGEND_MIN) : sideD)     // beside the legend: the ring gives way first
        : Math.min(maxD, W > 0 ? W : maxD, fill && H > 0 ? Math.max(84, H * 0.58) : maxD),
  );

  // ── ring geometry ──
  const t = Math.round(thickness ?? clamp(D * (variant === 'pie' ? 0.25 : 0.105), 5, variant === 'pie' ? 64 : 22));
  const r = (D - t) / 2;
  const c = D / 2;
  const gap = slices.length > 1 || (!gauge && slices.length === 1) ? clamp(D * 0.024, 2.5, 5) : 0;   // visible px between capsules
  const blur = clamp(D * 0.04, 3, 9);
  const TAU = Math.PI * 2;
  const at = (a: number) => [c + r * Math.sin(a), c - r * Math.cos(a)] as const;   // 0 = 12 o'clock, clockwise

  const arcs = useMemo(() => {
    const out: { i: number; d?: string; full?: boolean }[] = [];
    if (empty) return out;
    if (slices.length === 1 && slices[0].value / whole >= 0.999) return [{ i: 0, full: true }];
    // each slice's centre-line is shortened by half a gap + the round cap on either end, so the VISIBLE capsules
    // span exactly their share minus one gap — the proportions stay honest.
    const h = (gap + t) / (2 * r);
    let start = 0;
    slices.forEach((s, i) => {
      const span = (s.value / whole) * TAU;
      let a0 = start + h, a1 = start + span - h;
      if (a1 - a0 < 0.0008) { const mid = start + span / 2; a0 = mid - 0.0004; a1 = mid + 0.0004; }   // a sliver → a round dot
      const [x0, y0] = at(a0), [x1, y1] = at(a1);
      out.push({ i, d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` });
      start += span;
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, whole, r, t, gap, c]);

  // ── the centre ──
  const innerD = D - 2 * t;
  let cValue: ReactNode; let cLabel: ReactNode;
  const dValue: ReactNode = empty ? null : show(total);
  const dLabel: ReactNode = empty ? emptyLabel : 'total';
  if (focus) { cValue = show(focus.value); cLabel = focus.label; }
  // a key the caller leaves out falls back to the default; a key set to undefined / null means "show nothing there"
  else if (centre) { cValue = 'value' in centre ? centre.value : dValue; cLabel = 'label' in centre ? centre.label : dLabel; }
  else { cValue = dValue; cLabel = dLabel; }
  const vText = typeof cValue === 'string' || typeof cValue === 'number' ? String(cValue) : '';
  const vSize = clamp(innerD * 0.34, 12, 44) * (vText.length > 5 ? clamp(5 / vText.length, 0.5, 1) : 1);
  const lSize = clamp(innerD * 0.115, 8, 12.5);

  const label = gauge
    ? `${ariaLabel ?? 'Progress'}: ${show(total)} of ${show(whole)}.`
    : empty ? `${ariaLabel ?? 'Chart'}: ${emptyLabel}.`
      : `${ariaLabel ?? 'Breakdown'}: ${slices.map((s) => `${s.label} ${show(s.value)} (${fmtPct(s.value / total)})`).join(', ')}.`;

  const pick = (i: number) => { if (onSliceClick) onSliceClick(data[slices[i].idx], slices[i].idx); };
  const hot = (i: number) => hoverOk ? { onMouseEnter: () => setHover(i) } : {};

  const ring = (
    <span style={{ position: 'relative', display: 'block', width: D, height: D, flexShrink: 0 }} onMouseLeave={() => setHover(null)}>
      <svg className="km-ad-ring" width={D} height={D} viewBox={`0 0 ${D} ${D}`} style={{ display: 'block', overflow: 'visible' }}
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--a-grid, var(--border))" strokeWidth={t} pointerEvents="none" />
        {arcs.map((a) => {
          const s = slices[a.i];
          const common = {
            fill: 'none', stroke: s.color, strokeWidth: t, strokeLinecap: 'round' as const, opacity: dimOthers(a.i),
            style: {
              transition: 'opacity .15s ease', cursor: onSliceClick ? 'pointer' : undefined,
              filter: `drop-shadow(0 2px ${blur}px color-mix(in srgb, ${s.color} 42%, transparent))`,
            } as CSSProperties,
            onClick: onSliceClick ? () => pick(a.i) : undefined,
            ...hot(a.i),
          };
          return a.full ? <circle key={a.i} {...common} cx={c} cy={c} r={r} /> : <path key={a.i} {...common} d={a.d} />;
        })}
      </svg>
      <span aria-hidden style={{ position: 'absolute', inset: t, display: 'grid', placeContent: 'center', justifyItems: 'center', textAlign: 'center', gap: 3, pointerEvents: 'none' }}>
        {cValue != null && cValue !== '' && <span className="km-au-num" style={{ fontSize: vSize, whiteSpace: 'nowrap' }}>{cValue}</span>}
        {cLabel != null && cLabel !== '' && (
          <small style={{ fontSize: lSize, lineHeight: 1.2, maxWidth: '100%', color: 'var(--a-ink-2, var(--text-dim))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{cLabel}</small>
        )}
      </span>
    </span>
  );

  const rows = showLegend && (
    <div onMouseLeave={() => setHover(null)}
      style={{
        display: 'grid', gap: 2, alignContent: 'center', minWidth: wide ? LEGEND_MIN : 0, width: wide ? undefined : '100%',
        flex: wide ? '1 1 0%' : '1 1 auto', minHeight: 0,
        ...(fill && H > 0 ? { maxHeight: wide ? H : Math.max(56, H - D - GAP), overflowY: 'auto' as const } : {}),
      }}>
      {slices.map((s, i) => {
        const Row = (onSliceClick ? 'button' : 'div') as 'div';   // a focusable button only when the rows do something
        return (
          <Row key={i} className="km-au-row km-ad-row" data-on={hover === i ? '1' : undefined}
            {...(onSliceClick ? { type: 'button' as const, onClick: () => pick(i), onFocus: () => setHover(i), onBlur: () => setHover(null) } : {})}
            onMouseEnter={() => setHover(i)}
            style={{
              display: 'grid', gridTemplateColumns: showPercent ? '12px minmax(0, 1fr) auto auto' : '12px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 9,
              padding: '5px 8px', borderRadius: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left', font: 'inherit', color: 'inherit',
              background: 'transparent', border: 0, cursor: onSliceClick ? 'pointer' : 'default',
              opacity: focus == null || hover === i ? 1 : 0.5, transition: 'background .12s ease, opacity .12s ease',
            }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: s.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${s.color} 20%, transparent)` }} />
            <span title={s.label} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.label}
              {s.caption && <small style={{ display: 'block', color: 'var(--a-ink-3, var(--text-mute))', fontSize: 11.5, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.caption}</small>}
            </span>
            <span className="km-au-num" style={{ fontSize: 16 }}>{show(s.value)}</span>
            {showPercent && (
              <span style={{ fontSize: 11.5, minWidth: 34, textAlign: 'right', color: 'var(--a-ink-3, var(--text-mute))', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(s.value / total)}</span>
            )}
          </Row>
        );
      })}
    </div>
  );

  if (inline) return ring;

  const body = (
    <div ref={fill ? undefined : rootRef} style={{
      display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', justifyContent: 'center', gap: GAP,
      width: '100%', minWidth: 0, ...(fill ? { position: 'absolute', inset: 0 } : minHeight ? { minHeight } : {}),
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{ring}</div>
      {rows}
    </div>
  );

  // fill mode: the outer box takes the parent's height and is what we measure; the content sits inside it absolutely,
  // so the chart can never feed back into its own measurement.
  return fill
    ? <div ref={rootRef} style={{ position: 'relative', flex: '1 1 0%', width: '100%', height: '100%', minWidth: 0, minHeight: Math.min(maxD, 120) }}>{body}</div>
    : body;
}

export default AuroraDonut;
