import { test, expect } from '@playwright/test';
import {
  arr, eventKindMeta, journeyKpis, normalizeFormSerialInput, normalizeSteps, sortedEvents, sparkActivityFields, apiErrorText, personName,
} from '../src/lib/sparkAccounts';

// Pure unit checks (no browser): the Spark account-journey helpers are total — junk in, sane out.

test.describe('sparkAccounts helpers', () => {
  test('arr only passes arrays through', () => {
    expect(arr([1])).toEqual([1]);
    for (const v of [undefined, null, 'x', 3, { a: 1 }]) expect(arr(v)).toEqual([]);
  });

  test('normalizeFormSerialInput upper-cases', () => {
    expect(normalizeFormSerialInput('srpr2627-12')).toBe('SRPR2627-12');
    expect(normalizeFormSerialInput(undefined as unknown as string)).toBe('');
  });

  test('sparkActivityFields: create omits empties, patch clears them', () => {
    expect(sparkActivityFields({ assigneeIds: [], productIds: [], formSerial: '' })).toEqual({});
    expect(sparkActivityFields({ assigneeIds: ['a', 'b', 'a'], productIds: ['p'], formSerial: ' SRPR2627-1 ' }))
      .toEqual({ assignee_ids: ['a', 'b'], product_ids: ['p'], form_serial: 'SRPR2627-1' });
    expect(sparkActivityFields({ assigneeIds: [], productIds: [], formSerial: '' }, 'patch'))
      .toEqual({ assignee_ids: [], product_ids: [], form_serial: '' });
  });

  test('sparkActivityFields caps assignees at 20', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    expect(sparkActivityFields({ assigneeIds: ids, productIds: [], formSerial: '' }).assignee_ids).toHaveLength(20);
  });

  test('apiErrorText prefers message, then error, then the fallback', () => {
    expect(apiErrorText({ message: 'bad serial' })).toBe('bad serial');
    expect(apiErrorText({ error: 'nope' })).toBe('nope');
    expect(apiErrorText(null, 'fb')).toBe('fb');
  });

  test('normalizeSteps always yields the seven steps in flow order', () => {
    const s = normalizeSteps([{ key: 'deals', label: 'D', count: 2, state: 'current' }, { key: 'bogus', count: 9 }, null]);
    expect(s.map((x) => x.key)).toEqual(['lead', 'account', 'contacts', 'visits', 'followups', 'deals', 'expenses']);
    expect(s.find((x) => x.key === 'deals')).toMatchObject({ count: 2, state: 'current' });
    expect(s.filter((x) => x.state === 'todo')).toHaveLength(6);
    expect(normalizeSteps(undefined)).toHaveLength(7);
    expect(normalizeSteps('x')).toHaveLength(7);
  });

  test('journeyKpis counts open value and quotations, falling back to the summary', () => {
    expect(journeyKpis(undefined)).toEqual({ visits: 0, forms: 0, openDealValue: 0, quotations: 0, expenses: 0 });
    const k = journeyKpis({
      visits: [{}, {}], forms: [], summary: { submission_count: 4 },
      deals: [{ status: 'open', amount: 100, quotation_no: 'Q1' }, { status: 'won', amount: 900, quotation_no: ' ' }, { amount: 50 }],
      expenses: [{}],
    });
    expect(k).toEqual({ visits: 2, forms: 4, openDealValue: 150, quotations: 1, expenses: 1 });
  });

  test('sortedEvents sorts newest first and drops junk', () => {
    const e = sortedEvents([{ at: '2026-01-01T00:00:00Z', kind: 'visit', title: 'old' }, null, { kind: 'x' }, { at: '2026-02-01T00:00:00Z', kind: 'deal', title: 'new' }]);
    expect(e.map((x) => x.title)).toEqual(['new', 'old']);
    expect(sortedEvents({})).toEqual([]);
  });

  test('eventKindMeta labels every known kind and tolerates unknown ones', () => {
    for (const k of ['visit', 'form', 'submission', 'activity', 'update', 'deal', 'expense']) expect(eventKindMeta(k).label).not.toBe('Event');
    expect(eventKindMeta('submission').label).toBe(eventKindMeta('form').label);
    expect(eventKindMeta(undefined).label).toBe('Event');
    expect(eventKindMeta('weird').label).toBe('weird');
  });

  test('personName falls back', () => {
    expect(personName({ first_name: 'A', last_name: 'B' })).toBe('A B');
    expect(personName(null, 'x')).toBe('x');
  });
});
