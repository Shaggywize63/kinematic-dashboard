import { test, expect } from '@playwright/test';
import {
  COLS,
  MAX_ROWS,
  clearAllLayouts,
  clearLayouts,
  defaultLayout,
  defaultLayouts,
  hasSavedLayout,
  readLayouts,
  sameLayouts,
  sanitizeLayout,
  sanitizeLayouts,
  tilesKey,
  tilesPrefix,
  widthAt,
  withHeightDelta,
  withWidth,
  writeLayouts,
  type TileSpec,
} from '../src/lib/tileLayout';
import {
  getTileEditSnapshot,
  registerTileBoard,
  resetAllTiles,
  resetTileEditForTests,
  setBoardCustomized,
  setTileEditing,
  subscribeTileEdit,
} from '../src/lib/tileEditStore';

/**
 * Contract test for the movable / resizable tiles' layout engine (src/lib/tileLayout.ts) and the page-wide
 * edit store (src/lib/tileEditStore.ts). What matters: the default flow is what the page looked like before,
 * ANY saved layout (stale, hand-edited, garbage) becomes a valid layout for today's tiles instead of breaking
 * the page, new tiles appear, and the size shortcuts stay inside the grid.
 */

// Five KPI tiles that divide the 20-column row evenly.
const KPIS: TileSpec[] = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, w: 4, h: 3, minW: 3, minH: 3 }));

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

test.describe('default flow', () => {
  test('five 4-wide tiles fill one 20-column row', () => {
    const l = defaultLayout(KPIS, 'lg');
    expect(l.map((i) => [i.i, i.x, i.y, i.w, i.h])).toEqual([
      ['a', 0, 0, 4, 3], ['b', 4, 0, 4, 3], ['c', 8, 0, 4, 3], ['d', 12, 0, 4, 3], ['e', 16, 0, 4, 3],
    ]);
  });

  test('wraps to the next row when a tile does not fit, starting below the tallest in the row', () => {
    const tiles: TileSpec[] = [{ key: 'a', w: 12, h: 5 }, { key: 'b', w: 12, h: 3 }, { key: 'c', w: 8, h: 3 }];
    const l = defaultLayout(tiles, 'lg');
    expect(l.find((i) => i.i === 'a')).toMatchObject({ x: 0, y: 0 });
    expect(l.find((i) => i.i === 'b')).toMatchObject({ x: 0, y: 5 });   // 12+12 > 20 → next row, below a (h=5)
    expect(l.find((i) => i.i === 'c')).toMatchObject({ x: 12, y: 5 });
  });

  test('narrower breakpoints derive their widths: three across on a tablet, two across / full on a phone', () => {
    expect(widthAt('lg', 4)).toBe(4);
    expect(widthAt('md', 4)).toBe(3);   // 4/20 of 12 columns, floored at 3
    expect(widthAt('md', 12)).toBe(7);
    expect(widthAt('sm', 4)).toBe(2);   // small tiles sit two to a row on a phone
    expect(widthAt('sm', 12)).toBe(4);  // half-width or wider takes the full row
    const sm = defaultLayout(KPIS, 'sm');
    expect(sm.every((i) => i.w === 2)).toBe(true);
    expect(sm.every((i) => i.x + i.w <= COLS.sm)).toBe(true);
  });

  test('every default item respects the grid', () => {
    for (const bp of ['lg', 'md', 'sm'] as const) {
      for (const i of defaultLayout(KPIS, bp)) expect(i.x + i.w).toBeLessThanOrEqual(COLS[bp]);
    }
  });
});

