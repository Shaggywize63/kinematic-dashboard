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
      {/*
       * Centered CRM mark on top — the "powered by Kini AI" tagline shrinks
       * on mobile via the media-query override below. CrmScopeBadge stays
       * centered under the heading. DateRangePicker sits on its own row
       * underneath so the heading line stays clean at every width.
       */}
      <style jsx>{`
        .crm-mark { font-size: 32px; }
        .crm-mark-sub { font-size: 11px; }
        @media (max-width: 640px) {
          .crm-mark { font-size: 24px; }
          .crm-mark-sub { font-size: 9px; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 12, gap: 6 }}>
        <h1 className="crm-mark" style={{
          fontWeight: 900, margin: 0,
          color: 'var(--primary)', letterSpacing: '-0.5px',
          display: 'inline-flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', justifyContent: 'center',
        }}>
          CRM
          <span className="crm-mark-sub" style={{ fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
            powered by Kini AI
          </span>
        </h1>
        <CrmScopeBadge />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
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
