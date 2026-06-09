'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields, crmLookup, type LookupHit } from '../../lib/crmApi';
import api from '../../lib/api';
import { getStoredToken } from '../../lib/auth';
import { API_BASE_URL } from '../../lib/api';
import type { CustomField } from '../../types/crm';

/**
 * Renders the active custom fields for a given entity (lead / contact /
 * account / deal) inline — as just a grid of inputs, no enclosing
 * section box or heading, so the fields look like part of the main
 * form rather than a separate appendix. The parent form binds values
 * via a single `values` object (the row's `custom_fields` jsonb).
 *
 * Supported field types (matches the backend zod enum):
 *
 *   text        single-line text
 *   longtext    multi-line textarea
 *   number      numeric
 *   currency    numeric with ₹ prefix
 *   boolean     checkbox
 *   date        native date input
 *   datetime    native datetime-local input
 *   select      single-select dropdown
 *   multiselect chip-toggle multi-select
 *   radio       single-select radio buttons (same data as select)
 *   url         URL input with native validation
 *   email       email input with native validation
 *   phone       10-digit Indian mobile
 *   image       file picker → /api/v1/upload/photo, stores URL
 *   file        file picker → /api/v1/upload/material, stores URL
 */
interface Props {
  entity: CustomField['entity_type'];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function CustomFieldsSection({ entity, values, onChange }: Props) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // Resolve the current user's org role so we can show only the custom
        // fields targeted at their role (plus universal/untagged fields).
        const [r, meRes] = await Promise.allSettled([
          crmCustomFields.list(),
          api.get<{ data?: { org_role_id?: string | null } }>('/api/v1/auth/me'),
        ]);
        if (cancel) return;
        const myRoleId = meRes.status === 'fulfilled'
          ? (((meRes.value as { data?: { org_role_id?: string | null } })?.data?.org_role_id) ?? null)
          : null;
        const all = (r.status === 'fulfilled' ? (r.value.data || []) : []) as CustomField[];
        const visible = all
          .filter((f) => f.entity_type === entity)
          // A field with no org_role_ids is universal; otherwise it must list
          // the user's role. Admins/users with no resolved role see universal
          // fields only (role-scoped fields stay with their roles).
          .filter((f) => {
            const roles = f.org_role_ids;
            if (!roles || roles.length === 0) return true;
            return !!myRoleId && roles.includes(myRoleId);
          })
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        setFields(visible);
      } catch {
        setFields([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [entity]);

  if (loading || fields.length === 0) return null;

  const set = (key: string, value: unknown) => {
    // Strip undefined / empty so the row's custom_fields jsonb stays
    // compact (no { brand: undefined } artefacts on the server).
    const next = { ...values };
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <>
      {fields.map((f) => (
        <FieldInput
          key={f.id}
          field={f}
          value={values[f.field_key]}
          onChange={(v) => set(f.field_key, v)}
        />
      ))}
    </>
  );
}

function FieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const t = field.field_type;
  const options = Array.isArray(field.options) ? field.options : [];

  // ── Boolean ─────────────────────────────────────────────────────
  if (t === 'boolean') {
    return (
      <Wrap field={field}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{value === true ? 'Yes' : 'No'}</span>
        </label>
      </Wrap>
    );
  }

  // ── Select ──────────────────────────────────────────────────────
  if (t === 'select') {
    return (
      <Wrap field={field}>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          style={inputStyle}
        >
          <option value="">— Select —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Wrap>
    );
  }

  // ── Radio (same data as select, different control) ──────────────
  if (t === 'radio') {
    return (
      <Wrap field={field}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {options.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No options configured.</span>
          ) : options.map((o) => (
            <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`cf_${field.id}`}
                value={o}
                checked={value === o}
                onChange={() => onChange(o)}
              />
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{o}</span>
            </label>
          ))}
        </div>
      </Wrap>
    );
  }

  // ── Multiselect chips ────────────────────────────────────────────
  if (t === 'multiselect') {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Wrap field={field}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No options configured.</span>
          ) : options.map((o) => {
            const checked = arr.includes(o);
            return (
              <button
                type="button"
                key={o}
                onClick={() => onChange(checked ? arr.filter((x) => x !== o) : [...arr, o])}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                  background: checked ? 'var(--primary)' : 'var(--s3)',
                  color: checked ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      </Wrap>
    );
  }

  // ── Long-form text → textarea ────────────────────────────────────
  if (t === 'longtext') {
    return (
      <Wrap field={field} fullWidth>
        <textarea
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={3}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 64 }}
        />
      </Wrap>
    );
  }

  // ── Currency (numeric with ₹ prefix) ─────────────────────────────
  if (t === 'currency') {
    return (
      <Wrap field={field}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 13, pointerEvents: 'none' }}>₹</span>
          <input
            type="number"
            inputMode="decimal"
            value={value == null ? '' : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return onChange(undefined);
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : undefined);
            }}
            style={{ ...inputStyle, paddingLeft: 24 }}
          />
        </div>
      </Wrap>
    );
  }

  // ── Phone (10-digit Indian mobile) ───────────────────────────────
  if (t === 'phone') {
    return (
      <Wrap field={field}>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          pattern="\d{10}"
          value={value == null ? '' : String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
            onChange(digits || undefined);
          }}
          placeholder="10-digit mobile"
          style={inputStyle}
        />
      </Wrap>
    );
  }

  // ── Image / file uploaders ───────────────────────────────────────
  if (t === 'image' || t === 'file') {
    return <FileUploader field={field} value={value} onChange={onChange} />;
  }

  // ── Lookup (linked record) ───────────────────────────────────────
  // Stores the picked row's UUID in custom_fields[field_key]. The
  // picker UI calls /api/v1/crm/lookup/search with the field's
  // configured target_table + lookup_filter so only matching rows
  // appear. We persist (id, label) together as JSON so the lead detail
  // page can render the label without an extra round-trip — the
  // backend doesn't care, it stores the whole blob in the custom_fields
  // JSONB column.
  if (t === 'lookup') {
    return (
      <Wrap field={field} fullWidth>
        <LookupField field={field} value={value} onChange={onChange} />
      </Wrap>
    );
  }

  // ── date / datetime — separate path so we can open the native picker
  //     programmatically. Without this, the bare <input type="date"> only
  //     opens the calendar when the user taps the tiny calendar icon on
  //     the right edge — Android Chrome and iOS Safari users tapping the
  //     middle of the field see "nothing happen" and assume it's a text
  //     input. Calling showPicker() on every focus/click makes the
  //     calendar appear from any tap. The optional-chain (?.) handles
  //     older browsers (Safari <16, Firefox <101) where showPicker isn't
  //     implemented — the field still works as a normal date input there.
  if (t === 'date' || t === 'datetime') {
    return <DateField field={field} value={value} onChange={onChange} kind={t === 'date' ? 'date' : 'datetime-local'} />;
  }

  // ── number / url / email / text fallthrough ───────────────────────
  const htmlType = (() => {
    switch (t) {
      case 'number':   return 'number';
      case 'url':      return 'url';
      case 'email':    return 'email';
      default:         return 'text';
    }
  })();
  return (
    <Wrap field={field}>
      <input
        type={htmlType}
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          if (t === 'number') {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : undefined);
            return;
          }
          onChange(raw);
        }}
        style={inputStyle}
      />
    </Wrap>
  );
}

