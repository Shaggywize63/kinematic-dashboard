'use client';
import { useCallback, useEffect, useState } from 'react';
import TileGrid from '../../../../components/ui/TileGrid';
import api from '../../../../lib/api';
import { Card, CardTitle, PageHeader, Pill, Th, Td, Btn, inr, fmtDate } from '../../../../components/distribution/Atoms';
import { useClient } from '../../../../context/ClientContext';

// Incentive management. Reps earn a configurable percentage of each order; this screen is the
// management side of it — what has been earned, who is earning it, and the rule itself.
//
// The rate is NEVER hard-coded here or in the backend: the rule row is the single source of
// truth, and a client with no rule accrues nothing. Changing 2% to 3% is a form submit.

type Period = 'today' | 'week' | 'month' | 'all';
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

interface Dash {
  period: string; earned_amount: number; paid_amount: number; reversed_amount: number;
  payable_amount: number; sales_value: number; order_count: number; reversed_count: number;
  participating_reps: number; top_earners: Array<{ user_id: string; name: string; amount: number }>;
}
interface LeaderRow {
  rank: number; user_id: string; name: string; employee_id: string | null;
  incentive_amount: number; sales_value: number; order_count: number; is_me: boolean;
}
interface Rule {
  id?: string; name?: string; rate_pct: number;
  basis: 'taxable_value' | 'grand_total'; earn_on: 'placed' | 'approved' | 'invoiced';
}
interface Entry {
  id: string; order_id: string; salesman_name?: string; basis: string; basis_amount: number;
  rate_pct: number; amount: number; status: string; earned_at: string; reversal_reason?: string | null;
}

const EARN_LABEL: Record<string, string> = {
  placed: 'when the order is placed',
  approved: 'when a manager approves it',
  invoiced: 'when it is invoiced',
};
const BASIS_LABEL: Record<string, string> = {
  taxable_value: 'net value (excl. GST)',
  grand_total: 'grand total (incl. GST)',
};

const asData = <T,>(r: unknown): T | null => ((r as { data?: T })?.data ?? (r as T) ?? null);

