'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCityScope } from '../../../../context/CityScopeContext';
import {
  expensesApi, FLAG_COLORS, CATEGORY_LABELS,
  type ExpenseClaim, type Decision,
} from '../../../../lib/expensesApi';
import {
  card, btnSmallSuccess, btnSmallDanger, btnSmallGhost,
  StatusChip, PageHeader, ExpenseTabs, useExpenseRoles, fmtDate, money,
} from '../_ui';

export default function ExpenseApprovalsPage() {
  const { canApprove, canAdmin } = useExpenseRoles();
  const { selectedCity } = useCityScope();
  const [pending, setPending] = useState<ExpenseClaim[]>([]);
  const [reimbursable, setReimbursable] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedCity) params.city = selectedCity;
      const calls: Promise<any>[] = [expensesApi.listPending(params)];
      if (canAdmin) calls.push(expensesApi.listAwaitingReimbursement(params));
      const [p, r] = await Promise.allSettled(calls);
      if (p.status === 'fulfilled') setPending(p.value.data || []);
      if (r && r.status === 'fulfilled') setReimbursable(r.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load approvals'); }
    finally { setLoading(false); }
  }, [selectedCity, canAdmin]);
  // selectedCity is in load's deps → changing the global city picker refetches.
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, decision: Decision) => {
    const note = decision === 'rejected' ? (window.prompt('Rejection note (optional):') ?? undefined) : undefined;
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      const r = await expensesApi.decideClaim(id, { decision, note: note || undefined });
      toast.success(r.data?.status === 'submitted' ? 'Approved — escalated to the next manager' : `Claim ${decision}`);
      load();
    } catch (e: any) { toast.error(e.message || 'Action failed'); }
    finally { setBusy((s) => ({ ...s, [id]: false })); }
  };

  const reimburse = async (id: string) => {
    const ref = window.prompt('Reimbursement reference (optional):') ?? undefined;
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      await expensesApi.reimburse(id, ref || undefined);
      toast.success('Marked reimbursed');
      load();
    } catch (e: any) { toast.error(e.message || 'Action failed'); }
    finally { setBusy((s) => ({ ...s, [id]: false })); }
  };

  const ClaimRow = ({ c, actions }: { c: ExpenseClaim; actions: React.ReactNode }) => (
    <div style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {c.user_name || 'Team member'}
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
            {money(c.total_amount, c.currency)} · {c.claim_no || fmtDate(c.submitted_at || c.created_at)}
            {c.current_level > 1 ? ` · level ${c.current_level}` : ''}
          </span>
        </div>
        {c.ai_summary && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>🧠 {c.ai_summary}</div>}
        {Array.isArray(c.ai_flags) && c.ai_flags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {c.ai_flags.map((f, i) => (
              <span key={i} title={f.detail} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, border: `1px solid ${FLAG_COLORS[f.severity]}`, color: FLAG_COLORS[f.severity] }}>
                {f.code.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
        {c.distance_km != null && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Mileage claimed <strong style={{ color: 'var(--text)' }}>{c.distance_km} km</strong>
            {c.gps_derived_km != null && <> · GPS trail <strong style={{ color: 'var(--text)' }}>{c.gps_derived_km} km</strong></>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actions}</div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Expense Approvals" subtitle="Review claims routed to you up the reporting line. High-value claims escalate to the next manager after you approve." />
      <ExpenseTabs active="approvals" canApprove={canApprove} canAdmin={canAdmin} />

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Awaiting your approval ({pending.length})</div>
        {loading && pending.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : pending.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nothing awaiting approval.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((c) => (
              <ClaimRow key={c.id} c={c} actions={
                <>
                  <button style={{ ...btnSmallSuccess, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => decide(c.id, 'approved')}>Approve</button>
                  <button style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => decide(c.id, 'rejected')}>Reject</button>
                </>
              } />
            ))}
          </div>
        )}
      </div>

      {canAdmin && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Approved — awaiting reimbursement ({reimbursable.length})</div>
          {reimbursable.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nothing to reimburse.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reimbursable.map((c) => (
                <ClaimRow key={c.id} c={c} actions={
                  <>
                    <StatusChip status={c.status} />
                    <button style={{ ...btnSmallGhost, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => reimburse(c.id)}>Mark reimbursed</button>
                  </>
                } />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
