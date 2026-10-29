'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi, crmSettings } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { conversationsApi, type ConversationRow } from '../../../../../lib/conversationsApi';
import type { Deal, LeadScore, NextBestAction } from '../../../../../types/crm';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import LeadConvertModal from '../../../../../components/crm/LeadConvertModal';
import ProposalBuilder from '../../../../../components/crm/ProposalBuilder';
import LeadDisqualifyModal, { type LeadDisqualifyOutcome } from '../../../../../components/crm/LeadDisqualifyModal';
import LeadEditModal from '../../../../../components/crm/LeadEditModal';
import ScoreBoostSuggestions from '../../../../../components/crm/ScoreBoostSuggestions';
import { useAuth } from '../../../../../hooks/useAuth';
import { getStoredUser } from '../../../../../lib/auth';
import { useLeadOwnerAccess } from '../../../../../lib/leadOwnerAccess';
import { isConsumerChampion, isTataTiscanActive, isBmwActive } from '../../../../../lib/clientFeatures';
import { isHorizonOrg } from '../../../../../lib/crmFeatureGates';
import { ConsentCard } from '../../../../../components/crm/DataConsent';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { extractLeadStatuses, type LeadStatusOption } from '../../../../../lib/crmLeadStatuses';
import { DEFAULT_LEAD_FORM, extractLeadForm, segmentName, type LeadFormConfig } from '../../../../../lib/crmLeadForm';
import { Button, Card, EmptyState, T, useIsCompact } from '../../../../../components/ui';
import { usePageTitle } from '../../../../../lib/pageTitle';
import LeadHero from '../../../../../components/crm/lead-detail/LeadHero';
import JourneyStepper from '../../../../../components/crm/lead-detail/JourneyStepper';
import KpiStrip from '../../../../../components/crm/lead-detail/KpiStrip';
import LeadTabs, { type TabDef } from '../../../../../components/crm/lead-detail/LeadTabs';
import OverviewTab from '../../../../../components/crm/lead-detail/OverviewTab';
import TimelineTab from '../../../../../components/crm/lead-detail/TimelineTab';
import DealsTab from '../../../../../components/crm/lead-detail/DealsTab';
import InsightsTab from '../../../../../components/crm/lead-detail/InsightsTab';
import ScoreCard from '../../../../../components/crm/lead-detail/ScoreCard';
import DisqualifiedBanner from '../../../../../components/crm/lead-detail/DisqualifiedBanner';
import DetailSkeleton from '../../../../../components/crm/lead-detail/DetailSkeleton';
import { useLeadUpdates } from '../../../../../components/crm/lead-detail/useLeadUpdates';
import type { DetailActivity } from '../../../../../components/crm/lead-detail/format';
import type { LeadTab, LifecycleLead, UserOption } from '../../../../../components/crm/lead-detail/types';

// Roles that may delete a teammate's update (mirrors the backend allow-list).
const UPDATE_ADMIN_ROLES = new Set(['super_admin', 'admin', 'org_admin']);
// Tenant-admin tier that may edit ANY rep's lead — mirrors the backend
// isTenantAdmin() predicate gating PATCH /leads/:id (Kinematic auth.ts). Must
// stay in lockstep with it, or the `client` / city_manager admin is promised
// (or denied) an Edit affordance the server then disagrees with.
const TENANT_ADMIN_ROLES = ['super_admin', 'admin', 'main_admin', 'sub_admin', 'client', 'city_manager'];
const TAB_IDS: LeadTab[] = ['overview', 'timeline', 'deals', 'insights'];

