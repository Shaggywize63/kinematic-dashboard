'use client';
/**
 * Lead Analytics — customisable widget grid.
 *
 * Lives on its own route so the CRM Overview stays as the legacy stat
 * cards + fixed charts surface. Everything customisable (widget catalog,
 * drag/resize, chart-type switcher, per-user persisted layout) is here —
 * including the Targets Leaderboard, added like any other widget.
 *
 * Consumer Champion FEs don't see the analytics surface — the nav link
 * is hidden in CrmSubNav, and this page falls back to an "unavailable"
 * notice when reached directly (e.g. via a saved bookmark).
 */
import LeadAnalyticsSection from '../../../../../components/crm/analytics/LeadAnalyticsSection';
import { useAuth } from '../../../../../hooks/useAuth';
import { isConsumerChampion } from '../../../../../lib/clientFeatures';

export default function LeadAnalyticsPage() {
  const { user } = useAuth();
  if (isConsumerChampion(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>
        Analytics is not available for the Consumer Champion designation.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <LeadAnalyticsSection />
    </div>
  );
}
