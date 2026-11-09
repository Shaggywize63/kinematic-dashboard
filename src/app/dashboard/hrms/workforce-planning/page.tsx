'use client';
// Workforce planning: plan vs actual headcount for the financial year, budget, attrition and what-if scenarios.
// The plan is editable and saved in this browser; the Recruitment page reads its approved headcount from here.

import Link from 'next/link';
import { HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { hiringStore } from '../../../../lib/hrms/hiring/store';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtMonth } from '../../../../lib/hrms/format';
import { attritionSeries, exitRecords, fiscalMonths, headcountOn, openSeats, planAt } from '../../../../lib/hrms/hiring/engines';
import { VizStyle } from '../../../../components/hrms/hiring/charts';
import { Principle } from '../../../../components/hrms/hiring/shared';
import PlanningHeadcount from '../../../../components/hrms/hiring/PlanningHeadcount';
import PlanningBudget from '../../../../components/hrms/hiring/PlanningBudget';
import PlanningAttrition from '../../../../components/hrms/hiring/PlanningAttrition';
import PlanningScenarios from '../../../../components/hrms/hiring/PlanningScenarios';

const TABS = ['headcount', 'budget', 'attrition', 'scenarios'] as const;
type Tab = (typeof TABS)[number];
const THIS_MONTH = PREVIEW_TODAY.slice(0, 7);

export default function WorkforcePlanningPage() {
  const db = useHrmsDb();
  const st = hiringStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'headcount');
  if (!db || !st) return <Loading />;

  const actual = headcountOn(db.employees, PREVIEW_TODAY);
  const planned = planAt(st.plan, {}, THIS_MONTH);
  const gap = actual - planned;
  const recs = exitRecords(db.employees, db.exits, PREVIEW_TODAY);
  const rate = attritionSeries(db.employees, recs, fiscalMonths(), PREVIEW_TODAY).filter((p) => p.rate != null).pop();

  return (
    <HrmsPage title="Workforce planning" description="Plan against actual headcount for April 2026 to March 2027, what it costs, who is leaving, and what-if scenarios.">
      <VizStyle />
      <Principle title="How the plan is used." testId="plan-principle">
        The plan is what leaders agree to hire. Recruitment reads it: an opening cannot go live for more seats than the plan approves at its department and location.
        These numbers inform decisions about teams. They are not a ranking of people, and no one is named as the reason for a gap.
        See the <Link href="/dashboard/hrms/recruitment?tab=openings" style={{ color: 'var(--info)' }}>openings</Link> that depend on it.
      </Principle>
      <StatGrid>
        <div data-testid="top-actual"><Stat label="Headcount today" value={actual} hint="On the payroll, including people serving notice" /></div>
        <div data-testid="top-plan"><Stat label={`Planned, ${fmtMonth(THIS_MONTH).slice(0, 3)}`} value={planned} hint={`Gap ${gap > 0 ? '+' : ''}${gap} against plan`} tone={gap < 0 ? 'warn' : undefined} /></div>
        <div data-testid="top-seats"><Stat label="Open seats" value={openSeats(st.openings, {})} hint="Approved on live openings, not yet filled" /></div>
        <div data-testid="top-attrition"><Stat label="Attrition, 12 months" value={rate?.rate == null ? '—' : `${rate.rate}%`} hint="Rolling, by the formula on the Attrition tab" /></div>
      </StatGrid>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[{ key: 'headcount', label: 'Headcount' }, { key: 'budget', label: 'Budget' }, { key: 'attrition', label: 'Attrition' }, { key: 'scenarios', label: 'Scenarios', count: st.scenarios.length }]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'headcount' && <PlanningHeadcount db={db} st={st} />}
        {tab === 'budget' && <PlanningBudget db={db} st={st} />}
        {tab === 'attrition' && <PlanningAttrition db={db} />}
        {tab === 'scenarios' && <PlanningScenarios db={db} st={st} />}
      </div>
    </HrmsPage>
  );
}
