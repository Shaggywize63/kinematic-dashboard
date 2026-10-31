/**
 * Demo fixtures for Expense Management — a full, self-contained set of claims for
 * the demo account (demo@kinematic.com), crafted so the forgery/forensics checks
 * (src/lib/expenseForensics) each light up. Served by demoMocks.ts.
 *
 * Forensic findings are computed CLIENT-SIDE on each request, over the whole set,
 * with the manager's current thresholds (loadForensicsConfig) — so changing a
 * threshold on the settings screen changes the highlights on the next fetch, and
 * cross-person checks (co-location, duplicate receipt) see every claim.
 */
import type {
  ExpenseClaim, ClaimItem, ClaimStatus, ItemCategory, ClaimsSummary, MyPolicy, ExpensePolicy, ClaimApproval,
} from './expensesApi';
import { runForensics, loadForensicsConfig, type ClaimSignals, type DwellCluster } from './expenseForensics';

// A tiny inline "receipt" image so the receipt links show something (no network).
const RECEIPT_IMG =
  'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f4f4f5"/><rect x="24" y="24" width="272" height="152" rx="6" fill="#fff" stroke="#d4d4d8"/><text x="160" y="70" font-family="monospace" font-size="16" text-anchor="middle" fill="#52525b">RECEIPT</text><line x1="48" y1="96" x2="272" y2="96" stroke="#e4e4e7"/><line x1="48" y1="120" x2="272" y2="120" stroke="#e4e4e7"/><line x1="48" y1="144" x2="200" y2="144" stroke="#e4e4e7"/></svg>`);

const CURRENCY = 'INR';
const APPROVER = { id: 'demo-user-999', name: 'Demo Admin' };

interface Rep { id: string; name: string; emp: string }
const REPS: Record<string, Rep> = {
  fe1: { id: 'fe1', name: 'Arjun Sharma', emp: 'KIN-001' },
  fe2: { id: 'fe2', name: 'Priya Patel', emp: 'KIN-002' },
  fe3: { id: 'fe3', name: 'Rahul Verma', emp: 'KIN-003' },
  fe4: { id: 'fe4', name: 'Sneha Rao', emp: 'KIN-004' },
  fe5: { id: 'fe5', name: 'Amit Singh', emp: 'KIN-005' },
};

const iso = (date: string, hhmm: string) => `${date}T${hhmm}:00+05:30`;
const dwell = (lat: number, lng: number, place: string, date: string, from: string, to: string): DwellCluster => ({
  at: { lat, lng }, place, start: iso(date, from), end: iso(date, to),
  minutes: Math.round((Date.parse(iso(date, to)) - Date.parse(iso(date, from))) / 60_000),
});

interface SeedItem {
  category: ItemCategory;
  description: string;
  amount: number;
  merchant?: string;
  /** Same string ⇒ same receipt image (duplicate-receipt detection). */
  receiptFp?: string;
  /** Date printed on the receipt, if different from the claim day. */
  receiptDate?: string;
  distance_km?: number;
  from_location?: string;
  to_location?: string;
}

interface Seed {
  id: string;
  no: string;
  rep: keyof typeof REPS;
  date: string;
  status: ClaimStatus;
  title: string;
  items: SeedItem[];
  signals: {
    shift?: { in: string; out: string } | null;
    working_day?: boolean;
    gps_km?: number | null;
    claimed_km?: number | null;
    mock_fixes?: number;
    dwells?: DwellCluster[];
  };
}

// ── the claims ───────────────────────────────────────────────────────────────

