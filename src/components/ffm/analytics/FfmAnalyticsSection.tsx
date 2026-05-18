'use client';
/**
 * Field Force Analytics — read-and-customise widget grid.
 *
 * Mirrors LeadAnalyticsSection but for the field-force surface. 16 preset
 * widgets + a custom chart builder, drag/resize, per-tile chart-type
 * switcher, pin to overview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import {
  Plus, Edit3, Save, X, BarChart3, LineChart as LineIcon, Activity, Layers,
  AlertTriangle, MoreVertical, Inbox, Users, Truck, Award, Wand2,
} from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { toast } from 'sonner';

import {
  FFM_WIDGET_CATALOG, ffmWidgetByType, ffmDatasetById, fetchFfmDataset,
  type FfmWidgetMeta, type FfmWidgetType,
} from '../../../lib/ffmAnalyticsConfig';
import { crmDashboardLayouts, type DashboardConfig, type WidgetInstance, type GridItem } from '../../../lib/crmAnalyticsExtApi';
import type { ChartType } from '../../../lib/crm/widgetCatalog';
import FfmCustomChartBuilder from './FfmCustomChartBuilder';

const ResponsiveGridLayout = WidthProvider(Responsive);

const ROW_HEIGHT = 60;
const COLS = { lg: 12, md: 8, sm: 2 };
const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };

const ACCENT_BY_CATEGORY: Record<string, string> = {
  Coverage:     '#3B82F6',
  Quality:      '#8B5CF6',
  Productivity: '#14B8A6',
  Efficiency:   '#F59E0B',
  Discipline:   '#06B6D4',
  Risk:         '#E0282C',
  Growth:       '#10B981',
};
const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4', '#E0282C'];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Coverage:     Users,
  Quality:      Award,
  Productivity: Activity,
  Efficiency:   Truck,
  Discipline:   Layers,
  Risk:         AlertTriangle,
  Growth:       BarChart3,
};

type CustomConfig = { data_source?: string; x_field?: string; y_field?: string; label?: string };

// ─────────────────────────────────────────────────────────────────────────
// Section component
// ─────────────────────────────────────────────────────────────────────────

export default function FfmAnalyticsSection() {
  const [config, setConfig] = useState<DashboardConfig>({ widgets: [], layouts: {} });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [building, setBuilding] = useState(false);
  const [editingCustom, setEditingCustom] = useState<WidgetInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    crmDashboardLayouts.get('ffm' as unknown as 'analytics')
      .then((r) => {
        const cfg = r?.data ?? defaultLayout();
        setConfig({
          widgets: Array.isArray(cfg.widgets) ? cfg.widgets : defaultLayout().widgets,
          layouts: cfg.layouts && typeof cfg.layouts === 'object' ? cfg.layouts : defaultLayout().layouts,
        });
        setLoadError(null);
      })
      .catch(() => {
        setConfig(defaultLayout());
        setLoadError(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      crmDashboardLayouts.save('ffm' as unknown as 'analytics', config).catch((err) => {
        toast.error(`Failed to save: ${(err as Error)?.message?.slice(0, 120) ?? 'unknown'}`);
      });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, loading]);

  const layouts: Layouts = useMemo(() => ({
    lg: config.layouts.lg ?? defaultLayoutFor(config.widgets, 12),
    md: config.layouts.md ?? defaultLayoutFor(config.widgets, 8),
    sm: config.layouts.sm ?? defaultLayoutFor(config.widgets, 2),
  }), [config]);

  const appendWidget = (newWidget: WidgetInstance, size: { w: number; h: number }) => {
    setConfig((c) => {
      const next: DashboardConfig = {
        widgets: [...c.widgets, newWidget],
        layouts: {
          lg: [...(c.layouts.lg ?? [])],
          md: [...(c.layouts.md ?? [])],
          sm: [...(c.layouts.sm ?? [])],
        },
      };
      for (const bp of ['lg', 'md', 'sm'] as const) {
        const arr = next.layouts[bp]!;
        const maxY = arr.reduce((m, it) => Math.max(m, it.y + it.h), 0);
        arr.push({ i: newWidget.id, x: 0, y: maxY, w: Math.min(size.w, COLS[bp]), h: size.h });
      }
      return next;
    });
    dirty.current = true;
  };

  const addWidget = (meta: FfmWidgetMeta) => {
    const w: WidgetInstance = { id: cryptoRandomId(), widget_type: meta.type, chart_type: meta.defaultChart };
    appendWidget(w, meta.defaultSize);
    setAdding(false);
    toast.success(`Added ${meta.title}`);
  };

  const saveCustomChart = (w: WidgetInstance) => {
    const isEdit = config.widgets.some((existing) => existing.id === w.id);
    if (isEdit) {
      setConfig((c) => ({ ...c, widgets: c.widgets.map((it) => (it.id === w.id ? w : it)) }));
      dirty.current = true;
      toast.success('Chart updated');
    } else {
      appendWidget(w, { w: 6, h: 4 });
      toast.success('Chart added');
    }
    setBuilding(false);
    setEditingCustom(null);
  };

  const removeWidget = (id: string) => {
    setConfig((c) => ({
      widgets: c.widgets.filter((w) => w.id !== id),
      layouts: {
        lg: (c.layouts.lg ?? []).filter((it) => it.i !== id),
        md: (c.layouts.md ?? []).filter((it) => it.i !== id),
        sm: (c.layouts.sm ?? []).filter((it) => it.i !== id),
      },
    }));
    dirty.current = true;
    toast.success('Widget removed');
  };

  const changeChartType = (id: string, chart_type: ChartType) => {
    setConfig((c) => ({ ...c, widgets: c.widgets.map((w) => (w.id === id ? { ...w, chart_type } : w)) }));
    dirty.current = true;
  };

  const onLayoutChange = (_: Layout[], allLayouts: Layouts) => {
    setConfig((c) => ({ ...c, layouts: allLayouts as DashboardConfig['layouts'] }));
    dirty.current = true;
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Loading field-force analytics…</div>;
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Field Force Analytics</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>Beat, productivity, discipline &amp; growth</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            16 presets + custom chart builder. Drag, resize, switch chart types — layout saves automatically.
          </div>
        </div>
        <button onClick={() => setAdding(true)} style={primaryBtn}><Plus size={14} /> Add widget</button>
        <button onClick={() => setBuilding(true)} style={secondaryBtn}><Wand2 size={14} /> Build chart</button>
        <button onClick={() => setEditing((e) => !e)} style={editing ? activeBtn : secondaryBtn}>
          {editing ? <><Save size={14} /> Done</> : <><Edit3 size={14} /> Edit layout</>}
        </button>
      </div>

      {loadError && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#ef4444' }}>
          Couldn&apos;t load layout: <code>{loadError}</code>
        </div>
      )}

      {config.widgets.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-dim)' }}>
          <BarChart3 size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>No FFM widgets yet</div>
          <div style={{ fontSize: 12, margin: '6px 0 14px' }}>Pick from 16 field-force presets — or build your own.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setAdding(true)} style={primaryBtn}>
              <Plus size={14} /> Add preset
            </button>
            <button onClick={() => setBuilding(true)} style={secondaryBtn}>
              <Wand2 size={14} /> Build chart
            </button>
          </div>
        </div>
      )}

      {config.widgets.length > 0 && (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={[14, 14]}
          containerPadding={[0, 0]}
          isDraggable={editing}
          isResizable={editing}
          onLayoutChange={onLayoutChange}
          draggableHandle=".widget-drag-handle"
        >
          {config.widgets.map((w) => (
            <div key={w.id} style={{ position: 'relative' }}>
              {editing && (
                <div className="widget-drag-handle" style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 24, zIndex: 10,
                  cursor: 'move', background: 'rgba(224,40,44,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: 'var(--primary)', fontWeight: 700, letterSpacing: 1,
                }}>
                  DRAG TO MOVE • DRAG CORNER TO RESIZE
                </div>
              )}
              <FfmWidget
                widget={w}
                onRemove={removeWidget}
                onChangeChartType={changeChartType}
                onEditCustom={(widget) => setEditingCustom(widget)}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {adding && <AddFfmWidgetDialog onPick={addWidget} onClose={() => setAdding(false)} existing={config.widgets} />}
      {(building || editingCustom) && (
        <FfmCustomChartBuilder
          onSave={saveCustomChart}
          onClose={() => { setBuilding(false); setEditingCustom(null); }}
          initial={editingCustom}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Widget renderer
// ─────────────────────────────────────────────────────────────────────────

function FfmWidget({ widget, onRemove, onChangeChartType, onEditCustom }: {
  widget: WidgetInstance;
  onRemove: (id: string) => void;
  onChangeChartType: (id: string, c: ChartType) => void;
  onEditCustom: (w: WidgetInstance) => void;
}) {
  if (widget.widget_type === 'ffm_custom') {
    return <FfmCustomWidget widget={widget} onRemove={onRemove} onChangeChartType={onChangeChartType} onEdit={onEditCustom} />;
  }

  const meta = ffmWidgetByType(widget.widget_type);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!meta) { setError('Unknown widget'); setLoading(false); return; }
    setLoading(true);
    fetchFfmDataset(widget.widget_type)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message || 'Load failed'))
      .finally(() => setLoading(false));
  }, [widget.widget_type, meta]);

  if (!meta) {
    return <div style={cardStyle(false)}><div style={hdr}><div style={titleStyle}>Unknown widget</div></div><div style={body}><div style={empty}>Widget type not recognised</div></div></div>;
  }

  const accent = ACCENT_BY_CATEGORY[meta.category] ?? 'var(--primary)';

  return (
    <div style={cardStyle(hovered)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={hdr}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleStyle}>{meta.title}</div>
          <div style={{ ...subtitle, color: accent }}>{meta.category}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={iconBtn} aria-label="Widget options"><MoreVertical size={16} /></button>
          {menuOpen && (
            <div style={menu} onMouseLeave={() => setMenuOpen(false)}>
              {meta.supportedCharts.length > 1 && (
                <>
                  <div style={menuLabel}>Chart type</div>
                  {meta.supportedCharts.map(c => (
                    <button key={c} onClick={() => { onChangeChartType(widget.id, c); setMenuOpen(false); }}
                      style={{ ...menuItem, background: widget.chart_type === c ? 'var(--primary)' : 'transparent', color: widget.chart_type === c ? '#fff' : 'var(--text)' }}>
                      {chartLabel(c)}
                    </button>
                  ))}
                  <div style={menuDivider} />
                </>
              )}
              <button onClick={() => { onRemove(widget.id); setMenuOpen(false); }} style={{ ...menuItem, color: '#ef4444' }}>
                <X size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Remove widget
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={body}>
        {loading && <div style={empty}><div style={skel} /></div>}
        {!loading && error && (
          <div style={{ ...empty, color: '#ef4444' }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {error}
          </div>
        )}
        {!loading && !error && <FfmWidgetBody widget={widget} meta={meta} data={data} accent={accent} />}
      </div>
    </div>
  );
}

function FfmCustomWidget({ widget, onRemove, onChangeChartType, onEdit }: {
  widget: WidgetInstance;
  onRemove: (id: string) => void;
  onChangeChartType: (id: string, c: ChartType) => void;
  onEdit: (w: WidgetInstance) => void;
}) {
  const cfg = (widget.config as CustomConfig | undefined) ?? {};
  const ds = ffmDatasetById(cfg.data_source ?? '');
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!ds) { setError('Dataset not found'); setLoading(false); return; }
    setLoading(true);
    fetchFfmDataset(ds.id)
      .then((d) => { setData(d ?? []); setError(null); })
      .catch((e: Error) => setError(e.message || 'Load failed'))
      .finally(() => setLoading(false));
  }, [ds]);

  if (!ds) {
    return (
      <div style={cardStyle(false)}>
        <div style={hdr}><div style={titleStyle}>{cfg.label ?? 'Custom chart'}</div></div>
        <div style={body}><div style={empty}>Dataset not found</div></div>
      </div>
    );
  }

  const accent = 'var(--primary)';
  const chart = widget.chart_type as ChartType;
  const xKey = cfg.x_field ?? ds.defaultX;
  const yKey = cfg.y_field ?? ds.defaultY;
  const supported: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut', 'horizontal-bar', 'table'];

  return (
    <div style={cardStyle(hovered)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={hdr}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleStyle}>{cfg.label || ds.label}</div>
          <div style={{ ...subtitle, color: accent }}>Custom · {ds.label}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={iconBtn} aria-label="Widget options"><MoreVertical size={16} /></button>
          {menuOpen && (
            <div style={menu} onMouseLeave={() => setMenuOpen(false)}>
              <div style={menuLabel}>Chart type</div>
              {supported.map(c => (
                <button key={c} onClick={() => { onChangeChartType(widget.id, c); setMenuOpen(false); }}
                  style={{ ...menuItem, background: widget.chart_type === c ? 'var(--primary)' : 'transparent', color: widget.chart_type === c ? '#fff' : 'var(--text)' }}>
                  {chartLabel(c)}
                </button>
              ))}
              <div style={menuDivider} />
              <button onClick={() => { onEdit(widget); setMenuOpen(false); }} style={menuItem}>
                <Edit3 size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Edit chart
              </button>
              <button onClick={() => { onRemove(widget.id); setMenuOpen(false); }} style={{ ...menuItem, color: '#ef4444' }}>
                <X size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Remove widget
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={body}>
        {loading && <div style={empty}><div style={skel} /></div>}
        {!loading && error && (
          <div style={{ ...empty, color: '#ef4444' }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {error}
          </div>
        )}
        {!loading && !error && (
          <CustomChartBody rows={data as Array<Record<string, unknown>>} ds={ds} xKey={xKey} yKey={yKey} chart={chart} accent={accent} />
        )}
      </div>
    </div>
  );
}

function CustomChartBody({ rows, ds, xKey, yKey, chart, accent }: {
  rows: Array<Record<string, unknown>>;
  ds: NonNullable<ReturnType<typeof ffmDatasetById>>;
  xKey: string;
  yKey: string;
  chart: ChartType;
  accent: string;
}) {
  if (!rows.length) return <EmptyState label="No data yet" />;

  if (chart === 'table') {
    const tableRows = rows.map((r) => {
      const out: Record<string, string | number> = {};
      for (const f of ds.fields) {
        const v = r[f.key];
        out[f.label] = (v as string | number) ?? '';
      }
      return out;
    });
    return <TableView rows={tableRows} />;
  }

  const series = rows.map((r) => ({
    name: String(r[xKey] ?? '—'),
    value: Number(r[yKey] ?? 0),
  }));

  if (chart === 'pie' || chart === 'donut') return <PieSeries data={series} donut={chart === 'donut'} />;
  if (chart === 'horizontal-bar') return <HBarSeries data={series} accent={accent} />;
  if (chart === 'line') return <LineSeries data={series} accent={accent} />;
  if (chart === 'area') return <AreaSeries data={series} accent={accent} />;
  return <BarSeries data={series} accent={accent} />;
}

function FfmWidgetBody({ widget, meta, data, accent }: { widget: WidgetInstance; meta: FfmWidgetMeta; data: unknown; accent: string }) {
  const chart = widget.chart_type as ChartType;
  const rows = (data as any[]) ?? [];
  if (!rows.length) return <EmptyState label="No data yet" />;

  const shape = pickShape(meta.type as FfmWidgetType, rows);
  if (!shape) return <EmptyState label="Unsupported data shape" />;
  const { series, suffix, tableRows, valueLabel } = shape;

  if (chart === 'table') return <TableView rows={tableRows} />;
  if (chart === 'pie' || chart === 'donut') return <PieSeries data={series.map(s => ({ name: s.name, value: s.value }))} donut={chart === 'donut'} />;
  if (chart === 'horizontal-bar') return <HBarSeries data={series.map(s => ({ name: s.name, value: s.value }))} accent={accent} valueLabel={valueLabel} />;
  if (chart === 'line') return <LineSeries data={series} accent={accent} />;
  if (chart === 'area') return <AreaSeries data={series} accent={accent} />;
  if (chart === 'heatmap') return <TableView rows={tableRows} />;
  return <BarSeries data={series} suffix={suffix} accent={accent} />;
}

function pickShape(type: FfmWidgetType, rows: any[]): {
  series: Array<{ name: string; value: number }>;
  suffix?: string;
  valueLabel?: string;
  tableRows: Array<Record<string, string | number>>;
} | null {
  switch (type) {
    case 'beat_adherence':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.adherence_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, Planned: r.planned, Visited: r.visited, 'Adherence %': r.adherence_pct })),
      };
    case 'outlet_coverage':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.coverage_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, Universe: r.universe, 'Visited MTD': r.visited_mtd, 'Coverage %': r.coverage_pct })),
      };
    case 'frequency':
      return {
        series: rows.map((r: any) => ({ name: r.outlet_type, value: r.compliance_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ 'Outlet type': r.outlet_type, 'Due visits': r.due_visits, 'On time': r.on_time, 'Compliance %': r.compliance_pct })),
      };
    case 'productive_calls':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.productive_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, Visits: r.visits, Productive: r.productive, 'Productive %': r.productive_pct })),
      };
    case 'strike_rate':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.strike_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, Visits: r.visits, Orders: r.orders, 'Strike %': r.strike_pct })),
      };
    case 'aov':
      return {
        series: rows.map((r: any) => ({ name: r.week, value: r.aov_inr })),
        tableRows: rows.map((r: any) => ({ Week: r.week, 'AOV (₹)': r.aov_inr, Orders: r.orders })),
      };
    case 'new_outlets':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.new_outlet_count })),
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, 'New outlets': r.new_outlet_count })),
      };
    case 'visit_duration':
      return {
        series: rows.map((r: any) => ({ name: r.bucket, value: r.visit_count })),
        tableRows: rows.map((r: any) => ({ Bucket: r.bucket, Visits: r.visit_count })),
      };
    case 'idle_heatmap': {
      const fes = Array.from(new Set(rows.map((r: any) => r.fe_name)));
      const pivot: Record<string, Record<string, string | number>> = {};
      for (const fe of fes) pivot[fe] = { FE: fe };
      for (const r of rows) {
        pivot[r.fe_name][`${r.hour}h`] = r.idle_min;
      }
      return {
        series: rows.map((r: any) => ({ name: `${r.fe_name}/${r.hour}h`, value: r.idle_min })),
        tableRows: fes.map(fe => pivot[fe] as Record<string, string | number>),
      };
    }
    case 'distance':
      return {
        series: rows.map((r: any) => ({ name: r.day, value: r.km_total })),
        tableRows: rows.map((r: any) => ({ Day: r.day, 'Km total': r.km_total, 'CO₂ kg': r.co2_kg })),
      };
    case 'off_route':
      return {
        series: rows.map((r: any) => ({ name: r.outlet_name, value: r.distance_km })),
        tableRows: rows.map((r: any) => ({ Outlet: r.outlet_name, FE: r.fe_name, 'Beat': r.planned_beat, 'Distance (km)': r.distance_km, 'Visited at': r.visited_at })),
      };
    case 'punctuality':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.on_time })),
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, 'On time': r.on_time, Late: r.late, Absent: r.absent })),
      };
    case 'stuck_fes':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.days_since_last_activity })),
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, 'Days idle': r.days_since_last_activity, 'Last visit': r.last_visit_at ?? '—' })),
      };
    case 'security_violations':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.violation_count })),
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, 'Mock loc': r.mock_location, 'VPN': r.vpn_detected, Total: r.violation_count })),
      };
    case 'form_completion':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.completion_pct })),
        suffix: '%', valueLabel: '%',
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, Required: r.required, Submitted: r.submitted, 'Completion %': r.completion_pct })),
      };
    case 'top_performers':
      return {
        series: rows.map((r: any) => ({ name: r.fe_name, value: r.revenue_inr })),
        tableRows: rows.map((r: any) => ({ FE: r.fe_name, 'Revenue (₹)': r.revenue_inr, Orders: r.orders, 'Outlets covered': r.outlets_covered })),
      };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Add-widget dialog
// ─────────────────────────────────────────────────────────────────────────

function AddFfmWidgetDialog({ onPick, onClose, existing }: {
  onPick: (w: FfmWidgetMeta) => void; onClose: () => void; existing: WidgetInstance[];
}) {
  const existingTypes = new Set(existing.map(w => w.widget_type));
  const grouped = useMemo(() => {
    const map = new Map<string, FfmWidgetMeta[]>();
    for (const w of FFM_WIDGET_CATALOG) {
      const arr = map.get(w.category) ?? [];
      arr.push(w);
      map.set(w.category, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Add FFM widget</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Pick any preset — already-added ones show &quot;Added&quot;.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16 }}>
          {grouped.map(([cat, widgets]) => {
            const Icon = CATEGORY_ICONS[cat] ?? BarChart3;
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  <Icon size={13} /> {cat}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {widgets.map(w => {
                    const already = existingTypes.has(w.type);
                    return (
                      <button key={w.type} onClick={() => !already && onPick(w)} disabled={already}
                        style={{
                          textAlign: 'left', background: already ? 'var(--s3)' : 'var(--s2)', border: '1px solid var(--border)',
                          padding: 12, borderRadius: 10, cursor: already ? 'default' : 'pointer', color: 'var(--text)',
                          opacity: already ? 0.5 : 1, transition: 'border-color .1s',
                        }}
                        onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{w.title}</div>
                          {already && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', background: 'var(--s4)', padding: '2px 5px', borderRadius: 4 }}>ADDED</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{w.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Defaults — seed a 6-widget starter grid for first-time visitors.
// ─────────────────────────────────────────────────────────────────────────

function defaultLayout(): DashboardConfig {
  const presets: Array<{ type: FfmWidgetType; chart: ChartType }> = [
    { type: 'beat_adherence',  chart: 'bar' },
    { type: 'outlet_coverage', chart: 'horizontal-bar' },
    { type: 'top_performers',  chart: 'horizontal-bar' },
    { type: 'aov',             chart: 'line' },
    { type: 'stuck_fes',       chart: 'table' },
    { type: 'distance',        chart: 'area' },
  ];
  const widgets: WidgetInstance[] = presets.map((p, i) => ({
    id: `ffm-preset-${i + 1}`, widget_type: p.type, chart_type: p.chart,
  }));
  return {
    widgets,
    layouts: {
      lg: [
        { i: widgets[0].id, x: 0, y: 0, w: 6, h: 4 },
        { i: widgets[1].id, x: 6, y: 0, w: 6, h: 4 },
        { i: widgets[2].id, x: 0, y: 4, w: 8, h: 5 },
        { i: widgets[3].id, x: 8, y: 4, w: 4, h: 5 },
        { i: widgets[4].id, x: 0, y: 9, w: 8, h: 5 },
        { i: widgets[5].id, x: 8, y: 9, w: 4, h: 5 },
      ],
      md: widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 4, w: 8, h: 4 })),
      sm: widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 4, w: 2, h: 4 })),
    },
  };
}

function defaultLayoutFor(widgets: WidgetInstance[], cols: number): GridItem[] {
  let x = 0, y = 0, rowMaxH = 0;
  const out: GridItem[] = [];
  for (const w of widgets) {
    const meta = ffmWidgetByType(w.widget_type);
    const ww = Math.min(meta?.defaultSize.w ?? 6, cols);
    const hh = meta?.defaultSize.h ?? 4;
    if (x + ww > cols) { x = 0; y += rowMaxH; rowMaxH = 0; }
    out.push({ i: w.id, x, y, w: ww, h: hh });
    x += ww;
    rowMaxH = Math.max(rowMaxH, hh);
  }
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'fw_' + Math.random().toString(36).slice(2, 11);
}

function chartLabel(c: ChartType): string {
  return ({ number: 'Number', bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', 'horizontal-bar': 'H-Bar', table: 'Table', heatmap: 'Heatmap' } as Record<ChartType, string>)[c];
}

// ─────────────────────────────────────────────────────────────────────────
// Inline chart helpers (kept local so FFM doesn't depend on CRM analytics).
// ─────────────────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' };

function BarSeries({ data, suffix, accent }: { data: Array<{ name: string; value: number }>; suffix?: string; accent?: string }) {
  const gid = `bg-${Math.random().toString(36).slice(2, 8)}`;
  const c = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.95} />
            <stop offset="100%" stopColor={c} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${v}${suffix ?? ''}`} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any) => `${v}${suffix ?? ''}`} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={`url(#${gid})`} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
function HBarSeries({ data, valueLabel, accent }: { data: Array<{ name: string; value: number }>; valueLabel?: string; accent?: string }) {
  const gid = `hbg-${Math.random().toString(36).slice(2, 8)}`;
  const c = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 50, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity={0.55} />
            <stop offset="100%" stopColor={c} stopOpacity={0.95} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${v}${valueLabel ?? ''}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={110} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any) => `${v}${valueLabel ?? ''}`} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={`url(#${gid})`} radius={[0, 6, 6, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
function LineSeries({ data, accent }: { data: Array<{ name: string; value: number }>; accent?: string }) {
  const c = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
        <Line type="monotone" dataKey="value" stroke={c} strokeWidth={2.5} dot={{ r: 3, fill: c, strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
function AreaSeries({ data, accent }: { data: Array<{ name: string; value: number }>; accent?: string }) {
  const gid = `ag-${Math.random().toString(36).slice(2, 8)}`;
  const c = accent ?? COLORS[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.5} />
            <stop offset="100%" stopColor={c} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="value" stroke={c} strokeWidth={2} fill={`url(#${gid})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
function PieSeries({ data, donut }: { data: Array<{ name: string; value: number }>; donut: boolean }) {
  const filtered = data.filter(d => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);
  if (!filtered.length || total === 0) return <EmptyState label="No data" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={filtered} dataKey="value" nameKey="name" innerRadius={donut ? '55%' : 0} outerRadius="72%" paddingAngle={2}
          label={({ name, value }) => {
            const pct = (value / total) * 100;
            return pct >= 6 ? `${name} ${pct.toFixed(0)}%` : '';
          }}
          labelLine={false}
        >
          {filtered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--s2)" strokeWidth={2} />)}
        </Pie>
        <Tooltip formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, n]} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle"
          formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
function TableView({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return <EmptyState label="No rows" />;
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr>{cols.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>{cols.map(c => <td key={c} style={td}>{r[c]}</td>)}</tr>)}</tbody>
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

function cardStyle(hovered: boolean): React.CSSProperties {
  return {
    background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14,
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    transition: 'transform .15s ease, box-shadow .15s ease',
    transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
  };
}

const hdr: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', padding: '12px 14px', gap: 8 };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text)' };
const subtitle: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2, fontWeight: 700 };
const body: React.CSSProperties = { flex: 1, padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 };
const empty: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 };
const menu: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 180, zIndex: 50, boxShadow: '0 10px 28px rgba(0,0,0,0.35)' };
const menuLabel: React.CSSProperties = { fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, padding: '6px 8px', fontWeight: 700 };
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' };
const menuDivider: React.CSSProperties = { height: 1, background: 'var(--border)', margin: '4px 0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, position: 'sticky', top: 0, background: 'var(--s2)' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border-l)', color: 'var(--text)' };
const skel: React.CSSProperties = { height: '70%', width: '90%', borderRadius: 8, background: 'linear-gradient(90deg, var(--s3) 0%, var(--s2) 50%, var(--s3) 100%)', backgroundSize: '200% 100%', animation: 'aw-shimmer 1.4s infinite' };

const baseBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)' };
const primaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--primary)', color: '#fff', border: 'none' };
const secondaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s3)', color: 'var(--text)' };
const activeBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s3)', color: 'var(--primary)', borderColor: 'var(--primary)' };
