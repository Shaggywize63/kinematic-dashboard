'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { crmAnalytics, crmSettings, crmLeads } from '../../../../lib/crmApi';
import { formatINR } from '../../../../lib/formatCurrency';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import StatCard from '../../../../components/crm/shared/StatCard';
import { getStoredUser, canAccess } from '../../../../lib/auth';

// Recharts is heavy (~150 KB gzipped). Lazy-load each chart so the dashboard
// initial bundle stays small and charts only download when their card paints.
const ChartLoading = () => <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>;
const PipelineFunnelChart = dynamic(() => import('../../../../components/crm/charts/PipelineFunnelChart'), { ssr: false, loading: ChartLoading });
const PipelineValueByStageChart = dynamic(() => import('../../../../components/crm/charts/PipelineValueByStageChart'), { ssr: false, loading: ChartLoading });
const WinRateByRepChart = dynamic(() => import('../../../../components/crm/charts/WinRateByRepChart'), { ssr: false, loading: ChartLoading });
const ForecastChart = dynamic(() => import('../../../../components/crm/charts/ForecastChart'), { ssr: false, loading: ChartLoading });
const LeadScoreDistributionChart = dynamic(() => import('../../../../components/crm/charts/LeadScoreDistributionChart'), { ssr: false, loading: ChartLoading });
const RevenueTrendChart = dynamic(() => import('../../../../components/crm/charts/RevenueTrendChart'), { ssr: false, loading: ChartLoading });
const LeadsGeoMap = dynamic(() => import('../../../../components/crm/charts/LeadsGeoMap'), { ssr: false, loading: ChartLoading });
import type {
  AnalyticsSummary,
  FunnelPoint,
  PipelineValuePoint,
  WinRatePoint,
  ForecastPoint,
  ScoreDistributionPoint,
} from '../../../../types/crm';

type WidgetId =
  | 'stat_open_pipeline' | 'stat_won' | 'stat_win_rate' | 'stat_avg_deal'
  | 'stat_sales_cycle' | 'stat_new_leads' | 'stat_activities' | 'stat_conversion'
  | 'chart_funnel' | 'chart_pipeline_value' | 'chart_win_rate'
  | 'chart_forecast' | 'chart_score_dist' | 'chart_revenue' | 'chart_geo_map';

const STAT_WIDGETS: Array<{ id: WidgetId; label: string }> = [
  { id: 'stat_open_pipeline', label: 'Open Pipeline' },
  { id: 'stat_won', label: 'Won (window)' },
  { id: 'stat_win_rate', label: 'Win Rate' },
  { id: 'stat_avg_deal', label: 'Avg Deal Size' },
  { id: 'stat_sales_cycle', label: 'Sales Cycle' },
  { id: 'stat_new_leads', label: 'New Leads' },
  { id: 'stat_activities', label: 'Activities (7d)' },
  { id: 'stat_conversion', label: 'Conversion' },
];

const CHART_WIDGETS: Array<{ id: WidgetId; label: string }> = [
  { id: 'chart_geo_map', label: 'Leads on Map' },
  { id: 'chart_funnel', label: 'Pipeline Funnel' },
  { id: 'chart_pipeline_value', label: 'Pipeline Value by Stage' },
  { id: 'chart_win_rate', label: 'Win Rate by Rep' },
  { id: 'chart_forecast', label: 'Forecast' },
  { id: 'chart_score_dist', label: 'Lead Score Distribution' },
  { id: 'chart_revenue', label: 'Revenue Trend' },
];

