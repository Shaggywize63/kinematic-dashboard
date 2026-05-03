'use client';
import Link from 'next/link';

const REPORTS = [
  { href: '/dashboard/crm/reports/forecast', title: 'Forecast', desc: 'Pipeline vs committed vs closed by period.' },
  { href: '/dashboard/crm/reports/win-loss', title: 'Win/Loss', desc: 'Win rate by rep, source, and stage.' },
  { href: '/dashboard/crm/reports/activity-heatmap', title: 'Activity Heatmap', desc: 'When are reps most active?' },
  { href: '/dashboard/crm/reports/lead-source-roi', title: 'Lead Source ROI', desc: 'Revenue and ROI by acquisition source.' },
  { href: '/dashboard/crm/reports/sales-cycle', title: 'Sales Cycle', desc: 'Average days deals spend in each stage.' },
];

export default function ReportsIndex() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {REPORTS.map((r) => (
        <Link key={r.href} href={r.href} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.desc}</div>
        </Link>
      ))}
    </div>
  );
}
