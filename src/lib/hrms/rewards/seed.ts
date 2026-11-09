// Deterministic sample data for Assets, Benefits and Compensation. Fictional people (the 25 in the core seed), fictional
// serial numbers, sample premiums and sample pay bands. No Math.random, no Date.now: screenshots and tests stay stable.

import { makeRng } from '../areaStore';
import { PREVIEW_TODAY } from '../seed';
import { addDays } from '../format';
import { addMonthsISO, typeInfo } from './assetsEngine';
import type {
  Asset, AssetCondition, AssetEvent, AssetStatus, AssetType, BenefitsState, Claim, ClaimStatus, CompState, Dependant, Enrolment, Guidelines, Plan, RewardsState,
} from './types';

const DESK = 'IT and Admin desk';

// ───────────────────────────── assets ─────────────────────────────
// Join dates of the people who hold assets, so no asset is issued before the person joined.
const JOINED: Record<string, string> = {
  emp_1: '2017-04-10', emp_2: '2018-07-02', emp_3: '2021-01-18', emp_4: '2020-03-02', emp_5: '2022-06-13', emp_6: '2023-02-06', emp_7: '2024-05-20', emp_8: '2022-11-14',
  emp_9: '2025-01-06', emp_10: '2023-08-21', emp_12: '2021-04-12', emp_13: '2022-02-21', emp_14: '2023-06-19', emp_15: '2025-08-04', emp_16: '2020-12-01',
  emp_17: '2023-01-09', emp_18: '2022-04-04', emp_19: '2021-09-13', emp_20: '2024-10-14', emp_22: '2023-05-08', emp_23: '2022-07-18',
};

interface Row {
  type: AssetType; make: string; model: string; bought: string; cost: number; warranty: number; cond: AssetCondition; status: AssetStatus; holder?: string;
  serial?: string; issued?: string; extra?: (id: string, push: (e: Omit<AssetEvent, 'id' | 'assetId' | 'by'> & { by?: string }) => void) => void;
}
const r = (type: AssetType, make: string, model: string, bought: string, cost: number, warranty: number, cond: AssetCondition, status: AssetStatus, holder?: string, o: Partial<Row> = {}): Row =>
  ({ type, make, model, bought, cost, warranty, cond, status, holder, ...o });

