'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity as ActivityIcon, ArrowLeft, BarChart3, Building2, Cake, CalendarCheck, CalendarDays, CheckSquare, Handshake, Mail, MapPin,
  Megaphone, MessageCircle, Pencil, Phone, ShoppingCart, StickyNote, Trash2, User, UserRound, type LucideIcon,
} from 'lucide-react';
import { InlineIcon } from '../../../../../components/ui/PageIcon';
import { metricIconFor } from '../../../../../lib/labelIcons';
import { crmContacts } from '../../../../../lib/crmApi';
import type { Contact, Activity, Deal, Note, EmailLog } from '../../../../../types/crm';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';
import WhatsAppButton from '../../../../../components/crm/shared/WhatsAppButton';
import CallButton from '../../../../../components/crm/shared/CallButton';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import ContactEditModal from '../../../../../components/crm/ContactEditModal';
import CustomFieldsDetailCard from '../../../../../components/crm/CustomFieldsDetailCard';
import { formatINR } from '../../../../../lib/formatCurrency';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import ContactAccountModal from '../../../../../components/crm/spark/ContactAccountModal';
import CoOwnersCard from '../../../../../components/crm/CoOwnersCard';

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [c, setC] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  // Spark & Ray: add the contact to an account / change it.
  const spark = isB2bClientActive();
  const [accountOpen, setAccountOpen] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [r, a, d, n, em] = await Promise.allSettled([
      crmContacts.get(id),
      crmContacts.activities(id),
      crmContacts.deals(id),
      crmContacts.notes(id),
      crmContacts.emails(id),
    ]);
    if (r.status === 'fulfilled') setC(r.value.data);
    else toast.error(r.reason?.message || 'Load failed');
    if (a.status === 'fulfilled') setActivities(a.value.data || []);
    if (d.status === 'fulfilled') setDeals(d.value.data || []);
    if (n.status === 'fulfilled') setNotes(n.value.data || []);
    if (em.status === 'fulfilled') setEmails(em.value.data || []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);


  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!c) return <div style={{ color: 'var(--text-dim)' }}>Contact not found.</div>;

  const fullName = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unnamed';
  const firstName = (c.first_name || fullName).split(' ')[0];
  const waPrefill = `Hi ${firstName}, `;
  const isB2C = !!c.is_b2c;
  const totalDealValue = deals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const wonDeals = deals.filter((d) => d.status === 'won');

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'CRM', href: '/dashboard/crm/dashboard' },
        { label: 'Contacts', href: '/dashboard/crm/contacts' },
        { label: fullName || 'Contact' },
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <OwnerAvatar name={fullName} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{fullName}</div>
                <Badge tone={isB2C ? 'consumer' : 'business'}>{isB2C ? 'CUSTOMER' : 'B2B CONTACT'}</Badge>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {isB2C
                  ? [c.city, c.country].filter(Boolean).join(', ') || '—'
                  : (c.title ? `${c.title}${c.account_name ? ` · ${c.account_name}` : ''}` : (c.account_name || '—'))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {spark && (
                <button onClick={() => setAccountOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={Building2} />{c.account_id ? 'Change company' : 'Add to a company'}</button>
              )}
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={Pencil} />Edit</button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete ${fullName}? This removes the contact from your CRM and cannot be undone from here.`)) return;
                  setDeleting(true);
                  try {
                    await crmContacts.remove(c.id);
                    toast.success('Contact deleted');
                    router.push('/dashboard/crm/contacts');
                  } catch (e: unknown) {
                    toast.error((e as { message?: string })?.message || 'Could not delete the contact');
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                aria-label={`Delete ${fullName}`}
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <InlineIcon icon={Trash2} />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={ArrowLeft} />Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Email" icon={Mail} value={c.email} />
            <PhoneField phone={c.phone} prefill={waPrefill} contactId={c.id} displayName={fullName} />
            {!isB2C && c.account_id ? (
              <FieldLink label={spark ? 'Company' : 'Account'} icon={Building2} href={`/dashboard/crm/accounts/${c.account_id}`} value={c.account_name || 'View account'} />
            ) : (
              <Field label="Owner" icon={UserRound} value={c.owner_name} />
            )}
            <Field label="Created" icon={CalendarDays} value={new Date(c.created_at).toLocaleDateString()} />
            {c.preferred_contact_method && <Field label="Preferred" icon={MessageCircle} value={c.preferred_contact_method} />}
          </div>
        </div>

        {isB2C && (
          <Card title="Customer Profile" icon={UserRound}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
              <Field label="Date of Birth" icon={Cake} value={c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString() : null} />
              <Field label="Gender" icon={User} value={c.gender ? c.gender.replace(/_/g, ' ') : null} />
              <Field label="Customer Since" icon={CalendarCheck} value={c.customer_since ? new Date(c.customer_since).toLocaleDateString() : null} />
              <Field label="Last Purchase" icon={ShoppingCart} value={c.last_purchase_at ? new Date(c.last_purchase_at).toLocaleDateString() : null} />
              <Field label="Referral" icon={Megaphone} value={c.referral_source} />
              <Field label="Marketing Consent" icon={Mail} value={c.marketing_consent ? 'Yes' : 'No'} />
              <Field label="WhatsApp Consent" icon={MessageCircle} value={c.whatsapp_consent ? 'Yes' : 'No'} />
              <Field label="Address" icon={MapPin} value={[c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country].filter(Boolean).join(', ') || null} />
            </div>
          </Card>
        )}

        {/* Primary owner + co-owners (peers who also see this contact). */}
        <CoOwnersCard entity="contacts" id={c.id} primaryOwnerId={c.owner_id} primaryOwnerName={c.owner_name} allowOwnerChange />

        {/* Read-only admin-defined custom fields — renders nothing when
            the contact has no stored values. */}
        <CustomFieldsDetailCard entity="contact" customFields={c.custom_fields} />

        <Card title={`Deals (${deals.length})`} icon={Handshake}>
          {deals.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No deals linked to this contact.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deals.map((d) => (
                <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} style={rowLink}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.stage_name || '—'} · {d.status}</div>
                  </div>
                  <div style={{ color: 'var(--text)', fontWeight: 700 }}>{formatINR(d.amount || 0)}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Activities (${activities.length})`} icon={CheckSquare}>
          <ActivityTimeline activities={activities} addHref={`/dashboard/crm/activities/new?contact_id=${id}`} />
        </Card>

        {emails.length > 0 && (
          <Card title={`Emails (${emails.length})`} icon={Mail}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {emails.slice(0, 8).map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</div>
                  <div style={{ color: 'var(--text-dim)' }}>{e.status}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {notes.length > 0 && (
          <Card title={`Notes (${notes.length})`} icon={StickyNote}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map((n) => (
                <div key={n.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>
                  {n.body}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {isB2C && (
          <Card title="Customer 360" icon={BarChart3}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Stat label="Lifetime Value" value={formatINR(c.lifetime_value || 0)} />
              <Stat label="Total Orders" value={String(c.total_orders || 0)} />
              <Stat label="Open Deals" value={String(deals.filter((d) => d.status === 'open').length)} />
              <Stat label="Won Deals" value={String(wonDeals.length)} />
            </div>
          </Card>
        )}
        {!isB2C && (
          <Card title="Engagement" icon={ActivityIcon}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Stat label="Open Deals" value={String(deals.filter((d) => d.status === 'open').length)} />
              <Stat label="Won Deals" value={String(wonDeals.length)} />
              <Stat label="Total Value" value={formatINR(totalDealValue)} />
              <Stat label="Activities" value={String(activities.length)} />
            </div>
          </Card>
        )}

        {!isB2C && c.account_id && (
          <Card title={spark ? 'Linked Company' : 'Linked Account'} icon={Building2}>
            <Link href={`/dashboard/crm/accounts/${c.account_id}`} style={chipLink}>→ {c.account_name || 'View account'}</Link>
          </Card>
        )}
      </div>

      <ContactEditModal
        contact={c}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setC(updated); reload(); }}
      />
      {spark && <ContactAccountModal contact={c} open={accountOpen} onClose={() => setAccountOpen(false)} onSaved={() => reload()} />}
      </div>
    </div>
  );
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>{icon && <InlineIcon icon={icon} size={16} style={{ color: 'var(--text-dim)' }} />}{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value?: string | null; icon?: LucideIcon }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>{icon && <InlineIcon icon={icon} size={12} />}{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}

function FieldLink({ label, value, href, icon }: { label: string; value: string; href: string; icon?: LucideIcon }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>{icon && <InlineIcon icon={icon} size={12} />}{label}</div>
      <Link href={href} style={{ color: 'var(--primary)', marginTop: 2, display: 'inline-block', textDecoration: 'underline' }}>{value}</Link>
    </div>
  );
}

function PhoneField({ phone, prefill, contactId, displayName }: { phone?: string | null; prefill: string; contactId: string; displayName: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><InlineIcon icon={Phone} size={12} />Phone</div>
      <div style={{ color: 'var(--text)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{phone || '—'}</span>
        <CallButton phone={phone} prefillSubject={`Call with ${displayName}`} contactId={contactId} size="sm" />
        <WhatsAppButton phone={phone} prefillText={prefill} size="sm" />
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'business' | 'consumer' | 'loyalty' }) {
  const colors = {
    business: { bg: '#3b82f6', fg: '#fff' },
    consumer: { bg: '#8b5cf6', fg: '#fff' },
    loyalty: { bg: '#f59e0b', fg: '#fff' },
  }[tone];
  return (<span style={{ background: colors.bg, color: colors.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>);
}

function Stat({ label, value }: { label: string; value: string }) {
  const Icon = metricIconFor(label);
  return (
    <div style={{ background: 'var(--s3)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>{Icon && <InlineIcon icon={Icon} size={12} />}{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const chipLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--primary)',
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block',
};
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
