'use client';
// Timesheets: weekly hours against projects and clients for roles that bill or track effort, with approval, locking,
// a project view and a CSV of approved weeks. Sample mode runs on data kept in this browser. In live mode (phase 9) the
// projects, every week, the company limits and who tracks time are read from, and saved to, the server
// (GET /timesheets/bootstrap + the project / policy / tracked / sheet endpoints). The page degrades on its own when the
// timesheet tables are not set up yet (503).

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { EXPORT_HEADER, approvedExportRows } from '../../../../lib/hrms/people/timesheetEngine';
import { tsToday } from '../../../../lib/hrms/people/timesheetClock';
import { ensureTimesheetsLoaded, reloadTimesheets, useLiveTimesheetsStatus } from '../../../../lib/hrms/people/live/timesheetsSource';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, TabBar, downloadRows, useTabParam } from '../../../../components/hrms/ui';
import { VizStyle } from '../../../../components/hrms/people/shared';
import WeekTab from '../../../../components/hrms/people/timesheets/WeekTab';
import ApprovalsTab from '../../../../components/hrms/people/timesheets/ApprovalsTab';
import ProjectsTab from '../../../../components/hrms/people/timesheets/ProjectsTab';

const TABS = ['week', 'approvals', 'projects'] as const;

export default function TimesheetsPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const core = useLiveStatus();
  const tsStatus = useLiveTimesheetsStatus();
  const live = tsStatus.source === 'live';
  const [tab, setTab] = useTabParam(TABS, 'week');

  // Load the timesheet data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureTimesheetsLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  if (!db || !state) return <Loading />;
  const ts = state.timesheets;
  const approved = ts.sheets.filter((s) => s.status === 'approved').length;
  const waiting = ts.sheets.filter((s) => s.status === 'submitted').length;

  const loading = live && (tsStatus.phase === 'idle' || tsStatus.phase === 'loading');
  const notReady = live && tsStatus.phase === 'not_ready';
  const errored = live && tsStatus.phase === 'error';
  const ready = !live || tsStatus.phase === 'ok';

  const description = live
    ? 'Hours against projects and clients for the people who bill or track effort. Weekly entry, manager approval, then locked. Saved on the server.'
    : 'Hours against projects and clients for the people who bill or track effort. Weekly entry, manager approval, then locked. Sample data, kept in this browser.';

  return (
    <HrmsPage
      eyebrow="HRMS · Workplace"
      title="Timesheets"
      description={description}
      actions={(
        <>
          <Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>
          {ready && (
            <Button disabled={approved === 0} onClick={() => {
              const rows = approvedExportRows(ts.sheets, db.employees, ts.projects);
              downloadRows(`approved-timesheets-${tsToday()}.csv`, EXPORT_HEADER as unknown as string[], rows);
              toast.success(`Exported ${rows.length} rows from ${approved} approved weeks.`);
            }}>{approved === 0 ? 'Export approved (no approved weeks yet)' : `Export approved (CSV, ${approved} weeks)`}</Button>
          )}
        </>
      )}
    >
      <VizStyle />
      {loading && <div data-testid="timesheets-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="timesheets-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold the live timesheets have not been created on the server, so there is nothing to load or save yet. The sample data still works."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadTimesheets()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="timesheets-error">
          <Card>
            <EmptyState title="Could not load the timesheets"
              description={<span data-testid="timesheets-error-message">{tsStatus.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadTimesheets()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {ready && (
        <>
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'week', label: 'Weekly timesheet' },
              { key: 'approvals', label: 'Approvals', count: waiting },
              { key: 'projects', label: 'Projects', count: ts.projects.length ? undefined : 0 },
            ]}
          />
          <div role="tabpanel" aria-label={tab} className="px-viz" data-testid="timesheets-ready">
            {tab === 'week' && <WeekTab db={db} ts={ts} />}
            {tab === 'approvals' && <ApprovalsTab db={db} ts={ts} />}
            {tab === 'projects' && <ProjectsTab db={db} ts={ts} />}
          </div>
        </>
      )}
    </HrmsPage>
  );
}
