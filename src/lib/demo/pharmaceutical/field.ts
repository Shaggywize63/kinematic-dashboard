// Pharmaceutical-vertical field-force demo fixtures — Vireon Pharma India.
//
// Self-contained, client-side demo data. Each function below mirrors the
// EXACT shape of its generic twin in `../factoriesA.ts` / `../factoriesB.ts`
// (and the `ROUTE_PLANS` const in `../../demoMocks.ts`) — same keys, same
// nesting, same `{ success: true, data }` wrappers — only the content is
// re-themed to a pharma field force: Medical Representatives (MRs) visiting
// HCPs (Healthcare Practitioners), hospitals, and pharmacy chains.
//
// "tff" is read here as "meaningful detailing conversations" (HCP touchpoints).

const mockSummary = (date: string) => ({
  success: true,
  data: {
    date,
    kpis: {
      total_tff: 1456,
      total_engagements: 1820,
      tff_rate: 80,
      avg_attendance: 94,
      total_leaves: 3,
      total_days_worked: 26,
      total_hours_worked: 1920.5,
      active_sos: 0,
      open_grievances: 1,
    },
    top_performers: [
      { name: 'Arjun Sharma', zone: 'Bengaluru — South', tff: 158 },
      { name: 'Priya Patel',  zone: 'Mumbai — West',     tff: 152 },
      { name: 'Rahul Verma',  zone: 'Delhi — Central',   tff: 148 },
      { name: 'Sneha Rao',    zone: 'Hyderabad — South', tff: 142 },
      { name: 'Amit Singh',   zone: 'Pune — East',       tff: 136 }
    ],
    zone_performance: [
      { zone: 'Bengaluru', tff: 510, target: 540 },
      { zone: 'Mumbai',    tff: 430, target: 460 },
      { zone: 'Delhi',     tff: 360, target: 400 },
      { zone: 'Chennai',   tff: 300, target: 320 }
    ],
    total_executives: 160,
  }
});

const mockTrends = () => ({
  success: true,
  data: Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().split('T')[0],
      tff: 140 + Math.floor(Math.random() * 45),
      engagements: 175 + Math.floor(Math.random() * 55),
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    };
  })
});

const mockFeed = () => ({
  success: true,
  data: [
    { id: 'f1', time: new Date().toISOString(),                          description: 'Arjun Sharma submitted HCP Detailing Form',     meta: { activity: 'Glucanova Detailing',        outlet: 'Dr. Anil Mehta (Endocrinology) – Sunrise Andheri' } },
    { id: 'f2', time: new Date(Date.now() - 3600000).toISOString(),      description: 'Priya Patel checked in',                         meta: { activity: 'In-Clinic Visit',           outlet: 'Meridian Hospital — Bengaluru' } },
    { id: 'f3', time: new Date(Date.now() - 7200000).toISOString(),      description: 'Rahul Verma submitted Sample Drop',              meta: { activity: 'Sampling',                  outlet: 'Dr. Neha Gupta (Endocrinology) – AIIMS Delhi' } },
    { id: 'f4', time: new Date(Date.now() - 10800000).toISOString(),     description: 'Sneha Rao logged Oncevia CME Invitation',      meta: { activity: 'CME Outreach',              outlet: 'Dr. R. K. Tandon – Metropolis Cancer Centre' } },
    { id: 'f5', time: new Date(Date.now() - 14400000).toISOString(),     description: 'Amit Singh checked out',                         meta: { activity: 'Field Visit',               outlet: 'Sunrise Pharmacy — Banjara Hills' } }
  ]
});

const mockHeatmap = () => ({
  success: true,
  data: {
    rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: ((h >= 10 && h <= 13) || (h >= 17 && h <= 20)) ? Math.floor(Math.random() * 22) + 6 : Math.floor(Math.random() * 4)
      })),
      total: 170 + Math.floor(Math.random() * 110)
    })),
    summary: {
      peak_hour: '11:00',
      peak_hour_count: 52,
      peak_day: 'Wed',
      peak_day_count: 275,
      total_contacts: 1820
    }
  }
});

const mockDashboardInit = () => ({
  success: true,
  data: {
    attendance: { total: 160, present: 148, on_break: 4, checked_out: 5, absent: 3, regularised: 0 },
    kpis: { total_tff: 1456, avg_attendance: 94, open_grievances: 1 },
    weekly: { days: mockTrends().data, total_tff: 1456 }
  }
});

const mockLocations = () => ({
  success: true,
  data: {
    date: new Date().toISOString().split('T')[0],
    summary: { total: 15, active: 12, checked_out: 2, absent: 1 },
    locations: [
      { id: 'fe1', name: 'Arjun Sharma', role: 'executive',        battery_percentage: 88, status: 'active',       lat: 12.9352, lng: 77.6245, address: 'Koramangala, Meridian Hospital' },
      { id: 'fe2', name: 'Priya Patel',  role: 'executive',        battery_percentage: 46, status: 'active',       lat: 12.9279, lng: 77.6271, address: 'Indiranagar, Sunrise Clinics' },
      { id: 'fe3', name: 'Rahul Verma',  role: 'executive',        battery_percentage: 91, status: 'on_break',     lat: 12.9314, lng: 77.6189, address: '100 Ft Road, Crescent' },
      { id: 'fe4', name: 'Sneha Rao',    role: 'executive',        battery_percentage: 18, status: 'active',       lat: 12.9401, lng: 77.6201, address: 'HSR Layout — WellCare' },
      { id: 'fe5', name: 'Amit Singh',   role: 'senior_executive', battery_percentage: 79, status: 'checked_out',  lat: 12.9378, lng: 77.6305, address: 'BTM Layout — Sunrise Pharmacy' }
    ]
  }
});

