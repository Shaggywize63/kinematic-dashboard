'use client';
/**
 * Shared chart kit — one source of truth for the analytics visual language so
 * every recharts surface gets the same vibrant palette, gradient fills, rounded
 * bars, glassy tooltip, and animated entrance from one place.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { formatINRCompact } from './formatCurrency';

// Vibrant, high-contrast series palette (works on the dark CRM surfaces).
export const CHART_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4',
  '#8B5CF6', '#F97316', '#84CC16', '#3B82F6', '#E0282C',
];
export const CHART_SEMANTIC = {
  won: '#10B981', lost: '#F43F5E', risk: '#F59E0B',
  primary: '#6366F1', neutral: 'var(--text-dim)',
};
export const seriesColor = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length];

// Stable gradient id per color so <GradientDefs> and grad() agree.
export const gradId = (c: string) => `cg-${c.replace(/[^a-z0-9]/gi, '')}`;
export const grad = (c: string) => `url(#${gradId(c)})`;

/** Drop inside a recharts chart; renders a vertical gradient per color. */
export function GradientDefs({ colors, top = 0.95, bottom = 0.25 }: { colors: string[]; top?: number; bottom?: number }) {
  return (
    <defs>
      {Array.from(new Set(colors)).map((c) => (
        <linearGradient key={c} id={gradId(c)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={top} />
          <stop offset="100%" stopColor={c} stopOpacity={bottom} />
        </linearGradient>
      ))}
    </defs>
  );
}

export const CHART = {
  grid: { stroke: 'var(--border)', strokeDasharray: '4 4', vertical: false },
  axis: { stroke: 'var(--text-dim)', fontSize: 11, tickLine: false, axisLine: false },
  barRadius: [8, 8, 0, 0] as [number, number, number, number],
  hBarRadius: [0, 8, 8, 0] as [number, number, number, number],
  margin: { top: 10, right: 18, left: 0, bottom: 6 },
  animation: { isAnimationActive: true, animationDuration: 850, animationEasing: 'ease-out' as const },
};

function fmt(v: unknown, unit?: string) {
  if (typeof v !== 'number') return String(v ?? '');
  if (unit === 'inr') return formatINRCompact(v);
  return v.toLocaleString('en-IN');
}

/** Glassy custom tooltip — pass as `content={<ChartTooltip unit="inr" />}`. */
export function ChartTooltip(props: any) {
  const { active, payload, label, unit } = props;
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'color-mix(in srgb, var(--s2) 86%, transparent)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px',
      fontSize: 12, color: 'var(--text)', boxShadow: '0 10px 28px rgba(0,0,0,0.38)',
    }}>
      {label != null && label !== '' && <div style={{ fontWeight: 800, marginBottom: 5 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color || p.fill || seriesColor(i), flex: '0 0 auto' }} />
          <span style={{ color: 'var(--text-dim)' }}>{p.name}</span>
          <span style={{ marginLeft: 16, fontWeight: 700 }}>{fmt(p.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

/** Animated, gradient-accented card frame for any chart. */
export function ChartCard({ title, subtitle, right, children, delay = 0, minHeight }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; delay?: number; minHeight?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'relative', background: 'var(--s2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
        minHeight, overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, rgba(99,102,241,0.08), transparent 55%)', pointerEvents: 'none' }} />
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, zIndex: 1 }}>
          <div>
            {title && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ zIndex: 1, flex: 1, minWidth: 0 }}>{children}</div>
    </motion.div>
  );
}

export function ChartEmpty({ message = 'No data yet' }: { message?: string }) {
  return <div style={{ height: '100%', minHeight: 160, display: 'grid', placeItems: 'center', color: 'var(--text-dim)', fontSize: 12.5 }}>{message}</div>;
}
