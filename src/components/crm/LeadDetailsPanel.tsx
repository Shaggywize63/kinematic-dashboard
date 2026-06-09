'use client';
import { useEffect, useState } from 'react';
import { crmCustomFields } from '../../lib/crmApi';
import type { CustomField, Lead } from '../../types/crm';

/**
 * Comprehensive lead detail panel — categorised, hides empty sections.
 *
 * Sits under the lead detail header (which already shows name + key
 * action buttons) and lays out every field the backend exposes for
 * a Lead row in logical groups:
 *
 *   1. Contact Information        — email, primary + alternate mobiles, preferred channel
 *   2. Business Details (B2B)     — company, job title, industry
 *   3. Personal Details (B2C)     — date of birth, gender
 *   4. Address & Location         — full address + map link if lat/lng exist
 *   5. Lifecycle & Assignment     — status, source, owner, dates, conversion result
 *   6. Custom Fields              — admin-defined values, labelled via crm_custom_field_defs
 *   7. Consent & Preferences (B2C)— marketing + WhatsApp consents
 *   8. System                     — IDs, score, tags, photo
 *
 * Each section hides when it has nothing to show (all values null /
 * empty array / hidden by admin), so a freshly-created lead with
 * only a phone number doesn't render five empty cards.
 */

interface LeadWithCustomFields extends Lead {
  custom_fields?: Record<string, unknown> | null;
  source_name?: string | null;
}

interface Props { lead: LeadWithCustomFields; }

