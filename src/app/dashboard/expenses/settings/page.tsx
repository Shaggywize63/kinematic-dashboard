'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { expensesApi, CATEGORY_LABELS, type ExpensePolicy, type ItemCategory } from '../../../../lib/expensesApi';
import { card, input, label, btnPrimary, PageHeader, ExpenseTabs, useExpenseRoles } from '../_ui';

// Categories that support a per-day cap (mileage is rate-based, not capped).
const CAP_CATEGORIES: ItemCategory[] = ['travel', 'food', 'lodging', 'fuel', 'toll', 'misc'];

export default function ExpensePolicyPage() {
  const { canApprove, canAdmin } = useExpenseRoles();
  const [p, setP] = useState<ExpensePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await expensesApi.getPolicy();
      const pol = r.data;
      setP(pol);
      const c: Record<string, string> = {};
      for (const k of CAP_CATEGORIES) { const v = pol.category_limits?.[k]; if (v != null) c[k] = String(v); }
      setCaps(c);
    } catch (e: any) { toast.error(e.message || 'Failed to load policy'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch: Partial<ExpensePolicy>) => setP((cur) => (cur ? { ...cur, ...patch } : cur));

  const save = async () => {
    if (!p) return;
    const category_limits: Record<string, number> = {};
    for (const [k, v] of Object.entries(caps)) { const n = Number(v); if (v !== '' && n > 0) category_limits[k] = n; }
    setSaving(true);
    try {
      await expensesApi.savePolicy({
        currency: p.currency,
        mileage_rate: Number(p.mileage_rate) || 0,
        auto_approve_under: Number(p.auto_approve_under) || 0,
        escalate_over: p.escalate_over == null || (p.escalate_over as any) === '' ? null : Number(p.escalate_over),
        require_receipt_over: Number(p.require_receipt_over) || 0,
        category_limits: Object.keys(category_limits).length ? category_limits : null,
        is_active: p.is_active,
      });
      toast.success('Policy saved');
      load();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="Expense Policy" subtitle="Set the mileage rate, receipt & approval thresholds and per-day category caps for this account." />
      <ExpenseTabs active="settings" canApprove={canApprove} canAdmin={canAdmin} />

      {!canAdmin ? (
        <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>Only an admin can edit the expense policy.</div>
      ) : loading || !p ? (
        <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={label}>Currency</label>
              <input value={p.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} style={input} maxLength={8} />
            </div>
            <div>
              <label style={label}>Mileage rate (per km)</label>
              <input value={String(p.mileage_rate ?? '')} onChange={(e) => set({ mileage_rate: e.target.value as any })} style={input} inputMode="decimal" />
            </div>
            <div>
              <label style={label}>Receipt required over</label>
              <input value={String(p.require_receipt_over ?? '')} onChange={(e) => set({ require_receipt_over: e.target.value as any })} style={input} inputMode="decimal" />
            </div>
            <div>
              <label style={label}>Escalate to next manager over</label>
              <input value={p.escalate_over == null ? '' : String(p.escalate_over)} onChange={(e) => set({ escalate_over: e.target.value as any })} style={input} inputMode="decimal" placeholder="blank = single approval" />
            </div>
            <div>
              <label style={label}>Auto-approve under</label>
              <input value={String(p.auto_approve_under ?? '')} onChange={(e) => set({ auto_approve_under: e.target.value as any })} style={input} inputMode="decimal" placeholder="0 = never" />
            </div>
          </div>

          <div>
            <div style={{ ...label, marginBottom: 8 }}>Per-day category caps ({p.currency})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {CAP_CATEGORIES.map((k) => (
                <div key={k}>
                  <label style={{ ...label, textTransform: 'none', fontWeight: 600 }}>{CATEGORY_LABELS[k]}</label>
                  <input value={caps[k] ?? ''} onChange={(e) => setCaps((c) => ({ ...c, [k]: e.target.value }))} style={input} inputMode="decimal" placeholder="no cap" />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              A blank cap means no limit. Lines over the cap for a day are flagged for the approver (not blocked).
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={p.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            Policy active
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
