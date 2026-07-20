// Insurance-vertical field-force demo fixtures — Aviva Life Insurance.
//
// Self-contained, client-side demo data. Each function below mirrors the
// EXACT shape of its generic twin in `../factoriesA.ts` / `../factoriesB.ts`
// (and the `ROUTE_PLANS` const in `../../demoMocks.ts`) — same keys, same
// nesting, same `{ success: true, data }` wrappers — only the content is
// re-themed to a life-insurance field force: advisors/agents visiting
// policyholders, prospects and Aviva branches.
//
// "tff" is read here as "meaningful customer conversations".

const mockSummary = (date: string) => ({
  success: true,
  data: {
    date,
    kpis: {
      total_tff: 1248,
      total_engagements: 1560,
      tff_rate: 80,
      avg_attendance: 92,
      total_leaves: 4,
      total_days_worked: 26,
      total_hours_worked: 1840.5,
      active_sos: 0,
      open_grievances: 2,
    },
    top_performers: [
      { name: 'Arjun Sharma', zone: 'Bengaluru North Branch', tff: 142 },
      { name: 'Priya Patel', zone: 'Mumbai West Branch', tff: 138 },
      { name: 'Rahul Verma', zone: 'Delhi Central Branch', tff: 135 },
      { name: 'Sneha Rao', zone: 'Hyderabad South Branch', tff: 128 },
      { name: 'Amit Singh', zone: 'Pune East Branch', tff: 122 }
    ],
    zone_performance: [
      { zone: 'Bengaluru', tff: 450, target: 500 },
      { zone: 'Mumbai', tff: 380, target: 400 },
      { zone: 'Delhi', tff: 320, target: 350 },
      { zone: 'Chennai', tff: 280, target: 300 }
    ],
    total_executives: 145,
  }
});

const mockTrends = () => ({
  success: true,
  data: Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().split('T')[0],
      tff: 120 + Math.floor(Math.random() * 40),
      engagements: 150 + Math.floor(Math.random() * 50),
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    };
  })
});

const mockFeed = () => ({
  success: true,
  data: [
    { id: 'f1', time: new Date().toISOString(), description: 'Arjun Sharma submitted Needs Analysis', meta: { activity: 'Needs Analysis', outlet: 'Rakesh Sharma (Policyholder) – Andheri' } },
    { id: 'f2', time: new Date(Date.now() - 3600000).toISOString(), description: 'Priya Patel checked in', meta: { activity: 'Attendance', outlet: 'Aviva Branch – Bandra Kurla' } },
    { id: 'f3', time: new Date(Date.now() - 7200000).toISOString(), description: 'Rahul Verma submitted KYC Verification', meta: { activity: 'KYC Document Collection', outlet: 'Meena Iyer (Prospect) – Connaught Place' } },
    { id: 'f4', time: new Date(Date.now() - 10800000).toISOString(), description: 'Sneha Rao logged Premium Collection', meta: { activity: 'Premium Collection', outlet: 'Suresh Nair (Policyholder) – T Nagar' } },
    { id: 'f5', time: new Date(Date.now() - 14400000).toISOString(), description: 'Amit Singh checked out', meta: { activity: 'Attendance', outlet: 'Aviva Branch – Banjara Hills' } }
  ]
});

const mockHeatmap = () => ({
  success: true,
  data: {
    rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: (h >= 10 && h <= 18) ? Math.floor(Math.random() * 20) + 5 : Math.floor(Math.random() * 5)
      })),
      total: 150 + Math.floor(Math.random() * 100)
    })),
    summary: {
      peak_hour: '11:00',
      peak_hour_count: 45,
      peak_day: 'Wed',
      peak_day_count: 240,
      total_contacts: 1560
    }
  }
});

const mockDashboardInit = () => ({
  success: true,
  data: {
    attendance: { total: 145, present: 132, on_break: 5, checked_out: 4, absent: 4, regularised: 0 },
    kpis: { total_tff: 1248, avg_attendance: 92, open_grievances: 2 },
    weekly: { days: mockTrends().data, total_tff: 1248 }
  }
});

