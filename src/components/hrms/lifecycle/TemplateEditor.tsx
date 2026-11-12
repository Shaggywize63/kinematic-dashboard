'use client';
// Template editor: name, type, body with {{merge fields}}, a palette that inserts fields at the cursor, and a
// live preview with a chosen employee substituted in.

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Note, T, useIsCompact } from '../ui';
import { Field, Input, Select, Textarea } from '../../ui';
import { Dialog } from './common';
import { LetterPaper, formatAddress } from './LetterPaper';
import { DEFAULT_TEMPLATES, LETTER_TYPES, MERGE_FIELDS, analyse, mergeValues } from './letters';
import { upsert } from '../../../lib/hrms/actions';
import { newId } from '../../../lib/hrms/db';
import { whenSynced } from '../../../lib/hrms/live/store';
import { TODAY } from '../overview/insights';
import { fullName } from '../../../lib/hrms/format';
import type { HrmsDb, LetterTemplate, LetterType } from '../../../lib/hrms/types';

export default function TemplateEditor({ db, template, onClose }: { db: HrmsDb; template: LetterTemplate | null; onClose: () => void }) {
  const narrow = useIsCompact(900);
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const [name, setName] = useState(template?.name ?? '');
  const [type, setType] = useState<LetterType>(template?.type ?? 'offer');
  const [body, setBody] = useState(template?.body ?? DEFAULT_TEMPLATES.offer.body);
  const [errors, setErrors] = useState<{ name?: string; body?: string }>({});

  const people = useMemo(() => [...db.employees].sort((a, b) => fullName(a).localeCompare(fullName(b))), [db.employees]);
  const [previewId, setPreviewId] = useState(() => (people.find((e) => e.status === 'active') ?? people[0])?.id ?? '');
  const emp = people.find((e) => e.id === previewId);
  const merged = emp ? mergeValues(db, emp, { effectiveDate: TODAY }) : null;
  const analysis = useMemo(() => (merged ? analyse(body, merged.values) : null), [body, merged]);
  const entity = emp ? db.entities.find((e) => e.id === emp.entityId) : undefined;

  // Insert at the cursor, then put the cursor after the inserted field.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<number | null>(null);
  function insert(key: string) {
    const ta = taRef.current;
    const token = `{{${key}}}`;
    const start = ta?.selectionStart ?? body.length;
    const end = ta?.selectionEnd ?? start;
    cursor.current = start + token.length;
    setBody(body.slice(0, start) + token + body.slice(end));
  }
  useLayoutEffect(() => {
    if (cursor.current != null && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(cursor.current, cursor.current);
      cursor.current = null;
    }
  }, [body]);

  const unknown = analysis?.unknown ?? [];
  function save() {
    const e: { name?: string; body?: string } = {};
    if (name.trim().length < 2) e.name = 'Give the template a name';
    else if (name.trim().length > 80) e.name = 'Keep the name under 80 characters';
    if (body.trim().length < 20) e.body = 'The letter body is too short';
    else if (unknown.length) e.body = `Unknown merge field${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Use the palette to insert valid fields.`;
    setErrors(e);
    if (e.name || e.body) { document.getElementById(id(e.name ? 'name' : 'body'))?.focus(); return; }
    upsert('letterTemplates', { id: template?.id ?? newId('lt'), type, name: name.trim(), body });
    whenSynced((ok) => { if (ok) toast.success(`Template "${name.trim()}" saved.`); });
    onClose();
  }

  return (
    <Dialog title={template ? `Edit template: ${template.name}` : 'New template'} width={1040} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} style={{ height: 44 }}>Cancel</Button>
          <Button variant="primary" onClick={save} style={{ height: 44 }}>Save template</Button>
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 12 }}>
            <Field label="Template name" required htmlFor={id('name')} error={errors.name}>
              <Input id={id('name')} value={name} invalid={!!errors.name} aria-invalid={!!errors.name || undefined} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Letter type" required htmlFor={id('type')}>
              <Select id={id('type')} value={type} onChange={(e) => setType(e.target.value as LetterType)}>
                {LETTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Letter body" required htmlFor={id('body')} error={errors.body} hint="Merge fields look like {{employee_name}}. Text in [CAPITAL BRACKETS] must be replaced by hand before a letter is issued.">
            <Textarea ref={taRef} id={id('body')} value={body} invalid={!!errors.body} aria-invalid={!!errors.body || undefined} rows={14}
              style={{ fontFamily: T.mono, fontSize: 13, minHeight: 260 }} onChange={(e) => setBody(e.target.value)} />
          </Field>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6 }} id={id('palette')}>Insert a merge field at the cursor</div>
            <div role="group" aria-labelledby={id('palette')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MERGE_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => insert(f.key)} title={`{{${f.key}}}`} aria-label={`Insert ${f.label}`}
                  style={{ height: 34, padding: '0 10px', borderRadius: T.radius.pill, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Button size="sm" style={{ height: 36 }} onClick={() => { setBody(DEFAULT_TEMPLATES[type].body); toast.message('Default wording restored in the editor. Save to keep it.'); }}>
              Restore default wording for this type
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <Field label="Preview with employee" htmlFor={id('preview')}>
            <Select id={id('preview')} value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              {people.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
            </Select>
          </Field>
          {analysis && analysis.missing.length > 0 && (
            <Note tone="warn">The chosen employee has no data for: {analysis.missing.map((k) => MERGE_FIELDS.find((f) => f.key === k)?.label).join(', ')}. They are highlighted in the preview.</Note>
          )}
          {unknown.length > 0 && <Note tone="red">Unknown merge field: {unknown.map((k) => `{{${k}}}`).join(', ')}</Note>}
          {analysis ? (
            <LetterPaper company={entity?.name ?? ''} address={formatAddress(entity?.address)} date={TODAY} segments={analysis.segments} />
          ) : <div style={{ color: T.dim, fontSize: 13 }}>Add an employee to see a preview.</div>}
        </div>
      </div>
    </Dialog>
  );
}