export default function LeadDetailsPanel({ lead }: Props) {
  const isB2C = !!lead.is_b2c;
  const [customDefs, setCustomDefs] = useState<CustomField[]>([]);

  // Fetch the active custom-field definitions for entity='lead' so we
  // can pretty-print labels (e.g. "First visit date" instead of the
  // raw `first_visit_date` key) and respect the admin's hidden flag.
  // Cached on the component instance — the page itself re-renders
  // often when the rep edits fields inline.
  useEffect(() => {
    let cancelled = false;
    crmCustomFields.list()
      .then((r) => {
        if (cancelled) return;
        const all = (r.data || []) as CustomField[];
        setCustomDefs(all.filter((d) => d.entity_type === 'lead' && !d.hidden));
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  const cf = (lead.custom_fields && typeof lead.custom_fields === 'object')
    ? lead.custom_fields as Record<string, unknown>
    : {};

  const altMobiles = Array.isArray(lead.alternate_mobiles) ? lead.alternate_mobiles : [];
  const tags = Array.isArray(lead.tags) ? lead.tags : [];

  // Address pieces — joined into one string for display, but each
  // individual field still rendered so an admin auditing data can
  // see exactly which line is missing.
  const fullAddress = [lead.address_line1, lead.address_line2, lead.city, lead.state, lead.postal_code, lead.country]
    .filter(Boolean)
    .join(', ');

  const mapHref = (lead.latitude != null && lead.longitude != null)
    ? `https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`
    : null;

  const contactItems: Array<[string, React.ReactNode]> = [
    ['Email',         lead.email || null],
    ['Primary Mobile', lead.phone ? <Mono>{lead.phone}</Mono> : null],
    ['Alternate Mobiles', altMobiles.length ? <ChipList items={altMobiles} /> : null],
    ['Preferred Channel', lead.preferred_contact_method
      ? lead.preferred_contact_method.replace(/_/g, ' ')
      : null],
  ];

  const businessItems: Array<[string, React.ReactNode]> = [
    ['Company',   lead.company || null],
    ['Job Title', lead.title || null],
    ['Industry',  lead.industry || null],
  ];

  const personalItems: Array<[string, React.ReactNode]> = [
    ['Date of Birth', lead.date_of_birth ? formatDate(lead.date_of_birth) : null],
    ['Gender',        lead.gender ? lead.gender.replace(/_/g, ' ') : null],
  ];

  const addressItems: Array<[string, React.ReactNode]> = [
    ['Address Line 1', lead.address_line1 || null],
    ['Address Line 2', lead.address_line2 || null],
    ['City',           lead.city || null],
    ['State',          lead.state || null],
    ['Postal Code',    lead.postal_code || null],
    ['Country',        lead.country || null],
    ['Coordinates', (lead.latitude != null && lead.longitude != null)
      ? (
        <span>
          <Mono>{lead.latitude.toFixed(6)}, {lead.longitude.toFixed(6)}</Mono>
          {mapHref && (
            <>
              {' · '}
              <a href={mapHref} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                Open in Maps ↗
              </a>
            </>
          )}
        </span>
      ) : null],
  ];

  const lifecycleItems: Array<[string, React.ReactNode]> = [
    ['Status',          lead.status || null],
    ['Source',          lead.source_name || null],
    ['Owner',           lead.owner_name || 'Unassigned'],
    ['Score',           lead.score != null ? `${lead.score}${lead.score_grade ? ` · Grade ${lead.score_grade}` : ''}` : null],
    ['Created',         formatDateTime(lead.created_at)],
    ['Last Updated',    lead.updated_at ? formatDateTime(lead.updated_at) : null],
    ['Converted At',    lead.converted_at ? formatDateTime(lead.converted_at) : null],
  ];

  const consentItems: Array<[string, React.ReactNode]> = [
    ['Marketing Consent', formatBool(lead.marketing_consent)],
    ['WhatsApp Consent',  formatBool(lead.whatsapp_consent)],
  ];

  const customItems: Array<[string, React.ReactNode]> = customDefs
    .map((def) => {
      const val = cf[def.field_key];
      // Skip rows where the rep hasn't filled anything in.
      if (val === undefined || val === null || val === '') return null;
      return [def.label || def.field_key, formatCustomValue(val, def.field_type)] as [string, React.ReactNode];
    })
    .filter((row): row is [string, React.ReactNode] => row !== null);

  const systemItems: Array<[string, React.ReactNode]> = [
    ['Lead ID',  <Mono key="id">{lead.id}</Mono>],
    ['Tags',     tags.length ? <ChipList items={tags} /> : null],
    ['Notes',    lead.notes || null],
  ];

  return (
    <Card title="Lead Details">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <Group title="Contact Information"               items={contactItems} />
        {!isB2C && <Group title="Business Details"        items={businessItems} />}
        {isB2C  && <Group title="Personal Details"        items={personalItems} />}
        <Group title="Address &amp; Location"            items={addressItems} />
        <Group title="Lifecycle &amp; Assignment"        items={lifecycleItems} />
        {customItems.length > 0 && <Group title="Custom Fields" items={customItems} />}
        {isB2C  && <Group title="Consent &amp; Preferences" items={consentItems} />}
        <Group title="System" items={systemItems} />
      </div>
    </Card>
  );
}

// ─── building blocks ──────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 18,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Group({ title, items }: { title: string; items: Array<[string, React.ReactNode]> }) {
  // Hide the whole group when every value is empty — avoids a sea of
  // "—" rows for newly-created leads with only a name + phone.
  const visible = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (visible.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', columnGap: 12, rowGap: 8 }}>
        {visible.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' }}>{value}</dd>
    </>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((it) => (
        <span key={it} style={{
          background: 'var(--s3)', color: 'var(--text)', padding: '2px 8px',
          borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)',
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

// ─── formatters ───────────────────────────────────────────────────

function formatDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function formatBool(v: boolean | undefined | null): React.ReactNode {
  if (v === undefined || v === null) return null;
  return v ? 'Yes' : 'No';
}

// Match the custom-field renderer's vocabulary so a `date`-typed value
// formats nicely, `select`/`multiselect` print joined options, etc.
function formatCustomValue(v: unknown, type: CustomField['field_type']): React.ReactNode {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'date' || type === 'datetime') {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', ...(type === 'datetime' ? { timeStyle: 'short' } : {}) });
  }
  if (type === 'boolean') return v ? 'Yes' : 'No';
  if (type === 'multiselect') return Array.isArray(v) ? <ChipList items={v.map(String)} /> : String(v);
  if (type === 'currency') return `₹${Number(v).toLocaleString('en-IN')}`;
  if (type === 'number') return Number(v).toLocaleString('en-IN');
  if (type === 'url') return <a href={String(v)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{String(v)} ↗</a>;
  if (type === 'image') return <img src={String(v)} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} />;
  if (type === 'lookup') {
    const obj = v as { label?: string; id?: string };
    return obj && typeof obj === 'object' && obj.label ? obj.label : (obj?.id ? <Mono>{obj.id}</Mono> : String(v));
  }
  return String(v);
}
