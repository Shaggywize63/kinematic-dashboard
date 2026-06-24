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
    { id: 'sos1', created_at: new Date(Date.now() - 25*60000).toISOString(), status: 'active', remarks: 'Bike accident near Indiranagar signal. Minor injuries.', users: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001', mobile: '+91 98000 11111' }, latitude: 12.9784, longitude: 77.6408 },
    { id: 'sos2', created_at: new Date(Date.now() - 3*3600000).toISOString(), status: 'acknowledged', remarks: 'Feeling unwell, request medical assistance.', users: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002', mobile: '+91 98000 22222' }, latitude: 19.1364, longitude: 72.8296, acknowledged_at: new Date(Date.now() - 2.5*3600000).toISOString(), acknowledged_by: { name: 'Manish Kumar' } },
    { id: 'sos3', created_at: new Date(Date.now() - 6*3600000).toISOString(), status: 'active', remarks: 'Suspicious activity outside outlet, requesting backup.', users: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003', mobile: '+91 98000 33333' }, latitude: 28.6315, longitude: 77.2167 },
    { id: 'sos4', created_at: new Date(Date.now() - 1*86400000).toISOString(), status: 'resolved', remarks: 'Medical emergency - chest pain.', users: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004', mobile: '+91 98000 44444' }, latitude: 13.0827, longitude: 80.2707, resolution: 'Ambulance dispatched, admitted Apollo Greams Rd. Stable.', resolved_at: new Date(Date.now() - 22*3600000).toISOString(), resolved_by: { name: 'Manish Kumar' } },
    { id: 'sos5', created_at: new Date(Date.now() - 2*86400000).toISOString(), status: 'resolved', remarks: 'Vehicle breakdown on highway, stranded.', users: { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005', mobile: '+91 98000 55555' }, latitude: 17.4474, longitude: 78.3814, resolution: 'Roadside assistance arranged via Bajaj Allianz. Replacement vehicle by EOD.', resolved_at: new Date(Date.now() - 1.8*86400000).toISOString(), resolved_by: { name: 'Vikas Bansal' } },
    { id: 'sos6', created_at: new Date(Date.now() - 4*86400000).toISOString(), status: 'resolved', remarks: 'Customer altercation at outlet, requesting supervisor presence.', users: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001', mobile: '+91 98000 11111' }, latitude: 12.9352, longitude: 77.6245, resolution: 'Supervisor reached in 8 mins. Issue de-escalated.', resolved_at: new Date(Date.now() - 3.9*86400000).toISOString(), resolved_by: { name: 'Manish Kumar' } },
    { id: 'sos7', created_at: new Date(Date.now() - 7*86400000).toISOString(), status: 'resolved', remarks: 'Heat exhaustion during beat - need help.', users: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002', mobile: '+91 98000 22222' }, latitude: 19.0596, longitude: 72.8400, resolution: 'Rest break and ORS given. FE resumed beat after 1hr.', resolved_at: new Date(Date.now() - 6.9*86400000).toISOString(), resolved_by: { name: 'Anita Desai' } },
    { id: 'sos8', created_at: new Date(Date.now() - 10*86400000).toISOString(), status: 'resolved', remarks: 'Lost phone with company data - please block.', users: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003', mobile: '+91 98000 33333' }, latitude: 28.6334, longitude: 77.2200, resolution: 'IT remote-wiped device, new SIM issued, FIR filed.', resolved_at: new Date(Date.now() - 9.7*86400000).toISOString(), resolved_by: { name: 'IT Helpdesk' } },
    { id: 'sos9', created_at: new Date(Date.now() - 14*86400000).toISOString(), status: 'resolved', remarks: 'Family emergency, need to leave route immediately.', users: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004', mobile: '+91 98000 44444' }, latitude: 13.0827, longitude: 80.2707, resolution: 'Approved leave, beat re-assigned to Amit Singh.', resolved_at: new Date(Date.now() - 13.9*86400000).toISOString(), resolved_by: { name: 'Vikas Bansal' } }
  ]
});

export const mockGrievances = () => ({
  success: true,
  data: [
    { id: 'g1', reference_no: 'GRV-112', category: 'Harassment', status: 'pending', description: 'Rude behaviour by store manager during compliance audit at Reliance Fresh Koramangala.', against_role: 'store_manager', incident_date: new Date(Date.now() - 1*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 6*3600000).toISOString(), admin_remarks: null, users: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'g2', reference_no: 'GRV-111', category: 'Payment', status: 'under_review', description: 'Travel allowance for April not credited despite approval. Receipts attached.', against_role: 'finance', incident_date: new Date(Date.now() - 5*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 2*86400000).toISOString(), admin_remarks: 'Finance team checking with payroll vendor - ETA 48 hours.', users: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'g3', reference_no: 'GRV-110', category: 'Workload', status: 'under_review', description: 'Daily beat targets revised twice this month without consultation.', against_role: 'supervisor', incident_date: new Date(Date.now() - 7*86400000).toISOString().slice(0,10), is_anonymous: true, created_at: new Date(Date.now() - 3*86400000).toISOString(), admin_remarks: 'HR reviewing beat plan with zonal head.', users: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } },
    { id: 'g4', reference_no: 'GRV-109', category: 'Equipment', status: 'resolved', description: 'Company phone screen cracked, repair request pending for 2 weeks.', against_role: 'admin', incident_date: new Date(Date.now() - 18*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 14*86400000).toISOString(), admin_remarks: 'Replacement phone issued via IT Helpdesk on 10th. Ticket closed.', users: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004' } },
    { id: 'g5', reference_no: 'GRV-108', category: 'Payment', status: 'resolved', description: 'Travel allowance not credited for March cycle.', against_role: 'finance', incident_date: new Date(Date.now() - 35*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 28*86400000).toISOString(), admin_remarks: 'Credited in April cycle along with March arrears. Confirmed by FE.', users: { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005' } },
    { id: 'g6', reference_no: 'GRV-107', category: 'Harassment', status: 'dismissed', description: 'Anonymous complaint about supervisor language.', against_role: 'supervisor', incident_date: new Date(Date.now() - 45*86400000).toISOString().slice(0,10), is_anonymous: true, created_at: new Date(Date.now() - 38*86400000).toISOString(), admin_remarks: 'Investigation completed. Insufficient evidence, complaint dismissed.', users: undefined },
    { id: 'g7', reference_no: 'GRV-106', category: 'Workload', status: 'resolved', description: 'Beat plan including >20 outlets/day - physically not feasible.', against_role: 'supervisor', incident_date: new Date(Date.now() - 50*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 42*86400000).toISOString(), admin_remarks: 'Beat re-balanced to max 14 outlets/day. FE acknowledged.', users: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'g8', reference_no: 'GRV-105', category: 'Other', status: 'resolved', description: 'Need additional training on new CRM module - feeling lost.', against_role: 'hr', incident_date: new Date(Date.now() - 60*86400000).toISOString().slice(0,10), is_anonymous: false, created_at: new Date(Date.now() - 55*86400000).toISOString(), admin_remarks: '2-hr refresher session conducted; learning material shared. Feedback positive.', users: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } }
  ]
});

export const mockBroadcast = () => ({
  success: true,
  data: [
    { id: 'b1', question: 'Are you using the new inventory tracking system?', options: [{label:'Yes', value:'yes'}, {label:'No', value:'no'}], target_roles: ['executive'], status: 'active', created_at: new Date().toISOString(), response_count: 12, tally: [{label:'Yes', count:10, index:0}, {label:'No', count:2, index:1}], target_zone_ids: [], target_cities: [] }
  ]
});

export const mockCities = () => ({
  success: true,
  // Broader demo city set so the cascading state→city pickers, the
  // user-assignment multiselect, and the new global CityScopePicker
  // all have realistic options to render. Matches the cities the
  // demo team is assigned to in mockUsers.
  data: [
    { id: 'demo-city-bangalore', name: 'Bangalore', state: 'Karnataka',      country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-mumbai',    name: 'Mumbai',    state: 'Maharashtra',    country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-delhi',     name: 'Delhi',     state: 'Delhi',          country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-gurugram',  name: 'Gurugram',  state: 'Haryana',        country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-noida',     name: 'Noida',     state: 'Uttar Pradesh',  country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-hyderabad', name: 'Hyderabad', state: 'Telangana',      country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-pune',      name: 'Pune',      state: 'Maharashtra',    country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-chennai',   name: 'Chennai',   state: 'Tamil Nadu',     country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-kolkata',   name: 'Kolkata',   state: 'West Bengal',    country: 'India', is_active: true, client_id: null },
    { id: 'demo-city-ahmedabad', name: 'Ahmedabad', state: 'Gujarat',        country: 'India', is_active: true, client_id: null }
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
    { id: 'i1',  name: 'Clinic Plus 5ml Sachet',      sku_code: 'CP-001', category: 'Shampoo',    brand: 'HUL',       is_active: true, unit: 'pcs',    price: 1.50,   mrp: 2.00,   stock: 18450, reorder_level: 5000, hsn_code: '3305', created_at: new Date(Date.now() - 90*86400000).toISOString() },
    { id: 'i2',  name: 'Lux Rose 100g Bar',           sku_code: 'LX-402', category: 'Soap',       brand: 'HUL',       is_active: true, unit: 'pcs',    price: 35.00,  mrp: 42.00,  stock: 3680,  reorder_level: 1200, hsn_code: '3401', created_at: new Date(Date.now() - 120*86400000).toISOString() },
    { id: 'i3',  name: 'Surf Excel 1kg Powder',       sku_code: 'SE-101', category: 'Detergent',  brand: 'HUL',       is_active: true, unit: 'pack',   price: 195.00, mrp: 225.00, stock: 1820,  reorder_level: 400,  hsn_code: '3402', created_at: new Date(Date.now() - 60*86400000).toISOString() },
    { id: 'i4',  name: 'Tata Salt 1kg',               sku_code: 'TS-200', category: 'Staples',    brand: 'Tata',      is_active: true, unit: 'pack',   price: 27.50,  mrp: 32.00,  stock: 12400, reorder_level: 3000, hsn_code: '2501', created_at: new Date(Date.now() - 75*86400000).toISOString() },
    { id: 'i5',  name: 'Maggi Masala 70g (12pk)',     sku_code: 'MG-070', category: 'Noodles',    brand: 'Nestle',    is_active: true, unit: 'carton', price: 168.00, mrp: 180.00, stock: 940,   reorder_level: 250,  hsn_code: '1902', created_at: new Date(Date.now() - 45*86400000).toISOString() },
    { id: 'i6',  name: 'Dabur Honey 250g',            sku_code: 'DB-H25', category: 'Wellness',   brand: 'Dabur',     is_active: true, unit: 'pcs',    price: 165.00, mrp: 195.00, stock: 720,   reorder_level: 200,  hsn_code: '0409', created_at: new Date(Date.now() - 100*86400000).toISOString() },
    { id: 'i7',  name: 'Parle-G 75g Biscuit',         sku_code: 'PG-075', category: 'Biscuits',   brand: 'Parle',     is_active: true, unit: 'pcs',    price: 10.00,  mrp: 12.00,  stock: 28400, reorder_level: 8000, hsn_code: '1905', created_at: new Date(Date.now() - 30*86400000).toISOString() },
    { id: 'i8',  name: 'Britannia Marie Gold 250g',   sku_code: 'BM-250', category: 'Biscuits',   brand: 'Britannia', is_active: true, unit: 'pcs',    price: 38.00,  mrp: 45.00,  stock: 4250,  reorder_level: 1000, hsn_code: '1905', created_at: new Date(Date.now() - 22*86400000).toISOString() },
    { id: 'i9',  name: 'Amul Butter 100g',            sku_code: 'AB-100', category: 'Dairy',      brand: 'Amul',      is_active: true, unit: 'pcs',    price: 56.00,  mrp: 62.00,  stock: 980,   reorder_level: 350,  hsn_code: '0405', created_at: new Date(Date.now() - 18*86400000).toISOString() },
    { id: 'i10', name: 'Bru Instant Coffee 50g',      sku_code: 'BC-050', category: 'Beverages',  brand: 'HUL',       is_active: true, unit: 'pcs',    price: 175.00, mrp: 200.00, stock: 612,   reorder_level: 180,  hsn_code: '2101', created_at: new Date(Date.now() - 12*86400000).toISOString() },
    { id: 'i11', name: 'Colgate MaxFresh 150g',       sku_code: 'CG-150', category: 'Oral Care',  brand: 'Colgate',   is_active: true, unit: 'pcs',    price: 92.00,  mrp: 105.00, stock: 2380,  reorder_level: 700,  hsn_code: '3306', created_at: new Date(Date.now() - 80*86400000).toISOString() },
    { id: 'i12', name: 'Vim Bar 200g',                sku_code: 'VM-200', category: 'Dishwash',   brand: 'HUL',       is_active: true, unit: 'pcs',    price: 18.00,  mrp: 22.00,  stock: 7200,  reorder_level: 1500, hsn_code: '3402', created_at: new Date(Date.now() - 50*86400000).toISOString() },
    { id: 'i13', name: 'Aashirvaad Atta 5kg',         sku_code: 'AA-5KG', category: 'Staples',    brand: 'ITC',       is_active: true, unit: 'pack',   price: 285.00, mrp: 315.00, stock: 540,   reorder_level: 120,  hsn_code: '1101', created_at: new Date(Date.now() - 95*86400000).toISOString() },
    { id: 'i14', name: 'Bingo Mad Angles 80g',        sku_code: 'BN-080', category: 'Snacks',     brand: 'ITC',       is_active: true, unit: 'pcs',    price: 20.00,  mrp: 25.00,  stock: 6840,  reorder_level: 1800, hsn_code: '1905', created_at: new Date(Date.now() - 28*86400000).toISOString() },
    { id: 'i15', name: 'Saffola Active Oil 1L',       sku_code: 'SF-1LT', category: 'Edible Oil', brand: 'Marico',    is_active: true, unit: 'pcs',    price: 175.00, mrp: 195.00, stock: 410,   reorder_level: 150,  hsn_code: '1507', created_at: new Date(Date.now() - 110*86400000).toISOString() },
    { id: 'i16', name: 'Parachute Coconut Oil 200ml', sku_code: 'PR-200', category: 'Hair Care',  brand: 'Marico',    is_active: true, unit: 'pcs',    price: 78.00,  mrp: 95.00,  stock: 1640,  reorder_level: 500,  hsn_code: '3305', created_at: new Date(Date.now() - 65*86400000).toISOString() },
    { id: 'i17', name: 'Pepsi 750ml PET',             sku_code: 'PP-750', category: 'Beverages',  brand: 'PepsiCo',   is_active: true, unit: 'pcs',    price: 40.00,  mrp: 45.00,  stock: 1980,  reorder_level: 600,  hsn_code: '2202', created_at: new Date(Date.now() - 8*86400000).toISOString() },
    { id: 'i18', name: 'Coca-Cola 750ml PET',         sku_code: 'CC-750', category: 'Beverages',  brand: 'Coca-Cola', is_active: true, unit: 'pcs',    price: 40.00,  mrp: 45.00,  stock: 1820,  reorder_level: 600,  hsn_code: '2202', created_at: new Date(Date.now() - 8*86400000).toISOString() },
    { id: 'i19', name: 'Lays Magic Masala 52g',       sku_code: 'LY-052', category: 'Snacks',     brand: 'PepsiCo',   is_active: true, unit: 'pcs',    price: 20.00,  mrp: 25.00,  stock: 5400,  reorder_level: 1500, hsn_code: '2005', created_at: new Date(Date.now() - 19*86400000).toISOString() },
    { id: 'i20', name: 'Red Label Tea 500g',          sku_code: 'RL-500', category: 'Beverages',  brand: 'HUL',       is_active: true, unit: 'pack',   price: 245.00, mrp: 275.00, stock: 820,   reorder_level: 200,  hsn_code: '0902', created_at: new Date(Date.now() - 55*86400000).toISOString() },
    { id: 'i21', name: 'Sunfeast Yippee Noodles 70g', sku_code: 'SY-070', category: 'Noodles',    brand: 'ITC',       is_active: true, unit: 'pcs',    price: 14.00,  mrp: 18.00,  stock: 3280,  reorder_level: 900,  hsn_code: '1902', created_at: new Date(Date.now() - 14*86400000).toISOString() },
    { id: 'i22', name: 'Dettol Liquid Soap 200ml',    sku_code: 'DT-200', category: 'Hygiene',    brand: 'Reckitt',   is_active: true, unit: 'pcs',    price: 110.00, mrp: 135.00, stock: 1240,  reorder_level: 380,  hsn_code: '3401', created_at: new Date(Date.now() - 38*86400000).toISOString() }
  ]
});

export const mockWarehouseSummary = () => ({
  success: true,
  data: {
    warehouses: [
      { id: 'wh1', name: 'Bhiwandi Mother Hub',  warehouse_code: 'WH-MUM-01', type: 'distribution', city: 'Mumbai',    address: 'NH-3 Bhiwandi Industrial Zone', is_active: true,  manager: { id: 'fe1', name: 'Arjun Sharma' }, stats: { inbound: 1240, outbound: 1085, total_moves: 2325 } },
      { id: 'wh2', name: 'Nelamangala South DC', warehouse_code: 'WH-BLR-02', type: 'distribution', city: 'Bengaluru', address: 'Tumkur Rd, Nelamangala',        is_active: true,  manager: { id: 'fe2', name: 'Priya Patel' },  stats: { inbound: 980,  outbound: 845,  total_moves: 1825 } },
      { id: 'wh3', name: 'Bawal North Hub',      warehouse_code: 'WH-DEL-01', type: 'distribution', city: 'Delhi',     address: 'Bawal Industrial Estate, NH-8', is_active: true,  manager: { id: 'fe3', name: 'Rahul Verma' },  stats: { inbound: 1120, outbound: 1004, total_moves: 2124 } },
      { id: 'wh4', name: 'Sriperumbudur Transit',warehouse_code: 'WH-CHN-01', type: 'transit',      city: 'Chennai',   address: 'Sriperumbudur SEZ Phase 2',     is_active: true,  manager: { id: 'fe4', name: 'Sneha Rao' },    stats: { inbound: 540,  outbound: 488,  total_moves: 1028 } },
      { id: 'wh5', name: 'Patancheru Storage',   warehouse_code: 'WH-HYD-01', type: 'storage',      city: 'Hyderabad', address: 'Patancheru Industrial Area',    is_active: true,  manager: { id: 'fe5', name: 'Amit Singh' },   stats: { inbound: 410,  outbound: 365,  total_moves: 775 } },
      { id: 'wh6', name: 'Chakan Pune DC',       warehouse_code: 'WH-PUN-01', type: 'distribution', city: 'Pune',      address: 'Chakan MIDC Phase 3',           is_active: true,  manager: { id: 'fe1', name: 'Arjun Sharma' }, stats: { inbound: 620,  outbound: 548,  total_moves: 1168 } },
      { id: 'wh7', name: 'Howrah East Transit',  warehouse_code: 'WH-KOL-01', type: 'transit',      city: 'Kolkata',   address: 'Dankuni Industrial Park',       is_active: false, manager: null,                                stats: { inbound: 0,    outbound: 0,    total_moves: 0 } }
    ],
    total_warehouses: 7, active_warehouses: 6, total_skus: 22, total_assets: 450, total_movements_30d: 11245
  }
});

export const mockMovements = () => ({
  success: true,
  data: [
    { id: 'm1',  movement_type: 'inbound',    quantity: 480,  reference_no: 'PO-9912', from_location: 'HUL Mumbai Plant',         to_location: 'Section A1 - Bhiwandi',       moved_at: new Date(Date.now() - 2*3600000).toISOString(),              sku: { id: 'i1',  sku_code: 'CP-001', name: 'Clinic Plus 5ml Sachet' }, performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm2',  movement_type: 'outbound',   quantity: 60,   reference_no: 'ORD-440', from_location: 'Section B2 - Bhiwandi',    to_location: 'Reliance Fresh Andheri',      moved_at: new Date(Date.now() - 4*3600000).toISOString(),              asset: { id: 'ast1', asset_code: 'BRD-01', name: 'Acrylic Branding Board' }, performer: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'm3',  movement_type: 'transfer',   quantity: 240,  reference_no: 'TR-102',  from_location: 'Bhiwandi MUM-01',          to_location: 'Chakan PUN-01',               moved_at: new Date(Date.now() - 8*3600000).toISOString(),              sku: { id: 'i2',  sku_code: 'LX-402', name: 'Lux Rose 100g Bar' },      performer: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } },
    { id: 'm4',  movement_type: 'inbound',    quantity: 1200, reference_no: 'PO-9920', from_location: 'ITC Foods Bengaluru',      to_location: 'Section C1 - Nelamangala',    moved_at: new Date(Date.now() - 1*86400000).toISOString(),             sku: { id: 'i13', sku_code: 'AA-5KG', name: 'Aashirvaad Atta 5kg' },    performer: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'm5',  movement_type: 'outbound',   quantity: 144,  reference_no: 'ORD-441', from_location: 'Section A3 - Bawal',       to_location: "Spencer's CP",                moved_at: new Date(Date.now() - 1*86400000 - 3*3600000).toISOString(), sku: { id: 'i5',  sku_code: 'MG-070', name: 'Maggi Masala 70g (12pk)' }, performer: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } },
    { id: 'm6',  movement_type: 'inbound',    quantity: 360,  reference_no: 'PO-9930', from_location: 'Parle Vile Parle',         to_location: 'Section D2 - Bhiwandi',       moved_at: new Date(Date.now() - 2*86400000).toISOString(),             sku: { id: 'i7',  sku_code: 'PG-075', name: 'Parle-G 75g Biscuit' },    performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm7',  movement_type: 'transfer',   quantity: 480,  reference_no: 'TR-108',  from_location: 'Bhiwandi MUM-01',          to_location: 'Sriperumbudur CHN-01',        moved_at: new Date(Date.now() - 2*86400000 - 5*3600000).toISOString(), sku: { id: 'i20', sku_code: 'RL-500', name: 'Red Label Tea 500g' },     performer: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004' } },
    { id: 'm8',  movement_type: 'damage',     quantity: 24,   reference_no: 'DMG-014', from_location: 'Section B1 - Bhiwandi',    to_location: 'Damaged Goods Bay',           moved_at: new Date(Date.now() - 3*86400000).toISOString(),             sku: { id: 'i17', sku_code: 'PP-750', name: 'Pepsi 750ml PET' },        performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' }, notes: 'PET leakage during unloading' },
    { id: 'm9',  movement_type: 'adjustment', quantity: -15,  reference_no: 'ADJ-031', from_location: 'Section E1 - Patancheru',  to_location: 'Audit Variance',              moved_at: new Date(Date.now() - 3*86400000 - 2*3600000).toISOString(), sku: { id: 'i9',  sku_code: 'AB-100', name: 'Amul Butter 100g' },       performer: { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005' }, notes: 'Stock count variance post audit' },
    { id: 'm10', movement_type: 'inbound',    quantity: 720,  reference_no: 'PO-9941', from_location: 'Britannia Bidadi',         to_location: 'Section B4 - Nelamangala',    moved_at: new Date(Date.now() - 4*86400000).toISOString(),             sku: { id: 'i8',  sku_code: 'BM-250', name: 'Britannia Marie Gold 250g' }, performer: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'm11', movement_type: 'outbound',   quantity: 96,   reference_no: 'ORD-462', from_location: 'Section C3 - Chakan',      to_location: 'D-Mart Pune Wakad',           moved_at: new Date(Date.now() - 4*86400000 - 4*3600000).toISOString(), sku: { id: 'i3',  sku_code: 'SE-101', name: 'Surf Excel 1kg Powder' },  performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm12', movement_type: 'outbound',   quantity: 36,   reference_no: 'ORD-470', from_location: 'Section A1 - Bawal',       to_location: 'Modern Bazaar CP',            moved_at: new Date(Date.now() - 5*86400000).toISOString(),             sku: { id: 'i6',  sku_code: 'DB-H25', name: 'Dabur Honey 250g' },       performer: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } },
    { id: 'm13', movement_type: 'transfer',   quantity: 200,  reference_no: 'TR-115',  from_location: 'Bawal DEL-01',             to_location: 'Patancheru HYD-01',           moved_at: new Date(Date.now() - 6*86400000).toISOString(),             sku: { id: 'i14', sku_code: 'BN-080', name: 'Bingo Mad Angles 80g' },   performer: { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005' } },
    { id: 'm14', movement_type: 'inbound',    quantity: 540,  reference_no: 'PO-9955', from_location: 'Marico Perundurai',        to_location: 'Section F2 - Sriperumbudur',  moved_at: new Date(Date.now() - 7*86400000).toISOString(),             sku: { id: 'i16', sku_code: 'PR-200', name: 'Parachute Coconut Oil 200ml' }, performer: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004' } },
    { id: 'm15', movement_type: 'outbound',   quantity: 84,   reference_no: 'ORD-487', from_location: 'Section A2 - Bhiwandi',    to_location: 'Big Bazaar Phoenix',          moved_at: new Date(Date.now() - 8*86400000).toISOString(),             sku: { id: 'i12', sku_code: 'VM-200', name: 'Vim Bar 200g' },           performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm16', movement_type: 'inbound',    quantity: 320,  reference_no: 'PO-9962', from_location: 'Colgate Sanand',           to_location: 'Section G1 - Chakan',         moved_at: new Date(Date.now() - 9*86400000).toISOString(),             sku: { id: 'i11', sku_code: 'CG-150', name: 'Colgate MaxFresh 150g' },  performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm17', movement_type: 'outbound',   quantity: 120,  reference_no: 'ORD-499', from_location: 'Section B3 - Nelamangala', to_location: 'Metro C&C Whitefield',        moved_at: new Date(Date.now() - 10*86400000).toISOString(),            sku: { id: 'i21', sku_code: 'SY-070', name: 'Sunfeast Yippee Noodles 70g' }, performer: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'm18', movement_type: 'inbound',    quantity: 420,  reference_no: 'PO-9971', from_location: 'Reckitt Mysuru',           to_location: 'Section H1 - Nelamangala',    moved_at: new Date(Date.now() - 11*86400000).toISOString(),            sku: { id: 'i22', sku_code: 'DT-200', name: 'Dettol Liquid Soap 200ml' }, performer: { id: 'fe2', name: 'Priya Patel', employee_id: 'KIN-002' } },
    { id: 'm19', movement_type: 'transfer',   quantity: 180,  reference_no: 'TR-122',  from_location: 'Sriperumbudur CHN-01',     to_location: 'Patancheru HYD-01',           moved_at: new Date(Date.now() - 12*86400000).toISOString(),            sku: { id: 'i15', sku_code: 'SF-1LT', name: 'Saffola Active Oil 1L' },  performer: { id: 'fe4', name: 'Sneha Rao', employee_id: 'KIN-004' } },
    { id: 'm20', movement_type: 'outbound',   quantity: 72,   reference_no: 'ORD-512', from_location: 'Section C2 - Bhiwandi',    to_location: 'Reliance SMART Bandra',       moved_at: new Date(Date.now() - 13*86400000).toISOString(),            sku: { id: 'i19', sku_code: 'LY-052', name: 'Lays Magic Masala 52g' },  performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm21', movement_type: 'inbound',    quantity: 600,  reference_no: 'PO-9988', from_location: 'PepsiCo Channo',           to_location: 'Section D1 - Bawal',          moved_at: new Date(Date.now() - 14*86400000).toISOString(),            sku: { id: 'i17', sku_code: 'PP-750', name: 'Pepsi 750ml PET' },        performer: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } },
    { id: 'm22', movement_type: 'damage',     quantity: 12,   reference_no: 'DMG-019', from_location: 'Section A1 - Chakan',      to_location: 'Damaged Goods Bay',           moved_at: new Date(Date.now() - 15*86400000).toISOString(),            sku: { id: 'i4',  sku_code: 'TS-200', name: 'Tata Salt 1kg' },          performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' }, notes: 'Pack tear during racking' },
    { id: 'm23', movement_type: 'outbound',   quantity: 48,   reference_no: 'ORD-528', from_location: 'Section E1 - Patancheru',  to_location: 'Star Market HSR',             moved_at: new Date(Date.now() - 16*86400000).toISOString(),            sku: { id: 'i10', sku_code: 'BC-050', name: 'Bru Instant Coffee 50g' }, performer: { id: 'fe5', name: 'Amit Singh', employee_id: 'KIN-005' } },
    { id: 'm24', movement_type: 'inbound',    quantity: 800,  reference_no: 'PO-9991', from_location: 'Coca-Cola Pirangut',       to_location: 'Section B5 - Chakan',         moved_at: new Date(Date.now() - 18*86400000).toISOString(),            sku: { id: 'i18', sku_code: 'CC-750', name: 'Coca-Cola 750ml PET' },    performer: { id: 'fe1', name: 'Arjun Sharma', employee_id: 'KIN-001' } },
    { id: 'm25', movement_type: 'transfer',   quantity: 144,  reference_no: 'TR-129',  from_location: 'Bawal DEL-01',             to_location: 'Bhiwandi MUM-01',             moved_at: new Date(Date.now() - 20*86400000).toISOString(),            sku: { id: 'i20', sku_code: 'RL-500', name: 'Red Label Tea 500g' },     performer: { id: 'fe3', name: 'Rahul Verma', employee_id: 'KIN-003' } }
  ]
});

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
    total_tff: 1248, total_cc: 1560,
  }
});

export const mockCityPerformance = () => ({
  success: true,
  data: {
    cities: [
      { city: 'Bangalore', zones: 6, active_fes: 38, checkins: 132, tff: 450, unique_outlets: 280 },
      { city: 'Mumbai',    zones: 5, active_fes: 32, checkins: 118, tff: 380, unique_outlets: 240 },
      { city: 'Delhi',     zones: 4, active_fes: 28, checkins: 102, tff: 320, unique_outlets: 195 },
      { city: 'Chennai',   zones: 3, active_fes: 22, checkins:  84, tff: 280, unique_outlets: 168 },
      { city: 'Pune',      zones: 3, active_fes: 18, checkins:  68, tff: 215, unique_outlets: 130 },
      { city: 'Hyderabad', zones: 2, active_fes: 14, checkins:  52, tff: 168, unique_outlets: 102 }
    ]
  }
});

export const mockOutletCoverage = () => ({
  success: true,
  data: {
    universe: 1350, covered: 892, coverage_pct: 66,
    by_city: [
      { city: 'Bangalore', universe: 320, covered: 240 },
      { city: 'Mumbai',    universe: 280, covered: 198 },
      { city: 'Delhi',     universe: 240, covered: 158 },
      { city: 'Chennai',   universe: 200, covered: 132 },
      { city: 'Pune',      universe: 170, covered: 105 },
      { city: 'Hyderabad', universe: 140, covered:  59 }
    ]
  }
});

export const mockBroadcasts = () => ({
  success: true,
  data: [
    { id: 'b1', title: 'Q2 Sales Kickoff',                 body: 'New incentive structure live. Slabs revised for FMCG vertical - see attached deck.',     sent_at: new Date(Date.now() - 1*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 132 },
    { id: 'b2', title: 'Monsoon Travel Advisory',          body: 'Carry rain gear. Route 7 closed near Bhiwandi until further notice.',                    sent_at: new Date(Date.now() - 3*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 140 },
    { id: 'b3', title: 'New SKU - Sunfeast Yippee 70g',    body: 'Inventory available from tomorrow at all DCs. Push at modern trade outlets.',            sent_at: new Date(Date.now() - 5*86400000).toISOString(),  sent_by: 'Demo Admin', recipients: 145, read: 121 },
    { id: 'b4', title: 'Diwali Greetings',                 body: 'Wishing all FEs and their families a safe and prosperous Diwali. 2-day bonus credited.', sent_at: new Date(Date.now() - 10*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 144 },
    { id: 'b5', title: 'Price Update - Tata Salt 1kg',     body: 'MRP revised to Rs 32 effective Monday. Update store POSM.',                              sent_at: new Date(Date.now() - 14*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 138 },
    { id: 'b6', title: 'Attendance App Update',            body: 'Kinematic app v4.2 released - please update from Play Store before next beat.',         sent_at: new Date(Date.now() - 18*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 145 },
    { id: 'b7', title: 'Festival Scheme - Aashirvaad Atta',body: 'Buy 2 get Rs 30 off scheme live Oct 20 - Nov 5. Modern trade priority.',                 sent_at: new Date(Date.now() - 22*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 128 },
    { id: 'b8', title: 'Safety Bulletin',                  body: 'Always file SOS via app for any roadside incident. Two-wheeler insurance verified.',     sent_at: new Date(Date.now() - 28*86400000).toISOString(), sent_by: 'Demo Admin', recipients: 145, read: 141 }
  ]
});

export const mockBroadcastAdmin = () => {
  const _at = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  return {
    success: true,
    data: [
      { id: 'bq1', question: "Did you complete today's beat as per route plan?", options: [{ label: 'Yes, fully', value: 'yes' }, { label: 'Partially', value: 'partial' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-1), status: 'active',  target_roles: ['executive'],               target_zone_ids: [], target_cities: ['Bengaluru', 'Mumbai'], created_at: _at(0.2), response_count: 78,  tally: [{ label: 'Yes, fully', index: 0, count: 58 }, { label: 'Partially', index: 1, count: 16 }, { label: 'No', index: 2, count: 4 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'KIN-001', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.1) }, { user_name: 'Priya Patel', employee_id: 'KIN-002', selected_label: 'Partially', selected_index: 1, is_correct: null, answered_at: _at(0.15) }, { user_name: 'Rahul Verma', employee_id: 'KIN-003', selected_label: 'Yes, fully', selected_index: 0, is_correct: null, answered_at: _at(0.18) }] },
      { id: 'bq2', question: 'Quiz: New MRP of Tata Salt 1kg?', options: [{ label: 'Rs 27', value: '27' }, { label: 'Rs 30', value: '30' }, { label: 'Rs 32', value: '32' }, { label: 'Rs 35', value: '35' }], correct_option: 2, is_urgent: false, deadline_at: _at(-3), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(2), response_count: 132, tally: [{ label: 'Rs 27', index: 0, count: 8 }, { label: 'Rs 30', index: 1, count: 22 }, { label: 'Rs 32', index: 2, count: 96 }, { label: 'Rs 35', index: 3, count: 6 }], responses: [{ user_name: 'Arjun Sharma', employee_id: 'KIN-001', selected_label: 'Rs 32', selected_index: 2, is_correct: true, answered_at: _at(1.9) }, { user_name: 'Sneha Rao', employee_id: 'KIN-004', selected_label: 'Rs 30', selected_index: 1, is_correct: false, answered_at: _at(1.7) }] },
      { id: 'bq3', question: "URGENT: Are you safe given today's Mumbai rains?", options: [{ label: 'I am safe', value: 'safe' }, { label: 'Need help', value: 'help' }], correct_option: null, is_urgent: true, deadline_at: _at(-5), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: ['Mumbai'], created_at: _at(5), response_count: 42, tally: [{ label: 'I am safe', index: 0, count: 40 }, { label: 'Need help', index: 1, count: 2 }], responses: [{ user_name: 'Priya Patel', employee_id: 'KIN-002', selected_label: 'I am safe', selected_index: 0, is_correct: null, answered_at: _at(4.9) }, { user_name: 'Manish Kumar', employee_id: 'SUP-001', selected_label: 'Need help', selected_index: 1, is_correct: null, answered_at: _at(4.8) }] },
      { id: 'bq4', question: 'Which SKU saw stock-out this week at your beat?', options: [{ label: 'Parle-G 75g', value: 'pg' }, { label: 'Maggi 70g', value: 'mg' }, { label: 'Tata Salt 1kg', value: 'ts' }, { label: 'None', value: 'none' }], correct_option: null, is_urgent: false, deadline_at: _at(-7), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(7), response_count: 124, tally: [{ label: 'Parle-G 75g', index: 0, count: 38 }, { label: 'Maggi 70g', index: 1, count: 22 }, { label: 'Tata Salt 1kg', index: 2, count: 12 }, { label: 'None', index: 3, count: 52 }], responses: [] },
      { id: 'bq5', question: 'Diwali festival hamper preference for FE incentive?', options: [{ label: 'Sweets pack', value: 'sweets' }, { label: 'Dry fruits', value: 'dry' }, { label: 'Voucher', value: 'voucher' }], correct_option: null, is_urgent: false, deadline_at: _at(-12), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(12), response_count: 143, tally: [{ label: 'Sweets pack', index: 0, count: 28 }, { label: 'Dry fruits', index: 1, count: 36 }, { label: 'Voucher', index: 2, count: 79 }], responses: [] },
      { id: 'bq6', question: 'Are you using the new Visit-Log v2 form?', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], correct_option: null, is_urgent: false, deadline_at: _at(-18), status: 'closed', target_roles: ['executive'], target_zone_ids: [], target_cities: [], created_at: _at(18), response_count: 138, tally: [{ label: 'Yes', index: 0, count: 119 }, { label: 'No', index: 1, count: 19 }], responses: [] },
      { id: 'bq7', question: 'Did your phone receive the Kinematic app v4.2 update?', options: [{ label: 'Updated', value: 'updated' }, { label: 'Pending', value: 'pending' }, { label: 'Issue', value: 'issue' }], correct_option: null, is_urgent: false, deadline_at: _at(-22), status: 'closed', target_roles: ['executive', 'supervisor'], target_zone_ids: [], target_cities: [], created_at: _at(22), response_count: 145, tally: [{ label: 'Updated', index: 0, count: 132 }, { label: 'Pending', index: 1, count: 9 }, { label: 'Issue', index: 2, count: 4 }], responses: [] }
    ]
  };
};

export const mockLearningMaterials = () => ({
  success: true,
  data: [
    { id: 'l1', title: 'Outlet Visit SOP',  category: 'Process', updated_at: new Date(Date.now() - 30*86400000).toISOString(), kind: 'pdf' },
    { id: 'l2', title: 'Pitching TMT Bars', category: 'Sales',   updated_at: new Date(Date.now() - 14*86400000).toISOString(), kind: 'video' },
    { id: 'l3', title: 'Cement Specs 101',  category: 'Product', updated_at: new Date(Date.now() - 60*86400000).toISOString(), kind: 'pdf' }
  ]
});

export const mockMobileHome = () => ({
  success: true,
  data: { tff_today: 14, attendance_status: 'checked_in', kpis: { tff: 14, hours: 6.5 } }
});
