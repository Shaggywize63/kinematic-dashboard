'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields, crmPeopleDirectoryTypes, crmSettings, crmTargets, type KiniProposedField } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { CustomField } from '../../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../../lib/auth';
import { composeOptions, isProductSourceOptions, OPTION_SEARCHABLE, visibleOptions } from '../../../../../lib/customFieldOptions';
import { extractLeadForm, segmentName } from '../../../../../lib/crmLeadForm';
import { hasFormOrder, type FieldOverride, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import {
  applyBuiltinOrder, canStep, mergeFieldOrder, moveStep, moveTo, nextPosition, renumber,
  reorderIncomplete, resetFieldOverride, type FieldRow,
} from '../../../../../lib/fieldOrder';
import KiniFormBuilder from './KiniFormBuilder';
import KiniMascot from './KiniMascot';

const ENTITIES: Array<CustomField['entity_type']> = ['lead', 'contact', 'account', 'deal', 'activity'];
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
  'lookup',
  // Read-only computed field — value derived from other custom fields
  // via an arithmetic + IF / MIN / MAX / ROUND formula. Editor + render
  // are wired in CustomFieldsSection.
  'formula',
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
  image:       'Photo / Camera',
  file:        'File upload',
  lookup:      'Linked record (lookup)',
  formula:     'Formula (computed)',
};

const TYPES_REQUIRING_OPTIONS = new Set<CustomField['field_type']>(['select', 'multiselect', 'radio']);

// Tables the lookup field can point at. Mirrors the backend allowlist —
// only these targets are honoured by /api/v1/crm/lookup/search.
const LOOKUP_TARGETS: Array<{ value: string; label: string }> = [
  { value: 'crm_leads',        label: 'Lead' },
  { value: 'crm_contacts',     label: 'Contact' },
  { value: 'crm_accounts',     label: 'Account' },
  { value: 'crm_deals',        label: 'Deal' },
  { value: 'people_directory', label: 'People Directory entry' },
  // Block / taluka picker. Backend filters this by the rep's effective
  // city scope (e.g. a Dhanbad Champion sees only Dhanbad blocks) so
  // admins don't need to add a per-user filter clause manually — just
  // point the custom field at crm_blocks and the gate runs server-side.
  { value: 'crm_blocks',       label: 'Block (taluka)' },
];

// Operators the simple v1 filter builder supports. Each clause is ANDed
// with the others on the backend — Salesforce-style OR groups + per-type
// operator restrictions are an explicit later iteration.
const LOOKUP_OPS: Array<{ value: string; label: string }> = [
  { value: 'eq',       label: 'equals' },
  { value: 'ne',       label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'gte',      label: 'is at least' },
  { value: 'lte',      label: 'is at most' },
];
type LookupClause = { field: string; op: string; value: string };

// Filterable columns per target table — what the admin can choose as
// the "column" side of a lookup-filter clause. Curated so internal /
// audit columns (org_id, deleted_at, created_by, …) don't show in the
// dropdown; we only surface fields a CRM admin would reasonably want
// to narrow by. Keep in sync with the backend's per-target search /
// allowlist in crm.routes.ts /lookup/search.
const LOOKUP_FIELDS: Record<string, Array<{ value: string; label: string }>> = {
  crm_leads: [
    { value: 'status',          label: 'Status (new / working / …)' },
    { value: 'lifecycle_stage', label: 'Lifecycle stage' },
    { value: 'score',           label: 'Score (number)' },
    { value: 'score_grade',     label: 'Score grade (A / B / C / D)' },
    { value: 'is_b2c',          label: 'Is B2C (true / false)' },
    { value: 'company',         label: 'Company' },
    { value: 'industry',        label: 'Industry' },
    { value: 'city',            label: 'City' },
    { value: 'state',           label: 'State' },
    { value: 'country',         label: 'Country' },
    { value: 'source_id',       label: 'Source (UUID)' },
    { value: 'owner_id',        label: 'Owner (UUID)' },
    { value: 'is_converted',    label: 'Converted (true / false)' },
  ],
  crm_contacts: [
    { value: 'account_id',  label: 'Account (UUID)' },
    { value: 'owner_id',    label: 'Owner (UUID)' },
    { value: 'city',        label: 'City' },
    { value: 'state',       label: 'State' },
    { value: 'country',     label: 'Country' },
    { value: 'is_b2c',      label: 'Is B2C (true / false)' },
    { value: 'loyalty_tier', label: 'Loyalty tier' },
  ],
  crm_accounts: [
    { value: 'industry', label: 'Industry' },
    { value: 'city',     label: 'City' },
    { value: 'country',  label: 'Country' },
    { value: 'owner_id', label: 'Owner (UUID)' },
  ],
  crm_deals: [
    { value: 'status',     label: 'Status' },
    { value: 'stage_id',   label: 'Stage (UUID)' },
    { value: 'pipeline_id', label: 'Pipeline (UUID)' },
    { value: 'amount',     label: 'Amount (number)' },
    { value: 'owner_id',   label: 'Owner (UUID)' },
  ],
  people_directory: [
    { value: 'type', label: 'Type (Dealer / Engineer / …)' },
    { value: 'city', label: 'City' },
  ],
};

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
    // Phone is required by default — the lead form mirrors this. The
    // primary mobile is the canonical contact for B2C intake and the
    // de-facto identifier for B2B reps too. Admins can flip it to
    // optional via the Edit dialog for tenants that don't collect it.
    { key: 'phone', label: 'Primary Mobile', type: 'text', required: true },
    { key: 'alternate_mobiles', label: 'Alternate Mobiles', type: 'text' },
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
    // The DPDP "Data consent" block on the create form + the consent card on the detail page. Hiding it removes
    // both (and the consent record is then not sent at create); "required" makes the tick mandatory.
    { key: 'data_consent', label: 'Data consent (DPDP)', type: 'boolean' },
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
    { key: 'mobile', label: 'Mobile', type: 'text' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select' },
    { key: 'preferred_contact_method', label: 'Preferred Channel', type: 'select' },
    { key: 'referral_source', label: 'Referral Source', type: 'text' },
    { key: 'loyalty_tier', label: 'Loyalty Tier', type: 'select' },
    { key: 'address_line1', label: 'Address Line 1', type: 'text' },
    { key: 'address_line2', label: 'Address Line 2', type: 'text' },
    { key: 'postal_code', label: 'Postal Code', type: 'text' },
    { key: 'account_id', label: 'Account / Company', type: 'select' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'marketing_consent', label: 'Marketing Consent', type: 'boolean' },
    { key: 'whatsapp_consent', label: 'WhatsApp Consent', type: 'boolean' },
    { key: 'data_consent', label: 'Data consent (DPDP)', type: 'boolean' },
    { key: 'email_opt_out', label: 'Email Opt-Out', type: 'boolean' },
    { key: 'do_not_contact', label: 'Do Not Contact', type: 'boolean' },
  ],
  account: [
    // Key MUST match the real account column the form gates on: the
    // website column is `website` (not `domain`).
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'website', label: 'Website', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'annual_revenue', label: 'Annual Revenue', type: 'number' },
    { key: 'employees', label: 'Employees', type: 'number' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'address_line1', label: 'Address Line 1', type: 'text' },
    { key: 'address_line2', label: 'Address Line 2', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'postal_code', label: 'PIN Code', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'tags', label: 'Tags', type: 'multiselect' },
    // Shown on the account create/edit form (required there), so it must be listed here too.
    { key: 'description', label: 'Description', type: 'text' },
  ],
  deal: [
    // Keys MUST match the real deal columns the forms gate on
    // (crmFieldOverrides `deal.<key>`): the deal name column is `name`
    // (not `title`) and the create form's picker is `primary_contact_id`.
    { key: 'name', label: 'Deal Name', type: 'text', required: true },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'select' },
    { key: 'stage_id', label: 'Stage', type: 'select', required: true },
    { key: 'pipeline_id', label: 'Pipeline', type: 'select' },
    { key: 'expected_close_date', label: 'Expected Close Date', type: 'date' },
    { key: 'probability', label: 'Win Probability %', type: 'number' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'primary_contact_id', label: 'Primary Contact', type: 'select' },
    { key: 'account_id', label: 'Account', type: 'select' },
    { key: 'lost_reason', label: 'Lost Reason', type: 'text' },
    { key: 'lead_id', label: 'Source Lead', type: 'select' },
  ],
};

