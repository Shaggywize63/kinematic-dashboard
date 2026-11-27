'use client';
// "Raise a ticket" form. Lengths are checked here first (the server enforces the same limits) and a server error is
// shown inline above the buttons.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { ImagePlus, LifeBuoy, X } from 'lucide-react';
import Modal from '../crm/shared/Modal';
import { Button, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../ui';
import {
  AREA_LABEL, AREAS, ATTACH_ACCEPT, ATTACH_MAX, ATTACH_MAX_BYTES, ATTACH_TYPES,
  CATEGORIES, CATEGORY_LABEL, DESCRIPTION_MAX, DESCRIPTION_MIN, PLATFORM_LABEL, PLATFORMS,
  PRIORITIES, PRIORITY_LABEL, SUBJECT_MAX, SUBJECT_MIN, fileSize,
  supportApi, supportError, type SupportAttachment, type Ticket, type TicketArea, type TicketCategory,
  type TicketPlatform, type TicketPriority,
} from '../../lib/supportApi';

/** The categories that are about the product itself, so the form asks where they hit it. */
const ASKS_PLATFORM: readonly TicketCategory[] = ['issue', 'bug', 'change_request', 'new_module', 'data_correction'];

export default function RaiseTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Ticket) => void }) {
  const narrow = useIsCompact(640);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('issue');
  const [platforms, setPlatforms] = useState<TicketPlatform[]>(['web']);
  const [area, setArea] = useState<TicketArea | ''>('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  // Screenshots. Held as files until submit, so nothing is uploaded for a ticket that is never raised.
  const [shots, setShots] = useState<File[]>([]);
  const [shotError, setShotError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Object URLs for the thumbnails, revoked whenever the list changes so nothing leaks.
  useEffect(() => {
    const urls = shots.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [shots]);

  /**
   * Add files from the picker, a drop or a paste. A screenshot pasted from the clipboard has no file name,
   * so messages fall back to "that image". The server enforces all of this again.
   */
  const addFiles = (incoming: FileList | File[] | null | undefined) => {
    const picked = incoming ? Array.from(incoming) : [];
    if (!picked.length) return;
    const next = [...shots];
    let problem = '';
    for (const f of picked) {
      const label = f.name || 'that image';
      if (next.length >= ATTACH_MAX) { problem = `You can attach up to ${ATTACH_MAX} images.`; break; }
      if (!ATTACH_TYPES.includes(f.type)) { problem = `${label} is not a PNG, JPEG, WEBP or HEIC image.`; continue; }
      if (f.size > ATTACH_MAX_BYTES) { problem = `${label} is over ${Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB.`; continue; }
      next.push(f);
    }
    setShots(next);
    setShotError(problem);
  };

  const removeShot = (i: number) => {
    setShots((cur) => cur.filter((_, idx) => idx !== i));
    setShotError('');
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length) {
      // Only swallow the paste when it actually carried an image, so pasting text still works.
      if (Array.from(files).some((f) => f.type.startsWith('image/'))) e.preventDefault();
      addFiles(files);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer?.files);
  };

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
    if (subjectError || descriptionError || saving || uploading) return;
    setSaving(true);
    setServerError('');
    try {
      // Upload first: the ticket should carry its screenshots from the moment it exists, and an upload
      // failure must not leave a ticket that silently lost them.
      let attachments: SupportAttachment[] = [];
      if (shots.length) {
        setUploading(true);
        try {
          attachments = await supportApi.uploadAttachments(shots);
        } finally {
          setUploading(false);
        }
      }
      const t = await supportApi.create({
        subject: s, description: d, category, priority,
        platforms: asksPlatform ? platforms : [],
        area: area || null,
        attachments,
      });
      onCreated(t);
    } catch (err) {
      setServerError(supportError(err, 'Could not raise the ticket. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const asksPlatform = ASKS_PLATFORM.includes(category);
  const togglePlatform = (p: TicketPlatform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <Modal open onClose={onClose} title="Raise a ticket" icon={LifeBuoy} width={600}
      subtitle="Tell us what's wrong. We'll reply here, by email and on WhatsApp. Support is in beta — tickets are worked as normal."
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={null} onClick={() => submit()} disabled={saving}>
            {uploading ? 'Uploading…' : saving ? 'Raising…' : 'Raise ticket'}
          </Button>
        </>
      )}>
      <form onSubmit={submit} onPaste={onPaste} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <Field label="Subject" required htmlFor="support-subject"
          error={touched && subjectError ? subjectError : undefined}
          hint={`${s.length}/${SUBJECT_MAX}`}>
          <Input id="support-subject" value={subject} maxLength={SUBJECT_MAX + 50} autoFocus
            placeholder="e.g. Attendance not syncing for Pune team"
            invalid={touched && !!subjectError} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <FormGrid narrow={narrow}>
          <Field label="What is this about?" required htmlFor="support-category">
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
        <FormGrid narrow={narrow}>
          <Field label="Which part of Kinematic?" htmlFor="support-area"
            hint="Helps us route it to the right person.">
            <Select id="support-area" value={area} onChange={(e) => setArea(e.target.value as TicketArea | '')}>
              <option value="">Not sure</option>
              {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </Select>
          </Field>
          {asksPlatform && (
            <Field label="Where did you see it?" hint="Pick every platform it happens on.">
              <div role="group" aria-label="Platforms" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
                {PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={on}
                      style={{
                        height: 32, padding: '0 12px', borderRadius: T.radius.pill, fontFamily: 'inherit',
                        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${on ? T.text : T.border}`,
                        background: on ? T.text : T.card, color: on ? T.card : T.dim,
                        transition: 'background .12s ease, color .12s ease',
                      }}>
                      {PLATFORM_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </FormGrid>
        <Field label="Description" required htmlFor="support-description"
          error={touched && descriptionError ? descriptionError : undefined}
          hint={`What happened, where, and what you expected. ${d.length}/${DESCRIPTION_MAX}`}>
          <Textarea id="support-description" value={description} rows={7}
            placeholder="Steps to reproduce, the user / outlet / date involved, and any error you saw."
            invalid={touched && !!descriptionError} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Screenshots" htmlFor="support-shots"
          error={shotError || undefined}
          hint={`A picture of the problem saves a lot of back and forth. Up to ${ATTACH_MAX} images, ${Math.round(ATTACH_MAX_BYTES / (1024 * 1024))} MB each — you can paste one straight from your clipboard.`}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: T.radius.md,
              border: `1px dashed ${dragging ? T.text : T.border}`,
              background: dragging ? 'var(--s3)' : 'transparent', transition: 'border-color .12s ease, background .12s ease',
            }}>
            {!!previews.length && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {shots.map((f, i) => (
                  <div key={`${f.name}-${i}`} style={{ position: 'relative', width: 84 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[i]} alt={f.name || 'Pasted screenshot'}
                      style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 6, border: `1px solid ${T.border}`, display: 'block' }} />
                    <button type="button" onClick={() => removeShot(i)} aria-label={`Remove ${f.name || 'screenshot'}`}
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                        border: `1px solid ${T.border}`, background: T.card, color: T.dim, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 0,
                      }}>
                      <X size={12} strokeWidth={2} aria-hidden />
                    </button>
                    <span style={{ display: 'block', fontSize: 10.5, color: T.mute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fileSize(f.size)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<ImagePlus size={14} strokeWidth={1.8} />} disabled={shots.length >= ATTACH_MAX}
                onClick={() => fileRef.current?.click()}>
                {shots.length ? 'Add another' : 'Add screenshot'}
              </Button>
              <span style={{ fontSize: 12, color: T.mute }}>
                {shots.length >= ATTACH_MAX
                  ? `That's the maximum of ${ATTACH_MAX}.`
                  : 'or drag one in, or paste from your clipboard'}
              </span>
            </div>
            <input ref={fileRef} id="support-shots" type="file" accept={ATTACH_ACCEPT} multiple
              onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
              style={{ display: 'none' }} />
          </div>
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
