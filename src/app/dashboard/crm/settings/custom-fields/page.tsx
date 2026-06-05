'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields, crmSettings } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { CustomField } from '../../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../../lib/auth';

const ENTITIES: Array<CustomField['entity_type']> = ['lead', 'contact', 'account', 'deal'];
// Full set of supported input types. Render-side hooks (form renderer
// in CustomFieldsSection) know what to do with each. Keep in lockstep
// with the backend zod enum in crm.validators.ts.
const TYPES: Array<CustomField['field_type']> = [
  'text', 'longtext',
  'number', 'currency',
  'boolean',
  'date', 'datetime',
  'select', 'multiselect', 'radio',
  'url', 'email', 'phone',
  'image', 'file',
];

// Human-readable labels for the picker. Drives the option text in the
// "Input Type" dropdown so admins see "Single-select dropdown" instead
// of "select".
const TYPE_LABELS: Record<CustomField['field_type'], string> = {
  text:        'Text (single line)',
  longtext:    'Long text (paragraph)',
  number:      'Number',
  currency:    'Currency (₹)',
  boolean:     'Checkbox (yes / no)',
  date:        'Date',
  datetime:    'Date & time',
  select:      'Dropdown (single)',
  multiselect: 'Multi-select chips',
  radio:       'Radio buttons',
  url:         'URL',
  email:       'Email',
  phone:       'Phone (10-digit)',
  image:       'Image upload',
  file:        'File upload',
};

const TYPES_REQUIRING_OPTIONS = new Set<CustomField['field_type']>(['select', 'multiselect', 'radio']);

// Built-in standard fields for each entity
type BuiltinField = { key: string; label: string; type: string; required?: boolean };

// Defaults below mirror the actual built-in form defaults — i.e. what
// the create / edit form asterisks before any admin override. Required
// values that depend on the B2B/B2C toggle (email is mandatory for
// B2B leads but not B2C; phone is the inverse) are shown as Universal
// "off" here — admins can pin them on for one scope only via the
// B2B / B2C tabs above the table.
const BUILTIN_FIELDS: Record<string, BuiltinField[]> = {
  lead: [
    { key: 'first_name', label: 'First Name', type: 'text', required: true },
    { key: 'last_name', label: 'Last Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'text' },
    // Phone is optional by default — the lead form mirrors this. To
    // make Primary Mobile mandatory on a specific scope (B2C only,
    // say), use the B2C scope tab above the table and toggle Required
    // on; the lead form will pick it up on the next page load.
    { key: 'phone', label: 'Primary Mobile', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'title', label: 'Job Title', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'status', label: 'Lead Status', type: 'select', required: true },
    { key: 'source_id', label: 'Lead Source', type: 'select' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'score', label: 'Lead Score', type: 'number' },
    { key: 'is_b2c', label: 'B2C Lead', type: 'boolean' },
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'marketing_consent', label: 'Marketing Consent', type: 'boolean' },
    { key: 'whatsapp_consent', label: 'WhatsApp Consent', type: 'boolean' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select' },
    { key: 'preferred_contact_method', label: 'Preferred Channel', type: 'select' },
    { key: 'address_line1', label: 'Address Line 1', type: 'text' },
    { key: 'address_line2', label: 'Address Line 2', type: 'text' },
    { key: 'postal_code', label: 'Postal Code', type: 'text' },
  ],
  contact: [
    { key: 'first_name', label: 'First Name', type: 'text', required: true },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'title', label: 'Job Title', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'account_id', label: 'Account / Company', type: 'select' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'marketing_consent', label: 'Marketing Consent', type: 'boolean' },
    { key: 'whatsapp_consent', label: 'WhatsApp Consent', type: 'boolean' },
    { key: 'email_opt_out', label: 'Email Opt-Out', type: 'boolean' },
    { key: 'do_not_contact', label: 'Do Not Contact', type: 'boolean' },
  ],
  account: [
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'domain', label: 'Website / Domain', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'annual_revenue', label: 'Annual Revenue', type: 'number' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'tags', label: 'Tags', type: 'multiselect' },
  ],
  deal: [
    { key: 'title', label: 'Deal Title', type: 'text', required: true },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'select' },
    { key: 'stage_id', label: 'Stage', type: 'select', required: true },
    { key: 'pipeline_id', label: 'Pipeline', type: 'select' },
    { key: 'expected_close_date', label: 'Expected Close Date', type: 'date' },
    { key: 'probability', label: 'Win Probability %', type: 'number' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'contact_id', label: 'Primary Contact', type: 'select' },
    { key: 'account_id', label: 'Account', type: 'select' },
    { key: 'lost_reason', label: 'Lost Reason', type: 'text' },
    { key: 'lead_id', label: 'Source Lead', type: 'select' },
  ],
};

