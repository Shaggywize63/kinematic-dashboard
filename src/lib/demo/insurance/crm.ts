// Insurance-vertical CRM demo fixtures (Aviva Life Insurance).
//
// Mirrors the shapes of src/lib/demo/seedData.ts exactly so demoMocks.ts's
// matchDemoMock can swap the generic bundle for this one when the demo
// account's industry switcher is set to "insurance". Every export here has a
// same-named, same-shaped twin in seedData.ts — only the content is themed to
// a life-insurance advisor's book of business (B2C individuals, policies,
// premiums, KYC / underwriting, renewals).

export const ADV = ['Arjun Sharma', 'Priya Patel', 'Rahul Verma', 'Sneha Rao', 'Amit Singh'];
export const _now = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString();

// Individual prospects (B2C). company/industry are hidden via CRM_SETTINGS
// field overrides, but kept on the row so any column that reads them is safe.
export const CRM_LEADS = [
  { id: 'demo-lead-1',  first_name: 'Rakesh',  last_name: 'Sharma',   company: '', email: 'rakesh.sharma@mail.demo',  phone: '+91 98201 11111', status: 'qualified',   score: 88, score_grade: 'A', city: 'Mumbai',    state: 'Maharashtra', latitude: 19.072, longitude: 72.881, industry: 'Insurance', product_interest: 'Term Life',   annual_premium: 48000,  sum_assured: 10000000, owner_id: 'demo-user-id', owner_name: ADV[0], source_id: 'demo-src-1', last_activity_at: _now(-1),  created_at: _now(-14) },
  { id: 'demo-lead-2',  first_name: 'Anjali',  last_name: 'Iyer',     company: '', email: 'anjali.iyer@mail.demo',     phone: '+91 98202 22222', status: 'working',     score: 76, score_grade: 'A', city: 'Bengaluru', state: 'Karnataka',   latitude: 12.965, longitude: 77.585, industry: 'Insurance', product_interest: 'ULIP',        annual_premium: 120000, sum_assured: 2400000,  owner_id: 'demo-user-id', owner_name: ADV[1], source_id: 'demo-src-2', last_activity_at: _now(-2),  created_at: _now(-21) },
  { id: 'demo-lead-3',  first_name: 'Rohan',   last_name: 'Kumar',    company: '', email: 'rohan.kumar@mail.demo',     phone: '+91 98203 33333', status: 'new',         score: 64, score_grade: 'B', city: 'Pune',      state: 'Maharashtra', latitude: 18.516, longitude: 73.857, industry: 'Insurance', product_interest: 'Endowment',   annual_premium: 60000,  sum_assured: 1500000,  owner_id: 'demo-user-id', owner_name: ADV[2], source_id: 'demo-src-3', last_activity_at: _now(-4),  created_at: _now(-7)  },
  { id: 'demo-lead-4',  first_name: 'Neha',    last_name: 'Gupta',    company: '', email: 'neha.gupta@mail.demo',      phone: '+91 98204 44444', status: 'qualified',   score: 92, score_grade: 'A', city: 'Hyderabad', state: 'Telangana',   latitude: 17.392, longitude: 78.486, industry: 'Insurance', product_interest: 'Child Plan',  annual_premium: 90000,  sum_assured: 2000000,  owner_id: 'demo-user-id', owner_name: ADV[0], source_id: 'demo-src-4', last_activity_at: _now(-1),  created_at: _now(-30) },
  { id: 'demo-lead-5',  first_name: 'Karthik', last_name: 'Pillai',   company: '', email: 'karthik.pillai@mail.demo',  phone: '+91 98205 55555', status: 'working',     score: 55, score_grade: 'B', city: 'Chennai',   state: 'Tamil Nadu',  latitude: 13.082, longitude: 80.270, industry: 'Insurance', product_interest: 'Pension',     annual_premium: 150000, sum_assured: 0,        owner_id: 'demo-user-id', owner_name: ADV[3], source_id: 'demo-src-5', last_activity_at: _now(-5),  created_at: _now(-18) },
  { id: 'demo-lead-6',  first_name: 'Pooja',   last_name: 'Joshi',    company: '', email: 'pooja.joshi@mail.demo',     phone: '+91 98206 66666', status: 'unqualified', score: 22, score_grade: 'D', city: 'Jaipur',    state: 'Rajasthan',   latitude: 26.912, longitude: 75.792, industry: 'Insurance', product_interest: 'Health',      annual_premium: 18000,  sum_assured: 500000,   owner_id: 'demo-user-id', owner_name: ADV[4], source_id: 'demo-src-6', last_activity_at: _now(-9),  created_at: _now(-35) },
  { id: 'demo-lead-7',  first_name: 'Manish',  last_name: 'Khanna',   company: '', email: 'manish.khanna@mail.demo',   phone: '+91 98207 77777', status: 'qualified',   score: 81, score_grade: 'A', city: 'Mumbai',    state: 'Maharashtra', latitude: 19.101, longitude: 72.845, industry: 'Insurance', product_interest: 'Term Life',   annual_premium: 36000,  sum_assured: 7500000,  owner_id: 'demo-user-id', owner_name: ADV[1], source_id: 'demo-src-2', last_activity_at: _now(-3),  created_at: _now(-25) },
  { id: 'demo-lead-8',  first_name: 'Ishaan',  last_name: 'Bose',     company: '', email: 'ishaan.bose@mail.demo',     phone: '+91 98208 88888', status: 'nurturing',   score: 48, score_grade: 'C', city: 'Kolkata',   state: 'West Bengal', latitude: 22.572, longitude: 88.363, industry: 'Insurance', product_interest: 'ULIP',        annual_premium: 75000,  sum_assured: 1500000,  owner_id: 'demo-user-id', owner_name: ADV[2], source_id: 'demo-src-3', last_activity_at: _now(-12), created_at: _now(-42) },
  { id: 'demo-lead-9',  first_name: 'Tanvi',   last_name: 'Mehta',    company: '', email: 'tanvi.mehta@mail.demo',     phone: '+91 98209 99999', status: 'new',         score: 70, score_grade: 'B', city: 'Ahmedabad', state: 'Gujarat',     latitude: 23.031, longitude: 72.582, industry: 'Insurance', product_interest: 'Endowment',   annual_premium: 54000,  sum_assured: 1200000,  owner_id: 'demo-user-id', owner_name: ADV[3], source_id: 'demo-src-1', last_activity_at: _now(-1),  created_at: _now(-5)  },
  { id: 'demo-lead-10', first_name: 'Karan',   last_name: 'Verma',    company: '', email: 'karan.verma@mail.demo',     phone: '+91 98210 10101', status: 'working',     score: 84, score_grade: 'A', city: 'Surat',     state: 'Gujarat',     latitude: 21.170, longitude: 72.831, industry: 'Insurance', product_interest: 'Term Life',   annual_premium: 42000,  sum_assured: 10000000, owner_id: 'demo-user-id', owner_name: ADV[0], source_id: 'demo-src-7', last_activity_at: _now(-2),  created_at: _now(-11) },
  { id: 'demo-lead-11', first_name: 'Aditya',  last_name: 'Nair',     company: '', email: 'aditya.nair@mail.demo',     phone: '+91 98211 12121', status: 'qualified',   score: 78, score_grade: 'A', city: 'Delhi',     state: 'Delhi',       latitude: 28.613, longitude: 77.209, industry: 'Insurance', product_interest: 'Pension',     annual_premium: 200000, sum_assured: 0,        owner_id: 'demo-user-id', owner_name: ADV[1], source_id: 'demo-src-5', last_activity_at: _now(-1),  created_at: _now(-28) },
  { id: 'demo-lead-12', first_name: 'Diya',    last_name: 'Kapoor',   company: '', email: 'diya.kapoor@mail.demo',     phone: '+91 98212 13131', status: 'new',         score: 36, score_grade: 'C', city: 'Chennai',   state: 'Tamil Nadu',  latitude: 13.052, longitude: 80.251, industry: 'Insurance', product_interest: 'Child Plan',  annual_premium: 66000,  sum_assured: 1800000,  owner_id: 'demo-user-id', owner_name: ADV[2], source_id: 'demo-src-2', last_activity_at: _now(-6),  created_at: _now(-9)  }
];

