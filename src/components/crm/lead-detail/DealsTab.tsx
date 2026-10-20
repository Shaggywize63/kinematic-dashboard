'use client';
import Link from 'next/link';
import { ArrowRightLeft, Handshake } from 'lucide-react';
import type { Deal } from '../../../types/crm';
import { formatINR } from '../../../lib/formatCurrency';
import UpsellsSection from '../UpsellsSection';
import { Badge, Button, EmptyState, T, eyebrowStyle, type Tone } from '../../ui';
import SectionCard from './SectionCard';
import { fmtDate } from './format';

const DEAL_TONE: Record<string, Tone> = { won: 'ok', lost: 'red', open: 'info' };

/** Deals opened from this lead, with a Total / Won / Balance rollup, plus the upsells logged against it. */
export default function DealsTab({ leadId, deals, canConvert, onConvert }: { leadId: string; deals: Deal[]; canConvert: boolean; onConvert: () => void }) {
  // Won deals carry their won amount (the win flow overwrites `amount` with the closed figure), and
  // open deals — including the "(Balance)" deals spawned by partial closes — ARE the outstanding
  // balance, so summing plain `amount` per status is exactly the split we want.
  const sum = (rows: Deal[]) => rows.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const total = sum(deals);
  const won = sum(deals.filter((d) => d.status === 'won'));
  const balance = sum(deals.filter((d) => d.status === 'open'));
  const rollup: Array<[string, number, string]> = [['Total', total, T.text], ['Won', won, T.ok], ['Balance', balance, T.warn]];

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
      <UpsellsSection leadId={leadId} />
    </div>
  );
}
