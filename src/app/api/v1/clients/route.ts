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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Route a /clients request to the backend.
//
// Non-default projects (e.g. Kinematic) bypass the per-project `api-proxy`
// Supabase edge function: that function drops the X-Kinematic-Project header
// when it forwards to Railway, so the backend validates the JWT against the
// default (Tata) project and rejects a Kinematic token with 401. We instead
// hit the backend directly with the project header — the exact path the rest
// of the dashboard already uses. The default (Tata) project keeps the original
// edge-function path byte-for-byte unchanged.
function clientsUpstream(
  project: string,
  opts: { method: string; auth: string; orgId: string; body?: string; sub?: string },
): Promise<Response> {
  const sub = opts.sub ?? '';
  const hasBody = opts.body !== undefined;
  if (project !== DEFAULT_PROJECT && BACKEND_URL) {
    return fetch(`${BACKEND_URL}/api/v1/clients${sub}`, {
      method: opts.method,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        'Authorization': opts.auth,
        'X-Org-Id': opts.orgId,
        'X-Kinematic-Project': project,
      },
      ...(hasBody ? { body: opts.body } : {}),
    });
  }
  const { url, anonKey } = serverSupabaseConfig(project);
  return fetch(`${url}/functions/v1/api-proxy/api/v1/clients${sub}`, {
    method: opts.method,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': opts.auth,
      'apikey': anonKey,
      'X-Org-Id': opts.orgId,
    },
    ...(hasBody ? { body: opts.body } : {}),
  });
}

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

    const res = await clientsUpstream(project, { method: 'GET', auth, orgId });

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

    await seedModules(project);

    const res = await clientsUpstream(project, { method: 'POST', auth, orgId, body });

    const data = await res.json();
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json(data, { status: res.status, headers: cors });
  } catch (e) {
    const cors = corsHeaders(req.headers.get('Origin'), 'GET, POST, OPTIONS');
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: cors });
  }
}