const mockLocations = () => ({
  success: true,
  data: {
    date: new Date().toISOString().split('T')[0],
    summary: { total: 15, active: 12, checked_out: 2, absent: 1 },
    locations: [
      { id: 'fe1', name: 'Arjun Sharma', role: 'executive', battery_percentage: 85, status: 'active', lat: 12.9352, lng: 77.6245, address: 'Koramangala 4th Block' },
      { id: 'fe2', name: 'Priya Patel', role: 'executive', battery_percentage: 42, status: 'active', lat: 12.9279, lng: 77.6271, address: 'Koramangala 5th Block' },
      { id: 'fe3', name: 'Rahul Verma', role: 'executive', battery_percentage: 91, status: 'on_break', lat: 12.9314, lng: 77.6189, address: 'Indiranagar Main Rd' },
      { id: 'fe4', name: 'Sneha Rao', role: 'executive', battery_percentage: 12, status: 'active', lat: 12.9401, lng: 77.6201, address: 'Sony World Signal' },
      { id: 'fe5', name: 'Amit Singh', role: 'senior_executive', battery_percentage: 77, status: 'checked_out', lat: 12.9378, lng: 77.6305, address: 'HSR Layout Sector 2' }
    ]
  }
});

const mockUsers = () => ({
  success: true,
  data: [
    { id: 'fe1', name: 'Arjun Sharma', employee_id: 'AV-001', email: 'arjun@demo.in', mobile: '9000000001', role: 'executive', city: 'Bengaluru', is_active: true, zones: { name: 'Bengaluru North Branch' },
      org_role_id: 'demo-role-adv',  org_role: { id: 'demo-role-adv',  name: 'Advisor' },
      assigned_cities: ['demo-city-bangalore'], assigned_city_names: ['Bengaluru'],
      kini_used_this_month: 4, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe2', name: 'Priya Patel',  employee_id: 'AV-002', email: 'priya@demo.in', mobile: '9000000002', role: 'executive', city: 'Mumbai',    is_active: true, zones: { name: 'Mumbai West Branch' },
      org_role_id: 'demo-role-adv',  org_role: { id: 'demo-role-adv',  name: 'Advisor' },
      assigned_cities: ['demo-city-mumbai'], assigned_city_names: ['Mumbai'],
      kini_used_this_month: 11, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe3', name: 'Rahul Verma',  employee_id: 'AV-003', email: 'rahul@demo.in', mobile: '9000000003', role: 'executive', city: 'Delhi',     is_active: true, zones: { name: 'Delhi Central Branch' },
      org_role_id: 'demo-role-sm',   org_role: { id: 'demo-role-sm',   name: 'Sales Manager' },
      assigned_cities: ['demo-city-delhi','demo-city-noida','demo-city-gurugram'], assigned_city_names: ['Delhi','Noida','Gurugram'],
      kini_used_this_month: 7, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe4', name: 'Sneha Rao',    employee_id: 'AV-004', email: 'sneha@demo.in', mobile: '9000000004', role: 'supervisor', city: 'Hyderabad', is_active: true, zones: { name: 'Hyderabad Branch' },
      org_role_id: 'demo-role-bm',   org_role: { id: 'demo-role-bm',   name: 'Branch Manager' },
      assigned_cities: ['demo-city-hyderabad','demo-city-bangalore'], assigned_city_names: ['Hyderabad','Bengaluru'],
      kini_used_this_month: 18, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe5', name: 'Amit Singh',   employee_id: 'AV-005', email: 'amit@demo.in',  mobile: '9000000005', role: 'executive', city: 'Pune',      is_active: true, zones: { name: 'Pune Branch' },
      org_role_id: 'demo-role-adv',  org_role: { id: 'demo-role-adv',  name: 'Advisor' },
      assigned_cities: ['demo-city-pune'], assigned_city_names: ['Pune'],
      kini_used_this_month: 2, kini_monthly_cap: 20, permissions: [] }
  ]
});

