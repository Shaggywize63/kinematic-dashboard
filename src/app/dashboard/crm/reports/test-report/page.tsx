'use client';
import { useAuth } from '../../../../../hooks/useAuth';
import { canDownloadSrsReport } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';
import { usePageTitle } from '../../../../../lib/pageTitle';

export default function TestReportPage() {
  const { user } = useAuth();
  usePageTitle('Test Report', 'Leads where a Ring or Weighment test was recorded, with attendee count. Runs for the last week by default; change the range and press Run, or download the full CSV.');

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
      <ReportRunner endpointPath="/api/v1/crm/leads/export-test-report" filenameBase="test-report" />
    </div>
  );
}
