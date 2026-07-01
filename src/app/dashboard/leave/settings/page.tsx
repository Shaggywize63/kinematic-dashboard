'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  leaveApi,
  type LeaveType,
  type LeaveTypeInput,
  type Holiday,
} from '../../../../lib/leaveApi';
import {
  card, input, label, btnPrimary, btnGhost, btnSmallGhost, btnSmallDanger,
  PageHeader, LeaveTabs, Modal, useLeaveRoles, fmtDate,
} from '../_ui';

const emptyType: LeaveTypeInput = {
  name: '', code: '', is_paid: true, annual_quota: null, allow_half_day: true,
  max_carry_forward: null, requires_attachment: false, color: '#6366f1', is_active: true,
};

export default function LeaveSettingsPage() {
  const { canManage, canAdmin } = useLeaveRoles();
  const year = new Date().getFullYear();

  const [types, setTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayYear, setHolidayYear] = useState(year);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);

  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const [hOptional, setHOptional] = useState(false);
  const [addingHoliday, setAddingHoliday] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      const r = await leaveApi.listTypes();
      setTypes((r.data || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } catch (e: any) { toast.error(e.message || 'Failed to load types'); }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const r = await leaveApi.listHolidays(holidayYear);
      setHolidays((r.data || []).slice().sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
    } catch (e: any) { toast.error(e.message || 'Failed to load holidays'); }
  }, [holidayYear]);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadTypes(), loadHolidays()]); setLoading(false); })();
  }, [loadTypes, loadHolidays]);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const openNew = () => { setEditing(null); setShowTypeModal(true); };
  const openEdit = (t: LeaveType) => { setEditing(t); setShowTypeModal(true); };

  const toggleActive = async (t: LeaveType) => {
    setBusy((s) => ({ ...s, [t.id + '_a']: true }));
    try {
      await leaveApi.updateType(t.id, { is_active: !t.is_active });
      toast.success(t.is_active ? 'Deactivated' : 'Activated');
      loadTypes();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((s) => ({ ...s, [t.id + '_a']: false })); }
  };

  const removeType = async (t: LeaveType) => {
    if (!window.confirm(`Delete leave type "${t.name}"?`)) return;
    setBusy((s) => ({ ...s, [t.id + '_d']: true }));
    try {
      await leaveApi.deleteType(t.id);
      toast.success('Deleted');
      loadTypes();
    } catch (e: any) { toast.error(e.message || 'Delete failed — it may be in use'); }
    finally { setBusy((s) => ({ ...s, [t.id + '_d']: false })); }
  };

  const addHoliday = async () => {
    if (!hDate) return toast.error('Pick a date');
    if (!hName.trim()) return toast.error('Enter a name');
    setAddingHoliday(true);
    try {
      await leaveApi.createHoliday({ holiday_date: hDate, name: hName.trim(), is_optional: hOptional });
      toast.success('Holiday added');
      setHDate(''); setHName(''); setHOptional(false);
      loadHolidays();
    } catch (e: any) { toast.error(e.message || 'Add failed'); }
    finally { setAddingHoliday(false); }
  };

  const removeHoliday = async (h: Holiday) => {
    if (!window.confirm(`Delete holiday "${h.name}"?`)) return;
    setBusy((s) => ({ ...s, [h.id]: true }));
    try {
      await leaveApi.deleteHoliday(h.id);
      toast.success('Deleted');
      loadHolidays();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((s) => ({ ...s, [h.id]: false })); }
  };

  return (
    <div>
      <PageHeader title="Leave Settings" subtitle="Configure leave types and the holiday calendar for your organization." />
      <LeaveTabs active="settings" canManage={canManage} canAdmin={canAdmin} />

      {/* Leave types */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Leave Types ({types.length})</div>
          <button style={btnPrimary} onClick={openNew}>+ Add Type</button>
        </div>
        {loading && types.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : types.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No leave types yet. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {types.map((t) => (
              <div key={t.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderLeft: `4px solid ${t.color || 'var(--primary)'}` }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {t.name} <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>({t.code})</span>
                    {!t.is_active && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>INACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {t.is_paid ? 'Paid' : 'Unpaid'} · Quota {t.annual_quota ?? '∞'}
                    {t.allow_half_day ? ' · half-day' : ''}
                    {t.requires_attachment ? ' · attachment req.' : ''}
                    {t.max_carry_forward != null ? ` · carry ${t.max_carry_forward}` : ''}
                  </div>
                </div>
                <button style={btnSmallGhost} onClick={() => openEdit(t)}>Edit</button>
                <button style={btnSmallGhost} disabled={!!busy[t.id + '_a']} onClick={() => toggleActive(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                <button style={{ ...btnSmallDanger, opacity: busy[t.id + '_d'] ? 0.5 : 1 }} disabled={!!busy[t.id + '_d']} onClick={() => removeType(t)}>{busy[t.id + '_d'] ? '…' : 'Delete'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Holiday calendar */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Holiday Calendar</div>
          <div>
            <label style={{ ...label, display: 'inline-block', marginRight: 6, marginBottom: 0 }}>Year</label>
            <input type="number" value={holidayYear} onChange={(e) => setHolidayYear(Number(e.target.value) || year)} style={{ ...input, width: 100, display: 'inline-block' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} style={{ ...input, width: 'auto' }} />
          <input value={hName} onChange={(e) => setHName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHoliday()} placeholder="Holiday name (e.g. Diwali)" style={input} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={hOptional} onChange={(e) => setHOptional(e.target.checked)} /> Optional
          </label>
          <button style={btnPrimary} disabled={addingHoliday} onClick={addHoliday}>{addingHoliday ? '…' : '+ Add'}</button>
        </div>
        {loading && holidays.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : holidays.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No holidays for {holidayYear}.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {holidays.map((h) => (
              <div key={h.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>{fmtDate(h.holiday_date)}</span>
                  {h.is_optional && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>OPTIONAL</span>}
                </div>
                <button style={{ ...btnSmallDanger, opacity: busy[h.id] ? 0.5 : 1 }} disabled={!!busy[h.id]} onClick={() => removeHoliday(h)}>{busy[h.id] ? '…' : 'Delete'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTypeModal && (
        <LeaveTypeModal
          initial={editing}
          onClose={() => setShowTypeModal(false)}
          onDone={() => { setShowTypeModal(false); loadTypes(); }}
        />
      )}
    </div>
  );
}

function LeaveTypeModal({ initial, onClose, onDone }: {
  initial: LeaveType | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<LeaveTypeInput>(initial ? { ...initial } : { ...emptyType });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof LeaveTypeInput>(k: K, v: LeaveTypeInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name?.trim()) return toast.error('Name is required');
    if (!form.code?.trim()) return toast.error('Code is required');
    setSaving(true);
    try {
      const body: LeaveTypeInput = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        is_paid: !!form.is_paid,
        annual_quota: form.annual_quota === null || form.annual_quota === undefined ? null : Number(form.annual_quota),
        allow_half_day: !!form.allow_half_day,
        max_carry_forward: form.max_carry_forward === null || form.max_carry_forward === undefined ? null : Number(form.max_carry_forward),
        requires_attachment: !!form.requires_attachment,
        color: form.color || null,
        is_active: form.is_active ?? true,
      };
      if (initial) await leaveApi.updateType(initial.id, body);
      else await leaveApi.createType(body);
      toast.success(initial ? 'Leave type updated' : 'Leave type added');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const numOrNull = (v: string) => (v === '' ? null : Number(v));

  return (
    <Modal title={initial ? 'Edit Leave Type' : 'Add Leave Type'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>Name</label>
            <input value={form.name || ''} onChange={(e) => set('name', e.target.value)} style={input} placeholder="Casual Leave" />
          </div>
          <div>
            <label style={label}>Code</label>
            <input value={form.code || ''} onChange={(e) => set('code', e.target.value)} style={input} placeholder="CL" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>Annual Quota</label>
            <input type="number" value={form.annual_quota ?? ''} onChange={(e) => set('annual_quota', numOrNull(e.target.value))} style={input} placeholder="∞" />
          </div>
          <div>
            <label style={label}>Max Carry Fwd</label>
            <input type="number" value={form.max_carry_forward ?? ''} onChange={(e) => set('max_carry_forward', numOrNull(e.target.value))} style={input} placeholder="—" />
          </div>
          <div>
            <label style={label}>Color</label>
            <input type="color" value={form.color || '#6366f1'} onChange={(e) => set('color', e.target.value)} style={{ ...input, padding: 2, height: 36 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <label style={chk}><input type="checkbox" checked={!!form.is_paid} onChange={(e) => set('is_paid', e.target.checked)} /> Paid</label>
          <label style={chk}><input type="checkbox" checked={!!form.allow_half_day} onChange={(e) => set('allow_half_day', e.target.checked)} /> Allow half-day</label>
          <label style={chk}><input type="checkbox" checked={!!form.requires_attachment} onChange={(e) => set('requires_attachment', e.target.checked)} /> Requires attachment</label>
          <label style={chk}><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} /> Active</label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' };
