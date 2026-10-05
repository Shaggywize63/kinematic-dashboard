'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, T } from '../../../../components/ui';
import { useConfirm } from '../../../../components/finance/ui';
import { ExpensesShell, errText, money } from '../../../../components/expenses/kit';
import { ExpensePolicy, expensesApi } from '../../../../lib/expensesApi';

function audience(p: ExpensePolicy): string {
  const a = p.applies_to;
  if (a.everyone) return 'Everyone';
  const parts: string[] = [];
  if (a.roles.length + a.org_role_ids.length) parts.push(`${a.roles.length + a.org_role_ids.length} ${a.roles.length + a.org_role_ids.length === 1 ? 'role' : 'roles'}`);
  if (a.user_ids.length) parts.push(`${a.user_ids.length} ${a.user_ids.length === 1 ? 'person' : 'people'}`);
  return parts.join(' + ') || 'Everyone';
}

export default function PoliciesPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setPolicies((await expensesApi.listPolicies()).data ?? []); }
    catch (e) { setError(errText(e, 'Could not load policies')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string, fallback: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error(errText(e, fallback)); }
    finally { setBusy(null); }
  };

  const remove = async (p: ExpensePolicy) => {
    if (!(await ask({ title: `Delete “${p.name}”?`, danger: true, confirmLabel: 'Delete policy',
      message: <>{p.covers ? `${p.covers} ${p.covers === 1 ? 'person follows' : 'people follow'} this policy today and will move to the next one that applies to them. ` : ''}Claims already submitted keep the rules they were checked against.</> }))) return;
    await run(p.id!, () => expensesApi.deletePolicy(p.id!), 'Policy deleted', 'Could not delete the policy');
  };

  return (
    <ExpensesShell tab="policies" title="Expense policies"
      description="Set the rules claims are checked against. Make as many policies as you need — each person follows the most specific one that applies to them."
      actions={<Button variant="primary" icon={<Plus size={16} strokeWidth={1.8} />} href="/dashboard/expenses/policies/new">New policy</Button>}>

      {error ? (
        <Card><EmptyState icon={<ScrollText size={20} strokeWidth={1.5} />} title="Policies aren’t available" description={error} action={<Button onClick={load}>Try again</Button>} /></Card>
      ) : loading && policies.length === 0 ? (
        <Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card>
      ) : policies.length === 0 ? (
        <Card>
          <EmptyState icon={<ScrollText size={20} strokeWidth={1.5} />} title="No policies yet"
            description="Until you add one, everyone follows the built-in defaults. Start from a ready-made template and adjust the numbers — it takes a minute."
            action={<Button variant="primary" href="/dashboard/expenses/policies/new">Create a policy</Button>} />
        </Card>
      ) : (
        <>
          <div style={{ fontSize: 13, color: T.mute, lineHeight: 1.5 }}>
            A policy for named people beats one for a role, which beats one for everyone. If two are equally specific, the lower priority number wins.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {policies.map((p) => (
              <Card key={p.id} padding={0} style={{ opacity: p.is_active ? 1 : 0.7 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '10px 16px', padding: '16px 18px', alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => router.push(`/dashboard/expenses/policies/${p.id}`)}
                        style={{ border: 0, background: 'transparent', padding: 0, fontFamily: T.heading, fontSize: 16, fontWeight: 700, color: T.text, cursor: 'pointer', textAlign: 'left' }}>{p.name}</button>
                      {p.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge>Inactive</Badge>}
                      {p.rules.enforcement === 'block' && <Badge tone="warn">Blocks breaches</Badge>}
                    </div>
                    {p.description && <div style={{ fontSize: 13.5, color: T.dim, marginTop: 4 }}>{p.description}</div>}
                    <div style={{ fontSize: 13, color: T.mute, marginTop: 8, display: 'flex', gap: '4px 18px', flexWrap: 'wrap' }}>
                      <span>For <strong style={{ color: T.text, fontWeight: 600 }}>{audience(p)}</strong>{p.covers != null && p.is_active ? ` · governs ${p.covers} ${p.covers === 1 ? 'person' : 'people'} now` : ''}</span>
                      <span>Mileage {money(p.rules.mileage_rate, p.currency)}/km</span>
                      <span>Receipt over {money(p.rules.receipt_required_over, p.currency)}</span>
                      {p.rules.auto_approve_under > 0 && <span>Auto-approve to {money(p.rules.auto_approve_under, p.currency)}</span>}
                      {p.rules.escalate_over != null && <span>Second approver over {money(p.rules.escalate_over, p.currency)}</span>}
                    </div>
                    {p.is_active && p.covers === 0 && <div style={{ fontSize: 12.5, color: T.warn, marginTop: 6 }}>Nobody follows this policy right now — a more specific one applies to everyone it covers.</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <IconButton label="Edit" onClick={() => router.push(`/dashboard/expenses/policies/${p.id}`)}><Pencil size={16} strokeWidth={1.6} /></IconButton>
                    <IconButton label="Duplicate" disabled={busy === p.id} onClick={() => run(p.id!, () => expensesApi.duplicatePolicy(p.id!), 'Copy created — it starts inactive', 'Could not duplicate the policy')}><Copy size={16} strokeWidth={1.6} /></IconButton>
                    <IconButton label="Delete" disabled={busy === p.id} onClick={() => remove(p)}><Trash2 size={16} strokeWidth={1.6} /></IconButton>
                  </div>
                </div>
                <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 12.5, color: T.mute }}>
                  <span>Priority {p.priority}{p.effective_from || p.effective_to ? ` · ${p.effective_from ?? 'always'} → ${p.effective_to ?? 'no end'}` : ''}</span>
                  <Button size="sm" variant="ghost" disabled={busy === p.id}
                    onClick={() => run(p.id!, () => expensesApi.updatePolicy(p.id!, { is_active: !p.is_active }), p.is_active ? 'Policy turned off' : 'Policy turned on', 'Could not update the policy')}>
                    {p.is_active ? 'Turn off' : 'Turn on'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {dialog}
    </ExpensesShell>
  );
}
