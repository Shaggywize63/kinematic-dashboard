'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi, crmSettings } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { conversationsApi, statusMeta, sentimentColor, intentColor, fmtDateTime, type ConversationRow } from '../../../../../lib/conversationsApi';
import type { Lead, Activity, Deal, LeadScore, NextBestAction } from '../../../../../types/crm';
import LeadScoreBreakdown from '../../../../../components/crm/LeadScoreBreakdown';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import LeadUpdatesTimeline from '../../../../../components/crm/LeadUpdatesTimeline';
import LeadConvertModal from '../../../../../components/crm/LeadConvertModal';
import ProposalBuilder from '../../../../../components/crm/ProposalBuilder';
import LeadDisqualifyModal, { type LeadDisqualifyOutcome } from '../../../../../components/crm/LeadDisqualifyModal';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';
import WhatsAppButton from '../../../../../components/crm/shared/WhatsAppButton';
import CallButton from '../../../../../components/crm/shared/CallButton';
import RecordedCallButton from '../../../../../components/crm/shared/RecordedCallButton';
import LeadEditModal from '../../../../../components/crm/LeadEditModal';
import InlineEditText from '../../../../../components/crm/InlineEditText';
import LeadDetailsPanel from '../../../../../components/crm/LeadDetailsPanel';
import ScoreBoostSuggestions from '../../../../../components/crm/ScoreBoostSuggestions';
import { formatINR } from '../../../../../lib/formatCurrency';
import { useAuth } from '../../../../../hooks/useAuth';
import { isConsumerChampion, isTataTiscanActive } from '../../../../../lib/clientFeatures';
import { isHorizonOrg } from '../../../../../lib/crmFeatureGates';
import { ConsentCard } from '../../../../../components/crm/DataConsent';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, IconButton, PageHeader, T, cardStyle, useIsCompact } from '../../../../../components/ui';
import { usePageTitle } from '../../../../../lib/pageTitle';
import { ArrowRightLeft, ChevronDown, FileText, Pencil, RotateCcw, Trash2, UserPlus, XCircle } from 'lucide-react';

type UserOption = { id: string; name: string };

