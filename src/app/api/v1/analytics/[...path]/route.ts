import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

// Proxy analytics requests to the Supabase edge function which has all env vars configured.
// The Next.js deployment doesn't need SUPABASE_SERVICE_ROLE_KEY this way.
const MAIN_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('Origin'), 'GET, OPTIONS') });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const cors = corsHeaders(req.headers.get('Origin'), 'GET, OPTIONS');
  try {
    const { path: pathSegments } = await params;
    const analyticsPath = pathSegments.join('/');
    const search  = req.nextUrl.search;
    const auth    = req.headers.get('Authorization') ?? '';
    const orgId   = req.headers.get('X-Org-Id') ?? '';

    // BUG FIX: Point to the Main API (Railway) instead of the stale Supabase Edge Function
    const target = `${MAIN_API_URL}/api/v1/analytics/${analyticsPath}${search}`;

    // Dev-only proxy trace — production builds will strip this via
    // the babel-plugin-transform-remove-console step in next.config.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AnalyticsProxy] Proxying to: ${target}`);
    }

    const res = await fetch(target, {
      headers: {
        'Authorization': auth,
        'X-Org-Id': orgId,
      },
      // Ensure we don't cache stale analytics data
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status, headers: cors });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error(`[AnalyticsProxy] Error:`, e);
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500, headers: cors }
    );
  }
}
