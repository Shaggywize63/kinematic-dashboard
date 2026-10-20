import { test, expect } from '@playwright/test';
import {
  heldFrom, boardOf, moveItem, applyOrder, listOf, setListOrder, setListHidden, resetLayout,
  TAB_CAPABLE, MAX_EXTRA_TABS, APP_ITEM_NEEDS, needMet,
} from '../src/lib/appLayout';
import { ALL_MODULES } from '../src/lib/modules';
import type { AppCustomization } from '../src/lib/appCustomization';

/** Pure logic behind Client Management → App layout. No browser. */

const FF = ['attendance', 'orders', 'activities', 'form_builder', 'field_expenses', 'leave', 'broadcast', 'timeline', 'visit_logs', 'notifications', 'settings'];
const held = heldFrom(FF);

test.describe('which screens a client\'s ticked modules provide', () => {
  test('every module a screen needs exists in the catalogue', () => {
    const ids = new Set(ALL_MODULES.map((m) => m.id));
    for (const section of Object.values(APP_ITEM_NEEDS)) {
      for (const need of Object.values(section)) {
        if (need && 'any' in need) for (const m of need.any) expect(ids.has(m)).toBe(true);
      }
    }
  });
  test('a package need is met by any module of that package', () => {
    expect(needMet({ package: 'crm' }, heldFrom(['crm_leads']))).toBe(true);
    expect(needMet({ package: 'crm' }, heldFrom(['attendance']))).toBe(false);
    expect(needMet(null, heldFrom([]))).toBe(true);
  });
});

test.describe('board', () => {
  test('default bar is the field-force tabs the client has, menu is the rest, unticked screens are unavailable', () => {
    const b = boardOf({}, held);
    expect(b.bar).toEqual(['attendance', 'route_plan', 'activity', 'new_form']);
    expect(b.menu).toEqual(expect.arrayContaining(['profile', 'notifications', 'broadcast', 'log_visit', 'expenses', 'leave', 'timeline']));
    expect(b.menu).not.toContain('attendance');
    expect(b.unavailable).toEqual(expect.arrayContaining(['learning_hub', 'leaderboard', 'crm', 'van_load']));
    expect(b.hidden).toEqual([]);
  });
  test('a client without field force has no default bar', () => {
    expect(boardOf({}, heldFrom(['crm_leads', 'settings'])).bar).toEqual([]);
  });
  test('a hide flag moves a screen to hidden', () => {
    const b = boardOf({ menu: { leave: false }, tabs: { new_form: false } }, held);
    expect(b.hidden.sort()).toEqual(['leave', 'new_form']);
    expect(b.bar).not.toContain('new_form');
    expect(b.menu).not.toContain('leave');
  });
  test('an explicit layout.tabs wins over the default bar, and the legacy expenses opt-in still counts', () => {
    expect(boardOf({ layout: { tabs: ['leave', 'attendance'] } }, held).bar).toEqual(['leave', 'attendance']);
    expect(boardOf({ tabs: { expenses: true } }, held).bar).toEqual(['attendance', 'route_plan', 'activity', 'new_form']); // capped at 4
    expect(boardOf({ tabs: { expenses: true, new_form: false } }, held).bar).toEqual(['attendance', 'route_plan', 'activity', 'expenses']);
  });
  test('a screen in the bar is not repeated in the menu, and layout.menu orders the menu', () => {
    const b = boardOf({ layout: { tabs: ['leave'], menu: ['broadcast', 'profile'] } }, held);
    expect(b.menu).not.toContain('leave');
    expect(b.menu.slice(0, 2)).toEqual(['broadcast', 'profile']);
  });
});

