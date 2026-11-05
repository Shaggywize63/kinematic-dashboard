import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import {
  applyBuiltinOrder, canStep, mergeFieldOrder, moveStep, moveTo, nextPosition, renumber, reorderIncomplete,
  resetFieldOverride, stepTarget,
} from '../src/lib/fieldOrder';

/**
 * Settings -> Custom Fields: ONE ordered list per entity (system + custom rows together).
 *   - pure helpers (merge / move / renumber / create position / reset / reorder-response check), no browser;
 *   - the page: mixed list, Up/Down buttons, both halves saved (settings PATCH + custom-fields reorder POST),
 *     partial-save detection.
 */

const BUILTINS = ['first_name', 'last_name', 'email', 'phone'];
const cust = (id: string, position?: number | null) => ({ id, position });

// ── pure helpers ─────────────────────────────────────────────────────────────
test.describe('fieldOrder helpers', () => {
  test('default order (never reordered): built-ins in list order, then customs by position, unplaced last', () => {
    const rows = mergeFieldOrder('lead', BUILTINS, [cust('c2', 5), cust('c0', null), cust('c1', 1)], {});
    expect(rows.map((r) => r.ref)).toEqual(['first_name', 'last_name', 'email', 'phone', 'c1', 'c2', 'c0']);
    // Stray legacy `position` / label overrides do not switch ordered mode on.
    const legacy = mergeFieldOrder('lead', BUILTINS, [cust('c1', 1)], { 'lead.phone': { position: 0, label: 'Mobile' } });
    expect(legacy.map((r) => r.ref)).toEqual(['first_name', 'last_name', 'email', 'phone', 'c1']);
  });

  test('ordered mode: built-ins by `order`, customs by `position`, interleaved; unplaced goes to the end', () => {
    const overrides = {
      'lead.first_name': { order: 1 },
      'lead.last_name': { order: 3 },
      'lead.email': { order: 4 },
      // phone never placed -> end
      'lead.phone@b2c': { order: 0 }, // scoped keys never count
    };
    const rows = mergeFieldOrder('lead', BUILTINS, [cust('c0', 0), cust('c2', 2), cust('cNew', null)], overrides);
    expect(rows.map((r) => r.ref)).toEqual(['c0', 'first_name', 'c2', 'last_name', 'email', 'phone', 'cNew']);
    expect(rows.map((r) => r.kind)).toEqual(['custom', 'builtin', 'custom', 'builtin', 'builtin', 'builtin', 'custom']);
  });

  test('ordered mode is per entity: another entity\'s orders do not reorder this one', () => {
    const rows = mergeFieldOrder('contact', ['first_name', 'phone'], [cust('c1', 0)], { 'lead.phone': { order: 0 } });
    expect(rows.map((r) => r.ref)).toEqual(['first_name', 'phone', 'c1']);
  });

  test('renumber after a move: whole list 0..n, both halves, nothing else touched', () => {
    const rows = mergeFieldOrder('lead', BUILTINS, [cust('c1', 0), cust('c2', 1)], {});
    // drag the custom field c2 onto first_name
    const next = moveTo(rows, 'c:c2', 'b:lead.first_name');
    expect(next!.map((r) => r.ref)).toEqual(['c2', 'first_name', 'last_name', 'email', 'phone', 'c1']);
    const n = renumber(next!);
    expect(n.builtin).toEqual({ first_name: 1, last_name: 2, email: 3, phone: 4 });
    expect(n.customs).toEqual([{ id: 'c2', position: 0 }, { id: 'c1', position: 5 }]);

    const overrides = applyBuiltinOrder({ 'lead.phone': { label: 'Mobile', required: true, hidden: false, position: 9 }, 'contact.phone': { order: 7 } }, 'lead', n.builtin);
    expect(overrides['lead.phone']).toEqual({ label: 'Mobile', required: true, hidden: false, position: 9, order: 4 });
    expect(overrides['lead.first_name']).toEqual({ order: 1 });
    expect(overrides['contact.phone']).toEqual({ order: 7 });
    // The saved numbers reproduce the moved order.
    const again = mergeFieldOrder('lead', BUILTINS, n.customs.map((c) => cust(c.id, c.position)), overrides);
    expect(again.map((r) => r.ref)).toEqual(['c2', 'first_name', 'last_name', 'email', 'phone', 'c1']);
  });

  test('moving never mutates the input and ignores a no-op / unknown row', () => {
    const rows = mergeFieldOrder('lead', BUILTINS, [], {});
    const copy = JSON.stringify(rows);
    expect(moveTo(rows, 'b:lead.email', 'b:lead.email')).toBeNull();
    expect(moveTo(rows, 'b:lead.email', 'b:lead.nope')).toBeNull();
    expect(moveTo(rows, 'b:lead.email', 'b:lead.first_name')).not.toBeNull();
    expect(JSON.stringify(rows)).toBe(copy);
  });

  test('Up / Down: disabled at the ends, swap with the neighbour, skip rows that are not shown', () => {
    const rows = mergeFieldOrder('lead', BUILTINS, [cust('c1', 0)], {}); // first_name last_name email phone c1
    expect(canStep(rows, 'b:lead.first_name', -1)).toBe(false);
    expect(canStep(rows, 'b:lead.first_name', 1)).toBe(true);
    expect(canStep(rows, 'c:c1', 1)).toBe(false);
    expect(canStep(rows, 'c:c1', -1)).toBe(true);
    expect(moveStep(rows, 'b:lead.first_name', -1)).toBeNull();
    expect(moveStep(rows, 'c:c1', 1)).toBeNull();
    expect(moveStep(rows, 'b:lead.last_name', 1)!.map((r) => r.ref)).toEqual(['first_name', 'email', 'last_name', 'phone', 'c1']);
    // With the system rows hidden, "up" from the custom field has nowhere to go; the list is only customs.
    const onlyCustom = (r: { kind: string }) => r.kind === 'custom';
    expect(stepTarget(rows, 'c:c1', -1, onlyCustom)).toBeNull();
    // A custom field next to a hidden system row jumps over it.
    const two = mergeFieldOrder('lead', ['a', 'b'], [cust('c1', 0), cust('c2', 1)], {}); // a b c1 c2
    expect(moveStep(two, 'c:c2', -1, onlyCustom)!.map((r) => r.ref)).toEqual(['a', 'b', 'c2', 'c1']);
  });

  test('create position = max(order / position over the merged list) + 1', () => {
    // Not ordered yet: after the highest custom position.
    expect(nextPosition({}, 'lead', [cust('a', 0), cust('b', 3)])).toBe(4);
    // Nothing numbered: falls back to the count.
    expect(nextPosition({}, 'lead', [])).toBe(0);
    expect(nextPosition({}, 'lead', [cust('a', null), cust('b', null)])).toBe(2);
    // Ordered: the built-in numbers count, so a new field lands at the END of the unified list.
    const overrides = { 'lead.first_name': { order: 0 }, 'lead.phone': { order: 11 }, 'lead.email@b2b': { order: 99 }, 'contact.phone': { order: 50 } };
    expect(nextPosition(overrides, 'lead', [cust('a', 4), cust('b', 7)])).toBe(12);
    expect(nextPosition(overrides, 'lead', [cust('a', 20)])).toBe(21);
    expect(nextPosition(overrides, 'deal', [])).toBe(0);
  });

  test('reset clears label / required / hidden but KEEPS the order', () => {
    const overrides = {
      'lead.phone': { label: 'Mobile', required: true, hidden: true, position: 3, order: 7 },
      'lead.phone@b2c': { label: 'Cell' },
      'lead.email': { label: 'Mail' },
    };
    const reset = resetFieldOverride(overrides, 'lead', 'phone', 'universal');
    expect(reset['lead.phone']).toEqual({ order: 7 });
    expect(reset['lead.phone@b2c']).toEqual({ label: 'Cell' });
    // Unplaced field: the override disappears completely.
    expect(resetFieldOverride(overrides, 'lead', 'email', 'universal')['lead.email']).toBeUndefined();
    // Scoped reset removes only the scoped override and leaves the universal order alone.
    const scoped = resetFieldOverride(overrides, 'lead', 'phone', 'b2c');
    expect(scoped['lead.phone@b2c']).toBeUndefined();
    expect(scoped['lead.phone']).toEqual(overrides['lead.phone']);
    // The input is not mutated.
    expect(overrides['lead.phone'].label).toBe('Mobile');
  });

  test('reorder response: updated < count (or ok:false) is a failure', () => {
    expect(reorderIncomplete({ ok: true, count: 3, updated: 3 })).toBe(false);
    expect(reorderIncomplete({ success: true, data: { ok: true, count: 3, updated: 3 } })).toBe(false);
    expect(reorderIncomplete({ ok: true, count: 3, updated: 2 })).toBe(true);
    expect(reorderIncomplete({ success: true, data: { ok: true, count: 3, updated: 0 } })).toBe(true);
    expect(reorderIncomplete({ ok: false })).toBe(true);
    // An older backend that returns no counts is not treated as a failure.
    expect(reorderIncomplete({ success: true })).toBe(false);
    expect(reorderIncomplete(undefined)).toBe(false);
  });
});

