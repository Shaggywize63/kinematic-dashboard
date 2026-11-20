'use client';
import { useAuth } from '../../../../../hooks/useAuth';
import { canDownloadSrsReport, leadReportLabel } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';
import { usePageTitle } from '../../../../../lib/pageTitle';

export default function SrsLeadReportPage() {
  const { user } = useAuth();
  const reportLabel = leadReportLabel(user as any);
  usePageTitle(reportLabel, 'The field format — lead, site and converted-deal detail. Runs for the last week by default; change the range and press Run, or download the full CSV. The global city filter is applied automatically.');

  // Access gate — mirrors the backend's SRS_REPORT_ROLES check.
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
      <ReportRunner endpointPath="/api/v1/crm/leads/export-srs-report" filenameBase="srs-lead-report" />
    </div>
  );
}
