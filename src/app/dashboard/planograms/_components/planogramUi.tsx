'use client';
import { useEffect, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, T, eyebrowStyle, type ButtonVariant, type ButtonSize } from '../../../../components/ui';

/**
 * Shared visual language for the planogram module (Overview / Captures /
 * Review queue / Library / Competitors / Insights / editor). Every screen
 * composes these primitives, which are thin wrappers over the dashboard
 * design system in `components/ui`, so the module reads as one family with
 * the rest of the app and flips light/dark from the tokens in globals.css.
 */

/** Module palette — every key resolves to a design-system token. Semantic
 *  good / warn / bad map to `--ok` / `--warn` / `--red`; brand red is the
 *  same red as the primary action. Never append a hex alpha to these. */
export const PC = {
  brand: T.red,
  good: T.ok,
  warn: T.warn,
  bad: T.red,
  info: T.info,
  goodWash: T.okWash,
  warnWash: T.warnWash,
  badWash: T.redWash,
  infoWash: T.infoWash,
  brandWash: T.redWash,
  surface: T.card,
  surface2: T.raised,
  surface3: T.rule,
  border: T.border,
  text: T.text,
  muted: T.dim,
  mute: T.mute,
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
function toneBadge(t: Tone): 'ok' | 'warn' | 'red' {
  return t === 'good' ? 'ok' : t === 'warn' ? 'warn' : 'red';
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
    return <span style={{ fontSize: 12, color: PC.muted, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>—</span>;
  const t = scoreTone(score);
  return (
    <Badge tone={toneBadge(t)} mono style={{ minWidth: 38, justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
      {Math.round(score)}
    </Badge>
  );
}

export type FlagKind = 'recovered' | 'review' | 'competitor' | 'lowscore';
const FLAG_META: Record<FlagKind, { label: string; tone: 'info' | 'warn' | 'red' }> = {
  recovered: { label: 'recovered', tone: 'info' },
  review: { label: 'review', tone: 'warn' },
  competitor: { label: 'competitor', tone: 'red' },
  lowscore: { label: 'low', tone: 'warn' },
};

/** A small semantic badge for capture flags (recovered / review / competitor). */
export function FlagBadge({ kind, label }: { kind: FlagKind; label?: string }) {
  const m = FLAG_META[kind];
  return <Badge tone={m.tone}>{label ?? m.label}</Badge>;
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
  const flags: ReactNode[] = [];
  if (recovered_count && recovered_count > 0)
    flags.push(<FlagBadge key="rec" kind="recovered" label={`${recovered_count} recovered`} />);
  if (needs_review) flags.push(<FlagBadge key="rev" kind="review" />);
  if (competitor_present) flags.push(<FlagBadge key="comp" kind="competitor" />);
  if (flags.length === 0) return <span style={{ color: PC.muted, fontSize: 12 }}>—</span>;
  return <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{flags}</span>;
}

/** A titled card container: Manrope 15/700 title, dim caption, actions on the
 *  right, then the body (`bodyPad={false}` for tables / lists). */
export function SectionCard({
  title,
  caption,
  right,
  children,
  bodyPad = true,
  style,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  bodyPad?: boolean;
  style?: CSSProperties;
}) {
  const hasHead = !!(title || right);
  return (
    <Card padding={0} style={{ overflow: 'hidden', ...style }}>
      {hasHead && (
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            borderBottom: bodyPad ? 0 : `1px solid ${T.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>{title}</div>
            )}
            {caption && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>{caption}</div>}
          </div>
          {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
        </div>
      )}
      <div style={{ padding: bodyPad ? (hasHead ? '0 16px 16px' : 16) : 0 }}>{children}</div>
    </Card>
  );
}

/** Loading / empty / error message block used inside cards + tables. */
export function StateBlock({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  if (tone === 'error')
    return (
      <div
        role="alert"
        style={{
          background: T.redWash,
          borderRadius: T.radius.md,
          padding: '10px 14px',
          fontSize: 13,
          color: T.red,
        }}
      >
        {children}
      </div>
    );
  return <EmptyState title={children} style={{ padding: '36px 16px' }} />;
}

/** Compact select styled like the design-system `Select` (36px, 6px radius)
 *  — kept as a style object because the module's pages spread it onto raw
 *  `<select>`s. Prefer `Select` from `components/ui` in new code. */
export const selyStyle: CSSProperties = {
  height: 36,
  boxSizing: 'border-box',
  background: T.field,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.sm,
  padding: '0 11px',
  fontSize: 13.5,
  color: T.text,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
};

/** Module button — a re-export of the design-system Button so pages that
 *  compose their own buttons can pick the right variant. */
export function ModBtn({ variant = 'secondary', size, ...rest }: ComponentProps<typeof Button> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Button variant={variant} size={size} {...rest} />;
}

/** Wide-table wrapper — horizontal scroll stays inside the card. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: 'auto' }}>{children}</div>;
}

export const th: CSSProperties = {
  ...eyebrowStyle,
  textAlign: 'left',
  padding: '12px 14px',
  borderBottom: `1px solid ${T.border}`,
  whiteSpace: 'nowrap',
};
export const thR: CSSProperties = { ...th, textAlign: 'right' };
export const td: CSSProperties = {
  padding: '12px 14px',
  borderBottom: `1px solid ${T.border}`,
  fontSize: 13.5,
  color: T.text,
  verticalAlign: 'middle',
};
export const tdR: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
