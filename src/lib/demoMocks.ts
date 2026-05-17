// Demo mock layer for the demo@kinematic.com user. Intercepts client API
// calls and returns hand-crafted India-FMCG seed data so the demo can be
// driven without a backend. Heavy data tables live in ./demo/* helpers
// to keep this entry file small enough to be edited and pushed via the
// platform's MCP tooling.

export const DEMO_USER_EMAIL = 'demo@kinematic.com';

export * from './demo/factoriesA';
export * from './demo/factoriesB';

import {
  mockDashboardInit, mockSummary, mockTrends, mockFeed, mockHeatmap,
  mockLocations, mockUsers, mockAttendanceTeam, mockStores, mockFormTemplates,
  mockActivities, mockAssets, mockSecurityAlerts, mockVisitLogs,
  mockSubmissions,
} from './demo/factoriesA';
import {
  mockSOS, mockGrievances, mockCities, mockZones, mockClients, mockInventory,
  mockWarehouseSummary, mockMovements, mockWeeklyContacts, mockCityPerformance,
  mockOutletCoverage, mockBroadcasts, mockBroadcastAdmin, mockLearningMaterials,
  mockMobileHome,
} from './demo/factoriesB';
import {
  CRM_LEADS, CRM_PIPELINES, CRM_ACCOUNTS, CRM_CONTACTS, CRM_DEALS, CRM_ACTIVITIES,
  CRM_SOURCES, CRM_DASHBOARD_SUMMARY, CRM_PIPELINE_VALUE, CRM_FUNNEL, CRM_WIN_RATE,
  CRM_FORECAST, CRM_HEATMAP, CRM_LEAD_SOURCE_ROI, CRM_SCORE_DIST, CRM_SALES_CYCLE,
  CRM_DASHBOARD_COMPLETE, CRM_TERRITORIES, CRM_PRODUCTS, CRM_LEAD_VELOCITY,
  CRM_TIME_TO_FIRST_TOUCH, CRM_STUCK_LEADS_KPI, CRM_LOST_REASONS, CRM_WON_REASONS,
  CRM_DISQUAL_REASONS, CRM_STAGE_CONVERSION, CRM_LEAD_AGING, CRM_COHORT_CONVERSION,
  CRM_ENGAGEMENT_COMPARISON, CRM_DAYS_SINCE_TOUCH, CRM_SCORE_BAND_CONVERSION,
  CRM_TERRITORY_CONVERSION, CRM_TOUCHPOINTS_TO_RESPONSE, CRM_LEADS_AT_RISK,
  CRM_ANALYTICS_LAYOUT, CRM_OVERVIEW_LAYOUT, CRM_WA_TEMPLATES_SEED,
  readDemoWaTemplates, writeDemoWaTemplates, pushDemoWaTemplate,
  PLANOGRAMS, PLAN_ASSIGNMENTS, PLAN_CAPTURES, planRecognitionFor, planComplianceFor,
  PLAN_TREND, PLAN_STORE_RANKING, PLAN_CHRONIC_GAPS, PLAN_SKU_VISIBILITY,
  PLAN_RISK_FORECAST, HR_CANDIDATES,
} from './demo/seedData';

const DIST_BRANDS = [
  { id: 'demo-brand-1', name: 'HUL',       code: 'HUL',  is_active: true,  created_at: new Date(Date.now() - 200*86400000).toISOString() },
  { id: 'demo-brand-2', name: 'ITC',       code: 'ITC',  is_active: true,  created_at: new Date(Date.now() - 180*86400000).toISOString() },
  { id: 'demo-brand-3', name: 'Nestle',    code: 'NEST', is_active: true,  created_at: new Date(Date.now() - 160*86400000).toISOString() },
  { id: 'demo-brand-4', name: 'Tata Consumer', code: 'TATA', is_active: true, created_at: new Date(Date.now() - 140*86400000).toISOString() },
  { id: 'demo-brand-5', name: 'Britannia', code: 'BRIT', is_active: true,  created_at: new Date(Date.now() - 120*86400000).toISOString() },
  { id: 'demo-brand-6', name: 'Parle',     code: 'PARL', is_active: true,  created_at: new Date(Date.now() - 100*86400000).toISOString() },
  { id: 'demo-brand-7', name: 'Marico',    code: 'MAR',  is_active: true,  created_at: new Date(Date.now() -  80*86400000).toISOString() },
  { id: 'demo-brand-8', name: 'Dabur',     code: 'DAB',  is_active: true,  created_at: new Date(Date.now() -  60*86400000).toISOString() },
];

const DIST_DISTRIBUTORS = [
  { id: 'demo-dist-1',  name: 'Mahalakshmi Trading Co',    code: 'MAH-MUM-01', legal_name: 'Mahalakshmi Trading Company Pvt Ltd', gstin: '27AABCM1234M1ZQ', state_code: '27', pan: 'AABCM1234M', region: 'West', customer_class: 'super_stockist', credit_limit:  4500000, payment_terms_days: 30, is_active: true, place_of_supply: '27', created_at: new Date(Date.now() - 220*86400000).toISOString() },
  { id: 'demo-dist-2',  name: 'Bengaluru Wholesale Hub',   code: 'BWH-BLR-02', legal_name: 'BWH Distributors LLP',                gstin: '29ABCDE5678F1ZR', state_code: '29', pan: 'ABCDE5678F', region: 'South', customer_class: 'distributor',   credit_limit:  3200000, payment_terms_days: 21, is_active: true, place_of_supply: '29', created_at: new Date(Date.now() - 200*86400000).toISOString() },
  { id: 'demo-dist-3',  name: 'North Delhi Distributors',  code: 'NDD-DEL-03', legal_name: 'North Delhi Distributors',             gstin: '07GHIJK9012L1ZS', state_code: '07', pan: 'GHIJK9012L', region: 'North', customer_class: 'distributor',   credit_limit:  2800000, payment_terms_days: 30, is_active: true, place_of_supply: '07', created_at: new Date(Date.now() - 180*86400000).toISOString() },
  { id: 'demo-dist-4',  name: 'Coromandel Sales',          code: 'COR-CHE-04', legal_name: 'Coromandel Sales (P) Ltd',             gstin: '33MNOPQ3456R1ZT', state_code: '33', pan: 'MNOPQ3456R', region: 'South', customer_class: 'distributor',   credit_limit:  2100000, payment_terms_days: 15, is_active: true, place_of_supply: '33', created_at: new Date(Date.now() - 160*86400000).toISOString() },
  { id: 'demo-dist-5',  name: 'Hyderabad Bulk Foods',      code: 'HBF-HYD-05', legal_name: 'Hyderabad Bulk Foods Pvt Ltd',         gstin: '36UVWXY7890Z1ZU', state_code: '36', pan: 'UVWXY7890Z', region: 'South', customer_class: 'wholesaler',    credit_limit:  1800000, payment_terms_days: 21, is_active: true, place_of_supply: '36', created_at: new Date(Date.now() - 140*86400000).toISOString() },
  { id: 'demo-dist-6',  name: 'Pune Modern Trade Co',      code: 'PMT-PUN-06', legal_name: 'Pune Modern Trade Co',                 gstin: '27ABCDE1234F2ZV', state_code: '27', pan: 'ABCDE1234F', region: 'West',  customer_class: 'distributor',   credit_limit:  2400000, payment_terms_days: 30, is_active: true, place_of_supply: '27', created_at: new Date(Date.now() - 120*86400000).toISOString() },
  { id: 'demo-dist-7',  name: 'Gujarat Stockists',         code: 'GUJ-AHD-07', legal_name: 'Gujarat Stockists & Distributors',     gstin: '24LMNOP5678Q1ZW', state_code: '24', pan: 'LMNOP5678Q', region: 'West',  customer_class: 'super_stockist',credit_limit:  3800000, payment_terms_days: 30, is_active: true, place_of_supply: '24', created_at: new Date(Date.now() - 100*86400000).toISOString() },
  { id: 'demo-dist-8',  name: 'Bengal Provisions',         code: 'BEN-KOL-08', legal_name: 'Bengal Provisions (Howrah)',           gstin: '19RSTUV9012W1ZX', state_code: '19', pan: 'RSTUV9012W', region: 'East',  customer_class: 'wholesaler',    credit_limit:  1450000, payment_terms_days: 15, is_active: true, place_of_supply: '19', created_at: new Date(Date.now() -  80*86400000).toISOString() },
  { id: 'demo-dist-9',  name: 'Rajasthan FMCG Hub',        code: 'RAJ-JAI-09', legal_name: 'Rajasthan FMCG Hub',                   gstin: '08XYZAB3456C1ZY', state_code: '08', pan: 'XYZAB3456C', region: 'North', customer_class: 'distributor',   credit_limit:  1900000, payment_terms_days: 30, is_active: true, place_of_supply: '08', created_at: new Date(Date.now() -  60*86400000).toISOString() },
  { id: 'demo-dist-10', name: 'Kerala Coastal Trade',      code: 'KER-KOC-10', legal_name: 'Kerala Coastal Trade Co',              gstin: '32DEFGH7890I1ZZ', state_code: '32', pan: 'DEFGH7890I', region: 'South', customer_class: 'wholesaler',    credit_limit:  1250000, payment_terms_days: 21, is_active: true, place_of_supply: '32', created_at: new Date(Date.now() -  40*86400000).toISOString() },
];