const ALL_WIDGETS: WidgetId[] = [...STAT_WIDGETS, ...CHART_WIDGETS].map((w) => w.id);

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function CrmDashboardPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [funnel, setFunnel] = useState<FunnelPoint[]>([]);
  const [pipelineValue, setPipelineValue] = useState<PipelineValuePoint[]>([]);
  const [winRate, setWinRate] = useState<WinRatePoint[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [scoreDist, setScoreDist] = useState<ScoreDistributionPoint[]>([]);
  const [geoLeads, setGeoLeads] = useState<Array<{ id: string; first_name?: string|null; last_name?: string|null; city?: string|null; state?: string|null; status?: string|null }>>([]);
  const [loading, setLoading] = useState(true);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  // Customization state
  const [canCustomize, setCanCustomize] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetId>>(new Set(ALL_WIDGETS));
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [crmConfig, setCrmConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setCanCustomize(true);

    crmSettings.get().then((r) => {
      const cfg = (r.data?.config as Record<string, unknown>) || {};
      setCrmConfig(cfg);
      const layout = cfg.dashboard_layout as { widgets?: WidgetId[] } | undefined;
      if (layout?.widgets && Array.isArray(layout.widgets) && layout.widgets.length > 0) {
        setVisibleWidgets(new Set(layout.widgets));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        // Single round-trip — the backend runs the 6 sub-queries in parallel
        // server-side, so this collapses 6 HTTPS calls into 1.
        const [r, leadsRes] = await Promise.all([
          crmAnalytics.dashboardComplete(range),
          // Slim list for the geo map — only the fields LeadsGeoMap reads.
          crmLeads.list({ limit: 500 }),
        ]);
        if (cancel) return;
        const d = r.data;
        setSummary(d.summary);
        setFunnel(d.funnel);
        setPipelineValue(d.pipelineValue);
        setWinRate(d.winRate);
        setForecast(d.forecast);
        setScoreDist(d.leadScoreDistribution);
        setGeoLeads(((leadsRes as any)?.data ?? []).map((l: any) => ({
          id: l.id, first_name: l.first_name, last_name: l.last_name,
          city: l.city, state: l.state, status: l.status,
        })));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load CRM analytics');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [range.from, range.to]);

  const fmtPct = (n?: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;
  const revenueTrend = forecast.map((f) => ({ period: f.period, revenue: f.closed }));

  const isVisible = (id: WidgetId) => visibleWidgets.has(id);

  const toggleWidget = (id: WidgetId) => {
    const next = new Set(visibleWidgets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisibleWidgets(next);
  };

  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      const widgets = Array.from(visibleWidgets);
      await crmSettings.update({ config: { ...crmConfig, dashboard_layout: { widgets } } });
      setCrmConfig({ ...crmConfig, dashboard_layout: { widgets } });
      toast.success('Dashboard layout saved');
      setShowCustomizer(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save layout');
    } finally {
      setSavingLayout(false);
    }
  };

  const visibleStatCount = STAT_WIDGETS.filter((w) => isVisible(w.id)).length;
  const visibleChartCount = CHART_WIDGETS.filter((w) => isVisible(w.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {canCustomize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowCustomizer(true)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            ⚙ Customize Dashboard
          </button>
        </div>
      )}

      {visibleStatCount > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {isVisible('stat_open_pipeline') && <StatCard label="Open Pipeline" value={formatINR(summary?.open_deal_value)} hint={`${summary?.open_deals || 0} deals`} loading={loading} />}
          {isVisible('stat_won') && <StatCard label="Won (window)" value={formatINR(summary?.won_revenue_30d)} hint={`${summary?.won_deals_30d || 0} deals`} deltaTone="up" loading={loading} />}
          {isVisible('stat_win_rate') && <StatCard label="Win Rate" value={fmtPct(summary?.win_rate_30d)} loading={loading} />}
          {isVisible('stat_avg_deal') && <StatCard label="Avg Deal Size" value={formatINR(summary?.avg_deal_size)} loading={loading} />}
          {isVisible('stat_sales_cycle') && <StatCard label="Sales Cycle" value={`${Math.round(summary?.avg_sales_cycle_days || 0)}d`} loading={loading} />}
          {isVisible('stat_new_leads') && <StatCard label="New Leads" value={summary?.new_leads_30d || 0} hint={`${summary?.total_leads || 0} total`} loading={loading} />}
          {isVisible('stat_activities') && <StatCard label="Activities (7d)" value={summary?.activities_7d || 0} loading={loading} />}
          {isVisible('stat_conversion') && <StatCard label="Conversion" value={fmtPct(summary?.conversion_rate)} loading={loading} />}
        </div>
      )}

      {/* Map gets full width so the bubbles + legend + side panel fit cleanly. */}
      {isVisible('chart_geo_map') && (
        <div style={{ display: 'block' }}>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Leads on Map</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Hover or click a city to drill in</div>
            </div>
            {geoLeads.length === 0 ? <Empty /> : <LeadsGeoMap leads={geoLeads} />}
          </div>
        </div>
      )}

      {visibleChartCount > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
          {isVisible('chart_funnel') && (
            <Card title="Pipeline Funnel">
              {funnel.length ? <PipelineFunnelChart data={funnel} /> : <Empty />}
            </Card>
          )}
          {isVisible('chart_pipeline_value') && (
            <Card title="Pipeline Value by Stage">
              {pipelineValue.length ? <PipelineValueByStageChart data={pipelineValue} /> : <Empty />}
            </Card>
          )}
          {isVisible('chart_win_rate') && (
            <Card title="Win Rate by Rep">
              {winRate.length ? <WinRateByRepChart data={winRate} /> : <Empty />}
            </Card>
          )}
          {isVisible('chart_forecast') && (
            <Card title="Forecast">
              {forecast.length ? <ForecastChart data={forecast} /> : <Empty />}
            </Card>
          )}
          {isVisible('chart_score_dist') && (
            <Card title="Lead Score Distribution">
              {scoreDist.length ? <LeadScoreDistributionChart data={scoreDist} /> : <Empty />}
            </Card>
          )}
          {isVisible('chart_revenue') && (
            <Card title="Revenue Trend">
              {revenueTrend.length ? <RevenueTrendChart data={revenueTrend} /> : <Empty />}
            </Card>
          )}
        </div>
      )}

      {visibleStatCount === 0 && visibleChartCount === 0 && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Empty dashboard</div>
          <div style={{ fontSize: 12 }}>All widgets are hidden. Click <strong>Customize Dashboard</strong> to enable some.</div>
        </div>
      )}

      {showCustomizer && (
        <div onClick={() => !savingLayout && setShowCustomizer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Customize Dashboard</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Pick widgets to show</div>
              </div>
              <button onClick={() => !savingLayout && setShowCustomizer(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              Layout is saved per organisation and applies to all CRM users. Hidden widgets won't appear or load data.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Stat Cards</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setVisibleWidgets(new Set([...Array.from(visibleWidgets), ...STAT_WIDGETS.map((w) => w.id)]))} style={btnTiny}>All</button>
                  <button onClick={() => { const next = new Set(visibleWidgets); STAT_WIDGETS.forEach((w) => next.delete(w.id)); setVisibleWidgets(next); }} style={btnTiny}>None</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {STAT_WIDGETS.map((w) => (
                  <label key={w.id} style={pillStyle(isVisible(w.id))}>
                    <input type="checkbox" checked={isVisible(w.id)} onChange={() => toggleWidget(w.id)} />
                    {w.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Charts</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setVisibleWidgets(new Set([...Array.from(visibleWidgets), ...CHART_WIDGETS.map((w) => w.id)]))} style={btnTiny}>All</button>
                  <button onClick={() => { const next = new Set(visibleWidgets); CHART_WIDGETS.forEach((w) => next.delete(w.id)); setVisibleWidgets(next); }} style={btnTiny}>None</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                {CHART_WIDGETS.map((w) => (
                  <label key={w.id} style={pillStyle(isVisible(w.id))}>
                    <input type="checkbox" checked={isVisible(w.id)} onChange={() => toggleWidget(w.id)} />
                    {w.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button onClick={() => setVisibleWidgets(new Set(ALL_WIDGETS))} style={btnTiny}>Reset to all</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowCustomizer(false)} disabled={savingLayout} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={saveLayout} disabled={savingLayout} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {savingLayout ? 'Saving…' : 'Save Layout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    background: active ? 'var(--primary)' : 'var(--s3)',
    color: active ? '#fff' : 'var(--text)',
    borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  };
}

const btnTiny: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 };

function Empty() {
  return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      No data yet. Once you log activity, this chart will populate.
    </div>
  );
}