function DateField({
  field, value, onChange, kind,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  kind: 'date' | 'datetime-local';
}) {
  const ref = useRef<HTMLInputElement>(null);
  // showPicker() is a recent addition (~2022). Wrapped in try/catch
  // because some browsers throw if you call it when the input is
  // already focused or hidden — we never want a thrown error here to
  // block the click.
  const open = () => { try { ref.current?.showPicker?.(); } catch { /* noop */ } };
  return (
    <Wrap field={field}>
      <input
        ref={ref}
        type={kind}
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          onChange(raw);
        }}
        onClick={open}
        onFocus={open}
        style={{ ...inputStyle, cursor: 'pointer' }}
      />
    </Wrap>
  );
}

function FileUploader({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const isImage = field.field_type === 'image';
  const url = typeof value === 'string' ? value : '';

  const upload = async (f: File) => {
    if (isImage && !/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('File must be under 8 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      // Reuse the existing /upload/photo endpoint for images and
      // /upload/material for everything else. Multer expects the field
      // name `photo` on /upload/photo and `file` on /upload/material.
      const endpoint = isImage ? '/api/v1/upload/photo' : '/api/v1/upload/material';
      fd.append(isImage ? 'photo' : 'file', f);
      const token = getStoredToken();
      const r = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await r.json();
      const uploadedUrl = json?.data?.url || json?.url;
      if (!uploadedUrl) throw new Error(json?.error || json?.message || 'Upload failed');
      onChange(uploadedUrl);
      toast.success(isImage ? 'Image uploaded' : 'File uploaded');
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Wrap field={field} fullWidth>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--s3)', border: '1px dashed var(--border)',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
          cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1,
          color: 'var(--text)',
        }}>
          {uploading ? '⏳ Uploading…' : (isImage ? '📷 Upload Image' : '📎 Upload File')}
          <input
            type="file"
            accept={isImage ? 'image/*' : undefined}
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            style={{ display: 'none' }}
          />
        </label>
        {url && (
          <>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={field.label} style={{ maxWidth: 120, maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} />
            ) : (
              <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 12, textDecoration: 'underline' }}>
                View attached file ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => onChange(undefined)}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
            >
              Clear
            </button>
          </>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ field, children, fullWidth }: { field: CustomField; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      // Long-form / file rows span the whole grid row so they aren't
      // squeezed into a 220px column with the other inputs.
      gridColumn: fullWidth ? '1 / -1' : undefined,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {field.label}
        {field.required && <span style={{ color: '#E01E2C', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box',
};

/**
 * Linked-record picker for the `lookup` custom field type. Behaves like
 * the picker used elsewhere in the CRM (Lead → Owner, Deal → Stage):
 * a single-line trigger that opens a searchable dropdown of matching
 * rows from the target object the admin chose when authoring the field.
 *
 * Storage shape on the parent record: `{ id, label, target_table }`
 * persisted inside the parent's `custom_fields` JSONB. We keep the
 * label alongside the id so the row reads correctly on the detail
 * page without a second round-trip to resolve UUIDs.
 *
 * Filter and target come from the CustomField definition the admin
 * configured — see LookupConfig on the custom-fields settings page.
 */
function LookupField({
  field, value, onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const stored = (value && typeof value === 'object'
    ? value as { id?: string; label?: string; target_table?: string }
    : null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [loading, setLoading] = useState(false);
  const target = field.target_table || '';

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await crmLookup.search({
          target,
          q: q.trim() || undefined,
          filter: Array.isArray(field.lookup_filter) ? field.lookup_filter : undefined,
        });
        if (!cancelled) setHits(r.data || []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, q, target, field.lookup_filter]);

  if (!target) {
    return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>This lookup hasn't been configured yet — set its linked object in CRM Settings → Custom Fields.</div>;
  }

  const pick = (h: LookupHit) => {
    onChange({ id: h.id, label: h.label, target_table: target });
    setOpen(false);
    setQ('');
  };
  const clear = () => onChange(undefined);

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--s3)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 13, color: stored?.label ? 'var(--text)' : 'var(--text-dim)',
        }}
      >
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stored?.label || `Pick a ${LOOKUP_TARGET_LABELS[target] || 'record'}`}
        </span>
        {stored?.id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            title="Clear"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}
          >×</button>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>▾</span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 50, padding: 8, maxHeight: 320, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            style={{
              padding: '6px 10px', borderRadius: 6, background: 'var(--s2)',
              border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13,
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: 8, fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>}
            {!loading && hits.length === 0 && (
              <div style={{ padding: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                {q.trim() ? 'No matching records.' : 'No records — try typing a name.'}
              </div>
            )}
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => pick(h)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 6, background: 'transparent',
                  border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s2)'; }}
                onMouseOut={(e)  => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >{h.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mirrors the catalog on the custom-fields settings page so the
// picker label reads "Pick a Lead" / "Pick a People Directory entry"
// instead of a raw table name.
const LOOKUP_TARGET_LABELS: Record<string, string> = {
  crm_leads: 'Lead',
  crm_contacts: 'Contact',
  crm_accounts: 'Account',
  crm_deals: 'Deal',
  people_directory: 'People Directory entry',
};