type FieldOverride = { label?: string; required?: boolean; hidden?: boolean; position?: number };
type FieldOverrides = Record<string, FieldOverride>; // key: `${entity}.${field_key}`

const overrideKey = (entity: string, key: string) => `${entity}.${key}`;
// System rows share the same DnD state as custom rows, so we tag their
// drag identifier with a prefix to avoid collisions with custom-field
// UUIDs and to let the drop handler route to the right reorder function.
const BUILTIN_DRAG_PREFIX = 'builtin:';
const builtinDragId = (entity: string, key: string) => `${BUILTIN_DRAG_PREFIX}${entity}.${key}`;

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [editing, setEditing] = useState<{ entity: string; key: string; label: string; required: boolean; hidden: boolean } | null>(null);
  // Edit dialog for true custom fields (id-keyed in the table, separate
  // from the built-in override editor above which keys off entity+key).
  const [editingCustom, setEditingCustom] = useState<{
    id: string;
    label: string;
    required: boolean;
    field_type: CustomField['field_type'];
    optionsRaw: string;
  } | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);

  const [entity, setEntity] = useState<CustomField['entity_type']>('lead');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [filter, setFilter] = useState<'all' | CustomField['entity_type']>('lead');
  // Active business-type scope for built-in field overrides. 'universal'
  // edits the legacy unscoped key; 'b2b' / 'b2c' edits the
  // entity.key@scope key. At render time scoped overrides are merged on
  // top of the universal value, mirroring the runtime helper.
  const [scope, setScope] = useState<'universal' | 'b2b' | 'b2c'>('universal');
  const [showBuiltin, setShowBuiltin] = useState(true);
  // Ref onto the field_key input so the "+ Add another field" button
  // at the bottom can scroll the form into view AND focus the first
  // field — the rep can start typing immediately.
  const fieldKeyRef = useRef<HTMLInputElement | null>(null);
  // Drag-and-drop state for the custom-fields table. dragId is the
  // row currently being dragged; overId is the row it's hovering on.
  // Set on dragstart/dragover, cleared on dragend. The actual reorder
  // happens on drop via reorderTo().
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [cfRes, settingsRes] = await Promise.allSettled([
        crmCustomFields.list(),
        crmSettings.get(),
      ]);
      if (cfRes.status === 'fulfilled') setItems(cfRes.value.data || []);
      if (settingsRes.status === 'fulfilled') {
        const cfg = (settingsRes.value.data?.config as Record<string, unknown>) || {};
        setConfig(cfg);
        setOverrides((cfg.field_overrides as FieldOverrides) || {});
      }
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !canAccess(user.role, ['sub_admin'])) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    reload();
  }, []);

  const create = async () => {
    if (!fieldKey.trim() || !label.trim()) return toast.error('Field key and label are required');
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())) return toast.error('Key must be lowercase, start with a letter, use only a-z 0-9 and _');
    if (items.some((i) => i.entity_type === entity && i.field_key === fieldKey.trim())) {
      return toast.error(`A field with key "${fieldKey.trim()}" already exists for ${entity}`);
    }
    const needsOptions = TYPES_REQUIRING_OPTIONS.has(fieldType);
    const parsedOptions = needsOptions ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!parsedOptions || parsedOptions.length === 0)) return toast.error('Add at least one option for select/multiselect');
    setCreating(true);
    // Backend (customFieldSchema in src/validators/crm.validators.ts) expects
    // `entity_type` — sending `entity` silently failed validation and the
    // POST returned 400 before reaching the DB, so clicks on "+ Add Field"
    // looked like dead clicks.
    const payload: Record<string, unknown> = {
      entity_type: entity, field_key: fieldKey.trim(), label: label.trim(),
      field_type: fieldType, required,
      position: items.filter((i) => i.entity_type === entity).length,
    };
    if (parsedOptions !== undefined) payload.options = parsedOptions;
    try {
      await crmCustomFields.create(payload as any);
      toast.success(`Custom field "${label.trim()}" added to ${entity}`);
      setFieldKey(''); setLabel(''); setOptionsRaw(''); setRequired(false);
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed — check API connection'); }
    finally { setCreating(false); }
  };

  const remove = async (cf: CustomField) => {
    if (!window.confirm(`Delete custom field "${cf.label}"? Existing values for this field on records will be lost.`)) return;
    setBusy((b) => ({ ...b, [cf.id]: true }));
    try {
      await crmCustomFields.remove(cf.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [cf.id]: false })); }
  };

  // Drag-drop reorder. `targetId` is where dragId should land. Computes
  // the new position list (re-numbered 0..n) for the affected entity
  // group and POSTs the whole batch in one request.
  const reorderTo = async (dragIdLocal: string, targetId: string) => {
    if (!dragIdLocal || dragIdLocal === targetId) return;
    const dragged = items.find((i) => i.id === dragIdLocal);
    const target  = items.find((i) => i.id === targetId);
    if (!dragged || !target) return;
    if (dragged.entity_type !== target.entity_type) {
      // Don't allow drag across entities — moving a "lead" field into
      // the "contact" group would change its semantics. Block silently;
      // visual cue happens at drop time.
      return;
    }

    // Build the new order within this entity group only. Other entities'
    // positions stay untouched.
    const group = items.filter((i) => i.entity_type === dragged.entity_type)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const without = group.filter((i) => i.id !== dragIdLocal);
    const targetIdx = without.findIndex((i) => i.id === targetId);
    const reordered = [
      ...without.slice(0, targetIdx),
      dragged,
      ...without.slice(targetIdx),
    ];
    // Re-number from 0 so positions stay tidy.
    const payload = reordered.map((i, idx) => ({ id: i.id, position: idx }));

    // Optimistic UI: stamp the new positions before the server roundtrip
    // so the rows snap immediately instead of waiting for reload.
    const lookup = new Map(payload.map((p) => [p.id, p.position]));
    setItems((prev) => prev.map((i) =>
      lookup.has(i.id) ? { ...i, position: lookup.get(i.id) as number } : i
    ));

    setReordering(true);
    try {
      await api.post('/api/v1/crm/custom-fields/reorder', { items: payload });
      // Don't reload — the optimistic update already shows the right order.
    } catch (e: any) {
      toast.error(e?.message || 'Reorder failed');
      reload(); // revert by refetching authoritative state
    } finally {
      setReordering(false);
    }
  };

  const startEditCustom = (cf: CustomField) => {
    setEditingCustom({
      id: cf.id,
      label: cf.label,
      required: !!cf.required,
      field_type: cf.field_type,
      optionsRaw: Array.isArray(cf.options) ? cf.options.join(', ') : '',
    });
  };

  const saveEditCustom = async () => {
    if (!editingCustom) return;
    if (!editingCustom.label.trim()) return toast.error('Label is required');
    const needsOptions = TYPES_REQUIRING_OPTIONS.has(editingCustom.field_type);
    const parsed = needsOptions
      ? editingCustom.optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (needsOptions && (!parsed || parsed.length === 0)) {
      return toast.error('Add at least one option for select/multiselect');
    }
    setSavingCustom(true);
    try {
      const body: Record<string, unknown> = {
        label: editingCustom.label.trim(),
        required: editingCustom.required,
        // Allow changing the input type post-create. The "Edit Custom
        // Field" modal warns admins that any values already stored
        // for this field will keep their original shape; the new type
        // only affects future writes. Backend still validates the
        // enum so we can't end up with an invalid field_type.
        field_type: editingCustom.field_type,
      };
      if (parsed !== undefined) body.options = parsed;
      else if (!needsOptions) body.options = null; // wipe when no longer needed
      await crmCustomFields.update(editingCustom.id, body as any);
      toast.success('Field updated');
      setEditingCustom(null);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setSavingCustom(false);
    }
  };

  // Resolve the override the page should DISPLAY for a built-in field
  // given the active scope. Scoped overrides merge on top of the
  // universal one so reps see "label = X (from universal) + required = Y
  // (B2B-specific)" at a glance.
  const effectiveOverride = (entityName: string, key: string): FieldOverride => {
    const uni = overrides[overrideKey(entityName, key)] || {};
    if (scope === 'universal') return uni;
    const scoped = overrides[`${entityName}.${key}@${scope}`] || {};
    return { ...uni, ...scoped };
  };
  // Key the save writes to. The position field always stays on the
  // universal record (reordering isn't scope-specific in practice).
  const writeKey = (entityName: string, key: string) =>
    scope === 'universal'
      ? overrideKey(entityName, key)
      : `${entityName}.${key}@${scope}`;

  const saveOverride = async (entityName: string, key: string, override: FieldOverride) => {
    const k = writeKey(entityName, key);
    setSavingOverride(k);
    try {
      const next: FieldOverrides = { ...overrides };
      // Remove keys that match the original to keep config tidy.
      // Three things admins can override per built-in field now:
      //  - label   (rename without changing the API contract)
      //  - required (force / un-force entry in the form)
      //  - hidden  (drop the field from the form entirely — useful
      //             when a brand doesn't collect e.g. "industry" or
      //             "marketing consent" by their own design)
      const existing = next[k] || {};
      const cleaned: FieldOverride = {
        // Carry over any keys the caller didn't touch — saving label
        // shouldn't drop a position override and vice versa.
        ...existing,
        ...override,
      };
      // Strip undefined / null entries so the JSON stays compact.
      (Object.keys(cleaned) as (keyof FieldOverride)[]).forEach((kk) => {
        if (cleaned[kk] === undefined || cleaned[kk] === null) delete cleaned[kk];
      });
      if (Object.keys(cleaned).length === 0) {
        delete next[k];
      } else {
        next[k] = cleaned;
      }
      await crmSettings.update({ config: { ...config, field_overrides: next } });
      setOverrides(next);
      setConfig({ ...config, field_overrides: next });
      toast.success('Field updated');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSavingOverride(null);
    }
  };

  const resetOverride = async (entityName: string, key: string) => {
    if (!window.confirm(`Reset this field to its ${scope === 'universal' ? 'system default' : `universal value (clears the ${scope.toUpperCase()} override only)`}?`)) return;
    const k = writeKey(entityName, key);
    const next = { ...overrides };
    delete next[k];
    setSavingOverride(k);
    try {
      await crmSettings.update({ config: { ...config, field_overrides: next } });
      setOverrides(next);
      setConfig({ ...config, field_overrides: next });
      toast.success('Reset to default');
    } catch (e: any) {
      toast.error(e.message || 'Reset failed');
    } finally {
      setSavingOverride(null);
    }
  };

  // Apply per-entity sort using override.position. Fields without an
  // override fall back to their original BUILTIN_FIELDS index so the
  // default order still wins until someone explicitly drags a row.
  const sortBuiltinGroup = (ent: string, fields: BuiltinField[]) =>
    fields
      .map((f, i) => {
        const ov = overrides[overrideKey(ent, f.key)] || {};
        const pos = typeof ov.position === 'number' ? ov.position : i + 1000; // fallback bucket sits after explicit positions
        return { f, pos, i };
      })
      .sort((a, b) => a.pos - b.pos || a.i - b.i)
      .map(({ f }) => ({ ...f, entity: ent }));

  const builtinVisible = useMemo(() => {
    return filter === 'all'
      ? Object.entries(BUILTIN_FIELDS).flatMap(([ent, fields]) => sortBuiltinGroup(ent, fields))
      : sortBuiltinGroup(filter, BUILTIN_FIELDS[filter] || []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, overrides]);

  // Reorder a built-in row within its entity group. Writes a single
  // crm_settings update with new position numbers for every field in
  // the group, so the JSON column stays consistent and other entities
  // are untouched.
  const reorderBuiltinTo = async (dragKey: string, targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const [dragEnt, dragField] = dragKey.split('.');
    const [tgtEnt, tgtField]   = targetKey.split('.');
    if (dragEnt !== tgtEnt) return; // never cross entity groups

    const group = sortBuiltinGroup(dragEnt, BUILTIN_FIELDS[dragEnt] || []);
    const without = group.filter((f) => f.key !== dragField);
    const tgtIdx = without.findIndex((f) => f.key === tgtField);
    if (tgtIdx < 0) return;
    const dragged = group.find((f) => f.key === dragField);
    if (!dragged) return;
    const reordered = [
      ...without.slice(0, tgtIdx),
      dragged,
      ...without.slice(tgtIdx),
    ];

    // Build the next overrides map: for every field in the group,
    // upsert the new position while preserving label/required/hidden.
    const nextOverrides: FieldOverrides = { ...overrides };
    reordered.forEach((f, idx) => {
      const k = overrideKey(dragEnt, f.key);
      const existing = nextOverrides[k] || {};
      nextOverrides[k] = { ...existing, position: idx };
    });

    // Optimistic UI: reflect new positions immediately so the row snaps
    // into place. Roll back on error.
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setReordering(true);
    try {
      await crmSettings.update({ config: { ...config, field_overrides: nextOverrides } });
      setConfig({ ...config, field_overrides: nextOverrides });
    } catch (e: any) {
      toast.error(e?.message || 'Reorder failed');
      setOverrides(prevOverrides);
    } finally {
      setReordering(false);
    }
  };

  if (accessDenied) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Admin Access Required</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Custom fields are visible to admins and managers only. Contact your administrator for access.
        </div>
      </div>
    );
  }

  // Render in saved order: group by entity, then by position. Without this
  // sort, drag-to-reorder updated the position values but the list kept its
  // original (API/insertion) order, so shuffling appeared to do nothing.
  const visible = (filter === 'all' ? items : items.filter((i) => i.entity_type === filter))
    .slice()
    .sort((a, b) =>
      (a.entity_type || '').localeCompare(b.entity_type || '')
      || (a.position ?? 0) - (b.position ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Create form */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add Custom Field</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Adds an extra field to lead, contact, account, or deal records. Field key is the API identifier — use lowercase + underscores only.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <select value={entity} onChange={(e) => { setEntity(e.target.value as CustomField['entity_type']); setFilter(e.target.value as CustomField['entity_type']); }} style={input}>
            {ENTITIES.map((e) => <option key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</option>)}
          </select>
          <input ref={fieldKeyRef} value={fieldKey} onChange={(e) => setFieldKey(e.target.value.toLowerCase())} placeholder="field_key (e.g. tax_id)" style={input} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" style={input} />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomField['field_type'])} style={input}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        {TYPES_REQUIRING_OPTIONS.has(fieldType) && (
          <input value={optionsRaw} onChange={(e) => setOptionsRaw(e.target.value)} placeholder="Comma-separated options (e.g. Hot, Warm, Cold)" style={{ ...input, width: '100%', marginBottom: 8 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
          </label>
        </div>
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding…' : '+ Add Field'}</button>
      </div>

      {/* Field list */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Fields ({builtinVisible.length + visible.length} total — {builtinVisible.length} system, {visible.length} custom)
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--primary)',
            background: 'rgba(0,102,255,0.08)', padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--primary)', fontWeight: 600,
          }}>
            <GripIcon size={12} />
            Drag the blue grip to reorder any field (system or custom — within its entity group)
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowBuiltin((v) => !v)}
              style={{ ...btnFilter, background: showBuiltin ? '#6366f115' : 'transparent', color: showBuiltin ? '#6366f1' : 'var(--text-dim)', borderColor: showBuiltin ? '#6366f1' : 'var(--border)' }}
            >
              {showBuiltin ? '✓ ' : ''}System Fields
            </button>
            {(['all', ...ENTITIES] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as any)} style={{ ...btnFilter, background: filter === f ? 'var(--primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-dim)' }}>
                {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Scope selector — controls which override variant we're editing.
            Universal = the legacy unscoped key, applies regardless of
            the lead's is_b2c. B2B / B2C scope writes to
            entity.field@b2b or @b2c, and the runtime helper consults
            the scoped key first, falling back to universal. */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4, marginRight: 4 }}>
            Editing for
          </span>
          {(['universal', 'b2b', 'b2c'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: scope === s ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: scope === s ? 'rgba(224,30,44,0.10)' : 'var(--s3)',
                color: scope === s ? 'var(--primary)' : 'var(--text)',
              }}
            >
              {s === 'universal' ? 'Universal (both)' : s.toUpperCase()}
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
            {scope === 'universal'
              ? 'These overrides apply to every lead. B2B/B2C tabs let you fine-tune per business type.'
              : `Overrides saved here apply only to ${scope.toUpperCase()} leads and win over the Universal value.`}
          </span>
        </div>

        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 44, textAlign: 'center', fontSize: 9 }} title="Drag rows to reorder">SORT</th>
                <th style={th}>Entity</th>
                <th style={th}>Key</th>
                <th style={th}>Label</th>
                <th style={th}>Type</th>
                <th style={th}>Required</th>
                <th style={th}>Kind</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {/* Built-in standard fields */}
              {showBuiltin && builtinVisible.map((f) => {
                const k = writeKey(f.entity, f.key);
                const ov = effectiveOverride(f.entity, f.key);
                const effLabel = ov.label ?? f.label;
                const effRequired = ov.required ?? !!f.required;
                const effHidden = ov.hidden ?? false;
                const overridden = ov.label !== undefined || ov.required !== undefined || ov.hidden !== undefined || ov.position !== undefined;
                const saving = savingOverride === k;
                const dragKey = builtinDragId(f.entity, f.key);
                const isDragging = dragId === dragKey;
                const isOver     = overId === dragKey && dragId && dragId !== dragKey && dragId.startsWith(BUILTIN_DRAG_PREFIX);
                return (
                  <tr
                    key={`builtin-${f.entity}-${f.key}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', dragKey);
                      setDragId(dragKey);
                    }}
                    onDragOver={(e) => {
                      // Only accept other system rows in the same entity group
                      // as drop targets — block custom-row drops onto system rows.
                      if (!dragId || !dragId.startsWith(BUILTIN_DRAG_PREFIX)) return;
                      const draggedEnt = dragId.slice(BUILTIN_DRAG_PREFIX.length).split('.')[0];
                      if (draggedEnt !== f.entity) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (overId !== dragKey) setOverId(dragKey);
                    }}
                    onDragLeave={() => { if (overId === dragKey) setOverId(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain') || dragId || '';
                      setDragId(null); setOverId(null);
                      if (id.startsWith(BUILTIN_DRAG_PREFIX)) {
                        reorderBuiltinTo(id.slice(BUILTIN_DRAG_PREFIX.length), `${f.entity}.${f.key}`);
                      }
                    }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    style={{
                      opacity: isDragging ? 0.4 : (effHidden ? 0.55 : 1),
                      borderTop: isOver ? '2px solid var(--primary)' : undefined,
                      background: isOver ? 'rgba(0,102,255,0.05)' : undefined,
                      cursor: reordering ? 'wait' : 'grab',
                    }}
                  >
                    <td
                      style={{
                        ...td, width: 44, textAlign: 'center', verticalAlign: 'middle',
                        userSelect: 'none',
                        cursor: reordering ? 'wait' : 'grab',
                        background: isOver ? 'rgba(0,102,255,0.28)' : 'rgba(99,102,241,0.12)',
                        borderRight: '1px solid var(--border)',
                        padding: 0,
                      }}
                      title="Drag to reorder this system field within its entity group"
                    >
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 6,
                        background: '#6366f1', color: '#fff',
                      }}>
                        <GripIcon size={14} />
                      </div>
                    </td>
                    <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{f.entity}</span></td>
                    <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{f.key}</code></td>
                    <td style={td}>
                      {effLabel}
                      {overridden && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: '#f59e0b15', color: '#f59e0b', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>edited</span>}
                      {effHidden && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: 'var(--s3)', color: 'var(--text-dim)', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>hidden</span>}
                    </td>
                    <td style={td}>{f.type}</td>
                    <td style={td}>{effRequired ? '✓' : ''}</td>
                    <td style={td}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#6366f115', color: '#6366f1' }}>System</span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditing({ entity: f.entity, key: f.key, label: effLabel, required: effRequired, hidden: effHidden })}
                          disabled={saving}
                          style={btnSmall}
                        >
                          {saving ? '…' : 'Edit'}
                        </button>
                        {overridden && (
                          <button
                            onClick={() => resetOverride(f.entity, f.key)}
                            disabled={saving}
                            style={btnSmallGhost}
                            title="Reset to system default"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Custom fields */}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...td, color: 'var(--text-dim)', textAlign: 'center', padding: 24, background: 'rgba(0,102,255,0.04)', borderTop: '2px dashed var(--primary)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexDirection: 'column' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'var(--primary)', color: '#fff' }}>
                        <GripIcon size={16} />
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                        No custom fields yet
                      </div>
                      <div style={{ fontSize: 12, maxWidth: 420 }}>
                        Custom fields you add appear here with a <strong style={{ color: 'var(--primary)' }}>blue drag handle</strong> in the SORT column. System fields can also be reordered using the indigo grip on each system row.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {visible.map((c) => {
                const isDragging = dragId === c.id;
                const isOver     = overId === c.id && dragId && dragId !== c.id;
                return (
                <tr
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', c.id);
                    setDragId(c.id);
                  }}
                  onDragOver={(e) => {
                    // Refuse drops coming from system rows — they live
                    // in a different group with a different reorder path.
                    if (dragId && dragId.startsWith(BUILTIN_DRAG_PREFIX)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== c.id) setOverId(c.id);
                  }}
                  onDragLeave={() => { if (overId === c.id) setOverId(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || dragId || '';
                    setDragId(null); setOverId(null);
                    if (id && !id.startsWith(BUILTIN_DRAG_PREFIX)) reorderTo(id, c.id);
                  }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  style={{
                    opacity: isDragging ? 0.4 : 1,
                    // Soft top border on the row being hovered so the
                    // drop target is obvious without a separate ghost
                    // element.
                    borderTop: isOver ? '2px solid var(--primary)' : undefined,
                    background: isOver ? 'rgba(0,102,255,0.05)' : undefined,
                    cursor: reordering ? 'wait' : 'grab',
                  }}
                >
                  <td
                    style={{
                      ...td, width: 44, textAlign: 'center', verticalAlign: 'middle',
                      userSelect: 'none',
                      cursor: reordering ? 'wait' : 'grab',
                      // Strong primary tint so the grip cell is unmistakable
                      // as a drag handle, not an empty column.
                      background: isOver ? 'rgba(0,102,255,0.28)' : 'rgba(0,102,255,0.12)',
                      borderRight: '1px solid var(--border)',
                      padding: 0,
                    }}
                    title="Drag to reorder this field"
                  >
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      background: 'var(--primary)', color: '#fff',
                    }}>
                      <GripIcon size={14} />
                    </div>
                  </td>
                  <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c.entity_type}</span></td>
                  <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{c.field_key}</code></td>
                  <td style={td}>{c.label}</td>
                  <td style={td}>{TYPE_LABELS[c.field_type] ?? c.field_type}</td>
                  <td style={td}>{c.required ? '✓' : ''}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b' }}>Custom</span>
                  </td>
                  <td style={td}>
                    <button onClick={() => startEditCustom(c)} disabled={!!busy[c.id]} style={{ ...btnSmall, marginRight: 6 }}>Edit</button>
                    <button onClick={() => remove(c)} disabled={!!busy[c.id]} style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }}>{busy[c.id] ? '...' : 'Delete'}</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick-add button at the bottom of the table — saves a scroll
          when admins are reviewing the existing list and want to add
          one more. Scrolls back to the Add Custom Field form at the
          top so the rep can fill it in. */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            // Scroll the form into view first, then focus the field_key
            // input so the rep can start typing immediately. Two-step
            // ordering matters — focusing first would steal the smooth-
            // scroll target on Safari.
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // Wait for the scroll animation to settle before focusing
            // (otherwise iOS yanks the viewport back to the input).
            window.setTimeout(() => fieldKeyRef.current?.focus(), 300);
          }}
          style={{
            background: 'var(--s3)', border: '1px dashed var(--border)',
            color: 'var(--text)', padding: '10px 18px', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
          }}
        >
          + Add another field
        </button>
      </div>

      {/* Edit built-in field modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Edit System Field</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{editing.entity}.{editing.key}</div>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              Three things about this system field are configurable here: the <strong style={{ color: 'var(--text)' }}>display label</strong> (rename without changing the API contract), whether it's <strong style={{ color: 'var(--text)' }}>required</strong> in forms, and whether the field is <strong style={{ color: 'var(--text)' }}>visible at all</strong>. The underlying database column, field key, and type stay unchanged — existing data is preserved either way.
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Display Label</div>
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
              <input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} />
              Required field
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={editing.hidden}
                onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
              />
              Hide this field from forms
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                (data isn&rsquo;t deleted; the input just won&rsquo;t appear on the create/edit screens)
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                onClick={async () => {
                  await saveOverride(editing.entity, editing.key, { label: editing.label, required: editing.required, hidden: editing.hidden });
                  setEditing(null);
                }}
                style={btnPrimary}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog for true custom fields. Allows changing label,
          required flag, and (for select/multiselect) the options list.
          field_type + field_key are immutable post-create — changing
          them would invalidate every stored value. */}
      {editingCustom && (
        <div onClick={() => setEditingCustom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Edit Custom Field</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{editingCustom.field_type}</div>
              </div>
              <button onClick={() => setEditingCustom(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              The field key stays fixed after creation. You can change the
              <strong style={{ color: 'var(--text)' }}> input type</strong>,
              label, and required flag — values already saved on records
              keep their original shape; the new type only affects future
              writes.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Display Label</div>
                <input
                  value={editingCustom.label}
                  onChange={(e) => setEditingCustom({ ...editingCustom, label: e.target.value })}
                  style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Input Type</div>
                <select
                  value={editingCustom.field_type}
                  onChange={(e) => setEditingCustom({ ...editingCustom, field_type: e.target.value as CustomField['field_type'] })}
                  style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            {TYPES_REQUIRING_OPTIONS.has(editingCustom.field_type) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Options (comma-separated)</div>
                <input
                  value={editingCustom.optionsRaw}
                  onChange={(e) => setEditingCustom({ ...editingCustom, optionsRaw: e.target.value })}
                  placeholder="Option 1, Option 2, Option 3"
                  style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <input type="checkbox" checked={editingCustom.required} onChange={(e) => setEditingCustom({ ...editingCustom, required: e.target.checked })} />
              Required field
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditingCustom(null)} disabled={savingCustom} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={saveEditCustom} disabled={savingCustom} style={{ ...btnPrimary, opacity: savingCustom ? 0.6 : 1, cursor: savingCustom ? 'not-allowed' : 'pointer' }}>
                {savingCustom ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Six-dot grip handle as inline SVG. Font-based glyphs (⠿ / ⋮⋮) silently
// disappeared on a few browser/OS combos because the surrounding font
// stack didn't carry the codepoint. SVG renders everywhere identically.
function GripIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle cx="5"  cy="3"  r="1.4" />
      <circle cx="11" cy="3"  r="1.4" />
      <circle cx="5"  cy="8"  r="1.4" />
      <circle cx="11" cy="8"  r="1.4" />
      <circle cx="5"  cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnFilter: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' };
const btnSmall: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
