'use client';
import { useState } from 'react';
import { useClient } from '@/context/ClientContext';
import { useCityScope } from '../../../context/CityScopeContext';
import CrmScopeBadge from '../../../components/crm/layout/CrmScopeBadge';
import DateRangePicker from '../../../components/crm/DateRangePicker';
import CityScopePicker from '../../../components/crm/CityScopePicker';
import { CrmToolbarSlotsProvider } from '../../../components/crm/layout/CrmPageToolbar';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { selectedClientId } = useClient();
  const { selectedCity } = useCityScope();
  // Slot DOM nodes a page portals its own count badge / action buttons into
  // (via <CrmToolbarLeft>/<CrmToolbarRight>) so they land on THIS row instead
  // of a second one underneath — one line per page, same as every other CRM
  // list screen. `display:contents` on each slot div lets the portaled
  // children lay out as if they were direct children of the flex row below.
  const [leftSlot, setLeftSlot] = useState<HTMLDivElement | null>(null);
  const [rightSlot, setRightSlot] = useState<HTMLDivElement | null>(null);
  return (
    <div className="crm-area">
      {/* The duplicate top tab nav was removed — every CRM destination
          lives in the left sidebar. This row keeps only the per-tenant
          scope chip, the city scope and the date-range picker (plus
          whatever the page itself portals in — its record count on the
          left, its action buttons on the right); the page title itself is
          the biggest thing on screen (header breadcrumb + the page's own
          h1). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CrmScopeBadge />
          <div ref={setLeftSlot} style={{ display: 'contents' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* CityScopePicker self-hides when the user has <2 cities, so
              it adds nothing to the strip for single-tenant or
              single-city users. For multi-city reps it narrows every
              CRM list (leads, contacts, reports) to one city via the
              shared ?city= param api.ts auto-attaches. */}
          <CityScopePicker />
          <DateRangePicker />
          <div ref={setRightSlot} style={{ display: 'contents' }} />
        </div>
      </div>
      <CrmToolbarSlotsProvider value={{ left: leftSlot, right: rightSlot }}>
        {/*
         * Force the entire CRM subtree to remount when the active client OR
         * the city-scope picker changes. Cheap, reliable, and avoids
         * threading selectedClientId / selectedCity into every page's
         * useEffect dep array. api.ts auto-attaches the picked `?city=` on
         * the next GET, so remounting makes every list/report re-fetch with
         * the new scope instead of waiting for a manual page refresh.
         * lib/api.ts already keys its cache by client.
         *
         * The `crm-page-area` class lets the inline style above demote every
         * page-level h1 to a secondary heading.
         */}
        <div className="crm-page-area" key={`${selectedClientId || 'org'}:${selectedCity || 'all'}`}>{children}</div>
      </CrmToolbarSlotsProvider>
    </div>
  );
}
