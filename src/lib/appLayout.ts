// ─────────────────────────────────────────────────────────────────────────
// App layout: where each screen sits in the mobile apps and in what order.
//
// Client Management → App layout edits `app_ui.layout` (drag and drop). This file is the pure logic behind the editor:
// which screens a client's ticked modules provide, how the three zones of the field-force app (bottom bar, side menu,
// hidden) are derived from the stored config, and the edits a drag makes. The backend applies the same screen → module
// table (Kinematic: src/lib/appItems.ts) and cleans the layout again before serving it, so KEEP THE TWO IN SYNC.
//
// Contract with the apps: docs/APP_LAYOUT_CONTRACT.md in the backend repo.
//   - layout.tabs      bottom bar after Home, in order, ≤ 4, bar-capable screens only (absent = the app's default bar)
//   - layout.menu      side-menu order (listed first, the rest keep their default order after)
//   - layout.settings / crm_more / home   order only
//   - hiding a screen stays the existing `<section>.<id> = false` flag
// ─────────────────────────────────────────────────────────────────────────

import { ALL_MODULES } from './modules';
import {
  MENU_ITEMS, TAB_ITEMS, CRM_MORE_ITEMS, HOME_ITEMS, SETTINGS_ITEMS, labelFor,
  type AppCustomization, type AppItem, type AppUiSection,
} from './appCustomization';

export type Need = { any: string[] } | { package: string } | null;

/** Screen → what it needs (null = essential, always there). Mirrors the backend's APP_ITEM_NEEDS. */
export const APP_ITEM_NEEDS: Record<AppUiSection, Record<string, Need>> = {
  menu: {
    profile: null,
    notifications: { any: ['notifications'] },
    broadcast: { any: ['broadcast'] },
    learning_hub: { any: ['learning'] },
    log_visit: { any: ['visit_logs'] },
    leaderboard: { any: ['leaderboard'] },
    activity_feed: { any: ['activity_feed'] },
    stock: { any: ['inventory'] },
    grievance: { any: ['grievances'] },
    emergency_sos: { any: ['emergency_sos'] },
    expenses: { any: ['field_expenses'] },
    leave: { any: ['leave'] },
    timeline: { any: ['timeline'] },
    planogram: { any: ['planograms'] },
    book_order: { any: ['distribution_orders'] },
    collect_payment: { any: ['distribution_payments'] },
    my_orders: { any: ['distribution_orders'] },
    van_load: { any: ['distribution_van'] },
    distributor_stock: { any: ['distribution_stock'] },
    log_damage: { any: ['distribution_damage'] },
    stock_batches: { any: ['distribution_batches'] },
    crm: { package: 'crm' },
    ask_kini: { package: 'crm' },
  },
  tabs: {
    attendance: { any: ['attendance'] },
    route_plan: { any: ['orders'] },
    activity: { any: ['activities'] },
    new_form: { any: ['form_builder'] },
    expenses: { any: ['field_expenses'] },
  },
  home: {
    stores: { any: ['stores'] },
    visited: { any: ['visit_logs'] },
    forms: { any: ['form_builder'] },
    todays_route: { any: ['orders'] },
    open_volume: { any: ['crm_dashboard'] },
    my_targets: null,
  },
  settings: {
    appearance: null, crm_only_mode: null, app_lock: null, about: null,
    face_enrollment: { any: ['face_attendance'] },
  },
  crm_more: {
    accounts: { any: ['crm_accounts'] },
    pipeline: { any: ['crm_pipeline'] },
    products: { any: ['crm_products'] },
    custom_objects: { any: ['crm_settings'] },
    nearest_leads: { any: ['crm_leads'] },
    leave: { any: ['leave'] },
    expenses: { any: ['field_expenses'] },
    dashboard: { any: ['crm_dashboard'] },
    lead_analytics: { any: ['crm_lead_analytics'] },
    reports: { any: ['crm_reports'] },
    switch_ff: { package: 'field_force' },
  },
};

/** Screens that may sit in the field-force bottom bar (after Home). */
export const TAB_CAPABLE = [
  'attendance', 'route_plan', 'activity', 'new_form', 'expenses', 'leave', 'timeline', 'log_visit',
  'broadcast', 'notifications', 'crm', 'my_orders', 'book_order', 'collect_payment',
];
/** Bar = Home + up to this many more. */
export const MAX_EXTRA_TABS = 4;
/** Screens that only exist as bottom tabs (they have no side-menu entry). */
export const BAR_ONLY = ['attendance', 'route_plan', 'activity', 'new_form'];