// ── the page ─────────────────────────────────────────────────────────────────
const def = (id: string, field_key: string, label: string, position: number, entity_type = 'lead') => ({
  id, org_id: 'e2e-org-1', entity_type, field_key, label, field_type: 'text', required: false, position,
});
const LEAD_CUSTOMS = [def('cf-1', 'crop', 'Crop', 0), def('cf-2', 'acreage', 'Acreage', 1)];

type Spy = { patches: any[]; reorders: any[]; customFieldGets: number };

async function openPage(page: Page, o: { customs?: any[]; overrides?: Record<string, unknown>; reorderResponse?: unknown; patchStatus?: number } = {}): Promise<Spy> {
  const spy: Spy = { patches: [], reorders: [], customFieldGets: 0 };
  await seedSession(page);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: o.overrides ?? {} } } },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0];
      if (method === 'GET' && path.endsWith('/crm/custom-fields')) {
        spy.customFieldGets++;
        await route.fulfill({ json: { success: true, data: o.customs ?? LEAD_CUSTOMS } });
        return true;
      }
      if (method === 'POST' && path.endsWith('/crm/custom-fields/reorder')) {
        spy.reorders.push(route.request().postDataJSON());
        const items = spy.reorders[spy.reorders.length - 1].items as unknown[];
        await route.fulfill({ json: o.reorderResponse ?? { success: true, data: { ok: true, count: items.length, updated: items.length } } });
        return true;
      }
      if (method === 'PATCH' && path.endsWith('/crm/settings')) {
        spy.patches.push(route.request().postDataJSON());
        await route.fulfill({ status: o.patchStatus ?? 200, json: o.patchStatus && o.patchStatus >= 400 ? { success: false, error: 'nope' } : { success: true, data: {} } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/crm/settings/custom-fields');
  await expect(page.getByTestId('field-row-lead-first_name')).toBeVisible({ timeout: 30_000 });
  return spy;
}

const rowKeys = (page: Page) =>
  page.locator('tr[data-testid^="field-row-"]').evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('field-row-lead-', '')));

