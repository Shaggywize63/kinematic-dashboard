'use client';
import { useClient } from '@/context/ClientContext';
import CrmSubNav from '../../../components/crm/layout/CrmSubNav';
import CrmScopeBadge from '../../../components/crm/layout/CrmScopeBadge';
import DateRangePicker from '../../../components/crm/DateRangePicker';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { selectedClientId } = useClient();
  return (
    <div className="crm-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>CRM</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 8px' }}>
            Leads, deals, accounts, and pipelines — powered by Kini AI.
          </p>
          <CrmScopeBadge />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Old top-level State / City filter removed — the new cascading
              State → City → District → Block picker lives inside LeadFilters
              on the Leads page. Keeping DateRangePicker here since it scopes
              every CRM page, not just Leads. */}
          <DateRangePicker />
        </div>
      </div>
      <CrmSubNav />
      {/*
       * Force the entire CRM subtree to remount when the active client changes.
       * Cheap, reliable, and avoids having to thread selectedClientId into every
       * page's useEffect dep array. lib/api.ts already keys its cache by client.
       */}
      <div key={selectedClientId || 'org'}>{children}</div>
    </div>
  );
}