test.describe('moveItem', () => {
  test('menu → bar puts the screen at the index, writes an explicit bar and takes it out of the menu', () => {
    const r = moveItem({ tabs: { new_form: false } }, held, 'leave', 'bar', 1); // new_form hidden → 3 tabs, room for one
    expect(r.error).toBeUndefined();
    expect(r.cfg.layout?.tabs).toEqual(['attendance', 'leave', 'route_plan', 'activity']);
    const b = boardOf(r.cfg, held);
    expect(b.bar[1]).toBe('leave');
    expect(b.menu).not.toContain('leave');
    expect(r.cfg.layout?.menu).toBeUndefined();     // the menu was never arranged: it keeps following the modules
  });
  test('the bar holds Home plus four: a fifth is refused with a reason and nothing changes', () => {
    expect(boardOf({}, held).bar.length).toBe(MAX_EXTRA_TABS);
    const full = moveItem({}, held, 'timeline', 'bar', 0);
    expect(full.error).toMatch(/holds Home plus 4/);
    expect(full.cfg).toEqual({});
  });
  test('moving within the bar reorders it', () => {
    const cfg = moveItem({}, held, 'activity', 'bar', 0).cfg;
    expect(boardOf(cfg, held).bar).toEqual(['activity', 'attendance', 'route_plan', 'new_form']);
  });
  test('bar-only screens cannot go to the menu; menu-only screens cannot go to the bar', () => {
    expect(moveItem({}, held, 'attendance', 'menu', 0).error).toMatch(/only exists as a bottom tab/);
    expect(moveItem({}, held, 'profile', 'bar', 0).error).toMatch(/can't sit in the bottom bar/);
  });
  test('a screen whose module is not ticked cannot be placed', () => {
    expect(moveItem({}, held, 'learning_hub', 'menu', 0).error).toMatch(/needs a module that is not ticked/);
  });
  test('bar → hidden sets the flag; hidden → menu clears it again', () => {
    const hidden = moveItem({}, held, 'new_form', 'hidden', 0).cfg;
    expect(hidden.tabs?.new_form).toBe(false);
    expect(hidden.layout).toBeUndefined();          // legacy default bar untouched: only the flag changed
    const back = moveItem(moveItem({ menu: { leave: false } }, held, 'leave', 'menu', 0).cfg, held, 'leave', 'menu', 0).cfg;
    expect(back.menu).toBeUndefined();
  });
  test('menu reorder writes the full explicit order', () => {
    const b = boardOf({}, held);
    const r = moveItem({}, held, 'timeline', 'menu', 0);
    expect(r.cfg.layout?.menu?.[0]).toBe('timeline');
    expect(r.cfg.layout?.menu?.length).toBe(b.menu.length);
  });
  test('Expenses in the bar also sets the legacy tabs.expenses opt-in so older app builds show it; leaving removes it', () => {
    let cfg: AppCustomization = { tabs: { new_form: false } };            // leaves room in the bar
    cfg = moveItem(cfg, held, 'expenses', 'bar', 3).cfg;
    expect(cfg.tabs?.expenses).toBe(true);
    expect(boardOf(cfg, held).bar).toContain('expenses');
    cfg = moveItem(cfg, held, 'expenses', 'menu', 0).cfg;
    expect(cfg.tabs?.expenses).toBeUndefined();
    expect(boardOf(cfg, held).bar).not.toContain('expenses');
  });
  test('does not mutate its input and keeps unrelated config (labels, features)', () => {
    const cfg: AppCustomization = { labels: { menu: { leave: 'Time off' } }, features: { rate_prompt: true } };
    const snapshot = JSON.stringify(cfg);
    const r = moveItem(cfg, held, 'leave', 'bar', 0);
    expect(JSON.stringify(cfg)).toBe(snapshot);
    expect(r.cfg.labels).toEqual(cfg.labels);
    expect(r.cfg.features).toEqual(cfg.features);
  });
  test('every id the editor can put in the bar is a bar-capable screen', () => {
    for (const id of TAB_CAPABLE) expect(['tabs', 'menu'].some((s) => id in (APP_ITEM_NEEDS as any)[s])).toBe(true);
  });
});

test.describe('ordered lists and reset', () => {
  test('applyOrder lists first, rest keep default order', () => {
    expect(applyOrder(['a', 'b', 'c', 'd'], ['c', 'x', 'a'])).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });
  test('settings rows: reorder, hide, and unavailable rows are reported', () => {
    let cfg: AppCustomization = {};
    let l = listOf(cfg, held, 'settings');
    expect(l.rows.map((r) => r.id)).toEqual(['appearance', 'crm_only_mode', 'app_lock', 'about']);
    expect(l.unavailable.map((u) => u.id)).toEqual(['face_enrollment']);
    cfg = setListOrder(cfg, 'settings', ['about', 'appearance']);
    cfg = setListHidden(cfg, 'settings', 'app_lock', true);
    l = listOf(cfg, held, 'settings');
    expect(l.rows.map((r) => r.id)).toEqual(['about', 'appearance', 'crm_only_mode', 'app_lock']);
    expect(l.rows.find((r) => r.id === 'app_lock')?.hidden).toBe(true);
  });
  test('reset drops the layout but keeps hides and labels', () => {
    const cfg = resetLayout({ layout: { menu: ['leave'] }, menu: { leave: false }, labels: { menu: { leave: 'X' } }, tabs: { expenses: true } });
    expect(cfg.layout).toBeUndefined();
    expect(cfg.menu).toEqual({ leave: false });
    expect(cfg.labels).toEqual({ menu: { leave: 'X' } });
    expect(cfg.tabs).toBeUndefined();
  });
});