// New Business pipeline (default).
export const CRM_STAGES = [
  { id: 'demo-stg-1', pipeline_id: 'demo-pipe', name: 'New Enquiry',              position: 0, probability: 10,  stage_type: 'open', color: '#94a3b8' },
  { id: 'demo-stg-2', pipeline_id: 'demo-pipe', name: 'Needs Analysis',          position: 1, probability: 25,  stage_type: 'open', color: '#60a5fa' },
  { id: 'demo-stg-3', pipeline_id: 'demo-pipe', name: 'Quote / Illustration',    position: 2, probability: 45,  stage_type: 'open', color: '#a78bfa' },
  { id: 'demo-stg-4', pipeline_id: 'demo-pipe', name: 'Application & KYC',        position: 3, probability: 65,  stage_type: 'open', color: '#f59e0b' },
  { id: 'demo-stg-5', pipeline_id: 'demo-pipe', name: 'Medical / Underwriting',  position: 4, probability: 82,  stage_type: 'open', color: '#fbbf24' },
  { id: 'demo-stg-6', pipeline_id: 'demo-pipe', name: 'Policy Issued',           position: 5, probability: 100, stage_type: 'won',  color: '#22c55e' },
  { id: 'demo-stg-7', pipeline_id: 'demo-pipe', name: 'Not Taken Up',            position: 6, probability: 0,   stage_type: 'lost', color: '#ef4444' }
];

const RENEWAL_STAGES = [
  { id: 'rnw-stg-1', pipeline_id: 'demo-pipe-renewals', name: 'Renewal Due',   position: 0, probability: 40,  stage_type: 'open', color: '#94a3b8' },
  { id: 'rnw-stg-2', pipeline_id: 'demo-pipe-renewals', name: 'Reminder Sent', position: 1, probability: 60,  stage_type: 'open', color: '#60a5fa' },
  { id: 'rnw-stg-3', pipeline_id: 'demo-pipe-renewals', name: 'Follow-up',     position: 2, probability: 75,  stage_type: 'open', color: '#a78bfa' },
  { id: 'rnw-stg-4', pipeline_id: 'demo-pipe-renewals', name: 'Collected',     position: 3, probability: 100, stage_type: 'won',  color: '#22c55e' },
  { id: 'rnw-stg-5', pipeline_id: 'demo-pipe-renewals', name: 'Lapsed',        position: 4, probability: 0,   stage_type: 'lost', color: '#ef4444' }
];

