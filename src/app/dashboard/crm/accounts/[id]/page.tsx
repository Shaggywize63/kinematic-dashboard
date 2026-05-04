'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts } from '../../../../../lib/crmApi';
import type { Account, Contact, Deal, Activity, Note } from '../../../../../types/crm';
import AccountSummaryCard from '../../../../../components/crm/AccountSummaryCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import AccountEditModal from '../../../../../components/crm/AccountEditModal';
import { formatINR } from '../../../../../lib/formatCurrency';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [r, c, d, act, n] = await Promise.allSettled([
      crmAccounts.get(id),
      crmAccounts.contacts(id),
      crmAccounts.deals(id),
      crmAccounts.activities(id),
      crmAccounts.notes(id),
    ]);
    if (r.status === 'fulfilled') setA(r.value.data);
    else toast.error(r.reason?.message || 'Load failed');
    if (c.status === 'fulfilled') setContacts(c.value.data || []);
    if (d.status === 'fulfilled') setDeals(d.value.data || []);
    if (act.status === 'fulfilled') setActivities(act.value.data || []);
    if (n.status === 'fulfilled') setNotes(n.value.data || []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!a) return <div style={{ color: 'var(--text-dim)' }}>Account not found.</div>;

  const totalRevenue = deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.amount || 0), 0);
  const openDealValue = deals.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.amount || 0), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{a.name}</div>
              {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent, var(--primary))' }}>{a.website}</a>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Industry" value={a.industry} />
            <Field label="Revenue" value={a.annual_revenue ? formatINR(a.annual_revenue) : null} />
            <Field label="Employees" value={a.employees ? String(a.employees) : null} />
            <Field label="Phone" value={a.phone} />
            <Field label="Owner" value={a.owner_name} />
            <Field label="Created" value={new Date(a.created_at).toLocaleDateString()} />
          </div>
        </div>

        {a.description && (<Card title="About"><div style={{ fontSize: 13, color: 'var(--text)' }}>{a.description}</div></Card>)}

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

        <Card title={`Activities (${activities.length})`}><ActivityTimeline activities={activities} /></Card>

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
