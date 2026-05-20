'use client';
import { useClient } from '@/context/ClientContext';
import CrmSubNav from '../../../components/crm/layout/CrmSubNav';
import CrmScopeBadge from '../../../components/crm/layout/CrmScopeBadge';
import DateRangePicker from '../../../components/crm/DateRangePicker';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { selectedClientId } = useClient();
  return (
    <div className="crm-area">
      {/* Inline scoped CSS — demotes per-page h1s inside the CRM area so the
          layout's "CRM" mark stays the dominant heading. We can't rewrite
          every child page's inline-styled h1 in one pass; the rule below
          handles it globally. */}
      <style jsx>{`
        :global(.crm-page-area h1) {
          font-size: 16px !important;
          font-weight: 700 !important;
          color: var(--text) !important;
          opacity: 0.9;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, margin: 0,
            color: 'var(--primary)', letterSpacing: '-0.5px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            CRM
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
              powered by Kini AI
            </span>
          </h1>
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
       *
       * The `crm-page-area` class lets the inline style above demote every
       * page-level h1 to a secondary heading.
       */}
      <div className="crm-page-area" key={selectedClientId || 'org'}>{children}</div>
    </div>
  );
}