export const CRM_PIPELINES = [
  { id: 'demo-pipe',          name: 'Aviva Life — New Business', is_default: true,  stages: CRM_STAGES },
  { id: 'demo-pipe-renewals', name: 'Policy Renewals',           is_default: false, stages: RENEWAL_STAGES }
];

// Corporate / group accounts (group term, employer-employee, bancassurance).
export const CRM_ACCOUNTS = [
  { id: 'demo-acct-1', name: 'Infosys BPM (Group Term)',      domain: 'infosysbpm.demo', industry: 'IT Services',     annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[0], created_at: _now(-60) },
  { id: 'demo-acct-2', name: 'HDFC Bank — Bancassurance',     domain: 'hdfcbank.demo',   industry: 'Banking',         annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[1], created_at: _now(-90) },
  { id: 'demo-acct-3', name: 'Tata Consultancy (Grp Health)', domain: 'tcs.demo',        industry: 'IT Services',     annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[2], created_at: _now(-45) },
  { id: 'demo-acct-4', name: 'Wipro Employee Benefits',       domain: 'wipro.demo',      industry: 'IT Services',     annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[0], created_at: _now(-120) },
  { id: 'demo-acct-5', name: 'Reliance Retail (Grp Life)',    domain: 'reliance.demo',   industry: 'Retail',          annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[3], created_at: _now(-75) },
  { id: 'demo-acct-6', name: 'PolicyBazaar (Aggregator)',     domain: 'policybazaar.demo', industry: 'Insurtech',     annual_revenue: 0, owner_id: 'demo-user-id', owner_name: ADV[4], created_at: _now(-30) }
];

export const CRM_CONTACTS = [
  { id: 'demo-ctc-1', first_name: 'Rakesh',  last_name: 'Sharma',  email: 'rakesh.sharma@mail.demo',  phone: '+91 98201 11111', title: 'Policyholder',       account_id: 'demo-acct-1', account_name: 'Infosys BPM (Group Term)',      owner_id: 'demo-user-id', owner_name: ADV[0] },
  { id: 'demo-ctc-2', first_name: 'Anjali',  last_name: 'Iyer',    email: 'anjali.iyer@mail.demo',    phone: '+91 98202 22222', title: 'HR — Benefits',      account_id: 'demo-acct-2', account_name: 'HDFC Bank — Bancassurance',     owner_id: 'demo-user-id', owner_name: ADV[1] },
  { id: 'demo-ctc-3', first_name: 'Rohan',   last_name: 'Kumar',   email: 'rohan.kumar@mail.demo',    phone: '+91 98203 33333', title: 'Prospect',           account_id: 'demo-acct-3', account_name: 'Tata Consultancy (Grp Health)', owner_id: 'demo-user-id', owner_name: ADV[2] },
  { id: 'demo-ctc-4', first_name: 'Neha',    last_name: 'Gupta',   email: 'neha.gupta@mail.demo',     phone: '+91 98204 44444', title: 'Policyholder',       account_id: 'demo-acct-4', account_name: 'Wipro Employee Benefits',       owner_id: 'demo-user-id', owner_name: ADV[0] },
  { id: 'demo-ctc-5', first_name: 'Karthik', last_name: 'Pillai',  email: 'karthik.pillai@mail.demo', phone: '+91 98205 55555', title: 'Channel Partner',    account_id: 'demo-acct-5', account_name: 'Reliance Retail (Grp Life)',    owner_id: 'demo-user-id', owner_name: ADV[3] },
  { id: 'demo-ctc-6', first_name: 'Sunita',  last_name: 'Menon',   email: 'sunita.menon@policybazaar.demo', phone: '+91 98210 10101', title: 'Aggregator Lead', account_id: 'demo-acct-6', account_name: 'PolicyBazaar (Aggregator)',   owner_id: 'demo-user-id', owner_name: ADV[4] },
  { id: 'demo-ctc-7', first_name: 'Aditya',  last_name: 'Nair',    email: 'aditya.nair@mail.demo',    phone: '+91 98211 12121', title: 'Prospect',           account_id: 'demo-acct-1', account_name: 'Infosys BPM (Group Term)',      owner_id: 'demo-user-id', owner_name: ADV[1] },
  { id: 'demo-ctc-8', first_name: 'Manish',  last_name: 'Khanna',  email: 'manish.khanna@mail.demo',  phone: '+91 98207 77777', title: 'Policyholder',       account_id: 'demo-acct-2', account_name: 'HDFC Bank — Bancassurance',     owner_id: 'demo-user-id', owner_name: ADV[2] }
];