const ROWS: Row[] = [
  // laptops
  r('laptop', 'Apple', 'MacBook Air M2', '2023-11-20', 112000, 36, 'good', 'issued', 'emp_5'),
  r('laptop', 'Lenovo', 'ThinkPad E14 Gen 5', '2025-06-10', 69500, 36, 'good', 'issued', 'emp_17'),
  r('laptop', 'HP', 'ProBook 440 G10', '2024-02-15', 62000, 36, 'good', 'issued', 'emp_3', { issued: '2024-02-20' }),
  r('laptop', 'HP', 'ProBook 440 G10', '2024-02-15', 62000, 36, 'good', 'issued', 'emp_16'),
  r('laptop', 'Dell', 'Latitude 3420', '2022-08-20', 54000, 36, 'fair', 'issued', 'emp_1'),
  r('laptop', 'Lenovo', 'ThinkPad L14', '2022-05-05', 58000, 36, 'fair', 'issued', 'emp_2'),
  r('laptop', 'Lenovo', 'IdeaPad Slim 3', '2024-07-08', 49000, 24, 'good', 'issued', 'emp_18'),
  r('laptop', 'Dell', 'Inspiron 3511', '2023-01-18', 48000, 24, 'good', 'issued', 'emp_23'),
  r('laptop', 'Dell', 'Latitude 3440', '2025-09-02', 66000, 36, 'new', 'in_stock'),
  r('laptop', 'Lenovo', 'ThinkPad E14 Gen 5', '2025-09-02', 69500, 36, 'new', 'in_stock'),
  r('laptop', 'HP', 'ProBook 450 G8', '2021-03-12', 51000, 36, 'poor', 'retired', undefined, {
    extra: (_id, push) => {
      push({ on: '2021-03-20', kind: 'issued', toId: 'emp_3', condition: 'new', status: 'issued', ack: true, note: 'Issued on joining the finance team.', by: DESK });
      push({ on: '2024-02-16', kind: 'returned', fromId: 'emp_3', condition: 'poor', status: 'in_stock', note: 'Replaced by a new laptop. Hinge cracked.', by: DESK });
      push({ on: '2024-03-01', kind: 'retired', condition: 'poor', status: 'retired', note: 'Hinge and battery failed. Written off (sample policy).', by: DESK });
    },
  }),
  r('laptop', 'Dell', 'Latitude 5440', '2025-06-10', 78000, 36, 'good', 'issued', 'emp_4'),
  // phones
  r('phone', 'Samsung', 'Galaxy A35', '2024-08-05', 29000, 12, 'good', 'issued', 'emp_4'),
  r('phone', 'Samsung', 'Galaxy A15', '2025-01-20', 14500, 12, 'good', 'issued', 'emp_6'),
  r('phone', 'Redmi', 'Note 13', '2024-10-01', 16000, 12, 'fair', 'issued', 'emp_8'),
  r('phone', 'Samsung', 'Galaxy A15', '2025-03-12', 14500, 12, 'good', 'issued', 'emp_19'),
  r('phone', 'Redmi', 'Note 13 Pro', '2024-05-28', 22000, 12, 'good', 'issued', 'emp_22', { serial: '356294105844471' }),
  r('phone', 'Samsung', 'Galaxy A15', '2025-11-14', 14500, 12, 'new', 'issued', 'emp_20'),
  r('phone', 'Samsung', 'Galaxy A15', '2025-12-02', 14500, 12, 'new', 'issued', 'emp_7'),
  r('phone', 'Redmi', '13C', '2026-02-10', 10500, 12, 'new', 'in_stock'),
  r('phone', 'Redmi', '13C', '2026-02-10', 10500, 12, 'damaged', 'in_repair', undefined, {
    extra: (_id, push) => {
      push({ on: '2026-02-20', kind: 'issued', toId: 'emp_9', condition: 'new', status: 'issued', ack: true, by: DESK });
      push({ on: '2026-10-20', kind: 'repair_out', fromId: 'emp_9', condition: 'damaged', status: 'in_repair', note: 'Cracked screen. Sent to the service vendor, ticket V-2291.', by: DESK });
    },
  }),
  r('phone', 'Apple', 'iPhone 13', '2022-09-30', 52000, 12, 'good', 'lost', undefined, {
    extra: (_id, push) => {
      push({ on: '2022-10-10', kind: 'issued', toId: 'emp_2', condition: 'new', status: 'issued', ack: true, by: DESK });
      push({ on: '2026-09-12', kind: 'lost', fromId: 'emp_2', condition: 'good', status: 'lost', note: 'Reported lost on a client visit. Police complaint copy requested.', by: DESK });
    },
  }),
  // SIM cards
  r('sim', 'Airtel', 'Postpaid business SIM', '2025-04-10', 250, 0, 'good', 'issued', 'emp_4'),
  r('sim', 'Airtel', 'Postpaid business SIM', '2025-04-10', 250, 0, 'good', 'issued', 'emp_6'),
  r('sim', 'Airtel', 'Postpaid business SIM', '2025-04-10', 250, 0, 'good', 'issued', 'emp_22'),
  r('sim', 'Airtel', 'Postpaid business SIM', '2025-04-10', 250, 0, 'good', 'issued', 'emp_8'),
  r('sim', 'Airtel', 'Postpaid business SIM', '2025-04-10', 250, 0, 'good', 'issued', 'emp_19'),
  r('sim', 'Airtel', 'Postpaid business SIM', '2026-01-12', 250, 0, 'new', 'in_stock'),
  // vehicles
  r('vehicle', 'Honda', 'Activa 6G', '2023-06-15', 82000, 36, 'good', 'issued', 'emp_19'),
  r('vehicle', 'TVS', 'Jupiter', '2022-02-10', 79000, 36, 'fair', 'issued', 'emp_8'),
  r('vehicle', 'Hero', 'Splendor Plus', '2021-10-05', 76000, 36, 'fair', 'in_stock'),
  // ID cards
  r('id_card', 'In-house', 'Photo ID card', '2025-06-16', 150, 0, 'good', 'issued', 'emp_22'),
  r('id_card', 'In-house', 'Photo ID card', '2025-04-02', 150, 0, 'fair', 'issued', 'emp_12'),
  r('id_card', 'In-house', 'Photo ID card', '2025-04-02', 150, 0, 'fair', 'issued', 'emp_13'),
  r('id_card', 'In-house', 'Photo ID card', '2025-04-02', 150, 0, 'good', 'issued', 'emp_14'),
  r('id_card', 'In-house', 'Photo ID card', '2025-08-04', 150, 0, 'good', 'issued', 'emp_15'),
  // uniforms
  r('uniform', 'Meridian', 'Warehouse uniform set (M)', '2025-04-02', 1800, 0, 'good', 'issued', 'emp_12'),
  r('uniform', 'Meridian', 'Warehouse uniform set (L)', '2025-04-02', 1800, 0, 'good', 'issued', 'emp_13'),
  r('uniform', 'Meridian', 'Field team uniform set (L)', '2025-06-16', 1800, 0, 'good', 'issued', 'emp_22'),
  r('uniform', 'Meridian', 'Warehouse uniform set (S)', '2026-03-05', 1800, 0, 'new', 'in_stock'),
  // tools and devices
  r('tool', 'Zebra', 'DS2208 barcode scanner', '2025-12-28', 9800, 12, 'new', 'issued', 'emp_13'),
  r('tool', 'Zebra', 'DS2208 barcode scanner', '2024-04-02', 9800, 12, 'good', 'issued', 'emp_14'),
  r('tool', 'TSC', 'TE244 label printer', '2023-09-14', 21500, 12, 'good', 'issued', 'emp_15'),
  r('tool', 'Essae', 'Digital weighing scale 300 kg', '2022-10-01', 18500, 24, 'fair', 'in_stock'),
];

