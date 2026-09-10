'use client';
import React from 'react';
import {
  Badge, Button, Card as UiCard, Eyebrow, PageHeader as UiPageHeader, T, eyebrowStyle,
  type ButtonSize, type Tone,
} from '../ui';

/**
 * Distribution atoms — the module-level building blocks every supply-chain
 * page composes. They keep their historical names + props (so ~60 pages keep
 * compiling) but are now thin wrappers over the shared design-system
 * primitives in `components/ui`, so the whole module flips light/dark from
 * the tokens in globals.css and reads as one family with the CRM.
 */

// Legacy palette — every key resolves to a design-system token now. Pages
// that still read `palette.*` (setup / control-tower / ai) get the right
// colour in both themes. Prefer `T.*` from `components/ui` in new code.
const C = {
  side: T.card,
  s2: T.raised,
  s3: T.raised,
  s4: T.rule,
  border: T.border,
  text: T.text,
  dim: T.dim,
  mute: T.mute,
  red: T.red,
  green: T.ok,
  amber: T.warn,
  accent: T.info,
} as const;

export const palette = C;

/** Stat tile: mono eyebrow label, Manrope 26/700 value, dim hint. `accent`
 *  colours the value (pass `T.red` / `T.warn` / `T.ok`, never a hex). */
export function StatCard({ label, value, hint, accent, style }: { label: string; value: React.ReactNode; hint?: string; accent?: string; style?: React.CSSProperties }) {
  return (
    <UiCard padding={16} style={{ minWidth: 160, flex: 1, ...style }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15, color: accent || T.text, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }}>{hint}</div>}
    </UiCard>
  );
}

export type PillColor = 'gray' | 'green' | 'red' | 'amber' | 'blue';
const PILL_TONE: Record<PillColor, Tone> = { gray: 'neutral', green: 'ok', red: 'red', amber: 'warn', blue: 'info' };

/** Status pill — a `Badge` keyed by the module's historical colour names. */
export function Pill({ children, color = 'gray', mono, style }: { children: React.ReactNode; color?: PillColor; mono?: boolean; style?: React.CSSProperties }) {
  return <Badge tone={PILL_TONE[color]} mono={mono} style={style}>{children}</Badge>;
}

export function statusColor(status: string): PillColor {
  const s = (status || '').toLowerCase();
  if (['placed', 'pending', 'requested', 'draft'].includes(s)) return 'amber';
  if (['approved', 'cleared', 'issued', 'delivered', 'credited', 'supervisor_approved', 'paid'].includes(s)) return 'green';
  if (['cancelled', 'rejected', 'bounced'].includes(s)) return 'red';
  if (['invoiced', 'partially_invoiced', 'out', 'prepared'].includes(s)) return 'blue';
  return 'gray';
}

/** The surface. `padding={0}` for cards that hold a table / list. */
export function Card({ children, style, padding = 20, className }: { children: React.ReactNode; style?: React.CSSProperties; padding?: number | string; className?: string }) {
  return <UiCard padding={padding} className={className} style={style}>{children}</UiCard>;
}

/** Card header row: Manrope 15/700 title + optional right-side actions. Use
 *  inside `Card padding={0}` above a table (hairline below) or inside a
 *  padded card (`bare`). */
export function CardTitle({ children, right, bare, style }: { children: React.ReactNode; right?: React.ReactNode; bare?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: bare ? 0 : '14px 16px', marginBottom: bare ? 12 : 0, borderBottom: bare ? 0 : `1px solid ${T.border}`, ...style,
    }}>
      <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>{children}</div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

/** Horizontal wrap row (stat tiles, toolbars). */
export function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...style }}>{children}</div>;
}

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Button. `primary` is the one red action per view; `secondary` (outlined)
 * is the default look for everything else; `ghost` is borderless text;
 * `danger` is the red-wash destructive action. `href` renders a Link.
 */
export function Btn({ onClick, children, variant = 'primary', disabled, size, icon, href, title, type, style }: {
  onClick?: () => void; children?: React.ReactNode; variant?: BtnVariant; disabled?: boolean;
  size?: ButtonSize; icon?: React.ReactNode; href?: string; title?: string; type?: 'button' | 'submit'; style?: React.CSSProperties;
}) {
  return (
    <Button variant={variant} size={size} icon={icon} href={href} title={title} type={type} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </Button>
  );
}

/** Table header cell — mono eyebrow, hairline below. */
export function Th({ children, style, colSpan }: { children?: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <th colSpan={colSpan} style={{ ...eyebrowStyle, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', ...style }}>
      {children}
    </th>
  );
}

/** Table body cell — 13.5px Inter, hairline rows. Pass `tabular-nums` via
 *  `style` (or use `TdNum`) for numeric columns. */
export function Td({ children, style, colSpan }: { children?: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  );
}

/** Right-aligned numeric cell. */
export function TdNum({ children, style, colSpan }: { children?: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return <Td colSpan={colSpan} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</Td>;
}

/** Mono cell for codes / IDs / GSTINs. */
export function TdMono({ children, style, colSpan }: { children?: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return <Td colSpan={colSpan} style={{ fontFamily: T.mono, fontSize: 12, ...style }}>{children}</Td>;
}

/** Wrap a `<table>` so wide tables scroll inside the card, never the page. */
export function TableWrap({ children, minWidth, style }: { children: React.ReactNode; minWidth?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ overflowX: 'auto', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>{children}</table>
    </div>
  );
}

/** Centered, dim "no rows" cell spanning a table. */
export function EmptyRow({ colSpan, children, style }: { colSpan: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <tr>
      <Td colSpan={colSpan} style={{ textAlign: 'center', color: T.dim, padding: '28px 14px', ...style }}>{children}</Td>
    </tr>
  );
}

/** Inline error / success / info note under a form or above a table. */
export function Note({ tone = 'neutral', children, style }: { tone?: 'neutral' | 'ok' | 'warn' | 'red' | 'info'; children: React.ReactNode; style?: React.CSSProperties }) {
  const fg = tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : tone === 'red' ? T.red : tone === 'info' ? T.info : T.dim;
  const bg = tone === 'ok' ? T.okWash : tone === 'warn' ? T.warnWash : tone === 'red' ? T.redWash : tone === 'info' ? T.infoWash : T.raised;
  return <div style={{ fontSize: 13, color: fg, background: bg, borderRadius: T.radius.md, padding: '10px 12px', ...style }}>{children}</div>;
}

export function inr(n: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; }
}

/** Page header — Manrope 22/700 title, one-line dim description, actions on
 *  the right. Adds the 20px gap below that the module's pages rely on. */
export function PageHeader({ title, subtitle, right, compact, style }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; compact?: boolean; style?: React.CSSProperties }) {
  return <UiPageHeader title={title} description={subtitle} actions={right} compact={compact} style={{ marginBottom: 20, ...style }} />;
}
