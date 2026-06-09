'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Lead, Activity, Deal, LeadScore, NextBestAction } from '../../../../../types/crm';
import LeadScoreBreakdown from '../../../../../components/crm/LeadScoreBreakdown';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import LeadUpdatesTimeline from '../../../../../components/crm/LeadUpdatesTimeline';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import LeadConvertModal from '../../../../../components/crm/LeadConvertModal';
import LeadDisqualifyModal, { type LeadDisqualifyOutcome } from '../../../../../components/crm/LeadDisqualifyModal';
import AiDraftReplyPanel from '../../../../../components/crm/AiDraftReplyPanel';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';
import WhatsAppButton from '../../../../../components/crm/shared/WhatsAppButton';
import CallButton from '../../../../../components/crm/shared/CallButton';
import LeadEditModal from '../../../../../components/crm/LeadEditModal';
import ScoreBoostSuggestions from '../../../../../components/crm/ScoreBoostSuggestions';
import { formatINR } from '../../../../../lib/formatCurrency';

type UserOption = { id: string; name: string };

// Local extension — Step 1 added these columns server-side but the shared
// Lead type doesn't yet carry them. Read defensively without forcing a
// global type change for two optional fields.
type LifecycleLead = Lead & {
  lost_reason?: string | null;
  disqualified_at?: string | null;
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;
  const [lead, setLead] = useState<LifecycleLead | null>(null);
  const [score, setScore] = useState<LeadScore | null>(null);
  // NBA is computed lazily — the card's "Suggest" button calls loadNba()
  // below to POST to /crm/ai/next-best-action/lead/:id. The 6h server-side
  // cache means repeat clicks within that window are free.
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  // Auto-open the Convert modal when the page is reached with ?convert=1
  // (the leads list "→ Deal" action uses this so users don't have to click
  // through the detail page to find Convert).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('convert') === '1') setConvertOpen(true);
  }, []);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [disqualifyOpen, setDisqualifyOpen] = useState(false);
  const [disqualifyOutcome, setDisqualifyOutcome] = useState<LeadDisqualifyOutcome>('unqualified');
  const [assignOpen, setAssignOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, a, d] = await Promise.allSettled([
        crmLeads.get(id),
        crmLeads.activities(id),
        crmLeads.deals(id),
      ]);
      if (l.status === 'fulfilled') setLead(l.value.data as LifecycleLead);
      if (a.status === 'fulfilled') setActivities(a.value.data || []);
      if (d.status === 'fulfilled') setDeals(d.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!assignOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [assignOpen]);

  const reScore = async () => {
    if (!id) return;
    setScoring(true);
    try {
      const r = await crmAi.scoreLead(id);
      setScore(r.data);
      setLead((l) => l ? { ...l, score: r.data.score, score_grade: r.data.grade } : l);
      toast.success(`Lead scored: ${r.data.score} (${r.data.grade})`);
    } catch (e: any) { toast.error(e.message || 'Scoring failed'); } finally { setScoring(false); }
  };

  // "Boost score" action: mark the lead Qualified, then re-score so the bump
  // shows immediately.
  const [qualifying, setQualifying] = useState(false);
  const markQualified = async () => {
    if (!id) return;
    setQualifying(true);
    try {
      const r = await crmLeads.update(id, { status: 'qualified' } as any);
      setLead(r.data as any);
      toast.success('Lead marked Qualified');
      await reScore();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setQualifying(false); }
  };

  const loadNba = async () => {
    if (!id) return;
    setNbaLoading(true);
    try {
      const r = await crmAi.nextBestActionLead(id);
      setNba(r.data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate next-best-action');
    } finally {
      setNbaLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!window.confirm('Delete this lead? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await crmLeads.remove(lead.id);
      toast.success('Lead deleted');
      router.refresh();
      router.push('/dashboard/crm/leads');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
      setDeleting(false);
    }
  };

  const openDisqualify = (outcome: LeadDisqualifyOutcome) => {
    setDisqualifyOutcome(outcome);
    setDisqualifyOpen(true);
  };

  const handleReopen = async () => {
    if (!lead) return;
    if (!window.confirm('Re-open this lead? It will go back to working state.')) return;
    setReopening(true);
    try {
      await crmLeads.reopen(lead.id);
      toast.success('Lead re-opened');
      await reload();
    } catch (e: any) {
      toast.error(e.message || 'Re-open failed');
    } finally {
      setReopening(false);
    }
  };

  const loadUsers = async () => {
    if (users.length > 0 || usersLoading) return;
    setUsersLoading(true);
    try {
      const r = await api.getUsers() as any;
      const list: UserOption[] = (r.data || r || []).map((u: any) => ({
        id: u.id,
        name: u.name || u.full_name || u.email || 'User',
      }));
      setUsers(list);
    } catch { setUsers([]); } finally { setUsersLoading(false); }
  };

  const handleAssign = async (userId: string, userName: string) => {
    if (!lead) return;
    try {
      const updated = await crmLeads.update(lead.id, { owner_id: userId } as any);
      setLead(updated.data as LifecycleLead);
      toast.success(`Assigned to ${userName}`);
      setAssignOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Assign failed');
    }
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading...</div>;
  if (!lead) return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Lead not found.</div>;

  const fullName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Unnamed';
  const firstName = (lead.first_name || fullName).split(' ')[0];
  const waPrefill = `Hi ${firstName}, `;
  const isB2C = !!lead.is_b2c;
  const isConverted = lead.status === 'converted' || !!lead.converted_at;
  const isUnqualified = lead.status === 'unqualified';
  const isLost = lead.status === 'lost';
  const isClosed = isConverted || isUnqualified || isLost;

  // Responsive layout — flex+wrap so the right column drops below the
  // left on narrow screens instead of squashing into 280px. Left gets
  // `flex 2 1 380px`, right `flex 1 1 280px`. Both wrap onto a single
  // column on mobile.
  return (
    <div>
      <Breadcrumbs items={[
        { label: 'CRM', href: '/dashboard/crm/dashboard' },
        { label: 'Leads', href: '/dashboard/crm/leads' },
        { label: fullName || 'Lead' },
      ]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
      <div style={{ flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          {/* Header — avatar + name on the left, action buttons on the
              right; both wrap to their own rows on narrow screens. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <OwnerAvatar name={fullName} size={52} />
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', wordBreak: 'break-word' }}>{fullName}</div>
                <Badge tone={isB2C ? 'consumer' : 'business'}>{isB2C ? 'B2C' : 'B2B'}</Badge>
                {isConverted && <Badge tone="success">Converted</Badge>}
                {isUnqualified && <Badge tone="warning">Unqualified</Badge>}
                {isLost && <Badge tone="danger">Lost</Badge>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', wordBreak: 'break-word' }}>
                {isB2C
                  ? [lead.city, lead.country].filter(Boolean).join(', ') || '—'
                  : (lead.title ? `${lead.title}${lead.company ? ` · ${lead.company}` : ''}` : (lead.company || '—'))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
              {!isClosed && (
                <button onClick={() => setConvertOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Convert</button>
              )}
              <div ref={assignRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setAssignOpen((o) => !o); loadUsers(); }}
                  style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}
                >
                  Assign
                </button>
                {assignOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 200, minWidth: 180, maxHeight: 240, overflowY: 'auto' }}>
                    {usersLoading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>Loading users...</div>}
                    {!usersLoading && users.length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>No users found</div>}
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAssign(u.id, u.name)}
                        style={{ width: '100%', display: 'block', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!isClosed && (
                <>
                  <button onClick={() => openDisqualify('unqualified')} style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    Mark Unqualified
                  </button>
                  <button onClick={() => openDisqualify('lost')} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    Mark Lost
                  </button>
                </>
              )}
              {isClosed && (
                <button onClick={handleReopen} disabled={reopening} style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.7 : 1 }}>
                  {reopening ? 'Re-opening…' : 'Re-open Lead'}
                </button>
              )}
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Email" value={lead.email} />
            <PhoneField phone={lead.phone} prefill={waPrefill} leadId={lead.id} displayName={fullName} />
            <Field label="Status" value={lead.status} />
            <Field label="Source" value={lead.source_name} />
            <Field label="Owner" value={lead.owner_name || 'Unassigned'} />
            <Field label="Created" value={new Date(lead.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} />
          </div>
        </div>

        {/* Lifecycle status banner — surfaces lost_reason + disqualified_at
            (added in Step 1) and the converted-to links inline so the rep
            sees the closed-out context above the fold. */}
        {(isUnqualified || isLost) && (
          <DisqualifiedBanner
            outcome={isLost ? 'lost' : 'unqualified'}
            lostReason={lead.lost_reason || null}
            disqualifiedAt={lead.disqualified_at || null}
            onReopen={handleReopen}
            reopening={reopening}
          />
        )}
        {isConverted && (lead.converted_account_id || lead.converted_contact_id || lead.converted_deal_id) && (
          <ConvertedBanner
            convertedAt={lead.converted_at || null}
            accountId={lead.converted_account_id || null}
            contactId={lead.converted_contact_id || null}
            dealId={lead.converted_deal_id || null}
            onReopen={handleReopen}
            reopening={reopening}
          />
        )}

        {isB2C && (
          <Card title="Customer Profile">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, fontSize: 13 }}>
              <Field label="Date of Birth" value={lead.date_of_birth ? new Date(lead.date_of_birth).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : null} />
              <Field label="Gender" value={lead.gender ? lead.gender.replace(/_/g, ' ') : null} />
              <Field label="Preferred Channel" value={lead.preferred_contact_method} />
              <Field label="Marketing Consent" value={lead.marketing_consent ? 'Yes' : 'No'} />
              <Field label="WhatsApp Consent" value={lead.whatsapp_consent ? 'Yes' : 'No'} />
              <Field label="Address" value={[lead.address_line1, lead.address_line2, lead.city, lead.state, lead.postal_code, lead.country].filter(Boolean).join(', ') || null} />
            </div>
          </Card>
        )}

        {deals.length > 0 && (
          <Card title={`Deals (${deals.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deals.map((d) => (
                <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} style={rowLink}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600, wordBreak: 'break-word' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.stage_name} · {d.status}</div>
                  </div>
                  <div style={{ color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatINR(d.amount || 0)}</div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card title="Updates">
          <LeadUpdatesTimeline
            leadId={id}
            // Each new update server-side invalidates the lead's NBA cache
            // AND denormalises onto crm_leads.latest_update*. Re-loading the
            // lead picks the fresh latest_update so the header field updates
            // without a full page reload; clearing nba forces a fresh
            // recommendation next time the user clicks Suggest.
            onAdded={() => { reload(); setNba(null); }}
          />
        </Card>
        <Card title="Activity Timeline"><ActivityTimeline activities={activities} /></Card>
        <AiDraftReplyPanel leadId={id} />
      </div>

      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <LeadScoreBreakdown
          score={score?.score ?? lead.score}
          grade={(score?.grade ?? lead.score_grade) as any}
          factors={score?.factors}
          onRefresh={reScore}
          loading={scoring}
        />
        <ScoreBoostSuggestions
          lead={lead as any}
          onEdit={() => setEditOpen(true)}
          onQualify={markQualified}
          busy={qualifying || scoring}
        />
        <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaLoading} leadId={id} />
      </div>

      <LeadConvertModal
        leadId={id}
        defaultDealName={lead.company ? `${lead.company} Opportunity` : fullName}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onConverted={reload}
      />

      <LeadDisqualifyModal
        leadId={id}
        open={disqualifyOpen}
        initialOutcome={disqualifyOutcome}
        onClose={() => setDisqualifyOpen(false)}
        onDone={reload}
      />

      <LeadEditModal
        lead={lead}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setLead(updated as LifecycleLead); reload(); reScore(); }}
      />
      </div>
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
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  );
}

function PhoneField({ phone, prefill, leadId, displayName }: { phone?: string | null; prefill: string; leadId: string; displayName: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>Phone</div>
      <div style={{ color: 'var(--text)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ wordBreak: 'break-word' }}>{phone || '—'}</span>
        <CallButton phone={phone} prefillSubject={`Call with ${displayName}`} leadId={leadId} size="sm" />
        <WhatsAppButton phone={phone} prefillText={prefill} size="sm" />
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'business' | 'consumer' | 'success' | 'muted' | 'warning' | 'danger' }) {
  const colors = {
    business: { bg: '#3b82f6', fg: '#fff' },
    consumer: { bg: '#8b5cf6', fg: '#fff' },
    success:  { bg: '#10b981', fg: '#fff' },
    warning:  { bg: '#f59e0b', fg: '#fff' },
    danger:   { bg: '#ef4444', fg: '#fff' },
    muted:    { bg: 'var(--s3)', fg: 'var(--text-dim)' },
  }[tone];
  return (
    <span style={{ background: colors.bg, color: colors.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>
  );
}

function DisqualifiedBanner({
  outcome, lostReason, disqualifiedAt, onReopen, reopening,
}: {
  outcome: 'unqualified' | 'lost';
  lostReason: string | null;
  disqualifiedAt: string | null;
  onReopen: () => void;
  reopening: boolean;
}) {
  const tone = outcome === 'lost'
    ? { bg: 'rgba(239,68,68,0.10)', border: '#ef4444', label: 'LEAD MARKED AS LOST', accent: '#ef4444' }
    : { bg: 'rgba(245,158,11,0.10)', border: '#f59e0b', label: 'LEAD DISQUALIFIED', accent: '#f59e0b' };
  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: tone.accent, letterSpacing: 0.6 }}>{tone.label}</div>
        {lostReason && <div style={{ color: 'var(--text)', marginTop: 4, fontSize: 14 }}>Reason: {lostReason}</div>}
        {disqualifiedAt && <div style={{ color: 'var(--text-dim)', marginTop: 2, fontSize: 12 }}>On {new Date(disqualifiedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>}
      </div>
      <button onClick={onReopen} disabled={reopening} style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.7 : 1 }}>
        {reopening ? 'Re-opening…' : 'Re-open Lead'}
      </button>
    </div>
  );
}

function ConvertedBanner({
  convertedAt, accountId, contactId, dealId, onReopen, reopening,
}: {
  convertedAt: string | null;
  accountId: string | null;
  contactId: string | null;
  dealId: string | null;
  onReopen: () => void;
  reopening: boolean;
}) {
  return (
    <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid #10b981', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#10b981', letterSpacing: 0.6 }}>LEAD CONVERTED</div>
          {convertedAt && <div style={{ color: 'var(--text-dim)', marginTop: 2, fontSize: 12 }}>On {new Date(convertedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>}
        </div>
        <button onClick={onReopen} disabled={reopening} title="Disconnects this lead from the deal/contact/account so it can be re-worked. The other records stay intact." style={{ background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.7 : 1 }}>
          {reopening ? 'Re-opening…' : 'Re-open Lead'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        {contactId && (<Link href={`/dashboard/crm/contacts/${contactId}`} style={chipLink}>→ Contact</Link>)}
        {accountId && (<Link href={`/dashboard/crm/accounts/${accountId}`} style={chipLink}>→ Account</Link>)}
        {dealId    && (<Link href={`/dashboard/crm/deals/${dealId}`}       style={chipLink}>→ Deal</Link>)}
      </div>
    </div>
  );
}

const chipLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--primary)',
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none',
};
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
