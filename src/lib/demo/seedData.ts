// CRM mocks + planogram seed data + hiring candidates.
// Consumed by demoMocks.ts matcher and exposed for any consumer that
// wants the raw seed data.

export const REPS = ['Arjun Sharma', 'Priya Patel', 'Rahul Verma', 'Sneha Rao', 'Amit Singh'];
export const _now = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString();

export const CRM_LEADS = [
  { id: 'demo-lead-1',  first_name: 'Vikram',   last_name: 'Reddy',  company: 'Skyline Developers',     email: 'vikram@skyline.demo',   phone: '+91 98201 11111', status: 'qualified',   score: 88, score_grade: 'A', city: 'Bengaluru', industry: 'Real Estate',    owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-1),  created_at: _now(-14) },
  { id: 'demo-lead-2',  first_name: 'Anjali',   last_name: 'Iyer',   company: 'Zenith Properties',      email: 'anjali@zenith.demo',    phone: '+91 98202 22222', status: 'working',     score: 76, score_grade: 'A', city: 'Mumbai',    industry: 'Construction',   owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-2),  created_at: _now(-21) },
  { id: 'demo-lead-3',  first_name: 'Rohan',    last_name: 'Kumar',  company: 'Acme Steel',             email: 'rohan@acme.demo',       phone: '+91 98203 33333', status: 'new',         score: 64, score_grade: 'B', city: 'Pune',      industry: 'Steel',          owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-4),  created_at: _now(-7)  },
  { id: 'demo-lead-4',  first_name: 'Neha',     last_name: 'Gupta',  company: 'Vega Infra',             email: 'neha@vegainfra.demo',   phone: '+91 98204 44444', status: 'qualified',   score: 92, score_grade: 'A', city: 'Hyderabad', industry: 'Infrastructure', owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-1),  created_at: _now(-30) },
  { id: 'demo-lead-5',  first_name: 'Karthik',  last_name: 'Pillai', company: 'Trident Power',          email: 'karthik@trident.demo',  phone: '+91 98205 55555', status: 'working',     score: 55, score_grade: 'B', city: 'Chennai',   industry: 'Energy',         owner_id: 'demo-user-id', owner_name: REPS[3], last_activity_at: _now(-5),  created_at: _now(-18) },
  { id: 'demo-lead-6',  first_name: 'Pooja',    last_name: 'Joshi',  company: 'Lakshmi Builders',       email: 'pooja@lakshmi.demo',    phone: '+91 98206 66666', status: 'unqualified', score: 22, score_grade: 'D', city: 'Jaipur',    industry: 'Real Estate',    owner_id: 'demo-user-id', owner_name: REPS[4], last_activity_at: _now(-9),  created_at: _now(-35) },
  { id: 'demo-lead-7',  first_name: 'Manish',   last_name: 'Khanna', company: 'Konkan Steel',           email: 'manish@konkan.demo',    phone: '+91 98207 77777', status: 'qualified',   score: 81, score_grade: 'A', city: 'Mumbai',    industry: 'Steel',          owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-3),  created_at: _now(-25) },
  { id: 'demo-lead-8',  first_name: 'Ishaan',   last_name: 'Bose',   company: 'Falcon Engineering',     email: 'ishaan@falcon.demo',    phone: '+91 98208 88888', status: 'nurturing',   score: 48, score_grade: 'C', city: 'Kolkata',   industry: 'Manufacturing',  owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-12), created_at: _now(-42) },
  { id: 'demo-lead-9',  first_name: 'Tanvi',    last_name: 'Mehta',  company: 'Pragati Industries',     email: 'tanvi@pragati.demo',    phone: '+91 98209 99999', status: 'new',         score: 70, score_grade: 'B', city: 'Ahmedabad', industry: 'Manufacturing',  owner_id: 'demo-user-id', owner_name: REPS[3], last_activity_at: _now(-1),  created_at: _now(-5)  },
  { id: 'demo-lead-10', first_name: 'Karan',    last_name: 'Verma',  company: 'Suryadev Cement',        email: 'karan@suryadev.demo',   phone: '+91 98210 10101', status: 'working',     score: 84, score_grade: 'A', city: 'Surat',     industry: 'Cement',         owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-2),  created_at: _now(-11) },
  { id: 'demo-lead-11', first_name: 'Aditya',   last_name: 'Nair',   company: 'Helios Constructions',   email: 'aditya@helios.demo',    phone: '+91 98211 12121', status: 'qualified',   score: 78, score_grade: 'A', city: 'Delhi',     industry: 'Construction',   owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-1),  created_at: _now(-28) },
  { id: 'demo-lead-12', first_name: 'Diya',     last_name: 'Kapoor', company: 'Coromandel Logistics',   email: 'diya@coromandel.demo',  phone: '+91 98212 13131', status: 'new',         score: 36, score_grade: 'C', city: 'Chennai',   industry: 'Logistics',      owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-6),  created_at: _now(-9)  }
];

export const CRM_STAGES = [
  { id: 'demo-stg-1', pipeline_id: 'demo-pipe', name: 'Discovery',     position: 0, probability: 10,  stage_type: 'open', color: '#94a3b8' },
  { id: 'demo-stg-2', pipeline_id: 'demo-pipe', name: 'Qualification', position: 1, probability: 25,  stage_type: 'open', color: '#60a5fa' },
  { id: 'demo-stg-3', pipeline_id: 'demo-pipe', name: 'Proposal',      position: 2, probability: 50,  stage_type: 'open', color: '#a78bfa' },
  { id: 'demo-stg-4', pipeline_id: 'demo-pipe', name: 'Negotiation',   position: 3, probability: 75,  stage_type: 'open', color: '#fbbf24' },
  { id: 'demo-stg-5', pipeline_id: 'demo-pipe', name: 'Closed Won',    position: 4, probability: 100, stage_type: 'won',  color: '#22c55e' },
  { id: 'demo-stg-6', pipeline_id: 'demo-pipe', name: 'Closed Lost',   position: 5, probability: 0,   stage_type: 'lost', color: '#ef4444' }
];

export const CRM_PIPELINES = [{ id: 'demo-pipe', name: 'Sales', is_default: true, stages: CRM_STAGES }];