test.describe('making a saved layout safe', () => {
  test('a valid saved layout is kept as saved', () => {
    const saved = [
      { i: 'a', x: 0, y: 0, w: 10, h: 4 }, { i: 'b', x: 10, y: 0, w: 10, h: 4 },
      { i: 'c', x: 0, y: 4, w: 4, h: 3 }, { i: 'd', x: 4, y: 4, w: 4, h: 3 }, { i: 'e', x: 8, y: 4, w: 4, h: 3 },
    ];
    const l = sanitizeLayout(saved, KPIS, 'lg');
    expect(l.map((i) => [i.i, i.x, i.y, i.w, i.h])).toEqual(saved.map((i) => [i.i, i.x, i.y, i.w, i.h]));
  });

  test('garbage, missing or non-array input falls back to the default flow', () => {
    const def = defaultLayout(KPIS, 'lg');
    for (const bad of [null, undefined, 'x', 42, {}, [], [null, 1, 'z'], [{ i: 'nope', x: 0, y: 0, w: 1, h: 1 }]]) {
      expect(sanitizeLayout(bad, KPIS, 'lg')).toEqual(def);
    }
  });

  test('unknown ids, duplicates and non-numeric entries are dropped', () => {
    const saved = [
      { i: 'a', x: 0, y: 0, w: 6, h: 3 },
      { i: 'a', x: 6, y: 0, w: 6, h: 3 },         // duplicate → first wins
      { i: 'gone', x: 0, y: 3, w: 4, h: 3 },      // tile no longer on the page
      { i: 'b', x: 'left', y: 0, w: 4, h: 3 },    // not numeric → dropped (then re-added below)
    ];
    const l = sanitizeLayout(saved, KPIS, 'lg');
    expect(l.filter((i) => i.i === 'a')).toHaveLength(1);
    expect(l.find((i) => i.i === 'a')).toMatchObject({ x: 0, w: 6 });
    expect(l.some((i) => i.i === 'gone')).toBe(false);
    expect(new Set(l.map((i) => i.i))).toEqual(new Set(KPIS.map((t) => t.key)));
  });

  test('sizes and positions are clamped into the grid and to the tile minimum', () => {
    const saved = [{ i: 'a', x: 99, y: -5, w: 999, h: 0 }, { i: 'b', x: -3, y: 0, w: 1, h: 999 }];
    const l = sanitizeLayout(saved, KPIS, 'lg');
    const a = l.find((i) => i.i === 'a')!;
    const b = l.find((i) => i.i === 'b')!;
    expect(a.w).toBe(COLS.lg);
    expect(a.x).toBe(0);                 // a full-width tile can only start at column 0
    expect(a.y).toBe(0);
    expect(a.h).toBe(3);                 // minH 3
    expect(b.x).toBe(0);
    expect(b.w).toBe(3);                 // minW 3
    expect(b.h).toBe(MAX_ROWS);
  });

  test('a tile added to the page since the layout was saved is appended below it', () => {
    const saved = [{ i: 'a', x: 0, y: 0, w: 10, h: 4 }, { i: 'b', x: 10, y: 0, w: 10, h: 6 }];
    const tiles: TileSpec[] = [...KPIS.slice(0, 2), { key: 'new', w: 8, h: 3, minW: 3, minH: 3 }];
    const l = sanitizeLayout(saved, tiles, 'lg');
    const added = l.find((i) => i.i === 'new')!;
    expect(added.y).toBe(6);             // below the tallest existing tile (b: y0 + h6)
    expect(added.x).toBe(0);
  });

  test('layouts for all three breakpoints are produced, missing ones defaulted', () => {
    const l = sanitizeLayouts({ lg: [{ i: 'a', x: 0, y: 0, w: 10, h: 3 }] }, KPIS);
    expect(Object.keys(l).sort()).toEqual(['lg', 'md', 'sm']);
    expect(l.md).toEqual(defaultLayout(KPIS, 'md'));
    expect(l.sm).toEqual(defaultLayout(KPIS, 'sm'));
    expect(sanitizeLayouts(null, KPIS)).toEqual(defaultLayouts(KPIS));
  });

  test('sameLayouts compares only id / position / size', () => {
    const a = defaultLayouts(KPIS);
    const b = JSON.parse(JSON.stringify(a));
    b.lg[0].moved = true; b.lg[0].static = false;
    expect(sameLayouts(a, b)).toBe(true);
    b.lg[0].w = 5;
    expect(sameLayouts(a, b)).toBe(false);
  });
});