const mockAttendanceTeam = () => ({
  success: true,
  data: [
    {
      id: 'fe1', name: 'Arjun Sharma', display_status: 'present', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:15:00Z'),
      total_hours: 4.5,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
      checkin_address: 'Koramangala 4th Block, Bengaluru',
      checkin_lat: 12.9352, checkin_lng: 77.6245,
      zones: { name: 'Bengaluru North Branch' },
      users: { name: 'Arjun Sharma', employee_id: 'AV-001', zones: { name: 'Bengaluru North Branch' } }
    },
    {
      id: 'fe2', name: 'Priya Patel', display_status: 'present', status: 'checked_out',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:30:00Z'),
      checkout_at: new Date().toISOString().replace(/T.*/, 'T18:30:00Z'),
      total_hours: 9.0,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      checkout_selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      checkin_address: 'Mumbai West, Near Station',
      checkin_lat: 19.0760, checkin_lng: 72.8777,
      checkout_lat: 19.0765, checkout_lng: 72.8780,
      zones: { name: 'Mumbai West Branch' },
      users: { name: 'Priya Patel', employee_id: 'AV-002', zones: { name: 'Mumbai West Branch' } }
    },
    {
      id: 'fe3', name: 'Rahul Verma', display_status: 'on_break', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:00:00Z'),
      total_hours: 4.8,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      checkin_address: 'Delhi Central, Connaught Place',
      checkin_lat: 28.6139, checkin_lng: 77.2090,
      zones: { name: 'Delhi Central Branch' },
      users: { name: 'Rahul Verma', employee_id: 'AV-003', zones: { name: 'Delhi Central Branch' } }
    },
    {
      id: 'fe4', name: 'Sneha Rao', display_status: 'present', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:45:00Z'),
      total_hours: 4.1,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
      checkin_address: 'Hitech City, Hyderabad',
      checkin_lat: 17.4474, checkin_lng: 78.3762,
      zones: { name: 'Hyderabad Branch' },
      users: { name: 'Sneha Rao', employee_id: 'AV-004', zones: { name: 'Hyderabad Branch' } }
    },
    {
      id: 'fe5', name: 'Amit Singh', display_status: 'present', status: 'checked_out',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:05:00Z'),
      checkout_at: new Date().toISOString().replace(/T.*/, 'T17:50:00Z'),
      total_hours: 8.75,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
      checkout_selfie_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&sat=-20',
      checkin_address: 'Baner Road, Pune',
      checkin_lat: 18.5590, checkin_lng: 73.7868,
      checkout_lat: 18.5204, checkout_lng: 73.8567,
      zones: { name: 'Pune Branch' },
      users: { name: 'Amit Singh', employee_id: 'AV-005', zones: { name: 'Pune Branch' } }
    }
  ]
});

const mockStores = () => ({
  success: true,
  data: [
    { id: 'st1', name: 'Rakesh Sharma (Policyholder) – Andheri', code: 'PH-001', address: 'Lokhandwala, Andheri West', city: 'Mumbai', zones: { name: 'Mumbai West Branch' } },
    { id: 'st2', name: 'Aviva Branch – Bandra Kurla', code: 'BR-042', address: 'BKC, Bandra East', city: 'Mumbai', zones: { name: 'Mumbai West Branch' } },
    { id: 'st3', name: 'Meena Iyer (Prospect) – Koramangala', code: 'PR-109', address: 'Koramangala 5th Block', city: 'Bengaluru', zones: { name: 'Bengaluru North Branch' } }
  ]
});

const mockFormTemplates = () => ({
  success: true,
  data: [
    { id: 't1', name: 'Customer Needs Analysis', description: 'Capture goals, dependents and protection gap', fields_count: 12, created_at: new Date().toISOString() },
    { id: 't2', name: 'KYC Verification', description: 'PAN / Aadhaar / address proof capture', fields_count: 8, created_at: new Date().toISOString() },
    { id: 't3', name: 'Policy Renewal Visit', description: 'Renewal confirmation and premium mode', fields_count: 6, created_at: new Date().toISOString() },
    { id: 't4', name: 'Claim Documentation', description: 'Collect claim forms and supporting docs', fields_count: 9, created_at: new Date().toISOString() },
    { id: 't5', name: 'Free Look Confirmation', description: 'Free-look period acknowledgement', fields_count: 4, created_at: new Date().toISOString() }
  ]
});

const mockActivities = () => ({
  success: true,
  data: [
    { id: 'a1', name: 'Needs Analysis', type: 'survey', points: 15 },
    { id: 'a2', name: 'KYC Document Collection', type: 'compliance', points: 10 },
    { id: 'a3', name: 'Premium Collection', type: 'collection', points: 25 }
  ]
});

