'use client';
import { useEffect, useState } from 'react';
import { crmCustomFields, crmLookup } from '../../lib/crmApi';
import type { CustomField } from '../../types/crm';

/**
 * Read-only "Custom Fields" card for the deal / contact / account detail
 * pages. Self-fetches the entity's custom-field definitions, then renders
 * label + value for each def whose key exists on the row's custom_fields
 * jsonb. Renders nothing when there are no defs or no stored values, so
 * pages can drop it in unconditionally.
 *
 * Lookup values stored as bare UUIDs are hydrated to display labels the
 * same way LeadDetailsPanel does: an exact `ids` list per target table via
 * /lookup/search, which bypasses the per-user city/district gate so rows
 * outside the viewer's scope still resolve to a name.
 */
interface Props {
  entity: CustomField['entity_type'];
  customFields?: Record<string, unknown> | null;
  /** Keys the host page already renders specially (e.g. the deal page's
      product / next-action keys) — skipped here so they don't double-render. */
  skipKeys?: string[];
}

export default function CustomFieldsDetailCard({ entity, customFields, skipKeys }: Props) {
  const [defs, setDefs] = useState<CustomField[]>([]);
  // Generic lookup resolution — keyed by `${target_table}:${id}` → display
  // label. Populated lazily once we know which lookup defs the entity has
  // AND which UUIDs the row stores in custom_fields.
  const [lookupLabels, setLookupLabels] = useState<Map<string, string>>(new Map());

  const cf: Record<string, unknown> = (customFields && typeof customFields === 'object')
    ? customFields as Record<string, unknown>
    : {};

  useEffect(() => {
    let cancelled = false;
    crmCustomFields.list()
      .then((r) => {
        if (cancelled) return;
        const all = (r.data || []) as CustomField[];
        setDefs(
          all
            .filter((d) => d.entity_type === entity
              && !d.hidden
              // is_active isn't on the CustomField type (only some rows
              // carry it) — treat anything but an explicit false as active.
              && (d as CustomField & { is_active?: boolean }).is_active !== false)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        );
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [entity]);

  // Resolve every lookup field's stored UUID → display label. We send the
  // exact UUID list per target so /lookup/search bypasses its per-user
  // city/district gate — same rationale as LeadDetailsPanel.
  useEffect(() => {
    let cancelled = false;
    const idsByTarget = new Map<string, Set<string>>();
    for (const def of defs) {
      if (def.field_type !== 'lookup' || !def.target_table) continue;
      const v = cf[def.field_key];
      let id: string | null = null;
      if (typeof v === 'string' && v) {
        id = v;
      } else if (v && typeof v === 'object') {
        const o = v as { id?: string; label?: string };
        if (o.id && !o.label) id = o.id;
      }
      if (!id) continue;
      const set = idsByTarget.get(def.target_table) ?? new Set<string>();
      set.add(id);
      idsByTarget.set(def.target_table, set);
    }
    if (idsByTarget.size === 0) return;
    (async () => {
      const next = new Map<string, string>();
      for (const [target, ids] of idsByTarget) {
        try {
          const r = await crmLookup.search({ target, ids: Array.from(ids) });
          for (const hit of (r.data || [])) {
            next.set(`${target}:${hit.id}`, hit.label);
          }
        } catch { /* non-fatal — leaves the UUID visible for that target */ }
      }
      if (!cancelled) setLookupLabels(next);
    })();
    return () => { cancelled = true; };
  }, [defs, cf]);

  const skip = new Set(skipKeys ?? []);
  const rows: Array<{ key: string; label: string; node: React.ReactNode }> = defs
    .filter((def) => !skip.has(def.field_key))
    .map((def) => {
      const val = cf[def.field_key];
      if (val === undefined || val === null || val === '') return null;
      // Lookup fields can be stored as either a raw UUID string (legacy
      // writes) OR `{ id, label, target_table }` (current shape). Prefer
      // the inline label; otherwise resolve via the per-target map.
      if (def.field_type === 'lookup' && def.target_table) {
        const obj = (val && typeof val === 'object') ? (val as { id?: string; label?: string }) : null;
        const id = obj?.id ?? (typeof val === 'string' ? val : null);
        if (id) {
          const label = obj?.label || lookupLabels.get(`${def.target_table}:${id}`);
          if (label) return { key: def.field_key, label: def.label || def.field_key, node: label };
          // Fall through to formatValue for the un-resolved UUID so we
          // still render something while the fetch is in flight.
        }
      }
      const node = formatValue(val, def.field_type);
      if (node === null) return null;
      return { key: def.field_key, label: def.label || def.field_key, node };
    })
    .filter((r): r is { key: string; label: string; node: React.ReactNode } => r !== null);

  if (rows.length === 0) return null;

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Custom Fields</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{r.label}</div>
            <div style={{ color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{r.node}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Type-aware value renderer — mirrors LeadDetailsPanel's formatCustomValue.
function formatValue(v: unknown, type: CustomField['field_type']): React.ReactNode {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'date' || type === 'datetime') {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', ...(type === 'datetime' ? { timeStyle: 'short' } : {}) });
  }
  if (type === 'boolean') {
    return (
      <span style={{
        display: 'inline-block',
        background: v ? '#d1fae5' : '#fee2e2',
        color: v ? '#065f46' : '#991b1b',
        padding: '1px 8px', borderRadius: 999,
        fontSize: 12, fontWeight: 600,
      }}>
        {v ? 'Yes' : 'No'}
      </span>
    );
  }
  if (type === 'multiselect') {
    if (!Array.isArray(v)) return String(v);
    return (
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {v.map((it) => (
          <span key={String(it)} style={{
            background: 'var(--s3)', color: 'var(--text)',
            padding: '2px 9px', borderRadius: 999,
            fontSize: 12, fontWeight: 500, border: '1px solid var(--border)',
          }}>
            {String(it)}
          </span>
        ))}
      </span>
    );
  }
  if (type === 'currency') return `₹${Number(v).toLocaleString('en-IN')}`;
  if (type === 'number') return Number(v).toLocaleString('en-IN');
  if (type === 'url' || type === 'file') return (
    <a href={String(v)} target="_blank" rel="noreferrer"
      style={{ color: 'var(--primary)', textDecoration: 'none' }}>
      {type === 'file' ? 'View attached file' : String(v)} ↗
    </a>
  );
  if (type === 'image') return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={String(v)} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} />
  );
  if (type === 'lookup') {
    const obj = v as { label?: string; id?: string };
    return obj && typeof obj === 'object' && obj.label
      ? obj.label
      : (obj?.id
        ? <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{obj.id}</span>
        : String(v));
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
