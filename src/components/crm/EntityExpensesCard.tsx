'use client';
// "Expenses" card on a lead / deal page (connected-B2B only): what was spent on it, how many visits it took and
// what share of the opportunity value that is — so the team can see the cost of winning (or not winning) it.
// Backend: GET /crm/leads/:id/expenses and /crm/deals/:id/expenses. Renders nothing, and calls nothing, for any
// other client.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Eyebrow, T } from '../ui';
import { ClaimStatusBadge, money } from '../expenses/kit';
import { crmDeals, crmLeads } from '../../lib/crmApi';
import { isB2bClientActive } from '../../lib/b2bClient';
import type { ClaimStatus } from '../../lib/expensesApi';
import type { EntityExpenses } from '../../types/crm';

// A reply that isn't the documented shape (an older server answering with an empty list, say) is treated as a failed
// load rather than crashing the page it sits on.
const usable = (d: unknown): d is EntityExpenses => {
  const x = d as EntityExpenses | null | undefined;
  return !!x && typeof x === 'object' && !!x.totals && typeof x.totals === 'object' && Array.isArray(x.claims);
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 30 -> "30%", 12.5 -> "12.5%", 0.04 -> "0.04%" (never a long tail of decimals). */
const pct = (v: number) => `${Number(v.toFixed(v < 1 ? 2 : 1)).toLocaleString('en-IN')}%`;

export default function EntityExpensesCard({ kind, id }: { kind: 'lead' | 'deal'; id: string }) {
  const b2b = isB2bClientActive();
  const [data, setData] = useState<EntityExpenses | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(() => {
    setState('loading');
    return (kind === 'lead' ? crmLeads.expenses(id) : crmDeals.expenses(id))
      .then((r) => { if (usable(r.data)) { setData(r.data); setState('ready'); } else setState('error'); })
      .catch(() => setState('error'));
  }, [kind, id]);

  useEffect(() => {
    if (!b2b || !id) return;
    let off = false;
    setState('loading');
    (kind === 'lead' ? crmLeads.expenses(id) : crmDeals.expenses(id))
      .then((r) => { if (off) return; if (usable(r.data)) { setData(r.data); setState('ready'); } else setState('error'); })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, [b2b, kind, id]);

  if (!b2b) return null;

  const body = () => {
    if (state === 'loading') return <div style={{ fontSize: 13.5, color: T.mute }}>Loading expenses…</div>;
    if (state === 'error' || !data) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13.5, color: T.dim }}>
          <span>Couldn’t load expenses</span>
          <Button size="sm" variant="ghost" onClick={() => { void load(); }}>Try again</Button>
        </div>
      );
    }
    const { totals, currency, claims } = data;
    const visits = Number(data.visit_count) || 0;
    if (!totals.claim_count && !claims.length) {
      return (
        <>
          <div style={{ fontSize: 13.5, color: T.mute }}>No expenses linked yet</div>
          {visits > 0 && <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>{plural(visits, 'visit')}</div>}
        </>
      );
    }
    const spent = Number(totals.spent_amount) || 0;
    const value = data.opportunity_value != null && Number(data.opportunity_value) > 0 ? Number(data.opportunity_value) : null;
    const share = spent > 0 && value != null && data.spent_pct_of_value != null ? Number(data.spent_pct_of_value) : null;
    const parts = ([['Pending', totals.pending_amount], ['Draft', totals.draft_amount], ['Rejected', totals.rejected_amount]] as Array<[string, number]>)
      .filter(([, v]) => Number(v) > 0);
    return (
      <>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
          {money(spent, currency)} spent{share != null && value != null ? ` · ${pct(share)} of ${money(value, currency)}` : ''}
        </div>
        <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>{plural(totals.claim_count, 'claim')} · {plural(visits, 'visit')}</div>
        {parts.length > 0 && (
          <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>{parts.map(([k, v]) => `${k} ${money(v, currency)}`).join(' · ')}</div>
        )}
        {claims.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
            {claims.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                  <Link href={`/dashboard/expenses/${c.id}`} style={{ fontSize: 13, fontWeight: 600, color: T.info, overflowWrap: 'anywhere' }}>{c.claim_no || c.title || 'Expense claim'}</Link>
                  <div style={{ fontSize: 12, color: T.mute, overflowWrap: 'anywhere' }}>{[c.user_name, kind === 'lead' ? c.deal_name : null].filter(Boolean).join(' · ')}</div>
                </div>
                <ClaimStatusBadge status={c.status as ClaimStatus} />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{money(c.total_amount, c.currency || currency)}</div>
              </div>
            ))}
            {claims.length < totals.claim_count && (
              <div style={{ fontSize: 12, color: T.mute, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                Showing {claims.length} of {totals.claim_count} — you only see your own claims here; the totals include everyone’s.
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8 }}>Expenses</Eyebrow>
      {body()}
    </Card>
  );
}
