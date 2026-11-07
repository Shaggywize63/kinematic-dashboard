'use client';
// Employee profile. Tabs are deep-linkable with ?tab= (overview, personal, employment, statutory, documents, salary, leave, history).

import { useCallback, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Avatar, Button, Card, EmptyState, HrmsPage, Loading, Note, StatusBadge, TabBar, T, useTabParam } from '../../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../../lib/hrms/db';
import { fmtDate, fullName } from '../../../../../lib/hrms/format';
import { ConfirmDialog, DirtyProvider, type DirtyApi } from '../../../../../components/hrms/employees/shared';
import { TAB_KEYS, type TabKey } from '../../../../../components/hrms/employees/logic';
import OverviewTab from '../../../../../components/hrms/employees/OverviewTab';
import PersonalTab from '../../../../../components/hrms/employees/PersonalTab';
import EmploymentTab from '../../../../../components/hrms/employees/EmploymentTab';
import StatutoryTab from '../../../../../components/hrms/employees/StatutoryTab';
import DocumentsTab from '../../../../../components/hrms/employees/DocumentsTab';
import SalaryTab from '../../../../../components/hrms/employees/SalaryTab';
import LeaveTab from '../../../../../components/hrms/employees/LeaveTab';
import HistoryTab from '../../../../../components/hrms/employees/HistoryTab';

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam<TabKey>(TAB_KEYS, 'overview');
  const dirty = useRef<DirtyApi | null>(null);
  const [pending, setPending] = useState<TabKey | null>(null);

  // Switching tabs with unsaved edits asks first; the edits live in the tab being left.
  const go = useCallback((k: TabKey) => {
    if (dirty.current?.anyDirty()) setPending(k); else setTab(k);
  }, [setTab]);

  if (!db) return <Loading />;
  const e = db.employees.find((x) => x.id === id);

  if (!e) {
    return (
      <HrmsPage title="Employee not found" actions={<Button href="/dashboard/hrms/employees">Back to employees</Button>}>
        <Card>
          <EmptyState title="There is no employee with this ID" description="The link may be old, or the sample data was reset. Open the list to find the person." action={<Button variant="primary" href="/dashboard/hrms/employees" style={{ minHeight: 40 }}>Go to the employee list</Button>} />
        </Card>
      </HrmsPage>
    );
  }

  const name = fullName(e);
  const designation = db.designations.find((x) => x.id === e.designationId)?.name;
  const department = db.departments.find((x) => x.id === e.departmentId)?.name;
  const location = db.locations.find((x) => x.id === e.locationId)?.name;
  const docsOpen = e.documents.filter((d) => d.mandatory && d.status !== 'verified' && d.status !== 'uploaded').length;

  return (
    <DirtyProvider apiRef={dirty}>
      <HrmsPage
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><Avatar name={name} size={44} /><span>{name}</span></span>}
        description={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: T.mono, fontSize: 12.5 }} data-testid="employee-code">{e.code}</span>
            <StatusBadge status={e.status} />
            <span>{[designation, department, location].filter(Boolean).join(' · ')}</span>
          </div>
        }
        actions={
          <>
            <Button href={`mailto:${e.email}`}>Email</Button>
            <Button href={`tel:${e.mobile}`}>Call</Button>
            <Button href="/dashboard/hrms/payroll">Payroll</Button>
            <Button href="/dashboard/hrms/employees">All employees</Button>
          </>
        }
      >
        {e.status === 'exited' && <Note tone="warn">{name} left on {fmtDate(e.lastWorkingDate)}. The record is kept for the retention period.</Note>}
        {e.status === 'onboarding' && <Note tone="info">{name} joins on {fmtDate(e.joinDate)} and is still onboarding{docsOpen ? `. ${docsOpen} mandatory ${docsOpen === 1 ? 'document is' : 'documents are'} outstanding.` : '.'}</Note>}

        <TabBar<TabKey> value={tab} onChange={go} tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'personal', label: 'Personal' },
          { key: 'employment', label: 'Employment' },
          { key: 'statutory', label: 'Statutory' },
          { key: 'documents', label: 'Documents', count: e.documents.length },
          { key: 'salary', label: 'Salary' },
          { key: 'leave', label: 'Leave' },
          { key: 'history', label: 'History', count: e.history.length },
        ]} />

        <div role="tabpanel" aria-label={tab}>
          {tab === 'overview' && <OverviewTab e={e} db={db} go={go} />}
          {tab === 'personal' && <PersonalTab key={e.id} e={e} db={db} />}
          {tab === 'employment' && <EmploymentTab key={e.id} e={e} db={db} />}
          {tab === 'statutory' && <StatutoryTab key={e.id} e={e} db={db} />}
          {tab === 'documents' && <DocumentsTab key={e.id} e={e} />}
          {tab === 'salary' && <SalaryTab key={e.id} e={e} db={db} />}
          {tab === 'leave' && <LeaveTab e={e} db={db} />}
          {tab === 'history' && <HistoryTab e={e} db={db} />}
        </div>

        {pending && (
          <ConfirmDialog title="Leave without saving?" confirmLabel="Discard and switch" danger onClose={() => setPending(null)} onConfirm={() => { const k = pending; setPending(null); setTab(k); }}>
            You have unsaved edits on this tab. Switching to another tab discards them.
          </ConfirmDialog>
        )}
      </HrmsPage>
    </DirtyProvider>
  );
}
