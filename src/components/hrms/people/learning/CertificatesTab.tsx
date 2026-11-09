'use client';
// Certificate register: every certificate issued, with a printable card for each. The numbers are mock.

import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, SearchBox, Toolbar, T, type Col } from '../../ui';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { diffDays, fmtDate, fullName } from '../../../../lib/hrms/format';
import { EXPIRY_WINDOW_DAYS } from '../../../../lib/hrms/people/learningEngine';
import type { Certificate, LearningState } from '../../../../lib/hrms/people/types';
import { Muted, SimulationBadge, Stack } from '../shared';
import type { LearningView } from './view';
import CertificateModal from './CertificateModal';

export default function CertificatesTab({ db, st, view }: { db: HrmsDb; st: LearningState; view: LearningView }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => [...st.certificates]
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id.localeCompare(a.id))
    .filter((c) => {
      const e = view.emp.get(c.employeeId);
      const text = `${c.id} ${e ? fullName(e) : ''} ${view.course.get(c.courseId)?.title ?? ''}`.toLowerCase();
      return text.includes(q.trim().toLowerCase());
    }), [st.certificates, q, view]);

  const cert = open ? st.certificates.find((c) => c.id === open) : undefined;
  const course = cert && view.course.get(cert.courseId);
  const person = cert && view.emp.get(cert.employeeId);

  const validity = (c: Certificate) => {
    if (!c.expiresOn) return <Badge>No expiry</Badge>;
    const d = diffDays(view.today, c.expiresOn);
    if (d < 0) return <Badge tone="red" dot>Lapsed</Badge>;
    if (d <= EXPIRY_WINDOW_DAYS) return <Badge tone="warn" dot>Lapses in {d} days</Badge>;
    return <Badge tone="ok" dot>Valid</Badge>;
  };
  const columns: Col<Certificate>[] = [
    { key: 'id', label: 'Number', nowrap: true, render: (c) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{c.id}</span>, sortValue: (c) => c.id },
    { key: 'p', label: 'Person', render: (c) => { const e = view.emp.get(c.employeeId); return e ? fullName(e) : c.employeeId; }, sortValue: (c) => c.employeeId },
    { key: 'c', label: 'Course', render: (c) => view.course.get(c.courseId)?.title ?? c.courseId },
    { key: 'issued', label: 'Issued', nowrap: true, render: (c) => fmtDate(c.issuedOn), sortValue: (c) => c.issuedOn },
    { key: 'exp', label: 'Valid until', nowrap: true, render: (c) => fmtDate(c.expiresOn), sortValue: (c) => c.expiresOn ?? '9999' },
    { key: 'v', label: 'Validity', nowrap: true, render: validity },
    { key: 'score', label: 'Score', align: 'right', render: (c) => `${c.score}%`, sortValue: (c) => c.score },
    { key: 'view', label: '', align: 'right', render: (c) => <Button size="sm" aria-label={`View certificate ${c.id}`} onClick={() => setOpen(c.id)}>View</Button> },
  ];

  return (
    <Stack gap={14}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search number, person or course" width={300} />
        <SimulationBadge>Mock certificate numbers</SimulationBadge>
      </Toolbar>
      <div data-testid="certificates-table"><DataTable columns={columns} rows={rows} minWidth={860} empty="No certificates match." /></div>
      <Muted>A certificate is issued when a person passes the quiz with {70}% or more. Courses with a refresher show when the certificate lapses.</Muted>
      {cert && course && person && <CertificateModal cert={cert} course={course} person={person} company={db.company.name} onClose={() => setOpen(null)} />}
    </Stack>
  );
}
