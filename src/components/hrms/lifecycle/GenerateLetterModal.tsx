'use client';
// Generate flow: pick a template and an employee, check the live preview, issue it (recorded in the
// register), then print it or download it as text.

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Note, T, useIsCompact } from '../ui';
import { Field, Input, Select, Textarea } from '../../ui';
import { CheckRow, Dialog, isIsoDate } from './common';
import { LetterActions, LetterPaper, formatAddress } from './LetterPaper';
import { analyse, issueBlockers, letterTypeLabel, mergeValues, signatoryFor, type Segment } from './letters';
import { issueLetterNow } from '../../../lib/hrms/lifecycleActions';
import { TODAY } from '../overview/insights';
import { fullName } from '../../../lib/hrms/format';
import type { HrmsDb, IssuedLetter } from '../../../lib/hrms/types';

/** The issued letter on paper with print and download. Also used by the register's View button. */
export function IssuedLetterView({ db, letter }: { db: HrmsDb; letter: IssuedLetter }) {
  const emp = db.employees.find((e) => e.id === letter.employeeId);
  const entity = db.entities.find((e) => e.id === emp?.entityId);
  const segments: Segment[] = [{ kind: 'text', text: letter.body }];
  const doc = { company: entity?.name ?? '', address: formatAddress(entity?.address), issuedOn: letter.issuedOn, body: letter.body, title: `${letterTypeLabel(letter.type)} letter` };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <LetterPaper company={doc.company} address={doc.address} date={letter.issuedOn} segments={segments} />
      <LetterActions doc={doc} fileName={`${letter.type}-letter-${emp?.code ?? letter.id}.txt`} />
    </div>
  );
}

export default function GenerateLetterModal({ db, initialTemplateId, onClose }: { db: HrmsDb; initialTemplateId?: string; onClose: () => void }) {
  const narrow = useIsCompact(900);
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const templates = useMemo(() => [...db.letterTemplates].sort((a, b) => a.name.localeCompare(b.name)), [db.letterTemplates]);
  const people = useMemo(() => [...db.employees].sort((a, b) => fullName(a).localeCompare(fullName(b))), [db.employees]);

  const [templateId, setTemplateId] = useState(initialTemplateId ?? templates[0]?.id ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [effective, setEffective] = useState<string>(TODAY);
  const [signatoryDraft, setSignatoryDraft] = useState<string | null>(null);   // null = use the entity's signatory
  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);              // null = the template's own wording
  const [issued, setIssued] = useState<IssuedLetter | null>(null);

  const tpl = templates.find((t) => t.id === templateId);
  const emp = people.find((e) => e.id === employeeId);
  const entity = emp ? db.entities.find((e) => e.id === emp.entityId) : undefined;
  const effectiveOk = isIsoDate(effective);
  const signatory = signatoryDraft ?? (emp ? signatoryFor(db, emp) : '');
  const merged = emp ? mergeValues(db, emp, { effectiveDate: effectiveOk ? effective : '', signatory }) : null;
  const body = bodyDraft ?? tpl?.body ?? '';
  const analysis = merged && tpl ? analyse(body, merged.values) : null;
  const blockers = analysis ? issueBlockers(analysis) : [];
  const derived = merged && analysis ? analysis.usedKeys.filter((k) => merged.derived.includes(k)) : [];
  const canIssue = !!tpl && !!emp && !!analysis && blockers.length === 0 && effectiveOk;

  function issue() {
    if (!canIssue || !tpl || !emp || !analysis) return;
    const letter = issueLetterNow({ employeeId: emp.id, templateId: tpl.id, type: tpl.type, body: analysis.text });
    setIssued(letter);
    toast.success(`${tpl.name} issued to ${fullName(emp)}.`);
  }

  // ───── after issuing ─────
  if (issued) {
    return (
      <Dialog title="Letter issued" width={760} onClose={onClose} footer={<Button variant="primary" onClick={onClose} style={{ height: 44 }}>Done</Button>}>
        <Note tone="ok">Recorded in the issued-letters register as unsigned. Mark it signed there once the signed copy is back.</Note>
        <IssuedLetterView db={db} letter={issued} />
      </Dialog>
    );
  }

  return (
    <Dialog title="Generate letter" width={1040} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} style={{ height: 44 }}>Cancel</Button>
          <Button variant="primary" onClick={issue} disabled={!canIssue} style={{ height: 44 }}>Issue letter</Button>
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 5fr) minmax(0, 6fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Field label="Template" required htmlFor={id('tpl')}>
            <Select id={id('tpl')} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setBodyDraft(null); setEditing(false); }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({letterTypeLabel(t.type)})</option>)}
            </Select>
          </Field>
          <Field label="Employee" required htmlFor={id('emp')} hint={!emp ? 'Choose who the letter is for.' : undefined}>
            <Select id={id('emp')} value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setSignatoryDraft(null); }}>
              <option value="">Select an employee</option>
              {people.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code}){e.status !== 'active' ? `, ${e.status.replace('_', ' ')}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Effective date" htmlFor={id('eff')} error={effectiveOk ? undefined : 'Enter a valid date'} hint="Used for {{effective_date}}, for example an increment or warning date.">
            <Input id={id('eff')} type="date" value={effective} invalid={!effectiveOk} onChange={(e) => setEffective(e.target.value)} />
          </Field>
          <Field label="Signatory" htmlFor={id('sig')} hint={emp ? 'Taken from the legal entity. You can change it for this letter.' : undefined}>
            <Input id={id('sig')} value={signatory} onChange={(e) => setSignatoryDraft(e.target.value)} placeholder="Name, designation" />
          </Field>

          <div>
            <CheckRow checked={editing} onChange={(v) => { setEditing(v); if (v && bodyDraft == null) setBodyDraft(tpl?.body ?? ''); if (!v) setBodyDraft(null); }}>Edit the wording for this letter only</CheckRow>
            {editing && (
              <Field label="Wording for this letter" htmlFor={id('body')} hint="The template is not changed. Merge fields still fill in.">
                <Textarea id={id('body')} rows={10} value={bodyDraft ?? ''} onChange={(e) => setBodyDraft(e.target.value)} style={{ fontFamily: T.mono, fontSize: 13 }} />
              </Field>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {!emp || !analysis ? (
            <div style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, padding: 32, textAlign: 'center', color: T.dim, fontSize: 13.5 }}>
              Choose an employee to fill in and preview the letter.
            </div>
          ) : (
            <>
              <LetterPaper company={entity?.name ?? ''} address={formatAddress(entity?.address)} date={TODAY} segments={analysis.segments} />
              {blockers.length > 0 && (
                <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {blockers.map((b) => <Note key={b} tone="warn">{b}</Note>)}
                  {analysis.missing.length > 0 && <Link href={`/dashboard/hrms/employees/${emp.id}`} style={{ color: T.info, fontWeight: 600, fontSize: 13 }}>Open {fullName(emp)}&rsquo;s profile to add the missing data</Link>}
                </div>
              )}
              {derived.length > 0 && <div style={{ fontSize: 12.5, color: T.dim }}><Badge tone="info">Derived</Badge> The confirmation date is worked out from the join date plus {emp.probationMonths} months of probation because none is recorded.</div>}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
