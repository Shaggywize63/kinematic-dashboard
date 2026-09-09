'use client';

import { useState, useEffect, useCallback, useRef, Suspense, type CSSProperties } from 'react';
import { parseISO, isValid } from 'date-fns';
import { CalendarDays, Check, Download, ExternalLink, Eye, Loader2, Pencil, Plus, RefreshCw, Search, Upload, UserX, X } from 'lucide-react';
import api from '../../../lib/api';
import SignedImage, { openSignedUrl } from '@/components/shared/SignedImage';
import Modal from '../../../components/crm/shared/Modal';
import { useAuth } from '../../../hooks/useAuth';
import { useClient } from '../../../context/ClientContext';
import { useRealtimeAttendance } from '../../../hooks/useRealtimeAttendance';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { usePageTitle } from '../../../lib/pageTitle';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, PageHeader, Section, Segmented, Select, T, Textarea, useIsCompact, type Tone } from '../../../components/ui';

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
              <Field label="From"><Input type="date" value={from} onChange={e => onChange(e.target.value, to)} style={{ fontSize: 12.5, padding: '0 8px' }} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={e => onChange(from, e.target.value)} style={{ fontSize: 12.5, padding: '0 8px' }} /></Field>
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
  status: 'checked_in' | 'checked_out' | 'absent' | 'half_day' | 'on_leave';
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
  // Face-recognition attendance (module face_attendance): the on-device 1:1
  // match result stamped at check-in / check-out.
  checkin_face_verified?: boolean;
  checkin_face_score?: number;
  checkout_face_verified?: boolean;
  checkout_face_score?: number;
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
  absent:      { label: 'Absent',      tone: 'red' },
  half_day:    { label: 'Half day',    tone: 'warn' },
  on_leave:    { label: 'On leave',    tone: 'neutral' },
};

const fmt = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// IST offset: UTC+05:30 = 19800000 ms
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Convert any date/timestamp value to a plain YYYY-MM-DD string in IST timezone.
 * Handles: "2026-04-12", "2026-04-12 07:14:05.605+00" (space sep),
 *          "2026-04-12T00:00:00+00:00" (full ISO UTC), null, undefined.
 * Returns empty string if the input cannot be parsed.
 */
