import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/cors';

const EDGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api-proxy`;
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

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

async function seedModules() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

    const res = await fetch(`${EDGE_BASE}/api/v1/clients`, {
      headers: {
        'Authorization': auth,
        'apikey': ANON_KEY,
        'X-Org-Id': orgId,
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

    await seedModules();

    const res = await fetch(`${EDGE_BASE}/api/v1/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'apikey': ANON_KEY,
        'X-Org-Id': orgId,
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
