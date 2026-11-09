'use client';
// Assignments: every person's current course, with progress, due date and status. Continue opens the lesson walk-through.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, DataTable, EmployeeCell, ProgressBar, SearchBox, T, Toolbar, type Col } from '../../ui';
import { Select } from '../../../ui';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { diffDays, fmtDate } from '../../../../lib/hrms/format';
import { sendReminder } from '../../../../lib/hrms/people/learningActions';
import type { AssignmentStatus, LearningState } from '../../../../lib/hrms/people/types';
import { Muted, Stack } from '../shared';
import { STATUS_LABEL, STATUS_TONE_MAP, type AssignmentRow, type LearningView } from './view';
import LessonModal from './LessonModal';
import CertificateModal from './CertificateModal';

const LIMIT = 200;

export default function AssignmentsTab({ db, st, view }: { db: HrmsDb; st: LearningState; view: LearningView }) {
  const [q, setQ] = useState('');
  const [courseId, setCourseId] = useState('all');
  const [status, setStatus] = useState<'all' | AssignmentStatus>('all');
  const [dept, setDept] = useState('all');
  const [lesson, setLesson] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);

  const rows = useMemo(() => view.rows.filter((r) =>
    (courseId === 'all' || r.c.id === courseId)
    && (status === 'all' || r.status === status)
    && (dept === 'all' || r.e.departmentId === dept)
    && `${r.e.firstName} ${r.e.lastName} ${r.e.code}`.toLowerCase().includes(q.trim().toLowerCase())), [view.rows, courseId, status, dept, q]);
  const shown = rows.slice(0, LIMIT);

  const certificate = cert ? st.certificates.find((c) => c.id === cert) : undefined;
  const certCourse = certificate && view.course.get(certificate.courseId);
  const certPerson = certificate && view.emp.get(certificate.employeeId);

  const columns: Col<AssignmentRow>[] = [
    { key: 'person', label: 'Person', render: (r) => <EmployeeCell e={r.e} sub={view.names.des(r.e.designationId)} />, sortValue: (r) => `${r.e.firstName} ${r.e.lastName}` },
    { key: 'course', label: 'Course', render: (r) => <div><div style={{ fontWeight: 600 }}>{r.c.title}</div><div style={{ fontSize: 12, color: T.mute }}>{r.a.source === 'rule' ? 'From the rule' : r.a.source === 'refresher' ? 'Refresher' : 'Assigned by hand'}</div></div>, sortValue: (r) => r.c.title },
    {
      key: 'due', label: 'Due', nowrap: true, sortValue: (r) => r.a.dueOn,
      render: (r) => {
        const d = diffDays(view.today, r.a.dueOn);
        return <div><div>{fmtDate(r.a.dueOn)}</div>{r.status !== 'completed' && <div style={{ fontSize: 12, color: d < 0 ? T.red : T.mute }}>{d < 0 ? `${-d} days overdue` : d === 0 ? 'Due today' : `in ${d} days`}</div>}</div>;
      },
    },
    { key: 'progress', label: 'Progress', width: 150, sortValue: (r) => r.pct, render: (r) => <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div style={{ flex: 1 }}><ProgressBar pct={r.pct} tone={r.status === 'overdue' ? 'red' : r.status === 'completed' ? 'ok' : 'info'} /></div><span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', width: 34, textAlign: 'right' }}>{r.pct}%</span></div> },
    { key: 'status', label: 'Status', nowrap: true, sortValue: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE_MAP[r.status]} dot>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'score', label: 'Score', align: 'right', render: (r) => (r.a.score != null ? `${r.a.score}%` : '—'), sortValue: (r) => r.a.score ?? -1 },
    { key: 'done', label: 'Completed', nowrap: true, render: (r) => fmtDate(r.a.completedOn) },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {r.status === 'overdue' && r.c.mandatory && (
            <Button size="sm" aria-label={`Send reminder to ${r.e.firstName} ${r.e.lastName} for ${r.c.title}`} onClick={() => { sendReminder(r.a.id); toast.success('Reminder logged. Nothing was sent in this preview.'); }}>Remind</Button>
          )}
          {r.status === 'completed'
            ? <Button size="sm" aria-label={`View certificate for ${r.e.firstName} ${r.e.lastName}, ${r.c.title}`} disabled={!r.a.certificateId} onClick={() => r.a.certificateId && setCert(r.a.certificateId)}>Certificate</Button>
            : <Button size="sm" variant="primary" aria-label={`Continue ${r.c.title} for ${r.e.firstName} ${r.e.lastName}`} onClick={() => setLesson(r.a.id)}>Continue</Button>}
        </div>
      ),
    },
  ];

  return (
    <Stack gap={14}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search people" width={220} />
        <Select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ width: 230 }}>
          <option value="all">All courses</option>
          {st.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'all' | AssignmentStatus)} style={{ width: 160 }}>
          <option value="all">Any status</option>
          {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 180 }}>
          <option value="all">All departments</option>
          {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Toolbar>
      <div data-testid="assignments-table">
        <DataTable columns={columns} rows={shown} minWidth={900} empty="No assignments match these filters." />
      </div>
      <Muted>{rows.length > LIMIT ? `Showing the first ${LIMIT} of ${rows.length}. Narrow the filters to see the rest.` : `${rows.length} ${rows.length === 1 ? 'assignment' : 'assignments'}.`} Status is worked out from the due date against today ({fmtDate(view.today)}). Continue acts for the learner: in the live product they do it on their own phone.</Muted>
      {lesson && <LessonModal st={st} assignmentId={lesson} employees={view.emp} onClose={() => setLesson(null)} onCertificate={(id) => { setLesson(null); setCert(id); }} />}
      {certificate && certCourse && certPerson && <CertificateModal cert={certificate} course={certCourse} person={certPerson} company={db.company.name} onClose={() => setCert(null)} />}
    </Stack>
  );
}