const SEEDS: Seed[] = [
  {
    id: 'exp-101', no: 'EXP-101', rep: 'fe1', date: '2026-10-24', status: 'submitted', title: 'Field visits — North beat',
    items: [
      { category: 'mileage', description: 'Panihati → Barrackpore beat', amount: 120, distance_km: 30, from_location: 'Panihati', to_location: 'Barrackpore' },
      { category: 'fuel', description: 'Diesel top-up', amount: 850, merchant: 'Indian Oil, Sodepur', receiptFp: 'rcpt-fuel-shared' },
      { category: 'food', description: 'Lunch', amount: 300, merchant: 'Annapurna', receiptFp: 'rcpt-food-101' },
    ],
    signals: { shift: { in: '09:00', out: '18:00' }, gps_km: 28, claimed_km: 30,
      dwells: [dwell(22.6955, 88.3937, 'Welfare Assoc, H B Town', '2026-10-24', '10:00', '12:00')] },
  },
  {
    id: 'exp-102', no: 'EXP-102', rep: 'fe2', date: '2026-10-24', status: 'submitted', title: 'Client meetings — H B Town',
    items: [
      { category: 'food', description: 'Client lunch', amount: 420, merchant: 'Hotel Blue', receiptFp: 'rcpt-food-102', receiptDate: '2026-10-20' },
      { category: 'toll', description: 'NH-12 toll', amount: 120, merchant: 'NHAI', receiptFp: 'rcpt-toll-102' },
    ],
    signals: { shift: { in: '09:30', out: '18:30' }, gps_km: 15, claimed_km: null,
      dwells: [dwell(22.6956, 88.3938, 'Welfare Assoc, H B Town', '2026-10-24', '10:20', '12:10')] },
  },
  {
    id: 'exp-103', no: 'EXP-103', rep: 'fe3', date: '2026-10-24', status: 'submitted', title: 'Khardaha market coverage',
    items: [
      { category: 'mileage', description: 'Agarpara → Khardaha', amount: 72, distance_km: 18, from_location: 'Agarpara', to_location: 'Khardaha' },
      { category: 'misc', description: 'Parking', amount: 60, merchant: 'Khardaha Mpl', receiptFp: 'rcpt-park-103' },
    ],
    signals: { shift: { in: '09:00', out: '19:00' }, gps_km: 16, claimed_km: 18, mock_fixes: 2,
      dwells: [dwell(22.7205, 88.3790, 'Khardaha Market', '2026-10-24', '11:00', '16:10')] },
  },
  {
    id: 'exp-104', no: 'EXP-104', rep: 'fe4', date: '2026-10-23', status: 'submitted', title: 'Barasat → Habra tour',
    items: [
      { category: 'mileage', description: 'Barasat → Habra and back', amount: 272, distance_km: 68, from_location: 'Barasat', to_location: 'Habra' },
    ],
    signals: { shift: { in: '09:00', out: '18:00' }, gps_km: 22, claimed_km: 68,
      dwells: [dwell(22.72, 88.86, 'Habra', '2026-10-23', '12:00', '12:40')] },
  },
  {
    id: 'exp-105', no: 'EXP-105', rep: 'fe5', date: '2026-10-24', status: 'submitted', title: 'Fuel + local runs',
    items: [
      { category: 'fuel', description: 'Diesel top-up', amount: 850, merchant: 'Indian Oil, Sodepur', receiptFp: 'rcpt-fuel-shared' },
      { category: 'mileage', description: 'Local running', amount: 40, distance_km: 10, from_location: 'Office', to_location: 'Office' },
    ],
    signals: { shift: { in: '10:00', out: '17:00' }, gps_km: 0.3, claimed_km: 10,
      dwells: [dwell(22.65, 88.42, 'Office', '2026-10-24', '10:10', '13:30')] },
  },
  {
    id: 'exp-106', no: 'EXP-106', rep: 'fe1', date: '2026-10-22', status: 'submitted', title: 'Sundries',
    items: [
      { category: 'food', description: 'Tea & snacks', amount: 300, merchant: 'Cafe Coffee Day', receiptFp: 'rcpt-f1-106' },
      { category: 'food', description: 'Tea & snacks', amount: 300, merchant: 'Cafe Coffee Day', receiptFp: 'rcpt-f2-106' },
    ],
    signals: { shift: { in: '09:00', out: '18:00' }, gps_km: 12, claimed_km: null,
      dwells: [dwell(22.66, 88.40, 'Sodepur', '2026-10-22', '11:30', '12:00')] },
  },
  {
    id: 'exp-107', no: 'EXP-107', rep: 'fe2', date: '2026-10-21', status: 'submitted', title: 'Stationery purchase',
    items: [
      { category: 'misc', description: 'Office stationery', amount: 150, merchant: 'Stationery Mart', receiptFp: 'rcpt-107' },
    ],
    signals: { shift: null, working_day: false, gps_km: 0, claimed_km: null, dwells: [] },
  },
  {
    id: 'exp-108', no: 'EXP-108', rep: 'fe3', date: '2026-10-20', status: 'approved', title: 'Routine beat',
    items: [
      { category: 'mileage', description: 'Sodepur → Agarpara', amount: 96, distance_km: 24, from_location: 'Sodepur', to_location: 'Agarpara' },
      { category: 'food', description: 'Lunch', amount: 200, merchant: 'Sagar Hotel', receiptFp: 'rcpt-food-108' },
    ],
    signals: { shift: { in: '09:00', out: '18:00' }, gps_km: 23, claimed_km: 24,
      dwells: [dwell(22.68, 88.39, 'Agarpara', '2026-10-20', '12:00', '12:35')] },
  },
  {
    id: 'exp-109', no: 'EXP-109', rep: 'fe4', date: '2026-10-19', status: 'reimbursed', title: 'Local visits',
    items: [
      { category: 'mileage', description: 'Barasat local', amount: 60, distance_km: 15, from_location: 'Barasat', to_location: 'Barasat' },
    ],
    signals: { shift: { in: '09:00', out: '17:30' }, gps_km: 14, claimed_km: 15,
      dwells: [dwell(22.72, 88.48, 'Barasat', '2026-10-19', '11:00', '11:30')] },
  },
];

