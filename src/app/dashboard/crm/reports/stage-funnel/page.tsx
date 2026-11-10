'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmStages } from '../../../../../lib/crmApi';
import type { Deal, Pipeline, Stage } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

// Stage funnel = count of deals per stage in pipeline order, plus the
// conversion ratio from each stage to the next. Strategic report — shows
// where deals die. Drops show on the chart as red gaps so a leaky
// "Proposal → Negotiation" jumps out.
interface StageRow extends Record<string, unknown> {
  stage_id: string;
  stage_name: string;
  stage_type: string;
  position: number;
  count: number;
  value: number;
  pct_of_first: number;
  drop_from_prev_pct: number | null;
  // Additive columns (also exported to CSV)
  share_of_deals_pct: number;
  avg_deal_size: number;
  weighted_value: number;
  avg_age_days: number | null;
}

// Raw underlying value per sortable column (numbers stay numeric).
const stageVal = (r: StageRow, key: string): unknown => {
  switch (key) {
    case 'stage_name': return r.stage_name;
    case 'stage_type': return r.stage_type;
    case 'count': return r.count;
    case 'value': return r.value;
    case 'pct_of_first': return r.pct_of_first;
    case 'drop_from_prev_pct': return r.drop_from_prev_pct;
    case 'share_of_deals_pct': return r.share_of_deals_pct;
    case 'avg_deal_size': return r.avg_deal_size;
    case 'weighted_value': return r.weighted_value;
    case 'avg_age_days': return r.avg_age_days;
    default: return r[key];
  }
};

