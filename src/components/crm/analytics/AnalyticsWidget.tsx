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
import { X, Pin, MoreVertical, AlertTriangle, Inbox } from 'lucide-react';
import { crmAnalyticsExt, type WidgetInstance } from '../../../lib/crmAnalyticsExtApi';
import { widgetByType, type ChartType } from '../../../lib/crm/widgetCatalog';

// Curated palette — cooler tones first, accent reds later. Reads better in
// donuts / pies where adjacent colours need contrast.
const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4', '#E0282C'];

// Category gets a 3px top stripe on the card so the eye can group at a
// glance — Velocity vs Risk vs Quality etc.
const ACCENT_BY_CATEGORY: Record<string, string> = {
  Velocity:   '#3B82F6',
  Quality:    '#8B5CF6',
  Pipeline:   '#F59E0B',
  Engagement: '#14B8A6',
  Risk:       '#E0282C',
};

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
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!meta) { setError('Unknown widget'); setLoading(false); return; }
    setLoading(true);
    fetchWidgetData(widget.widget_type)
      .then(d => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message || 'Load failed'))
      .finally(() => setLoading(false));
  }, [widget.widget_type, meta]);

  if (!meta) {
    return <div style={cardStyle(false)}><div style={header}><div style={title}>Unknown widget</div></div><div style={body}><div style={empty}>Widget type not recognised</div></div></div>;
  }

  const accent = ACCENT_BY_CATEGORY[meta.category] ?? 'var(--primary)';

  return (
    <div
      style={cardStyle(hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={title}>{meta.title}</div>
          <div style={{ ...subtitle, color: accent }}>{meta.category}</div>
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
                  {pinned ? 'Unpin from Overview' : 'Remove widget'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={body}>
        {loading && <div style={empty}>
          <div style={skeleton} />
        </div>}
        {!loading && error && <div style={{ ...empty, color: '#ef4444' }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {error}
        </div>}
        {!loading && !error && <WidgetBody widget={widget} data={data} accent={accent} />}
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

function WidgetBody({ widget, data, accent }: { widget: WidgetInstance; data: unknown; accent: string }) {
  const chart = widget.chart_type as ChartType;

  switch (widget.widget_type) {
    case 'lead_velocity': {
      const rows = (data as any[]) ?? [];
      if (!rows.length) return <EmptyState label="No leads in window" />;
      const series = rows.map(r => ({ name: r.month, qualified: r.qualified, growth: r.mom_growth_pct ?? 0 }));
      return chart === 'bar' ? <BarSeries data={series} keys={['qualified']} accent={accent} />
        : chart === 'area' ? <AreaSeries data={series} keys={['qualified']} accent={accent} />
        : <LineSeries data={series} keys={['qualified', 'growth']} accent={accent} />;
    }
    case 'time_to_first_touch': {
      const d = data as { avg_minutes: number; sla_breach_pct: number; total: number; distribution: Array<{ bucket: string; count: number }> };
      if (chart === 'number') return <NumberTile main={`${d.avg_minutes}m`} sub={`SLA breach ${d.sla_breach_pct}% (${d.total} leads)`} accent={accent} />;
      return chart === 'horizontal-bar'
        ? <HBarSeries data={d.distribution.map(b => ({ name: b.bucket, value: b.count }))} accent={accent} />
        : <BarSeries data={d.distribution.map(b => ({ name: b.bucket, count: b.count }))} keys={['count']} accent={accent} />;
    }
    case 'stuck_leads': {
      const d = data as { count_7d: number; count_14d: number; count_30d: number };
      if (chart === 'bar') return <BarSeries data={[{ name: '7d', count: d.count_7d }, { name: '14d', count: d.count_14d }, { name: '30d', count: d.count_30d }]} keys={['count']} accent={accent} />;
      return <NumberTile main={String(d.count_14d)} sub={`stuck 14d+ (${d.count_30d} stuck 30d+)`} accent={accent} />;
    }
    case 'lost_reasons':
    case 'won_reasons':
    case 'disqualification_reasons': {
      const rows = (data as Array<{ reason: string; count: number }>) ?? [];
      if (!rows.length) return <EmptyState label="No data yet" />;
      if (chart === 'pie' || chart === 'donut') return <PieSeries data={rows.map(r => ({ name: r.reason, value: r.count }))} donut={chart === 'donut'} />;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.reason, value: r.count }))} accent={accent} />;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ Reason: r.reason, Count: r.count }))} />;
      return <BarSeries data={rows.map(r => ({ name: r.reason, count: r.count }))} keys={['count']} accent={accent} />;
    }
    case 'stage_conversion': {
      const rows = (data as Array<{ from_stage: string; to_stage: string; entered: number; advanced: number; rate: number }>) ?? [];
      if (!rows.length) return <EmptyState label="No deals in scope" />;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ From: r.from_stage, To: r.to_stage, Entered: r.entered, Advanced: r.advanced, 'Rate %': r.rate }))} />;
      const series = rows.map(r => ({ name: `${r.from_stage} → ${r.to_stage}`, rate: r.rate }));
      return chart === 'horizontal-bar' ? <HBarSeries data={series.map(s => ({ name: s.name, value: s.rate }))} valueLabel="%" accent={accent} /> : <BarSeries data={series} keys={['rate']} suffix="%" accent={accent} />;
    }
    case 'lead_aging':
    case 'days_since_touch':
    case 'touchpoints_to_response': {
      const rows = (data as Array<{ bucket: string; count: number }>) ?? [];
      if (!rows.length) return <EmptyState label="No data" />;
      if (chart === 'pie' || chart === 'donut') return <PieSeries data={rows.map(r => ({ name: r.bucket, value: r.count }))} donut={chart === 'donut'} />;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.bucket, value: r.count }))} accent={accent} />;
      return <BarSeries data={rows.map(r => ({ name: r.bucket, count: r.count }))} keys={['count']} accent={accent} />;
    }
    case 'cohort_conversion': {
      const rows = (data as Array<{ cohort_month: string; total: number; cells: Array<{ age_months: number; rate: number }> }>) ?? [];
      if (!rows.length) return <EmptyState label="No cohort data" />;
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
                    <td key={c.age_months} style={{ ...tdStyle, background: heatColor(c.rate), color: c.rate > 30 ? '#fff' : 'var(--text)', textAlign: 'center', fontWeight: c.rate > 0 ? 600 : 400 }}>{c.rate}%</td>
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
      if (chart === 'number') return <NumberTile main={`${d.won.avg} vs ${d.lost.avg}`} sub={`Avg touches: won vs lost (${d.won.count} won, ${d.lost.count} lost)`} accent={accent} />;
      return <BarSeries data={[{ name: 'Won', avg_touches: d.won.avg }, { name: 'Lost', avg_touches: d.lost.avg }]} keys={['avg_touches']} accent={accent} />;
    }
    case 'score_band_conversion': {
      const rows = (data as Array<{ band: string; total: number; converted: number; rate: number }>) ?? [];
      if (!rows.length) return <EmptyState label="No scored leads" />;
      if (chart === 'table') return <TableView rows={rows.map(r => ({ Band: r.band, Total: r.total, Converted: r.converted, 'Rate %': r.rate }))} />;
      return chart === 'line' ? <LineSeries data={rows.map(r => ({ name: r.band, rate: r.rate }))} keys={['rate']} accent={accent} /> : <BarSeries data={rows.map(r => ({ name: r.band, rate: r.rate }))} keys={['rate']} suffix="%" accent={accent} />;
    }
    case 'territory_conversion': {
      const rows = (data as Array<{ territory: string; total: number; converted: number; rate: number }>) ?? [];
      if (!rows.length) return <EmptyState label="No territory data" />;
      if (chart === 'horizontal-bar') return <HBarSeries data={rows.map(r => ({ name: r.territory, value: r.rate }))} valueLabel="%" accent={accent} />;
      return <TableView rows={rows.map(r => ({ Territory: r.territory, Total: r.total, Converted: r.converted, 'Rate %': r.rate }))} />;
    }
    case 'leads_at_risk': {
      const rows = (data as Array<{ name: string; score: number; days_idle: number }>) ?? [];
      if (!rows.length) return <div style={{ ...empty, color: '#10B981' }}>✅ No leads at risk</div>;
      return <TableView rows={rows.map(r => ({ Name: r.name, Score: r.score, 'Days idle': r.days_idle }))} />;
    }
  }
  return <div style={empty}>Unsupported chart type</div>;
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--s2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
};

