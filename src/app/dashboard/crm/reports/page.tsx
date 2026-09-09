'use client';
import Link from 'next/link';
import {
  Activity, BarChart3, CalendarDays, CalendarRange, ChevronRight, ClipboardList, Clock, Filter, FlaskConical, Hammer,
  Hourglass, LineChart, Mail, Route, Scale, Timer, TrendingUp, Trophy, Users,
} from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { isConsumerChampion, canDownloadSrsReport, leadReportLabel } from '../../../../lib/clientFeatures';
import { Badge, Eyebrow, PageHeader, T, useIsCompact } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

type ReportEntry = {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  highlight?: boolean;
  /** When true, this report is hidden for Consumer Champion users. */
  championHidden?: boolean;
  /** When true, this report only shows for SRS/Tata Area Sales Officer +
   *  CRM Admin roles (see canDownloadSrsReport). Everyone else never sees it. */
  srsOnly?: boolean;
};

const I = { size: 18, strokeWidth: 1.6 } as const;

const REPORTS: ReportEntry[] = [
  { href: '/dashboard/crm/reports/builder', title: 'Custom Report Builder', desc: 'Pick entity, fields, filters, grouping, and export to CSV.', icon: <Hammer {...I} />, highlight: true, championHidden: true },
  { href: '/dashboard/crm/reports/schedules', title: 'Scheduled Digests', desc: 'Email any report to your team on a recurring daily / weekly / monthly schedule.', icon: <Mail {...I} />, highlight: true, championHidden: true },
  { href: '/dashboard/crm/reports/srs-lead-report', title: 'SRS Lead Report', desc: 'The SRS field format — lead, site and converted-deal detail in one CSV. Download your leads (or the whole tenant, if CRM Admin).', icon: <ClipboardList {...I} />, srsOnly: true },
  { href: '/dashboard/crm/reports/activity-report', title: 'Activity Report', desc: 'Every logged activity with lead, directory (dealer) and notes — one row per activity.', icon: <Activity {...I} />, srsOnly: true },
  { href: '/dashboard/crm/reports/test-report', title: 'Test Report', desc: 'Leads where a Ring or Weighment test was recorded, with attendee count.', icon: <FlaskConical {...I} />, srsOnly: true },
  { href: '/dashboard/crm/reports/daywise-report', title: 'Day-Wise Report', desc: 'Per-rep, per-day rollup: activity split, unique leads, deals and tonnage, with a grand total.', icon: <CalendarRange {...I} />, srsOnly: true },
  { href: '/dashboard/crm/reports/team-performance', title: 'Team Performance', desc: 'Won volume, conversion rate, lead ageing and new leads per rep across your hierarchy subtree.', icon: <Users {...I} /> },
  { href: '/dashboard/crm/reports/lead-tracker', title: 'Lead Tracker', desc: 'Monthly new-lead bar chart plus today / week / month summaries for your team.', icon: <BarChart3 {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/team-daily', title: 'Team Daily Activity', desc: 'Per-rep attendance, visits achieved vs scheduled, and leads added — for any chosen day.', icon: <CalendarDays {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/rep-leaderboard', title: 'Rep Leaderboard', desc: 'Revenue, deals won, win rate and average cycle by sales rep.', icon: <Trophy {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/forecast', title: 'Forecast', desc: 'Pipeline vs committed vs closed by period.', icon: <TrendingUp {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/stage-funnel', title: 'Stage Funnel', desc: 'Deal count and drop-off rate at each pipeline stage.', icon: <Filter {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/win-loss', title: 'Win/Loss', desc: 'Win rate by rep, source, and stage.', icon: <Scale {...I} /> },
  { href: '/dashboard/crm/reports/stuck-deals', title: 'Stuck Deals', desc: 'Open deals that have not moved stage in 14+ days.', icon: <Hourglass {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/lead-aging', title: 'Lead Aging', desc: 'Open leads sorted by how long they have been stuck.', icon: <Clock {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/activity-heatmap', title: 'Activity Heatmap', desc: 'When are reps most active?', icon: <LineChart {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/lead-source-roi', title: 'Lead Source ROI', desc: 'Revenue and ROI by acquisition source.', icon: <Route {...I} />, championHidden: true },
  { href: '/dashboard/crm/reports/sales-cycle', title: 'Sales Cycle', desc: 'Average days deals spend in each stage.', icon: <Timer {...I} />, championHidden: true },
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
  usePageTitle('Reports');
  const narrow = useIsCompact(900);
  const { user } = useAuth();
  const champion = isConsumerChampion(user as any);
  const srs = canDownloadSrsReport(user as any);
  // The field lead-report tile is named for the tenant (BMW sees "BMW Lead
  // Report"); the CSV format is identical. Keep in sync with the report page.
  const SRS_REPORT_HREF = '/dashboard/crm/reports/srs-lead-report';
  const reportTitleFor = (r: ReportEntry) =>
    r.href === SRS_REPORT_HREF ? leadReportLabel(user as any) : r.title;

  // `championHidden: true` means "hide this for Champion users" — so
  // non-Champion users see EVERY report (including the ones flagged
  // championHidden). The earlier filter inverted that and was hiding
  // the Custom Report Builder + most reports from non-Champions,
  // which is the opposite of what the flag is for.
  //
  // `srsOnly: true` is the inverse gate — the SRS Lead Report only
  // appears for SRS/Tata Area Sales Officer + CRM Admin roles, and is
  // hidden from everyone else (including non-Champions).
  const visible = (champion
    ? REPORTS.filter((r) => CHAMPION_HREFS.has(r.href))
    : REPORTS
  ).filter((r) => !r.srsOnly || srs);

  const tools = visible.filter((r) => r.highlight);
  const reports = visible.filter((r) => !r.highlight);

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Reports"
        description="Ready-made reports for the team, plus a builder and scheduled digests for anything custom."
        compact={narrow}
      />

      {tools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Eyebrow>Tools</Eyebrow>
          <div style={grid}>
            {tools.map((r) => <ReportCard key={r.href} entry={r} title={reportTitleFor(r)} />)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Eyebrow>Reports</Eyebrow>
        <div style={grid}>
          {reports.map((r) => <ReportCard key={r.href} entry={r} title={reportTitleFor(r)} />)}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ entry, title }: { entry: ReportEntry; title: string }) {
  return (
    <Link
      href={entry.href}
      className="km-clickable"
      style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16,
        textDecoration: 'none', display: 'flex', gap: 12, alignItems: 'flex-start', color: 'inherit',
      }}
    >
      <span aria-hidden style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: entry.highlight ? T.redWash : 'var(--s3)', color: entry.highlight ? T.red : T.dim,
      }}>{entry.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
          {entry.srsOnly && <Badge tone="info">CSV</Badge>}
        </div>
        <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{entry.desc}</div>
      </div>
      <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute, flexShrink: 0, marginTop: 2 }} />
    </Link>
  );
}
