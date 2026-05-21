'use client';
import { useEffect, useState } from 'react';
import { crmCustomFields } from '../../lib/crmApi';
import type { CustomField } from '../../types/crm';

/**
 * Renders the active custom fields for a given entity (lead / contact /
 * account / deal) and lets the parent form bind their values via a
 * single `values` object (the row's `custom_fields` jsonb column).
 *
 * Loads the field defs from /api/v1/crm/custom-fields, filters by
 * entity_type, and renders one input per def using the right control
 * (text/number/date/select/multiselect/boolean). Empty when no custom
 * fields are configured — no extra section header in that case so the
 * form stays clean.
 *
 * The component is intentionally stateless beyond its fetch: the
 * parent owns `values` and updates flow via `onChange(nextValues)`.
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
        const r = await crmCustomFields.list();
        if (cancel) return;
        const all = (r.data || []) as CustomField[];
        const visible = all
          .filter((f) => f.entity_type === entity)
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
    onChange({ ...values, [key]: value });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Custom Fields
      </div>
      <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {fields.map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              value={values[f.field_key]}
              onChange={(v) => set(f.field_key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const t = field.field_type;
  const options = Array.isArray(field.options) ? field.options : [];

  if (t === 'boolean') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
          {field.label}{field.required && <span style={{ color: '#E01E2C', marginLeft: 4 }}>*</span>}
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Yes</span>
        </label>
      </label>
    );
  }

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

  if (t === 'multiselect') {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Wrap field={field}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => {
            const checked = arr.includes(o);
            return (
              <button
                type="button"
                key={o}
                onClick={() => onChange(checked ? arr.filter((x) => x !== o) : [...arr, o])}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                  background: checked ? 'var(--primary)' : 'var(--s2)',
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

  // number / date / text fallthrough — same shape, different input type.
  return (
    <Wrap field={field}>
      <input
        type={t === 'number' ? 'number' : t === 'date' ? 'date' : 'text'}
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

function Wrap({ field, children }: { field: CustomField; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {field.label}
        {field.required && <span style={{ color: '#E01E2C', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13,
};
