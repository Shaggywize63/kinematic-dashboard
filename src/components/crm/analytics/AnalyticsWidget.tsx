'use client';
/**
 * Polymorphic renderer for every Lead Analytics widget. One component
 * handles all 15 widget types — switches on `widget.widget_type` to
 * pick the right fetcher, then on `widget.chart_type` to pick the
 * Recharts visual.
 */
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { X, Pin, MoreVertical, AlertTriangle } from 'lucide-react';
import { crmAnalyticsExt, type WidgetInstance } from '../../../lib/crmAnalyticsExtApi';
import { widgetByType, type ChartType } from '../../../lib/crm/widgetCatalog';

const COLORS = ['#E0282C', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4'];

interface Props {
  widget: WidgetInstance;
  onRemove?: (id: string) => void;
  onPinToOverview?: (w: WidgetInstance) => void;
  onChangeChartType?: (id: string, chartType: ChartType) => void;
  isEditing?: boolean;
  pinned?: boolean;
}

export default function AnalyticsWidget({ widget, onRemove, onPinToOverview, onChangeChartType, pinned = false }: Props) {
  const meta = widgetByType(widget.widget_type);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!meta) { setError('Unknown widget'); setLoading(false); return; }
    setLoading(true);
    fetchWidgetData(widget.widget_type)
      .then(d => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message || 'Load failed'))
      .finally(() => setLoading(false));
  }, [widget.widget_type, meta]);

  if (!meta) {
    return <div style={card}><div style={header}><div style={title}>Unknown widget</div></div><div style={body}><div style={empty}>Widget type not recognised</div></div></div>;
  }

  return (
    <div style={card}>
      <div style={header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={title}>{meta.title}</div>
          <div style={subtitle}>{meta.category}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={iconBtn} aria-label="Widget options">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div style={menu} onMouseLeave={() => setMenuOpen(false)}>
              {meta.supportedCharts.length > 1 && (
                <>
                  <div style={menuLabel}>Chart type</div>
                  {meta.supportedCharts.map(c => (
                    <button key={c} onClick={() => { onChangeChartType?.(widget.id, c); setMenuOpen(false); }}
                      style={{ ...menuItem, background: widget.chart_type === c ? 'var(--primary)' : 'transparent', color: widget.chart_type === c ? '#fff' : 'var(--text)' }}>
                      {chartLabel(c)}
                    </button>
                  ))}
                  <div style={menuDivider} />
                </>
              )}
              {!pinned && onPinToOverview && (
                <button onClick={() => { onPinToOverview(widget); setMenuOpen(false); }} style={menuItem}>
                  <Pin size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Pin to CRM Overview
                </button>
              )}
              {onRemove && (
                <button onClick={() => { onRemove(widget.id); setMenuOpen(false); }} style={{ ...menuItem, color: '#ef4444' }}>
                  <X size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Remove widget
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={body}>
        {loading && <div style={empty}>Loading…</div>}
        {!loading && error && <div style={{ ...empty, color: '#ef4444' }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {error}
        </div>}
        {!loading && !error && <WidgetBody widget={widget} data={data} />}
      </div>
    </div>
  );
}

async function fetchWidgetData(widgetType: string): Promise<unknown> {
  switch (widgetType) {
    case 'lead_velocity':            return (await crmAnalyticsExt.leadVelocity()).data;
    case 'time_to_first_touch':      return (await crmAnalyticsExt.timeToFirstTouch()).data;
    case 'stuck_leads':              return (await crmAnalyticsExt.stuckLeads()).data;
    case 'lost_reasons':             return (await crmAnalyticsExt.lostReasons()).data;
    case 'won_reasons':              return (await crmAnalyticsExt.wonReasons()).data;
    case 'disqualification_reasons': return (await crmAnalyticsExt.disqualificationReasons()).data;
    case 'stage_conversion':         return (await crmAnalyticsExt.stageConversion()).data;
    case 'lead_aging':               return (await crmAnalyticsExt.leadAging()).data;
    case 'cohort_conversion':        return (await crmAnalyticsExt.cohortConversion()).data;
    case 'engagement_comparison':    return (await crmAnalyticsExt.engagementComparison()).data;
    case 'days_since_touch':         return (await crmAnalyticsExt.daysSinceTouch()).data;
    case 'score_band_conversion':    return (await crmAnalyticsExt.scoreBandConversion()).data;
    case 'territory_conversion':     return (await crmAnalyticsExt.territoryConversion()).data;
    case 'touchpoints_to_response':  return (await crmAnalyticsExt.touchpointsToResponse()).data;
    case 'leads_at_risk':            return (await crmAnalyticsExt.leadsAtRisk()).data;
    default: throw new Error(`Unknown widget: ${widgetType}`);
  }
}

function WidgetBody({ widget, data }: { widget: WidgetInstance; data: unknown }) {
  const chart = widget.chart_type as ChartType;

  switch (widget.widget_type) {
    case 'lead_velocity': {
      const rows = (data as any[]) ?? [];
      if (!rows.length) return <div style={empty}>No leads in window</div>;
      const series = rows.map(r => ({ name: r.month, qualified: r.qualified, growth: r.mom_growth_pct ?? 0 }));
      return chart === 'bar' ? <BarSeries data={series} keys={['qualified']} />
        : chart === 'area' ? <AreaSeries data={series} keys={['qualified']} />
        : <LineSeries data={series} keys={['qualified', 'growth']} />;
    }
    case 'time_to_first_touch': {
      const d = data as { avg_minutes: number; sla_breach_pct: number; total: number; distribution: Array<{ bucket: string; count: number }> };
      if (chart === 'number') return <NumberTile main={`${d.avg_minutes}m`} sub={`SLA breach ${d.sla_breach_pct}% (${d.total} leads)`}/>;
      return chart === 'horizontal-bar'
        ? <HBarSeries data={d.distribution.map(b => ({ name: b.bucket, value: b.count }))} />
        : <BarSeries data={d.distribution.map(b => ({ name: b.bucket, count: b.count }))} keys={['count']} />;
    }
    case 'stuck_leads': {
      const d = data as { count_7d: number; count_14d: number; count_30d: number };
      if (chart === 'bar') return <BarSeries data={[{ name: '7d', count: d.count_7d }, { name: '14d', count: d.count_14d }, { name: '30d', count: d.count_30d }]} keys={['count']} />;
      return <NumberTile main={String(d.count_14d)} sub={`stuck 14d+ (${d.count_30d} stuck 30d+)`} />;
    }
    case 'lost_reasons':
    case 'won_reasons':
    case 'disqualification_reasons': {
      const rows = (data as Array<{ reason: string; count: number }>) ?? [];
      if (!rows.length) return <div style={empty}>No data yet</div>;
      if (chart === 'pie' || chart === 'donut') return <PieSeries data={rows.map(r => ({ name: r.reason, value: r.count }))} donut={chart === 'donut'} />;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.reason, value: r.count }))} />;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ Reason: r.reason, Count: r.count }))} />;
      return <BarSeries data={rows.map(r => ({ name: r.reason, count: r.count }))} keys={['count']} />;
    }
    case 'stage_conversion': {
      const rows = (data as Array<{ from_stage: string; to_stage: string; entered: number; advanced: number; rate: number }>) ?? [];
      if (!rows.length) return <div style={empty}>No deals in scope</div>;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ From: r.from_stage, To: r.to_stage, Entered: r.entered, Advanced: r.advanced, 'Rate %': r.rate }))} />;
      const series = rows.map(r => ({ name: `${r.from_stage} → ${r.to_stage}`, rate: r.rate }));
      return chart === 'horizontal-bar' ? <HBarSeries data={series.map(s => ({ name: s.name, value: s.rate }))} valueLabel="%" /> : <BarSeries data={series} keys={['rate']} suffix="%" />;
    }
    case 'lead_aging':
    case 'days_since_touch':
    case 'touchpoints_to_response': {
      const rows = (data as Array<{ bucket: string; count: number }>) ?? [];
      if (!rows.length) return <div style={empty}>No data</div>;
      if (chart === 'pie' || chart === 'donut') return <PieSeries data={rows.map(r => ({ name: r.bucket, value: r.count }))} donut={chart === 'donut'} />;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.bucket, value: r.count }))} />;
      return <BarSeries data={rows.map(r => ({ name: r.bucket, count: r.count }))} keys={['count']} />;
    }
    case 'cohort_conversion': {
      const rows = (data as Array<{ cohort_month: string; total: number; cells: Array<{ age_months: number; rate: number }> }>) ?? [];
      if (!rows.length) return <div style={empty}>No cohort data</div>;
      const maxAge = Math.max(...rows.map(r => r.cells.length));
      return (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thStyle}>Size</th>
                {Array.from({ length: maxAge }).map((_, i) => <th key={i} style={thStyle}>M+{i}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.cohort_month}>
                  <td style={tdStyle}>{r.cohort_month}</td>
                  <td style={tdStyle}>{r.total}</td>
                  {r.cells.map(c => (
                    <td key={c.age_months} style={{ ...tdStyle, background: heatColor(c.rate), color: c.rate > 30 ? '#fff' : 'var(--text)', textAlign: 'center' }}>{c.rate}%</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'engagement_comparison': {
      const d = data as { won: { avg: number; count: number }; lost: { avg: number; count: number } };
      if (chart === 'number') return <NumberTile main={`${d.won.avg} vs ${d.lost.avg}`} sub={`Avg touches: won vs lost (${d.won.count} won, ${d.lost.count} lost)`} />;
      return <BarSeries data={[{ name: 'Won', avg_touches: d.won.avg }, { name: 'Lost', avg_touches: d.lost.avg }]} keys={['avg_touches']} />;
    }
    case 'score_band_conversion': {
      const rows = (data as Array<{ band: string; total: number; converted: number; rate: number }>) ?? [];
      if (!rows.length) return <div style={empty}>No scored leads</div>;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ Band: r.band, Total: r.total, Converted: r.converted, 'Rate %': r.rate }))} />;
      return chart === 'line' ? <LineSeries data={rows.map(r => ({ name: r.band, rate: r.rate }))} keys={['rate']} /> : <BarSeries data={rows.map(r => ({ name: r.band, rate: r.rate }))} keys={['rate']} suffix="%" />;
    }
    case 'territory_conversion': {
      const rows = (data as Array<{ territory: string; total: number; converted: number; rate: number }>) ?? [];
      if (!rows.length) return <div style={empty}>No territory data</div>;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.territory, value: r.rate }))} valueLabel="%" />;
      return <TableView rows={rows.map(r => ({ Territory: r.territory, Total: r.total, Converted: r.converted, 'Rate %': r.rate }))} />;
    }
    case 'leads_at_risk': {
      const rows = (data as Array<{ name: string; score: number; days_idle: number }>) ?? [];
      if (!rows.length) return <div style={{ ...empty, color: '#10B981' }}>No leads at risk 🎉</div>;
      return <TableView rows={rows.map(r => ({ Name: r.name, Score: r.score, 'Days idle': r.days_idle }))} />;
    }
  }
  return <div style={empty}>Unsupported chart type</div>;
}