function makeAssets(): { items: Asset[]; events: AssetEvent[] } {
  const rng = makeRng(20261107);
  const counters: Partial<Record<AssetType, number>> = {};
  const items: Asset[] = [];
  const events: AssetEvent[] = [];
  ROWS.forEach((row, i) => {
    const info = typeInfo(row.type);
    const n = (counters[row.type] = (counters[row.type] ?? 0) + 1);
    const id = `ast_${i + 1}`;
    const digits = (len: number) => Array.from({ length: len }, () => Math.floor(rng() * 10)).join('');
    const serial = row.serial ?? (row.type === 'sim' ? `8991${digits(10)}` : row.type === 'phone' ? digits(15)
      : `${row.make.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}${digits(8)}`);
    // Avoid a serial tail that would collide with the sample IMEI used on the exit checklist.
    const safeSerial = row.serial ? serial : serial.endsWith('4471') ? serial.slice(0, -4) + '4472' : serial;
    items.push({
      id, tag: `AST-${info.prefix}-${String(n).padStart(3, '0')}`, type: row.type, make: row.make, model: row.model, serial: safeSerial,
      purchaseDate: row.bought, cost: row.cost, warrantyEnd: row.warranty ? addMonthsISO(row.bought, row.warranty) : null,
      condition: row.cond, status: row.status, holderId: row.status === 'issued' ? row.holder : undefined,
    });
    let k = 0;
    const push = (e: Omit<AssetEvent, 'id' | 'assetId' | 'by'> & { by?: string }) => { k += 1; events.push({ ...e, by: e.by ?? DESK, id: `ev_${id}_${k}`, assetId: id }); };
    push({ on: row.bought, kind: 'purchased', status: 'in_stock', condition: 'new', note: 'Added to the register.' });
    if (row.extra) row.extra(id, push);
    else if (row.holder) {
      const join = JOINED[row.holder] ?? row.bought;
      let on = row.issued ?? addDays(row.bought, 5);
      if (on < join) on = join;
      if (on > PREVIEW_TODAY) on = PREVIEW_TODAY;
      push({ on, kind: 'issued', toId: row.holder, condition: on <= addDays(row.bought, 30) ? 'new' : 'good', status: 'issued', ack: true });
    }
  });
  return { items, events };
}