const toISTDate = (val: any): string => {
  if (!val) return '';
  const s = String(val).trim();
  // Already a plain YYYY-MM-DD — the DB `date` column always stores the IST calendar date,
  // so accept it directly without UTC conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Full timestamp (with or without T separator) — parse as UTC then shift to IST.
  const ms = new Date(s.replace(' ', 'T')).getTime();
  if (isNaN(ms)) return '';
  return new Date(ms + IST_OFFSET_MS).toISOString().split('T')[0];
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

/* ── selfie thumbnail with "open" affordance ── */
const SelfieThumb = ({ src, alt, tone }: { src: string; alt: string; tone: 'ok' | 'info' }) => (
  <div style={{ position: 'relative', flexShrink: 0 }}>
    <SignedImage src={src} alt={alt} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${T.border}`, display: 'block' }} />
    <a href={src} onClick={(e) => openSignedUrl(e, src)} target="_blank" rel="noreferrer" title={`Open ${alt.toLowerCase()} selfie`}
       style={{ position: 'absolute', bottom: -4, right: -4, background: T.card, border: `1px solid ${T.border}`, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone === 'ok' ? T.ok : T.info, textDecoration: 'none' }}>
      <Eye size={10} strokeWidth={2} />
    </a>
  </div>
);

/* ═══════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */
function AttendanceContent() {
  usePageTitle('Attendance');
  const narrow = useIsCompact(1100);
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

  const [records,  setRecords]  = useState<AttendanceRecord[]>([]);
  const [users,    setUsers]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [fromDate,   setFrom]   = useState(urlFrom || _today);
  const [toDate,     setTo]     = useState(urlTo || _today);
  const [statusFilter, setSF]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState<'executive' | 'supervisor'>('executive');

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
  const [expFrom,    setExpFrom]    = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; });
  const [expTo,      setExpTo]      = useState(() => new Date().toISOString().split('T')[0]);
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

  /* ── fetch ── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const f = fromDate.trim();
      const t = toDate.trim();

      // UNIVERSAL PARAMETERS: from and to
      let qs = `from=${f}&to=${t}`;

      if (selectedClientId && selectedClientId !== 'all') {
        qs += `&client_id=${selectedClientId}`;
      }

      const [attRes, usersRes] = await Promise.all([
        api.get<any>(`/api/v1/attendance/team?${qs}`),
        api.get<any>(`/api/v1/users?limit=500${selectedClientId ? `&client_id=${selectedClientId}` : ''}`),
      ]);

      const pick = (r: any) => {
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        return [];
      };

      const usersArr = pick(usersRes);
      setUsers(usersArr);

      // Build lookup map: id → user
      const userMap: Record<string, any> = {};
      usersArr.forEach((u: any) => { userMap[u.id] = u; });

      // Enrich attendance records with user info if join didn't come back
      const attArr = pick(attRes).map((r: any) => {
        // Normalize date to IST YYYY-MM-DD using toISTDate so coveredPairs
        // keys always match rangeDates regardless of what the backend sends.
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

      // Add implicit absent rows for users with no attendance record (Pave the list)
      // For date ranges, generate one absent row per missing day per user.
      const ELIGIBLE_ROLES = ['executive', 'field_executive', 'field-executive', 'field_exec', 'supervisor', 'city_manager'];
      const eligibleUsers = usersArr.filter((u: any) => ELIGIBLE_ROLES.includes((u.role || '').toLowerCase()) && u.is_active);

      // Build a set of "user_id|YYYY-MM-DD(IST)" pairs that already have real records.
      // Use toISTDate so the key always matches the YYYY-MM-DD values in rangeDates.
      const coveredPairs = new Set(attArr.map((r: any) => `${r.user_id}|${toISTDate(r.date) || toISTDate(r.checkin_at)}`));

      // Enumerate every date in the range [f, t]
      const rangeDates: string[] = [];
      const cur = new Date(f + 'T00:00:00Z');
      const end = new Date(t + 'T00:00:00Z');
      while (cur <= end) {
        rangeDates.push(cur.toISOString().split('T')[0]);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      const absentRows: AttendanceRecord[] = [];
      for (const u of eligibleUsers) {
        for (const day of rangeDates) {
          if (!coveredPairs.has(`${u.id}|${day}`)) {
            absentRows.push({
              id: null as any,
              user_id: u.id,
              date: day,
              status: 'absent' as const,
              checkin_at: undefined, checkout_at: undefined, total_hours: undefined,
              users: { name: u.name, employee_id: u.employee_id, zones: u.zones, role: u.role },
              _virtual: true,
            });
          }
        }
      }
      setRecords([...attArr, ...absentRows]);
      setErr('');
    } catch (e: any) {
      setErr(e.message || 'Failed to load attendance');
    } finally { setLoading(false); }
  }, [fromDate, toDate, selectedClientId]);

  useEffect(() => { load(); }, [load]);

  // Realtime push: when ANY attendance/breaks row changes for this org, the
  // Supabase channel fires `load()` immediately. Combined with the visible-
  // tab poll below, this gives instant supervisor updates with a 15s
  // catch-up safety net (handles dropped websockets, tab-was-hidden, etc.).
  useRealtimeAttendance(load);

  // Live-ish supervisor view: poll every 15 s while the tab is visible so
  // newly-marked attendance rows show up without a manual refresh. Pauses
  // immediately when the tab is hidden so we don't burn the API quota for
  // a window the supervisor isn't looking at. Backend response is 304-able
  // via the Cache-Control + ETag headers we set on /attendance/team, so the
  // real network cost is tiny when nothing has changed.
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      if (document.visibilityState === 'visible') load();
      timer = window.setTimeout(tick, 15_000);
    };
    timer = window.setTimeout(tick, 15_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  /* helper — merge a saved record back into the list, or prepend if new */
  const mergeRecord = (saved: AttendanceRecord) => {
    setRecords(prev => {
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
  const handleDelete = async () => {
    if (!delRec) return;
    setSaving(true);
    try {
      await api.post(`/api/v1/attendance/${delRec.id}/override`, {
        status: 'absent',
        override_reason: 'Deleted by admin',
      });
      setDelRec(null); setDetail(null); load();
    } catch (e: any) { alert(e.message); }
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
    const h = calcHours(rec);
    if (h != null && h < 4) return 'Half Day';
    if (rec.status === 'checked_in') return 'Checked In';
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
          chunk.map(d => api.get<any>(`/api/v1/attendance/team?date=${d}`))
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
    // ── helpers ──
    const esc = (v: any) => String(v ?? '').replace(/"/g, '""');
    const q   = (v: any) => `"${esc(v)}"`;

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

    const allUsers = Object.values(userMap);
    const tabs: { name: string; csvContent: string }[] = [];

    // ══ SHEET 1: Summary by user ══
    const summaryHeader = ['Name','Employee ID','Role','City','Zone','Supervisor','Working Days','Present','Half Days','On Leave','Absent','Total Hours','Avg Hrs/Day'];
    const summaryRows = allUsers.map(u => [
      q(u.name), q(u.employee_id), q(u.role), q(u.city), q(u.zone), q(u.supervisor),
      u.totalDays, u.presentDays,
      u.halfDays > 0 ? `⚠ ${u.halfDays}` : '0',
      u.onLeaveDays, u.absentDays, fmtHrs(u.totalHours), fmtHrs(u.avgHoursPerDay),
    ]);
    tabs.push({ name: 'Summary', csvContent: [summaryHeader.map(q).join(','), ...summaryRows.map(r => r.join(','))].join('\n') });

    // ══ SHEET 2: City-wise summary ══
    const cities = Array.from(new Set(allUsers.map(u => u.city || 'Unknown'))).sort();
    const cityHeader = ['City','Total Execs','Present','Half Days','Absent','Total Hours','Avg Hrs/Exec'];
    const cityRows = cities.map(city => {
      const cu = allUsers.filter(u => (u.city || 'Unknown') === city);
      const present  = cu.reduce((a,u) => a + u.presentDays, 0);
      const half     = cu.reduce((a,u) => a + u.halfDays, 0);
      const absent   = cu.reduce((a,u) => a + u.absentDays, 0);
      const hours    = cu.reduce((a,u) => a + u.totalHours, 0);
      return [q(city), cu.length, present, half > 0 ? `⚠ ${half}` : '0', absent, fmtHrs(hours), cu.length ? fmtHrs(hours / cu.length) : '0h 0m'];
    });
    tabs.push({ name: 'City Wise', csvContent: [cityHeader.map(q).join(','), ...cityRows.map(r => r.join(','))].join('\n') });

    // ══ SHEET 3: Role-wise summary ══
    const roles = Array.from(new Set(allUsers.map(u => u.role || 'unknown'))).sort();
    const roleHeader = ['Role','Count','Present Days','Half Days','Absent Days','Total Hours'];
    const roleRows = roles.map(role => {
      const ru = allUsers.filter(u => u.role === role);
      return [
        q(role), ru.length,
        ru.reduce((a,u) => a+u.presentDays, 0),
        ru.reduce((a,u) => a+u.halfDays,    0),
        ru.reduce((a,u) => a+u.absentDays,  0),
        fmtHrs(ru.reduce((a,u) => a+u.totalHours,  0)),
      ];
    });
    tabs.push({ name: 'Role Wise', csvContent: [roleHeader.map(q).join(','), ...roleRows.map(r => r.join(','))].join('\n') });

    // ══ SHEET 4: Day-by-day detail ══
    const detailHeader = ['Date','Name','Employee ID','Role','City','Zone','Check-in','Check-out','Hours','Break(min)','Status','Midnight Crossover?','Override Reason'];
    const detailRows = records.map(r => {
      const ci = r.checkin_at ? new Date(r.checkin_at).getTime() : null;
      const co = r.checkout_at ? new Date(r.checkout_at).getTime() : null;
      const isCrossover = ci && co && co < ci;
      const hrs = calcHours(r);
      return [
        q(r._date),
        q(r.users?.name || ''),
        q(r.users?.employee_id || ''),
        q((r.users as any)?.role || ''),
        q((r.users as any)?.city || r.users?.zones?.name || ''),
        q(r.users?.zones?.name || ''),
        q(r.checkin_at  ? new Date(r.checkin_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'),
        q(r.checkout_at ? new Date(r.checkout_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'),
        fmtHrs(hrs),
        r.break_minutes || 0,
        q(classifyDay(r)),
        isCrossover ? q('YES — checkout next day, +24h applied') : q('No'),
        q(r.override_reason || ''),
      ];
    });
    tabs.push({ name: 'Day Detail', csvContent: [detailHeader.map(q).join(','), ...detailRows.map(r => r.join(','))].join('\n') });

    // ══ SHEET 5: Midnight crossover explanation ══
    const crossoverNote = [
      ['MIDNIGHT CROSSOVER POLICY — How working hours are calculated'],
      [''],
      ['Scenario', 'Example', 'Calculation', 'Result'],
      ['Normal shift',       'Check-in 09:00  Check-out 18:00', '18:00 − 09:00',          '9h 0m'],
      ['Midnight crossover', 'Check-in 21:00  Check-out 02:00', '02:00 + 24h − 21:00',    '5h 0m'],
      [''],
      ['Rule: If checkout_at < checkin_at (same attendance record), the system assumes the shift crossed midnight.'],
      ['A full 24 hours is added to the checkout timestamp before calculating the difference.'],
      ['The result is capped at 24 hours to guard against data entry errors.'],
      [''],
      ['Half Day Rule: Any shift < 4 hours is automatically classified as a Half Day, regardless of status field.'],
      [''],
      ['This report was generated on', new Date().toLocaleString('en-IN')],
      ['Date range', `${expFrom} to ${expTo}`],
    ].map(row => row.map(c => q(c ?? '')).join(','));
    tabs.push({ name: 'Policy Notes', csvContent: crossoverNote.join('\n') });

    // Since we can't generate multi-sheet XLSX without a lib, we produce a ZIP-like multi-file CSV
    // but for simplicity, concatenate all sheets in one CSV with clear section headers
    const combined = tabs.map(t =>
      `"=== ${t.name.toUpperCase()} ==="\n${t.csvContent}\n\n`
    ).join('');

    const filename = `kinematic_attendance_${expFrom}_to_${expTo}.csv`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(combined);
    a.download = filename;
    a.click();
    setShowExport(false);
  };

  /* 1. current Role records */
  const EXEC_ROLES = new Set(['executive', 'field_executive', 'field-executive', 'field_exec']);
  const SUP_ROLES  = new Set(['supervisor', 'city_manager']);
  const currentRoleRecords = records.filter(r => {
    const role = (r.users?.role || '').toLowerCase();
    return roleFilter === 'executive' ? EXEC_ROLES.has(role) : SUP_ROLES.has(role);
  });

  /* 2. stats calculation */
  const stats = {
    total:    currentRoleRecords.length,
    in:       currentRoleRecords.filter(r => r.status === 'checked_in').length,
    out:      currentRoleRecords.filter(r => r.status === 'checked_out').length,
    absent:   currentRoleRecords.filter(r => r.status === 'absent').length,
    half:     currentRoleRecords.filter(r => r.status === 'half_day').length,
    onLeave:  currentRoleRecords.filter(r => r.status === 'on_leave').length,
  };

  /* 3. final shown list */
  const shown = currentRoleRecords.filter(r => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (r.users?.name || '').toLowerCase().includes(s) ||
      (r.users?.employee_id || '').toLowerCase().includes(s) ||
      (r.users?.zones?.name || '').toLowerCase().includes(s);

    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const isRange = fromDate.trim() !== toDate.trim();
  const rangeLabel = isRange ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}` : fmtDate(fromDate);

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
          description={<>Who&apos;s in, out, on leave or absent for <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{rangeLabel}</span> — updates live every 15 s.</>}
          actions={
            <>
              <IconButton label="Refresh" onClick={load}><RefreshCw size={16} strokeWidth={1.6} style={loading ? { animation: 'kspin 1s linear infinite' } : undefined} /></IconButton>
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

        {/* ── stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
          {[
            { l: 'Total',       v: stats.total,   c: undefined },
            { l: 'Checked in',  v: stats.in,      c: T.ok },
            { l: 'Checked out', v: stats.out,     c: T.info },
            { l: 'On leave',    v: stats.onLeave, c: T.mute },
            { l: 'Absent',      v: stats.absent,  c: T.red },
            { l: 'Half day',    v: stats.half,    c: T.warn },
          ].map(s => (
            <Card key={s.l} padding={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.c && <span style={{ width: 6, height: 6, borderRadius: 999, background: s.c, flexShrink: 0 }} />}
                <Eyebrow>{s.l}</Eyebrow>
              </div>
              <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
            </Card>
          ))}
        </div>

        {/* ── Attendance Analysis ── derived from the loaded records ── */}
        {records.length > 0 && (() => {
          // Approved leave is excluded from the attendance-rate denominator.
          const onLeave = records.filter(r => classifyDay(r) === 'On Leave').length;
          const total = records.length - onLeave;
          const present = records.filter(r => { const d = classifyDay(r); return d === 'Present' || d === 'Checked In'; }).length;
          const hoursArr = records.map(r => calcHours(r)).filter((h): h is number => h != null);
          const totalHours = hoursArr.reduce((a, b) => a + b, 0);
          const avgHours = hoursArr.length ? totalHours / hoursArr.length : 0;
          const onTime = records.filter(r => {
            if (!r.checkin_at) return false;
            const d = new Date(r.checkin_at);
            return d.getHours() < 9 || (d.getHours() === 9 && d.getMinutes() <= 30);
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
                <div style={{ fontSize: 12.5, color: T.dim }}>Derived from every record loaded for {rangeLabel}; approved leave is excluded from the rate.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {metrics.map(m => (
                  <div key={m.l} style={{ background: T.raised, borderRadius: 8, padding: '12px 14px' }}>
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
          <DateRangePicker from={fromDate} to={toDate} onChange={(f,t) => { setFrom(f); setTo(t); }} />
          <div style={{ flex: 1, position: 'relative', minWidth: narrow ? '100%' : 220 }}>
            <Search size={15} strokeWidth={1.6} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID or zone…" style={{ paddingLeft: 34 }} aria-label="Search attendance" />
          </div>
          <div style={{ width: narrow ? '100%' : 170 }}>
            <Select value={statusFilter} onChange={e => setSF(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              <option value="on_leave">On leave</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half day</option>
            </Select>
          </div>
          <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute, whiteSpace: 'nowrap' }}>
            {shown.length} / {currentRoleRecords.length}
          </span>
        </div>

        {/* ── table ── */}
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isRange ? 980 : 880 }}>
              <thead>
                <tr>
                  <th style={th}>Executive</th>
                  {isRange && <th style={th}>Date</th>}
                  <th style={th}>Status</th>
                  <th style={th}>Selfie</th>
                  <th style={th}>Check-in</th>
                  <th style={th}>Check-out</th>
                  <th style={{ ...th, textAlign: 'right' }}>Hours</th>
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
                ) : shown.map((r, i) => {
                  const sm = statusMeta[r.status] || statusMeta.absent;
                  const last = i === shown.length - 1;
                  const rowTd = last ? { ...td, borderBottom: 0 } : td;
                  const rowMono = last ? { ...tdMono, borderBottom: 0 } : tdMono;
                  const hrs = calcHours(r);
                  return (
                    <tr key={r.id || `${r.user_id}_${r.date || r.checkin_at || i}`} data-clickable="true" onClick={() => setDetail(r)}>
                      {/* name */}
                      <td style={rowTd}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                          <Avatar name={r.users?.name || '?'} size={32} />
                          <div style={{ overflow: 'hidden', minWidth: 0 }}>
                            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{r.users?.name || r.user_id.slice(0, 8)}</div>
                            <div style={{ fontSize: 12, color: T.mute, marginTop: 1, textTransform: 'capitalize' }}>{(r.users?.role || '').replace(/[_-]/g, ' ')}{r.users?.employee_id ? <> · <span style={{ fontFamily: T.mono }}>{r.users.employee_id}</span></> : null}</div>
                          </div>
                        </div>
                      </td>

                      {/* date if range */}
                      {isRange && (
                        <td style={rowMono}>{fmtDate(r.date || toISTDate(r.checkin_at))}</td>
                      )}

                      {/* status */}
                      <td style={rowTd}>
                        <span title={JSON.stringify(r, null, 2)} style={{ cursor: 'help', display: 'inline-flex' }}>
                          <Badge tone={sm.tone} dot>{sm.label}</Badge>
                        </span>
                      </td>

                      {/* selfie preview */}
                      <td style={rowTd}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {/* Face-recognition verdict (module face_attendance). */}
                          {r.checkin_face_verified != null && (
                            <span title={r.checkin_face_score != null ? `On-device face match: ${Math.round(r.checkin_face_score * 100)}%` : (r.checkin_face_verified ? 'Face verified' : 'Face not matched')} style={{ display: 'inline-flex' }}>
                              <Badge tone={r.checkin_face_verified ? 'ok' : 'warn'}>{r.checkin_face_verified ? <><Check size={11} strokeWidth={2.4} /> Face</> : 'Face ?'}</Badge>
                            </span>
                          )}
                          {r.checkin_selfie_url ? (
                            <SelfieThumb src={r.checkin_selfie_url} alt="Check-in" tone="ok" />
                          ) : <div style={{ width: 40, height: 40, borderRadius: 8, background: T.raised, border: `1px solid ${T.border}`, flexShrink: 0 }} />}
                          {r.checkout_selfie_url ? (
                            <SelfieThumb src={r.checkout_selfie_url} alt="Check-out" tone="info" />
                          ) : null}
                        </div>
                      </td>

                      {/* check-in */}
                      <td style={{ ...rowMono, color: r.checkin_at ? T.text : T.mute }}>{fmt(r.checkin_at)}</td>

                      {/* check-out */}
                      <td style={{ ...rowMono, color: r.checkout_at ? T.text : T.mute }}>{fmt(r.checkout_at)}</td>

                      {/* hours */}
                      <td style={{ ...rowMono, textAlign: 'right', color: (r.total_hours || hrs) ? T.text : T.mute }}>
                        {fmtHrs(hrs)}
                      </td>

                      {/* zone */}
                      <td style={{ ...rowTd, color: T.dim, fontSize: 13 }}>{r.users?.zones?.name || '—'}</td>

                      {/* actions */}
                      <td style={{ ...rowTd, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 2 }}>
                          <IconButton label="Edit" onClick={() => openEdit(r)}><Pencil size={15} strokeWidth={1.6} /></IconButton>
                          <IconButton label="Mark absent" onClick={() => setDelRec(r)} style={{ color: T.red }}><UserX size={15} strokeWidth={1.6} /></IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* row count */}
        {!loading && shown.length > 0 && (
          <div style={{ fontSize: 12, color: T.mute, textAlign: 'right', fontFamily: T.mono }}>
            {shown.length} of {currentRoleRecords.length} records · {rangeLabel}
          </div>
        )}
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
            <Button onClick={() => { openEdit(detail); setDetail(null); }} icon={<Pencil size={15} strokeWidth={1.6} />}>Edit</Button>
            <Button variant="danger" onClick={() => { setDelRec(detail); setDetail(null); }} icon={<UserX size={15} strokeWidth={1.6} />}>Mark absent</Button>
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
                  <div style={{ marginTop: 6 }}><Badge tone={sm.tone} dot>{sm.label}</Badge></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { l: 'Check-in',  v: fmt(detail.checkin_at) },
                  { l: 'Check-out', v: fmt(detail.checkout_at) },
                  { l: 'Hours',     v: fmtHrs(calcHours(detail)) },
                  { l: 'Break',     v: detail.break_minutes ? `${detail.break_minutes}m` : '—' },
                ].map(r => (
                  <div key={r.l} style={{ background: T.raised, borderRadius: 8, padding: '10px 12px' }}>
                    <Eyebrow>{r.l}</Eyebrow>
                    <div style={{ fontFamily: T.mono, fontSize: 14, color: T.text, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{r.v}</div>
                  </div>
                ))}
              </div>

              {/* Coordinates / Locations */}
              {(detail.checkin_lat || detail.checkout_lat) && (
                <div style={{ padding: 12, background: T.raised, borderRadius: 8 }}>
                  <Eyebrow style={{ marginBottom: 8 }}>Location</Eyebrow>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {detail.checkin_lat ? (
                      <div>
                        <div style={{ fontSize: 12, color: T.dim, marginBottom: 2 }}>Check-in</div>
                        <a href={`https://maps.google.com/?q=${detail.checkin_lat},${detail.checkin_lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontFamily: T.mono, color: T.info, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {detail.checkin_lat.toFixed(5)}, {detail.checkin_lng?.toFixed(5)} <ExternalLink size={11} strokeWidth={1.8} />
                        </a>
                      </div>
                    ) : <div />}
                    {detail.checkout_lat ? (
                      <div>
                        <div style={{ fontSize: 12, color: T.dim, marginBottom: 2 }}>Check-out</div>
                        <a href={`https://maps.google.com/?q=${detail.checkout_lat},${detail.checkout_lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontFamily: T.mono, color: T.info, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {detail.checkout_lat.toFixed(5)}, {detail.checkout_lng?.toFixed(5)} <ExternalLink size={11} strokeWidth={1.8} />
                        </a>
                      </div>
                    ) : <div />}
                  </div>
                </div>
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
        subtitle="Downloads a CSV with city-wise, role-wise and executive-wise breakdowns."
        width={520}
        footer={
          <>
            <Button onClick={() => setShowExport(false)}>Cancel</Button>
            <Button variant="primary" onClick={runExport} disabled={expLoading || !expFrom || !expTo} icon={expLoading ? <Spinner /> : <Download size={16} strokeWidth={1.6} />}>
              {expLoading ? 'Fetching data…' : 'Download CSV'}
            </Button>
          </>
        }
      >
        {expErr && errorBox(expErr)}

        <Section eyebrow="Date range" hint="Up to 62 days per export." first>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="From"><Input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={expTo} onChange={e => setExpTo(e.target.value)} /></Field>
          </div>
        </Section>

        <Section eyebrow="What's included" hint="Five sheets, separated by section headers in the CSV.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { title: 'Summary',      desc: 'Per-executive: total days, present, half days, hours worked' },
              { title: 'City wise',    desc: 'Grouped by city — total execs, attendance rates, total hours' },
              { title: 'Role wise',    desc: 'Executives vs supervisors vs city managers breakdown' },
              { title: 'Day detail',   desc: 'Every record with check-in/out times, hours, midnight flag' },
              { title: 'Policy notes', desc: 'Midnight crossover & half-day calculation rules documented' },
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

        <Section eyebrow="Midnight crossover" hint="How working hours are calculated." style={{ paddingBottom: 0 }}>
          <div style={{ background: T.warnWash, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: T.warn, lineHeight: 1.6 }}>
            If checkout is earlier than check-in on the same record (in at 9 PM, out at 2 AM), 24 hours are added to the checkout before calculating duration. These records are flagged &quot;YES — checkout next day&quot; in the Day detail sheet and capped at 24h. Any shift under 4 hours is auto-classified as a half day.
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
