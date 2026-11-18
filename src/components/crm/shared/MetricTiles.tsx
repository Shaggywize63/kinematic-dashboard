'use client';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { T, type Tone } from '../../ui';
import { metricIconFor, ICON_STROKE } from '../../../lib/labelIcons';

/**
 * A row of summary tiles for a CRM list page. A tile with `onSelect` is also a filter: it renders as a toggle button
 * (aria-pressed), so "Open", "Won" and "Lost" can be both the summary and the status filter. Values are the caller's,
 * already formatted; `title` carries the full figure when the value is compact (₹2.4L).
 */
export interface MetricTile {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  title?: string;
  tone?: Tone;
  active?: boolean;
  onSelect?: () => void;
  testId?: string;
  /** The label's icon. Left out, the shared one for the label is used (lib/labelIcons.ts); `null` keeps the plain dot. */
  icon?: LucideIcon | null;
}

const ACCENT: Record<Tone, string> = { neutral: T.borderStrong, info: T.info, ok: T.ok, warn: T.warn, red: T.red };

export default function MetricTiles({ tiles, loading, min = 170 }: { tiles: MetricTile[]; loading?: boolean; min?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 10 }}>
      {tiles.map((t) => {
        const accent = ACCENT[t.tone ?? 'neutral'];
        const Icon = t.icon === undefined ? metricIconFor(t.label) : t.icon;
        const iconColor = (t.tone ?? 'neutral') === 'neutral' ? T.dim : accent;
        const body = (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.active ? T.text : T.mute }}>
              {Icon
                ? <Icon aria-hidden data-testid={t.testId ? `${t.testId}-icon` : undefined} size={14} strokeWidth={ICON_STROKE} style={{ color: iconColor, flexShrink: 0 }} />
                : <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} />}
              {t.label}
            </span>
            <span title={t.title} style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', opacity: loading ? 0.45 : 1, overflowWrap: 'anywhere' }}>
              {t.value}
            </span>
            {t.sub != null && <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.35 }}>{t.sub}</span>}
          </>
        );
        const base: React.CSSProperties = {
          display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, textAlign: 'left', padding: '14px 16px',
          background: T.card, borderRadius: T.radius.lg, fontFamily: 'inherit',
          border: `1px solid ${t.active ? accent : T.border}`,
          boxShadow: t.active ? `inset 0 0 0 1px ${accent}` : 'none',
        };
        return t.onSelect ? (
          <button key={t.key} type="button" aria-pressed={!!t.active} data-testid={t.testId} onClick={t.onSelect} className="km-row"
            style={{ ...base, cursor: 'pointer' }}>
            {body}
          </button>
        ) : (
          <div key={t.key} data-testid={t.testId} style={base}>{body}</div>
        );
      })}
    </div>
  );
}