// ───────────────────────────── benefits ─────────────────────────────
const plans = (): Plan[] => [
  {
    id: 'plan_health', kind: 'health', name: 'Group health insurance', provider: 'Orchid General Insurance (sample)', auto: false,
    summary: 'Family floater cover for hospital stays. The sum insured is shared by you and the family members you cover.',
    tiers: [
      { id: 'h3', label: '₹3 lakh', sumInsured: 300000, annualPremium: { self: 5200, spouse: 5200, child: 2800, parent: 11500 } },
      { id: 'h5', label: '₹5 lakh', sumInsured: 500000, annualPremium: { self: 7400, spouse: 7400, child: 3600, parent: 16800 } },
      { id: 'h10', label: '₹10 lakh', sumInsured: 1000000, annualPremium: { self: 11900, spouse: 11900, child: 5200, parent: 26500 } },
    ],
    employerSharePct: { self: 100, spouse: 50, child: 50, parent: 0 },
    dependants: { maxSpouse: 1, maxChildren: 2, childMaxAge: 25, maxParents: 2, parentMaxAge: 80 },
    taxNote: 'A premium the company pays for your own cover is usually not treated as taxable pay. What you pay yourself may qualify for a deduction under some tax regimes. The limits change, so none are stated here. See Statutory, Tax for the rules in the system.',
    coverStart: '2027-01-01', renewsOn: '2026-12-31',
  },
  {
    id: 'plan_accident', kind: 'accident', name: 'Group accident cover', provider: 'Orchid General Insurance (sample)', auto: true,
    summary: 'Covers every employee automatically against accidental death or disability. There is nothing to choose.',
    tiers: [{ id: 'a10', label: '₹10 lakh sum assured', sumInsured: 1000000, annualPremium: { self: 900 } }],
    employerSharePct: { self: 100 },
    taxNote: 'Group accident cover paid by the company is usually not taxable to the employee. How a payout is treated is a separate question. Confirm both with your advisor.',
    coverStart: '2026-04-01', renewsOn: '2027-03-31',
  },
  {
    id: 'plan_meal', kind: 'meal', name: 'Meal coupons', provider: 'Sample coupon vendor', auto: false,
    summary: 'Prepaid meal coupons. The amount you choose is taken from your pay each month through a salary reduction.',
    tiers: [
      { id: 'm0', label: 'None', monthlyAmount: 0 },
      { id: 'm1', label: '₹1,100 a month', monthlyAmount: 1100 },
      { id: 'm2', label: '₹2,200 a month', monthlyAmount: 2200 },
      { id: 'm3', label: '₹3,300 a month', monthlyAmount: 3300 },
    ],
    employerSharePct: { self: 0 },
    taxNote: 'Tax relief for meal coupons depends on a limit in the tax rules, and the rules changed with the new Income-tax Act. No limit is stated here. Confirm with your advisor before launch.',
    coverStart: '2027-01-01', renewsOn: '2027-06-30',
  },
  {
    id: 'plan_nps', kind: 'nps', name: 'NPS employer contribution', provider: 'Sample pension fund manager', auto: false,
    summary: 'Moves a share of your basic pay into your NPS account. Your CTC does not change, so your take-home goes down by the same amount.',
    tiers: [
      { id: 'n0', label: 'None', pctOfBasic: 0 },
      { id: 'n5', label: '5% of basic', pctOfBasic: 5 },
      { id: 'n10', label: '10% of basic', pctOfBasic: 10 },
    ],
    employerSharePct: { self: 0 },
    taxNote: 'An employer contribution to NPS can get a separate deduction in some tax regimes, up to a limit in the tax rules. No limit is stated here. Confirm with your advisor.',
    coverStart: '2027-01-01', renewsOn: '2027-04-01',
  },
  {
    id: 'plan_flex', kind: 'flex', name: 'Flexible allowance basket', provider: 'Paid on bills, by the company', auto: false,
    summary: 'A monthly budget you split across baskets and claim against bills. Unspent budget lapses at the end of the year (sample rule).',
    tiers: [], flexMonthly: 2500,
    baskets: [{ id: 'learning', label: 'Books and learning' }, { id: 'wellness', label: 'Wellness and gym' }, { id: 'internet', label: 'Home internet' }, { id: 'commute', label: 'Commute' }],
    employerSharePct: { self: 100 },
    taxNote: 'A flexible allowance can be taxable as salary unless an item is specifically exempt, and the answer can differ by tax regime. Confirm each basket with your advisor.',
    coverStart: '2027-01-01', renewsOn: '2027-03-31',
  },
];

