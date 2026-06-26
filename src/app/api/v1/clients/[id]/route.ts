import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/cors';
import { projectFromHeaders, serverSupabaseConfig, DEFAULT_PROJECT } from '@/lib/serverProjects';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
