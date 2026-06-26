import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/cors';
import { projectFromHeaders, serverSupabaseConfig, DEFAULT_PROJECT } from '@/lib/serverProjects';

// Modules table is now seeded + maintained by SQL migrations
// (see migration_module_packaging_and_client_entitlements.sql in the backend
// repo). Client entitlements live in the `client_modules` table and are
// resolved by the Express backend at /auth/login + /auth/me.
//
// We no longer mirror the module catalog here; importing
// ALL_MODULES from lib/modules.ts and best-effort upserting it on POST keeps
// the dev experience smooth when a new module is added without redeploying
// the backend, but the SQL migration is the source of truth.
import { ALL_MODULES as DASHBOARD_MODULES } from '@/lib/modules';

async function seedModules(projectKey: string) {
  const { url: supabaseUrl, serviceKey } = serverSupabaseConfig(projectKey);
  if (!supabaseUrl || !serviceKey) return;
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const payload = DASHBOARD_MODULES.map(m => ({
      id: m.id,
      name: m.l,
      package: m.package,
      is_universal: !!m.universal,
    }));
    await supabase
      .from('modules')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  } catch {
    // best-effort — do not block the request
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS') });
}

export async function GET(req: NextRequest) {
  try {
    const auth  = req.headers.get('Authorization') ?? '';
    const orgId = req.headers.get('X-Org-Id') ?? '';
    const project = projectFromHeaders(req.headers);
    const { url, anonKey } = serverSupabaseConfig(project);

    const res = await fetch(`${url}/functions/v1/api-proxy/api/v1/clients`, {
      headers: {
        'Authorization': auth,
        'apikey': anonKey,
        'X-Org-Id': orgId,
        // Forward the project so the edge function can tell Railway which
        // Supabase project to validate the JWT against (else it defaults to
        // Tata and rejects a Kinematic token with 401).
        ...(project !== DEFAULT_PROJECT ? { 'X-Kinematic-Project': project } : {}),
      },
    });

    const data = await res.json();
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json(data, { status: res.status, headers: cors });
  } catch (e) {
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: cors });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth    = req.headers.get('Authorization') ?? '';
    const orgId   = req.headers.get('X-Org-Id') ?? '';
    const body    = await req.text();
    const project = projectFromHeaders(req.headers);
    const { url, anonKey } = serverSupabaseConfig(project);

    await seedModules(project);

    const res = await fetch(`${url}/functions/v1/api-proxy/api/v1/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'apikey': anonKey,
        'X-Org-Id': orgId,
        ...(project !== DEFAULT_PROJECT ? { 'X-Kinematic-Project': project } : {}),
      },
      body,
    });

    const data = await res.json();
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json(data, { status: res.status, headers: cors });
  } catch (e) {
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: cors });
  }
}
