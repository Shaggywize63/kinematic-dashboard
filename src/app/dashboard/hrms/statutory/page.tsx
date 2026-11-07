'use client';
// Statutory: calendar, rules and rates, returns, registers and tax. Preview on sample data; rates are not confirmed.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { LAW_VERSION } from '../../../../lib/hrms/rules';
import { Badge, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { closedRuns, derivedStatus } from '../../../../components/hrms/statutory/builders';
import CalendarTab from '../../../../components/hrms/statutory/CalendarTab';
import RulesTab from '../../../../components/hrms/statutory/RulesTab';
import ReturnsTab from '../../../../components/hrms/statutory/ReturnsTab';
import RegistersTab from '../../../../components/hrms/statutory/RegistersTab';
import TaxTab from '../../../../components/hrms/statutory/TaxTab';

const TABS = ['calendar', 'rules', 'returns', 'registers', 'tax'] as const;

export default function StatutoryPage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam(TABS, 'calendar');
  const counts = useMemo(() => {
    if (!db) return { open: 0, runs: 0 };
    return {
      open: db.compliance.filter((c) => { const s = derivedStatus(c); return s === 'overdue' || s === 'due_soon'; }).length,
      runs: closedRuns(db).length,
    };
  }, [db]);
  if (!db) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Statutory"
      title="Statutory compliance"
      description="Due dates, rates, returns, registers and tax in one place. This is a preview on sample data, and the rates are not confirmed."
      actions={<Badge tone="warn" mono>Law version {LAW_VERSION}</Badge>}
    >
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'calendar', label: 'Calendar', count: counts.open },
          { key: 'rules', label: 'Rules and rates' },
          { key: 'returns', label: 'Returns', count: counts.runs },
          { key: 'registers', label: 'Registers' },
          { key: 'tax', label: 'Tax' },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'calendar' && <CalendarTab db={db} />}
        {tab === 'rules' && <RulesTab db={db} />}
        {tab === 'returns' && <ReturnsTab db={db} />}
        {tab === 'registers' && <RegistersTab db={db} />}
        {tab === 'tax' && <TaxTab db={db} />}
      </div>
    </HrmsPage>
  );
}
