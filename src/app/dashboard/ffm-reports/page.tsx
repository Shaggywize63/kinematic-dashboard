'use client';
import Link from 'next/link';
import { BarChart3, CalendarCheck, CalendarDays, ClipboardCheck, ListChecks, MapPin, MapPinned, MapPinOff, Route, ShieldAlert, Target, Timer, UserCog, Users, Wrench, type LucideIcon } from 'lucide-react';
import { PageIcon, InlineIcon } from '../../../components/ui/PageIcon';
import { tintFor } from '../../../components/crm/reports/reportTints';

/**
 * Field-Force Reports hub. Mirrors the Lead Management reports index
 * at /dashboard/crm/reports — a grid of report cards, each linking
 * either to an existing analytics surface that already shows that
 * cut of the data (Attendance Overview, FFM Analytics, Visit Logs,
 * Form Submissions) or to a purpose-built report page under this
 * route (e.g. /ffm-reports/visit-coverage).
 *
 * Layout choices mirror the CRM index: a 280-pixel auto-fit grid,
 * a single Custom Report Builder card as the highlight gradient, and
 * a sentence of body copy under each title so admins know what they
 * get before clicking. Builder card sits first so power-users see
 * the most flexible option ahead of the curated set.
 */

const REPORTS: Array<{ href: string; title: string; desc: string; icon: LucideIcon; highlight?: boolean }> = [
  {
    // FFM-scoped builder — picks across Team Roster / Attendance /
    // Visit Logs / Form Submissions. Distinct from the CRM builder
    // at /dashboard/crm/reports/builder which only sees CRM entities.
    href: '/dashboard/ffm-reports/builder',
    title: 'Custom Report Builder',
    icon: Wrench,
    desc: 'Build a report across the team roster, attendance punches, visit logs, or submissions — then export to CSV.',
    highlight: true,
  },
  {
    href: '/dashboard/ffm-reports/attendance-summary',
    title: 'Attendance Summary',
    icon: CalendarDays,
    desc: 'Monthly attendance %, working days, late check-ins, early check-outs and absent days by rep.',
  },
  {
    href: '/dashboard/ffm-reports/visit-coverage',
    title: 'Visit Coverage',
    icon: Target,
    desc: 'Planned vs actual outlet visits per rep, per city — and the outlets that haven’t been visited.',
  },
  {
    href: '/dashboard/ffm-reports/hours-idle',
    title: 'Hours & Idle Time',
    icon: Timer,
    desc: 'Working hours, on-site hours and idle minutes per rep across the selected window.',
  },
  {
    href: '/dashboard/ffm-reports/rep-activity',
    title: 'Rep Activity Comparison',
    icon: Users,
    desc: 'Coverage, productive calls, orders, distance, time on site and attendance per rep, beside the team median.',
  },
  {
    href: '/dashboard/ffm-reports/beat-compliance',
    title: 'Beat Compliance',
    icon: ListChecks,
    desc: 'Planned vs visited calls week by week, per rep, and the plan days on which nothing was visited.',
  },
  {
    href: '/dashboard/ffm-reports/outlet-visit-gaps',
    title: 'Outlet Visit Gaps',
    icon: MapPinOff,
    desc: 'Which outlets have not been visited, and for how long, with the rep who plans them and their recent orders.',
  },
  {
    href: '/dashboard/ffm-reports/time-and-travel',
    title: 'Time & Travel',
    icon: Route,
    desc: 'Kilometres, km per visit, time on site, first and last call of the day and on-site share of working hours.',
  },
  {
    href: '/dashboard/ffm-reports/geo-exceptions',
    title: 'Geo-fence Exceptions',
    icon: ShieldAlert,
    desc: 'Check-ins made outside the outlet geofence, plus mock-location, VPN and GPS-jump alerts, per rep.',
  },
  {
    href: '/dashboard/ffm-reports/supervisor-teams',
    title: 'Supervisor Teams',
    icon: UserCog,
    desc: 'Team size, coverage and output per supervisor, with per-rep measures that do not favour bigger teams.',
  },
  {
    href: '/dashboard/ffm-analytics',
    title: 'Productivity Analytics',
    icon: BarChart3,
    desc: 'KPIs, trends, heatmaps and weekly contacts, plus a customisable grid of field-force widgets.',
  },
  {
    href: '/dashboard/attendance-overview',
    title: 'Attendance Overview',
    icon: CalendarCheck,
    desc: 'Today’s live attendance roll — who’s in, who’s out, who’s on leave.',
  },
  {
    href: '/dashboard/visit-logs',
    title: 'Visit Logs',
    icon: MapPin,
    desc: 'Every check-in / check-out captured by the mobile app, with geo-tag, photos and duration.',
  },
  {
    href: '/dashboard/submissions',
    title: 'Form Submissions',
    icon: ClipboardCheck,
    desc: 'Submission counts and content by template — audit completion, store surveys, KYC, etc.',
  },
  {
    href: '/dashboard/live-tracking',
    title: 'Live Trailing',
    icon: MapPinned,
    desc: 'Real-time map of every rep on the field today plus their breadcrumb trail.',
  },
];

export default function FfmReportsIndex() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <PageIcon />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Field Force Reports</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
            Curated cuts of attendance, visits, hours, and rep performance &mdash;
            plus a custom builder when you need a slice that isn&apos;t here.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="km-rcard"
            data-hl={r.highlight ? '1' : undefined}
            style={{
              ['--tint' as string]: r.highlight ? 'var(--red)' : tintFor(r.href),
              background: r.highlight
                ? 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)'
                : 'var(--s2)',
              border: r.highlight ? 'none' : '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
              textDecoration: 'none',
            } as React.CSSProperties}
          >
            <div className="km-rcard-t" style={{ fontSize: 14, fontWeight: 700, color: r.highlight ? '#fff' : 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <InlineIcon icon={r.icon} size={16} style={{ color: r.highlight ? 'inherit' : 'var(--dim)' }} />
              {r.title}
            </div>
            <div className="km-rcard-d" style={{ fontSize: 12, color: r.highlight ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>
              {r.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
