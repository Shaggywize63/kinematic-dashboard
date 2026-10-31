'use client';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Contact } from '../../../types/crm';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { T } from '../../ui';
import SectionCard from './SectionCard';

const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
  background: T.raised, borderRadius: T.radius.md, textDecoration: 'none',
};

/**
 * The contact-persons captured on a B2B lead, each with the free-text
 * `requirement` they gave. Read-only — this is the "revisit" surface: opening
 * an already-visited lead shows who was logged on it (by any rep), so a
 * returning field exec sees the people and needs already on record.
 *
 * Built-in contact fields (title / phone / email) are gated through the
 * `contact`-entity field-override helper per the repo's field-override
 * contract; `requirement` is a non-built-in column so it renders directly.
 * Renders nothing when there are no contacts.
 */
export default function LeadContactsCard({ contacts, fields }: { contacts: Contact[]; fields: FieldHelpers }) {
  if (!contacts.length) return null;
  const showTitle = !fields.isHidden('title');
  const showPhone = !fields.isHidden('phone');
  const showEmail = !fields.isHidden('email');
  return (
    <SectionCard title={fields.labelFor('contacts', 'Contacts & requirements')} count={contacts.length}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {contacts.map((c) => {
          const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || c.phone || 'Contact';
          const sub = [showTitle ? c.title : null, c.department].filter(Boolean).join(' · ');
          const reach = [showPhone ? c.phone || c.mobile : null, showEmail ? c.email : null].filter(Boolean) as string[];
          return (
            <Link key={c.id} href={`/dashboard/crm/contacts/${c.id}`} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontWeight: 600, fontSize: 13.5, overflowWrap: 'anywhere' }}>{name}</div>
                {sub && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 1 }}>{sub}</div>}
                {c.requirement && (
                  <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: T.dim, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <span style={{ color: T.mute, fontWeight: 600 }}>{fields.labelFor('requirement', 'Requirement')}: </span>
                    {c.requirement}
                  </div>
                )}
              </div>
              {reach.length > 0 && (
                <div style={{ fontSize: 11.5, color: T.mute, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {reach.map((r) => <div key={r}>{r}</div>)}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
