'use client';
import { useSyncExternalStore } from 'react';
import { getServerTileEditSnapshot, getTileEditSnapshot, resetAllTiles, setTileEditing, subscribeTileEdit } from './tileEditStore';
import { clearAllLayouts } from './tileLayout';

/** The page-wide tile edit state (see tileEditStore.ts) plus the actions the header control uses. */
export function useTileEditing() {
  const s = useSyncExternalStore(subscribeTileEdit, getTileEditSnapshot, getServerTileEditSnapshot);
  /** Every board on every page back to its default (this user's saved layouts are forgotten), including the ones on screen now. */
  const resetEverywhere = (userId: string | null | undefined) => { clearAllLayouts(userId); resetAllTiles(); };
  return { ...s, setEditing: setTileEditing, resetAll: resetAllTiles, resetEverywhere };
}
