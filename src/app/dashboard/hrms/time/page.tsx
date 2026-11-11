'use client';
// Time and leave: shifts, the weekly roster, the overtime rule, leave policies and holiday lists.
// Sample mode runs on the preview sample data; live mode reads and saves these on the server. Every change goes
// through lib/hrms/actions.ts and lib/hrms/orgActions.ts, which diff and sync them in live mode.

import { toast } from 'sonner';
import { Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { addStandardTimeSet } from '../../../../lib/hrms/orgActions';
import { useLiveStatus, whenSynced } from '../../../../lib/hrms/live/store';
import { ShiftsTab } from '../../../../components/hrms/time/ShiftsTab';
import { RosterTab } from '../../../../components/hrms/time/RosterTab';
import { OvertimeTab } from '../../../../components/hrms/time/OvertimeTab';
import { LeaveTab } from '../../../../components/hrms/time/LeaveTab';
import { HolidaysTab } from '../../../../components/hrms/time/HolidaysTab';

const TABS = ['shifts', 'roster', 'overtime', 'leave', 'holidays'] as const;
type Tab = (typeof TABS)[number];

export default function TimePage() {
  const db = useHrmsDb();
  const live = useLiveStatus();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'shifts');
  if (!db) return <Loading />;

  // A brand-new org on live data has no shifts, leave types or holiday lists. Offer the standard set, as payroll does for structures.
  const emptyOrg = live.source === 'live' && db.shifts.length === 0 && db.leaveTypes.length === 0 && db.holidayLists.length === 0;
  const addStandard = () => {
    const r = addStandardTimeSet();
    if (!r.ok) { toast.error(r.error); return; }
    whenSynced((ok) => { if (ok) toast.success('Standard shifts, leave policies and a holiday list added'); });
  };

  return (
    <HrmsPage title="Time and leave" eyebrow="HRMS" description="Shifts, weekly roster, overtime, leave policies and holidays.">
      {emptyOrg && (
        <div data-testid="time-live-empty" style={{ marginBottom: 16 }}>
          <Card>
            <EmptyState title="No shifts, leave types or holidays yet"
              description="Time and leave is saved on the server. Start with the standard set — the sample shifts, the common leave policies and a holiday list — and edit them to suit your company, or add your own below."
              action={<Button variant="primary" data-testid="add-standard-time-set" style={{ height: 40 }} onClick={addStandard}>Add the standard set</Button>} />
          </Card>
        </div>
      )}
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