const mockVisitLogs = () => {
  const today = new Date().toISOString().split('T')[0];
  const visitedAt = (offsetHours: number) => new Date(Date.now() - offsetHours * 3600000).toISOString();
  const PH = 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=400&q=60';
  return {
    success: true,
    data: [
      { id: 'v1', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Thorough needs analysis. Protection gap quantified, term plan illustration shared.', visited_at: visitedAt(1), visit_response_at: visitedAt(0.5), visit_response: 'Thanks sir, follow-up call scheduled to close term plan.', date: today, stores: { name: 'Rakesh Sharma (Policyholder) – Andheri' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v2', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'KYC docs collected. Push ULIP top-up at next renewal touchpoint.', visited_at: visitedAt(3), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Aviva Branch – Bandra Kurla' }, visit_outlet_id: 'st2', photo_url: PH },
      { id: 'v3', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'Prospect undecided on sum assured. Re-illustrate with rider options.', visited_at: visitedAt(5), visit_response_at: visitedAt(4), visit_response: 'Revised illustration shared on WhatsApp.', date: today, stores: { name: 'Meena Iyer (Prospect) – Koramangala' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v4', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Excellent', remarks: 'Strong persistency conversation. Renewal collected, auto-debit enabled.', visited_at: visitedAt(8), visit_response_at: visitedAt(7), visit_response: 'Targeting two referrals this month.', date: today, stores: { name: 'Suresh Nair (Policyholder) – T Nagar' }, visit_outlet_id: 'st4', photo_url: PH },
      { id: 'v5', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Poor', remarks: 'Policyholder not at home at 11:30 - re-visit tomorrow first.', visited_at: visitedAt(10), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Aviva Branch – Banjara Hills' }, visit_outlet_id: 'st5', photo_url: null },
      { id: 'v6', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Good', remarks: 'Maturity servicing done well. Pitch reinvestment annuity next.', visited_at: visitedAt(14), visit_response_at: visitedAt(12), visit_response: 'Annuity illustration planned for next visit cycle.', date: today, stores: { name: 'Priya Menon (Policyholder) – Lokhandwala' }, visit_outlet_id: 'st6', photo_url: PH },
      { id: 'v7', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Excellent', remarks: 'Branch onboarding discipline perfect. Recommend for advisor-of-month.', visited_at: visitedAt(20), visit_response_at: visitedAt(18), visit_response: 'Thank you sir.', date: today, stores: { name: 'Aviva Branch – Linking Road' }, visit_outlet_id: 'st7', photo_url: PH },
      { id: 'v8', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'Renewal lapse risk on policy 88xx. Trigger urgent retention call.', visited_at: visitedAt(24), visit_response_at: visitedAt(22), visit_response: 'Retention case RC-9930 raised, callback in 48 hours.', date: today, stores: { name: 'Ramesh Gupta (Policyholder) – Bandra East' }, visit_outlet_id: 'st8', photo_url: PH },
      { id: 'v9', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Good', remarks: 'Prospect relationship strong, agreed to medical for underwriting.', visited_at: visitedAt(28), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Kavita Joshi (Prospect) – Khar West' }, visit_outlet_id: 'st9', photo_url: null },
      { id: 'v10', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Claim assistance handled with empathy. Best advisor visit this zone today.', visited_at: visitedAt(32), visit_response_at: visitedAt(30), visit_response: 'Will replicate claims SOP at 3 other policyholders next week.', date: today, stores: { name: 'Meena Iyer (Prospect) – Connaught Place' }, visit_outlet_id: 'st10', photo_url: PH },
      { id: 'v11', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'KYC for branch walk-in complete. Suggest cross-sell health rider.', visited_at: visitedAt(36), visit_response_at: visitedAt(34), visit_response: 'Will coordinate with branch ops.', date: today, stores: { name: 'Aviva Branch – CP Inner Circle' }, visit_outlet_id: 'st11', photo_url: PH },
      { id: 'v12', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'Prospect cold on ULIP - need scheme review and simpler pitch.', visited_at: visitedAt(40), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Anil Khanna (Prospect) – Khan Market' }, visit_outlet_id: 'st12', photo_url: PH },
      { id: 'v13', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Excellent', remarks: 'Illustration walkthrough crisp - closed term plan during 25min visit.', visited_at: visitedAt(44), visit_response_at: visitedAt(42), visit_response: 'Thanks, will share proposal forms with team.', date: today, stores: { name: 'Rakesh Sharma (Policyholder) – Andheri' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v14', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Good', remarks: 'Free-look explained clearly. Push health rider add-on too.', visited_at: visitedAt(48), visit_response_at: visitedAt(46), visit_response: 'Health rider added to next proposal.', date: today, stores: { name: 'Meena Iyer (Prospect) – Koramangala' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v15', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Branch desk fully compliant. KYC pipeline clean.', visited_at: visitedAt(56), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Aviva Branch – Bandra Kurla' }, visit_outlet_id: 'st2', photo_url: PH },
      { id: 'v16', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'Policyholder asked for premium-mode change - confirmed via Q3 brief.', visited_at: visitedAt(64), visit_response_at: visitedAt(62), visit_response: 'Mode-change form sent to customer WhatsApp.', date: today, stores: { name: 'Priya Menon (Policyholder) – Lokhandwala' }, visit_outlet_id: 'st6', photo_url: PH },
      { id: 'v17', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Sales Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'CP branch walk-ins dipped - need festival campaign push.', visited_at: visitedAt(72), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Aviva Branch – CP Inner Circle' }, visit_outlet_id: 'st11', photo_url: PH },
      { id: 'v18', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Branch Manager', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Good', remarks: 'Persistency conversations solid - push higher-cover plans.', visited_at: visitedAt(80), visit_response_at: visitedAt(76), visit_response: 'Targeting protection and annuity next cycle.', date: today, stores: { name: 'Suresh Nair (Policyholder) – T Nagar' }, visit_outlet_id: 'st4', photo_url: PH }
    ]
  };
};

// Realistic ID-document images so the KYC answers render as photo thumbnails
// (Aadhaar / PAN proof captured on the visit).
const AADHAAR_IMG = 'https://images.unsplash.com/photo-1614064642639-e8b0c2f2b1f7?auto=format&fit=crop&w=640&q=70';
const PAN_IMG     = 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=640&q=70';
const SELFIE_IMG  = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=70';

// Build a submission with check-in/out timestamps (so the page's duration
// shows a real "Xm", not 0m) and KYC document answers (Aadhaar/PAN photos).
const mkSub = (
  id: string, agoMin: number, durMin: number, converted: boolean,
  customer: string, advisor: string, employee_id: string,
  form: string, activity: string, address: string, withDocs: boolean,
) => {
  const start = new Date(Date.now() - agoMin * 60000).toISOString();
  const end = new Date(Date.now() - (agoMin - durMin) * 60000).toISOString();
  const answers = withDocs
    ? [
        { label: 'Customer Name', qtype: 'short_text', value: customer.split(' (')[0] },
        { label: 'Aadhaar Card', qtype: 'image', value: AADHAAR_IMG },
        { label: 'PAN Card', qtype: 'image', value: PAN_IMG },
        { label: 'Customer Selfie', qtype: 'image', value: SELFIE_IMG },
        { label: 'KYC Verified', qtype: 'yes_no', value: true },
      ]
    : [
        { label: 'Protection Gap (₹)', qtype: 'number', value: 5000000 },
        { label: 'Dependents', qtype: 'number', value: 2 },
        { label: 'Recommended Product', qtype: 'short_text', value: 'Aviva i-Life Term' },
      ];
  return {
    id, submitted_at: end, is_converted: converted,
    outlet_name: `${customer} – ${address}`,
    users: { name: advisor, employee_id },
    activities: { name: activity },
    form_templates: { name: form },
    builder_forms: { id: `bf-${id}`, title: form },
    check_in_at: start, check_out_at: end,
    address,
    answers,
    form_responses: answers.map((a) => ({ builder_questions: { label: a.label, qtype: a.qtype }, value_text: typeof a.value === 'string' ? a.value : String(a.value), photo_url: a.qtype === 'image' ? a.value : undefined })),
  };
};

const mockSubmissions = () => ({
  success: true,
  total: 1560,
  data: [
    mkSub('s1', 95,  38, true,  'Rakesh Sharma (Policyholder)', 'Arjun Sharma', 'AV-001', 'Customer Needs Analysis', 'Needs Analysis',          'Andheri West, Mumbai',   false),
    mkSub('s2', 180, 26, false, 'Walk-in Customer',             'Priya Patel',  'AV-002', 'KYC Verification',        'KYC Document Collection', 'Bandra Kurla, Mumbai',   true),
    mkSub('s3', 240, 42, true,  'Meena Iyer (Prospect)',        'Rahul Verma',  'AV-003', 'Customer Needs Analysis', 'Needs Analysis',          'Koramangala, Bengaluru', false),
    mkSub('s4', 320, 21, true,  'Suresh Nair (Policyholder)',   'Sneha Rao',    'AV-004', 'Policy Renewal Visit',    'Policy Renewal Visit',    'T Nagar, Chennai',       false),
    mkSub('s5', 410, 33, false, 'Anil Khanna (Prospect)',       'Amit Singh',   'AV-005', 'Claim Documentation',     'Claim Assistance',        'Khan Market, Delhi',     true),
    mkSub('s6', 520, 29, true,  'Kavita Joshi (Prospect)',      'Rahul Verma',  'AV-003', 'KYC Verification',        'KYC Document Collection', 'Khar West, Mumbai',      true),
  ]
});

const mockWeeklyContacts = () => ({
  success: true,
  data: {
    days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const tff = 120 + Math.floor(Math.random() * 50);
      return {
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        short_label: d.toLocaleDateString('en-IN', { weekday: 'short' }).substring(0, 1),
        tff,
        engagements: tff + Math.floor(Math.random() * 60),
        tff_rate: 78 + Math.floor(Math.random() * 12),
      };
    }),
    total_tff: 1248, total_cc: 1560,
  }
});

// NOTE: the dashboard City-wise Performance table reads active_fes / checkins /
// unique_outlets / zones (NOT fes / check_ins / outlets) — for insurance these
// read as advisors / customer visits / policies serviced.
const mockCityPerformance = () => ({
  success: true,
  data: {
    cities: [
      { city: 'Mumbai',    zones: 6, active_fes: 32, checkins: 118, tff: 380, unique_outlets: 240 },
      { city: 'Bengaluru', zones: 5, active_fes: 38, checkins: 132, tff: 450, unique_outlets: 280 },
      { city: 'Delhi',     zones: 4, active_fes: 28, checkins: 102, tff: 320, unique_outlets: 195 },
      { city: 'Chennai',   zones: 3, active_fes: 22, checkins:  84, tff: 280, unique_outlets: 168 },
      { city: 'Pune',      zones: 3, active_fes: 18, checkins:  68, tff: 215, unique_outlets: 130 },
      { city: 'Hyderabad', zones: 2, active_fes: 14, checkins:  52, tff: 168, unique_outlets: 102 }
    ]
  }
});

const mockOutletCoverage = () => ({
  success: true,
  data: {
    universe: 1350, covered: 892, coverage_pct: 66,
    by_city: [
      { city: 'Bengaluru', universe: 320, covered: 240 },
      { city: 'Mumbai',    universe: 280, covered: 198 },
      { city: 'Delhi',     universe: 240, covered: 158 },
      { city: 'Chennai',   universe: 200, covered: 132 },
      { city: 'Pune',      universe: 170, covered: 105 },
      { city: 'Hyderabad', universe: 140, covered:  59 }
    ]
  }
});

const mockBroadcasts = () => ({
  success: true,
  data: [
    { id: 'b1', title: 'Q3 Persistency Push',              body: 'Renewal premium-collection drive live. Target 90% 13th-month persistency - see attached deck.', sent_at: new Date(Date.now() - 1*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 132 },
    { id: 'b2', title: 'Monsoon Travel Advisory',          body: 'Carry rain gear for customer home visits. Reschedule low-floor areas in Mumbai West.',         sent_at: new Date(Date.now() - 3*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 140 },
    { id: 'b3', title: 'New ULIP NFO live',                body: 'Aviva Wealth Builder NFO open from tomorrow. Use the latest illustration tool for pitches.',  sent_at: new Date(Date.now() - 5*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 121 },
    { id: 'b4', title: 'Diwali Greetings',                 body: 'Wishing all advisors and their families a safe and prosperous Diwali. 2-day bonus credited.',  sent_at: new Date(Date.now() - 10*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 144 },
    { id: 'b5', title: 'IRDAI KYC circular',              body: 'Updated e-KYC norms effective Monday. Re-verify pending proposals before submission.',         sent_at: new Date(Date.now() - 14*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 138 },
    { id: 'b6', title: 'Advisor App Update',               body: 'Kinematic app v4.2 released - please update from Play Store before next field visit.',         sent_at: new Date(Date.now() - 18*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 145 },
    { id: 'b7', title: 'Festival Scheme - Term Plans',     body: 'Extra reward points on term-plan logins Oct 20 - Nov 5. Prioritise need-based selling.',       sent_at: new Date(Date.now() - 22*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 128 },
    { id: 'b8', title: 'Safety Bulletin',                  body: 'Always file SOS via app for any roadside incident during field visits. Two-wheeler insurance verified.', sent_at: new Date(Date.now() - 28*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 141 }
  ]
});

const mockBroadcastAdmin = () => {
  const _at = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  return {
    success: true,
    data: [
      { id: 'bq1', question: "Did you complete today's customer visits as per route plan?", options: [{ label: 'Yes, fully', value: 'yes' }, { label: 'Partially', value: 'partial' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-1), status: 'active',  target_roles: ['executive'],               target_zone_ids: [], target_cities: ['Bengaluru', 'Mumbai'], created_at: _at(0.2), response_count: 78,  tally: [{ label: 'Yes, fully', index: 0, count: 58 }, { label: 'Partially', index: 1, count: 16 }, { label: 'No', index: 2, count: 4 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'AV-001', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.1) }, { user_name: 'Priya Patel', employee_id: 'AV-002', selected_label: 'Partially', selected_index: 1, is_correct: null, answered_at: _at(0.15) }, { user_name: 'Rahul Verma', employee_id: 'AV-003', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.18) }] },
      { id: 'bq2', question: 'Quiz: Free-look period for life insurance policies?', options: [{ label: '7 days', value: '7' }, { label: '15 days', value: '15' }, { label: '30 days', value: '30' }, { label: '45 days', value: '45' }], correct_option: 1, is_urgent: false, deadline_at: _at(-3), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(2), response_count: 132, tally: [{ label: '7 days', index: 0, count: 8 }, { label: '15 days', index: 1, count: 96 }, { label: '30 days', index: 2, count: 22 }, { label: '45 days', index: 3, count: 6 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'AV-001', selected_label: '15 days', selected_index: 1, is_correct: true, answered_at: _at(1.9) }, { user_name: 'Sneha Rao', employee_id: 'AV-004', selected_label: '30 days', selected_index: 2, is_correct: false, answered_at: _at(1.7) }] },
      { id: 'bq3', question: "URGENT: Are you safe given today's Mumbai rains?", options: [{ label: 'I am safe', value: 'safe' }, { label: 'Need help', value: 'help' }], correct_option: null, is_urgent: true, deadline_at: _at(-5), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: ['Mumbai'], created_at: _at(5), response_count: 42, tally: [{ label: 'I am safe', index: 0, count: 40 }, { label: 'Need help', index: 1, count: 2 }], responses: [{ user_name: 'Priya Patel', employee_id: 'AV-002', selected_label: 'I am safe', selected_index: 0, is_correct: null, answered_at: _at(4.9) }, { user_name: 'Manish Kumar', employee_id: 'SUP-001', selected_label: 'Need help', selected_index: 1, is_correct: null, answered_at: _at(4.8) }] },
      { id: 'bq4', question: 'Which product saw most prospect interest this week?', options: [{ label: 'Term Plan', value: 'term' }, { label: 'ULIP', value: 'ulip' }, { label: 'Annuity', value: 'annuity' }, { label: 'None', value: 'none' }], correct_option: null, is_urgent: false, deadline_at: _at(-7), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(7), response_count: 124, tally: [{ label: 'Term Plan', index: 0, count: 38 }, { label: 'ULIP', index: 1, count: 22 }, { label: 'Annuity', index: 2, count: 12 }, { label: 'None', index: 3, count: 52 }], responses: [] },
      { id: 'bq5', question: 'Diwali festival hamper preference for advisor incentive?', options: [{ label: 'Sweets pack', value: 'sweets' }, { label: 'Dry fruits', value: 'dry' }, { label: 'Voucher', value: 'voucher' }], correct_option: null, is_urgent: false, deadline_at: _at(-12), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(12), response_count: 143, tally: [{ label: 'Sweets pack', index: 0, count: 28 }, { label: 'Dry fruits', index: 1, count: 36 }, { label: 'Voucher', index: 2, count: 79 }], responses: [] },
      { id: 'bq6', question: 'Are you using the new Needs-Analysis v2 form?', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-18), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(18), response_count: 138, tally: [{ label: 'Yes', index: 0, count: 119 }, { label: 'No', index: 1, count: 19 }], responses: [] },
      { id: 'bq7', question: 'Did your phone receive the Kinematic app v4.2 update?', options: [{ label: 'Updated', value: 'updated' }, { label: 'Pending', value: 'pending' }, { label: 'Issue', value: 'issue' }], correct_option: null, is_urgent: false, deadline_at: _at(-22), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(22), response_count: 145, tally: [{ label: 'Updated', index: 0, count: 132 }, { label: 'Pending', index: 1, count: 9 }, { label: 'Issue', index: 2, count: 4 }], responses: [] }
    ]
  };
};

const mockLearningMaterials = () => ({
  success: true,
  data: [
    { id: 'l1', title: 'IRDAI Compliance 101',                  category: 'Compliance', updated_at: new Date(Date.now() - 30*86400000).toISOString(), kind: 'pdf' },
    { id: 'l2', title: 'Term vs ULIP — Advisor Guide',           category: 'Product',    updated_at: new Date(Date.now() - 14*86400000).toISOString(), kind: 'video' },
    { id: 'l3', title: 'Ethical Selling & Mis-selling Avoidance', category: 'Compliance', updated_at: new Date(Date.now() - 60*86400000).toISOString(), kind: 'pdf' },
    { id: 'l4', title: 'Need-Based Selling',                     category: 'Sales',      updated_at: new Date(Date.now() - 21*86400000).toISOString(), kind: 'video' },
    { id: 'l5', title: 'Claims Process Walkthrough',             category: 'Process',    updated_at: new Date(Date.now() - 45*86400000).toISOString(), kind: 'pdf' }
  ]
});

const mockMobileHome = () => ({
  success: true,
  data: { tff_today: 14, attendance_status: 'checked_in', kpis: { tff: 14, hours: 6.5 } }
});

const ROUTE_PLANS = (() => {
  const fes = [
    { id: 'demo-fe-1', name: 'Arjun Sharma',   employee_id: 'AV-1042', mobile: '+91 98201 11111', zone: 'Mumbai West Branch',      city: 'Mumbai' },
    { id: 'demo-fe-2', name: 'Priya Patel',    employee_id: 'AV-1051', mobile: '+91 98202 22222', zone: 'Bengaluru North Branch',  city: 'Bengaluru' },
    { id: 'demo-fe-3', name: 'Rahul Verma',    employee_id: 'AV-1063', mobile: '+91 98203 33333', zone: 'Delhi Central Branch',    city: 'Delhi' },
    { id: 'demo-fe-4', name: 'Sneha Rao',      employee_id: 'AV-1078', mobile: '+91 98204 44444', zone: 'Chennai South Branch',    city: 'Chennai' },
    { id: 'demo-fe-5', name: 'Amit Singh',     employee_id: 'AV-1085', mobile: '+91 98205 55555', zone: 'Hyderabad East Branch',   city: 'Hyderabad' },
    { id: 'demo-fe-6', name: 'Karthik Pillai', employee_id: 'AV-1092', mobile: '+91 98206 66666', zone: 'Pune Central Branch',     city: 'Pune' },
    { id: 'demo-fe-7', name: 'Pooja Joshi',    employee_id: 'AV-1107', mobile: '+91 98207 77777', zone: 'Ahmedabad West Branch',   city: 'Ahmedabad' },
    { id: 'demo-fe-8', name: 'Manish Khanna',  employee_id: 'AV-1118', mobile: '+91 98208 88888', zone: 'Kolkata North Branch',    city: 'Kolkata' },
  ];
  const cityCoords: Record<string, [number, number]> = {
    Mumbai: [19.0760, 72.8777], Bengaluru: [12.9716, 77.5946], Delhi: [28.6139, 77.2090],
    Chennai: [13.0827, 80.2707], Hyderabad: [17.3850, 78.4867], Pune: [18.5204, 73.8567],
    Ahmedabad: [23.0225, 72.5714], Kolkata: [22.5726, 88.3639],
  };
  const storeNames = ['Rakesh Sharma (Policyholder)', 'Meena Iyer (Prospect)', 'Aviva Branch', 'Suresh Nair (Policyholder)', 'Kavita Joshi (Prospect)', 'Ramesh Gupta (Policyholder)', 'Anil Khanna (Prospect)', 'Priya Menon (Policyholder)', 'Deepa Reddy (Prospect)', 'Vikram Rao (Policyholder)'];
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
        target_type: ['renewal', 'kyc', 'needs_analysis', 'claim'][j % 4],
        target_notes: ['Collect renewal premium', 'Capture KYC documents', 'Run protection-gap needs analysis', 'Assist with claim documentation'][j % 4],
        target_value: 8500 + j * 2200,
        status: outletStatus,
        checkin_at:  outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000).toISOString() : undefined,
        checkout_at: outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000 + 25 * 60000).toISOString() : undefined,
        order_amount: outletStatus === 'visited' ? 6500 + j * 1850 : undefined,
        actual_duration_min: outletStatus === 'visited' ? 20 + (j * 4) % 18 : undefined,
        planned_duration_min: 25,
        store_id: `demo-store-${i}-${j}`,
        store_name: `${storeNames[(i + j) % storeNames.length]} - ${fe.city} ${j + 1}`,
        store_code: `CUS-${String(20000 + i * 10 + j).padStart(5, '0')}`,
        store_address: `${j + 1}, ${['MG Road', 'Park Street', 'Linking Road', 'FC Road', 'Brigade Road'][j % 5]}, ${fe.city}`,
        store_type: ['policyholder', 'prospect', 'branch'][j % 3],
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
      notes: i % 4 === 0 ? 'Persistency beat — push renewals and referrals' : undefined,
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

export const INSURANCE_FIELD = {
  mockSummary, mockTrends, mockFeed, mockHeatmap, mockDashboardInit,
  mockLocations, mockUsers, mockAttendanceTeam, mockStores, mockFormTemplates,
  mockActivities, mockSubmissions, mockVisitLogs,
  mockCityPerformance, mockOutletCoverage, mockWeeklyContacts,
  mockBroadcasts, mockBroadcastAdmin, mockLearningMaterials, mockMobileHome,
  ROUTE_PLANS,
};
