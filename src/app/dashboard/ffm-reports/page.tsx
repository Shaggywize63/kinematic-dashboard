'use client';
import Link from 'next/link';

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

const REPORTS = [
  {
    href: '/dashboard/crm/reports/builder',
    title: '🛠 Custom Report Builder',
    desc: 'Pick entity, fields, filters, grouping, and export to CSV. Works across field-force and CRM data.',
    highlight: true,
  },
  {
    href: '/dashboard/ffm-reports/attendance-summary',
    title: 'Attendance Summary',
    desc: 'Monthly attendance %, working days, late check-ins, early check-outs and absent days by rep.',
  },
  {
    href: '/dashboard/ffm-reports/visit-coverage',
    title: 'Visit Coverage',
    desc: 'Planned vs actual outlet visits per rep, per city — and the outlets that haven’t been visited.',
  },
  {
    href: '/dashboard/ffm-reports/hours-idle',
    title: 'Hours & Idle Time',
    desc: 'Working hours, on-site hours and idle minutes per rep across the selected window.',
  },
  {
    href: '/dashboard/ffm-analytics',
    title: 'Productivity Analytics',
    desc: 'KPIs, trends, heatmaps and weekly contacts — the live FFM analytics dashboard.',
  },
  {
    href: '/dashboard/attendance-overview',
    title: 'Attendance Overview',
    desc: 'Today’s live attendance roll — who’s in, who’s out, who’s on leave.',
  },
  {
    href: '/dashboard/visit-logs',
    title: 'Visit Logs',
    desc: 'Every check-in / check-out captured by the mobile app, with geo-tag, photos and duration.',
  },
  {
    href: '/dashboard/submissions',
    title: 'Form Submissions',
    desc: 'Submission counts and content by template — audit completion, store surveys, KYC, etc.',
  },
  {
    href: '/dashboard/live-tracking',
    title: 'Live Tracking',
    desc: 'Real-time map of every rep on the field today plus their breadcrumb trail.',
  },
];

export default function FfmReportsIndex() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Field Force Reports</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
          Curated cuts of attendance, visits, hours, and rep performance &mdash;
          plus a custom builder when you need a slice that isn&apos;t here.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            style={{
              background: r.highlight
                ? 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)'
                : 'var(--s2)',
              border: r.highlight ? 'none' : '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: r.highlight ? '#fff' : 'var(--text)', marginBottom: 6 }}>
              {r.title}
            </div>
            <div style={{ fontSize: 12, color: r.highlight ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>
              {r.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
