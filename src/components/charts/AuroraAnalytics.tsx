'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import {
  Activity, Award, BarChart3, Banknote, CalendarClock, Gauge, History, Hourglass, Info, LayoutGrid, ListChecks, MapPin, MapPinned,
  Medal, MessageSquare, PhoneCall, Repeat, Route, Scale, ShieldAlert, ShieldCheck, SlidersHorizontal, Target, ThumbsDown, Timer,
  TrendingUp, Trophy, Truck, UserX, Users, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';
import { T } from '../ui';
import { CHART_PALETTE } from '../../lib/chartTheme';

/**
 * Aurora analytics kit — the New design's look for the analytics surfaces (Field Force Analytics, Lead Analytics).
 * Everything here is only rendered when the New design is on (callers gate on `useNewDesign().enabled`); the CSS that
 * goes with it lives in app/aurora-analytics.css, scoped to `html[data-design="new"]`.
 *
 *  • Surfaces  — AuroraPanel (glass card), AuroraStatTile (KPI), AuroraInsightCard (insight tile with a solid
 *                "how this is calculated" popover), AuroraNumberTile (big numeral + caption), AuroraWidgetHead (widget header).
 *  • Lists     — AuroraRankedBars (rounded gradient bars with a glow, value at the tip, rank chips).
 *  • Heatmap   — AuroraHeatmap (tint ramp, rounded cells, glass tooltip) + AuroraHeatLegend (gradient bar).
 *  • Charts    — AuroraBarSeries / AuroraLineSeries / AuroraAreaSeries / AuroraHBarSeries: the recharts widgets' Aurora
 *                skins (gradient fills, radius-8 bars, glowing lines, ringed points, glass tooltip + legend).
 *
 * Every colour is a token (--a-*, --au-*, --text) or comes from the caller as the data's identity colour, so both themes work.
 */

// ── helpers ─────────────────────────────────────────────────────────────────

