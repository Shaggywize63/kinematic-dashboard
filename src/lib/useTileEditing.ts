'use client';
import { useSyncExternalStore } from 'react';
import { getServerTileEditSnapshot, getTileEditSnapshot, resetAllTiles, setTileEditing, subscribeTileEdit } from './tileEditStore';

/** The page-wide tile edit state (see tileEditStore.ts) plus the actions the header control uses. */
export function useTileEditing() {
  const s = useSyncExternalStore(subscribeTileEdit, getTileEditSnapshot, getServerTileEditSnapshot);
  return { ...s, setEditing: setTileEditing, resetAll: resetAllTiles };
}
