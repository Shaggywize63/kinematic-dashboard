'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, type CSSProperties } from 'react';
import { parseISO, isValid } from 'date-fns';
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Loader2, Pencil, Plus, RefreshCw, Search, ShieldAlert, Upload, UserX, X } from 'lucide-react';
import api, { type AttendanceLate } from '../../../lib/api';
import MonthlySummary from './MonthlySummary';
import { RangePresetPicker, presetRange } from '../../../components/attendance/RangePresets';
import DayTravel from '../../../components/attendance/DayTravel';
import PersonMonthModal from '../../../components/attendance/PersonMonthModal';
import { SortLabel, type SortState } from '../../../lib/tableSort';
import { addDaysYmd, eachDay, gapStatus, istMinutesOfDay, istTodayYmd, parseRules, toISTDate, type RulesLite } from '../../../lib/attendanceDay';
import PlaceText from '../../../components/travel-report/PlaceText';
import { useSeen } from '../../../lib/placeName';
import { modeText } from '../../../lib/travelReport';
import SignedImage, { openSignedUrl } from '@/components/shared/SignedImage';
import Modal from '../../../components/crm/shared/Modal';
import { useAuth } from '../../../hooks/useAuth';
import { useClient } from '../../../context/ClientContext';
import { useRealtimeAttendance } from '../../../hooks/useRealtimeAttendance';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { usePageTitle } from '../../../lib/pageTitle';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, PageHeader, Section, Segmented, Select, T, Textarea, cardStyle, useIsCompact, type Tone } from '../../../components/ui';