let depN = 0;
const dep = (name: string, relation: Dependant['relation'], dob: string): Dependant => ({ id: `dep_s${++depN}`, name, relation, dob });
const enrolled = (employeeId: string, healthTier: string, dependants: Dependant[], extra: Partial<Enrolment> = {}): Enrolment =>
  ({ employeeId, status: 'enrolled', submittedOn: '2026-11-07', by: 'Employee', healthTier, dependants, flex: {}, ...extra });

const CLAIM_BY = 'TPA desk';
function claim(n: number, employeeId: string, patient: string, relation: Claim['relation'], kind: Claim['kind'], hospital: string, claimed: number, filedOn: string, status: ClaimStatus, o: { approved?: number; closedOn?: string; reason?: string; note?: string; steps?: [string, ClaimStatus, string?][] } = {}): Claim {
  const trail: Claim['trail'] = [{ on: filedOn, status: 'submitted', note: 'Claim registered.', by: CLAIM_BY }];
  for (const [on, s, note] of o.steps ?? []) trail.push({ on, status: s, note, by: CLAIM_BY });
  return {
    id: `clm_${n}`, ref: `TPA-26-${String(4100 + n * 37).padStart(5, '0')}`, employeeId, patient, relation, kind, hospital, claimed,
    approved: o.approved, filedOn, closedOn: o.closedOn, status, rejectionReason: o.reason, trail,
  };
}

