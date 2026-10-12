'use client';
import { Card, PageHeader, Pill } from '../../../../components/distribution/Atoms';

/**
 * Distribution & Supply-Chain Reports hub.
 *
 * One discoverable home for every report in the Distribution and Supply-Chain modules. Tiles marked `live`
 * open a page that exists today (several are the module's own list page, which IS its report — orders,
 * invoices, receivables, stock); tiles marked `planned` are on the roadmap (new backend + screens) and are
 * shown greyed so the whole catalogue is visible in one place. A client only ever reaches a report whose
 * module it is entitled to — the sidebar gates the section, and each target page gates itself.
 */

interface Report {
  label: string;
  sub: string;
  href?: string;        // present ⇒ live
  planned?: boolean;    // true ⇒ roadmap, rendered disabled
}
interface Group { title: string; icon: string; reports: Report[]; }

const GROUPS: Group[] = [
  {
    title: 'Sales & Orders',
    icon: '🛒',
    reports: [
      { label: 'Order Register',          sub: 'Every order — outlet, salesman, value, status, date range', href: '/dashboard/distribution/orders' },
      { label: 'Invoice / GST Sales Register', sub: 'Issued invoices with taxable value, CGST/SGST/IGST, grand total', href: '/dashboard/distribution/invoices' },
      { label: 'Daily Salesman Challan (DSR)', sub: 'Beat sales, van stock and collection for a salesman-day', href: '/dashboard/distribution/reports/dsr' },
      { label: 'Returns Register',         sub: 'Sales returns / credit notes by outlet and reason', href: '/dashboard/distribution/returns' },
      { label: 'Sales by SKU / brand / category', sub: 'Quantity and value, grouped and ranked', planned: true },
      { label: 'Sales by outlet / beat / salesman', sub: 'Top and bottom performers for a period', planned: true },
    ],
  },
  {
    title: 'Collections & Receivables',
    icon: '💰',
    reports: [
      { label: 'Collection Register',      sub: 'Payments received — mode, outlet, salesman, status', href: '/dashboard/distribution/payments' },
      { label: 'Outstanding & Ageing',     sub: 'Distributor dues in 0–30 / 31–60 / 61–90 / 90+ buckets, over-limit', href: '/dashboard/distribution/receivables' },
      { label: 'Party Ledger',             sub: 'Running debit/credit statement per distributor', href: '/dashboard/distribution/ledger' },
      { label: 'Collection by salesman / date', sub: 'Cash vs UPI vs cheque totals, daily and period', planned: true },
      { label: 'Outlet-wise outstanding',  sub: 'Dues per retail outlet, net of payments, overdue by credit days', planned: true },
      { label: 'Collection target vs achievement', sub: 'Employee-wise monthly ₹ collection target and % achieved', planned: true },
    ],
  },
  {
    title: 'Stock & Inventory',
    icon: '📦',
    reports: [
      { label: 'Distributor Stock on Hand', sub: 'Current qty, reserved and available per SKU', href: '/dashboard/distribution/stock' },
      { label: 'Godown Movement',          sub: 'Received, issued, adjustment and balance per product', href: '/dashboard/distribution/reports/godown' },
      { label: 'Stock Movement Ledger',    sub: 'Every in/out/adjust with reason, date and reference', href: '/dashboard/distribution/stock/movements' },
      { label: 'Damaged / Expired Stock',  sub: 'Damage and expiry write-offs by SKU and distributor', href: '/dashboard/distribution/damage' },
      { label: 'Closing Stock (daily)',    sub: 'Opening, sales, movements, physical count, closing — per day', planned: true },
      { label: 'Stock Discrepancy',        sub: 'Physical vs system count with variance and adjustment', planned: true },
      { label: 'Van Load Reconciliation',  sub: 'Loaded vs sold vs returned vs damaged, closing per van-day', href: '/dashboard/distribution/reconciliation' },
    ],
  },
  {
    title: 'Targets & Performance',
    icon: '🎯',
    reports: [
      { label: 'Quarterly Sales Targets',  sub: 'Shop × SKU target vs invoiced quantity, % achievement', href: '/dashboard/distribution/reports/targets' },
      { label: 'Target vs Achievement (₹)', sub: 'Value targets vs actuals by salesman and period', planned: true },
      { label: 'Productivity / coverage',  sub: 'Calls, productive calls, lines per bill, drop size', planned: true },
    ],
  },
];

export default function DistributionReports() {
  return (
    <div>
      <PageHeader
        title="Distribution & Supply-Chain Reports"
        subtitle="Sales, collections, receivables, stock and target reports. Tiles marked Planned are on the roadmap."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
              <span style={{ fontSize: 20 }}>{g.icon}</span>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{g.title}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {g.reports.map((r) => {
                const inner = (
                  <Card
                    padding={16}
                    style={{
                      height: '100%',
                      opacity: r.planned ? 0.6 : 1,
                      cursor: r.planned ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{r.label}</div>
                      {r.planned
                        ? <Pill color="amber">Planned</Pill>
                        : <Pill color="green">Live</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.45 }}>{r.sub}</div>
                  </Card>
                );
                return r.href
                  ? <a key={r.label} href={r.href} style={{ textDecoration: 'none' }}>{inner}</a>
                  : <div key={r.label}>{inner}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
