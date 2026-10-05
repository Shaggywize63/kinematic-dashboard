'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Receipt } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Segmented, T } from '../../../components/ui';
import { Stat } from '../../../components/finance/ui';
import { ExpensesShell, ClaimStatusBadge, errText, fmtDate, isPartial, money, payable } from '../../../components/expenses/kit';
import { ExpenseClaim, expensesApi } from '../../../lib/expensesApi';

type View = 'all' | 'attention' | 'waiting' | 'approved' | 'paid';

const VIEWS: Array<{ value: View; label: string; match: (c: ExpenseClaim) => boolean }> = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'attention', label: 'Needs you', match: (c) => c.status === 'rejected' || c.status === 'draft' },
  { value: 'waiting', label: 'Awaiting approval', match: (c) => c.status === 'submitted' },
  { value: 'approved', label: 'Approved', match: (c) => c.status === 'approved' },
  { value: 'paid', label: 'Reimbursed', match: (c) => c.status === 'reimbursed' },
];

export default function MyClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setClaims((await expensesApi.listClaims()).data ?? []); }
    catch (e) { setError(errText(e, 'Could not load your claims')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const live = useMemo(() => claims.filter((c) => c.status !== 'cancelled'), [claims]);
  const shown = useMemo(() => {
    const v = VIEWS.find((x) => x.value === view)!;
    return live.filter(v.match);
  }, [live, view]);

  const sum = (rows: ExpenseClaim[]) => rows.reduce((s, c) => s + payable(c), 0);
  const waiting = live.filter((c) => c.status === 'submitted');
  const toBePaid = live.filter((c) => c.status === 'approved');
  const rejected = live.filter((c) => c.status === 'rejected');
  const paid = live.filter((c) => c.status === 'reimbursed');
  const currency = live[0]?.currency ?? 'INR';

  return (
    <ExpensesShell tab="mine" title="Expenses" description="File claims with receipts, follow them through approval, and see why anything was sent back."
      actions={<Button variant="primary" icon={<Plus size={16} strokeWidth={1.8} />} href="/dashboard/expenses/new">New claim</Button>}>

      <Card padding={20}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
          <Stat label="Awaiting approval" value={money(sum(waiting), currency)} hint={`${waiting.length} ${waiting.length === 1 ? 'claim' : 'claims'}`} tone={waiting.length ? 'warn' : undefined} />
          <Stat label="Approved, to be paid" value={money(sum(toBePaid), currency)} hint={`${toBePaid.length} ${toBePaid.length === 1 ? 'claim' : 'claims'}`} tone={toBePaid.length ? 'ok' : undefined} />
          <Stat label="Sent back" value={String(rejected.length)} hint={rejected.length ? 'Fix and resubmit' : 'Nothing to fix'} tone={rejected.length ? 'red' : undefined} />
          <Stat label="Reimbursed" value={money(sum(paid), currency)} hint={`${paid.length} ${paid.length === 1 ? 'claim' : 'claims'}`} />
        </div>
      </Card>

      <div style={{ overflowX: 'auto' }}>
        <Segmented<View> value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: v.label }))} />
      </div>

      {error ? (
        <Card><EmptyState icon={<Receipt size={20} strokeWidth={1.5} />} title="Couldn’t load your claims" description={error} action={<Button onClick={load}>Try again</Button>} /></Card>
      ) : loading && claims.length === 0 ? (
        <Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt size={20} strokeWidth={1.5} />}
            title={live.length === 0 ? 'No claims yet' : 'Nothing in this view'}
            description={live.length === 0 ? 'Add your expenses with a photo of each receipt and send them for approval.' : 'Try another filter above.'}
            action={live.length === 0 ? <Button variant="primary" href="/dashboard/expenses/new">File your first claim</Button> : undefined} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((c) => (
            <ClaimRow key={c.id} claim={c} onOpen={() => router.push(`/dashboard/expenses/${c.id}`)}
              onFix={() => router.push(`/dashboard/expenses/${c.id}/edit`)} />
          ))}
        </div>
      )}
    </ExpensesShell>
  );
}

function ClaimRow({ claim: c, onOpen, onFix }: { claim: ExpenseClaim; onOpen: () => void; onFix: () => void }) {
  const high = (c.ai_flags ?? []).some((f) => f.severity === 'high');
  return (
    <Card padding={0} className="km-navrow" style={{ cursor: 'pointer' }}>
      <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px 16px', padding: '14px 18px', alignItems: 'start', outline: 'none' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{c.title || c.claim_no || 'Expense claim'}</span>
            {c.title && c.claim_no && <span style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{c.claim_no}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: T.mute, marginTop: 3 }}>
            {c.status === 'draft' ? `Started ${fmtDate(c.created_at)}` : `Submitted ${fmtDate(c.submitted_at || c.created_at)}`}
            {c.status === 'submitted' && c.approver_name ? ` · with ${c.approver_name}` : ''}
            {c.policy_name ? ` · ${c.policy_name}` : ''}
          </div>

          {c.status === 'rejected' && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: T.redWash, borderRadius: T.radius.sm, fontSize: 13, color: T.text, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              <strong style={{ color: T.red, fontWeight: 600 }}>Rejected{c.reviewer_name ? ` by ${c.reviewer_name}` : ''}: </strong>{c.review_note || 'No remark left.'}
            </div>
          )}
          {isPartial(c) && <div style={{ marginTop: 6, fontSize: 12.5, color: T.warn }}>Some lines were rejected — open the claim to see why.</div>}
          {c.status === 'submitted' && high && <div style={{ marginTop: 6 }}><Badge tone="warn">Policy points flagged</Badge></div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', color: T.text }}>{money(payable(c), c.currency)}</div>
            {isPartial(c) && <div style={{ fontSize: 12, color: T.mute, textDecoration: 'line-through' }}>{money(c.total_amount, c.currency)}</div>}
          </div>
          <ClaimStatusBadge status={c.status} partial={isPartial(c)} />
        </div>
      </div>

      {(c.status === 'rejected' || c.status === 'draft') && (
        <div style={{ padding: '0 18px 14px' }}>
          <Button size="sm" variant={c.status === 'rejected' ? 'primary' : 'secondary'} onClick={onFix}>{c.status === 'rejected' ? 'Fix and resubmit' : 'Continue editing'}</Button>
        </div>
      )}
    </Card>
  );
}
