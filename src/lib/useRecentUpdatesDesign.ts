'use client';
import { useCallback, useEffect, useState } from 'react';
import { getStoredUser } from './auth';
import { isRedesignActive, isRedesignAvailable, readPref, writePref } from './recentUpdatesDesign';

/**
 * Is the redesigned Recent updates available to this user, and is it switched on?
 * See `recentUpdatesDesign.ts` for the staged-rollout switch.
 *
 * The signed-in user and the saved choice live in localStorage, which the server
 * can't see — so this reads them after mount. Until then it reports "not
 * available" (classic), which keeps the server render and the first client render
 * identical and avoids a hydration mismatch.
 */
export function useRecentUpdatesDesign() {
  const [email, setEmail] = useState<string | null>(null);
  const [stored, setStored] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const e = getStoredUser()?.email ?? null;
    setEmail(e);
    setStored(readPref(e));
    setReady(true);
  }, []);

  const available = ready && isRedesignAvailable(email);
  const enabled = isRedesignActive(available, stored);

  const setEnabled = useCallback((useNew: boolean) => {
    writePref(email, useNew);
    setStored(useNew);
  }, [email]);

  return { available, enabled, setEnabled };
}
