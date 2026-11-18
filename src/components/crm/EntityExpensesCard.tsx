'use client';
// "Expenses" card on a lead / deal page (connected-B2B only): what was spent on it, how many visits it took and
// what share of the opportunity value that is — so the team can see the cost of winning (or not winning) it.
// Backend: GET /crm/leads/:id/expenses and /crm/deals/:id/expenses. Renders nothing, and calls nothing, for any
// other client.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Link2, Plus, Receipt, RotateCcw, X } from 'lucide-react';
import { Button, Card, Eyebrow, T } from '../ui';
import { ClaimStatusBadge, money } from '../expenses/kit';
import { crmDeals, crmLeads } from '../../lib/crmApi';
import { isB2bClientActive } from '../../lib/b2bClient';
import expensesApi, { CLAIM_STATUS_LABEL, type ClaimStatus, type ExpenseClaim } from '../../lib/expensesApi';
import type { EntityExpenses } from '../../types/crm';

// A reply that isn't the documented shape (an older server answering with an empty list, say) is treated as a failed
// load rather than crashing the page it sits on.
const usable = (d: unknown): d is EntityExpenses => {
  const x = d as EntityExpenses | null | undefined;
  return !!x && typeof x === 'object' && !!x.totals && typeof x.totals === 'object' && Array.isArray(x.claims);
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// Friendly labels for the expense types (expense_claim_items.category); an unknown key shows title-cased.
const CATEGORY_LABEL: Record<string, string> = {
  mileage: 'Mileage', travel: 'Travel', food: 'Food', lodging: 'Lodging', fuel: 'Fuel', toll: 'Toll', misc: 'Other',
};
const catLabel = (c: string) => CATEGORY_LABEL[c] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other');
/** 30 -> "30%", 12.5 -> "12.5%", 0.04 -> "0.04%" (never a long tail of decimals). */
const pct = (v: number) => `${Number(v.toFixed(v < 1 ? 2 : 1)).toLocaleString('en-IN')}%`;

export default function EntityExpensesCard({ kind, id }: { kind: 'lead' | 'deal'; id: string }) {
  const b2b = isB2bClientActive();
  const [data, setData] = useState<EntityExpenses | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // "Link an existing expense" picker: the current user's own claims not already on this record.
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<ExpenseClaim[] | null>(null);
  const [pickState, setPickState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState('loading');
    return (kind === 'lead' ? crmLeads.expenses(id) : crmDeals.expenses(id))
      .then((r) => { if (usable(r.data)) { setData(r.data); setState('ready'); } else setState('error'); })
      .catch(() => setState('error'));
  }, [kind, id]);

  const fetchCandidates = useCallback(() => {
    setPickState('loading');
    expensesApi.listClaims()
      .then((r) => { setCandidates(Array.isArray(r.data) ? r.data : []); setPickState('idle'); })
      .catch(() => setPickState('error'));
  }, []);

  const openPicker = useCallback(() => { setPicking(true); if (candidates === null) fetchCandidates(); }, [candidates, fetchCandidates]);

  const linkClaim = useCallback((claimId: string) => {
    setLinkingId(claimId);
    expensesApi.linkClaim(claimId, kind === 'lead' ? { lead_id: id } : { deal_id: id })
      .then(() => { setPicking(false); setCandidates(null); return load(); })
      .catch(() => setPickState('error'))
      .finally(() => setLinkingId(null));
  }, [kind, id, load]);

  // The user's own claims that aren't already on this exact record (newest first, as the API returns them).
  const linkable = useMemo(
    () => (candidates ?? []).filter((c) => (kind === 'lead' ? c.lead_id !== id : c.deal_id !== id)),
    [candidates, kind, id],
  );

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
          <Button size="sm" variant="ghost" onClick={() => { void load(); }} icon={<RotateCcw size={14} strokeWidth={1.8} />}>Try again</Button>
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
    const byCategory = (data.by_category ?? []).filter((b) => Number(b.amount) > 0);
    const catMax = byCategory.reduce((m, b) => Math.max(m, Number(b.amount) || 0), 0);
    return (
      <>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
          {money(spent, currency)} spent{share != null && value != null ? ` · ${pct(share)} of ${money(value, currency)}` : ''}
        </div>
        <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>{plural(totals.claim_count, 'claim')} · {plural(visits, 'visit')}</div>
        {parts.length > 0 && (
          <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>{parts.map(([k, v]) => `${k} ${money(v, currency)}`).join(' · ')}</div>
        )}
        {byCategory.length > 0 && (
          <div data-testid="expense-by-type" style={{ marginTop: 12 }}>
            <Eyebrow style={{ marginBottom: 6 }}>By type</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byCategory.map((b) => (
                <div key={b.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: T.dim, minWidth: 64, flexShrink: 0 }}>{catLabel(b.category)}</div>
                  <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${catMax > 0 ? Math.max(4, Math.round((Number(b.amount) / catMax) * 100)) : 0}%`, background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums', minWidth: 68, textAlign: 'right' }}>{money(b.amount, currency)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {claims.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
            <Eyebrow style={{ marginBottom: 2 }}>By trip</Eyebrow>
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

  const linkUI = () => {
    if (!picking) {
      return (
        <Button size="sm" variant="ghost" onClick={openPicker} icon={<Plus size={14} strokeWidth={2} />} style={{ marginTop: 14 }}>
          Link an existing expense
        </Button>
      );
    }
    return (
      <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <Eyebrow style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Link2 aria-hidden size={13} strokeWidth={2} />Link an existing expense</Eyebrow>
          <Button size="sm" variant="ghost" onClick={() => setPicking(false)} icon={<X size={14} strokeWidth={1.8} />} aria-label="Close">Close</Button>
        </div>
        {pickState === 'loading' && <div style={{ fontSize: 13, color: T.mute }}>Loading your expenses…</div>}
        {pickState === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: T.dim }}>
            <span>Couldn’t load your expenses</span>
            <Button size="sm" variant="ghost" onClick={fetchCandidates} icon={<RotateCcw size={14} strokeWidth={1.8} />}>Try again</Button>
          </div>
        )}
        {pickState === 'idle' && linkable.length === 0 && (
          <div style={{ fontSize: 13, color: T.mute }}>
            You have no other expenses to link. Create one from the Expenses page, choosing this {kind} as what it was spent on.
          </div>
        )}
        {pickState === 'idle' && linkable.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflowY: 'auto' }}>
            {linkable.map((c) => {
              const otherLink = kind === 'lead' ? c.lead_name : c.deal_name; // where it currently sits, if anywhere
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => linkClaim(c.id)}
                  disabled={linkingId != null}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                    padding: '9px 0', background: 'none', border: 'none', borderTop: `1px solid ${T.border}`,
                    textAlign: 'left', cursor: linkingId != null ? 'default' : 'pointer', opacity: linkingId != null && linkingId !== c.id ? 0.5 : 1, width: '100%',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 150px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{c.claim_no || c.title || 'Expense claim'}</div>
                    <div style={{ fontSize: 12, color: T.mute, overflowWrap: 'anywhere' }}>
                      {[CLAIM_STATUS_LABEL[c.status], otherLink ? `on ${otherLink}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{money(c.total_amount, c.currency)}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {linkingId === c.id ? 'Linking…' : (<><Link2 size={13} strokeWidth={2} />Link</>)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Receipt aria-hidden size={13} strokeWidth={2} />Expenses</Eyebrow>
      {body()}
      {state !== 'loading' && linkUI()}
    </Card>
  );
}
