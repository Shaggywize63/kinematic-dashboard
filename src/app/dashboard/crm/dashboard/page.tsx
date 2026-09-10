'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { LayoutGrid, X } from 'lucide-react';
import { crmAnalytics, crmSettings, crmLeads } from '../../../../lib/crmApi';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../../lib/formatCurrency';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { useCityScope } from '../../../../context/CityScopeContext';
import { useClient } from '../../../../context/ClientContext';
import PinnedOverviewSection from '../../../../components/crm/analytics/PinnedOverviewSection';
import { getStoredUser, canAccess } from '../../../../lib/auth';
import { ChartCard, ChartEmpty } from '../../../../lib/chartTheme';
import { Button, Card, EmptyState, Eyebrow, IconButton, PageHeader, Segmented, T, useIsCompact } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

// Weight/INR toggle is bespoke for Tata Tiscon — they bill in metric
// tonnes of TMT bar so the dashboard re-aggregates monetary numbers as
// weight. No other client sells by mass, so the toggle is hidden for
// everyone else and the unit is force-pinned to INR.
const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';
// Parent Kinematic tenant — doesn't use the geo leads-on-map surface.
const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';

// Recharts is heavy (~150 KB gzipped). Lazy-load each chart so the dashboard
// initial bundle stays small and charts only download when their card paints.
const ChartLoading = () => <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 13 }}>Loading…</div>;
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

/**
 * Dashboard KPI tile — Card + mono eyebrow + Manrope value + dim hint.
 * The value uses clamp() so a long Indian-grouped amount still fits the
 * tile on narrow viewports instead of overflowing.
 */