export type Zone = 'bar' | 'menu' | 'hidden';
export type ListSection = 'settings' | 'crm_more' | 'home';

export interface Held { modules: Set<string>; packages: Set<string> }

/** What a set of ticked modules provides. */
export function heldFrom(modules: string[]): Held {
  const pkg = new Map(ALL_MODULES.map((m) => [m.id, m.package as string]));
  const packages = new Set<string>();
  for (const id of modules) { const p = pkg.get(id); if (p) packages.add(p); }
  return { modules: new Set(modules), packages };
}

export function needMet(need: Need | undefined, held: Held): boolean {
  if (!need) return true;
  if ('any' in need) return need.any.some((m) => held.modules.has(m));
  return held.packages.has(need.package);
}

/** The module (or package) a screen is waiting for, for the "needs …" hint. */
export function needLabel(need: Need | undefined): string {
  if (!need) return '';
  if ('package' in need) return `${need.package.replace('_', ' ')} package`;
  const m = ALL_MODULES.find((x) => x.id === need.any[0]);
  return m ? m.l : need.any[0];
}

export const homeSectionOf = (id: string): AppUiSection => (BAR_ONLY.includes(id) ? 'tabs' : 'menu');

const dedupe = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) === i);

/** Catalogue entry for a screen of the board (tabs first, then menu), with its default label. */
export function itemDef(id: string): AppItem | undefined {
  return TAB_ITEMS.find((i) => i.id === id) ?? MENU_ITEMS.find((i) => i.id === id);
}
export const boardLabel = (cfg: AppCustomization, id: string): string => {
  const sec = homeSectionOf(id);
  return labelFor(cfg, sec, id, itemDef(id)?.label ?? id);
};

export interface Board { bar: string[]; menu: string[]; hidden: string[]; unavailable: string[]; all: string[] }

const isHiddenFlag = (cfg: AppCustomization, id: string) => cfg[homeSectionOf(id)]?.[id] === false;

/** The three zones of the field-force app as the stored config implies them. */
export function boardOf(cfg: AppCustomization, held: Held): Board {
  const all = dedupe([...TAB_ITEMS.map((i) => i.id), ...MENU_ITEMS.map((i) => i.id)]);
  const available = all.filter((id) => needMet(APP_ITEM_NEEDS[homeSectionOf(id)][id], held));
  const unavailable = all.filter((id) => !available.includes(id));
  const hiddenSet = new Set(available.filter((id) => isHiddenFlag(cfg, id)));
  const hidden = available.filter((id) => hiddenSet.has(id));

  const explicitBar = Array.isArray(cfg.layout?.tabs);
  let bar: string[];
  if (explicitBar) {
    bar = dedupe(cfg.layout!.tabs!).filter((id) => TAB_CAPABLE.includes(id) && available.includes(id) && !hiddenSet.has(id)).slice(0, MAX_EXTRA_TABS);
  } else {
    bar = ['attendance', 'route_plan', 'activity', 'new_form'].filter((id) => available.includes(id) && !hiddenSet.has(id));
    if (cfg.tabs?.expenses === true && available.includes('expenses') && !hiddenSet.has('expenses')) bar.push('expenses');
    bar = bar.slice(0, MAX_EXTRA_TABS);
  }

  const inBar = new Set(bar);
  const menuDefault = MENU_ITEMS.map((i) => i.id).filter((id) => available.includes(id) && !hiddenSet.has(id) && !inBar.has(id));
  const menu = applyOrder(menuDefault, cfg.layout?.menu);
  return { bar, menu, hidden, unavailable, all };
}

/** Listed ids first in listed order, the rest keep their default relative order after. */
export function applyOrder(defaults: string[], order: string[] | undefined): string[] {
  if (!Array.isArray(order) || order.length === 0) return defaults;
  const set = new Set(defaults);
  const first = dedupe(order).filter((id) => set.has(id));
  const rest = defaults.filter((id) => !first.includes(id));
  return [...first, ...rest];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {}));

function setFlag(cfg: AppCustomization, section: AppUiSection, id: string, hidden: boolean) {
  const cur = { ...(cfg[section] ?? {}) } as Record<string, boolean>;
  if (hidden) cur[id] = false; else delete cur[id];
  if (Object.keys(cur).length) (cfg as Record<string, unknown>)[section] = cur; else delete (cfg as Record<string, unknown>)[section];
}

