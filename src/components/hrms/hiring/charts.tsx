'use client';
// Plain SVG and CSS charts for the Talent screens. No library, no network. Colours come from CSS variables that are
// stepped separately for the dark and light surfaces; marks follow the house spec (2px lines, thin rounded columns,
// a 2px surface ring on end dots) and every chart has a hover/keyboard readout. Text uses the text tokens, never the series colour.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '../ui';

/** Dark is the app default; `[data-theme="light"]` flips it. Both steps come from one validated palette. */
export function VizStyle() {
  const css = ':root{--hv-1:#3987e5;--hv-2:#d95926;--hv-3:#199e70;--hv-4:#c98500;--hv-5:#d55181}'
    + '[data-theme="light"]{--hv-1:#2a78d6;--hv-2:#eb6834;--hv-3:#1baf7a;--hv-4:#eda100;--hv-5:#e87ba4}';
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * Width of the element, measured after mount (a fixed guess before, so server and first client paint match). The chart's svg is
 * positioned inside a box of fixed height, so it adds nothing to the box's own minimum width and a narrow screen can shrink it.
 */
export function useWidth(initial = 560): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(220, Math.floor(el.clientWidth)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; box?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: T.dim, marginBottom: 8 }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i.box
            ? <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: i.color }} />
            : <svg aria-hidden width={18} height={8}><line x1={1} y1={4} x2={17} y2={4} stroke={i.color} strokeWidth={2} strokeLinecap="round" strokeDasharray={i.dashed ? '4 3' : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const right = x > width * 0.6;
  return (
    <div role="status" style={{
      position: 'absolute', top: Math.max(0, y), left: right ? undefined : x + 12, right: right ? width - x + 12 : undefined, pointerEvents: 'none', zIndex: 2,
      background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: T.radius.md, padding: '8px 10px', fontSize: 12.5, boxShadow: '0 8px 24px -12px rgba(0,0,0,.5)', minWidth: 120,
    }}>{children}</div>
  );
}

// ───────────────────────────── line chart ─────────────────────────────
export interface LineSeries { id: string; label: string; color: string; values: (number | null)[]; dashed?: boolean }

