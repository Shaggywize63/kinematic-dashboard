'use client';
// CSV import: pick a file, map its columns, see which rows pass the same checks as the New form, import the valid ones.

import { useMemo, useRef, useState } from 'react';
import { Badge, Button, Modal, Note, T, downloadRows, useIsCompact } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { addEmployee } from '../../../lib/hrms/actions';
import { fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import {
  IMPORT_FIELDS, autoMap, draftToInput, parseCsv, templateRows, validateImport, type ImportKey,
} from './logic';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

export default function ImportModal({ db, onClose }: { db: HrmsDb; onClose: () => void }) {
  const compact = useIsCompact(700);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(ImportKey | '')[]>([]);
  const [done, setDone] = useState<{ imported: { code: string; name: string }[]; skipped: number } | null>(null);

  const results = useMemo(() => (header.length ? validateImport(db, data, mapping) : []), [db, header, data, mapping]);
  const valid = results.filter((r) => r.draft);
  const invalid = results.filter((r) => !r.draft);
  const mapped = new Set(mapping.filter(Boolean));
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mapped.has(f.key));

  function onFile(file: File | undefined) {
    setFileError(''); setDone(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setFileError('That file is over 2 MB. Split it and import in parts.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setFileError('The file could not be read.');
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parseCsv(text);
      if (parsed.unterminated) { setFileError('A quoted value is never closed, so the file cannot be read reliably. Check for a stray double quote.'); return; }
      if (parsed.rows.length < 2) { setFileError('The file needs a header row and at least one employee row.'); return; }
      if (parsed.rows.length - 1 > MAX_ROWS) { setFileError(`The file has more than ${MAX_ROWS} rows. Split it and import in parts.`); return; }
      const [h, ...rest] = parsed.rows;
      setFileName(file.name); setHeader(h!); setData(rest); setMapping(autoMap(h!));
    };
    reader.readAsText(file);
  }

  function template() {
    const t = templateRows(db);
    downloadRows('employee-import-template.csv', t.header, t.rows);
  }
  function errorReport() {
    downloadRows('employee-import-errors.csv', ['Line', 'Name', 'Problems'], invalid.map((r) => [r.line, `${r.raw.firstName ?? ''} ${r.raw.lastName ?? ''}`.trim(), r.errors.join('; ')]));
  }
  function run() {
    const imported: { code: string; name: string }[] = [];
    for (const r of valid) {
      const e = addEmployee(draftToInput(r.draft!, db));
      imported.push({ code: e.code, name: `${e.firstName} ${e.lastName}`.trim() });
    }
    setDone({ imported, skipped: invalid.length });
  }

  const footer = done ? (
    <Button variant="primary" onClick={onClose} style={{ minHeight: 40 }}>Close</Button>
  ) : (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={run} disabled={!valid.length || missingRequired.length > 0} style={{ minHeight: 40 }}>
        {valid.length ? `Import ${valid.length} ${valid.length === 1 ? 'employee' : 'employees'}` : 'Import'}
      </Button>
    </>
  );

  return (
    <Modal title="Import employees from CSV" onClose={onClose} width={860} footer={footer}>
      {done ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Note tone="ok"><strong>Imported {done.imported.length} {done.imported.length === 1 ? 'employee' : 'employees'}.</strong>{done.skipped ? ` ${done.skipped} ${done.skipped === 1 ? 'row was' : 'rows were'} left out because of errors.` : ''}</Note>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.text, maxHeight: 220, overflowY: 'auto' }}>
            {done.imported.map((x) => <li key={x.code}><span style={{ fontFamily: T.mono }}>{x.code}</span> {x.name}</li>)}
          </ul>
          <div style={{ fontSize: 12.5, color: T.dim }}>Join dates up to {fmtDate(PREVIEW_TODAY)} made the employee Active, later dates Onboarding. Statutory completeness shows what is still missing on each profile.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
            Columns are matched by their header text and you can change any match below. Every row goes through the same checks as the New employee form (PAN, UAN, mobile, email, IFSC, account number, dates). Only valid rows are imported; this runs on the sample data in this browser.
          </div>
          <Note tone="info">Full Aadhaar numbers in the file are never stored. Only the last four digits are kept and the number is marked not verified.</Note>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={template}>Download template</Button>
            <Button variant="primary" onClick={() => fileRef.current?.click()} style={{ minHeight: 40 }}>{fileName ? 'Choose a different file' : 'Choose CSV file'}</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="CSV file to import" data-testid="import-file" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            {fileName && <span style={{ fontSize: 13, color: T.text }}>{fileName}</span>}
          </div>
          {fileError && <div role="alert" style={{ color: T.red, fontSize: 13 }}>{fileError}</div>}

          {header.length > 0 && (
            <>
              <section aria-label="Column mapping" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 13.5, fontWeight: 700, color: T.text }}>Column mapping</h3>
                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '8px 20px' }}>
                  {header.map((h, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: T.text, overflowWrap: 'anywhere' }}>{h || `(column ${i + 1})`}</span>
                      <Select aria-label={`Field for column ${h || i + 1}`} value={mapping[i] ?? ''} onChange={(e) => {
                        const v = e.target.value as ImportKey | '';
                        setMapping((m) => m.map((x, j) => (j === i ? v : v && x === v ? '' : x)));
                      }}>
                        <option value="">Ignore this column</option>
                        {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                {missingRequired.length > 0 && (
                  <div role="alert" style={{ color: T.red, fontSize: 13 }}>Map these required fields to import: {missingRequired.map((f) => f.label).join(', ')}.</div>
                )}
              </section>

              <section aria-label="Validation result" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 13.5, fontWeight: 700, color: T.text }}>Check</h3>
                  <Badge tone="ok" dot><span data-testid="import-valid">{valid.length} valid</span></Badge>
                  <Badge tone={invalid.length ? 'red' : 'neutral'} dot><span data-testid="import-invalid">{invalid.length} with errors</span></Badge>
                  {invalid.length > 0 && <Button size="sm" onClick={errorReport}>Download error report</Button>}
                </div>
                {missingRequired.length === 0 && invalid.length > 0 && (
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'auto', maxHeight: 260 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                      <thead><tr>{['Line', 'Name', 'Problems'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, background: T.panel, position: 'sticky', top: 0 }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {invalid.map((r) => (
                          <tr key={r.line} data-testid="import-error-row">
                            <td style={{ padding: '8px 12px', fontSize: 13, borderTop: `1px solid ${T.border}`, fontFamily: T.mono, verticalAlign: 'top' }}>{r.line}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13, borderTop: `1px solid ${T.border}`, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{`${r.raw.firstName ?? ''} ${r.raw.lastName ?? ''}`.trim() || '(no name)'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13, borderTop: `1px solid ${T.border}`, color: T.red }}>
                              <ul style={{ margin: 0, paddingLeft: 16 }}>{r.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {missingRequired.length === 0 && invalid.length === 0 && valid.length > 0 && <div style={{ fontSize: 13, color: T.ok }}>Every row passed.</div>}
              </section>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