export const CRM_ACCOUNTS = [
  { id: 'demo-acct-1', name: 'Skyline Developers',   domain: 'skyline.demo',    industry: 'Real Estate',    annual_revenue: 1850000000, owner_id: 'demo-user-id', owner_name: REPS[0], created_at: _now(-60) },
  { id: 'demo-acct-2', name: 'Zenith Properties',    domain: 'zenith.demo',     industry: 'Construction',   annual_revenue: 2100000000, owner_id: 'demo-user-id', owner_name: REPS[1], created_at: _now(-90) },
  { id: 'demo-acct-3', name: 'Acme Steel',           domain: 'acme.demo',       industry: 'Steel',          annual_revenue: 980000000,  owner_id: 'demo-user-id', owner_name: REPS[2], created_at: _now(-45) },
  { id: 'demo-acct-4', name: 'Vega Infra',           domain: 'vegainfra.demo',  industry: 'Infrastructure', annual_revenue: 3200000000, owner_id: 'demo-user-id', owner_name: REPS[0], created_at: _now(-120) },
  { id: 'demo-acct-5', name: 'Trident Power',        domain: 'trident.demo',    industry: 'Energy',         annual_revenue: 1450000000, owner_id: 'demo-user-id', owner_name: REPS[3], created_at: _now(-75) },
  { id: 'demo-acct-6', name: 'Suryadev Cement',      domain: 'suryadev.demo',   industry: 'Cement',         annual_revenue: 870000000,  owner_id: 'demo-user-id', owner_name: REPS[4], created_at: _now(-30) },
  { id: 'demo-acct-7', name: 'Helios Constructions', domain: 'helios.demo',     industry: 'Construction',   annual_revenue: 1200000000, owner_id: 'demo-user-id', owner_name: REPS[1], created_at: _now(-150) },
  { id: 'demo-acct-8', name: 'Konkan Steel',         domain: 'konkan.demo',     industry: 'Steel',          annual_revenue: 760000000,  owner_id: 'demo-user-id', owner_name: REPS[2], created_at: _now(-100) }
];