const DIST_PRICE_LISTS = [
  { id: 'demo-pl-1', name: 'Standard Wholesale Q3 2026',  code: 'STD-Q3-26',    status: 'active',   currency: 'INR', valid_from: new Date(Date.now() -  90*86400000).toISOString().slice(0,10), valid_to: new Date(Date.now() +  30*86400000).toISOString().slice(0,10), item_count: 142, created_at: new Date(Date.now() - 100*86400000).toISOString() },
  { id: 'demo-pl-2', name: 'Festive Premium Tier-1',      code: 'FEST-T1-26',   status: 'active',   currency: 'INR', valid_from: new Date(Date.now() -  60*86400000).toISOString().slice(0,10), valid_to: new Date(Date.now() +  20*86400000).toISOString().slice(0,10), item_count:  88, created_at: new Date(Date.now() -  70*86400000).toISOString() },
  { id: 'demo-pl-3', name: 'Tier-2 Towns Discount',       code: 'T2-DISC-26',   status: 'active',   currency: 'INR', valid_from: new Date(Date.now() -  30*86400000).toISOString().slice(0,10), valid_to: new Date(Date.now() +  60*86400000).toISOString().slice(0,10), item_count: 104, created_at: new Date(Date.now() -  35*86400000).toISOString() },
  { id: 'demo-pl-4', name: 'Modern Trade Special',        code: 'MT-SPL-25',    status: 'draft',    currency: 'INR', valid_from: new Date(Date.now() +   5*86400000).toISOString().slice(0,10), valid_to: new Date(Date.now() +  95*86400000).toISOString().slice(0,10), item_count:  62, created_at: new Date(Date.now() -  10*86400000).toISOString() },
];

const DIST_ORDERS = (() => {
  const statuses = ['draft', 'approved', 'approved', 'approved', 'cancelled', 'approved'] as const;
  return Array.from({ length: 14 }, (_, i) => {
    const status = statuses[i % statuses.length];
    const dist = DIST_DISTRIBUTORS[i % DIST_DISTRIBUTORS.length];
    const amount = 84000 + (i * 18500) + Math.round(Math.random() * 25000);
    return {
      id: `demo-dorder-${i + 1}`,
      order_no: `SO-2026-${String(1042 + i).padStart(5, '0')}`,
      distributor_id: dist.id,
      distributor_name: dist.name,
      distributor_code: dist.code,
      status,
      currency: 'INR',
      total_amount: amount,
      tax_amount: Math.round(amount * 0.18),
      grand_total: Math.round(amount * 1.18),
      item_count: 4 + (i % 7),
      placed_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      approved_at: status === 'approved' ? new Date(Date.now() - i * 86400000).toISOString() : null,
      cancelled_reason: status === 'cancelled' ? 'Distributor requested change' : null,
      created_by: 'demo-user-id',
      created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    };
  });
})();

const DIST_INVOICES = (() => {
  const approved = DIST_ORDERS.filter(o => o.status === 'approved');
  return approved.map((o, i) => ({
    id: `demo-inv-${i + 1}`,
    invoice_no: `INV-FY26-${String(8210 + i).padStart(6, '0')}`,
    order_id: o.id,
    order_no: o.order_no,
    distributor_id: o.distributor_id,
    distributor_name: o.distributor_name,
    distributor_code: o.distributor_code,
    invoice_date: new Date(Date.now() - (i * 4 + 2) * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() - (i * 4 + 2) * 86400000 + 30 * 86400000).toISOString().slice(0, 10),
    sub_total: o.total_amount,
    tax_amount: o.tax_amount,
    grand_total: o.grand_total,
    status: i < 2 ? 'cancelled' : (i < 4 ? 'partial' : (i < 7 ? 'paid' : 'open')),
    paid_amount: i < 2 ? 0 : (i < 4 ? Math.round(o.grand_total * 0.5) : (i < 7 ? o.grand_total : 0)),
    balance: i < 2 ? 0 : (i < 4 ? Math.round(o.grand_total * 0.5) : (i < 7 ? 0 : o.grand_total)),
    currency: 'INR',
    place_of_supply: '27',
    eway_bill_no: i % 3 === 0 ? `EWB${String(880011001234 + i).slice(-12)}` : null,
    created_at: new Date(Date.now() - (i * 4 + 2) * 86400000).toISOString(),
  }));
})();

const DIST_DISPATCHES = (() => {
  return DIST_INVOICES.slice(0, 8).map((inv, i) => ({
    id: `demo-disp-${i + 1}`,
    dispatch_no: `DSP-${String(2026101 + i).padStart(7, '0')}`,
    invoice_id: inv.id,
    invoice_no: inv.invoice_no,
    distributor_id: inv.distributor_id,
    distributor_name: inv.distributor_name,
    vehicle_no: ['MH-12-AB-3421', 'KA-05-CD-7890', 'DL-04-EF-2341', 'TN-22-GH-9012', 'TS-09-IJ-1122', 'GJ-01-KL-3344', 'WB-19-MN-5566', 'RJ-14-OP-7788'][i],
    transporter: ['TCI Express', 'Safexpress', 'Delhivery B2B', 'Gati', 'V-Trans', 'TCI Express', 'Safexpress', 'Gati'][i],
    eway_bill_no: `EWB${String(880011002000 + i * 7).slice(-12)}`,
    status: i < 2 ? 'dispatched' : (i < 6 ? 'in_transit' : 'delivered'),
    dispatched_at: new Date(Date.now() - (i * 2 + 1) * 86400000).toISOString(),
    expected_delivery: new Date(Date.now() + (8 - i) * 86400000).toISOString().slice(0, 10),
    created_at: new Date(Date.now() - (i * 2 + 1) * 86400000).toISOString(),
  }));
})();

const DIST_PAYMENTS = Array.from({ length: 16 }, (_, i) => {
  const dist = DIST_DISTRIBUTORS[i % DIST_DISTRIBUTORS.length];
  const amount = 125000 + (i * 47500) + Math.round(Math.random() * 35000);
  return {
    id: `demo-pay-${i + 1}`,
    payment_no: `PMT-${String(50101 + i).padStart(6, '0')}`,
    distributor_id: dist.id,
    distributor_name: dist.name,
    distributor_code: dist.code,
    method: (['UPI', 'NEFT', 'Cheque', 'RTGS', 'NEFT', 'UPI'] as const)[i % 6],
    reference_no: ['UTR' + (240511000000 + i * 1234).toString(), 'CHK-' + (220011 + i).toString(), 'NEFT' + (i + 1).toString().padStart(8, '0')][i % 3],
    amount,
    received_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    status: 'cleared',
    notes: i % 4 === 0 ? 'Against multiple invoices' : null,
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
  };
});

const DIST_RETURNS = [
  { id: 'demo-ret-1', return_no: 'RET-26-0014', distributor_id: 'demo-dist-2', distributor_name: 'Bengaluru Wholesale Hub',  invoice_no: 'INV-FY26-008212', reason: 'Damaged in transit',     value: 12450, status: 'approved', created_at: new Date(Date.now() - 6*86400000).toISOString() },
  { id: 'demo-ret-2', return_no: 'RET-26-0015', distributor_id: 'demo-dist-5', distributor_name: 'Hyderabad Bulk Foods',      invoice_no: 'INV-FY26-008215', reason: 'Wrong item shipped',     value:  8200, status: 'approved', created_at: new Date(Date.now() - 4*86400000).toISOString() },
  { id: 'demo-ret-3', return_no: 'RET-26-0016', distributor_id: 'demo-dist-1', distributor_name: 'Mahalakshmi Trading Co',    invoice_no: 'INV-FY26-008210', reason: 'Near expiry',            value: 18750, status: 'pending',  created_at: new Date(Date.now() - 2*86400000).toISOString() },
  { id: 'demo-ret-4', return_no: 'RET-26-0017', distributor_id: 'demo-dist-8', distributor_name: 'Bengal Provisions',          invoice_no: 'INV-FY26-008218', reason: 'Quality complaint',       value:  5100, status: 'rejected', rejected_reason: 'Outside return window', created_at: new Date(Date.now() - 9*86400000).toISOString() },
  { id: 'demo-ret-5', return_no: 'RET-26-0018', distributor_id: 'demo-dist-3', distributor_name: 'North Delhi Distributors',   invoice_no: 'INV-FY26-008214', reason: 'Distributor overstocked', value: 24300, status: 'pending',  created_at: new Date(Date.now() - 1*86400000).toISOString() },
];

const DIST_AGEING = DIST_DISTRIBUTORS.slice(0, 8).map((d, i) => {
  const current = 75000 + i * 22000;
  const b30 = i % 3 === 0 ? 45000 + i * 8500 : 0;
  const b60 = i % 4 === 1 ? 28000 + i * 4500 : 0;
  const b90 = i % 5 === 2 ? 15000 + i * 3200 : 0;
  const b90p = i === 4 ? 32000 : 0;
  return {
    distributor_id: d.id,
    distributor_name: d.name,
    distributor_code: d.code,
    current,
    bucket_1_30: b30,
    bucket_31_60: b60,
    bucket_61_90: b90,
    bucket_90_plus: b90p,
    total_outstanding: current + b30 + b60 + b90 + b90p,
    credit_limit: d.credit_limit,
    available_credit: Math.max(0, d.credit_limit - (current + b30 + b60 + b90 + b90p)),
  };
});

