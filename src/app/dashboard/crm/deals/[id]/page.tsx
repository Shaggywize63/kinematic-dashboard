'use client';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmAi, crmLineItems, crmLeads, crmProducts } from '../../../../../lib/crmApi';
import type { Deal, Pipeline, DealHistoryEntry, DealContact, Activity, NextBestAction, WinProbability, DealLineItem, Lead, Product } from '../../../../../types/crm';
import DealStageProgress from '../../../../../components/crm/DealStageProgress';
import WinProbabilityGauge from '../../../../../components/crm/WinProbabilityGauge';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import CallButton from '../../../../../components/crm/shared/CallButton';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import DealEditModal from '../../../../../components/crm/DealEditModal';
import CustomFieldsDetailCard from '../../../../../components/crm/CustomFieldsDetailCard';
import AddToPipelineModal from '../../../../../components/crm/AddToPipelineModal';
import LogoSpinner from '../../../../../components/shared/LogoSpinner';
import { formatINR, formatKg, type DashboardUnit } from '../../../../../lib/formatCurrency';
import { useAuth } from '../../../../../hooks/useAuth';
import { isConsumerChampion } from '../../../../../lib/clientFeatures';

const LOST_REASONS = [
  'Price too high',
  'Lost to competitor',
  'No budget / budget cut',
  'No decision maker reached',
  'Bad timing / not ready',
  'Product doesn\'t fit needs',
  'No response from prospect',
  'Stayed with current solution',
  'Missing features',
  'Project cancelled',
  'Lost on payment terms',
  'Lost on delivery / lead time',
  'Lost on quality / spec mismatch',
  'Internal champion left',
  'Procurement / vendor not approved',
  'Wrong contact / no authority',
  'Duplicate / merged with another deal',
  'Other',
];

const WON_REASONS = [
  'Competitive pricing',
  'Better product fit',
  'Strong relationship / trust',
  'Faster delivery / availability',
  'Better quality / spec match',
  'Better payment / credit terms',
  'Existing vendor expansion',
  'Referral / word of mouth',
  'Bundled deal / cross-sell',
  'Replaced competitor solution',
  'Superior demo / POC result',
  'Better support / SLA',
  'Other',
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const EVENT_LABEL: Record<string, string> = {
  stage_changed: 'Stage changed',
  status_changed: 'Status changed',
  amount_changed: 'Amount changed',
  closed_won: 'Closed as Won',
  closed_lost: 'Closed as Lost',
  reopened: 'Re-opened',
  created: 'Deal created',
  note_added: 'Note added',
  // New free-text entry written by updateDeal when closed_quantities or
  // other non-stage / non-amount fields change. The note itself surfaces
  // alongside this label.
  note: 'Update',
};
const labelEvent = (e?: string) => {
  if (!e) return 'Event';
  return EVENT_LABEL[e] || e.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

function fmtIst(iso?: string | null) {
  if (!iso) return { date: '—', time: '—', ts: '' };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '—', time: '—', ts: iso };
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    return { date, time, ts: iso };
  } catch { return { date: '—', time: '—', ts: iso }; }
}

function normaliseEvent(h: any): { id?: string; eventType: string; createdAt: string; fromStage?: string; toStage?: string; note?: string } | null {
  if (!h || typeof h !== 'object') return null;
  const eventType = h.event_type || h.eventType || h.type || h.event || '';
  const createdAt = h.created_at || h.createdAt || h.timestamp || h.at || '';
  const fromStage = h.from_stage || h.fromStage || h.previous_stage || '';
  const toStage   = h.to_stage   || h.toStage   || h.next_stage     || '';
  const note = typeof h.note === 'string' ? h.note : '';
  if (!eventType && !createdAt && !fromStage && !toStage && !note) return null;
  return { id: h.id, eventType, createdAt, fromStage: fromStage || undefined, toStage: toStage || undefined, note: note || undefined };
}