// Deals = policy opportunities. amount = annual premium (INR).
export const CRM_DEALS = [
  { id: 'demo-deal-1',  name: 'Rakesh Sharma — Term Life ₹1Cr',     account_id: 'demo-acct-1', account_name: 'Infosys BPM (Group Term)',      pipeline_id: 'demo-pipe', stage_id: 'demo-stg-3', stage_name: 'Quote / Illustration',    stage_type: 'open', status: 'open', amount: 48000,  currency: 'INR', probability: 45,  win_probability_ai: 58,  owner_id: 'demo-user-id', owner_name: ADV[0], expected_close_date: _now(12).slice(0, 10), created_at: _now(-30) },
  { id: 'demo-deal-2',  name: 'Anjali Iyer — Signature ULIP',       account_id: 'demo-acct-2', account_name: 'HDFC Bank — Bancassurance',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Medical / Underwriting',  stage_type: 'open', status: 'open', amount: 120000, currency: 'INR', probability: 82,  win_probability_ai: 80,  owner_id: 'demo-user-id', owner_name: ADV[1], expected_close_date: _now(6).slice(0, 10),  created_at: _now(-45) },
  { id: 'demo-deal-3',  name: 'Rohan Kumar — Endowment Plan',       account_id: 'demo-acct-3', account_name: 'Tata Consultancy (Grp Health)', pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Needs Analysis',          stage_type: 'open', status: 'open', amount: 60000,  currency: 'INR', probability: 25,  win_probability_ai: 33,  owner_id: 'demo-user-id', owner_name: ADV[2], expected_close_date: _now(28).slice(0, 10), created_at: _now(-14) },
  { id: 'demo-deal-4',  name: 'Neha Gupta — Young Scholar',         account_id: 'demo-acct-4', account_name: 'Wipro Employee Benefits',       pipeline_id: 'demo-pipe', stage_id: 'demo-stg-4', stage_name: 'Application & KYC',        stage_type: 'open', status: 'open', amount: 90000,  currency: 'INR', probability: 65,  win_probability_ai: 70,  owner_id: 'demo-user-id', owner_name: ADV[0], expected_close_date: _now(10).slice(0, 10), created_at: _now(-50) },
  { id: 'demo-deal-5',  name: 'Karthik Pillai — Saral Pension',     account_id: 'demo-acct-5', account_name: 'Reliance Retail (Grp Life)',    pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'New Enquiry',             stage_type: 'open', status: 'open', amount: 150000, currency: 'INR', probability: 10,  win_probability_ai: 20,  owner_id: 'demo-user-id', owner_name: ADV[3], expected_close_date: _now(35).slice(0, 10), created_at: _now(-8)  },
  { id: 'demo-deal-6',  name: 'Manish Khanna — Term Life ₹75L',     account_id: 'demo-acct-2', account_name: 'HDFC Bank — Bancassurance',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Medical / Underwriting',  stage_type: 'open', status: 'open', amount: 36000,  currency: 'INR', probability: 82,  win_probability_ai: 84,  owner_id: 'demo-user-id', owner_name: ADV[4], expected_close_date: _now(4).slice(0, 10),  created_at: _now(-22) },
  { id: 'demo-deal-7',  name: 'Aditya Nair — Pension Plan',         account_id: 'demo-acct-1', account_name: 'Infosys BPM (Group Term)',      pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Needs Analysis',          stage_type: 'open', status: 'open', amount: 200000, currency: 'INR', probability: 25,  win_probability_ai: 38,  owner_id: 'demo-user-id', owner_name: ADV[1], expected_close_date: _now(22).slice(0, 10), created_at: _now(-10) },
  { id: 'demo-deal-8',  name: 'Tanvi Mehta — Endowment',           account_id: 'demo-acct-4', account_name: 'Wipro Employee Benefits',       pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'New Enquiry',             stage_type: 'open', status: 'open', amount: 54000,  currency: 'INR', probability: 10,  win_probability_ai: 16,  owner_id: 'demo-user-id', owner_name: ADV[3], expected_close_date: _now(40).slice(0, 10), created_at: _now(-5)  },
  { id: 'demo-deal-9',  name: 'Karan Verma — Term Life ₹1Cr',       account_id: 'demo-acct-5', account_name: 'Reliance Retail (Grp Life)',    pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Policy Issued',           stage_type: 'won',  status: 'won',  amount: 42000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: ADV[0], actual_close_date: _now(-3).slice(0, 10),  created_at: _now(-65) },
  { id: 'demo-deal-10', name: 'Group Term — Infosys BPM (250 EE)',  account_id: 'demo-acct-1', account_name: 'Infosys BPM (Group Term)',      pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Policy Issued',           stage_type: 'won',  status: 'won',  amount: 480000, currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: ADV[0], actual_close_date: _now(-12).slice(0, 10), created_at: _now(-80) },
  { id: 'demo-deal-11', name: 'Priya Desai — ULIP (Issued)',        account_id: 'demo-acct-2', account_name: 'HDFC Bank — Bancassurance',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Policy Issued',           stage_type: 'won',  status: 'won',  amount: 96000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: ADV[4], actual_close_date: _now(-25).slice(0, 10), created_at: _now(-50) },
  { id: 'demo-deal-12', name: 'Renewal — Sanjay Rao (ULIP)',        account_id: 'demo-acct-3', account_name: 'Tata Consultancy (Grp Health)', pipeline_id: 'demo-pipe-renewals', stage_id: 'rnw-stg-2', stage_name: 'Reminder Sent', stage_type: 'open', status: 'open', amount: 84000,  currency: 'INR', probability: 60,  win_probability_ai: 64,  owner_id: 'demo-user-id', owner_name: ADV[1], expected_close_date: _now(7).slice(0, 10),  created_at: _now(-20) },
  { id: 'demo-deal-13', name: 'Renewal — Meera Nair (Endowment)',   account_id: 'demo-acct-4', account_name: 'Wipro Employee Benefits',       pipeline_id: 'demo-pipe-renewals', stage_id: 'rnw-stg-4', stage_name: 'Collected',     stage_type: 'won',  status: 'won',  amount: 60000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: ADV[2], actual_close_date: _now(-6).slice(0, 10),  created_at: _now(-30) },
  { id: 'demo-deal-14', name: 'Pooja Joshi — Health (NTU)',         account_id: 'demo-acct-6', account_name: 'PolicyBazaar (Aggregator)',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-7', stage_name: 'Not Taken Up',           stage_type: 'lost', status: 'lost', amount: 18000,  currency: 'INR', probability: 0,   win_probability_ai: 0,   owner_id: 'demo-user-id', owner_name: ADV[4], actual_close_date: _now(-18).slice(0, 10), created_at: _now(-60), lost_reason: 'Premium too high' }
];

export const CRM_ACTIVITIES = [
  { id: 'demo-act-1',  type: 'call',    subject: 'Needs analysis call — Rakesh',       status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-1', deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[0] },
  { id: 'demo-act-2',  type: 'email',   subject: 'ULIP illustration sent — Anjali',    status: 'completed', completed_at: _now(-2), lead_id: 'demo-lead-2', deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[1] },
  { id: 'demo-act-3',  type: 'meeting', subject: 'KYC document collection — Rakesh',   status: 'completed', completed_at: _now(-3), lead_id: null,          deal_id: 'demo-deal-1', assigned_to: 'demo-user-id', assigned_to_name: ADV[0] },
  { id: 'demo-act-4',  type: 'note',    subject: 'Medical test scheduled — Anjali',    status: 'completed', completed_at: _now(-5), lead_id: null,          deal_id: 'demo-deal-2', assigned_to: 'demo-user-id', assigned_to_name: ADV[1] },
  { id: 'demo-act-5',  type: 'call',    subject: 'Follow-up — Rohan endowment',        status: 'completed', completed_at: _now(-4), lead_id: 'demo-lead-3', deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[2] },
  { id: 'demo-act-6',  type: 'task',    subject: 'Send Saral Pension quote — Karthik', status: 'planned',   due_at: _now(2),        lead_id: null,          deal_id: 'demo-deal-5', assigned_to: 'demo-user-id', assigned_to_name: ADV[3] },
  { id: 'demo-act-7',  type: 'call',    subject: 'Premium renewal reminder — Sanjay',  status: 'completed', completed_at: _now(-1), lead_id: null,          deal_id: 'demo-deal-12',assigned_to: 'demo-user-id', assigned_to_name: ADV[1] },
  { id: 'demo-act-8',  type: 'email',   subject: 'Welcome kit — Karan (issued)',       status: 'completed', completed_at: _now(-6), lead_id: 'demo-lead-10',deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[0] },
  { id: 'demo-act-9',  type: 'meeting', subject: 'Group term review — Infosys BPM',    status: 'completed', completed_at: _now(-8), lead_id: null,          deal_id: 'demo-deal-10',assigned_to: 'demo-user-id', assigned_to_name: ADV[0] },
  { id: 'demo-act-10', type: 'task',    subject: 'Underwriting follow-up — Manish',    status: 'planned',   due_at: _now(1),        lead_id: null,          deal_id: 'demo-deal-6', assigned_to: 'demo-user-id', assigned_to_name: ADV[4] },
  { id: 'demo-act-11', type: 'call',    subject: 'Tele-calling — Tanvi (new lead)',    status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-9', deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[3] },
  { id: 'demo-act-12', type: 'note',    subject: 'Free-look explained — Aditya',       status: 'completed', completed_at: _now(-9), lead_id: 'demo-lead-11',deal_id: null,          assigned_to: 'demo-user-id', assigned_to_name: ADV[1] }
];

export const CRM_SOURCES = [
  { id: 'demo-src-1', name: 'Website',                cost_per_lead: 300, is_active: true },
  { id: 'demo-src-2', name: 'Bancassurance',          cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-3', name: 'Advisor / Agent',        cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-4', name: 'Referral',               cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-5', name: 'Web Aggregator',         cost_per_lead: 650, is_active: true },
  { id: 'demo-src-6', name: 'Branch Walk-in',         cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-7', name: 'Tele-calling',           cost_per_lead: 120, is_active: true }
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
  { stage: 'New Enquiry',        count: 32, value: 1_280_000 },
  { stage: 'Needs Analysis',    count: 24, value: 1_640_000 },
  { stage: 'Quote / Illustration', count: 16, value: 1_180_000 },
  { stage: 'Underwriting',      count: 9,  value: 720_000 },
  { stage: 'Policy Issued',     count: 6,  value: 1_098_000 }
];

export const CRM_WIN_RATE = ADV.map((name, i) => ({
  rep_id: 'demo-user-id', rep_name: name,
  won: 5 - i, lost: i, total_closed: Math.max(1, 5 - i + i),
  win_rate: Math.round((5 - i) / Math.max(1, 5) * 100),
  revenue: [480_000, 96_000, 60_000, 42_000, 0][i] || 0,
}));

export const CRM_FORECAST = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      period: d.toISOString().slice(0, 7),
      committed:  350_000 + i * 60_000,
      best_case:  640_000 + i * 90_000,
      pipeline:  1_280_000 + i * 120_000,
      target:    1_000_000,
    };
  });
})();

export const CRM_HEATMAP = (() => {
  const dows = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const out: Array<{ dow: string; hour: number; count: number }> = [];
  for (const dow of dows) {
    for (let h = 8; h < 20; h++) {
      const peak = dow !== 'Sun' && h >= 10 && h <= 18;
      out.push({ dow, hour: h, count: peak ? Math.round(3 + Math.random() * 12) : Math.round(Math.random() * 3) });
    }
  }
  return out;
})();

export const CRM_LEAD_SOURCE_ROI = CRM_SOURCES.map((s, i) => ({
  source_id: s.id, source_name: s.name,
  leads:     [14, 22, 18, 12, 9, 8, 16][i] ?? 6,
  qualified: [6,  12, 9,  7,  3, 4, 5][i]  ?? 2,
  won:       [3,  6,  5,  4,  1, 2, 1][i]  ?? 1,
  cost:      [14 * s.cost_per_lead, 0, 0, 0, 9 * s.cost_per_lead, 0, 16 * s.cost_per_lead][i] ?? 0,
  revenue:   [240_000, 480_000, 360_000, 180_000, 96_000, 120_000, 60_000][i] ?? 0,
}));

export const CRM_SCORE_DIST = [
  { bucket: '0-20',   count: 3 },
  { bucket: '21-40',  count: 6 },
  { bucket: '41-60',  count: 10 },
  { bucket: '61-80',  count: 15 },
  { bucket: '81-100', count: 11 }
];

export const CRM_SALES_CYCLE = [
  { stage: 'New Enquiry',          avg_days: 3 },
  { stage: 'Needs Analysis',       avg_days: 6 },
  { stage: 'Quote / Illustration', avg_days: 9 },
  { stage: 'Underwriting',         avg_days: 12 }
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
  { id: 'demo-terr-1', name: 'Mumbai Metro',     is_active: true },
  { id: 'demo-terr-2', name: 'Bengaluru Urban',  is_active: true },
  { id: 'demo-terr-3', name: 'Delhi NCR',        is_active: true }
];

// Aviva life products. unit_price = indicative annual premium (INR).
export const CRM_PRODUCTS = [
  { id: 'demo-prod-1', name: 'Aviva i-Life Term',            sku: 'AV-TERM',  unit_price: 12000,  unit: 'policy/yr', is_active: true },
  { id: 'demo-prod-2', name: 'Aviva Signature Investment (ULIP)', sku: 'AV-ULIP', unit_price: 60000, unit: 'policy/yr', is_active: true },
  { id: 'demo-prod-3', name: 'Aviva Health Secure',          sku: 'AV-HLTH',  unit_price: 18000,  unit: 'policy/yr', is_active: true },
  { id: 'demo-prod-4', name: 'Aviva Saral Pension',          sku: 'AV-PENS',  unit_price: 150000, unit: 'policy/yr', is_active: true },
  { id: 'demo-prod-5', name: 'Aviva Young Scholar (Child)',  sku: 'AV-CHILD', unit_price: 36000,  unit: 'policy/yr', is_active: true }
];

export const CRM_LEAD_VELOCITY = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const total = 40 + i * 7;
    const qualified = Math.round(total * (0.38 + i * 0.03));
    const prev = i === 0 ? null : Math.round((40 + (i - 1) * 7) * (0.38 + (i - 1) * 0.03));
    const mom = prev == null ? null : Math.round(((qualified - prev) / prev) * 1000) / 10;
    return { month: d.toISOString().slice(0, 7), total, qualified, mom_growth_pct: mom };
  });
})();

export const CRM_TIME_TO_FIRST_TOUCH = {
  avg_minutes: 36, median_minutes: 22, sla_breach_pct: 14.2, total: 138, breaches: 20, sla_minutes: 60,
  distribution: [
    { bucket: '<5m',    count: 31 },
    { bucket: '5-15m',  count: 44 },
    { bucket: '15-60m', count: 38 },
    { bucket: '1-4h',   count: 15 },
    { bucket: '4-24h',  count: 8 },
    { bucket: '>24h',   count: 2 }
  ],
};

export const CRM_STUCK_LEADS_KPI = {
  count_7d: 15, count_14d: 7, count_30d: 3,
  top_owners: [
    { owner_id: 'demo-user-id', count: 4 },
    { owner_id: 'demo-user-2',  count: 2 },
    { owner_id: 'demo-user-3',  count: 1 }
  ],
};

export const CRM_LOST_REASONS = [
  { reason: 'Premium too high',        count: 16 },
  { reason: 'Bought from competitor',  count: 12 },
  { reason: 'Failed underwriting',     count: 8 },
  { reason: 'Free-look cancellation',  count: 6 },
  { reason: 'Lost contact',            count: 5 },
  { reason: 'Not interested now',      count: 4 }
];

export const CRM_WON_REASONS = [
  { reason: 'Tax-saving need (80C)',     count: 14 },
  { reason: 'Trusted advisor',           count: 10 },
  { reason: 'Better illustration',       count: 8 },
  { reason: 'Family protection',         count: 6 },
  { reason: 'Bancassurance referral',    count: 4 }
];

export const CRM_DISQUAL_REASONS = [
  { reason: 'Age outside band',        count: 7 },
  { reason: 'Pre-existing condition',  count: 6 },
  { reason: 'Non-contactable',         count: 5 },
  { reason: 'Income proof missing',    count: 3 }
];

export const CRM_STAGE_CONVERSION = [
  { from_stage: 'New Enquiry',          to_stage: 'Needs Analysis',       entered: 52, advanced: 38, rate: 73.1 },
  { from_stage: 'Needs Analysis',       to_stage: 'Quote / Illustration', entered: 38, advanced: 25, rate: 65.8 },
  { from_stage: 'Quote / Illustration', to_stage: 'Application & KYC',    entered: 25, advanced: 16, rate: 64.0 },
  { from_stage: 'Application & KYC',     to_stage: 'Policy Issued',        entered: 16, advanced: 11, rate: 68.8 }
];

export const CRM_LEAD_AGING = [
  { bucket: '0-7d',   count: 16 },
  { bucket: '8-30d',  count: 20 },
  { bucket: '31-60d', count: 8 },
  { bucket: '60+d',   count: 4 }
];

export const CRM_COHORT_CONVERSION = (() => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const total = 30 + i * 4;
    const cells = Array.from({ length: 7 }, (_, age) => {
      const cumPct = Math.min(48, age * (7 + i));
      return { age_months: age, converted: Math.round(total * (cumPct / 100)), rate: cumPct };
    });
    return { cohort_month: d.toISOString().slice(0, 7), total, cells };
  });
})();