// ── build claims + signals ───────────────────────────────────────────────────

function buildItems(seed: Seed): ClaimItem[] {
  return seed.items.map((it, i): ClaimItem => ({
    id: `${seed.id}-${i + 1}`, claim_id: seed.id, category: it.category, item_date: seed.date,
    description: it.description, amount: it.amount, distance_km: it.distance_km ?? null,
    from_location: it.from_location ?? null, to_location: it.to_location ?? null, merchant: it.merchant ?? null,
    receipt_url: it.receiptFp ? `demo://${it.receiptFp}` : null,
    receipt_signed_url: it.receiptFp ? RECEIPT_IMG : null,
    vehicle_type: null, odometer_start: null, odometer_end: null,
    odometer_start_photo_url: null, odometer_end_photo_url: null,
    ai_extracted: null, flagged: false, flag_reason: null,
  }));
}

function buildSignals(seed: Seed): ClaimSignals {
  const rep = REPS[seed.rep];
  const s = seed.signals;
  const receipts = seed.items
    .filter((it) => it.receiptFp)
    .map((it) => ({ item_id: `${seed.id}-${seed.items.indexOf(it) + 1}`, fingerprint: it.receiptFp!, merchant: it.merchant ?? null, amount: it.amount, txn_date: it.receiptDate ?? seed.date }));
  return {
    claim_id: seed.id, user_id: rep.id, user_name: rep.name, date: seed.date,
    shift: s.shift ? { checkin_at: iso(seed.date, s.shift.in), checkout_at: iso(seed.date, s.shift.out) } : null,
    dwells: s.dwells ?? [], receipts,
    gps_km: s.gps_km ?? null, claimed_km: s.claimed_km ?? null,
    mock_fixes: s.mock_fixes ?? 0, working_day: s.working_day ?? true,
  };
}

const total = (seed: Seed) => seed.items.reduce((n, it) => n + it.amount, 0);

function approvalsFor(seed: Seed): ClaimApproval[] {
  if (seed.status === 'submitted') return [{ id: `${seed.id}-ap1`, claim_id: seed.id, level: 1, approver_id: APPROVER.id, status: 'pending', note: null, decided_at: null, approver_name: APPROVER.name }];
  if (seed.status === 'approved' || seed.status === 'reimbursed')
    return [{ id: `${seed.id}-ap1`, claim_id: seed.id, level: 1, approver_id: APPROVER.id, status: 'approved', note: null, decided_at: iso(seed.date, '20:00'), approver_name: APPROVER.name }];
  return [];
}

