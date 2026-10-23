'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, Handshake, PackagePlus } from 'lucide-react';
import type { Deal } from '../../../types/crm';
import { crmLeads } from '../../../lib/crmApi';
import { getStoredUser } from '../../../lib/auth';
import { isBmwActive } from '../../../lib/clientFeatures';
import { formatINR } from '../../../lib/formatCurrency';
import UpsellsSection from '../UpsellsSection';
import { Badge, Button, EmptyState, T, eyebrowStyle, type Tone } from '../../ui';
import SectionCard from './SectionCard';
import { fmtDate } from './format';

const DEAL_TONE: Record<string, Tone> = { won: 'ok', lost: 'red', open: 'info' };

// kg → a compact tonne label, e.g. 40000 → "40 t", 42500 → "42.5 t".
const asTonnes = (kg: number) => {
  const t = kg / 1000;
  const s = Number.isInteger(t) ? String(t) : t.toFixed(2).replace(/\.?0+$/, '');
  return `${s} t`;
};

/** Deals opened from this lead, with a Total / Won / Balance rollup, plus the upsells logged against it. */
export default function DealsTab({ leadId, deals, canConvert, onConvert, hideWon = false, showFulfillBalance = false }: { leadId: string; deals: Deal[]; canConvert: boolean; onConvert: () => void; hideWon?: boolean; showFulfillBalance?: boolean }) {
  const router = useRouter();
  // BMW does not use the upsell flow — hide the Upsells section entirely for them.
  const hideUpsells = isBmwActive(getStoredUser());
  // BMW order balance (interested tonnage − booked). Fetched from the backend so
  // it is authoritative (sums volume across every deal, not just what's loaded here).
  const [bal, setBal] = useState<{ interested_kg: number; booked_kg: number; balance_kg: number; has_interest: boolean } | null>(null);
  const [fulfilling, setFulfilling] = useState(false);
  useEffect(() => {
    if (!showFulfillBalance) { setBal(null); return; }
    let cancelled = false;
    crmLeads.balance(leadId).then((r) => { if (!cancelled) setBal(r.data ?? null); }).catch(() => { if (!cancelled) setBal(null); });
    return () => { cancelled = true; };
  }, [showFulfillBalance, leadId, deals.length]);

  const onFulfill = async () => {
    setFulfilling(true);
    try {
      await crmLeads.fulfillBalance(leadId);
      // Confirm with a simple popup and send the user to the deals list (not the
      // freshly-created balance deal) so they return to their working view.
      toast.success('Balance has been updated');
      router.push('/dashboard/crm/deals');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not create the balance deal');
    } finally {
      setFulfilling(false);
    }
  };
  // Won deals carry their won amount (the win flow overwrites `amount` with the closed figure), and
  // open deals — including the "(Balance)" deals spawned by partial closes — ARE the outstanding
  // balance, so summing plain `amount` per status is exactly the split we want.
  const sum = (rows: Deal[]) => rows.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const total = sum(deals);
  const won = sum(deals.filter((d) => d.status === 'won'));
  const balance = sum(deals.filter((d) => d.status === 'open'));
  // BMW (hideWon) has no close-as-won flow, so the "Won" rollup column is dropped for them.
  const rollup: Array<[string, number, string]> = [
    ['Total', total, T.text],
    ...(hideWon ? [] : [['Won', won, T.ok] as [string, number, string]]),
    ['Balance', balance, T.warn],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionCard title="Deals" count={deals.length}>
        {deals.length === 0 ? (
          <EmptyState
            icon={<Handshake size={20} strokeWidth={1.6} />}
            title="No deals from this lead yet"
            description="Convert the lead to open a deal and track its value through the pipeline."
            action={canConvert ? <Button variant="primary" onClick={onConvert} icon={<ArrowRightLeft size={15} strokeWidth={1.8} />}>Convert to deal</Button> : undefined}
            style={{ padding: '28px 16px' }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
              {rollup.map(([label, value, color]) => (
                <div key={label} style={{ background: T.card, padding: '10px 14px', flex: '1 1 110px', minWidth: 0 }}>
                  <div style={{ ...eyebrowStyle, fontSize: 10 }}>{label}</div>
                  <div style={{ marginTop: 3, fontFamily: T.mono, fontSize: 15, fontWeight: 650, color, whiteSpace: 'nowrap' }}>{formatINR(value)}</div>
                </div>
              ))}
            </div>
            {showFulfillBalance && bal?.has_interest && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...eyebrowStyle, fontSize: 10 }}>Order balance</div>
                  <div style={{ marginTop: 3, fontSize: 13, color: T.text }}>
                    Interested <strong>{asTonnes(bal.interested_kg)}</strong> · Booked <strong>{asTonnes(bal.booked_kg)}</strong> · Balance{' '}
                    <strong style={{ color: bal.balance_kg > 0 ? T.warn : T.ok }}>{asTonnes(bal.balance_kg)}</strong>
                  </div>
                </div>
                {bal.balance_kg > 0 && (
                  <Button variant="primary" onClick={onFulfill} disabled={fulfilling} icon={<PackagePlus size={15} strokeWidth={1.8} />}>
                    {fulfilling ? 'Creating…' : 'Fulfill balance'}
                  </Button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deals.map((d) => (
                <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} className="km-navrow" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--s3)', borderRadius: 10, textDecoration: 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{d.name}</div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: T.dim }}>
                      {d.stage_name && <span>{d.stage_name}</span>}
                      <Badge tone={DEAL_TONE[d.status] ?? 'neutral'} dot style={{ textTransform: 'capitalize', height: 20 }}>{d.status}</Badge>
                      {d.expected_close_date && <span>Closes {fmtDate(d.expected_close_date)}</span>}
                    </div>
                  </div>
                  <div style={{ color: T.text, fontWeight: 650, fontFamily: T.mono, whiteSpace: 'nowrap', fontSize: 14 }}>{formatINR(d.amount || 0)}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </SectionCard>
      {!hideUpsells && <UpsellsSection leadId={leadId} />}
    </div>
  );
}
