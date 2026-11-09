'use client';
// Timesheets: weekly hours against projects and clients for roles that bill or track effort, with approval, locking,
// a project view and a CSV of approved weeks. Preview on sample data. Rates are samples.

import { toast } from 'sonner';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { EXPORT_HEADER, approvedExportRows } from '../../../../lib/hrms/people/timesheetEngine';
import { Button, HrmsPage, Loading, TabBar, downloadRows, useTabParam } from '../../../../components/hrms/ui';
import { VizStyle } from '../../../../components/hrms/people/shared';
import WeekTab from '../../../../components/hrms/people/timesheets/WeekTab';
import ApprovalsTab from '../../../../components/hrms/people/timesheets/ApprovalsTab';
import ProjectsTab from '../../../../components/hrms/people/timesheets/ProjectsTab';

const TABS = ['week', 'approvals', 'projects'] as const;

export default function TimesheetsPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const [tab, setTab] = useTabParam(TABS, 'week');
  if (!db || !state) return <Loading />;
  const ts = state.timesheets;
  const approved = ts.sheets.filter((s) => s.status === 'approved').length;
  const waiting = ts.sheets.filter((s) => s.status === 'submitted').length;

  return (
    <HrmsPage
      eyebrow="HRMS · Workplace"
      title="Timesheets"
      description="Hours against projects and clients for the people who bill or track effort. Weekly entry, manager approval, then locked."
      actions={(
        <Button disabled={approved === 0} onClick={() => {
          const rows = approvedExportRows(ts.sheets, db.employees, ts.projects);
          downloadRows(`approved-timesheets-${PREVIEW_TODAY}.csv`, EXPORT_HEADER as unknown as string[], rows);
          toast.success(`Exported ${rows.length} rows from ${approved} approved weeks.`);
        }}>{approved === 0 ? 'Export approved (no approved weeks yet)' : `Export approved (CSV, ${approved} weeks)`}</Button>
      )}
    >
      <VizStyle />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'week', label: 'Weekly timesheet' },
          { key: 'approvals', label: 'Approvals', count: waiting },
          { key: 'projects', label: 'Projects' },
        ]}
      />
      <div role="tabpanel" aria-label={tab} className="px-viz">
        {tab === 'week' && <WeekTab db={db} ts={ts} />}
        {tab === 'approvals' && <ApprovalsTab db={db} ts={ts} />}
        {tab === 'projects' && <ProjectsTab db={db} ts={ts} />}
      </div>
    </HrmsPage>
  );
}
