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
      id: 'fe1', name: 'Arjun Sharma', display_status: 'present', 
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:15:00Z'), 
      total_hours: 4.5, 
      selfie_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
      checkin_address: 'Koramangala 4th Block, Bangalore', 
      latitude: 12.9352, longitude: 77.6245,
      zones: { name: 'Bangalore North' },
      users: { name: 'Arjun Sharma', employee_id: 'KIN-001' } 
    },
    { 
      id: 'fe2', name: 'Priya Patel', display_status: 'present', 
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:30:00Z'), 
      total_hours: 4.2, 
      selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      checkin_address: 'Mumbai West, Near Station', 
      latitude: 19.0760, longitude: 72.8777,
      zones: { name: 'Mumbai West' },
      users: { name: 'Priya Patel', employee_id: 'KIN-002' } 
    },
    { 
      id: 'fe3', name: 'Rahul Verma', display_status: 'on_break', 
      checkin_at: new Date().toISOString().replace(/T.*/, 'T09:00:00Z'), 
      total_hours: 4.8, 
      selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      checkin_address: 'Delhi Central, Connaught Place',
      latitude: 28.6139, longitude: 77.2090, 
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
    { id: 'v1', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive: { name: 'Arjun Sharma' }, rating: 'Excellent', remarks: 'Good shelf discipline. Product display is perfect.', visited_at: new Date().toISOString(), visit_response: 'Thanks, working on the inventory update now.' },
    { id: 'v2', visitor_name: 'Anita Desai', visitor_role: 'Supervisor', executive: { name: 'Priya Patel' }, rating: 'Good', remarks: 'Store compliance met. Need focus on SKU expansion.', visited_at: new Date(Date.now() - 3600000).toISOString(), visit_response: null },
    { id: 'v3', visitor_name: 'Manish Kumar', visitor_role: 'Operations Manager', executive: { name: 'Rahul Verma' }, rating: 'Average', remarks: 'Uniform missing. Grooming standards need improvement.', visited_at: new Date(Date.now() - 7200000).toISOString(), visit_response: 'Noted. Will ensure from tomorrow.' }
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
    { id: 's5', submitted_at: new Date(Date.now() - 10800000).toISOString(), is_converted: false, outlet_name: 'Smart - Jayanagar', users: { name: 'Amit Singh' }, form_templates: { name: 'Stock Repo' }, activities: { name: 'Inventory' } }
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
    { id: 'b1', title: 'Eid Mubarak!', message: 'Wishing everyone a happy and prosperous Eid. Enjoy the holiday!', created_at: new Date().toISOString(), status: 'active' }
  ]
});

export const mockCities = () => ({
  success: true,
  data: [
    { id: 'c1', name: 'Bangalore', state: 'Karnataka', is_active: true },
    { id: 'c2', name: 'Mumbai', state: 'Maharashtra', is_active: true },
    { id: 'c3', name: 'Delhi', state: 'Delhi', is_active: true }
  ]
});

export const mockZones = () => ({
  success: true,
  data: [
    { id: 'z1', name: 'Koramangala 4th Block', city: 'Bangalore', is_active: true },
    { id: 'z2', name: 'Andheri East', city: 'Mumbai', is_active: true },
    { id: 'z3', name: 'Connaught Place', city: 'Delhi', is_active: true }
  ]
});

export const mockClients = () => ({
  success: true,
  data: [
    { id: 'cl1', name: 'Hindustan Unilever', is_active: true },
    { id: 'cl2', name: 'ITC Limited', is_active: true },
    { id: 'cl3', name: 'Nestle India', is_active: true }
  ]
});

export const mockInventory = () => ({
  success: true,
  data: [
    { id: 'i1', name: 'Clinic Plus 5ml', sku: 'CP-001', category: 'Shampoo', stock: 4500 },
    { id: 'i2', name: 'Lux Rose 100g', sku: 'LX-402', category: 'Soap', stock: 1200 },
    { id: 'i3', name: 'Pepsodent 150g', sku: 'PP-109', category: 'Oral Care', stock: 850 }
  ]
});