// Local extension — Step 1 added these columns server-side but the shared
// Lead type doesn't yet carry them. Read defensively without forcing a
// global type change for two optional fields.
type LifecycleLead = Lead & {
  lost_reason?: string | null;
  disqualified_at?: string | null;
  /** Stamped server-side on insert. Drives the edit gate. */
  created_by?: string | null;
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  // Reps with data_scope='own' (e.g. Consumer Champion) only see their own
  // leads — reassigning would hide the record from them. Suppress Assign.
  const canReassign = user?.org_role_data_scope !== 'own';
  // Edit RBAC — only the rep who CREATED this lead may edit it (plus
  // system-tier CRM admins). Owner / assigned_to grants read but not
  // edit. Mirrors the backend PATCH /leads/:id gate so reps aren't
  // promised an affordance the server will then 403. `lead` is set
  // later by useState; the actual gate is computed inline below.
  const isAdminTier = ['super_admin', 'admin', 'sub_admin']
    .includes((user?.role ?? '').toLowerCase());
  // Tenant + designation gates. Consumer Champion FEs (TATA's frontline
  // designation) don't see the Lead Score breakdown, the boost-score
  // suggestions, or the analytics surface — those tools target managers,
  // not field reps. Tata-Tiscon tenants get the streamlined convert flow
  // (skip the create-account prompt and jump straight to a new Deal where
  // line items are managed) since they only sell deals, never run a
  // separate accounts book.
  const isChampion = isConsumerChampion(user as any);
  const isTataActive = isTataTiscanActive(user as any);
  // Conversation Analysis is removed from the dashboard for the Kaiyo/TATA
  // org — hide the per-lead Conversations card (and skip its fetch) for them.
  // Org-inclusive so the org's null-client_id admin / login accounts are
  // covered too, not just the client-pinned reps.
  const hideConversations = isTataActive || isHorizonOrg((user as any)?.org_id);
  const [tataConverting, setTataConverting] = useState(false);
  const id = params?.id as string;
  const [lead, setLead] = useState<LifecycleLead | null>(null);
  const narrow = useIsCompact(960);
  // Per-tenant built-in field overrides — the detail view is a render site
  // like Create and Edit, so hidden fields stay hidden and relabels apply.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  useEffect(() => {
    crmSettings.get()
      .then((r) => setFieldOverrides(extractFieldOverrides(r.data)))
      .catch(() => { /* defaults: nothing hidden */ });
  }, []);
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'lead', lead?.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, lead?.is_b2c],
  );
  usePageTitle(lead ? (lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead') : null);
  const canEditLead =
    isAdminTier ||
    (!!user?.id && lead?.created_by != null && lead.created_by === user.id);
  const [score, setScore] = useState<LeadScore | null>(null);
  // NBA is computed lazily — the card's "Suggest" button calls loadNba()
  // below to POST to /crm/ai/next-best-action/lead/:id. The 6h server-side
  // cache means repeat clicks within that window are free.
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  // Conversation Analysis — compact history of recorded/consented calls for
  // this lead. Loaded independently (its own endpoint) so it never blocks the
  // core lead/activities/deals load; failures are swallowed (module may be off).
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
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

  // Lead-scoped conversations (secondary — module may not be granted, so a
  // failure just leaves the section hidden).
  useEffect(() => {
    if (!id) return;
    if (hideConversations) { setConversations([]); return; }
    let cancelled = false;
    conversationsApi.forLead(id)
      .then((r) => { if (!cancelled) setConversations(r.data || []); })
      .catch(() => { if (!cancelled) setConversations([]); });
    return () => { cancelled = true; };
  }, [id, hideConversations]);

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
      const r = await api.getUsers({ scope: 'assignable' }) as any;
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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 26, width: 260, borderRadius: 6, background: 'var(--s3)' }} />
        <div style={{ ...cardStyle, height: 160 }} />
        <div style={{ ...cardStyle, height: 240 }} />
      </div>
    );
  }
  if (!lead) return <EmptyState title="Lead not found" description="It may have been deleted, or you may not have access to it." action={<Button href="/dashboard/crm/leads">Back to leads</Button>} />;

  const fullName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Unnamed';
  const firstName = (lead.first_name || fullName).split(' ')[0];
  const waPrefill = `Hi ${firstName}, `;
  const isB2C = !!lead.is_b2c;
  const isConverted = lead.status === 'converted' || !!lead.converted_at;
  const isUnqualified = lead.status === 'unqualified';
  const isLost = lead.status === 'lost';
  const isClosed = isConverted || isUnqualified || isLost;

  // Subtitle under the name — every piece is a built-in field, so each one
  // honours the admin's hide list.
  const subtitle = isB2C
    ? [!fields.isHidden('city') && lead.city, !fields.isHidden('country') && lead.country].filter(Boolean).join(', ')
    : [!fields.isHidden('title') && lead.title, !fields.isHidden('company') && lead.company].filter(Boolean).join(' · ');

  const onConvert = async () => {
    // Tata Tiscon: bypass the create-account / create-deal popup entirely.
    // TATA's flow records the deal directly (with line items managed on the
    // deal page), so we call convert with account=false and route straight
    // to the new deal.
    if (isTataActive) {
      setTataConverting(true);
      try {
        const defaultName = fullName || lead.company || 'New deal';
        const r = await crmLeads.convert(id, { create_account: false, create_deal: true, deal_name: defaultName });
        const data: any = (r as any)?.data ?? r;
        const dealId = data?.deal?.id || data?.deal_id;
        toast.success('Lead converted to deal');
        await reload();
        if (dealId) router.push(`/dashboard/crm/deals/${dealId}`);
        else router.push('/dashboard/crm/deals');
      } catch (e: any) {
        toast.error(e.message || 'Conversion failed');
      } finally {
        setTataConverting(false);
      }
      return;
    }
    setConvertOpen(true);
  };

  const actions = (
    <>
      {canEditLead && <Button onClick={() => setEditOpen(true)} icon={<Pencil size={15} strokeWidth={1.8} />}>Edit</Button>}
      <Button onClick={() => setProposalOpen(true)} icon={<FileText size={15} strokeWidth={1.8} />}>Proposal</Button>
      {canReassign && (
        <div ref={assignRef} style={{ position: 'relative' }}>
          <Button onClick={() => { setAssignOpen((o) => !o); loadUsers(); }} icon={<UserPlus size={15} strokeWidth={1.8} />}>
            Assign <ChevronDown size={14} strokeWidth={1.8} style={{ color: T.mute, marginLeft: -2 }} />
          </Button>
          {assignOpen && (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', zIndex: 200, minWidth: 220, maxHeight: 260, overflowY: 'auto', padding: 4 }}>
              {usersLoading && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>Loading users…</div>}
              {!usersLoading && users.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>No users found</div>}
              {users.map((u) => (
                <button key={u.id} type="button" role="menuitem" onClick={() => handleAssign(u.id, u.name)} className="km-navrow"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px', borderRadius: 6, background: 'transparent', border: 'none', color: T.text, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  <Avatar name={u.name} size={20} />{u.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!isClosed && (
        <>
          <Button variant="ghost" onClick={() => openDisqualify('unqualified')} style={{ color: T.warn }} icon={<XCircle size={15} strokeWidth={1.8} />}>Unqualified</Button>
          <Button variant="danger" onClick={() => openDisqualify('lost')} icon={<XCircle size={15} strokeWidth={1.8} />}>Lost</Button>
          <Button variant="primary" onClick={onConvert} disabled={tataConverting} icon={<ArrowRightLeft size={15} strokeWidth={1.8} />}>
            {tataConverting ? 'Converting…' : 'Convert'}
          </Button>
        </>
      )}
      {isClosed && (
        <Button variant="primary" onClick={handleReopen} disabled={reopening} icon={<RotateCcw size={15} strokeWidth={1.8} />}>
          {reopening ? 'Re-opening…' : 'Re-open lead'}
        </Button>
      )}
      <IconButton label={deleting ? 'Deleting…' : 'Delete lead'} onClick={handleDelete} disabled={deleting} style={{ color: T.red }}>
        <Trash2 size={16} strokeWidth={1.6} />
      </IconButton>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        eyebrow={isB2C ? 'Consumer lead' : 'Business lead'}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Inline per-field edit — change just the name in place. Saves first/last only. */}
            <InlineEditText
              value={fullName}
              ariaLabel="Edit name"
              displayStyle={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, wordBreak: 'break-word' }}
              inputStyle={{ fontSize: 20, fontWeight: 700, minWidth: 220 }}
              onSave={async (next) => {
                const parts = next.split(/\s+/).filter(Boolean);
                const first = parts.shift() || next.trim();
                const last = parts.join(' ');
                try {
                  const r = await crmLeads.update(lead.id, { first_name: first, last_name: last } as any);
                  setLead({ ...(r.data as any), full_name: `${first} ${last}`.trim() } as LifecycleLead);
                  toast.success('Name updated');
                } catch (e: any) {
                  toast.error(e?.message || 'Update failed');
                  throw e; // keep the inline editor open so the rep can retry
                }
              }}
            />
            <Badge tone={isB2C ? 'neutral' : 'info'}>{isB2C ? 'B2C' : 'B2B'}</Badge>
            {isConverted && <Badge tone="ok" dot>Converted</Badge>}
            {isUnqualified && <Badge tone="warn" dot>Unqualified</Badge>}
            {isLost && <Badge tone="red" dot>Lost</Badge>}
          </span>
        }
        description={subtitle || undefined}
        actions={actions}
        compact={narrow}
      />

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header facts — the fields a rep reaches for first. Every built-in
              one is gated through the admin's field overrides. */}
          <Card padding={20}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <OwnerAvatar name={fullName} size={44} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{fullName}</div>
                {!fields.isHidden('owner_id') && <div style={{ fontSize: 12.5, color: T.dim }}>Owner: {lead.owner_name || 'Unassigned'}</div>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 20px' }}>
              {!isTataActive && !fields.isHidden('email') && (
                <Fact
                  label={fields.labelFor('email', 'Email')}
                  value={lead.email}
                  type="email"
                  onSave={async (next) => {
                    try {
                      const r = await crmLeads.update(lead.id, { email: next || null } as any);
                      setLead(r.data as LifecycleLead);
                      toast.success('Email updated');
                    } catch (e: any) {
                      toast.error(e?.message || 'Update failed');
                      throw e;
                    }
                  }}
                />
              )}
              {!fields.isHidden('phone') && (
                <PhoneFact
                  label={fields.labelFor('phone', 'Phone')}
                  phone={lead.phone}
                  prefill={waPrefill}
                  leadId={lead.id}
                  displayName={fullName}
                  onSave={async (next) => {
                    try {
                      const r = await crmLeads.update(lead.id, { phone: next || null } as any);
                      setLead(r.data as LifecycleLead);
                      toast.success('Phone updated');
                    } catch (e: any) {
                      toast.error(e?.message || 'Update failed');
                      throw e;
                    }
                  }}
                />
              )}
              {!fields.isHidden('status') && <Fact label={fields.labelFor('status', 'Status')} value={<StatusPill status={lead.status} />} />}
              {!fields.isHidden('source_id') && <Fact label={fields.labelFor('source_id', 'Source')} value={lead.source_name} />}
              {!fields.isHidden('owner_id') && <Fact label={fields.labelFor('owner_id', 'Owner')} value={lead.owner_name || 'Unassigned'} />}
              <Fact label="Created" value={<span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{new Date(lead.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>} />
            </div>
          </Card>

          {/* Lifecycle status banner — lost_reason + disqualified_at so the rep
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

          {/* Comprehensive categorised detail panel — every lead field grouped
              by Contact / Company / Personal / Address / Custom / Consent, hiding
              any group with no populated values. Gated through `fields`. */}
          <LeadDetailsPanel
            lead={lead}
            fields={fields}
            onPatch={async (patch) => {
              try {
                const r = await crmLeads.update(lead.id, patch as any);
                setLead(r.data as LifecycleLead);
                toast.success('Updated');
              } catch (e: any) {
                toast.error(e?.message || 'Update failed');
                throw e; // keep the inline editor open so the rep can retry
              }
            }}
          />

          {deals.length > 0 && (
            <Section title="Deals" count={deals.length}>
              {/* Rollup strip — Total / Won / Balance across this lead's deals.
                  Won deals carry their won amount (the win flow overwrites
                  `amount` with the closed figure), and open deals — including
                  the "(Balance)" deals spawned by partial closes — ARE the
                  outstanding balance, so summing plain `amount` per status is
                  exactly the split we want. */}
              {(() => {
                const sum = (rows: Deal[]) => rows.reduce((s, d) => s + (Number(d.amount) || 0), 0);
                const total = sum(deals);
                const won = sum(deals.filter((d) => d.status === 'won'));
                const balance = sum(deals.filter((d) => d.status === 'open'));
                const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
                const cell = (label: string, value: number, color?: string) => (
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    <Eyebrow>{label}</Eyebrow>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.mono, color: color || T.text, whiteSpace: 'nowrap' }}>{fmt(value)}</span>
                  </span>
                );
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--s3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                    {cell('Total', total)}
                    {cell('Won', won, T.ok)}
                    {cell('Balance', balance, T.warn)}
                  </div>
                );
              })()}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deals.map((d) => (
                  <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} style={rowLink} className="km-navrow">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.text, fontWeight: 500, wordBreak: 'break-word' }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: T.dim }}>{d.stage_name} · {d.status}</div>
                    </div>
                    <div style={{ color: T.text, fontWeight: 600, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{formatINR(d.amount || 0)}</div>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {!hideConversations && conversations.length > 0 && (
            <Section title="Conversations" count={conversations.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conversations.map((c) => {
                  const sm = statusMeta(c.status);
                  const sc = sentimentColor(c.sentiment);
                  const ic = intentColor(c.intent_score);
                  return (
                    <Link key={c.id} href="/dashboard/crm/conversations" style={rowLink} className="km-navrow">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.text, fontWeight: 500 }}>
                          {c.champion_name || 'Consumer Champion'}
                          <span style={{ fontWeight: 400, color: T.mute, fontSize: 11.5, marginLeft: 8, fontFamily: T.mono }}>{fmtDateTime(c.created_at)}</span>
                        </div>
                        {c.summary && (
                          <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.summary}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          {(c.intent || c.intent_score != null) && (
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 999, background: ic.bg, color: ic.fg }}>
                              {c.intent || 'Intent'}{c.intent_score != null ? ` · ${c.intent_score}` : ''}
                            </span>
                          )}
                          {c.sentiment && (
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 999, background: sc.bg, color: sc.fg }}>{c.sentiment}</span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Updates">
            <LeadUpdatesTimeline
              leadId={id}
              // Each new update server-side invalidates the lead's NBA cache
              // AND denormalises onto crm_leads.latest_update*. Re-loading the
              // lead picks the fresh latest_update so the header field updates
              // without a full page reload; clearing nba forces a fresh
              // recommendation next time the user clicks Suggest.
              onAdded={() => { reload(); setNba(null); }}
            />
          </Section>
          <Section title="Activity"><ActivityTimeline activities={activities} addHref={`/dashboard/crm/activities/new?lead_id=${id}`} /></Section>
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* LeadScoreBreakdown + ScoreBoostSuggestions hidden for Consumer
              Champion reps AND for the Tata Tiscon tenant — their flow
              doesn't use the AI score-boost loop. NBA card stays visible
              since it's an action prompt the FE can act on directly. */}
          {!isChampion && !isTataActive && (
            <>
              <LeadScoreBreakdown
                score={score?.score ?? lead.score}
                grade={(score?.grade ?? lead.score_grade) as any}
                factors={score?.factors}
                onRefresh={reScore}
                loading={scoring}
              />
              <ScoreBoostSuggestions
                lead={lead as any}
                onEdit={() => { if (canEditLead) setEditOpen(true); }}
                onQualify={markQualified}
                busy={qualifying || scoring}
              />
            </>
          )}
          {/* Next Best Action — AI manager-tier surface; hidden for the
              Consumer Champion FE flow since they don't act on it. */}
          {!isChampion && <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaLoading} leadId={id} />}
          {/* DPDP §6(4)-(6) — consent status + in-app withdrawal for this lead. */}
          <ConsentCard subjectType="lead" subjectId={id} />
        </div>
      </div>

      <LeadConvertModal
        leadId={id}
        defaultDealName={fullName}
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

      {proposalOpen && lead && (
        <ProposalBuilder
          leadId={id}
          leadName={fullName}
          leadPhone={(lead as { phone?: string | null }).phone ?? null}
          leadEmail={(lead as { email?: string | null }).email ?? null}
          onClose={() => setProposalOpen(false)}
        />
      )}
    </div>
  );
}

/** Card with a title row — the detail page's section surface. */
function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>{title}</div>
        {typeof count === 'number' && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>{count}</span>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </Card>
  );
}

function Fact({ label, value, onSave, type }: { label: string; value?: React.ReactNode; onSave?: (next: string) => Promise<void>; type?: string }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: T.dim }}>{label}</div>
      {onSave ? (
        <InlineEditText
          value={typeof value === 'string' ? value : ''}
          type={type}
          ariaLabel={`Edit ${label}`}
          onSave={onSave}
          displayStyle={{ color: T.text, fontSize: 13.5, wordBreak: 'break-word' }}
        />
      ) : (
        <div style={{ color: T.text, fontSize: 13.5, wordBreak: 'break-word' }}>{value || '—'}</div>
      )}
    </div>
  );
}

function PhoneFact({ label, phone, prefill, leadId, displayName, onSave }: { label: string; phone?: string | null; prefill: string; leadId: string; displayName: string; onSave?: (next: string) => Promise<void> }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: T.dim }}>{label}</div>
      <div style={{ color: T.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {onSave ? (
          <InlineEditText
            value={phone || ''}
            type="tel"
            ariaLabel="Edit phone"
            onSave={onSave}
            displayStyle={{ color: T.text, fontSize: 13.5, fontFamily: T.mono, wordBreak: 'break-word' }}
          />
        ) : (
          <span style={{ wordBreak: 'break-word', fontFamily: T.mono, fontSize: 13.5 }}>{phone || '—'}</span>
        )}
        <CallButton phone={phone} prefillSubject={`Call with ${displayName}`} leadId={leadId} size="sm" />
        <RecordedCallButton leadId={leadId} phone={phone} size="sm" />
        <WhatsAppButton phone={phone} prefillText={prefill} size="sm" />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const s = (status || 'new').toLowerCase();
  const tone: 'info' | 'ok' | 'warn' | 'red' | 'neutral' =
    s === 'converted' || s === 'qualified' ? 'ok' : s === 'lost' || s === 'unqualified' ? 'red' : s === 'working' ? 'warn' : s === 'new' ? 'info' : 'neutral';
  return <Badge tone={tone} dot>{s.replace(/_/g, ' ')}</Badge>;
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
  const lost = outcome === 'lost';
  return (
    <div style={{ background: lost ? T.redWash : T.warnWash, border: `1px solid ${lost ? T.red : T.warn}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <Eyebrow style={{ color: lost ? T.red : T.warn }}>{lost ? 'Lead marked as lost' : 'Lead disqualified'}</Eyebrow>
        {lostReason && <div style={{ color: T.text, marginTop: 4, fontSize: 13.5 }}>Reason: {lostReason}</div>}
        {disqualifiedAt && <div style={{ color: T.dim, marginTop: 2, fontSize: 12.5, fontFamily: T.mono }}>{new Date(disqualifiedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</div>}
      </div>
      <Button onClick={onReopen} disabled={reopening} icon={<RotateCcw size={15} strokeWidth={1.8} />}>{reopening ? 'Re-opening…' : 'Re-open lead'}</Button>
    </div>
  );
}

const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13.5,
};