function makeBenefits(): BenefitsState {
  depN = 0;
  const enrolments: Enrolment[] = [
    enrolled('emp_1', 'h10', [dep('Sameer Malhotra', 'spouse', '1984-09-12'), dep('Aarav Malhotra', 'child', '2014-05-03'), dep('Mira Malhotra', 'child', '2018-11-22'), dep('Kamla Malhotra', 'parent', '1955-02-14')], { mealTier: 'm1', npsTier: 'n5' }),
    enrolled('emp_2', 'h5', [dep('Deepti Nair', 'spouse', '1986-04-03'), dep('Kabir Nair', 'child', '2012-08-19'), dep('Gopal Nair', 'parent', '1957-06-30'), dep('Sarala Nair', 'parent', '1959-12-11')], { npsTier: 'n10', flex: { learning: 1000, wellness: 500 } }),
    enrolled('emp_3', 'h3', [dep('Rahul Bansal', 'spouse', '1991-03-09')], { mealTier: 'm2' }),
    enrolled('emp_4', 'h5', [dep('Pallavi Chauhan', 'spouse', '1992-07-21'), dep('Reyansh Chauhan', 'child', '2020-01-15')], { mealTier: 'm1', flex: { commute: 1500 } }),
    enrolled('emp_5', 'h3', [], { npsTier: 'n5', flex: { learning: 1500, internet: 500 } }),
    enrolled('emp_8', 'h5', [dep('Anjali Subramanian', 'spouse', '1996-10-02'), dep('Nila Subramanian', 'child', '2023-03-18')]),
    enrolled('emp_10', 'h5', [dep('Mahesh Joshi', 'parent', '1965-09-01'), dep('Sunita Joshi', 'parent', '1967-02-17')], { mealTier: 'm1' }),
    enrolled('emp_12', 'h3', [dep('Sunita Patil', 'spouse', '1992-12-04'), dep('Om Patil', 'child', '2016-06-06'), dep('Siddhi Patil', 'child', '2019-09-09')]),
    enrolled('emp_16', 'h5', [dep('Venkat Iyer', 'spouse', '1990-05-25'), dep('Aditi Iyer', 'child', '2019-04-13')], { mealTier: 'm2', npsTier: 'n5' }),
    enrolled('emp_17', 'h3', [dep('Priya Reddy', 'spouse', '1998-01-19')], { flex: { wellness: 1000 } }),
    enrolled('emp_18', 'h3', []),
    { employeeId: 'emp_19', status: 'waived', submittedOn: '2026-11-07', by: 'Employee', dependants: [], flex: {} },
  ];
  const claims: Claim[] = [
    claim(1, 'emp_1', 'Mira Malhotra', 'child', 'cashless', 'Lakeview Hospital', 48000, '2026-09-03', 'settled', { approved: 46500, closedOn: '2026-09-05', steps: [['2026-09-04', 'in_review'], ['2026-09-04', 'approved', 'Approved after pre-authorisation.'], ['2026-09-05', 'settled', 'Hospital paid directly.']] }),
    claim(2, 'emp_2', 'Gopal Nair', 'parent', 'reimbursement', 'Sunrise Medical Centre', 112000, '2026-09-18', 'settled', { approved: 98000, closedOn: '2026-10-06', steps: [['2026-09-22', 'in_review'], ['2026-09-30', 'query', 'Discharge summary was unclear.'], ['2026-10-02', 'in_review'], ['2026-10-03', 'approved', 'Part of the room rent was above the plan limit.'], ['2026-10-06', 'settled']] }),
    claim(3, 'emp_4', 'Self', 'self', 'cashless', 'City Care Hospital', 22500, '2026-10-02', 'settled', { approved: 22500, closedOn: '2026-10-03', steps: [['2026-10-02', 'in_review'], ['2026-10-03', 'approved'], ['2026-10-03', 'settled']] }),
    claim(4, 'emp_3', 'Rahul Bansal', 'spouse', 'reimbursement', 'Greenfield Clinic', 36800, '2026-10-11', 'query', { steps: [['2026-10-14', 'in_review'], ['2026-10-19', 'query', 'Final bill and discharge summary are missing.']] }),
    claim(5, 'emp_12', 'Om Patil', 'child', 'cashless', 'Metro Children Hospital', 15200, '2026-10-14', 'rejected', { closedOn: '2026-10-16', reason: 'Condition existed before cover and was not disclosed', steps: [['2026-10-15', 'in_review'], ['2026-10-16', 'rejected', 'Earlier treatment records show the same condition.']] }),
    claim(6, 'emp_16', 'Self', 'self', 'reimbursement', 'Apex Diagnostics', 8400, '2026-10-27', 'in_review', { steps: [['2026-10-30', 'in_review']] }),
    claim(7, 'emp_10', 'Mahesh Joshi', 'parent', 'cashless', 'Lakeview Hospital', 185000, '2026-11-04', 'approved', { approved: 165000, steps: [['2026-11-05', 'in_review'], ['2026-11-06', 'approved', 'Approved for ₹1,65,000 against the estimate.']] }),
    claim(8, 'emp_8', 'Nila Subramanian', 'child', 'cashless', 'Rainbow Kids Clinic', 9800, '2026-11-05', 'submitted'),
    claim(9, 'emp_17', 'Self', 'self', 'reimbursement', 'Apex Diagnostics', 4300, '2026-10-08', 'rejected', { closedOn: '2026-10-20', reason: 'Documents incomplete after two reminders', steps: [['2026-10-10', 'query', 'Original bills needed.'], ['2026-10-15', 'query', 'Second reminder sent.'], ['2026-10-20', 'rejected', 'No documents received.']] }),
    claim(10, 'emp_1', 'Kamla Malhotra', 'parent', 'reimbursement', 'Sunrise Medical Centre', 64000, '2026-09-12', 'settled', { approved: 61000, closedOn: '2026-09-25', steps: [['2026-09-16', 'in_review'], ['2026-09-23', 'approved'], ['2026-09-25', 'settled']] }),
  ];
  return {
    plans: plans(),
    window: { opensOn: PREVIEW_TODAY, closesOn: addDays(PREVIEW_TODAY, 14), extensions: [] },
    enrolments, reminders: {}, claims, sent: {},
  };
}

