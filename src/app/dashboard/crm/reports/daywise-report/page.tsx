'use client';
import Link from 'next/link';
import { useAuth } from '../../../../../hooks/useAuth';
import { canDownloadSrsReport } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';

export default function DayWiseReportPage() {
  const { user } = useAuth();

  if (!canDownloadSrsReport(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Overall Day-Wise Report</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
          This report is available to the Area Sales Officer and CRM Admin roles only.
        </p>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none' }}>← Back to Reports</Link>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Overall Day-Wise Report</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 560 }}>
            Per-rep, per-day rollup — activity split, unique leads, deals and tonnage, with a grand-total row.
            Runs for the last week by default; change the range and press Run, or download the full CSV.
          </div>
        </div>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>← Back to Reports</Link>
      </div>

      <ReportRunner endpointPath="/api/v1/crm/activities/export-daywise-report" filenameBase="daywise-report" />
    </div>
  );
}
