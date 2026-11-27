/**
 * Pure layout engine for the movable / resizable tiles (components/ui/TileBoard.tsx).
 *
 * A board has up to three layouts — one per breakpoint — each a list of `GridItem`s (react-grid-layout's shape:
 * `i` = the tile key, `x`/`y` = column/row, `w`/`h` = columns/rows). Tiles are DEFINED once, in 20-column units
 * (so five KPI tiles divide the row evenly); narrower breakpoints derive their widths from that.
 *
 * What lives here is everything that must be right regardless of the UI: the default flow, turning whatever was
 * saved in localStorage (possibly stale, hand-edited or from an older version of the page) back into a layout
 * that is valid for the tiles that exist TODAY, and the size presets. No React, no DOM, no imports — so it is
 * unit-tested in Node (e2e/tile-layout.spec.ts).
 */

export type Breakpoint = 'lg' | 'md' | 'sm';

export interface TileSpec {
  /** Stable id of the tile within its board. */
  key: string;
  /** Default width in 20-column units and height in rows. */
  w: number;
  h: number;
  /** Smallest size the tile may be shrunk to (so its content is never clipped to nothing). */
  minW?: number;
  minH?: number;
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type Layouts = Record<Breakpoint, GridItem[]>;

// Measured against the board's own width (not the window): at a 1280px window the content area beside the sidebar is
// ~990px, which must still get the full 20-column row — five KPI tiles across, like the classic grid.
export const BREAKPOINTS: Record<Breakpoint, number> = { lg: 900, md: 600, sm: 0 };
export const COLS: Record<Breakpoint, number> = { lg: 20, md: 12, sm: 4 };
export const BREAKPOINT_KEYS: Breakpoint[] = ['lg', 'md', 'sm'];
export const ROW_HEIGHT = 40;
export const GAP = 12;
/** The grid tiles are defined in. */
export const BASE_COLS = COLS.lg;
/** Tallest a tile may be made, in rows. */
export const MAX_ROWS = 40;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ── Defaults ─────────────────────────────────────────────────────────────────

/** A tile's width at a breakpoint, derived from its 20-column default so a phone never gets a sliver. */
export function widthAt(bp: Breakpoint, w: number): number {
  const base = clamp(Math.round(w), 1, BASE_COLS);
  if (bp === 'lg') return base;
  if (bp === 'md') return clamp(Math.round((base * COLS.md) / BASE_COLS), Math.min(3, COLS.md), COLS.md);
  // sm (4 columns): anything half-width or wider takes the full row, the rest sit two to a row.
  return base >= BASE_COLS / 2 ? COLS.sm : 2;
}

/** Smallest width at a breakpoint: the tile's own minimum on the full grid, a sane floor below it. */
function minWidthAt(bp: Breakpoint, minW?: number): number {
  if (bp === 'lg') return clamp(Math.round(minW ?? 2), 1, BASE_COLS);
  return Math.min(2, COLS[bp]);
}

/** The smallest size a tile may be at a breakpoint. */
function minsFor(t: TileSpec, bp: Breakpoint): { minW: number; minH: number } {
  return { minW: minWidthAt(bp, t.minW), minH: clamp(Math.round(t.minH ?? 2), 1, MAX_ROWS) };
}

function itemFor(t: TileSpec, bp: Breakpoint, x: number, y: number, w: number): GridItem {
  const { minW, minH } = minsFor(t, bp);
  return { i: t.key, x, y, w, h: clamp(Math.round(t.h), 1, MAX_ROWS), minW: Math.min(minW, w), minH };
}

/** Flow tiles left to right in order, wrapping when a row is full — what the page looks like before anyone customises it. */
export function defaultLayout(tiles: TileSpec[], bp: Breakpoint, startY = 0): GridItem[] {
  const cols = COLS[bp];
  const out: GridItem[] = [];
  let x = 0;
  let y = startY;
  let rowH = 0;
  for (const t of tiles) {
    const w = widthAt(bp, t.w);
    if (x + w > cols) { x = 0; y += rowH; rowH = 0; }
    const it = itemFor(t, bp, x, y, w);
    out.push(it);
    x += w;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}

export function defaultLayouts(tiles: TileSpec[]): Layouts {
  return { lg: defaultLayout(tiles, 'lg'), md: defaultLayout(tiles, 'md'), sm: defaultLayout(tiles, 'sm') };
}

// ── Making a saved layout safe ───────────────────────────────────────────────

/**
 * Turn whatever was saved for one breakpoint into a layout that is valid for the tiles that exist now:
 * unknown / duplicate / non-numeric entries are dropped, sizes and positions are clamped into the grid and the
 * tile's min/max, and tiles the saved layout never knew about (a new card added since) are appended below it.
 * Anything unusable falls back to the default flow, so a bad save never breaks the page.
 */
export function sanitizeLayout(saved: unknown, tiles: TileSpec[], bp: Breakpoint): GridItem[] {
  if (!Array.isArray(saved)) return defaultLayout(tiles, bp);
  const cols = COLS[bp];
  const byKey = new Map(tiles.map((t) => [t.key, t]));
  const seen = new Set<string>();
  const kept: GridItem[] = [];
  for (const raw of saved) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.i === 'string' ? r.i : null;
    const spec = key ? byKey.get(key) : undefined;
    if (!key || !spec || seen.has(key)) continue;
    if (!isInt(r.x) || !isInt(r.y) || !isInt(r.w) || !isInt(r.h)) continue;
    const { minW, minH } = minsFor(spec, bp);
    const w = clamp(Math.round(r.w), minW, cols);
    const h = clamp(Math.round(r.h), minH, MAX_ROWS);
    kept.push({ i: key, x: clamp(Math.round(r.x), 0, cols - w), y: Math.max(0, Math.round(r.y)), w, h, minW: Math.min(minW, w), minH });
    seen.add(key);
  }
  if (kept.length === 0) return defaultLayout(tiles, bp);
  const missing = tiles.filter((t) => !seen.has(t.key));
  if (missing.length === 0) return kept;
  const below = kept.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  return [...kept, ...defaultLayout(missing, bp, below)];
}

export function sanitizeLayouts(saved: unknown, tiles: TileSpec[]): Layouts {
  const s = saved && typeof saved === 'object' ? (saved as Partial<Record<Breakpoint, unknown>>) : {};
  return { lg: sanitizeLayout(s.lg, tiles, 'lg'), md: sanitizeLayout(s.md, tiles, 'md'), sm: sanitizeLayout(s.sm, tiles, 'sm') };
}

/** Equal in the only fields that matter (id / position / size), ignoring react-grid-layout's injected churn. */
export function sameLayouts(a: Layouts, b: Layouts): boolean {
  return BREAKPOINT_KEYS.every((bp) => {
    const x = a[bp]; const y = b[bp];
    if (x.length !== y.length) return false;
    const m = new Map(y.map((it) => [it.i, it]));
    return x.every((it) => { const o = m.get(it.i); return !!o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h; });
  });
}

// ── Size presets ─────────────────────────────────────────────────────────────

/** Width shortcuts offered on each tile while customising (fractions of the row). */
export const WIDTH_PRESETS: ReadonlyArray<{ label: string; title: string; frac: number }> = [
  { label: '¼', title: 'Quarter width', frac: 1 / 4 },
  { label: '⅓', title: 'One-third width', frac: 1 / 3 },
  { label: '½', title: 'Half width', frac: 1 / 2 },
  { label: 'Full', title: 'Full width', frac: 1 },
];

/** Set one tile's width to a fraction of the row at `bp`, keeping it inside the grid. */
export function withWidth(layout: GridItem[], key: string, bp: Breakpoint, frac: number): GridItem[] {
  const cols = COLS[bp];
  return layout.map((it) => {
    if (it.i !== key) return it;
    const w = clamp(Math.round(cols * frac), it.minW ?? 1, cols);
    return { ...it, w, x: clamp(it.x, 0, cols - w) };
  });
}

/** Grow or shrink one tile by `delta` rows, within its minimum and the board maximum. */
export function withHeightDelta(layout: GridItem[], key: string, delta: number): GridItem[] {
  return layout.map((it) => (it.i === key ? { ...it, h: clamp(it.h + delta, it.minH ?? 1, MAX_ROWS) } : it));
}

// ── Persistence (localStorage) ───────────────────────────────────────────────

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** One key per user per board, so a shared browser never mixes two people's layouts. */
export function tilesKey(userId: string | null | undefined, boardId: string): string {
  return `km_tiles:${(userId ?? '').trim() || 'anon'}:${boardId}`;
}

function browserStorage(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** The saved layouts made safe for `tiles` — or the default flow when nothing usable is saved. Never throws. */
export function readLayouts(userId: string | null | undefined, boardId: string, tiles: TileSpec[], storage: KV | null = browserStorage()): Layouts {
  try {
    const raw = storage?.getItem(tilesKey(userId, boardId));
    if (!raw) return defaultLayouts(tiles);
    const parsed = JSON.parse(raw) as { layouts?: unknown } | null;
    return sanitizeLayouts(parsed?.layouts, tiles);
  } catch { return defaultLayouts(tiles); }
}

export function writeLayouts(userId: string | null | undefined, boardId: string, layouts: Layouts, storage: KV | null = browserStorage()): void {
  try { storage?.setItem(tilesKey(userId, boardId), JSON.stringify({ v: 1, layouts })); } catch { /* storage unavailable — the layout just won't persist */ }
}

export function clearLayouts(userId: string | null | undefined, boardId: string, storage: KV | null = browserStorage()): void {
  try { storage?.removeItem(tilesKey(userId, boardId)); } catch { /* ignore */ }
}
