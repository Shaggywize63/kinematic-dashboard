'use client';
import { useClient } from '@/context/ClientContext';
import { useCityScope } from '../../../context/CityScopeContext';
import CrmScopeBadge from '../../../components/crm/layout/CrmScopeBadge';
import DateRangePicker from '../../../components/crm/DateRangePicker';
import CityScopePicker from '../../../components/crm/CityScopePicker';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { selectedClientId } = useClient();
  const { selectedCity } = useCityScope();
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
      {/* The duplicate top tab nav was removed — every CRM destination
          lives in the left sidebar, which is now collapsible. This row
          keeps only the per-tenant scope chip + the date-range picker. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <CrmScopeBadge />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* CityScopePicker self-hides when the user has <2 cities, so
              it adds nothing to the strip for single-tenant or
              single-city users. For multi-city reps it narrows every
              CRM list (leads, contacts, reports) to one city via the
              shared ?city= param api.ts auto-attaches. */}
          <CityScopePicker />
          <DateRangePicker />
        </div>
      </div>
      {/*
       * Force the entire CRM subtree to remount when the active client OR the
       * city-scope picker changes. Cheap, reliable, and avoids threading
       * selectedClientId / selectedCity into every page's useEffect dep array.
       * api.ts auto-attaches the picked `?city=` on the next GET, so remounting
       * makes every list/report re-fetch with the new scope instead of waiting
       * for a manual page refresh. lib/api.ts already keys its cache by client.
       *
       * The `crm-page-area` class lets the inline style above demote every
       * page-level h1 to a secondary heading.
       */}
      <div className="crm-page-area" key={`${selectedClientId || 'org'}:${selectedCity || 'all'}`}>{children}</div>
    </div>
  );
}
