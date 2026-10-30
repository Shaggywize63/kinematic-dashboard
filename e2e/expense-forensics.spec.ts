import { test, expect } from '@playwright/test';
import {
  runForensics, DEFAULT_FORENSICS_CONFIG, worstSeverity, toExpenseFlag,
  FORENSIC_CHECKS, type ClaimSignals,
} from '../src/lib/expenseForensics';

/**
 * Contract tests for the expense-forensics engine (src/lib/expenseForensics.ts).
 * Pure data-in / findings-out — this is the detection logic behind the forgery
 * highlights a manager sees. Locks each scenario and the configurable thresholds.
 */

const DATE = '2026-10-24';
const base = (over: Partial<ClaimSignals>): ClaimSignals => ({
  claim_id: 'c', user_id: 'u', user_name: 'Rep', date: DATE,
  shift: { checkin_at: `${DATE}T04:30:00.000Z`, checkout_at: `${DATE}T13:30:00.000Z` },
  dwells: [], receipts: [], gps_km: 20, claimed_km: null, mock_fixes: 0, working_day: true,
  ...over,
});
test('long halt fires at/above the configurable threshold, and not below it', () => {
  const sig = base({
    claim_id: 'c1',
    dwells: [{ at: { lat: 22.69, lng: 88.39 }, place: 'Welfare Assoc', start: `${DATE}T05:00:00.000Z`, end: `${DATE}T10:10:00.000Z`, minutes: 310 }],
  });
  // default 4h → 5h10m halt flagged
  expect(runForensics([sig]).get('c1')!.map((f) => f.code)).toContain('long_halt');
  // raise the limit to 6h → no longer flagged
  const raised = runForensics([sig], { ...DEFAULT_FORENSICS_CONFIG, longHaltHours: 6 }).get('c1') ?? [];
  expect(raised.map((f) => f.code)).not.toContain('long_halt');
});

test('co-location: two reps within the radius for long enough flags BOTH claims', () => {
  const a = base({ claim_id: 'ca', user_id: 'u1', user_name: 'Arjun',
    dwells: [{ at: { lat: 22.6955, lng: 88.3937 }, start: `${DATE}T05:00:00.000Z`, end: `${DATE}T07:00:00.000Z`, minutes: 120 }] });
  const b = base({ claim_id: 'cb', user_id: 'u2', user_name: 'Priya',
    dwells: [{ at: { lat: 22.6956, lng: 88.3938 }, start: `${DATE}T05:20:00.000Z`, end: `${DATE}T06:40:00.000Z`, minutes: 80 }] });
  const m = runForensics([a, b]);
  expect(m.get('ca')!.map((f) => f.code)).toContain('colocation');
  expect(m.get('cb')!.map((f) => f.code)).toContain('colocation');
  // the finding names the other rep
  const f = m.get('ca')!.find((x) => x.code === 'colocation')!;
  expect(f.involved?.[0]?.user_name).toBe('Priya');
  expect(f.detail).toMatch(/Priya/);
});

test('co-location does NOT fire when they are far apart or barely overlap', () => {
  const near = base({ claim_id: 'ca', user_id: 'u1',
    dwells: [{ at: { lat: 22.70, lng: 88.40 }, start: `${DATE}T05:00:00.000Z`, end: `${DATE}T07:00:00.000Z`, minutes: 120 }] });
  const far = base({ claim_id: 'cb', user_id: 'u2',
    dwells: [{ at: { lat: 22.80, lng: 88.50 }, start: `${DATE}T05:00:00.000Z`, end: `${DATE}T07:00:00.000Z`, minutes: 120 }] }); // ~14 km away
  const m = runForensics([near, far]);
  expect((m.get('ca') ?? []).map((f) => f.code)).not.toContain('colocation');
});

test('duplicate receipt across two claims flags both and names the other person', () => {
  const a = base({ claim_id: 'ca', user_id: 'u1', user_name: 'Arjun',
    receipts: [{ item_id: 'i1', fingerprint: 'sha-abc', merchant: 'Indian Oil', amount: 850, txn_date: DATE }] });
  const b = base({ claim_id: 'cb', user_id: 'u2', user_name: 'Priya',
    receipts: [{ item_id: 'i2', fingerprint: 'sha-abc', merchant: 'Indian Oil', amount: 850, txn_date: DATE }] });
  const m = runForensics([a, b]);
  expect(m.get('ca')!.map((f) => f.code)).toContain('duplicate_receipt');
  expect(m.get('cb')!.map((f) => f.code)).toContain('duplicate_receipt');
  expect(m.get('ca')!.find((f) => f.code === 'duplicate_receipt')!.detail).toMatch(/Priya/);
});

