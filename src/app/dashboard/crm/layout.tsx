'use client';
import CrmSubNav from '../../../components/crm/layout/CrmSubNav';
import DateRangePicker from '../../../components/crm/DateRangePicker';
import LocationFilter from '../../../components/crm/LocationFilter';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>CRM</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 14px' }}>
            Leads, deals, accounts, and pipelines — powered by Kini AI.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <LocationFilter />
          <DateRangePicker />
        </div>
      </div>
      <CrmSubNav />
      <div>{children}</div>
    </div>
  );
}
