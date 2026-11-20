'use client';
import { useAuth } from '../../../../../hooks/useAuth';
import { canViewFieldVisits } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';
import { usePageTitle } from '../../../../../lib/pageTitle';

export default function FieldVisitsReportPage() {
  const { user } = useAuth();
  usePageTitle('Field Visits Report', 'Per field-executive rollup of ad-hoc Marketing Visits — total, in-progress and completed visits, distinct areas covered, and the last visit date. Runs for the last week by default; change the range and press Run, or download the CSV.');

  if (!canViewFieldVisits(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          This report is available for tenants running the ad-hoc Marketing Visit flow.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <ReportRunner endpointPath="/api/v1/crm/activities/export-field-visits-report" filenameBase="field-visits-report" />
    </div>
  );
}
