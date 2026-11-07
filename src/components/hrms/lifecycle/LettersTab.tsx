'use client';
// Letters: templates (edit, generate), the generate flow and the register of issued letters.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, EmptyState, Note, SearchBox, Toolbar, T, type Col } from '../ui';
import { Select } from '../../ui';
import { Dialog, useOneShotParam } from './common';
import TemplateEditor from './TemplateEditor';
import GenerateLetterModal, { IssuedLetterView } from './GenerateLetterModal';
import { LETTER_TYPES, ensureLetterTemplates, letterTypeLabel } from './letters';
import { markLetterSigned } from '../../../lib/hrms/lifecycleActions';
import { isLive } from '../overview/insights';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import type { HrmsDb, IssuedLetter, LetterTemplate } from '../../../lib/hrms/types';

export default function LettersTab({ db }: { db: HrmsDb }) {
  const [editor, setEditor] = useState<{ template: LetterTemplate | null } | null>(null);
  const [generate, setGenerate] = useState<{ templateId?: string } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [signed, setSigned] = useState('');
  useOneShotParam('generate', () => setGenerate({}));
  useEffect(() => { ensureLetterTemplates(); }, []);   // every LetterType gets a template; only missing ones are added

  const closeEditor = useMemo(() => () => setEditor(null), []);
  const closeGenerate = useMemo(() => () => setGenerate(null), []);
  const closeView = useMemo(() => () => setViewing(null), []);

  const templates = [...db.letterTemplates].sort((a, b) => LETTER_TYPES.findIndex((t) => t.value === a.type) - LETTER_TYPES.findIndex((t) => t.value === b.type) || a.name.localeCompare(b.name));
  const countFor = (tid: string) => db.letters.filter((l) => l.templateId === tid).length;

  // Appointment letters: current employees with neither an uploaded/verified document nor an issued letter.
  const missingAppointment = db.employees.filter(isLive).filter((e) =>
    !e.documents.some((d) => d.type === 'appointment_letter' && (d.status === 'verified' || d.status === 'uploaded'))
    && !db.letters.some((l) => l.employeeId === e.id && l.type === 'appointment'));

  const needle = q.trim().toLowerCase();
  const rows = db.letters
    .map((l) => ({ l, emp: db.employees.find((e) => e.id === l.employeeId) }))
    .filter((r): r is { l: IssuedLetter; emp: NonNullable<typeof r.emp> } => !!r.emp)
    .filter(({ l, emp }) => (!type || l.type === type) && (!signed || (signed === 'signed') === l.signed) && (!needle || `${fullName(emp)} ${emp.code}`.toLowerCase().includes(needle)))
    .sort((a, b) => (a.l.issuedOn < b.l.issuedOn ? 1 : a.l.issuedOn > b.l.issuedOn ? -1 : 0))
    .map((r) => ({ id: r.l.id, ...r }));
  type Row = (typeof rows)[number];

  const columns: Col<Row>[] = [
    { key: 'emp', label: 'Employee', render: (r) => <EmployeeCell e={r.emp} />, sortValue: (r) => fullName(r.emp).toLowerCase() },
    { key: 'type', label: 'Type', render: (r) => <Badge>{letterTypeLabel(r.l.type)}</Badge>, sortValue: (r) => r.l.type },
    { key: 'tpl', label: 'Template', render: (r) => db.letterTemplates.find((t) => t.id === r.l.templateId)?.name ?? '—', sortValue: (r) => db.letterTemplates.find((t) => t.id === r.l.templateId)?.name ?? '' },
    { key: 'date', label: 'Issued on', nowrap: true, render: (r) => fmtDate(r.l.issuedOn), sortValue: (r) => r.l.issuedOn },
    { key: 'signed', label: 'Signed', render: (r) => (r.l.signed ? <Badge tone="ok" dot>Signed</Badge> : <Badge tone="warn" dot>Unsigned</Badge>), sortValue: (r) => (r.l.signed ? 1 : 0) },
    {
      key: 'actions', label: 'Actions', align: 'right', nowrap: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" style={{ height: 36 }} aria-label={`View ${letterTypeLabel(r.l.type)} letter for ${fullName(r.emp)}`} onClick={() => setViewing(r.l.id)}>View</Button>
          {!r.l.signed && (
            <Button size="sm" style={{ height: 36 }} aria-label={`Mark ${letterTypeLabel(r.l.type)} letter for ${fullName(r.emp)} as signed`}
              onClick={() => { markLetterSigned(r.l.id); toast.success('Marked as signed.'); }}>Mark signed</Button>
          )}
        </span>
      ),
    },
  ];

  const viewingLetter = viewing ? db.letters.find((l) => l.id === viewing) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Note tone={missingAppointment.length ? 'warn' : 'info'}>
        <b>Appointment letters are mandatory under the OSH Code (as reported).</b>{' '}
        {missingAppointment.length === 0
          ? 'Every current employee has an appointment letter on file or in the register below.'
          : `${missingAppointment.length} current ${missingAppointment.length === 1 ? 'employee has' : 'employees have'} no appointment letter on file: ${missingAppointment.slice(0, 4).map(fullName).join(', ')}${missingAppointment.length > 4 ? ' and others' : ''}.`}
        {' '}The wording here is sample text. Have your counsel review it before use.
      </Note>

      <Card>
        <CardTitle right={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button style={{ height: 44 }} onClick={() => setEditor({ template: null })}>New template</Button>
            <Button variant="primary" style={{ height: 44 }} onClick={() => setGenerate({})}>Generate letter</Button>
          </div>
        )}>Templates</CardTitle>
        {templates.length === 0 ? <EmptyState title="No templates" description="Create a template to start issuing letters." /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {templates.map((t, i) => (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: T.dim }}>{countFor(t.id)} issued</div>
                </div>
                <Badge>{letterTypeLabel(t.type)}</Badge>
                <Button style={{ height: 40 }} aria-label={`Edit ${t.name}`} onClick={() => setEditor({ template: t })}>Edit</Button>
                <Button style={{ height: 40 }} aria-label={`Generate ${t.name}`} onClick={() => setGenerate({ templateId: t.id })}>Generate</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700 }}>Issued letters</h2>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search by employee name or code" width={300} />
          <div style={{ width: 170 }}>
            <Select aria-label="Filter by letter type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {LETTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div style={{ width: 150 }}>
            <Select aria-label="Filter by signed status" value={signed} onChange={(e) => setSigned(e.target.value)}>
              <option value="">Signed or not</option>
              <option value="signed">Signed</option>
              <option value="unsigned">Unsigned</option>
            </Select>
          </div>
        </Toolbar>
        <DataTable<Row> columns={columns} rows={rows} minWidth={760}
          empty={db.letters.length === 0
            ? <EmptyState title="No letters issued yet" description="Generate a letter and it will be recorded here." action={<Button variant="primary" style={{ height: 44 }} onClick={() => setGenerate({})}>Generate letter</Button>} />
            : 'No letter matches these filters.'} />
      </div>

      {editor && <TemplateEditor db={db} template={editor.template} onClose={closeEditor} />}
      {generate && <GenerateLetterModal db={db} initialTemplateId={generate.templateId} onClose={closeGenerate} />}
      {viewingLetter && (
        <Dialog title={`${letterTypeLabel(viewingLetter.type)} letter`} width={760} onClose={closeView} footer={<Button onClick={closeView} style={{ height: 44 }}>Close</Button>}>
          <IssuedLetterView db={db} letter={viewingLetter} />
        </Dialog>
      )}
    </div>
  );
}
