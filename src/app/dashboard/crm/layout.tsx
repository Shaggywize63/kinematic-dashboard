'use client';
import { useClient } from '@/context/ClientContext';
import CrmSubNav from '../../../components/crm/layout/CrmSubNav';
import CrmScopeBadge from '../../../components/crm/layout/CrmScopeBadge';
import DateRangePicker from '../../../components/crm/DateRangePicker';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { selectedClientId } = useClient();
  return (
    <div className="crm-area">
      {/* Per-page h1s stay small so the CRM mark (rendered in the dashboard
          top header) remains the visual anchor. */}
      <style jsx>{`
        :global(.crm-page-area h1) {
          font-size: 18px !important;
          font-weight: 700 !important;
          color: var(--text) !important;
        }
      `}</style>
      {/* CRM heading moved to the dashboard top header (centred). This row
          keeps only the per-tenant scope chip + the date-range picker. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <CrmScopeBadge />
        <DateRangePicker />
      </div>
      <CrmSubNav />
      {/*
       * Force the entire CRM subtree to remount when the active client changes.
       * Cheap, reliable, and avoids having to thread selectedClientId into every
       * page's useEffect dep array. lib/api.ts already keys its cache by client.
       *
       * The `crm-page-area` class lets the inline style above demote every
       * page-level h1 to a secondary heading.
       */}
      <div className="crm-page-area" key={selectedClientId || 'org'}>{children}</div>
    </div>
  );
}
