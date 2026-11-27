'use client';
import { useSyncExternalStore } from 'react';
import { getDesignSnapshot, getServerDesignSnapshot, setDesignEnabled, subscribeDesign } from './designStore';

/**
 * Is the new design available to this user, and is it switched on? See `newDesign.ts` for the staged-rollout
 * switch. `enabled` implies `available`. Re-renders the caller when the header toggle flips.
 */
export function useNewDesign() {
  const s = useSyncExternalStore(subscribeDesign, getDesignSnapshot, getServerDesignSnapshot);
  return { available: s.available, enabled: s.enabled, setEnabled: setDesignEnabled };
}