const mockUsers = () => ({
  success: true,
  data: [
    { id: 'fe1', name: 'Arjun Sharma', employee_id: 'VRN-001', email: 'arjun@demo.in', mobile: '9000000001', role: 'executive', city: 'Bengaluru', is_active: true, zones: { name: 'Bengaluru — South' },
      org_role_id: 'demo-role-mr',  org_role: { id: 'demo-role-mr',  name: 'Medical Representative' },
      assigned_cities: ['demo-city-bangalore'], assigned_city_names: ['Bengaluru'],
      kini_used_this_month: 5, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe2', name: 'Priya Patel',  employee_id: 'VRN-002', email: 'priya@demo.in', mobile: '9000000002', role: 'executive', city: 'Mumbai',    is_active: true, zones: { name: 'Mumbai — West' },
      org_role_id: 'demo-role-mr',  org_role: { id: 'demo-role-mr',  name: 'Medical Representative' },
      assigned_cities: ['demo-city-mumbai'], assigned_city_names: ['Mumbai'],
      kini_used_this_month: 12, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe3', name: 'Rahul Verma',  employee_id: 'VRN-003', email: 'rahul@demo.in', mobile: '9000000003', role: 'executive', city: 'Delhi',     is_active: true, zones: { name: 'Delhi — Central' },
      org_role_id: 'demo-role-asm', org_role: { id: 'demo-role-asm', name: 'Area Sales Manager' },
      assigned_cities: ['demo-city-delhi','demo-city-noida','demo-city-gurugram'], assigned_city_names: ['Delhi','Noida','Gurugram'],
      kini_used_this_month: 8, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe4', name: 'Sneha Rao',    employee_id: 'VRN-004', email: 'sneha@demo.in', mobile: '9000000004', role: 'supervisor', city: 'Hyderabad', is_active: true, zones: { name: 'Hyderabad — East' },
      org_role_id: 'demo-role-rsm', org_role: { id: 'demo-role-rsm', name: 'Regional Sales Manager' },
      assigned_cities: ['demo-city-hyderabad','demo-city-bangalore'], assigned_city_names: ['Hyderabad','Bengaluru'],
      kini_used_this_month: 17, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe5', name: 'Amit Singh',   employee_id: 'VRN-005', email: 'amit@demo.in',  mobile: '9000000005', role: 'executive', city: 'Pune',      is_active: true, zones: { name: 'Pune — City' },
      org_role_id: 'demo-role-mr',  org_role: { id: 'demo-role-mr',  name: 'Medical Representative' },
      assigned_cities: ['demo-city-pune'], assigned_city_names: ['Pune'],
      kini_used_this_month: 3, kini_monthly_cap: 20, permissions: [] }
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
      checkin_address: 'Koramangala, Meridian Hospital, Bengaluru',
      checkin_lat: 12.9352, checkin_lng: 77.6245,
      zones: { name: 'Bengaluru — South' },
      users: { name: 'Arjun Sharma', employee_id: 'VRN-001', zones: { name: 'Bengaluru — South' } }
    },
    {
      id: 'fe2', name: 'Priya Patel', display_status: 'present', status: 'checked_out',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:30:00Z'),
      checkout_at: new Date().toISOString().replace(/T.*/, 'T18:30:00Z'),
      total_hours: 9.0,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      checkout_selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      checkin_address: 'Bandra Kurla Complex, Sunrise Hospital, Mumbai',
      checkin_lat: 19.0760, checkin_lng: 72.8777,
      checkout_lat: 19.0765, checkout_lng: 72.8780,
      zones: { name: 'Mumbai — West' },
      users: { name: 'Priya Patel', employee_id: 'VRN-002', zones: { name: 'Mumbai — West' } }
    },
    {
      id: 'fe3', name: 'Rahul Verma', display_status: 'on_break', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:00:00Z'),
      total_hours: 4.8,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      checkin_address: 'Connaught Place, AIIMS Delhi',
      checkin_lat: 28.6139, checkin_lng: 77.2090,
      zones: { name: 'Delhi — Central' },
      users: { name: 'Rahul Verma', employee_id: 'VRN-003', zones: { name: 'Delhi — Central' } }
    },
    {
      id: 'fe4', name: 'Sneha Rao', display_status: 'present', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:45:00Z'),
      total_hours: 4.1,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
      checkin_address: 'Hitech City, Hyderabad',
      checkin_lat: 17.4474, checkin_lng: 78.3762,
      zones: { name: 'Hyderabad — East' },
      users: { name: 'Sneha Rao', employee_id: 'VRN-004', zones: { name: 'Hyderabad — East' } }
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
      zones: { name: 'Pune — City' },
      users: { name: 'Amit Singh', employee_id: 'VRN-005', zones: { name: 'Pune — City' } }
    }
  ]
});

