import { NextRequest, NextResponse } from 'next/server';

const EDGE_BASE = 'https://kinematic-production.up.railway.app';
const SUPA_REST = 'https://lnvxqjqfsxvtjvbzphou.supabase.co/rest/v1';
const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudnhxanFmc3h2dGp2YnpwaG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQyMDAsImV4cCI6MjA4NzYxMDIwMH0.D6EPi3BC4d0-bfzttbx5ObP0v0fb6HBYWz5HbmCWkJw';

// Never cache — data changes frequently and date filters must always be fresh.
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-Id',
};

function supaHeaders(auth: string) {
  return {
    'apikey': ANON_KEY,
    'Authorization': auth || `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Convert a form_responses row (old Railway schema) into a FormAnswer object.
 */
function responseRowToAnswer(row: any) {
  const qtype = row.qtype || row.builder_questions?.qtype || 'text';
  const label = row.label || row.builder_questions?.label || 'Question';
  const value = row.value_text ?? row.value_number ?? row.value_bool ?? null;
  return { label, qtype, value, display: value != null ? String(value) : '—' };
}

/**
 * Try to fetch answers from builder_submissions (edge-function path) —
 * matches by user_id + form_id within a ±2 day window.
 */
async function fromBuilderSubmissions(
  sub: any,
  auth: string,
): Promise<boolean> {
  if (!sub.builder_forms?.id || !sub.user_id) return false;
  try {
    const ts = new Date(sub.submitted_at || Date.now());
    const lo = new Date(ts.getTime() - 2 * 86_400_000).toISOString();
    const hi = new Date(ts.getTime() + 2 * 86_400_000).toISOString();

    const qs = new URLSearchParams({
      select: 'answers',
      user_id: `eq.${sub.user_id}`,
      form_id: `eq.${sub.builder_forms.id}`,
      'submitted_at': `gte.${lo}`,
      order: 'submitted_at.desc',
      limit: '1',
    });
    const url = `${SUPA_REST}/builder_submissions?${qs}&submitted_at=lte.${hi}`;
    const r = await fetch(url, { cache: 'no-store', headers: supaHeaders(auth) });
    if (!r.ok) return false;
    const rows: any[] = await r.json();
    if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0].answers) && rows[0].answers.length > 0) {
      sub.answers = rows[0].answers;
      return true;
    }
  } catch { /* non-fatal */ }
  return false;
}

/**
 * Try to fetch answers from form_responses (old Railway schema) —
 * matches by form_submission_id (the form_submissions.id).
 * Joins builder_questions to get label + qtype.
 */
async function fromFormResponses(sub: any, auth: string): Promise<boolean> {
  if (!sub.id) return false;
  try {
    const candidates = [
      `${SUPA_REST}/form_responses?select=value_text,value_number,value_bool,builder_questions(id,label,qtype)&form_submission_id=eq.${sub.id}&limit=100`,
      `${SUPA_REST}/form_responses?select=value_text,value_number,value_bool,builder_questions(id,label,qtype)&submission_id=eq.${sub.id}&limit=100`,
    ];

    for (const url of candidates) {
      const r = await fetch(url, { cache: 'no-store', headers: supaHeaders(auth) });
      if (!r.ok) continue;
      const rows: any[] = await r.json();
      if (Array.isArray(rows) && rows.length > 0) {
        sub.answers = rows
          .filter((row) => row.builder_questions)
          .map(responseRowToAnswer);
        if (sub.answers.length > 0) return true;
      }
    }
  } catch { /* non-fatal */ }
  return false;
}

async function enrichAnswers(submissions: any[], auth: string): Promise<void> {
  const missing = submissions.filter(
    (s) => !s.answers || (Array.isArray(s.answers) && s.answers.length === 0),
  );
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (sub) => {
      const found = await fromBuilderSubmissions(sub, auth);
      if (!found) await fromFormResponses(sub, auth);
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

    // Direct proxy to stabilized Railway backend
    const target = `${EDGE_BASE}/api/v1/forms/admin/submissions${search}`;
    const res = await fetch(target, {
      cache: 'no-store',
      headers: { 'Authorization': auth, 'X-Org-Id': orgId },
    });

    const data = await res.json();

    const submissions: any[] =
      data?.data?.data ||
      data?.data ||
      data?.submissions ||
      (Array.isArray(data) ? data : []);

    if (submissions.length > 0) {
      await enrichAnswers(submissions, auth);
    }

    return NextResponse.json(data, { status: res.status, headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500, headers: CORS },
    );
  }
}
