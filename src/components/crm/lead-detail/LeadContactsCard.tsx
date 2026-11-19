'use client';
import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { Users, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact } from '../../../types/crm';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { crmContacts } from '../../../lib/crmApi';
import { isB2bClientActive } from '../../../lib/b2bClient';
import { T } from '../../ui';
import SectionCard from './SectionCard';

const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
  background: T.raised, borderRadius: T.radius.md,
};

/**
 * The contact-persons captured on a B2B lead, each with the free-text
 * `requirement` they gave. On the connected-B2B workspace an admin (or the
 * lead's creator) can edit a person's requirement inline here — the one place
 * it surfaces — since the requirement otherwise only accrues from visits and
 * had no edit path. Other tenants / non-editors see it exactly as before
 * (read-only, each row linking to the contact).
 *
 * Built-in contact fields (title / phone / email) are gated through the
 * `contact`-entity field-override helper per the repo's field-override
 * contract; `requirement` is a non-built-in column so it renders directly.
 * Renders nothing when there are no contacts.
 */
export default function LeadContactsCard({ contacts, fields, canEdit = false }: { contacts: Contact[]; fields: FieldHelpers; canEdit?: boolean }) {
  // Local copy so an inline save reflects immediately without a full refetch.
  const [rows, setRows] = useState<Contact[]>(contacts);
  useEffect(() => { setRows(contacts); }, [contacts]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (!rows.length) return null;
  const showTitle = !fields.isHidden('title');
  const showPhone = !fields.isHidden('phone');
  const showEmail = !fields.isHidden('email');
  // Requirement capture is a connected-B2B (Spark & Ray) concept, so the inline
  // editor is offered only there, and only to someone allowed to edit the lead.
  const editable = canEdit && isB2bClientActive();
  const reqLabel = fields.labelFor('requirement', 'Requirement');

  const startEdit = (c: Contact) => { setEditingId(c.id); setDraft(c.requirement || ''); };
  const cancel = () => { setEditingId(null); setDraft(''); };
  const save = async (c: Contact) => {
    if (busy) return;
    const next = draft.trim();
    if ((c.requirement || '') === next) { cancel(); return; }
    setBusy(true);
    try {
      await crmContacts.update(c.id, { requirement: next || null } as Partial<Contact>);
      setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, requirement: next || null } : r)));
      toast.success('Requirement updated');
      cancel();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Could not update the requirement');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={fields.labelFor('contacts', 'Contacts & requirements')} icon={Users} count={rows.length}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((c) => {
          const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || c.phone || 'Contact';
          const sub = [showTitle ? c.title : null, c.department].filter(Boolean).join(' · ');
          const reach = [showPhone ? c.phone || c.mobile : null, showEmail ? c.email : null].filter(Boolean) as string[];
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={`/dashboard/crm/contacts/${c.id}`} style={{ color: T.text, fontWeight: 600, fontSize: 13.5, overflowWrap: 'anywhere', textDecoration: 'none' }}>{name}</Link>
                  {editable && !isEditing && (
                    <button type="button" onClick={() => startEdit(c)} title={`Edit ${reqLabel.toLowerCase()}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <Pencil size={12} strokeWidth={2} />Edit
                    </button>
                  )}
                </div>
                {sub && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 1 }}>{sub}</div>}

                {isEditing ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: T.mute, fontWeight: 600, marginBottom: 4 }}>{reqLabel}</div>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={4}
                      autoFocus
                      placeholder={`What does ${name} need?`}
                      style={{ width: '100%', boxSizing: 'border-box', background: T.field, color: T.text, border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" onClick={() => save(c)} disabled={busy}
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: T.radius.sm, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={cancel} disabled={busy}
                        style={{ background: 'transparent', color: T.mute, border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : c.requirement ? (
                  <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: T.dim, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <span style={{ color: T.mute, fontWeight: 600 }}>{reqLabel}: </span>
                    {c.requirement}
                  </div>
                ) : editable ? (
                  <button type="button" onClick={() => startEdit(c)}
                    style={{ marginTop: 6, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    + Add {reqLabel.toLowerCase()}
                  </button>
                ) : null}
              </div>
              {reach.length > 0 && !isEditing && (
                <div style={{ fontSize: 11.5, color: T.mute, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {reach.map((r) => <div key={r}>{r}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