export const CRM_ENGAGEMENT_COMPARISON = {
  won:  { avg: 8.1, count: 16 },
  lost: { avg: 2.7, count: 22 }
};

export const CRM_DAYS_SINCE_TOUCH = [
  { bucket: '0d',     count: 9 },
  { bucket: '1-3d',   count: 18 },
  { bucket: '4-7d',   count: 12 },
  { bucket: '8-14d',  count: 6 },
  { bucket: '15-30d', count: 3 },
  { bucket: '30+d',   count: 2 }
];

export const CRM_SCORE_BAND_CONVERSION = [
  { band: '0-19',   total: 12, converted: 1,  rate: 8.3 },
  { band: '20-39',  total: 20, converted: 3,  rate: 15.0 },
  { band: '40-59',  total: 28, converted: 8,  rate: 28.6 },
  { band: '60-79',  total: 30, converted: 16, rate: 53.3 },
  { band: '80-100', total: 19, converted: 13, rate: 68.4 }
];

export const CRM_TERRITORY_CONVERSION = [
  { territory: 'Maharashtra', total: 44, converted: 16, rate: 36.4 },
  { territory: 'Karnataka',   total: 33, converted: 12, rate: 36.4 },
  { territory: 'Tamil Nadu',  total: 25, converted: 8,  rate: 32.0 },
  { territory: 'Delhi NCR',   total: 20, converted: 7,  rate: 35.0 },
  { territory: 'Gujarat',     total: 17, converted: 6,  rate: 35.3 },
  { territory: 'Telangana',   total: 13, converted: 5,  rate: 38.5 },
  { territory: 'West Bengal', total: 10, converted: 3,  rate: 30.0 }
];

