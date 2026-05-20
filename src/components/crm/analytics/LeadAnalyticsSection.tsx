'use client';
/**
 * Embeddable Lead Analytics customizer for the dedicated Lead Analytics page.
 *
 * - "Edit layout" toggle puts the grid in drag/resize mode.
 * - "+ Add widget" opens a modal listing the 15-widget catalog.
 * - "Build chart" opens the custom chart builder (pick dataset + X/Y axes
 *   + chart type and save as a free-form widget).
 * - Per-tile menu: chart-type switcher, edit-chart (custom only),
 *   pin to Overview, remove.
 * - Layout persists per-user under (org_id, page='analytics') on every
 *   change (debounced 800ms) so refresh restores the exact state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';
import { Plus, Edit3, Save, X, BarChart3, LineChart as LineIcon, PieChart, Layers, Activity, Sliders } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import AnalyticsWidget from './AnalyticsWidget';
import CustomChartBuilder from './CustomChartBuilder';
import { WIDGET_CATALOG, widgetByType, type WidgetMeta, type ChartType } from '../../../lib/crm/widgetCatalog';
import { crmDashboardLayouts, type DashboardConfig, type WidgetInstance, type GridItem } from '../../../lib/crmAnalyticsExtApi';
import { toast } from 'sonner';

const ResponsiveGridLayout = WidthProvider(Responsive);

const ROW_HEIGHT = 60;
const COLS = { lg: 12, md: 8, sm: 2 };
const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Velocity: LineIcon,
  Quality: PieChart,
  Pipeline: BarChart3,
  Engagement: Activity,
  Risk: Layers,
};

// 'new' = building a brand-new chart, WidgetInstance = editing an existing one,
// null = builder closed.
type BuilderState = null | 'new' | WidgetInstance;

export default function LeadAnalyticsSection() {
  const [config, setConfig] = useState<DashboardConfig>({ widgets: [], layouts: {} });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    crmDashboardLayouts.get('analytics')
      .then((r) => {
        const cfg = r?.data ?? { widgets: [], layouts: {} };
        setConfig({
          widgets: Array.isArray(cfg.widgets) ? cfg.widgets : [],
          layouts: cfg.layouts && typeof cfg.layouts === 'object' ? cfg.layouts : {},
        });
        setLoadError(null);
      })
      .catch((err) => {
        const msg = err?.message || String(err);
        console.error('[LeadAnalyticsSection] layout load failed:', err);
        setLoadError(msg);
        setConfig({ widgets: [], layouts: {} });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      crmDashboardLayouts.save('analytics', config).catch((err) => {
        const msg = err?.message || String(err);
        console.error('[LeadAnalyticsSection] layout save failed:', err);
        toast.error(`Failed to save: ${msg.slice(0, 120)}`);
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

  // Shared helper used by both the preset "Add widget" flow and the
  // custom-chart "Build chart" save flow.
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
        const w = Math.min(size.w, COLS[bp]);
        arr.push({ i: newWidget.id, x: 0, y: maxY, w, h: size.h });
      }
      return next;
    });
    dirty.current = true;
  };

  const addWidget = (meta: WidgetMeta) => {
    const newWidget: WidgetInstance = { id: cryptoRandomId(), widget_type: meta.type, chart_type: meta.defaultChart };
    appendWidget(newWidget, meta.defaultSize);
    setAdding(false);
    toast.success(`Added ${meta.title}`);
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

  // Pin a widget to the CRM Overview. Hits the backend /overview/pin
  // helper which appends without disturbing other pinned widgets.
  const pinToOverview = async (widget: WidgetInstance) => {
    const meta = widgetByType(widget.widget_type);
    const label = (widget.widget_type === 'custom'
      ? (widget.config as { label?: string } | undefined)?.label
      : null) || meta?.title || widget.widget_type;
    try {
      await crmDashboardLayouts.pinToOverview(widget);
      toast.success(`Pinned "${label}" to CRM Overview`);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'unknown error';
      toast.error(`Failed to pin: ${msg.slice(0, 120)}`);
    }
  };

  // Custom-chart builder save handler. If `builder` is a WidgetInstance,
  // replace the existing widget in place (keeps the same layout slot).
  // If `builder === 'new'`, append a fresh tile at the bottom.
  const onCustomSave = (widget: WidgetInstance) => {
    if (typeof builder === 'object' && builder !== null) {
      setConfig((c) => ({
        ...c,
        widgets: c.widgets.map((w) => (w.id === widget.id ? widget : w)),
      }));
      dirty.current = true;
      toast.success('Chart updated');
    } else {
      appendWidget(widget, { w: 6, h: 4 });
      toast.success('Custom chart added');
    }
    setBuilder(null);
  };

  const editCustom = (widget: WidgetInstance) => setBuilder(widget);

  const onLayoutChange = (_: Layout[], allLayouts: Layouts) => {
    setConfig((c) => ({ ...c, layouts: allLayouts as DashboardConfig['layouts'] }));
    dirty.current = true;
  };

  if (loading) {
    return (
      <div id="lead-analytics" style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>
        Loading lead analytics…
      </div>
    );
  }

  return (
    <div
      id="lead-analytics"
      style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, scrollMarginTop: 80 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Lead Analytics</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>Custom widgets</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Add presets, build your own charts with custom X / Y axes, drag &amp; resize, and pin favorites to the CRM Overview. Layout saves automatically.
          </div>
        </div>
        <button onClick={() => setAdding(true)} style={primaryBtn}>
          <Plus size={14} /> Add widget
        </button>
        <button onClick={() => setBuilder('new')} style={secondaryBtn}>
          <Sliders size={14} /> Build chart
        </button>
        <button onClick={() => setEditing((e) => !e)} style={editing ? activeBtn : secondaryBtn}>
          {editing ? <><Save size={14} /> Done</> : <><Edit3 size={14} /> Edit layout</>}
        </button>
      </div>

      {loadError && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          fontSize: 12,
          color: '#ef4444',
        }}>
          Couldn&apos;t load saved analytics layout: <code>{loadError}</code>
          <div style={{ marginTop: 4, color: 'var(--text-dim)', fontSize: 11 }}>
            You can still add widgets — they&apos;ll be saved as soon as the API responds.
          </div>
        </div>
      )}

      {!config.widgets.length && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-dim)' }}>
          <BarChart3 size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>No analytics widgets added</div>
          <div style={{ fontSize: 12, margin: '6px 0 14px' }}>
            Pick from 15 preset widgets, or build your own chart with custom X / Y axes.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setAdding(true)} style={primaryBtn}>
              <Plus size={14} /> Add preset
            </button>
            <button onClick={() => setBuilder('new')} style={secondaryBtn}>
              <Sliders size={14} /> Build custom chart
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
            // overflow:visible so the widget's options dropdown can escape the
            // react-grid-layout cell (otherwise the "Remove widget" item gets
            // clipped). The inner widget body still hides its own overflow.
            <div key={w.id} style={{ position: 'relative', overflow: 'visible' }}>
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
              <AnalyticsWidget
                widget={w}
                isEditing={editing}
                onRemove={removeWidget}
                onChangeChartType={changeChartType}
                onPinToOverview={pinToOverview}
                onEdit={editCustom}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {adding && <AddWidgetDialog onPick={addWidget} onClose={() => setAdding(false)} existing={config.widgets} />}
      {builder !== null && (
        <CustomChartBuilder
          onSave={onCustomSave}
          onClose={() => setBuilder(null)}
          initial={typeof builder === 'object' ? builder : null}
        />
      )}
    </div>
  );
}

function AddWidgetDialog({ onPick, onClose, existing }: { onPick: (w: WidgetMeta) => void; onClose: () => void; existing: WidgetInstance[] }) {
  const existingTypes = new Set(existing.map((w) => w.widget_type));
  const grouped = useMemo(() => {
    const map = new Map<string, WidgetMeta[]>();
    for (const w of WIDGET_CATALOG) {
      const arr = map.get(w.category) ?? [];
      arr.push(w);
      map.set(w.category, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Add analytics widget</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Pick any preset — already-added ones show &quot;Added&quot;. For full control, use the &quot;Build chart&quot; button instead.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
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
                  {widgets.map((w) => {
                    const already = existingTypes.has(w.type);
                    return (
                      <button
                        key={w.type}
                        onClick={() => !already && onPick(w)}
                        disabled={already}
                        style={{
                          textAlign: 'left',
                          background: already ? 'var(--s3)' : 'var(--s2)',
                          border: '1px solid var(--border)',
                          padding: 12, borderRadius: 10,
                          cursor: already ? 'default' : 'pointer',
                          color: 'var(--text)',
                          opacity: already ? 0.5 : 1,
                          transition: 'transform .1s, border-color .1s',
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

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'w_' + Math.random().toString(36).slice(2, 11);
}

function defaultLayoutFor(widgets: WidgetInstance[], cols: number): GridItem[] {
  let x = 0, y = 0, rowMaxH = 0;
  const out: GridItem[] = [];
  for (const w of widgets) {
    const meta = widgetByType(w.widget_type);
    const ww = Math.min(meta?.defaultSize.w ?? 6, cols);
    const hh = meta?.defaultSize.h ?? 4;
    if (x + ww > cols) { x = 0; y += rowMaxH; rowMaxH = 0; }
    out.push({ i: w.id, x, y, w: ww, h: hh });
    x += ww;
    rowMaxH = Math.max(rowMaxH, hh);
  }
  return out;
}

const baseBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)' };
const primaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--primary)', color: '#fff', border: 'none' };
const secondaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s3)', color: 'var(--text)' };
const activeBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s3)', color: 'var(--primary)', borderColor: 'var(--primary)' };