const tabFromHash = (): LeadTab => {
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace('#', '') as LeadTab;
  return TAB_IDS.includes(h) ? h : 'overview';
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  // Reps with data_scope='own' (e.g. Consumer Champion) only see their own leads — reassigning would
  // hide the record from them. Suppress Assign.
  const canReassign = user?.org_role_data_scope !== 'own';
  // Clients that set lead_form.owner_assignment='admin_only' let only an admin assign a lead: the Assign
  // menu is for them alone. The current owner stays on screen as plain text for everyone.
  const ownerAccess = useLeadOwnerAccess();
  // Edit RBAC — only the rep who CREATED this lead may edit it (plus system-tier CRM admins). Owner /
  // assigned_to grants read but not edit. Mirrors the backend PATCH /leads/:id gate so reps aren't
  // promised an affordance the server will then 403.
  const isAdminTier = TENANT_ADMIN_ROLES.includes((user?.role ?? '').toLowerCase());
  // Tenant + designation gates. Consumer Champion FEs (TATA's frontline designation) don't see the Lead
  // Score breakdown, the boost-score suggestions, or the analytics surface — those tools target managers,
  // not field reps. Tata-Tiscon tenants get the streamlined convert flow (skip the create-account prompt
  // and jump straight to a new Deal where line items are managed) since they only sell deals.
  const isChampion = isConsumerChampion(user as any);
  const isTataActive = isTataTiscanActive(user as any);
  // BMW (a steel-dealer tenant) must use the Convert MODAL — not the Tata/PASA
  // direct-convert bypass — so the rep books a volume and sees the balance. BMW
  // also hides the deals-"won" surfaces (no close-as-won).
  const isBmw = isBmwActive(user as any);
  // Conversation Analysis is removed from the dashboard for the Kaiyo/TATA org — hide the per-lead
  // Call Insights (and skip the fetch) for them. Org-inclusive so the org's null-client_id admin / login
  // accounts are covered too, not just the client-pinned reps.
  const hideConversations = isTataActive || isHorizonOrg((user as any)?.org_id);
  const [tataConverting, setTataConverting] = useState(false);
  const id = params?.id as string;
  const [lead, setLead] = useState<LifecycleLead | null>(null);
  const narrow = useIsCompact(960);

  // Per-tenant built-in field overrides — the detail view is a render site like Create and Edit, so
  // hidden fields stay hidden and relabels apply.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  // The consent card is admin-gated too (`data_consent`), so it waits for the settings instead of flashing up.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Per-client custom lead-status set. Null = use the built-in list / tones (no change for existing tenants).
  const [leadStatuses, setLeadStatuses] = useState<LeadStatusOption[] | null>(null);
  // Client's own names for the lead types ("Dealer" / "Farmers"); B2B / B2C otherwise.
  const [leadForm, setLeadForm] = useState<LeadFormConfig>(DEFAULT_LEAD_FORM);
  useEffect(() => {
    crmSettings.get()
      .then((r) => { setFieldOverrides(extractFieldOverrides(r.data)); setLeadStatuses(extractLeadStatuses(r.data)); setLeadForm(extractLeadForm(r.data)); })
      .catch(() => { /* defaults: nothing hidden, built-in statuses */ })
      .finally(() => setSettingsLoaded(true));
  }, []);
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'lead', lead?.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, lead?.is_b2c],
  );
  usePageTitle(lead ? (lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead') : null);
  const canEditLead = isAdminTier || (!!user?.id && lead?.created_by != null && lead.created_by === user.id);

  const [score, setScore] = useState<LeadScore | null>(null);
  // NBA is computed lazily — the card's "Suggest" button calls loadNba() to POST to
  // /crm/ai/next-best-action/lead/:id. The 6h server-side cache means repeat clicks within that window are free.
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [activities, setActivities] = useState<DetailActivity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  // Conversation Analysis — compact history of recorded/consented calls for this lead. Loaded independently
  // (its own endpoint) so it never blocks the core load; failures are swallowed (module may be off).
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  // Auto-open the Convert modal when the page is reached with ?convert=1 (the leads list "→ Deal" action
  // uses this so users don't have to click through the detail page to find Convert).
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
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  // ── Tabs (the active one lives in the URL hash so a reload or a shared link lands on it) ──
  const [tab, setTab] = useState<LeadTab>('overview');
  useEffect(() => {
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const openTab = useCallback((t: LeadTab) => {
    setTab(t);
    try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${t === 'overview' ? '' : `#${t}`}`); } catch { /* non-browser */ }
  }, []);

  // `silent` refreshes in place (after a note, status change, …) without swapping the page for the skeleton.
  const reload = useCallback(async (silent = true) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const [l, a, d] = await Promise.allSettled([crmLeads.get(id), crmLeads.activities(id), crmLeads.deals(id)]);
      if (l.status === 'fulfilled') setLead(l.value.data as LifecycleLead);
      if (a.status === 'fulfilled') setActivities((a.value.data || []) as DetailActivity[]);
      if (d.status === 'fulfilled') setDeals(d.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    setLead(null); setActivities([]); setDeals([]); setScore(null); setNba(null);
    void reload(false);
  }, [id, reload]);

  // Lead-scoped conversations (secondary — module may not be granted, so a failure just leaves the tab out).
  useEffect(() => {
    if (!id) return;
    if (hideConversations) { setConversations([]); return; }
    let cancelled = false;
    conversationsApi.forLead(id)
      .then((r) => { if (!cancelled) setConversations(r.data || []); })
      .catch(() => { if (!cancelled) setConversations([]); });
    return () => { cancelled = true; };
  }, [id, hideConversations]);

  // Each new update server-side invalidates the lead's NBA cache AND denormalises onto crm_leads.latest_update.
  // Re-loading the lead picks the fresh latest_update; clearing nba forces a fresh recommendation next Suggest.
  const noteChanged = useCallback(() => { void reload(); setNba(null); }, [reload]);
  const updates = useLeadUpdates(id, noteChanged);

  /** PATCH one or more fields and fold the returned row into the page. Throws so inline editors stay open to retry. */
  const patchLead = async (patch: Record<string, unknown>, okText: string) => {
    if (!lead) return;
    try {
      const r = await crmLeads.update(lead.id, patch as any);
      setLead((prev) => ({ ...(prev as LifecycleLead), ...(r.data as LifecycleLead) }));
      toast.success(okText);
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
      throw e;
    }
  };

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

  // "Boost score" action: mark the lead Qualified, then re-score so the bump shows immediately.
  const [qualifying, setQualifying] = useState(false);
  const markQualified = async () => {
    if (!id) return;
    setQualifying(true);
    try {
      const r = await crmLeads.update(id, { status: 'qualified' } as any);
      setLead((prev) => ({ ...(prev as LifecycleLead), ...(r.data as LifecycleLead) }));
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
      const list: UserOption[] = (r.data || r || []).map((u: any) => ({ id: u.id, name: u.name || u.full_name || u.email || 'User' }));
      setUsers(list);
    } catch { setUsers([]); } finally { setUsersLoading(false); }
  };

  const handleAssign = async (userId: string, userName: string) => {
    if (!lead) return;
    try {
      const updated = await crmLeads.update(lead.id, { owner_id: userId } as any);
      // The name is known here; don't depend on the PATCH response carrying the joined owner_name.
      setLead((prev) => ({ ...(prev as LifecycleLead), ...(updated.data as LifecycleLead), owner_id: userId, owner_name: (updated.data as LifecycleLead)?.owner_name ?? userName }));
      toast.success(`Assigned to ${userName}`);
    } catch (e: any) {
      toast.error(e.message || 'Assign failed');
    }
  };

  const changeStatus = async (next: string) => {
    const label = leadStatuses?.find((o) => o.value === next)?.label ?? next.replace(/_/g, ' ');
    try { await patchLead({ status: next }, `Status set to ${label}`); } catch { /* patchLead already toasted */ }
  };

  const stepStatus = async (next: string) => {
    setStatusBusy(true);
    try { await changeStatus(next); } finally { setStatusBusy(false); }
  };

  if (loading && !lead) return <DetailSkeleton narrow={narrow} />;
  if (!lead) return <EmptyState title="Lead not found" description="It may have been deleted, or you may not have access to it." action={<Button href="/dashboard/crm/leads">Back to leads</Button>} />;

  const fullName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Unnamed';
  const firstName = (lead.first_name || fullName).split(' ')[0];
  const waPrefill = `Hi ${firstName}, `;
  const isB2C = !!lead.is_b2c;
  const isConverted = lead.status === 'converted' || !!lead.converted_at;
  const isUnqualified = lead.status === 'unqualified';
  const isLost = lead.status === 'lost';
  const isClosed = isConverted || isUnqualified || isLost;

  // Subtitle under the name — every piece is a built-in field, so each one honours the admin's hide list.
  const subtitle = isB2C
    ? [!fields.isHidden('city') && lead.city, !fields.isHidden('country') && lead.country].filter(Boolean).join(', ')
    : [!fields.isHidden('title') && lead.title, !fields.isHidden('company') && lead.company].filter(Boolean).join(' · ');

  // Telecaller phase 3 — "Engaged campaigns": every campaign this customer has been worked under = the lead's
  // campaign tag ∪ each call's campaign (metadata.campaign, falling back to the lead's tag). Flags a customer
  // touched by more than one campaign. Empty for non-telecaller leads.
  const leadCampaignRaw = (lead.custom_fields as Record<string, unknown> | null)?.campaign;
  const leadCampaign = typeof leadCampaignRaw === 'string' && leadCampaignRaw.trim() ? leadCampaignRaw.trim() : null;
  const campaigns = (() => {
    const set = new Set<string>();
    if (leadCampaign) set.add(leadCampaign);
    for (const a of activities) {
      if (a.type !== 'call') continue;
      const m = a.metadata;
      const c = m && typeof m.campaign === 'string' && m.campaign.trim() ? m.campaign.trim() : (leadCampaign ?? '');
      if (c) set.add(c);
    }
    return Array.from(set);
  })();

  const onConvert = async () => {
    // Tata Tiscon / PASA: bypass the create-account / create-deal popup entirely. Their flow records the deal
    // directly (with line items managed on the deal page), so we call convert with account=false and route
    // straight to the new deal. BMW is EXCLUDED — it must open the modal so the rep enters booked volume and
    // sees the balance.
    if (isTataActive && !isBmw) {
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

  const showScore = !isChampion && !isTataActive && !fields.isHidden('score');
  const hasInsights = !hideConversations && conversations.length > 0;
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline', count: updates.items.length + activities.length },
    { id: 'deals', label: 'Deals', count: deals.length },
    ...(hasInsights ? [{ id: 'insights' as const, label: 'Call insights', count: conversations.length }] : []),
  ];
  const activeTab: LeadTab = tabs.some((t) => t.id === tab) ? tab : 'overview';

  const me = getStoredUser();
  const meCtx = { id: me?.id ?? null, isAdmin: !!me?.role && UPDATE_ADMIN_ROLES.has(me.role) };
  const outcome = isLost ? 'lost' : isUnqualified ? 'unqualified' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LeadHero
        lead={lead}
        fullName={fullName}
        subtitle={subtitle}
        segment={segmentName(leadForm, isB2C ? 'b2c' : 'b2b')}
        isB2C={isB2C}
        fields={fields}
        leadStatuses={leadStatuses}
        closed={{ converted: isConverted, unqualified: isUnqualified, lost: isLost }}
        narrow={narrow}
        canEdit={canEditLead}
        canAssign={canReassign && ownerAccess.canAssign}
        users={users}
        usersLoading={usersLoading}
        onLoadUsers={loadUsers}
        onAssign={handleAssign}
        onRename={async (next) => {
          const parts = next.split(/\s+/).filter(Boolean);
          const first = parts.shift() || next.trim();
          const last = parts.join(' ');
          await patchLead({ first_name: first, last_name: last }, 'Name updated');
          setLead((prev) => (prev ? { ...prev, full_name: `${first} ${last}`.trim() } : prev));
        }}
        onStatusChange={changeStatus}
        onEdit={() => setEditOpen(true)}
        onProposal={isBmw ? undefined : () => setProposalOpen(true)}
        onConvert={onConvert}
        converting={tataConverting}
        onReopen={handleReopen}
        reopening={reopening}
        onDisqualify={openDisqualify}
        onDelete={handleDelete}
        deleting={deleting}
      />

      {/* Lifecycle status banner — lost_reason + disqualified_at so the rep sees the closed-out context above the fold. */}
      {(isUnqualified || isLost) && (
        <DisqualifiedBanner
          outcome={isLost ? 'lost' : 'unqualified'}
          lostReason={lead.lost_reason || null}
          disqualifiedAt={lead.disqualified_at || null}
          onReopen={handleReopen}
          reopening={reopening}
        />
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {!fields.isHidden('status') && (
          <div style={{ padding: narrow ? '14px 16px' : '16px 20px', borderBottom: `1px solid ${T.border}` }}>
            <JourneyStepper status={lead.status} custom={leadStatuses} outcome={outcome} busy={statusBusy} onSelect={stepStatus} onConvert={onConvert} />
          </div>
        )}
        <KpiStrip
          lead={lead}
          activities={activities}
          updates={updates.items}
          deals={deals}
          conversations={conversations}
          showScore={showScore}
          hideWon={isBmw}
          narrow={narrow}
          onOpenTab={openTab}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LeadTabs tabs={tabs} active={activeTab} onChange={openTab} />
          <div role="tabpanel" id={`lead-panel-${activeTab}`} aria-labelledby={`lead-tab-${activeTab}`} tabIndex={0} style={{ outline: 'none', minWidth: 0 }}>
            {activeTab === 'overview' && (
              <OverviewTab
                lead={lead}
                fields={fields}
                hideEmail={isTataActive}
                activities={activities}
                latestUpdate={updates.items[0] ?? null}
                campaigns={campaigns}
                leadCampaign={leadCampaign}
                waPrefill={waPrefill}
                displayName={fullName}
                onPatch={async (patch, okText) => patchLead(patch, okText)}
                onActivitiesChanged={() => { void reload(); }}
                onOpenTab={openTab}
              />
            )}
            {activeTab === 'timeline' && (
              <TimelineTab
                leadId={id}
                leadCampaign={leadCampaign}
                activities={activities}
                updates={updates.items}
                updatesLoading={updates.loading}
                conversations={hasInsights ? conversations : []}
                me={meCtx}
                onAddNote={updates.add}
                onEditNote={updates.edit}
                onDeleteNote={updates.remove}
                onActivitiesChanged={() => { void reload(); }}
              />
            )}
            {activeTab === 'deals' && <DealsTab leadId={id} deals={deals} canConvert={!isClosed} onConvert={onConvert} hideWon={isBmw} showFulfillBalance={isBmw} />}
            {activeTab === 'insights' && hasInsights && <InsightsTab conversations={conversations} />}
          </div>
        </div>

        <aside aria-label="Lead intelligence" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Score + boost suggestions are hidden for Consumer Champion reps AND for the Tata Tiscon tenant —
              their flow doesn't use the AI score-boost loop. The NBA card stays visible since it's an action
              prompt the FE can act on directly. */}
          {showScore && (
            <>
              <ScoreCard lead={lead} score={score} scoring={scoring} onRescore={reScore} />
              <ScoreBoostSuggestions
                lead={lead as any}
                onEdit={() => { if (canEditLead) setEditOpen(true); }}
                onQualify={markQualified}
                busy={qualifying || scoring}
              />
            </>
          )}
          {/* Next Best Action — AI manager-tier surface; hidden for the Consumer Champion FE flow since they don't act on it, and removed entirely for BMW. */}
          {!isChampion && !isBmw && <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaLoading} leadId={id} />}
          {/* DPDP §6(4)-(6) — consent status + in-app withdrawal for this lead. */}
          {settingsLoaded && !fields.isHidden('data_consent') && (
            <ConsentCard subjectType="lead" subjectId={id} title={fields.labelFor('data_consent', 'Consent (DPDP)')} />
          )}
        </aside>
      </div>

      <LeadConvertModal
        leadId={id}
        defaultDealName={fullName}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onConverted={() => { void reload(); }}
      />

      <LeadDisqualifyModal
        leadId={id}
        open={disqualifyOpen}
        initialOutcome={disqualifyOutcome}
        onClose={() => setDisqualifyOpen(false)}
        onDone={() => { void reload(); }}
      />

      <LeadEditModal
        lead={lead}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setLead(updated as LifecycleLead); void reload(); void reScore(); }}
      />

      {proposalOpen && (
        <ProposalBuilder
          leadId={id}
          leadName={fullName}
          leadPhone={lead.phone ?? null}
          leadEmail={lead.email ?? null}
          onClose={() => setProposalOpen(false)}
        />
      )}
    </div>
  );
}
