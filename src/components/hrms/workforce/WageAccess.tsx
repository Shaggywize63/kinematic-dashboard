'use client';
// Wage access (earned wage access preview): let a person draw part of what they have already earned this month, before payday.
// A preview only. The notice is always on screen because who may offer this, and how it is taxed, is not settled here.

import { useMemo } from 'react';
import { Badge, ConfidenceBadge, HrmsPage, Loading, TabBar, useIsCompact, useTabParam } from '../ui';
import { useHrmsDb } from '../../../lib/hrms/db';
import { fmtDate } from '../../../lib/hrms/format';
import { workforceStore, TODAY } from '../../../lib/hrms/workforce/store';
import { wageStanding, type WageStanding } from '../../../lib/hrms/workforce/wageEngine';
import WageHr from './WageHr';
import WageEmployee from './WageEmployee';

const TABS = ['hr', 'employee'] as const;
type Tab = (typeof TABS)[number];

export default function WageAccess() {
  const db = useHrmsDb();
  const wf = workforceStore.use();
  const narrow = useIsCompact(900);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'hr');

  const standings = useMemo(() => {
    const m = new Map<string, WageStanding>();
    if (!db || !wf) return m;
    for (const e of db.employees.filter((x) => x.status === 'active' || x.status === 'on_notice')) {
      const s = wageStanding(db, wf.wage.policy, wf.wage.requests, e.id, TODAY);
      if (s) m.set(e.id, s);
    }
    return m;
  }, [db, wf]);

  if (!db || !wf) return <Loading />;
  const pending = wf.wage.requests.filter((r) => r.status === 'pending').length;

  return (
    <HrmsPage
      eyebrow="HRMS · Wage access"
      title="Wage access"
      description={<>Let a person draw part of what they have <b>already earned</b> this month, before payday. Today in the sample company is {fmtDate(TODAY)}.</>}
      actions={<Badge tone="warn" mono>Preview</Badge>}
    >
      <div data-testid="wage-access-notice" role="note" style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--warn-w)', color: 'var(--warn)', fontSize: 13.5, lineHeight: 1.55, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          <b>Preview only.</b> The regulatory and tax treatment of wage advances, and who may offer them, must be confirmed with counsel before any live use. Nothing here moves real money.
        </span>
        <ConfidenceBadge level="indicative" />
      </div>

      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'hr', label: 'HR view', count: pending },
        { key: 'employee', label: 'Employee view' },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'hr' && <WageHr db={db} wf={wf} standings={standings} narrow={narrow} />}
        {tab === 'employee' && <WageEmployee db={db} wf={wf} standings={standings} narrow={narrow} />}
      </div>
    </HrmsPage>
  );
}
