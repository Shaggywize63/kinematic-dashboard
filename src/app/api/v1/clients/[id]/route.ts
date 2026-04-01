import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const EDGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api-proxy`;
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-Id',
};

const ALL_MODULES = [
  { id: 'analytics',       name: 'Analytics & Tracking' },
  { id: 'live_tracking',   name: 'Live Tracking' },
  { id: 'broadcast',       name: 'Broadcasts' },
  { id: 'attendance',      name: 'Attendance' },
  { id: 'orders',          name: 'Route Planning (Orders)' },
  { id: 'work_activities', name: 'Work Activities' },
  { id: 'users',           name: 'Manpower Management' },
  { id: 'hr',              name: 'HR & Payroll' },
  { id: 'visit_logs',      name: 'Visit Logs' },
  { id: 'inventory',       name: 'Warehouse & Inventory' },
  { id: 'skus',            name: "SKU's Management" },
  { id: 'assets',          name: 'Asset Management' },
  { id: 'grievances',      name: 'Grievance Management' },
  { id: 'form_builder',    name: 'Form Builder' },
  { id: 'cities',          name: 'City Management' },
  { id: 'zones',           name: 'Zone Management' },
  { id: 'stores',          name: 'Outlet Management' },
  { id: 'activities',      name: 'Activity Management' },
  { id: 'clients',         name: 'Client Management' },
  { id: 'settings',        name: 'System Settings' },
];

async function seedModules() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    await supabase
      .from('modules')
      .upsert(ALL_MODULES, { onConflict: 'id', ignoreDuplicates: true });
  } catch {
    // best-effort — do not block the request
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }  = await params;
    const auth    = req.headers.get('Authorization') ?? '';
    const orgId   = req.headers.get('X-Org-Id') ?? '';
    const body    = await req.text();

    await seedModules();

    const res = await fetch(`${EDGE_BASE}/api/v1/clients/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'apikey': ANON_KEY,
        'X-Org-Id': orgId,
      },
      body,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status, headers: CORS });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: CORS });
  }
}
