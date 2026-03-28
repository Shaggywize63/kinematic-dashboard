import { NextRequest, NextResponse } from 'next/server';

// Proxy analytics requests to the Supabase edge function which has all env vars configured.
// The Next.js deployment doesn't need SUPABASE_SERVICE_ROLE_KEY this way.
const EDGE_BASE = 'https://lnvxqjqfsxvtjvbzphou.supabase.co/functions/v1/api-proxy';
const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudnhxanFmc3h2dGp2YnpwaG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQyMDAsImV4cCI6MjA4NzYxMDIwMH0.D6EPi3BC4d0-bfzttbx5ObP0v0fb6HBYWz5HbmCWkJw';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-Id',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const analyticsPath = pathSegments.join('/');
    const search  = req.nextUrl.search;
    const auth    = req.headers.get('Authorization') ?? '';
    const orgId   = req.headers.get('X-Org-Id') ?? '';

    const target = `${EDGE_BASE}/api/v1/analytics/${analyticsPath}${search}`;

    const res = await fetch(target, {
      headers: {
        'Authorization': auth,
        'apikey': ANON_KEY,
        'X-Org-Id': orgId,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status, headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500, headers: CORS }
    );
  }
}