export const CRM_CONTACTS = [
  { id: 'demo-ctc-1', first_name: 'Vikram',  last_name: 'Reddy',  email: 'vikram@skyline.demo',  phone: '+91 98201 11111', title: 'VP Procurement',      account_id: 'demo-acct-1', account_name: 'Skyline Developers',    owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-2', first_name: 'Anjali',  last_name: 'Iyer',   email: 'anjali@zenith.demo',   phone: '+91 98202 22222', title: 'Director Materials',  account_id: 'demo-acct-2', account_name: 'Zenith Properties',     owner_id: 'demo-user-id', owner_name: REPS[1] },
  { id: 'demo-ctc-3', first_name: 'Rohan',   last_name: 'Kumar',  email: 'rohan@acme.demo',      phone: '+91 98203 33333', title: 'GM Operations',       account_id: 'demo-acct-3', account_name: 'Acme Steel',            owner_id: 'demo-user-id', owner_name: REPS[2] },
  { id: 'demo-ctc-4', first_name: 'Neha',    last_name: 'Gupta',  email: 'neha@vegainfra.demo',  phone: '+91 98204 44444', title: 'Head of Procurement', account_id: 'demo-acct-4', account_name: 'Vega Infra',            owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-5', first_name: 'Karthik', last_name: 'Pillai', email: 'karthik@trident.demo', phone: '+91 98205 55555', title: 'Project Manager',     account_id: 'demo-acct-5', account_name: 'Trident Power',         owner_id: 'demo-user-id', owner_name: REPS[3] },
  { id: 'demo-ctc-6', first_name: 'Karan',   last_name: 'Verma',  email: 'karan@suryadev.demo',  phone: '+91 98210 10101', title: 'Founder',             account_id: 'demo-acct-6', account_name: 'Suryadev Cement',       owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-7', first_name: 'Aditya',  last_name: 'Nair',   email: 'aditya@helios.demo',   phone: '+91 98211 12121', title: 'Site Engineer',       account_id: 'demo-acct-7', account_name: 'Helios Constructions',  owner_id: 'demo-user-id', owner_name: REPS[1] },
  { id: 'demo-ctc-8', first_name: 'Manish',  last_name: 'Khanna', email: 'manish@konkan.demo',   phone: '+91 98207 77777', title: 'VP Sales',            account_id: 'demo-acct-8', account_name: 'Konkan Steel',          owner_id: 'demo-user-id', owner_name: REPS[2] }
];

export const CRM_DEALS = [
  { id: 'demo-deal-1',  name: 'Skyline Mumbai Tower - Steel',   account_id: 'demo-acct-1', account_name: 'Skyline Developers',    pipeline_id: 'demo-pipe', stage_id: 'demo-stg-3', stage_name: 'Proposal',      stage_type: 'open', status: 'open', amount: 7250000,  currency: 'INR', probability: 50,  win_probability_ai: 62,  owner_id: 'demo-user-id', owner_name: REPS[0], expected_close_date: _now(12).slice(0, 10), created_at: _now(-30) },
  { id: 'demo-deal-2',  name: 'Zenith Pune Hi-Rise - Cement',   account_id: 'demo-acct-2', account_name: 'Zenith Properties',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-4', stage_name: 'Negotiation',   stage_type: 'open', status: 'open', amount: 12400000, currency: 'INR', probability: 75,  win_probability_ai: 78,  owner_id: 'demo-user-id', owner_name: REPS[1], expected_close_date: _now(6).slice(0, 10),  created_at: _now(-45) },
  { id: 'demo-deal-3',  name: 'Acme TMT Bars - Q3 Restock',     account_id: 'demo-acct-3', account_name: 'Acme Steel',            pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Qualification', stage_type: 'open', status: 'open', amount: 3800000,  currency: 'INR', probability: 25,  win_probability_ai: 35,  owner_id: 'demo-user-id', owner_name: REPS[2], expected_close_date: _now(28).slice(0, 10), created_at: _now(-14) },
  { id: 'demo-deal-4',  name: 'Vega Highway Project - Steel',   account_id: 'demo-acct-4', account_name: 'Vega Infra',            pipeline_id: 'demo-pipe', stage_id: 'demo-stg-3', stage_name: 'Proposal',      stage_type: 'open', status: 'open', amount: 18500000, currency: 'INR', probability: 50,  win_probability_ai: 71,  owner_id: 'demo-user-id', owner_name: REPS[0], expected_close_date: _now(18).slice(0, 10), created_at: _now(-50) },
  { id: 'demo-deal-5',  name: 'Trident Substation - GI Wire',   account_id: 'demo-acct-5', account_name: 'Trident Power',         pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'Discovery',     stage_type: 'open', status: 'open', amount: 2150000,  currency: 'INR', probability: 10,  win_probability_ai: 22,  owner_id: 'demo-user-id', owner_name: REPS[3], expected_close_date: _now(35).slice(0, 10), created_at: _now(-8)  },
  { id: 'demo-deal-6',  name: 'Suryadev OPC Cement - Annual',   account_id: 'demo-acct-6', account_name: 'Suryadev Cement',       pipeline_id: 'demo-pipe', stage_id: 'demo-stg-4', stage_name: 'Negotiation',   stage_type: 'open', status: 'open', amount: 9800000,  currency: 'INR', probability: 75,  win_probability_ai: 80,  owner_id: 'demo-user-id', owner_name: REPS[4], expected_close_date: _now(4).slice(0, 10),  created_at: _now(-22) },
  { id: 'demo-deal-7',  name: 'Helios Mumbai Phase 2',          account_id: 'demo-acct-7', account_name: 'Helios Constructions',  pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Qualification', stage_type: 'open', status: 'open', amount: 5400000,  currency: 'INR', probability: 25,  win_probability_ai: 40,  owner_id: 'demo-user-id', owner_name: REPS[1], expected_close_date: _now(22).slice(0, 10), created_at: _now(-10) },
  { id: 'demo-deal-8',  name: 'Konkan TMT 16mm Pilot',          account_id: 'demo-acct-8', account_name: 'Konkan Steel',          pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'Discovery',     stage_type: 'open', status: 'open', amount: 1750000,  currency: 'INR', probability: 10,  win_probability_ai: 18,  owner_id: 'demo-user-id', owner_name: REPS[2], expected_close_date: _now(40).slice(0, 10), created_at: _now(-5)  },
  { id: 'demo-deal-9',  name: 'Skyline - Bengaluru Tower',      account_id: 'demo-acct-1', account_name: 'Skyline Developers',    pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 14200000, currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[0], actual_close_date: _now(-3).slice(0, 10),  created_at: _now(-65) },
  { id: 'demo-deal-10', name: 'Vega Highway Phase 1 - Cement',  account_id: 'demo-acct-4', account_name: 'Vega Infra',            pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 22600000, currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[0], actual_close_date: _now(-12).slice(0, 10), created_at: _now(-80) },
  { id: 'demo-deal-11', name: 'Suryadev Demo Pilot',            account_id: 'demo-acct-6', account_name: 'Suryadev Cement',       pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 4300000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[4], actual_close_date: _now(-25).slice(0, 10), created_at: _now(-50) },
  { id: 'demo-deal-12', name: 'Helios Pune Site Closeout',      account_id: 'demo-acct-7', account_name: 'Helios Constructions',  pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 6750000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[1], actual_close_date: _now(-38).slice(0, 10), created_at: _now(-75) },
  { id: 'demo-deal-13', name: 'Trident - lost to Tata',         account_id: 'demo-acct-5', account_name: 'Trident Power',         pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Closed Lost',   stage_type: 'lost', status: 'lost', amount: 3200000,  currency: 'INR', probability: 0,   win_probability_ai: 0,   owner_id: 'demo-user-id', owner_name: REPS[3], actual_close_date: _now(-18).slice(0, 10), created_at: _now(-60), lost_reason: 'Competitor' },
  { id: 'demo-deal-14', name: 'Acme - budget cut',              account_id: 'demo-acct-3', account_name: 'Acme Steel',            pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Closed Lost',   stage_type: 'lost', status: 'lost', amount: 2800000,  currency: 'INR', probability: 0,   win_probability_ai: 0,   owner_id: 'demo-user-id', owner_name: REPS[2], actual_close_date: _now(-30).slice(0, 10), created_at: _now(-70), lost_reason: 'No budget'  }
];

export const CRM_ACTIVITIES = [
  { id: 'demo-act-1',  type: 'call',    subject: 'Discovery call with Vikram',     status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-1', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-2',  type: 'email',   subject: 'Pricing sent to Anjali',         status: 'completed', completed_at: _now(-2), lead_id: 'demo-lead-2', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[1] },
  { id: 'demo-act-3',  type: 'meeting', subject: 'Site visit - Skyline Tower',     status: 'completed', completed_at: _now(-3), lead_id: null,          deal_id: 'demo-deal-1',  assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-4',  type: 'note',    subject: 'Decision-maker change at Vega',  status: 'completed', completed_at: _now(-5), lead_id: null,          deal_id: 'demo-deal-4',  assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-5',  type: 'call',    subject: 'Follow-up with Rohan',           status: 'completed', completed_at: _now(-4), lead_id: 'demo-lead-3', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[2] },
  { id: 'demo-act-6',  type: 'task',    subject: 'Send proposal to Trident',       status: 'planned',   due_at: _now(2),        lead_id: null,          deal_id: 'demo-deal-5',  assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-7',  type: 'call',    subject: 'Negotiate with Suryadev',        status: 'completed', completed_at: _now(-1), lead_id: null,          deal_id: 'demo-deal-6',  assigned_to: 'demo-user-id', assigned_to_name: REPS[4] },
  { id: 'demo-act-8',  type: 'email',   subject: 'Intro deck to Karthik',          status: 'completed', completed_at: _now(-6), lead_id: 'demo-lead-5', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-9',  type: 'meeting', subject: 'Quarterly review - Helios',      status: 'completed', completed_at: _now(-8), lead_id: null,          deal_id: 'demo-deal-7',  assigned_to: 'demo-user-id', assigned_to_name: REPS[1] },
  { id: 'demo-act-10', type: 'task',    subject: 'Quote for Acme TMT',             status: 'planned',   due_at: _now(1),        lead_id: null,          deal_id: 'demo-deal-3',  assigned_to: 'demo-user-id', assigned_to_name: REPS[2] },
  { id: 'demo-act-11', type: 'call',    subject: 'Cold outreach - Tanvi',          status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-9', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-12', type: 'note',    subject: 'Konkan asked for samples',       status: 'completed', completed_at: _now(-9), lead_id: 'demo-lead-7', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[1] }
];

export const CRM_SOURCES = [
  { id: 'demo-src-1', name: 'Website',       cost_per_lead: 250, is_active: true },
  { id: 'demo-src-2', name: 'Referral',      cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-3', name: 'Trade Show',    cost_per_lead: 800, is_active: true },
  { id: 'demo-src-4', name: 'Cold Outreach', cost_per_lead: 100, is_active: true },
  { id: 'demo-src-5', name: 'LinkedIn Ads',  cost_per_lead: 450, is_active: true }
];

export const CRM_DASHBOARD_SUMMARY = {
  total_leads:      CRM_LEADS.length,
  new_leads:        CRM_LEADS.filter(l => l.status === 'new').length,
  qualified_leads:  CRM_LEADS.filter(l => l.status === 'qualified').length,
  converted_leads:  4,
  total_deals:      CRM_DEALS.length,
  open_deals:       CRM_DEALS.filter(d => d.status === 'open').length,
  won_deals:        CRM_DEALS.filter(d => d.status === 'won').length,
  lost_deals:       CRM_DEALS.filter(d => d.status === 'lost').length,
  pipeline_value:   CRM_DEALS.filter(d => d.status === 'open').reduce((s, d) => s + d.amount, 0),
  closed_revenue:   CRM_DEALS.filter(d => d.status === 'won').reduce((s, d) => s + d.amount, 0),
  win_rate:         Math.round(CRM_DEALS.filter(d => d.status === 'won').length / Math.max(1, CRM_DEALS.filter(d => d.status !== 'open').length) * 100),
  avg_score:        Math.round(CRM_LEADS.reduce((s, l) => s + l.score, 0) / CRM_LEADS.length),
  total_activities: CRM_ACTIVITIES.length,
  total_contacts:   CRM_CONTACTS.length,
};

export const CRM_PIPELINE_VALUE = CRM_STAGES.filter(s => s.stage_type === 'open').map(s => {
  const deals = CRM_DEALS.filter(d => d.stage_id === s.id && d.status === 'open');
  const total = deals.reduce((acc, d) => acc + d.amount, 0);
  return {
    stage_id: s.id, stage_name: s.name, stage_type: s.stage_type, position: s.position,
    deal_count: deals.length, total_amount: total,
    weighted_amount: Math.round(total * (s.probability / 100)),
  };
});

export const CRM_FUNNEL = [
  { stage: 'New',         count: 12, value: 4_800_000  },
  { stage: 'Qualified',   count: 9,  value: 18_500_000 },
  { stage: 'Proposal',    count: 6,  value: 31_550_000 },
  { stage: 'Negotiation', count: 4,  value: 22_400_000 },
  { stage: 'Won',         count: 4,  value: 47_850_000 }
];

export const CRM_WIN_RATE = REPS.map((name, i) => ({
  rep_id: 'demo-user-id', rep_name: name,
  won: 5 - i, lost: i, total_closed: Math.max(1, 5 - i + i),
  win_rate: Math.round((5 - i) / Math.max(1, 5) * 100),
  revenue: [22_600_000, 14_200_000, 6_750_000, 4_300_000, 0][i] || 0,
}));

export const CRM_FORECAST = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      period: d.toISOString().slice(0, 7),
      committed:  3_500_000 + i * 800_000,
      best_case:  6_400_000 + i * 1_400_000,
      pipeline:  12_800_000 + i * 1_600_000,
      target:    10_000_000,
    };
  });
})();

export const CRM_HEATMAP = (() => {
  const dows = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const out: Array<{ dow: string; hour: number; count: number }> = [];
  for (const dow of dows) {
    for (let h = 8; h < 20; h++) {
      const peak = dow !== 'Sun' && h >= 10 && h <= 17;
      out.push({ dow, hour: h, count: peak ? Math.round(3 + Math.random() * 12) : Math.round(Math.random() * 3) });
    }
  }
  return out;
})();

export const CRM_LEAD_SOURCE_ROI = CRM_SOURCES.map((s, i) => ({
  source_id: s.id, source_name: s.name,
  leads:     [12, 8,  4, 14, 6][i],
  qualified: [5,  6,  3,  4, 2][i],
  won:       [3,  4,  2,  1, 1][i],
  cost:      [12*s.cost_per_lead, 0, 4*s.cost_per_lead, 14*s.cost_per_lead, 6*s.cost_per_lead][i],
  revenue:   [22_600_000, 14_200_000, 6_750_000, 4_300_000, 0][i] || 0,
}));

export const CRM_SCORE_DIST = [
  { bucket: '0-20',   count: 4 },
  { bucket: '21-40',  count: 7 },
  { bucket: '41-60',  count: 9 },
  { bucket: '61-80',  count: 14 },
  { bucket: '81-100', count: 10 }
];

export const CRM_SALES_CYCLE = [
  { stage: 'Discovery',     avg_days: 4 },
  { stage: 'Qualification', avg_days: 7 },
  { stage: 'Proposal',      avg_days: 11 },
  { stage: 'Negotiation',   avg_days: 8 }
];

export const CRM_DASHBOARD_COMPLETE = {
  unit: 'inr',
  summary:               CRM_DASHBOARD_SUMMARY,
  pipelineValue:         CRM_PIPELINE_VALUE,
  funnel:                CRM_FUNNEL,
  winRate:               CRM_WIN_RATE,
  forecast:              CRM_FORECAST,
  leadScoreDistribution: CRM_SCORE_DIST,
};

export const CRM_TERRITORIES = [
  { id: 'demo-terr-1', name: 'Mumbai West',     is_active: true },
  { id: 'demo-terr-2', name: 'Bangalore North', is_active: true },
  { id: 'demo-terr-3', name: 'Delhi Central',   is_active: true }
];

export const CRM_PRODUCTS = [
  { id: 'demo-prod-1', name: 'TMT Bar 8mm',   sku: 'TMT-8',     unit_price: 65,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-2', name: 'TMT Bar 12mm',  sku: 'TMT-12',    unit_price: 64,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-3', name: 'TMT Bar 16mm',  sku: 'TMT-16',    unit_price: 63,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-4', name: 'OPC Cement 53', sku: 'CEM-OPC53', unit_price: 410, unit: 'bag', is_active: true },
  { id: 'demo-prod-5', name: 'GI Wire 8 SWG', sku: 'GI-8',      unit_price: 92,  unit: 'kg',  is_active: true }
];

export const CRM_LEAD_VELOCITY = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const total = 35 + i * 6;
    const qualified = Math.round(total * (0.35 + i * 0.03));
    const prev = i === 0 ? null : Math.round((35 + (i - 1) * 6) * (0.35 + (i - 1) * 0.03));
    const mom = prev == null ? null : Math.round(((qualified - prev) / prev) * 1000) / 10;
    return { month: d.toISOString().slice(0, 7), total, qualified, mom_growth_pct: mom };
  });
})();

export const CRM_TIME_TO_FIRST_TOUCH = {
  avg_minutes: 42, median_minutes: 28, sla_breach_pct: 18.5, total: 124, breaches: 23, sla_minutes: 60,
  distribution: [
    { bucket: '<5m',    count: 22 },
    { bucket: '5-15m',  count: 38 },
    { bucket: '15-60m', count: 41 },
    { bucket: '1-4h',   count: 14 },
    { bucket: '4-24h',  count: 7 },
    { bucket: '>24h',   count: 2 }
  ],
};

export const CRM_STUCK_LEADS_KPI = {
  count_7d: 18, count_14d: 9, count_30d: 4,
  top_owners: [
    { owner_id: 'demo-user-id', count: 5 },
    { owner_id: 'demo-user-2',  count: 3 },
    { owner_id: 'demo-user-3',  count: 1 }
  ],
};

export const CRM_LOST_REASONS = [
  { reason: 'Price too high',    count: 14 },
  { reason: 'Chose competitor',  count: 11 },
  { reason: 'No budget',         count: 9 },
  { reason: 'Bad timing',        count: 6 },
  { reason: 'Lost contact',      count: 4 },
  { reason: 'Project cancelled', count: 3 }
];

export const CRM_WON_REASONS = [
  { reason: 'Better pricing',         count: 12 },
  { reason: 'Faster delivery',        count: 9 },
  { reason: 'Existing relationship',  count: 7 },
  { reason: 'Better product quality', count: 5 },
  { reason: 'Local support',          count: 3 }
];

export const CRM_DISQUAL_REASONS = [
  { reason: 'Not in service area', count: 8 },
  { reason: 'Below min order qty', count: 6 },
  { reason: 'Wrong industry',      count: 4 },
  { reason: 'No authority',        count: 3 }
];

export const CRM_STAGE_CONVERSION = [
  { from_stage: 'Discovery',     to_stage: 'Qualification', entered: 48, advanced: 36, rate: 75.0 },
  { from_stage: 'Qualification', to_stage: 'Proposal',      entered: 36, advanced: 22, rate: 61.1 },
  { from_stage: 'Proposal',      to_stage: 'Negotiation',   entered: 22, advanced: 14, rate: 63.6 },
  { from_stage: 'Negotiation',   to_stage: 'Closed Won',    entered: 14, advanced: 9,  rate: 64.3 }
];

export const CRM_LEAD_AGING = [
  { bucket: '0-7d',   count: 14 },
  { bucket: '8-30d',  count: 22 },
  { bucket: '31-60d', count: 9 },
  { bucket: '60+d',   count: 5 }
];

export const CRM_COHORT_CONVERSION = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const total = 28 + i * 4;
    const cells = Array.from({ length: 7 }, (_, age) => {
      const cumPct = Math.min(45, age * (6 + i));
      return { age_months: age, converted: Math.round(total * (cumPct / 100)), rate: cumPct };
    });
    return { cohort_month: d.toISOString().slice(0, 7), total, cells };
  });
})();

