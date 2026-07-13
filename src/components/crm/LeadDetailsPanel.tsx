'use client';
import { useEffect, useMemo, useState } from 'react';
import SignedImage from '@/components/shared/SignedImage';
import { crmCustomFields, crmLookup, crmProducts } from '../../lib/crmApi';
import type { CustomField, Lead, Product } from '../../types/crm';
import { evaluateClientFormula } from './CustomFieldsSection';
import { PRODUCT_LINE_KEYS } from './ProductLinesSection';

interface LeadWithCustomFields extends Lead {
  custom_fields?: Record<string, unknown> | null;
  source_name?: string | null;
}

interface Props { lead: LeadWithCustomFields; }

// Accent colours per section — cycles through CSS vars so both light + dark themes work.
const SECTION_ACCENTS = [
  'var(--primary)',
  '#06b6d4',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#3b82f6',
  '#f97316',
];

export default function LeadDetailsPanel({ lead }: Props) {
  const isB2C = !!lead.is_b2c;
  const [customDefs, setCustomDefs] = useState<CustomField[]>([]);
  // Products catalogue — used to resolve lookup field UUIDs to display
  // names (e.g. product_interested) AND to render the multi-row
  // "Products of Interest" section. Loaded once on mount.
  const [products, setProducts] = useState<Product[]>([]);
  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // Generic lookup resolution — keyed by `${target_table}:${id}` → display
  // label. Populated lazily once we know which lookup defs the entity has
  // AND which UUIDs the row stores in custom_fields. Previously only
  // `crm_products` was special-cased, so a Block / Dealer / People-Directory
  // lookup field rendered as a raw UUID on the detail panel.
  const [lookupLabels, setLookupLabels] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    crmCustomFields.list()
      .then((r) => {
        if (cancelled) return;
        const all = (r.data || []) as CustomField[];
        // Honour the admin's drag-reorder. The backend list already
        // ORDER BYs `position`, but a defensive client-side sort keeps
        // the rendering stable across cached responses, partial
        // updates, and filter chains.
        setCustomDefs(
          all
            .filter((d) => d.entity_type === 'lead' && !d.hidden)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        );
      })
      .catch(() => { /* non-fatal */ });
    crmProducts.list()
      .then((r) => { if (!cancelled) setProducts(r.data || []); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  const cf = (lead.custom_fields && typeof lead.custom_fields === 'object')
    ? lead.custom_fields as Record<string, unknown>
    : {};

  // Resolve every lookup field's stored UUID → display label. We send
  // the exact UUID list per target so /lookup/search bypasses its
  // per-user city/district gate — a Champion viewing a lead whose
  // dealer is in another city still gets the dealer's name resolved.
  // Without `ids`, the picker mode returned at most 500 rows in the
  // viewer's effective cities, so labels for out-of-scope rows came
  // back as raw UUIDs.
  useEffect(() => {
    let cancelled = false;
    const idsByTarget = new Map<string, Set<string>>();
    for (const def of customDefs) {
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
  }, [customDefs, cf]);

  const altMobiles = Array.isArray(lead.alternate_mobiles) ? lead.alternate_mobiles : [];
  const tags = Array.isArray(lead.tags) ? lead.tags : [];

  const mapHref = (lead.latitude != null && lead.longitude != null)
    ? `https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`
    : null;

  // Email + Primary Mobile are already shown in the page header — skip here.
  const contactItems: Array<[string, React.ReactNode]> = [
    ['Alternate Mobiles', altMobiles.length ? <ChipList items={altMobiles} /> : null],
    ['Preferred Channel', lead.preferred_contact_method
      ? cap(lead.preferred_contact_method.replace(/_/g, ' '))
      : null],
  ];

  const businessItems: Array<[string, React.ReactNode]> = [
    ['Company',   lead.company || null],
    ['Job Title', lead.title || null],
    ['Industry',  lead.industry || null],
  ];

  const personalItems: Array<[string, React.ReactNode]> = [
    ['Date of Birth', lead.date_of_birth ? formatDate(lead.date_of_birth) : null],
    ['Gender',        lead.gender ? cap(lead.gender.replace(/_/g, ' ')) : null],
  ];

  const addressItems: Array<[string, React.ReactNode]> = [
    ['Line 1',      lead.address_line1 || null],
    ['Line 2',      lead.address_line2 || null],
    ['City',        lead.city || null],
    ['State',       lead.state || null],
    ['Postal Code', lead.postal_code || null],
    ['Country',     lead.country || null],
    ['Map', (lead.latitude != null && lead.longitude != null) ? (
      <span>
        <Mono>{lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)}</Mono>
        {mapHref && (
          <> &nbsp;<a href={mapHref} target="_blank" rel="noreferrer"
            style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: 12 }}>
            View ↗
          </a></>
        )}
      </span>
    ) : null],
  ];

  // Status, Source, Owner, Created are already shown in the page header — skip here.
  const lifecycleItems: Array<[string, React.ReactNode]> = [
    ['Score',        lead.score != null
      ? <ScoreBadge score={lead.score} grade={lead.score_grade} />
      : null],
    ['Updated',      lead.updated_at ? formatDateTime(lead.updated_at) : null],
    ['Converted At', lead.converted_at ? formatDateTime(lead.converted_at) : null],
  ];

  const consentItems: Array<[string, React.ReactNode]> = [
    ['Marketing', formatConsent(lead.marketing_consent)],
    ['WhatsApp',  formatConsent(lead.whatsapp_consent)],
  ];

  const customItems: Array<[string, React.ReactNode]> = customDefs
    // Skip the four product-line keys — they get their own dedicated
    // "Products of Interest" section below with multi-row rendering.
    .filter((def) => !PRODUCT_LINE_KEYS.includes(def.field_key as typeof PRODUCT_LINE_KEYS[number]))
    .map((def) => {
      // Formula fields are computed live from the row's other custom
      // fields — there's no stored value, so we evaluate the
      // expression against `cf` and render the result read-only.
      if (def.field_type === 'formula') {
        const computed = evaluateClientFormula(def.formula || '', cf);
        if (!computed) return null;
        return [def.label || def.field_key, computed] as [string, React.ReactNode];
      }
      const val = cf[def.field_key];
      if (val === undefined || val === null || val === '') return null;
      // Lookup fields can be stored as either a raw UUID string (legacy
      // writes) OR `{ id, label, target_table }` (current shape). For
      // either form, resolve the display name via the per-target
      // lookupLabels map populated in the effect above. Products keep
      // their dedicated map because the catalogue is already loaded
      // separately for the multi-row product picker.
      if (def.field_type === 'lookup' && def.target_table) {
        const obj = (val && typeof val === 'object') ? (val as { id?: string; label?: string }) : null;
        const id = obj?.id ?? (typeof val === 'string' ? val : null);
        const inlineLabel = obj?.label;
        if (id) {
          if (inlineLabel) {
            return [def.label || def.field_key, inlineLabel] as [string, React.ReactNode];
          }
          if (def.target_table === 'crm_products') {
            const p = productMap.get(id);
            if (p?.name) return [def.label || def.field_key, p.name] as [string, React.ReactNode];
          }
          const resolved = lookupLabels.get(`${def.target_table}:${id}`);
          if (resolved) return [def.label || def.field_key, resolved] as [string, React.ReactNode];
          // Fall through to formatCustomValue for the un-resolved UUID
          // so we still render something while the fetch is in flight.
        }
      }
      return [def.label || def.field_key, formatCustomValue(val, def.field_type)] as [string, React.ReactNode];
    })
    .filter((row): row is [string, React.ReactNode] => row !== null);

  // Multi-row product picker — render product_lines as a stack of
  // (product, qty unit, amount) rows. Falls back to building a single
  // row from the legacy product_interested/quantity/measuring_unit/
  // estimated_amount scalars when product_lines hasn't been written yet.
  type ProductLineDisplay = { name: string; quantity?: number | string; unit?: string; amount?: number };
  const productLines: ProductLineDisplay[] = useMemo(() => {
    const rawLines = cf.product_lines;
    if (Array.isArray(rawLines) && rawLines.length > 0) {
      return (rawLines as Array<Record<string, unknown>>).map((r) => {
        const id = typeof r.product_id === 'string' ? r.product_id : '';
        const p = id ? productMap.get(id) : undefined;
        return {
          name: p?.name ?? (id ? id.slice(0, 8) : 'Unknown product'),
          quantity: (r.quantity as number | string | undefined),
          unit: typeof r.measuring_unit === 'string' ? r.measuring_unit : undefined,
          amount: typeof r.estimated_amount === 'number' ? r.estimated_amount : undefined,
        };
      }).filter((l) => l.name || l.quantity || l.amount);
    }
    const id = typeof cf.product_interested === 'string' ? cf.product_interested : '';
    if (!id && cf.quantity == null && cf.estimated_amount == null) return [];
    const p = id ? productMap.get(id) : undefined;
    return [{
      name: p?.name ?? (id ? id.slice(0, 8) : 'Unknown product'),
      quantity: cf.quantity as number | string | undefined,
      unit: typeof cf.measuring_unit === 'string' ? cf.measuring_unit : undefined,
      amount: typeof cf.estimated_amount === 'number' ? cf.estimated_amount : undefined,
    }];
  }, [cf, productMap]);

  const notesAndTagsItems: Array<[string, React.ReactNode]> = [
    ['Tags',  tags.length ? <ChipList items={tags} /> : null],
    ['Notes', lead.notes ? <NoteValue note={lead.notes} /> : null],
  ];

  // Render product_lines as one labelled item per line so the section
  // card stacks them readably with the same Key/Value treatment as the
  // other sections.
  const productItems: Array<[string, React.ReactNode]> = productLines.map((l, i) => {
    const label = productLines.length === 1 ? 'Product' : `Product ${i + 1}`;
    const qty = l.quantity != null && l.quantity !== '' ? `${l.quantity}${l.unit ? ` ${l.unit}` : ''}` : '';
    const amt = l.amount && l.amount > 0 ? `₹${Number(l.amount).toLocaleString('en-IN')}` : '';
    const tail = [qty, amt].filter(Boolean).join(' · ');
    return [label, tail ? `${l.name} — ${tail}` : l.name];
  });
  const basketTotal = productLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  if (productLines.length > 1 && basketTotal > 0) {
    productItems.push(['Basket Total', `₹${basketTotal.toLocaleString('en-IN')}`]);
  }

  const sections: Array<{ title: string; items: Array<[string, React.ReactNode]>; show: boolean }> = [
    { title: 'Contact Preferences',      items: contactItems,      show: true },
    { title: 'Business Details',        items: businessItems,     show: !isB2C },
    { title: 'Personal Details',        items: personalItems,     show: isB2C },
    { title: 'Address & Location',      items: addressItems,      show: true },
    { title: 'Products of Interest',    items: productItems,      show: productItems.length > 0 },
    { title: 'Score & Dates',            items: lifecycleItems,    show: true },
    { title: 'Custom Fields',           items: customItems,       show: customItems.length > 0 },
    { title: 'Consent & Preferences',   items: consentItems,      show: isB2C },
    { title: 'Notes & Tags',            items: notesAndTagsItems, show: true },
  ];

  const visible = sections.filter((s) => s.show);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {visible.map((s, i) => (
          <SectionCard
            key={s.title}
            title={s.title}
            items={s.items}
            accent={SECTION_ACCENTS[i % SECTION_ACCENTS.length]}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────

function SectionCard({
  title, items, accent,
}: {
  title: string;
  items: Array<[string, React.ReactNode]>;
  accent: string;
}) {
  const visible = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (visible.length === 0) return null;

  return (
    <div style={{
      background: 'var(--s2)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Header strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--s1)',
      }}>
        <span style={{
          display: 'inline-block',
          width: 3,
          height: 14,
          borderRadius: 2,
          background: accent,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}>
          {title}
        </span>
      </div>

      {/* Fields */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(([label, value]) => (
          <FieldRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Specialised value renderers ──────────────────────────────────

const STATUS_COLOURS: Record<string, { bg: string; color: string }> = {
  new:          { bg: '#dbeafe', color: '#1d4ed8' },
  contacted:    { bg: '#e0e7ff', color: '#4338ca' },
  qualified:    { bg: '#d1fae5', color: '#065f46' },
  proposal:     { bg: '#fef3c7', color: '#92400e' },
  negotiation:  { bg: '#fce7f3', color: '#9d174d' },
  won:          { bg: '#d1fae5', color: '#065f46' },
  lost:         { bg: '#fee2e2', color: '#991b1b' },
  converted:    { bg: '#d1fae5', color: '#065f46' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLOURS[status.toLowerCase()] ?? { bg: 'var(--s3)', color: 'var(--text)' };
  return (
    <span style={{
      display: 'inline-block',
      background: style.bg,
      color: style.color,
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'capitalize',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ScoreBadge({ score, grade }: { score: number; grade?: string | null }) {
  const hue = Math.min(score, 100);
  const bg = `hsl(${hue}, 60%, 92%)`;
  const color = `hsl(${hue}, 60%, 30%)`;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        background: bg, color, padding: '2px 10px',
        borderRadius: 999, fontSize: 12, fontWeight: 700,
      }}>
        {score}
      </span>
      {grade && (
        <span style={{
          background: 'var(--s3)', color: 'var(--text)', padding: '2px 8px',
          borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)',
        }}>
          Grade {grade}
        </span>
      )}
    </span>
  );
}

function PhoneValue({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} style={{ color: 'var(--text)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
      {phone}
    </a>
  );
}

function NoteValue({ note }: { note: string }) {
  return (
    <span style={{
      display: 'block',
      background: 'var(--s1)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 10px',
      fontSize: 13,
      color: 'var(--text)',
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {note}
    </span>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((it) => (
        <span key={it} style={{
          background: 'var(--s3)', color: 'var(--text)',
          padding: '2px 9px', borderRadius: 999,
          fontSize: 12, fontWeight: 500, border: '1px solid var(--border)',
        }}>
          {it}
        </span>
      ))}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{children}</span>;
}

// ─── Formatters ────────────────────────────────────────────────────

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function formatConsent(v: boolean | undefined | null): React.ReactNode {
  if (v === undefined || v === null) return null;
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

function formatCustomValue(v: unknown, type: CustomField['field_type']): React.ReactNode {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'date' || type === 'datetime') {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', ...(type === 'datetime' ? { timeStyle: 'short' } : {}) });
  }
  if (type === 'boolean') return formatConsent(v as boolean);
  if (type === 'multiselect') return Array.isArray(v) ? <ChipList items={v.map(String)} /> : String(v);
  if (type === 'currency') return `₹${Number(v).toLocaleString('en-IN')}`;
  if (type === 'number') return Number(v).toLocaleString('en-IN');
  if (type === 'url') return (
    <a href={String(v)} target="_blank" rel="noreferrer"
      style={{ color: 'var(--primary)', textDecoration: 'none' }}>
      {String(v)} ↗
    </a>
  );
  if (type === 'image') return (
    <SignedImage src={String(v)} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} />
  );
  if (type === 'lookup') {
    const obj = v as { label?: string; id?: string };
    return obj && typeof obj === 'object' && obj.label ? obj.label : (obj?.id ? <Mono>{obj.id}</Mono> : String(v));
  }
  return String(v);
}
