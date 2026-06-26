import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/cors';
import { projectFromHeaders, serverSupabaseConfig, DEFAULT_PROJECT } from '@/lib/serverProjects';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

    await seedModules(project);

    // Non-default projects bypass the api-proxy edge function (which drops
    // X-Kinematic-Project → backend defaults to Tata → 401); call the backend
    // directly with the project header. Default (Tata) keeps the edge-fn path.
    const useDirect = project !== DEFAULT_PROJECT && BACKEND_URL;
    const target = useDirect
      ? `${BACKEND_URL}/api/v1/clients/${id}`
      : `${serverSupabaseConfig(project).url}/functions/v1/api-proxy/api/v1/clients/${id}`;
    const res = await fetch(target, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'X-Org-Id': orgId,
        ...(useDirect
          ? { 'X-Kinematic-Project': project }
          : { 'apikey': serverSupabaseConfig(project).anonKey }),
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
