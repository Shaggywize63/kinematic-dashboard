import { test, expect } from '@playwright/test';
import {
  SLOT_ORDER,
  accountStructureGaps,
  leadIdentitySlots,
  missingSlots,
  structureCompleteness,
  structureSummary,
  type AccountStructureSource,
} from '../src/lib/leadStructure';

/**
 * Contract test for the lead/account STRUCTURE model (src/lib/leadStructure.ts).
 *
 * Both the identity strip and the "what's missing" panels read this one module, so these
 * assertions are what keeps the display and the nag in agreement. The rules that matter:
 * every slot always renders (a gap must be visible, never silently dropped), blank-ish values
 * count as missing, and an account gap is always counted and specific rather than generic.
 */

const FULL = {
  account: 'NTPC Limited',
  plant: 'Dadri Super Thermal Plant',
  department: 'Procurement',
  contact: 'R. Sharma',
  requirement: '150 mm Gate Valves',
  serial: 'SRPR2627-12',
  owner: 'Rahul K.',
};

test.describe('leadIdentitySlots — the identity chain', () => {
  test('always returns all seven links, in chain order, however empty the lead is', () => {
    for (const src of [FULL, {}, { account: 'NTPC Limited' }]) {
      const slots = leadIdentitySlots(src);
      expect(slots).toHaveLength(SLOT_ORDER.length);
      expect(slots.map((s) => s.key)).toEqual([...SLOT_ORDER]);
    }
  });

  test('a fully filled lead has no gaps and reads as complete', () => {
    const slots = leadIdentitySlots(FULL);
    expect(missingSlots(slots)).toHaveLength(0);
    expect(structureCompleteness(slots)).toEqual({ filled: 7, total: 7, pct: 100 });
    expect(structureSummary(slots)).toBe('Complete');
  });

  test('blank, whitespace-only, null and undefined all count as missing', () => {
    const slots = leadIdentitySlots({ account: 'NTPC Limited', plant: '   ', department: null, contact: undefined, requirement: '' });
    const gaps = missingSlots(slots).map((s) => s.key);
    expect(gaps).toEqual(['plant', 'department', 'contact', 'requirement', 'serial', 'owner']);
    expect(structureCompleteness(slots).filled).toBe(1);
  });

  test('values are trimmed, so padding never passes as content', () => {
    const slots = leadIdentitySlots({ account: '  NTPC Limited  ' });
    expect(slots.find((s) => s.key === 'account')?.value).toBe('NTPC Limited');
  });

  test('the summary names the open links in chain order', () => {
    const slots = leadIdentitySlots({ ...FULL, plant: '', department: '' });
    expect(structureSummary(slots)).toBe('Missing plant, department');
  });

  test('every slot carries a fix and a why, so the panel is never a generic nag', () => {
    for (const s of leadIdentitySlots({})) {
      expect(s.fix.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  test('serial and owner are marked system-filled; the rep-entered links are not', () => {
    const byKey = Object.fromEntries(leadIdentitySlots({}).map((s) => [s.key, s]));
    expect(byKey.serial.system).toBe(true);
    expect(byKey.owner.system).toBe(true);
    for (const k of ['account', 'plant', 'department', 'contact', 'requirement']) {
      expect(byKey[k].system).toBeUndefined();
    }
  });
});

// A healthy operating company: under a group, plants recorded, people on file, complete leads.
const HEALTHY: AccountStructureSource = {
  isGroup: false, hasParent: true, childCount: 0, childLeadCount: 0,
  leadCount: 3, plantCount: 2, contactCount: 4,
  leadsMissingPlant: 0, leadsMissingDepartment: 0, leadsMissingRequirement: 0, leadsMissingContact: 0,
};

test.describe('accountStructureGaps — what breaks the tree', () => {
  test('a healthy operating company reports nothing', () => {
    expect(accountStructureGaps(HEALTHY)).toHaveLength(0);
  });

  test('a group whose children carry no leads is a break, not a nit', () => {
    // This is the real JSW Group case: 2 companies under it, not one lead between them,
    // so the group renders as an empty branch.
    const gaps = accountStructureGaps({ ...HEALTHY, isGroup: true, hasParent: false, childCount: 2, childLeadCount: 0, leadCount: 0, plantCount: 0, contactCount: 0 });
    const noLeads = gaps.find((g) => g.key === 'group-no-leads');
    expect(noLeads?.severity).toBe('break');
    expect(noLeads?.detail).toContain('2 companies');
  });

  test('a group with children and leads under them is fine', () => {
    const gaps = accountStructureGaps({ ...HEALTHY, isGroup: true, hasParent: false, childCount: 11, childLeadCount: 11, leadCount: 0, plantCount: 0 });
    expect(gaps.map((g) => g.key)).not.toContain('group-no-leads');
    expect(gaps.map((g) => g.key)).not.toContain('no-parent');
  });

  test('an empty group is flagged for having nothing under it', () => {
    const gaps = accountStructureGaps({ ...HEALTHY, isGroup: true, hasParent: false, childCount: 0, childLeadCount: 0, leadCount: 0, contactCount: 0 });
    expect(gaps[0]).toMatchObject({ key: 'group-no-children', severity: 'break' });
  });

  test('a group is never told it has no parent — only operating companies are', () => {
    const asGroup = accountStructureGaps({ ...HEALTHY, isGroup: true, hasParent: false, childCount: 1, childLeadCount: 1 });
    expect(asGroup.map((g) => g.key)).not.toContain('no-parent');
    const asCompany = accountStructureGaps({ ...HEALTHY, hasParent: false });
    expect(asCompany.map((g) => g.key)).toContain('no-parent');
  });

  test('leads sitting on a company with no plant layer is a break, and is counted', () => {
    const gaps = accountStructureGaps({ ...HEALTHY, plantCount: 0, leadCount: 1 });
    const g = gaps.find((x) => x.key === 'no-plants');
    expect(g?.severity).toBe('break');
    expect(g?.detail).toContain('1 lead'); // singular, not "1 leads"
  });

  test('a company with no plants AND no leads is not nagged about plants', () => {
    const gaps = accountStructureGaps({ ...HEALTHY, plantCount: 0, leadCount: 0, contactCount: 0 });
    expect(gaps.map((g) => g.key)).not.toContain('no-plants');
  });

  test('per-lead gaps are counted individually and pluralised', () => {
    const gaps = accountStructureGaps({ ...HEALTHY, leadsMissingPlant: 1, leadsMissingDepartment: 4, leadsMissingRequirement: 0, leadsMissingContact: 2 });
    const labels = gaps.map((g) => g.label);
    expect(labels).toContain('1 lead without a plant');
    expect(labels).toContain('4 leads without a department');
    expect(labels).toContain('2 leads without a contact');
    // Zero never produces a row — the panel only ever shows real, counted work.
    expect(labels.some((l) => l.includes('requirement'))).toBe(false);
  });

  test('no people on file only matters once there are leads to follow up', () => {
    expect(accountStructureGaps({ ...HEALTHY, contactCount: 0 }).map((g) => g.key)).toContain('no-contacts');
    expect(accountStructureGaps({ ...HEALTHY, contactCount: 0, leadCount: 0, childLeadCount: 0, plantCount: 1 }).map((g) => g.key)).not.toContain('no-contacts');
  });

  test('every gap has a key, a label and a counted detail', () => {
    const gaps = accountStructureGaps({
      isGroup: false, hasParent: false, childCount: 0, childLeadCount: 0,
      leadCount: 2, plantCount: 0, contactCount: 0,
      leadsMissingPlant: 2, leadsMissingDepartment: 1, leadsMissingRequirement: 1, leadsMissingContact: 1,
    });
    expect(gaps.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const g of gaps) {
      expect(g.key).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.detail.length).toBeGreaterThan(10);
      expect(['break', 'gap']).toContain(g.severity);
      expect(keys.has(g.key)).toBe(false); // keys are unique — they are React list keys
      keys.add(g.key);
    }
  });
});
