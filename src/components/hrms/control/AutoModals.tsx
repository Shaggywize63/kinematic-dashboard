'use client';
// The three dialogs of the autopilot: prepare (build and preview the working file), mark filed, and the evidence pack of a filed task.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input, Textarea } from '../../ui';
import { Badge, Button, KeyValue, Modal, Note, T, downloadRows, downloadText } from '../ui';
import type { ComplianceTask, HrmsDb } from '../../../lib/hrms/types';
import { ATTACHMENT_CHOICES, KIND_LABEL, prepareArtefact, taskKind, type Readiness } from '../../../lib/hrms/control/autopilot';
import type { FilingEvidence } from '../../../lib/hrms/control/types';
import { diffDays, fmtDate, fullName } from '../../../lib/hrms/format';
import { CheckRow, Muted, Row, Stack } from './parts';
import { CheckList } from './AutoCard';

export function PrepareModal({ db, r, manual, onManual, onClose, onFile }: {
  db: HrmsDb; r: Readiness; manual: Record<string, boolean>; onManual: (id: string, v: boolean) => void; onClose: () => void; onFile: () => void;
}) {
  const art = useMemo(() => prepareArtefact(db, r.task, manual), [db, r.task, manual]);
  const name = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : id; };
  const previewLines = art.text ? art.text.split('\n') : [];
  const canDownload = art.kind === 'ecr' ? !!art.text : art.kind === 'sheet' ? !!art.rows?.length : false;
  function download() {
    if (art.kind === 'ecr' && art.text) downloadText(art.filename ?? 'ecr.txt', art.text);
    else if (art.kind === 'sheet' && art.header && art.rows) downloadRows(art.filename ?? 'sheet.csv', art.header, art.rows);
    toast.success('Downloaded.');
  }
  return (
    <Modal title={`Prepare: ${r.task.name}`} onClose={onClose} width={760}
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button onClick={download} disabled={!canDownload} data-testid="prepare-download" title={canDownload ? undefined : 'There is no file to download for this one'}>
            {art.kind === 'list' ? 'No file for this one' : 'Download'}
          </Button>
          <Button variant="primary" onClick={onFile} data-testid="prepare-file">Mark filed</Button>
        </>
      )}>
      <Row gap={8}><Badge tone={art.kind === 'list' ? 'neutral' : 'info'} mono>{art.kind === 'ecr' ? 'ECR file' : art.kind === 'sheet' ? 'Working sheet' : 'Checklist only'}</Badge><span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{art.title}</span></Row>
      {r.blockers.length > 0 && <Note tone="warn">{r.blockers.length} {r.blockers.length === 1 ? 'blocker is' : 'blockers are'} still open. You can prepare and file anyway, but fix these first if you can.</Note>}
      <Note tone="info">{art.note}</Note>
      {art.summary.length > 0 && <div data-testid="prepare-summary"><KeyValue columns={3} rows={art.summary.map((s) => ({ label: s.label, value: s.value }))} /></div>}
      {art.issues.length > 0 && (
        <div data-testid="prepare-issues">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>Needs attention</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.dim, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {art.issues.map((i) => <li key={i.employeeId}><b style={{ color: T.text }}>{name(i.employeeId)}</b>: {i.reason}</li>)}
          </ul>
        </div>
      )}
      {art.kind === 'ecr' && (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Preview of the file ({previewLines.length} rows)</div>
          <pre data-testid="ecr-preview" style={{ margin: 0, padding: 12, background: T.raised, color: T.text, borderRadius: T.radius.md, fontFamily: T.mono, fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto', maxHeight: 220, whiteSpace: 'pre' }}>{previewLines.slice(0, 8).join('\n')}{previewLines.length > 8 ? `\n... ${previewLines.length - 8} more rows` : ''}</pre>
        </div>
      )}
      {art.kind === 'sheet' && art.header && art.rows && (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Preview of the sheet ({art.rows.length} rows)</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }} data-testid="sheet-preview">
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
              <thead><tr>{art.header.map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: T.mute, background: T.panel, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {art.rows.length === 0 && <tr><td colSpan={art.header.length} style={{ padding: 16, color: T.mute, fontSize: 13 }}>No rows. Nobody qualifies for this filing in this period.</td></tr>}
                {art.rows.slice(0, 8).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} style={{ padding: '7px 10px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {art.rows.length > 8 && <Muted style={{ marginTop: 6 }}>{art.rows.length - 8} more rows in the download.</Muted>}
        </div>
      )}
      {art.kind === 'list' && art.items && (
        <div data-testid="prepare-checklist">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Checklist</div>
          <CheckList checks={r.checks} onManual={onManual} employees={db.employees} />
        </div>
      )}
    </Modal>
  );
}

export function FileModal({ r, onClose, onConfirm }: { r: Readiness; onClose: () => void; onConfirm: (reference: string, attachments: string[], note: string) => void }) {
  const choices = ATTACHMENT_CHOICES[r.kind];
  const [reference, setReference] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const err = reference.trim().length === 0 ? 'Enter the challan or acknowledgement number.' : reference.trim().length < 4 ? 'A reference is at least 4 characters.' : '';
  return (
    <Modal title="Mark as filed" onClose={onClose} width={520}
      footer={(<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="file-confirm" onClick={() => { setTouched(true); if (!err) onConfirm(reference, picked, note); }}>Save filing</Button></>)}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}><b>{r.task.name}</b>. Filing happens on the portal or at the bank. This records that it was done, and keeps the evidence.</div>
      {r.blockers.length > 0 && <Note tone="warn">{r.blockers.length} {r.blockers.length === 1 ? 'blocker is' : 'blockers are'} still open on this filing. Record it only if it really has been filed.</Note>}
      <Field label="Reference" required htmlFor="file-ref" error={touched ? err : undefined} hint="Challan number or portal acknowledgement.">
        <Input id="file-ref" value={reference} invalid={touched && !!err} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 2 }}>What was attached</div>
        {choices.map((c) => <CheckRow key={c} checked={picked.includes(c)} onChange={(v) => setPicked((p) => (v ? [...p, c] : p.filter((x) => x !== c)))}>{c}</CheckRow>)}
        <Muted>The preview records the names only. It does not store the files.</Muted>
      </div>
      <Field label="Note" htmlFor="file-note" hint="Optional. Anything the next person should know.">
        <Textarea id="file-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function EvidenceModal({ db, task, evidence, onClose, onReopen }: { db: HrmsDb; task: ComplianceTask; evidence?: FilingEvidence; onClose: () => void; onReopen: () => void }) {
  const late = task.filedOn ? diffDays(task.dueOn, task.filedOn) : 0;
  const entity = db.entities.find((e) => e.id === task.entityId);
  return (
    <Modal title="Evidence pack" onClose={onClose} width={560}
      footer={(<><Button onClick={onClose}>Close</Button><Button variant="danger" onClick={onReopen} data-testid="evidence-reopen">Reopen this filing</Button></>)}>
      <Row gap={8}><Badge tone="neutral" mono>{task.law}</Badge><Badge tone={late > 0 ? 'warn' : 'ok'} dot>{late > 0 ? `Filed ${late} ${late === 1 ? 'day' : 'days'} late` : 'Filed on time'}</Badge></Row>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{task.name}</div>
      <div data-testid="evidence-pack">
        <KeyValue columns={2} rows={[
          { label: 'Reference', value: <span style={{ fontFamily: T.mono }}>{task.reference}</span> },
          { label: 'Filed on', value: fmtDate(task.filedOn) },
          { label: 'Due on', value: fmtDate(task.dueOn) },
          { label: 'Filed by', value: evidence?.by ?? 'Not recorded' },
          { label: 'Legal entity', value: entity?.name },
          { label: 'Kind', value: KIND_LABEL[taskKind(task)] },
        ]} />
      </div>
      <Stack gap={4}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>What was attached</div>
        {evidence?.attachments.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.text, display: 'flex', flexDirection: 'column', gap: 3 }}>{evidence.attachments.map((a) => <li key={a}>{a}</li>)}</ul>
        ) : <Muted>Nothing was recorded as attached.</Muted>}
        {evidence?.note && <Muted>Note: {evidence.note}</Muted>}
        <Muted>The preview records the names of attachments, not the files themselves.</Muted>
      </Stack>
    </Modal>
  );
}
