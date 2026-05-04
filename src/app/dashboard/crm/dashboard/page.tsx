'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../lib/crmApi';
import { formatINR } from '../../../../lib/formatCurrency';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import StatCard from '../../../../components/crm/shared/StatCard';
import PipelineFunnelChart from '../../../../components/crm/charts/PipelineFunnelChart';
import PipelineValueByStageChart from '../../../../components/crm/charts/PipelineValueByStageChart';
import WinRateByRepChart from '../../../../components/crm/charts/WinRateByRepChart';
import ForecastChart from '../../../../components/crm/charts/ForecastChart';
import LeadScoreDistributionChart from '../../../../components/crm/charts/LeadScoreDistributionChart';
import RevenueTrendChart from '../../../../components/crm/charts/RevenueTrendChart';
import type {
  AnalyticsSummary,
  FunnelPoint,
  PipelineValuePoint,
  WinRatePoint,
  ForecastPoint,
  ScoreDistributionPoint,
} from '../../../../types/crm';

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
  const [loading, setLoading] = useState(true);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const [s, f, pv, wr, fc, sd] = await Promise.allSettled([
          crmAnalytics.dashboardSummary(range),
          crmAnalytics.funnel(range),
          crmAnalytics.pipelineValue(range),
          crmAnalytics.winRate('rep', range),
          crmAnalytics.forecast('quarter', range),
          crmAnalytics.leadScoreDistribution(range),
        ]);
        if (cancel) return;
        if (s.status === 'fulfilled') setSummary(s.value.data);
        if (f.status === 'fulfilled') setFunnel(f.value.data);
        if (pv.status === 'fulfilled') setPipelineValue(pv.value.data);
        if (wr.status === 'fulfilled') setWinRate(wr.value.data);
        if (fc.status === 'fulfilled') setForecast(fc.value.data);
        if (sd.status === 'fulfilled') setScoreDist(sd.value.data);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="Open Pipeline" value={formatINR(summary?.open_deal_value)} hint={`${summary?.open_deals || 0} deals`} loading={loading} />
        <StatCard label="Won (window)" value={formatINR(summary?.won_revenue_30d)} hint={`${summary?.won_deals_30d || 0} deals`} deltaTone="up" loading={loading} />
        <StatCard label="Win Rate" value={fmtPct(summary?.win_rate_30d)} loading={loading} />
        <StatCard label="Avg Deal Size" value={formatINR(summary?.avg_deal_size)} loading={loading} />
        <StatCard label="Sales Cycle" value={`${Math.round(summary?.avg_sales_cycle_days || 0)}d`} loading={loading} />
        <StatCard label="New Leads" value={summary?.new_leads_30d || 0} hint={`${summary?.total_leads || 0} total`} loading={loading} />
        <StatCard label="Activities (7d)" value={summary?.activities_7d || 0} loading={loading} />
        <StatCard label="Conversion" value={fmtPct(summary?.conversion_rate)} loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
        <Card title="Pipeline Funnel">
          {funnel.length ? <PipelineFunnelChart data={funnel} /> : <Empty />}
        </Card>
        <Card title="Pipeline Value by Stage">
          {pipelineValue.length ? <PipelineValueByStageChart data={pipelineValue} /> : <Empty />}
        </Card>
        <Card title="Win Rate by Rep">
          {winRate.length ? <WinRateByRepChart data={winRate} /> : <Empty />}
        </Card>
        <Card title="Forecast">
          {forecast.length ? <ForecastChart data={forecast} /> : <Empty />}
        </Card>
        <Card title="Lead Score Distribution">
          {scoreDist.length ? <LeadScoreDistributionChart data={scoreDist} /> : <Empty />}
        </Card>
        <Card title="Revenue Trend">
          {revenueTrend.length ? <RevenueTrendChart data={revenueTrend} /> : <Empty />}
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      No data yet. Once you log activity, this chart will populate.
    </div>
  );
}
