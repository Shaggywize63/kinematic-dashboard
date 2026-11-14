'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts, crmSettings, type AccountTimeline } from '../../../../../lib/crmApi';
import type { Account, Contact, Deal, Activity, Note, Lead } from '../../../../../types/crm';
import AccountSummaryCard from '../../../../../components/crm/AccountSummaryCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import EditActivityModal from '../../../../../components/crm/EditActivityModal';
import AccountEditModal from '../../../../../components/crm/AccountEditModal';
import CustomFieldsDetailCard from '../../../../../components/crm/CustomFieldsDetailCard';
import CallButton from '../../../../../components/crm/shared/CallButton';
import { formatINR } from '../../../../../lib/formatCurrency';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import { safeHref } from '../../../../../lib/safeUrl';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import AccountUpdatesCard from '../../../../../components/crm/spark/AccountUpdatesCard';
import AccountAddresses from '../../../../../components/crm/spark/AccountAddresses';
import { Button } from '../../../../../components/ui';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { accountLocationLines } from '../../../../../lib/accountLocation';
import { dealRollup } from '../../../../../lib/sparkAccounts';
import { BrandChips } from '../../../../../components/crm/spark/BrandChips';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  // The Leads card tells apart "none yet" from "the fetch failed" so a transient error isn't read as an empty account.
  const [leadsError, setLeadsError] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [timeline, setTimeline] = useState<AccountTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  // The activity being edited from the Activities card (shared with the Activities page).
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  // Spark & Ray (connected-B2B) only: Recent updates, task / deal shortcuts and the journey page.
  const spark = isB2bClientActive();
  // Built-in field overrides (hide / relabel): a location field the admin hid is not shown here either.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'account'), [fieldOverrides]);
  useEffect(() => {
    crmSettings.get()
      .then((r) => setFieldOverrides(extractFieldOverrides(r.data)))
      .catch(() => { /* keep defaults — every field shows */ });
  }, []);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [r, c, d, ld, act, n, tl] = await Promise.allSettled([
      crmAccounts.get(id),
      crmAccounts.contacts(id),
      crmAccounts.deals(id),
      crmAccounts.leads(id),
      crmAccounts.activities(id),
      crmAccounts.notes(id),
      crmAccounts.timeline(id),
    ]);
    if (r.status === 'fulfilled') setA(r.value.data);
    else toast.error(r.reason?.message || 'Load failed');
    if (c.status === 'fulfilled') setContacts(c.value.data || []);
    if (d.status === 'fulfilled') setDeals(d.value.data || []);
    if (ld.status === 'fulfilled') { setLeads(ld.value.data || []); setLeadsError(false); }
    else setLeadsError(true);
    if (act.status === 'fulfilled') setActivities(act.value.data || []);
    if (n.status === 'fulfilled') setNotes(n.value.data || []);
    if (tl.status === 'fulfilled') setTimeline(tl.value.data || null);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  // After an activity is saved or deleted in the edit modal, refresh just the activity list (no full-page reload).
  const refreshActivities = async () => {
    if (!id) return;
    try {
      const r = await crmAccounts.activities(id);
      setActivities(r.data || []);
    } catch (e: any) { toast.error(e?.message || 'Could not refresh activities'); }
  };

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

  const loc = accountLocationLines(a, fields.isHidden);
  const hasLocation = !!(loc.street || loc.place || loc.country);
  // The deal's headline value: the quoted amount where one exists (connected-B2B rollup), else the plain amount.
  const dealValue = (d: Deal) => Number(d.quoted_amount ?? d.amount ?? 0) || 0;
  // Total = every deal / quote under the account; Open = open pipeline; Won = realised value of won deals
  // (what was ordered where that is filled, else the deal amount).
  const totalValue = deals.reduce((s, d) => s + dealValue(d), 0);
  const openDealValue = deals.filter((d) => d.status === 'open').reduce((s, d) => s + dealValue(d), 0);
  const wonValue = deals.filter((d) => d.status === 'won').reduce((s, d) => s + (Number(d.order_amount ?? d.amount ?? d.quoted_amount ?? 0) || 0), 0);
  const products = accountProductRollup(deals);

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
              {spark && (
                <>
                  <Button variant="primary" href={`/dashboard/crm/accounts/${a.id}/journey`}>View journey</Button>
                  <Button href={`/dashboard/crm/activities/new?account_id=${a.id}&account_name=${encodeURIComponent(a.name || '')}`}>Assign task / activity</Button>
                  <Button href={`/dashboard/crm/deals/new?account_id=${a.id}`}>New deal</Button>
                </>
              )}
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              <button onClick={handleDeactivate} disabled={deactivating} style={{ background: 'transparent', border: '1px solid var(--text-dim)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: deactivating ? 'not-allowed' : 'pointer', opacity: deactivating ? 0.6 : 1 }}>{deactivating ? 'Deactivating...' : 'Deactivate'}</button>
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Industry" value={a.industry} />
            <PhoneField phone={a.phone} accountId={a.id} accountName={a.name} />
          </div>
          {hasLocation && (
            <div data-testid="account-location" style={{ marginTop: 14, fontSize: 13 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('address_line1', 'Address')}</div>
              {loc.street && <div data-testid="account-location-street" style={{ color: 'var(--text)', marginTop: 2, overflowWrap: 'anywhere' }}>{loc.street}</div>}
              {loc.place && <div data-testid="account-location-place" style={{ color: 'var(--text)', marginTop: 2 }}>{loc.place}</div>}
              {loc.country && <div data-testid="account-location-country" style={{ color: 'var(--text-dim)', marginTop: 2 }}>{loc.country}</div>}
            </div>
          )}
          {/* Spark & Ray: accounts no longer ask for an Outcome (it moved to the activities); one stored earlier is shown read-only. */}
          {spark && (a.outcome || '').trim() !== '' && (
            <div data-testid="account-outcome" style={{ marginTop: 14, fontSize: 13 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Outcome (earlier)</div>
              <div style={{ color: 'var(--text)', marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.outcome}</div>
            </div>
          )}
        </div>

        {spark && (
          <Card title="Recent updates">
            <AccountUpdatesCard accountId={a.id} contacts={contacts} />
          </Card>
        )}

        {spark && <AccountAddresses accountId={a.id} />}

        <TimelineCard data={timeline} />

        {a.description && (<Card title="About"><div style={{ fontSize: 13, color: 'var(--text)' }}>{a.description}</div></Card>)}

        {/* Read-only admin-defined custom fields — renders nothing when
            the account has no stored values. */}
        <CustomFieldsDetailCard entity="account" customFields={a.custom_fields} />

        <Card
          title={`Contacts (${contacts.length})`}
          action={spark ? (
            <Link
              href={`/dashboard/crm/contacts/new?account_id=${a.id}&account_name=${encodeURIComponent(a.name || '')}`}
              style={{ background: 'var(--primary)', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >+ Add contact</Link>
          ) : undefined}
        >
          {contacts.length === 0 ? (
            <div data-testid="account-contacts-empty" style={{ color: 'var(--text-dim)', fontSize: 13 }}>No contacts yet.{spark ? ' Use + Add contact to add the first one.' : ''}</div>
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

        <Card title={`Leads (${leads.length})`}>
          {leadsError ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Could not load leads.</div>
          ) : leads.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No leads linked to this account.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leads.map((l) => {
                const value = leadValue(l);
                return (
                  <Link key={l.id} href={`/dashboard/crm/leads/${l.id}`} style={rowLink}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{leadDisplayName(l)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.company || l.status || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{l.status || ''}</span>
                      {value !== null && <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{formatINR(value)}</span>}
                    </div>
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
              {/* Spark & Ray: what was quoted and what was ordered across the customer's deals. */}
              {isB2bClientActive() && (() => {
                const r = dealRollup(deals);
                return (
                  <div data-testid="deals-summary" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    <strong style={{ color: 'var(--text)' }}>{r.count} {r.count === 1 ? 'deal' : 'deals'}</strong>
                    {' \u00b7 '}{formatINR(r.quoted)} quoted{r.ordered !== null && <>{' \u00b7 '}{formatINR(r.ordered)} ordered</>}
                  </div>
                );
              })()}
              {deals.map((d) => (
                <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} style={rowLink}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.stage_name || '—'} · {d.status}{d.quotation_no ? ` · Quotation ${d.quotation_no}` : ''}</div>
                    {isB2bClientActive() && <BrandChips brands={d.brands} style={{ marginTop: 4 }} />}
                  </div>
                  {isB2bClientActive() ? (
                    <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                      <div data-testid="deal-quoted"><span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Quoted </span>{formatINR(d.quoted_amount ?? d.amount ?? 0)}</div>
                      <div data-testid="deal-ordered"><span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Ordered </span>{d.order_amount == null ? '\u2014' : formatINR(d.order_amount)}</div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>{formatINR(d.amount || 0)}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Products${products.length > 0 ? ` (${products.length})` : ''}`}>
          {products.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No product lines on this account&apos;s deals yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {products.map((p) => (
                <div key={p.name} style={{ ...rowLink, cursor: 'default' }}>
                  <div style={{ flex: 1, color: 'var(--text)', fontWeight: 600 }}>{p.name}</div>
                  {p.value > 0 && <div style={{ color: 'var(--text)', fontWeight: 700 }}>{formatINR(p.value)}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Activities (${activities.length})`}><ActivityTimeline activities={activities} onEdit={setEditingActivity} addHref={`/dashboard/crm/activities/new?account_id=${id}`} /></Card>

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
            <Stat label="Total" value={formatINR(totalValue)} />
            <Stat label="Open Pipeline" value={formatINR(openDealValue)} />
            <Stat label="Won" value={formatINR(wonValue)} />
          </div>
        </Card>
        <AccountSummaryCard accountId={a.id} initial={a.ai_summary} />
      </div>

      {editingActivity && (
        <EditActivityModal
          activity={editingActivity}
          onClose={() => setEditingActivity(null)}
          onSaved={() => { setEditingActivity(null); void refreshActivities(); }}
        />
      )}

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

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {action ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          {action}
        </div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      )}
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

// A lead's display name: the stamped full name, else first + last, else the company, else the email.
function leadDisplayName(l: Lead): string {
  return (l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.company || l.email || 'Lead');
}

// A monetary value for a lead when the tenant stored one on the row's custom_fields (leads have no value column).
// Never fabricated — returns null when no recognisable, positive amount is present.
function leadValue(l: Lead): number | null {
  const cf = (l.custom_fields || {}) as Record<string, unknown>;
  for (const k of ['deal_value', 'value', 'amount', 'estimated_value', 'budget']) {
    const raw = cf[k];
    const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

type ProductRow = { name: string; value: number };
// Roll the account's deals up to one row per product, summing the per-line value. The products live on each deal's
// custom_fields.line_items (stamped at conversion: { product_name, product_id, subtotal, order_value, … }); the value
// is the ordered amount where present, else the quoted subtotal. Deals with no line items simply contribute nothing,
// so an account whose deals carry no product lines rolls up to an empty list (the card then shows its empty state).
function accountProductRollup(deals: Deal[]): ProductRow[] {
  const map = new Map<string, number>();
  for (const d of deals) {
    const cf = (d.custom_fields || {}) as { line_items?: unknown };
    const lines = Array.isArray(cf.line_items) ? cf.line_items : [];
    for (const raw of lines) {
      if (!raw || typeof raw !== 'object') continue;
      const l = raw as { product_name?: unknown; product_id?: unknown; subtotal?: unknown; order_value?: unknown };
      const name = typeof l.product_name === 'string' && l.product_name.trim()
        ? l.product_name.trim()
        : (typeof l.product_id === 'string' && l.product_id.trim() ? l.product_id.trim() : '');
      if (!name) continue;
      const amt = Number((l.order_value ?? l.subtotal) ?? 0);
      map.set(name, (map.get(name) || 0) + (Number.isFinite(amt) ? amt : 0));
    }
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
