'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  leaveApi,
  REGULARIZATION_TYPE_LABELS,
  type LeaveRequest,
  type Regularization,
  type CalendarEntry,
  type Decision,
} from '../../../../lib/leaveApi';
import {
  card, input, label, btnSmallSuccess, btnSmallDanger,
  StatusChip, PageHeader, LeaveTabs, useLeaveRoles, fmtDate,
} from '../_ui';

// First / last calendar day for a YYYY-MM month string.
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(y, m, 0).toISOString().slice(0, 10); // day 0 of next month = last day
  return { from, to };
}

export default function ApprovalsPage() {
  const { canManage, canAdmin } = useLeaveRoles();
  const [leaveReqs, setLeaveReqs] = useState<LeaveRequest[]>([]);
  const [regs, setRegs] = useState<Regularization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, rg] = await Promise.allSettled([
        leaveApi.listPendingRequests(),
        leaveApi.listPendingRegularizations(),
      ]);
      if (lr.status === 'fulfilled') setLeaveReqs(lr.value.data || []);
      if (rg.status === 'fulfilled') setRegs(rg.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load pending items'); }
    finally { setLoading(false); }
  }, []);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const { from, to } = monthRange(month);
      const r = await leaveApi.calendar(from, to);
      setCalendar(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load calendar'); }
    finally { setCalLoading(false); }
  }, [month]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const decideLeave = async (id: string, decision: Decision) => {
    const note = decision === 'rejected' ? (window.prompt('Rejection note (optional):') ?? undefined) : undefined;
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      await leaveApi.decideRequest(id, { decision, note: note || undefined });
      toast.success(`Leave ${decision}`);
      loadPending();
      loadCalendar();
    } catch (e: any) { toast.error(e.message || 'Action failed'); }
    finally { setBusy((s) => ({ ...s, [id]: false })); }
  };

  const decideReg = async (id: string, decision: Decision) => {
    const note = decision === 'rejected' ? (window.prompt('Rejection note (optional):') ?? undefined) : undefined;
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      await leaveApi.decideRegularization(id, { decision, note: note || undefined });
      toast.success(`Regularization ${decision}`);
      loadPending();
    } catch (e: any) { toast.error(e.message || 'Action failed'); }
    finally { setBusy((s) => ({ ...s, [id]: false })); }
  };

  const ActionBtns = ({ id, kind }: { id: string; kind: 'leave' | 'reg' }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        style={{ ...btnSmallSuccess, opacity: busy[id] ? 0.5 : 1 }}
        disabled={!!busy[id]}
        onClick={() => (kind === 'leave' ? decideLeave(id, 'approved') : decideReg(id, 'approved'))}
      >Approve</button>
      <button
        style={{ ...btnSmallDanger, opacity: busy[id] ? 0.5 : 1 }}
        disabled={!!busy[id]}
        onClick={() => (kind === 'leave' ? decideLeave(id, 'rejected') : decideReg(id, 'rejected'))}
      >Reject</button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Leave Approvals" subtitle="Review your team's pending leave and attendance corrections." />
      <LeaveTabs active="approvals" canManage={canManage} canAdmin={canAdmin} />

      {/* Pending leave requests */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Pending Leave ({leaveReqs.length})</div>
        {loading && leaveReqs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : leaveReqs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nothing awaiting approval.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leaveReqs.map((r) => (
              <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {r.user_name || 'Team member'}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                      {r.leave_type_name || 'Leave'} · {fmtDate(r.from_date)}{r.from_date !== r.to_date ? ` → ${fmtDate(r.to_date)}` : ''} · {r.days} day{r.days === 1 ? '' : 's'}
                    </span>
                  </div>
                  {r.reason && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{r.reason}</div>}
                </div>
                <ActionBtns id={r.id} kind="leave" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending regularizations */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Pending Regularizations ({regs.length})</div>
        {loading && regs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : regs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nothing awaiting approval.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {regs.map((r) => (
              <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {r.user_name || 'Team member'}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                      {REGULARIZATION_TYPE_LABELS[r.type]} · {fmtDate(r.att_date)}
                    </span>
                  </div>
                  {r.reason && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{r.reason}</div>}
                </div>
                <ActionBtns id={r.id} kind="reg" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team leave calendar for a month */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Team Leave Calendar</div>
          <div>
            <label style={{ ...label, display: 'inline-block', marginRight: 6, marginBottom: 0 }}>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...input, width: 'auto', display: 'inline-block' }} />
          </div>
        </div>
        {calLoading && calendar.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : calendar.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No team leave in this month.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {calendar.map((c) => (
              <div key={c.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, borderLeft: `4px solid ${c.color || 'var(--primary)'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.user_name || 'Team member'}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                    {c.leave_type_name || 'Leave'} · {fmtDate(c.from_date)}{c.from_date !== c.to_date ? ` → ${fmtDate(c.to_date)}` : ''} · {c.days} day{c.days === 1 ? '' : 's'}
                  </span>
                </div>
                <StatusChip status={c.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