export function LineChart({ series, xLabels, height = 200, format = (n) => String(Math.round(n * 10) / 10), ariaLabel, yMin, yMax, ticks = 4, testId, integerTicks }: {
  series: LineSeries[]; xLabels: string[]; height?: number; format?: (n: number) => string; ariaLabel: string; yMin?: number; yMax?: number; ticks?: number; testId?: string; integerTicks?: boolean;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;
  const padL = 44, padR = 14, padT = 10, padB = 24;
  const plotW = Math.max(40, width - padL - padR), plotH = height - padT - padB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = yMin ?? (all.length ? Math.min(...all) : 0);
  const hi = yMax ?? (all.length ? Math.max(...all) : lo + 1);
  const pad = (hi - lo) * 0.08;
  const tk = niceTicks(yMin ?? lo - pad, yMax ?? hi + pad, ticks, integerTicks);
  const y0 = tk[0]!, y1 = tk[tk.length - 1]!;
  const X = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v: number) => padT + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  const step = plotW / Math.max(1, n - 1) < 34 ? 2 : 1;

  const path = (vals: (number | null)[]) => {
    let d = ''; let pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setHover((h) => Math.max(0, (h ?? n) - 1)); e.preventDefault(); }
    else if (e.key === 'Escape') setHover(null);
  };

  return (
    <div ref={ref} data-testid={testId} style={{ position: 'relative', width: '100%', height, minWidth: 0 }} tabIndex={0} role="group" aria-label={`${ariaLabel}. Use the left and right arrow keys to read each point.`}
      onKeyDown={keys} onFocus={() => setHover((h) => h ?? n - 1)} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={padL} x2={padL + plotW} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 8} y={Y(t) + 4} textAnchor="end" fontSize={11} fill="var(--mute)" style={{ fontFamily: T.mono }}>{format(t)}</text>
          </g>
        ))}
        {xLabels.map((l, i) => (i % step === 0 ? <text key={i} x={X(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--mute)">{l}</text> : null))}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={padT} y2={padT + plotH} stroke="var(--border-l)" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.id}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            {(() => {
              const li = s.values.reduce<number>((a, v, i) => (v != null ? i : a), -1);
              const hi2 = hover != null && s.values[hover] != null ? hover : li;
              return hi2 >= 0 && s.values[hi2] != null ? <circle cx={X(hi2)} cy={Y(s.values[hi2]!)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} /> : null;
            })()}
          </g>
        ))}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
      </svg>
      {hover != null && (
        <Tooltip x={X(hover)} y={padT} width={width}>
          <div style={{ color: T.dim, marginBottom: 4 }}>{xLabels[hover]}</div>
          {series.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <svg aria-hidden width={14} height={6}><line x1={0} y1={3} x2={14} y2={3} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>
              <b style={{ color: T.text, fontFamily: T.mono }}>{s.values[hover] == null ? '—' : format(s.values[hover]!)}</b>
              <span style={{ color: T.dim }}>{s.label}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ───────────────────────────── columns ─────────────────────────────
export interface ColumnStack { id: string; label: string; color: string; values: number[] }

/** Thin rounded columns, one or more stacked series, a 2px gap between stacked parts. Values sit on the cap when they fit. */
export function ColumnChart({ stacks, labels, height = 180, ariaLabel, yMax, testId, showValues = true }: {
  stacks: ColumnStack[]; labels: string[]; height?: number; ariaLabel: string; yMax?: number; testId?: string; showValues?: boolean;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 30, padR = 8, padT = 18, padB = 24;
  const plotW = Math.max(40, width - padL - padR), plotH = height - padT - padB;
  const totals = labels.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] ?? 0), 0));
  const top = yMax ?? Math.max(1, ...totals);
  const tk = niceTicks(0, top, 3, true);
  const maxY = tk[tk.length - 1]!;
  const slot = plotW / n;
  const bw = Math.min(24, slot * 0.6);
  const Y = (v: number) => padT + plotH - (v / maxY) * plotH;
  return (
    <div ref={ref} data-testid={testId} style={{ position: 'relative', width: '100%', height, minWidth: 0 }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ position: 'absolute', left: 0, top: 0 }}>
        {tk.map((t) => (
          <g key={t}><line x1={padL} x2={padL + plotW} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fontSize={11} fill="var(--mute)" style={{ fontFamily: T.mono }}>{t}</text></g>
        ))}
        {labels.map((l, i) => {
          const cx = padL + slot * i + slot / 2;
          let acc = 0;
          const parts = stacks.map((st) => { const v = st.values[i] ?? 0; const from = acc; acc += v; return { st, v, from }; }).filter((p) => p.v > 0);
          return (
            <g key={i} tabIndex={0} role="img" aria-label={`${l}: ${stacks.map((s) => `${s.values[i] ?? 0} ${s.label}`).join(', ')}`}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ outline: 'none' }}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
              {parts.map((p, k) => {
                const y = Y(p.from + p.v), h = Math.max(0, Y(p.from) - y - (k > 0 ? 2 : 0));
                const isTop = k === parts.length - 1;
                const r = isTop ? Math.min(4, h) : 0;
                const x = cx - bw / 2;
                const d = isTop
                  ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`
                  : `M${x},${y}H${x + bw}V${y + h}H${x}Z`;
                return <path key={p.st.id} d={d} fill={p.st.color} opacity={hover != null && hover !== i ? 0.55 : 1} />;
              })}
              {showValues && totals[i]! > 0 && n <= 8 && <text x={cx} y={Y(totals[i]!) - 5} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--text)" style={{ fontFamily: T.mono }}>{totals[i]}</text>}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--mute)">{l}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <Tooltip x={padL + slot * hover + slot / 2} y={padT} width={width}>
          <div style={{ color: T.dim, marginBottom: 4 }}>{labels[hover]}</div>
          {stacks.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
              <b style={{ color: T.text, fontFamily: T.mono }}>{s.values[hover] ?? 0}</b><span style={{ color: T.dim }}>{s.label}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ───────────────────────────── horizontal bars ─────────────────────────────
export function HBars({ rows, max, color = 'var(--hv-1)', testId }: { rows: { label: ReactNode; value: number; text: ReactNode; sub?: ReactNode }[]; max?: number; color?: string; testId?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 130px) 1fr auto', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.text, minWidth: 0 }}>{r.label}{r.sub && <div style={{ fontSize: 11.5, color: T.mute }}>{r.sub}</div>}</div>
          <div aria-hidden style={{ height: 12, borderRadius: 4, background: T.raised, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / m) * 100)}%`, height: '100%', background: color, borderRadius: '0 4px 4px 0' }} />
          </div>
          <div style={{ fontSize: 12.5, color: T.text, fontFamily: T.mono, minWidth: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.text}</div>
        </div>
      ))}
    </div>
  );
}
