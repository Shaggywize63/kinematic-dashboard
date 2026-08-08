'use client';
import { useEffect, useState } from 'react';

/**
 * Shared visual language for the redesigned planogram module (Overview /
 * Captures / Review queue). Maps the approved prototype's tokens onto the
 * dashboard's theme CSS vars, plus semantic good/warn/bad tones kept separate
 * from brand red. Every screen composes these primitives so the module reads
 * as one system in both light and dark themes.
 */

export const PC = {
  brand: '#E01E2C',
  good: '#00D97E',
  warn: '#FFB800',
  bad: '#F04438',
  info: '#3E9EFF',
  // Low-alpha washes read acceptably on both light (--s1 #fff) and dark surfaces.
  goodWash: 'rgba(0,217,126,0.14)',
  warnWash: 'rgba(255,184,0,0.16)',
  badWash: 'rgba(240,68,56,0.14)',
  infoWash: 'rgba(62,158,255,0.14)',
  brandWash: 'rgba(224,30,44,0.11)',
  // Surfaces + text via theme vars (theme-aware, defined in globals.css).
  surface: 'var(--s1)',
  surface2: 'var(--s2)',
  surface3: 'var(--s3)',
  border: 'var(--border)',
  text: 'var(--text)',
  muted: 'var(--text-dim)',
} as const;

/** Viewport flag — the module's responsive breakpoint (mirrors the prototype's
 *  860px shell collapse). Guarded for SSR. */
export function useIsCompact(breakpoint = 860): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const check = () => setV(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return v;
}

export type Tone = 'good' | 'warn' | 'bad';

/** Compliance banding used everywhere a score is coloured. */
export function scoreTone(score: number | null | undefined): Tone {
  const s = score ?? 0;
  return s >= 80 ? 'good' : s >= 65 ? 'warn' : 'bad';
}
export function toneColor(t: Tone): string {
  return t === 'good' ? PC.good : t === 'warn' ? PC.warn : PC.bad;
}
export function toneWash(t: Tone): string {
  return t === 'good' ? PC.goodWash : t === 'warn' ? PC.warnWash : PC.badWash;
}

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtScore(n: number | null | undefined): string {
  return n == null ? '—' : String(Math.round(n));
}
export function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

// ── Primitives ───────────────────────────────────────────────────────────────

/** A compliance-score pill (tabular-nums, tone-coloured). */
export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null)
    return <span style={{ fontSize: 12, color: PC.muted, fontVariantNumeric: 'tabular-nums' }}>—</span>;
  const t = scoreTone(score);
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 800,
        padding: '3px 10px',
        borderRadius: 100,
        color: toneColor(t),
        background: toneWash(t),
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-block',
        minWidth: 34,
        textAlign: 'center',
      }}
    >
      {Math.round(score)}
    </span>
  );
}

export type FlagKind = 'recovered' | 'review' | 'competitor' | 'lowscore';
const FLAG_META: Record<FlagKind, { label: string; color: string; wash: string }> = {
  recovered: { label: 'recovered', color: PC.info, wash: PC.infoWash },
  review: { label: 'review', color: PC.warn, wash: PC.warnWash },
  competitor: { label: 'competitor', color: PC.brand, wash: PC.brandWash },
  lowscore: { label: 'low', color: PC.warn, wash: PC.warnWash },
};

/** A small semantic badge for capture flags (recovered / review / competitor). */
export function FlagBadge({ kind, label }: { kind: FlagKind; label?: string }) {
  const m = FLAG_META[kind];
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 100,
        color: m.color,
        background: m.wash,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? m.label}
    </span>
  );
}

/** The set of flag badges a capture-like row should show. */
export function CaptureFlags({
  recovered_count,
  needs_review,
  competitor_present,
}: {
  recovered_count?: number | null;
  needs_review?: boolean;
  competitor_present?: boolean;
}) {
  const flags: React.ReactNode[] = [];
  if (recovered_count && recovered_count > 0)
    flags.push(<FlagBadge key="rec" kind="recovered" label={`${recovered_count} recovered`} />);
  if (needs_review) flags.push(<FlagBadge key="rev" kind="review" />);
  if (competitor_present) flags.push(<FlagBadge key="comp" kind="competitor" />);
  if (flags.length === 0) return <span style={{ color: PC.muted, fontSize: 12 }}>—</span>;
  return <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{flags}</span>;
}

/** A titled card container matching the prototype's `.card .sec`. */
export function SectionCard({
  title,
  caption,
  right,
  children,
  bodyPad = true,
}: {
  title?: string;
  caption?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  bodyPad?: boolean;
}) {
  return (
    <div
      style={{
        background: PC.surface,
        border: `1px solid ${PC.border}`,
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
        overflow: 'hidden',
      }}
    >
      {(title || right) && (
        <div
          style={{
            padding: '15px 18px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontFamily: 'var(--font-manrope)',
                  fontSize: 14.5,
                  fontWeight: 800,
                  color: PC.text,
                }}
              >
                {title}
              </div>
            )}
            {caption && <div style={{ fontSize: 12, color: PC.muted, marginTop: 3 }}>{caption}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: bodyPad ? (title ? '0 18px 16px' : 16) : 0 }}>{children}</div>
    </div>
  );
}

/** Loading / empty / error message block used inside cards + tables. */
export function StateBlock({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  if (tone === 'error')
    return (
      <div
        style={{
          background: PC.badWash,
          border: `1px solid ${PC.bad}55`,
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 13,
          color: PC.bad,
        }}
      >
        {children}
      </div>
    );
  return (
    <div style={{ padding: '32px 8px', textAlign: 'center', color: PC.muted, fontSize: 13 }}>
      {children}
    </div>
  );
}

/** Small pill/select styled like the prototype's `.sely` scope chips. */
export const selyStyle: React.CSSProperties = {
  background: PC.surface,
  border: `1px solid ${PC.border}`,
  borderRadius: 9,
  padding: '7px 10px',
  fontSize: 12.5,
  color: PC.text,
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none',
};

/** Wide-table wrapper — horizontal scroll stays inside the card. */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div style={{ overflowX: 'auto' }}>{children}</div>;
}

export const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: PC.muted,
  fontWeight: 700,
  padding: '9px 12px',
  borderBottom: `1px solid ${PC.border}`,
  whiteSpace: 'nowrap',
};
export const thR: React.CSSProperties = { ...th, textAlign: 'right' };
export const td: React.CSSProperties = {
  padding: '11px 12px',
  borderBottom: `1px solid ${PC.border}`,
  fontSize: 13.5,
  color: PC.text,
  verticalAlign: 'middle',
};
export const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
