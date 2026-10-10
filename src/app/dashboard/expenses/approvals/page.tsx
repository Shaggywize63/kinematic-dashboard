'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { useCityScope } from '../../../../context/CityScopeContext';
import { Badge, Button, Card, EmptyState, Input, Segmented, T } from '../../../../components/ui';
import { Col, DataTable, Modal, SearchBox, Toolbar } from '../../../../components/finance/ui';
import { ExpensesShell, Field, FlagBadge, RemarkDialog, errText, fmtDate, money, useExpenseRoles } from '../../../../components/expenses/kit';
import { ExpenseClaim, expensesApi } from '../../../../lib/expensesApi';

type Tab = 'review' | 'pay';

export default function ApprovalsPage() {
  const router = useRouter();
  const { canAdmin } = useExpenseRoles();
  const { selectedCity } = useCityScope();
  const [tab, setTab] = useState<Tab>('review');
  const [pending, setPending] = useState<ExpenseClaim[]>([]);
  const [toPay, setToPay] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [paying, setPaying] = useState<ExpenseClaim | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  // selectedCity is a dependency, so changing the global city picker refetches.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = selectedCity ? { city: selectedCity } : {};
    try {
      const [p, r] = await Promise.all([
        expensesApi.listPending(params),
        canAdmin ? expensesApi.listAwaitingReimbursement(params) : Promise.resolve(null),
      ]);
      setPending(p.data ?? []);
      setToPay(r?.data ?? []);
      setPicked(new Set());
    } catch (e) { setError(errText(e, 'Could not load the approval queue')); }
    finally { setLoading(false); }
  }, [selectedCity, canAdmin]);
  useEffect(() => { load(); }, [load]);

  const match = useCallback((c: ExpenseClaim) => {
    const t = q.trim().toLowerCase();
    return !t || [c.user_name, c.employee_id, c.claim_no, c.title].some((v) => (v ?? '').toLowerCase().includes(t));
  }, [q]);
  const rows = useMemo(() => pending.filter(match), [pending, match]);
  const payRows = useMemo(() => toPay.filter(match), [toPay, match]);
  const flaggedHigh = (c: ExpenseClaim) => (c.ai_flags ?? []).some((f) => f.severity === 'high');

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)));

  const approve = async (ids: string[]) => {
    setBusy(true);
    try {
      if (ids.length === 1) {
        const r = await expensesApi.decideClaim(ids[0], { decision: 'approved' });
        toast.success(r.data.escalated ? 'Approved — sent to the next manager' : 'Claim approved');
      } else {
        const { done, failed } = (await expensesApi.bulkDecide(ids, 'approved')).data;
        if (failed.length) toast.error(`${done.length} approved, ${failed.length} failed — ${failed[0].error}`);
        else toast.success(`${done.length} claims approved`);
      }
      await load();
    } catch (e) { toast.error(errText(e, 'Could not approve')); }
    finally { setBusy(false); }
  };

  const reject = async (ids: string[], remark: string) => {
    setBusy(true);
    try {
      if (ids.length === 1) await expensesApi.decideClaim(ids[0], { decision: 'rejected', note: remark });
      else {
        const { done, failed } = (await expensesApi.bulkDecide(ids, 'rejected', remark)).data;
        if (failed.length) toast.error(`${done.length} rejected, ${failed.length} failed — ${failed[0].error}`);
      }
      toast.success(ids.length === 1 ? 'Rejected — the claimant can see your remark' : 'Rejected — the claimants can see your remark');
      setRejecting(null);
      await load();
    } catch (e) { toast.error(errText(e, 'Could not reject')); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      await expensesApi.reimburse(paying.id, ref.trim() || undefined);
      toast.success('Marked as reimbursed');
      setPaying(null); setRef('');
      await load();
    } catch (e) { toast.error(errText(e, 'Could not mark it reimbursed')); }
    finally { setBusy(false); }
  };

  const claimCell = (c: ExpenseClaim) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600 }}>{c.title || c.claim_no || 'Expense claim'}</div>
      <div style={{ fontSize: 12, color: T.mute }}>{c.claim_no && c.title ? `${c.claim_no} · ` : ''}{fmtDate(c.submitted_at || c.created_at)}{c.policy_name ? ` · ${c.policy_name}` : ''}</div>
    </div>
  );
  const personCell = (c: ExpenseClaim) => (
    <div><div style={{ fontWeight: 600 }}>{c.user_name || 'Team member'}</div>{c.employee_id && <div style={{ fontSize: 12, color: T.mute }}>{c.employee_id}</div>}</div>
  );

  const reviewCols: Col<ExpenseClaim>[] = [
    { key: 'sel', label: <input type="checkbox" aria-label="Select all" checked={allOn} onChange={toggleAll} />, width: 40,
      render: (c) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${c.claim_no ?? 'claim'}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} /></span> },
    { key: 'user', label: 'Claimant', render: personCell },
    { key: 'claim', label: 'Claim', render: claimCell },
    { key: 'amount', label: 'Amount', align: 'right', render: (c) => <strong>{money(c.total_amount, c.currency)}</strong> },
    { key: 'checks', label: 'Policy checks', nowrap: false, render: (c) => {
      const f = c.ai_flags ?? [];
      return f.length === 0 ? <Badge tone="ok">Clear</Badge> : (
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {f.slice(0, 2).map((x, i) => <FlagBadge key={i} flag={x} />)}{f.length > 2 && <Badge>+{f.length - 2}</Badge>}
        </span>
      );
    } },
    { key: 'act', label: '', align: 'right', render: (c) => (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <Button size="sm" onClick={() => router.push(`/dashboard/expenses/${c.id}`)}>Review</Button>
        <Button size="sm" variant="primary" disabled={busy || flaggedHigh(c)} title={flaggedHigh(c) ? 'Open the claim to review the flagged points' : 'Approve every line'} onClick={() => approve([c.id])}>Approve</Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejecting([c.id])}>Reject</Button>
      </span>
    ) },
  ];

  const payCols: Col<ExpenseClaim>[] = [
    { key: 'user', label: 'Claimant', render: personCell },
    { key: 'claim', label: 'Claim', render: claimCell },
    { key: 'approved', label: 'Approved', render: (c) => fmtDate(c.reviewed_at) },
    { key: 'amount', label: 'To pay', align: 'right', render: (c) => <strong>{money(c.approved_amount ?? c.total_amount, c.currency)}</strong> },
    { key: 'act', label: '', align: 'right', render: (c) => <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="primary" onClick={() => setPaying(c)}>Mark paid</Button></span> },
  ];

  const list = tab === 'review' ? rows : payRows;
  const pickedIds = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
  const pickedFlagged = rows.some((r) => picked.has(r.id) && flaggedHigh(r));

  return (
    <ExpensesShell tab="approvals" title="Approvals" description="Review what your team has claimed. Every rejection needs a remark, and the claimant sees it in their app.">
      <Toolbar>
        {canAdmin && (
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: 'review', label: `To review${pending.length ? ` (${pending.length})` : ''}` },
            { value: 'pay', label: `Ready to pay${toPay.length ? ` (${toPay.length})` : ''}` },
          ]} />
        )}
        <SearchBox value={q} onChange={setQ} placeholder="Search by name, employee ID or claim no." />
        {selectedCity && <Badge>{selectedCity}</Badge>}
      </Toolbar>

      {tab === 'review' && pickedIds.length > 0 && (
        <Card padding={12} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: T.panel }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{pickedIds.length} selected</span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="primary" icon={<Check size={14} strokeWidth={2} />} disabled={busy || pickedFlagged}
            title={pickedFlagged ? 'Some selected claims have flagged points — review those individually' : undefined} onClick={() => approve(pickedIds)}>Approve selected</Button>
          <Button size="sm" variant="danger" icon={<X size={14} strokeWidth={2} />} disabled={busy} onClick={() => setRejecting(pickedIds)}>Reject selected</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </Card>
      )}

      {error ? (
        <Card><EmptyState title="Couldn’t load the queue" description={error} action={<Button onClick={load}>Try again</Button>} /></Card>
      ) : !loading && list.length === 0 && !q ? (
        <Card><EmptyState icon={<ClipboardCheck size={20} strokeWidth={1.5} />} title={tab === 'review' ? 'Nothing waiting for you' : 'No approved claims to pay'}
          description={tab === 'review' ? 'New claims from your team appear here as soon as they are submitted.' : 'Approved claims show up here until you mark them reimbursed.'} /></Card>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <DataTable<ExpenseClaim> columns={tab === 'review' ? reviewCols : payCols} rows={list} loading={loading}
            empty="No claims match your search." onRowClick={(c) => router.push(`/dashboard/expenses/${c.id}`)} />
        </Card>
      )}

      {rejecting && (
        <RemarkDialog title={rejecting.length === 1 ? 'Reject this claim' : `Reject ${rejecting.length} claims`} confirmLabel="Reject" busy={busy} label="Reason for rejecting"
          placeholder="Say what is wrong and what to fix, e.g. “Receipt missing for the hotel bill.”"
          intro={rejecting.length === 1 ? 'The claimant sees this remark in their app and can fix the claim and resubmit it.' : 'The same remark goes to every claimant. To explain each one separately, open the claims individually.'}
          footnote={rejecting.length === 1 ? 'The claimant is notified with this reason and can edit and resubmit.' : 'Each claimant is notified with this reason and can edit and resubmit.'}
          onCancel={() => setRejecting(null)} onConfirm={(remark) => reject(rejecting, remark)} />
      )}

      {paying && (
        <Modal title="Mark as reimbursed" onClose={() => setPaying(null)} width={440}
          footer={<><Button onClick={() => setPaying(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={pay}>{busy ? 'Saving…' : `Confirm ${money(paying.approved_amount ?? paying.total_amount, paying.currency)} paid`}</Button></>}>
          <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 14 }}>{paying.user_name} · {paying.claim_no || paying.title}</div>
          <Field label="Payment reference" hint="Optional — a UTR, cheque number or payroll batch. The claimant sees it.">
            <Input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder="e.g. UTR 4021…" />
          </Field>
        </Modal>
      )}
    </ExpensesShell>
  );
}