function StatTile({ label, value, hint, valueTitle, loading, tone }: {
  label: string; value: string | number; hint?: string; valueTitle?: string; loading?: boolean; tone?: 'ok' | 'warn' | 'red' | 'info';
}) {
  const toneColor = tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : tone === 'red' ? T.red : tone === 'info' ? T.info : T.text;
  return (
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <Eyebrow style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Eyebrow>
      <div title={valueTitle} style={{
        fontFamily: T.heading, fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1,
        color: loading ? T.mute : toneColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {loading ? '—' : value}
      </div>
      {hint && <div style={{ fontSize: 12.5, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>}
    </Card>
  );
}

export default function CrmDashboardPage() {
  usePageTitle('Dashboard');
  const narrow = useIsCompact(900);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [funnel, setFunnel] = useState<FunnelPoint[]>([]);
  const [pipelineValue, setPipelineValue] = useState<PipelineValuePoint[]>([]);
  const [winRate, setWinRate] = useState<WinRatePoint[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [scoreDist, setScoreDist] = useState<ScoreDistributionPoint[]>([]);
  const [geoLeads, setGeoLeads] = useState<Array<{ id: string; first_name?: string|null; last_name?: string|null; city?: string|null; state?: string|null; status?: string|null; latitude?: number|null; longitude?: number|null; score?: number|null; score_grade?: 'A'|'B'|'C'|'D'|null; score_breakdown?: Record<string, unknown>|null }>>([]);
  const [loading, setLoading] = useState(true);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  const { selectedCity } = useCityScope();

  // Customization state
  const [canCustomize, setCanCustomize] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetId>>(new Set(ALL_WIDGETS));
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [crmConfig, setCrmConfig] = useState<Record<string, unknown>>({});
  const [unit, setUnit] = useState<DashboardUnit>('inr');

  // Weight toggle gate: visible iff the active scope is Tata Tiscon.
  //   * Client-level users (their JWT is pinned to one client) — check the
  //     user's client_id on the stored profile.
  //   * Platform admins — check the global client picker selection. Hops
  //     between clients in the same browser session, so we re-evaluate on
  //     selection change.
  const { selectedClientId } = useClient();
  const userClientId = useMemo<string | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.client_id ?? null) : null;
    } catch { return null; }
  }, []);
  const allowWeightToggle =
    userClientId === TATA_TISCON_CLIENT_ID ||
    selectedClientId === TATA_TISCON_CLIENT_ID;
  // Kinematic tenant hides the "Leads on Map" geo surface entirely.
  const kinematicActive =
    userClientId === KINEMATIC_CLIENT_ID ||
    selectedClientId === KINEMATIC_CLIENT_ID;

  useEffect(() => {
    if (!allowWeightToggle) return; // Non-Tata clients never resurrect 'weight'.
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem('crm_dashboard_unit') === 'weight') {
        setUnit('weight');
      }
    } catch { /* ignore */ }
  }, [allowWeightToggle]);

  // When the gate flips off (e.g. platform admin switches off Tata Tiscon
  // via the global picker), force back to INR so the page doesn't keep
  // rendering kilograms with no way to toggle out.
  useEffect(() => {
    if (!allowWeightToggle && unit !== 'inr') {
      setUnit('inr');
      try { window.localStorage.removeItem('crm_dashboard_unit'); } catch { /* ignore */ }
    }
  }, [allowWeightToggle, unit]);

  const setUnitPersisted = (next: DashboardUnit) => {
    if (next === 'weight' && !allowWeightToggle) return; // defensive — toggle isn't rendered
    setUnit(next);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('crm_dashboard_unit', next);
    } catch { /* ignore */ }
  };

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
        const [r, leadsRes] = await Promise.all([
          crmAnalytics.dashboardComplete(range, unit),
          crmLeads.geo(),
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
          latitude: l.latitude, longitude: l.longitude,
          score: l.score, score_grade: l.score_grade, score_breakdown: (l as any).score_breakdown ?? null,
        })));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load CRM analytics');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [range.from, range.to, unit, selectedCity]);

  const fmtPct = (n?: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;
  // KPI cards render the compact form (₹2.4L / ₹2.4Cr) so big numbers
  // never overflow the box, with the full Indian-grouped form on the
  // hover tooltip.
  const fmtMoney = (n?: number) => fmtValueCompact(n ?? 0, unit);
  const fmtMoneyFull = (n?: number) => fmtValue(n ?? 0, unit);
  // Deal volume (kg) → readable string. Tonnes once it's big enough.
  const fmtVol = (kg?: number) => {
    const v = kg ?? 0;
    if (v <= 0) return '';
    return v >= 1000
      ? `${(v / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MT`
      : `${Math.round(v).toLocaleString('en-IN')} kg`;
  };
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

  const emptyChart = <ChartEmpty message="No data yet. Once you log activity, this chart will populate." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Dashboard"
        description="Pipeline, revenue and lead health for the selected window."
        compact={narrow}
        actions={
          <>
            {allowWeightToggle && (
              <div role="tablist" aria-label="Display unit">
                <Segmented
                  value={unit}
                  onChange={(v) => setUnitPersisted(v)}
                  options={[
                    { value: 'inr', label: <span title="Show monetary values in rupees">₹ Cost</span> },
                    { value: 'weight', label: <span title="Show metrics as weight (kg / tonnes), aggregated from deal line items">Weight</span> },
                  ]}
                />
              </div>
            )}
            {canCustomize && (
              <Button onClick={() => setShowCustomizer(true)} icon={<LayoutGrid size={16} strokeWidth={1.6} />}>Customize</Button>
            )}
          </>
        }
      />

      {visibleStatCount > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {isVisible('stat_open_pipeline') && (
            // In weight mode the pipeline aggregates kg from deal line items.
            // When the open deals carry no weighted products the total is a
            // legitimate 0 — surface a hint so it doesn't read as a broken
            // metric, and point the user at the fix (add products to deals).
            unit === 'weight' && !(summary?.open_deal_value)
              ? <StatTile label="Open Pipeline" value="—" hint={`No weight on ${summary?.open_deals || 0} open deals — add products`} loading={loading} />
              : <StatTile
                  label="Open Pipeline"
                  value={fmtMoney(summary?.open_deal_value)}
                  valueTitle={fmtMoneyFull(summary?.open_deal_value)}
                  // Show the total deal volume alongside value (the two are
                  // the same number in weight mode, so only append in INR mode).
                  hint={`${summary?.open_deals || 0} deals${unit === 'inr' && fmtVol(summary?.open_deal_volume) ? ` · ${fmtVol(summary?.open_deal_volume)}` : ''}`}
                  loading={loading}
                />
          )}
          {isVisible('stat_won') && <StatTile label="Won (window)" value={fmtMoney(summary?.won_revenue_30d)} valueTitle={fmtMoneyFull(summary?.won_revenue_30d)} hint={`${summary?.won_deals_30d || 0} deals`} tone="ok" loading={loading} />}
          {isVisible('stat_win_rate') && <StatTile label="Win Rate" value={fmtPct(summary?.win_rate_30d)} loading={loading} />}
          {isVisible('stat_avg_deal') && <StatTile label="Avg Deal Size" value={fmtMoney(summary?.avg_deal_size)} valueTitle={fmtMoneyFull(summary?.avg_deal_size)} loading={loading} />}
          {isVisible('stat_sales_cycle') && <StatTile label="Sales Cycle" value={`${Math.round(summary?.avg_sales_cycle_days || 0)}d`} loading={loading} />}
          {isVisible('stat_new_leads') && <StatTile label="New Leads" value={summary?.new_leads_30d || 0} hint={`${summary?.total_leads || 0} total`} loading={loading} />}
          {isVisible('stat_activities') && <StatTile label="Activities (7d)" value={summary?.activities_7d || 0} loading={loading} />}
          {isVisible('stat_conversion') && <StatTile label="Conversion" value={fmtPct(summary?.conversion_rate)} loading={loading} />}
        </div>
      )}

      {/* Map gets full width so the bubbles + legend + side panel fit cleanly. */}
      {!kinematicActive && isVisible('chart_geo_map') && (
        <ChartCard title="Leads on Map" subtitle="Hover or click a city to drill in">
          {geoLeads.length === 0 ? emptyChart : <LeadsGeoMap leads={geoLeads} />}
        </ChartCard>
      )}

      {/* Pinned analytics widgets sit just below the map: KPIs the rep
          picked from Lead Analytics live here, between the broad geo view
          and the per-chart deep-dive grid. Renders nothing when no widgets
          are pinned, so the layout collapses cleanly. */}
      <PinnedOverviewSection />

      {visibleChartCount > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 12 }}>
          {isVisible('chart_funnel') && (
            <ChartCard title="Pipeline Funnel">
              {funnel.length ? <PipelineFunnelChart data={funnel} /> : emptyChart}
            </ChartCard>
          )}
          {isVisible('chart_pipeline_value') && (
            <ChartCard title={unit === 'weight' ? 'Pipeline Volume by Stage' : 'Pipeline Value by Stage'}>
              {pipelineValue.length ? <PipelineValueByStageChart data={pipelineValue} unit={unit} /> : emptyChart}
            </ChartCard>
          )}
          {isVisible('chart_win_rate') && (
            <ChartCard title="Win Rate by Rep">
              {winRate.length ? <WinRateByRepChart data={winRate} /> : emptyChart}
            </ChartCard>
          )}
          {isVisible('chart_forecast') && (
            <ChartCard title="Forecast">
              {forecast.length ? <ForecastChart data={forecast} unit={unit} /> : emptyChart}
            </ChartCard>
          )}
          {isVisible('chart_score_dist') && (
            <ChartCard title="Lead Score Distribution">
              {scoreDist.length ? <LeadScoreDistributionChart data={scoreDist} /> : emptyChart}
            </ChartCard>
          )}
          {isVisible('chart_revenue') && (
            <ChartCard title={unit === 'weight' ? 'Volume Trend' : 'Revenue Trend'}>
              {revenueTrend.length ? <RevenueTrendChart data={revenueTrend} unit={unit} /> : emptyChart}
            </ChartCard>
          )}
        </div>
      )}

      {visibleStatCount === 0 && visibleChartCount === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={<LayoutGrid size={20} strokeWidth={1.6} />}
            title="Empty dashboard"
            description="All widgets are hidden. Use Customize to enable some."
            action={canCustomize ? <Button size="sm" onClick={() => setShowCustomizer(true)}>Customize dashboard</Button> : undefined}
          />
        </Card>
      )}

      {showCustomizer && (
        <div onClick={() => !savingLayout && setShowCustomizer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'var(--shadow-pop)', maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Customize dashboard</Eyebrow>
                <div style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>Pick widgets to show</div>
                <div style={{ fontSize: 12.5, color: T.dim }}>Layout is saved per organisation and applies to all CRM users. Hidden widgets won’t appear or load data.</div>
              </div>
              <IconButton label="Close" onClick={() => !savingLayout && setShowCustomizer(false)}><X size={16} strokeWidth={1.6} /></IconButton>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <WidgetGroup
                label="Stat tiles"
                widgets={STAT_WIDGETS}
                isVisible={isVisible}
                onToggle={toggleWidget}
                onAll={() => setVisibleWidgets(new Set([...Array.from(visibleWidgets), ...STAT_WIDGETS.map((w) => w.id)]))}
                onNone={() => { const next = new Set(visibleWidgets); STAT_WIDGETS.forEach((w) => next.delete(w.id)); setVisibleWidgets(next); }}
              />
              <WidgetGroup
                label="Charts"
                widgets={CHART_WIDGETS}
                isVisible={isVisible}
                onToggle={toggleWidget}
                onAll={() => setVisibleWidgets(new Set([...Array.from(visibleWidgets), ...CHART_WIDGETS.map((w) => w.id)]))}
                onNone={() => { const next = new Set(visibleWidgets); CHART_WIDGETS.forEach((w) => next.delete(w.id)); setVisibleWidgets(next); }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '14px 20px', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
              <Button size="sm" variant="ghost" onClick={() => setVisibleWidgets(new Set(ALL_WIDGETS))}>Reset to all</Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setShowCustomizer(false)} disabled={savingLayout}>Cancel</Button>
                <Button variant="primary" onClick={saveLayout} disabled={savingLayout}>{savingLayout ? 'Saving…' : 'Save layout'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetGroup({ label, widgets, isVisible, onToggle, onAll, onNone }: {
  label: string; widgets: Array<{ id: WidgetId; label: string }>; isVisible: (id: WidgetId) => boolean;
  onToggle: (id: WidgetId) => void; onAll: () => void; onNone: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Eyebrow>{label}</Eyebrow>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" variant="ghost" onClick={onAll}>All</Button>
          <Button size="sm" variant="ghost" onClick={onNone}>None</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
        {widgets.map((w) => {
          const on = isVisible(w.id);
          return (
            <label key={w.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: on ? T.redWash : 'var(--s3)', border: `1px solid ${on ? T.red : T.border}`, color: T.text, fontSize: 13,
            }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(w.id)} style={{ width: 14, height: 14, accentColor: 'var(--red)' }} />
              {w.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
