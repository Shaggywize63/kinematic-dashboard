'use client';
// Reports hub: every report as a card, grouped, with a live headline from the sample data.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { Card, EmptyState, HrmsPage, Loading, SearchBox, T, useIsCompact } from '../../../../components/hrms/ui';
import { REPORTS, REPORT_GROUPS, defaultFilters } from '../../../../components/hrms/reports/reportConfig';

export default function ReportsHubPage() {
  const db = useHrmsDb();
  const narrow = useIsCompact(900);
  const [q, setQ] = useState('');

  const cards = useMemo(() => {
    if (!db) return [];
    return REPORTS.map((def) => {
      let peek = '';
      try { peek = def.peek(def.rows(db, defaultFilters(db, def))); } catch { peek = ''; }
      return { def, peek };
    });
  }, [db]);
  if (!db) return <Loading />;

  const term = q.trim().toLowerCase();
  const shown = cards.filter(({ def }) => !term || `${def.title} ${def.description} ${def.group}`.toLowerCase().includes(term));

  return (
    <HrmsPage eyebrow="HRMS · Reports" title="Reports" description="People, payroll, statutory and attendance reports built from the sample data. Every table exports to CSV.">
      <SearchBox value={q} onChange={setQ} placeholder="Search reports" width={320} />
      {shown.length === 0 ? (
        <Card><EmptyState title="No report matches" description="Try a different word, for example “PF” or “headcount”." /></Card>
      ) : REPORT_GROUPS.map((g) => {
        const items = shown.filter(({ def }) => def.group === g);
        if (!items.length) return null;
        return (
          <section key={g} aria-labelledby={`grp-${g}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id={`grp-${g}`} style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{g}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {items.map(({ def, peek }) => (
                <Link key={def.name} href={`/dashboard/hrms/reports/${def.name}`} data-testid={`report-card-${def.name}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <Card padding={16} className="km-navrow" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{def.title}</div>
                    <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5, flex: 1 }}>{def.description}</div>
                    {peek && <div style={{ fontSize: 12.5, color: T.info, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{peek}</div>}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </HrmsPage>
  );
}
