'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  leaveApi,
  REGULARIZATION_TYPE_LABELS,
  type Regularization,
  type RegularizationType,
} from '../../../../lib/leaveApi';
import {
  card, input, label, btnPrimary, btnGhost,
  StatusChip, PageHeader, LeaveTabs, Modal, useLeaveRoles, fmtDate,
} from '../_ui';

const TYPE_OPTIONS: RegularizationType[] = [
  'missing_checkin', 'missing_checkout', 'wrong_time', 'on_duty', 'wfh',
];

// Types that carry a requested check-in / check-out time.
const needsCheckin = (t: RegularizationType) => t === 'missing_checkin' || t === 'wrong_time';
const needsCheckout = (t: RegularizationType) => t === 'missing_checkout' || t === 'wrong_time';

export default function RegularizePage() {
  const { canManage, canAdmin } = useLeaveRoles();
  const [rows, setRows] = useState<Regularization[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await leaveApi.listRegularizations();
      setRows(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Attendance Regularization"
        subtitle="Raise a correction when you missed a check-in/out, worked off-site, or from home."
        action={<button style={btnPrimary} onClick={() => setShow(true)}>+ New Request</button>}
      />
      <LeaveTabs active="regularize" canManage={canManage} canAdmin={canAdmin} />

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>My Regularizations ({rows.length})</div>
        {loading && rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No regularization requests yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {REGULARIZATION_TYPE_LABELS[r.type]}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>{fmtDate(r.att_date)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {r.requested_checkin_at && <>In: {new Date(r.requested_checkin_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} </>}
                    {r.requested_checkout_at && <>Out: {new Date(r.requested_checkout_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                  </div>
                  {r.reason && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{r.reason}</div>}
                </div>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {show && (
        <RegularizeModal onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />
      )}
    </div>
  );
}

function RegularizeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [attDate, setAttDate] = useState(today);
  const [type, setType] = useState<RegularizationType>('missing_checkin');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const toISO = (t: string) => (t ? new Date(`${attDate}T${t}:00`).toISOString() : undefined);

  const submit = async () => {
    if (!attDate) return toast.error('Pick the attendance date');
    if (needsCheckin(type) && !checkin) return toast.error('Enter the check-in time');
    if (needsCheckout(type) && !checkout) return toast.error('Enter the check-out time');
    setSaving(true);
    try {
      await leaveApi.createRegularization({
        att_date: attDate,
        type,
        requested_checkin_at: needsCheckin(type) ? toISO(checkin) : undefined,
        requested_checkout_at: needsCheckout(type) ? toISO(checkout) : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success('Regularization submitted');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Could not submit');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Attendance Regularization" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>Date</label>
            <input type="date" value={attDate} max={today} onChange={(e) => setAttDate(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as RegularizationType)} style={input as any}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{REGULARIZATION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>
        {(needsCheckin(type) || needsCheckout(type)) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {needsCheckin(type) && (
              <div>
                <label style={label}>Check-in Time</label>
                <input type="time" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={input} />
              </div>
            )}
            {needsCheckout(type) && (
              <div>
                <label style={label}>Check-out Time</label>
                <input type="time" value={checkout} onChange={(e) => setCheckout(e.target.value)} style={input} />
              </div>
            )}
          </div>
        )}
        <div>
          <label style={label}>Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Explain the correction (optional)" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={submit}>
            {saving ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
