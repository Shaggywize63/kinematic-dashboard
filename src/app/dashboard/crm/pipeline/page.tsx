'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronRight, KanbanSquare, Plus, SlidersHorizontal, Star, Trash2 } from 'lucide-react';
import { crmPipelines, crmDeals } from '../../../../lib/crmApi';
import type { Pipeline, Deal } from '../../../../types/crm';
import PipelineCreateModal from '../../../../components/crm/PipelineCreateModal';
import { formatINR } from '../../../../lib/formatCurrency';
import { getStoredUser, userHasModule } from '../../../../lib/auth';
import { Badge, Button, Card, EmptyState, Eyebrow, PageHeader, T, useIsCompact, type Tone } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

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
  usePageTitle('Pipelines');
  const narrow = useIsCompact(900);
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

  const STAGE_TONE: Record<string, Tone> = { open: 'info', won: 'ok', lost: 'red' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Pipelines"
        description={<>An ordered set of stages a deal moves through. Use several for clearly different motions; the board view lives on <Link href="/dashboard/crm/deals?view=kanban" style={{ color: T.info }}>Deals → Kanban</Link>.</>}
        compact={narrow}
        actions={<Button variant="primary" onClick={() => setShowCreate(true)} icon={<Plus size={16} strokeWidth={2} />}>New pipeline</Button>}
      />

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: T.dim, fontSize: 13.5 }}>Loading pipelines…</div>
      ) : pipelines.length === 0 ? (
        <Card padding={0}>
          <EmptyState
            icon={<KanbanSquare size={20} strokeWidth={1.6} />}
            title="No pipelines yet"
            description="A pipeline groups your stages (Discovery, Qualification, Proposal, Negotiation, Closed Won). Once you have one, deals move through its stages and the Deals → Kanban view groups them by column."
            action={<Button variant="primary" onClick={() => setShowCreate(true)} icon={<Plus size={16} strokeWidth={2} />}>Create your first pipeline</Button>}
          />
        </Card>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>All pipelines</div>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{pipelines.length}</span>
          </div>
          {/*
           * The list can contain both a shared "Default Sales Pipeline"
           * (client_id IS NULL, set by the platform) AND a tenant-owned
           * default. Only ONE row should highlight — prefer the tenant's
           * own default. Backend deal-lookup follows the same rule
           * (resolveDefaultPipeline in deals.service.ts).
           */}
          {pipelines.map((p, idx, all) => {
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
              <div key={p.id} className="pipeline-row" style={{ borderBottom: idx < all.length - 1 ? `1px solid ${T.border}` : 0 }}>
                {/* Row layout: chevron + title block + actions. On mobile
                    (≤640px) the actions wrap below the title via the
                    `pipeline-row-actions` rule in globals.css so 4
                    chips don't squish into 30px each. */}
                <div
                  className="pipeline-row-head"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : p.id); } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap', background: isOpen ? T.raised : 'transparent', transition: 'background .12s ease' }}
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                >
                  <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name}</span>
                      {isEffectiveDefault && <Badge tone="red"><Star size={11} strokeWidth={2} /> Default</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 12.5, color: T.dim, flexWrap: 'wrap' }}>
                      <span><span style={{ fontFamily: T.mono, color: T.text }}>{stages.length}</span> stage{stages.length === 1 ? '' : 's'}</span>
                      <span><span style={{ fontFamily: T.mono, color: T.text }}>{dealsHere.length}</span> open deal{dealsHere.length === 1 ? '' : 's'}</span>
                      <span style={{ fontFamily: T.mono, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{formatINR(openValue)}</span>
                    </div>
                  </div>
                  <div className="pipeline-row-actions" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" href={`/dashboard/crm/deals?pipeline_id=${p.id}&view=kanban`} title="Open Kanban for this pipeline" icon={<KanbanSquare size={14} strokeWidth={1.6} />}>Kanban</Button>
                    {!isEffectiveDefault && (
                      <Button size="sm" variant="ghost" onClick={() => makeDefault(p)} disabled={busyDefault === p.id} icon={<Star size={14} strokeWidth={1.6} />}>
                        {busyDefault === p.id ? 'Saving…' : 'Make default'}
                      </Button>
                    )}
                    {canEditStages && (
                      <Button size="sm" variant="ghost" href={`/dashboard/crm/settings/stages?pipeline_id=${p.id}`} icon={<SlidersHorizontal size={14} strokeWidth={1.6} />}>Edit stages</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deletePipeline(p)} icon={<Trash2 size={14} strokeWidth={1.6} />} style={{ color: T.red }}>Delete</Button>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: 16 }}>
                    {stages.length === 0 ? (
                      <div style={{ fontSize: 13, color: T.dim }}>
                        No stages in this pipeline yet.
                        {canEditStages && (
                          <> <Link href={`/dashboard/crm/settings/stages?pipeline_id=${p.id}`} style={{ color: T.info }}>Add stages →</Link></>
                        )}
                      </div>
                    ) : (
                      <>
                        <Eyebrow style={{ marginBottom: 10 }}>Stages</Eyebrow>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                          {stages.map((s, si) => {
                            const count = dealsHere.filter((d) => (d as any).stage_id === s.id).length;
                            const value = dealsHere.filter((d) => (d as any).stage_id === s.id).reduce((sum, d) => sum + Number((d as any).amount || 0), 0);
                            return (
                              <div key={s.id} style={{ background: T.raised, borderRadius: T.radius.md, padding: '10px 12px', minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, marginRight: 6 }}>{String(si + 1).padStart(2, '0')}</span>{s.name}
                                  </span>
                                  <Badge tone={STAGE_TONE[s.stage_type] ?? 'neutral'} style={{ textTransform: 'capitalize', height: 20, fontSize: 11 }}>{s.stage_type}</Badge>
                                </div>
                                <div style={{ fontSize: 12.5, color: T.dim }}>
                                  <span style={{ fontFamily: T.mono, color: T.text }}>{count}</span> deal{count === 1 ? '' : 's'} · <span style={{ fontFamily: T.mono, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{formatINR(value)}</span>
                                </div>
                                <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                                  Win probability <span style={{ fontFamily: T.mono }}>{Math.round((Number((s as any).probability) || 0) * 100)}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
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
