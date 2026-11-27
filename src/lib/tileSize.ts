/**
 * How much room a tile has, so its content can grow WITH it: a KPI tile that is dragged taller shows a trend and the
 * facts behind its number, a chart fills the space, a list shows more rows. Pure (no React, no DOM) so the thresholds are
 * unit-tested in Node (e2e/tile-size.spec.ts); the React side is components/ui/TileBoard.tsx (provider) and the
 * `useTileSize` hook / `TileMore` below it.
 */

/** compact: a sliver, drop secondary text · regular: the default tile · roomy: room for a trend and a few facts · spacious: room for all of it. */
export type TileTier = 'compact' | 'regular' | 'roomy' | 'spacious';

export interface TileSize {
  /** The tile's content box in CSS px. */
  width: number;
  height: number;
  tier: TileTier;
}

const ORDER: TileTier[] = ['compact', 'regular', 'roomy', 'spacious'];

/** Thresholds on the tile's content box. A KPI tile at its default 3 rows is ~144px tall: regular. At 5 rows (~248px) it turns roomy. */
export function tierFor(width: number, height: number): TileTier {
  if (!(width > 0) || !(height > 0)) return 'regular';          // not measured yet
  if (height < 110 || width < 170) return 'compact';
  if (height >= 300 && width >= 360) return 'spacious';
  if (height >= 190 && width >= 240) return 'roomy';
  return 'regular';
}

/** `tier` is at least `min`. */
export function atLeast(tier: TileTier, min: TileTier): boolean {
  return ORDER.indexOf(tier) >= ORDER.indexOf(min);
}

export function sizeOf(width: number, height: number): TileSize {
  return { width: Math.round(width), height: Math.round(height), tier: tierFor(width, height) };
}
