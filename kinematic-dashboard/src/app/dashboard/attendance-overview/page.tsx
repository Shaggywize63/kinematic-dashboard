import { useState, useEffect, useCallback, useRef } from 'react';
import { parseISO, isValid } from 'date-fns';
import api from '@/lib/api';

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
    { l: 'Today', f: new Date().toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
    { l: 'Yesterday', f: new Date(Date.now() - 86400000).toISOString().split('T')[0], t: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
    { l: 'Last 7 Days', f: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
    { l: 'Last 30 Days', f: new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        📅 {from === to ? new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 600, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, width: 280, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {presets.map(p => (
              <button key={p.l} onClick={() => { onChange(p.f, p.t); setOpen(false); }}
                style={{ padding: '7px 10px', background: 'transparent', border: 'none', color: C.gray, fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 6 }}>{p.l}</button>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><div style={{ fontSize: 10, color: C.grayd, marginBottom: 4 }}>FROM</div><input type="date" value={from} onChange={e => onChange(e.target.value, to)} style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px', color: '#fff', fontSize: 11 }} /></div>
              <div><div style={{ fontSize: 10, color: C.grayd, marginBottom: 4 }}>TO</div><input type="date" value={to} onChange={e => onChange(from, e.target.value)} style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px', color: '#fff', fontSize: 11 }} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const C = {
  bg:      '#070D18',
  s2:      '#0E1420',
  s3:      '#131B2A',
  s4:      '#1A2438',
  border:  '#1E2D45',
  borderL: '#253650',
  white:   '#E8EDF8',
  gray:    '#7A8BA0',
  grayd:   '#2E445E',
  graydd:  '#1A2738',
  red:     '#E01E2C',
  redD:    'rgba(224,30,44,0.08)',
  redB:    'rgba(224,30,44,0.2)',
  green:   '#00D97E',
  greenD:  'rgba(0,217,126,0.08)',
  greenB:  'rgba(0,217,126,0.2)',
  blue:    '#3E9EFF',
  blueD:   'rgba(62,158,255,0.10)',
  yellow:  '#FFB800',
  yellowD: 'rgba(255,184,0,0.08)',
  purple:  '#9B6EFF',
  purpleD: 'rgba(155,110,255,0.08)',
  orange:  '#FF7B35',
  orangeD: 'rgba(255,123,53,0.10)',
};

/* ── types ── */
interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  status: 'checked_in' | 'checked_out' | 'absent' | 'half_day';
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

const _today = new Date().toISOString().split('T')[0];
const BLANK: FormData = {
  user_id: '', date: _today, status: 'checked_in',
  checkin_date: _today, checkin_at: '', checkin_selfie_url: '',
  checkout_date: _today, checkout_at: '', checkout_selfie_url: '',
  override_reason: '',
  checkin_lat: '', checkin_lng: '', checkout_lat: '', checkout_lng: '',
  notes: '',
};

/* ── helpers ── */
const Spinner = () => (
  <div style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,0.18)', borderTopColor: '#fff', borderRadius: '50%', animation: 'kspin .65s linear infinite', flexShrink: 0 }} />
);

const Label = ({ text, req }: { text: string; req?: boolean }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.7px', textTransform: 'uppercase' as const, marginBottom: 7 }}>
    {text}{req && <span style={{ color: C.red }}> *</span>}
  </div>
);

const baseInp: React.CSSProperties = {
  width: '100%', background: C.s3, border: `1.5px solid ${C.border}`, color: C.white,
  borderRadius: 11, padding: '10px 13px', fontSize: 13, outline: 'none',
  fontFamily: "'DM Sans',sans-serif", transition: 'border-color .15s',
};

const Overlay = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}>
    {children}
  </div>
);

const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
  checked_in:  { label: 'Checked In',  color: C.green,  bg: C.greenD  },
  checked_out: { label: 'Checked Out', color: C.blue,   bg: C.blueD   },
  absent:      { label: 'Absent',      color: C.red,    bg: C.redD    },
  half_day:    { label: 'Half Day',    color: C.yellow, bg: C.yellowD },
};

const fmt = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

/* ═══════════════════════════════════════════════════ */
export default function AttendancePage() {
  const [records,  setRecords]  = useState<AttendanceRecord[]>([]);
  const [users,    setUsers]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [fromDate,   setFrom]   = useState(new Date().toISOString().split('T')[0]);
  const [toDate,     setTo]     = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setSF]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState<'executive' | 'supervisor'>('executive');

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

      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/attendance-selfies/${path}`, {
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

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/attendance-selfies/${path}`;
      setF(field, publicUrl);
    } catch (e: any) {
      alert('Upload failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setUploading(null);
    }
  };

  /* ── fetch ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch attendance + all users
      const qs = fromDate === toDate ? `date=${fromDate}` : `from_date=${fromDate}&to_date=${toDate}`;
      const [attRes, usersRes] = await Promise.all([
        api.get<any>(`/api/v1/attendance/team?${qs}`),
        api.get<any>('/api/v1/users?limit=500'),
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
        const u = userMap[r.user_id];
        if (r.users?.name) {
          if (u) r.users.role = u.role;
          return r;
        }
        if (u) return { ...r, users: { name: u.name, employee_id: u.employee_id, zones: u.zones, role: u.role } };
        return r;
      });

      // Add implicit absent rows for users with no attendance record ONLY if it's a single date view
      if (fromDate === toDate) {
        const coveredIds = new Set(attArr.map((r: any) => r.user_id));
        const absentRows = usersArr
          .filter((u: any) => ['executive', 'field_executive', 'field-executive', 'supervisor', 'city_manager'].includes(u.role) && u.is_active && !coveredIds.has(u.id))
          .map((u: any) => ({
            id: null,
            user_id: u.id,
            date: fromDate,
            status: 'absent' as const,
            checkin_at: null, checkout_at: null, total_hours: null,
            users: { name: u.name, employee_id: u.employee_id, zones: u.zones, role: u.role },
            _virtual: true,
          }));
        setRecords([...attArr, ...absentRows]);
      } else {
        setRecords(attArr);
      }
      setErr('');
    } catch (e: any) {
      setErr(e.message || 'Failed to load attendance');
    } finally { setLoading(false); }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

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
    } catch (e: any) { setErr(e.message); }
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

  const classifyDay = (rec: AttendanceRecord): 'Present' | 'Half Day' | 'Absent' | 'Checked In' => {
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
      absentDays: number; totalHours: number; avgHoursPerDay: number;
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
          totalDays: 0, presentDays: 0, halfDays: 0, absentDays: 0, totalHours: 0, avgHoursPerDay: 0,
        };
      }
      userMap[uid].records.push(r);
    });

    // Compute stats per user
    Object.values(userMap).forEach(u => {
      u.totalDays    = dates.length;
      u.presentDays  = u.records.filter(r => classifyDay(r) === 'Present' || classifyDay(r) === 'Checked In').length;
      u.halfDays     = u.records.filter(r => classifyDay(r) === 'Half Day').length;
      u.absentDays   = dates.length - u.presentDays - u.halfDays;
      u.totalHours   = u.records.reduce((acc, r) => acc + (calcHours(r) || 0), 0);
      u.avgHoursPerDay = u.presentDays > 0 ? u.totalHours / u.presentDays : 0;
    });

    const allUsers = Object.values(userMap);
    const tabs: { name: string; csvContent: string }[] = [];

    // ══ SHEET 1: Summary by user ══
    const summaryHeader = ['Name','Employee ID','Role','City','Zone','Supervisor','Working Days','Present','Half Days','Absent','Total Hours','Avg Hrs/Day'];
    const summaryRows = allUsers.map(u => [
      q(u.name), q(u.employee_id), q(u.role), q(u.city), q(u.zone), q(u.supervisor),
      u.totalDays, u.presentDays,
      u.halfDays > 0 ? `⚠ ${u.halfDays}` : '0',
      u.absentDays, fmtHrs(u.totalHours), fmtHrs(u.avgHoursPerDay),
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

  /* ── filtered shown ── */
  const shown = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (r.users?.name || '').toLowerCase().includes(q)
      || (r.users?.employee_id || '').toLowerCase().includes(q)
      || (r.users?.zones?.name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchRole = r.users?.role === roleFilter;
    return matchSearch && matchStatus && matchRole;
  });

  const currentRoleRecords = records.filter(r => r.users?.role === roleFilter);

  const stats = {
    total:    currentRoleRecords.length,
    in:       currentRoleRecords.filter(r => r.status === 'checked_in').length,
    out:      currentRoleRecords.filter(r => r.status === 'checked_out').length,
    absent:   currentRoleRecords.filter(r => r.status === 'absent').length,
    half:     currentRoleRecords.filter(r => r.status === 'half_day').length,
  };

  /* ── inline form fields (NOT a component — avoids remount-on-render bug) ── */
  const sharedFormFields = (
    <>
      {/* Date + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <Label text="Attendance Date" req />
          <input className="kinp" type="date"
            style={{ ...baseInp, opacity: editRec ? 0.6 : 1 }}
            value={form.date} onChange={e => setF('date', e.target.value)}
            readOnly={!!editRec} />
        </div>
        <div>
          <Label text="Status" req />
          <select className="kinp" style={{ ...baseInp, appearance: 'none' as const }}
            value={form.status} onChange={e => setF('status', e.target.value)}>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="absent">Absent</option>
            <option value="half_day">Half Day</option>
          </select>
        </div>
      </div>

      {/* Check-in section */}
      <div style={{ background: 'rgba(0,217,126,0.04)', border: '1px solid rgba(0,217,126,0.14)', borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: 10 }}>Check-in Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <Label text="Check-in Date" />
            <input className="kinp" type="date" style={baseInp}
              value={form.checkin_date} onChange={e => setF('checkin_date', e.target.value)} />
          </div>
          <div>
            <Label text="Check-in Time" />
            <input className="kinp" type="time" style={baseInp}
              value={form.checkin_at} onChange={e => setF('checkin_at', e.target.value)} />
          </div>
        </div>
        <Label text="Check-in Selfie" />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="kinp" type="url" style={{ ...baseInp, flex: 1, marginBottom: 0 }}
            placeholder="Paste URL or upload →"
            value={form.checkin_selfie_url} onChange={e => setF('checkin_selfie_url', e.target.value)} />
          <label style={{ flexShrink: 0, padding: '0 14px', height: 38, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.gray, whiteSpace: 'nowrap' as const }}>
            {uploading === 'checkin' ? '⏳' : '📷 Upload'}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadSelfie('checkin_selfie_url', f); e.target.value = ''; }} />
          </label>
        </div>
        {form.checkin_selfie_url && (
          <div style={{ marginBottom: 10, position: 'relative' }}>
            <img src={form.checkin_selfie_url} alt="Check-in selfie preview"
              style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.green}40` }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <button onClick={() => setF('checkin_selfie_url', '')}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label text="Lat (opt)" />
            <input className="kinp" type="number" step="any" style={baseInp} placeholder="19.0760"
              value={form.checkin_lat} onChange={e => setF('checkin_lat', e.target.value)} />
          </div>
          <div>
            <Label text="Lng (opt)" />
            <input className="kinp" type="number" step="any" style={baseInp} placeholder="72.8777"
              value={form.checkin_lng} onChange={e => setF('checkin_lng', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Check-out section */}
      <div style={{ background: 'rgba(62,158,255,0.04)', border: '1px solid rgba(62,158,255,0.14)', borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: 10 }}>Check-out Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <Label text="Check-out Date" />
            <input className="kinp" type="date" style={baseInp}
              value={form.checkout_date} onChange={e => setF('checkout_date', e.target.value)} />
          </div>
          <div>
            <Label text="Check-out Time" />
            <input className="kinp" type="time" style={baseInp}
              value={form.checkout_at} onChange={e => setF('checkout_at', e.target.value)} />
          </div>
        </div>
        <Label text="Check-out Selfie" />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="kinp" type="url" style={{ ...baseInp, flex: 1, marginBottom: 0 }}
            placeholder="Paste URL or upload →"
            value={form.checkout_selfie_url} onChange={e => setF('checkout_selfie_url', e.target.value)} />
          <label style={{ flexShrink: 0, padding: '0 14px', height: 38, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.gray, whiteSpace: 'nowrap' as const }}>
            {uploading === 'checkout' ? '⏳' : '📷 Upload'}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadSelfie('checkout_selfie_url', f); e.target.value = ''; }} />
          </label>
        </div>
        {form.checkout_selfie_url && (
          <div style={{ marginBottom: 10, position: 'relative' }}>
            <img src={form.checkout_selfie_url} alt="Check-out selfie preview"
              style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.blue}40` }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <button onClick={() => setF('checkout_selfie_url', '')}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label text="Lat (opt)" />
            <input className="kinp" type="number" step="any" style={baseInp} placeholder="19.0760"
              value={form.checkout_lat} onChange={e => setF('checkout_lat', e.target.value)} />
          </div>
          <div>
            <Label text="Lng (opt)" />
            <input className="kinp" type="number" step="any" style={baseInp} placeholder="72.8777"
              value={form.checkout_lng} onChange={e => setF('checkout_lng', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Notes + Reason */}
      <Label text="Notes (optional)" />
      <input className="kinp" type="text" style={{ ...baseInp, marginBottom: 12 }}
        placeholder="Any notes for this record"
        value={form.notes} onChange={e => setF('notes', e.target.value)} />

      <Label text="Override Reason" />
      <textarea className="kinp" rows={2} style={{ ...baseInp, resize: 'none' as const, marginBottom: 6 }}
        placeholder="Why is this being set manually? (optional)"
        value={form.override_reason} onChange={e => setF('override_reason', e.target.value)} />
      <div style={{ fontSize: 11, color: C.grayd, marginBottom: 16 }}>
        If left blank, &quot;Manual override by admin&quot; will be recorded.
      </div>
    </>
  );

  /* ══════════════════════════ RENDER ══════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes kspin { to { transform: rotate(360deg); } }
        @keyframes kfade { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .kcard { transition: background .14s, border-color .14s; }
        .kcard:hover { background: ${C.s3} !important; border-color: ${C.borderL} !important; }
        .kinp:focus { border-color: ${C.blue} !important; }
        .kbtn { transition: opacity .13s, transform .13s; cursor: pointer; }
        .kbtn:hover { opacity: .82; }
        .kbtn:active { transform: scale(.96); }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, animation: 'kfade .3s ease', color: C.white }}>

        {/* error banner */}
        {err && (
          <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 12, padding: '11px 16px', fontSize: 13, color: C.red, display: 'flex', gap: 9, alignItems: 'center' }}>
            ⚠ {err}
            <button onClick={() => setErr('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {[
            { l: 'Total',       v: stats.total,  c: C.blue,   },
            { l: 'Checked In',  v: stats.in,     c: C.green,  },
            { l: 'Checked Out', v: stats.out,    c: C.purple, },
            { l: 'Absent',      v: stats.absent, c: C.red,    },
            { l: 'Half Day',    v: stats.half,   c: C.yellow, },
          ].map(s => (
            <div key={s.l} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, borderRadius: '3px 0 0 3px', background: s.c, opacity: .55 }} />
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 5, fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── Role Tabs ── */}
        <div style={{ display: 'flex', gap: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
          <button
            onClick={() => setRoleFilter('executive')}
            style={{
              padding: '8px 16px', background: roleFilter === 'executive' ? C.s3 : 'transparent',
              border: `1px solid ${roleFilter === 'executive' ? C.border : 'transparent'}`,
              borderRadius: 10, color: roleFilter === 'executive' ? C.white : C.gray,
              fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Field Executives
          </button>
          <button
            onClick={() => setRoleFilter('supervisor')}
            style={{
              padding: '8px 16px', background: roleFilter === 'supervisor' ? C.s3 : 'transparent',
              border: `1px solid ${roleFilter === 'supervisor' ? C.border : 'transparent'}`,
              borderRadius: 10, color: roleFilter === 'supervisor' ? C.white : C.gray,
              fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Supervisors
          </button>
        </div>

        {/* ── toolbar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Row 1: date + search + action buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
               <DateRangePicker from={fromDate} to={toDate} onChange={(f,t) => { setFrom(f); setTo(t); }} />
            </div>

            {/* search */}
            <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: .3 }}
                width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input className="kinp" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, ID or zone…"
                style={{ ...baseInp, paddingLeft: 34, borderRadius: 10 }} />
            </div>

            {/* right-side action buttons — always visible */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {/* export */}
              <button className="kbtn" onClick={() => { setExpErr(''); setShowExport(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: C.s2, border: `1px solid ${C.green}50`, borderRadius: 10, color: C.green, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' as const, boxShadow: '0 2px 12px rgba(0,217,126,0.12)' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                DOWNLOAD DATA NEW
              </button>

              {/* add override */}
              <button className="kbtn" onClick={() => { setForm(BLANK); setFErr(''); setShowAdd(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: C.red, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 18px rgba(224,30,44,0.28)', whiteSpace: 'nowrap' as const }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Override
              </button>

              <button className="kbtn" onClick={load}
                style={{ padding: '9px 12px', background: C.s2, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                ↻
              </button>
            </div>
          </div>

          {/* Row 2: status filter pills */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {(['all', 'checked_in', 'checked_out', 'absent', 'half_day'] as const).map(f => (
              <button key={f} className="kbtn" onClick={() => setSF(f)}
                style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${statusFilter === f ? C.red : C.border}`, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' as const, background: statusFilter === f ? C.red : C.s2, color: statusFilter === f ? '#fff' : C.gray, transition: 'all .15s' }}>
                {f === 'all' ? 'All' : f === 'checked_in' ? '● Checked In' : f === 'checked_out' ? '✓ Checked Out' : f === 'half_day' ? '⚠ Half Day' : '✕ Absent'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.grayd, alignSelf: 'center', fontWeight: 600 }}>
              {shown.length} of {currentRoleRecords.length} records
            </span>
          </div>
        </div>

        {/* ── table ── */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>

          {/* table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
            {['Executive', 'Status', 'Selfie', 'Check-in', 'Check-out', 'Hours', 'Zone', 'Actions'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 50, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
          ) : shown.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
              {currentRoleRecords.length === 0 ? `No attendance records for ${fmtDate(fromDate)}` : 'No results match your filters.'}
            </div>
          ) : (
            shown.map((r, i) => {
              const sm = statusMeta[r.status] || statusMeta.absent;
              return (
                <div key={r.id || `${r.user_id}_${r.date}`} className="kcard" onClick={() => setDetail(r)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '13px 20px', borderBottom: i < shown.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', alignItems: 'center', background: C.s2 }}>

                  {/* name */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: C.blueD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: C.blue, flexShrink: 0 }}>
                      {r.users?.name?.[0] || '?'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{r.users?.name || r.user_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: C.grayd }}>{r.users?.employee_id || ''}</div>
                    </div>
                  </div>

                  {/* status */}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5, background: sm.bg, color: sm.color, width: 'fit-content' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color, flexShrink: 0 }} />
                    {sm.label}
                  </span>

                  {/* selfie preview */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {r.checkin_selfie_url ? (
                      <img src={r.checkin_selfie_url} alt="In" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: `1px solid ${C.green}40` }} />
                    ) : <div style={{ width: 28, height: 28, borderRadius: 6, background: C.s3, border: `1px solid ${C.border}` }} />}
                    {r.checkout_selfie_url ? (
                      <img src={r.checkout_selfie_url} alt="Out" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: `1px solid ${C.blue}40` }} />
                    ) : null}
                  </div>

                  {/* check-in */}
                  <div style={{ fontSize: 13, color: r.checkin_at ? C.white : C.grayd }}>{fmt(r.checkin_at)}</div>

                  {/* check-out */}
                  <div style={{ fontSize: 13, color: r.checkout_at ? C.white : C.grayd }}>{fmt(r.checkout_at)}</div>

                  {/* hours */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: (r.total_hours || calcHours(r)) ? C.green : C.grayd }}>
                    {fmtHrs(calcHours(r))}
                  </div>

                  {/* zone */}
                  <div style={{ fontSize: 12, color: C.gray }}>{r.users?.zones?.name || '—'}</div>

                  {/* actions */}
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button className="kbtn" onClick={() => openEdit(r)}
                      style={{ width: 30, height: 30, borderRadius: 8, background: C.blueD, border: '1px solid rgba(62,158,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="kbtn" onClick={() => setDelRec(r)}
                      style={{ width: 30, height: 30, borderRadius: 8, background: C.redD, border: `1px solid ${C.redB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* row count */}
        {!loading && shown.length > 0 && (
          <div style={{ fontSize: 12, color: C.grayd, textAlign: 'right' }}>
            Showing {shown.length} of {currentRoleRecords.length} records for {fromDate === toDate ? fmtDate(fromDate) : `${fmtDate(fromDate)} - ${fmtDate(toDate)}`}
          </div>
        )}
      </div>

      {/* ══════ ADD OVERRIDE MODAL ══════ */}
      {showAdd && (
        <Overlay onClose={() => setShowAdd(false)}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 22, width: '100%', maxWidth: 500, padding: 28, maxHeight: '90vh', overflowY: 'auto', color: C.white }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800 }}>Add Attendance Override</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>Manually set attendance for an executive</div>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.gray, fontSize: 15 }}>✕</button>
            </div>

            {fErr && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 16 }}>{fErr}</div>}

            <Label text="Field Executive" req />
            <select className="kinp" style={{ ...baseInp, appearance: 'none' as const, marginBottom: 14 }}
              value={form.user_id} onChange={e => setF('user_id', e.target.value)}>
              <option value="">Select executive…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.employee_id ? ` (${u.employee_id})` : ''}</option>)}
            </select>
            {sharedFormFields}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="kbtn" onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: '11px', background: C.s3, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 11, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleCreate} disabled={saving}
                style={{ flex: 2, padding: '11px', background: C.red, border: 'none', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1, boxShadow: '0 4px 18px rgba(224,30,44,0.3)' }}>
                {saving ? <><Spinner />Saving…</> : 'Save Override'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ══════ EDIT MODAL ══════ */}
      {editRec && (
        <Overlay onClose={() => setEditRec(null)}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 22, width: '100%', maxWidth: 500, padding: 28, maxHeight: '90vh', overflowY: 'auto', color: C.white }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800 }}>Edit Attendance</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>{editRec.users?.name} · {fmtDate(editRec.date)}</div>
              </div>
              <button onClick={() => setEditRec(null)} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.gray, fontSize: 15 }}>✕</button>
            </div>

            {fErr && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 16 }}>{fErr}</div>}

            {sharedFormFields}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="kbtn" onClick={() => setEditRec(null)}
                style={{ flex: 1, padding: '11px', background: C.s3, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 11, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleUpdate} disabled={saving}
                style={{ flex: 2, padding: '11px', background: C.blue, border: 'none', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1, boxShadow: '0 4px 18px rgba(62,158,255,0.25)' }}>
                {saving ? <><Spinner />Saving…</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ══════ DETAIL MODAL ══════ */}
      {detail && !editRec && (
        <Overlay onClose={() => setDetail(null)}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 22, width: '100%', maxWidth: 440, padding: 28, color: C.white }}>
            <button onClick={() => setDetail(null)} style={{ float: 'right', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.gray, fontSize: 15 }}>✕</button>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 22, marginTop: 4 }}>
              <div style={{ width: 54, height: 54, borderRadius: 16, background: C.blueD, border: '1.5px solid rgba(62,158,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: C.blue, flexShrink: 0 }}>
                {detail.users?.name?.[0] || '?'}
              </div>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800 }}>{detail.users?.name}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{fmtDate(detail.date)} · {detail.users?.zones?.name || 'No zone'}</div>
                {(() => { const sm = statusMeta[detail.status]; return (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, marginTop: 6, display: 'inline-block', background: sm.bg, color: sm.color }}>
                    {sm.label}
                  </span>
                ); })()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
              {[
                { l: 'Check-in',  v: fmt(detail.checkin_at) },
                { l: 'Check-out', v: fmt(detail.checkout_at) },
                { l: 'Hours',     v: fmtHrs(calcHours(detail)) },
                { l: 'Break',     v: detail.break_minutes ? `${detail.break_minutes}m` : '—' },
              ].map(r => (
                <div key={r.l} style={{ background: C.s3, borderRadius: 11, padding: '11px 13px' }}>
                  <div style={{ fontSize: 10, color: C.grayd, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{r.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{r.v}</div>
                </div>
              ))}
            </div>

            {/* Coordinates / Locations */}
            {(detail.checkin_lat || detail.checkout_lat) && (
              <div style={{ marginBottom: 14, padding: '12px', background: C.s3, borderRadius: 11 }}>
                <div style={{ fontSize: 10, color: C.grayd, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location Data</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {detail.checkin_lat ? (
                    <div>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 2 }}>Check-in</div>
                      <a href={`https://maps.google.com/?q=${detail.checkin_lat},${detail.checkin_lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: 'none' }}>
                        {detail.checkin_lat.toFixed(5)}, {detail.checkin_lng?.toFixed(5)} ↗
                      </a>
                    </div>
                  ) : <div />}
                  {detail.checkout_lat ? (
                    <div>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 2 }}>Check-out</div>
                      <a href={`https://maps.google.com/?q=${detail.checkout_lat},${detail.checkout_lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: 'none' }}>
                        {detail.checkout_lat.toFixed(5)}, {detail.checkout_lng?.toFixed(5)} ↗
                      </a>
                    </div>
                  ) : <div />}
                </div>
              </div>
            )}

            {/* Selfie thumbnails */}
            {(detail.checkin_selfie_url || detail.checkout_selfie_url) && (
              <div style={{ display: 'grid', gridTemplateColumns: detail.checkin_selfie_url && detail.checkout_selfie_url ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
                {detail.checkin_selfie_url && (
                  <div>
                    <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check-in Selfie</div>
                    <a href={detail.checkin_selfie_url} target="_blank" rel="noreferrer">
                      <img src={detail.checkin_selfie_url} alt="Check-in selfie"
                        style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, border: `1px solid rgba(0,217,126,0.25)`, display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </a>
                  </div>
                )}
                {detail.checkout_selfie_url && (
                  <div>
                    <div style={{ fontSize: 10, color: C.grayd, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check-out Selfie</div>
                    <a href={detail.checkout_selfie_url} target="_blank" rel="noreferrer">
                      <img src={detail.checkout_selfie_url} alt="Check-out selfie"
                        style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, border: `1px solid rgba(62,158,255,0.25)`, display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {detail.override_reason && (
              <div style={{ background: C.yellowD, border: `1px solid rgba(255,184,0,0.2)`, borderRadius: 11, padding: '11px 13px', marginBottom: 14, fontSize: 12, color: C.yellow }}>
                <span style={{ fontWeight: 700 }}>Override note: </span>{detail.override_reason}
              </div>
            )}

            {detail.is_regularised && (
              <div style={{ background: 'rgba(155,110,255,0.08)', border: '1px solid rgba(155,110,255,0.2)', borderRadius: 11, padding: '10px 13px', marginBottom: 14, fontSize: 12, color: '#9B6EFF', display: 'flex', gap: 8, alignItems: 'center' }}>
                ✎ Regularised by admin
              </div>
            )}

            <div style={{ display: 'flex', gap: 9 }}>
              <button className="kbtn" onClick={() => { openEdit(detail); setDetail(null); }}
                style={{ flex: 1, padding: '11px', background: C.blueD, border: '1px solid rgba(62,158,255,0.18)', color: C.blue, borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                ✎ Edit
              </button>
              <button className="kbtn" onClick={() => { setDelRec(detail); setDetail(null); }}
                style={{ flex: 1, padding: '11px', background: C.redD, border: `1px solid ${C.redB}`, color: C.red, borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
                Mark Absent
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ══════ DELETE CONFIRM ══════ */}
      {delRec && (
        <Overlay onClose={() => setDelRec(null)}>
          <div style={{ background: C.s2, border: `1px solid ${C.redB}`, borderRadius: 22, width: '100%', maxWidth: 400, padding: 28, color: C.white }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: C.redD, border: `1px solid ${C.redB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth={2} strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Mark as Absent?</div>
            <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.6, marginBottom: 22 }}>
              This will override <span style={{ color: C.white, fontWeight: 600 }}>{delRec.users?.name}</span>&apos;s attendance for {fmtDate(delRec.date)} to <span style={{ color: C.red, fontWeight: 600 }}>Absent</span>.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="kbtn" onClick={() => setDelRec(null)}
                style={{ flex: 1, padding: '11px', background: C.s3, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 11, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleDelete} disabled={saving}
                style={{ flex: 1, padding: '11px', background: C.red, border: 'none', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
                {saving ? <><Spinner />Working…</> : 'Confirm'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
      {/* ══════ EXPORT MODAL ══════ */}
      {showExport && (
        <Overlay onClose={() => setShowExport(false)}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 22, width: '100%', maxWidth: 520, padding: 28, color: C.white }}>
            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800 }}>Export Attendance</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>Downloads a CSV with city-wise, role-wise & executive-wise breakdown</div>
              </div>
              <button onClick={() => setShowExport(false)} style={{ width: 32, height: 32, borderRadius: 9, background: C.s3, border: `1px solid ${C.border}`, cursor: 'pointer', color: C.gray, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>

            {expErr && (
              <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 16 }}>{expErr}</div>
            )}

            {/* date range */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Date Range</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5 }}>From</div>
                <input className="kinp" type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)}
                  style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, color: C.white, borderRadius: 10, padding: '10px 13px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.grayd, marginBottom: 5 }}>To</div>
                <input className="kinp" type="date" value={expTo} onChange={e => setExpTo(e.target.value)}
                  style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, color: C.white, borderRadius: 10, padding: '10px 13px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif" }} />
              </div>
            </div>

            {/* what&apos;s included */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: 10 }}>What&apos;s Included (5 sheets)</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 20 }}>
              {[
                { icon: '📊', title: 'Summary',      desc: 'Per-executive: total days, present, half days, hours worked' },
                { icon: '🏙️', title: 'City Wise',    desc: 'Grouped by city — total execs, attendance rates, total hours' },
                { icon: '👥', title: 'Role Wise',     desc: 'Executives vs Supervisors vs City Managers breakdown' },
                { icon: '📅', title: 'Day Detail',    desc: 'Every record with check-in/out times, hours, midnight flag' },
                { icon: '📋', title: 'Policy Notes',  desc: 'Midnight crossover & half-day calculation rules documented' },
              ].map(s => (
                <div key={s.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: C.s3, borderRadius: 11, border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* midnight crossover note */}
            <div style={{ background: 'rgba(255,184,0,0.07)', border: `1px solid rgba(255,184,0,0.2)`, borderRadius: 12, padding: '12px 15px', marginBottom: 20, fontSize: 12, color: C.yellow, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Midnight Crossover Handling</div>
              If checkout is earlier than check-in on the same record (e.g. in at <strong>9 PM</strong>, out at <strong>2 AM</strong>), the system adds <strong>+24 hours</strong> to the checkout before calculating duration. These records are flagged <em>&quot;YES — checkout next day&quot;</em> in the Day Detail sheet. Capped at 24h to guard bad data.
              <div style={{ marginTop: 6, fontWeight: 600 }}>Half Day rule: any shift under 4 hours is auto-classified as Half Day.</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="kbtn" onClick={() => setShowExport(false)}
                style={{ flex: 1, padding: '12px', background: C.s3, border: `1px solid ${C.border}`, color: C.gray, borderRadius: 11, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={runExport} disabled={expLoading || !expFrom || !expTo}
                style={{ flex: 2, padding: '12px', background: C.green, border: 'none', color: '#000', borderRadius: 11, fontSize: 13, fontWeight: 800, fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (expLoading || !expFrom || !expTo) ? 0.6 : 1, cursor: (expLoading || !expFrom || !expTo) ? 'not-allowed' : 'pointer', boxShadow: '0 4px 18px rgba(0,217,126,0.25)' }}>
                {expLoading
                  ? <><Spinner />Fetching data…</>
                  : <><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download CSV</>
                }
              </button>
            </div>
          </div>
        </Overlay>
      )}

    </>
  );
}


