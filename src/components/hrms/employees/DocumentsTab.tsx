'use client';
// Documents: status, verify or reject, upload (file name and date only in the preview), add a document, mandatory markers.

import { useCallback, useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Modal, Note, StatusBadge, T, type Col } from '../ui';
import type { Employee, EmployeeDocument } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate } from '../../../lib/hrms/format';
import { addDocument, patchDocument, recordUpload, removeDocument } from '../../../lib/hrms/employeeActions';
import { CheckField, SelectField, TextField } from './fields';
import { ConfirmDialog, Flash, useFlash } from './shared';
import { DOC_TYPES, labelOf } from './logic';

function AddDocumentModal({ employee, onClose, onAdded }: { employee: Employee; onClose: () => void; onAdded: (name: string) => void }) {
  const [type, setType] = useState<EmployeeDocument['type']>('id_proof');
  const [name, setName] = useState('ID proof');
  const [nameTouched, setNameTouched] = useState(false);
  const [mandatory, setMandatory] = useState(false);
  const [file, setFile] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!name.trim()) { setErr('Give the document a name'); return; }
    if (employee.documents.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())) { setErr('A document with this name already exists. Upload against it instead, or use a different name.'); return; }
    addDocument(employee.id, { type, name: name.trim(), uploadedOn: PREVIEW_TODAY, status: file ? 'uploaded' : 'pending', mandatory, fileName: file || undefined });
    onAdded(name.trim());
  };

  return (
    <Modal title="Add a document" onClose={onClose} width={500} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} style={{ minHeight: 40 }}>Add document</Button>
      </>
    }>
      <form onSubmit={(ev) => { ev.preventDefault(); submit(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField id="doc-type" label="Type" value={type} placeholder={null} options={DOC_TYPES}
          onChange={(v) => { setType(v as EmployeeDocument['type']); if (!nameTouched) setName(labelOf(DOC_TYPES, v)); }} />
        <TextField id="doc-name" label="Name" required value={name} onChange={(v) => { setName(v); setNameTouched(true); setErr(''); }} error={err} />
        <CheckField id="doc-mandatory" label="Mandatory for this employee" checked={mandatory} onChange={setMandatory} hint="Mandatory documents count towards statutory completeness" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => fileRef.current?.click()}>{file ? 'Choose another file' : 'Attach a file (optional)'}</Button>
          <input ref={fileRef} type="file" aria-label="File for the new document" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            onChange={(ev) => { setFile(ev.target.files?.[0]?.name ?? ''); ev.target.value = ''; }} />
          <span style={{ fontSize: 13, color: file ? T.text : T.mute }}>{file || 'Without a file the document stays Pending'}</span>
        </div>
      </form>
    </Modal>
  );
}

export default function DocumentsTab({ e }: { e: Employee }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<EmployeeDocument | null>(null);
  const [removing, setRemoving] = useState<EmployeeDocument | null>(null);
  const [flash, doFlash] = useFlash();
  const closeAdd = useCallback(() => setAdding(false), []);

  const docs = e.documents;
  const mandatory = docs.filter((d) => d.mandatory);
  const received = mandatory.filter((d) => d.status === 'uploaded' || d.status === 'verified').length;

  const cols: Col<EmployeeDocument & { id: string }>[] = [
    {
      key: 'name', label: 'Document', sortValue: (d) => d.name.toLowerCase(),
      render: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{d.name}</span>
          {d.mandatory && <Badge tone="red" style={{ height: 20, fontSize: 11.5 }}>Mandatory</Badge>}
          {labelOf(DOC_TYPES, d.type).toLowerCase() !== d.name.toLowerCase() && <span style={{ fontSize: 12, color: T.mute, flexBasis: '100%' }}>{labelOf(DOC_TYPES, d.type)}</span>}
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} />, sortValue: (d) => d.status, nowrap: true },
    { key: 'uploaded', label: 'Date', render: (d) => fmtDate(d.uploadedOn), sortValue: (d) => d.uploadedOn, nowrap: true },
    { key: 'file', label: 'File', render: (d) => (d.fileName ? <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{d.fileName}</span> : <span style={{ color: T.mute }}>No file</span>) },
    {
      key: 'actions', label: 'Actions', align: 'right', width: 280,
      render: (d) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button size="sm" style={{ minHeight: 34 }} aria-label={`${d.fileName ? 'Replace file for' : 'Upload'} ${d.name}`} onClick={() => { setUploadFor(d.id); fileRef.current?.click(); }}>{d.fileName ? 'Replace' : 'Upload'}</Button>
          <Button size="sm" style={{ minHeight: 34 }} aria-label={`Verify ${d.name}`} disabled={d.status !== 'uploaded'} title={d.status === 'verified' ? 'Already verified' : d.status === 'uploaded' ? undefined : 'Upload a file first'}
            onClick={() => { patchDocument(e.id, d.id, { status: 'verified' }); doFlash(`${d.name} marked verified.`); }}>Verify</Button>
          <Button size="sm" variant="danger" style={{ minHeight: 34 }} aria-label={`Reject ${d.name}`} disabled={d.status === 'rejected' || d.status === 'pending'} onClick={() => setRejecting(d)}>Reject</Button>
          {!d.mandatory && <Button size="sm" variant="ghost" style={{ minHeight: 34 }} aria-label={`Remove ${d.name}`} onClick={() => setRemoving(d)}>Remove</Button>}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardTitle right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Flash msg={flash} />
          <Button variant="primary" onClick={() => setAdding(true)} style={{ minHeight: 40 }}>Add document</Button>
        </div>
      }>Documents</CardTitle>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, fontSize: 13.5, color: T.dim }}>
        <Badge tone={received === mandatory.length ? 'ok' : 'warn'} dot>{received} of {mandatory.length} mandatory documents received</Badge>
        <span>Received means uploaded or verified.</span>
      </div>
      <input ref={fileRef} type="file" aria-label="Choose a file to upload" data-testid="doc-upload" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          const target = docs.find((d) => d.id === uploadFor);
          if (f && target) { recordUpload(e.id, target.id, f.name); doFlash(`${f.name} attached to ${target.name}.`); }
          setUploadFor(null);
          ev.target.value = '';
        }} />
      <DataTable columns={cols} rows={docs} minWidth={820} empty="No documents yet. Use Add document to start the file." />
      <div style={{ marginTop: 12 }}>
        <Note tone="info">Preview only: choosing a file keeps its name and the date, not the file itself. Real storage and virus scanning arrive with the backend.</Note>
      </div>

      {adding && <AddDocumentModal employee={e} onClose={closeAdd} onAdded={(n) => { setAdding(false); doFlash(`${n} added.`); }} />}
      {rejecting && (
        <ConfirmDialog title={`Reject ${rejecting.name}?`} confirmLabel="Reject document" danger onClose={() => setRejecting(null)}
          onConfirm={() => { patchDocument(e.id, rejecting.id, { status: 'rejected' }); doFlash(`${rejecting.name} rejected. Ask the employee for a new file.`); setRejecting(null); }}>
          The document goes back to the employee as rejected and stops counting as received{rejecting.mandatory ? ', which lowers statutory completeness' : ''}. Upload a new file to start again.
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog title={`Remove ${removing.name}?`} confirmLabel="Remove document" danger onClose={() => setRemoving(null)}
          onConfirm={() => { removeDocument(e.id, removing.id); doFlash(`${removing.name} removed.`); setRemoving(null); }}>
          This takes the document off the employee&apos;s file. The removal is recorded in the change log.
        </ConfirmDialog>
      )}
    </Card>
  );
}