test.describe('size shortcuts', () => {
  const lg = defaultLayout(KPIS, 'lg');

  test('width presets are fractions of the row', () => {
    expect(withWidth(lg, 'a', 'lg', 1 / 4).find((i) => i.i === 'a')!.w).toBe(5);
    expect(withWidth(lg, 'a', 'lg', 1 / 2).find((i) => i.i === 'a')!.w).toBe(10);
    expect(withWidth(lg, 'a', 'lg', 1).find((i) => i.i === 'a')!.w).toBe(20);
    expect(withWidth(defaultLayout(KPIS, 'sm'), 'a', 'sm', 1).find((i) => i.i === 'a')!.w).toBe(4);
  });

  test('a wider tile is pulled back inside the grid, and the others are untouched', () => {
    const out = withWidth(lg, 'e', 'lg', 1);          // e starts at column 16
    const e = out.find((i) => i.i === 'e')!;
    expect(e).toMatchObject({ x: 0, w: 20 });
    expect(out.find((i) => i.i === 'a')).toEqual(lg.find((i) => i.i === 'a'));
  });

  test('height steps stay within the tile minimum and the board maximum', () => {
    expect(withHeightDelta(lg, 'a', 2).find((i) => i.i === 'a')!.h).toBe(5);
    expect(withHeightDelta(lg, 'a', -5).find((i) => i.i === 'a')!.h).toBe(3);                // minH 3
    expect(withHeightDelta(lg, 'a', 999).find((i) => i.i === 'a')!.h).toBe(MAX_ROWS);
  });
});

test.describe('persistence', () => {
  test('saved per user and per board', () => {
    const s = memoryStorage();
    const custom = sanitizeLayouts({ lg: [{ i: 'a', x: 10, y: 0, w: 10, h: 4 }] }, KPIS);
    writeLayouts('u1', 'home-kpis', custom, s);

    expect(readLayouts('u1', 'home-kpis', KPIS, s).lg.find((i) => i.i === 'a')).toMatchObject({ x: 10, w: 10, h: 4 });
    // another user, or another board, is untouched
    expect(readLayouts('u2', 'home-kpis', KPIS, s)).toEqual(defaultLayouts(KPIS));
    expect(readLayouts('u1', 'other-board', KPIS, s)).toEqual(defaultLayouts(KPIS));
    expect(tilesKey('u1', 'home-kpis')).not.toBe(tilesKey('u2', 'home-kpis'));
    expect(tilesKey(null, 'b')).toBe('km_tiles:anon:b');
  });

  test('a reset forgets the saved layout', () => {
    const s = memoryStorage();
    writeLayouts('u1', 'b', sanitizeLayouts({ lg: [{ i: 'a', x: 10, y: 0, w: 10, h: 4 }] }, KPIS), s);
    clearLayouts('u1', 'b', s);
    expect(readLayouts('u1', 'b', KPIS, s)).toEqual(defaultLayouts(KPIS));
  });

  test('corrupt JSON, unavailable or throwing storage never throws and reads as the default', () => {
    const s = memoryStorage();
    s.setItem(tilesKey('u1', 'b'), '{not json');
    expect(readLayouts('u1', 'b', KPIS, s)).toEqual(defaultLayouts(KPIS));
    expect(readLayouts('u1', 'b', KPIS, null)).toEqual(defaultLayouts(KPIS));
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readLayouts('u1', 'b', KPIS, broken)).toEqual(defaultLayouts(KPIS));
    expect(() => writeLayouts('u1', 'b', defaultLayouts(KPIS), broken)).not.toThrow();
    expect(() => clearLayouts('u1', 'b', broken)).not.toThrow();
  });
});

test.describe('page-wide edit store', () => {
  test.beforeEach(() => resetTileEditForTests());
  test.afterEach(() => resetTileEditForTests());

  test('starts idle with no boards', () => {
    expect(getTileEditSnapshot()).toEqual({ boards: 0, editing: false, resetToken: 0, customized: 0 });
  });

  test('editing can only start when a board is on the page', () => {
    setTileEditing(true);
    expect(getTileEditSnapshot().editing).toBe(false);
    const off = registerTileBoard();
    setTileEditing(true);
    expect(getTileEditSnapshot()).toMatchObject({ boards: 1, editing: true });
    off();
  });

  test('leaving the last board ends edit mode (navigating away mid-edit)', () => {
    const a = registerTileBoard();
    const b = registerTileBoard();
    setTileEditing(true);
    a();
    expect(getTileEditSnapshot()).toMatchObject({ boards: 1, editing: true });   // one board still here
    b();
    expect(getTileEditSnapshot()).toMatchObject({ boards: 0, editing: false });
    b();                                                                          // double-unmount is harmless
    expect(getTileEditSnapshot().boards).toBe(0);
  });

  test('reset bumps a token every board watches, and subscribers hear about each change', () => {
    const off = registerTileBoard();
    let heard = 0;
    const unsub = subscribeTileEdit(() => { heard += 1; });
    resetAllTiles();
    resetAllTiles();
    expect(getTileEditSnapshot().resetToken).toBe(2);
    setTileEditing(true);
    setTileEditing(true);                  // same value → no notification
    expect(heard).toBe(3);
    unsub();
    off();
  });
});