const DIST_SCHEMES = [
  { id: 'demo-sch-1', name: 'Buy 10 Cases + Get 1 Free — Maggi Noodles', code: 'BUYXGETY-MAG-26', scheme_type: 'buy_x_get_y', brand: 'Nestle', start_date: new Date(Date.now() - 14*86400000).toISOString().slice(0,10), end_date: new Date(Date.now() + 16*86400000).toISOString().slice(0,10), status: 'active', applies_to: 'all_distributors',  uses: 84, created_at: new Date(Date.now() - 20*86400000).toISOString() },
  { id: 'demo-sch-2', name: 'Diwali ₹50/Case Slab — Cookies',            code: 'SLAB-DIW-26',    scheme_type: 'slab_discount', brand: 'Britannia', start_date: new Date(Date.now() - 30*86400000).toISOString().slice(0,10), end_date: new Date(Date.now() +  5*86400000).toISOString().slice(0,10), status: 'active', applies_to: 'super_stockist',   uses: 31, created_at: new Date(Date.now() - 35*86400000).toISOString() },
  { id: 'demo-sch-3', name: '5% Trade Discount — Tea',                   code: 'PCT-TEA-26',     scheme_type: 'percentage', brand: 'Tata Consumer', start_date: new Date(Date.now() - 60*86400000).toISOString().slice(0,10), end_date: new Date(Date.now() - 10*86400000).toISOString().slice(0,10), status: 'expired', applies_to: 'all_distributors', uses: 142, created_at: new Date(Date.now() - 65*86400000).toISOString() },
  { id: 'demo-sch-4', name: 'Q4 Volume Bonus — Cooking Oil',             code: 'VOL-OIL-26',     scheme_type: 'volume_bonus', brand: 'Marico',     start_date: new Date(Date.now() +  3*86400000).toISOString().slice(0,10), end_date: new Date(Date.now() + 93*86400000).toISOString().slice(0,10), status: 'upcoming',applies_to: 'distributor',      uses: 0,   created_at: new Date(Date.now() -  5*86400000).toISOString() },
  { id: 'demo-sch-5', name: 'Festive Combo Pack — Surf + Lifebuoy',      code: 'COMBO-FEST-26',  scheme_type: 'combo',        brand: 'HUL',        start_date: new Date(Date.now() - 21*86400000).toISOString().slice(0,10), end_date: new Date(Date.now() + 14*86400000).toISOString().slice(0,10), status: 'active', applies_to: 'wholesaler',       uses: 47, created_at: new Date(Date.now() - 25*86400000).toISOString() },
];

const DIST_GSTIN_STATES = [
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }, { code: '07', name: 'Delhi' },
  { code: '33', name: 'Tamil Nadu' }, { code: '36', name: 'Telangana' }, { code: '24', name: 'Gujarat' },
  { code: '19', name: 'West Bengal' }, { code: '08', name: 'Rajasthan' }, { code: '32', name: 'Kerala' },
  { code: '06', name: 'Haryana' }, { code: '09', name: 'Uttar Pradesh' }, { code: '23', name: 'Madhya Pradesh' },
];

const DIST_AGEING_SUMMARY = (() => {
  const tot = DIST_AGEING.reduce((s, r) => ({
    current: s.current + r.current, b30: s.b30 + r.bucket_1_30,
    b60: s.b60 + r.bucket_31_60, b90: s.b90 + r.bucket_61_90, b90p: s.b90p + r.bucket_90_plus,
  }), { current: 0, b30: 0, b60: 0, b90: 0, b90p: 0 });
  return {
    total_outstanding: tot.current + tot.b30 + tot.b60 + tot.b90 + tot.b90p,
    buckets: { '0_30': tot.current + tot.b30, '31_60': tot.b60, '61_90': tot.b90, '90_plus': tot.b90p },
  };
})();

const DIST_LEDGER_ENTRIES = (() => {
  type Row = { id: string; posted_at: string; entry_type: string; ref_table: string; ref_id: string; dr: number; cr: number; running_balance: number; notes: string };
  const rows: Row[] = [];
  let bal = 0;
  for (let i = 0; i < 22; i++) {
    const isInvoice = i % 3 !== 2;
    const amount = isInvoice ? 180000 + (i * 24500) : 120000 + (i * 18500);
    if (isInvoice) bal += amount; else bal -= amount;
    rows.push({
      id: `demo-led-${i + 1}`,
      posted_at: new Date(Date.now() - (22 - i) * 86400000).toISOString(),
      entry_type: isInvoice ? 'invoice' : 'payment',
      ref_table: isInvoice ? 'invoices' : 'payments',
      ref_id: isInvoice ? `demo-inv-${(i % 8) + 1}` : `demo-pay-${(i % 16) + 1}`,
      dr: isInvoice ? amount : 0,
      cr: isInvoice ? 0 : amount,
      running_balance: bal,
      notes: isInvoice ? 'Invoice raised' : 'Payment received against open invoices',
    });
  }
  return rows.reverse();
})();

const DIST_SECONDARY_FEED = Array.from({ length: 14 }, (_, i) => {
  const sources = ['manual', 'estimated', 'qr'] as const;
  const periodEnd = new Date(Date.now() - (i + 1) * 86400000);
  const periodStart = new Date(periodEnd.getTime() - 6 * 86400000);
  return {
    id: `demo-secsale-${i + 1}`,
    outlet_id: `demo-outlet-${String(1000 + i).padEnd(8, '0')}-aaaa-bbbb-cccc-${String(i).padStart(12, '0')}`,
    sku_id:    `demo-sku-${String(2000 + (i % 8)).padEnd(7, '0')}-dddd-eeee-ffff-${String(i % 8).padStart(12, '0')}`,
    qty: 6 + (i % 12),
    period_start: periodStart.toISOString().slice(0, 10),
    period_end:   periodEnd.toISOString().slice(0, 10),
    source: sources[i % sources.length],
    notes: ([
      'Captured at Sharma Kirana, Mumbai', 'QR-scanned at Anand General Store, Bengaluru',
      'Estimated based on visible stock at Modern Mart, Delhi', 'Captured at Quick Stop, Chennai',
      'Padma Stores Hyderabad — bill 70014', 'Sai Provisions Pune — bill 70015',
      'Maharaja Bazaar Ahmedabad — bill 70016', null,
    ] as Array<string | null>)[i % 8],
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
  };
});

const SECURITY_ALERTS = (() => {
  const users = [
    { id: 'demo-fe-1', name: 'Arjun Sharma',   employee_id: 'FE-1042', role: 'executive',  zones: { name: 'Mumbai West' } },
    { id: 'demo-fe-2', name: 'Priya Patel',    employee_id: 'FE-1051', role: 'executive',  zones: { name: 'Bangalore North' } },
    { id: 'demo-fe-3', name: 'Rahul Verma',    employee_id: 'FE-1063', role: 'supervisor', zones: { name: 'Delhi Central' } },
    { id: 'demo-fe-4', name: 'Sneha Rao',      employee_id: 'FE-1078', role: 'executive',  zones: { name: 'Chennai South' } },
    { id: 'demo-fe-5', name: 'Amit Singh',     employee_id: 'FE-1085', role: 'executive',  zones: { name: 'Hyderabad East' } },
    { id: 'demo-fe-6', name: 'Karthik Pillai', employee_id: 'FE-1092', role: 'executive',  zones: { name: 'Pune Central' } },
  ];
  const actions = ['ATTENDANCE_CHECKIN', 'FORM_SUBMIT', 'VISIT_CHECKIN', 'ATTENDANCE_CHECKOUT', 'PHOTO_UPLOAD'];
  const out: Array<{ id: string; type: 'MOCK_LOCATION' | 'VPN_DETECTED'; action: string; lat: number | null; lng: number | null; created_at: string; user: typeof users[number] }> = [];
  const cities: Array<[number, number]> = [
    [19.0760, 72.8777], [12.9716, 77.5946], [28.6139, 77.2090], [13.0827, 80.2707],
    [17.3850, 78.4867], [18.5204, 73.8567], [22.5726, 88.3639], [26.9124, 75.7873],
  ];
  for (let i = 0; i < 8; i++) {
    const isVpn = i % 3 === 0;
    const u = users[i % users.length];
    const c = cities[i % cities.length];
    out.push({
      id: `demo-sec-${i + 1}`,
      type: isVpn ? 'VPN_DETECTED' : 'MOCK_LOCATION',
      action: actions[i % actions.length],
      lat: isVpn ? null : c[0] + (Math.random() - 0.5) * 0.02,
      lng: isVpn ? null : c[1] + (Math.random() - 0.5) * 0.02,
      created_at: new Date(Date.now() - i * 86400000 * 1.25).toISOString(),
      user: u,
    });
  }
  return out;
})();