const mockStores = () => ({
  success: true,
  data: [
    { id: 'st1', name: 'Sunrise Hospitals — Andheri (Dr. Mehta)',     code: 'HCP-001', address: 'Andheri West, Mumbai',         city: 'Mumbai',    zones: { name: 'Mumbai — West' } },
    { id: 'st2', name: 'Meridian Hospital — Bengaluru (Dr. Iyer)',    code: 'HCP-002', address: 'HAL Old Airport Rd, Bengaluru',city: 'Bengaluru', zones: { name: 'Bengaluru — South' } },
    { id: 'st3', name: 'AIIMS Delhi (Dr. Gupta)',                    code: 'HCP-003', address: 'Ansari Nagar, New Delhi',      city: 'Delhi',     zones: { name: 'Delhi — Central' } },
    { id: 'st4', name: 'Sunrise Pharmacy — Greams Road',              code: 'PHM-004', address: 'Greams Road, Chennai',         city: 'Chennai',   zones: { name: 'Chennai — Central' } },
    { id: 'st5', name: 'WellCare — Banjara Hills',                    code: 'PHM-005', address: 'Banjara Hills, Hyderabad',     city: 'Hyderabad', zones: { name: 'Hyderabad — South' } }
  ]
});

const mockFormTemplates = () => ({
  success: true,
  data: [
    { id: 't1', name: 'HCP Detailing Form',          description: 'Detail visit summary, key messages, next-best action', fields_count: 14, created_at: new Date().toISOString() },
    { id: 't2', name: 'Sample Drop Acknowledgement', description: 'Capture HCP signature for samples handed over',         fields_count:  8, created_at: new Date().toISOString() },
    { id: 't3', name: 'CME Invitation RSVP',         description: 'Send + track CME / symposium invites',                  fields_count:  6, created_at: new Date().toISOString() },
    { id: 't4', name: 'Adverse Event Report',        description: 'Pharmacovigilance — capture & escalate AE',             fields_count: 12, created_at: new Date().toISOString() },
    { id: 't5', name: 'Pharmacy Stock Audit',        description: 'On-shelf availability of Vireon Pharma SKUs',                fields_count:  9, created_at: new Date().toISOString() }
  ]
});

const mockActivities = () => ({
  success: true,
  data: [
    { id: 'a1', name: 'HCP Detailing',    type: 'detail',     points: 20 },
    { id: 'a2', name: 'Sample Drop',      type: 'compliance', points: 12 },
    { id: 'a3', name: 'CME Outreach',     type: 'marketing',  points: 25 },
    { id: 'a4', name: 'Pharmacy Audit',   type: 'audit',      points: 10 }
  ]
});

