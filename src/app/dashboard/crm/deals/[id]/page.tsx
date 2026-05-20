'use client';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmAi } from '../../../../../lib/crmApi';
import type { Deal, Pipeline, DealHistoryEntry, DealContact, Activity, NextBestAction, WinProbability } from '../../../../../types/crm';
import DealStageProgress from '../../../../../components/crm/DealStageProgress';
import WinProbabilityGauge from '../../../../../components/crm/WinProbabilityGauge';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import AiDraftReplyPanel from '../../../../../components/crm/AiDraftReplyPanel';
import CallButton from '../../../../../components/crm/shared/CallButton';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import DealEditModal from '../../../../../components/crm/DealEditModal';
import AddToPipelineModal from '../../../../../components/crm/AddToPipelineModal';
import LogoSpinner from '../../../../../components/shared/LogoSpinner';
import { formatINR } from '../../../../../lib/formatCurrency';

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

function normaliseEvent(h: any): { id?: string; eventType: string; createdAt: string; fromStage?: string; toStage?: string } | null {
  if (!h || typeof h !== 'object') return null;
  const eventType = h.event_type || h.eventType || h.type || h.event || '';
  const createdAt = h.created_at || h.createdAt || h.timestamp || h.at || '';
  const fromStage = h.from_stage || h.fromStage || h.previous_stage || '';
  const toStage   = h.to_stage   || h.toStage   || h.next_stage     || '';
  if (!eventType && !createdAt && !fromStage && !toStage) return null;
  return { id: h.id, eventType, createdAt, fromStage: fromStage || undefined, toStage: toStage || undefined };
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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
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
    setClosing(true);
    try {
      if (closeOutcome === 'won') {
        await crmDeals.win(deal.id, { reason: closeReason || undefined });
        toast.success('Deal closed as Won 🎉');
      } else {
        const lostReason = closeReason === 'Other' ? (closeLostOther || 'Other') : closeReason;
        await crmDeals.lose(deal.id, { reason: lostReason || undefined });
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
      // eslint-disable-next-line no-console
      console.error('[deal-detail] NBA failed', e);
      toast.error(e?.message || 'NBA failed');
    } finally { setNbaBusy(false); }
  };
  const loadWinProb = async () => {
    if (!deal) return;
    setWinBusy(true);
    try { const r = await crmAi.winProbability(deal.id); setWinProb(r?.data || null); }
    catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[deal-detail] winProb failed', e);
      toast.error(e?.message || 'Forecast failed');
    } finally { setWinBusy(false); }
  };

  // Auto-load AI Win Probability + Next Best Action the first time a
  // deal loads. Reps were missing these because the previous build
  // required clicking the button to fetch. Now both populate quietly on
  // page open; the buttons still let users refresh.
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
                  {deal.lead_id && (<><span> · </span><Link href={`/dashboard/crm/leads/${deal.lead_id}`} style={{ color: 'var(--primary)' }}>From lead</Link></>)}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, fontSize: 13 }}>
              <Field label="Amount" value={formatINR(Number(deal.amount) || 0)} />
              <Field label="Stage" value={deal.stage_name} />
              <Field label="Status" value={deal.status} />
              <Field label="Probability" value={`${Math.round((Number(deal.probability) || 0) * 100)}%`} />
              <Field label="Close Date" value={fmtIst(deal.expected_close_date).date} />
              <Field label="Owner" value={deal.owner_name} />
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

          <SafeRender label="AI draft reply">
            <AiDraftReplyPanel dealId={id} />
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

          <SafeRender label="win probability">
            <div style={{ position: 'relative' }}>
              <WinProbabilityGauge
                probability={winProb?.probability ?? (deal as any).ai_win_probability ?? deal.probability ?? 0}
                confidence={winProb?.confidence ?? (deal as any).ai_win_confidence ?? undefined}
                drivers={winProb?.drivers}
                ai
              />
              {winBusy && !winProb && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogoSpinner size={40} label="Forecasting…" />
                </div>
              )}
            </div>
          </SafeRender>
          <button onClick={loadWinProb} disabled={winBusy} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
            {winBusy ? 'Predicting…' : 'Re-forecast Win Probability'}
          </button>
          <SafeRender label="next best action">
            <div style={{ position: 'relative' }}>
              <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaBusy} />
              {nbaBusy && !nba && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogoSpinner size={40} label="Computing…" />
                </div>
              )}
            </div>
          </SafeRender>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Win Reason (optional)</span>
                <input value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="e.g. Competitive pricing, great demo, referral…" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
              </label>
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
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{value || '—'}</div>
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