const ROUTE_PLANS = (() => {
  const fes = [
    { id: 'demo-fe-1', name: 'Arjun Sharma',   employee_id: 'FE-1042', mobile: '+91 98201 11111', zone: 'Mumbai West',      city: 'Mumbai' },
    { id: 'demo-fe-2', name: 'Priya Patel',    employee_id: 'FE-1051', mobile: '+91 98202 22222', zone: 'Bangalore North',  city: 'Bengaluru' },
    { id: 'demo-fe-3', name: 'Rahul Verma',    employee_id: 'FE-1063', mobile: '+91 98203 33333', zone: 'Delhi Central',    city: 'Delhi' },
    { id: 'demo-fe-4', name: 'Sneha Rao',      employee_id: 'FE-1078', mobile: '+91 98204 44444', zone: 'Chennai South',    city: 'Chennai' },
    { id: 'demo-fe-5', name: 'Amit Singh',     employee_id: 'FE-1085', mobile: '+91 98205 55555', zone: 'Hyderabad East',   city: 'Hyderabad' },
    { id: 'demo-fe-6', name: 'Karthik Pillai', employee_id: 'FE-1092', mobile: '+91 98206 66666', zone: 'Pune Central',     city: 'Pune' },
    { id: 'demo-fe-7', name: 'Pooja Joshi',    employee_id: 'FE-1107', mobile: '+91 98207 77777', zone: 'Ahmedabad West',   city: 'Ahmedabad' },
    { id: 'demo-fe-8', name: 'Manish Khanna',  employee_id: 'FE-1118', mobile: '+91 98208 88888', zone: 'Kolkata North',    city: 'Kolkata' },
  ];
  const cityCoords: Record<string, [number, number]> = {
    Mumbai: [19.0760, 72.8777], Bengaluru: [12.9716, 77.5946], Delhi: [28.6139, 77.2090],
    Chennai: [13.0827, 80.2707], Hyderabad: [17.3850, 78.4867], Pune: [18.5204, 73.8567],
    Ahmedabad: [23.0225, 72.5714], Kolkata: [22.5726, 88.3639],
  };
  const storeNames = ['Sharma Kirana', 'Anand General Store', 'Modern Mart', 'Quick Stop', 'Padma Stores', 'Sai Provisions', 'Maharaja Bazaar', 'Vinayak Traders', 'Krishna Foods', 'Lakshmi Mart'];
  const statuses = ['completed', 'in_progress', 'partial', 'pending', 'completed', 'in_progress', 'pending', 'partial', 'completed', 'in_progress'] as const;
  const vehicles = ['2w_petrol', '4w_petrol', '4w_diesel', '2w_ev', '4w_ev', '2w_petrol', 'auto_rickshaw', '4w_petrol', '2w_petrol', 'public_bus'];

  return Array.from({ length: 10 }, (_, i) => {
    const fe = fes[i % fes.length];
    const status = statuses[i];
    const [baseLat, baseLng] = cityCoords[fe.city] ?? [19.0760, 72.8777];
    const total = 4 + (i % 4);
    const visited = status === 'completed' ? total : status === 'in_progress' ? Math.max(1, Math.floor(total / 2)) : status === 'partial' ? Math.max(1, total - 2) : 0;
    const missed = status === 'pending' ? 0 : total - visited;
    const completion = Math.round((visited / total) * 100);
    const planDate = new Date(Date.now() - (i - 2) * 86400000).toISOString().slice(0, 10);
    const co2Planned = +(total * 4.8 * 0.072 * (i % 3 === 0 ? 2.4 : 1)).toFixed(2);
    const co2Actual = +(visited * 4.8 * 0.072 * (i % 3 === 0 ? 2.4 : 1)).toFixed(2);

    const outlets = Array.from({ length: total }, (_, j) => {
      const outletStatus = j < visited ? 'visited' : j === visited && status === 'in_progress' ? 'in_progress' : 'pending';
      return {
        id: `demo-stop-${i}-${j}`,
        visit_order: j + 1,
        target_type: ['order', 'survey', 'merchandising', 'collection'][j % 4],
        target_notes: ['Push festive combo', 'Q4 visibility audit', 'Display refresh', 'Collect outstanding'][j % 4],
        target_value: 8500 + j * 2200,
        status: outletStatus,
        checkin_at:  outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000).toISOString() : undefined,
        checkout_at: outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000 + 25 * 60000).toISOString() : undefined,
        order_amount: outletStatus === 'visited' ? 6500 + j * 1850 : undefined,
        actual_duration_min: outletStatus === 'visited' ? 20 + (j * 4) % 18 : undefined,
        planned_duration_min: 25,
        store_id: `demo-store-${i}-${j}`,
        store_name: `${storeNames[(i + j) % storeNames.length]} - ${fe.city} ${j + 1}`,
        store_code: `STR-${String(20000 + i * 10 + j).padStart(5, '0')}`,
        store_address: `Shop ${j + 1}, ${['MG Road', 'Park Street', 'Linking Road', 'FC Road', 'Brigade Road'][j % 5]}, ${fe.city}`,
        store_type: ['kirana', 'modern_trade', 'wholesaler', 'pharmacy'][j % 4],
        store_lat: baseLat + (Math.random() - 0.5) * 0.08,
        store_lng: baseLng + (Math.random() - 0.5) * 0.08,
        store_phone: `+91 98${String(300 + i * 10 + j).slice(-3)} ${String(10000 + i * 100 + j).slice(-5)}`,
        store_owner: ['Mr Sharma', 'Mrs Iyer', 'Mr Kumar', 'Mrs Gupta', 'Mr Pillai', 'Mr Joshi'][(i + j) % 6],
        zone_name: fe.zone,
        checkin_distance_m: outletStatus === 'visited' ? Math.round(8 + Math.random() * 35) : undefined,
      };
    });

    return {
      id: `demo-plan-${i + 1}`,
      user_id: fe.id,
      plan_date: planDate,
      total_outlets: total,
      visited_outlets: visited,
      missed_outlets: missed,
      completion_pct: completion,
      status,
      notes: i % 4 === 0 ? 'Festive beat — push combo packs' : undefined,
      frequency: ['weekly', 'biweekly', 'daily'][i % 3],
      territory_label: `${fe.zone} Beat ${(i % 3) + 1}`,
      fe_name: fe.name,
      fe_employee_id: fe.employee_id,
      fe_mobile: fe.mobile,
      zone_name: fe.zone,
      city_name: fe.city,
      vehicle_type: vehicles[i],
      co2_kg_planned: co2Planned,
      co2_kg_actual: co2Actual,
      outlets,
    };
  });
})();

const ROUTE_PLAN_SUMMARY = (() => {
  const total_outlets = ROUTE_PLANS.reduce((s, p) => s + p.total_outlets, 0);
  const visited       = ROUTE_PLANS.reduce((s, p) => s + p.visited_outlets, 0);
  const missed        = ROUTE_PLANS.reduce((s, p) => s + p.missed_outlets, 0);
  const completed     = ROUTE_PLANS.filter(p => p.status === 'completed').length;
  const partial       = ROUTE_PLANS.filter(p => p.status === 'partial').length;
  const in_progress   = ROUTE_PLANS.filter(p => p.status === 'in_progress').length;
  const pending       = ROUTE_PLANS.filter(p => p.status === 'pending').length;
  const total_fes     = new Set(ROUTE_PLANS.map(p => p.user_id)).size;
  return {
    total_fes, total_outlets,
    visited_outlets: visited, missed_outlets: missed,
    completed_plans: completed, partial_plans: partial,
    in_progress_plans: in_progress, pending_plans: pending,
    avg_completion: Math.round(ROUTE_PLANS.reduce((s, p) => s + p.completion_pct, 0) / ROUTE_PLANS.length),
  };
})();

const ROUTE_PLAN_ESG = (() => {
  const totalKm = ROUTE_PLANS.reduce((s, p) => s + p.total_outlets * 4.8, 0);
  const planned = ROUTE_PLANS.reduce((s, p) => s + (p.co2_kg_planned ?? 0), 0);
  const actual  = ROUTE_PLANS.reduce((s, p) => s + (p.co2_kg_actual ?? 0), 0);
  const by_vehicle: Record<string, { km: number; co2_kg: number; plan_count: number }> = {};
  for (const p of ROUTE_PLANS) {
    const v = p.vehicle_type ?? '2w_petrol';
    const e = by_vehicle[v] ?? { km: 0, co2_kg: 0, plan_count: 0 };
    e.km += p.total_outlets * 4.8;
    e.co2_kg += p.co2_kg_actual ?? 0;
    e.plan_count += 1;
    by_vehicle[v] = e;
  }
  const daily_series = Array.from({ length: 14 }, (_, i) => ({
    day: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
    co2_kg: +(2.4 + Math.sin(i / 2) + Math.random() * 1.5).toFixed(2),
  }));
  return {
    range: {
      from: new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10),
      to:   new Date().toISOString().slice(0, 10),
    },
    total_co2_kg_planned: +planned.toFixed(2),
    total_co2_kg_actual:  +actual.toFixed(2),
    total_km:             +totalKm.toFixed(1),
    delta_vs_planned_pct: planned > 0 ? +(((actual - planned) / planned) * 100).toFixed(1) : 0,
    by_vehicle, daily_series,
    equivalents: {
      trees_year: +(actual / 21).toFixed(1),
      home_days:  +(actual / 4.5).toFixed(1),
    },
  };
})();

const list = <T,>(rows: T[]) => ({ success: true, data: rows });
const wrap = <T,>(body: T)  => ({ success: true, data: body });

