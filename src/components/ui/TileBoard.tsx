'use client';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Responsive, WidthProvider, type Layout, type Layouts as RglLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { getStoredUser } from '../../lib/auth';
import { useNewDesign } from '../../lib/useNewDesign';
import { useTileEditing } from '../../lib/useTileEditing';
import { registerTileBoard } from '../../lib/tileEditStore';
import { sizeOf, type TileSize } from '../../lib/tileSize';
import { TileSizeContext } from '../../lib/useTileSize';
import {
  BREAKPOINTS, COLS, GAP, ROW_HEIGHT, WIDTH_PRESETS,
  clearLayouts, defaultLayouts, readLayouts, sameLayouts, sanitizeLayouts, withHeightDelta, withWidth, writeLayouts,
  type Breakpoint, type Layouts, type TileSpec,
} from '../../lib/tileLayout';
import { T } from './index';

const ResponsiveGrid = WidthProvider(Responsive);

export interface TileDef extends TileSpec {
  /** The tile itself. Its root should fill the cell (a Card / a block element does). */
  node: ReactNode;
  /** Shown on the drag bar while customising. */
  label?: string;
  /** Wrap the node in a card surface in the new design — for tiles that are bare cells (e.g. a strip's tile), not cards. */
  surface?: boolean;
}

const classicGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: GAP };

/**
 * A set of tiles the user can MOVE and RESIZE.
 *
 * Classic design: renders exactly what the page rendered before — `classic(tiles)` if given, else an auto-fit
 * grid of the nodes. New design: a react-grid-layout board. Customising is switched on page-wide from the header
 * ("Customize layout"): each tile then shows a bar to drag it by, a corner to resize it from, and size buttons
 * (¼ ⅓ ½ Full, shorter / taller) so it also works from a keyboard or a phone. Layouts are saved per user, per
 * board id, in this browser; tiles added to the page later are appended, and a bad save falls back to the default.
 */
export default function TileBoard({ id, tiles, classic, outerStyle }: {
  /** Stable id of this board (per page), e.g. "home-kpis". Layouts are saved under it. */
  id: string;
  tiles: TileDef[];
  /** Layout styles for the board's own box (margins, flex / grid placement) — what the grid it replaces carried as a child of the page. */
  outerStyle?: CSSProperties;
  /** The page's original markup for these tiles. Keeps the classic design byte-for-byte what it was. */
  classic?: (tiles: TileDef[]) => ReactNode;
}) {
  const { enabled } = useNewDesign();
  if (!enabled) {
    return <>{classic ? classic(tiles) : <div style={classicGrid}>{tiles.map((t) => <Fragment key={t.key}>{t.node}</Fragment>)}</div>}</>;
  }
  return <LiveBoard id={id} tiles={tiles} outerStyle={outerStyle} />;
}

