'use client';
// Benefits: plans, enrolment, health claims and cost. Sample mode runs on data kept in this browser. In live mode (phase 7)
// the plan catalogue, enrolments, claims, the enrolment window and the sent-to-payroll map are read from, and saved to, the
// server (GET /benefits/bootstrap + the plan / enrolment / window / reminder / claim / send-to-payroll endpoints).
// Compensation stays local. The page degrades on its own when the benefits tables are not set up yet (503).

import { useEffect, useMemo, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { inr } from '../../../../lib/hrms/format';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { basicMonthlyOf, claimSla, enrolmentEligibility, enrolmentProgress, isClosedClaim, planOf, quoteEnrolment, windowStatus } from '../../../../lib/hrms/rewards/engines';
import { addStandardBenefits, rewardsStore } from '../../../../lib/hrms/rewards/store';
import { ensureBenefitsLoaded, reloadBenefits, useLiveBenefitsStatus } from '../../../../lib/hrms/rewards/live/benefitsSource';
import { ActivityLog, report } from '../../../../components/hrms/rewards/common';
import PlansTab from '../../../../components/hrms/rewards/benefits/PlansTab';
import EnrolmentTab from '../../../../components/hrms/rewards/benefits/EnrolmentTab';
import ClaimsTab from '../../../../components/hrms/rewards/benefits/ClaimsTab';
import CostTab from '../../../../components/hrms/rewards/benefits/CostTab';

const TABS = ['enrolment', 'plans', 'claims', 'cost'] as const;
type Tab = (typeof TABS)[number];

export default function BenefitsPage() {
  const db = useHrmsDb();
  const st = rewardsStore.use();
  const core = useLiveStatus();
  const benefits = useLiveBenefitsStatus();
  const live = benefits.source === 'live';
  const [tab, setTab] = useTabParam<Tab>(TABS, 'enrolment');
  const [busy, setBusy] = useState(false);

  // Load the benefits data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureBenefitsLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  const figures = useMemo(() => {
    if (!db || !st) return null;
    const health = planOf(st.benefits.plans, 'health');
    if (!health) return null;
    const progress = enrolmentProgress(db, st.benefits.enrolments, health.coverStart);
    let employer = 0;
    for (const e of db.employees) {
      if (!enrolmentEligibility(e, health.coverStart).eligible) continue;
      employer += quoteEnrolment(st.benefits.plans, st.benefits.enrolments.find((x) => x.employeeId === e.id), basicMonthlyOf(db, e, PREVIEW_TODAY)).employerMonthly;
    }
    const open = st.benefits.claims.filter((c) => !isClosedClaim(c.status));
    return { progress: progress.total, win: windowStatus(st.benefits.window, PREVIEW_TODAY), employer, open: open.length, late: open.filter((c) => claimSla(c, PREVIEW_TODAY).state === 'breached').length };
  }, [db, st]);

  if (!db || !st) return <Loading />;

  const description = live
    ? 'Insurance, meal coupons, NPS and a flexible allowance: choose, enrol, claim and see the cost. Saved on the server. Premiums are samples.'
    : 'Insurance, meal coupons, NPS and a flexible allowance: choose, enrol, claim and see the cost. Sample data, kept in this browser. Premiums are samples.';

  const loading = live && (benefits.phase === 'idle' || benefits.phase === 'loading');
  const notReady = live && benefits.phase === 'not_ready';
  const errored = live && benefits.phase === 'error';
  const ready = !live || benefits.phase === 'ok';
  const empty = ready && !planOf(st.benefits.plans, 'health');

  async function addStandard() {
    if (busy) return;
    setBusy(true);
    const r = await addStandardBenefits();
    setBusy(false);
    report(r, 'The standard benefit plans were added on the server.');
  }

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Benefits"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      {loading && <div data-testid="benefits-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="benefits-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold the live benefits data have not been created on the server, so there is nothing to load or save yet. Compensation and the sample data still work."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadBenefits()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="benefits-error">
          <Card>
            <EmptyState title="Could not load the benefits data"
              description={<span data-testid="benefits-error-message">{benefits.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadBenefits()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {empty && (
        <div data-testid="benefits-empty">
          <Card>
            <EmptyState title="No benefit plans yet"
              description="Benefits are saved on the server. Start with the standard set — group health, accident cover, meal coupons, NPS and a flexible allowance — and a fresh enrolment window, then enrol people, register claims and send the deductions to payroll."
              action={<Button variant="primary" data-testid="add-standard-benefit-plans" disabled={busy} style={{ minHeight: 40 }} onClick={addStandard}>{busy ? 'Adding…' : 'Add the standard benefit plans'}</Button>} />
          </Card>
        </div>
      )}

      {ready && !empty && figures && (
        <>
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
          {/* The activity log is the local store's. In live mode benefits changes are on the server (and in each claim's trail),
              so it is shown only in sample mode, where it records what was changed in this browser. */}
          {!live && <ActivityLog log={st.log} area="benefits" />}
        </>
      )}
    </HrmsPage>
  );
}
