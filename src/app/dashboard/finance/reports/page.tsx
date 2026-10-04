'use client';
// Reports hub: one card per report, grouped as in Zoho Invoice.

import Link from 'next/link';
import { Card, T, useIsCompact } from '../../../../components/ui';
import { FinancePage } from '../../../../components/finance/ui';
import { REPORT_GROUPS, REPORT_META } from '../../../../components/finance/reportMeta';

export default function FinanceReportsHubPage() {
  const narrow = useIsCompact(900);
  return (
    <FinancePage title="Reports" description="Sales, receivables, payments and GST reports">
      {REPORT_GROUPS.map((group) => {
        const reports = REPORT_META.filter((r) => r.group === group);
        return (
          <section key={group} aria-labelledby={`grp-${group}`}>
            <h2 id={`grp-${group}`} style={{ margin: '0 0 10px', fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.dim, letterSpacing: '0.02em' }}>{group}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {reports.map((r) => (
                <Link key={r.name} href={`/dashboard/finance/reports/${r.name}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <Card padding={16} style={{ height: '100%' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, fontFamily: T.heading }}>{r.title}</div>
                    <div style={{ fontSize: 13, color: T.dim, marginTop: 6, lineHeight: 1.45 }}>{r.description}</div>
                    <div style={{ fontSize: 12.5, color: T.info, fontWeight: 600, marginTop: 12 }}>Open report →</div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </FinancePage>
  );
}
