'use client';
/**
 * Lead Analytics — customisable widget grid.
 *
 * Lives on its own route so the CRM Overview stays as the legacy stat
 * cards + fixed charts surface. Everything customisable (15-widget catalog,
 * drag/resize, chart-type switcher, per-user persisted layout) is here.
 */
import LeadAnalyticsSection from '../../../../../components/crm/analytics/LeadAnalyticsSection';

export default function LeadAnalyticsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <LeadAnalyticsSection />
    </div>
  );
}