export default function IncentivesPage() {
  const { selectedClientId } = useClient();
  const [period, setPeriod] = useState<Period>('month');
  const [dash, setDash] = useState<Dash | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Rule editor
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Rule>({ rate_pct: 2, basis: 'taxable_value', earn_on: 'approved' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // allSettled: a 503 from one call (module not migrated) must not blank the others.
    const [d, l, e, r] = await Promise.allSettled([
      api.getIncentiveDashboard(period),
      api.getIncentiveLeaderboard(period, 50),
      api.getIncentiveEntries({ period, limit: '100' }),
      api.getIncentiveRule(),
    ]);
    if (d.status === 'fulfilled') setDash(asData<Dash>(d.value));
    else setErr((d.reason as Error)?.message || 'Could not load the incentive dashboard');
    if (l.status === 'fulfilled') setBoard(asData<{ entries: LeaderRow[] }>(l.value)?.entries ?? []);
    if (e.status === 'fulfilled') setEntries((asData<Entry[]>(e.value) as Entry[]) ?? []);
    if (r.status === 'fulfilled') {
      const got = asData<Rule>(r.value);
      setRule(got);
      if (got) setDraft({ rate_pct: Number(got.rate_pct), basis: got.basis, earn_on: got.earn_on });
    }
    setLoading(false);
  }, [period]);

  // Refetch on period AND on the global client scope, so switching client reloads.
  useEffect(() => { load(); }, [load, selectedClientId]);

  const saveRule = async () => {
    setSaving(true); setErr(null);
    try {
      await api.saveIncentiveRule({
        rate_pct: Number(draft.rate_pct), basis: draft.basis, earn_on: draft.earn_on, is_active: true,
      });
      setEditing(false);
      await load();
    } catch (e) { setErr((e as Error)?.message || 'Could not save the rule'); }
    finally { setSaving(false); }
  };

  const stat = (label: string, value: React.ReactNode, hint?: string) => (
    <Card key={label} style={{ flex: '1 1 170px', minWidth: 170 }} padding={16}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{hint}</div>}
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Incentives"
        subtitle={rule
          ? `${rule.rate_pct}% of ${BASIS_LABEL[rule.basis] ?? rule.basis}, earned ${EARN_LABEL[rule.earn_on] ?? rule.earn_on}.`
          : 'No incentive rule yet — set one to start accruing.'}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERIODS.map((p) => (
              <Btn key={p.id} variant={p.id === period ? 'primary' : 'ghost'} size="sm" onClick={() => setPeriod(p.id)}>
                {p.label}
              </Btn>
            ))}
          </div>
        }
      />

      {err && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--red)' }} padding={14}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>
        </Card>
      )}

      {/* ── Rule ─────────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }} padding={0}>
        <CardTitle right={
          editing
            ? <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Btn>
                <Btn size="sm" onClick={saveRule} disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</Btn>
              </div>
            : <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>{rule ? 'Edit rule' : 'Set up incentives'}</Btn>
        }>Incentive rule</CardTitle>
        <div style={{ padding: 16 }}>
          {!editing && !rule && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              No rule is configured, so nothing is being accrued. Set a rate to start.
            </div>
          )}
          {!editing && rule && (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
              <span><strong>{rule.rate_pct}%</strong> commission</span>
              <span>of the <strong>{BASIS_LABEL[rule.basis] ?? rule.basis}</strong></span>
              <span>earned <strong>{EARN_LABEL[rule.earn_on] ?? rule.earn_on}</strong></span>
            </div>
          )}
          {editing && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                RATE %
                <input type="number" step="0.1" min="0" max="100" value={draft.rate_pct}
                  onChange={(ev) => setDraft({ ...draft, rate_pct: Number(ev.target.value) })}
                  style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', width: 110 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                CALCULATED ON
                <select value={draft.basis} onChange={(ev) => setDraft({ ...draft, basis: ev.target.value as Rule['basis'] })}
                  style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)' }}>
                  <option value="taxable_value">Net value (excl. GST)</option>
                  <option value="grand_total">Grand total (incl. GST)</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                EARNED
                <select value={draft.earn_on} onChange={(ev) => setDraft({ ...draft, earn_on: ev.target.value as Rule['earn_on'] })}
                  style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)' }}>
                  <option value="placed">When the order is placed</option>
                  <option value="approved">When a manager approves it</option>
                  <option value="invoiced">When it is invoiced</option>
                </select>
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 340 }}>
                A cancelled order that had already earned is reversed automatically, so the ledger always
                reflects what is really owed.
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <TileGrid id="distribution-incentives-totals" perRow={5} h={3} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {stat('Payable now', inr(dash?.payable_amount ?? 0), `${dash?.order_count ?? 0} orders`)}
        {stat('Already paid', inr(dash?.paid_amount ?? 0))}
        {stat('Reversed', inr(dash?.reversed_amount ?? 0), `${dash?.reversed_count ?? 0} cancelled`)}
        {stat('Sales value', inr(dash?.sales_value ?? 0), 'the base it is calculated on')}
        {stat('Reps earning', String(dash?.participating_reps ?? 0))}
      </TileGrid>

      {/* ── Leaderboard ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }} padding={0}>
        <CardTitle>Leaderboard — {dash?.period ?? ''}</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>#</Th><Th>Sales rep</Th><Th>Emp code</Th>
              <Th style={{ textAlign: 'right' }}>Orders</Th>
              <Th style={{ textAlign: 'right' }}>Sales value</Th>
              <Th style={{ textAlign: 'right' }}>Incentive</Th>
            </tr></thead>
            <tbody>
              {loading && <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr>}
              {!loading && board.length === 0 && (
                <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                  No incentives earned in this period yet.
                </Td></tr>
              )}
              {board.map((r) => (
                <tr key={r.user_id} style={r.is_me ? { background: 'var(--s2)' } : undefined}>
                  <Td>{r.rank <= 3 ? <Pill color={r.rank === 1 ? 'green' : 'blue'}>{r.rank}</Pill> : r.rank}</Td>
                  <Td style={{ fontWeight: r.rank <= 3 ? 700 : 400 }}>{r.name}</Td>
                  <Td style={{ color: 'var(--text-dim)' }}>{r.employee_id || '—'}</Td>
                  <Td style={{ textAlign: 'right' }}>{r.order_count}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(r.sales_value)}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(r.incentive_amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Ledger ───────────────────────────────────────────────────────── */}
      <Card padding={0}>
        <CardTitle>Incentive ledger</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>Earned</Th><Th>Sales rep</Th>
              <Th style={{ textAlign: 'right' }}>Order value</Th>
              <Th style={{ textAlign: 'right' }}>Rate</Th>
              <Th style={{ textAlign: 'right' }}>Incentive</Th>
              <Th>Status</Th>
            </tr></thead>
            <tbody>
              {loading && <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr>}
              {!loading && entries.length === 0 && (
                <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Nothing accrued yet.</Td></tr>
              )}
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDate(e.earned_at)}</Td>
                  <Td>{e.salesman_name || '—'}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(e.basis_amount)}</Td>
                  <Td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{e.rate_pct}%</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(e.amount)}</Td>
                  <Td>
                    <Pill color={e.status === 'reversed' ? 'red' : e.status === 'paid' ? 'green' : 'blue'}>{e.status}</Pill>
                    {e.status === 'reversed' && e.reversal_reason && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{e.reversal_reason}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
