'use client';
import CrmSubNav from '../../../components/crm/layout/CrmSubNav';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>CRM</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 14px' }}>
          Leads, deals, accounts, and pipelines — powered by Kini AI.
        </p>
      </div>
      <CrmSubNav />
      <div>{children}</div>
    </div>
  );
}