class SafeRender extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error(`[deal-detail:${this.props.label}]`, error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 10, padding: 12, fontSize: 12, color: '#ef4444' }}>
          <strong>Could not render {this.props.label}.</strong>
          <div style={{ marginTop: 4, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DealDetailPage() {
  // Consumer Champion gate — hides Win Probability + Next Best Action
  // cards. They're manager-tier AI surfaces; reps don't act on them.
  const { user: authUser } = useAuth();
  const isChampion = isConsumerChampion(authUser as Parameters<typeof isConsumerChampion>[0]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  // INR ↔ Weight toggle for the Amount field. Reads / writes the same
  // localStorage key the dashboard analytics page uses so flipping the
  // unit on one surface persists everywhere.
  const [unit, setUnit] = useState<DashboardUnit>('inr');
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem('crm_dashboard_unit') === 'weight') {
        setUnit('weight');
      }
    } catch { /* ignore */ }
  }, []);
  const setUnitPersisted = (next: DashboardUnit) => {
    setUnit(next);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('crm_dashboard_unit', next);
    } catch { /* ignore */ }
  };
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [allPipelines, setAllPipelines] = useState<Pipeline[]>([]);
  const [history, setHistory] = useState<DealHistoryEntry[]>([]);
  const [contacts, setContacts] = useState<DealContact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [winProb, setWinProb] = useState<WinProbability | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageMoving, setStageMoving] = useState(false);
  const [nbaBusy, setNbaBusy] = useState(false);
  const [winBusy, setWinBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<'won' | 'lost'>('won');
  const [closeReason, setCloseReason] = useState('');
  const [closeLostOther, setCloseLostOther] = useState('');
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h, c, a, pp] = await Promise.allSettled([
        crmDeals.get(id),
        crmDeals.history(id),
        crmDeals.contacts(id),
        crmDeals.activities(id),
        crmPipelines.list(),
      ]);
      if (d.status === 'fulfilled' && d.value?.data) {
        const dealData = d.value.data as Deal;
        setDeal(dealData);
        if (dealData.pipeline_id) {
          try {
            const p = await crmPipelines.get(dealData.pipeline_id);
            setPipeline(p?.data || null);
          } catch { setPipeline(null); }
        } else {
          setPipeline(null);
        }
      }
      setHistory(h.status === 'fulfilled' ? (h.value?.data || []) : []);
      setContacts(c.status === 'fulfilled' ? (c.value?.data || []) : []);
      setActivities(a.status === 'fulfilled' ? (a.value?.data || []) : []);
      setAllPipelines(pp.status === 'fulfilled' ? (pp.value?.data || []) : []);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[deal-detail] reload failed', e);
      toast.error(e?.message || 'Load failed');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const moveStage = async (stageId: string) => {
    try {
      if (!deal || !pipeline) return;
      const target = (pipeline.stages || []).find((s) => s?.id === stageId);
      if (!target) { toast.error('Stage not found in this pipeline'); return; }
      if (target.stage_type === 'won') {
        setCloseOutcome('won'); setCloseReason(''); setCloseLostOther(''); setCloseOpen(true);
        return;
      }
      if (target.stage_type === 'lost') {
        setCloseOutcome('lost'); setCloseReason(''); setCloseLostOther(''); setCloseOpen(true);
        return;
      }
      setStageMoving(true);
      await crmDeals.moveStage(deal.id, { stage_id: stageId });
      toast.success(`Moved to ${target.name || 'next stage'}`);
      reload();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[deal-detail] moveStage failed', e);
      toast.error(e?.message || 'Stage update failed');
    } finally { setStageMoving(false); }
  };

  const daysInStage = useMemo<number | undefined>(() => {
    if (!deal) return undefined;
    try {
      const sinceIso =
        (deal as any).stage_changed_at ||
        history.find((h) => h?.event_type === 'stage_changed' || h?.to_stage)?.created_at ||
        deal.created_at;
      if (!sinceIso) return undefined;
      const t = new Date(sinceIso).getTime();
      if (Number.isNaN(t)) return undefined;
      return Math.max(0, Math.floor((Date.now() - t) / MS_PER_DAY));
    } catch { return undefined; }
  }, [deal, history]);

  const daysToClose = useMemo<number | null>(() => {
    if (!deal?.expected_close_date) return null;
    try {
      const t = new Date(deal.expected_close_date).getTime();
      if (Number.isNaN(t)) return null;
      return Math.ceil((t - Date.now()) / MS_PER_DAY);
    } catch { return null; }
  }, [deal]);

  const usefulHistory = useMemo(() => {
    return (history || [])
      .map((h) => normaliseEvent(h))
      .filter((e): e is NonNullable<ReturnType<typeof normaliseEvent>> => e !== null);
  }, [history]);

  const markStageComplete = () => {
    try {
      if (!deal || !pipeline) return;
      const sorted = [...(pipeline.stages || [])].sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
      const currIdx = sorted.findIndex((s) => s?.id === deal.stage_id);
      for (let i = currIdx + 1; i < sorted.length; i++) {
        if (sorted[i]?.stage_type === 'open') { moveStage(sorted[i].id); return; }
      }
      toast.info('No more open stages — use Close Deal to mark won or lost.');
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[deal-detail] markStageComplete failed', e);
    }
  };

  const closeDeal = async () => {
    if (!deal) return;
    if (!closeReason) { toast.error('Pick a reason from the dropdown'); return; }
    setClosing(true);
    try {
      const finalReason = closeReason === 'Other' ? (closeLostOther.trim() || 'Other') : closeReason;
      if (closeOutcome === 'won') {
        await crmDeals.win(deal.id, { reason: finalReason });
        toast.success('Deal closed as Won 🎉');
      } else {
        await crmDeals.lose(deal.id, { reason: finalReason });
        toast.success('Deal closed as Lost');
      }
      setCloseOpen(false);
      setCloseReason('');
      setCloseLostOther('');
      reload();
    } catch (e: any) { toast.error(e?.message || 'Close failed'); }
    finally { setClosing(false); }
  };
  const reopenDeal = async () => {
    if (!deal) return;
    if (!window.confirm('Re-open this deal? It will return to open status.')) return;
    setReopening(true);
    try {
      await crmDeals.update(deal.id, { status: 'open' } as any);
      toast.success('Deal re-opened');
      reload();
    } catch (e: any) { toast.error(e?.message || 'Re-open failed'); }
    finally { setReopening(false); }
  };
  const loadNba = async () => {
    if (!deal) return;
    setNbaBusy(true);
    try { const r = await crmAi.nextBestAction(deal.id); setNba(r?.data || null); }
    catch (e: any) {
      // KINI calls auto-fire on every deal-detail open. When the org
      // (or the user) is over the monthly KINI cap, the backend
      // returns 429 USER_KINI_LIMIT_REACHED / ORG_KINI_LIMIT_REACHED.
      // Hema and other reps who haven't used KINI themselves were
      // getting a toast on EVERY deal page load when the org-wide
      // cap was breached by someone else — they'd rightly complain
      // "I never used KINI, why am I getting this error?". We log
      // to the console for debugging and let the card render its
      // empty state ("Suggest" button) so the rep can opt in
      // manually when the cap resets.
      // eslint-disable-next-line no-console
      console.warn('[deal-detail] NBA unavailable', e?.message || e);
    } finally { setNbaBusy(false); }
  };
  const loadWinProb = async () => {
    if (!deal) return;
    setWinBusy(true);
    try { const r = await crmAi.winProbability(deal.id); setWinProb(r?.data || null); }
    catch (e: any) {
      // Same rationale as loadNba above — silent failure so reps
      // who haven't used KINI don't get spammed when the org cap
      // is hit. The gauge falls back to its empty state and the
      // rep can hit "Refresh" to retry if/when the cap resets.
      // eslint-disable-next-line no-console
      console.warn('[deal-detail] winProb unavailable', e?.message || e);
    } finally { setWinBusy(false); }
  };

  useEffect(() => {
    if (!deal) return;
    if (!winProb && !winBusy) loadWinProb();
    if (!nba && !nbaBusy) loadNba();
    // eslint-disable-next-line
  }, [deal?.id]);

  const handleDelete = async () => {
    if (!deal) return;
    if (!window.confirm('Delete this deal? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await crmDeals.remove(deal.id);
      toast.success('Deal deleted');
      router.refresh();
      router.push('/dashboard/crm/deals');
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
      setDeleting(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!deal) return <div style={{ color: 'var(--text-dim)' }}>Deal not found.</div>;
  const stages = pipeline?.stages || [];
  const primary = contacts.find((c) => c?.is_primary) || contacts[0];
  const hasPipeline = !!deal.pipeline_id && stages.length > 0;
  const dealName = deal.name || 'Untitled deal';

  const effectiveStageId = (() => {
    if (deal.status === 'won') {
      const wonStage = stages.find((s) => s?.stage_type === 'won');
      if (wonStage?.id) return wonStage.id;
    } else if (deal.status === 'lost') {
      const lostStage = stages.find((s) => s?.stage_type === 'lost');
      if (lostStage?.id) return lostStage.id;
    }
    return deal.stage_id || '';
  })();

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'CRM', href: '/dashboard/crm/dashboard' },
        { label: 'Deals', href: '/dashboard/crm/deals' },
        { label: deal.name || 'Deal' },
      ]} />
      {hasPipeline && (
        <SafeRender label="stage breadcrumb">
          <div style={{ position: 'relative', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            {deal.status === 'open' ? (
              <DealStageProgress
                stages={stages}
                currentStageId={effectiveStageId}
                daysInStage={daysInStage}
                daysToClose={daysToClose}
                onMove={moveStage}
                onMarkComplete={markStageComplete}
              />
            ) : (
              <DealStageProgress stages={stages} currentStageId={effectiveStageId} />
            )}
            {stageMoving && <LogoSpinner overlay size={44} label="Updating stage…" />}
          </div>
        </SafeRender>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', wordBreak: 'break-word' }}>{dealName}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  {deal.account_id ? (
                    <Link href={`/dashboard/crm/accounts/${deal.account_id}`} style={{ color: 'var(--primary)' }}>
                      {deal.account_name || 'View account'}
                    </Link>
                  ) : 'No account'}
                  {/* Source lead — the backend stamps lead_name / lead_phone on the
                      deal so reps can call the customer without opening the lead. */}
                  {deal.lead_id && (
                    <>
                      <span> · </span>
                      <Link href={`/dashboard/crm/leads/${deal.lead_id}`} style={{ color: 'var(--primary)' }}>
                        {deal.lead_name ? `Lead: ${deal.lead_name}` : 'From lead'}
                      </Link>
                      {deal.lead_phone && <span> · {deal.lead_phone}</span>}
                    </>
                  )}
                  {pipeline && (<><span> · </span><span title="Current pipeline">📋 {pipeline.name}</span></>)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={() => setPipelineModalOpen(true)}
                  style={{ background: hasPipeline ? 'var(--s3)' : 'var(--primary)', border: hasPipeline ? '1px solid var(--border)' : 'none', color: hasPipeline ? 'var(--text)' : '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  {hasPipeline ? 'Move pipeline' : '+ Add to pipeline'}
                </button>
                <button onClick={() => setEditOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                {deal.status === 'open' && (
                  <button onClick={() => { setCloseOutcome('won'); setCloseOpen(true); }} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Close Deal</button>
                )}
                {deal.status !== 'open' && (
                  <button onClick={reopenDeal} disabled={reopening} style={{ background: 'var(--s3)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.6 : 1 }}>{reopening ? 'Re-opening...' : 'Re-open Deal'}</button>
                )}
                <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting...' : 'Delete'}</button>
                <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
              </div>
            </div>
            {deal.status === 'won' && (
              <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>
                ✓ This deal is closed as WON
              </div>
            )}
            {deal.status === 'lost' && (
              <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>
                ✗ This deal is closed as LOST
              </div>
            )}
            {(() => {
              // Hero Amount + Weight card — pulled out of the small Field
              // grid so the two headline numbers dominate the detail page.
              // Weight prefers deal.custom_fields.volume_kg, falls back to
              // recomputing from product_lines (1 kg / 1000 tonne).
              const cf = ((deal as Deal & { custom_fields?: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
              let kg = 0;
              const cached = cf.volume_kg;
              const cachedNum = typeof cached === 'number' ? cached : Number(cached);
              if (Number.isFinite(cachedNum) && cachedNum > 0) kg = cachedNum;
              else {
                const lines = cf.product_lines;
                if (Array.isArray(lines)) {
                  for (const l of lines as Array<Record<string, unknown>>) {
                    const qty = Number(l.quantity ?? 0);
                    if (!Number.isFinite(qty) || qty <= 0) continue;
                    const u = String(l.measuring_unit ?? '').trim().toLowerCase();
                    kg += qty * (u === 'tonne' ? 1000 : 1);
                  }
                }
              }
              return (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(99,102,241,0.02))',
                  border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Amount</div>
                    <div style={{ fontSize: 30, color: 'var(--text)', fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
                      {formatINR(Number(deal.amount) || 0)}
                    </div>
                  </div>
                  {kg > 0 && (
                    <>
                      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Weight</div>
                        <div style={{ fontSize: 30, color: 'var(--text)', fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
                          {formatKg(kg)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, fontSize: 13 }}>
              {/* Dealer is stamped server-side on the deal row — surfaced here
                  so reps see it in the summary, not only in the custom-fields
                  card further down. Hidden when the tenant doesn't stamp it. */}
              {deal.dealer_name && <Field label="Dealer" value={deal.dealer_name} />}
              <Field label="Stage" value={deal.stage_name} />
              <Field label="Status" value={deal.status} />
              <Field label="Probability" value={`${Math.round((Number(deal.probability) || 0) * 100)}%`} />
              <Field label="Close Date" value={fmtIst(deal.expected_close_date).date} />
              <Field label="Owner" value={deal.owner_name} />
              {deal.lead_phone && <Field label="Lead Phone" value={deal.lead_phone} />}
            </div>
          </div>

          <SafeRender label="contacts">
            <Card title={`Contacts (${contacts.length})`}>
              {contacts.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                  {deal.primary_contact_id ? (
                    <Link href={`/dashboard/crm/contacts/${deal.primary_contact_id}`} style={{ color: 'var(--primary)' }}>View primary contact</Link>
                  ) : 'No contacts linked.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contacts.map((dc) => {
                    if (!dc) return null;
                    const c = dc.contact;
                    const name = c?.full_name || `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || c?.email || '—';
                    return (
                      <div key={dc.contact_id || Math.random()} style={{ ...rowLink, padding: 0, background: 'transparent', border: 'none', flexWrap: 'wrap' }}>
                        <Link href={`/dashboard/crm/contacts/${dc.contact_id}`} style={{ ...rowLink, flex: '1 1 220px', marginRight: 0, minWidth: 0 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--text)', fontWeight: 600, wordBreak: 'break-word' }}>
                              {name}
                              {dc.is_primary && <span style={{ marginLeft: 8, fontSize: 9, background: 'var(--primary)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>PRIMARY</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{dc.role || c?.title || c?.email || '—'}</div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c?.phone || ''}</div>
                        </Link>
                        <CallButton
                          phone={c?.phone}
                          prefillSubject={`Call about ${dealName}`}
                          dealId={deal.id}
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </SafeRender>

          <SafeRender label="products">
            <DealProductsCard deal={deal} />
          </SafeRender>

          {/* Read-only admin-defined custom fields. The keys this page
              already renders specially (Products / Weight hero / follow-up)
              are skipped so they don't double-render. */}
          <SafeRender label="custom fields">
            <CustomFieldsDetailCard
              entity="deal"
              customFields={deal.custom_fields}
              skipKeys={['product_lines', 'line_items', 'volume_kg', 'closed_quantities', 'next_action_type', 'next_action_at']}
            />
          </SafeRender>

          <SafeRender label="activities">
            <Card title={`Activities (${activities.length})`}><ActivityTimeline activities={activities} /></Card>
          </SafeRender>

          <SafeRender label="history">
            <Card title="History">
              {usefulHistory.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No events yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {usefulHistory.map((h, idx) => {
                    const t = fmtIst(h.createdAt);
                    const isStageChange = !!(h.fromStage && h.toStage);
                    return (
                      <div key={h.id || idx} style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '10px 12px', background: 'var(--s3)', borderRadius: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{labelEvent(h.eventType)}</span>
                          {isStageChange && (
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                              <span style={{ color: 'var(--text)' }}>{h.fromStage}</span>
                              <span> → </span>
                              <span style={{ color: '#3E9EFF', fontWeight: 700 }}>{h.toStage}</span>
                            </span>
                          )}
                        </div>
                        {/* Free-text annotation written by updateDeal for
                            non-stage edits (e.g. closed-quantity updates),
                            so the rep can see exactly what changed. */}
                        {h.note && (
                          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{h.note}</div>
                        )}
                        {h.createdAt && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span>{t.date}</span>
                            <span>·</span>
                            <span>{t.time} IST</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </SafeRender>

        </div>

        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {primary && primary.contact_id && (
            <Card title="Primary Contact">
              <Link href={`/dashboard/crm/contacts/${primary.contact_id}`} style={chipLink}>
                → {primary.contact?.full_name || `${primary.contact?.first_name || ''} ${primary.contact?.last_name || ''}`.trim() || 'View contact'}
              </Link>
            </Card>
          )}

          {/* Win Probability + Next Best Action are AI manager-tier
              surfaces — hidden for Consumer Champions who own the
              FE-tier flow and don't act on these recommendations. */}
          {!isChampion && (
          <SafeRender label="win probability">
            <div style={{ position: 'relative' }}>
              <WinProbabilityGauge
                probability={winProb?.probability ?? (deal as any).ai_win_probability ?? deal.probability ?? 0}
                confidence={winProb?.confidence ?? (deal as any).ai_win_confidence ?? undefined}
                drivers={winProb?.drivers}
                reasoning={winProb?.reasoning}
                breakdown={winProb?.breakdown}
                ai
              />
              {winBusy && !winProb && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogoSpinner size={40} label="Forecasting…" />
                </div>
              )}
            </div>
          </SafeRender>
          )}
          {!isChampion && (
          <button onClick={loadWinProb} disabled={winBusy} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
            {winBusy ? 'Predicting…' : 'Re-forecast Win Probability'}
          </button>
          )}
          {!isChampion && (
          <SafeRender label="next best action">
            <div style={{ position: 'relative' }}>
              <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaBusy} dealId={id} />
              {nbaBusy && !nba && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogoSpinner size={40} label="Computing…" />
                </div>
              )}
            </div>
          </SafeRender>
          )}
        </div>
      </div>

      <DealEditModal
        deal={deal}
        stages={stages}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setDeal(updated); reload(); }}
      />

      <AddToPipelineModal
        deal={deal}
        pipelines={allPipelines}
        open={pipelineModalOpen}
        onClose={() => setPipelineModalOpen(false)}
        onUpdated={(updated) => { setDeal(updated); reload(); }}
      />

      {closeOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setCloseOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, maxWidth: 460, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Close Deal</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>Mark this deal as won or lost. You can re-open it later if needed.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={() => setCloseOutcome('won')} style={{ padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: closeOutcome === 'won' ? '2px solid #10b981' : '1px solid var(--border)', background: closeOutcome === 'won' ? 'rgba(16,185,129,0.12)' : 'var(--s3)', color: closeOutcome === 'won' ? '#10b981' : 'var(--text)' }}>✓ Won</button>
              <button type="button" onClick={() => setCloseOutcome('lost')} style={{ padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: closeOutcome === 'lost' ? '2px solid #ef4444' : '1px solid var(--border)', background: closeOutcome === 'lost' ? 'rgba(239,68,68,0.10)' : 'var(--s3)', color: closeOutcome === 'lost' ? '#ef4444' : 'var(--text)' }}>✗ Lost</button>
            </div>
            {closeOutcome === 'lost' ? (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Lost Reason <span style={{ color: '#ef4444' }}>*</span></span>
                <select value={closeReason} onChange={(e) => { setCloseReason(e.target.value); setCloseLostOther(''); }} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="">— Select a reason —</option>
                  {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {closeReason === 'Other' && (
                  <input value={closeLostOther} onChange={(e) => setCloseLostOther(e.target.value)} placeholder="Describe the reason…" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Win Reason <span style={{ color: '#ef4444' }}>*</span></span>
                <select value={closeReason} onChange={(e) => { setCloseReason(e.target.value); setCloseLostOther(''); }} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="">— Select a reason —</option>
                  {WON_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {closeReason === 'Other' && (
                  <input value={closeLostOther} onChange={(e) => setCloseLostOther(e.target.value)} placeholder="Describe the reason…" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCloseOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={closeDeal} disabled={closing} style={{ background: closeOutcome === 'won' ? '#10b981' : '#ef4444', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: closing ? 'not-allowed' : 'pointer', fontSize: 13, opacity: closing ? 0.7 : 1 }}>{closing ? 'Closing...' : `Close as ${closeOutcome === 'won' ? 'Won' : 'Lost'}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Products section — replaces the legacy line-items table on the deal
 * page. Reads the product_lines the rep captured on the linked LEAD
 * (custom_fields.product_lines) and lays them out as one row per
 * product with four columns: Product Name | Estimated Quantity (with
 * its unit) | Closed Quantity (editable, number) | Balance (read-only).
 *
 * Balance = closed_quantity - estimated_quantity. The display strips
 * the sign so the cell always reads as a positive number, and a
 * directional arrow icon encodes the polarity:
 *
 *   positive balance (closed > estimated): RED arrow pointing DOWN
 *   negative balance (closed < estimated): GREEN arrow pointing UP
 *   zero:                                  no arrow
 *
 * Closed quantities live on the deal under
 *   deal.custom_fields.closed_quantities = { [product_id]: number }
 * and persist via crmDeals.update(...). Edits debounce-save to avoid
 * pounding the API on every keystroke.
 */
function DealProductsCard({ deal }: { deal: Deal }) {
  type LeadLine = { product_id?: string | null; quantity?: number | string | null; measuring_unit?: string | null };
  // Per-row snapshot of the bits the Products table needs to compute the
  // three amount columns: estimated, closed, and balance. price / weight_kg
  // come from the products catalogue so re-saving the deal doesn't have to
  // re-resolve the product. unitFactor is 1 for kg and 1000 for tonne.
  type ProductRow = {
    product_id: string;
    product_name: string;
    estimated: number;
    unit: string;
    price: number;
    weight_kg: number;
    unitFactor: number;
  };

  const leadId = (deal as Deal & { lead_id?: string | null }).lead_id ?? null;
  const dealCf = ((deal as Deal & { custom_fields?: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  const initialClosed = (() => {
    const raw = dealCf.closed_quantities;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) out[k] = n;
      }
      return out;
    }
    return {};
  })();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [closed, setClosed] = useState<Record<string, number>>(initialClosed);
  // String-edit buffer so the rep can clear a cell mid-typing without
  // it snapping back to 0 — we only push the number into `closed`
  // (and persist) once a valid number is entered.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Snapshot of `closed` taken from the server on load + after each save.
  // Used to compute the dirty flag and the "Reset" button.
  const [savedClosed, setSavedClosed] = useState<Record<string, number>>(initialClosed);

  // Load: linked lead's product_lines + the products catalogue (for
  // resolving UUID → name when the line doesn't carry a snapshot label).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leadR, prodR] = await Promise.allSettled([
          leadId ? crmLeads.get(leadId) : Promise.resolve(null),
          crmProducts.list(),
        ]);
        if (cancelled) return;
        const productList = prodR.status === 'fulfilled' ? (prodR.value?.data ?? []) : [];
        const map = new Map<string, Product>();
        productList.forEach((p) => map.set(p.id, p));
        setProductMap(map);
        if (leadR.status === 'fulfilled' && leadR.value) {
          const lead = leadR.value.data as Lead & { custom_fields?: Record<string, unknown> | null };
          const cf = (lead?.custom_fields ?? {}) as Record<string, unknown>;
          let lines: LeadLine[] = [];
          const arr = cf.product_lines;
          if (Array.isArray(arr) && arr.length > 0) {
            lines = arr as LeadLine[];
          } else if (cf.product_interested || cf.quantity != null) {
            lines = [{
              product_id: cf.product_interested as string | null,
              quantity: cf.quantity as number | string | null,
              measuring_unit: typeof cf.measuring_unit === 'string' ? cf.measuring_unit : null,
            }];
          }
          const built: ProductRow[] = lines
            .filter((l) => !!l.product_id)
            .map((l) => {
              const p = map.get(String(l.product_id));
              const qty = typeof l.quantity === 'number' ? l.quantity : Number(l.quantity ?? 0);
              const unit = (l.measuring_unit || '').toString();
              const unitFactor = unit.trim().toLowerCase() === 'tonne' ? 1000 : 1;
              return {
                product_id: String(l.product_id),
                product_name: p?.name ?? String(l.product_id).slice(0, 8),
                estimated: Number.isFinite(qty) ? qty : 0,
                unit,
                price: Number(p?.price ?? 0),
                weight_kg: Number(p?.weight_kg ?? 0),
                unitFactor,
              };
            });
          setRows(built);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-read the linked lead's basket whenever the deal is updated (e.g. the
    // rep corrected a product in the edit modal, which writes back to the
    // lead) so the card reflects the fix without a full page reload.
  }, [leadId, deal.updated_at]);

  // Mark the row dirty whenever the rep edits a value so the Save
  // button can light up; explicit save replaces the previous
  // auto-save-on-keystroke so each save lands as one history entry.
  useEffect(() => {
    if (loading) return;
    const aKeys = Object.keys(closed).sort();
    const bKeys = Object.keys(savedClosed).sort();
    const sameKeys = aKeys.length === bKeys.length && aKeys.every((k, i) => k === bKeys[i]);
    const sameVals = sameKeys && aKeys.every((k) => closed[k] === savedClosed[k]);
    setDirty(!sameVals);
  }, [closed, savedClosed, loading]);

  // Explicit save — fires one PATCH and records a single deal-history
  // entry. We don't auto-save anymore so the rep can review the row
  // before committing.
  const saveClosed = async () => {
    try {
      setSaving(true);
      const nextCf = { ...dealCf, closed_quantities: closed };
      await crmDeals.update(deal.id, { custom_fields: nextCf } as unknown as Partial<Deal>);
      setSavedClosed(closed);
      setDirty(false);
      toast.success('Saved');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Could not save closed quantities');
    } finally {
      setSaving(false);
    }
  };

  // Cell renderer for the balance column. The sign is stripped so the
  // cell always reads as a positive number; a directional arrow encodes
  // polarity:
  //   closed < estimated → RED ▼ (rep is short of the target)
  //   closed ≥ estimated → GREEN ▲ (target met or over-delivered)
  // When the rep has hit the target exactly the cell reads "0" with the
  // green ▲ — same green-up treatment as an over-delivery.
  const renderBalance = (estimated: number, closed: number, opts?: { currency?: boolean }) => {
    const balance = closed - estimated;
    const abs = Math.abs(balance);
    const display = opts?.currency
      ? `₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : (Number.isInteger(abs) ? String(abs) : abs.toFixed(2));
    if (closed < estimated) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 700 }}>
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>▼</span>
          <span>{display}</span>
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700 }}>
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>▲</span>
        <span>{display}</span>
      </span>
    );
  };

  // Amount math: amount = (price / weight_kg) × (quantity × unitFactor).
  // Returns 0 when any leg is missing or non-positive — same convention
  // the lead form uses.
  const amountFor = (row: ProductRow, qty: number): number => {
    if (row.price <= 0 || row.weight_kg <= 0 || qty <= 0) return 0;
    return (row.price / row.weight_kg) * (qty * row.unitFactor);
  };

  const fmtINR = (n: number): string =>
    n > 0 ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';

  if (loading) {
    return (
      <Card title="Products">
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
      </Card>
    );
  }
  if (!leadId) {
    return (
      <Card title="Products">
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Link this deal to a lead to track product quantities here.
        </div>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card title="Products">
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          The linked lead doesn&rsquo;t have any product lines yet. Capture them on the lead form to see them here.
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Products${saving ? ' · Saving…' : ''}`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>Product Interested</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Closed Quantity</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Balance</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Estimate Amount</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Closed Amount</th>
              <th style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Balance Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const closedVal = closed[r.product_id] ?? 0;
              const draftVal = draft[r.product_id];
              const inputVal = draftVal !== undefined ? draftVal : (closedVal ? String(closedVal) : '');
              const estimateAmount = amountFor(r, r.estimated);
              const closedAmount = amountFor(r, closedVal);
              return (
                <tr key={r.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', color: 'var(--text)' }}>{r.product_name}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>
                    {r.estimated}{r.unit ? <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{r.unit}</span> : null}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={inputVal}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({ ...d, [r.product_id]: v }));
                        if (v === '') {
                          setClosed((c) => { const n = { ...c }; delete n[r.product_id]; return n; });
                        } else {
                          const n = Number(v);
                          if (Number.isFinite(n)) {
                            setClosed((c) => ({ ...c, [r.product_id]: n }));
                          }
                        }
                      }}
                      style={{ ...inlineInputRight, maxWidth: 110, marginLeft: 'auto' }}
                      placeholder="0"
                    />
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {renderBalance(r.estimated, closedVal)}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>
                    {fmtINR(estimateAmount)}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>
                    {fmtINR(closedAmount)}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {renderBalance(estimateAmount, closedAmount, { currency: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        {dirty && (
          <button
            type="button"
            onClick={() => { setClosed(savedClosed); setDraft({}); setDirty(false); }}
            disabled={saving}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >Reset</button>
        )}
        <button
          type="button"
          onClick={() => { void saveClosed(); }}
          disabled={!dirty || saving}
          style={{
            background: dirty ? 'var(--primary)' : 'var(--s3)',
            border: 'none',
            color: dirty ? '#fff' : 'var(--text-dim)',
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Card>
  );
}

/**
 * Editable line items section — reads from crm_deal_line_items via the
 * /deals/:id/line-items endpoint and lets the rep add / edit / delete
 * rows. Each row has a name, optional product reference, qty, unit
 * price, and an auto-computed line_total. The card sums the total at
 * the bottom so the rep can see the deal value materialise as they add
 * line items. Bespoke for the use case "record multiple deal values on
 * the deal page" — one deal, N line items, total = Σ line_total.
 */
function EditableLineItemsCard({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<DealLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; quantity: string; unit_price: string }>({ name: '', quantity: '1', unit_price: '0' });
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<{ name: string; quantity: string; unit_price: string }>({ name: '', quantity: '1', unit_price: '0' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await crmDeals.listLineItems(dealId);
      setItems(r.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load line items');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dealId]);

  const total = items.reduce((s, l) => s + (Number(l.line_total) || 0), 0);

  const startEdit = (l: DealLineItem) => {
    setEditingId(l.id);
    setDraft({ name: l.name || '', quantity: String(l.quantity ?? 1), unit_price: String(l.unit_price ?? 0) });
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      const r = await crmLineItems.update(id, {
        name: draft.name.trim() || undefined,
        quantity: Number(draft.quantity) || 0,
        unit_price: Number(draft.unit_price) || 0,
      });
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...r.data } : l)));
      setEditingId(null);
      toast.success('Line item updated');
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this line item?')) return;
    setBusyId(id);
    try {
      await crmLineItems.remove(id);
      setItems((prev) => prev.filter((l) => l.id !== id));
      toast.success('Line item deleted');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally { setBusyId(null); }
  };

  const addRow = async () => {
    const nm = newRow.name.trim();
    if (!nm) { toast.error('Name is required'); return; }
    const qty = Number(newRow.quantity) || 0;
    const up = Number(newRow.unit_price) || 0;
    setAdding(true);
    try {
      const r = await crmDeals.addLineItem(dealId, { name: nm, quantity: qty, unit_price: up });
      setItems((prev) => [...prev, r.data]);
      setNewRow({ name: '', quantity: '1', unit_price: '0' });
      toast.success('Line item added');
    } catch (e: any) {
      toast.error(e.message || 'Add failed');
    } finally { setAdding(false); }
  };

  return (
    <Card title={`Line Items${items.length > 0 ? ` (${items.length})` : ''}`}>
      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          No line items yet. Add one to record a deal value.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={th}>Item</th>
                <th style={thRight}>Qty</th>
                <th style={thRight}>Unit Price</th>
                <th style={thRight}>Total</th>
                <th style={thRight}>—</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const isEditing = editingId === l.id;
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      {isEditing
                        ? <input style={inlineInput} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        : (l.name || '—')}
                    </td>
                    <td style={tdRight}>
                      {isEditing
                        ? <input style={inlineInputRight} type="number" step="0.01" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
                        : Number(l.quantity).toLocaleString()}
                    </td>
                    <td style={tdRight}>
                      {isEditing
                        ? <input style={inlineInputRight} type="number" step="0.01" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} />
                        : formatINR(Number(l.unit_price) || 0)}
                    </td>
                    <td style={tdRight}><strong>{formatINR(Number(l.line_total) || 0)}</strong></td>
                    <td style={tdRight}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(l.id)} disabled={busyId === l.id} style={smallBtnPrimary}>Save</button>{' '}
                          <button onClick={() => setEditingId(null)} disabled={busyId === l.id} style={smallBtnGhost}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(l)} disabled={busyId === l.id} style={smallBtnGhost}>Edit</button>{' '}
                          <button onClick={() => remove(l.id)} disabled={busyId === l.id} style={smallBtnDanger}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                <td style={td}>Total</td>
                <td style={tdRight}>—</td>
                <td style={tdRight}>—</td>
                <td style={tdRight}>{formatINR(total)}</td>
                <td style={tdRight}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Inline "add a line item" row, always visible at the bottom. */}
      <div style={{ marginTop: 12, padding: 10, background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 10, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
        <input style={inlineInput} placeholder="Item / product name" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
        <input style={inlineInputRight} type="number" step="0.01" placeholder="Qty" value={newRow.quantity} onChange={(e) => setNewRow({ ...newRow, quantity: e.target.value })} />
        <input style={inlineInputRight} type="number" step="0.01" placeholder="Unit price" value={newRow.unit_price} onChange={(e) => setNewRow({ ...newRow, unit_price: e.target.value })} />
        <button onClick={addRow} disabled={adding} style={smallBtnPrimary}>{adding ? 'Adding…' : '+ Add'}</button>
      </div>
    </Card>
  );
}

// Render the multi-product breakdown stamped onto a deal at conversion
// time. The convert service writes each row as:
//   { product_id, product_name, unit_price, unit_weight_kg, pieces,
//     volume_kg, subtotal }
// into deal.custom_fields.line_items, plus a rolled-up
// custom_fields.volume_kg total. Returns null when neither shape is
// present so deals from clients that don't use the multi-product flow
// (anyone other than Tata Tiscon today) get no empty card on screen.
function DealLineItemsCard({ customFields }: { customFields?: Record<string, unknown> | null }) {
  const cf = customFields || {};
  const rawLines = (cf as { line_items?: unknown }).line_items;
  const totalKg  = Number((cf as { volume_kg?: unknown }).volume_kg ?? 0);

  type Line = {
    product_id?: string;
    product_name?: string | null;
    unit_price?: number;
    unit_weight_kg?: number;
    pieces?: number;
    volume_kg?: number;
    subtotal?: number;
  };
  const lines: Line[] = Array.isArray(rawLines) ? (rawLines as Line[]) : [];

  if (lines.length === 0 && !totalKg) return null;

  const sumKg     = lines.reduce((s, l) => s + (Number(l.volume_kg) || 0), 0);
  const sumAmount = lines.reduce((s, l) => s + (Number(l.subtotal)  || 0), 0);
  const sumPieces = lines.reduce((s, l) => s + (Number(l.pieces)    || 0), 0);

  return (
    <Card title={`Products${lines.length > 0 ? ` (${lines.length})` : ''}`}>
      {lines.length === 0 ? (
        // Legacy single-product convert flow only stamped the rolled-up
        // total_kg. Show it as a single read-only row so reps still see
        // the figure they entered.
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          <strong>Total weight:</strong> {totalKg.toLocaleString()} kg
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={th}>Product</th>
                <th style={thRight}>Unit Price</th>
                <th style={thRight}>Weight / pc</th>
                <th style={thRight}>Pieces</th>
                <th style={thRight}>Volume (kg)</th>
                <th style={thRight}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={`${l.product_id ?? 'line'}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td}>
                    {/* product_name is captured at convert time so the row
                        still reads sensibly even if the product is later
                        renamed or archived. Falls back to the bare id
                        when name wasn't stamped (very early line items). */}
                    {l.product_name || l.product_id || '—'}
                  </td>
                  <td style={tdRight}>{l.unit_price != null ? formatINR(Number(l.unit_price)) : '—'}</td>
                  <td style={tdRight}>{l.unit_weight_kg != null ? `${Number(l.unit_weight_kg).toLocaleString()} kg` : '—'}</td>
                  <td style={tdRight}>{l.pieces != null ? Number(l.pieces).toLocaleString() : '—'}</td>
                  <td style={tdRight}>{l.volume_kg != null ? `${Number(l.volume_kg).toLocaleString()} kg` : '—'}</td>
                  <td style={tdRight}><strong>{l.subtotal != null ? formatINR(Number(l.subtotal)) : '—'}</strong></td>
                </tr>
              ))}
              <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                <td style={td}>Total</td>
                <td style={tdRight}>—</td>
                <td style={tdRight}>—</td>
                <td style={tdRight}>{sumPieces > 0 ? sumPieces.toLocaleString() : '—'}</td>
                <td style={tdRight}>{(totalKg || sumKg).toLocaleString()} kg</td>
                <td style={tdRight}>{formatINR(sumAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const th: React.CSSProperties      = { textAlign: 'left',  padding: '8px 10px', fontWeight: 700 };
const thRight: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontWeight: 700 };
const td: React.CSSProperties      = { textAlign: 'left',  padding: '10px',     verticalAlign: 'top' };
const tdRight: React.CSSProperties = { textAlign: 'right', padding: '10px',     verticalAlign: 'top', whiteSpace: 'nowrap' };
// Used by EditableLineItemsCard — kept inline so the line-items table
// reads like the rest of the deal page's compact-table aesthetic.
const inlineInput: React.CSSProperties      = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' };
const inlineInputRight: React.CSSProperties = { ...inlineInput, textAlign: 'right' };
const smallBtnPrimary: React.CSSProperties  = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' };
const smallBtnGhost: React.CSSProperties    = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const smallBtnDanger: React.CSSProperties   = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, trailing }: { label: string; value?: string | null; trailing?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{value || '—'}</div>
      {trailing}
    </div>
  );
}

const chipLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--primary)',
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block',
};
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
