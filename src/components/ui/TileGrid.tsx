'use client';
import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import TileBoard, { type TileDef } from './TileBoard';
import { BASE_COLS, type TileSpec } from '../../lib/tileLayout';

/**
 * Make an existing grid of cards MOVABLE and RESIZABLE with a one-line change.
 *
 *   before:  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>{cards}</div>
 *   after:   <TileGrid id="crm-stats" perRow={5} h={3} style={{ display: 'grid', … same style … }}>{cards}</TileGrid>
 *
 * Classic design: renders exactly the `<div style={style}>` it replaced, so nothing changes. New design: the children
 * become tiles of a TileBoard (see TileBoard.tsx) — the page-wide "Arrange tiles" control in the header flips every
 * board on the page into edit mode, and the layout is remembered per user, per `id`.
 *
 * Each direct child is one tile. A tile is identified (so a saved layout keeps pointing at the right card even when a
 * card is hidden or reordered) by, in order: its React `key`, a `data-tile` prop, its `label` / `title` prop, or its
 * position. Falsy children (`{cond && <Card/>}`) are skipped, as React does.
 */
export default function TileGrid({ id, children, style, className, perRow = 4, h = 4, minW = 2, minH = 2, tile, 'data-testid': testId }: {
  /** Stable id of this grid, unique on its page, e.g. "crm-dashboard-stats". The saved layout lives under it. */
  id: string;
  children: ReactNode;
  /** The style of the grid this replaces — applied as-is in the Classic design. */
  style?: CSSProperties;
  className?: string;
  /** Kept on the Classic grid's `<div>` (the New design's board has its own `tileboard-<id>` test id). */
  'data-testid'?: string;
  /** How many tiles sit side by side by default (the board is 20 columns wide). */
  perRow?: number;
  /** Default tile height, in rows of 40px (+12px gap): 3 ≈ a KPI tile, 8 ≈ a chart card. */
  h?: number;
  minW?: number;
  minH?: number;
  /** Per-tile overrides, by tile key or label: `{ 'Pipeline Funnel': { w: 10, h: 9 } }`. Widths are in 20ths of the row. */
  tile?: Record<string, Partial<Pick<TileSpec, 'w' | 'h' | 'minW' | 'minH'>>>;
}) {
  const classic = () => <div className={className} style={style} data-testid={testId}>{children}</div>;

  const items = Children.toArray(children).filter((c): c is ReactElement => isValidElement(c));
  const seen = new Map<string, number>();
  const tiles: TileDef[] = items.map((child, i) => {
    const p = (child.props ?? {}) as Record<string, unknown>;
    const explicit = typeof child.key === 'string' && child.key.startsWith('.$') ? child.key.slice(2) : null;
    const text = [p['data-tile'], p.label, p.title].find((v): v is string => typeof v === 'string' && v.trim() !== '');
    const base = explicit ?? (text ? slug(text) : `t${i}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n === 1 ? base : `${base}-${n}`;
    const over = tile?.[key] ?? (text ? tile?.[text] : undefined) ?? {};
    // Balance the rows: 8 tiles with room for 5 across make two rows of 4, not 5 + 3.
    const rows = Math.max(1, Math.ceil(items.length / Math.max(1, perRow)));
    const per = Math.max(1, Math.ceil(items.length / rows));
    return { key, label: text ?? key, w: over.w ?? Math.max(1, Math.floor(BASE_COLS / per)), h: over.h ?? h, minW: over.minW ?? minW, minH: over.minH ?? minH, node: child };
  });

  return <TileBoard id={id} tiles={tiles} classic={classic} outerStyle={placementOf(style)} />;
}

/**
 * The part of the grid's style that is about where the grid sits in its PARENT (spacing, flex / grid placement, size
 * limits) — the board keeps that, while the grid's own columns / gap / alignment are replaced by the board's layout.
 */
const PLACEMENT = /^(margin|padding|flex|grid(Column|Row|Area)|(min|max)?(Width|Height)$|width$|height$|alignSelf|justifySelf|order|position|top|right|bottom|left|zIndex)/;
function placementOf(style?: CSSProperties): CSSProperties | undefined {
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined && PLACEMENT.test(k)) out[k] = v;
  return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tile';
}