// ───────────────────────────── compensation ─────────────────────────────
export const DEFAULT_GUIDELINES = (): Guidelines => ({
  exceeds: { low: { min: 10, max: 15 }, mid: { min: 8, max: 12 }, high: { min: 5, max: 8 } },
  meets: { low: { min: 6, max: 9 }, mid: { min: 4, max: 7 }, high: { min: 2, max: 4 } },
  partial: { low: { min: 2, max: 4 }, mid: { min: 1, max: 3 }, high: { min: 0, max: 2 } },
  below: { low: { min: 0, max: 2 }, mid: { min: 0, max: 1 }, high: { min: 0, max: 0 } },
  unrated: { low: { min: 3, max: 5 }, mid: { min: 2, max: 4 }, high: { min: 0, max: 2 } },
});

function makeComp(): CompState {
  const P = (pct: number, reason?: string) => ({ pct, reason, by: 'Reporting manager', on: '2026-11-05' });
  return {
    bands: [
      { grade: 'W1', min: 210000, mid: 250000, max: 290000, market: 262000, published: true },
      { grade: 'E1', min: 300000, mid: 350000, max: 400000, market: 345000, published: true },
      { grade: 'E2', min: 480000, mid: 600000, max: 700000, market: 615000, published: true },
      { grade: 'E3', min: 1200000, mid: 1600000, max: 2000000, market: 1650000, published: true },
      { grade: 'M1', min: 800000, mid: 1000000, max: 1200000, market: 1020000, published: true },
      { grade: 'M3', min: 1800000, mid: 2400000, max: 3000000, market: 2350000, published: false },
    ],
    perf: {
      emp_1: 'meets', emp_2: 'exceeds', emp_3: 'exceeds', emp_4: 'exceeds', emp_5: 'meets', emp_6: 'meets', emp_7: 'partial', emp_8: 'meets', emp_9: 'unrated', emp_10: 'meets',
      emp_11: 'meets', emp_12: 'exceeds', emp_13: 'meets', emp_14: 'meets', emp_15: 'unrated', emp_16: 'meets', emp_17: 'exceeds', emp_18: 'meets', emp_19: 'partial', emp_20: 'meets',
      emp_21: 'meets', emp_22: 'meets',
    },
    perfNotes: {
      emp_2: { evidence: 'Region target at 118% across the first two quarters (sample figure).' },
      emp_4: { evidence: 'Team at 104% of target, and two new hires reached full productivity (sample figure).' },
      emp_7: { evidence: 'Visit completion 68% against an 85% plan; a coaching plan was agreed in September (sample figure).', reply: 'I was on leave for three weeks in August. Please count the shorter period.' },
      emp_12: { evidence: 'Dispatch accuracy 99.2% over the year (sample figure).' },
    },
    cycle: {
      id: 'merit_fy2627', name: 'Annual review, FY 2026-27', effectiveOn: '2026-12-01', budgetPct: 8, status: 'draft',
      guidelines: DEFAULT_GUIDELINES(),
      proposals: {
        emp_1: P(5), emp_2: P(12), emp_3: P(5), emp_4: P(10), emp_5: P(3), emp_6: P(6), emp_8: P(5), emp_9: P(4), emp_10: P(6),
        emp_12: P(9), emp_13: P(5),
        emp_14: P(4, 'Taking on the night-lead rota; part of the pay moves into a shift allowance instead (sample reason).'),
        emp_15: P(8),
        emp_16: P(5), emp_17: P(10),
      },
      applied: {},
    },
  };
}

export function makeRewardsSeed(): RewardsState {
  return { version: 1, assets: makeAssets(), benefits: makeBenefits(), comp: makeComp(), log: [] };
}

export { PREVIEW_TODAY };