const nf = (n: number) => n.toLocaleString('en-IN');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** "avg_touches" → "Avg touches" (series names come straight from data keys). */
const pretty = (k: string) => { const s = String(k).replace(/[_-]+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(k); };
const vars = (v: Record<string, string>, rest: CSSProperties = {}): CSSProperties => ({ ...rest, ...v } as CSSProperties);

/** The tinted glass icon chip (`.km-lz`, see aurora.css): one tint per metric. */
export function TintChip({ icon: Ico, tint, size = 34, iconSize = 17 }: { icon: LucideIcon; tint: string; size?: number; iconSize?: number }) {
  return (
    <span aria-hidden className="km-lz" style={vars({ '--tint': tint }, { width: size, height: size, borderRadius: Math.round(size * 0.34), flexShrink: 0, display: 'inline-grid', placeItems: 'center' })}>
      <Ico size={iconSize} strokeWidth={1.7} />
    </span>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────

/** A glass card. `.km-card` carries the Aurora edge / highlight / shadow (aurora.css), the inline background keeps it translucent. */
export function AuroraPanel({ children, padding = 20, className, style }: { children: ReactNode; padding?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={className ? `km-card ${className}` : 'km-card'} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding, minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

/** A KPI tile: tinted icon chip + label, then the figure as a big tabular numeral. The tint is shown as a soft under-glow. */
export function AuroraStatTile({ icon, label, value, tint }: { icon: LucideIcon; label: string; value: ReactNode; tint: string }) {
  return (
    <AuroraPanel padding={18} style={{
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
      background: `radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, ${tint} 15%, transparent), transparent 62%), var(--card)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TintChip icon={icon} tint={tint} size={34} iconSize={17} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--a-ink-2)' }}>{label}</span>
      </div>
      <div className="km-au-num" style={{ fontSize: 32, wordBreak: 'break-word' }}>{value}</div>
    </AuroraPanel>
  );
}

/** The ⓘ with its "how this is calculated" popover. Reveal rules live in globals.css (`.kini-info:hover .kini-info-pop`);
 *  the solid frosted pane, its placement over the card and its stacking are in aurora-analytics.css. */
function InfoPop({ text }: { text: string }) {
  return (
    <span className="kini-info" tabIndex={0} role="img" aria-label={`How this is calculated: ${text}`}
      style={{ display: 'inline-flex', cursor: 'help', color: 'var(--a-ink-2)', borderRadius: 999, padding: 2 }}>
      <Info size={15} strokeWidth={1.8} aria-hidden />
      <span className="kini-info-pop" role="tooltip" style={{ display: 'none', textAlign: 'left', whiteSpace: 'normal', fontWeight: 400 }}>
        <span style={{ display: 'block', fontWeight: 800, color: 'var(--text)', fontSize: 9.5, letterSpacing: '0.5px', marginBottom: 4 }}>HOW THIS IS CALCULATED</span>
        {text}
      </span>
    </span>
  );
}

/** An insight tile: tinted chip (and a status badge), the figure big, then a title and a plain-language caption. */
export function AuroraInsightCard({ icon, title, value, sub, accent, badge, methodology }: {
  icon: LucideIcon; title: string; value: ReactNode; sub: ReactNode; accent: string;
  badge?: { label: string; color: string }; methodology?: string;
}) {
  return (
    <AuroraPanel padding={18} className="km-an-ins" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TintChip icon={icon} tint={accent} size={38} iconSize={19} />
        <span style={{ flex: 1 }} />
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
            background: `color-mix(in srgb, ${badge.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${badge.color} 32%, transparent)`,
            color: `color-mix(in srgb, ${badge.color} 70%, var(--a-ink))`,
          }}>{badge.label}</span>
        )}
        {methodology && <InfoPop text={methodology} />}
      </div>
      <div className="km-au-num" style={{ fontSize: 36, wordBreak: 'break-word' }}>{value}</div>
      <div>
        <div style={{ fontFamily: T.heading, fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--a-ink-2)', marginTop: 4 }}>{sub}</div>
      </div>
    </AuroraPanel>
  );
}

/** The single big figure of a number widget, with a caption; the widget's accent is the under-glow and the short bar. */
export function AuroraNumberTile({ main, sub, accent }: { main: string; sub: string; accent?: string }) {
  const c = accent ?? 'var(--primary)';
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 12, gap: 12, textAlign: 'center', minHeight: 0 }}>
      <span aria-hidden style={{
        position: 'absolute', left: '50%', top: '42%', width: 190, height: 110, transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        background: `radial-gradient(closest-side, color-mix(in srgb, ${c} 30%, transparent), transparent)`, filter: 'blur(8px)',
      }} />
      <span className="km-au-num" style={{ position: 'relative', fontSize: 'clamp(34px, 5vw, 54px)', wordBreak: 'break-word' }}>{main}</span>
      <span aria-hidden style={{ position: 'relative', width: 30, height: 4, borderRadius: 999, background: c, boxShadow: `0 0 12px color-mix(in srgb, ${c} 70%, transparent)` }} />
      <span style={{ position: 'relative', fontSize: 12.5, lineHeight: 1.45, color: 'var(--a-ink-2)', maxWidth: 260 }}>{sub}</span>
    </div>
  );
}

// ── Widget chrome ───────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Velocity: Gauge, Quality: Award, Pipeline: Workflow, Engagement: Activity, Risk: ShieldAlert, Custom: SlidersHorizontal,
  Coverage: MapPinned, Productivity: Activity, Efficiency: Truck, Discipline: ShieldCheck, Growth: TrendingUp,
};
const TYPE_ICON: Record<string, LucideIcon> = {
  // Lead analytics
  lead_velocity: Gauge, time_to_first_touch: Timer, stuck_leads: Hourglass, lost_reasons: ThumbsDown, won_reasons: Trophy,
  disqualification_reasons: UserX, stage_conversion: Workflow, lead_aging: CalendarClock, cohort_conversion: LayoutGrid,
  engagement_comparison: Scale, days_since_touch: History, score_band_conversion: Target, territory_conversion: MapPinned,
  touchpoints_to_response: MessageSquare, leads_at_risk: ShieldAlert, leads_geo_heatmap: MapPin, targets_leaderboard: Medal,
  lead_source_performance: Route, followup_compliance: ListChecks, owner_workload: Users, stage_velocity: Timer, activity_mix: Activity,
  lead_conversion_time: Timer, weighted_pipeline: Wallet, deal_size_distribution: Banknote, win_rate_trend: Trophy,
  call_connect_trend: PhoneCall, lead_recycling: Repeat,
  // Field-force analytics
  beat_adherence: Route, outlet_coverage: MapPinned, frequency: Repeat, productive_calls: PhoneCall, strike_rate: Target,
  aov: Banknote, new_outlets: MapPin, visit_duration: Timer, idle_heatmap: Hourglass, distance: Route, punctuality: CalendarClock,
  stuck_fes: Hourglass, top_performers: Trophy,
};
/** The glyph for a widget's header chip: its own icon when it has one, else its category's. */
export function widgetIcon(type: string, category?: string): LucideIcon {
  return TYPE_ICON[type] ?? (category ? CATEGORY_ICON[category] : undefined) ?? BarChart3;
}

/** The header of an analytics widget in the New design: a tinted glass chip in the widget's accent colour, the title, and the
 *  category with an accent dot — the accent stays as the data's identity, not a saturated bar across the top. */
export function AuroraWidgetHead({ icon, accent, title, caption }: { icon: LucideIcon; accent: string; title: string; caption: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
      <TintChip icon={icon} tint={accent} size={34} iconSize={17} />
      <div style={{ minWidth: 0 }}>
        <div title={title} style={{ fontFamily: T.heading, fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--a-ink-2)', marginTop: 1 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: accent, boxShadow: `0 0 8px color-mix(in srgb, ${accent} 75%, transparent)` }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption}</span>
        </div>
      </div>
    </div>
  );
}

// ── Ranked bars ─────────────────────────────────────────────────────────────

export interface RankedItem {
  label: string;
  value: number;
  /** What to print at the tip of the bar (defaults to the number). */
  display?: string;
  /** A one-line caption on the right of the label. */
  sub?: ReactNode;
  /** The row's identity colour (defaults to `accent`). */
  color?: string;
}

/**
 * Ranked bars: one row per item — a tinted rank chip, the label, and a fully rounded gradient bar with a soft glow whose
 * value is printed at its tip. Bars are scaled to `max` (default: the largest value); order is the caller's, so rank by
 * sorting first. `chips="none"` drops the rank chip for narrow spaces (e.g. inside a widget).
 */
export function AuroraRankedBars({ items, max, accent = 'var(--accent)', chips = 'rank', ariaLabel }: {
  items: RankedItem[]; max?: number; accent?: string; chips?: 'rank' | 'none'; ariaLabel?: string;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);

  const top = (max ?? Math.max(0, ...items.map((i) => i.value))) || 1;
  const printed = (it: RankedItem) => it.display ?? nf(it.value);
  // The value sits at the bar's tip, so the bars are scaled into (width − label room) — one width for every row keeps them comparable.
  const room = Math.max(24, ...items.map((i) => printed(i).length * 8)) + 12;

  return (
    <div role="list" aria-label={ariaLabel} style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
      {items.map((it, i) => {
        const c = it.color ?? accent;
        const frac = clamp(it.value / top, 0, 1);
        const w = `calc((100% - ${room}px) * ${on ? frac : 0})`;
        const delay = `${Math.min(i, 10) * 45}ms`;
        return (
          <div key={`${it.label}-${i}`} role="listitem" aria-label={`${it.label}: ${printed(it)}`} className="km-au-row"
            style={{ display: 'grid', gridTemplateColumns: chips === 'rank' ? '30px minmax(0, 1fr)' : 'minmax(0, 1fr)', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 14 }}>
            {chips === 'rank' && (
              <span aria-hidden className="km-lz" style={vars({ '--tint': c }, { width: 30, height: 30, display: 'inline-grid', placeItems: 'center', fontFamily: T.heading, fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' })}>{i + 1}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span title={it.label} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                {it.sub != null && <span style={{ fontSize: 11.5, color: 'var(--a-ink-2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{it.sub}</span>}
              </div>
              <div aria-hidden style={{ position: 'relative', height: 18, marginTop: 3 }}>
                <span style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--a-ink) 7%, transparent)' }} />
                <span className="km-an-fill" style={{
                  position: 'absolute', left: 0, top: 5, height: 8, borderRadius: 999, width: w, minWidth: frac > 0 ? 8 : 0, transitionDelay: delay,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${c} 50%, transparent), ${c})`,
                  boxShadow: `0 0 14px -1px color-mix(in srgb, ${c} 60%, transparent), inset 0 1px 0 rgba(255, 255, 255, .32)`,
                }} />
                <span className="km-an-val km-au-num" style={{ position: 'absolute', top: 0, left: `calc(${w} + 9px)`, lineHeight: '18px', fontSize: 13, transitionDelay: delay, whiteSpace: 'nowrap' }}>{printed(it)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────────

export interface HeatCell { value: number; tipTitle?: string; tipValue?: string }
export interface HeatRow { key: string; label: string; cells: HeatCell[] }

/** Colour of a value on the ramp: a smooth tint from the track colour (low) to the accent (high). */
const rampMix = (frac: number) => `color-mix(in srgb, var(--hm-accent) ${Math.round(16 + clamp(frac, 0, 1) * 84)}%, var(--hm-track))`;

/** The legend for AuroraHeatmap: Low ▬▬▬ High as one gradient bar, matching the ramp. */
export function AuroraHeatLegend({ accent = 'var(--accent)', low = 'Low', high = 'High' }: { accent?: string; low?: string; high?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--a-ink-2)' }}>
      {low}
      <span aria-hidden style={{
        width: 96, height: 8, borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--a-grid)',
        background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 16%, color-mix(in srgb, var(--a-ink) 7%, transparent)), ${accent})`,
      }} />
      {high}
    </span>
  );
}

/**
 * A grid of rounded cells coloured on a tint ramp (track → accent) with a hairline gap, and a glass tooltip on hover or focus.
 * `colLabels` has one entry per column (use '' to skip a label); each row carries one cell per column.
 */
export function AuroraHeatmap({ rows, colLabels, accent = 'var(--accent)', cellHeight = 24, ariaLabel }: {
  rows: HeatRow[]; colLabels: string[]; accent?: string; cellHeight?: number; ariaLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<{ r: number; c: number; left: number; top: number } | null>(null);
  const max = useMemo(() => Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value))), [rows]);
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `34px repeat(${colLabels.length}, minmax(0, 1fr))`, gap: 3, alignItems: 'center' };

  // offsetLeft/Top are relative to the (positioned) wrapper and unaffected by the app's font zoom, unlike client rects.
  const point = (el: HTMLElement, r: number, c: number) => {
    const w = wrap.current;
    if (!w) return;
    setHov({ r, c, left: clamp(el.offsetLeft + el.offsetWidth / 2, 72, Math.max(72, w.offsetWidth - 72)), top: el.offsetTop });
  };
  const cur = hov ? rows[hov.r]?.cells[hov.c] : undefined;

  return (
    <div ref={wrap} role="img" aria-label={ariaLabel ?? 'Heatmap'} onMouseLeave={() => setHov(null)}
      style={vars({ '--hm-accent': accent, '--hm-track': 'color-mix(in srgb, var(--a-ink) 7%, transparent)' }, { position: 'relative' })}>
      <div style={{ ...grid, marginBottom: 6 }}>
        <span />
        {colLabels.map((l, i) => (
          <span key={i} style={{ textAlign: 'center', fontSize: 10.5, lineHeight: 1, color: 'var(--a-ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'visible' }}>{l}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 3 }}>
        {rows.map((row, ri) => (
          <div key={row.key} style={grid}>
            <span style={{ fontSize: 11.5, color: 'var(--a-ink-2)', textAlign: 'right', paddingRight: 8 }}>{row.label}</span>
            {row.cells.map((cell, ci) => (
              <div key={ci} className="km-an-cell" data-on={hov && hov.r === ri && hov.c === ci ? '1' : undefined}
                onMouseEnter={(e: MouseEvent<HTMLDivElement>) => point(e.currentTarget, ri, ci)}
                style={{ height: cellHeight, borderRadius: 7, background: cell.value > 0 ? rampMix(Math.pow(cell.value / max, 0.8)) : 'var(--hm-track)' }} />
            ))}
          </div>
        ))}
      </div>
      {hov && cur && (
        <div className="km-chart-tip" role="status" style={{
          position: 'absolute', left: hov.left, top: hov.top, transform: 'translate(-50%, calc(-100% - 8px))', pointerEvents: 'none', zIndex: 5,
          padding: '6px 11px', borderRadius: 10, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)', background: 'var(--card)', border: '1px solid var(--border)',
        }}>
          {cur.tipTitle && <div style={{ color: 'var(--a-ink-3)', fontSize: 11 }}>{cur.tipTitle}</div>}
          <div style={{ fontFamily: T.heading, fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{cur.tipValue ?? nf(cur.value)}</div>
        </div>
      )}
    </div>
  );
}

// ── Recharts skins (the widgets' bar / line / area charts) ─────────────────

/** Same colour rule as the Classic widgets: the first series takes the widget's accent, the rest the kit palette. */
const seriesColors = (keys: string[], accent?: string) => keys.map((_, i) => (i === 0 ? accent ?? CHART_PALETTE[0] : CHART_PALETTE[i % CHART_PALETTE.length]));
const colorMapOf = (keys: string[], colors: string[]) => Object.fromEntries(keys.map((k, i) => [k, colors[i]])) as Record<string, string>;
const glow = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** The glass tooltip body (`.km-chart-tip` is styled by aurora.css): the category, then one row per series. */
function AuroraTip({ active, payload, label, show, colors }: {
  active?: boolean; payload?: any[]; label?: unknown; show: (v: any) => string; colors: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="km-chart-tip" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text)', minWidth: 120 }}>
      {label != null && label !== '' && <div style={{ color: 'var(--a-ink-3)', fontSize: 11, marginBottom: 3 }}>{String(label)}</div>}
      {payload.map((p, i) => {
        const key = String(p.dataKey ?? p.name ?? i);
        const c = colors[key] ?? p.color ?? 'var(--accent)';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.75 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: c, boxShadow: `0 0 8px ${glow(c, 70)}` }} />
            <span style={{ color: 'var(--a-ink-2)' }}>{pretty(String(p.name ?? key))}</span>
            <span className="km-au-num" style={{ marginLeft: 'auto', paddingLeft: 14, fontSize: 13.5 }}>{p.value == null ? '—' : show(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Legend: a glowing dot and the series name in the readable secondary ink (the Classic legend paints names in the series colour). */
function AuroraLegend({ payload, colors }: { payload?: any[]; colors: Record<string, string> }) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 16px', paddingTop: 8 }}>
      {payload.map((p, i) => {
        const c = colors[String(p.dataKey ?? p.value)] ?? p.color ?? 'var(--accent)';
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--a-ink-2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 8px ${glow(c, 70)}` }} />
            {pretty(String(p.value))}
          </span>
        );
      })}
    </div>
  );
}

interface SeriesProps { data: any[]; keys: string[]; accent?: string; suffix?: string; fmt?: (v: number) => string }
const showOf = (suffix?: string, fmt?: (v: number) => string) => (v: any) => (fmt && typeof v === 'number' ? fmt(v) : `${v}${suffix ?? ''}`);
const AXIS_TICK = { fontSize: 11 };

/** Vertical bars: radius-8 tops, a gradient from the series colour into the glass, a soft glow under each bar. */
export function AuroraBarSeries({ data, keys, accent, suffix, fmt }: SeriesProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const colors = seriesColors(keys, accent);
  const cmap = colorMapOf(keys, colors);
  const show = showOf(suffix, fmt);
  return (
    <ResponsiveContainer width="100%" height="100%" className="km-an-chart km-an-bars">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={4}>
        <defs>
          {keys.map((k, i) => (
            <linearGradient key={k} id={`${uid}b${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i]} stopOpacity={0.98} />
              <stop offset="100%" stopColor={colors[i]} stopOpacity={0.36} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={show} width={fmt ? 58 : 42} />
        <Tooltip content={<AuroraTip show={show} colors={cmap} />} cursor={{ radius: 8 }} />
        {keys.length > 1 && <Legend content={<AuroraLegend colors={cmap} />} />}
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={`url(#${uid}b${i})`} radius={[8, 8, 0, 0]} maxBarSize={44} style={{ filter: `drop-shadow(0 6px 10px ${glow(colors[i], 34)})` }} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Lines: a soft glow under the stroke, round data points with a ring in the glass colour, a quiet grid. */
export function AuroraLineSeries({ data, keys, accent, suffix, fmt }: SeriesProps) {
  const colors = seriesColors(keys, accent);
  const cmap = colorMapOf(keys, colors);
  const show = showOf(suffix, fmt);
  return (
    <ResponsiveContainer width="100%" height="100%" className="km-an-chart">
      <LineChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={show} width={fmt ? 58 : 42} />
        <Tooltip content={<AuroraTip show={show} colors={cmap} />} />
        {keys.length > 1 && <Legend content={<AuroraLegend colors={cmap} />} />}
        {keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"
            dot={{ r: 4, fill: colors[i], stroke: 'var(--a-solid)', strokeWidth: 2 }}
            activeDot={{ r: 6.5, fill: colors[i], stroke: 'var(--a-solid)', strokeWidth: 2.5 }}
            style={{ filter: `drop-shadow(0 5px 9px ${glow(colors[i], 42)})` }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Areas: a gradient that fades into the glass under a glowing stroke, a ringed point on hover. */
export function AuroraAreaSeries({ data, keys, accent, suffix, fmt }: SeriesProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const colors = seriesColors(keys, accent);
  const cmap = colorMapOf(keys, colors);
  const show = showOf(suffix, fmt);
  return (
    <ResponsiveContainer width="100%" height="100%" className="km-an-chart">
      <AreaChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
        <defs>
          {keys.map((k, i) => (
            <linearGradient key={k} id={`${uid}a${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i]} stopOpacity={0.45} />
              <stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={show} width={fmt ? 58 : 42} />
        <Tooltip content={<AuroraTip show={show} colors={cmap} />} />
        {keys.length > 1 && <Legend content={<AuroraLegend colors={cmap} />} />}
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2.75} strokeLinecap="round" fill={`url(#${uid}a${i})`}
            dot={false} activeDot={{ r: 6, fill: colors[i], stroke: 'var(--a-solid)', strokeWidth: 2.5 }}
            style={{ filter: `drop-shadow(0 5px 9px ${glow(colors[i], 38)})` }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars in a widget: the ranked-bars list (full labels, value at the tip) instead of a cramped plot; scrolls when long. */
export function AuroraHBarSeries({ data, valueLabel, fmt, accent }: { data: Array<{ name: string; value: number }>; valueLabel?: string; fmt?: (v: number) => string; accent?: string }) {
  const items = data.map((d) => {
    const v = Number(d.value) || 0;
    return { label: String(d.name), value: v, display: fmt ? fmt(v) : `${nf(v)}${valueLabel ?? ''}` };
  });
  return (
    <div className="km-an-chart" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 2px 4px' }}>
      <AuroraRankedBars items={items} accent={accent} chips="none" />
    </div>
  );
}
