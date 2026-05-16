'use client';
/**
 * Lead Analytics page — customisable widget grid powered by react-grid-layout.
 *
 * - "Edit layout" toggle puts the grid in drag/resize mode.
 * - "+ Add widget" opens a modal listing the 15-widget catalog.
 * - Each widget surfaces a per-tile menu: chart-type switcher,
 *   "Pin to CRM Overview", and remove.
 * - Layout is persisted per-user under (org_id, page='analytics') on every
 *   change (debounced 800ms) so refresh restores the exact state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';
import { Plus, Edit3, Save, X, BarChart3, LineChart as LineIcon, PieChart, Layers, Activity, Map, Users } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import AnalyticsWidget from '../../../../../components/crm/analytics/AnalyticsWidget';
import { WIDGET_CATALOG, widgetByType, type WidgetMeta, type ChartType } from '../../../../../lib/crm/widgetCatalog';
import { crmDashboardLayouts, type DashboardConfig, type WidgetInstance, type GridItem } from '../../../../../lib/crmAnalyticsExtApi';
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

export default function LeadAnalyticsPage() {
  const [config, setConfig] = useState<DashboardConfig>({ widgets: [], layouts: {} });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load layout on mount
  useEffect(() => {
    crmDashboardLayouts.get('analytics')
      .then(r => setConfig(r.data ?? { widgets: [], layouts: {} }))
      .catch(() => setConfig({ widgets: [], layouts: {} }))
      .finally(() => setLoading(false));
  }, []);

  // Debounced save when layout / widgets change (after initial load)
  useEffect(() => {
    if (loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      crmDashboardLayouts.save('analytics', config).catch(() => {
        toast.error('Failed to save layout');
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

  // ── Mutations ─────────────────────────────────────────────

  const addWidget = (meta: WidgetMeta) => {
    const newWidget: WidgetInstance = {
      id: cryptoRandomId(),
      widget_type: meta.type,
      chart_type: meta.defaultChart,
    };
    setConfig(c => {
      const widgets = [...c.widgets, newWidget];
      const layouts = { ...c.layouts };
      for (const bp of ['lg', 'md', 'sm'] as const) {
        const cols = COLS[bp];
        const prev = layouts[bp] ?? [];
        const maxY = prev.reduce((m, it) => Math.max(m, it.y + it.h), 0);
        const w = Math.min(meta.defaultSize.w, cols);
        const h = meta.defaultSize.h;
        prev.push({ i: newWidget.id, x: 0, y: maxY, w, h });
        layouts[bp] = prev;
      }
      return { widgets, layouts };
    });
    setAdding(false);
    toast.success(`Added ${meta.title}`);
  };

  const removeWidget = (id: string) => {
    setConfig(c => ({
      widgets: c.widgets.filter(w => w.id !== id),
      layouts: {
        lg: (c.layouts.lg ?? []).filter(it => it.i !== id),
        md: (c.layouts.md ?? []).filter(it => it.i !== id),
        sm: (c.layouts.sm ?? []).filter(it => it.i !== id),
      },
    }));
    toast.success('Widget removed');
  };

  const changeChartType = (id: string, chart_type: ChartType) => {
    setConfig(c => ({
      ...c,
      widgets: c.widgets.map(w => w.id === id ? { ...w, chart_type } : w),
    }));
  };

  const pinToOverview = async (widget: WidgetInstance) => {
    try {
      await crmDashboardLayouts.pinToOverview(widget);
      toast.success('Pinned to CRM Overview');
    } catch (e) {
      toast.error('Failed to pin widget');
    }
  };

  const onLayoutChange = (_: Layout[], allLayouts: Layouts) => {
    setConfig(c => ({ ...c, layouts: allLayouts as DashboardConfig['layouts'] }));
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, color: 'var(--text-dim)' }}>Loading analytics…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Lead Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0' }}>
            Drag, resize, and pin charts to build a dashboard that fits your workflow.
          </p>
        </div>
        <button onClick={() => setAdding(true)} style={primaryBtn}>
          <Plus size={14} /> Add widget
        </button>
        <button onClick={() => setEditing(e => !e)} style={editing ? activeBtn : secondaryBtn}>
          {editing ? <><Save size={14} /> Done editing</> : <><Edit3 size={14} /> Edit layout</>}
        </button>
      </div>

      {/* Empty state */}
      {!config.widgets.length && (
        <div style={{
          padding: 60, textAlign: 'center', background: 'var(--s2)', border: '1px dashed var(--border)',
          borderRadius: 14, color: 'var(--text-dim)',
        }}>
          <BarChart3 size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Build your analytics dashboard</div>
          <div style={{ fontSize: 13, margin: '8px 0 18px' }}>
            Pick from 15 lead-management widgets — conversion, velocity, engagement, risk, and more.
          </div>
          <button onClick={() => setAdding(true)} style={{ ...primaryBtn, margin: '0 auto' }}>
            <Plus size={14} /> Add your first widget
          </button>
        </div>
      )}

      {/* Grid */}
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
          {config.widgets.map(w => (
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
              <AnalyticsWidget
                widget={w}
                isEditing={editing}
                onRemove={removeWidget}
                onChangeChartType={changeChartType}
                onPinToOverview={pinToOverview}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {/* Add widget dialog */}
      {adding && <AddWidgetDialog onPick={addWidget} onClose={() => setAdding(false)} existing={config.widgets} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Add Widget dialog
// ─────────────────────────────────────────────────────────────────
function AddWidgetDialog({ onPick, onClose, existing }: { onPick: (w: WidgetMeta) => void; onClose: () => void; existing: WidgetInstance[] }) {
  const existingTypes = new Set(existing.map(w => w.widget_type));
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
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Add widget</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Pick any widget — already-added ones show "Added".
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
                  {widgets.map(w => {
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
                          padding: 12,
                          borderRadius: 10,
                          cursor: already ? 'default' : 'pointer',
                          color: 'var(--text)',
                          opacity: already ? 0.5 : 1,
                          transition: 'transform .1s, border-color .1s',
                        }}
                        onMouseEnter={e => { if (!already) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'w_' + Math.random().toString(36).slice(2, 11);
}

/**
 * Fallback grid layout when the user hasn't saved one yet. Auto-flows
 * widgets left-to-right at their default size, wrapping when a row fills.
 */
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

const baseBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13,
  fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
};
const primaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--primary)', color: '#fff', border: 'none' };
const secondaryBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s2)', color: 'var(--text)' };
const activeBtn: React.CSSProperties = { ...baseBtn, background: 'var(--s3)', color: 'var(--primary)', borderColor: 'var(--primary)' };