export const CRM_ENGAGEMENT_COMPARISON = {
  won:  { avg: 7.2, count: 18 },
  lost: { avg: 3.1, count: 24 }
};

export const CRM_DAYS_SINCE_TOUCH = [
  { bucket: '0d',     count: 8 },
  { bucket: '1-3d',   count: 16 },
  { bucket: '4-7d',   count: 11 },
  { bucket: '8-14d',  count: 7 },
  { bucket: '15-30d', count: 4 },
  { bucket: '30+d',   count: 3 }
];

export const CRM_SCORE_BAND_CONVERSION = [
  { band: '0-19',   total: 14, converted: 1,  rate: 7.1 },
  { band: '20-39',  total: 22, converted: 3,  rate: 13.6 },
  { band: '40-59',  total: 31, converted: 8,  rate: 25.8 },
  { band: '60-79',  total: 28, converted: 14, rate: 50.0 },
  { band: '80-100', total: 18, converted: 12, rate: 66.7 }
];

export const CRM_TERRITORY_CONVERSION = [
  { territory: 'Maharashtra', total: 42, converted: 14, rate: 33.3 },
  { territory: 'Karnataka',   total: 31, converted: 11, rate: 35.5 },
  { territory: 'Tamil Nadu',  total: 24, converted: 7,  rate: 29.2 },
  { territory: 'Delhi',       total: 18, converted: 6,  rate: 33.3 },
  { territory: 'Gujarat',     total: 16, converted: 5,  rate: 31.3 },
  { territory: 'Telangana',   total: 12, converted: 4,  rate: 33.3 },
  { territory: 'West Bengal', total: 9,  converted: 2,  rate: 22.2 }
];

