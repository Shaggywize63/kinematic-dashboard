'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  leaveApi,
  workingDayCount,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
  type Holiday,
} from '../../../lib/leaveApi';
import {
  card, input, label, btnPrimary, btnGhost, btnSmallDanger,
  StatusChip, PageHeader, LeaveTabs, Modal, useLeaveRoles, fmtDate,
} from './_ui';

export default function MyLeavePage() {
  const { canManage, canAdmin } = useLeaveRoles();
  const year = new Date().getFullYear();

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, t, h] = await Promise.allSettled([
        leaveApi.listBalances(year),
        leaveApi.listRequests(),
        leaveApi.listTypes(),
        leaveApi.listHolidays(year),
      ]);
      if (b.status === 'fulfilled') setBalances(b.value.data || []);
      if (r.status === 'fulfilled') setRequests(r.value.data || []);
      if (t.status === 'fulfilled') setTypes((t.value.data || []).filter((x) => x.is_active));
      if (h.status === 'fulfilled') setHolidays(h.value.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load leave');
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (req: LeaveRequest) => {
    if (!window.confirm('Cancel this leave request?')) return;
    setBusy((s) => ({ ...s, [req.id]: true }));
    try {
      await leaveApi.cancelRequest(req.id);
      toast.success('Leave cancelled');
      load();
    } catch (e: any) { toast.error(e.message || 'Cancel failed'); }
    finally { setBusy((s) => ({ ...s, [req.id]: false })); }
  };

  const typeName = (id: string) => types.find((t) => t.id === id)?.name || 'Leave';

  return (
    <div>
      <PageHeader
        title="My Leave"
        subtitle="View your balances, apply for leave and track request status."
        action={<button style={btnPrimary} onClick={() => setShowApply(true)}>+ Apply Leave</button>}
      />
      <LeaveTabs active="mine" canManage={canManage} canAdmin={canAdmin} />

      {/* Balance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        {loading && balances.length === 0 ? (
          <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>Loading balances…</div>
        ) : balances.length === 0 ? (
          <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>No leave balances configured.</div>
        ) : balances.map((b) => (
          <div key={b.leave_type_id} style={{ ...card, padding: 16, borderLeft: `4px solid ${b.color || 'var(--primary)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{b.name}</div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text-dim)' }}>
                {b.is_paid ? 'PAID' : 'UNPAID'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>
                {b.unlimited ? '∞' : b.available}
              </span>
              {!b.unlimited && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>/ {b.entitled} available</span>}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              <span>Used <strong style={{ color: 'var(--text)' }}>{b.used}</strong></span>
              <span>Pending <strong style={{ color: 'var(--text)' }}>{b.pending}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* My requests */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>My Requests ({requests.length})</div>
        {loading && requests.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : requests.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No leave requests yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {requests.map((r) => (
              <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {r.leave_type_name || typeName(r.leave_type_id)}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                      {fmtDate(r.from_date)}{r.from_date !== r.to_date ? ` → ${fmtDate(r.to_date)}` : ''} · {r.days} day{r.days === 1 ? '' : 's'}
                      {r.half_day_start ? ' · ½ start' : ''}{r.half_day_end ? ' · ½ end' : ''}
                    </span>
                  </div>
                  {r.reason && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{r.reason}</div>}
                  {r.status === 'rejected' && r.decision_note && (
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Note: {r.decision_note}</div>
                  )}
                </div>
                <StatusChip status={r.status} />
                {(r.status === 'pending' || r.status === 'approved') && (
                  <button
                    style={{ ...btnSmallDanger, opacity: busy[r.id] ? 0.5 : 1 }}
                    disabled={!!busy[r.id]}
                    onClick={() => cancel(r)}
                  >{busy[r.id] ? '…' : 'Cancel'}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showApply && (
        <ApplyLeaveModal
          types={types}
          holidays={holidays}
          onClose={() => setShowApply(false)}
          onDone={() => { setShowApply(false); load(); }}
        />
      )}
    </div>
  );
}

function ApplyLeaveModal({ types, holidays, onClose, onDone }: {
  types: LeaveType[];
  holidays: Holiday[];
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.id || '');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [halfStart, setHalfStart] = useState(false);
  const [halfEnd, setHalfEnd] = useState(false);
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [attachment, setAttachment] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const holidayDates = useMemo(() => holidays.map((h) => h.holiday_date), [holidays]);
  const days = useMemo(
    () => workingDayCount(fromDate, toDate, halfStart, halfEnd, holidayDates),
    [fromDate, toDate, halfStart, halfEnd, holidayDates],
  );

  const submit = async () => {
    if (!leaveTypeId) return toast.error('Pick a leave type');
    if (!fromDate || !toDate) return toast.error('Pick the from/to dates');
    if (toDate < fromDate) return toast.error('End date is before start date');
    if (selectedType?.requires_attachment && !attachment.trim()) {
      return toast.error('This leave type requires an attachment URL');
    }
    setSaving(true);
    try {
      await leaveApi.createRequest({
        leave_type_id: leaveTypeId,
        from_date: fromDate,
        to_date: toDate,
        half_day_start: halfStart || undefined,
        half_day_end: halfEnd || undefined,
        reason: reason.trim() || undefined,
        contact_number: contact.trim() || undefined,
        attachment_url: attachment.trim() || undefined,
      });
      toast.success('Leave request submitted');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Could not submit leave');
    } finally { setSaving(false); }
  };

  const allowHalf = selectedType?.allow_half_day !== false;

  return (
    <Modal title="Apply for Leave" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={label}>Leave Type</label>
          <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} style={input as any}>
            <option value="">Select…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.is_paid ? '' : ' (unpaid)'}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>To</label>
            <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} style={input} />
          </div>
        </div>
        {allowHalf && (
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={halfStart} onChange={(e) => setHalfStart(e.target.checked)} />
              Half day (start)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={halfEnd} disabled={fromDate === toDate} onChange={(e) => setHalfEnd(e.target.checked)} />
              Half day (end)
            </label>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--s3)', padding: '8px 12px', borderRadius: 8 }}>
          Approx <strong style={{ color: 'var(--text)' }}>{days}</strong> working day{days === 1 ? '' : 's'} (excludes weekends & holidays). Final count is set on approval.
        </div>
        <div>
          <label style={label}>Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} placeholder="Optional" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>Contact Number</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)} style={input} placeholder="Optional" />
          </div>
          <div>
            <label style={label}>Attachment URL{selectedType?.requires_attachment ? ' *' : ''}</label>
            <input value={attachment} onChange={(e) => setAttachment(e.target.value)} style={input} placeholder="https://…" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={submit}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
