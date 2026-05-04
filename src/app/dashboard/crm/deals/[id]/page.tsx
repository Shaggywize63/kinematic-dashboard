'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmAi } from '../../../../../lib/crmApi';
import { formatINR } from '../../../../../lib/formatCurrency';
import type { Deal, Pipeline, DealHistoryEntry, NextBestAction, WinProbability } from '../../../../../types/crm';
import DealStageProgress from '../../../../../components/crm/DealStageProgress';
import WinProbabilityGauge from '../../../../../components/crm/WinProbabilityGauge';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import AiDraftReplyPanel from '../../../../../components/crm/AiDraftReplyPanel';
import DealLineItemsPanel from '../../../../../components/crm/DealLineItemsPanel';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [history, setHistory] = useState<DealHistoryEntry[]>([]);
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [winProb, setWinProb] = useState<WinProbability | null>(null);
  const [loading, setLoading] = useState(true);
  const [nbaBusy, setNbaBusy] = useState(false);
  const [winBusy, setWinBusy] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h] = await Promise.allSettled([crmDeals.get(id), crmDeals.history(id)]);
      if (d.status === 'fulfilled') {
        setDeal(d.value.data);
        try { const p = await crmPipelines.get(d.value.data.pipeline_id); setPipeline(p.data); } catch {}
      }
      if (h.status === 'fulfilled') setHistory(h.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const moveStage = async (stageId: string) => {
    if (!deal) return;
    try { await crmDeals.moveStage(deal.id, { stage_id: stageId }); toast.success('Stage updated'); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const win = async () => {
    if (!deal) return;
    try { await crmDeals.win(deal.id); toast.success('Deal marked won 🎉'); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
  };
  const lose = async () => {
    if (!deal) return;
    const reason = prompt('Reason for losing this deal?') || undefined;
    try { await crmDeals.lose(deal.id, { reason }); toast.success('Deal marked lost'); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
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

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!deal) return <div style={{ color: 'var(--text-dim)' }}>Deal not found.</div>;
  const stages = pipeline?.stages || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{deal.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{deal.account_name || 'No account'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {deal.status === 'open' && (
                <>
                  <button onClick={win} style={{ background: 'var(--green)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Mark Won</button>
                  <button onClick={lose} style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Mark Lost</button>
                </>
              )}
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          {stages.length > 0 && deal.status === 'open' && (
            <div style={{ marginBottom: 14 }}>
              <DealStageProgress stages={stages} currentStageId={deal.stage_id} onMove={moveStage} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Amount" value={formatINR(deal.amount)} />
            <Field label="Stage" value={deal.stage_name} />
            <Field label="Status" value={deal.status} />
            <Field label="Probability" value={`${Math.round((deal.probability || 0) * 100)}%`} />
            <Field label="Close Date" value={deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : null} />
            <Field label="Owner" value={deal.owner_name} />
          </div>
        </div>

        <DealLineItemsPanel dealId={deal.id} onChange={reload} />

        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>History</div>
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
        </div>

        <AiDraftReplyPanel dealId={id} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