// FieldOverride / FieldOverrides (key: `${entity}.${field_key}`) come from lib/crmFieldOverrides.
// `order` = the field's place in the entity's ONE list shared with the custom fields.

const overrideKey = (entity: string, key: string) => `${entity}.${key}`;
// Every row (system or custom) has a unique `rid` (see lib/fieldOrder.ts) that doubles as its drag identifier.
// The entity of a row is looked up from the rendered groups, so a drop can never cross entities.

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const leadFormCfg = useMemo(() => extractLeadForm({ config }), [config]);
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
    hidden: boolean;
    field_type: CustomField['field_type'];
    optionsRaw: string;
    // Select behaviour, stored as reserved tokens inside `options` (see
    // lib/customFieldOptions.ts) so no schema change is needed.
    searchable: boolean;
    fromProducts: boolean;
    // Lead fields only: which lead type shows the field.
    entity_type: CustomField['entity_type'];
    appliesTo: 'both' | 'b2c' | 'b2b';
    org_role_ids: string[];
    targetTable: string;
    lookupFilter: LookupClause[];
    // Photo/Camera-only config, persisted as tokens in `options`
    // ('camera_only', 'front') — see the create form's captureSource note.
    captureSource: 'both' | 'camera';
    cameraFacing: 'back' | 'front';
  } | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);
  // KINI AI form-builder modal (Settings → Custom Fields).
  const [showBuilder, setShowBuilder] = useState(false);
  // Early-rollout gate: the KINI form builder is only shown to the master
  // admin (s@kinematicapp.com) for now. The backend enforces the same limit,
  // so this is a UI convenience, not the security boundary.
  const isMasterAdmin = (getStoredUser()?.email || '').toLowerCase() === 's@kinematicapp.com';
  const kiniBuilderEnabled = isMasterAdmin;

  const [entity, setEntity] = useState<CustomField['entity_type']>('lead');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  // Select-only behaviour switches (stored as reserved option tokens).
  const [searchable, setSearchable] = useState(false);
  const [fromProducts, setFromProducts] = useState(false);
  const [required, setRequired] = useState(false);
  // Lead-segment scope for a new custom field: 'both' (every lead form),
  // 'b2c' (B2C branch only — e.g. a farmer), 'b2b' (B2B branch only — e.g. a
  // distributor/retailer). Only shown/sent for entity 'lead'; other entities
  // have no B2C/B2B split.
  const [appliesTo, setAppliesTo] = useState<'both' | 'b2c' | 'b2b'>('both');
  // Lookup-only state for the create form. Mirrors the edit dialog
  // above. Defaults reset whenever the user flips field_type away from
  // 'lookup' so a stale target/filter never gets persisted.
  const [targetTable, setTargetTable] = useState<string>('');
  const [lookupFilter, setLookupFilter] = useState<LookupClause[]>([]);
  // Dynamic list of every multi-tenant table in the database that's eligible
  // as a Linked Record target. Loaded from /api/v1/crm/lookup/targets so new
  // tables added in future migrations appear in the dropdown automatically
  // without any code change. Falls back to the hardcoded LOOKUP_TARGETS
  // until the fetch resolves (or if it fails) so the admin can still pick a
  // core CRM object even when the API is unreachable.
  const [lookupTargets, setLookupTargets] = useState<Array<{ value: string; label: string }>>(LOOKUP_TARGETS);
  // Formula-only state — the expression itself. Validated cursorily on
  // submit (non-empty); the backend zod schema caps the length at 500.
  const [formula, setFormula] = useState<string>('');
  // Photo/Camera-only state. Persisted as string tokens inside the def's
  // `options` array ('camera_only', 'front') — no schema change, and old
  // mobile builds ignore options on image fields, so this is safe to ship
  // server-first. Mobile + web renderers read the same tokens, so the
  // admin's choice drives every platform without an app release.
  const [captureSource, setCaptureSource] = useState<'both' | 'camera'>('both');
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [filter, setFilter] = useState<'all' | CustomField['entity_type']>('lead');
  // Hierarchy roles a new field is shown to (empty = all roles). Loaded from
  // the org's roles so each role can have its own custom fields.
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [pickedRoles, setPickedRoles] = useState<string[]>([]);
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
  // Ref for the formula text input so we can insert {field_key} tokens
  // at the current cursor position when the admin clicks a field chip.
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
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
      const [cfRes, settingsRes, rolesRes] = await Promise.allSettled([
        crmCustomFields.list(),
        crmSettings.get(),
        crmTargets.levels(),
      ]);
      if (rolesRes.status === 'fulfilled') setRoles(rolesRes.value.data || []);
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
    // Pull the live list of lookup-eligible tables. Best-effort — on
    // failure the dropdown stays on the hardcoded LOOKUP_TARGETS fallback.
    (async () => {
      try {
        const r = await api.get<{ data?: Array<{ value: string; label: string }> }>('/api/v1/crm/lookup/targets');
        const list = Array.isArray(r?.data) ? r.data : [];
        if (list.length > 0) setLookupTargets(list);
      } catch { /* keep the static fallback */ }
    })();
  }, []);

  const create = async () => {
    if (!fieldKey.trim() || !label.trim()) return toast.error('Field key and label are required');
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())) return toast.error('Key must be lowercase, start with a letter, use only a-z 0-9 and _');
    if (items.some((i) => i.entity_type === entity && i.field_key === fieldKey.trim())) {
      return toast.error(`A field with key "${fieldKey.trim()}" already exists for ${entity}`);
    }
    const needsOptions = TYPES_REQUIRING_OPTIONS.has(fieldType);
    // "Options from Products" needs no typed list — the choices are the product names.
    const usesProducts = fieldType === 'select' && fromProducts;
    const typedOptions = needsOptions ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && !usesProducts && (!typedOptions || typedOptions.length === 0)) return toast.error('Add at least one option for select/multiselect');
    const parsedOptions = fieldType === 'select' && typedOptions
      ? composeOptions(typedOptions, { searchable, fromProducts: usesProducts })
      : typedOptions;
    // Lookup fields require a target table — without it the picker has
    // nothing to query against. Filter clauses with an empty field/value
    // are dropped silently so a half-typed row doesn't sneak into the
    // saved payload.
    if (fieldType === 'lookup' && !targetTable) return toast.error('Choose which object this lookup should point to');
    const cleanedFilter = fieldType === 'lookup'
      ? lookupFilter.filter((c) => c.field.trim() && c.value !== '')
      : undefined;
    setCreating(true);
    // Backend (customFieldSchema in src/validators/crm.validators.ts) expects
    // `entity_type` — sending `entity` silently failed validation and the
    // POST returned 400 before reaching the DB, so clicks on "+ Add Field"
    // looked like dead clicks.
    const payload: Record<string, unknown> = {
      entity_type: entity, field_key: fieldKey.trim(), label: label.trim(),
      field_type: fieldType, required,
      // Land at the END of the entity's unified (system + custom) list.
      position: nextPosition(overrides, entity, items.filter((i) => i.entity_type === entity)),
    };
    if (parsedOptions !== undefined) payload.options = parsedOptions;
    if (fieldType === 'image') {
      // Camera config tokens — see the captureSource/cameraFacing state note.
      const tokens: string[] = [];
      if (captureSource === 'camera') tokens.push('camera_only');
      if (cameraFacing === 'front') tokens.push('front');
      payload.options = tokens;
    }
    if (pickedRoles.length > 0) payload.org_role_ids = pickedRoles;
    // Lead-segment scope — only meaningful for lead fields; omit otherwise so
    // non-lead entities never carry a scope. 'both' is the server default.
    if (entity === 'lead' && appliesTo !== 'both') payload.applies_to = appliesTo;
    if (fieldType === 'lookup') {
      payload.target_table = targetTable;
      if (cleanedFilter && cleanedFilter.length > 0) payload.lookup_filter = cleanedFilter;
    }
    if (fieldType === 'formula') {
      if (!formula.trim()) {
        toast.error('Enter a formula expression — e.g. {price} * {qty}');
        setCreating(false);
        return;
      }
      payload.formula = formula.trim();
    }
    try {
      await crmCustomFields.create(payload as any);
      toast.success(`Custom field "${label.trim()}" added to ${entity}`);
      setFieldKey(''); setLabel(''); setOptionsRaw(''); setSearchable(false); setFromProducts(false); setRequired(false); setPickedRoles([]);
      setTargetTable(''); setLookupFilter([]); setFormula(''); setAppliesTo('both');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed — check API connection'); }
    finally { setCreating(false); }
  };

  // KINI AI builder → create every accepted field for the current entity.
  // Reuses the same validated /custom-fields create path as the manual "+ Add
  // Field" button; positions continue after the end of the entity's merged list.
  const acceptBuilderFields = async (built: KiniProposedField[]) => {
    const base = nextPosition(overrides, entity, items.filter((i) => i.entity_type === entity));
    let created = 0;
    const failures: string[] = [];
    for (const f of built) {
      const payload: Record<string, unknown> = {
        entity_type: entity, field_key: f.field_key, label: f.label,
        field_type: f.field_type, required: !!f.required,
        position: base + created,
      };
      if (f.options && f.options.length > 0) payload.options = f.options;
      try { await crmCustomFields.create(payload as any); created++; }
      catch (e: any) { failures.push(`${f.label}: ${e?.message || 'failed'}`); }
    }
    if (created > 0) toast.success(`Added ${created} field${created === 1 ? '' : 's'} to ${entity}`);
    if (failures.length) toast.error(`${failures.length} field${failures.length === 1 ? '' : 's'} failed — ${failures[0]}`);
    await reload();
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

  // Reorder one entity's merged list (system + custom rows together). `next` is the NEW full order of that entity.
  // The whole list is renumbered 0..n and BOTH halves are saved: system rows -> field_overrides[..].order (one
  // crmSettings.update), custom rows -> POST /custom-fields/reorder. Optimistic; on any failure we toast and reload
  // the authoritative state.
  const persistOrder = async (ent: string, next: FieldRow[]) => {
    if (reordering) return;
    const { builtin, customs } = renumber(next);
    const hasBuiltins = Object.keys(builtin).length > 0;
    const nextOverrides = hasBuiltins ? applyBuiltinOrder(overrides, ent, builtin) : overrides;
    const posById = new Map(customs.map((c) => [c.id, c.position]));

    // Optimistic UI: the rows snap into place before the server round trip.
    setOverrides(nextOverrides);
    setItems((prev) => prev.map((i) => (i.entity_type === ent && posById.has(i.id) ? { ...i, position: posById.get(i.id) as number } : i)));

    setReordering(true);
    try {
      if (hasBuiltins) {
        await crmSettings.update({ config: { ...config, field_overrides: nextOverrides } });
        setConfig((c) => ({ ...c, field_overrides: nextOverrides }));
      }
      if (customs.length > 0) {
        const res = await api.post('/api/v1/crm/custom-fields/reorder', { items: customs });
        if (reorderIncomplete(res)) throw new Error('Some fields could not be saved');
      }
    } catch (e: any) {
      toast.error(e?.message ? `Reorder failed: ${e.message}` : 'Reorder failed');
      await reload(); // revert by refetching authoritative state
    } finally {
      setReordering(false);
    }
  };

  // Drag and drop: `fromRid` takes the place of `toRid` (same entity only).
  const reorderTo = (ent: string, fromRid: string, toRid: string) => {
    const group = groups.find((g) => g.entity === ent);
    if (!group || fromRid === toRid) return;
    const next = moveTo(group.rows, fromRid, toRid);
    if (next) void persistOrder(ent, next);
  };

  // Up / Down buttons: swap with the nearest row that is currently shown.
  const stepRow = (ent: string, rid: string, dir: -1 | 1) => {
    const group = groups.find((g) => g.entity === ent);
    if (!group) return;
    const next = moveStep(group.rows, rid, dir, isShown);
    if (next) void persistOrder(ent, next);
  };

  const startEditCustom = (cf: CustomField) => {
    setEditingCustom({
      id: cf.id,
      label: cf.label,
      required: !!cf.required,
      // Hidden flag round-trips through the same custom-fields table column
      // — newly added so the edit dialog can offer parity with system fields.
      // Older rows that pre-date this column read as `false` here.
      hidden: !!(cf as { hidden?: boolean }).hidden,
      field_type: cf.field_type,
      // Behaviour tokens are shown as switches, never as typed options.
      optionsRaw: cf.field_type === 'select' ? visibleOptions(cf.options).join(', ') : (Array.isArray(cf.options) ? cf.options.join(', ') : ''),
      searchable: Array.isArray(cf.options) && cf.options.includes(OPTION_SEARCHABLE),
      fromProducts: isProductSourceOptions(cf.options),
      entity_type: cf.entity_type,
      appliesTo: (cf.applies_to === 'b2b' || cf.applies_to === 'b2c') ? cf.applies_to : 'both',
      org_role_ids: Array.isArray(cf.org_role_ids) ? cf.org_role_ids : [],
      // Lookup-only — defaults to empty so a non-lookup field doesn't
      // accidentally stamp these columns when edited.
      targetTable: (cf.target_table as string) || '',
      lookupFilter: Array.isArray(cf.lookup_filter)
        ? cf.lookup_filter.map((c) => ({ field: String(c.field), op: String(c.op), value: c.value == null ? '' : String(c.value) }))
        : [],
      // Photo/Camera config round-trips through the options tokens.
      captureSource: Array.isArray(cf.options) && cf.options.includes('camera_only') ? 'camera' : 'both',
      cameraFacing: Array.isArray(cf.options) && cf.options.includes('front') ? 'front' : 'back',
    });
  };

  const saveEditCustom = async () => {
    if (!editingCustom) return;
    if (!editingCustom.label.trim()) return toast.error('Label is required');
    const needsOptions = TYPES_REQUIRING_OPTIONS.has(editingCustom.field_type);
    const usesProducts = editingCustom.field_type === 'select' && editingCustom.fromProducts;
    const typed = needsOptions
      ? editingCustom.optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (needsOptions && !usesProducts && (!typed || typed.length === 0)) {
      return toast.error('Add at least one option for select/multiselect');
    }
    const parsed = editingCustom.field_type === 'select' && typed
      ? composeOptions(typed, { searchable: editingCustom.searchable, fromProducts: usesProducts })
      : typed;
    if (editingCustom.field_type === 'lookup' && !editingCustom.targetTable) {
      return toast.error('Choose which object this lookup should point to');
    }
    const cleanedFilter = editingCustom.field_type === 'lookup'
      ? editingCustom.lookupFilter.filter((c) => c.field.trim() && c.value !== '')
      : null;
    setSavingCustom(true);
    try {
      const body: Record<string, unknown> = {
        label: editingCustom.label.trim(),
        required: editingCustom.required,
        // Hidden custom fields disappear from the lead/contact/etc.
        // create + edit forms via CustomFieldsSection's `filter(...)`,
        // but their stored values are preserved server-side so flipping
        // back on later doesn't lose data.
        hidden: editingCustom.hidden,
        // Allow changing the input type post-create. The "Edit Custom
        // Field" modal warns admins that any values already stored
        // for this field will keep their original shape; the new type
        // only affects future writes. Backend still validates the
        // enum so we can't end up with an invalid field_type.
        field_type: editingCustom.field_type,
      };
      if (parsed !== undefined) body.options = parsed;
      else if (editingCustom.field_type === 'image') {
        // Photo/Camera fields carry their config as options tokens — write
        // them instead of wiping, or the admin's camera choice would be lost
        // on every unrelated edit (label, required, …).
        const tokens: string[] = [];
        if (editingCustom.captureSource === 'camera') tokens.push('camera_only');
        if (editingCustom.cameraFacing === 'front') tokens.push('front');
        body.options = tokens;
      }
      else if (!needsOptions) body.options = null; // wipe when no longer needed
      body.org_role_ids = editingCustom.org_role_ids.length ? editingCustom.org_role_ids : null;
      // Lead segment scope — editable after create now (it used to be set once and
      // then invisible). 'both' is stored as null/'both' = shown on every lead type.
      if (editingCustom.entity_type === 'lead') body.applies_to = editingCustom.appliesTo;
      // Lookup config — wipe both columns when the type is no longer
      // lookup so a field flipped back to text doesn't carry stale
      // target/filter info.
      if (editingCustom.field_type === 'lookup') {
        body.target_table = editingCustom.targetTable;
        body.lookup_filter = (cleanedFilter && cleanedFilter.length > 0) ? cleanedFilter : null;
      } else {
        body.target_table = null;
        body.lookup_filter = null;
      }
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
    if (!window.confirm(scope === 'universal'
      ? 'Reset this field\'s label, required and hidden settings to the system default? Its position in the form order is kept.'
      : `Reset this field to its universal value (clears the ${scope.toUpperCase()} override only)? Its position in the form order is kept.`)) return;
    const k = writeKey(entityName, key);
    // Clears label / required / hidden but KEEPS `order`, so a reset never silently moves the field.
    const next = resetFieldOverride(overrides, entityName, key, scope);
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

  // ONE merged, ordered list per entity (system + custom rows together). Until the admin reorders, this is exactly
  // what the forms render today (system fields in BUILTIN_FIELDS order, then custom fields by position); once
  // ordered it follows the saved numbers. See lib/fieldOrder.ts.
  const groups = useMemo(() => {
    const present = new Set<string>([...Object.keys(BUILTIN_FIELDS), ...items.map((i) => i.entity_type)]);
    const known: string[] = [...ENTITIES];
    const entities = filter === 'all'
      ? [...known.filter((e) => present.has(e)), ...Array.from(present).filter((e) => !known.includes(e)).sort()]
      : [filter as string];
    return entities.map((ent) => {
      const defs = BUILTIN_FIELDS[ent] || [];
      const defByKey = new Map(defs.map((d) => [d.key, d]));
      const customs = items.filter((i) => i.entity_type === ent);
      const byId = new Map(customs.map((c) => [c.id, c]));
      const rows = mergeFieldOrder(ent, defs.map((d) => d.key), customs, overrides);
      return {
        entity: ent,
        rows,
        defByKey,
        byId,
        nSystem: defs.length,
        nCustom: customs.length,
        ordered: hasFormOrder(overrides, ent),
      };
    });
  }, [filter, items, overrides]);
  // The "System Fields" toggle hides system rows from the table; reordering still works on the full list.
  const isShown = (r: FieldRow) => showBuiltin || r.kind === 'custom';
  const entityOfRid = (rid: string) => groups.find((g) => g.rows.some((r) => r.rid === rid))?.entity;

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

  const totalSystem = groups.reduce((n, g) => n + g.nSystem, 0);
  const totalCustom = groups.reduce((n, g) => n + g.nCustom, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KINI AI form builder — generate a comprehensive field set from a
          plain-English brief, then review + add. Master-admin-only for now. */}
      {kiniBuilderEnabled && (<>
      <div className="kini-hero" style={{ borderRadius: 16, padding: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        boxShadow: '0 14px 34px -12px rgba(224,30,44,0.6)', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(120deg, #E5202B, #C4141D, #E01E2C, #B3121B)', backgroundSize: '300% 300%',
        animation: 'kiniHeroFlow 9s ease infinite' }}>
        {/* Injected keyframes for the dynamic gradient + floaters + hover (inline can't do @keyframes or :hover). */}
        <style>{`
          @keyframes kiniHeroFlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
          @keyframes kiniHeroFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
          @keyframes kiniHeroTwinkle{0%,100%{opacity:.2;transform:scale(1)}50%{opacity:.7;transform:scale(1.4)}}
          @keyframes kiniHeroShine{0%{transform:translateX(-140%) skewX(-18deg)}60%,100%{transform:translateX(360%) skewX(-18deg)}}
          .kini-hero-orb{animation:kiniHeroFloat 4s ease-in-out infinite}
          .kini-hero-btn{transition:transform .16s ease, box-shadow .16s ease}
          .kini-hero-btn:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 10px 24px rgba(0,0,0,.28)}
          .kini-hero-btn:active{transform:translateY(0) scale(.99)}
        `}</style>
        {/* Moving light sweep */}
        <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 90, pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
          animation: 'kiniHeroShine 6s ease-in-out infinite' }} />
        {/* Floating twinkle dots */}
        {[{ top: 14, left: '46%', s: 6, d: '0s' }, { top: 60, left: '62%', s: 4, d: '1.1s' }, { top: 26, left: '78%', s: 5, d: '0.5s' }, { bottom: 16, left: '88%', s: 7, d: '1.6s' }].map((p, i) => (
          <span key={i} aria-hidden style={{ position: 'absolute', top: (p as any).top, bottom: (p as any).bottom, left: p.left,
            width: p.s, height: p.s, borderRadius: 999, background: '#fff', pointerEvents: 'none',
            animation: `kiniHeroTwinkle 2.6s ease-in-out ${p.d} infinite` }} />
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div className="kini-hero-orb" style={{ width: 54, height: 54, borderRadius: 15, background: 'rgba(255,255,255,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.2)' }}>
            <KiniMascot size={42} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>Build the {entity} form with KINI AI</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.92)', maxWidth: 640, lineHeight: 1.5, marginTop: 2 }}>
              Describe your business in plain English — KINI asks a few clarifying questions, then designs a
              comprehensive set of custom fields you can review and edit before adding.
            </div>
          </div>
        </div>
        <button className="kini-hero-btn" onClick={() => setShowBuilder(true)} style={{ background: '#fff', color: 'var(--k-red)', border: 'none',
          padding: '10px 18px', borderRadius: 11, fontWeight: 800, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <KiniMascot size={22} /> Generate with KINI
        </button>
      </div>

      {showBuilder && (
        <KiniFormBuilder
          entity={entity}
          existingKeys={items.filter((i) => i.entity_type === entity).map((i) => i.field_key)}
          onClose={() => setShowBuilder(false)}
          onAccept={acceptBuilderFields}
        />
      )}
      </>)}

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
        {TYPES_REQUIRING_OPTIONS.has(fieldType) && !(fieldType === 'select' && fromProducts) && (
          <input value={optionsRaw} onChange={(e) => setOptionsRaw(e.target.value)} placeholder="Comma-separated options (e.g. Hot, Warm, Cold)" style={{ ...input, width: '100%', marginBottom: 8 }} />
        )}
        {fieldType === 'select' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
              <input type="checkbox" checked={searchable || fromProducts} disabled={fromProducts} onChange={(e) => setSearchable(e.target.checked)} />
              Searchable <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>(type to filter — for long lists such as crops)</span>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
              <input type="checkbox" checked={fromProducts} onChange={(e) => setFromProducts(e.target.checked)} />
              Options from Products <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>(product names only — no prices)</span>
            </label>
          </div>
        )}
        {fieldType === 'image' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
              Photo source
              <select value={captureSource} onChange={(e) => setCaptureSource(e.target.value as 'both' | 'camera')} style={input}>
                <option value="both">Camera or gallery</option>
                <option value="camera">Camera only (no gallery)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
              Camera
              <select value={cameraFacing} onChange={(e) => setCameraFacing(e.target.value as 'back' | 'front')} style={input}>
                <option value="back">Back camera</option>
                <option value="front">Front camera</option>
              </select>
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'end', paddingBottom: 6 }}>
              Applies on mobile apps and mobile web. Desktop browsers show a file dialog.
            </div>
          </div>
        )}
        {fieldType === 'lookup' && (
          <LookupConfig
            target={targetTable}
            onTargetChange={setTargetTable}
            filter={lookupFilter}
            onFilterChange={setLookupFilter}
            targets={lookupTargets}
          />
        )}
        {fieldType === 'formula' && (
          <div style={{ marginBottom: 8 }}>
            {/* Available fields for this entity — click to insert {field_key} */}
            {(() => {
              const available = items.filter(
                (f) => f.entity_type === entity && f.field_type !== 'formula' && !f.hidden,
              );
              if (available.length === 0) return (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                  No other custom fields for <strong>{entity}</strong> yet. Create them first, then reference them here.
                </div>
              );
              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4 }}>
                    Click a field to insert it into the formula:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {available.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        title={`Insert {${f.field_key}}`}
                        onClick={() => {
                          const el = formulaInputRef.current;
                          if (!el) { setFormula((prev) => prev + `{${f.field_key}}`); return; }
                          const start = el.selectionStart ?? formula.length;
                          const end   = el.selectionEnd   ?? formula.length;
                          const insert = `{${f.field_key}}`;
                          const next = formula.slice(0, start) + insert + formula.slice(end);
                          setFormula(next);
                          // Restore cursor after the inserted token.
                          requestAnimationFrame(() => {
                            el.focus();
                            el.setSelectionRange(start + insert.length, start + insert.length);
                          });
                        }}
                        style={{
                          padding: '3px 9px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                          border: '1px solid var(--primary)', background: 'var(--s3)',
                          color: 'var(--primary)', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        }}
                      >
                        {'{' + f.field_key + '}'} <span style={{ fontWeight: 400, fontFamily: 'inherit', color: 'var(--text-dim)' }}>{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <input
              ref={formulaInputRef}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder='e.g. {price} * {qty}   or   ROUND(({revenue} - {cost}) / {revenue} * 100, 1)'
              style={{ ...input, width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Operators: <code>+ - * /</code> and <code>(  )</code>. Functions: <code>IF(cond, then, else)</code>, <code>MIN(a, b, …)</code>, <code>MAX(a, b, …)</code>, <code>ROUND(value, decimals)</code>.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
          </label>
        </div>
        {/* Lead-segment scope. A lead form has a B2C branch and a B2B branch;
            this picks which the field shows on. Only shown for lead fields —
            other entities have no B2C/B2B split. */}
        {entity === 'lead' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>
              Show on lead segment
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([
                { v: 'both', label: 'Both' },
                { v: 'b2c', label: leadFormCfg.segmentLabels.b2c ? `${leadFormCfg.segmentLabels.b2c} only` : 'B2C only (e.g. farmer)' },
                { v: 'b2b', label: leadFormCfg.segmentLabels.b2b ? `${leadFormCfg.segmentLabels.b2b} only` : 'B2B only (e.g. distributor/retailer)' },
              ] as const).map((o) => {
                const on = appliesTo === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setAppliesTo(o.v)}
                    style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                      background: on ? 'var(--primary)' : 'var(--s3)', color: on ? '#fff' : 'var(--text)' }}
                  >
                    {on ? '✓ ' : ''}{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!isMasterAdmin && roles.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>
              Show to roles <span style={{ fontWeight: 400 }}>(none selected = everyone)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {roles.map((r) => {
                const on = pickedRoles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPickedRoles((prev) => on ? prev.filter((x) => x !== r.id) : [...prev, r.id])}
                    style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                      background: on ? 'var(--primary)' : 'var(--s3)', color: on ? '#fff' : 'var(--text)' }}
                  >
                    {on ? '✓ ' : ''}{r.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding…' : '+ Add Field'}</button>
      </div>

      {/* Field list */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Fields ({totalSystem + totalCustom} total — {totalSystem} system, {totalCustom} custom)
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--primary)',
            background: 'rgba(0,102,255,0.08)', padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--primary)', fontWeight: 600,
          }}>
            <GripIcon size={12} />
            Drag the grip or use the arrows to reorder any field (system or custom)
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

        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
          System and custom fields share <strong style={{ color: 'var(--text)' }}>one order per entity</strong>. Drag a row by its grip, or use the
          {' '}<strong style={{ color: 'var(--text)' }}>▲ ▼ arrows</strong> (works on touch screens too), to put fields in any order — they can be mixed freely.
          The order applies to the create and edit forms on the web dashboard, and the mobile apps show custom fields in this order.
          Until you reorder an entity its forms look exactly as before. Ordering is the same for B2B and B2C.
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
                <th style={{ ...th, width: 96, textAlign: 'center', fontSize: 9 }} title="Drag rows, or use the arrows, to reorder">SORT</th>
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
              {groups.map((g) => {
                const shown = g.rows.filter(isShown);
                return (
                  <Fragment key={`group-${g.entity}`}>
                    {filter === 'all' && (
                      <tr>
                        <td colSpan={8} style={{ ...td, background: 'var(--s3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {g.entity}
                          <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
                            {g.ordered ? 'custom order' : 'default order'}
                          </span>
                        </td>
                      </tr>
                    )}
                    {shown.map((row) => {
                      const isDragging = dragId === row.rid;
                      // Only rows of the SAME entity are valid drop targets.
                      const isOver = overId === row.rid && !!dragId && dragId !== row.rid && entityOfRid(dragId) === g.entity;
                      const canUp = canStep(g.rows, row.rid, -1, isShown);
                      const canDown = canStep(g.rows, row.rid, 1, isShown);
                      const isBuiltin = row.kind === 'builtin';
                      const f = isBuiltin ? g.defByKey.get(row.ref) : undefined;
                      const c = !isBuiltin ? g.byId.get(row.ref) : undefined;
                      if (!f && !c) return null;

                      // Built-in row facts (override-aware) or custom row facts.
                      const ov = f ? effectiveOverride(g.entity, f.key) : {};
                      const effLabel = f ? (ov.label ?? f.label) : (c as CustomField).label;
                      const effRequired = f ? (ov.required ?? !!f.required) : !!(c as CustomField).required;
                      const effHidden = f ? (ov.hidden ?? false) : false;
                      // Only label / required / hidden count as "edited": the position in the order is not an edit.
                      const overridden = !!f && (ov.label !== undefined || ov.required !== undefined || ov.hidden !== undefined);
                      const saving = !!f && savingOverride === writeKey(g.entity, f.key);
                      const accent = isBuiltin ? '#6366f1' : 'var(--primary)';
                      const arrowBtn = (disabled: boolean): React.CSSProperties => ({
                        width: 22, height: 22, padding: 0, lineHeight: 1, fontSize: 11, borderRadius: 5,
                        border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)',
                        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
                      });
                      return (
                        <tr
                          key={row.rid}
                          data-testid={`field-row-${g.entity}-${isBuiltin ? f!.key : c!.field_key}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', row.rid);
                            setDragId(row.rid);
                          }}
                          onDragOver={(e) => {
                            // Accept only rows of the same entity (system and custom rows mix freely).
                            if (!dragId || entityOfRid(dragId) !== g.entity) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (overId !== row.rid) setOverId(row.rid);
                          }}
                          onDragLeave={() => { if (overId === row.rid) setOverId(null); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/plain') || dragId || '';
                            setDragId(null); setOverId(null);
                            if (id && entityOfRid(id) === g.entity) reorderTo(g.entity, id, row.rid);
                          }}
                          onDragEnd={() => { setDragId(null); setOverId(null); }}
                          style={{
                            opacity: isDragging ? 0.4 : (effHidden ? 0.55 : 1),
                            // Soft top border on the hovered row so the drop target is obvious.
                            borderTop: isOver ? '2px solid var(--primary)' : undefined,
                            background: isOver ? 'rgba(0,102,255,0.05)' : undefined,
                            cursor: reordering ? 'wait' : 'grab',
                          }}
                        >
                          <td
                            style={{
                              ...td, width: 96, textAlign: 'center', verticalAlign: 'middle',
                              userSelect: 'none',
                              cursor: reordering ? 'wait' : 'grab',
                              background: isOver ? 'rgba(0,102,255,0.28)' : (isBuiltin ? 'rgba(99,102,241,0.12)' : 'rgba(0,102,255,0.12)'),
                              borderRight: '1px solid var(--border)',
                              padding: 0,
                            }}
                            title="Drag to reorder this field, or use the arrows"
                          >
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, borderRadius: 6,
                                background: accent, color: '#fff',
                              }}>
                                <GripIcon size={14} />
                              </div>
                              <button
                                type="button"
                                aria-label="Move up"
                                title="Move up"
                                disabled={!canUp || reordering}
                                onClick={() => stepRow(g.entity, row.rid, -1)}
                                style={arrowBtn(!canUp || reordering)}
                              >▲</button>
                              <button
                                type="button"
                                aria-label="Move down"
                                title="Move down"
                                disabled={!canDown || reordering}
                                onClick={() => stepRow(g.entity, row.rid, 1)}
                                style={arrowBtn(!canDown || reordering)}
                              >▼</button>
                            </div>
                          </td>
                          <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{g.entity}</span></td>
                          <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{f ? f.key : c!.field_key}</code></td>
                          <td style={td}>
                            {effLabel}
                            {f && overridden && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: '#f59e0b15', color: '#f59e0b', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>edited</span>}
                            {f && effHidden && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: 'var(--s3)', color: 'var(--text-dim)', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>hidden</span>}
                            {c && c.entity_type === 'lead' && (c.applies_to === 'b2b' || c.applies_to === 'b2c') && (
                              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text-dim)' }}>
                                {segmentName(leadFormCfg, c.applies_to)} only
                              </span>
                            )}
                          </td>
                          <td style={td}>{f ? f.type : (TYPE_LABELS[c!.field_type] ?? c!.field_type)}</td>
                          <td style={td}>{effRequired ? '✓' : ''}</td>
                          <td style={td}>
                            {f
                              ? <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#6366f115', color: '#6366f1' }}>System</span>
                              : <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b' }}>Custom</span>}
                          </td>
                          <td style={td}>
                            {f ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => setEditing({ entity: g.entity, key: f.key, label: effLabel, required: effRequired, hidden: effHidden })}
                                  disabled={saving}
                                  style={btnSmall}
                                >
                                  {saving ? '…' : 'Edit'}
                                </button>
                                {overridden && (
                                  <button
                                    onClick={() => resetOverride(g.entity, f.key)}
                                    disabled={saving}
                                    style={btnSmallGhost}
                                    title="Reset label / required / hidden to the system default (keeps its position)"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                <button onClick={() => startEditCustom(c!)} disabled={!!busy[c!.id]} style={{ ...btnSmall, marginRight: 6 }}>Edit</button>
                                <button onClick={() => remove(c!)} disabled={!!busy[c!.id]} style={{ ...btnSmallDanger, opacity: busy[c!.id] ? 0.5 : 1 }}>{busy[c!.id] ? '...' : 'Delete'}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {totalCustom === 0 && (
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
                        Custom fields you add appear here and can be dragged (or moved with the arrows) between the system fields.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
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
              Three things about this system field are configurable here: the <strong style={{ color: 'var(--text)' }}>display label</strong> (rename without changing the API contract), whether it's <strong style={{ color: 'var(--text)' }}>required</strong> in forms, and whether the field is <strong style={{ color: 'var(--text)' }}>visible at all</strong>. The underlying database column, field key, and type stay unchanged — existing data is preserved either way. Its position on the form is set by dragging it (or using the arrows) in the list, and is not affected by this dialog.
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

            {TYPES_REQUIRING_OPTIONS.has(editingCustom.field_type) && !(editingCustom.field_type === 'select' && editingCustom.fromProducts) && (
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
            {editingCustom.field_type === 'select' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
                  <input type="checkbox" checked={editingCustom.searchable || editingCustom.fromProducts} disabled={editingCustom.fromProducts} onChange={(e) => setEditingCustom({ ...editingCustom, searchable: e.target.checked })} />
                  Searchable
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
                  <input type="checkbox" checked={editingCustom.fromProducts} onChange={(e) => setEditingCustom({ ...editingCustom, fromProducts: e.target.checked })} />
                  Options from Products <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>(names only)</span>
                </label>
              </div>
            )}
            {editingCustom.entity_type === 'lead' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Show on lead type</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([
                    { v: 'both', label: 'Both' },
                    { v: 'b2c', label: segmentName(leadFormCfg, 'b2c') + ' only' },
                    { v: 'b2b', label: segmentName(leadFormCfg, 'b2b') + ' only' },
                  ] as const).map((o) => {
                    const on = editingCustom.appliesTo === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setEditingCustom({ ...editingCustom, appliesTo: o.v })}
                        style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                          background: on ? 'var(--primary)' : 'var(--s3)', color: on ? '#fff' : 'var(--text)' }}
                      >
                        {on ? '✓ ' : ''}{o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {editingCustom.field_type === 'lookup' && (
              <LookupConfig
                target={editingCustom.targetTable}
                onTargetChange={(t) => setEditingCustom({ ...editingCustom, targetTable: t })}
                filter={editingCustom.lookupFilter}
                onFilterChange={(f) => setEditingCustom({ ...editingCustom, lookupFilter: f })}
                targets={lookupTargets}
              />
            )}
            {editingCustom.field_type === 'image' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Photo source</div>
                  <select
                    value={editingCustom.captureSource}
                    onChange={(e) => setEditingCustom({ ...editingCustom, captureSource: e.target.value as 'both' | 'camera' })}
                    style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                  >
                    <option value="both">Camera or gallery</option>
                    <option value="camera">Camera only (no gallery)</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Camera</div>
                  <select
                    value={editingCustom.cameraFacing}
                    onChange={(e) => setEditingCustom({ ...editingCustom, cameraFacing: e.target.value as 'back' | 'front' })}
                    style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                  >
                    <option value="back">Back camera</option>
                    <option value="front">Front camera</option>
                  </select>
                </div>
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
              <input type="checkbox" checked={editingCustom.required} onChange={(e) => setEditingCustom({ ...editingCustom, required: e.target.checked })} />
              Required field
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={editingCustom.hidden}
                onChange={(e) => setEditingCustom({ ...editingCustom, hidden: e.target.checked })}
              />
              Hide this field from forms
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                (data isn&rsquo;t deleted; the input just won&rsquo;t appear on the create/edit screens)
              </span>
            </label>

            {!isMasterAdmin && roles.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>
                  Show to roles <span style={{ fontWeight: 400 }}>(none = everyone)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {roles.map((r) => {
                    const on = editingCustom.org_role_ids.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setEditingCustom({ ...editingCustom, org_role_ids: on ? editingCustom.org_role_ids.filter((x) => x !== r.id) : [...editingCustom.org_role_ids, r.id] })}
                        style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                          background: on ? 'var(--primary)' : 'var(--s3)', color: on ? '#fff' : 'var(--text)' }}
                      >
                        {on ? '✓ ' : ''}{r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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

/**
 * Lookup configuration block — target object picker + simple AND-of-clauses
 * filter builder. Used in both the "Add Custom Field" create form and the
 * "Edit Custom Field" dialog so the wiring stays in one place. v1 supports
 * one operator per clause (equals / is not / contains / at-least / at-most);
 * Salesforce-style OR groups and per-type operator restrictions ship later.
 */
function LookupConfig({
  target, onTargetChange, filter, onFilterChange, targets,
}: {
  target: string;
  onTargetChange: (t: string) => void;
  filter: LookupClause[];
  onFilterChange: (f: LookupClause[]) => void;
  // Live list of lookup-eligible tables. Sourced from /lookup/targets so
  // new tables added to the database show up here without a code change.
  targets: Array<{ value: string; label: string }>;
}) {
  // Per-tenant people-directory types + cities — fetched once when the
  // admin chooses `people_directory` as the lookup target so they can
  // pick "Engineer" / "Architect" / a configured city from a dropdown
  // instead of typing the literal value. Every other person type the
  // admin adds in the future surfaces automatically.
  const [peopleTypes, setPeopleTypes] = useState<string[]>([]);
  const [peopleCities, setPeopleCities] = useState<string[]>([]);
  useEffect(() => {
    if (target !== 'people_directory') return;
    let cancelled = false;
    (async () => {
      try {
        const typesResp = await crmPeopleDirectoryTypes.list({ limit: 500 });
        const tnames = Array.from(new Set(((typesResp.data as Array<{ name?: string; is_active?: boolean }>) || [])
          .filter((t) => t.is_active !== false)
          .map((t) => (t.name ?? '').trim())
          .filter(Boolean)))
          .sort((a, b) => a.localeCompare(b));
        if (!cancelled) setPeopleTypes(tnames);
      } catch { /* tolerate — falls back to free-text */ }
      try {
        const locResp = await api.get<{ success?: boolean; data?: Array<{ city?: string; is_active?: boolean }> } | Array<{ city?: string; is_active?: boolean }>>('/api/v1/crm/locations');
        const arr = Array.isArray(locResp) ? locResp : (locResp.data ?? []);
        const cnames = Array.from(new Set(arr
          .filter((row) => row.is_active !== false)
          .map((row) => (row.city ?? '').trim())
          .filter(Boolean)))
          .sort((a, b) => a.localeCompare(b));
        if (!cancelled) setPeopleCities(cnames);
      } catch { /* tolerate */ }
    })();
    return () => { cancelled = true; };
  }, [target]);
  const updateRow = (idx: number, patch: Partial<LookupClause>) => {
    onFilterChange(filter.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const addRow = () => onFilterChange([...filter, { field: '', op: 'eq', value: '' }]);
  const removeRow = (idx: number) => onFilterChange(filter.filter((_, i) => i !== idx));
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Linked Record settings</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
        Picks which object this lookup field points at, and optionally narrows the records that show in the picker.
      </div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Linked object</label>
      <select value={target} onChange={(e) => onTargetChange(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12 }}>
        <option value="">— Choose an object —</option>
        {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {target && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
            Filter (optional) — only records matching <strong>all</strong> of these conditions appear in the picker.
          </div>
          {(() => {
            // Per-target column catalog. If the admin picks a target we
            // haven't curated yet, fall back to a free-text field so we
            // never block the form — but keep the warning visible.
            const cols = LOOKUP_FIELDS[target];
            return filter.map((c, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr auto', gap: 6, marginBottom: 6 }}>
                {cols ? (
                  <select
                    value={c.field}
                    onChange={(e) => updateRow(idx, { field: e.target.value })}
                    style={input}
                  >
                    <option value="">— Choose column —</option>
                    {cols.map((col) => (
                      <option key={col.value} value={col.value}>{col.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={c.field}
                    onChange={(e) => updateRow(idx, { field: e.target.value })}
                    placeholder="Column on the linked object (e.g. status)"
                    style={input}
                  />
                )}
                <select value={c.op} onChange={(e) => updateRow(idx, { op: e.target.value })} style={input}>
                  {LOOKUP_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {(() => {
                  // Pre-load a select of legal values when the field
                  // has a known catalog. Today: people_directory's
                  // `type` (Engineer / Architect / Dealer / …) +
                  // `city` (per-tenant Locations). Falls back to a
                  // free-text input for everything else so this stays
                  // forward-compatible with arbitrary clauses.
                  const useTypesDropdown = target === 'people_directory' && c.field === 'type' && peopleTypes.length > 0;
                  const useCitiesDropdown = target === 'people_directory' && c.field === 'city' && peopleCities.length > 0;
                  if (useTypesDropdown || useCitiesDropdown) {
                    const opts = useTypesDropdown ? peopleTypes : peopleCities;
                    return (
                      <select
                        value={c.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        style={input}
                      >
                        <option value="">— Select —</option>
                        {/* Preserve a previously-saved value that's
                            no longer in the catalog (renamed / removed)
                            so the rep doesn't lose context. */}
                        {c.value && !opts.includes(c.value) && (
                          <option value={c.value}>{c.value} (legacy)</option>
                        )}
                        {opts.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    );
                  }
                  return (
                    <input
                      value={c.value}
                      onChange={(e) => updateRow(idx, { value: e.target.value })}
                      placeholder="Value"
                      style={input}
                    />
                  );
                })()}
                <button
                  onClick={() => removeRow(idx)}
                  title="Remove condition"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, cursor: 'pointer', padding: '0 10px', fontSize: 13 }}
                >×</button>
              </div>
            ));
          })()}
          <button
            onClick={addRow}
            style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--primary)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >+ Add condition</button>
        </>
      )}
    </div>
  );
}