/** A storage with the bits clearAllLayouts needs (length + key), backed by a Map. */
function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    keys: () => Array.from(m.keys()),
  };
}

test.describe('reset to default', () => {
  const tiles: TileSpec[] = [{ key: 'a', w: 10, h: 3 }, { key: 'b', w: 10, h: 3 }];

  test('hasSavedLayout is false until a layout is saved, true after, false again once cleared', () => {
    const st = fakeStorage();
    expect(hasSavedLayout('u1', 'home', st)).toBe(false);
    writeLayouts('u1', 'home', defaultLayouts(tiles), st);
    expect(hasSavedLayout('u1', 'home', st)).toBe(true);
    clearLayouts('u1', 'home', st);
    expect(hasSavedLayout('u1', 'home', st)).toBe(false);
  });

  test('hasSavedLayout never throws on broken storage', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
    expect(hasSavedLayout('u1', 'home', broken)).toBe(false);
    expect(hasSavedLayout('u1', 'home', null)).toBe(false);
  });

  test('clearAllLayouts forgets every board of THIS user and nothing else', () => {
    const st = fakeStorage({ 'unrelated': 'x', 'km_new_design:demo@kinematic.com': '1' });
    writeLayouts('u1', 'home-kpis', defaultLayouts(tiles), st);
    writeLayouts('u1', 'crm-dashboard-stats', defaultLayouts(tiles), st);
    writeLayouts('u2', 'home-kpis', defaultLayouts(tiles), st);        // another person on the same browser
    writeLayouts(null, 'home-kpis', defaultLayouts(tiles), st);        // an anonymous session
    expect(clearAllLayouts('u1', st)).toBe(2);
    expect(hasSavedLayout('u1', 'home-kpis', st)).toBe(false);
    expect(hasSavedLayout('u1', 'crm-dashboard-stats', st)).toBe(false);
    expect(hasSavedLayout('u2', 'home-kpis', st)).toBe(true);          // untouched
    expect(hasSavedLayout(null, 'home-kpis', st)).toBe(true);
    expect(st.getItem('unrelated')).toBe('x');
    expect(st.getItem('km_new_design:demo@kinematic.com')).toBe('1');
  });

  test('a user id that is a prefix of another does not wipe the other (the prefix ends with the separator)', () => {
    const st = fakeStorage();
    writeLayouts('u1', 'home', defaultLayouts(tiles), st);
    writeLayouts('u10', 'home', defaultLayouts(tiles), st);
    expect(clearAllLayouts('u1', st)).toBe(1);
    expect(hasSavedLayout('u10', 'home', st)).toBe(true);
    expect(tilesPrefix('u1')).toBe('km_tiles:u1:');
  });

  test('clearAllLayouts returns 0 for missing or blocked storage', () => {
    expect(clearAllLayouts('u1', null)).toBe(0);
    const broken = { length: 1, key() { throw new Error('blocked'); }, getItem: () => null, setItem() {}, removeItem() {} };
    expect(clearAllLayouts('u1', broken)).toBe(0);
  });
});

test.describe('customised boards in the edit store', () => {
  test.beforeEach(() => resetTileEditForTests());

  test('counts boards that report a saved layout, and forgets them when they leave', () => {
    expect(getTileEditSnapshot().customized).toBe(0);
    setBoardCustomized('home-kpis', true);
    setBoardCustomized('home-panels', true);
    expect(getTileEditSnapshot().customized).toBe(2);
    setBoardCustomized('home-kpis', true);                              // reporting twice does not double count
    expect(getTileEditSnapshot().customized).toBe(2);
    setBoardCustomized('home-kpis', false);
    expect(getTileEditSnapshot().customized).toBe(1);
    setBoardCustomized('home-panels', false);
    expect(getTileEditSnapshot().customized).toBe(0);
  });

  test('notifies subscribers when the count changes', () => {
    let n = 0;
    const off = subscribeTileEdit(() => { n++; });
    setBoardCustomized('x', true);
    setBoardCustomized('x', true);                                       // no change: no notification
    setBoardCustomized('x', false);
    off();
    expect(n).toBe(2);
  });
});
