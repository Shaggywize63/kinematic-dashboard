'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { atLeast, type TileSize, type TileTier } from './tileSize';

/** Provided by every tile of a TileBoard (the New design). `null` anywhere else — Classic, and pages without boards. */
export const TileSizeContext = createContext<TileSize | null>(null);

/** The size of the tile this component renders in, or null when it is not in a movable tile. */
export function useTileSize(): TileSize | null {
  return useContext(TileSizeContext);
}

/** Render `children` only in a tile that has grown to at least `min` — never outside a tile, so Classic is unchanged. */
export function TileMore({ min = 'roomy', children }: { min?: TileTier; children: ReactNode }) {
  const size = useTileSize();
  return size && atLeast(size.tier, min) ? <>{children}</> : null;
}
