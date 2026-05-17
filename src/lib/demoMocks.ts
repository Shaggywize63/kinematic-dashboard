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

export const mockRoutePlans = () => {
  const today = new Date().toISOString().split('T')[0];
  const tISO = (h: number, m = 0) => `${today}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`;
  return {
    success: true,
    data: [
      {
        id: 'rp1', user_id: 'fe1', plan_date: today,
        fe_name: 'Arjun Sharma', fe_employee_id: 'KIN-001', fe_mobile: '+91 98000 11111',
        zone_name: 'Bangalore North', city_name: 'Bangalore',
        status: 'in_progress' as const,
        total_outlets: 5, visited_outlets: 2, missed_outlets: 0, completion_pct: 40,
        frequency: 'daily', territory_label: 'Koramangala beat',
        outlets: [
          { id: 'o1', store_id: 'st1', store_name: 'Reliance Fresh - Koramangala',  store_code: 'REL-001',  store_address: '80ft Rd, 4th Block', store_type: 'modern_trade', zone_name: 'Bangalore East', visit_order: 1, status: 'completed' as const, target_type: 'general',           target_notes: 'Greet manager, confirm Q3 SKUs', checkin_at: tISO(10, 5),  checkout_at: tISO(10, 35), planned_duration_min: 30, actual_duration_min: 30, order_amount: 18500, store_lat: 12.9352, store_lng: 77.6245 },
          { id: 'o2', store_id: 'st2', store_name: 'Big Bazaar - Indiranagar',      store_code: 'BB-042',   store_address: 'Phoenix Market', store_type: 'modern_trade',   zone_name: 'Bangalore East', visit_order: 2, status: 'completed' as const, target_type: 'merchandising',     target_notes: 'Refresh end-cap', checkin_at: tISO(11, 15), checkout_at: tISO(11, 50), planned_duration_min: 30, actual_duration_min: 35, store_lat: 12.9784, store_lng: 77.6408 },
          { id: 'o3', store_id: 'st3', store_name: 'Star Market - HSR',             store_code: 'SM-109',   store_address: 'HSR Sector 2', store_type: 'general_trade',     zone_name: 'Bangalore South',visit_order: 3, status: 'pending'   as const, target_type: 'stock_check',       target_notes: '',                                              planned_duration_min: 20, store_lat: 12.9116, store_lng: 77.6473 },
          { id: 'o4', store_id: 'st4', store_name: 'Metro Cash & Carry - Whitefield', store_code: 'MC-018', store_address: 'Whitefield Main', store_type: 'wholesale',     zone_name: 'Bangalore East', visit_order: 4, status: 'pending'   as const, target_type: 'order_collection',  target_notes: '',                                              planned_duration_min: 45, store_lat: 12.9698, store_lng: 77.7499 },
          { id: 'o5', store_id: 'st5', store_name: "Spencer's - MG Road",           store_code: 'SP-073',   store_address: 'MG Rd 100ft',     store_type: 'modern_trade',  zone_name: 'Bangalore Central', visit_order: 5, status: 'pending' as const, target_type: 'display_check',     target_notes: '',                                              planned_duration_min: 30, store_lat: 12.9756, store_lng: 77.6107 },
        ],
      },
    ],
  };
};