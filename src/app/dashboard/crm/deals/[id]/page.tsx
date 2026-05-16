'use client';
import { useEffect, useState } from 'react';
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
import DealCloseModal, { type DealCloseOutcome } from '../../../../../components/crm/DealCloseModal';
import { formatINR } from '../../../../../lib/formatCurrency';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [history, setHistory] = useState<DealHistoryEntry[]>([]);
  const [contacts, setContacts] = useState<DealContact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [winProb, setWinProb] = useState<WinProbability | null>(null);
  const [loading, setLoading] = useState(true);
  const [nbaBusy, setNbaBusy] = useState(false);
  const [winBusy, setWinBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<DealCloseOutcome>('won');
  const [reopening, setReopening] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h, c, a] = await Promise.allSettled([
        crmDeals.get(id),
        crmDeals.history(id),
        crmDeals.contacts(id),
        crmDeals.activities(id),
      ]);
      if (d.status === 'fulfilled') {
        setDeal(d.value.data);
        try { const p = await crmPipelines.get(d.value.data.pipeline_id); setPipeline(p.data); } catch {}
      }
      if (h.status === 'fulfilled') setHistory(h.value.data || []);
      if (c.status === 'fulfilled') setContacts(c.value.data || []);
      if (a.status === 'fulfilled') setActivities(a.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const moveStage = async (stageId: string) => {
    if (!deal) return;
    try { await crmDeals.moveStage(deal.id, { stage_id: stageId }); toast.success('Stage updated'); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
  };
  const openCloseModal = (outcome: DealCloseOutcome) => {
    setCloseOutcome(outcome);
    setCloseOpen(true);
  };
  const reopenDeal = async () => {
    if (!deal) return;
    if (!window.confirm('Re-open this deal? It will return to open status.')) return;
    setReopening(true);
    try {
      await crmDeals.update(deal.id, { status: 'open' } as any);
      toast.success('Deal re-opened');
      reload();
    } catch (e: any) { toast.error(e.message || 'Re-open failed'); }
    finally { setReopening(false); }
  };
  const loadNba = async () => {
    if (!deal) return;
    setNbaBusy(true);
    try { const r = await crmAi.nextBestAction(deal.id); setNba(r.data); }
    catch (e: any) { toast.error(e.message || 'NBA failed'); } finally { setNbaBusy(false); }
  };
  const loadWinProb = async () => {
    if (!deal) return;
    setWinBusy(true);
    try { const r = await crmAi.winProbability(deal.id); setWinProb(r.data); }
    catch (e: any) { toast.error(e.message || 'Forecast failed'); } finally { setWinBusy(false); }
  };
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
      toast.error(e.message || 'Delete failed');
      setDeleting(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!deal) return <div style={{ color: 'var(--text-dim)' }}>Deal not found.</div>;
  const stages = pipeline?.stages || [];
  const primary = contacts.find((c) => c.is_primary) || contacts[0];

  // The backend persists lost_reason / win_reason / closed_at on the deal
  // row (see commit 982ee3fc notes) but our shared `Deal` type predates
  // those fields. Read them defensively so the banner can surface them
  // without forcing a schema-wide type update.
  const dealExtra = deal as Deal & {
    lost_reason?: string | null;
    win_reason?: string | null;
    closed_at?: string | null;
  };
  const closedAtLabel = dealExtra.closed_at
    ? new Date(dealExtra.closed_at).toLocaleDateString()
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{deal.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {deal.account_id ? (
                  <Link href={`/dashboard/crm/accounts/${deal.account_id}`} style={{ color: 'var(--primary)' }}>
                    {deal.account_name || 'View account'}
                  </Link>
                ) : 'No account'}
                {deal.lead_id && (<><span> · </span><Link href={`/dashboard/crm/leads/${deal.lead_id}`} style={{ color: 'var(--primary)' }}>From lead</Link></>)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
              {deal.status !== 'open' && (
                <button onClick={reopenDeal} disabled={reopening} style={{ background: 'var(--s3)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.6 : 1 }}>{reopening ? 'Re-opening...' : 'Re-open Deal'}</button>
              )}
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>

          {/* Open: prominent Won/Lost actions, matching iOS DealDetailView
              (982ee3fc) so a rep doesn't need to bounce to the kanban to
              close a deal. Wider buttons so they're hard to miss. */}
          {deal.status === 'open' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <button
                onClick={() => openCloseModal('won')}
                style={{
                  background: '#10b981', border: 'none', color: '#fff',
                  padding: '14px', borderRadius: 10, fontWeight: 800, fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.04) inset',
                }}
              >
                ✓ Mark Won
              </button>
              <button
                onClick={() => openCloseModal('lost')}
                style={{
                  background: '#ef4444', border: 'none', color: '#fff',
                  padding: '14px', borderRadius: 10, fontWeight: 800, fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.04) inset',
                }}
              >
                ✗ Mark Lost
              </button>
            </div>
          )}

          {/* Closed: full-width status banner. Surfaces win/lost reason if
              the backend payload includes it; falls back gracefully when
              fields are absent on older records. */}
          {deal.status === 'won' && (
            <div
              style={{
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.4)',
                color: '#10b981',
                borderRadius: 10, padding: 14, marginBottom: 14,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                ✓ This deal is closed as WON{closedAtLabel ? ` · ${closedAtLabel}` : ''}
              </div>
              {dealExtra.win_reason && (
                <div style={{ fontSize: 12, color: 'var(--text)', opacity: 0.85 }}>
                  Reason: {dealExtra.win_reason}
                </div>
              )}
            </div>
          )}
          {deal.status === 'lost' && (
            <div
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
                borderRadius: 10, padding: 14, marginBottom: 14,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                ✗ This deal is closed as LOST{closedAtLabel ? ` · ${closedAtLabel}` : ''}
              </div>
              {dealExtra.lost_reason && (
                <div style={{ fontSize: 12, color: 'var(--text)', opacity: 0.85 }}>
                  Reason: {dealExtra.lost_reason}
                </div>
              )}
            </div>
          )}

          {stages.length > 0 && deal.status === 'open' && (
            <div style={{ marginBottom: 14 }}>
              <DealStageProgress stages={stages} currentStageId={deal.stage_id} onMove={moveStage} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Amount" value={formatINR(deal.amount || 0)} />
            <Field label="Stage" value={deal.stage_name} />
            <Field label="Status" value={deal.status} />
            <Field label="Probability" value={`${Math.round((deal.probability || 0) * 100)}%`} />
            <Field label="Close Date" value={deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : null} />
            <Field label="Owner" value={deal.owner_name} />
          </div>
        </div>

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
                const c = dc.contact;
                const name = c?.full_name || `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || c?.email || '—';
                // Two side-by-side controls: the name (Link to contact) and
                // an inline phone + Call button. Keeping the Call button as
                // a *sibling* of the Link instead of a child avoids invalid
                // nested-<a> HTML — tel: would render an <a> inside the
                // contact-link <a> otherwise.
                return (
                  <div key={dc.contact_id} style={{ ...rowLink, padding: 0, background: 'transparent', border: 'none' }}>
                    <Link href={`/dashboard/crm/contacts/${dc.contact_id}`} style={{ ...rowLink, flex: 1, marginRight: 0 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {name}
                          {dc.is_primary && <span style={{ marginLeft: 8, fontSize: 9, background: 'var(--primary)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>PRIMARY</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{dc.role || c?.title || c?.email || '—'}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c?.phone || ''}</div>
                    </Link>
                    <CallButton
                      phone={c?.phone}
                      prefillSubject={`Call about ${deal.name}`}
                      dealId={deal.id}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={`Activities (${activities.length})`}><ActivityTimeline activities={activities} /></Card>

        <Card title="History">
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No events yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h) => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: 'var(--s3)', borderRadius: 8, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text)' }}>{h.event_type}</span>{h.from_stage && h.to_stage && <span style={{ color: 'var(--text-dim)' }}> · {h.from_stage} → {h.to_stage}</span>}</div>
                  <div style={{ color: 'var(--text-dim)' }}>{new Date(h.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <AiDraftReplyPanel dealId={id} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {primary && (
          <Card title="Primary Contact">
            <Link href={`/dashboard/crm/contacts/${primary.contact_id}`} style={chipLink}>
              → {primary.contact?.full_name || `${primary.contact?.first_name || ''} ${primary.contact?.last_name || ''}`.trim() || 'View contact'}
            </Link>
          </Card>
        )}

        <WinProbabilityGauge
          probability={winProb?.probability ?? deal.ai_win_probability ?? deal.probability ?? 0}
          confidence={winProb?.confidence ?? deal.ai_win_confidence ?? undefined}
          drivers={winProb?.drivers}
          ai
        />
        <button onClick={loadWinProb} disabled={winBusy} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
          {winBusy ? 'Predicting...' : 'Re-forecast Win Probability'}
        </button>
        <NextBestActionCard action={nba} onLoad={loadNba} loading={nbaBusy} />
      </div>

      <DealEditModal
        deal={deal}
        stages={stages}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setDeal(updated); reload(); }}
      />

      <DealCloseModal
        dealId={deal.id}
        open={closeOpen}
        initialOutcome={closeOutcome}
        onClose={() => setCloseOpen(false)}
        onClosed={reload}
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

const chipLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--primary)',
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block',
};
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
