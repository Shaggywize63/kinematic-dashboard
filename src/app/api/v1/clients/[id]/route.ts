import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/cors';
import { projectFromHeaders, serverSupabaseConfig } from '@/lib/serverProjects';

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

async function seedModules(projectKey: string) {
  const { url: supabaseUrl, serviceKey } = serverSupabaseConfig(projectKey);
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

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('Origin'), 'PATCH, OPTIONS') });
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
    const project = projectFromHeaders(req.headers);
    const { url, anonKey } = serverSupabaseConfig(project);

    await seedModules(project);

    const res = await fetch(`${url}/functions/v1/api-proxy/api/v1/clients/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'apikey': anonKey,
        'X-Org-Id': orgId,
      },
      body,
    });

    const data = await res.json();
    const cors = corsHeaders(req.headers.get('Origin'), 'PATCH, OPTIONS');
    return NextResponse.json(data, { status: res.status, headers: cors });
  } catch (e) {
    const cors = corsHeaders(req.headers.get('Origin'), 'PATCH, OPTIONS');
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: cors });
  }
}