function LiveBoard({ id, tiles, outerStyle }: { id: string; tiles: TileDef[]; outerStyle?: CSSProperties }) {
  // The page builds `tiles` inline, so its identity changes every render; only the tile set + sizes matter here.
  const sig = tiles.map((t) => `${t.key}:${t.w}x${t.h}:${t.minW ?? ''}:${t.minH ?? ''}`).join('|');
  const specs = useMemo<TileSpec[]>(() => tiles.map(({ key, w, h, minW, minH }) => ({ key, w, h, minW, minH })), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const { editing, setEditing, resetToken } = useTileEditing();
  const [userId, setUserId] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<Layouts>(() => defaultLayouts(specs));
  const [bp, setBp] = useState<Breakpoint>('lg');

  // Tell the page-wide header control that a board is here (and when it leaves).
  useEffect(() => registerTileBoard(), []);

  // The saved layout lives in localStorage, which the server can't see — load it after mount.
  useEffect(() => {
    const uid = getStoredUser()?.id ?? null;
    setUserId(uid);
    setLayouts(readLayouts(uid, id, specs));
  }, [id, specs]);

  // "Reset layout" in the header → forget this board's saved layout.
  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (resetToken === lastReset.current) return;
    lastReset.current = resetToken;
    clearLayouts(userId, id);
    setLayouts(defaultLayouts(specs));
  }, [resetToken, userId, id, specs]);

  const commit = (next: Layouts) => {
    if (sameLayouts(next, layouts)) return;
    setLayouts(next);
    writeLayouts(userId, id, next);
  };

  // Persist only what the USER changed. react-grid-layout also reports on mount (after it compacts), which must not
  // be saved — that would pin today's default and stop later page changes from flowing through.
  const onLayoutChange = (_: Layout[], all: RglLayouts) => { if (editing) commit(sanitizeLayouts(all, specs)); };

  const setWidth = (key: string, frac: number) => commit({ ...layouts, [bp]: withWidth(layouts[bp], key, bp, frac) });
  const setHeight = (key: string, delta: number) => commit({ ...layouts, [bp]: withHeightDelta(layouts[bp], key, delta) });

  if (tiles.length === 0) return null;

  return (
    <div className={`km-tileboard${editing ? ' is-editing' : ''}`} data-testid={`tileboard-${id}`} data-editing={editing ? 'true' : undefined} style={outerStyle}>
      <ResponsiveGrid
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[GAP, GAP]}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".km-tile-handle"
        draggableCancel=".km-tile-nodrag"
        onLayoutChange={onLayoutChange}
        onBreakpointChange={(next: string) => setBp(next as Breakpoint)}
      >
        {tiles.map((t) => {
          const name = t.label ?? t.key;
          return (
            <div key={t.key} data-testid={`tile-${t.key}`}>
              <div style={{
                position: 'relative', height: '100%', display: 'grid', minWidth: 0, minHeight: 0,
                ...(t.surface ? { background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg } : null),
              }}>
                {/* Discoverability: hovering any tile offers the same "arrange" mode as the header button. */}
                {!editing && (
                  <button type="button" className="km-tile-grip" data-testid={`tile-${t.key}-grip`} onClick={() => setEditing(true)}
                    aria-label={`Arrange tiles (${name})`} title="Move and resize the tiles on this page">
                    <span aria-hidden>⠿</span> Arrange
                  </button>
                )}
                {/* The whole tile is the drag handle while customising (a narrow tile's bar is mostly size buttons). */}
                {editing && <div className="km-tile-handle" aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 4, cursor: 'grab' }} />}
                {editing && (
                  <div className="km-tile-handle km-tile-bar" style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 28, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 0 10px',
                    cursor: 'grab', background: 'color-mix(in srgb, var(--primary) 13%, var(--card))', borderBottom: '1px dashed color-mix(in srgb, var(--primary) 45%, transparent)',
                    borderRadius: `${T.radius.lg}px ${T.radius.lg}px 0 0`, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.dim, userSelect: 'none',
                  }}>
                    <span aria-hidden style={{ letterSpacing: 1, color: 'var(--primary)' }}>⠿</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span className="km-tile-nodrag" style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                      {WIDTH_PRESETS.map((p) => (
                        <SizeButton key={p.label} label={p.label} title={`${name}: ${p.title}`} testId={`tile-${t.key}-w-${p.label}`} onClick={() => setWidth(t.key, p.frac)} />
                      ))}
                      <SizeButton label="−" title={`${name}: shorter`} testId={`tile-${t.key}-shorter`} onClick={() => setHeight(t.key, -1)} />
                      <SizeButton label="+" title={`${name}: taller`} testId={`tile-${t.key}-taller`} onClick={() => setHeight(t.key, 1)} />
                    </span>
                  </div>
                )}
                {/* While customising, the tile is a thing to move, not a thing to click. */}
                <TileCell editing={editing}>{t.node}</TileCell>
              </div>
            </div>
          );
        })}
      </ResponsiveGrid>
    </div>
  );
}

/**
 * The tile's content box. It measures itself and tells its content how much room there is (see lib/tileSize.ts), so a
 * tile that is made bigger can show more: a trend, the facts behind a number, a larger chart.
 */
function TileCell({ editing, children }: { editing: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<TileSize>(() => sizeOf(0, 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const next = sizeOf(r.width, r.height);
      // Re-render only when the tier flips or the box moved by a visible amount (a drag fires this continuously).
      setSize((prev) => (prev.tier === next.tier && Math.abs(prev.width - next.width) < 8 && Math.abs(prev.height - next.height) < 8 ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <TileSizeContext.Provider value={size}>
      <div ref={ref} className="km-tile-cell" data-tier={size.tier} style={{ minWidth: 0, minHeight: 0, display: 'grid', overflow: 'auto', pointerEvents: editing ? 'none' : undefined, paddingTop: editing ? 28 : 0 }}>
        {children}
      </div>
    </TileSizeContext.Provider>
  );
}

function SizeButton({ label, title, testId, onClick }: { label: string; title: string; testId: string; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} data-testid={testId} onClick={onClick}
      style={{ minWidth: 22, height: 20, padding: '0 5px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>
      {label}
    </button>
  );
}
