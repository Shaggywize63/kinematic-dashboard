'use client';
// Payroll hub: pay runs, salary structures, adjustments, loans and full-and-final settlements.

import { HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { runTotals } from '../../../../lib/hrms/engine';
import { fmtMonth, inr } from '../../../../lib/hrms/format';
import { fnfIsOverdue, loanOutstanding } from '../../../../components/hrms/payroll/logic';
import RunsTab from '../../../../components/hrms/payroll/RunsTab';
import StructuresTab from '../../../../components/hrms/payroll/StructuresTab';
import AdjustmentsTab from '../../../../components/hrms/payroll/AdjustmentsTab';
import LoansTab from '../../../../components/hrms/payroll/LoansTab';
import FnfTab from '../../../../components/hrms/payroll/FnfTab';

const TABS = ['runs', 'structures', 'adjustments', 'loans', 'fnf'] as const;
type Tab = (typeof TABS)[number];

export default function PayrollPage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'runs');
  if (!db) return <Loading />;

  const open = db.payRuns.filter((r) => r.status !== 'paid');
  const lastPaid = [...db.payRuns].filter((r) => r.status === 'paid').sort((a, b) => b.month.localeCompare(a.month))[0];
  const lastPaidNet = db.payRuns.filter((r) => r.status === 'paid' && lastPaid && r.month === lastPaid.month).reduce((s, r) => s + runTotals(r).net, 0);
  const outstanding = db.loans.reduce((s, l) => s + loanOutstanding(l), 0);
  const fnfOpen = db.fnfCases.filter((c) => c.status !== 'paid');
  const overdue = db.fnfCases.filter(fnfIsOverdue).length;

  return (
    <HrmsPage title="Payroll" description="Pay runs, salary structures, adjustments, loans and full-and-final settlements"
      eyebrow="HRMS">
      <StatGrid>
        <Stat label="Runs in progress" value={open.length} hint={open.length ? open.map((r) => fmtMonth(r.month)).join(', ') : 'Every run is paid'} />
        <Stat label={lastPaid ? `Net pay, ${fmtMonth(lastPaid.month)}` : 'Net pay'} value={lastPaid ? inr(lastPaidNet) : '—'} hint="Latest paid month, all legal entities" tone="ok" />
        <Stat label="Loans outstanding" value={inr(outstanding)} hint={`${db.loans.filter((l) => loanOutstanding(l) > 0).length} being recovered`} />
        <Stat label="Settlements open" value={fnfOpen.length} tone={overdue ? 'red' : undefined} hint={overdue ? `${overdue} overdue` : 'None overdue'} />
      </StatGrid>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'runs', label: 'Runs', count: db.payRuns.length },
        { key: 'structures', label: 'Structures', count: db.structures.length },
        { key: 'adjustments', label: 'Adjustments', count: db.adjustments.length },
        { key: 'loans', label: 'Loans and advances', count: db.loans.length },
        { key: 'fnf', label: 'Full and final', count: db.fnfCases.length },
      ]} />
      <div role="tabpanel">
        {tab === 'runs' && <RunsTab db={db} />}
        {tab === 'structures' && <StructuresTab db={db} />}
        {tab === 'adjustments' && <AdjustmentsTab db={db} />}
        {tab === 'loans' && <LoansTab db={db} />}
        {tab === 'fnf' && <FnfTab db={db} />}
      </div>
    </HrmsPage>
  );
}
