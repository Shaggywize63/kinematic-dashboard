'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, T, useIsCompact } from '../../../../components/ui';
import { Modal, useConfirm } from '../../../../components/finance/ui';
import {
  ClaimStatusBadge, ClaimTimeline, ExpensesShell, Field, LineSummary, Panel, PolicyFindings, RejectionBanner, errText, fmtDate, fmtDateTime, isPartial, money, useExpenseRoles,
} from '../../../../components/expenses/kit';
import ReviewPanel from '../../../../components/expenses/ReviewPanel';
import { ExpenseClaim, expensesApi } from '../../../../lib/expensesApi';
import { usePageTitle } from '../../../../lib/pageTitle';

function currentUserId(): string | null {
  try { return JSON.parse(localStorage.getItem('kinematic_user') || 'null')?.id ?? null; } catch { return null; }
}

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const narrow = useIsCompact(1000);
  const { canApprove, canAdmin } = useExpenseRoles();
  const [claim, setClaim] = useState<ExpenseClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [ref, setRef] = useState('');
  const [ask, dialog] = useConfirm();
  const me = useMemo(() => (typeof window === 'undefined' ? null : currentUserId()), []);

  const load = useCallback(async () => {
    try { setClaim((await expensesApi.getClaim(id)).data); setError(null); }
    catch (e) { setError(errText(e, 'Could not load this claim')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  usePageTitle(claim ? (claim.claim_no || claim.title) : null);

  const mine = !!claim && claim.user_id === me;
  const reviewing = !!claim && claim.status === 'submitted' && canApprove && !mine;

  const act = async (fn: () => Promise<unknown>, ok: string, fallback: string): Promise<boolean> => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); return true; }
    catch (e) { toast.error(errText(e, fallback)); return false; }
    finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!claim) return;
    const draft = claim.status === 'draft';
    if (!(await ask({ title: draft ? 'Delete this draft?' : 'Withdraw this claim?', danger: true, confirmLabel: draft ? 'Delete draft' : 'Withdraw',
      message: draft ? 'The draft and its receipts will be discarded.' : 'It leaves the approval queue. You can’t reopen it, but you can file a new claim.' }))) return;
    if (await act(() => expensesApi.cancelClaim(claim.id), draft ? 'Draft deleted' : 'Claim withdrawn', 'Could not cancel the claim')) router.push('/dashboard/expenses');
  };

  if (error) return <ExpensesShell title="Claim" tab="mine"><Card><EmptyState title="Couldn’t open this claim" description={error} action={<Button onClick={load}>Try again</Button>} /></Card></ExpensesShell>;
  if (!claim) return <ExpensesShell title="Claim" tab="mine"><Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card></ExpensesShell>;

  const c = claim;
  const items = c.items ?? [];
  const partial = isPartial(c);
  const findings = c.ai_flags ?? [];
  const actions = (
    <>
      <Button variant="ghost" href="/dashboard/expenses" icon={<ArrowLeft size={15} strokeWidth={1.7} />}>All claims</Button>
      {mine && c.status === 'draft' && <>
        <Button href={`/dashboard/expenses/${c.id}/edit`} icon={<Pencil size={14} strokeWidth={1.7} />}>Edit</Button>
        <Button variant="primary" disabled={busy} onClick={() => act(() => expensesApi.submitClaim(c.id), 'Submitted for approval', 'Could not submit the claim')}>Submit for approval</Button>
      </>}
      {mine && c.status === 'rejected' && <Button variant="primary" href={`/dashboard/expenses/${c.id}/edit`}>Fix and resubmit</Button>}
      {mine && c.status === 'submitted' && <Button href={`/dashboard/expenses/${c.id}/edit`} icon={<Pencil size={14} strokeWidth={1.7} />}>Edit</Button>}
      {canAdmin && c.status === 'approved' && <Button variant="primary" onClick={() => setPaying(true)}>Mark reimbursed</Button>}
    </>
  );

  return (
    <ExpensesShell tab={mine ? 'mine' : 'approvals'} actions={actions}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{c.title || c.claim_no || 'Expense claim'}<ClaimStatusBadge status={c.status} partial={partial} /></span>}
      description={<>{c.claim_no && <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{c.claim_no}</span>}{c.claim_no && ' · '}{mine ? 'Your claim' : `${c.user_name ?? 'Team member'}${c.employee_id ? ` (${c.employee_id})` : ''}`}</>}>

      <RejectionBanner claim={c} />
      {partial && (
        <div style={{ padding: '12px 16px', borderRadius: T.radius.lg, background: T.warnWash, fontSize: 13.5, color: T.text }}>
          <strong>{money(c.approved_amount, c.currency)}</strong> of {money(c.total_amount, c.currency)} approved. The rejected lines are marked below with the reviewer’s remark.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {reviewing ? (
            <ReviewPanel claim={c} onDone={() => { load(); }} />
          ) : (
            <Panel title="Expenses" aside={<span style={{ fontSize: 13, color: T.mute }}>{items.length} {items.length === 1 ? 'line' : 'lines'}</span>} padding={20}>
              {items.length === 0 ? <div style={{ fontSize: 13.5, color: T.mute }}>This claim has no lines.</div> : (
                <div>{items.map((it, i) => <div key={it.id} style={{ borderTop: i ? `1px solid ${T.border}` : 0 }}><LineSummary item={it} currency={c.currency} /></div>)}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 14, marginTop: 4, borderTop: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: T.text }}>
                <span>{partial || c.status === 'approved' || c.status === 'reimbursed' ? 'Approved' : 'Total'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(c.approved_amount != null && (c.status === 'approved' || c.status === 'reimbursed') ? c.approved_amount : c.total_amount, c.currency)}</span>
              </div>
            </Panel>
          )}

          {findings.length > 0 && (
            <Panel title="Policy checks" padding={20}>
              {c.ai_summary && <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12, lineHeight: 1.5 }}>{c.ai_summary}</div>}
              <PolicyFindings flags={findings} />
            </Panel>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Details" padding={20}>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '9px 16px', fontSize: 13 }}>
              {([
                ['Submitted', c.submitted_at ? fmtDateTime(c.submitted_at) : 'Not yet'],
                ['Policy', c.policy_name || '—'],
                ['Claimed', money(c.total_amount, c.currency)],
                c.approved_amount != null && c.status !== 'rejected' ? ['Approved', money(c.approved_amount, c.currency)] : null,
                c.status === 'submitted' && c.approver_name ? ['With', `${c.approver_name}${c.current_level > 1 ? ` (level ${c.current_level})` : ''}`] : null,
                c.reviewed_at && c.status !== 'submitted' ? ['Decided', `${fmtDate(c.reviewed_at)}${c.reviewer_name ? ` by ${c.reviewer_name}` : ''}`] : null,
                c.distance_km != null ? ['Mileage claimed', `${c.distance_km} km`] : null,
                c.gps_derived_km != null ? ['GPS trail', `${c.gps_derived_km} km`] : null,
                c.reimbursed_at ? ['Reimbursed', `${fmtDate(c.reimbursed_at)}${c.reimbursed_ref ? ` · ${c.reimbursed_ref}` : ''}`] : null,
                (c.submit_count ?? 1) > 1 ? ['Attempts', String(c.submit_count)] : null,
              ] as Array<[string, string] | null>).filter((r): r is [string, string] => !!r).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: T.mute }}>{k}</dt><dd style={{ margin: 0, color: T.text, fontWeight: 500, overflowWrap: 'anywhere' }}>{v}</dd>
                </div>
              ))}
            </dl>
            {c.auto_approved && <div style={{ marginTop: 12 }}><Badge tone="ok">Auto-approved by policy</Badge></div>}
          </Panel>

          <Panel title="History" padding={20}><ClaimTimeline claim={c} /></Panel>

          {mine && (c.status === 'draft' || c.status === 'submitted' || c.status === 'rejected') && (
            <div><Button variant="ghost" disabled={busy} onClick={withdraw} style={{ color: T.red }}>{c.status === 'draft' ? 'Delete draft' : 'Withdraw this claim'}</Button></div>
          )}
          {!mine && <Link href="/dashboard/expenses/approvals" style={{ fontSize: 13, color: T.info }}>Back to approvals</Link>}
        </div>
      </div>

      {paying && (
        <Modal title="Mark as reimbursed" onClose={() => setPaying(false)} width={440}
          footer={<><Button onClick={() => setPaying(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={async () => { await act(() => expensesApi.reimburse(c.id, ref.trim() || undefined), 'Marked as reimbursed', 'Could not mark it reimbursed'); setPaying(false); setRef(''); }}>
              {busy ? 'Saving…' : `Confirm ${money(c.approved_amount ?? c.total_amount, c.currency)} paid`}</Button></>}>
          <Field label="Payment reference" hint="Optional — a UTR, cheque number or payroll batch. The claimant sees it.">
            <Input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder="e.g. UTR 4021…" />
          </Field>
        </Modal>
      )}
      {dialog}
    </ExpensesShell>
  );
}