function baseClaim(seed: Seed): ExpenseClaim {
  const rep = REPS[seed.rep];
  const amt = total(seed);
  return {
    id: seed.id, user_id: rep.id, claim_no: seed.no, title: seed.title, status: seed.status, currency: CURRENCY,
    total_amount: amt, approved_amount: seed.status === 'approved' || seed.status === 'reimbursed' ? amt : null,
    distance_km: seed.signals.claimed_km ?? null, gps_derived_km: seed.signals.gps_km ?? null,
    approver_id: APPROVER.id, current_level: 1,
    submitted_at: seed.status === 'draft' ? null : iso(seed.date, '19:30'),
    reviewed_by: seed.status === 'approved' || seed.status === 'reimbursed' ? APPROVER.id : null,
    reviewed_at: seed.status === 'approved' || seed.status === 'reimbursed' ? iso(seed.date, '20:00') : null,
    review_note: null, ai_summary: null, ai_flags: null,
    policy_id: 'pol-ff', policy_name: 'Field Force Travel', submit_count: 1, auto_approved: false,
    reimbursed_at: seed.status === 'reimbursed' ? iso(seed.date, '23:00') : null,
    reimbursed_ref: seed.status === 'reimbursed' ? 'NEFT-DEMO-0192' : null,
    created_at: iso(seed.date, '18:45'), updated_at: iso(seed.date, '19:30'),
    user_name: rep.name, employee_id: rep.emp, approver_name: APPROVER.name,
    reviewer_name: seed.status === 'approved' || seed.status === 'reimbursed' ? APPROVER.name : null,
  };
}

// Static once; forensics is re-run per request so threshold changes take effect.
const LIST_CLAIMS: ExpenseClaim[] = SEEDS.map(baseClaim);
const DETAIL_CLAIMS: Map<string, ExpenseClaim> = new Map(
  SEEDS.map((seed) => [seed.id, { ...baseClaim(seed), items: buildItems(seed), approvals: approvalsFor(seed) }]),
);
const SIGNALS: ClaimSignals[] = SEEDS.map(buildSignals);

function attachFindings<T extends ExpenseClaim>(claims: T[]): T[] {
  const map = runForensics(SIGNALS, loadForensicsConfig());
  return claims.map((c) => ({ ...c, forensic_findings: map.get(c.id) ?? [] }));
}

// ── public API (consumed by demoMocks.ts) ────────────────────────────────────

export const demoExpensePending = (): ExpenseClaim[] => attachFindings(LIST_CLAIMS.filter((c) => c.status === 'submitted'));
export const demoExpenseAwaiting = (): ExpenseClaim[] => attachFindings(LIST_CLAIMS.filter((c) => c.status === 'approved'));
export const demoExpenseMine = (): ExpenseClaim[] => attachFindings(LIST_CLAIMS);

export function demoExpenseAll(filters: { status?: string; user_id?: string; category?: string; from?: string; to?: string; q?: string }): { rows: ExpenseClaim[]; total: number } {
  let rows = attachFindings(LIST_CLAIMS);
  if (filters.status) rows = rows.filter((c) => c.status === filters.status);
  if (filters.user_id) rows = rows.filter((c) => c.user_id === filters.user_id);
  if (filters.from) rows = rows.filter((c) => (c.submitted_at || c.created_at).slice(0, 10) >= filters.from!);
  if (filters.to) rows = rows.filter((c) => (c.submitted_at || c.created_at).slice(0, 10) <= filters.to!);
  if (filters.category) rows = rows.filter((c) => SEEDS.find((s) => s.id === c.id)?.items.some((it) => it.category === filters.category));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((c) => [c.user_name, c.claim_no, c.title].some((v) => (v || '').toLowerCase().includes(q)));
  }
  rows = rows.slice().sort((a, b) => (b.submitted_at || b.created_at).localeCompare(a.submitted_at || a.created_at));
  return { rows, total: rows.length };
}