export const CRM_TOUCHPOINTS_TO_RESPONSE = [
  { bucket: '1',  count: 14 },
  { bucket: '2',  count: 20 },
  { bucket: '3',  count: 15 },
  { bucket: '4',  count: 8 },
  { bucket: '5+', count: 10 },
  { bucket: 'No response', count: 21 }
];

export const CRM_LEADS_AT_RISK = [
  { lead_id: 'demo-lead-1',  name: 'Rakesh Sharma (Term Life ₹1Cr)',  score: 88, owner_id: 'demo-user-id', days_idle: 15 },
  { lead_id: 'demo-lead-4',  name: 'Neha Gupta (Young Scholar)',      score: 92, owner_id: 'demo-user-id', days_idle: 20 },
  { lead_id: 'demo-lead-7',  name: 'Manish Khanna (Term Life ₹75L)',  score: 81, owner_id: 'demo-user-id', days_idle: 17 },
  { lead_id: 'demo-lead-10', name: 'Karan Verma (Term Life ₹1Cr)',    score: 84, owner_id: 'demo-user-id', days_idle: 13 },
  { lead_id: 'demo-lead-11', name: 'Aditya Nair (Pension Plan)',      score: 78, owner_id: 'demo-user-id', days_idle: 21 }
];

// Widget layouts are vertical-agnostic — reuse the same grid as generic.
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
  { id: 'demo-wa-tpl-1', org_id: 'demo-org-999', meta_template_name: 'premium_reminder',  category: 'utility', language: 'en', status: 'approved', header_text: 'Premium Due',   body_text: 'Dear {{1}}, your Aviva policy {{2}} premium of ₹{{3}} is due on {{4}}. Pay now to keep your cover active.', footer_text: 'Aviva Life Insurance', variables: ['first_name', 'policy_no', 'amount', 'due_date'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'demo-wa-tpl-2', org_id: 'demo-org-999', meta_template_name: 'policy_issued',     category: 'utility', language: 'en', status: 'approved', header_text: 'Policy Issued', body_text: 'Congratulations {{1}}! Your Aviva {{2}} policy {{3}} is now active. Free-look period: 15 days.', footer_text: 'Aviva Life Insurance', variables: ['first_name', 'product', 'policy_no'], created_at: _now(-14), updated_at: _now(-14) },
  { id: 'demo-wa-tpl-3', org_id: 'demo-org-999', meta_template_name: 'kyc_pending',       category: 'utility', language: 'en', status: 'pending',  header_text: null,           body_text: 'Hi {{1}}, we need your KYC documents to issue your policy. Please share PAN & Aadhaar at your earliest.', footer_text: null, variables: ['first_name'], created_at: _now(-3),  updated_at: _now(-3) }
];

