'use client';
import Link from 'next/link';
import { useAuth } from '../../../../hooks/useAuth';
import { isConsumerChampion } from '../../../../lib/clientFeatures';

type ReportEntry = {
  href: string;
  title: string;
  desc: string;
  highlight?: boolean;
  /** When true, this report is hidden for Consumer Champion users. */
  championHidden?: boolean;
};

const REPORTS: ReportEntry[] = [
  { href: '/dashboard/crm/reports/builder', title: '🛠 Custom Report Builder', desc: 'Pick entity, fields, filters, grouping, and export to CSV.', highlight: true, championHidden: true },
  { href: '/dashboard/crm/reports/team-performance', title: 'Team Performance', desc: 'Won volume, conversion rate, lead ageing and new leads per rep across your hierarchy subtree.' },
  { href: '/dashboard/crm/reports/lead-tracker', title: 'Lead Tracker', desc: 'Monthly new-lead bar chart plus today / week / month summaries for your team.', championHidden: true },
  { href: '/dashboard/crm/reports/team-daily', title: 'Team Daily Activity', desc: 'Per-rep attendance, visits achieved vs scheduled, and leads added — for any chosen day.', championHidden: true },
  { href: '/dashboard/crm/reports/rep-leaderboard', title: 'Rep Leaderboard', desc: 'Revenue, deals won, win rate and average cycle by sales rep.', championHidden: true },
  { href: '/dashboard/crm/reports/forecast', title: 'Forecast', desc: 'Pipeline vs committed vs closed by period.', championHidden: true },
  { href: '/dashboard/crm/reports/stage-funnel', title: 'Stage Funnel', desc: 'Deal count and drop-off rate at each pipeline stage.', championHidden: true },
  { href: '/dashboard/crm/reports/win-loss', title: 'Win/Loss', desc: 'Win rate by rep, source, and stage.' },
  { href: '/dashboard/crm/reports/stuck-deals', title: 'Stuck Deals', desc: 'Open deals that have not moved stage in 14+ days.', championHidden: true },
  { href: '/dashboard/crm/reports/lead-aging', title: 'Lead Aging', desc: 'Open leads sorted by how long they have been stuck.', championHidden: true },
  { href: '/dashboard/crm/reports/activity-heatmap', title: 'Activity Heatmap', desc: 'When are reps most active?', championHidden: true },
  { href: '/dashboard/crm/reports/lead-source-roi', title: 'Lead Source ROI', desc: 'Revenue and ROI by acquisition source.', championHidden: true },
  { href: '/dashboard/crm/reports/sales-cycle', title: 'Sales Cycle', desc: 'Average days deals spend in each stage.', championHidden: true },
];

// Champion-visible hrefs — only these three surfaces are relevant for the
// Consumer Champion FE role: total leads captured (lead-tracker), total
// deals (team-performance counts), and win/loss rate.
const CHAMPION_HREFS = new Set([
  '/dashboard/crm/reports/team-performance',
  '/dashboard/crm/reports/win-loss',
  // Lead Tracker shows "Total leads captured" — the bar-chart + period cards
  // are the primary tool a Champion Manager uses to track new leads.
  '/dashboard/crm/reports/lead-tracker',
]);

export default function ReportsIndex() {
  const { user } = useAuth();
  const champion = isConsumerChampion(user as any);

  const visible = champion
    ? REPORTS.filter((r) => CHAMPION_HREFS.has(r.href))
    : REPORTS.filter((r) => !r.championHidden);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {visible.map((r) => (
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