function BarSeries({ data, keys, suffix, accent }: { data: any[]; keys: string[]; suffix?: string; accent?: string }) {
  const gid = `barGrad-${Math.random().toString(36).slice(2, 8)}`;
  const base = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {keys.map((k, i) => {
            const c = i === 0 ? base : COLORS[i % COLORS.length];
            return (
              <linearGradient id={`${gid}-${i}`} key={k} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c} stopOpacity={0.55} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}${suffix ?? ''}`} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any) => `${v}${suffix ?? ''}`} contentStyle={tooltipStyle} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={`url(#${gid}-${i})`} radius={[6, 6, 0, 0]} maxBarSize={48} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
function HBarSeries({ data, valueLabel, accent }: { data: Array<{ name: string; value: number }>; valueLabel?: string; accent?: string }) {
  const gid = `hbarGrad-${Math.random().toString(36).slice(2, 8)}`;
  const base = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 50, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={base} stopOpacity={0.55} />
            <stop offset="100%" stopColor={base} stopOpacity={0.95} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}${valueLabel ?? ''}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={110} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any) => `${v}${valueLabel ?? ''}`} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={`url(#${gid})`} radius={[0, 6, 6, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
function LineSeries({ data, keys, accent }: { data: any[]; keys: string[]; accent?: string }) {
  const base = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
        {keys.map((k, i) => {
          const c = i === 0 ? base : COLORS[i % COLORS.length];
          return <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2.5} dot={{ r: 3, fill: c, strokeWidth: 0 }} activeDot={{ r: 5 }} />;
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
function AreaSeries({ data, keys, accent }: { data: any[]; keys: string[]; accent?: string }) {
  const gid = `areaGrad-${Math.random().toString(36).slice(2, 8)}`;
  const base = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {keys.map((k, i) => {
            const c = i === 0 ? base : COLORS[i % COLORS.length];
            return (
              <linearGradient id={`${gid}-${i}`} key={k} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.5} />
                <stop offset="100%" stopColor={c} stopOpacity={0.05} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        {keys.map((k, i) => {
          const c = i === 0 ? base : COLORS[i % COLORS.length];
          return <Area key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} fill={`url(#${gid}-${i})`} />;
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
function PieSeries({ data, donut }: { data: Array<{ name: string; value: number }>; donut: boolean }) {
  // Drop zero-value slices so their labels don't stack at the same angle.
  // Recharts will otherwise render "0%" labels on top of each other and the
  // chart looks like a single big slice with a pile of overlapping text.
  const filtered = data.filter(d => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);
  if (!filtered.length || total === 0) return <EmptyState label="No data" />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="name"
          innerRadius={donut ? '55%' : 0}
          outerRadius="72%"
          paddingAngle={2}
          label={({ name, value }) => {
            const pct = (value / total) * 100;
            // Only label slices that are big enough to be readable. Smaller
            // slices live in the legend + tooltip.
            return pct >= 6 ? `${name} ${pct.toFixed(0)}%` : '';
          }}
          labelLine={false}
        >
          {filtered.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--s2)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, n]}
          contentStyle={tooltipStyle}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          iconType="circle"
          formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
function NumberTile({ main, sub, accent }: { main: string; sub: string; accent?: string }) {
  const c = accent ?? 'var(--primary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 12 }}>
      <div style={{
        fontSize: 42,
        fontWeight: 800,
        background: `linear-gradient(135deg, ${c}, ${c}cc)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        lineHeight: 1,
        letterSpacing: -0.5,
      }}>{main}</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center', maxWidth: 240 }}>{sub}</div>
    </div>
  );
}
function TableView({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return <EmptyState label="No rows" />;
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={tableStyle}>
        <thead><tr>{cols.map(c => <th key={c} style={thStyle}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>{cols.map(c => <td key={c} style={tdStyle}>{r[c]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: 'var(--text-dim)' }}>
      <Inbox size={24} style={{ opacity: 0.4 }} />
      <div style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

function chartLabel(c: ChartType): string {
  return ({ number: 'Number', bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', 'horizontal-bar': 'H-Bar', table: 'Table', heatmap: 'Heatmap' } as Record<ChartType, string>)[c];
}
function heatColor(rate: number): string {
  if (rate >= 50) return 'rgba(16,185,129,0.85)';
  if (rate >= 30) return 'rgba(16,185,129,0.55)';
  if (rate >= 15) return 'rgba(245,158,11,0.55)';
  if (rate >  0) return 'rgba(245,158,11,0.25)';
  return 'transparent';
}

function cardStyle(hovered: boolean): React.CSSProperties {
  return {
    background: 'var(--s2)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
    transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
  };
}

const header: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', padding: '12px 14px', gap: 8 };
const title: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text)' };
const subtitle: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2, fontWeight: 700 };
const body: React.CSSProperties = { flex: 1, padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 };
const empty: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 };
const menu: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 180, zIndex: 50, boxShadow: '0 10px 28px rgba(0,0,0,0.35)' };
const menuLabel: React.CSSProperties = { fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, padding: '6px 8px', fontWeight: 700 };
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' };
const menuDivider: React.CSSProperties = { height: 1, background: 'var(--border)', margin: '4px 0' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, position: 'sticky', top: 0, background: 'var(--s2)' };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border-l)', color: 'var(--text)' };
const skeleton: React.CSSProperties = {
  height: '70%',
  width: '90%',
  borderRadius: 8,
  background: 'linear-gradient(90deg, var(--s3) 0%, var(--s2) 50%, var(--s3) 100%)',
  backgroundSize: '200% 100%',
  animation: 'aw-shimmer 1.4s infinite',
};
