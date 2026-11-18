'use client';
// Upcoming invoices — recurring invoices due to be raised within a horizon (plus any
// already overdue). Read-only: this mirrors the server's renewal-reminder scan as a list
// the admin can act on from Finance. Nothing is created here; "Raise" opens the invoice.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Select, T } from '../ui';
import { Stat, errMsg } from './ui';
import { financeApi, type UpcomingInvoice, type UpcomingInvoicesTotals } from '../../lib/financeApi';
import { fmtDate, inr } from '../../lib/financeFormat';

/** "Overdue", "Today", "Tomorrow", or "in N days". */
function whenLabel(u: UpcomingInvoice): string {
  if (u.overdue) return 'Overdue';
  if (u.days_until <= 0) return 'Today';
  if (u.days_until === 1) return 'Tomorrow';
  return `in ${u.days_until} days`;
}

const HORIZONS = [
  { value: 7, label: 'Next 7 days' },
  { value: 30, label: 'Next 30 days' },
  { value: 60, label: 'Next 60 days' },
  { value: 90, label: 'Next 90 days' },
];

export default function UpcomingInvoices({ compact = false }: { compact?: boolean }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<UpcomingInvoice[]>([]);
  const [totals, setTotals] = useState<UpcomingInvoicesTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let off = false;
    setLoading(true);
    setError(null);
    financeApi.invoices.upcoming(days)
      .then((r) => { if (!off) { setRows(r.data ?? []); setTotals(r.totals ?? null); } })
      .catch((e) => { if (!off) setError(errMsg(e, 'Could not load upcoming invoices')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [days, reloadKey]);

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>Upcoming invoices</h2>
        {totals && totals.due_now > 0 && <Badge tone="red" dot>{totals.due_now} due now</Badge>}
      </div>
      <Select aria-label="Horizon" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 150 }}>
        {HORIZONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
      </Select>
    </div>
  );

  return (
    <Card>
      {title}
      <div style={{ fontSize: 12.5, color: T.mute, marginTop: -8, marginBottom: 12 }}>
        Recurring invoices scheduled to be raised{totals ? ` in the next ${totals.horizon_days} days` : ''}. Raising stays manual — nothing is created automatically.
      </div>

      {error ? (
        <div style={{ textAlign: 'center', padding: '18px 0' }}>
          <div role="alert" style={{ color: T.red, fontSize: 13.5, marginBottom: 10 }}>{error}</div>
          <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>
        </div>
      ) : loading && !rows.length ? (
        <div style={{ color: T.mute, fontSize: 13.5, padding: '14px 0' }}>Loading…</div>
      ) : !rows.length ? (
        <div style={{ color: T.dim, fontSize: 13.5, padding: '14px 0' }}>
          No recurring invoices are due in this window. Set an invoice to repeat (its “Make recurring” option) and it will appear here before each renewal.
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s ease' }} aria-busy={loading}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'hidden' }}>
            {rows.map((u) => (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: compact ? '1fr auto' : '1.5fr 1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: T.panel }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.customer_name}</div>
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                    {u.cadence} · last {u.number}
                  </div>
                </div>
                {!compact && (
                  <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge tone={u.overdue ? 'red' : u.days_until <= 7 ? 'warn' : 'neutral'} dot>{whenLabel(u)}</Badge>
                    <span style={{ color: T.mute }}>{fmtDate(u.next_invoice_date)}</span>
                  </div>
                )}
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: T.text }}>{inr(u.amount)}</div>
                  <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
                    {u.tax_total > 0 ? `incl. ${inr(u.tax_total)} GST` : 'no GST'}
                    {compact && <> · <span style={{ color: u.overdue ? T.red : T.mute }}>{whenLabel(u)}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totals && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <Stat label="Expected to bill" value={inr(totals.amount)} tone="info" hint={`${totals.count} invoice${totals.count === 1 ? '' : 's'}${totals.due_now ? ` · ${totals.due_now} due now` : ''}`} />
              <Stat label="GST in that" value={inr(totals.tax_total)} hint="Output GST you'll charge" />
              <Link href="/dashboard/finance/invoices" style={{ color: T.info, fontWeight: 600, fontSize: 13, textDecoration: 'none', alignSelf: 'center' }}>Go to invoices →</Link>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
