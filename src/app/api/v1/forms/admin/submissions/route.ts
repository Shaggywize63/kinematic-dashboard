import { NextRequest, NextResponse } from 'next/server';

// Proxy admin submissions to the Supabase edge function which has correct
// filter logic. Railway's handler uses an invalid PostgREST select clause
// (requests city_id/zone_id on the users table — columns that don't exist),
// causing HTTP 400 for all filtered queries.
const EDGE_BASE    = 'https://lnvxqjqfsxvtjvbzphou.supabase.co/functions/v1/api-proxy';
const SUPA_REST    = 'https://lnvxqjqfsxvtjvbzphou.supabase.co/rest/v1';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudnhxanFmc3h2dGp2YnpwaG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQyMDAsImV4cCI6MjA4NzYxMDIwMH0.D6EPi3BC4d0-bfzttbx5ObP0v0fb6HBYWz5HbmCWkJw';

// Never cache — submissions data changes frequently and date filters must
// always hit the upstream edge function fresh.
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-Id',
};

/**
 * Fetch answers from builder_submissions for submissions whose
 * form_submissions.answers is null. This covers new submissions that went
 * through the edge function (stored in builder_submissions) but whose mirror
 * into form_submissions didn't include the answers field yet.
 */
async function enrichAnswers(submissions: any[], userAuth: string): Promise<void> {
  const missing = submissions.filter(
    (s) => (!s.answers || (Array.isArray(s.answers) && s.answers.length === 0))
      && s.user_id
      && s.builder_forms?.id,
  );
  if (missing.length === 0) return;

  // Use the user's auth token if available (satisfies RLS policies),
  // otherwise fall back to the anon key (works when RLS is disabled).
  const authHeader = userAuth || `Bearer ${ANON_KEY}`;

  await Promise.all(
    missing.map(async (sub) => {
      try {
        const formId  = sub.builder_forms.id;
        const userId  = sub.user_id;
        // Use a ±2 day window around the submission timestamp to account for
        // timezone offsets between where the submission was recorded and UTC.
        const ts      = new Date(sub.submitted_at || Date.now());
        const lo      = new Date(ts.getTime() - 2 * 86_400_000).toISOString();
        const hi      = new Date(ts.getTime() + 2 * 86_400_000).toISOString();

        const qs = new URLSearchParams({
          select: 'answers,submitted_at',
          user_id: `eq.${userId}`,
          form_id: `eq.${formId}`,
          submitted_at: `gte.${lo}`,
          order: 'submitted_at.desc',
          limit: '1',
        });
        // PostgREST doesn't support multiple filters on the same column via
        // URLSearchParams (duplicate keys get overwritten). Append second filter:
        const url = `${SUPA_REST}/builder_submissions?${qs.toString()}&submitted_at=lte.${hi}`;

        const r = await fetch(url, {
          cache: 'no-store',
          headers: {
            'apikey': ANON_KEY,
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });
        if (!r.ok) return;

        const rows: any[] = await r.json();
        if (rows.length > 0 && rows[0].answers) {
          sub.answers = rows[0].answers;
        }
      } catch {
        // Non-fatal — submission still appears, just without answers
      }
    }),
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.search;
    const auth   = req.headers.get('Authorization') ?? '';
    const orgId  = req.headers.get('X-Org-Id') ?? '';

    const target = `${EDGE_BASE}/api/v1/forms/admin/submissions${search}`;

    const res = await fetch(target, {
      cache: 'no-store',
      headers: {
        'Authorization': auth,
        'apikey': ANON_KEY,
        'X-Org-Id': orgId,
      },
    });

    const data = await res.json();

    // Enrich submissions that have no answers stored in form_submissions
    // by pulling the raw answers from builder_submissions (which the edge
    // function v13 always populates on submit).
    const submissions: any[] =
      data?.data?.data ||   // { data: { data: [] } }
      data?.data ||          // { data: [] }
      data?.submissions ||   // { submissions: [] }
      (Array.isArray(data) ? data : []);

    if (submissions.length > 0) {
      await enrichAnswers(submissions, auth);
    }

    return NextResponse.json(data, { status: res.status, headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500, headers: CORS }
    );
  }
}
