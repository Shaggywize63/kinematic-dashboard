'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmPipelines, crmDeals } from '../../../../lib/crmApi';
import type { Pipeline, Deal } from '../../../../types/crm';
import PipelineCreateModal from '../../../../components/crm/PipelineCreateModal';
import { formatINR } from '../../../../lib/formatCurrency';
import { getStoredUser, userHasModule } from '../../../../lib/auth';

/**
 * Pipeline section, records-list view.
 *
 * Used to be the kanban; that has moved to the Deals page (toggled
 * alongside the list view). This page is now a directory of pipelines:
 * one row per pipeline showing name, stage count, open-deal count + total
 * value, default flag, and quick actions. Click a row to expand stages
 * with deal counts; "+ New Pipeline" opens a modal that builds the
 * pipeline + stages in one shot.
 */
export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [dealsByPipeline, setDealsByPipeline] = useState<Record<string, Deal[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyDefault, setBusyDefault] = useState<string | null>(null);
  // Only roles entitled to CRM Settings see the deep-links into the stage
  // editor — Consumer Champions etc. should not be routed into a page they
  // can't access (the backend would 403 anyway).
  const canEditStages = userHasModule(getStoredUser(), 'crm_settings');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmPipelines.list();
      const list = r.data || [];
      setPipelines(list);
      // Fetch deals for each pipeline in parallel so the per-row counts
      // appear without an extra click. Capped at "open" status — closed
      // deals are noise in a pipeline summary.
      const pairs = await Promise.allSettled(
        list.map((p) => crmDeals.list({ pipeline_id: p.id, status: 'open', limit: 500 }).then((d) => [p.id, d.data || []] as const))
      );
      const map: Record<string, Deal[]> = {};
      for (const r of pairs) if (r.status === 'fulfilled') map[r.value[0]] = r.value[1];
      setDealsByPipeline(map);
    } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const makeDefault = async (p: Pipeline) => {
    if (p.is_default) return;
    setBusyDefault(p.id);
    try {
      await crmPipelines.update(p.id, { is_default: true } as any);
      toast.success(`"${p.name}" is now the default pipeline`);
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
    finally { setBusyDefault(null); }
  };

  const deletePipeline = async (p: Pipeline) => {
    const openCount = (dealsByPipeline[p.id] || []).length;
    if (openCount > 0) {
      return toast.error(`Cannot delete: ${openCount} open deal${openCount === 1 ? ' is' : 's are'} still in this pipeline. Move them first.`);
    }
    if (!window.confirm(`Delete pipeline "${p.name}"? Its stages will be removed too. This cannot be undone.`)) return;
    try {
      await crmPipelines.remove(p.id);
      toast.success('Pipeline deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Sales pipelines — each is a named, ordered set of stages a deal moves through (e.g. <em>Discovery → Qualification → Proposal → Negotiation → Closed Won</em>). Use multiple pipelines when you sell into clearly different motions (Enterprise vs SMB, India vs Export). The kanban view of any pipeline now lives on the <Link href="/dashboard/crm/deals" style={{ color: 'var(--primary)' }}>Deals</Link> page — toggle <strong style={{ color: 'var(--text)' }}>Kanban</strong> there.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          {pipelines.length} pipeline{pipelines.length === 1 ? '' : 's'}
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ New Pipeline</button>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading pipelines…</div>
      ) : pipelines.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No pipelines yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            A pipeline groups your stages (Discovery, Qualification, Proposal, Negotiation, Closed Won). Once you have one, deals move through its stages and the Deals → Kanban view groups them by column.
          </div>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Create your first pipeline</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/*
           * The list can contain both a shared "Default Sales Pipeline"
           * (client_id IS NULL, set by the platform) AND a tenant-owned
           * default. Only ONE row should highlight — prefer the tenant's
           * own default. Backend deal-lookup follows the same rule
           * (resolveDefaultPipeline in deals.service.ts).
           */}
          {(() => null)()}
          {pipelines.map((p, _idx, all) => {
            const stages = (p.stages || []).slice().sort((a, b) => a.position - b.position);
            const dealsHere = dealsByPipeline[p.id] || [];
            const openValue = dealsHere.reduce((sum, d) => sum + Number((d as any).amount || 0), 0);
            const isOpen = expanded === p.id;
            const effectiveDefaultId =
              all.find((x) => x.is_default && (x as any).client_id)?.id
              ?? all.find((x) => x.is_default)?.id
              ?? null;
            const isEffectiveDefault = p.id === effectiveDefaultId;
            return (
              <div key={p.id} className="pipeline-row" style={{
                // Highlight only the effective default — thicker primary
                // border + a left accent strip. Other is_default rows (e.g.
                // a leftover shared one) render normally.
                background: 'var(--s2)',
                border: `1px solid ${isEffectiveDefault ? 'var(--primary)' : 'var(--border)'}`,
                borderLeft: `4px solid ${isEffectiveDefault ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 12,
                // Subtle outline that picks up the CRM accent colour
                // (blue inside .crm-area; red is reserved for KINI AI).
                boxShadow: isEffectiveDefault ? '0 0 0 2px rgba(0,102,255,0.10)' : 'none',
              }}>
                {/* Row layout: chevron + title block + actions. On mobile
                    (≤640px) the actions wrap below the title via the
                    `pipeline-row-actions` rule in globals.css so 4
                    chips don't squish into 30px each. */}
                <div className="pipeline-row-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => setExpanded(isOpen ? null : p.id)}>
                  <span style={{ fontSize: 16, color: 'var(--text-dim)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, marginTop: 2 }}>▸</span>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {isEffectiveDefault && <span title="Default pipeline" style={{ fontSize: 18, color: '#f5a623', lineHeight: 1 }}>★</span>}
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                      {isEffectiveDefault && <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'var(--primary)', color: '#fff', fontWeight: 800, letterSpacing: 0.4 }}>DEFAULT</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                      {stages.length} stage{stages.length === 1 ? '' : 's'} · {dealsHere.length} open deal{dealsHere.length === 1 ? '' : 's'} · {formatINR(openValue)}
                    </div>
                  </div>
                  <div className="pipeline-row-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <Link href={`/dashboard/crm/deals?pipeline_id=${p.id}&view=kanban`} title="Open Kanban for this pipeline"
                      style={chip('#3E9EFF')}>Kanban →</Link>
                    {!isEffectiveDefault && (
                      <button onClick={() => makeDefault(p)} disabled={busyDefault === p.id} style={chip('var(--text-dim)')}>
                        {busyDefault === p.id ? 'Saving…' : 'Make default'}
                      </button>
                    )}
                    {canEditStages && (
                      <Link href={`/dashboard/crm/settings/stages?pipeline_id=${p.id}`} style={chip('var(--text-dim)')}>Edit stages</Link>
                    )}
                    <button onClick={() => deletePipeline(p)} style={chip('#ef4444')}>Delete</button>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 14, background: 'var(--s1)' }}>
                    {stages.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                        No stages in this pipeline yet.
                        {canEditStages && (
                          <> <Link href={`/dashboard/crm/settings/stages?pipeline_id=${p.id}`} style={{ color: 'var(--primary)' }}>Add stages →</Link></>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                        {stages.map((s) => {
                          const count = dealsHere.filter((d) => (d as any).stage_id === s.id).length;
                          const value = dealsHere.filter((d) => (d as any).stage_id === s.id).reduce((sum, d) => sum + Number((d as any).amount || 0), 0);
                          const typeColor = s.stage_type === 'won' ? '#10b981' : s.stage_type === 'lost' ? '#ef4444' : 'var(--primary)';
                          return (
                            <div key={s.id} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{s.name}</span>
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: `${typeColor}22`, color: typeColor, fontWeight: 800, letterSpacing: 0.4 }}>{s.stage_type.toUpperCase()}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                {count} deal{count === 1 ? '' : 's'} · {formatINR(value)}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                                Default win prob: {Math.round((Number((s as any).probability) || 0) * 100)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PipelineCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); reload(); }}
        isFirstPipeline={pipelines.length === 0}
      />
    </div>
  );
}

const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const chip = (color: string): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${color}`, color, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
});