export default function StageFunnelPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [rows, setRows] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The deals list is fetched 1,000 at a time: say so when the page may be looking at part of the book.
  const [truncated, setTruncated] = useState(false);
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await crmPipelines.list();
        if (cancelled) return;
        const ps = r.data || [];
        setPipelines(ps);
        if (ps.length > 0) {
          const defaultId = ps.find((p) => (p as any).is_default)?.id || ps[0].id;
          setSelectedPipeline(defaultId);
        } else {
          setLoading(false);
        }
      } catch (e: any) {
        toast.error(e.message || 'Failed to load pipelines');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPipeline) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [stagesRes, dealsRes] = await Promise.all([
          crmStages.list({ pipeline_id: selectedPipeline }),
          crmDeals.list({ pipeline_id: selectedPipeline, limit: 1000 }),
        ]);
        if (cancelled) return;
        const stages = (stagesRes.data || []) as Stage[];
        const deals = (dealsRes.data || []) as Deal[];

        setTruncated(deals.length >= 1000);
        const stageProb = new Map<string, number>(stages.map((st) => [(st as any).id, Number((st as any).probability) || 0]));
        const byStageId = new Map<string, { count: number; value: number; weighted: number; ages: number[] }>();
        for (const d of deals) {
          const sid = (d as any).stage_id;
          if (!sid) continue;
          const cur = byStageId.get(sid) || { count: 0, value: 0, weighted: 0, ages: [] };
          const amount = Number((d as any).amount || 0);
          cur.count++;
          cur.value += amount;
          // weighted = amount x probability (the deal's own when set, else its stage's)
          const own = Number((d as any).probability) || 0;
          cur.weighted += (amount * (own > 0 ? own : stageProb.get(sid) ?? 0)) / 100;
          const created = (d as any).created_at;
          if (created) cur.ages.push(Math.max(0, (Date.now() - new Date(created).getTime()) / 86_400_000));
          byStageId.set(sid, cur);
        }
        const totalDeals = deals.filter((d) => (d as any).stage_id).length;

        const sorted = [...stages].sort((a, b) => Number((a as any).position) - Number((b as any).position));
        const first = sorted.length > 0 ? (byStageId.get((sorted[0] as any).id)?.count || 0) : 0;
        const out: StageRow[] = [];
        let prevCount: number | null = null;
        for (const s of sorted) {
          const agg = byStageId.get((s as any).id) || { count: 0, value: 0, weighted: 0, ages: [] as number[] };
          const drop = prevCount !== null && prevCount > 0
            ? ((prevCount - agg.count) / prevCount) * 100
            : null;
          out.push({
            stage_id: (s as any).id,
            stage_name: (s as any).name || '',
            stage_type: (s as any).stage_type || 'open',
            position: Number((s as any).position) || 0,
            count: agg.count,
            value: agg.value,
            pct_of_first: first > 0 ? (agg.count / first) * 100 : 0,
            drop_from_prev_pct: drop,
            share_of_deals_pct: totalDeals > 0 ? (agg.count / totalDeals) * 100 : 0,
            avg_deal_size: agg.count > 0 ? agg.value / agg.count : 0,
            weighted_value: agg.weighted,
            avg_age_days: agg.ages.length ? agg.ages.reduce((a, b) => a + b, 0) / agg.ages.length : null,
          });
          prevCount = agg.count;
        }
        setRows(out);
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedPipeline, cityKey]);

  const maxCount = useMemo(() => rows.reduce((m, r) => Math.max(m, r.count), 0), [rows]);

  // Client-side column sorting for the detail table; the funnel bars above
  // stay in pipeline (position) order. No active column by default.
  const { sorted, sort, toggle } = useTableSort<StageRow>(rows, stageVal);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Stage Funnel</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Deal count per stage and drop-off between stages. Red drops &gt; 50% flag potential leaks.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)} style={sel} disabled={pipelines.length === 0}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{(p as any).name}</option>)}
          </select>
          <button onClick={() => downloadCsv('stage-funnel', rows)} disabled={loading || rows.length === 0} style={csvBtn}>⬇ CSV</button>
        </div>
      </div>

      {truncated && (
        <div role="status" style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          Showing the first 1,000 deals of this pipeline only, so these numbers may be partial.
        </div>
      )}
      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : pipelines.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No pipelines configured. Create one in Settings → Pipelines.</div>
      ) : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No deals in this pipeline yet.</div>
      ) : (
        <>
          {/* Horizontal funnel bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {rows.map((r) => {
              const widthPct = maxCount > 0 ? (r.count / maxCount) * 100 : 0;
              const colors: Record<string, string> = { open: '#6366f1', won: '#10b981', lost: '#ef4444' };
              const c = colors[r.stage_type] || '#6366f1';
              return (
                <div key={r.stage_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 140, fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{r.stage_name}</div>
                  <div style={{ flex: 1, height: 28, background: 'var(--s3)', borderRadius: 6, position: 'relative' }}>
                    <div style={{ width: `${Math.max(widthPct, 2)}%`, height: '100%', background: `${c}66`, borderLeft: `3px solid ${c}`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{r.count}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>· {inr(r.value)}</span>
                    </div>
                  </div>
                  <div style={{ width: 100, textAlign: 'right', fontSize: 11 }}>
                    {r.drop_from_prev_pct !== null ? (
                      <span style={{ color: r.drop_from_prev_pct > 50 ? '#ef4444' : r.drop_from_prev_pct > 25 ? '#f59e0b' : 'var(--text-dim)', fontWeight: 700 }}>
                        ↓ {r.drop_from_prev_pct.toFixed(0)}%
                      </span>
                    ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed table (scrolls inside its own container on a narrow screen) */}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Stage" sortKey="stage_name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Type" sortKey="stage_type" sort={sort} onToggle={toggle} /></th>
                <th style={thNum}><SortLabel label="Deals" sortKey="count" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Total Value" sortKey="value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="% of First Stage" sortKey="pct_of_first" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Drop from Prev" sortKey="drop_from_prev_pct" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Share of Deals" sortKey="share_of_deals_pct" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Avg Deal" sortKey="avg_deal_size" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Weighted Value" sortKey="weighted_value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Avg Age" sortKey="avg_age_days" sort={sort} onToggle={toggle} align="right" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.stage_id}>
                  <td style={td}>{r.stage_name}</td>
                  <td style={td}><span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'var(--s3)' }}>{r.stage_type}</span></td>
                  <td style={tdNum}>{r.count}</td>
                  <td style={tdNum}>{inr(r.value)}</td>
                  <td style={tdNum}>{r.pct_of_first.toFixed(1)}%</td>
                  <td style={{ ...tdNum, color: r.drop_from_prev_pct !== null && r.drop_from_prev_pct > 50 ? '#ef4444' : 'var(--text)' }}>
                    {r.drop_from_prev_pct !== null ? `${r.drop_from_prev_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td style={tdNum}>{r.share_of_deals_pct.toFixed(1)}%</td>
                  <td style={tdNum}>{r.count > 0 ? inr(r.avg_deal_size) : '—'}</td>
                  <td style={tdNum}>{r.stage_type === 'open' ? inr(r.weighted_value) : '—'}</td>
                  <td style={tdNum}>{r.avg_age_days !== null ? `${r.avg_age_days.toFixed(0)}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>
            Counts deals by the stage they are in now. Weighted value (open stages) = amount × probability, the deal&apos;s own probability when set, else its stage&apos;s. Avg age = days since the deals were created. Amounts are INR.
          </div>
        </>
      )}
    </div>
  );
}

function inr(n: number): string {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
const sel: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 };
const csvBtn: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
