'use client';
import { useAuth } from '../../../../../hooks/useAuth';
import { canDownloadSrsReport } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';
import { usePageTitle } from '../../../../../lib/pageTitle';

export default function DayWiseReportPage() {
  const { user } = useAuth();
  usePageTitle('Overall Day-Wise Report', 'Per-rep, per-day rollup — activity split, unique leads, deals and tonnage, with a grand-total row. Runs for the last week by default; change the range and press Run, or download the full CSV.');

  if (!canDownloadSrsReport(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          This report is available to the Area Sales Officer and CRM Admin roles only.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <ReportRunner endpointPath="/api/v1/crm/activities/export-daywise-report" filenameBase="daywise-report" />
    </div>
  );
}