/* ── DateRangePicker component ── */
function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const presets = [
    { l: 'Today', f: new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0], t: new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0] },
    { l: 'Yesterday', f: new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().split('T')[0], t: new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().split('T')[0] },
    { l: 'Last 7 days', f: new Date(Date.now() + 5.5 * 3600000 - 6 * 86400000).toISOString().split('T')[0], t: new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0] },
    { l: 'Last 30 days', f: new Date(Date.now() + 5.5 * 3600000 - 29 * 86400000).toISOString().split('T')[0], t: new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0] },
  ];

  const label = from === to
    ? new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button onClick={() => setOpen(!open)} icon={<CalendarDays size={16} strokeWidth={1.6} />} style={{ height: 36 }} aria-expanded={open}>
        <span style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      </Button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 600, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, width: 280, boxShadow: 'var(--shadow-pop)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
            {presets.map(p => {
              const on = p.f === from && p.t === to;
              return (
                <button key={p.l} type="button" onClick={() => { onChange(p.f, p.t); setOpen(false); }} className="km-navrow"
                  style={{ height: 32, padding: '0 10px', background: on ? 'var(--s3)' : 'transparent', border: 'none', color: on ? T.text : T.dim, fontSize: 13.5, fontWeight: 500, textAlign: 'left', cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit' }}>{p.l}</button>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="From"><Input type="date" value={from} max={istTodayYmd()} onChange={e => onChange(e.target.value, to)} style={{ fontSize: 12.5, padding: '0 8px' }} /></Field>
              <Field label="To"><Input type="date" value={to} min={from || undefined} max={istTodayYmd()} onChange={e => onChange(from, e.target.value)} style={{ fontSize: 12.5, padding: '0 8px' }} /></Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── types ── */
interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  // 'not_yet' / 'week_off' are never stored: they label a day with no record that is not (yet) an absence.
  status: 'checked_in' | 'checked_out' | 'on_break' | 'absent' | 'half_day' | 'on_leave' | 'not_yet' | 'week_off';
  checkin_at?: string;
  checkin_lat?: number;
  checkin_lng?: number;
  checkin_selfie_url?: string;
  checkout_at?: string;
  checkout_lat?: number;
  checkout_lng?: number;
  checkout_selfie_url?: string;
  total_hours?: number;
  break_minutes?: number;
  notes?: string;
  override_reason?: string;
  override_by?: string;
  is_regularised?: boolean;
  // Present only when the client has saved attendance rules (Settings → Operational rules). Absent = legacy
  // client: lateness is not judged by the API and the page keeps its fixed 09:30 on-time heuristic.
  late?: AttendanceLate;
  // Mode of transport the rep chose at check-in (only for clients with the "Ask for mode of transport" rule on):
  // the id the app sent, and the label the server resolved for it. Absent / null = not asked or not answered.
  transport_mode?: string | null;
  transport_label?: string | null;
  // Face-recognition attendance (module face_attendance): the on-device 1:1
  // match result stamped at check-in / check-out.
  checkin_face_verified?: boolean;
  checkin_face_score?: number;
  checkout_face_verified?: boolean;
  checkout_face_score?: number;
  // Location trust signals stamped at check-in: a spoofed (mock) GPS fix, and how far the fix was from the site.
  checkin_is_mock?: boolean;
  checkin_distance_m?: number | null;
  _virtual?: boolean;
  users?: { name: string; role?: string; employee_id?: string; zones?: { name: string } };
}

interface FormData {
  user_id: string;
  date: string;
  status: string;
  checkin_date: string;
  checkin_at: string;
  checkin_selfie_url: string;
  checkout_date: string;
  checkout_at: string;
  checkout_selfie_url: string;
  override_reason: string;
  checkin_lat: string;
  checkin_lng: string;
  checkout_lat: string;
  checkout_lng: string;
  notes: string;
}

const _today = new Date(new Date().getTime() + 5.5 * 3600000).toISOString().split('T')[0];
const BLANK: FormData = {
  user_id: '', date: _today, status: 'checked_in',
  checkin_date: _today, checkin_at: '', checkin_selfie_url: '',
  checkout_date: _today, checkout_at: '', checkout_selfie_url: '',
  override_reason: '',
  checkin_lat: '', checkin_lng: '', checkout_lat: '', checkout_lng: '',
  notes: '',
};

/* ── helpers ── */
const Spinner = () => <Loader2 size={15} strokeWidth={1.8} style={{ animation: 'kspin .8s linear infinite', flexShrink: 0 }} />;

const statusMeta: Record<string, { label: string; tone: Tone }> = {
  checked_in:  { label: 'Checked in',  tone: 'ok' },
  checked_out: { label: 'Checked out', tone: 'info' },
  on_break:    { label: 'On break',    tone: 'warn' },
  absent:      { label: 'Absent',      tone: 'red' },
  half_day:    { label: 'Half day',    tone: 'warn' },
  on_leave:    { label: 'On leave',    tone: 'neutral' },
  not_yet:     { label: 'Not in yet',  tone: 'neutral' },
  week_off:    { label: 'Week off',    tone: 'neutral' },
};
// Colour of the rail on a row's left edge — the status read at a glance down a long list.
const statusRail: Record<string, string | undefined> = {
  checked_in: 'var(--ok)', checked_out: 'var(--info)', on_break: 'var(--warn)', absent: 'var(--red)', half_day: 'var(--warn)', on_leave: 'var(--mute)',
};
// Order for the Status column sort: what needs attention first.
const statusOrder: Record<string, number> = { absent: 0, half_day: 1, on_break: 2, checked_in: 3, checked_out: 4, on_leave: 5, not_yet: 6, week_off: 7 };

const fmt = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtDate = (d: any) => {
  const ymd = toISTDate(d);
  if (!ymd) return '—';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [year, mo, day] = ymd.split('-');
  const mIdx = parseInt(mo, 10) - 1;
  if (mIdx < 0 || mIdx > 11) return '—';
  return `${day} ${MONTHS[mIdx]} ${year}`;
};
const fmtHrs = (h: number | null) => {
  if (h == null) return '—';
  const totalMinutes = Math.round(h * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h ${mins}m`;
};

// Robust parser for inconsistent ISO strings (handles spaces instead of T, etc.)
const parseDate = (iso?: string | null): number | null => {
  if (!iso) return null;
  const s = iso.replace(' ', 'T'); // Fix space-separated timestamps
  const d = parseISO(s);
  return isValid(d) ? d.getTime() : null;
};

/* ── table styles ── */
const th: CSSProperties = { padding: '12px 14px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };
const tdMono: CSSProperties = { ...td, fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/* ── selfie thumbnail with "open" affordance ──
   Signed on demand: a day with hundreds of rows must not sign hundreds of private-bucket URLs up front, so the
   image (and its /media/sign call) only starts once the thumbnail scrolls into view. */
const SelfieThumb = ({ src, alt, tone }: { src: string; alt: string; tone: 'ok' | 'info' }) => {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
      {seen
        ? <SignedImage src={src} alt={alt} loading="lazy" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${T.border}`, display: 'block' }} />
        : <div aria-hidden style={{ width: 40, height: 40, borderRadius: 8, background: T.raised, border: `1px solid ${T.border}` }} />}
      <a href={src} onClick={(e) => openSignedUrl(e, src)} target="_blank" rel="noreferrer" title={`Open ${alt.toLowerCase()} selfie`}
         style={{ position: 'absolute', bottom: -4, right: -4, background: T.card, border: `1px solid ${T.border}`, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone === 'ok' ? T.ok : T.info, textDecoration: 'none' }}>
        <Eye size={10} strokeWidth={2} />
      </a>
    </div>
  );
};

/* ═══════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */
function AttendanceContent() {
  usePageTitle('Attendance');
  const narrow = useIsCompact(1100);
  const phone = useIsCompact(769);
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // UNIVERSAL IST TODAY HELPER
  const getISTToday = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    return ist.toISOString().split('T')[0];
  };

  const _today = getISTToday();
  const urlFrom = searchParams.get('from');
  const urlTo = searchParams.get('to');

  // Real rows from the API. The absent / week-off / not-in-yet rows for people with NO record are derived below, so
  // a change to the shift rules (or the clock passing shift start) re-judges them without another fetch.
  const [base,     setBase]     = useState<AttendanceRecord[]>([]);
  const [rules,    setRules]    = useState<RulesLite | null>(null);
  const [users,    setUsers]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  // One person's days (opened from a name in the monthly summary, or from a record's detail).
  const [personView, setPersonView] = useState<{ userId: string; name: string; from: string; to: string } | null>(null);
  // The Refresh button re-reads in place (spinner on the button, table stays) instead of swapping to the skeleton.
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' });
  const [err,      setErr]      = useState('');
  const [fromDate,   setFrom]   = useState(urlFrom || _today);
  const [toDate,     setTo]     = useState(urlTo || _today);
  const [statusFilter, setSF]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState<'executive' | 'supervisor'>('executive');
  // 'daily' = the live record list below; 'monthly' = per-employee month totals (GET /attendance/summary).
  const [view, setView] = useState<'daily' | 'monthly'>('daily');

  // Persistence Sync
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const f = (fromDate || _today).trim();
    const t = (toDate || _today).trim();
    params.set('from', f);
    params.set('to', t);
    if (searchParams.get('from') !== f || searchParams.get('to') !== t) {
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [fromDate, toDate, pathname, router, searchParams, _today]);

  /* modals */
  const [showAdd,    setShowAdd]    = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editRec,    setEditRec]    = useState<AttendanceRecord | null>(null);
  const [detail,     setDetail]     = useState<AttendanceRecord | null>(null);
  const [delRec,     setDelRec]     = useState<AttendanceRecord | null>(null);

  /* export */
  // Default to this calendar month-to-date (IST) — the same range the picker's
  // "This month" preset produces, so the modal opens with that tab active.
  const [expFrom,    setExpFrom]    = useState(() => presetRange('month').from);
  const [expTo,      setExpTo]      = useState(() => presetRange('month').to);
  const [expGroupBy, setExpGroupBy] = useState<'city'|'role'|'executive'>('city');
  const [expLoading, setExpLoading] = useState(false);
  const [expErr,     setExpErr]     = useState('');

  /* form */
  const [form,    setForm]    = useState<FormData>(BLANK);
  const [fErr,    setFErr]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const setF = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── selfie upload — direct to Supabase Storage ── */
  const [uploading, setUploading] = useState<string | null>(null); // 'checkin' | 'checkout'

  const uploadSelfie = async (field: 'checkin_selfie_url' | 'checkout_selfie_url', file: File) => {
    const which = field === 'checkin_selfie_url' ? 'checkin' : 'checkout';
    setUploading(which);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `selfies/${Date.now()}_${which}.${ext}`;
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const ANON_KEY    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/kinematic-selfies/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || 'Upload failed');
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/kinematic-selfies/${path}`;
      setF(field, publicUrl);
    } catch (e: any) {
      alert('Upload failed: ' + (e?.message || 'Unknown error'));
    } finally { setUploading(null); }
  };

  /* ── fetch ── */
  const { selectedClientId } = useClient();

  // The people list is the heavy half of every refresh (up to 500 rows) and changes rarely, so it is fetched once
  // per client and only again on an explicit Refresh — not on every 15 s poll or realtime event.
  const usersFor = useRef<string | null>(null);
  // load() needs the latest users without depending on them (that would refetch on every users change).
  const usersRef = useRef<any[]>([]);
  useEffect(() => { usersRef.current = users; }, [users]);
  // Only the newest request may write state: a slow poll must never overwrite the answer for a range picked after it.
  const reqId = useRef(0);

  const pick = (r: any) => {
    if (Array.isArray(r)) return r;
    if (Array.isArray(r?.data)) return r.data;
    if (Array.isArray(r?.data?.data)) return r.data.data;
    return [];
  };

  const load = useCallback(async (opts: { silent?: boolean; refreshUsers?: boolean } = {}) => {
    const id = ++reqId.current;
    try {
      // A background refresh (poll / realtime) updates in place; only a first load, a new range or a new client
      // swaps the table for the skeleton — otherwise it would flash every 15 seconds.
      if (!opts.silent) setLoading(true);
      const f = fromDate.trim();
      const t = toDate.trim();

      let qs = `from=${f}&to=${t}`;
      if (selectedClientId && selectedClientId !== 'all') {
        qs += `&client_id=${selectedClientId}`;
      }

      const clientKey = String(selectedClientId ?? '');
      const needUsers = opts.refreshUsers || usersFor.current !== clientKey;
      // A range that includes today is live data, and every background refresh is meant to see changes: skip the
      // client's 60 s GET cache for those (it silently turned the 15 s poll and the realtime push into a 60 s one).
      // A fully past range can't change under us, so a plain navigation to it may still be answered from the cache.
      const live = t >= istTodayYmd();
      const [attRes, usersRes] = await Promise.all([
        api.get<any>(`/api/v1/attendance/team?${qs}`, (live || opts.silent ? { noCache: true } : {}) as RequestInit),
        needUsers ? api.get<any>(`/api/v1/users?limit=500&scope=field_filter${selectedClientId ? `&client_id=${selectedClientId}` : ''}`) : Promise.resolve(null),
      ]);
      if (id !== reqId.current) return;

      let usersArr: any[];
      if (usersRes) {
        usersArr = pick(usersRes);
        usersFor.current = clientKey;
        setUsers(usersArr);
      } else {
        usersArr = usersRef.current;
      }

      // Build lookup map: id → user
      const userMap: Record<string, any> = {};
      usersArr.forEach((u: any) => { userMap[u.id] = u; });

      // Enrich attendance records with user info if join didn't come back
      const attArr = pick(attRes).map((r: any) => {
        // Normalize date to IST YYYY-MM-DD so the covered-day keys always match the range's dates.
        const normDate = toISTDate(r.date) || toISTDate(r.checkin_at) || undefined;
        r = { ...r, date: normDate };
        const u = userMap[r.user_id];
        if (r.users?.name) {
          if (u) r.users.role = u.role;
          return r;
        }
        if (u) return { ...r, users: { name: u.name, employee_id: u.employee_id, zones: u.zones, role: u.role } };
        return r;
      });

      setBase(attArr);
      setErr('');
    } catch (e: any) {
      if (id === reqId.current) setErr(e.message || 'Failed to load attendance');
    } finally { if (id === reqId.current) setLoading(false); }
  }, [fromDate, toDate, selectedClientId]);

  useEffect(() => { load(); }, [load]);

  // Shift rules decide whether a gap is an absence, a week off, or "not in yet". Read-only for any signed-in user.
  // A failure (or a client with no saved rules) leaves the old behaviour: every gap is Absent.
  useEffect(() => {
    let cancelled = false;
    api.get<any>('/api/v1/attendance/rules')
      .then((res) => { if (!cancelled) setRules(parseRules(res)); })
      .catch(() => { if (!cancelled) setRules(null); });
    return () => { cancelled = true; };
  }, [selectedClientId]);

  // Realtime push: when ANY attendance/breaks row changes for this org, the Supabase channel refreshes in place.
  // Combined with the visible-tab poll below, this gives instant supervisor updates with a 15s catch-up safety net
  // (handles dropped websockets, tab-was-hidden, etc.).
  useRealtimeAttendance(() => { if (toDate.trim() >= istTodayYmd()) void load({ silent: true }); });

  // Live-ish supervisor view: poll every 15 s while the tab is visible so newly-marked attendance rows show up
  // without a manual refresh. Pauses when the tab is hidden. Backend response is 304-able via the Cache-Control +
  // ETag headers we set on /attendance/team, so the real network cost is tiny when nothing has changed.
  useEffect(() => {
    let timer: number | null = null;
    // Nothing changes under a range that ended before today, so there is nothing to poll for.
    const watching = () => document.visibilityState === 'visible' && toDate.trim() >= istTodayYmd();
    const tick = () => {
      if (watching()) load({ silent: true });
      timer = window.setTimeout(tick, 15_000);
    };
    timer = window.setTimeout(tick, 15_000);
    const onVis = () => { if (watching()) load({ silent: true }); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, toDate]);

  // People with no record for a day in range: absent, week off, or not in yet — judged with the client's shift rules.
  // Padding is a cartesian product (eligible users × days), so a wide range on a big tenant is capped: it froze the
  // page before. Past the cap the table shows recorded attendance only and points at Export for the full breakdown.
  const { records, absentPaddingSkipped } = useMemo(() => {
    const ELIGIBLE_ROLES = ['executive', 'field_executive', 'field-executive', 'field_exec', 'supervisor', 'city_manager'];
    // Tenants like ByteBack keep field execs on the generic 'sub_admin' preset and mark them FE via their org-role
    // data_scope ('own'). Treat data_scope 'own' as eligible too, so those reps still get absent-row padding.
    const eligibleUsers = users.filter((u: any) => {
      const rel = Array.isArray(u.org_role) ? u.org_role[0] : u.org_role;
      const ds = (rel?.data_scope || '').toLowerCase();
      return (ELIGIBLE_ROLES.includes((u.role || '').toLowerCase()) || ds === 'own') && u.is_active;
    });
    const covered = new Set(base.map((r) => `${r.user_id}|${toISTDate(r.date) || toISTDate(r.checkin_at)}`));
    const days = eachDay(fromDate.trim(), toDate.trim());
    const ABSENT_PAD_CAP = 8000;
    const canPad = eligibleUsers.length * days.length <= ABSENT_PAD_CAP;
    const single = days.length === 1;
    const gaps: AttendanceRecord[] = [];
    if (canPad) {
      const now = Date.now();
      for (const u of eligibleUsers) {
        for (const day of days) {
          if (covered.has(`${u.id}|${day}`)) continue;
          const g = gapStatus(day, rules, now);
          // Future days are not gaps. A rest day is only worth a row when it IS the day being looked at.
          if (!g || (g === 'week_off' && !single)) continue;
          gaps.push({
            id: null as any,
            user_id: u.id,
            date: day,
            status: g,
            checkin_at: undefined, checkout_at: undefined, total_hours: undefined,
            users: { name: u.name, employee_id: u.employee_id, zones: u.zones, role: u.role },
            _virtual: true,
          });
        }
      }
    }
    return { records: [...base, ...gaps], absentPaddingSkipped: !canPad };
  }, [base, users, fromDate, toDate, rules]);

  /* helper — merge a saved record back into the list, or prepend if new */
  const mergeRecord = (saved: AttendanceRecord) => {
    setBase(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  /* ── CREATE (admin override) ── */
  const handleCreate = async () => {
    if (!form.user_id || !form.date || !form.status) { setFErr('Executive, date and status are required.'); return; }
    setSaving(true); setFErr('');
    try {
      const res = await api.post<any>('/api/v1/attendance/override', {
        user_id:              form.user_id,
        date:                 form.date,
        status:               form.status,
        checkin_at:           form.checkin_at  ? `${form.checkin_date || form.date}T${form.checkin_at}:00` : undefined,
        checkin_selfie_url:   form.checkin_selfie_url  || undefined,
        checkout_at:          form.checkout_at ? `${form.checkout_date || form.date}T${form.checkout_at}:00` : undefined,
        checkout_selfie_url:  form.checkout_selfie_url || undefined,
        override_reason:      form.override_reason.trim() || 'Manual override by admin',
        checkin_lat:          form.checkin_lat  ? parseFloat(form.checkin_lat)  : undefined,
        checkin_lng:          form.checkin_lng  ? parseFloat(form.checkin_lng)  : undefined,
        checkout_lat:         form.checkout_lat ? parseFloat(form.checkout_lat) : undefined,
        checkout_lng:         form.checkout_lng ? parseFloat(form.checkout_lng) : undefined,
        notes:                form.notes || undefined,
      });
      // Enrich saved record with user info so it renders correctly in the table
      const saved = res?.data?.data ?? res?.data ?? res;
      if (saved?.id) {
        const u = users.find(u => u.id === saved.user_id);
        if (u && !saved.users) saved.users = { name: u.name, employee_id: u.employee_id, zones: u.zones };
        mergeRecord(saved);
      }
      // If the overridden date differs from the current date filter, switch to it so the row is visible
      if (form.date !== fromDate) setFrom(form.date);
      setShowAdd(false); setForm(BLANK);
    } catch (e: any) { setFErr(e.message || 'Failed to create record'); }
    finally { setSaving(false); }
  };

  /* ── UPDATE ── */
  const openEdit = (r: AttendanceRecord) => {
    const ciDate = r.checkin_at  ? new Date(r.checkin_at).toISOString().split('T')[0]  : r.date;
    const coDate = r.checkout_at ? new Date(r.checkout_at).toISOString().split('T')[0] : r.date;
    const f = {
      user_id:              r.user_id,
      date:                 r.date,
      status:               r.status,
      checkin_date:         ciDate,
      checkin_at:           r.checkin_at  ? new Date(r.checkin_at).toTimeString().slice(0,5)  : '',
      checkin_selfie_url:   r.checkin_selfie_url  || '',
      checkout_date:        coDate,
      checkout_at:          r.checkout_at ? new Date(r.checkout_at).toTimeString().slice(0,5) : '',
      checkout_selfie_url:  r.checkout_selfie_url || '',
      override_reason:      r.override_reason || '',
      checkin_lat:          r.checkin_lat  != null ? String(r.checkin_lat)  : '',
      checkin_lng:          r.checkin_lng  != null ? String(r.checkin_lng)  : '',
      checkout_lat:         r.checkout_lat != null ? String(r.checkout_lat) : '',
      checkout_lng:         r.checkout_lng != null ? String(r.checkout_lng) : '',
      notes:                r.notes || '',
    };
    setForm(f);
    setFErr('');
    // Virtual row (absent user, no DB record) → use Add modal which calls POST /override
    if ((r as any)._virtual || !r.id) {
      setShowAdd(true);
    } else {
      setEditRec(r);
    }
  };
  const handleUpdate = async () => {
    if (!editRec) return;
    setSaving(true); setFErr('');
    try {
      const res = await api.patch<any>(`/api/v1/attendance/${editRec.id}/override`, {
        status:               form.status,
        checkin_at:           form.checkin_at  ? `${form.checkin_date  || editRec.date}T${form.checkin_at}:00`  : undefined,
        checkin_selfie_url:   form.checkin_selfie_url  || undefined,
        checkout_at:          form.checkout_at ? `${form.checkout_date || editRec.date}T${form.checkout_at}:00` : undefined,
        checkout_selfie_url:  form.checkout_selfie_url || undefined,
        override_reason:      form.override_reason.trim() || 'Manual override by admin',
        checkin_lat:          form.checkin_lat  ? parseFloat(form.checkin_lat)  : undefined,
        checkin_lng:          form.checkin_lng  ? parseFloat(form.checkin_lng)  : undefined,
        checkout_lat:         form.checkout_lat ? parseFloat(form.checkout_lat) : undefined,
        checkout_lng:         form.checkout_lng ? parseFloat(form.checkout_lng) : undefined,
        notes:                form.notes || undefined,
      });
      const saved = res?.data?.data ?? res?.data ?? res;
      if (saved?.id) {
        const u = users.find(u => u.id === saved.user_id);
        if (u && !saved.users) saved.users = { name: u.name, employee_id: u.employee_id, zones: u.zones };
        mergeRecord(saved);
        // Update detail panel if it's open for this record
        setDetail(d => d?.id === saved.id ? saved : d);
      }
      setEditRec(null);
    } catch (e: any) { setFErr(e.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  /* ── DELETE ── */
  // "Mark absent": the same override endpoint as Edit (PATCH /:id/override). The old call POSTed to
  // /:id/override, which does not exist, so the button always failed. A day with no record is already absent.
  const handleDelete = async () => {
    if (!delRec?.id) { setDelRec(null); return; }
    setSaving(true);
    try {
      await api.patch(`/api/v1/attendance/${delRec.id}/override`, {
        status: 'absent',
        override_reason: 'Marked absent by admin',
      });
      setDelRec(null); setDetail(null); load({ silent: true });
    } catch (e: any) { setDelRec(null); setErr(e?.message || 'Could not mark this record absent'); }
    finally { setSaving(false); }
  };

  /* ══════════════════════════════════════════════════════
     EXPORT LOGIC
     Midnight crossover: if checkout_at < checkin_at on same
     date record, the shift crossed midnight — add 24h to
     checkout before diffing. Cap at 24h to avoid bad data.
  ═════════════════════════════════════════════════════════ */
  const calcHours = (rec: AttendanceRecord): number | null => {
    if (rec.total_hours != null) return rec.total_hours;
    const ci = parseDate(rec.checkin_at);
    if (ci == null) return null;

    // Fallback to current time if checked_in but not yet checked_out
    let coStr = rec.checkout_at;
    if (!coStr && rec.status === 'checked_in') coStr = new Date().toISOString();

    const co = parseDate(coStr);
    if (co == null) return null;

    // Midnight crossover: checkout is earlier than checkin
    let durationMs = co - ci;
    if (co < ci) durationMs += 24 * 60 * 60 * 1000;

    const h = durationMs / 3_600_000 - (rec.break_minutes || 0) / 60;
    return Math.min(Math.max(h, 0), 24);
  };

  const classifyDay = (rec: AttendanceRecord): 'Present' | 'Half Day' | 'Absent' | 'Checked In' | 'On Leave' => {
    if (rec.status === 'on_leave') return 'On Leave';
    if (rec.status === 'absent') return 'Absent';
    if (rec.status === 'half_day') return 'Half Day';
    // A shift that is still running has not got its hours yet — 2 h in at 11:30 is not a half day.
    if (rec.status === 'checked_in' || rec.status === 'on_break') return 'Checked In';
    const h = calcHours(rec);
    if (h != null && h < 4) return 'Half Day';
    return 'Present';
  };

  const runExport = async () => {
    setExpLoading(true); setExpErr('');
    try {
      // Gather all dates in range
      const dates: string[] = [];
      const cur = new Date(expFrom);
      const end = new Date(expTo);
      while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
      if (dates.length > 62) { setExpErr('Date range too large. Please select up to 62 days.'); setExpLoading(false); return; }

      // Fetch attendance for each date (batch, not parallel flood)
      const allRecords: (AttendanceRecord & { _date: string })[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const chunk = dates.slice(i, i + 7);
        const results = await Promise.all(
          // The /attendance/team endpoint filters by a `from`/`to` date RANGE and has
          // no `date` param — passing `date=` was silently ignored, so every day's
          // request fell back to today's data (parseAppDate(undefined) → dbToday()).
          // That made the export repeat today's single record across the whole range
          // (identical check-in time and hours on every row). Scope each fetch to the
          // one day with from=to=d, which the backend honors.
          chunk.map(d => api.get<any>(`/api/v1/attendance/team?from=${d}&to=${d}`))
        );
        chunk.forEach((d, idx) => {
          const pick = (r: any): any[] => {
            if (Array.isArray(r)) return r;
            if (Array.isArray(r?.data)) return r.data;
            if (Array.isArray(r?.data?.data)) return r.data.data;
            return [];
          };
          const recs = pick(results[idx]);
          recs.forEach((r: any) => {
            // Enrich with user info
            const u = users.find(u => u.id === r.user_id);
            const enriched = r.users?.name ? r : { ...r, users: u ? { name: u.name, employee_id: u.employee_id, zones: u.zones, role: (u as any).role, city: (u as any).city } : r.users };
            allRecords.push({ ...enriched, _date: d });
          });
        });
      }

      if (!allRecords.length) { setExpErr('No attendance data found for the selected range.'); setExpLoading(false); return; }

      generateExcel(allRecords, dates);
    } catch (e: any) {
      setExpErr(e.message || 'Export failed');
    } finally { setExpLoading(false); }
  };

  const generateExcel = (records: (AttendanceRecord & { _date: string })[], dates: string[]) => {
    // Build user summary map
    interface UserSummary {
      name: string; employee_id: string; role: string;
      city: string; zone: string; supervisor: string;
      records: (AttendanceRecord & { _date: string })[];
      totalDays: number; presentDays: number; halfDays: number;
      absentDays: number; onLeaveDays: number; totalHours: number; avgHoursPerDay: number;
    }
    const userMap: Record<string, UserSummary> = {};
    records.forEach(r => {
      const uid = r.user_id;
      if (!userMap[uid]) {
        const u = users.find(u => u.id === uid);
        userMap[uid] = {
          name: r.users?.name || u?.name || uid,
          employee_id: r.users?.employee_id || (u as any)?.employee_id || '',
          role: (r.users as any)?.role || (u as any)?.role || '',
          city: (r.users as any)?.city || (u as any)?.city || r.users?.zones?.name || '',
          zone: r.users?.zones?.name || (u as any)?.zones?.name || '',
          supervisor: (u as any)?.supervisors?.name || '',
          records: [],
          totalDays: 0, presentDays: 0, halfDays: 0, absentDays: 0, onLeaveDays: 0, totalHours: 0, avgHoursPerDay: 0,
        };
      }
      userMap[uid].records.push(r);
    });

    // Compute stats per user
    Object.values(userMap).forEach(u => {
      u.totalDays    = dates.length;
      u.presentDays  = u.records.filter(r => classifyDay(r) === 'Present' || classifyDay(r) === 'Checked In').length;
      u.halfDays     = u.records.filter(r => classifyDay(r) === 'Half Day').length;
      u.onLeaveDays  = u.records.filter(r => classifyDay(r) === 'On Leave').length;
      // Approved leave is neither present nor absent — exclude it from absent.
      u.absentDays   = Math.max(0, dates.length - u.presentDays - u.halfDays - u.onLeaveDays);
      u.totalHours   = u.records.reduce((acc, r) => acc + (calcHours(r) || 0), 0);
      u.avgHoursPerDay = u.presentDays > 0 ? u.totalHours / u.presentDays : 0;
    });

    const allUsers = Object.values(userMap).sort((a, b) => a.name.localeCompare(b.name));
    // ── Excel 2003 SpreadsheetML (.xls) so the file opens with real worksheet
    //    tabs — a Summary sheet and a Details sheet — without pulling in a heavy
    //    xlsx dependency. The Details sheet carries the selfie image links as
    //    clickable hyperlinks. ──
    const xesc = (v: any) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const strCell = (v: any) => `<Cell><Data ss:Type="String">${xesc(v)}</Data></Cell>`;
    const numCell = (v: number) => `<Cell><Data ss:Type="Number">${Number.isFinite(v) ? v : 0}</Data></Cell>`;
    const hdrCell = (v: any) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xesc(v)}</Data></Cell>`;
    // A clickable hyperlink cell (the URL both shows and links); "—" when absent.
    const linkCell = (url?: string) => url
      ? `<Cell ss:HRef="${xesc(url)}"><Data ss:Type="String">${xesc(url)}</Data></Cell>`
      : strCell('—');
    const row = (cells: string[]) => `<Row>${cells.join('')}</Row>`;
    const sheet = (name: string, header: string[], bodyRows: string[]) =>
      `<Worksheet ss:Name="${xesc(name)}"><Table>${row(header.map(hdrCell))}${bodyRows.join('')}</Table></Worksheet>`;

    const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

    // ══ SHEET 1: per-person summary ══
    const summarySheet = sheet(
      'Summary',
      ['Name', 'Present', 'Half Days', 'On Leave', 'Absent', 'Total Hours'],
      allUsers.map(u => row([
        strCell(u.name), numCell(u.presentDays), numCell(u.halfDays),
        numCell(u.onLeaveDays), numCell(u.absentDays), strCell(fmtHrs(u.totalHours)),
      ])),
    );

    // ══ SHEET 2: one row per person per day, with total hours and selfie links ══
    const detailSheet = sheet(
      'Details',
      ['Date', 'Name', 'Check-in', 'Check-out', 'Total Hours', 'Status', 'Check-in Image', 'Check-out Image'],
      [...records]
        .sort((a, b) => a._date.localeCompare(b._date) || (a.users?.name || '').localeCompare(b.users?.name || ''))
        .map(r => row([
          strCell(r._date), strCell(r.users?.name || ''),
          strCell(fmtTime(r.checkin_at)), strCell(fmtTime(r.checkout_at)),
          strCell(fmtHrs(calcHours(r))), strCell(classifyDay(r)),
          linkCell(r.checkin_selfie_url), linkCell(r.checkout_selfie_url),
        ])),
    );

    const workbook =
      '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/></Style></Styles>' +
      summarySheet + detailSheet +
      '</Workbook>';

    const filename = `kinematic_attendance_${expFrom}_to_${expTo}.xls`;
    const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  /* 1. current Role records */
  const EXEC_ROLES = new Set(['executive', 'field_executive', 'field-executive', 'field_exec']);
  const SUP_ROLES  = new Set(['supervisor', 'city_manager']);
  // ByteBack-style tenants keep everyone on the 'sub_admin' preset and distinguish
  // field execs vs managers by their org-role data_scope ('own' = field exec,
  // 'team'/'all' = manager). Without this, a rep's real check-in record matched
  // neither tab's preset-role set and was dropped from both → blank attendance.
  const scopeById: Record<string, string> = {};
  users.forEach((u: any) => {
    const rel = Array.isArray(u.org_role) ? u.org_role[0] : u.org_role;
    if (rel?.data_scope) scopeById[u.id] = String(rel.data_scope).toLowerCase();
  });
  const currentRoleRecords = records.filter(r => {
    const role = (r.users?.role || '').toLowerCase();
    const ds = scopeById[r.user_id];
    const isExec = EXEC_ROLES.has(role) || ds === 'own';
    const isSup  = SUP_ROLES.has(role) || ds === 'team' || ds === 'all';
    return roleFilter === 'executive' ? isExec : isSup;
  });

  /* 2. stats calculation */
  const count = (st: AttendanceRecord['status']) => currentRoleRecords.filter(r => r.status === st).length;
  const stats = {
    total:    currentRoleRecords.length,
    in:       count('checked_in'),
    out:      count('checked_out'),
    onBreak:  count('on_break'),
    absent:   count('absent'),
    half:     count('half_day'),
    onLeave:  count('on_leave'),
    notYet:   count('not_yet'),
    weekOff:  count('week_off'),
    late:     currentRoleRecords.filter(r => r.late?.is_late).length,
  };
  // The Late tile / filter exist only for clients whose records carry the API's `late` verdict.
  const lateConfigured = currentRoleRecords.some(r => !!r.late);
  // Each tile is also a filter: `f` is the value it sets on the status filter ('all' for Total).
  const statTiles: Array<{ l: string; v: number; c: string | undefined; f: string }> = [
    { l: 'Total',       v: stats.total,   c: undefined, f: 'all' },
    { l: 'Checked in',  v: stats.in,      c: T.ok,      f: 'checked_in' },
    ...(stats.onBreak > 0 ? [{ l: 'On break', v: stats.onBreak, c: T.warn, f: 'on_break' }] : []),
    { l: 'Checked out', v: stats.out,     c: T.info,    f: 'checked_out' },
    { l: 'On leave',    v: stats.onLeave, c: T.mute,    f: 'on_leave' },
    ...(stats.notYet > 0 ? [{ l: 'Not in yet', v: stats.notYet, c: T.mute, f: 'not_yet' }] : []),
    ...(stats.weekOff > 0 ? [{ l: 'Week off', v: stats.weekOff, c: T.mute, f: 'week_off' }] : []),
    { l: 'Absent',      v: stats.absent,  c: T.red,     f: 'absent' },
    { l: 'Half day',    v: stats.half,    c: T.warn,    f: 'half_day' },
    ...(lateConfigured ? [{ l: 'Late', v: stats.late, c: T.warn, f: 'late' }] : []),
  ];

  /* 3. final shown list */
  // A 'late' filter only means something while the records carry the API's late verdict.
  const effectiveStatus = statusFilter === 'late' && !lateConfigured ? 'all' : statusFilter;
  const filtered = currentRoleRecords.filter(r => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (r.users?.name || '').toLowerCase().includes(s) ||
      (r.users?.employee_id || '').toLowerCase().includes(s) ||
      (r.users?.zones?.name || '').toLowerCase().includes(s);

    const matchStatus = effectiveStatus === 'all' || (effectiveStatus === 'late' ? !!r.late?.is_late : r.status === effectiveStatus);
    return matchSearch && matchStatus;
  });

  // Column sort — ascending, then descending, then back to the natural order. Empty values always sort last.
  const toggleSort = (key: string) =>
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }));
  const shown = (() => {
    if (!sort.key) return filtered;
    const key = sort.key;
    const mul = sort.dir === 'asc' ? 1 : -1;
    const val = (r: AttendanceRecord): string | number | null => {
      switch (key) {
        case 'name': return (r.users?.name || '').toLowerCase() || null;
        case 'date': return r.date || null;
        case 'status': return statusOrder[r.status] ?? 99;
        case 'in': return parseDate(r.checkin_at);
        case 'hours': return calcHours(r);
        default: return null;
      }
    };
    return filtered
      .map((r, i) => [r, i, val(r)] as const)
      .sort((x, y) => {
        const p = x[2], q = y[2];
        if (p == null || q == null) return p == null && q == null ? x[1] - y[1] : p == null ? 1 : -1;
        const c = typeof p === 'string' ? p.localeCompare(String(q)) : p - (q as number);
        return c !== 0 ? c * mul : x[1] - y[1];
      })
      .map(([r]) => r);
  })();

  // Render cap: the table is unvirtualized, so painting tens of thousands of rows
  // locks the tab. Bound the DOM to a slice; the count line shows the true total
  // and tells the user to refine filters or export for the rest.
  const RENDER_CAP = 500;
  const shownCapped = shown.length > RENDER_CAP ? shown.slice(0, RENDER_CAP) : shown;

  const isRange = fromDate.trim() !== toDate.trim();
  const rangeLabel = isRange ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}` : fmtDate(fromDate);

  const today = istTodayYmd();
  // Step the range back / forward by its own length (a day → the previous day, a week → the previous week), never past today.
  const shiftRange = (dir: -1 | 1) => {
    const f = fromDate.trim();
    const t = toDate.trim();
    const len = eachDay(f, t).length || 1;
    let nf = addDaysYmd(f, dir * len);
    let nt = addDaysYmd(t, dir * len);
    if (nt > today) { nt = today; nf = addDaysYmd(today, -(len - 1)); }
    setFrom(nf);
    setTo(nt);
  };

  // One person's days for the month of the record (month-to-date for the current month).
  const openPerson = (r: AttendanceRecord) => {
    const day = r.date || toISTDate(r.checkin_at) || today;
    const month = day.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    setDetail(null);
    setPersonView({ userId: r.user_id, name: r.users?.name || r.user_id.slice(0, 8), from: `${month}-01`, to: monthEnd > today ? today : monthEnd });
  };

  /* ── selfie field (label + url input + upload button + preview) ── */
  const selfieField = (field: 'checkin_selfie_url' | 'checkout_selfie_url', label: string) => {
    const which = field === 'checkin_selfie_url' ? 'checkin' : 'checkout';
    return (
      <Field label={label} style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input type="url" placeholder="Paste a URL or upload" value={form[field]} onChange={e => setF(field, e.target.value)} style={{ flex: 1 }} />
          <label style={{ flexShrink: 0 }}>
            <span className="km-btn" data-variant="secondary" style={{ height: 36, padding: '0 12px', borderRadius: 6, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {uploading === which ? <Spinner /> : <Upload size={15} strokeWidth={1.6} />}
              {uploading === which ? 'Uploading…' : 'Upload'}
            </span>
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadSelfie(field, f); e.target.value = ''; }} />
          </label>
        </div>
        {form[field] && (
          <div style={{ position: 'relative', marginTop: 4 }}>
            <SignedImage src={form[field]} alt={`${label} preview`}
              style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <IconButton label="Remove selfie" onClick={() => setF(field, '')} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, background: T.card, border: `1px solid ${T.border}` }}>
              <X size={14} strokeWidth={1.8} />
            </IconButton>
          </div>
        )}
      </Field>
    );
  };

  /* ── inline form fields (NOT a component — avoids remount-on-render bug) ── */
  const sharedFormFields = (
    <>
      {/* Date + Status */}
      <Section eyebrow="Record" hint="Attendance date and the status to record." first={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <Field label="Attendance date" required>
            <Input type="date" value={form.date} onChange={e => setF('date', e.target.value)} readOnly={!!editRec} disabled={!!editRec} />
          </Field>
          <Field label="Status" required>
            <Select value={form.status} onChange={e => setF('status', e.target.value)}>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              <option value="on_leave">On leave</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half day</option>
            </Select>
          </Field>
        </div>
      </Section>

      {/* Check-in section */}
      <Section eyebrow="Check-in" hint="When and where the shift started.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <Field label="Check-in date">
            <Input type="date" value={form.checkin_date} onChange={e => setF('checkin_date', e.target.value)} />
          </Field>
          <Field label="Check-in time">
            <Input type="time" value={form.checkin_at} onChange={e => setF('checkin_at', e.target.value)} />
          </Field>
          {selfieField('checkin_selfie_url', 'Check-in selfie')}
          <Field label="Latitude" hint="Optional">
            <Input type="number" step="any" placeholder="19.0760" value={form.checkin_lat} onChange={e => setF('checkin_lat', e.target.value)} style={{ fontFamily: T.mono, fontSize: 13 }} />
          </Field>
          <Field label="Longitude" hint="Optional">
            <Input type="number" step="any" placeholder="72.8777" value={form.checkin_lng} onChange={e => setF('checkin_lng', e.target.value)} style={{ fontFamily: T.mono, fontSize: 13 }} />
          </Field>
        </div>
      </Section>

      {/* Check-out section */}
      <Section eyebrow="Check-out" hint="When and where the shift ended.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <Field label="Check-out date">
            <Input type="date" value={form.checkout_date} onChange={e => setF('checkout_date', e.target.value)} />
          </Field>
          <Field label="Check-out time">
            <Input type="time" value={form.checkout_at} onChange={e => setF('checkout_at', e.target.value)} />
          </Field>
          {selfieField('checkout_selfie_url', 'Check-out selfie')}
          <Field label="Latitude" hint="Optional">
            <Input type="number" step="any" placeholder="19.0760" value={form.checkout_lat} onChange={e => setF('checkout_lat', e.target.value)} style={{ fontFamily: T.mono, fontSize: 13 }} />
          </Field>
          <Field label="Longitude" hint="Optional">
            <Input type="number" step="any" placeholder="72.8777" value={form.checkout_lng} onChange={e => setF('checkout_lng', e.target.value)} style={{ fontFamily: T.mono, fontSize: 13 }} />
          </Field>
        </div>
      </Section>

      {/* Notes + Reason */}
      <Section eyebrow="Notes" hint="Why this record is being set by hand." style={{ paddingBottom: 0 }}>
        <Field label="Notes" hint="Optional">
          <Input type="text" placeholder="Any notes for this record" value={form.notes} onChange={e => setF('notes', e.target.value)} />
        </Field>
        <Field label="Override reason" hint='If left blank, "Manual override by admin" will be recorded.'>
          <Textarea rows={2} placeholder="Why is this being set manually? (optional)" value={form.override_reason} onChange={e => setF('override_reason', e.target.value)} style={{ minHeight: 64 }} />
        </Field>
      </Section>
    </>
  );

  const errorBox = (msg: string) => (
    <div role="alert" style={{ background: T.redWash, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.red, marginBottom: 16 }}>{msg}</div>
  );

  /* ══════════════════════════ RENDER ══════════════════════════ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes kspin { to { transform: rotate(360deg); } }
        @keyframes kfade { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      ` }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'kfade .3s ease' }}>
        <PageHeader
          title="Attendance"
          description={view === 'monthly'
            ? <>Per-employee month totals — present, late, half-day, leave and absent.</>
            : <>Who&apos;s in, out, on leave or absent for <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{rangeLabel}</span> — updates live every 15 s.</>}
          actions={
            <>
              <IconButton label="Refresh" onClick={async () => { setRefreshing(true); try { await load({ silent: true, refreshUsers: true }); } finally { setRefreshing(false); } }}><RefreshCw size={16} strokeWidth={1.6} style={loading || refreshing ? { animation: 'kspin 1s linear infinite' } : undefined} /></IconButton>
              <Button onClick={() => { setExpErr(''); setShowExport(true); }} icon={<Download size={16} strokeWidth={1.6} />}>Export</Button>
              <Button variant="primary" onClick={() => { setForm(BLANK); setFErr(''); setShowAdd(true); }} icon={<Plus size={16} strokeWidth={1.8} />}>Add override</Button>
            </>
          }
          compact={narrow}
        />

        {/* error banner */}
        {err && (
          <div role="alert" style={{ background: T.redWash, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: T.red, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{err}</span>
            <IconButton label="Dismiss" onClick={() => setErr('')} style={{ color: T.red, width: 26, height: 26 }}><X size={14} strokeWidth={1.8} /></IconButton>
          </div>
        )}

        {/* ── view switch: live daily records vs month totals ── */}
        <div>
          <Segmented
            value={view}
            onChange={setView}
            options={[{ value: 'daily', label: 'Daily records' }, { value: 'monthly', label: 'Monthly summary' }]}
          />
        </div>

        {view === 'monthly' && <MonthlySummary clientId={selectedClientId} onOpenPerson={setPersonView} />}

        {view === 'daily' && (<>
        {/* ── stat tiles — each one is also a filter: press it to narrow the list, press again to clear ── */}
        {/* Flex rather than grid: the app's phone stylesheet collapses any inline `grid-template-columns` to one column. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {statTiles.map(s => {
            const on = s.f !== 'all' && effectiveStatus === s.f;
            const accent = s.c ?? T.text;
            return (
              <div
                key={s.l}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                title={s.f === 'all' ? undefined : on ? 'Show everyone again' : `Show ${s.l.toLowerCase()} only`}
                onClick={() => { if (s.f !== 'all') setSF(on ? 'all' : s.f); else setSF('all'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSF(on || s.f === 'all' ? 'all' : s.f); } }}
                className="att-tile"
                style={{ ...cardStyle, padding: 16, flex: `1 1 ${phone ? 'calc(50% - 6px)' : narrow ? 'calc(33.333% - 8px)' : '0'}`, minWidth: phone ? 0 : 96, cursor: 'pointer', borderColor: on ? accent : T.border, boxShadow: on ? `0 0 0 1px ${accent}` : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.c && <span style={{ width: 6, height: 6, borderRadius: 999, background: s.c, flexShrink: 0 }} />}
                  <Eyebrow>{s.l}</Eyebrow>
                </div>
                <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              </div>
            );
          })}
        </div>

        {/* ── Attendance Analysis ── the same people the tiles count (the active role tab) ── */}
        {(() => {
          // A rest day, or someone who is not due in yet, is not part of the rate.
          const rows = currentRoleRecords.filter(r => r.status !== 'week_off' && r.status !== 'not_yet');
          if (rows.length === 0) return null;
          // Approved leave is excluded from the attendance-rate denominator.
          const onLeave = rows.filter(r => classifyDay(r) === 'On Leave').length;
          const total = rows.length - onLeave;
          const presentRows = rows.filter(r => { const d = classifyDay(r); return d === 'Present' || d === 'Checked In'; });
          const present = presentRows.length;
          const hoursArr = rows.map(r => calcHours(r)).filter((h): h is number => h != null);
          const totalHours = hoursArr.reduce((a, b) => a + b, 0);
          const avgHours = hoursArr.length ? totalHours / hoursArr.length : 0;
          // On-time is a share of the people who were present, so it can never pass 100%.
          const onTime = presentRows.filter(r => {
            if (!r.checkin_at) return false;
            // The API's verdict (against this client's shift rules) wins when the record carries one…
            if (r.late) return !r.late.is_late;
            // …otherwise the legacy fixed 09:30 cut-off, judged on the IST clock (not the viewer's browser zone).
            const ms = parseDate(r.checkin_at);
            return ms != null && istMinutesOfDay(ms) <= 9 * 60 + 30;
          }).length;
          const attendanceRate = total ? Math.round((present / total) * 100) : 0;
          const onTimePct = present ? Math.round((onTime / present) * 100) : 0;
          const fmtH = (h: number) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
          const metrics = [
            { l: 'Attendance rate',   v: `${attendanceRate}%` },
            { l: 'Avg hours / day',   v: fmtH(avgHours) },
            { l: 'On-time check-ins', v: `${onTimePct}%` },
            { l: 'Total hours',       v: fmtH(totalHours) },
          ];
          return (
            <Card padding={16}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>Attendance analysis</div>
                <div style={{ fontSize: 12.5, color: T.dim }}>For the {roleFilter === 'executive' ? 'field executives' : 'supervisors'} on this list, {rangeLabel}; approved leave is excluded from the rate.</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {metrics.map(m => (
                  <div key={m.l} style={{ background: T.raised, borderRadius: 8, padding: '12px 14px', flex: `1 1 ${narrow ? 'calc(50% - 6px)' : '0'}`, minWidth: 0 }}>
                    <Eyebrow>{m.l}</Eyebrow>
                    <div style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ── toolbar ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={roleFilter}
            onChange={setRoleFilter}
            options={[{ value: 'executive', label: 'Field executives' }, { value: 'supervisor', label: 'Supervisors' }]}
          />
          {/* Day navigation: step back / forward by the length of the range on screen (a day, a week…), never into the future. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconButton label={isRange ? 'Previous period' : 'Previous day'} onClick={() => shiftRange(-1)} style={{ border: `1px solid ${T.border}`, background: T.card, height: 36, width: 36 }}>
              <ChevronLeft size={16} strokeWidth={1.8} />
            </IconButton>
            <DateRangePicker from={fromDate} to={toDate} onChange={(f,t) => { setFrom(f); setTo(t); }} />
            <IconButton label={isRange ? 'Next period' : 'Next day'} onClick={() => shiftRange(1)} disabled={toDate.trim() >= today} style={{ border: `1px solid ${T.border}`, background: T.card, height: 36, width: 36, opacity: toDate.trim() >= today ? 0.4 : 1, cursor: toDate.trim() >= today ? 'not-allowed' : 'pointer' }}>
              <ChevronRight size={16} strokeWidth={1.8} />
            </IconButton>
            {(fromDate.trim() !== today || toDate.trim() !== today) && (
              <Button size="sm" aria-label="Jump to today" onClick={() => { setFrom(today); setTo(today); }} style={{ height: 36 }}>Today</Button>
            )}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: narrow ? '100%' : 220 }}>
            <Search size={15} strokeWidth={1.6} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID or zone…" style={{ paddingLeft: 34 }} aria-label="Search attendance" />
          </div>
          <div style={{ width: narrow ? '100%' : 170 }}>
            <Select value={effectiveStatus} onChange={e => setSF(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              {stats.onBreak > 0 && <option value="on_break">On break</option>}
              <option value="on_leave">On leave</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half day</option>
              {stats.notYet > 0 && <option value="not_yet">Not in yet</option>}
              {stats.weekOff > 0 && <option value="week_off">Week off</option>}
              {lateConfigured && <option value="late">Late</option>}
            </Select>
          </div>
          <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute, whiteSpace: 'nowrap' }}>
            {shown.length} / {currentRoleRecords.length}
          </span>
        </div>

        {/* ── table ── (cards on a phone: see .responsive-cards in globals.css) ── */}
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="responsive-cards" style={{ width: '100%', borderCollapse: 'collapse', minWidth: phone ? 0 : isRange ? 980 : 880 }}>
              <thead>
                <tr>
                  <th style={th}><SortLabel label="Executive" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
                  {isRange && <th style={th}><SortLabel label="Date" sortKey="date" sort={sort} onToggle={toggleSort} /></th>}
                  <th style={th}><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggleSort} /></th>
                  <th style={th}>Selfie</th>
                  <th style={th}><SortLabel label="Check-in" sortKey="in" sort={sort} onToggle={toggleSort} /></th>
                  <th style={th}>Check-out</th>
                  <th style={{ ...th, textAlign: 'right' }}><SortLabel label="Hours" sortKey="hours" sort={sort} onToggle={toggleSort} align="right" /></th>
                  <th style={th}>Zone</th>
                  <th style={{ ...th, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ ...td, borderBottom: 0, padding: 0 }}>
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--s3)' }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ height: 10, width: `${35 + (i * 13) % 30}%`, borderRadius: 5, background: 'var(--s3)' }} />
                            <div style={{ height: 8, width: `${20 + (i * 17) % 25}%`, borderRadius: 4, background: 'var(--s3)', opacity: 0.7 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </td></tr>
                ) : shown.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, borderBottom: 0, padding: 0 }}>
                    <EmptyState
                      icon={<CalendarDays size={20} strokeWidth={1.6} />}
                      title={currentRoleRecords.length === 0 ? `No attendance records for ${rangeLabel}` : 'No results match your filters'}
                      description={currentRoleRecords.length === 0 ? 'Records appear here as soon as the team checks in from the app.' : 'Try another status or clear the search.'}
                      action={currentRoleRecords.length > 0 ? <Button size="sm" onClick={() => { setSearch(''); setSF('all'); }}>Clear filters</Button> : undefined}
                    />
                  </td></tr>
                ) : shownCapped.map((r, i) => {
                  const sm = statusMeta[r.status] || statusMeta.absent;
                  const last = i === shownCapped.length - 1;
                  const rail = statusRail[r.status];
                  const rowTd = last ? { ...td, borderBottom: 0 } : td;
                  const rowMono = last ? { ...tdMono, borderBottom: 0 } : tdMono;
                  const hrs = calcHours(r);
                  const quiet = r.status === 'not_yet' || r.status === 'week_off';
                  return (
                    <tr
                      key={r.id || `${r.user_id}_${r.date || r.checkin_at || i}`}
                      data-clickable="true"
                      tabIndex={0}
                      onClick={() => setDetail(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetail(r); }}
                      style={{ opacity: quiet ? 0.78 : 1 }}
                    >
                      {/* name — the left edge carries the status colour so a long list reads at a glance */}
                      <td data-label="" style={{ ...rowTd, boxShadow: rail ? `inset 3px 0 0 ${rail}` : undefined }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                          <Avatar name={r.users?.name || '?'} size={32} />
                          <div style={{ overflow: 'hidden', minWidth: 0 }}>
                            <div data-testid="att-name" style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{r.users?.name || r.user_id.slice(0, 8)}</div>
                            <div style={{ fontSize: 12, color: T.mute, marginTop: 1, textTransform: 'capitalize' }}>{(r.users?.role || '').replace(/[_-]/g, ' ')}{r.users?.employee_id ? <> · <span style={{ fontFamily: T.mono }}>{r.users.employee_id}</span></> : null}</div>
                          </div>
                        </div>
                      </td>

                      {/* date if range */}
                      {isRange && (
                        <td data-label="Date" style={rowMono}>{fmtDate(r.date || toISTDate(r.checkin_at))}</td>
                      )}

                      {/* status */}
                      <td data-label="Status" style={rowTd}>
                        <Badge tone={sm.tone} dot>{sm.label}</Badge>
                      </td>

                      {/* selfie preview */}
                      <td data-label="Selfie" style={rowTd}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {/* Face-recognition verdict (module face_attendance). */}
                          {r.checkin_face_verified != null && (
                            <span title={r.checkin_face_score != null ? `On-device face match: ${Math.round(r.checkin_face_score * 100)}%` : (r.checkin_face_verified ? 'Face verified' : 'Face not matched')} style={{ display: 'inline-flex' }}>
                              <Badge tone={r.checkin_face_verified ? 'ok' : 'warn'}>{r.checkin_face_verified ? <><Check size={11} strokeWidth={2.4} /> Face</> : 'Face ?'}</Badge>
                            </span>
                          )}
                          {r.checkin_selfie_url ? (
                            <SelfieThumb src={r.checkin_selfie_url} alt="Check-in" tone="ok" />
                          ) : quiet ? <span style={{ color: T.mute }}>—</span> : <div style={{ width: 40, height: 40, borderRadius: 8, background: T.raised, border: `1px solid ${T.border}`, flexShrink: 0 }} />}
                          {r.checkout_selfie_url ? (
                            <SelfieThumb src={r.checkout_selfie_url} alt="Check-out" tone="info" />
                          ) : null}
                        </div>
                      </td>

                      {/* check-in */}
                      <td data-label="Check-in" style={{ ...rowMono, color: r.checkin_at ? T.text : T.mute }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {fmt(r.checkin_at)}
                          {r.late?.is_late && <Badge tone="warn">Late {r.late.minutes_late} min</Badge>}
                          {r.checkin_is_mock && (
                            <span title="A mock (spoofed) GPS location was detected at check-in" style={{ display: 'inline-flex' }}>
                              <Badge tone="red"><ShieldAlert size={11} strokeWidth={2} /> Mock GPS</Badge>
                            </span>
                          )}
                        </span>
                      </td>

                      {/* check-out */}
                      <td data-label="Check-out" style={{ ...rowMono, color: r.checkout_at ? T.text : T.mute }}>{fmt(r.checkout_at)}</td>

                      {/* hours */}
                      <td data-label="Hours" style={{ ...rowMono, textAlign: 'right', color: (r.total_hours || hrs) ? T.text : T.mute }}>
                        {fmtHrs(hrs)}
                        {r.break_minutes ? <div style={{ fontSize: 11, color: T.mute, marginTop: 1 }}>{r.break_minutes}m break</div> : null}
                      </td>

                      {/* zone */}
                      <td data-label="Zone" style={{ ...rowTd, color: T.dim, fontSize: 13 }}>{r.users?.zones?.name || '—'}</td>

                      {/* actions */}
                      <td data-label="" style={{ ...rowTd, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 2 }}>
                          <IconButton label="Edit" onClick={() => openEdit(r)}><Pencil size={15} strokeWidth={1.6} /></IconButton>
                          {/* A day with no record, or one already marked absent, has nothing to mark. */}
                          {r.id && r.status !== 'absent' && (
                            <IconButton label="Mark absent" onClick={() => setDelRec(r)} style={{ color: T.red }}><UserX size={15} strokeWidth={1.6} /></IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Absent-padding skipped on a very wide range (see load()). */}
        {!loading && absentPaddingSkipped && (
          <div style={{ fontSize: 12, color: T.mute, textAlign: 'right', lineHeight: 1.5 }}>
            Absent-day rows are hidden for a date range this wide — showing recorded attendance only.
            Use <b>Export to Excel</b> for a full per-day absentee report, or pick a shorter range.
          </div>
        )}

        {/* row count */}
        {!loading && shown.length > 0 && (
          <div style={{ fontSize: 12, color: T.mute, textAlign: 'right', fontFamily: T.mono }}>
            {shownCapped.length < shown.length
              ? `Showing first ${shownCapped.length} of ${shown.length} — refine filters or export for the full list`
              : `${shown.length} of ${currentRoleRecords.length} records`} · {rangeLabel}
          </div>
        )}
        </>)}
      </div>

      {/* ══════ ADD OVERRIDE MODAL ══════ */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Manual attendance"
        subtitle="Record an attendance session for an executive by hand."
        width={560}
        footer={
          <>
            <Button onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving} icon={saving ? <Spinner /> : undefined}>{saving ? 'Saving…' : 'Save override'}</Button>
          </>
        }
      >
        {fErr && errorBox(fErr)}
        <Section eyebrow="Executive" hint="Who this record is for." first>
          <Field label="Field executive" required>
            <Select value={form.user_id} onChange={e => setF('user_id', e.target.value)}>
              <option value="">Select executive…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.employee_id ? ` (${u.employee_id})` : ''}</option>)}
            </Select>
          </Field>
        </Section>
        {sharedFormFields}
      </Modal>

      {/* ══════ EDIT MODAL ══════ */}
      <Modal
        open={!!editRec}
        onClose={() => setEditRec(null)}
        title="Update record"
        subtitle={editRec ? `Modify attendance for ${editRec.users?.name || 'this executive'} · ${fmtDate(editRec.date)}` : undefined}
        width={560}
        footer={
          <>
            <Button onClick={() => setEditRec(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleUpdate} disabled={saving} icon={saving ? <Spinner /> : undefined}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        }
      >
        {fErr && errorBox(fErr)}
        <div style={{ marginTop: -22 }}>{sharedFormFields}</div>
      </Modal>

      {/* ══════ DETAIL MODAL ══════ */}
      <Modal
        open={!!detail && !editRec}
        onClose={() => setDetail(null)}
        title={detail?.users?.name || 'Attendance record'}
        subtitle={detail ? `${fmtDate(detail.date)} · ${detail.users?.zones?.name || 'No zone'}` : undefined}
        width={480}
        footer={detail ? (
          <>
            <Button onClick={() => openPerson(detail)} icon={<CalendarRange size={15} strokeWidth={1.6} />} style={{ marginRight: 'auto' }}>View month</Button>
            <Button onClick={() => { openEdit(detail); setDetail(null); }} icon={<Pencil size={15} strokeWidth={1.6} />}>Edit</Button>
            {/* A day with no record, or one already marked absent, has nothing to mark. */}
            {detail.id && detail.status !== 'absent' && (
              <Button variant="danger" onClick={() => { setDelRec(detail); setDetail(null); }} icon={<UserX size={15} strokeWidth={1.6} />}>Mark absent</Button>
            )}
          </>
        ) : undefined}
      >
        {detail && (() => {
          const sm = statusMeta[detail.status] || statusMeta.absent;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={detail.users?.name || '?'} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: T.dim }}>{(detail.users?.role || '').replace(/[_-]/g, ' ') || 'Executive'}{detail.users?.employee_id ? <> · <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{detail.users.employee_id}</span></> : null}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Badge tone={sm.tone} dot>{sm.label}</Badge>
                    {detail.late?.is_late && <Badge tone="warn">Late {detail.late.minutes_late} min</Badge>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { l: 'Check-in',  v: fmt(detail.checkin_at), wide: false },
                  { l: 'Check-out', v: fmt(detail.checkout_at), wide: false },
                  { l: 'Hours',     v: fmtHrs(calcHours(detail)), wide: false },
                  { l: 'Break',     v: detail.break_minutes ? `${detail.break_minutes}m` : '—', wide: false },
                  // Only when the rep was asked (client rule) and answered: nothing is added for everyone else.
                  ...((detail.transport_mode || detail.transport_label)
                    ? [{ l: 'Mode of transport', v: modeText(detail.transport_mode, detail.transport_label), wide: true }]
                    : []),
                ].map(r => (
                  <div key={r.l} data-testid={r.wide ? 'detail-mode' : undefined} style={{ background: T.raised, borderRadius: 8, padding: '10px 12px', gridColumn: r.wide ? '1 / -1' : undefined }}>
                    <Eyebrow>{r.l}</Eyebrow>
                    <div style={{ fontFamily: r.wide ? undefined : T.mono, fontSize: 14, color: T.text, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{r.v}</div>
                  </div>
                ))}
              </div>

              {/* Coordinates / Locations */}
              {(detail.checkin_lat || detail.checkout_lat) && (
                <div style={{ padding: 12, background: T.raised, borderRadius: 8 }}>
                  <Eyebrow style={{ marginBottom: 8 }}>Location</Eyebrow>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {detail.checkin_lat ? (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: T.dim, marginBottom: 2 }}>Check-in</div>
                        {/* A place name when the geocoder answers; the coordinates until then (it never blocks the modal). */}
                        <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <PlaceText at={{ lat: detail.checkin_lat, lng: detail.checkin_lng ?? 0 }} eager={false} />
                          <a href={`https://maps.google.com/?q=${detail.checkin_lat},${detail.checkin_lng}`} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open check-in location in Google Maps" style={{ color: T.info, display: 'inline-flex', marginTop: 2 }}><ExternalLink size={12} strokeWidth={1.8} /></a>
                        </div>
                      </div>
                    ) : <div />}
                    {detail.checkout_lat ? (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: T.dim, marginBottom: 2 }}>Check-out</div>
                        <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <PlaceText at={{ lat: detail.checkout_lat, lng: detail.checkout_lng ?? 0 }} eager={false} />
                          <a href={`https://maps.google.com/?q=${detail.checkout_lat},${detail.checkout_lng}`} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open check-out location in Google Maps" style={{ color: T.info, display: 'inline-flex', marginTop: 2 }}><ExternalLink size={12} strokeWidth={1.8} /></a>
                        </div>
                      </div>
                    ) : <div />}
                  </div>
                </div>
              )}

              {/* Location trust signals stamped at check-in. */}
              {(detail.checkin_is_mock || detail.checkin_distance_m != null) && (
                <div style={{ padding: '10px 12px', background: detail.checkin_is_mock ? T.redWash : T.raised, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
                  <Eyebrow>Check-in location</Eyebrow>
                  {detail.checkin_is_mock && <Badge tone="red"><ShieldAlert size={11} strokeWidth={2} /> Mock GPS detected</Badge>}
                  {detail.checkin_distance_m != null && Number.isFinite(Number(detail.checkin_distance_m)) && (
                    <span>{Math.round(Number(detail.checkin_distance_m)).toLocaleString('en-IN')} m from the site</span>
                  )}
                </div>
              )}

              {/* Distance travelled that day (check-in → forms → check-out). Fetched only now that the modal is open; an
                  absent / virtual row has no shift to measure. Never blocks the rest of the modal. */}
              {!detail._virtual && detail.checkin_at && !!detail.user_id && (
                <DayTravel
                  key={`${detail.user_id}|${toISTDate(detail.date || detail.checkin_at)}`}
                  userId={detail.user_id}
                  date={toISTDate(detail.date || detail.checkin_at)}
                  refreshKey={detail.checkout_at || ''}
                />
              )}

              {/* Selfie thumbnails */}
              {(detail.checkin_selfie_url || detail.checkout_selfie_url) && (
                <div style={{ display: 'grid', gridTemplateColumns: detail.checkin_selfie_url && detail.checkout_selfie_url ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {detail.checkin_selfie_url && (
                    <div>
                      <Eyebrow style={{ marginBottom: 6 }}>Check-in selfie</Eyebrow>
                      <a href={detail.checkin_selfie_url} onClick={(e) => openSignedUrl(e, detail.checkin_selfie_url)} target="_blank" rel="noreferrer">
                        <SignedImage src={detail.checkin_selfie_url} alt="Check-in selfie"
                          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, display: 'block' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </a>
                    </div>
                  )}
                  {detail.checkout_selfie_url && (
                    <div>
                      <Eyebrow style={{ marginBottom: 6 }}>Check-out selfie</Eyebrow>
                      <a href={detail.checkout_selfie_url} onClick={(e) => openSignedUrl(e, detail.checkout_selfie_url)} target="_blank" rel="noreferrer">
                        <SignedImage src={detail.checkout_selfie_url} alt="Check-out selfie"
                          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, display: 'block' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {detail.override_reason && (
                <div style={{ background: T.warnWash, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: T.warn }}>
                  <span style={{ fontWeight: 600 }}>Override note: </span>{detail.override_reason}
                </div>
              )}

              {/* Free-text note — includes "Auto checked out at 12:00 AM" for a shift nobody closed. */}
              {detail.notes && (
                <div style={{ background: T.raised, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: T.dim }}>
                  <span style={{ fontWeight: 600 }}>Note: </span>{detail.notes}
                </div>
              )}

              {detail.is_regularised && (
                <div><Badge tone="info" dot>Regularised by admin</Badge></div>
              )}

              {/* Face-recognition verdict (module face_attendance). */}
              {(detail.checkin_face_verified != null || detail.checkout_face_verified != null) && (
                <div style={{ background: T.raised, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: T.dim, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Eyebrow>Face match</Eyebrow>
                  {detail.checkin_face_verified != null && (
                    <Badge tone={detail.checkin_face_verified ? 'ok' : 'warn'}>
                      In: {detail.checkin_face_verified ? 'verified' : 'not matched'}
                      {detail.checkin_face_score != null && ` (${Math.round(detail.checkin_face_score * 100)}%)`}
                    </Badge>
                  )}
                  {detail.checkout_face_verified != null && (
                    <Badge tone={detail.checkout_face_verified ? 'ok' : 'warn'}>
                      Out: {detail.checkout_face_verified ? 'verified' : 'not matched'}
                      {detail.checkout_face_score != null && ` (${Math.round(detail.checkout_face_score * 100)}%)`}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ══════ ONE PERSON'S MONTH ══════ */}
      {personView && (
        <PersonMonthModal
          key={`${personView.userId}|${personView.from}|${personView.to}`}
          userId={personView.userId}
          name={personView.name}
          from={personView.from}
          to={personView.to}
          rules={rules}
          onClose={() => setPersonView(null)}
        />
      )}

      {/* ══════ MARK ABSENT CONFIRM ══════ */}
      <Modal
        open={!!delRec}
        onClose={() => setDelRec(null)}
        title="Mark as absent?"
        width={420}
        footer={
          <>
            <Button onClick={() => setDelRec(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving} icon={saving ? <Spinner /> : <UserX size={15} strokeWidth={1.6} />}>{saving ? 'Working…' : 'Mark absent'}</Button>
          </>
        }
      >
        {delRec && (
          <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.6 }}>
            This overrides <span style={{ color: T.text, fontWeight: 500 }}>{delRec.users?.name}</span>&apos;s attendance for <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{fmtDate(delRec.date)}</span> to Absent. The change is recorded as an admin override.
          </div>
        )}
      </Modal>

      {/* ══════ EXPORT MODAL ══════ */}
      <Modal
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export attendance"
        subtitle="Downloads an Excel workbook: a Summary sheet and a Details sheet with times, total hours and selfie links."
        width={520}
        footer={
          <>
            <Button onClick={() => setShowExport(false)}>Cancel</Button>
            <Button variant="primary" onClick={runExport} disabled={expLoading || !expFrom || !expTo} icon={expLoading ? <Spinner /> : <Download size={16} strokeWidth={1.6} />}>
              {expLoading ? 'Fetching data…' : 'Download Excel'}
            </Button>
          </>
        }
      >
        {expErr && errorBox(expErr)}

        <Section eyebrow="Date range" hint="This week, 14 days, this month, or a custom range — up to 62 days per export." first>
          <RangePresetPicker from={expFrom} to={expTo} onChange={(f, t) => { setExpFrom(f); setExpTo(t); }} idPrefix="exp" />
        </Section>

        <Section eyebrow="What's included" hint="Two worksheet tabs in one Excel file." style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { title: 'Summary sheet', desc: 'Per person — present, half days, on leave, absent, total hours' },
              { title: 'Details sheet', desc: 'Per person per day — check-in, check-out, total hours, status, and check-in/out image links' },
            ].map((s, i) => (
              <div key={s.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 12px', background: T.raised, borderRadius: 8 }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, marginTop: 2, minWidth: 14 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: T.text }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: T.dim, marginTop: 1 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </Modal>
    </>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--dim)', fontSize: 14 }}>
        Loading attendance…
      </div>
    }>
      <AttendanceContent />
    </Suspense>
  );
}