function BarSeries({ data, keys, suffix }: { data: any[]; keys: string[]; suffix?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
        <YAxis tick={{ fontSize: 10 }} stroke="var(--text-dim)" tickFormatter={v => `${v}${suffix ?? ''}`} />
        <Tooltip formatter={(v: any) => `${v}${suffix ?? ''}`} contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)' }} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
function HBarSeries({ data, valueLabel }: { data: Array<{ name: string; value: number }>; valueLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 50, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-dim)" tickFormatter={v => `${v}${valueLabel ?? ''}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="var(--text-dim)" width={110} />
        <Tooltip formatter={(v: any) => `${v}${valueLabel ?? ''}`} contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)' }} />
        <Bar dataKey="value" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
function LineSeries({ data, keys }: { data: any[]; keys: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
        <YAxis tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
function AreaSeries({ data, keys }: { data: any[]; keys: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
        <YAxis tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)' }} />
        {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length] + '33'} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
function PieSeries({ data, donut }: { data: Array<{ name: string; value: number }>; donut: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={donut ? '55%' : 0} outerRadius="85%" paddingAngle={2}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
function NumberTile({ main, sub }: { main: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{main}</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>{sub}</div>
    </div>
  );
}
function TableView({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return <div style={empty}>No rows</div>;
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={tableStyle}>
        <thead><tr>{cols.map(c => <th key={c} style={thStyle}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c} style={tdStyle}>{r[c]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function chartLabel(c: ChartType): string {
  return ({ number: 'Number', bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', 'horizontal-bar': 'H-Bar', table: 'Table', heatmap: 'Heatmap' } as Record<ChartType, string>)[c];
}
function heatColor(rate: number): string {
  if (rate >= 50) return 'rgba(16,185,129,0.8)';
  if (rate >= 30) return 'rgba(16,185,129,0.5)';
  if (rate >= 15) return 'rgba(245,158,11,0.5)';
  if (rate >  0) return 'rgba(245,158,11,0.25)';
  return 'transparent';
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', padding: '12px 14px', gap: 8, borderBottom: '1px solid var(--border)' };
const title: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text)' };
const subtitle: React.CSSProperties = { fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 };
const body: React.CSSProperties = { flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 };
const empty: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 24 };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' };
const menu: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, minWidth: 160, zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' };
const menuLabel: React.CSSProperties = { fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, padding: '6px 8px' };
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', padding: '7px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer' };
const menuDivider: React.CSSProperties = { height: 1, background: 'var(--border)', margin: '4px 0' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border-l)', color: 'var(--text)' };
