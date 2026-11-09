'use client';
// Benefits: plans, enrolment, health claims and cost. Preview on sample data kept in this browser. Every premium is a sample.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { inr } from '../../../../lib/hrms/format';
import { Badge, HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { basicMonthlyOf, claimSla, enrolmentEligibility, enrolmentProgress, isClosedClaim, planOf, quoteEnrolment, windowStatus } from '../../../../lib/hrms/rewards/engines';
import { rewardsStore } from '../../../../lib/hrms/rewards/store';
import { ActivityLog } from '../../../../components/hrms/rewards/common';
import PlansTab from '../../../../components/hrms/rewards/benefits/PlansTab';
import EnrolmentTab from '../../../../components/hrms/rewards/benefits/EnrolmentTab';
import ClaimsTab from '../../../../components/hrms/rewards/benefits/ClaimsTab';
import CostTab from '../../../../components/hrms/rewards/benefits/CostTab';

const TABS = ['enrolment', 'plans', 'claims', 'cost'] as const;
type Tab = (typeof TABS)[number];

export default function BenefitsPage() {
  const db = useHrmsDb();
  const st = rewardsStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'enrolment');
  const figures = useMemo(() => {
    if (!db || !st) return null;
    const health = planOf(st.benefits.plans, 'health')!;
    const progress = enrolmentProgress(db, st.benefits.enrolments, health.coverStart);
    let employer = 0;
    for (const e of db.employees) {
      if (!enrolmentEligibility(e, health.coverStart).eligible) continue;
      employer += quoteEnrolment(st.benefits.plans, st.benefits.enrolments.find((x) => x.employeeId === e.id), basicMonthlyOf(db, e, PREVIEW_TODAY)).employerMonthly;
    }
    const open = st.benefits.claims.filter((c) => !isClosedClaim(c.status));
    return { progress: progress.total, win: windowStatus(st.benefits.window, PREVIEW_TODAY), employer, open: open.length, late: open.filter((c) => claimSla(c, PREVIEW_TODAY).state === 'breached').length };
  }, [db, st]);
  if (!db || !st || !figures) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Benefits"
      description="Insurance, meal coupons, NPS and a flexible allowance: choose, enrol, claim and see the cost. Sample data, kept in this browser. Premiums are samples."
      actions={<Badge tone="warn">Preview</Badge>}
    >
      <div data-testid="benefits-stats">
        <StatGrid min={190}>
          <Stat label="Enrolment done" value={`${figures.progress.pct}%`} tone={figures.progress.pending ? 'warn' : 'ok'} hint={`${figures.progress.enrolled + figures.progress.waived} of ${figures.progress.eligible} eligible have answered`} />
          <Stat label="Window" value={figures.win.state === 'open' ? `${figures.win.daysLeft} days left` : figures.win.state === 'closed' ? 'Closed' : 'Not open'} tone={figures.win.state === 'open' ? 'ok' : 'warn'} />
          <Stat label="Company cost a month" value={inr(figures.employer)} hint="Sample premiums" />
          <Stat label="Open health claims" value={figures.open} tone={figures.late ? 'red' : undefined} hint={figures.late ? `${figures.late} over the turnaround` : 'All within the turnaround'} />
        </StatGrid>
      </div>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'enrolment', label: 'Enrolment', count: figures.progress.pending },
        { key: 'plans', label: 'Plans' },
        { key: 'claims', label: 'Health claims', count: figures.open },
        { key: 'cost', label: 'Cost and payroll' },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'enrolment' && <EnrolmentTab db={db} st={st} />}
        {tab === 'plans' && <PlansTab st={st} />}
        {tab === 'claims' && <ClaimsTab db={db} st={st} />}
        {tab === 'cost' && <CostTab db={db} st={st} />}
      </div>
      <ActivityLog log={st.log} area="benefits" />
    </HrmsPage>
  );
}
