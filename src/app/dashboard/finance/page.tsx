'use client';
// Finance overview — modelled on Zoho Invoice's home: receivables ageing, sales vs receipts, KPI row, quick actions.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button, Card, Select, T, useIsCompact } from '../../../components/ui';
import { FinancePage, Stat, errMsg } from '../../../components/finance/ui';
import ReceivablesBar from '../../../components/finance/ReceivablesBar';
import { financeApi, type DashboardData, type FinanceSettings } from '../../../lib/financeApi';
import { fmtDate, inr, num } from '../../../lib/financeFormat';

// Recharts is heavy: load the chart only when the page paints.
const SalesReceiptsChart = dynamic(() => import('../../../components/finance/SalesReceiptsChart'), {
  ssr: false,
  loading: () => <div style={{ height: 280, display: 'grid', placeItems: 'center', color: T.dim, fontSize: 13 }}>Loading chart…</div>,
});

type Period = 'this_fy' | 'last_fy';

function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{children}</h2>
      {right}
    </div>
  );
}

function KpiCard({ href, label, value, tone, hint }: { href: string; label: string; value: number; tone?: 'red'; hint: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <Card padding={16} style={{ height: '100%' }}>
        <Stat label={label} value={value} tone={value > 0 ? tone : undefined} hint={hint} />
        <div style={{ fontSize: 12.5, color: T.info, fontWeight: 600, marginTop: 10 }}>View list →</div>
      </Card>
    </Link>
  );
}

export default function FinanceOverviewPage() {
  const narrow = useIsCompact(900);
  const [period, setPeriod] = useState<Period>('this_fy');
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [emailLive, setEmailLive] = useState<boolean | null>(null);

  // Business profile + email status: informational only, failures are silent.
  useEffect(() => {
    let off = false;
    financeApi.settings.get().then((r) => { if (!off) setSettings(r.data); }).catch(() => undefined);
    financeApi.meta().then((r) => { if (!off) setEmailLive(r.data?.email_live ?? null); }).catch(() => undefined);
    return () => { off = true; };
  }, []);

  // Refetch when the period changes (stale responses ignored).
  useEffect(() => {
    let off = false;
    setLoading(true);
    setError(null);
    financeApi.reports.dashboard({ period })
      .then((r) => { if (!off) setDash(r.data); })
      .catch((e) => { if (!off) setError(errMsg(e, 'Could not load the finance overview')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [period, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const needsSetup = !!settings && (!settings.business_name?.trim() || !settings.state_code);
  const isEmpty = !!dash && period === 'this_fy'
    && num(dash.receivables.total) === 0 && num(dash.receivables.open_invoices) === 0
    && num(dash.totals.sales) === 0 && num(dash.totals.receipts) === 0
    && num(dash.draft_invoices) === 0 && num(dash.open_quotes) === 0;

  const actions = (
    <>
      <Button variant="primary" href="/dashboard/finance/invoices/new">New Invoice</Button>
      <Button href="/dashboard/finance/quotes/new">New Quote</Button>
      <Button href="/dashboard/finance/payments/new">Record Payment</Button>
      <Button href="/dashboard/finance/customers/new">New Customer</Button>
    </>
  );

  return (
    <FinancePage title="Finance" description="Invoices, quotes and payments at a glance" actions={actions}>
      {needsSetup && (
        <div role="status" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.warnWash, color: T.text, fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ color: T.warn }}>Finish setup</strong>
          <span>
            Your {!settings?.business_name?.trim() ? 'business name' : ''}{!settings?.business_name?.trim() && !settings?.state_code ? ' and ' : ''}{!settings?.state_code ? 'state (needed to choose CGST+SGST or IGST)' : ''} {!settings?.business_name?.trim() && !settings?.state_code ? 'are' : 'is'} missing, so invoices will not print correctly.
          </span>
          <Link href="/dashboard/finance/settings" style={{ color: T.info, fontWeight: 600 }}>Open Finance Settings →</Link>
        </div>
      )}
      {emailLive === false && (
        <div role="note" style={{ fontSize: 12.5, color: T.mute }}>
          Email sending is not configured on this server. You can still share invoices and quotes with a link or a PDF download.
        </div>
      )}

      {error && !dash ? (
        <Card style={{ textAlign: 'center' }} padding={32}>
          <div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{error}</div>
          <Button onClick={retry}>Try again</Button>
        </Card>
      ) : !dash ? (
        <Card padding={32} style={{ textAlign: 'center', color: T.mute, fontSize: 14 }}>Loading overview…</Card>
      ) : isEmpty ? (
        <Card padding={40} style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text }}>Welcome to Finance</div>
          <p style={{ fontSize: 14, color: T.dim, margin: '8px auto 18px', maxWidth: 440 }}>
            Set up your business profile, then create your first invoice. Your receivables and sales will show up here.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" href="/dashboard/finance/settings">Open Finance Settings</Button>
            <Button href="/dashboard/finance/customers/new">Add a customer</Button>
            <Button href="/dashboard/finance/invoices/new">Create an invoice</Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: loading ? 0.6 : 1, transition: 'opacity .15s ease' }} aria-busy={loading}>
          {error && (
            <div role="alert" style={{ fontSize: 13, color: T.red }}>
              {error} <button type="button" onClick={retry} style={{ border: 0, background: 'transparent', color: T.info, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>Retry</button>
            </div>
          )}

          <Card>
            <CardTitle>Total Receivables</CardTitle>
            <ReceivablesBar data={dash.receivables} compact={narrow} />
          </Card>

          <Card>
            <CardTitle right={
              <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={{ width: 190 }}>
                <option value="this_fy">This Fiscal Year</option>
                <option value="last_fy">Last Fiscal Year</option>
              </Select>
            }>
              Sales and Receipts
            </CardTitle>
            <div style={{ fontSize: 12.5, color: T.mute, marginTop: -8, marginBottom: 12 }}>
              FY {dash.period.label} · {fmtDate(dash.period.from)} – {fmtDate(dash.period.to)}
            </div>
            <div style={{ display: 'flex', gap: 24, flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'stretch' : 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SalesReceiptsChart months={dash.months} periodLabel={dash.period.label} compact={narrow} />
              </div>
              <div style={{ display: 'flex', flexDirection: narrow ? 'row' : 'column', gap: narrow ? 24 : 22, flex: '0 0 auto', minWidth: narrow ? 0 : 200, flexWrap: 'wrap', paddingTop: narrow ? 0 : 6 }}>
                <Stat label="Total Sales" value={inr(dash.totals.sales)} tone="info" hint="Sent, part-paid and paid invoices" />
                <Stat label="Total Receipts" value={inr(dash.totals.receipts)} tone="ok" hint="Payments received" />
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <KpiCard href="/dashboard/finance/invoices" label="Draft invoices" value={num(dash.draft_invoices)} hint="Not yet sent to customers" />
            <KpiCard href="/dashboard/finance/quotes" label="Open quotes" value={num(dash.open_quotes)} hint="Draft or sent, awaiting a decision" />
            <KpiCard href="/dashboard/finance/invoices" label="Overdue invoices" value={num(dash.receivables.overdue_invoices)} tone="red" hint="Past their due date with a balance" />
          </div>
        </div>
      )}
    </FinancePage>
  );
}
