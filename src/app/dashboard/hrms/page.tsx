'use client';
// HR overview: headline numbers, what needs attention (from real checks), payroll and compliance status,
// headcount splits, a six-month payroll trend and upcoming birthdays. Everything is computed from the preview
// database in lib/hrms and the preview date, never hard-coded.

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Button, Card, CardTitle, HrmsPage, Loading, Stat, StatGrid, T, useIsCompact } from '../../../components/hrms/ui';
import { AttentionList, BarList, ComplianceCalendar, PayrollStatusCard, PeopleEvents } from '../../../components/hrms/overview/OverviewCards';
import {
  TODAY, attentionItems, entityPayroll, headcountBy, nextDues, overviewStats, payrollTrend, peopleEvents, type EntityPayroll,
} from '../../../components/hrms/overview/insights';
import { useHrmsDb } from '../../../lib/hrms/db';
import { createPayRun } from '../../../lib/hrms/actions';
import { fmtDate, fmtMonth, inr } from '../../../lib/hrms/format';

// recharts is heavy: it loads only when the overview paints.
const PayrollTrendChart = dynamic(() => import('../../../components/hrms/overview/PayrollTrendChart'), {
  ssr: false,
  loading: () => <div style={{ height: 220, display: 'grid', placeItems: 'center', color: T.dim, fontSize: 13 }}>Loading chart…</div>,
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function HrmsOverviewPage() {
  const db = useHrmsDb();
  const narrow = useIsCompact(900);

  const view = useMemo(() => {
    if (!db) return null;
    const stats = overviewStats(db);
    return {
      stats,
      items: attentionItems(db),
      payroll: entityPayroll(db),
      dues: nextDues(db, 5),
      trend: payrollTrend(db, 6),
      events: peopleEvents(db, 30),
      byDept: headcountBy(db, 'department'),
      byLoc: headcountBy(db, 'location'),
    };
  }, [db]);

  if (!db || !view) return <Loading />;
  const { stats } = view;

  function startRun(p: EntityPayroll) {
    createPayRun(p.month, p.entity.id);
    toast.success(`Draft ${fmtMonth(p.month)} run created for ${p.entity.name}.`);
  }

  const tile = (id: string, node: React.ReactNode) => <div key={id} data-testid={`stat-${id}`} style={{ display: 'grid' }}>{node}</div>;
  const dueTone = stats.dues.overdue > 0 ? 'red' : stats.dues.dueSoon > 0 ? 'warn' : undefined;
  const two = narrow ? '1fr' : 'minmax(0, 3fr) minmax(0, 2fr)';

  return (
    <HrmsPage
      title="HR overview"
      description={`Headcount, payroll and compliance on sample data as of ${fmtDate(TODAY)}.`}
      actions={(
        <>
          <Button variant="primary" href="/dashboard/hrms/employees/new" style={{ height: 44 }}>Add employee</Button>
          <Button href="/dashboard/hrms/payroll" style={{ height: 44 }}>Start payroll run</Button>
          <Button href="/dashboard/hrms/lifecycle?tab=letters&generate=1" style={{ height: 44 }}>Generate letter</Button>
        </>
      )}
    >
      <StatGrid min={200}>
        {tile('headcount', <Stat label="Active headcount" value={stats.headcount} hint={`${stats.active} active, ${stats.onNotice} on notice`} href="/dashboard/hrms/employees" />)}
        {tile('joiners', <Stat label="Joiners this month" value={stats.joiners.count} hint={stats.joiners.count ? `${stats.joiners.yetToJoin} yet to join` : 'No one joins this month'} href="/dashboard/hrms/lifecycle?tab=onboarding" />)}
        {tile('leavers', <Stat label="Leavers this month" value={stats.leavers.count} hint={stats.leavers.count ? `${stats.leavers.alreadyLeft} left, ${stats.leavers.count - stats.leavers.alreadyLeft} still serving` : 'No last working day this month'} href="/dashboard/hrms/lifecycle?tab=exits" />)}
        {tile('notice', <Stat label="On notice" value={stats.onNotice} tone={stats.onNotice ? 'warn' : undefined} hint="Serving their notice period" href="/dashboard/hrms/lifecycle?tab=exits" />)}
        {tile('attrition', <Stat label="Attrition, 12 months" value={stats.attrition.pct == null ? '—' : `${stats.attrition.pct.toFixed(1)}%`}
          hint={stats.attrition.pct == null ? 'No headcount to measure against' : `${plural(stats.attrition.leavers, 'leaver')} ÷ ${stats.attrition.avgHeadcount.toFixed(1)} average headcount`} />)}
        {tile('payroll', <Stat label="Monthly payroll cost" value={stats.payroll ? inr(stats.payroll.cost) : '—'}
          hint={stats.payroll ? `${fmtMonth(stats.payroll.month)}, employer cost, ${plural(stats.payroll.payslips, 'payslip')}` : 'No payroll run yet'} href="/dashboard/hrms/payroll" />)}
        {tile('dues', <Stat label="Open compliance dues" value={stats.dues.open} tone={dueTone}
          hint={`${stats.dues.overdue} overdue, ${stats.dues.dueSoon} due within 7 days; overdue or due in 30 days`} href="/dashboard/hrms/statutory" />)}
        {tile('gaps', <Stat label="Employees with data gaps" value={stats.gaps.employees} tone={stats.gaps.employees ? 'warn' : 'ok'}
          hint={stats.gaps.employees ? `${plural(stats.gaps.items, 'gap')} in PAN, UAN or bank details` : 'PAN, UAN and bank details are complete'} href="#needs-attention" />)}
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: two, gap: 18, alignItems: 'start' }}>
        <div id="needs-attention" style={{ minWidth: 0, scrollMarginTop: 16 }}><AttentionList items={view.items} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <PayrollStatusCard entries={view.payroll} onStart={startRun} />
          <ComplianceCalendar dues={view.dues} db={db} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: two, gap: 18, alignItems: 'start' }}>
        <Card style={{ minWidth: 0 }}>
          <CardTitle right={<span style={{ fontSize: 12.5, color: T.dim }}>Employer cost, sample runs</span>}>Payroll cost, last six months</CardTitle>
          <PayrollTrendChart points={view.trend} entities={db.entities.map((e) => ({ id: e.id, name: e.name }))} compact={narrow} />
        </Card>
        <PeopleEvents events={view.events} windowDays={30} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
        <BarList title="Headcount by department" rows={view.byDept} total={stats.headcount} />
        <BarList title="Headcount by location" rows={view.byLoc} total={stats.headcount} />
      </div>
    </HrmsPage>
  );
}
