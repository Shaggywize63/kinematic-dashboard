'use client';
// "Raise a ticket" form. Lengths are checked here first (the server enforces the same limits) and a server error is
// shown inline above the buttons.

import { useState, type FormEvent } from 'react';
import { LifeBuoy } from 'lucide-react';
import Modal from '../crm/shared/Modal';
import { Button, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../ui';
import {
  CATEGORY_LABEL, DESCRIPTION_MAX, DESCRIPTION_MIN, PRIORITIES, PRIORITY_LABEL, SUBJECT_MAX, SUBJECT_MIN,
  supportApi, supportError, type Ticket, type TicketCategory, type TicketPriority,
} from '../../lib/supportApi';

const CATEGORIES = Object.keys(CATEGORY_LABEL) as TicketCategory[];

export default function RaiseTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Ticket) => void }) {
  const narrow = useIsCompact(640);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('how_to');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  const s = subject.trim();
  const d = description.trim();
  const subjectError = s.length < SUBJECT_MIN
    ? `Give the ticket a subject (at least ${SUBJECT_MIN} characters).`
    : s.length > SUBJECT_MAX ? `Keep the subject to ${SUBJECT_MAX} characters.` : '';
  const descriptionError = d.length < DESCRIPTION_MIN
    ? `Describe the problem (at least ${DESCRIPTION_MIN} characters).`
    : d.length > DESCRIPTION_MAX ? `Keep the description to ${DESCRIPTION_MAX} characters.` : '';

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (subjectError || descriptionError || saving) return;
    setSaving(true);
    setServerError('');
    try {
      const t = await supportApi.create({ subject: s, description: d, category, priority });
      onCreated(t);
    } catch (err) {
      setServerError(supportError(err, 'Could not raise the ticket. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Raise a ticket" icon={LifeBuoy} width={600}
      subtitle="Tell us what's wrong. We'll reply here and on WhatsApp."
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={null} onClick={() => submit()} disabled={saving}>{saving ? 'Raising…' : 'Raise ticket'}</Button>
        </>
      )}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <Field label="Subject" required htmlFor="support-subject"
          error={touched && subjectError ? subjectError : undefined}
          hint={`${s.length}/${SUBJECT_MAX}`}>
          <Input id="support-subject" value={subject} maxLength={SUBJECT_MAX + 50} autoFocus
            placeholder="e.g. Attendance not syncing for Pune team"
            invalid={touched && !!subjectError} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <FormGrid narrow={narrow}>
          <Field label="Category" htmlFor="support-category">
            <Select id="support-category" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="support-priority">
            <Select id="support-priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
          </Field>
        </FormGrid>
        <Field label="Description" required htmlFor="support-description"
          error={touched && descriptionError ? descriptionError : undefined}
          hint={`What happened, where, and what you expected. ${d.length}/${DESCRIPTION_MAX}`}>
          <Textarea id="support-description" value={description} rows={7}
            placeholder="Steps to reproduce, the user / outlet / date involved, and any error you saw."
            invalid={touched && !!descriptionError} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {serverError && (
          <div role="alert" style={{ padding: '9px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }}>
            {serverError}
          </div>
        )}
        {/* Enter in the subject submits the form */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