test.describe('Settings -> Custom Fields: one ordered list', () => {
  test('default: system rows then custom rows; the ends have disabled arrows', async ({ page }) => {
    await openPage(page);
    const keys = await rowKeys(page);
    expect(keys.slice(0, 3)).toEqual(['first_name', 'last_name', 'email']);
    expect(keys.slice(-2)).toEqual(['crop', 'acreage']);
    await expect(page.getByTestId('field-row-lead-first_name').getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(page.getByTestId('field-row-lead-first_name').getByRole('button', { name: 'Move down' })).toBeEnabled();
    await expect(page.getByTestId('field-row-lead-acreage').getByRole('button', { name: 'Move down' })).toBeDisabled();
    await expect(page.getByTestId('field-row-lead-acreage').getByRole('button', { name: 'Move up' })).toBeEnabled();
  });

  test('ordered mode shows system and custom rows interleaved', async ({ page }) => {
    await openPage(page, {
      overrides: { 'lead.first_name': { order: 1 }, 'lead.last_name': { order: 3 }, 'lead.email': { order: 4 } },
      customs: [def('cf-1', 'crop', 'Crop', 0), def('cf-2', 'acreage', 'Acreage', 2)],
    });
    const keys = await rowKeys(page);
    expect(keys.slice(0, 5)).toEqual(['crop', 'first_name', 'acreage', 'last_name', 'email']);
  });

  test('Move down on a system row saves BOTH halves: settings PATCH with numeric orders + reorder POST with the custom ids', async ({ page }) => {
    const spy = await openPage(page);
    await page.getByTestId('field-row-lead-first_name').getByRole('button', { name: 'Move down' }).click();
    await expect.poll(() => spy.patches.length).toBe(1);
    await expect.poll(() => spy.reorders.length).toBe(1);

    const fo = spy.patches[0].config.field_overrides;
    expect(typeof fo['lead.first_name'].order).toBe('number');
    expect(fo['lead.last_name'].order).toBe(0);
    expect(fo['lead.first_name'].order).toBe(1);
    // Every system field of the entity got a number; custom ones sit after them.
    const leadOrders = Object.entries(fo).filter(([k]) => k.startsWith('lead.') && !k.includes('@')).map(([, v]) => (v as any).order);
    expect(leadOrders.every((n) => typeof n === 'number')).toBe(true);
    expect(new Set(leadOrders).size).toBe(leadOrders.length);
    // Universal keys only, and no other entity touched.
    expect(Object.keys(fo).some((k) => k.includes('@'))).toBe(false);
    expect(Object.keys(fo).every((k) => k.startsWith('lead.'))).toBe(true);

    const items = spy.reorders[0].items as Array<{ id: string; position: number }>;
    expect(items.map((i) => i.id).sort()).toEqual(['cf-1', 'cf-2']);
    // Customs are numbered on the same scale, after every system field.
    expect(Math.min(...items.map((i) => i.position))).toBe(Math.max(...leadOrders) + 1);

    // The row actually moved.
    const keys = await rowKeys(page);
    expect(keys.slice(0, 3)).toEqual(['last_name', 'first_name', 'email']);
  });

  test('a custom field moved up passes the last system field (interleaving), and keeps label/required of system rows', async ({ page }) => {
    const spy = await openPage(page, { overrides: { 'lead.phone': { label: 'Mobile no.', required: false } } });
    await page.getByTestId('field-row-lead-crop').getByRole('button', { name: 'Move up' }).click();
    await expect.poll(() => spy.reorders.length).toBe(1);
    const fo = spy.patches[0].config.field_overrides;
    // Existing label / required survive the renumbering.
    expect(fo['lead.phone'].label).toBe('Mobile no.');
    expect(fo['lead.phone'].required).toBe(false);
    const items = spy.reorders[0].items as Array<{ id: string; position: number }>;
    const crop = items.find((i) => i.id === 'cf-1')!;
    const acreage = items.find((i) => i.id === 'cf-2')!;
    // crop now sits one place above the last system field (postal_code), acreage stays last.
    expect(crop.position).toBe(acreage.position - 2);
    expect((await rowKeys(page)).slice(-3)).toEqual(['crop', 'postal_code', 'acreage']);
  });

  test('a failed save reports an error and reloads the authoritative state', async ({ page }) => {
    const spy = await openPage(page, { patchStatus: 500 });
    const before = spy.customFieldGets;
    await page.getByTestId('field-row-lead-first_name').getByRole('button', { name: 'Move down' }).click();
    await expect(page.getByText(/Reorder failed/i).first()).toBeVisible();
    await expect.poll(() => spy.customFieldGets).toBeGreaterThan(before);
    // Back to the server's order.
    await expect(page.getByTestId('field-row-lead-first_name')).toBeVisible();
    expect((await rowKeys(page)).slice(0, 2)).toEqual(['first_name', 'last_name']);
  });

  test('reorder response with updated < count is treated as a failure', async ({ page }) => {
    const spy = await openPage(page, { reorderResponse: { success: true, data: { ok: true, count: 2, updated: 1 } } });
    const before = spy.customFieldGets;
    await page.getByTestId('field-row-lead-crop').getByRole('button', { name: 'Move up' }).click();
    await expect(page.getByText(/some fields could not be saved/i).first()).toBeVisible();
    await expect.poll(() => spy.customFieldGets).toBeGreaterThan(before);
  });

  test('account list has the Outcome system field', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByTestId('field-row-account-outcome')).toBeVisible();
  });
});
