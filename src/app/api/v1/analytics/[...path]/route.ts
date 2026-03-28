import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getOrgId(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const userClient = createClient(SUPA_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;
    const admin = createClient(SUPA_URL, SERVICE);
    const { data } = await admin.from('users').select('org_id').eq('id', user.id).single();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}

function getDateRange(sp: URLSearchParams): { fromDate: string; toDate: string } {
  const fromParam = sp.get('from');
  const toParam   = sp.get('to');
  const period    = sp.get('period') ?? '30d';

  if (fromParam && toParam) return { fromDate: fromParam, toDate: toParam };

  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const to     = istNow.toISOString().split('T')[0];
  const days   = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const from   = new Date(istNow);
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().split('T')[0], toDate: to };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const analyticsPath = '/' + pathSegments.join('/');
  const sp = req.nextUrl.searchParams;

  const auth  = req.headers.get('Authorization');
  const orgId = await getOrgId(auth);
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const admin = createClient(SUPA_URL, SERVICE);
  const { fromDate, toDate } = getDateRange(sp);

  function ok(data: unknown) {
    return NextResponse.json({ success: true, data }, { status: 200, headers: CORS });
  }

  try {
    // ── /summary ────────────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/summary')) {
      const [tffRes, attRes, feRes, zoneRes] = await Promise.all([
        admin.from('form_submissions').select('id, user_id, date, outlet_name, outlet_id, is_converted').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate),
        admin.from('attendance').select('user_id, date, checkin_at, checkout_at, total_hours').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate).not('checkin_at', 'is', null),
        admin.from('users').select('id, name, city, zone_id').eq('org_id', orgId).eq('role', 'executive').eq('is_active', true),
        admin.from('zones').select('id, name, city').eq('org_id', orgId),
      ]);

      const tffs  = tffRes.data  ?? [];
      const atts  = attRes.data  ?? [];
      const fes   = feRes.data   ?? [];
      const zones = zoneRes.data ?? [];

      const feCount    = fes.length;
      const totalTff   = tffs.length;
      const totalHours = atts.reduce((s, a) => s + (a.total_hours ?? 0), 0);

      const attByDate = new Map<string, Set<string>>();
      for (const a of atts) {
        if (!attByDate.has(a.date)) attByDate.set(a.date, new Set());
        attByDate.get(a.date)!.add(a.user_id);
      }
      const totalDaysWorked = attByDate.size;
      const avgAttendance = feCount > 0 && attByDate.size > 0
        ? Math.round([...attByDate.values()].reduce((s, v) => s + v.size, 0) / attByDate.size / feCount * 100)
        : 0;

      const feMap   = new Map(fes.map(f => [f.id, f]));
      const zoneMap = new Map(zones.map(z => [z.id, z]));

      const tffByUser = new Map<string, number>();
      for (const t of tffs) tffByUser.set(t.user_id, (tffByUser.get(t.user_id) ?? 0) + 1);

      const attCountByUser = new Map<string, number>();
      for (const a of atts) attCountByUser.set(a.user_id, (attCountByUser.get(a.user_id) ?? 0) + 1);

      const topPerformers = [...tffByUser.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([uid, count]) => {
          const fe       = feMap.get(uid);
          const attPct   = totalDaysWorked > 0 ? Math.round((attCountByUser.get(uid) ?? 0) / totalDaysWorked * 100) : 0;
          const city     = fe?.city || (fe?.zone_id ? (zoneMap.get(fe.zone_id)?.city ?? '') : '');
          const zoneName = fe?.zone_id ? (zoneMap.get(fe.zone_id)?.name ?? '') : '';
          return { id: uid, name: fe?.name ?? 'Unknown', zone: zoneName, city, tff: count, attendance: attPct };
        });

      const tffByZone = new Map<string, number>();
      for (const t of tffs) {
        const fe = feMap.get(t.user_id);
        if (fe?.zone_id) tffByZone.set(fe.zone_id, (tffByZone.get(fe.zone_id) ?? 0) + 1);
      }
      const zonePerformance = zones.map(z => ({ zone: z.name, tff: tffByZone.get(z.id) ?? 0, target: 50 }));

      const tffByDate = new Map<string, number>();
      for (const t of tffs) if (t.date) tffByDate.set(t.date, (tffByDate.get(t.date) ?? 0) + 1);
      const monthly_data = [...tffByDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, tff: count }));

      return ok({
        kpis: { total_tff: totalTff, avg_attendance: avgAttendance, total_days_worked: totalDaysWorked, total_leaves: 0, total_hours_worked: Math.round(totalHours * 10) / 10, total_visits: totalTff },
        total_tff: totalTff, tff_count: totalTff,
        avg_attendance: avgAttendance, attendance_pct: avgAttendance,
        total_days_worked: totalDaysWorked,
        total_hours_worked: Math.round(totalHours * 10) / 10,
        top_performers: topPerformers,
        zone_performance: zonePerformance,
        monthly_data,
      });
    }

    // ── /tff-trends ─────────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/tff-trends')) {
      const { data: tffs } = await admin.from('form_submissions').select('date').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate);
      const byDate = new Map<string, number>();
      for (const t of tffs ?? []) if (t.date) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
      return ok([...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, tff]) => ({ date, tff })));
    }

    // ── /contact-heatmap ────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/contact-heatmap')) {
      const { data: tffs } = await admin.from('form_submissions').select('submitted_at').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate);
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
      for (const t of tffs ?? []) {
        if (!t.submitted_at) continue;
        const istDt = new Date(new Date(t.submitted_at).getTime() + 5.5 * 60 * 60 * 1000);
        heatmap[istDt.getUTCDay()][istDt.getUTCHours()]++;
      }
      return ok(DAYS.map((day, d) => ({ day, hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: heatmap[d][h] })) })));
    }

    // ── /city-performance ───────────────────────────────────────────────────
    if (analyticsPath.startsWith('/city-performance')) {
      const [feRes, tffRes, attRes, zoneRes] = await Promise.all([
        admin.from('users').select('id, city, zone_id').eq('org_id', orgId).eq('role', 'executive').eq('is_active', true),
        admin.from('form_submissions').select('user_id').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate),
        admin.from('attendance').select('user_id').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate).not('checkin_at', 'is', null),
        admin.from('zones').select('id, city').eq('org_id', orgId),
      ]);
      const zoneMap = new Map((zoneRes.data ?? []).map(z => [z.id, z]));
      const userCity = new Map<string, string>();
      for (const fe of feRes.data ?? []) {
        userCity.set(fe.id, fe.city || (fe.zone_id ? (zoneMap.get(fe.zone_id)?.city ?? '') : '') || 'Unknown');
      }
      const tffByCity: Record<string, number> = {};
      for (const t of tffRes.data ?? []) { const c = userCity.get(t.user_id) ?? 'Unknown'; tffByCity[c] = (tffByCity[c] ?? 0) + 1; }
      const checkinsByCity: Record<string, number> = {};
      for (const a of attRes.data ?? []) { const c = userCity.get(a.user_id) ?? 'Unknown'; checkinsByCity[c] = (checkinsByCity[c] ?? 0) + 1; }
      const allCities = new Set([...Object.keys(tffByCity), ...Object.keys(checkinsByCity)]);
      const cities = [...allCities].filter(c => c.toLowerCase() !== 'gurugram')
        .map(city => ({ city, tff: tffByCity[city] ?? 0, checkins: checkinsByCity[city] ?? 0 }))
        .sort((a, b) => b.tff - a.tff);
      return ok({ cities });
    }

    // ── /outlet-coverage ────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/outlet-coverage')) {
      const { data: tffs } = await admin.from('form_submissions').select('outlet_id, outlet_name, is_converted').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate);
      const outletMap = new Map<string, { name: string; tff: number; converted: number }>();
      for (const t of tffs ?? []) {
        const key = t.outlet_id ?? t.outlet_name ?? 'Unknown';
        if (!outletMap.has(key)) outletMap.set(key, { name: t.outlet_name ?? 'Unknown', tff: 0, converted: 0 });
        const o = outletMap.get(key)!; o.tff++; if (t.is_converted) o.converted++;
      }
      const outlets = [...outletMap.values()].sort((a, b) => b.tff - a.tff).slice(0, 20)
        .map(o => ({ outlet_name: o.name, tff: o.tff, tff_rate: o.tff > 0 ? Math.round(o.converted / o.tff * 100) : 0, visits: o.tff }));
      return ok({ outlets });
    }

    // ── /attendance-today ───────────────────────────────────────────────────
    if (analyticsPath.startsWith('/attendance-today')) {
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
      const [feRes, attRes] = await Promise.all([
        admin.from('users').select('id, name').eq('org_id', orgId).eq('role', 'executive').eq('is_active', true),
        admin.from('attendance').select('user_id, checkin_at, checkout_at, status').eq('org_id', orgId).eq('date', today),
      ]);
      const fes = feRes.data ?? [];
      const attMap = new Map((attRes.data ?? []).map(a => [a.user_id, a]));
      const present    = fes.filter(fe => attMap.get(fe.id)?.checkin_at);
      const checkedOut = fes.filter(fe => attMap.get(fe.id)?.checkout_at);
      return ok({
        present: present.length, absent: fes.length - present.length, total: fes.length, checked_out: checkedOut.length,
        attendance_pct: fes.length > 0 ? Math.round(present.length / fes.length * 100) : 0,
        executives: fes.map(fe => ({ id: fe.id, name: fe.name, status: attMap.get(fe.id)?.checkin_at ? (attMap.get(fe.id)?.checkout_at ? 'checked_out' : 'checked_in') : 'absent' })),
      });
    }

    // ── /weekly-contacts ────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/weekly-contacts')) {
      const { data: tffs } = await admin.from('form_submissions').select('date').eq('org_id', orgId).gte('date', fromDate).lte('date', toDate);
      const byDate = new Map<string, number>();
      for (const t of tffs ?? []) if (t.date) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
      return ok([...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, tff]) => ({ date, tff, contacts: tff })));
    }

    // ── /activity-feed ──────────────────────────────────────────────────────
    if (analyticsPath.startsWith('/activity-feed')) {
      const [tffRes, feRes] = await Promise.all([
        admin.from('form_submissions').select('id, user_id, outlet_name, submitted_at').eq('org_id', orgId).order('submitted_at', { ascending: false }).limit(20),
        admin.from('users').select('id, name').eq('org_id', orgId),
      ]);
      const feMap = new Map((feRes.data ?? []).map(f => [f.id, f]));
      return ok((tffRes.data ?? []).map(t => ({ id: t.id, type: 'form_submission', user: feMap.get(t.user_id)?.name ?? 'Unknown', outlet: t.outlet_name ?? '', timestamp: t.submitted_at })));
    }

    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404, headers: CORS });
  } catch (e) {
    console.error('Analytics API error:', analyticsPath, e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500, headers: CORS });
  }
}
