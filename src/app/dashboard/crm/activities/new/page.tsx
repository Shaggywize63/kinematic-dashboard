'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities, crmLeads, crmContacts, crmDeals, crmAccounts } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { getStoredUser } from '../../../../../lib/auth';
import type { Lead } from '../../../../../types/crm';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';
import ActivityTypePicker from '../../../../../components/crm/shared/ActivityTypePicker';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';

// Built-ins are kept for the initial render before the API responds. The
// real list (including any client-specific custom types) loads from
// /api/v1/crm/activity-types on mount.
const BUILTIN_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'task', label: 'Task' },
  { value: 'note', label: 'Note' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

interface ActivityType { id: string; slug: string; name: string; icon?: string | null }

const ENTITY_TYPES = [
  { value: '', label: '— None —' },
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'Contact' },
  { value: 'deal', label: 'Deal' },
  { value: 'account', label: 'Account' },
];

type EntityOption = { id: string; label: string };

// Next.js 14 bails out of static rendering for any page that calls
// useSearchParams() unless the call site is wrapped in <Suspense>.
export default function NewActivityPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>}>
      <NewActivityPageInner />
    </Suspense>
  );
}

function NewActivityPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URL prefill — set by tap-to-call buttons (and could be set by any future
  // entry point that wants to pre-bind the new activity to a parent record).
  // Meeting first by default — matches the activity-subject catalogue
  // seeding (Meeting at position=0) and the user requirement that
  // "Meeting should be the first option". Old default was 'call'.
  const prefillType = searchParams.get('type') || 'meeting';
  const prefillSubject = searchParams.get('subject') || '';
  const prefillLeadId = searchParams.get('lead_id') || '';
  const prefillContactId = searchParams.get('contact_id') || '';
  const prefillDealId = searchParams.get('deal_id') || '';
  const prefillAccountId = searchParams.get('account_id') || '';
  const initialEntityType =
    prefillLeadId ? 'lead' :
    prefillContactId ? 'contact' :
    prefillDealId ? 'deal' :
    prefillAccountId ? 'account' : '';
  const initialEntityId =
    prefillLeadId || prefillContactId || prefillDealId || prefillAccountId || '';

  const [type, setType] = useState<string>(prefillType);
  const [activityTypes, setActivityTypes] = useState<Array<{ value: string; label: string; icon?: string | null }>>(BUILTIN_TYPES);
  const [subject, setSubject] = useState(prefillSubject);
  // Admin-curated subject presets from /api/v1/crm/activity-subjects.
  // The picker lets reps pick a stock subject quickly (Meeting first by
  // position=0). Free-text fallback stays so reps can still type a custom
  // subject if nothing in the list matches.
  const [subjectOptions, setSubjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  // Visit composer state. The rep can do BOTH on one screen / one
  // save:
  //   - `markFirstVisit` → log a completed "First Site Visit"
  //                         activity for today. Auto-checked when the
  //                         rep arrives here straight from a lead
  //                         create (prefillLeadId is set in the URL).
  //                         For manual entry it starts unchecked so
  //                         the rep deliberately opts in.
  //   - `dueAt`          → if filled, also create a scheduled "Site
  //                         visit" activity for that future date.
  //                         Independent of the checkbox above — the
  //                         rep can mark today AND schedule next, or
  //                         do just one.
  // Saves create one or two activities depending on which boxes were
  // ticked; at least one must be active or we surface a friendly
  // toast. Falls back to the legacy single-activity behaviour for
  // call/email/note/task — only meeting wires the visit composer.
  const cameFromLead = !!prefillLeadId;
  const [markFirstVisit, setMarkFirstVisit] = useState<boolean>(cameFromLead);
  // Default the assignee to the signed-in user so the most common case
  // ("log something I just did") needs zero extra clicks.
  const [assignedTo, setAssignedTo] = useState<string>(() => {
    const u = getStoredUser() as { id?: string } | null;
    return u?.id || '';
  });
  // Admin-defined custom fields scoped to entity_type='activity'.
  // CustomFieldsSection reads /api/v1/crm/custom-fields?entity=activity
  // on mount; we just hold the form's values blob and post it as
  // custom_fields on save (same shape as lead / deal forms).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [entityType, setEntityType] = useState(initialEntityType);
  const [entityId, setEntityId] = useState(initialEntityId);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  // Upload via /api/v1/upload/photo. Backend's `uploadSingle` multer
  // middleware expects the file under the field name `photo` (NOT `file` —
  // that's the document-upload field on /upload/material). Was failing
  // silently before because the wrong field name → multer rejects with
  // "no file provided".
  const uploadImage = async (f: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/photo`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      setImageUrl(url);
      toast.success('Image uploaded');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current)  cameraRef.current.value  = '';
    }
  };

  // Entity search state
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [entitySearch, setEntitySearch] = useState('');
  const [entityLabel, setEntityLabel] = useState('');
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const entityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const self = getStoredUser() as { id?: string; name?: string; email?: string } | null;
    (api.getUsers({ limit: '500' }) as Promise<any>)
      .then((u) => {
        const list: UserOption[] = (u.data || u || []).map((x: any) => ({
          id: x.id, name: x.name || x.full_name || x.email || 'User',
        }));
        // Make sure the signed-in user shows up in the picker (otherwise
        // the default-to-self value points to a non-option and the field
        // looks blank). Client-level users won't appear in /users for org
        // admins, so we always inject them.
        if (self?.id && !list.some((p) => p.id === self.id)) {
          list.unshift({ id: self.id, name: `${self.name || self.email || 'You'} (you)` });
        }
        setUsers(list);
      })
      .catch(() => {
        // Even if the /users call fails (client-level users without users
        // module access), let them still pick themselves.
        if (self?.id) setUsers([{ id: self.id, name: `${self.name || self.email || 'You'} (you)` }]);
      });
    // Pull the full activity-type catalog (built-ins + custom rows). Backend
    // already merges them and de-duplicates by slug.
    api.get<{ success?: boolean; data?: ActivityType[] } | ActivityType[]>('/api/v1/crm/activity-types')
      .then((r) => {
        const rows = (Array.isArray(r) ? r : (r.data ?? [])) as ActivityType[];
        if (rows.length) {
          setActivityTypes(rows.map((row) => ({ value: row.slug, label: row.name, icon: row.icon })));
        }
      })
      .catch(() => {});
    // Subject presets — admin-curated dropdown options. Backend
    // returns them ordered by position so Meeting (position=0) lands
    // first. Falls back to an empty list silently so the free-text
    // input still works if the endpoint is unreachable.
    api.get<{ success?: boolean; data?: Array<{ id: string; name: string; is_active?: boolean | null }> }>(
      '/api/v1/crm/activity-subjects',
    ).then((r) => {
      const rows = (r?.data ?? []) as Array<{ id: string; name: string; is_active?: boolean | null }>;
      setSubjectOptions(rows.filter((row) => row.is_active !== false).map((row) => ({ id: row.id, name: row.name })));
    }).catch(() => setSubjectOptions([]));
  }, []);

  // Skip the entity-reset effect on the very first render if we arrived
  // with a prefilled parent (tap-to-call). The reset is meant for *user*
  // entity-type changes after mount; running it on mount would wipe the
  // initialEntityId that we carefully derived from the URL.
  const isFirstEntityRender = useRef(true);
  useEffect(() => {
    if (isFirstEntityRender.current) {
      isFirstEntityRender.current = false;
      if (entityType) {
        // Still fetch options so the picker is populated; just don't wipe selection.
        fetchEntityOptions('');
        // Stamp a placeholder label so the user can see the binding before
        // the fetch resolves. Will be overwritten by hydrateEntityLabel below.
        if (entityId && !entityLabel) setEntitySearch('(loading…)');
      }
      return;
    }
    setEntityId('');
    setEntityLabel('');
    setEntitySearch('');
    setEntityOptions([]);
    if (!entityType) return;
    fetchEntityOptions('');
  }, [entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  // When prefilled with a specific entityId, fetch that one record so the
  // entity search input shows a real name instead of "(loading…)".
  useEffect(() => {
    if (!initialEntityId || !initialEntityType) return;
    let cancelled = false;
    (async () => {
      try {
        let label = '';
        if (initialEntityType === 'lead') {
          const r = await crmLeads.get(initialEntityId);
          const x = r.data as any;
          if (x) label = [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Lead';
        } else if (initialEntityType === 'contact') {
          const r = await crmContacts.get(initialEntityId);
          const x = r.data as any;
          if (x) label = x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Contact';
        } else if (initialEntityType === 'deal') {
          const r = await crmDeals.get(initialEntityId);
          const x = r.data as any;
          if (x) label = x.title || x.name || 'Deal';
        } else if (initialEntityType === 'account') {
          const r = await crmAccounts.get(initialEntityId);
          const x = r.data as any;
          if (x) label = x.name || 'Account';
        }
        if (!cancelled && label) {
          setEntityLabel(label);
          setEntitySearch(label);
        }
      } catch {
        // Silent — the picker will fall back to the placeholder.
      }
    })();
    return () => { cancelled = true; };
  }, [initialEntityId, initialEntityType]);

  const fetchEntityOptions = async (q: string) => {
    if (!entityType) return;
    setLoadingEntities(true);
    try {
      let data: any[] = [];
      if (entityType === 'lead') {
        const r = await crmLeads.list(q ? { q } : undefined);
        data = (r.data || []).map((x: Lead) => {
          const name = [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Lead';
          // Show the contact number alongside the name so the FE can pick the
          // right lead while logging an activity.
          return { id: x.id, label: x.phone ? `${name} · ${x.phone}` : name };
        });
      } else if (entityType === 'contact') {
        const r = await crmContacts.list(q ? { q } : undefined);
        data = (r.data || []).map((x: any) => ({
          id: x.id,
          label: x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Contact',
        }));
      } else if (entityType === 'deal') {
        const r = await crmDeals.list(q ? { q } : undefined);
        data = (r.data || []).map((x: any) => ({ id: x.id, label: x.title || x.name || 'Deal' }));
      } else if (entityType === 'account') {
        const r = await crmAccounts.list(q ? { q } : undefined);
        data = (r.data || []).map((x: any) => ({ id: x.id, label: x.name || 'Account' }));
      }
      setEntityOptions(data);
    } catch {
      setEntityOptions([]);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleEntitySearchChange = (v: string) => {
    setEntitySearch(v);
    setEntityLabel('');
    setEntityId('');
    setShowEntityDropdown(true);
    fetchEntityOptions(v);
  };

  const selectEntity = (opt: EntityOption) => {
    setEntityId(opt.id);
    setEntityLabel(opt.label);
    setEntitySearch(opt.label);
    setShowEntityDropdown(false);
  };

  const filteredEntities = entitySearch
    ? entityOptions.filter((o) => o.label.toLowerCase().includes(entitySearch.toLowerCase()))
    : entityOptions;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return toast.error('Subject is required');

    // Meeting path: the visit composer can create up to TWO activities
    // in one save — a completed "first visit today" + a scheduled
    // "next visit". At least one must be active or the save is a
    // no-op; surface a friendly toast instead of POSTing nothing.
    if (type === 'meeting' && !markFirstVisit && !dueAt) {
      return toast.error('Pick "Mark visit · today", schedule a next visit, or both.');
    }

    setBusy(true);
    const nowIso = new Date().toISOString();
    const baseSubject = subject.trim();
    // Subject decoration. When the rep marks the first visit AND
    // schedules a next visit on the same save, we adjust the two
    // subjects so the timeline reads cleanly:
    //   first  → "First Site Visit — <name>" (already set by the
    //             redirect URL when arriving from a lead, but
    //             defaulted to the typed subject otherwise)
    //   next   → "Next Site Visit — <name>" (replaces the leading
    //             "First " / "First Site Visit" so the scheduled
    //             entry doesn't read like a duplicate)
    const nextSubject = baseSubject
      .replace(/^First Site Visit/i, 'Site visit')
      .replace(/^First /, '');

    const linkedFields: Record<string, unknown> = {};
    if (entityType && entityId) linkedFields[`${entityType}_id`] = entityId;

    const sharedCustomFields = { ...customFields };

    const buildPayload = (params: {
      subject: string;
      status: 'completed' | 'planned';
      dueAt?: string;
      completedAt?: string;
      visitKind: 'completed' | 'scheduled';
      isFirstVisit: boolean;
    }): Record<string, unknown> => ({
      type,
      subject: params.subject,
      body: body.trim() || undefined,
      due_at: params.dueAt,
      completed_at: params.completedAt,
      status: params.status,
      assigned_to: assignedTo || undefined,
      image_url: imageUrl || undefined,
      custom_fields: {
        ...sharedCustomFields,
        // visit_kind drives the new "Visit kind" CSV column + the
        // report-builder filter; is_first_visit lets reports
        // segment first vs. follow-up visits across the book.
        visit_kind: params.visitKind,
        ...(params.isFirstVisit ? { is_first_visit: true } : {}),
      },
      ...linkedFields,
    });

    try {
      const requests: Array<Promise<unknown>> = [];

      if (type === 'meeting') {
        if (markFirstVisit) {
          requests.push(crmActivities.create(buildPayload({
            subject: baseSubject,
            status: 'completed',
            completedAt: nowIso,
            visitKind: 'completed',
            isFirstVisit: cameFromLead,
          }) as any));
        }
        if (dueAt) {
          requests.push(crmActivities.create(buildPayload({
            subject: nextSubject,
            status: 'planned',
            dueAt: new Date(dueAt).toISOString(),
            visitKind: 'scheduled',
            isFirstVisit: false,
          }) as any));
        }
      } else {
        // Legacy single-activity path for call/email/note/task.
        const noSchedule = !dueAt;
        const cf: Record<string, unknown> = { ...customFields };
        requests.push(crmActivities.create({
          type,
          subject: baseSubject,
          body: body.trim() || undefined,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
          completed_at: noSchedule && type !== 'task' ? nowIso : undefined,
          status: noSchedule && type !== 'task' ? 'completed' : 'planned',
          assigned_to: assignedTo || undefined,
          image_url: imageUrl || undefined,
          custom_fields: Object.keys(cf).length > 0 ? cf : undefined,
          ...linkedFields,
        } as any));
      }

      await Promise.all(requests);
      toast.success(
        requests.length === 2
          ? 'First visit logged + next visit scheduled'
          : 'Activity logged successfully',
      );
      router.push('/dashboard/crm/activities');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save activity');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 680 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>Log Activity</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        Record a call, meeting, task, note, or message. Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      <Section title="Activity Details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Type *">
            {/* Custom dropdown — needed because the WhatsApp row uses an
                SVG brand mark, which can't live inside a native <option>.
                Other rows render their backend emoji as before. */}
            <ActivityTypePicker
              value={type}
              options={activityTypes}
              onChange={setType}
            />
          </Field>
          <Field label="Subject *">
            {/* Subject picker — admin-curated presets from
                /api/v1/crm/activity-subjects (Meeting first by
                position). The dropdown is the only subject control;
                reps pick a preset. Falls back to a free-text input
                only when the tenant has no presets configured. */}
            {subjectOptions.length > 0 ? (
              <select
                value={subjectOptions.some((o) => o.name === subject) ? subject : ''}
                onChange={(e) => setSubject(e.target.value)}
                required
                style={input}
              >
                <option value="">— pick a subject preset —</option>
                {subjectOptions.map((o) => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            ) : (
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="e.g. Discovery call with Acme" style={input} />
            )}
          </Field>
        </div>
        <Field label="Notes / Description" style={{ marginTop: 12 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What was discussed, outcome, follow-up points…" style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
        {/* Admin-defined custom fields for activities. Renders nothing
            when the tenant hasn't configured any defs for
            entity_type='activity', so the form stays unchanged for
            tenants that don't use this. */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <CustomFieldsSection
            entity="activity"
            values={customFields}
            onChange={(cf) => setCustomFields(cf)}
          />
        </div>
        <Field label="Photo (optional)" style={{ marginTop: 12 }}>
          {imageUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Activity photo" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>Photo attached.</div>
              <button type="button" onClick={() => setImageUrl('')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Remove</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Two hidden inputs — the camera one carries `capture` so mobile
                  browsers open the camera directly; the other opens the file
                  picker (which on iOS/Android still offers Camera + Gallery via
                  the native sheet). On desktop both fall through to the file
                  dialog because `capture` is ignored when no camera is wired. */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading}
                style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >📷 Take Photo</button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={uploading}
                style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >📎 Upload from Device</button>
              {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
            </div>
          )}
        </Field>
        {/* Visit composer — meeting-only. Single screen, single Save,
            but the rep can do BOTH actions: mark today's visit as
            done AND schedule the next one. Coming from a lead save
            auto-checks "Mark first visit"; manual entry leaves both
            empty so the rep deliberately picks. */}
        {type === 'meeting' && (
          <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>Visit</div>

            {/* Row 1: mark first visit (today). One tap = done. */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={markFirstVisit}
                onChange={(e) => setMarkFirstVisit(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Mark {cameFromLead ? 'first ' : ''}visit · today
                </span>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  Logs a completed visit on this lead's timeline right now.
                  {cameFromLead && ' Pre-checked because you arrived from the lead — uncheck if this is only a forward-scheduled visit.'}
                </div>
              </span>
            </label>

            {/* Row 2: schedule next visit (optional). Independent. */}
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Schedule next visit</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, marginBottom: 8 }}>
                Optional — pick a date and time, or leave blank to skip.
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={input} />
                {dueAt && (
                  <button type="button" onClick={() => setDueAt('')} title="Clear scheduled date" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>Clear</button>
                )}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
          {/* The legacy date picker stays for call/email/note/task —
              the new visit composer only owns meetings. */}
          {type !== 'meeting' && (
            <Field label={`${type === 'task' ? 'Due Date & Time' : 'Scheduled At'} (optional)`}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={input} />
                {dueAt && (
                  <button type="button" onClick={() => setDueAt('')} title="Clear schedule — log it for right now" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>Now</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Leave blank to log it as happening right now.</div>
            </Field>
          )}
          <Field label="Assign To">
            <UserSearchSelect
              options={users}
              value={assignedTo}
              onChange={setAssignedTo}
              placeholder="Search team member…"
              emptyLabel="Unassigned"
            />
          </Field>
        </div>
      </Section>

      <Section title="Link to Entity (optional)">
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Optionally attach this activity to a lead, deal, contact, or account.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <Field label="Entity Type">
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={input}>
              {ENTITY_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Field>
          {entityType && (
            <Field label={`Search ${entityType[0].toUpperCase() + entityType.slice(1)}`}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={entityInputRef}
                  value={entitySearch}
                  onChange={(e) => handleEntitySearchChange(e.target.value)}
                  onFocus={() => { setShowEntityDropdown(true); if (!entityOptions.length) fetchEntityOptions(''); }}
                  onBlur={() => setTimeout(() => setShowEntityDropdown(false), 150)}
                  placeholder={`Type to search ${entityType}s…`}
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                  autoComplete="off"
                />
                {entityId && (
                  <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>✓</div>
                )}
                {showEntityDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 50, marginTop: 2 }}>
                    {loadingEntities ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>
                    ) : filteredEntities.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No results</div>
                    ) : filteredEntities.slice(0, 20).map((opt) => (
                      <div
                        key={opt.id}
                        onMouseDown={() => selectEntity(opt)}
                        style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', background: opt.id === entityId ? 'var(--s2)' : 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = opt.id === entityId ? 'var(--s2)' : 'transparent')}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          )}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving…' : 'Log Activity'}</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
