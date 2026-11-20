'use client';
import { useAuth } from '../../../../../hooks/useAuth';
import { canViewFieldVisits } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';
import { usePageTitle } from '../../../../../lib/pageTitle';

export default function AreaLeadsReportPage() {
  const { user } = useAuth();
  usePageTitle('Area-wise Leads Report', 'Lead distribution by area (falls back to city) — total, open and converted leads per area, with a grand-total row. Download the CSV or view inline.');

  if (!canViewFieldVisits(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          This report is available for tenants running the area-based field flow.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <ReportRunner endpointPath="/api/v1/crm/leads/export-area-leads-report" filenameBase="area-leads-report" />
    </div>
  );
}
