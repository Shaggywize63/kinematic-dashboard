/**
 * Page-wide "customise tiles" state. Every TileBoard on the page registers itself here; the single
 * "Customize layout" control in the header flips ALL of them into edit mode at once (and "Reset" resets them
 * all), so a page with several boards still has one place to start and finish editing.
 *
 * Module-level store (not React context) because the control lives in the header while the boards live in the
 * page — they share no ancestor that both could read. React reads it through `useTileEditing`.
 * No React / DOM imports: unit-tested in Node (e2e/tile-layout.spec.ts).
 */
export interface TileEditSnapshot {
  /** How many boards are currently mounted on the page. The header control only shows when this is > 0. */
  boards: number;
  editing: boolean;
  /** Bumped by `resetAllTiles`; each board resets its own layout when it changes. */
  resetToken: number;
}

const INITIAL: TileEditSnapshot = { boards: 0, editing: false, resetToken: 0 };

let snapshot: TileEditSnapshot = INITIAL;
const listeners = new Set<() => void>();

function set(next: TileEditSnapshot) {
  if (next.boards === snapshot.boards && next.editing === snapshot.editing && next.resetToken === snapshot.resetToken) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

export const subscribeTileEdit = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getTileEditSnapshot = (): TileEditSnapshot => snapshot;
export const getServerTileEditSnapshot = (): TileEditSnapshot => INITIAL;

/** A board mounted. Returns the unmount callback. Leaving the last board also ends edit mode (navigating away mid-edit). */
export function registerTileBoard(): () => void {
  set({ ...snapshot, boards: snapshot.boards + 1 });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const boards = Math.max(0, snapshot.boards - 1);
    set({ ...snapshot, boards, editing: boards === 0 ? false : snapshot.editing });
  };
}

export function setTileEditing(editing: boolean) {
  set({ ...snapshot, editing: editing && snapshot.boards > 0 });
}

/** Put every board on the page back to its default layout. */
export function resetAllTiles() {
  set({ ...snapshot, resetToken: snapshot.resetToken + 1 });
}

/** Test seam: back to the initial state. */
export function resetTileEditForTests() {
  snapshot = INITIAL;
  listeners.clear();
}
