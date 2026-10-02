'use client';
import Link from 'next/link';
import { useAuth } from '../../../../../hooks/useAuth';
import { canViewFieldVisits } from '../../../../../lib/clientFeatures';
import ReportRunner from '../../../../../components/crm/reports/ReportRunner';

export default function AreaLeadsReportPage() {
  const { user } = useAuth();

  if (!canViewFieldVisits(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Area-wise Leads Report</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
          This report is available for tenants running the area-based field flow.
        </p>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none' }}>← Back to Reports</Link>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Area-wise Leads Report</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 560 }}>
            Lead distribution by area (falls back to city) — total, open and converted leads per area,
            with a grand-total row. Download the CSV or view inline.
          </div>
        </div>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>← Back to Reports</Link>
      </div>

      <ReportRunner endpointPath="/api/v1/crm/leads/export-area-leads-report" filenameBase="area-leads-report" />
    </div>
  );
}