export function demoExpenseClaim(id: string): ExpenseClaim | null {
  const c = DETAIL_CLAIMS.get(id);
  return c ? attachFindings([c])[0] : null;
}

/** Distinct claimants, for the "User" filter dropdown. */
export const demoExpenseClaimants = (): Array<{ id: string; name: string }> =>
  Array.from(new Map(LIST_CLAIMS.map((c) => [c.user_id, { id: c.user_id, name: c.user_name || c.user_id }])).values());

export function demoExpenseSummary(): ClaimsSummary {
  const all = LIST_CLAIMS;
  const sumOf = (st: ClaimStatus) => all.filter((c) => c.status === st).reduce((n, c) => n + c.total_amount, 0);
  const cntOf = (st: ClaimStatus) => all.filter((c) => c.status === st).length;
  const byCat = new Map<ItemCategory, number>();
  for (const s of SEEDS) for (const it of s.items) byCat.set(it.category, (byCat.get(it.category) ?? 0) + it.amount);
  return {
    totals: {
      claims: all.length, claimed: all.reduce((n, c) => n + c.total_amount, 0),
      pending_count: cntOf('submitted'), pending_amount: sumOf('submitted'),
      approved_count: cntOf('approved'), approved_amount: sumOf('approved'),
      reimbursed_count: cntOf('reimbursed'), reimbursed_amount: sumOf('reimbursed'),
      rejected_count: cntOf('rejected'), rejected_amount: sumOf('rejected'),
      auto_approved_count: 0, avg_turnaround_hours: 6,
    },
    by_status: (['submitted', 'approved', 'reimbursed'] as ClaimStatus[]).map((st) => ({ status: st, claims: cntOf(st), amount: sumOf(st) })),
    by_month: [{ month: '2026-10', amount: all.reduce((n, c) => n + c.total_amount, 0), claims: all.length }],
    by_category: Array.from(byCat.entries()).map(([category, amount]) => ({ category, amount })),
    top_people: demoExpenseClaimants().map((p) => ({ user_id: p.id, name: p.name, amount: all.filter((c) => c.user_id === p.id).reduce((n, c) => n + c.total_amount, 0), claims: all.filter((c) => c.user_id === p.id).length })),
    by_policy: [{ policy: 'Field Force Travel', amount: all.reduce((n, c) => n + c.total_amount, 0), claims: all.length }],
  };
}

export function demoMyPolicy(): MyPolicy {
  return {
    id: 'pol-ff', name: 'Field Force Travel', description: 'Default travel & expense policy', currency: CURRENCY,
    mileage_rate: 4, auto_approve_under: 200, escalate_over: 5000, require_receipt_over: 500,
    category_limits: { food: 400, lodging: 2500 }, is_active: true,
  };
}

export function demoExpensePolicies(): ExpensePolicy[] {
  return [{
    id: 'pol-ff', name: 'Field Force Travel', description: 'Default travel & expense policy', is_active: true, priority: 1,
    currency: CURRENCY, applies_to: { everyone: true, roles: [], org_role_ids: [], user_ids: [] },
    effective_from: null, effective_to: null, covers: 5,
    rules: {
      mileage_rate: 4, receipt_required_over: 500, max_claim_amount: 10000, submit_within_days: 30,
      auto_approve_under: 200, escalate_over: 5000, enforcement: 'flag',
      categories: {
        mileage: { enabled: true, per_day_limit: null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null },
        travel: { enabled: true, per_day_limit: null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null },
        food: { enabled: true, per_day_limit: 400, per_claim_limit: null, per_month_limit: null, receipt_required_over: 200 },
        lodging: { enabled: true, per_day_limit: 2500, per_claim_limit: null, per_month_limit: null, receipt_required_over: 0 },
        fuel: { enabled: true, per_day_limit: null, per_claim_limit: null, per_month_limit: null, receipt_required_over: 0 },
        toll: { enabled: true, per_day_limit: null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null },
        misc: { enabled: true, per_day_limit: 500, per_claim_limit: null, per_month_limit: null, receipt_required_over: 200 },
      },
    },
  }];
}
