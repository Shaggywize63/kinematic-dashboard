'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts, type AccountTimeline } from '../../../../../lib/crmApi';
import type { Account, Contact, Deal, Activity, Note } from '../../../../../types/crm';
import AccountSummaryCard from '../../../../../components/crm/AccountSummaryCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import AccountEditModal from '../../../../../components/crm/AccountEditModal';
import CustomFieldsDetailCard from '../../../../../components/crm/CustomFieldsDetailCard';
import CallButton from '../../../../../components/crm/shared/CallButton';
import { formatINR } from '../../../../../lib/formatCurrency';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import { safeHref } from '../../../../../lib/safeUrl';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [timeline, setTimeline] = useState<AccountTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [r, c, d, act, n, tl] = await Promise.allSettled([
      crmAccounts.get(id),
      crmAccounts.contacts(id),
      crmAccounts.deals(id),
      crmAccounts.activities(id),
      crmAccounts.notes(id),
      crmAccounts.timeline(id),
    ]);
    if (r.status === 'fulfilled') setA(r.value.data);
    else toast.error(r.reason?.message || 'Load failed');
    if (c.status === 'fulfilled') setContacts(c.value.data || []);
    if (d.status === 'fulfilled') setDeals(d.value.data || []);
    if (act.status === 'fulfilled') setActivities(act.value.data || []);
    if (n.status === 'fulfilled') setNotes(n.value.data || []);
    if (tl.status === 'fulfilled') setTimeline(tl.value.data || null);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const handleDelete = async () => {
    if (!a) return;
    if (!window.confirm(`Delete account "${a.name}"? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      await crmAccounts.remove(a.id);
      toast.success('Account deleted');
      router.refresh();
      router.push('/dashboard/crm/accounts');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
      setDeleting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!a) return;
    if (!window.confirm(`Deactivate account "${a.name}"? It will be hidden from active views.`)) return;
    setDeactivating(true);
    try {
      await crmAccounts.update(a.id, { is_active: false } as any);
      toast.success('Account deactivated');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Deactivate failed');
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!a) return <div style={{ color: 'var(--text-dim)' }}>Account not found.</div>;

  const totalRevenue = deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.amount || 0), 0);
  const openDealValue = deals.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.amount || 0), 0);

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'CRM', href: '/dashboard/crm/dashboard' },
        { label: 'Accounts', href: '/dashboard/crm/accounts' },
        { label: a.name || 'Account' },
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{a.name}</div>
              {a.website && <a href={safeHref(a.website)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent, var(--primary))' }}>{a.website}</a>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              <button onClick={handleDeactivate} disabled={deactivating} style={{ background: 'transparent', border: '1px solid var(--text-dim)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: deactivating ? 'not-allowed' : 'pointer', opacity: deactivating ? 0.6 : 1 }}>{deactivating ? 'Deactivating...' : 'Deactivate'}</button>
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Industry" value={a.industry} />
            <Field label="Revenue" value={a.annual_revenue ? formatINR(a.annual_revenue) : null} />
            <Field label="Employees" value={a.employees ? String(a.employees) : null} />
            <PhoneField phone={a.phone} accountId={a.id} accountName={a.name} />
            <Field label="Owner" value={a.owner_name} />
            <Field label="Created" value={new Date(a.created_at).toLocaleDateString()} />
          </div>
        </div>

        <TimelineCard data={timeline} />

        {a.description && (<Card title="About"><div style={{ fontSize: 13, color: 'var(--text)' }}>{a.description}</div></Card>)}

        {/* Read-only admin-defined custom fields — renders nothing when
            the account has no stored values. */}
        <CustomFieldsDetailCard entity="account" customFields={a.custom_fields} />

        <Card title={`Contacts (${contacts.length})`}>
          {contacts.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No contacts linked yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contacts.map((c) => {
                const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
                return (
                  <Link key={c.id} href={`/dashboard/crm/contacts/${c.id}`} style={rowLink}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.title || c.email || '—'}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.phone || c.email || ''}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={`Deals (${deals.length})`}>
          {deals.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No deals.</div>
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

        <Card title={`Activities (${activities.length})`}><ActivityTimeline activities={activities} addHref={`/dashboard/crm/activities/new?account_id=${id}`} /></Card>

        {notes.length > 0 && (
          <Card title={`Notes (${notes.length})`}>
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
        <Card title="Account Stats">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <Stat label="Contacts" value={String(contacts.length)} />
            <Stat label="Open Deals" value={String(deals.filter((d) => d.status === 'open').length)} />
            <Stat label="Open Value" value={formatINR(openDealValue)} />
            <Stat label="Won Revenue" value={formatINR(totalRevenue)} />
          </div>
        </Card>
        <AccountSummaryCard accountId={a.id} initial={a.ai_summary} />
      </div>

      <AccountEditModal
        account={a}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setA(updated); reload(); }}
      />
      </div>
    </div>
  );
}

// The management timeline: who visited, how often, and every visit / form / follow-up
// with the data each captured. Renders nothing until the account has activity.
function TimelineCard({ data }: { data: AccountTimeline | null }) {
  if (!data) return null;
  const { summary, timeline } = data;
  if (!timeline?.length) {
    return <Card title="Timeline"><div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No visits or forms captured yet.</div></Card>;
  }
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const icon = (k: string) => (k === 'visit' ? '🏭' : k === 'submission' ? '📝' : '✅');
  return (
    <Card title={`Timeline (${timeline.length})`}>
      {/* Who visited — the per-FE rollup. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>
          <strong style={{ color: 'var(--text)' }}>{summary.fe_count}</strong> field rep{summary.fe_count === 1 ? '' : 's'} ·{' '}
          <strong style={{ color: 'var(--text)' }}>{summary.visit_count}</strong> visit{summary.visit_count === 1 ? '' : 's'} ·{' '}
          <strong style={{ color: 'var(--text)' }}>{summary.submission_count}</strong> form{summary.submission_count === 1 ? '' : 's'}
        </div>
      </div>
      {summary.fes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {summary.fes.map((fe) => (
            <div key={fe.user_id} style={{ background: 'var(--s3)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{fe.name || 'Unknown rep'}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>
                {fe.visits} visit{fe.visits === 1 ? '' : 's'} · {fe.submissions} form{fe.submissions === 1 ? '' : 's'}
                {fe.last_at ? ` · last ${new Date(fe.last_at).toLocaleDateString()}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* The chronological feed. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {timeline.map((e) => (
          <div key={`${e.kind}-${e.id}`} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>
                <span style={{ marginRight: 6 }}>{icon(e.kind)}</span>{e.title}
                {e.status ? <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8, textTransform: 'uppercase' }}>{e.status}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{when(e.at)}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
              {e.user_name ? `by ${e.user_name}` : ''}{e.detail ? `${e.user_name ? ' · ' : ''}${e.detail}` : ''}
            </div>
            {e.answers && e.answers.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {e.answers.map((ans, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--text-dim)', minWidth: 120 }}>{ans.label}</span>
                    {ans.photo_url
                      ? <a href={safeHref(ans.photo_url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, var(--primary))' }}>📷 Photo</a>
                      : <span style={{ color: 'var(--text)' }}>{ans.value || '—'}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}

function PhoneField({ phone, accountId, accountName }: { phone?: string | null; accountId: string; accountName?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Phone</div>
      <div style={{ color: 'var(--text)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{phone || '—'}</span>
        <CallButton phone={phone} prefillSubject={`Call with ${accountName || 'account'}`} accountId={accountId} size="sm" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--s3)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
