import { isNewDesignActive, isNewDesignAvailable, readDesignPref, writeDesignPref } from './newDesign';

/**
 * Tiny external store for "is the new design on?". Module-level (not React context) on purpose: the custom
 * icon swap reads it from inside icon components that live anywhere in the tree, and flipping the toggle must
 * re-render them without remounting the page. React reads it through `useNewDesign` (useSyncExternalStore).
 *
 * Until `initDesign` runs (after mount — the signed-in user and the saved choice live in localStorage, which
 * the server can't see) it reports "classic", so the server render and the first client render are identical
 * and hydration never mismatches.
 */
export interface DesignSnapshot { available: boolean; enabled: boolean }

const CLASSIC: DesignSnapshot = { available: false, enabled: false };

let snapshot: DesignSnapshot = CLASSIC;
let email: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** Mirror the state on <html data-design> so plain CSS can adapt (`html[data-design="new"] …`). */
function applyToDom() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-design', snapshot.enabled ? 'new' : 'classic');
}

function set(next: DesignSnapshot) {
  if (next.available === snapshot.available && next.enabled === snapshot.enabled) return;
  snapshot = next;
  applyToDom();
  emit();
}

export const subscribeDesign = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getDesignSnapshot = (): DesignSnapshot => snapshot;
/** What the server (and the first client render) sees. */
export const getServerDesignSnapshot = (): DesignSnapshot => CLASSIC;

/** Resolve availability + the saved choice for this user. Call once after mount (and again if the user changes). */
export function initDesign(userEmail: string | null | undefined) {
  email = userEmail ?? null;
  const available = isNewDesignAvailable(email);
  set({ available, enabled: isNewDesignActive(available, readDesignPref(email)) });
}

/** Switch between Classic (false) and New (true). A no-op for accounts without access. */
export function setDesignEnabled(useNew: boolean) {
  if (!snapshot.available) return;
  writeDesignPref(email, useNew);
  set({ available: true, enabled: useNew });
}

/** Test seam: back to the pre-init state. */
export function resetDesignForTests() {
  email = null;
  snapshot = CLASSIC;
  listeners.clear();
}