export const CRM_TOUCHPOINTS_TO_RESPONSE = [
  { bucket: '1',  count: 12 },
  { bucket: '2',  count: 18 },
  { bucket: '3',  count: 14 },
  { bucket: '4',  count: 9 },
  { bucket: '5+', count: 11 },
  { bucket: 'No response', count: 24 }
];

export const CRM_LEADS_AT_RISK = [
  { lead_id: 'demo-lead-1',  name: 'Vikram Reddy (Skyline Developers)',  score: 88, owner_id: 'demo-user-id', days_idle: 16 },
  { lead_id: 'demo-lead-4',  name: 'Neha Gupta (Vega Infra)',            score: 92, owner_id: 'demo-user-id', days_idle: 21 },
  { lead_id: 'demo-lead-7',  name: 'Manish Khanna (Konkan Steel)',       score: 81, owner_id: 'demo-user-id', days_idle: 18 },
  { lead_id: 'demo-lead-10', name: 'Karan Verma (Suryadev Cement)',      score: 84, owner_id: 'demo-user-id', days_idle: 14 },
  { lead_id: 'demo-lead-11', name: 'Aditya Nair (Helios Constructions)', score: 78, owner_id: 'demo-user-id', days_idle: 22 }
];

export const CRM_ANALYTICS_LAYOUT = {
  widgets: [
    { id: 'demo-wgt-1', widget_type: 'lead_velocity',         chart_type: 'line', config: {} },
    { id: 'demo-wgt-2', widget_type: 'stuck_leads',           chart_type: 'number', config: {} },
    { id: 'demo-wgt-3', widget_type: 'lead_aging',            chart_type: 'bar', config: {} },
    { id: 'demo-wgt-4', widget_type: 'won_reasons',           chart_type: 'horizontal-bar', config: {} },
    { id: 'demo-wgt-5', widget_type: 'leads_at_risk',         chart_type: 'table', config: {} },
    { id: 'demo-wgt-6', widget_type: 'score_band_conversion', chart_type: 'bar', config: {} }
  ],
  layouts: {
    lg: [
      { i: 'demo-wgt-1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'demo-wgt-2', x: 6, y: 0, w: 3, h: 3 },
      { i: 'demo-wgt-3', x: 9, y: 0, w: 3, h: 4 },
      { i: 'demo-wgt-4', x: 0, y: 4, w: 6, h: 4 },
      { i: 'demo-wgt-5', x: 6, y: 4, w: 6, h: 5 },
      { i: 'demo-wgt-6', x: 0, y: 8, w: 6, h: 4 }
    ],
    md: [
      { i: 'demo-wgt-1', x: 0, y: 0,  w: 8, h: 4 },
      { i: 'demo-wgt-2', x: 0, y: 4,  w: 4, h: 3 },
      { i: 'demo-wgt-3', x: 4, y: 4,  w: 4, h: 4 },
      { i: 'demo-wgt-4', x: 0, y: 8,  w: 8, h: 4 },
      { i: 'demo-wgt-5', x: 0, y: 12, w: 8, h: 5 },
      { i: 'demo-wgt-6', x: 0, y: 17, w: 8, h: 4 }
    ],
    sm: [
      { i: 'demo-wgt-1', x: 0, y: 0,  w: 2, h: 4 },
      { i: 'demo-wgt-2', x: 0, y: 4,  w: 2, h: 3 },
      { i: 'demo-wgt-3', x: 0, y: 7,  w: 2, h: 4 },
      { i: 'demo-wgt-4', x: 0, y: 11, w: 2, h: 4 },
      { i: 'demo-wgt-5', x: 0, y: 15, w: 2, h: 5 },
      { i: 'demo-wgt-6', x: 0, y: 20, w: 2, h: 4 }
    ]
  }
};

export const CRM_OVERVIEW_LAYOUT = {
  widgets: [
    { id: 'demo-pin-1', widget_type: 'stuck_leads',   chart_type: 'number', config: {} },
    { id: 'demo-pin-2', widget_type: 'lead_velocity', chart_type: 'line',   config: {} }
  ],
  layouts: {
    lg: [
      { i: 'demo-pin-1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'demo-pin-2', x: 6, y: 0, w: 6, h: 4 }
    ],
    md: [
      { i: 'demo-pin-1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'demo-pin-2', x: 4, y: 0, w: 4, h: 4 }
    ],
    sm: [
      { i: 'demo-pin-1', x: 0, y: 0, w: 2, h: 4 },
      { i: 'demo-pin-2', x: 0, y: 4, w: 2, h: 4 }
    ]
  }
};

export const CRM_WA_TEMPLATES_SEED = [
  { id: 'demo-wa-tpl-1', org_id: 'demo-org-999', meta_template_name: 'welcome_greeting', category: 'utility', language: 'en', status: 'approved', header_text: null,             body_text: 'Hi {{1}}, welcome to Kinematic! We are excited to help you grow your business.',                  footer_text: 'Reply STOP to opt out.', variables: ['first_name'],                              created_at: _now(-30), updated_at: _now(-30) },
  { id: 'demo-wa-tpl-2', org_id: 'demo-org-999', meta_template_name: 'order_shipped',    category: 'utility', language: 'en', status: 'approved', header_text: 'Order Shipped',  body_text: 'Hi {{1}}, your order #{{2}} has been shipped. Tracking link: {{3}}',                              footer_text: null,                     variables: ['first_name', 'order_id', 'tracking_url'],  created_at: _now(-14), updated_at: _now(-14) },
  { id: 'demo-wa-tpl-3', org_id: 'demo-org-999', meta_template_name: 'meeting_reminder', category: 'utility', language: 'en', status: 'pending',  header_text: null,             body_text: 'Hi {{1}}, a quick reminder about our meeting at {{2}} tomorrow. Looking forward to it!',           footer_text: null,                     variables: ['first_name', 'meeting_time'],              created_at: _now(-3),  updated_at: _now(-3) }
];

export const DEMO_WA_TEMPLATES_KEY = 'kinematic_demo_wa_templates';

export function readDemoWaTemplates(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_WA_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeDemoWaTemplates(rows: Array<Record<string, unknown>>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DEMO_WA_TEMPLATES_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}

export function pushDemoWaTemplate(row: Record<string, unknown>) {
  const list = readDemoWaTemplates();
  list.unshift(row);
  writeDemoWaTemplates(list);
}

// Planogram mocks
export const PLAN_SHELVES = [
  { index: 0, capacity: 18 }, { index: 1, capacity: 18 }, { index: 2, capacity: 18 }, { index: 3, capacity: 18 }
];

export const PLAN_EXPECTED_SKUS = [
  { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',   shelf_index: 0, facings: 4, position: 1, weight: 1 },
  { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm',  shelf_index: 0, facings: 6, position: 2, weight: 1 },
  { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm',  shelf_index: 1, facings: 5, position: 1, weight: 1 },
  { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53', shelf_index: 2, facings: 8, position: 1, weight: 1 },
  { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', shelf_index: 3, facings: 4, position: 3, weight: 1 }
];

export const PLANOGRAMS = [
  { id: 'demo-pg-1', org_id: 'demo-org-999', name: 'Steel & Cement Premium GT', category: 'Building Materials', store_format: 'GT-LARGE',  source_url: null, layout: { shelves: PLAN_SHELVES },             expected_skus: PLAN_EXPECTED_SKUS,            version: 3, is_active: true,  created_at: _now(-90),  updated_at: _now(-7)  },
  { id: 'demo-pg-2', org_id: 'demo-org-999', name: 'Cement Counter MT',         category: 'Cement',             store_format: 'MT',        source_url: null, layout: { shelves: PLAN_SHELVES.slice(0, 3) }, expected_skus: PLAN_EXPECTED_SKUS.slice(2, 5), version: 1, is_active: true,  created_at: _now(-45),  updated_at: _now(-12) },
  { id: 'demo-pg-3', org_id: 'demo-org-999', name: 'TMT Distributor - Tier 2',  category: 'Steel',              store_format: 'GT-MEDIUM', source_url: null, layout: { shelves: PLAN_SHELVES.slice(0, 2) }, expected_skus: PLAN_EXPECTED_SKUS.slice(0, 3), version: 2, is_active: true,  created_at: _now(-60),  updated_at: _now(-3)  },
  { id: 'demo-pg-4', org_id: 'demo-org-999', name: 'Wholesale Slab',            category: 'Mixed',              store_format: 'WHOLESALE', source_url: null, layout: { shelves: PLAN_SHELVES },             expected_skus: PLAN_EXPECTED_SKUS,            version: 1, is_active: false, created_at: _now(-180), updated_at: _now(-30) }
];

export const PLAN_ASSIGNMENTS = [
  { id: 'demo-pga-1', planogram_id: 'demo-pg-1', store_id: null, zone_id: 'demo-zone-1', city_id: null,           valid_from: _now(-30), valid_to: null, created_at: _now(-30) },
  { id: 'demo-pga-2', planogram_id: 'demo-pg-1', store_id: null, zone_id: 'demo-zone-2', city_id: null,           valid_from: _now(-30), valid_to: null, created_at: _now(-30) },
  { id: 'demo-pga-3', planogram_id: 'demo-pg-2', store_id: null, zone_id: null,          city_id: 'demo-city-1',  valid_from: _now(-15), valid_to: null, created_at: _now(-15) }
];

export const PLAN_CAPTURES = [
  { id: 'demo-cap-1', planogram_id: 'demo-pg-1', store_id: 'demo-store-1', store_name: 'Reliance Fresh - Koramangala', fe_id: 'fe1', fe_name: 'Arjun Sharma', captured_at: _now(-1), photo_url: null, score: 88, processed_at: _now(-1) },
  { id: 'demo-cap-2', planogram_id: 'demo-pg-1', store_id: 'demo-store-2', store_name: 'Big Bazaar - Andheri',         fe_id: 'fe2', fe_name: 'Priya Patel',  captured_at: _now(-2), photo_url: null, score: 72, processed_at: _now(-2) },
  { id: 'demo-cap-3', planogram_id: 'demo-pg-2', store_id: 'demo-store-3', store_name: 'Star Market - Saket',          fe_id: 'fe3', fe_name: 'Rahul Verma', captured_at: _now(-3), photo_url: null, score: 91, processed_at: _now(-3) },
  { id: 'demo-cap-4', planogram_id: 'demo-pg-3', store_id: 'demo-store-4', store_name: 'Metro Cash - HSR',             fe_id: 'fe1', fe_name: 'Arjun Sharma', captured_at: _now(-4), photo_url: null, score: 64, processed_at: _now(-4) },
  { id: 'demo-cap-5', planogram_id: 'demo-pg-1', store_id: 'demo-store-5', store_name: "Spencer's - Whitefield",       fe_id: 'fe4', fe_name: 'Sneha Rao',   captured_at: _now(-5), photo_url: null, score: 79, processed_at: _now(-5) },
  { id: 'demo-cap-6', planogram_id: 'demo-pg-2', store_id: 'demo-store-6', store_name: 'Reliance SMART - Powai',       fe_id: 'fe5', fe_name: 'Amit Singh',  captured_at: _now(-6), photo_url: null, score: 83, processed_at: _now(-6) }
];

export const planRecognitionFor = (captureId: string) => ({
  id: 'demo-rec-' + captureId, capture_id: captureId,
  detected_skus: [
    { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',  facings: 3, shelf_index: 0, bbox: [10, 10, 80, 60]  as [number, number, number, number], confidence: 0.92, is_competitor: false },
    { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm', facings: 6, shelf_index: 0, bbox: [95, 10, 220, 60] as [number, number, number, number], confidence: 0.88, is_competitor: false },
    { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', facings: 4, shelf_index: 1, bbox: [10, 80, 160, 130] as [number, number, number, number], confidence: 0.85, is_competitor: false },
    { sku_id: null,          sku_name: 'Tata Tiscon (competitor)', facings: 2, shelf_index: 1, bbox: [180, 80, 240, 130] as [number, number, number, number], confidence: 0.74, is_competitor: true }
  ],
  shelf_map: { shelf_count: 4 },
  overall_confidence: 0.86,
  needs_review: false,
  model_versions: { detector: 'yolo-v8-1.2', classifier: 'mobilenet-3' },
  processed_at: _now(-1),
});

export const planComplianceFor = (captureId: string, planogramId = 'demo-pg-1', score = 82) => ({
  id: 'demo-cmp-' + captureId, capture_id: captureId, planogram_id: planogramId,
  store_id: 'demo-store-1', fe_id: 'fe1',
  score, presence_score: score + 4, facing_score: score - 6, position_score: score,
  competitor_share: 0.16,
  missing_skus: [
    { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', expected_facings: 4 }
  ],
  misplaced_skus: [
    { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', expected_shelf: 1, actual_shelf: 2 }
  ],
  facing_deltas: [
    { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',  expected: 4, actual: 3, delta: -1 },
    { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm', expected: 6, actual: 6, delta:  0 },
    { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53',expected: 8, actual: 5, delta: -3 }
  ],
  recommendations: [
    { priority: 'critical' as const, action: 'Restock OPC Cement 53 (3 facings short)', sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53', rationale: 'Top SKU at this format; recovers ~Rs 4.8L MoM.' },
    { priority: 'high'     as const, action: 'Move TMT 16mm back to shelf 1',           sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm',  rationale: 'Misplaced on shelf 2 reduces eye-line.' },
    { priority: 'medium'   as const, action: 'Add 1 facing of TMT 8mm',                 sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',   rationale: 'Improves entry-level visibility.' },
    { priority: 'low'      as const, action: 'Add GI Wire 8 SWG (currently absent)',    sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', rationale: 'Optional accessory, low velocity.' }
  ],
  created_at: _now(-1),
});

export const PLAN_TREND = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    day: d.toISOString().split('T')[0],
    avg_score: 65 + Math.round(Math.sin(i / 4) * 8 + Math.random() * 6),
    captures: 12 + Math.round(Math.random() * 18),
  };
});

export const PLAN_STORE_RANKING = [
  { bucket: 'demo-store-3', bucket_label: 'Star Market - Saket',          captures: 18, avg_score: 91, avg_presence: 95, avg_facing: 88, avg_position: 90, competitor_share: 0.08 },
  { bucket: 'demo-store-1', bucket_label: 'Reliance Fresh - Koramangala', captures: 22, avg_score: 88, avg_presence: 92, avg_facing: 84, avg_position: 88, competitor_share: 0.12 },
  { bucket: 'demo-store-6', bucket_label: 'Reliance SMART - Powai',       captures: 14, avg_score: 83, avg_presence: 88, avg_facing: 80, avg_position: 81, competitor_share: 0.15 },
  { bucket: 'demo-store-5', bucket_label: "Spencer's - Whitefield",       captures: 11, avg_score: 79, avg_presence: 84, avg_facing: 76, avg_position: 77, competitor_share: 0.18 },
  { bucket: 'demo-store-2', bucket_label: 'Big Bazaar - Andheri',         captures: 19, avg_score: 72, avg_presence: 78, avg_facing: 68, avg_position: 70, competitor_share: 0.24 },
  { bucket: 'demo-store-4', bucket_label: 'Metro Cash - HSR',             captures:  8, avg_score: 64, avg_presence: 70, avg_facing: 60, avg_position: 62, competitor_share: 0.32 }
];

export const PLAN_CHRONIC_GAPS = [
  { store_id: 'demo-store-4', failing: 12, avg_score: 58 },
  { store_id: 'demo-store-2', failing:  9, avg_score: 64 },
  { store_id: 'demo-store-5', failing:  6, avg_score: 71 }
];

export const PLAN_SKU_VISIBILITY = [
  { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',   avg_facings: 3.2, appearances: 84 },
  { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm',  avg_facings: 5.8, appearances: 96 },
  { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm',  avg_facings: 2.4, appearances: 71 },
  { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53', avg_facings: 4.1, appearances: 58 },
  { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', avg_facings: 1.8, appearances: 42 }
];

export const PLAN_RISK_FORECAST = [
  { store_id: 'demo-store-4', latest: 64, slope: -1.4, risk: 0.82 },
  { store_id: 'demo-store-2', latest: 72, slope: -0.8, risk: 0.61 },
  { store_id: 'demo-store-5', latest: 79, slope: -0.4, risk: 0.48 }
];

// Hiring / ATS candidates - matches Candidate interface in src/app/dashboard/hr/page.tsx
// Stages: applied -> screening -> interview -> selected -> onboarded (or rejected)
export const HR_CANDIDATES = [
  { id: 'cand-1',  name: 'Rohan Mishra',    mobile: '9810011223', email: 'rohan.mishra@hire.demo',    applied_role: 'executive',  city: 'Delhi',     applied_zone: 'Delhi Central',     source: 'Naukri',   stage: 'applied',   notes: 'Strong FMCG background, 3 yrs at HUL.',                                                                                                                                  resume_url: 'https://example.com/resumes/rohan.pdf',    created_at: new Date(Date.now() - 1*86400000).toISOString() },
  { id: 'cand-2',  name: 'Sneha Iyer',      mobile: '9920022334', email: 'sneha.iyer@hire.demo',      applied_role: 'executive',  city: 'Mumbai',    applied_zone: 'Mumbai West',       source: 'Referral', stage: 'applied',   notes: 'Walk-in interview, currently with Marico.',                                                                                                                              resume_url: 'https://example.com/resumes/sneha.pdf',    created_at: new Date(Date.now() - 2*86400000).toISOString() },
  { id: 'cand-3',  name: 'Vikram Joshi',    mobile: '9830033445', email: 'vikram.joshi@hire.demo',    applied_role: 'executive',  city: 'Bengaluru', applied_zone: 'Bangalore South',   source: 'LinkedIn', stage: 'applied',   notes: 'Cold-applied via LinkedIn, fresher.',                                                                                                                                    resume_url: 'https://example.com/resumes/vikram.pdf',   created_at: new Date(Date.now() - 3*86400000).toISOString() },
  { id: 'cand-4',  name: 'Priya Shah',      mobile: '9740044556', email: 'priya.shah@hire.demo',      applied_role: 'executive',  city: 'Ahmedabad', applied_zone: 'Ahmedabad West',    source: 'Naukri',   stage: 'screening', notes: 'Phone screen clear, schedule technical round.',                                                                                                                          resume_url: 'https://example.com/resumes/priya.pdf',    created_at: new Date(Date.now() - 5*86400000).toISOString() },
  { id: 'cand-5',  name: 'Karan Mehta',     mobile: '9650055667', email: 'karan.mehta@hire.demo',     applied_role: 'supervisor', city: 'Pune',      applied_zone: 'Pune East',         source: 'Referral', stage: 'screening', notes: 'Internal referral by Arjun Sharma. Strong fit for supervisor role.',                                                                                                      resume_url: 'https://example.com/resumes/karan.pdf',    created_at: new Date(Date.now() - 6*86400000).toISOString() },
  { id: 'cand-6',  name: 'Anita Reddy',     mobile: '9560066778', email: 'anita.reddy@hire.demo',     applied_role: 'executive',  city: 'Hyderabad', applied_zone: 'Hyderabad Central', source: 'Walk-in',  stage: 'interview', notes: 'Round-2 with zonal head scheduled.',                interview_date: new Date(Date.now() + 2*86400000).toISOString(),                                                       resume_url: 'https://example.com/resumes/anita.pdf',    created_at: new Date(Date.now() - 8*86400000).toISOString() },
  { id: 'cand-7',  name: 'Imran Pathan',    mobile: '9470077889', email: 'imran.pathan@hire.demo',    applied_role: 'executive',  city: 'Chennai',   applied_zone: 'Chennai South',     source: 'LinkedIn', stage: 'interview', notes: 'Final round with HR done. Awaiting offer review.',  interview_date: new Date(Date.now() - 1*86400000).toISOString(),                                                       resume_url: 'https://example.com/resumes/imran.pdf',    created_at: new Date(Date.now() - 12*86400000).toISOString() },
  { id: 'cand-8',  name: 'Divya Krishnan',  mobile: '9380088990', email: 'divya.krishnan@hire.demo',  applied_role: 'executive',  city: 'Bengaluru', applied_zone: 'Bangalore East',    source: 'Naukri',   stage: 'interview', notes: 'Tech round in progress.',                            interview_date: new Date(Date.now() + 1*86400000).toISOString(),                                                       resume_url: 'https://example.com/resumes/divya.pdf',    created_at: new Date(Date.now() - 9*86400000).toISOString() },
  { id: 'cand-9',  name: 'Manish Tripathi', mobile: '9290099001', email: 'manish.tripathi@hire.demo', applied_role: 'supervisor', city: 'Kolkata',   applied_zone: 'Kolkata Central',   source: 'Referral', stage: 'selected',  notes: 'Offer letter generated, awaiting acceptance.',       selected_at: new Date(Date.now() - 3*86400000).toISOString(),                                                          resume_url: 'https://example.com/resumes/manish.pdf',   created_at: new Date(Date.now() - 18*86400000).toISOString() },
  { id: 'cand-10', name: 'Ritu Saxena',     mobile: '9190010102', email: 'ritu.saxena@hire.demo',     applied_role: 'executive',  city: 'Jaipur',    applied_zone: 'Jaipur Central',    source: 'Walk-in',  stage: 'selected',  notes: 'Offer accepted, joining date confirmed.',            selected_at: new Date(Date.now() - 5*86400000).toISOString(),                                                          resume_url: 'https://example.com/resumes/ritu.pdf',     created_at: new Date(Date.now() - 22*86400000).toISOString() },
  { id: 'cand-11', name: 'Faisal Ahmed',    mobile: '9090020203', email: 'faisal.ahmed@hire.demo',    applied_role: 'executive',  city: 'Mumbai',    applied_zone: 'Mumbai East',       source: 'Naukri',   stage: 'onboarded', notes: 'Joined Apr 1, completed induction. ID: KIN-006.',    onboarded_at: new Date(Date.now() - 15*86400000).toISOString(), converted_user_id: 'fe6',                              resume_url: 'https://example.com/resumes/faisal.pdf',   created_at: new Date(Date.now() - 35*86400000).toISOString() },
  { id: 'cand-12', name: 'Nisha Gupta',     mobile: '8980030304', email: 'nisha.gupta@hire.demo',     applied_role: 'executive',  city: 'Delhi',     applied_zone: 'Delhi South',       source: 'Referral', stage: 'onboarded', notes: 'Joined Apr 8, deployed to Delhi South beat.',        onboarded_at: new Date(Date.now() - 10*86400000).toISOString(), converted_user_id: 'fe7',                              resume_url: 'https://example.com/resumes/nisha.pdf',    created_at: new Date(Date.now() - 30*86400000).toISOString() },
  { id: 'cand-13', name: 'Suresh Patil',    mobile: '8870040405', email: 'suresh.patil@hire.demo',    applied_role: 'supervisor', city: 'Pune',      applied_zone: 'Pune West',         source: 'LinkedIn', stage: 'onboarded', notes: 'Senior supervisor, taking over Chakan cluster.',     onboarded_at: new Date(Date.now() - 7*86400000).toISOString(),  converted_user_id: 'sup4',                             resume_url: 'https://example.com/resumes/suresh.pdf',   created_at: new Date(Date.now() - 28*86400000).toISOString() },
  { id: 'cand-14', name: 'Pooja Bhatt',     mobile: '8760050506', email: 'pooja.bhatt@hire.demo',     applied_role: 'executive',  city: 'Surat',     applied_zone: 'Surat West',        source: 'Naukri',   stage: 'rejected',  notes: 'Did not clear technical interview round.',           rejection_reason: 'Insufficient FMCG sales experience', rejected_at: new Date(Date.now() - 5*86400000).toISOString(),  resume_url: 'https://example.com/resumes/pooja.pdf',    created_at: new Date(Date.now() - 20*86400000).toISOString() },
  { id: 'cand-15', name: 'Aniket Desai',    mobile: '8650060607', email: 'aniket.desai@hire.demo',    applied_role: 'executive',  city: 'Mumbai',    applied_zone: 'Mumbai North',      source: 'Walk-in',  stage: 'rejected',  notes: 'No-show for final interview round.',                 rejection_reason: 'No-show twice for scheduled rounds',  rejected_at: new Date(Date.now() - 11*86400000).toISOString(), resume_url: 'https://example.com/resumes/aniket.pdf',   created_at: new Date(Date.now() - 25*86400000).toISOString() }
];