export function matchDemoMock<T>(rawPath: string, method: string, body?: unknown): T | undefined {
  const noQuery = rawPath.split('?')[0];
  const path = noQuery.startsWith('/api/v1') ? noQuery.slice('/api/v1'.length) : noQuery;
  const m = method.toUpperCase();
  const bodyObj: Record<string, unknown> = (body && typeof body === 'object' && !Array.isArray(body))
    ? (body as Record<string, unknown>)
    : {};

  if (m === 'GET') {
    if (path === '/analytics/dashboard-init')   return mockDashboardInit() as unknown as T;
    if (path === '/analytics/summary')          return mockSummary(new Date().toISOString().split('T')[0]) as unknown as T;
    if (path === '/analytics/trends')           return mockTrends() as unknown as T;
    if (path === '/analytics/tff-trends')       return mockTrends() as unknown as T;
    if (path === '/analytics/feed')             return mockFeed() as unknown as T;
    if (path === '/analytics/heatmap')          return mockHeatmap() as unknown as T;
    if (path === '/analytics/contact-heatmap')  return mockHeatmap() as unknown as T;
    if (path === '/analytics/locations')        return mockLocations() as unknown as T;
    if (path === '/analytics/weekly-contacts')  return mockWeeklyContacts() as unknown as T;
    if (path === '/analytics/city-performance') return mockCityPerformance() as unknown as T;
    if (path === '/analytics/outlet-coverage')  return mockOutletCoverage() as unknown as T;
    if (path === '/analytics/attendance-today') return mockAttendanceTeam() as unknown as T;
    if (path === '/analytics/mobile-home')      return mockMobileHome() as unknown as T;

    if (path === '/users')                      return mockUsers() as unknown as T;
    if (path === '/attendance/team')            return mockAttendanceTeam() as unknown as T;
    if (path === '/zones')                      return mockZones() as unknown as T;
    if (path === '/clients')                    return mockClients() as unknown as T;
    if (path === '/inventory' || path === '/skus') return mockInventory() as unknown as T;
    if (path === '/warehouses' || path === '/warehouse/summary' || path === '/warehouses/summary') return mockWarehouseSummary() as unknown as T;
    if (path === '/movements' || path === '/wms/movements')      return mockMovements() as unknown as T;
    if (/^\/warehouses\/[^/]+\/movements$/.test(path))            return mockMovements() as unknown as T;
    if (path === '/cities')                     return mockCities() as unknown as T;
    if (path === '/grievances')                 return mockGrievances() as unknown as T;
    if (path === '/sos' || path === '/sos/active') return mockSOS() as unknown as T;
    if (path === '/broadcast' || path === '/broadcasts') return mockBroadcasts() as unknown as T;
    if (path === '/learning')                   return mockLearningMaterials() as unknown as T;
    if (path === '/visit-logs' || path === '/visits/team' || path === '/visits') return mockVisitLogs() as unknown as T;
    if (path === '/forms/templates' || path === '/form-templates') return mockFormTemplates() as unknown as T;
    if (path === '/forms/submissions' || path === '/submissions')  return mockSubmissions() as unknown as T;
    if (path === '/route-plans')                return list(ROUTE_PLANS) as unknown as T;
    if (path === '/activity-mappings')          return list([]) as unknown as T;
    if (path === '/activities')                 return mockActivities() as unknown as T;
    if (path === '/assets')                     return mockAssets() as unknown as T;
    if (path === '/security/alerts')            return mockSecurityAlerts() as unknown as T;
    if (path === '/stores')                     return mockStores() as unknown as T;

    if (path === '/distribution/brands')                  return list(DIST_BRANDS) as unknown as T;
    if (path === '/distribution/distributors')            return list(DIST_DISTRIBUTORS) as unknown as T;
    if (path === '/distribution/price-lists')             return list(DIST_PRICE_LISTS) as unknown as T;
    if (path === '/distribution/orders')                  return list(DIST_ORDERS) as unknown as T;
    if (path === '/distribution/invoices')                return list(DIST_INVOICES) as unknown as T;
    if (path === '/distribution/dispatches')              return list(DIST_DISPATCHES) as unknown as T;
    if (path === '/distribution/payments')                return list(DIST_PAYMENTS) as unknown as T;
    if (path === '/distribution/returns')                 return list(DIST_RETURNS) as unknown as T;
    if (path === '/distribution/ledger')                  return wrap({ entries: DIST_LEDGER_ENTRIES }) as unknown as T;
    if (path === '/distribution/ledger/ageing')           return wrap(DIST_AGEING_SUMMARY) as unknown as T;
    if (path === '/distribution/schemes')                 return list(DIST_SCHEMES) as unknown as T;
    if (path === '/distribution/secondary-sales')         return list(DIST_SECONDARY_FEED) as unknown as T;
    if (path === '/distribution/gstin/states')            return list(DIST_GSTIN_STATES) as unknown as T;
    {
      const brandById = path.match(/^\/distribution\/brands\/([^/]+)$/);
      if (brandById) return wrap(DIST_BRANDS.find(b => b.id === brandById[1]) || DIST_BRANDS[0]) as unknown as T;
      const distById = path.match(/^\/distribution\/distributors\/([^/]+)$/);
      if (distById) return wrap(DIST_DISTRIBUTORS.find(d => d.id === distById[1]) || DIST_DISTRIBUTORS[0]) as unknown as T;
      const distBilling = path.match(/^\/distribution\/distributors\/([^/]+)\/billing-summary$/);
      if (distBilling) {
        const d = DIST_DISTRIBUTORS.find(x => x.id === distBilling[1]) || DIST_DISTRIBUTORS[0];
        const age = DIST_AGEING.find(a => a.distributor_id === d.id) ?? DIST_AGEING[0];
        return wrap({
          distributor_id: d.id, distributor_name: d.name,
          credit_limit: d.credit_limit, payment_terms_days: d.payment_terms_days,
          outstanding: age.total_outstanding, available_credit: age.available_credit,
          ytd_sales: 4_850_000 + Math.round(Math.random() * 2_400_000),
          last_payment_at: new Date(Date.now() - 7 * 86400000).toISOString(),
          last_invoice_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          ageing: age,
        }) as unknown as T;
      }
      const plById = path.match(/^\/distribution\/price-lists\/([^/]+)$/);
      if (plById) {
        const pl = DIST_PRICE_LISTS.find(x => x.id === plById[1]) || DIST_PRICE_LISTS[0];
        return wrap({
          ...pl,
          items: Array.from({ length: 10 }, (_, i) => ({
            id: `${pl.id}-item-${i + 1}`,
            sku: ['Maggi 70g', 'Surf Excel 1kg', 'Tata Salt 1kg', 'Britannia Marie', 'Parle-G 100g', 'Lifebuoy Soap 125g', 'Dabur Honey 250g', 'Bru Coffee 100g', 'Saffola Oil 1L', 'Real Juice 1L'][i],
            unit: 'case', list_price: 240 + i * 18, min_qty: 1, max_qty: 999,
          })),
        }) as unknown as T;
      }
      const ordById = path.match(/^\/distribution\/orders\/([^/]+)$/);
      if (ordById) {
        const o = DIST_ORDERS.find(x => x.id === ordById[1]) || DIST_ORDERS[0];
        return wrap({
          ...o,
          items: Array.from({ length: o.item_count }, (_, i) => ({
            id: `${o.id}-line-${i + 1}`,
            sku: ['Maggi 70g x 12', 'Surf 1kg x 6', 'Tata Salt 1kg x 10', 'Marie 250g x 12', 'Parle-G 100g x 36', 'Lifebuoy 125g x 24', 'Honey 250g x 12'][i % 7],
            qty: 10 + (i * 4), unit_price: 240 + i * 22,
            total: (10 + (i * 4)) * (240 + i * 22), tax_pct: 18,
          })),
        }) as unknown as T;
      }
      const invById = path.match(/^\/distribution\/invoices\/([^/]+)$/);
      if (invById) {
        const inv = DIST_INVOICES.find(x => x.id === invById[1]) || DIST_INVOICES[0];
        return wrap({
          ...inv,
          items: Array.from({ length: 6 }, (_, i) => ({
            id: `${inv.id}-line-${i + 1}`,
            sku: ['Maggi 70g x 12', 'Surf 1kg x 6', 'Tata Salt 1kg x 10', 'Marie 250g x 12', 'Parle-G 100g x 36', 'Lifebuoy 125g x 24'][i],
            qty: 12 + i * 3, unit_price: 248 + i * 18,
            line_total: (12 + i * 3) * (248 + i * 18), tax_pct: 18,
          })),
        }) as unknown as T;
      }
      const schById = path.match(/^\/distribution\/schemes\/([^/]+)$/);
      if (schById) return wrap(DIST_SCHEMES.find(s => s.id === schById[1]) || DIST_SCHEMES[0]) as unknown as T;
    }

    if (path === '/crm/leads')      return list(CRM_LEADS) as unknown as T;
    if (path === '/crm/deals')      return list(CRM_DEALS) as unknown as T;
    if (path === '/crm/accounts')   return list(CRM_ACCOUNTS) as unknown as T;
    if (path === '/crm/contacts')   return list(CRM_CONTACTS) as unknown as T;
    if (path === '/crm/activities') return list(CRM_ACTIVITIES) as unknown as T;
    if (path === '/crm/tasks')      return list(CRM_ACTIVITIES.filter(a => a.type === 'task')) as unknown as T;
    if (path === '/crm/pipelines')  return wrap(CRM_PIPELINES) as unknown as T;
    if (path === '/crm/lead-sources')        return list(CRM_SOURCES)      as unknown as T;
    if (path === '/crm/territories')         return list(CRM_TERRITORIES)  as unknown as T;
    if (path === '/crm/products')            return list(CRM_PRODUCTS)     as unknown as T;
    if (path === '/crm/email-templates')     return list([])               as unknown as T;
    if (path === '/crm/whatsapp-templates') {
      const userMade = readDemoWaTemplates();
      return list([...userMade, ...CRM_WA_TEMPLATES_SEED]) as unknown as T;
    }
    if (path === '/crm/automations')         return list([])               as unknown as T;
    if (path === '/crm/assignment-rules')    return list([])               as unknown as T;
    if (path === '/crm/custom-fields')       return list([])               as unknown as T;
    if (path === '/crm/settings')            return wrap({})               as unknown as T;

    {
      const leadById = path.match(/^\/crm\/leads\/([^/]+)$/);
      if (leadById) return wrap(CRM_LEADS.find(l => l.id === leadById[1]) || CRM_LEADS[0]) as unknown as T;
      const dealById = path.match(/^\/crm\/deals\/([^/]+)$/);
      if (dealById) return wrap(CRM_DEALS.find(d => d.id === dealById[1]) || CRM_DEALS[0]) as unknown as T;
      const acctById = path.match(/^\/crm\/accounts\/([^/]+)$/);
      if (acctById) return wrap(CRM_ACCOUNTS.find(a => a.id === acctById[1]) || CRM_ACCOUNTS[0]) as unknown as T;
      const ctcById = path.match(/^\/crm\/contacts\/([^/]+)$/);
      if (ctcById) return wrap(CRM_CONTACTS.find(c => c.id === ctcById[1]) || CRM_CONTACTS[0]) as unknown as T;

      if (/^\/crm\/leads\/[^/]+\/activities$/.test(path))    return list(CRM_ACTIVITIES.slice(0, 4)) as unknown as T;
      if (/^\/crm\/leads\/[^/]+\/deals$/.test(path))         return list(CRM_DEALS.slice(0, 2)) as unknown as T;
      if (/^\/crm\/leads\/[^/]+\/score-history$/.test(path)) return list([]) as unknown as T;
      if (/^\/crm\/deals\/[^/]+\/(activities|history|contacts|notes|line-items)$/.test(path)) return list([]) as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/contacts$/.test(path))   return list(CRM_CONTACTS.slice(0, 3))  as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/deals$/.test(path))      return list(CRM_DEALS.slice(0, 3))     as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/activities$/.test(path)) return list(CRM_ACTIVITIES.slice(0, 3))as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/notes$/.test(path))      return list([])                        as unknown as T;
      if (/^\/crm\/contacts\/[^/]+\/(activities|deals|notes|emails)$/.test(path)) return list([]) as unknown as T;
    }

    if (path === '/crm/analytics/dashboard-complete')      return wrap(CRM_DASHBOARD_COMPLETE) as unknown as T;
    if (path === '/crm/analytics/dashboard-summary')       return wrap(CRM_DASHBOARD_SUMMARY)  as unknown as T;
    if (path === '/crm/analytics/pipeline-value')          return wrap(CRM_PIPELINE_VALUE)     as unknown as T;
    if (path === '/crm/analytics/funnel')                  return wrap(CRM_FUNNEL)             as unknown as T;
    if (path === '/crm/analytics/win-rate')                return wrap(CRM_WIN_RATE)           as unknown as T;
    if (path === '/crm/analytics/sales-cycle')             return wrap(CRM_SALES_CYCLE)        as unknown as T;
    if (path === '/crm/analytics/forecast')                return wrap(CRM_FORECAST)           as unknown as T;
    if (path === '/crm/analytics/activity-heatmap')        return wrap(CRM_HEATMAP)            as unknown as T;
    if (path === '/crm/analytics/lead-source-roi')         return wrap(CRM_LEAD_SOURCE_ROI)    as unknown as T;
    if (path === '/crm/analytics/lead-score-distribution') return wrap(CRM_SCORE_DIST)         as unknown as T;
    if (path === '/crm/analytics/by-state')                return list([])                     as unknown as T;

    if (path === '/crm/analytics/lead-velocity')            return wrap(CRM_LEAD_VELOCITY)          as unknown as T;
    if (path === '/crm/analytics/time-to-first-touch')      return wrap(CRM_TIME_TO_FIRST_TOUCH)    as unknown as T;
    if (path === '/crm/analytics/stuck-leads')              return wrap(CRM_STUCK_LEADS_KPI)        as unknown as T;
    if (path === '/crm/analytics/lost-reasons')             return wrap(CRM_LOST_REASONS)           as unknown as T;
    if (path === '/crm/analytics/won-reasons')              return wrap(CRM_WON_REASONS)            as unknown as T;
    if (path === '/crm/analytics/disqualification-reasons') return wrap(CRM_DISQUAL_REASONS)        as unknown as T;
    if (path === '/crm/analytics/stage-conversion')         return wrap(CRM_STAGE_CONVERSION)       as unknown as T;
    if (path === '/crm/analytics/lead-aging')               return wrap(CRM_LEAD_AGING)             as unknown as T;
    if (path === '/crm/analytics/cohort-conversion')        return wrap(CRM_COHORT_CONVERSION)      as unknown as T;
    if (path === '/crm/analytics/engagement-comparison')    return wrap(CRM_ENGAGEMENT_COMPARISON)  as unknown as T;
    if (path === '/crm/analytics/days-since-touch')         return wrap(CRM_DAYS_SINCE_TOUCH)       as unknown as T;
    if (path === '/crm/analytics/score-band-conversion')    return wrap(CRM_SCORE_BAND_CONVERSION)  as unknown as T;
    if (path === '/crm/analytics/territory-conversion')     return wrap(CRM_TERRITORY_CONVERSION)   as unknown as T;
    if (path === '/crm/analytics/touchpoints-to-response')  return wrap(CRM_TOUCHPOINTS_TO_RESPONSE)as unknown as T;
    if (path === '/crm/analytics/leads-at-risk')            return wrap(CRM_LEADS_AT_RISK)          as unknown as T;

    if (path === '/crm/dashboard-layouts/analytics')        return wrap(CRM_ANALYTICS_LAYOUT)       as unknown as T;
    if (path === '/crm/dashboard-layouts/overview')         return wrap(CRM_OVERVIEW_LAYOUT)        as unknown as T;
    if (path === '/crm/dashboard-layouts/ffm')              return wrap(null)                       as unknown as T;

    // ── FFM (Field Force Management) analytics — 16 widgets ─────────────
    if (path.startsWith('/analytics/ffm/')) {
      const FES = [
        { id: 'fe-1', name: 'Arjun Sharma' },
        { id: 'fe-2', name: 'Priya Patel' },
        { id: 'fe-3', name: 'Rahul Verma' },
        { id: 'fe-4', name: 'Anjali Singh' },
        { id: 'fe-5', name: 'Vikram Reddy' },
        { id: 'fe-6', name: 'Suresh Kumar' },
        { id: 'fe-7', name: 'Kavita Rao' },
        { id: 'fe-8', name: 'Manish Iyer' },
      ];
      const sub = path.slice('/analytics/ffm/'.length);
      switch (sub) {
        case 'beat-adherence':
          return wrap(FES.map((fe, i) => {
            const planned = 12 + (i % 5);
            const visited = Math.max(0, planned - (i % 4));
            return { fe_id: fe.id, fe_name: fe.name, planned, visited, adherence_pct: Math.round((visited / planned) * 1000) / 10 };
          })) as unknown as T;
        case 'outlet-coverage':
          return wrap(FES.map((fe, i) => {
            const universe = 80 + i * 6;
            const visited_mtd = Math.round(universe * (0.62 + (i % 4) * 0.07));
            return { fe_id: fe.id, fe_name: fe.name, universe, visited_mtd, coverage_pct: Math.round((visited_mtd / universe) * 1000) / 10 };
          })) as unknown as T;
        case 'frequency-compliance':
          return wrap([
            { outlet_type: 'Kirana',       due_visits: 240, on_time: 198, compliance_pct: 82.5 },
            { outlet_type: 'Modern Trade', due_visits: 84,  on_time: 76,  compliance_pct: 90.5 },
            { outlet_type: 'Pharmacy',     due_visits: 56,  on_time: 48,  compliance_pct: 85.7 },
            { outlet_type: 'Cosmetics',    due_visits: 42,  on_time: 31,  compliance_pct: 73.8 },
            { outlet_type: 'Wholesale',    due_visits: 28,  on_time: 26,  compliance_pct: 92.9 },
          ]) as unknown as T;
        case 'productive-calls':
          return wrap(FES.map((fe, i) => {
            const visits = 35 + i * 4;
            const productive = Math.round(visits * (0.55 + (i % 5) * 0.06));
            return { fe_id: fe.id, fe_name: fe.name, visits, productive, productive_pct: Math.round((productive / visits) * 1000) / 10 };
          })) as unknown as T;
        case 'order-strike-rate':
          return wrap(FES.map((fe, i) => {
            const visits = 38 + i * 3;
            const orders = Math.round(visits * (0.42 + (i % 6) * 0.05));
            return { fe_id: fe.id, fe_name: fe.name, visits, orders, strike_pct: Math.round((orders / visits) * 1000) / 10 };
          })) as unknown as T;
        case 'aov':
          return wrap(Array.from({ length: 8 }, (_, i) => ({
            week: `W${i + 1}`,
            aov_inr: 4200 + i * 280 + (i % 3) * 150,
            orders:  120 + i * 14,
          }))) as unknown as T;
        case 'new-outlets':
          return wrap(FES.map((fe, i) => ({ fe_id: fe.id, fe_name: fe.name, new_outlet_count: 2 + ((i * 3) % 11) }))) as unknown as T;
        case 'visit-duration':
          return wrap([
            { bucket: '<2 min (drive-by)', visit_count: 42 },
            { bucket: '2-5 min',           visit_count: 128 },
            { bucket: '5-20 min',          visit_count: 312 },
            { bucket: '20-30 min',         visit_count: 96 },
            { bucket: '30 min+',           visit_count: 48 },
          ]) as unknown as T;
        case 'idle-heatmap': {
          const rows: Array<{ fe_name: string; hour: number; idle_min: number }> = [];
          for (const fe of FES.slice(0, 5)) {
            for (let h = 9; h <= 18; h++) {
              rows.push({ fe_name: fe.name, hour: h, idle_min: Math.max(0, (h * 7 + fe.name.length) % 45) });
            }
          }
          return wrap(rows) as unknown as T;
        }
        case 'distance-travelled':
          return wrap(Array.from({ length: 14 }, (_, i) => {
            const km = 38 + (i % 5) * 11 + (i % 3) * 4;
            return {
              day: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
              km_total: km,
              co2_kg: +(km * 0.072).toFixed(2),
            };
          })) as unknown as T;
        case 'off-route':
          return wrap([
            { outlet_name: 'Shree Krishna Stores', fe_name: 'Arjun Sharma', distance_km: 4.2, planned_beat: 'Andheri-W-Beat-3',  visited_at: new Date(Date.now() - 2 * 86400000).toISOString() },
            { outlet_name: 'Bansal Provision',     fe_name: 'Priya Patel',  distance_km: 7.8, planned_beat: 'Borivali-Beat-1',    visited_at: new Date(Date.now() - 3 * 86400000).toISOString() },
            { outlet_name: 'Saraswati Kirana',     fe_name: 'Rahul Verma',  distance_km: 3.1, planned_beat: 'Koramangala-Beat-2', visited_at: new Date(Date.now() - 1 * 86400000).toISOString() },
            { outlet_name: 'MK Modern Grocers',    fe_name: 'Anjali Singh', distance_km: 6.4, planned_beat: 'HSR-Beat-1',         visited_at: new Date(Date.now() - 4 * 86400000).toISOString() },
            { outlet_name: 'Annapurna Foods',      fe_name: 'Vikram Reddy', distance_km: 5.5, planned_beat: 'Jubilee-Beat-2',     visited_at: new Date(Date.now() - 5 * 86400000).toISOString() },
          ]) as unknown as T;
        case 'attendance-punctuality':
          return wrap(FES.map((fe, i) => ({
            fe_id: fe.id, fe_name: fe.name,
            on_time: 18 - (i % 4),
            late:    (i % 5),
            absent:  (i % 3),
          }))) as unknown as T;
        case 'stuck-fes':
          return wrap([
            { fe_id: 'fe-7', fe_name: 'Kavita Rao',  days_since_last_activity: 8,  last_visit_at: new Date(Date.now() -  8 * 86400000).toISOString() },
            { fe_id: 'fe-3', fe_name: 'Rahul Verma', days_since_last_activity: 4,  last_visit_at: new Date(Date.now() -  4 * 86400000).toISOString() },
            { fe_id: 'fe-8', fe_name: 'Manish Iyer', days_since_last_activity: 11, last_visit_at: new Date(Date.now() - 11 * 86400000).toISOString() },
          ]) as unknown as T;
        case 'security-violations':
          return wrap(FES.map((fe, i) => {
            const mock_location = (i % 5 === 0) ? 1 : 0;
            const vpn_detected  = (i % 7 === 0) ? 1 : 0;
            return { fe_id: fe.id, fe_name: fe.name, mock_location, vpn_detected, violation_count: mock_location + vpn_detected };
          })) as unknown as T;
        case 'form-completion':
          return wrap(FES.map((fe, i) => {
            const required = 24 + (i % 6) * 3;
            const submitted = Math.max(0, required - (i % 5) - 1);
            return { fe_id: fe.id, fe_name: fe.name, required, submitted, completion_pct: Math.round((submitted / required) * 1000) / 10 };
          })) as unknown as T;
        case 'top-performers':
          return wrap(FES.map((fe, i) => ({
            fe_id: fe.id, fe_name: fe.name,
            revenue_inr:      580000 - i * 42000,
            orders:           138 - i * 8,
            outlets_covered:   62 - i * 3,
          })).sort((a, b) => b.revenue_inr - a.revenue_inr)) as unknown as T;
      }
    }

    if (path === '/misc/clients') {
      return list([
        { id: 'demo-client-1', name: 'Acme Corp',         is_active: true },
        { id: 'demo-client-2', name: 'Globex Industries', is_active: true },
        { id: 'demo-client-3', name: 'Wayne Enterprises', is_active: true },
      ]) as unknown as T;
    }
    if (path === '/misc/security/alerts/all') return wrap({ data: SECURITY_ALERTS, totalCount: SECURITY_ALERTS.length }) as unknown as T;
    if (path === '/notifications/history')    return list([]) as unknown as T;
    if (path === '/candidates' || path.startsWith('/candidates?')) {
      return list(HR_CANDIDATES) as unknown as T;
    }
    if (/^\/candidates\/[^/]+\/documents$/.test(path)) return list([]) as unknown as T;
    if (path === '/forms/submissions' || path === '/builder/forms/admin/submissions') {
      return wrap({ data: [], total: 0 }) as unknown as T;
    }
    if (path === '/broadcast/admin') return mockBroadcastAdmin() as unknown as T;
    if (path === '/route-plans/summary')     return wrap(ROUTE_PLAN_SUMMARY) as unknown as T;
    if (path === '/route-plans/esg-summary') return wrap(ROUTE_PLAN_ESG) as unknown as T;
    {
      const planById = path.match(/^\/route-plans\/([^/]+)$/);
      if (planById && !['summary', 'esg-summary'].includes(planById[1])) {
        return wrap(ROUTE_PLANS.find(p => p.id === planById[1]) || ROUTE_PLANS[0]) as unknown as T;
      }
    }

    if (path === '/hr/dashboard' || path === '/hr/summary') {
      const by_stage: Record<string, number> = {};
      for (const c of HR_CANDIDATES) by_stage[c.stage] = (by_stage[c.stage] || 0) + 1;
      return wrap({ pipeline: HR_CANDIDATES, by_stage, total: HR_CANDIDATES.length }) as unknown as T;
    }

    if (path === '/settings' || path === '/settings/org') return wrap({}) as unknown as T;
    if (path === '/roles') {
      // rolesApi.list expects a RAW OrgRole[] (typed as Wrapped<T> = T) —
      // returning the {success,data:[]} envelope would make roles.map crash
      // on the CRM Settings page where the result is used directly.
      const now = new Date().toISOString();
      return ([
        { id: 'demo-role-1', org_id: 'demo-org-999', client_id: null, name: 'Super Admin',     description: 'Full access to every module + settings.',                parent_id: null,            position: 0, color: '#E0282C', permissions: ['*'], permissions_write: ['*'], assigned_cities: [], created_at: now, updated_at: now, user_count: 1 },
        { id: 'demo-role-2', org_id: 'demo-org-999', client_id: null, name: 'Sales Director',  description: 'Owns the entire sales org — pipelines, forecasts, team.', parent_id: 'demo-role-1',   position: 1, color: '#3B82F6', permissions: ['crm.*', 'analytics.*'], permissions_write: ['crm.*'], assigned_cities: [], created_at: now, updated_at: now, user_count: 2 },
        { id: 'demo-role-3', org_id: 'demo-org-999', client_id: null, name: 'Regional Manager', description: 'Owns a region — supervises area managers and FEs.',       parent_id: 'demo-role-2',   position: 2, color: '#8B5CF6', permissions: ['crm.read', 'crm.leads.write', 'crm.deals.write'], permissions_write: ['crm.leads.write'], assigned_cities: ['Mumbai', 'Pune'], created_at: now, updated_at: now, user_count: 4 },
        { id: 'demo-role-4', org_id: 'demo-org-999', client_id: null, name: 'Area Manager',     description: 'Owns a beat / cluster — supervises 5-10 FEs.',           parent_id: 'demo-role-3',   position: 3, color: '#F59E0B', permissions: ['crm.read', 'crm.leads.write'],                       permissions_write: [],                       assigned_cities: ['Bengaluru'], created_at: now, updated_at: now, user_count: 6 },
        { id: 'demo-role-5', org_id: 'demo-org-999', client_id: null, name: 'Field Executive', description: 'On-ground rep — captures orders, runs visit plans.',     parent_id: 'demo-role-4',   position: 4, color: '#10B981', permissions: ['crm.read', 'crm.leads.create', 'crm.activities.create'], permissions_write: [],          assigned_cities: ['Delhi', 'Chennai'], created_at: now, updated_at: now, user_count: 24 },
        { id: 'demo-role-6', org_id: 'demo-org-999', client_id: null, name: 'Inside Sales',    description: 'Phone / WhatsApp inbound + outbound. No field visits.',  parent_id: 'demo-role-2',   position: 5, color: '#14B8A6', permissions: ['crm.leads.read', 'crm.leads.write', 'crm.contacts.write'], permissions_write: ['crm.leads.write'], assigned_cities: [], created_at: now, updated_at: now, user_count: 3 },
        { id: 'demo-role-7', org_id: 'demo-org-999', client_id: null, name: 'Read-only Auditor', description: 'View-only across CRM + ops. Used for compliance / partners.', parent_id: 'demo-role-1', position: 6, color: '#94A3B8', permissions: ['*.read'], permissions_write: [],                          assigned_cities: [], created_at: now, updated_at: now, user_count: 1 },
      ]) as unknown as T;
    }
    if (path === '/modules') return list([]) as unknown as T;

    if (path === '/audit-log') {
      const sample = (() => {
        const reps = [
          { id: 'fe1', name: 'Arjun Sharma', email: 'arjun@kinematic.demo', role: 'executive' },
          { id: 'fe2', name: 'Priya Patel',  email: 'priya@kinematic.demo', role: 'executive' },
          { id: 'fe3', name: 'Rahul Verma',  email: 'rahul@kinematic.demo', role: 'supervisor' },
          { id: 'demo-user-id', name: 'Demo Admin', email: 'demo@kinematic.com', role: 'super_admin' },
        ];
        const clients = [
          { id: 'cl1', name: 'Hindustan Unilever' },
          { id: 'cl2', name: 'ITC Limited' },
          { id: null,  name: null },
        ];
        const actions = [
          { action: 'leads.create',        entity: 'leads',      method: 'POST',   status: 201 },
          { action: 'leads.update',        entity: 'leads',      method: 'PATCH',  status: 200 },
          { action: 'deals.move-stage',    entity: 'deals',      method: 'POST',   status: 200 },
          { action: 'deals.win',           entity: 'deals',      method: 'POST',   status: 200 },
          { action: 'orders.create',       entity: 'orders',     method: 'POST',   status: 201 },
          { action: 'orders.approve',      entity: 'orders',     method: 'POST',   status: 200 },
          { action: 'invoices.create',     entity: 'invoices',   method: 'POST',   status: 201 },
          { action: 'payments.create',     entity: 'payments',   method: 'POST',   status: 201 },
          { action: 'attendance.checkin',  entity: 'attendance', method: 'POST',   status: 201 },
          { action: 'attendance.checkout', entity: 'attendance', method: 'PATCH',  status: 200 },
          { action: 'planograms.update',   entity: 'planograms', method: 'PATCH',  status: 200 },
          { action: 'users.create',        entity: 'users',      method: 'POST',   status: 201 },
          { action: 'broadcast.send',      entity: 'broadcast',  method: 'POST',   status: 201 },
          { action: 'visit-logs.create',   entity: 'visit-logs', method: 'POST',   status: 201 },
          { action: 'leads.delete',        entity: 'leads',      method: 'DELETE', status: 204 },
        ];
        const rows = Array.from({ length: 60 }, (_, i) => {
          const a = actions[i % actions.length];
          const u = reps[i % reps.length];
          const c = clients[i % clients.length];
          const ts = new Date(Date.now() - i * 1000 * 60 * (3 + (i % 10))).toISOString();
          return {
            id: 'demo-audit-' + i, created_at: ts,
            action: a.action, entity_table: a.entity,
            entity_id: i % 4 === 0 ? null : 'demo-' + a.entity + '-' + (i + 1),
            actor: u, client: c.id ? c : null,
            ip_address: '203.0.113.' + (10 + (i % 200)),
            metadata: { method: a.method, path: `/api/v1/${a.entity.replace('-', '/')}${i % 4 === 0 ? '' : '/demo-' + a.entity + '-' + (i + 1)}`, status: a.status },
            payload: null,
          };
        });
        return { rows, limit: 100, offset: 0, has_more: false };
      })();
      return wrap(sample) as unknown as T;
    }

    if (path === '/planograms/captures')                 return list(PLAN_CAPTURES) as unknown as T;
    if (path === '/planograms/analytics/trend')          return list(PLAN_TREND) as unknown as T;
    if (path === '/planograms/analytics/store-ranking')  return list(PLAN_STORE_RANKING) as unknown as T;
    if (path === '/planograms/analytics/chronic-gaps')   return list(PLAN_CHRONIC_GAPS) as unknown as T;
    if (path === '/planograms/analytics/sku-visibility') return list(PLAN_SKU_VISIBILITY) as unknown as T;
    if (path === '/planograms/analytics/risk-forecast')  return list(PLAN_RISK_FORECAST) as unknown as T;
    if (path === '/planograms')                          return list(PLANOGRAMS) as unknown as T;
    {
      const capDetail = path.match(/^\/planograms\/captures\/([^/]+)$/);
      if (capDetail) {
        const cap = PLAN_CAPTURES.find(c => c.id === capDetail[1]) || PLAN_CAPTURES[0];
        return wrap({
          capture: cap,
          recognition: planRecognitionFor(cap.id),
          compliance: planComplianceFor(cap.id, cap.planogram_id, cap.score),
        }) as unknown as T;
      }
      const pgAssign = path.match(/^\/planograms\/([^/]+)\/assignments$/);
      if (pgAssign) return list(PLAN_ASSIGNMENTS.filter(a => a.planogram_id === pgAssign[1])) as unknown as T;
      const pgDetail = path.match(/^\/planograms\/([^/]+)$/);
      if (pgDetail) return wrap(PLANOGRAMS.find(p => p.id === pgDetail[1]) || PLANOGRAMS[0]) as unknown as T;
    }
  }

  if (m === 'POST' || m === 'PATCH' || m === 'PUT') {
    if (m === 'POST' && path === '/distribution/gstin/verify') {
      const gstin = String((bodyObj as { gstin?: string }).gstin || '').toUpperCase();
      if (gstin.length !== 15) return wrap({ valid: false, reason: 'format', source: 'demo' }) as unknown as T;
      const state_code = gstin.slice(0, 2);
      const pan = gstin.slice(2, 12);
      const state = DIST_GSTIN_STATES.find(s => s.code === state_code);
      return wrap({
        valid: !!state, reason: state ? null : 'unknown_state',
        state_code, pan,
        legal_name: 'Demo Distributor Pvt Ltd',
        business_name: 'Demo Distributor', trade_name: 'Demo Distributor',
        status: 'Active', source: 'demo',
      }) as unknown as T;
    }
    if (m === 'POST' && path === '/route-plans/optimize') {
      const outlets = ((bodyObj as { outlets?: Array<{ id: string }> }).outlets) ?? [];
      const original_km  = +(outlets.length * 5.2).toFixed(1);
      const optimized_km = +(outlets.length * 3.4).toFixed(1);
      const factor = 0.072;
      return wrap({
        ordered: outlets.map(o => o.id),
        original_km, optimized_km,
        saved_km: +(original_km - optimized_km).toFixed(1),
        saved_co2_kg: +((original_km - optimized_km) * factor).toFixed(2),
        method: 'nearest_neighbour_2opt_haversine',
      }) as unknown as T;
    }
    if (m === 'PUT' && path === '/crm/dashboard-layouts/analytics') {
      return wrap((bodyObj as object) ?? CRM_ANALYTICS_LAYOUT) as unknown as T;
    }
    if (m === 'PUT' && path === '/crm/dashboard-layouts/overview') {
      return wrap((bodyObj as object) ?? CRM_OVERVIEW_LAYOUT) as unknown as T;
    }
    if (m === 'PUT' && path === '/crm/dashboard-layouts/ffm') {
      return wrap((bodyObj as object) ?? { widgets: [], layouts: { lg: [], md: [], sm: [] } }) as unknown as T;
    }
    if (m === 'POST' && path === '/crm/dashboard-layouts/overview/pin') {
      const w = bodyObj as { id?: string; widget_type?: string; chart_type?: string };
      if (w?.id && w?.widget_type) {
        const next = {
          widgets: [...CRM_OVERVIEW_LAYOUT.widgets, w],
          layouts: {
            lg: [...CRM_OVERVIEW_LAYOUT.layouts.lg, { i: w.id, x: 0, y: 8,  w: 6, h: 4 }],
            md: [...CRM_OVERVIEW_LAYOUT.layouts.md, { i: w.id, x: 0, y: 8,  w: 4, h: 4 }],
            sm: [...CRM_OVERVIEW_LAYOUT.layouts.sm, { i: w.id, x: 0, y: 16, w: 2, h: 4 }],
          },
        };
        return wrap(next) as unknown as T;
      }
      return wrap(CRM_OVERVIEW_LAYOUT) as unknown as T;
    }
    {
      const wonM = path.match(/^\/crm\/leads\/([^/]+)\/won$/);
      if (m === 'POST' && wonM) {
        const base = CRM_LEADS[0];
        return wrap({
          ...base, id: wonM[1], status: 'converted',
          won_reason: (bodyObj as { reason?: string }).reason ?? null,
          won_at: new Date().toISOString(),
        }) as unknown as T;
      }
      const reopenM = path.match(/^\/crm\/leads\/([^/]+)\/reopen$/);
      if (m === 'POST' && reopenM) {
        const base = CRM_LEADS[0];
        return wrap({ ...base, id: reopenM[1], status: 'working', is_converted: false }) as unknown as T;
      }
    }
    if (m === 'POST' && path === '/crm/whatsapp-templates') {
      const row = {
        id: 'demo-wa-tpl-' + Math.random().toString(36).slice(2, 8),
        org_id: 'demo-org-999',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending',
        ...bodyObj,
      };
      pushDemoWaTemplate(row);
      return wrap(row) as unknown as T;
    }
    if (m === 'PATCH' && path.startsWith('/crm/whatsapp-templates/')) {
      const id = path.split('/').pop() || '';
      const list = readDemoWaTemplates();
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...bodyObj, updated_at: new Date().toISOString() };
        writeDemoWaTemplates(list);
        return wrap(list[idx]) as unknown as T;
      }
      const seed = CRM_WA_TEMPLATES_SEED.find((r) => r.id === id);
      if (seed) {
        const merged = { ...seed, ...bodyObj, updated_at: new Date().toISOString() };
        pushDemoWaTemplate(merged);
        return wrap(merged) as unknown as T;
      }
    }
    return wrap({ id: 'demo-noop-' + Math.random().toString(36).slice(2, 8), ok: true, demo: true }) as unknown as T;
  }
  if (m === 'DELETE') {
    {
      const layoutDelM = path.match(/^\/crm\/dashboard-layouts\/(analytics|overview)\/widgets\/([^/]+)$/);
      if (layoutDelM) {
        const src = layoutDelM[1] === 'overview' ? CRM_OVERVIEW_LAYOUT : CRM_ANALYTICS_LAYOUT;
        const wid = layoutDelM[2];
        return wrap({
          widgets: src.widgets.filter(w => w.id !== wid),
          layouts: {
            lg: src.layouts.lg.filter(it => it.i !== wid),
            md: src.layouts.md.filter(it => it.i !== wid),
            sm: src.layouts.sm.filter(it => it.i !== wid),
          },
        }) as unknown as T;
      }
    }
    if (path.startsWith('/crm/whatsapp-templates/')) {
      const id = path.split('/').pop() || '';
      const list = readDemoWaTemplates().filter((r) => r.id !== id);
      writeDemoWaTemplates(list);
    }
    return wrap({ ok: true, demo: true }) as unknown as T;
  }

  if (m === 'GET' && rawPath.startsWith('/api/v1/')) {
    return list([]) as unknown as T;
  }

  return undefined;
}
