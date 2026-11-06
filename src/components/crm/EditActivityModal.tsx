'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { crmActivities } from '../../lib/crmApi';
import type { Activity } from '../../types/crm';
import { isB2bClientActive } from '../../lib/b2bClient';
import { useRecordOwnerPicker } from '../../hooks/useRecordOwnerPicker';
import { useActivityTypes } from '../../lib/activityTypes';
import { activityOutcomeError, apiErrorText, arr, isActivityCompleted, outcomeForPatch, sparkActivityFields } from '../../lib/sparkAccounts';
import UserSearchSelect, { type UserOption } from './shared/UserSearchSelect';
import CustomFieldsSection from './CustomFieldsSection';
import ActivityPhotoField from './shared/ActivityPhotoField';
import { AssigneeChips, FormSerialInput, OutcomeField, ProductChips, useProductCatalogue } from './spark/SparkActivityFields';

/**
 * The edit-activity form (type, subject, notes, outcome, photo, due date, assignees, custom fields, Spark
 * assignees / products / serial) with Save and Delete. Shared by the Activities page and the account page's
 * activity list. `onSaved` fires after a successful save OR delete so the caller can refresh its list.
 */
export default function EditActivityModal({ activity, onClose, onSaved }: { activity: Activity; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState(activity.subject || '');
  const [description, setDescription] = useState(activity.description || activity.body || '');
  const [outcome, setOutcome] = useState(activity.outcome || '');
  const [dueAt, setDueAt] = useState(activity.due_at ? toLocalDateTime(activity.due_at) : '');
  const [type, setType] = useState<string>(activity.type);
  // Built-ins + custom types from GET /crm/activity-types; the row's own type is always offered so editing an
  // old / deactivated / unknown type never silently re-types it.
  const typeCatalogue = useActivityTypes();
  const editTypeOptions = typeCatalogue.active.map((t) => ({ slug: t.slug, name: t.name }));
  if (activity.type && !editTypeOptions.some((t) => t.slug === activity.type)) editTypeOptions.push({ slug: activity.type, name: typeCatalogue.labelFor(activity.type) });
  // Photo: the existing one is shown / replaceable / removable; an untouched photo is not re-sent.
  const [imageUrl, setImageUrl] = useState<string>(activity.image_url || '');
  // Admin-defined custom fields (entity=activity) — seeded from the row's
  // existing custom_fields; the backend PATCH merges server-side so sending
  // the whole edited map back is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => {
    const cf = (activity as Activity & { custom_fields?: Record<string, unknown> | null }).custom_fields;
    return (cf && typeof cf === 'object') ? { ...cf } : {};
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Spark & Ray only: assignees (first = primary), products and the form serial.
  const spark = isB2bClientActive();
  // Who may change the assignee after it was set: admins / managers (the same roles the backend lets
  // reassign owners). Everyone else sees the assignee but cannot change it. Spark loads its own people list.
  const ownerPicker = useRecordOwnerPicker(!spark);
  const currentAssignedTo = (activity as Activity & { assigned_to?: string | null }).assigned_to ?? '';
  const [assignedTo, setAssignedTo] = useState<string>(currentAssignedTo);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => {
    const ids = arr<{ id: string }>(activity.assignees).map((u) => u.id).filter(Boolean);
    const legacy = (activity as Activity & { assigned_to?: string | null }).assigned_to;
    return ids.length ? ids : legacy ? [legacy] : [];
  });
  const [productIds, setProductIds] = useState<string[]>(() =>
    arr<string>(activity.product_ids).length ? arr<string>(activity.product_ids) : arr<{ id: string }>(activity.products).map((p) => p.id));
  const [formSerial, setFormSerial] = useState(activity.form_ref_no || '');
  const [serialError, setSerialError] = useState<string | null>(null);
  // Spark: an already-completed activity must keep an Outcome; a scheduled one may leave it blank.
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const outcomeRequired = spark && isActivityCompleted(activity as Activity & { status?: string | null });
  const catalogue = useProductCatalogue(spark);
  const [userOptions, setUserOptions] = useState<UserOption[]>(() =>
    arr<{ id: string; name: string }>(activity.assignees).map((u) => ({ id: u.id, name: u.name })));
  useEffect(() => {
    if (!spark) return;
    let off = false;
    (api.getUsers({ limit: '500', scope: 'assignable' }) as Promise<any>)
      .then((u) => {
        if (off) return;
        const list: UserOption[] = (u.data || u || []).map((x: any) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' }));
        // Keep already-assigned people selectable (and named) even if the directory omits them.
        for (const known of arr<{ id: string; name: string }>(activity.assignees)) if (!list.some((p) => p.id === known.id)) list.push({ id: known.id, name: known.name });
        setUserOptions(list);
      })
      .catch(() => { /* keep the assignees we already know */ });
    return () => { off = true; };
  }, [spark, activity.assignees]);

  const submit = async () => {
    if (spark) {
      const oe = activityOutcomeError(outcome, outcomeRequired);
      if (oe) { setOutcomeError(oe); return; }
    }
    setSaving(true);
    setSerialError(null);
    try {
      const payload: Record<string, unknown> = {
        type,
        subject: subject.trim() || null,
        description: description.trim() || null,
        outcome: spark ? outcomeForPatch(outcome) : (outcome.trim() || null),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        custom_fields: customFields,
      };
      if (imageUrl !== (activity.image_url || '')) payload.image_url = imageUrl || null;
      if (spark) {
        const f = sparkActivityFields({ assigneeIds, productIds, formSerial }, 'patch');
        // An untouched serial is not re-sent (the row shows the resolved ref, which is what the box starts with).
        if (formSerial.trim() === (activity.form_ref_no || '')) delete f.form_serial;
        Object.assign(payload, f);
        if (assigneeIds[0]) payload.assigned_to = assigneeIds[0];
        // Not allowed to change assignees: leave them exactly as they are.
        if (!ownerPicker.canChange) { delete payload.assignee_ids; delete payload.assigned_to; }
      } else if (ownerPicker.canChange && assignedTo !== currentAssignedTo) {
        payload.assigned_to = assignedTo || null;
      }
      await crmActivities.update(activity.id, payload as any);
      toast.success('Activity updated');
      onSaved();
    } catch (e: any) {
      const msg = apiErrorText(e, 'Failed to update');
      if (spark && formSerial.trim() && /serial|form|ref/i.test(msg)) setSerialError(msg);
      else toast.error(msg);
    }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete this ${activity.type}? It will be soft-deleted on the backend and can be recovered by support, but won't appear in lists or analytics.`)) return;
    setDeleting(true);
    try {
      await crmActivities.remove(activity.id);
      toast.success('Activity deleted');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Edit activity</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} style={editInput}>
            {editTypeOptions.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} style={editInput} /></Field>
        <Field label="Description / notes">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...editInput, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
        {spark ? (
          <OutcomeField value={outcome} onChange={(v) => { setOutcome(v); setOutcomeError(null); }} required={outcomeRequired} error={outcomeError} />
        ) : (
          <Field label="Outcome (optional)"><input value={outcome} onChange={(e) => setOutcome(e.target.value)} style={editInput} /></Field>
        )}
        <ActivityPhotoField value={imageUrl} onChange={setImageUrl} label="Photo" />
        <Field label="Due / scheduled for"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={editInput} /></Field>
        {/* Admins / managers can reassign an activity after it was assigned (other tenants: one assignee). */}
        {!spark && ownerPicker.canChange && ownerPicker.users.length > 0 && (
          <Field label="Assigned to">
            <UserSearchSelect options={ownerPicker.users} value={assignedTo} onChange={setAssignedTo} placeholder="Search team member…" emptyLabel="Unassigned" />
          </Field>
        )}
        {spark && (
          <>
            <div role="group" aria-label="Assign to (multiple)">
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Assign to (multiple)</label>
              {ownerPicker.canChange ? (
                <AssigneeChips users={userOptions} value={assigneeIds} onChange={setAssigneeIds} />
              ) : (
                <div data-testid="assignee-readonly" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  {assigneeIds.length
                    ? assigneeIds.map((id, i) => `${userOptions.find((u) => u.id === id)?.name || 'User'}${i === 0 ? ' (primary)' : ''}`).join(', ')
                    : 'Unassigned'} · only an admin or manager can change who is assigned
                </div>
              )}
            </div>
            <div role="group" aria-label="Product interested">
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Product interested</label>
              <ProductChips products={catalogue} value={productIds} onChange={setProductIds} />
            </div>
            <div role="group" aria-label="Form serial">
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Form serial</label>
              <FormSerialInput value={formSerial} onChange={(v) => { setFormSerial(v); setSerialError(null); }} error={serialError} />
            </div>
          </>
        )}
        {/* Admin-defined activity custom fields. CustomFieldsSection yields
            raw <label> children (or nothing when no defs exist), so they
            stack with the modal's other fields via the parent flex gap. */}
        <CustomFieldsSection
          entity="activity"
          values={customFields}
          onChange={setCustomFields}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {/* Delete is destructive and sits on the opposite side from
              the primary Save action so a slip-of-the-thumb doesn't
              nuke the row. The double-confirm in remove() catches the
              rest. */}
          <button onClick={remove} disabled={deleting || saving} style={{
            padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'transparent', border: '1px solid rgba(224,30,44,0.4)',
            color: 'var(--primary)', cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}>
            {deleting ? 'Deleting…' : '🗑 Delete'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={deleting || saving} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={saving || deleting} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
const editInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 9, fontSize: 13,
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--s3)', color: 'var(--text)',
};

function toLocalDateTime(iso: string): string {
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" in *local* time;
  // ISO strings are UTC, so we offset before slicing.
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