// ── Insurance CRM custom fields (lead + deal) ───────────────────────
export const CRM_CUSTOM_FIELDS_SEED: Array<Record<string, unknown>> = [
  { id: 'ins-cf-1', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'product_interest',  label: 'Product Interest',  field_type: 'select',   required: true,  position: 0, is_active: true, options: ['Term Life', 'ULIP', 'Endowment', 'Health', 'Child Plan', 'Pension'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-2', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'sum_assured',       label: 'Sum Assured',       field_type: 'currency', required: false, position: 1, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-3', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'annual_premium',    label: 'Annual Premium',    field_type: 'currency', required: false, position: 2, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-4', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'policy_term',       label: 'Policy Term (yrs)', field_type: 'number',   required: false, position: 3, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-5', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'premium_frequency', label: 'Premium Frequency', field_type: 'select',   required: false, position: 4, is_active: true, options: ['Monthly', 'Quarterly', 'Half-yearly', 'Annual', 'Single'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-6', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'smoker',            label: 'Smoker',            field_type: 'boolean',  required: false, position: 5, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-7', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'existing_cover',    label: 'Has Existing Cover',field_type: 'boolean',  required: false, position: 6, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-8', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'annual_income_band',label: 'Annual Income Band',field_type: 'select',   required: false, position: 7, is_active: true, options: ['< ₹5L', '₹5L–₹10L', '₹10L–₹25L', '₹25L–₹50L', '₹50L+'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-9', org_id: 'demo-org-999', client_id: null, entity_type: 'lead', field_key: 'nominee_relation',  label: 'Nominee Relationship',field_type: 'select', required: false, position: 8, is_active: true, options: ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-10', org_id: 'demo-org-999', client_id: null, entity_type: 'deal', field_key: 'policy_number',     label: 'Policy Number',     field_type: 'text',     required: false, position: 0, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-11', org_id: 'demo-org-999', client_id: null, entity_type: 'deal', field_key: 'underwriting_status',label: 'Underwriting Status',field_type: 'select', required: false, position: 1, is_active: true, options: ['Not Started', 'In Review', 'Counter-offer', 'Approved', 'Declined'], created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-12', org_id: 'demo-org-999', client_id: null, entity_type: 'deal', field_key: 'medical_required',  label: 'Medical Required',  field_type: 'boolean',  required: false, position: 2, is_active: true, created_at: _now(-30), updated_at: _now(-30) },
  { id: 'ins-cf-13', org_id: 'demo-org-999', client_id: null, entity_type: 'deal', field_key: 'payment_mode',      label: 'Payment Mode',      field_type: 'select',   required: false, position: 3, is_active: true, options: ['NACH', 'UPI Autopay', 'Net Banking', 'Cheque', 'Card'], created_at: _now(-30), updated_at: _now(-30) }
];

const INSURANCE_CUSTOM_FIELDS_KEY = 'kinematic_demo_custom_fields_insurance';

export function readDemoCustomFields(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return CRM_CUSTOM_FIELDS_SEED.slice();
  try {
    const raw = window.localStorage.getItem(INSURANCE_CUSTOM_FIELDS_KEY);
    if (!raw) return CRM_CUSTOM_FIELDS_SEED.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : CRM_CUSTOM_FIELDS_SEED.slice();
  } catch { return CRM_CUSTOM_FIELDS_SEED.slice(); }
}

export function writeDemoCustomFields(rows: Array<Record<string, unknown>>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(INSURANCE_CUSTOM_FIELDS_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}

// Insurance is a B2C book: hide B2B-only built-ins, relabel deal → policy.
export const CRM_SETTINGS = {
  business_type: 'b2c',
  default_currency: 'INR',
  default_pipeline_id: 'demo-pipe',
  config: {
    field_overrides: {
      'lead.company':  { hidden: true },
      'lead.title':    { hidden: true },
      'lead.industry': { hidden: true },
      'lead.city':     { label: 'City', required: true },
      'lead.date_of_birth': { label: 'Date of Birth', required: true },
      'deal.name':     { label: 'Policy Opportunity', required: true },
      'deal.amount':   { label: 'Annual Premium', required: true },
    },
    lead_scoring: {
      enabled: true,
      version: 2,
      grading: { A: 80, B: 60, C: 40, D: 0 },
    },
    notifications: { email_enabled: true, whatsapp_enabled: true, sms_enabled: true },
  },
};