/** Move a screen to a zone at an index; returns the new config, or an unchanged config and why not. */
export function moveItem(cfg: AppCustomization, held: Held, id: string, zone: Zone, index: number): { cfg: AppCustomization; error?: string } {
  const b = boardOf(cfg, held);
  const name = boardLabel(cfg, id);
  if (!b.all.includes(id)) return { cfg, error: 'Unknown screen' };
  if (b.unavailable.includes(id)) return { cfg, error: `${name} needs a module that is not ticked for this client.` };
  const sec = homeSectionOf(id);
  const next = clone(cfg) as AppCustomization;
  let bar = b.bar.filter((x) => x !== id);
  let menu = b.menu.filter((x) => x !== id);
  const hadExplicitBar = Array.isArray(cfg.layout?.tabs);
  const clamp = (n: number, len: number) => Math.max(0, Math.min(len, Number.isFinite(n) ? n : len));

  if (zone === 'bar') {
    if (!TAB_CAPABLE.includes(id)) return { cfg, error: `${name} can't sit in the bottom bar.` };
    if (bar.length >= MAX_EXTRA_TABS) return { cfg, error: `The bottom bar holds Home plus ${MAX_EXTRA_TABS} screens. Move one out first.` };
    setFlag(next, sec, id, false); // un-hide
    bar.splice(clamp(index, bar.length), 0, id);
  } else if (zone === 'menu') {
    if (!(id in APP_ITEM_NEEDS.menu)) return { cfg, error: `${name} only exists as a bottom tab.` };
    setFlag(next, sec, id, false);
    menu.splice(clamp(index, menu.length), 0, id);
  } else {
    setFlag(next, sec, id, true);
  }

  // Only containers the admin has arranged are written, so a bar or menu they never touched keeps following the client's
  // modules (tick a new module and its tab appears) instead of being frozen by an unrelated drag.
  const layout: NonNullable<AppCustomization['layout']> = { ...(next.layout ?? {}) };
  if (zone === 'bar' || hadExplicitBar) layout.tabs = bar;
  if (zone === 'menu' || Array.isArray(cfg.layout?.menu)) layout.menu = menu;
  if (Object.keys(layout).length) next.layout = layout; else delete next.layout;

  // Old app builds know nothing of the layout: keep their opt-in Expenses tab in step with it.
  if (id === 'expenses') {
    const tabs = { ...(next.tabs ?? {}) } as Record<string, boolean>;
    if (zone === 'bar') tabs.expenses = true; else delete tabs.expenses;
    if (Object.keys(tabs).length) next.tabs = tabs; else delete next.tabs;
  }
  return { cfg: next };
}

// ── Plain ordered lists (Settings rows, CRM More, Home cards): reorder + hide only ─────────────────────────────

const LIST_DEFS: Record<ListSection, AppItem[]> = { settings: SETTINGS_ITEMS, crm_more: CRM_MORE_ITEMS, home: HOME_ITEMS };

export interface ListRow { id: string; label: string; hidden: boolean }

export function listOf(cfg: AppCustomization, held: Held, section: ListSection): { rows: ListRow[]; unavailable: AppItem[] } {
  const defs = LIST_DEFS[section];
  const needs = APP_ITEM_NEEDS[section];
  const avail = defs.filter((d) => needMet(needs[d.id], held));
  const unavailable = defs.filter((d) => !needMet(needs[d.id], held));
  const ids = applyOrder(avail.map((d) => d.id), cfg.layout?.[section]);
  const byId = new Map(avail.map((d) => [d.id, d]));
  const rows = ids.map((id) => ({
    id,
    label: labelFor(cfg, section, id, byId.get(id)!.label),
    hidden: cfg[section]?.[id] === false,
  }));
  return { rows, unavailable };
}

export function setListOrder(cfg: AppCustomization, section: ListSection, ids: string[]): AppCustomization {
  const next = clone(cfg) as AppCustomization;
  next.layout = { ...(next.layout ?? {}), [section]: dedupe(ids) };
  return next;
}

export function setListHidden(cfg: AppCustomization, section: ListSection, id: string, hidden: boolean): AppCustomization {
  const next = clone(cfg) as AppCustomization;
  setFlag(next, section, id, hidden);
  return next;
}

/** Forget the stored layout (order and bottom-bar placement); hide flags, labels and features stay. */
export function resetLayout(cfg: AppCustomization): AppCustomization {
  const next = clone(cfg) as AppCustomization;
  delete next.layout;
  if (next.tabs && 'expenses' in next.tabs) { delete next.tabs.expenses; if (!Object.keys(next.tabs).length) delete next.tabs; }
  return next;
}
