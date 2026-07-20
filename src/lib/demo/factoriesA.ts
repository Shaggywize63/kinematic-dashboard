
export const mockSummary = (date: string) => ({
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
      { name: 'Arjun Sharma', zone: 'Bangalore North', tff: 142 },
      { name: 'Priya Patel', zone: 'Mumbai West', tff: 138 },
      { name: 'Rahul Verma', zone: 'Delhi Central', tff: 135 },
      { name: 'Sneha Rao', zone: 'Hyderabad South', tff: 128 },
      { name: 'Amit Singh', zone: 'Pune East', tff: 122 }
    ],
    zone_performance: [
      { zone: 'Bangalore', tff: 450, target: 500 },
      { zone: 'Mumbai', tff: 380, target: 400 },
      { zone: 'Delhi', tff: 320, target: 350 },
      { zone: 'Chennai', tff: 280, target: 300 }
    ],
    total_executives: 145,
  }
});

export const mockTrends = () => ({
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

export const mockFeed = () => ({
  success: true,
  data: [
    { id: 'f1', time: new Date().toISOString(), description: 'Arjun Sharma submitted TFF', meta: { activity: 'Product Launch', outlet: 'Reliance Fresh' } },
    { id: 'f2', time: new Date(Date.now() - 3600000).toISOString(), description: 'Priya Patel checked in', meta: { activity: 'Attendance', outlet: 'Big Bazaar' } },
    { id: 'f3', time: new Date(Date.now() - 7200000).toISOString(), description: 'Rahul Verma submitted Form', meta: { activity: 'Price Audit', outlet: 'Star Market' } },
    { id: 'f4', time: new Date(Date.now() - 10800000).toISOString(), description: 'Sneha Rao submitted TFF', meta: { activity: 'Store Branding', outlet: 'Metro Cash' } },
    { id: 'f5', time: new Date(Date.now() - 14400000).toISOString(), description: 'Amit Singh checked out', meta: { activity: 'Attendance', outlet: "Spencer's" } }
  ]
});

export const mockHeatmap = () => ({
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

export const mockDashboardInit = () => ({
  success: true,
  data: {
    attendance: { total: 145, present: 132, on_break: 5, checked_out: 4, absent: 4, regularised: 0 },
    kpis: { total_tff: 1248, avg_attendance: 92, open_grievances: 2 },
    weekly: { days: mockTrends().data, total_tff: 1248 }
  }
});

export const mockLocations = () => ({
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

export const mockUsers = () => ({
  success: true,
  data: [
    // Demo team — every row carries the fields the dashboard Team
    // Members table relies on: `org_role.name` for the Hierarchy
    // designation, `assigned_cities` + `assigned_city_names` for the
    // city pills, and `kini_used_this_month` + `kini_monthly_cap` for
    // the new KINI AI usage column.
    { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001', email: 'arjun@demo.in', mobile: '9000000001', role: 'executive', city: 'Bangalore', is_active: true, zones: { name: 'Bangalore North' },
      org_role_id: 'demo-role-aso',  org_role: { id: 'demo-role-aso',  name: 'Area Sales Officer' },
      assigned_cities: ['demo-city-bangalore'], assigned_city_names: ['Bangalore'],
      kini_used_this_month: 4, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe2', name: 'Priya Patel',  employee_id: 'KIN-002', email: 'priya@demo.in', mobile: '9000000002', role: 'executive', city: 'Mumbai',    is_active: true, zones: { name: 'Mumbai West' },
      org_role_id: 'demo-role-aso',  org_role: { id: 'demo-role-aso',  name: 'Area Sales Officer' },
      assigned_cities: ['demo-city-mumbai'], assigned_city_names: ['Mumbai'],
      kini_used_this_month: 11, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe3', name: 'Rahul Verma',  employee_id: 'KIN-003', email: 'rahul@demo.in', mobile: '9000000003', role: 'executive', city: 'Delhi',     is_active: true, zones: { name: 'Delhi Central' },
      org_role_id: 'demo-role-asm',  org_role: { id: 'demo-role-asm',  name: 'Area Sales Manager' },
      assigned_cities: ['demo-city-delhi','demo-city-noida','demo-city-gurugram'], assigned_city_names: ['Delhi','Noida','Gurugram'],
      kini_used_this_month: 7, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe4', name: 'Sneha Rao',    employee_id: 'KIN-004', email: 'sneha@demo.in', mobile: '9000000004', role: 'supervisor', city: 'Hyderabad', is_active: true, zones: { name: 'Hyderabad East' },
      org_role_id: 'demo-role-bm',   org_role: { id: 'demo-role-bm',   name: 'Business Manager' },
      assigned_cities: ['demo-city-hyderabad','demo-city-bangalore'], assigned_city_names: ['Hyderabad','Bangalore'],
      kini_used_this_month: 18, kini_monthly_cap: 20, permissions: [] },
    { id: 'fe5', name: 'Amit Singh',   employee_id: 'KIN-005', email: 'amit@demo.in',  mobile: '9000000005', role: 'executive', city: 'Pune',      is_active: true, zones: { name: 'Pune City' },
      org_role_id: 'demo-role-cc',   org_role: { id: 'demo-role-cc',   name: 'Consumer Champion' },
      assigned_cities: ['demo-city-pune'], assigned_city_names: ['Pune'],
      kini_used_this_month: 2, kini_monthly_cap: 20, permissions: [] }
  ]
});

export const mockAttendanceTeam = () => ({
  success: true,
  data: [
    {
      id: 'fe1', name: 'Arjun Sharma', display_status: 'present', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:15:00Z'),
      total_hours: 4.5,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
      checkin_address: 'Koramangala 4th Block, Bangalore',
      checkin_lat: 12.9352, checkin_lng: 77.6245,
      zones: { name: 'Bangalore North' },
      users: { name: 'Arjun Sharma', employee_id: 'KIN-001', zones: { name: 'Bangalore North' } }
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
      zones: { name: 'Mumbai West' },
      users: { name: 'Priya Patel', employee_id: 'KIN-002', zones: { name: 'Mumbai West' } }
    },
    {
      id: 'fe3', name: 'Rahul Verma', display_status: 'on_break', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:00:00Z'),
      total_hours: 4.8,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      checkin_address: 'Delhi Central, Connaught Place',
      checkin_lat: 28.6139, checkin_lng: 77.2090,
      zones: { name: 'Delhi Central' },
      users: { name: 'Rahul Verma', employee_id: 'KIN-003', zones: { name: 'Delhi Central' } }
    },
    {
      id: 'fe4', name: 'Sneha Rao', display_status: 'present', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:45:00Z'),
      total_hours: 4.1,
      checkin_selfie_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
      checkin_address: 'Hitech City, Hyderabad',
      checkin_lat: 17.4474, checkin_lng: 78.3762,
      zones: { name: 'Hyderabad East' },
      users: { name: 'Sneha Rao', employee_id: 'KIN-004', zones: { name: 'Hyderabad East' } }
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
      zones: { name: 'Pune City' },
      users: { name: 'Amit Singh', employee_id: 'KIN-005', zones: { name: 'Pune City' } }
    }
  ]
});

export const mockStores = () => ({
  success: true,
  data: [
    { id: 'st1', name: 'Reliance Fresh', code: 'REL-001', address: 'Indiranagar 80ft Rd', city: 'Bangalore', zones: { name: 'Bangalore East' } },
    { id: 'st2', name: 'Big Bazaar', code: 'BB-042', address: 'Phoenix Marketcity', city: 'Mumbai', zones: { name: 'Mumbai North' } },
    { id: 'st3', name: 'Star Market', code: 'SM-109', address: 'Select Citywalk', city: 'Delhi', zones: { name: 'Delhi Central' } }
  ]
});

export const mockFormTemplates = () => ({
  success: true,
  data: [
    { id: 't1', name: 'Daily Store Audit', description: 'Standard compliance check', fields_count: 12, created_at: new Date().toISOString() },
    { id: 't2', name: 'Product Secondary Audit', description: 'Shelf visibility check', fields_count: 8, created_at: new Date().toISOString() },
    { id: 't3', name: 'Competitor Intel', description: 'Weekly pricing audit', fields_count: 5, created_at: new Date().toISOString() }
  ]
});

export const mockRoutePlans = () => {
  const today = new Date().toISOString().split('T')[0];
  const tISO = (h: number, m = 0) => `${today}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`;
  return {
    success: true,
    data: [
      {
        id: 'rp1', user_id: 'fe1', plan_date: today, fe_name: 'Arjun Sharma', fe_employee_id: 'KIN-001', fe_mobile: '+91 98000 11111',
        zone_name: 'Bangalore North', city_name: 'Bangalore', status: 'in_progress' as const,
        total_outlets: 5, visited_outlets: 2, missed_outlets: 0, completion_pct: 40, frequency: 'daily', territory_label: 'Koramangala beat',
        outlets: [
          { id: 'o1', store_id: 'st1', store_name: 'Reliance Fresh - Koramangala', store_code: 'REL-001', store_address: '80ft Rd, 4th Block', store_type: 'modern_trade', zone_name: 'Bangalore East', visit_order: 1, status: 'completed' as const, target_type: 'general', target_notes: 'Greet manager, confirm Q3 SKUs', checkin_at: tISO(10, 5), checkout_at: tISO(10, 35), planned_duration_min: 30, actual_duration_min: 30, order_amount: 18500, store_lat: 12.9352, store_lng: 77.6245 },
          { id: 'o2', store_id: 'st2', store_name: 'Big Bazaar - Indiranagar', store_code: 'BB-042', store_address: 'Phoenix Market', store_type: 'modern_trade', zone_name: 'Bangalore East', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', target_notes: 'Refresh end-cap', checkin_at: tISO(11, 15), checkout_at: tISO(11, 50), planned_duration_min: 30, actual_duration_min: 35, store_lat: 12.9784, store_lng: 77.6408 },
          { id: 'o3', store_id: 'st3', store_name: 'Star Market - HSR', store_code: 'SM-109', store_address: 'HSR Sector 2', store_type: 'general_trade', zone_name: 'Bangalore South', visit_order: 3, status: 'pending' as const, target_type: 'stock_check', target_notes: '', planned_duration_min: 20, store_lat: 12.9116, store_lng: 77.6473 },
          { id: 'o4', store_id: 'st4', store_name: 'Metro Cash & Carry - Whitefield', store_code: 'MC-018', store_address: 'Whitefield Main', store_type: 'wholesale', zone_name: 'Bangalore East', visit_order: 4, status: 'pending' as const, target_type: 'order_collection', target_notes: '', planned_duration_min: 45, store_lat: 12.9698, store_lng: 77.7499 },
          { id: 'o5', store_id: 'st5', store_name: "Spencer's - MG Road", store_code: 'SP-073', store_address: 'MG Rd 100ft', store_type: 'modern_trade', zone_name: 'Bangalore Central', visit_order: 5, status: 'pending' as const, target_type: 'display_check', target_notes: '', planned_duration_min: 30, store_lat: 12.9756, store_lng: 77.6107 }
        ]
      },
      {
        id: 'rp2', user_id: 'fe2', plan_date: today, fe_name: 'Priya Patel', fe_employee_id: 'KIN-002', fe_mobile: '+91 98000 22222',
        zone_name: 'Mumbai West', city_name: 'Mumbai', status: 'in_progress' as const,
        total_outlets: 4, visited_outlets: 1, missed_outlets: 0, completion_pct: 25, frequency: 'weekly', territory_label: 'Andheri-Bandra beat',
        outlets: [
          { id: 'o6', store_id: 'st6', store_name: 'D-Mart - Andheri West', store_code: 'DM-014', store_address: 'Lokhandwala Junction', store_type: 'modern_trade', zone_name: 'Mumbai West', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(9, 45), checkout_at: tISO(10, 25), planned_duration_min: 40, actual_duration_min: 40, order_amount: 32400, store_lat: 19.1364, store_lng: 72.8296 },
          { id: 'o7', store_id: 'st7', store_name: 'Reliance SMART - Bandra', store_code: 'RS-209', store_address: 'Linking Rd', store_type: 'modern_trade', zone_name: 'Mumbai West', visit_order: 2, status: 'checked_in' as const, target_type: 'merchandising', checkin_at: tISO(11, 10), planned_duration_min: 30, store_lat: 19.0596, store_lng: 72.8400 },
          { id: 'o8', store_id: 'st8', store_name: 'Patel Provision Mart', store_code: 'PPM-04', store_address: 'Bandra East', store_type: 'general_trade', zone_name: 'Mumbai East', visit_order: 3, status: 'pending' as const, target_type: 'scheme_communication', planned_duration_min: 15, store_lat: 19.0644, store_lng: 72.8567 },
          { id: 'o9', store_id: 'st9', store_name: 'Sharma Kirana', store_code: 'SK-011', store_address: 'Khar West', store_type: 'general_trade', zone_name: 'Mumbai West', visit_order: 4, status: 'pending' as const, target_type: 'general', planned_duration_min: 20, store_lat: 19.0696, store_lng: 72.8290 }
        ]
      },
      {
        id: 'rp3', user_id: 'fe3', plan_date: today, fe_name: 'Rahul Verma', fe_employee_id: 'KIN-003', fe_mobile: '+91 98000 33333',
        zone_name: 'Delhi Central', city_name: 'Delhi', status: 'partial' as const,
        total_outlets: 3, visited_outlets: 2, missed_outlets: 1, completion_pct: 67, frequency: 'daily', territory_label: 'CP beat',
        outlets: [
          { id: 'o10', store_id: 'st10', store_name: "Spencer's - CP", store_code: 'SP-301', store_address: 'Connaught Place', store_type: 'modern_trade', zone_name: 'Delhi Central', visit_order: 1, status: 'completed' as const, target_type: 'stock_check', checkin_at: tISO(10, 0), checkout_at: tISO(10, 20), planned_duration_min: 20, actual_duration_min: 20, store_lat: 28.6315, store_lng: 77.2167 },
          { id: 'o11', store_id: 'st11', store_name: 'Modern Bazaar - CP', store_code: 'MB-012', store_address: 'CP Inner Circle', store_type: 'modern_trade', zone_name: 'Delhi Central', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(11, 0), checkout_at: tISO(11, 30), planned_duration_min: 30, actual_duration_min: 30, store_lat: 28.6334, store_lng: 77.2200 },
          { id: 'o12', store_id: 'st12', store_name: 'Khan Market General', store_code: 'KMG-04', store_address: 'Khan Market', store_type: 'general_trade', zone_name: 'Delhi Central', visit_order: 3, status: 'missed' as const, target_type: 'general', rejection_reason: 'Shop closed for inventory', planned_duration_min: 25, store_lat: 28.5984, store_lng: 77.2273 }
        ]
      },
      {
        id: 'rp4', user_id: 'fe4', plan_date: today, fe_name: 'Sneha Rao', fe_employee_id: 'KIN-004', fe_mobile: '+91 98000 44444',
        zone_name: 'Chennai South', city_name: 'Chennai', status: 'completed' as const,
        total_outlets: 4, visited_outlets: 4, missed_outlets: 0, completion_pct: 100, frequency: 'daily', territory_label: 'T Nagar beat',
        outlets: [
          { id: 'o13', store_id: 'st13', store_name: 'Nilgiris - T Nagar', store_code: 'NL-401', store_address: 'Pondy Bazaar', store_type: 'modern_trade', zone_name: 'Chennai South', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(9, 30), checkout_at: tISO(10, 5), planned_duration_min: 30, actual_duration_min: 35, order_amount: 22500, store_lat: 13.0418, store_lng: 80.2341 },
          { id: 'o14', store_id: 'st14', store_name: 'Pothys Departmental', store_code: 'PT-205', store_address: 'Usman Rd', store_type: 'modern_trade', zone_name: 'Chennai South', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(10, 30), checkout_at: tISO(11, 0), planned_duration_min: 30, actual_duration_min: 30, store_lat: 13.0382, store_lng: 80.2407 },
          { id: 'o15', store_id: 'st15', store_name: 'Saravana Stores Mini', store_code: 'SS-101', store_address: 'Mambalam', store_type: 'modern_trade', zone_name: 'Chennai South', visit_order: 3, status: 'completed' as const, target_type: 'stock_check', checkin_at: tISO(11, 30), checkout_at: tISO(12, 0), planned_duration_min: 30, actual_duration_min: 30, store_lat: 13.0298, store_lng: 80.2347 },
          { id: 'o16', store_id: 'st16', store_name: 'Kannan Departmental', store_code: 'KD-072', store_address: 'Anna Salai', store_type: 'general_trade', zone_name: 'Chennai South', visit_order: 4, status: 'completed' as const, target_type: 'general', checkin_at: tISO(13, 0), checkout_at: tISO(13, 30), planned_duration_min: 25, actual_duration_min: 30, store_lat: 13.0610, store_lng: 80.2542 }
        ]
      },
      {
        id: 'rp5', user_id: 'fe5', plan_date: today, fe_name: 'Amit Singh', fe_employee_id: 'KIN-005', fe_mobile: '+91 98000 55555',
        zone_name: 'Hyderabad Central', city_name: 'Hyderabad', status: 'in_progress' as const,
        total_outlets: 5, visited_outlets: 3, missed_outlets: 0, completion_pct: 60, frequency: 'daily', territory_label: 'Banjara Hills beat',
        outlets: [
          { id: 'o17', store_id: 'st17', store_name: 'Q-Mart - Banjara Hills', store_code: 'QM-301', store_address: 'Road No 12', store_type: 'modern_trade', zone_name: 'Hyderabad Central', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(9, 45), checkout_at: tISO(10, 20), planned_duration_min: 35, actual_duration_min: 35, order_amount: 16800, store_lat: 17.4239, store_lng: 78.4738 },
          { id: 'o18', store_id: 'st18', store_name: 'Ratnadeep Supermarket', store_code: 'RD-088', store_address: 'Jubilee Hills', store_type: 'modern_trade', zone_name: 'Hyderabad Central', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(11, 0), checkout_at: tISO(11, 25), planned_duration_min: 25, actual_duration_min: 25, store_lat: 17.4319, store_lng: 78.4096 },
          { id: 'o19', store_id: 'st19', store_name: 'Heritage Fresh', store_code: 'HF-202', store_address: 'Begumpet', store_type: 'modern_trade', zone_name: 'Hyderabad Central', visit_order: 3, status: 'completed' as const, target_type: 'stock_check', checkin_at: tISO(12, 0), checkout_at: tISO(12, 30), planned_duration_min: 30, actual_duration_min: 30, store_lat: 17.4400, store_lng: 78.4738 },
          { id: 'o20', store_id: 'st20', store_name: 'More Megastore', store_code: 'MM-118', store_address: 'Madhapur', store_type: 'modern_trade', zone_name: 'Hyderabad Central', visit_order: 4, status: 'pending' as const, target_type: 'scheme_communication', planned_duration_min: 30, store_lat: 17.4485, store_lng: 78.3908 },
          { id: 'o21', store_id: 'st21', store_name: 'Charminar General Stores', store_code: 'CG-044', store_address: 'Charminar', store_type: 'general_trade', zone_name: 'Hyderabad Old', visit_order: 5, status: 'pending' as const, target_type: 'general', planned_duration_min: 20, store_lat: 17.3616, store_lng: 78.4747 }
        ]
      },
      {
        id: 'rp6', user_id: 'fe1', plan_date: today, fe_name: 'Arjun Sharma', fe_employee_id: 'KIN-001', fe_mobile: '+91 98000 11111',
        zone_name: 'Pune East', city_name: 'Pune', status: 'completed' as const,
        total_outlets: 4, visited_outlets: 4, missed_outlets: 0, completion_pct: 100, frequency: 'weekly', territory_label: 'Kalyani Nagar beat',
        outlets: [
          { id: 'o22', store_id: 'st22', store_name: 'D-Mart - Kalyani Nagar', store_code: 'DM-301', store_address: 'Nagar Rd', store_type: 'modern_trade', zone_name: 'Pune East', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(9, 0), checkout_at: tISO(9, 45), planned_duration_min: 45, actual_duration_min: 45, order_amount: 41200, store_lat: 18.5489, store_lng: 73.9159 },
          { id: 'o23', store_id: 'st23', store_name: 'Reliance SMART - Viman Nagar', store_code: 'RS-318', store_address: 'Viman Nagar', store_type: 'modern_trade', zone_name: 'Pune East', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(10, 15), checkout_at: tISO(10, 50), planned_duration_min: 35, actual_duration_min: 35, store_lat: 18.5679, store_lng: 73.9143 },
          { id: 'o24', store_id: 'st24', store_name: 'Star Bazaar - Aundh', store_code: 'SB-227', store_address: 'Aundh Main', store_type: 'modern_trade', zone_name: 'Pune West', visit_order: 3, status: 'completed' as const, target_type: 'stock_check', checkin_at: tISO(11, 30), checkout_at: tISO(12, 0), planned_duration_min: 30, actual_duration_min: 30, store_lat: 18.5599, store_lng: 73.8074 },
          { id: 'o25', store_id: 'st25', store_name: 'Pawar Departmental', store_code: 'PD-019', store_address: 'Wakad', store_type: 'general_trade', zone_name: 'Pune West', visit_order: 4, status: 'completed' as const, target_type: 'general', checkin_at: tISO(13, 0), checkout_at: tISO(13, 25), planned_duration_min: 25, actual_duration_min: 25, store_lat: 18.5972, store_lng: 73.7641 }
        ]
      },
      {
        id: 'rp7', user_id: 'fe2', plan_date: today, fe_name: 'Priya Patel', fe_employee_id: 'KIN-002', fe_mobile: '+91 98000 22222',
        zone_name: 'Ahmedabad West', city_name: 'Ahmedabad', status: 'pending' as const,
        total_outlets: 4, visited_outlets: 0, missed_outlets: 0, completion_pct: 0, frequency: 'daily', territory_label: 'SG Highway beat',
        outlets: [
          { id: 'o26', store_id: 'st26', store_name: 'Star Bazaar - SG Highway', store_code: 'SB-401', store_address: 'SG Highway', store_type: 'modern_trade', zone_name: 'Ahmedabad West', visit_order: 1, status: 'pending' as const, target_type: 'order_collection', planned_duration_min: 40, store_lat: 23.0397, store_lng: 72.5103 },
          { id: 'o27', store_id: 'st27', store_name: 'D-Mart - Bopal', store_code: 'DM-405', store_address: 'Bopal Cross', store_type: 'modern_trade', zone_name: 'Ahmedabad West', visit_order: 2, status: 'pending' as const, target_type: 'merchandising', planned_duration_min: 35, store_lat: 23.0334, store_lng: 72.4729 },
          { id: 'o28', store_id: 'st28', store_name: 'Big Bazaar - Vastrapur', store_code: 'BB-208', store_address: 'Vastrapur Lake', store_type: 'modern_trade', zone_name: 'Ahmedabad West', visit_order: 3, status: 'pending' as const, target_type: 'stock_check', planned_duration_min: 30, store_lat: 23.0395, store_lng: 72.5263 },
          { id: 'o29', store_id: 'st29', store_name: 'Shah General Stores', store_code: 'SG-099', store_address: 'Satellite', store_type: 'general_trade', zone_name: 'Ahmedabad West', visit_order: 4, status: 'pending' as const, target_type: 'general', planned_duration_min: 20, store_lat: 23.0271, store_lng: 72.5159 }
        ]
      },
      {
        id: 'rp8', user_id: 'fe3', plan_date: today, fe_name: 'Rahul Verma', fe_employee_id: 'KIN-003', fe_mobile: '+91 98000 33333',
        zone_name: 'Kolkata Central', city_name: 'Kolkata', status: 'in_progress' as const,
        total_outlets: 5, visited_outlets: 2, missed_outlets: 0, completion_pct: 40, frequency: 'weekly', territory_label: 'Park Street beat',
        outlets: [
          { id: 'o30', store_id: 'st30', store_name: "Spencer's Hypermarket - PS", store_code: 'SP-411', store_address: 'Park Street', store_type: 'modern_trade', zone_name: 'Kolkata Central', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(10, 0), checkout_at: tISO(10, 40), planned_duration_min: 40, actual_duration_min: 40, order_amount: 28400, store_lat: 22.5539, store_lng: 88.3525 },
          { id: 'o31', store_id: 'st31', store_name: 'More Hypermarket - Salt Lake', store_code: 'MH-512', store_address: 'Sector V Salt Lake', store_type: 'modern_trade', zone_name: 'Kolkata East', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(11, 20), checkout_at: tISO(11, 55), planned_duration_min: 35, actual_duration_min: 35, store_lat: 22.5728, store_lng: 88.4329 },
          { id: 'o32', store_id: 'st32', store_name: 'Big Bazaar - Acropolis', store_code: 'BB-615', store_address: 'Kasba', store_type: 'modern_trade', zone_name: 'Kolkata South', visit_order: 3, status: 'pending' as const, target_type: 'scheme_communication', planned_duration_min: 30, store_lat: 22.5180, store_lng: 88.3938 },
          { id: 'o33', store_id: 'st33', store_name: 'Reliance Fresh - Gariahat', store_code: 'RF-718', store_address: 'Gariahat Junction', store_type: 'modern_trade', zone_name: 'Kolkata South', visit_order: 4, status: 'pending' as const, target_type: 'stock_check', planned_duration_min: 25, store_lat: 22.5212, store_lng: 88.3661 },
          { id: 'o34', store_id: 'st34', store_name: 'Ghosh Brothers Store', store_code: 'GB-088', store_address: 'Hatibagan', store_type: 'general_trade', zone_name: 'Kolkata North', visit_order: 5, status: 'pending' as const, target_type: 'general', planned_duration_min: 20, store_lat: 22.5870, store_lng: 88.3722 }
        ]
      },
      {
        id: 'rp9', user_id: 'fe4', plan_date: today, fe_name: 'Sneha Rao', fe_employee_id: 'KIN-004', fe_mobile: '+91 98000 44444',
        zone_name: 'Jaipur Central', city_name: 'Jaipur', status: 'completed' as const,
        total_outlets: 4, visited_outlets: 3, missed_outlets: 1, completion_pct: 75, frequency: 'daily', territory_label: 'MI Road beat',
        outlets: [
          { id: 'o35', store_id: 'st35', store_name: 'Reliance SMART - MI Road', store_code: 'RS-501', store_address: 'MI Road', store_type: 'modern_trade', zone_name: 'Jaipur Central', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(9, 30), checkout_at: tISO(10, 10), planned_duration_min: 40, actual_duration_min: 40, order_amount: 19800, store_lat: 26.9163, store_lng: 75.8085 },
          { id: 'o36', store_id: 'st36', store_name: 'Big Bazaar - Crystal Palm', store_code: 'BB-507', store_address: 'C-Scheme', store_type: 'modern_trade', zone_name: 'Jaipur Central', visit_order: 2, status: 'completed' as const, target_type: 'merchandising', checkin_at: tISO(11, 0), checkout_at: tISO(11, 35), planned_duration_min: 35, actual_duration_min: 35, store_lat: 26.9087, store_lng: 75.7873 },
          { id: 'o37', store_id: 'st37', store_name: 'Sahkari Bhandar - Bapu Bzr', store_code: 'SB-303', store_address: 'Bapu Bazaar', store_type: 'general_trade', zone_name: 'Jaipur Old', visit_order: 3, status: 'completed' as const, target_type: 'general', checkin_at: tISO(12, 15), checkout_at: tISO(12, 40), planned_duration_min: 25, actual_duration_min: 25, store_lat: 26.9197, store_lng: 75.8243 },
          { id: 'o38', store_id: 'st38', store_name: 'Vaishali General Stores', store_code: 'VG-091', store_address: 'Vaishali Nagar', store_type: 'general_trade', zone_name: 'Jaipur West', visit_order: 4, status: 'missed' as const, target_type: 'general', rejection_reason: 'Closed for stocktake', planned_duration_min: 20, store_lat: 26.9091, store_lng: 75.7416 }
        ]
      },
      {
        id: 'rp10', user_id: 'fe5', plan_date: today, fe_name: 'Amit Singh', fe_employee_id: 'KIN-005', fe_mobile: '+91 98000 55555',
        zone_name: 'Surat West', city_name: 'Surat', status: 'in_progress' as const,
        total_outlets: 4, visited_outlets: 1, missed_outlets: 0, completion_pct: 25, frequency: 'daily', territory_label: 'Adajan beat',
        outlets: [
          { id: 'o39', store_id: 'st39', store_name: 'D-Mart - Adajan', store_code: 'DM-707', store_address: 'Adajan', store_type: 'modern_trade', zone_name: 'Surat West', visit_order: 1, status: 'completed' as const, target_type: 'order_collection', checkin_at: tISO(10, 0), checkout_at: tISO(10, 40), planned_duration_min: 40, actual_duration_min: 40, order_amount: 24600, store_lat: 21.1956, store_lng: 72.7878 },
          { id: 'o40', store_id: 'st40', store_name: 'More Megastore - Vesu', store_code: 'MS-815', store_address: 'Vesu', store_type: 'modern_trade', zone_name: 'Surat South', visit_order: 2, status: 'checked_in' as const, target_type: 'merchandising', checkin_at: tISO(11, 15), planned_duration_min: 35, store_lat: 21.1418, store_lng: 72.7714 },
          { id: 'o41', store_id: 'st41', store_name: 'Reliance Fresh - Piplod', store_code: 'RF-822', store_address: 'Piplod', store_type: 'modern_trade', zone_name: 'Surat South', visit_order: 3, status: 'pending' as const, target_type: 'scheme_communication', planned_duration_min: 30, store_lat: 21.1542, store_lng: 72.7873 },
          { id: 'o42', store_id: 'st42', store_name: 'Patel Cloth Stores', store_code: 'PCS-12', store_address: 'Ring Road', store_type: 'general_trade', zone_name: 'Surat Central', visit_order: 4, status: 'pending' as const, target_type: 'general', planned_duration_min: 20, store_lat: 21.2049, store_lng: 72.8411 }
        ]
      }
    ]
  };
};

export const mockActivities = () => ({
  success: true,
  data: [
    { id: 'a1', name: 'Stock Checking', type: 'audit', points: 10 },
    { id: 'a2', name: 'Shelf Banner Setup', type: 'marketing', points: 25 },
    { id: 'a3', name: 'Client Feedback', type: 'survey', points: 15 }
  ]
});

export const mockAssets = () => ({
  success: true,
  data: [
    { id: 'as1', name: 'Shelf Talker v2', category: 'POSM', stock: 1200 },
    { id: 'as2', name: 'Floor Stand - Large', category: 'Display', stock: 150 },
    { id: 'as3', name: 'Brio Coffee Machine', category: 'Infra', stock: 12 }
  ]
});

export const mockSecurityAlerts = () => ({
  success: true,
  data: [
    { id: 'sa1', type: 'MOCK_LOCATION', action: 'attendance_checkin', created_at: new Date().toISOString(), user: { name: 'Arjun Sharma', employee_id: 'KIN-001' }, lat: 12.9716, lng: 77.5946 },
    { id: 'sa2', type: 'VPN_DETECTED', action: 'form_submission', created_at: new Date().toISOString(), user: { name: 'Priya Patel', employee_id: 'KIN-002' }, lat: 19.0760, lng: 72.8777 }
  ],
  totalCount: 2
});

export const mockVisitLogs = () => {
  const today = new Date().toISOString().split('T')[0];
  const visitedAt = (offsetHours: number) => new Date(Date.now() - offsetHours * 3600000).toISOString();
  const PH = 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=400&q=60';
  return {
    success: true,
    data: [
      { id: 'v1', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Excellent shelf discipline. Coke chillers fully stocked, planogram followed.', visited_at: visitedAt(1), visit_response_at: visitedAt(0.5), visit_response: 'Thanks sir, planogram refresh done by 10AM today.', date: today, stores: { name: 'Reliance Fresh - Koramangala' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v2', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'Compliance met. Push Surf Excel display next week for monsoon.', visited_at: visitedAt(3), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Big Bazaar - Indiranagar' }, visit_outlet_id: 'st2', photo_url: PH },
      { id: 'v3', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'TMT bar end-cap missing. Re-fit POSM by EOD.', visited_at: visitedAt(5), visit_response_at: visitedAt(4), visit_response: 'POSM re-fitted, photo attached on form 41.', date: today, stores: { name: 'Star Market - HSR' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v4', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Excellent', remarks: 'Smart retailer engagement. Order book up 18% MoM.', visited_at: visitedAt(8), visit_response_at: visitedAt(7), visit_response: 'Targeting 25% next month.', date: today, stores: { name: 'Metro Cash & Carry - Whitefield' }, visit_outlet_id: 'st4', photo_url: PH },
      { id: 'v5', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Poor', remarks: 'Outlet found closed at 11:30 - re-visit tomorrow first.', visited_at: visitedAt(10), visit_response_at: null, visit_response: null, date: today, stores: { name: "Spencer's - MG Road" }, visit_outlet_id: 'st5', photo_url: null },
      { id: 'v6', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Good', remarks: 'Maggi pyramid display done. Push Yippee combo next.', visited_at: visitedAt(14), visit_response_at: visitedAt(12), visit_response: 'Yippee combo planned for next visit cycle.', date: today, stores: { name: 'D-Mart - Andheri West' }, visit_outlet_id: 'st6', photo_url: PH },
      { id: 'v7', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Excellent', remarks: 'Modern trade discipline perfect. Recommend for FE-of-month.', visited_at: visitedAt(20), visit_response_at: visitedAt(18), visit_response: 'Thank you sir.', date: today, stores: { name: 'Reliance SMART - Bandra' }, visit_outlet_id: 'st7', photo_url: PH },
      { id: 'v8', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'Stock-out on Parle-G. Trigger urgent inbound from Bhiwandi.', visited_at: visitedAt(24), visit_response_at: visitedAt(22), visit_response: 'PO-9930 raised today, ETA 48 hours.', date: today, stores: { name: 'Patel Provision Mart' }, visit_outlet_id: 'st8', photo_url: PH },
      { id: 'v9', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Good', remarks: 'Kirana relationship strong, owner agreed to 2 new SKUs.', visited_at: visitedAt(28), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Sharma Kirana' }, visit_outlet_id: 'st9', photo_url: null },
      { id: 'v10', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Modern bazaar - perfect end-cap. Best in zone today.', visited_at: visitedAt(32), visit_response_at: visitedAt(30), visit_response: 'Will replicate at 3 other MT outlets next week.', date: today, stores: { name: "Spencer's - CP" }, visit_outlet_id: 'st10', photo_url: PH },
      { id: 'v11', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'Modern Bazaar shelf good. Suggest replicate at 2 sister stores.', visited_at: visitedAt(36), visit_response_at: visitedAt(34), visit_response: 'Will coordinate with cluster lead.', date: today, stores: { name: 'Modern Bazaar - CP' }, visit_outlet_id: 'st11', photo_url: PH },
      { id: 'v12', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'Khan Market crowd not converting - need scheme review.', visited_at: visitedAt(40), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Khan Market General' }, visit_outlet_id: 'st12', photo_url: PH },
      { id: 'v13', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Excellent', remarks: 'Honey display upgraded - saw 3 sales during 25min visit.', visited_at: visitedAt(44), visit_response_at: visitedAt(42), visit_response: 'Thanks, will share photos with team.', date: today, stores: { name: 'Reliance Fresh - Koramangala' }, visit_outlet_id: 'st1', photo_url: PH },
      { id: 'v14', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe4', executive: { name: 'Sneha Rao', role: 'executive' }, users: { name: 'Sneha Rao', role: 'executive' }, rating: 'Good', remarks: 'Vim Bar lineup clean. Push Surf Excel hand-wash too.', visited_at: visitedAt(48), visit_response_at: visitedAt(46), visit_response: 'Surf Excel added to next order.', date: today, stores: { name: 'Star Market - HSR' }, visit_outlet_id: 'st3', photo_url: PH },
      { id: 'v15', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe1', executive: { name: 'Arjun Sharma', role: 'executive' }, users: { name: 'Arjun Sharma', role: 'executive' }, rating: 'Excellent', remarks: 'Beverages cooler fully stocked. Coca-Cola, Pepsi visible.', visited_at: visitedAt(56), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Big Bazaar - Indiranagar' }, visit_outlet_id: 'st2', photo_url: PH },
      { id: 'v16', visitor_id: 'sup3', visitor_name: 'Vikas Bansal', visitor_role: 'Zonal Head', executive_id: 'fe2', executive: { name: 'Priya Patel', role: 'executive' }, users: { name: 'Priya Patel', role: 'executive' }, rating: 'Good', remarks: 'Andheri shop owner asked for Saffola scheme - confirmed via Q3 brief.', visited_at: visitedAt(64), visit_response_at: visitedAt(62), visit_response: 'Scheme deck sent to owner WhatsApp.', date: today, stores: { name: 'D-Mart - Andheri West' }, visit_outlet_id: 'st6', photo_url: PH },
      { id: 'v17', visitor_id: 'sup2', visitor_name: 'Anita Desai', visitor_role: 'Area Supervisor', executive_id: 'fe3', executive: { name: 'Rahul Verma', role: 'executive' }, users: { name: 'Rahul Verma', role: 'executive' }, rating: 'Average', remarks: 'CP traffic dipped - need festival campaign push.', visited_at: visitedAt(72), visit_response_at: null, visit_response: null, date: today, stores: { name: 'Modern Bazaar - CP' }, visit_outlet_id: 'st11', photo_url: PH },
      { id: 'v18', visitor_id: 'sup1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive_id: 'fe5', executive: { name: 'Amit Singh', role: 'executive' }, users: { name: 'Amit Singh', role: 'executive' }, rating: 'Good', remarks: 'Whitefield wholesale order book solid - push high-margin SKUs.', visited_at: visitedAt(80), visit_response_at: visitedAt(76), visit_response: 'Targeting Saffola and Bru next cycle.', date: today, stores: { name: 'Metro Cash & Carry - Whitefield' }, visit_outlet_id: 'st4', photo_url: PH }
    ]
  };
};

export const mockSubmissions = () => ({
  success: true,
  total: 1560,
  data: [
    { id: 's1', submitted_at: new Date().toISOString(), is_converted: true, outlet_name: 'Reliance Fresh - Koramangala', users: { name: 'Arjun Sharma' }, form_templates: { name: 'Product Audit' }, activities: { name: 'Store Visit' } },
    { id: 's2', submitted_at: new Date(Date.now() - 1800000).toISOString(), is_converted: false, outlet_name: 'Big Bazaar - Indiranagar', users: { name: 'Priya Patel' }, form_templates: { name: 'Merchandising' }, activities: { name: 'Merchandising' } },
    { id: 's3', submitted_at: new Date(Date.now() - 3600000).toISOString(), is_converted: true, outlet_name: 'Star Market - HSR', users: { name: 'Rahul Verma' }, form_templates: { name: 'Product Audit' }, activities: { name: 'Store Visit' } },
    { id: 's4', submitted_at: new Date(Date.now() - 7200000).toISOString(), is_converted: true, outlet_name: 'Metro Cash & Carry', users: { name: 'Sneha Rao' }, form_templates: { name: 'Compliance Checklist' }, activities: { name: 'Compliance' } },
    { id: 's5', submitted_at: new Date(Date.now() - 10800000).toISOString(), is_converted: false, outlet_name: 'Amit Singh', users: { name: 'Amit Singh' }, form_templates: { name: 'Stock Repo' }, activities: { name: 'Inventory' } }
  ]
});
