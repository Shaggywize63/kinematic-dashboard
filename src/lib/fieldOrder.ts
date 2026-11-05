// Pure helpers for Settings -> Custom Fields ordering. No React, no I/O: unit-tested from Playwright's node context.
//
// One list per entity: built-in ("system") rows and custom rows together.
//   - built-in order  = field_overrides["<entity>.<key>"].order   (universal keys only)
//   - custom order    = crm_custom_field_defs.position
// Both live on ONE shared scale, renumbered 0..n together whenever the admin reorders (see crmFieldOverrides.ts).

import {
  builtinOrder,
  customOrder,
  fieldOverrideKey,
  hasFormOrder,
  type FieldOverrides,
} from './crmFieldOverrides';

export type FieldRow = {
  /** Unique across entities: `b:<entity>.<key>` for a built-in, `c:<customFieldId>` for a custom field. */
  rid: string;
  kind: 'builtin' | 'custom';
  /** The built-in field key, or the custom field id. */
  ref: string;
};

export const builtinRid = (entity: string, key: string) => `b:${entity}.${key}`;
export const customRid = (id: string) => `c:${id}`;

export type CustomOrderInput = { id: string; position?: number | null };

/**
 * The entity's ONE ordered list.
 *  - Before the admin ever reordered: built-ins in `builtinKeys` order, then customs by `position`
 *    (exactly what the forms render today).
 *  - Once ordered (`hasFormOrder`): everything sorted by its saved number (built-in `order`, custom `position`);
 *    a field that was never placed goes to the end. Ties: built-ins first, then original order.
 */
export function mergeFieldOrder(
  entity: string,
  builtinKeys: string[],
  customs: CustomOrderInput[],
  overrides: FieldOverrides | undefined,
): FieldRow[] {
  const ordered = hasFormOrder(overrides, entity);
  const rows = [
    ...builtinKeys.map((key, i) => ({
      row: { rid: builtinRid(entity, key), kind: 'builtin' as const, ref: key },
      sort: ordered ? builtinOrder(overrides, entity, key) : 0,
      tie: i,
    })),
    ...customs.map((c, i) => ({
      row: { rid: customRid(c.id), kind: 'custom' as const, ref: c.id },
      sort: customOrder(c.position),
      tie: 1_000_000 + i,
    })),
  ];
  if (!ordered) {
    // Built-ins keep their fixed layout; only the customs are sorted (by position, unplaced last).
    const b = rows.filter((r) => r.row.kind === 'builtin');
    const c = rows.filter((r) => r.row.kind === 'custom').sort((x, y) => x.sort - y.sort || x.tie - y.tie);
    return [...b, ...c].map((r) => r.row);
  }
  return rows.sort((x, y) => x.sort - y.sort || x.tie - y.tie).map((r) => r.row);
}

/** Move `fromRid` into the place of `toRid` (drag and drop). Null = nothing to do. Never mutates `rows`. */
export function moveTo(rows: FieldRow[], fromRid: string, toRid: string): FieldRow[] | null {
  const from = rows.findIndex((r) => r.rid === fromRid);
  const to = rows.findIndex((r) => r.rid === toRid);
  if (from < 0 || to < 0 || from === to) return null;
  const next = rows.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The row an Up (-1) / Down (+1) press swaps places with: the nearest neighbour in that direction that is shown
 * (`isVisible`, default all). Null when the row is already at that end, i.e. the button is disabled.
 */
export function stepTarget(
  rows: FieldRow[],
  rid: string,
  dir: -1 | 1,
  isVisible: (row: FieldRow) => boolean = () => true,
): string | null {
  const i = rows.findIndex((r) => r.rid === rid);
  if (i < 0) return null;
  for (let j = i + dir; j >= 0 && j < rows.length; j += dir) {
    if (isVisible(rows[j])) return rows[j].rid;
  }
  return null;
}

export function canStep(rows: FieldRow[], rid: string, dir: -1 | 1, isVisible?: (row: FieldRow) => boolean): boolean {
  return stepTarget(rows, rid, dir, isVisible) !== null;
}

/** Up/Down button: the new list, or null at the ends. */
export function moveStep(
  rows: FieldRow[],
  rid: string,
  dir: -1 | 1,
  isVisible?: (row: FieldRow) => boolean,
): FieldRow[] | null {
  const target = stepTarget(rows, rid, dir, isVisible);
  return target ? moveTo(rows, rid, target) : null;
}

/** Renumber the WHOLE list 0..n: built-in orders for crmSettings, custom positions for the reorder endpoint. */
export function renumber(rows: FieldRow[]): { builtin: Record<string, number>; customs: Array<{ id: string; position: number }> } {
  const builtin: Record<string, number> = {};
  const customs: Array<{ id: string; position: number }> = [];
  rows.forEach((r, idx) => {
    if (r.kind === 'builtin') builtin[r.ref] = idx;
    else customs.push({ id: r.ref, position: idx });
  });
  return { builtin, customs };
}

/**
 * Write the new built-in numbers into the overrides map (universal keys only). Keeps label / required / hidden /
 * legacy position. Returns a new map.
 */
export function applyBuiltinOrder(overrides: FieldOverrides, entity: string, order: Record<string, number>): FieldOverrides {
  const next: FieldOverrides = { ...overrides };
  for (const [key, n] of Object.entries(order)) {
    const k = fieldOverrideKey(entity, key);
    next[k] = { ...(next[k] || {}), order: n };
  }
  return next;
}

/**
 * Position for a NEW custom field: after everything in the entity's merged list, i.e. (max built-in order / custom
 * position) + 1. Falls back to the number of custom fields when nothing is numbered yet.
 */
export function nextPosition(overrides: FieldOverrides | undefined, entity: string, customs: CustomOrderInput[]): number {
  let max: number | undefined;
  const bump = (n: unknown) => {
    if (typeof n === 'number' && Number.isFinite(n)) max = max === undefined ? n : Math.max(max, n);
  };
  const prefix = `${entity}.`;
  for (const [k, v] of Object.entries(overrides || {})) {
    if (k.startsWith(prefix) && !k.includes('@')) bump(v?.order);
  }
  for (const c of customs) bump(c.position);
  return max === undefined ? customs.length : max + 1;
}

/**
 * Reset a built-in field to its defaults: clears label / required / hidden but KEEPS its place in the order
 * (universal key), otherwise a reset would silently move the field. A scoped (@b2b/@b2c) override never carries
 * an order, so it is removed entirely. Returns a new map.
 */
export function resetFieldOverride(
  overrides: FieldOverrides,
  entity: string,
  key: string,
  scope: 'universal' | 'b2b' | 'b2c' = 'universal',
): FieldOverrides {
  const next: FieldOverrides = { ...overrides };
  const k = scope === 'universal' ? fieldOverrideKey(entity, key) : fieldOverrideKey(entity, key, scope);
  const order = scope === 'universal' ? overrides[k]?.order : undefined;
  if (typeof order === 'number') next[k] = { order };
  else delete next[k];
  return next;
}

/** True when a reorder response says rows were not saved (`updated < count`) or the call reported not-ok. */
export function reorderIncomplete(res: unknown): boolean {
  const r = res as { data?: unknown } | null | undefined;
  const body = (r && typeof r === 'object' && r.data && typeof r.data === 'object' ? r.data : res) as
    | { ok?: boolean; count?: number; updated?: number }
    | null
    | undefined;
  if (!body || typeof body !== 'object') return false;
  if (body.ok === false) return true;
  return typeof body.count === 'number' && typeof body.updated === 'number' && body.updated < body.count;
}