test('the same receipt on ONE claim is not a duplicate', () => {
  const a = base({ claim_id: 'ca',
    receipts: [{ item_id: 'i1', fingerprint: 'sha-x', merchant: 'M', amount: 100, txn_date: DATE }] });
  expect((runForensics([a]).get('ca') ?? []).map((f) => f.code)).not.toContain('duplicate_receipt');
});

test('mileage well over GPS is high; mileage with no movement is a warning', () => {
  const over = base({ claim_id: 'c1', claimed_km: 68, gps_km: 22 });
  expect(runForensics([over]).get('c1')!.map((f) => f.code)).toContain('mileage_over_gps');
  const noMove = base({ claim_id: 'c2', claimed_km: 12, gps_km: 0.3 });
  expect(runForensics([noMove]).get('c2')!.map((f) => f.code)).toContain('no_gps_for_mileage');
  // within tolerance → neither
  const ok = base({ claim_id: 'c3', claimed_km: 24, gps_km: 22 });
  const okCodes = (runForensics([ok]).get('c3') ?? []).map((f) => f.code);
  expect(okCodes).not.toContain('mileage_over_gps');
  expect(okCodes).not.toContain('no_gps_for_mileage');
});

test('receipt dated a different day, mock GPS, non-working day and repeated amount each flag', () => {
  const mismatch = base({ claim_id: 'c1', receipts: [{ item_id: 'i', fingerprint: 'f1', merchant: 'Hotel', amount: 500, txn_date: '2026-10-20' }] });
  expect(runForensics([mismatch]).get('c1')!.map((f) => f.code)).toContain('receipt_date_mismatch');

  const mock = base({ claim_id: 'c2', mock_fixes: 3 });
  expect(runForensics([mock]).get('c2')!.map((f) => f.code)).toContain('mock_location');

  const off = base({ claim_id: 'c3', working_day: false });
  expect(runForensics([off]).get('c3')!.map((f) => f.code)).toContain('non_working_day');

  const repeated = base({ claim_id: 'c4', receipts: [
    { item_id: 'a', fingerprint: 'fa', merchant: 'Cafe', amount: 300, txn_date: DATE },
    { item_id: 'b', fingerprint: 'fb', merchant: 'Cafe', amount: 300, txn_date: DATE },
  ] });
  expect(runForensics([repeated]).get('c4')!.map((f) => f.code)).toContain('repeated_amount');
});

test('a clean claim yields no findings', () => {
  const clean = base({ claim_id: 'ok', claimed_km: 22, gps_km: 21,
    dwells: [{ at: { lat: 22.7, lng: 88.4 }, start: `${DATE}T06:00:00.000Z`, end: `${DATE}T06:40:00.000Z`, minutes: 40 }],
    receipts: [{ item_id: 'i', fingerprint: 'uniq', merchant: 'Shell', amount: 400, txn_date: DATE }] });
  expect(runForensics([clean]).get('ok') ?? []).toHaveLength(0);
});

test('worstSeverity and toExpenseFlag map findings onto the existing flag shape', () => {
  const m = runForensics([base({ claim_id: 'c1', mock_fixes: 1, working_day: false })]);
  const findings = m.get('c1')!;
  expect(worstSeverity(findings)).toBe('high');            // mock_location is high
  expect(worstSeverity([])).toBeNull();
  const flag = toExpenseFlag(findings[0]);
  expect(flag.code).toMatch(/^forensic_/);
  expect(['info', 'warn', 'high']).toContain(flag.severity);
});

test('the scenario catalogue covers the manager-requested checks', () => {
  const have = new Set(FORENSIC_CHECKS.map((c) => c.code));
  for (const required of ['colocation', 'duplicate_receipt', 'long_halt']) expect(have.has(required as never)).toBe(true);
  // long_halt exposes an editable threshold
  expect(FORENSIC_CHECKS.find((c) => c.code === 'long_halt')!.thresholds).toContain('longHaltHours');
});
