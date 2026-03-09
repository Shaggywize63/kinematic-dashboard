'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

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
  checkout_at?: string;
  checkin_lat?: number;
  checkin_lng?: number;
  checkout_lat?: number;
  checkout_lng?: number;
  checkin_selfie_url?: string;
  checkin_verified?: boolean;
  total_hours?: number;
  break_minutes?: number;
  override_reason?: string;
  users?: { name: string; employee_id?: string; zones?: { name: string } };
}

interface FormData {
  user_id: string;
  date: string;
  status: string;
  checkin_at: string;
  checkout_at: string;
  override_reason: string;
}

const BLANK: FormData = {
  user_id: '', date: new Date().toISOString().split('T')[0],
  status: 'checked_in', checkin_at: '', checkout_at: '', override_reason: '',
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

/* ═══════════════════════════════════════════════════ */
export default function AttendancePage() {
  const [records,  setRecords]  = useState<AttendanceRecord[]>([]);
  const [users,    setUsers]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [dateFilter, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setSF]   = useState('all');
  const [search,   setSearch]   = useState('');

  /* modals */
  const [showAdd,  setShowAdd]  = useState(false);
  const [editRec,  setEditRec]  = useState<AttendanceRecord | null>(null);
  const [detail,   setDetail]   = useState<AttendanceRecord | null>(null);
  const [delRec,   setDelRec]   = useState<AttendanceRecord | null>(null);

  /* form */
  const [form,    setForm]    = useState<FormData>(BLANK);
  const [fErr,    setFErr]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const setF = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── fetch ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [attRes, usersRes] = await Promise.all([
        api.get<any>(`/api/v1/attendance/team?date=${dateFilter}`),
        api.get<any>('/api/v1/users?role=executive&limit=200'),
      ]);
      const pick = (r: any) => (r as any)?.data ?? (Array.isArray(r) ? r : []);
      setRecords(pick(attRes));
      setUsers(pick(usersRes));
      setErr('');
    } catch (e: any) {
      setErr(e.message || 'Failed to load attendance');
    } finally { setLoading(false); }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  /* ── CREATE (admin override) ── */
  const handleCreate = async () => {
    if (!form.user_id || !form.date || !form.status) { setFErr('Executive, date and status are required.'); return; }
    if (!form.override_reason.trim()) { setFErr('Override reason is required for manual attendance.'); return; }
    setSaving(true); setFErr('');
    try {
      await api.post('/api/v1/attendance/override', {
        user_id:         form.user_id,
        date:            form.date,
        status:          form.status,
        checkin_at:      form.checkin_at  ? `${form.date}T${form.checkin_at}:00` : undefined,
        checkout_at:     form.checkout_at ? `${form.date}T${form.checkout_at}:00` : undefined,
        override_reason: form.override_reason.trim(),
      });
      setShowAdd(false); setForm(BLANK); load();
    } catch (e: any) { setFErr(e.message || 'Failed to create record'); }
    finally { setSaving(false); }
  };

  /* ── UPDATE ── */
  const openEdit = (r: AttendanceRecord) => {
    setEditRec(r);
    setForm({
      user_id:         r.user_id,
      date:            r.date,
      status:          r.status,
      checkin_at:      r.checkin_at  ? new Date(r.checkin_at).toTimeString().slice(0,5)  : '',
      checkout_at:     r.checkout_at ? new Date(r.checkout_at).toTimeString().slice(0,5) : '',
      override_reason: r.override_reason || '',
    });
    setFErr('');
  };
  const handleUpdate = async () => {
    if (!editRec) return;
    if (!form.override_reason.trim()) { setFErr('Please provide a reason for this change.'); return; }
    setSaving(true); setFErr('');
    try {
      await api.patch(`/api/v1/attendance/${editRec.id}/override`, {
        status:          form.status,
        checkin_at:      form.checkin_at  ? `${editRec.date}T${form.checkin_at}:00`  : undefined,
        checkout_at:     form.checkout_at ? `${editRec.date}T${form.checkout_at}:00` : undefined,
        override_reason: form.override_reason.trim(),
      });
      setEditRec(null); setDetail(null); load();
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

  /* ── filtered ── */
  const shown = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (r.users?.name || '').toLowerCase().includes(q)
      || (r.users?.employee_id || '').toLowerCase().includes(q)
      || (r.users?.zones?.name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:    records.length,
    in:       records.filter(r => r.status === 'checked_in').length,
    out:      records.filter(r => r.status === 'checked_out').length,
    absent:   records.filter(r => r.status === 'absent').length,
    half:     records.filter(r => r.status === 'half_day').length,
  };

  /* ── shared form body (used in both add + edit modals) ── */
  const FormBody = ({ isEdit }: { isEdit?: boolean }) => (
    <>
      {!isEdit && (
        <>
          <Label text="Field Executive" req />
          <select className="kinp" style={{ ...baseInp, appearance: 'none' as const, marginBottom: 14 }}
            value={form.user_id} onChange={e => setF('user_id', e.target.value)}>
            <option value="">Select executive…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.employee_id ? ` (${u.employee_id})` : ''}</option>)}
          </select>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <Label text="Date" req />
          <input className="kinp" type="date" style={baseInp}
            value={form.date} onChange={e => setF('date', e.target.value)}
            readOnly={isEdit} style={{ ...baseInp, opacity: isEdit ? 0.6 : 1 }}/>
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
        <div>
          <Label text="Check-in Time" />
          <input className="kinp" type="time" style={baseInp}
            value={form.checkin_at} onChange={e => setF('checkin_at', e.target.value)} />
        </div>
        <div>
          <Label text="Check-out Time" />
          <input className="kinp" type="time" style={baseInp}
            value={form.checkout_at} onChange={e => setF('checkout_at', e.target.value)} />
        </div>
      </div>

      <Label text="Override Reason" req />
      <textarea className="kinp" rows={3} style={{ ...baseInp, resize: 'none' as const, marginBottom: 6 }}
        placeholder="Why is this being set manually?"
        value={form.override_reason} onChange={e => setF('override_reason', e.target.value)} />
      <div style={{ fontSize: 11, color: C.grayd, marginBottom: 16 }}>
        This will be logged as an admin override with your user ID.
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

        {/* ── toolbar ── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* date picker */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: .35, pointerEvents: 'none' }}
              width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input type="date" value={dateFilter} onChange={e => setDate(e.target.value)}
              className="kinp"
              style={{ ...baseInp, width: 'auto', paddingLeft: 32, borderRadius: 10 }} />
          </div>

          {/* search */}
          <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: .3 }}
              width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input className="kinp" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, ID or zone…"
              style={{ ...baseInp, paddingLeft: 34, borderRadius: 10 }} />
          </div>

          {/* status filter */}
          {(['all', 'checked_in', 'checked_out', 'absent', 'half_day'] as const).map(f => (
            <button key={f} className="kbtn" onClick={() => setSF(f)}
              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${statusFilter === f ? C.red : C.border}`, fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap', background: statusFilter === f ? C.red : C.s2, color: statusFilter === f ? '#fff' : C.gray, transition: 'all .15s' }}>
              {f === 'all' ? 'All' : f === 'checked_in' ? 'In' : f === 'checked_out' ? 'Out' : f === 'half_day' ? 'Half' : 'Absent'}
            </button>
          ))}

          {/* add override */}
          <button className="kbtn" onClick={() => { setForm(BLANK); setFErr(''); setShowAdd(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: C.red, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 18px rgba(224,30,44,0.28)', flexShrink: 0 }}>
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

        {/* ── table ── */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>

          {/* table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
            {['Executive', 'Status', 'Check-in', 'Check-out', 'Hours', 'Zone', 'Actions'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.7px', textTransform: 'uppercase' as const }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 50, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
          ) : shown.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: C.grayd, fontSize: 14 }}>
              {records.length === 0 ? `No attendance records for ${fmtDate(dateFilter)}` : 'No results match your filters.'}
            </div>
          ) : (
            shown.map((r, i) => {
              const sm = statusMeta[r.status] || statusMeta.absent;
              return (
                <div key={r.id} className="kcard" onClick={() => setDetail(r)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '13px 20px', borderBottom: i < shown.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', alignItems: 'center', background: C.s2 }}>

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

                  {/* check-in */}
                  <div style={{ fontSize: 13, color: r.checkin_at ? C.white : C.grayd }}>{fmt(r.checkin_at)}</div>

                  {/* check-out */}
                  <div style={{ fontSize: 13, color: r.checkout_at ? C.white : C.grayd }}>{fmt(r.checkout_at)}</div>

                  {/* hours */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: r.total_hours ? C.green : C.grayd }}>
                    {r.total_hours ? `${r.total_hours.toFixed(1)}h` : '—'}
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
            Showing {shown.length} of {records.length} records for {fmtDate(dateFilter)}
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

            <FormBody />

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

            <FormBody isEdit />

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
                { l: 'Hours',     v: detail.total_hours ? `${detail.total_hours.toFixed(1)}h` : '—' },
                { l: 'Break',     v: detail.break_minutes ? `${detail.break_minutes}m` : '—' },
              ].map(r => (
                <div key={r.l} style={{ background: C.s3, borderRadius: 11, padding: '11px 13px' }}>
                  <div style={{ fontSize: 10, color: C.grayd, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{r.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{r.v}</div>
                </div>
              ))}
            </div>

            {detail.override_reason && (
              <div style={{ background: C.yellowD, border: `1px solid rgba(255,184,0,0.2)`, borderRadius: 11, padding: '11px 13px', marginBottom: 16, fontSize: 12, color: C.yellow }}>
                <span style={{ fontWeight: 700 }}>Override note: </span>{detail.override_reason}
              </div>
            )}

            {detail.checkin_verified && (
              <div style={{ background: C.greenD, border: `1px solid ${C.greenB}`, borderRadius: 11, padding: '10px 13px', marginBottom: 16, fontSize: 12, color: C.green, display: 'flex', gap: 8, alignItems: 'center' }}>
                ✓ Geo-fence & selfie verified
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
              This will override <span style={{ color: C.white, fontWeight: 600 }}>{delRec.users?.name}</span>'s attendance for {fmtDate(delRec.date)} to <span style={{ color: C.red, fontWeight: 600 }}>Absent</span>.
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
    </>
  );
}