const mockVisitLogs = () => {
  const today = new Date().toISOString().split('T')[0];
  const visitedAt = (offsetHours: number) => new Date(Date.now() - offsetHours * 3600000).toISOString();
  const PH = 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=60';
  return {
    success: true,
    data: [
      { id: 'v1',  visitor_id: 'sup1', visitor_name: 'Vikas Bansal',  visitor_role: 'Regional Sales Manager', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Strong Glucanova detailing — Dr. Mehta agreed to trial Rx on 10 patients next month.',           visited_at: visitedAt(1),  visit_response_at: visitedAt(0.5), visit_response: 'Will share clinical study reprints today.', date: today, stores: { name: 'Sunrise Hospitals — Andheri (Dr. Mehta)' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v2',  visitor_id: 'sup1', visitor_name: 'Vikas Bansal',  visitor_role: 'Regional Sales Manager', executive_id: 'fe2', executive: { name: 'Priya Patel',  role: 'executive' }, users: { name: 'Priya Patel',  role: 'executive' }, rating: 'Good',      remarks: 'Sample drop complete. Push Oncevia with oncology unit next visit.',                              visited_at: visitedAt(3),  visit_response_at: null, visit_response: null, date: today, stores: { name: 'Meridian Hospital — Bengaluru (Dr. Iyer)' }, visit_outlet_id: 'st2', photo_url: PH },
      { id: 'v3',  visitor_id: 'sup2', visitor_name: 'Anita Desai',   visitor_role: 'Area Sales Manager',     executive_id: 'fe3', executive: { name: 'Rahul Verma',  role: 'executive' }, users: { name: 'Rahul Verma',  role: 'executive' }, rating: 'Average',   remarks: 'Dr. Gupta wants HbA1c efficacy data over 12 weeks before adopting Glucanova.',                     visited_at: visitedAt(5),  visit_response_at: visitedAt(4), visit_response: 'Sharing SURMOUNT-1 reprint via WhatsApp.', date: today, stores: { name: 'AIIMS Delhi (Dr. Gupta)' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v4',  visitor_id: 'sup2', visitor_name: 'Anita Desai',   visitor_role: 'Area Sales Manager',     executive_id: 'fe4', executive: { name: 'Sneha Rao',    role: 'executive' }, users: { name: 'Sneha Rao',    role: 'executive' }, rating: 'Excellent', remarks: 'KOL panel buy-in for Oncevia in HR+ breast cancer. CME slot booked for Sep.',                    visited_at: visitedAt(8),  visit_response_at: visitedAt(7), visit_response: 'Targeting 5 referral KOLs this month.', date: today, stores: { name: 'Metropolis Cancer Centre — Mumbai' }, visit_outlet_id: 'st4', photo_url: PH },
      { id: 'v5',  visitor_id: 'sup1', visitor_name: 'Vikas Bansal',  visitor_role: 'Regional Sales Manager', executive_id: 'fe5', executive: { name: 'Amit Singh',   role: 'executive' }, users: { name: 'Amit Singh',   role: 'executive' }, rating: 'Poor',      remarks: 'HCP not at clinic. Re-attempt tomorrow first thing.',                                              visited_at: visitedAt(10), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Emerald Clinic — Pune (Dr. Kumar)' }, visit_outlet_id: 'st5', photo_url: null },
      { id: 'v6',  visitor_id: 'sup3', visitor_name: 'Rajiv Malhotra', visitor_role: 'Zonal Head',            executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Good',      remarks: 'Diabextra adoption strong. Pitch Glucanova upgrade for T2DM A1c >7.5.',                             visited_at: visitedAt(14), visit_response_at: visitedAt(12), visit_response: 'Switch positioning ready for next visit.', date: today, stores: { name: 'Crescent — Bannerghatta (Dr. Nair)' }, visit_outlet_id: 'st6', photo_url: PH },
      { id: 'v7',  visitor_id: 'sup3', visitor_name: 'Rajiv Malhotra', visitor_role: 'Zonal Head',            executive_id: 'fe2', executive: { name: 'Priya Patel',  role: 'executive' }, users: { name: 'Priya Patel',  role: 'executive' }, rating: 'Excellent', remarks: 'Best MR visit this zone. Detailing discipline + CME conversion exceptional.',                      visited_at: visitedAt(20), visit_response_at: visitedAt(18), visit_response: 'Thank you sir.', date: today, stores: { name: 'Sunrise Pharmacy — Greams Road' }, visit_outlet_id: 'st7', photo_url: PH },
      { id: 'v8',  visitor_id: 'sup2', visitor_name: 'Anita Desai',   visitor_role: 'Area Sales Manager',     executive_id: 'fe3', executive: { name: 'Rahul Verma',  role: 'executive' }, users: { name: 'Rahul Verma',  role: 'executive' }, rating: 'Average',   remarks: 'AIIMS formulary committee delayed. Pre-meet with Dr. Banerjee scheduled.',                          visited_at: visitedAt(24), visit_response_at: visitedAt(22), visit_response: 'Reissue file with updated Indian PSP data.', date: today, stores: { name: 'AIIMS Delhi (Dr. Gupta)' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v9',  visitor_id: 'sup1', visitor_name: 'Vikas Bansal',  visitor_role: 'Regional Sales Manager', executive_id: 'fe4', executive: { name: 'Sneha Rao',    role: 'executive' }, users: { name: 'Sneha Rao',    role: 'executive' }, rating: 'Good',      remarks: 'New oncologist Dr. Tandon receptive to Oncorib — schedule literature drop.',                       visited_at: visitedAt(28), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Metropolis Cancer Centre — Mumbai' }, visit_outlet_id: 'st4', photo_url: null },
      { id: 'v10', visitor_id: 'sup3', visitor_name: 'Rajiv Malhotra', visitor_role: 'Zonal Head',            executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Patient Support Program enrollment training crisp — all 4 PSP enrolments today.',                  visited_at: visitedAt(32), visit_response_at: visitedAt(30), visit_response: 'Replicating PSP SOP at 3 more clinics next week.', date: today, stores: { name: 'Sunrise Hospitals — Andheri (Dr. Mehta)' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v11', visitor_id: 'sup2', visitor_name: 'Anita Desai',   visitor_role: 'Area Sales Manager',     executive_id: 'fe2', executive: { name: 'Priya Patel',  role: 'executive' }, users: { name: 'Priya Patel',  role: 'executive' }, rating: 'Good',      remarks: 'Pharmacy stock audit done — Diabextra 1.5mg low stock, raise PO with distributor.',                 visited_at: visitedAt(36), visit_response_at: visitedAt(34), visit_response: 'Distributor PO raised.', date: today, stores: { name: 'Sunrise Pharmacy — Greams Road' }, visit_outlet_id: 'st7', photo_url: PH },
      { id: 'v12', visitor_id: 'sup1', visitor_name: 'Vikas Bansal',  visitor_role: 'Regional Sales Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma',  role: 'executive' }, users: { name: 'Rahul Verma',  role: 'executive' }, rating: 'Average',   remarks: 'Dr. Khanna cold on Oncevia — re-pitch with monarchE 5-year data next month.',                      visited_at: visitedAt(40), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Lakeview Hospital — Andheri (Dr. Khanna)' }, visit_outlet_id: 'st8', photo_url: PH },
      { id: 'v13', visitor_id: 'sup3', visitor_name: 'Rajiv Malhotra', visitor_role: 'Zonal Head',            executive_id: 'fe5', executive: { name: 'Amit Singh',   role: 'executive' }, users: { name: 'Amit Singh',   role: 'executive' }, rating: 'Excellent', remarks: 'Closed first Glucanova trial Rx in Pune — Dr. Kumar starting 8-patient pilot.',                      visited_at: visitedAt(44), visit_response_at: visitedAt(42), visit_response: 'Will share trial protocol with team.', date: today, stores: { name: 'Emerald Clinic — Pune (Dr. Kumar)' }, visit_outlet_id: 'st5', photo_url: PH },
      { id: 'v14', visitor_id: 'sup2', visitor_name: 'Anita Desai',   visitor_role: 'Area Sales Manager',     executive_id: 'fe4', executive: { name: 'Sneha Rao',    role: 'executive' }, users: { name: 'Sneha Rao',    role: 'executive' }, rating: 'Good',      remarks: 'Migranova migraine pitch landed — Dr. Verma requested 4 sample pens.',                                visited_at: visitedAt(48), visit_response_at: visitedAt(46), visit_response: 'Samples shipping today.', date: today, stores: { name: 'Northgate — Delhi (Dr. Verma)' }, visit_outlet_id: 'st9', photo_url: PH }
    ]
  };
};

// Realistic medical-context images for KYC/proof captures on field forms.
const SAMPLE_DOC_IMG = 'https://images.unsplash.com/photo-1583912267550-aae0d44dab4a?auto=format&fit=crop&w=640&q=70';
const PRESCR_IMG     = 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=640&q=70';
const SELFIE_IMG     = 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=70';

const mkSub = (
  id: string, agoMin: number, durMin: number, converted: boolean,
  customer: string, mr: string, employee_id: string,
  form: string, activity: string, address: string, withDocs: boolean,
) => {
  const start = new Date(Date.now() - agoMin * 60000).toISOString();
  const end   = new Date(Date.now() - (agoMin - durMin) * 60000).toISOString();
  const answers = withDocs
    ? [
        { label: 'HCP Name',           qtype: 'short_text', value: customer.split(' (')[0] },
        { label: 'Sample Acknowledgement Slip', qtype: 'image', value: SAMPLE_DOC_IMG },
        { label: 'Sample Drop Photo',  qtype: 'image', value: PRESCR_IMG },
        { label: 'MR Selfie at Clinic',qtype: 'image', value: SELFIE_IMG },
        { label: 'Signature Captured', qtype: 'yes_no', value: true },
      ]
    : [
        { label: 'Key Message Delivered', qtype: 'short_text', value: 'Glucanova — A1c reduction & weight loss benefit' },
        { label: 'Trial Rx Intent (0-10)',qtype: 'number',     value: 8 },
        { label: 'Next Best Action',      qtype: 'short_text', value: 'Share SURMOUNT-1 reprint + book CME slot' },
      ];
  return {
    id, submitted_at: end, is_converted: converted,
    outlet_name: `${customer} – ${address}`,
    users: { name: mr, employee_id },
    activities: { name: activity },
    form_templates: { name: form },
    builder_forms: { id: `bf-${id}`, title: form },
    check_in_at: start, check_out_at: end,
    address,
    answers,
    form_responses: answers.map((a) => ({
      builder_questions: { label: a.label, qtype: a.qtype },
      value_text: typeof a.value === 'string' ? a.value : String(a.value),
      photo_url: a.qtype === 'image' ? a.value : undefined,
    })),
  };
};

const mockSubmissions = () => ({
  success: true,
  total: 1820,
  data: [
    mkSub('s1', 95,  38, true,  'Dr. Anil Mehta (Endocrinology)',  'Arjun Sharma', 'VRN-001', 'HCP Detailing Form',          'Glucanova Detailing',  'Sunrise Hospitals — Andheri',     false),
    mkSub('s2', 180, 26, false, 'Dr. Kavita Iyer (Oncology)',      'Priya Patel',  'VRN-002', 'Sample Drop Acknowledgement', 'Sampling',            'Meridian Hospital — Bengaluru',   true),
    mkSub('s3', 240, 42, true,  'Dr. Neha Gupta (Endocrinology)',  'Rahul Verma',  'VRN-003', 'HCP Detailing Form',          'Diabextra Detailing', 'AIIMS Delhi',                     false),
    mkSub('s4', 320, 21, true,  'Sunrise Pharmacy — Greams Road',   'Sneha Rao',    'VRN-004', 'Pharmacy Stock Audit',         'Pharmacy Audit',      'Greams Road, Chennai',           false),
    mkSub('s5', 410, 33, false, 'Dr. Karan Verma (Neurology)',     'Amit Singh',   'VRN-005', 'Sample Drop Acknowledgement', 'Sampling',            'Northgate — Delhi',                 true),
    mkSub('s6', 520, 29, true,  'Dr. R. K. Tandon (Oncology)',     'Rahul Verma',  'VRN-003', 'CME Invitation RSVP',          'CME Outreach',        'Metropolis Cancer Centre — Mumbai',  true)
  ]
});

const mockWeeklyContacts = () => ({
  success: true,
  data: {
    days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const tff = 140 + Math.floor(Math.random() * 55);
      return {
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        short_label: d.toLocaleDateString('en-IN', { weekday: 'short' }).substring(0, 1),
        tff,
        engagements: tff + Math.floor(Math.random() * 60),
        tff_rate: 80 + Math.floor(Math.random() * 12),
      };
    }),
    total_tff: 1456, total_cc: 1820,
  }
});

// NOTE: city-wise performance table reads MR-themed columns:
// active_fes → MRs in field, checkins → HCP visits, unique_outlets → HCPs called.
const mockCityPerformance = () => ({
  success: true,
  data: {
    cities: [
      { city: 'Mumbai',    zones: 7, active_fes: 36, checkins: 132, tff: 430, unique_outlets: 268 },
      { city: 'Bengaluru', zones: 6, active_fes: 42, checkins: 145, tff: 510, unique_outlets: 312 },
      { city: 'Delhi',     zones: 5, active_fes: 32, checkins: 118, tff: 360, unique_outlets: 224 },
      { city: 'Chennai',   zones: 4, active_fes: 24, checkins:  92, tff: 300, unique_outlets: 184 },
      { city: 'Pune',      zones: 3, active_fes: 20, checkins:  75, tff: 240, unique_outlets: 148 },
      { city: 'Hyderabad', zones: 3, active_fes: 18, checkins:  64, tff: 195, unique_outlets: 122 }
    ]
  }
});

const mockOutletCoverage = () => ({
  success: true,
  data: {
    universe: 1480, covered: 982, coverage_pct: 66,
    by_city: [
      { city: 'Bengaluru', universe: 360, covered: 268 },
      { city: 'Mumbai',    universe: 310, covered: 218 },
      { city: 'Delhi',     universe: 260, covered: 172 },
      { city: 'Chennai',   universe: 220, covered: 148 },
      { city: 'Pune',      universe: 180, covered: 116 },
      { city: 'Hyderabad', universe: 150, covered:  60 }
    ]
  }
});

const mockBroadcasts = () => ({
  success: true,
  data: [
    { id: 'b1', title: 'Glucanova India launch sprint',     body: 'Vireon Pharma Glucanova launched in India. Prioritise top-200 endo / diabetologist HCPs this cycle — see launch kit.',                  sent_at: new Date(Date.now() -  1*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 152 },
    { id: 'b2', title: 'Pharmacovigilance reminder',        body: 'All Adverse Event reports MUST be filed within 24h. Use the AE form in-app and CC pv-india@vireon.demo.',                            sent_at: new Date(Date.now() -  3*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 158 },
    { id: 'b3', title: 'Oncevia monarchE 5yr data',        body: 'Updated monarchE 5-year DFS data slides available in the eDetailer. Use for Adjuvant breast cancer detailing.',                       sent_at: new Date(Date.now() -  5*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 137 },
    { id: 'b4', title: 'Diwali Holidays',                   body: 'Office closed Nov 1-3. Field visits resume Nov 4. Wishing all MRs and families a safe Diwali.',                                       sent_at: new Date(Date.now() - 10*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 159 },
    { id: 'b5', title: 'Patient Support Program update',    body: 'PSP enrolment fee waived for Glucanova starters till Mar 2027 — Vireon Cares scheme details attached.',                                 sent_at: new Date(Date.now() - 14*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 155 },
    { id: 'b6', title: 'Compliance refresher — IPMA Code',  body: 'Mandatory refresher on IPMA Code for promotion to HCPs. Complete LMS module by Friday.',                                              sent_at: new Date(Date.now() - 18*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 160 },
    { id: 'b7', title: 'Sample-tracking discipline',         body: 'Q3 audit pending. All sample drops MUST have HCP signature in the in-app form. Audit findings shared next week.',                    sent_at: new Date(Date.now() - 22*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 144 },
    { id: 'b8', title: 'Diabextra → Glucanova switch deck',   body: 'New comparison deck for tirzepatide vs dulaglutide is live. Use for treatment-intensification conversations.',                       sent_at: new Date(Date.now() - 28*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 160, read: 149 }
  ]
});

const mockBroadcastAdmin = () => {
  const _at = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  return {
    success: true,
    data: [
      { id: 'bq1', question: 'Did you complete the planned HCP visits today?', options: [{ label: 'Yes, fully', value: 'yes' }, { label: 'Partially', value: 'partial' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-1), status: 'active',  target_roles: ['executive'],               target_zone_ids: [], target_cities: ['Bengaluru', 'Mumbai'], created_at: _at(0.2), response_count: 88,  tally: [{ label: 'Yes, fully', index: 0, count: 64 }, { label: 'Partially', index: 1, count: 20 }, { label: 'No', index: 2, count: 4 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'VRN-001', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.1) }, { user_name: 'Priya Patel', employee_id: 'VRN-002', selected_label: 'Partially', selected_index: 1, is_correct: null, answered_at: _at(0.15) }, { user_name: 'Rahul Verma', employee_id: 'VRN-003', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.18) }] },
      { id: 'bq2', question: 'Quiz: Recommended starting dose for Glucanova (tirzepatide)?', options: [{ label: '2.5 mg', value: '2.5' }, { label: '5 mg', value: '5' }, { label: '10 mg', value: '10' }, { label: '15 mg', value: '15' }], correct_option: 0, is_urgent: false, deadline_at: _at(-3), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(2), response_count: 148, tally: [{ label: '2.5 mg', index: 0, count: 120 }, { label: '5 mg', index: 1, count: 18 }, { label: '10 mg', index: 2, count: 6 }, { label: '15 mg', index: 3, count: 4 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'VRN-001', selected_label: '2.5 mg', selected_index: 0, is_correct: true, answered_at: _at(1.9) }, { user_name: 'Sneha Rao', employee_id: 'VRN-004', selected_label: '5 mg', selected_index: 1, is_correct: false, answered_at: _at(1.7) }] },
      { id: 'bq3', question: 'URGENT: Mumbai rain — are you safe?', options: [{ label: 'I am safe', value: 'safe' }, { label: 'Need help', value: 'help' }], correct_option: null, is_urgent: true, deadline_at: _at(-5), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: ['Mumbai'], created_at: _at(5), response_count: 46, tally: [{ label: 'I am safe', index: 0, count: 44 }, { label: 'Need help', index: 1, count: 2 }], responses: [{ user_name: 'Priya Patel', employee_id: 'VRN-002', selected_label: 'I am safe', selected_index: 0, is_correct: null, answered_at: _at(4.9) }, { user_name: 'Vikas Bansal', employee_id: 'SUP-001', selected_label: 'Need help', selected_index: 1, is_correct: null, answered_at: _at(4.8) }] },
      { id: 'bq4', question: 'Which Vireon Pharma molecule saw the most HCP interest this week?', options: [{ label: 'Glucanova', value: 'mnj' }, { label: 'Oncevia', value: 'vrz' }, { label: 'Diabextra', value: 'tru' }, { label: 'Other', value: 'oth' }], correct_option: null, is_urgent: false, deadline_at: _at(-7), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(7), response_count: 138, tally: [{ label: 'Glucanova', index: 0, count: 78 }, { label: 'Oncevia', index: 1, count: 28 }, { label: 'Diabextra', index: 2, count: 22 }, { label: 'Other', index: 3, count: 10 }], responses: [] },
      { id: 'bq5', question: 'CME format you find most effective for HCPs?', options: [{ label: 'In-clinic', value: 'inclinic' }, { label: 'Hospital symposium', value: 'symp' }, { label: 'Webinar', value: 'web' }], correct_option: null, is_urgent: false, deadline_at: _at(-12), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(12), response_count: 152, tally: [{ label: 'In-clinic', index: 0, count: 42 }, { label: 'Hospital symposium', index: 1, count: 68 }, { label: 'Webinar', index: 2, count: 42 }], responses: [] },
      { id: 'bq6', question: 'Are you using the new Glucanova eDetailer v2?', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-18), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(18), response_count: 156, tally: [{ label: 'Yes', index: 0, count: 138 }, { label: 'No', index: 1, count: 18 }], responses: [] },
      { id: 'bq7', question: 'Did your phone receive the Kinematic app v4.2 update?', options: [{ label: 'Updated', value: 'updated' }, { label: 'Pending', value: 'pending' }, { label: 'Issue', value: 'issue' }], correct_option: null, is_urgent: false, deadline_at: _at(-22), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(22), response_count: 160, tally: [{ label: 'Updated', index: 0, count: 146 }, { label: 'Pending', index: 1, count: 10 }, { label: 'Issue', index: 2, count: 4 }], responses: [] }
    ]
  };
};

const mockLearningMaterials = () => ({
  success: true,
  data: [
    { id: 'l1', title: 'IPMA Code Refresher 2026',                  category: 'Compliance',     updated_at: new Date(Date.now() - 30*86400000).toISOString(), kind: 'pdf' },
    { id: 'l2', title: 'Glucanova — Detailing Guide',                category: 'Product',        updated_at: new Date(Date.now() - 14*86400000).toISOString(), kind: 'video' },
    { id: 'l3', title: 'Adverse Event Reporting SOP',               category: 'Pharmacovigilance', updated_at: new Date(Date.now() - 60*86400000).toISOString(), kind: 'pdf' },
    { id: 'l4', title: 'Oncevia monarchE 5-yr Data Deep-Dive',     category: 'Clinical',        updated_at: new Date(Date.now() - 21*86400000).toISOString(), kind: 'video' },
    { id: 'l5', title: 'Patient Support Program — PSP Workflow',    category: 'Process',        updated_at: new Date(Date.now() - 45*86400000).toISOString(), kind: 'pdf' },
    { id: 'l6', title: 'Tirzepatide vs Dulaglutide — Switch Talk',  category: 'Product',        updated_at: new Date(Date.now() - 12*86400000).toISOString(), kind: 'pdf' }
  ]
});

const mockMobileHome = () => ({
  success: true,
  data: { tff_today: 16, attendance_status: 'checked_in', kpis: { tff: 16, hours: 6.8 } }
});

const ROUTE_PLANS = (() => {
  const fes = [
    { id: 'demo-fe-1', name: 'Arjun Sharma',   employee_id: 'VRN-1042', mobile: '+91 98201 11111', zone: 'Bengaluru — South',     city: 'Bengaluru' },
    { id: 'demo-fe-2', name: 'Priya Patel',    employee_id: 'VRN-1051', mobile: '+91 98202 22222', zone: 'Mumbai — West',         city: 'Mumbai' },
    { id: 'demo-fe-3', name: 'Rahul Verma',    employee_id: 'VRN-1063', mobile: '+91 98203 33333', zone: 'Delhi — Central',       city: 'Delhi' },
    { id: 'demo-fe-4', name: 'Sneha Rao',      employee_id: 'VRN-1078', mobile: '+91 98204 44444', zone: 'Chennai — Central',     city: 'Chennai' },
    { id: 'demo-fe-5', name: 'Amit Singh',     employee_id: 'VRN-1085', mobile: '+91 98205 55555', zone: 'Hyderabad — South',     city: 'Hyderabad' },
    { id: 'demo-fe-6', name: 'Karthik Pillai', employee_id: 'VRN-1092', mobile: '+91 98206 66666', zone: 'Pune — East',           city: 'Pune' },
    { id: 'demo-fe-7', name: 'Pooja Joshi',    employee_id: 'VRN-1107', mobile: '+91 98207 77777', zone: 'Ahmedabad — West',      city: 'Ahmedabad' },
    { id: 'demo-fe-8', name: 'Manish Khanna',  employee_id: 'VRN-1118', mobile: '+91 98208 88888', zone: 'Kolkata — North',       city: 'Kolkata' },
  ];
  const cityCoords: Record<string, [number, number]> = {
    Mumbai: [19.0760, 72.8777], Bengaluru: [12.9716, 77.5946], Delhi: [28.6139, 77.2090],
    Chennai: [13.0827, 80.2707], Hyderabad: [17.3850, 78.4867], Pune: [18.5204, 73.8567],
    Ahmedabad: [23.0225, 72.5714], Kolkata: [22.5726, 88.3639],
  };
  const storeNames = [
    'Dr. Anil Mehta (Endo)', 'Dr. Kavita Iyer (Onco)', 'Sunrise Pharmacy',
    'Dr. Neha Gupta (Endo)', 'AIIMS Delhi', 'WellCare Pharmacy',
    'Dr. Manish Khanna (Onco)', 'Crescent Hospital',
    'Dr. Karan Verma (Neuro)', 'Metropolis Cancer Centre',
  ];
  const statuses = ['completed', 'in_progress', 'partial', 'pending', 'completed', 'in_progress', 'pending', 'partial', 'completed', 'in_progress'] as const;
  const vehicles = ['2w_petrol', '4w_petrol', '4w_diesel', '2w_ev', '4w_ev', '2w_petrol', 'auto_rickshaw', '4w_petrol', '2w_petrol', 'public_bus'];

  return Array.from({ length: 10 }, (_, i) => {
    const fe = fes[i % fes.length];
    const status = statuses[i];
    const [baseLat, baseLng] = cityCoords[fe.city] ?? [19.0760, 72.8777];
    const total = 5 + (i % 4);
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
        target_type: ['detailing', 'sampling', 'cme_invite', 'pharmacy_audit'][j % 4],
        target_notes: ['Detail Glucanova key messages', 'Drop 4-pack sample with signature', 'Invite to weekend CME — diabetes', 'Audit OSA + book PO if low'][j % 4],
        target_value: 8500 + j * 2200,
        status: outletStatus,
        checkin_at:  outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000).toISOString() : undefined,
        checkout_at: outletStatus === 'visited' ? new Date(Date.now() - (i - 2) * 86400000 + (8 + j) * 3600000 + 25 * 60000).toISOString() : undefined,
        order_amount: outletStatus === 'visited' ? 6500 + j * 1850 : undefined,
        actual_duration_min: outletStatus === 'visited' ? 20 + (j * 4) % 18 : undefined,
        planned_duration_min: 25,
        store_id: `demo-store-${i}-${j}`,
        store_name: `${storeNames[(i + j) % storeNames.length]} - ${fe.city} ${j + 1}`,
        store_code: `HCP-${String(20000 + i * 10 + j).padStart(5, '0')}`,
        store_address: `${j + 1}, ${['MG Road', 'Park Street', 'Linking Road', 'FC Road', 'Brigade Road'][j % 5]}, ${fe.city}`,
        store_type: ['hcp_clinic', 'hospital', 'pharmacy'][j % 3],
        store_lat: baseLat + (Math.random() - 0.5) * 0.08,
        store_lng: baseLng + (Math.random() - 0.5) * 0.08,
        store_phone: `+91 98${String(300 + i * 10 + j).slice(-3)} ${String(10000 + i * 100 + j).slice(-5)}`,
        store_owner: ['Dr. Sharma', 'Dr. Iyer', 'Dr. Kumar', 'Dr. Gupta', 'Dr. Pillai', 'Dr. Joshi'][(i + j) % 6],
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
      notes: i % 4 === 0 ? 'Glucanova launch sprint — prioritise top endo / diabetologists' : undefined,
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

export const PHARMACEUTICAL_FIELD = {
  mockSummary, mockTrends, mockFeed, mockHeatmap, mockDashboardInit,
  mockLocations, mockUsers, mockAttendanceTeam, mockStores, mockFormTemplates,
  mockActivities, mockSubmissions, mockVisitLogs,
  mockCityPerformance, mockOutletCoverage, mockWeeklyContacts,
  mockBroadcasts, mockBroadcastAdmin, mockLearningMaterials, mockMobileHome,
  ROUTE_PLANS,
};
