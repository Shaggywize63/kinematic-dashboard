'use client';
import Link from 'next/link';

const REPORTS = [
  { href: '/dashboard/crm/reports/builder', title: '🛠 Custom Report Builder', desc: 'Pick entity, fields, filters, grouping, and export to CSV.', highlight: true },
  { href: '/dashboard/crm/reports/team-performance', title: 'Team Performance', desc: 'Won volume, conversion rate, lead ageing and new leads per rep across your hierarchy subtree.' },
  { href: '/dashboard/crm/reports/lead-tracker', title: 'Lead Tracker', desc: 'Monthly new-lead bar chart plus today / week / month summaries for your team.' },
  { href: '/dashboard/crm/reports/rep-leaderboard', title: 'Rep Leaderboard', desc: 'Revenue, deals won, win rate and average cycle by sales rep.' },
  { href: '/dashboard/crm/reports/forecast', title: 'Forecast', desc: 'Pipeline vs committed vs closed by period.' },
  { href: '/dashboard/crm/reports/stage-funnel', title: 'Stage Funnel', desc: 'Deal count and drop-off rate at each pipeline stage.' },
  { href: '/dashboard/crm/reports/win-loss', title: 'Win/Loss', desc: 'Win rate by rep, source, and stage.' },
  { href: '/dashboard/crm/reports/stuck-deals', title: 'Stuck Deals', desc: 'Open deals that have not moved stage in 14+ days.' },
  { href: '/dashboard/crm/reports/lead-aging', title: 'Lead Aging', desc: 'Open leads sorted by how long they have been stuck.' },
  { href: '/dashboard/crm/reports/activity-heatmap', title: 'Activity Heatmap', desc: 'When are reps most active?' },
  { href: '/dashboard/crm/reports/lead-source-roi', title: 'Lead Source ROI', desc: 'Revenue and ROI by acquisition source.' },
  { href: '/dashboard/crm/reports/sales-cycle', title: 'Sales Cycle', desc: 'Average days deals spend in each stage.' },
];

export default function ReportsIndex() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {REPORTS.map((r: any) => (
        <Link
          key={r.href}
          href={r.href}
          style={{
            background: r.highlight ? 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)' : 'var(--s2)',
            border: r.highlight ? 'none' : '1px solid var(--border)',
            borderRadius: 12,
            padding: 18,
            textDecoration: 'none',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: r.highlight ? '#fff' : 'var(--text)', marginBottom: 6 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: r.highlight ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>{r.desc}</div>
        </Link>
      ))}
    </div>
  );
}
