'use client';
// Time and leave: shifts, the weekly roster, the overtime rule, leave policies and holiday lists.
// Runs on the preview sample data; every change goes through lib/hrms/actions.ts and lib/hrms/orgActions.ts.

import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { ShiftsTab } from '../../../../components/hrms/time/ShiftsTab';
import { RosterTab } from '../../../../components/hrms/time/RosterTab';
import { OvertimeTab } from '../../../../components/hrms/time/OvertimeTab';
import { LeaveTab } from '../../../../components/hrms/time/LeaveTab';
import { HolidaysTab } from '../../../../components/hrms/time/HolidaysTab';

const TABS = ['shifts', 'roster', 'overtime', 'leave', 'holidays'] as const;
type Tab = (typeof TABS)[number];

export default function TimePage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'shifts');
  if (!db) return <Loading />;

  return (
    <HrmsPage title="Time and leave" eyebrow="HRMS" description="Shifts, weekly roster, overtime, leave policies and holidays. Preview on sample data.">
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'shifts', label: 'Shifts', count: db.shifts.length },
        { key: 'roster', label: 'Roster' },
        { key: 'overtime', label: 'Overtime' },
        { key: 'leave', label: 'Leave rules', count: db.leaveTypes.length },
        { key: 'holidays', label: 'Holidays', count: db.holidayLists.length },
      ]} />
      <div role="tabpanel">
        {tab === 'shifts' && <ShiftsTab db={db} />}
        {tab === 'roster' && <RosterTab db={db} />}
        {tab === 'overtime' && <OvertimeTab db={db} />}
        {tab === 'leave' && <LeaveTab db={db} />}
        {tab === 'holidays' && <HolidaysTab db={db} />}
      </div>
    </HrmsPage>
  );
}
