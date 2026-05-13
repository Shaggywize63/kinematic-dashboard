export const DEMO_USER_EMAIL = 'demo@kinematic.com';

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
    { id: 'f1', time: new Date().toISOString(), description: 'Arjun Sharma submitted TFF ✓', meta: { activity: 'Product Launch', outlet: 'Reliance Fresh' } },
    { id: 'f2', time: new Date(Date.now() - 3600000).toISOString(), description: 'Priya Patel checked in', meta: { activity: 'Attendance', outlet: 'Big Bazaar' } },
    { id: 'f3', time: new Date(Date.now() - 7200000).toISOString(), description: 'Rahul Verma submitted Form', meta: { activity: 'Price Audit', outlet: 'Star Market' } },
    { id: 'f4', time: new Date(Date.now() - 10800000).toISOString(), description: 'Sneha Rao submitted TFF ✓', meta: { activity: 'Store Branding', outlet: 'Metro Cash' } },
    { id: 'f5', time: new Date(Date.now() - 14400000).toISOString(), description: 'Amit Singh checked out', meta: { activity: 'Attendance', outlet: 'Spencer\'s' } }
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
    { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001', role: 'executive', city: 'Bangalore', is_active: true },
    { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002', role: 'executive', city: 'Mumbai', is_active: true },
    { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003', role: 'executive', city: 'Delhi', is_active: true },
    { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004', role: 'supervisor', city: 'Hyderabad', is_active: true },
    { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005', role: 'executive', city: 'Pune', is_active: true }
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
      users: { name: 'Arjun Sharma', employee_id: 'KIN-001' } 
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
      users: { name: 'Priya Patel', employee_id: 'KIN-002' } 
    },
    { 
      id: 'fe3', name: 'Rahul Verma', display_status: 'on_break', status: 'checked_in',
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:00:00Z'), 
      total_hours: 4.8, 
      checkin_selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      checkin_address: 'Delhi Central, Connaught Place',
      checkin_lat: 28.6139, checkin_lng: 77.2090, 
      zones: { name: 'Delhi Central' },
      users: { name: 'Rahul Verma', employee_id: 'KIN-003' } 
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

export const mockRoutePlans = () => ({
  success: true,
  data: [
    { id: 'rp1', date: new Date().toISOString().split('T')[0], executive: { name: 'Arjun Sharma' }, status: 'active', stores_count: 8, progress: 4 },
    { id: 'rp2', date: new Date().toISOString().split('T')[0], executive: { name: 'Priya Patel' }, status: 'active', stores_count: 6, progress: 2 }
  ]
});

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

export const mockVisitLogs = () => ({
  success: true,
  data: [
    { 
      id: 'v1', 
      visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', 
      executive: { name: 'Arjun Sharma' }, 
      users: { name: 'Arjun Sharma', role: 'executive' },
      rating: 'Excellent', remarks: 'Good shelf discipline. Product display is perfect.', 
      visited_at: new Date().toISOString(), 
      visit_response: 'Thanks, working on the inventory update now.',
      stores: { name: 'Reliance Fresh - Koramangala' }
    },
    { 
      id: 'v2', 
      visitor_name: 'Anita Desai', visitor_role: 'Supervisor', 
      executive: { name: 'Priya Patel' }, 
      users: { name: 'Priya Patel', role: 'executive' },
      rating: 'Good', remarks: 'Store compliance met. Need focus on SKU expansion.', 
      visited_at: new Date(Date.now() - 3600000).toISOString(), 
      visit_response: null,
      stores: { name: 'Big Bazaar - Indiranagar' }
    }
  ]
});

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

export const mockSubmissionDetails = () => ({
  success: true,
  form_responses: [
    { field_key: 'shelf_status', form_fields: { label: 'Shelf Condition' }, value_text: 'Clean and Organized' },
    { field_key: 'stock_available', form_fields: { label: 'Stock Available' }, value_bool: true },
    { field_key: 'store_photo', form_fields: { label: 'Store Front Photo', field_type: 'camera' }, photo_url: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=800&q=80' },
    { field_key: 'manager_sign', form_fields: { label: 'Manager Signature', field_type: 'signature' }, value_text: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Jon_Snow_Signature.png' }
  ]
});

export const mockSOS = () => ({
  success: true,
  data: [
    { id: 'sos1', created_at: new Date().toISOString(), status: 'active', remarks: 'Accident reported near Indiranagar signal.', users: { name: 'Arjun Sharma' }, latitude: 12.9716, longitude: 77.5946 },
    { id: 'sos2', created_at: new Date(Date.now() - 86400000).toISOString(), status: 'resolved', remarks: 'Medical emergency - resolved in 15 mins.', users: { name: 'Priya Patel' }, resolution: 'Ambulance called, family informed.' }
  ]
});

export const mockGrievances = () => ({
  success: true,
  data: [
    { id: 'g1', reference_no: 'GRV-102', category: 'Harassment', status: 'submitted', description: 'Rude behavior from store manager.', created_at: new Date().toISOString() },
    { id: 'g2', reference_no: 'GRV-098', category: 'Payment', status: 'resolved', description: 'Travel allowance not credited for March.', resolution: 'Credited in April cycle.' }
  ]
});

export const mockBroadcast = () => ({
  success: true,
  data: [
    { 
      id: 'b1', 
      question: 'Are you using the new inventory tracking system?', 
      options: [{label:'Yes', value:'yes'}, {label:'No', value:'no'}],
      target_roles: ['executive'],
      status: 'active',
      created_at: new Date().toISOString(),
      response_count: 12,
      tally: [{label:'Yes', count:10, index:0}, {label:'No', count:2, index:1}],
      target_zone_ids: [],
      target_cities: []
    }
  ]
});

export const mockCities = () => ({
  success: true,
  data: [
    { id: 'c1', name: 'Bangalore', state: 'Karnataka', is_active: true },
    { id: 'c2', name: 'Mumbai', state: 'Maharashtra', is_active: true }
  ]
});

export const mockZones = () => ({
  success: true,
  data: [
    { id: 'z1', name: 'Koramangala 4th Block', city: 'Bangalore', is_active: true },
    { id: 'z2', name: 'Andheri East', city: 'Mumbai', is_active: true }
  ]
});

export const mockClients = () => ({
  success: true,
  data: [
    { id: 'cl1', name: 'Hindustan Unilever', is_active: true },
    { id: 'cl2', name: 'ITC Limited', is_active: true }
  ]
});

export const mockInventory = () => ({
  success: true,
  data: [
    { id: 'i1', name: 'Clinic Plus 5ml', sku_code: 'CP-001', category: 'Shampoo', is_active: true, unit: 'pcs', price: 1.50, created_at: new Date().toISOString() },
    { id: 'i2', name: 'Lux Rose 100g', sku_code: 'LX-402', category: 'Soap', is_active: true, unit: 'pcs', price: 35.00, created_at: new Date().toISOString() }
  ]
});

export const mockWarehouseSummary = () => ({
  success: true,
  data: {
    warehouses: [
      { id: 'wh1', name: 'Main Distribution Hub', warehouse_code: 'WH-DEL-01', type: 'distribution', city: 'Delhi', is_active: true, stats: { inbound: 450, outbound: 320, total_moves: 770 } },
      { id: 'wh2', name: 'South Transit Point', warehouse_code: 'WH-BLR-02', type: 'transit', city: 'Bangalore', is_active: true, stats: { inbound: 120, outbound: 95, total_moves: 215 } },
      { id: 'wh3', name: 'Mumbai Storage Center', warehouse_code: 'WH-MUM-01', type: 'storage', city: 'Mumbai', is_active: false, stats: { inbound: 0, outbound: 0, total_moves: 0 } }
    ],
    total_warehouses: 3,
    active_warehouses: 2,
    total_skus: 1560,
    total_assets: 450,
    total_movements_30d: 985
  }
});

export const mockMovements = () => ({
  success: true,
  data: [
    { id: 'm1', movement_type: 'inbound', quantity: 50, reference_no: 'PO-9912', from_location: 'Vendor A', to_location: 'Section A1', moved_at: new Date().toISOString(), sku: { id: 'i1', sku_code: 'CP-001', name: 'Clinic Plus 5ml' }, performer: { name: 'Arjun Sharma' } },
    { id: 'm2', movement_type: 'outbound', quantity: 12, reference_no: 'ORD-440', from_location: 'Section B2', to_location: 'Reliance Fresh', moved_at: new Date(Date.now() - 3600000).toISOString(), asset: { id: 'ast1', asset_code: 'BRD-01', name: 'Branding Board' }, performer: { name: 'Priya Patel' } },
    { id: 'm3', movement_type: 'transfer', quantity: 100, reference_no: 'TR-102', from_location: 'Main Block', to_location: 'South Block', moved_at: new Date(Date.now() - 7200000).toISOString(), sku: { id: 'i2', sku_code: 'LX-402', name: 'Lux Rose 100g' }, performer: { name: 'Rahul Verma' } }
  ]
});

// ---------------------------------------------------------------------------
// Mocks for endpoints the platform dashboard hits but didn't have fixtures for
// ---------------------------------------------------------------------------

export const mockWeeklyContacts = () => ({
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
    total_tff: 1248,
    total_cc: 1560,
  }
});

export const mockCityPerformance = () => ({
  success: true,
  data: {
    cities: [
      { city: 'Bangalore', fes: 38, check_ins: 132, tff: 450, outlets: 280 },
      { city: 'Mumbai',    fes: 32, check_ins: 118, tff: 380, outlets: 240 },
      { city: 'Delhi',     fes: 28, check_ins: 102, tff: 320, outlets: 195 },
      { city: 'Chennai',   fes: 22, check_ins:  84, tff: 280, outlets: 168 },
      { city: 'Pune',      fes: 18, check_ins:  68, tff: 215, outlets: 130 },
      { city: 'Hyderabad', fes: 14, check_ins:  52, tff: 168, outlets: 102 },
    ],
  }
});

export const mockOutletCoverage = () => ({
  success: true,
  data: {
    universe: 1350,
    covered:  892,
    coverage_pct: 66,
    by_city: [
      { city: 'Bangalore', universe: 320, covered: 240 },
      { city: 'Mumbai',    universe: 280, covered: 198 },
      { city: 'Delhi',     universe: 240, covered: 158 },
      { city: 'Chennai',   universe: 200, covered: 132 },
      { city: 'Pune',      universe: 170, covered: 105 },
      { city: 'Hyderabad', universe: 140, covered:  59 },
    ],
  }
});

export const mockBroadcasts = () => ({
  success: true,
  data: [
    { id: 'b1', title: 'Q1 Sales Kickoff',          body: 'New incentive structure live.',     sent_at: new Date(Date.now() - 86400000).toISOString(),   sent_by: 'Demo Admin', recipients: 145, read: 132 },
    { id: 'b2', title: 'Monsoon Travel Advisory',   body: 'Carry rain gear; route 7 closed.',  sent_at: new Date(Date.now() - 3*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 140 },
    { id: 'b3', title: 'New SKU – TMT 16mm',        body: 'Inventory available from tomorrow.',sent_at: new Date(Date.now() - 7*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 121 },
  ]
});

export const mockLearningMaterials = () => ({
  success: true,
  data: [
    { id: 'l1', title: 'Outlet Visit SOP',  category: 'Process', updated_at: new Date(Date.now() - 30*86400000).toISOString(), kind: 'pdf' },
    { id: 'l2', title: 'Pitching TMT Bars', category: 'Sales',   updated_at: new Date(Date.now() - 14*86400000).toISOString(), kind: 'video' },
    { id: 'l3', title: 'Cement Specs 101',  category: 'Product', updated_at: new Date(Date.now() - 60*86400000).toISOString(), kind: 'pdf' },
  ]
});

export const mockMobileHome = () => ({
  success: true,
  data: { tff_today: 14, attendance_status: 'checked_in', kpis: { tff: 14, hours: 6.5 } }
});

// ---------------------------------------------------------------------------
// CRM mocks
// ---------------------------------------------------------------------------

const REPS = ['Arjun Sharma', 'Priya Patel', 'Rahul Verma', 'Sneha Rao', 'Amit Singh'];
const _now = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString();

const CRM_LEADS = [
  { id: 'demo-lead-1',  first_name: 'Vikram',   last_name: 'Reddy',  company: 'Skyline Developers',     email: 'vikram@skyline.demo',   phone: '+91 98201 11111', status: 'qualified',   score: 88, score_grade: 'A', city: 'Bengaluru', industry: 'Real Estate',   owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-1),  created_at: _now(-14) },
  { id: 'demo-lead-2',  first_name: 'Anjali',   last_name: 'Iyer',   company: 'Zenith Properties',      email: 'anjali@zenith.demo',    phone: '+91 98202 22222', status: 'working',     score: 76, score_grade: 'A', city: 'Mumbai',    industry: 'Construction',  owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-2),  created_at: _now(-21) },
  { id: 'demo-lead-3',  first_name: 'Rohan',    last_name: 'Kumar',  company: 'Acme Steel',             email: 'rohan@acme.demo',       phone: '+91 98203 33333', status: 'new',         score: 64, score_grade: 'B', city: 'Pune',      industry: 'Steel',         owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-4),  created_at: _now(-7)  },
  { id: 'demo-lead-4',  first_name: 'Neha',     last_name: 'Gupta',  company: 'Vega Infra',             email: 'neha@vegainfra.demo',   phone: '+91 98204 44444', status: 'qualified',   score: 92, score_grade: 'A', city: 'Hyderabad', industry: 'Infrastructure',owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-1),  created_at: _now(-30) },
  { id: 'demo-lead-5',  first_name: 'Karthik',  last_name: 'Pillai', company: 'Trident Power',          email: 'karthik@trident.demo',  phone: '+91 98205 55555', status: 'working',     score: 55, score_grade: 'B', city: 'Chennai',   industry: 'Energy',        owner_id: 'demo-user-id', owner_name: REPS[3], last_activity_at: _now(-5),  created_at: _now(-18) },
  { id: 'demo-lead-6',  first_name: 'Pooja',    last_name: 'Joshi',  company: 'Lakshmi Builders',       email: 'pooja@lakshmi.demo',    phone: '+91 98206 66666', status: 'unqualified', score: 22, score_grade: 'D', city: 'Jaipur',    industry: 'Real Estate',   owner_id: 'demo-user-id', owner_name: REPS[4], last_activity_at: _now(-9),  created_at: _now(-35) },
  { id: 'demo-lead-7',  first_name: 'Manish',   last_name: 'Khanna', company: 'Konkan Steel',           email: 'manish@konkan.demo',    phone: '+91 98207 77777', status: 'qualified',   score: 81, score_grade: 'A', city: 'Mumbai',    industry: 'Steel',         owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-3),  created_at: _now(-25) },
  { id: 'demo-lead-8',  first_name: 'Ishaan',   last_name: 'Bose',   company: 'Falcon Engineering',     email: 'ishaan@falcon.demo',    phone: '+91 98208 88888', status: 'nurturing',   score: 48, score_grade: 'C', city: 'Kolkata',   industry: 'Manufacturing', owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-12), created_at: _now(-42) },
  { id: 'demo-lead-9',  first_name: 'Tanvi',    last_name: 'Mehta',  company: 'Pragati Industries',     email: 'tanvi@pragati.demo',    phone: '+91 98209 99999', status: 'new',         score: 70, score_grade: 'B', city: 'Ahmedabad', industry: 'Manufacturing', owner_id: 'demo-user-id', owner_name: REPS[3], last_activity_at: _now(-1),  created_at: _now(-5)  },
  { id: 'demo-lead-10', first_name: 'Karan',    last_name: 'Verma',  company: 'Suryadev Cement',        email: 'karan@suryadev.demo',   phone: '+91 98210 10101', status: 'working',     score: 84, score_grade: 'A', city: 'Surat',     industry: 'Cement',        owner_id: 'demo-user-id', owner_name: REPS[0], last_activity_at: _now(-2),  created_at: _now(-11) },
  { id: 'demo-lead-11', first_name: 'Aditya',   last_name: 'Nair',   company: 'Helios Constructions',   email: 'aditya@helios.demo',    phone: '+91 98211 12121', status: 'qualified',   score: 78, score_grade: 'A', city: 'Delhi',     industry: 'Construction',  owner_id: 'demo-user-id', owner_name: REPS[1], last_activity_at: _now(-1),  created_at: _now(-28) },
  { id: 'demo-lead-12', first_name: 'Diya',     last_name: 'Kapoor', company: 'Coromandel Logistics',   email: 'diya@coromandel.demo',  phone: '+91 98212 13131', status: 'new',         score: 36, score_grade: 'C', city: 'Chennai',   industry: 'Logistics',     owner_id: 'demo-user-id', owner_name: REPS[2], last_activity_at: _now(-6),  created_at: _now(-9)  },
];

const CRM_STAGES = [
  { id: 'demo-stg-1', pipeline_id: 'demo-pipe', name: 'Discovery',     position: 0, probability: 10,  stage_type: 'open', color: '#94a3b8' },
  { id: 'demo-stg-2', pipeline_id: 'demo-pipe', name: 'Qualification', position: 1, probability: 25,  stage_type: 'open', color: '#60a5fa' },
  { id: 'demo-stg-3', pipeline_id: 'demo-pipe', name: 'Proposal',      position: 2, probability: 50,  stage_type: 'open', color: '#a78bfa' },
  { id: 'demo-stg-4', pipeline_id: 'demo-pipe', name: 'Negotiation',   position: 3, probability: 75,  stage_type: 'open', color: '#fbbf24' },
  { id: 'demo-stg-5', pipeline_id: 'demo-pipe', name: 'Closed Won',    position: 4, probability: 100, stage_type: 'won',  color: '#22c55e' },
  { id: 'demo-stg-6', pipeline_id: 'demo-pipe', name: 'Closed Lost',   position: 5, probability: 0,   stage_type: 'lost', color: '#ef4444' },
];

const CRM_PIPELINES = [{ id: 'demo-pipe', name: 'Sales', is_default: true, stages: CRM_STAGES }];

const CRM_ACCOUNTS = [
  { id: 'demo-acct-1', name: 'Skyline Developers',    domain: 'skyline.demo',    industry: 'Real Estate',    annual_revenue: 1850000000, owner_id: 'demo-user-id', owner_name: REPS[0], created_at: _now(-60) },
  { id: 'demo-acct-2', name: 'Zenith Properties',     domain: 'zenith.demo',     industry: 'Construction',   annual_revenue: 2100000000, owner_id: 'demo-user-id', owner_name: REPS[1], created_at: _now(-90) },
  { id: 'demo-acct-3', name: 'Acme Steel',            domain: 'acme.demo',       industry: 'Steel',          annual_revenue: 980000000,  owner_id: 'demo-user-id', owner_name: REPS[2], created_at: _now(-45) },
  { id: 'demo-acct-4', name: 'Vega Infra',            domain: 'vegainfra.demo',  industry: 'Infrastructure', annual_revenue: 3200000000, owner_id: 'demo-user-id', owner_name: REPS[0], created_at: _now(-120) },
  { id: 'demo-acct-5', name: 'Trident Power',         domain: 'trident.demo',    industry: 'Energy',         annual_revenue: 1450000000, owner_id: 'demo-user-id', owner_name: REPS[3], created_at: _now(-75) },
  { id: 'demo-acct-6', name: 'Suryadev Cement',       domain: 'suryadev.demo',   industry: 'Cement',         annual_revenue: 870000000,  owner_id: 'demo-user-id', owner_name: REPS[4], created_at: _now(-30) },
  { id: 'demo-acct-7', name: 'Helios Constructions',  domain: 'helios.demo',     industry: 'Construction',   annual_revenue: 1200000000, owner_id: 'demo-user-id', owner_name: REPS[1], created_at: _now(-150) },
  { id: 'demo-acct-8', name: 'Konkan Steel',          domain: 'konkan.demo',     industry: 'Steel',          annual_revenue: 760000000,  owner_id: 'demo-user-id', owner_name: REPS[2], created_at: _now(-100) },
];

const CRM_CONTACTS = [
  { id: 'demo-ctc-1', first_name: 'Vikram',  last_name: 'Reddy',  email: 'vikram@skyline.demo',  phone: '+91 98201 11111', title: 'VP Procurement',     account_id: 'demo-acct-1', account_name: 'Skyline Developers',    owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-2', first_name: 'Anjali',  last_name: 'Iyer',   email: 'anjali@zenith.demo',   phone: '+91 98202 22222', title: 'Director Materials', account_id: 'demo-acct-2', account_name: 'Zenith Properties',     owner_id: 'demo-user-id', owner_name: REPS[1] },
  { id: 'demo-ctc-3', first_name: 'Rohan',   last_name: 'Kumar',  email: 'rohan@acme.demo',      phone: '+91 98203 33333', title: 'GM Operations',      account_id: 'demo-acct-3', account_name: 'Acme Steel',            owner_id: 'demo-user-id', owner_name: REPS[2] },
  { id: 'demo-ctc-4', first_name: 'Neha',    last_name: 'Gupta',  email: 'neha@vegainfra.demo',  phone: '+91 98204 44444', title: 'Head of Procurement',account_id: 'demo-acct-4', account_name: 'Vega Infra',            owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-5', first_name: 'Karthik', last_name: 'Pillai', email: 'karthik@trident.demo', phone: '+91 98205 55555', title: 'Project Manager',    account_id: 'demo-acct-5', account_name: 'Trident Power',         owner_id: 'demo-user-id', owner_name: REPS[3] },
  { id: 'demo-ctc-6', first_name: 'Karan',   last_name: 'Verma',  email: 'karan@suryadev.demo',  phone: '+91 98210 10101', title: 'Founder',            account_id: 'demo-acct-6', account_name: 'Suryadev Cement',       owner_id: 'demo-user-id', owner_name: REPS[0] },
  { id: 'demo-ctc-7', first_name: 'Aditya',  last_name: 'Nair',   email: 'aditya@helios.demo',   phone: '+91 98211 12121', title: 'Site Engineer',      account_id: 'demo-acct-7', account_name: 'Helios Constructions',  owner_id: 'demo-user-id', owner_name: REPS[1] },
  { id: 'demo-ctc-8', first_name: 'Manish',  last_name: 'Khanna', email: 'manish@konkan.demo',   phone: '+91 98207 77777', title: 'VP Sales',           account_id: 'demo-acct-8', account_name: 'Konkan Steel',          owner_id: 'demo-user-id', owner_name: REPS[2] },
];

const CRM_DEALS = [
  { id: 'demo-deal-1',  name: 'Skyline Mumbai Tower – Steel',    account_id: 'demo-acct-1', account_name: 'Skyline Developers',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-3', stage_name: 'Proposal',      stage_type: 'open', status: 'open', amount: 7250000,  currency: 'INR', probability: 50,  win_probability_ai: 62,  owner_id: 'demo-user-id', owner_name: REPS[0], expected_close_date: _now(12).slice(0, 10),  created_at: _now(-30) },
  { id: 'demo-deal-2',  name: 'Zenith Pune Hi-Rise – Cement',    account_id: 'demo-acct-2', account_name: 'Zenith Properties',      pipeline_id: 'demo-pipe', stage_id: 'demo-stg-4', stage_name: 'Negotiation',   stage_type: 'open', status: 'open', amount: 12400000, currency: 'INR', probability: 75,  win_probability_ai: 78,  owner_id: 'demo-user-id', owner_name: REPS[1], expected_close_date: _now(6).slice(0, 10),   created_at: _now(-45) },
  { id: 'demo-deal-3',  name: 'Acme TMT Bars – Q3 Restock',      account_id: 'demo-acct-3', account_name: 'Acme Steel',             pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Qualification', stage_type: 'open', status: 'open', amount: 3800000,  currency: 'INR', probability: 25,  win_probability_ai: 35,  owner_id: 'demo-user-id', owner_name: REPS[2], expected_close_date: _now(28).slice(0, 10),  created_at: _now(-14) },
  { id: 'demo-deal-4',  name: 'Vega Highway Project – Steel',    account_id: 'demo-acct-4', account_name: 'Vega Infra',             pipeline_id: 'demo-pipe', stage_id: 'demo-stg-3', stage_name: 'Proposal',      stage_type: 'open', status: 'open', amount: 18500000, currency: 'INR', probability: 50,  win_probability_ai: 71,  owner_id: 'demo-user-id', owner_name: REPS[0], expected_close_date: _now(18).slice(0, 10),  created_at: _now(-50) },
  { id: 'demo-deal-5',  name: 'Trident Substation – GI Wire',    account_id: 'demo-acct-5', account_name: 'Trident Power',          pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'Discovery',     stage_type: 'open', status: 'open', amount: 2150000,  currency: 'INR', probability: 10,  win_probability_ai: 22,  owner_id: 'demo-user-id', owner_name: REPS[3], expected_close_date: _now(35).slice(0, 10),  created_at: _now(-8)  },
  { id: 'demo-deal-6',  name: 'Suryadev OPC Cement – Annual',    account_id: 'demo-acct-6', account_name: 'Suryadev Cement',        pipeline_id: 'demo-pipe', stage_id: 'demo-stg-4', stage_name: 'Negotiation',   stage_type: 'open', status: 'open', amount: 9800000,  currency: 'INR', probability: 75,  win_probability_ai: 80,  owner_id: 'demo-user-id', owner_name: REPS[4], expected_close_date: _now(4).slice(0, 10),   created_at: _now(-22) },
  { id: 'demo-deal-7',  name: 'Helios Mumbai Phase 2',           account_id: 'demo-acct-7', account_name: 'Helios Constructions',   pipeline_id: 'demo-pipe', stage_id: 'demo-stg-2', stage_name: 'Qualification', stage_type: 'open', status: 'open', amount: 5400000,  currency: 'INR', probability: 25,  win_probability_ai: 40,  owner_id: 'demo-user-id', owner_name: REPS[1], expected_close_date: _now(22).slice(0, 10),  created_at: _now(-10) },
  { id: 'demo-deal-8',  name: 'Konkan TMT 16mm Pilot',           account_id: 'demo-acct-8', account_name: 'Konkan Steel',           pipeline_id: 'demo-pipe', stage_id: 'demo-stg-1', stage_name: 'Discovery',     stage_type: 'open', status: 'open', amount: 1750000,  currency: 'INR', probability: 10,  win_probability_ai: 18,  owner_id: 'demo-user-id', owner_name: REPS[2], expected_close_date: _now(40).slice(0, 10),  created_at: _now(-5)  },
  { id: 'demo-deal-9',  name: 'Skyline – Bengaluru Tower',       account_id: 'demo-acct-1', account_name: 'Skyline Developers',     pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 14200000, currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[0], actual_close_date: _now(-3).slice(0, 10),    created_at: _now(-65) },
  { id: 'demo-deal-10', name: 'Vega Highway Phase 1 – Cement',   account_id: 'demo-acct-4', account_name: 'Vega Infra',             pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 22600000, currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[0], actual_close_date: _now(-12).slice(0, 10),   created_at: _now(-80) },
  { id: 'demo-deal-11', name: 'Suryadev Demo Pilot',             account_id: 'demo-acct-6', account_name: 'Suryadev Cement',        pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 4300000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[4], actual_close_date: _now(-25).slice(0, 10),   created_at: _now(-50) },
  { id: 'demo-deal-12', name: 'Helios Pune Site Closeout',       account_id: 'demo-acct-7', account_name: 'Helios Constructions',   pipeline_id: 'demo-pipe', stage_id: 'demo-stg-5', stage_name: 'Closed Won',    stage_type: 'won',  status: 'won',  amount: 6750000,  currency: 'INR', probability: 100, win_probability_ai: 100, owner_id: 'demo-user-id', owner_name: REPS[1], actual_close_date: _now(-38).slice(0, 10),   created_at: _now(-75) },
  { id: 'demo-deal-13', name: 'Trident – lost to Tata',          account_id: 'demo-acct-5', account_name: 'Trident Power',          pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Closed Lost',   stage_type: 'lost', status: 'lost', amount: 3200000,  currency: 'INR', probability: 0,   win_probability_ai: 0,   owner_id: 'demo-user-id', owner_name: REPS[3], actual_close_date: _now(-18).slice(0, 10),    created_at: _now(-60), lost_reason: 'Competitor' },
  { id: 'demo-deal-14', name: 'Acme – budget cut',               account_id: 'demo-acct-3', account_name: 'Acme Steel',             pipeline_id: 'demo-pipe', stage_id: 'demo-stg-6', stage_name: 'Closed Lost',   stage_type: 'lost', status: 'lost', amount: 2800000,  currency: 'INR', probability: 0,   win_probability_ai: 0,   owner_id: 'demo-user-id', owner_name: REPS[2], actual_close_date: _now(-30).slice(0, 10),    created_at: _now(-70), lost_reason: 'No budget'  },
];

const CRM_ACTIVITIES = [
  { id: 'demo-act-1',  type: 'call',    subject: 'Discovery call with Vikram',   status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-1', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-2',  type: 'email',   subject: 'Pricing sent to Anjali',       status: 'completed', completed_at: _now(-2), lead_id: 'demo-lead-2', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[1] },
  { id: 'demo-act-3',  type: 'meeting', subject: 'Site visit – Skyline Tower',   status: 'completed', completed_at: _now(-3), lead_id: null,          deal_id: 'demo-deal-1',  assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-4',  type: 'note',    subject: 'Decision-maker change at Vega',status: 'completed', completed_at: _now(-5), lead_id: null,          deal_id: 'demo-deal-4',  assigned_to: 'demo-user-id', assigned_to_name: REPS[0] },
  { id: 'demo-act-5',  type: 'call',    subject: 'Follow-up with Rohan',         status: 'completed', completed_at: _now(-4), lead_id: 'demo-lead-3', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[2] },
  { id: 'demo-act-6',  type: 'task',    subject: 'Send proposal to Trident',     status: 'planned',   due_at: _now(2),         lead_id: null,          deal_id: 'demo-deal-5',  assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-7',  type: 'call',    subject: 'Negotiate with Suryadev',      status: 'completed', completed_at: _now(-1), lead_id: null,          deal_id: 'demo-deal-6',  assigned_to: 'demo-user-id', assigned_to_name: REPS[4] },
  { id: 'demo-act-8',  type: 'email',   subject: 'Intro deck to Karthik',        status: 'completed', completed_at: _now(-6), lead_id: 'demo-lead-5', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-9',  type: 'meeting', subject: 'Quarterly review – Helios',    status: 'completed', completed_at: _now(-8), lead_id: null,          deal_id: 'demo-deal-7',  assigned_to: 'demo-user-id', assigned_to_name: REPS[1] },
  { id: 'demo-act-10', type: 'task',    subject: 'Quote for Acme TMT',           status: 'planned',   due_at: _now(1),         lead_id: null,          deal_id: 'demo-deal-3',  assigned_to: 'demo-user-id', assigned_to_name: REPS[2] },
  { id: 'demo-act-11', type: 'call',    subject: 'Cold outreach – Tanvi',        status: 'completed', completed_at: _now(-1), lead_id: 'demo-lead-9', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[3] },
  { id: 'demo-act-12', type: 'note',    subject: 'Konkan asked for samples',     status: 'completed', completed_at: _now(-9), lead_id: 'demo-lead-7', deal_id: null,           assigned_to: 'demo-user-id', assigned_to_name: REPS[1] },
];

const CRM_SOURCES = [
  { id: 'demo-src-1', name: 'Website',       cost_per_lead: 250, is_active: true },
  { id: 'demo-src-2', name: 'Referral',      cost_per_lead: 0,   is_active: true },
  { id: 'demo-src-3', name: 'Trade Show',    cost_per_lead: 800, is_active: true },
  { id: 'demo-src-4', name: 'Cold Outreach', cost_per_lead: 100, is_active: true },
  { id: 'demo-src-5', name: 'LinkedIn Ads',  cost_per_lead: 450, is_active: true },
];

const CRM_DASHBOARD_SUMMARY = {
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

const CRM_PIPELINE_VALUE = CRM_STAGES.filter(s => s.stage_type === 'open').map(s => {
  const deals = CRM_DEALS.filter(d => d.stage_id === s.id && d.status === 'open');
  const total = deals.reduce((acc, d) => acc + d.amount, 0);
  return {
    stage_id: s.id, stage_name: s.name, stage_type: s.stage_type, position: s.position,
    deal_count: deals.length, total_amount: total,
    weighted_amount: Math.round(total * (s.probability / 100)),
  };
});

const CRM_FUNNEL = [
  { stage: 'New',         count: 12, value: 4_800_000  },
  { stage: 'Qualified',   count: 9,  value: 18_500_000 },
  { stage: 'Proposal',    count: 6,  value: 31_550_000 },
  { stage: 'Negotiation', count: 4,  value: 22_400_000 },
  { stage: 'Won',         count: 4,  value: 47_850_000 },
];

const CRM_WIN_RATE = REPS.map((name, i) => ({
  rep_id: 'demo-user-id', rep_name: name,
  won: 5 - i, lost: i, total_closed: Math.max(1, 5 - i + i),
  win_rate: Math.round((5 - i) / Math.max(1, 5) * 100),
  revenue: [22_600_000, 14_200_000, 6_750_000, 4_300_000, 0][i] || 0,
}));

const CRM_FORECAST = (() => {
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

const CRM_HEATMAP = (() => {
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

const CRM_LEAD_SOURCE_ROI = CRM_SOURCES.map((s, i) => ({
  source_id: s.id, source_name: s.name,
  leads:     [12, 8,  4, 14, 6][i],
  qualified: [5,  6,  3,  4, 2][i],
  won:       [3,  4,  2,  1, 1][i],
  cost:      [12*s.cost_per_lead, 0, 4*s.cost_per_lead, 14*s.cost_per_lead, 6*s.cost_per_lead][i],
  revenue:   [22_600_000, 14_200_000, 6_750_000, 4_300_000, 0][i] || 0,
}));

const CRM_SCORE_DIST = [
  { bucket: '0-20',   count: 4 },
  { bucket: '21-40',  count: 7 },
  { bucket: '41-60',  count: 9 },
  { bucket: '61-80',  count: 14 },
  { bucket: '81-100', count: 10 },
];

const CRM_SALES_CYCLE = [
  { stage: 'Discovery',     avg_days: 4 },
  { stage: 'Qualification', avg_days: 7 },
  { stage: 'Proposal',      avg_days: 11 },
  { stage: 'Negotiation',   avg_days: 8 },
];

const CRM_DASHBOARD_COMPLETE = {
  unit: 'inr',
  summary:               CRM_DASHBOARD_SUMMARY,
  pipelineValue:         CRM_PIPELINE_VALUE,
  funnel:                CRM_FUNNEL,
  winRate:               CRM_WIN_RATE,
  forecast:              CRM_FORECAST,
  leadScoreDistribution: CRM_SCORE_DIST,
};

const CRM_TERRITORIES = [
  { id: 'demo-terr-1', name: 'Mumbai West',      is_active: true },
  { id: 'demo-terr-2', name: 'Bangalore North',  is_active: true },
  { id: 'demo-terr-3', name: 'Delhi Central',    is_active: true },
];
const CRM_PRODUCTS = [
  { id: 'demo-prod-1', name: 'TMT Bar 8mm',  sku: 'TMT-8',  unit_price: 65,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-2', name: 'TMT Bar 12mm', sku: 'TMT-12', unit_price: 64,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-3', name: 'TMT Bar 16mm', sku: 'TMT-16', unit_price: 63,  unit: 'kg',  is_active: true },
  { id: 'demo-prod-4', name: 'OPC Cement 53', sku: 'CEM-OPC53', unit_price: 410, unit: 'bag', is_active: true },
  { id: 'demo-prod-5', name: 'GI Wire 8 SWG', sku: 'GI-8',  unit_price: 92,  unit: 'kg',  is_active: true },
];

// Seed templates the demo user sees out of the box. New ones the demo user
// creates are persisted to localStorage (key DEMO_WA_TEMPLATES_KEY) and
// merged on read so the round-trip "create → see in list" works without a
// backend.
const CRM_WA_TEMPLATES_SEED = [
  {
    id: 'demo-wa-tpl-1',
    org_id: 'demo-org-999',
    meta_template_name: 'welcome_greeting',
    category: 'utility',
    language: 'en',
    status: 'approved',
    header_text: null,
    body_text: 'Hi {{1}}, welcome to Kinematic! We are excited to help you grow your business.',
    footer_text: 'Reply STOP to opt out.',
    variables: ['first_name'],
    created_at: _now(-30),
    updated_at: _now(-30),
  },
  {
    id: 'demo-wa-tpl-2',
    org_id: 'demo-org-999',
    meta_template_name: 'order_shipped',
    category: 'utility',
    language: 'en',
    status: 'approved',
    header_text: 'Order Shipped',
    body_text: 'Hi {{1}}, your order #{{2}} has been shipped. Tracking link: {{3}}',
    footer_text: null,
    variables: ['first_name', 'order_id', 'tracking_url'],
    created_at: _now(-14),
    updated_at: _now(-14),
  },
  {
    id: 'demo-wa-tpl-3',
    org_id: 'demo-org-999',
    meta_template_name: 'meeting_reminder',
    category: 'utility',
    language: 'en',
    status: 'pending',
    header_text: null,
    body_text: 'Hi {{1}}, a quick reminder about our meeting at {{2}} tomorrow. Looking forward to it!',
    footer_text: null,
    variables: ['first_name', 'meeting_time'],
    created_at: _now(-3),
    updated_at: _now(-3),
  },
];

const DEMO_WA_TEMPLATES_KEY = 'kinematic_demo_wa_templates';

function readDemoWaTemplates(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_WA_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeDemoWaTemplates(rows: Array<Record<string, unknown>>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DEMO_WA_TEMPLATES_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}

function pushDemoWaTemplate(row: Record<string, unknown>) {
  const list = readDemoWaTemplates();
  list.unshift(row);
  writeDemoWaTemplates(list);
}

// ---------------------------------------------------------------------------
// Planogram mocks
// ---------------------------------------------------------------------------

const PLAN_SHELVES = [
  { index: 0, capacity: 18 }, { index: 1, capacity: 18 }, { index: 2, capacity: 18 }, { index: 3, capacity: 18 },
];

const PLAN_EXPECTED_SKUS = [
  { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',  shelf_index: 0, facings: 4, position: 1, weight: 1 },
  { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm', shelf_index: 0, facings: 6, position: 2, weight: 1 },
  { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', shelf_index: 1, facings: 5, position: 1, weight: 1 },
  { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53',shelf_index: 2, facings: 8, position: 1, weight: 1 },
  { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG',shelf_index: 3, facings: 4, position: 3, weight: 1 },
];

const PLANOGRAMS = [
  { id: 'demo-pg-1', org_id: 'demo-org-999', name: 'Steel & Cement Premium GT',  category: 'Building Materials', store_format: 'GT-LARGE',  source_url: null, layout: { shelves: PLAN_SHELVES }, expected_skus: PLAN_EXPECTED_SKUS,            version: 3, is_active: true,  created_at: _now(-90), updated_at: _now(-7)  },
  { id: 'demo-pg-2', org_id: 'demo-org-999', name: 'Cement Counter MT',          category: 'Cement',             store_format: 'MT',        source_url: null, layout: { shelves: PLAN_SHELVES.slice(0, 3) }, expected_skus: PLAN_EXPECTED_SKUS.slice(2, 5), version: 1, is_active: true,  created_at: _now(-45), updated_at: _now(-12) },
  { id: 'demo-pg-3', org_id: 'demo-org-999', name: 'TMT Distributor – Tier 2',   category: 'Steel',              store_format: 'GT-MEDIUM', source_url: null, layout: { shelves: PLAN_SHELVES.slice(0, 2) }, expected_skus: PLAN_EXPECTED_SKUS.slice(0, 3), version: 2, is_active: true,  created_at: _now(-60), updated_at: _now(-3)  },
  { id: 'demo-pg-4', org_id: 'demo-org-999', name: 'Wholesale Slab',             category: 'Mixed',              store_format: 'WHOLESALE', source_url: null, layout: { shelves: PLAN_SHELVES }, expected_skus: PLAN_EXPECTED_SKUS,            version: 1, is_active: false, created_at: _now(-180),updated_at: _now(-30) },
];

const PLAN_ASSIGNMENTS = [
  { id: 'demo-pga-1', planogram_id: 'demo-pg-1', store_id: null, zone_id: 'demo-zone-1', city_id: null, valid_from: _now(-30), valid_to: null, created_at: _now(-30) },
  { id: 'demo-pga-2', planogram_id: 'demo-pg-1', store_id: null, zone_id: 'demo-zone-2', city_id: null, valid_from: _now(-30), valid_to: null, created_at: _now(-30) },
  { id: 'demo-pga-3', planogram_id: 'demo-pg-2', store_id: null, zone_id: null,           city_id: 'demo-city-1', valid_from: _now(-15), valid_to: null, created_at: _now(-15) },
];

const PLAN_CAPTURES = [
  { id: 'demo-cap-1', planogram_id: 'demo-pg-1', store_id: 'demo-store-1', store_name: 'Reliance Fresh – Koramangala', fe_id: 'fe1', fe_name: 'Arjun Sharma', captured_at: _now(-1), photo_url: null, score: 88, processed_at: _now(-1) },
  { id: 'demo-cap-2', planogram_id: 'demo-pg-1', store_id: 'demo-store-2', store_name: 'Big Bazaar – Andheri',         fe_id: 'fe2', fe_name: 'Priya Patel',  captured_at: _now(-2), photo_url: null, score: 72, processed_at: _now(-2) },
  { id: 'demo-cap-3', planogram_id: 'demo-pg-2', store_id: 'demo-store-3', store_name: 'Star Market – Saket',          fe_id: 'fe3', fe_name: 'Rahul Verma', captured_at: _now(-3), photo_url: null, score: 91, processed_at: _now(-3) },
  { id: 'demo-cap-4', planogram_id: 'demo-pg-3', store_id: 'demo-store-4', store_name: 'Metro Cash – HSR',             fe_id: 'fe1', fe_name: 'Arjun Sharma', captured_at: _now(-4), photo_url: null, score: 64, processed_at: _now(-4) },
  { id: 'demo-cap-5', planogram_id: 'demo-pg-1', store_id: 'demo-store-5', store_name: "Spencer's – Whitefield",       fe_id: 'fe4', fe_name: 'Sneha Rao',   captured_at: _now(-5), photo_url: null, score: 79, processed_at: _now(-5) },
  { id: 'demo-cap-6', planogram_id: 'demo-pg-2', store_id: 'demo-store-6', store_name: 'Reliance SMART – Powai',       fe_id: 'fe5', fe_name: 'Amit Singh',  captured_at: _now(-6), photo_url: null, score: 83, processed_at: _now(-6) },
];

const planRecognitionFor = (captureId: string) => ({
  id: 'demo-rec-' + captureId, capture_id: captureId,
  detected_skus: [
    { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',  facings: 3, shelf_index: 0, bbox: [10, 10, 80, 60]  as [number, number, number, number], confidence: 0.92, is_competitor: false },
    { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm', facings: 6, shelf_index: 0, bbox: [95, 10, 220, 60] as [number, number, number, number], confidence: 0.88, is_competitor: false },
    { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', facings: 4, shelf_index: 1, bbox: [10, 80, 160, 130]as [number, number, number, number], confidence: 0.85, is_competitor: false },
    { sku_id: null,          sku_name: 'Tata Tiscon (competitor)', facings: 2, shelf_index: 1, bbox: [180, 80, 240, 130] as [number, number, number, number], confidence: 0.74, is_competitor: true },
  ],
  shelf_map: { shelf_count: 4 },
  overall_confidence: 0.86,
  needs_review: false,
  model_versions: { detector: 'yolo-v8-1.2', classifier: 'mobilenet-3' },
  processed_at: _now(-1),
});

const planComplianceFor = (captureId: string, planogramId = 'demo-pg-1', score = 82) => ({
  id: 'demo-cmp-' + captureId, capture_id: captureId, planogram_id: planogramId,
  store_id: 'demo-store-1', fe_id: 'fe1',
  score, presence_score: score + 4, facing_score: score - 6, position_score: score,
  competitor_share: 0.16,
  missing_skus: [
    { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', expected_facings: 4 },
  ],
  misplaced_skus: [
    { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', expected_shelf: 1, actual_shelf: 2 },
  ],
  facing_deltas: [
    { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',  expected: 4, actual: 3, delta: -1 },
    { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm', expected: 6, actual: 6, delta:  0 },
    { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53',expected: 8, actual: 5, delta: -3 },
  ],
  recommendations: [
    { priority: 'critical' as const, action: 'Restock OPC Cement 53 (3 facings short)',                    sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53', rationale: 'Top SKU at this format; recovers ~₹4.8L MoM.' },
    { priority: 'high'     as const, action: 'Move TMT 16mm back to shelf 1',                              sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm', rationale: 'Misplaced on shelf 2 reduces eye-line.' },
    { priority: 'medium'   as const, action: 'Add 1 facing of TMT 8mm',                                    sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm', rationale: 'Improves entry-level visibility.' },
    { priority: 'low'      as const, action: 'Add GI Wire 8 SWG (currently absent)',                       sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', rationale: 'Optional accessory, low velocity.' },
  ],
  created_at: _now(-1),
});

const PLAN_TREND = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    date: d.toISOString().split('T')[0],
    score: 65 + Math.round(Math.sin(i / 4) * 8 + Math.random() * 6),
    captures: 12 + Math.round(Math.random() * 18),
  };
});

const PLAN_STORE_RANKING = [
  { store_id: 'demo-store-3', store_name: 'Star Market – Saket',          captures: 18, avg_score: 91 },
  { store_id: 'demo-store-1', store_name: 'Reliance Fresh – Koramangala', captures: 22, avg_score: 88 },
  { store_id: 'demo-store-6', store_name: 'Reliance SMART – Powai',       captures: 14, avg_score: 83 },
  { store_id: 'demo-store-5', store_name: "Spencer's – Whitefield",       captures: 11, avg_score: 79 },
  { store_id: 'demo-store-2', store_name: 'Big Bazaar – Andheri',         captures: 19, avg_score: 72 },
  { store_id: 'demo-store-4', store_name: 'Metro Cash – HSR',             captures:  8, avg_score: 64 },
];

const PLAN_CHRONIC_GAPS = [
  { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53', gap_days: 14, stores_affected: 8, avg_facing_delta: -2.6 },
  { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG', gap_days: 22, stores_affected: 5, avg_facing_delta: -1.8 },
  { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm',  gap_days: 9,  stores_affected: 4, avg_facing_delta: -1.2 },
];

const PLAN_SKU_VISIBILITY = [
  { sku_id: 'demo-prod-1', sku_name: 'TMT Bar 8mm',     visibility_pct: 78, competitor_share: 0.15 },
  { sku_id: 'demo-prod-2', sku_name: 'TMT Bar 12mm',    visibility_pct: 92, competitor_share: 0.08 },
  { sku_id: 'demo-prod-3', sku_name: 'TMT Bar 16mm',    visibility_pct: 65, competitor_share: 0.22 },
  { sku_id: 'demo-prod-4', sku_name: 'OPC Cement 53',   visibility_pct: 48, competitor_share: 0.34 },
  { sku_id: 'demo-prod-5', sku_name: 'GI Wire 8 SWG',   visibility_pct: 41, competitor_share: 0.18 },
];

const PLAN_RISK_FORECAST = [
  { store_id: 'demo-store-4', store_name: 'Metro Cash – HSR',     risk_score: 0.82, predicted_drop: -14, primary_reason: 'Repeated facing shortfall on OPC Cement' },
  { store_id: 'demo-store-2', store_name: 'Big Bazaar – Andheri', risk_score: 0.61, predicted_drop:  -7, primary_reason: 'Competitor share rising over 4 weeks' },
  { store_id: 'demo-store-5', store_name: "Spencer's – Whitefield", risk_score: 0.48, predicted_drop: -3, primary_reason: 'Misplaced TMT 16mm on entry shelf' },
];

// ---------------------------------------------------------------------------
// Path → mock router. Returns the wrapped {success, data} payload, or
// undefined to fall through to the network call.
// ---------------------------------------------------------------------------
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
    // ---- Legacy analytics ----
    if (path === '/analytics/dashboard-init')   return mockDashboardInit() as unknown as T;
    if (path === '/analytics/summary')          return mockSummary(new Date().toISOString().split('T')[0]) as unknown as T;
    if (path === '/analytics/trends')           return mockTrends() as unknown as T;
    if (path === '/analytics/feed')             return mockFeed() as unknown as T;
    if (path === '/analytics/heatmap')          return mockHeatmap() as unknown as T;
    if (path === '/analytics/locations')        return mockLocations() as unknown as T;
    if (path === '/analytics/weekly-contacts')  return mockWeeklyContacts() as unknown as T;
    if (path === '/analytics/city-performance') return mockCityPerformance() as unknown as T;
    if (path === '/analytics/outlet-coverage')  return mockOutletCoverage() as unknown as T;
    if (path === '/analytics/attendance-today') return mockAttendanceTeam() as unknown as T;
    if (path === '/analytics/mobile-home')      return mockMobileHome() as unknown as T;

    // ---- Other legacy collections ----
    if (path === '/users')                      return mockUsers() as unknown as T;
    if (path === '/attendance/team')            return mockAttendanceTeam() as unknown as T;
    if (path === '/zones')                      return mockZones() as unknown as T;
    if (path === '/clients')                    return mockClients() as unknown as T;
    if (path === '/inventory' || path === '/skus') return mockInventory() as unknown as T;
    if (path === '/warehouses' || path === '/warehouse/summary') return mockWarehouseSummary() as unknown as T;
    if (path === '/movements' || path === '/wms/movements')      return mockMovements() as unknown as T;
    if (path === '/cities')                     return mockCities() as unknown as T;
    if (path === '/grievances')                 return mockGrievances() as unknown as T;
    if (path === '/sos' || path === '/sos/active') return mockSOS() as unknown as T;
    if (path === '/broadcast' || path === '/broadcasts') return mockBroadcasts() as unknown as T;
    if (path === '/learning')                   return mockLearningMaterials() as unknown as T;
    if (path === '/visit-logs')                 return mockVisitLogs() as unknown as T;
    if (path === '/forms/templates' || path === '/form-templates') return mockFormTemplates() as unknown as T;
    if (path === '/forms/submissions' || path === '/submissions')  return mockSubmissions() as unknown as T;
    if (path === '/route-plans')                return mockRoutePlans() as unknown as T;
    if (path === '/activities')                 return mockActivities() as unknown as T;
    if (path === '/assets')                     return mockAssets() as unknown as T;
    if (path === '/security/alerts')            return mockSecurityAlerts() as unknown as T;
    if (path === '/stores')                     return mockStores() as unknown as T;

    // ---- CRM ----
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
      // Seed + anything the demo user has saved this session.
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

    // ---- Misc / Platform endpoints ----
    if (path === '/misc/clients') {
      return list([
        { id: 'demo-client-1', name: 'Acme Corp',         is_active: true },
        { id: 'demo-client-2', name: 'Globex Industries', is_active: true },
        { id: 'demo-client-3', name: 'Wayne Enterprises', is_active: true },
      ]) as unknown as T;
    }
    if (path === '/misc/security/alerts/all') return list([]) as unknown as T;
    if (path === '/notifications/history')    return list([]) as unknown as T;
    if (path === '/candidates' || path.startsWith('/candidates?')) {
      return wrap({ data: [], total: 0, by_status: {} }) as unknown as T;
    }
    if (path === '/forms/submissions' || path === '/builder/forms/admin/submissions') {
      return wrap({ data: [], total: 0 }) as unknown as T;
    }
    if (path === '/broadcast/admin') return list([]) as unknown as T;
    if (path === '/route-plans/summary') {
      return wrap({
        total_plans: 0, total_outlets: 0, visited_outlets: 0,
        missed_outlets: 0, completion_pct: 0, by_status: {},
      }) as unknown as T;
    }

    // ---- HR / candidates pages ----
    if (path === '/hr/dashboard' || path === '/hr/summary') {
      return wrap({ pipeline: [], by_stage: {}, total: 0 }) as unknown as T;
    }

    // ---- Misc settings shapes ----
    if (path === '/settings' || path === '/settings/org') return wrap({}) as unknown as T;
    if (path === '/roles')   return list([]) as unknown as T;
    if (path === '/modules') return list([]) as unknown as T;

    // ---- Activity Log (super-admin) ----
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
          { id: null,  name: null }, // org-level
        ];
        const actions = [
          { action: 'leads.create',         entity: 'leads',         method: 'POST',   status: 201 },
          { action: 'leads.update',         entity: 'leads',         method: 'PATCH',  status: 200 },
          { action: 'deals.move-stage',     entity: 'deals',         method: 'POST',   status: 200 },
          { action: 'deals.win',            entity: 'deals',         method: 'POST',   status: 200 },
          { action: 'orders.create',        entity: 'orders',        method: 'POST',   status: 201 },
          { action: 'orders.approve',       entity: 'orders',        method: 'POST',   status: 200 },
          { action: 'invoices.create',      entity: 'invoices',      method: 'POST',   status: 201 },
          { action: 'payments.create',      entity: 'payments',      method: 'POST',   status: 201 },
          { action: 'attendance.checkin',   entity: 'attendance',    method: 'POST',   status: 201 },
          { action: 'attendance.checkout',  entity: 'attendance',    method: 'PATCH',  status: 200 },
          { action: 'planograms.update',    entity: 'planograms',    method: 'PATCH',  status: 200 },
          { action: 'users.create',         entity: 'users',         method: 'POST',   status: 201 },
          { action: 'broadcast.send',       entity: 'broadcast',     method: 'POST',   status: 201 },
          { action: 'visit-logs.create',    entity: 'visit-logs',    method: 'POST',   status: 201 },
          { action: 'leads.delete',         entity: 'leads',         method: 'DELETE', status: 204 },
        ];
        const rows = Array.from({ length: 60 }, (_, i) => {
          const a = actions[i % actions.length];
          const u = reps[i % reps.length];
          const c = clients[i % clients.length];
          const ts = new Date(Date.now() - i * 1000 * 60 * (3 + (i % 10))).toISOString();
          return {
            id: 'demo-audit-' + i,
            created_at: ts,
            action: a.action,
            entity_table: a.entity,
            entity_id: i % 4 === 0 ? null : 'demo-' + a.entity + '-' + (i + 1),
            actor: u,
            client: c.id ? c : null,
            ip_address: '203.0.113.' + (10 + (i % 200)),
            metadata: { method: a.method, path: `/api/v1/${a.entity.replace('-', '/')}${i % 4 === 0 ? '' : '/demo-' + a.entity + '-' + (i + 1)}`, status: a.status },
            payload: null,
          };
        });
        return { rows, limit: 100, offset: 0, has_more: false };
      })();
      return wrap(sample) as unknown as T;
    }

    // ---- Planograms ----
    // Order matters: more-specific paths (captures, analytics, parse) must come
    // BEFORE the generic /planograms/:id matcher.
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

  // Mutations: pretend-success no-op so the demo can click around without 500s.
  if (m === 'POST' || m === 'PATCH' || m === 'PUT') {
    // Demo template CRUD: persist locally so the WhatsApp page can see what
    // the user just created. Backend writes would otherwise be silently
    // dropped by the noop response below.
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
      // If they're editing a seeded template, persist a copy so the change sticks.
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
    if (path.startsWith('/crm/whatsapp-templates/')) {
      const id = path.split('/').pop() || '';
      const list = readDemoWaTemplates().filter((r) => r.id !== id);
      writeDemoWaTemplates(list);
    }
    return wrap({ ok: true, demo: true }) as unknown as T;
  }

  // Catch-all for any GET on /api/v1/* not explicitly handled above.
  // Returns an empty list payload — list pages render "No items", object
  // consumers see `data.foo === undefined` which most pages already
  // handle defensively. Better to render an empty state than to 500.
  if (m === 'GET' && rawPath.startsWith('/api/v1/')) {
    return list([]) as unknown as T;
  }

  return undefined;
}
