'use client';
/**
 * Renders widgets the user has pinned from the Lead Analytics page. Compact;
 * drag/resize disabled here — users go to /dashboard/crm/leads/analytics for
 * the full customiser. Renders nothing when nothing's pinned, so it's safe
 * to drop into any CRM dashboard layout without empty boxes.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Sparkles } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import AnalyticsWidget from './AnalyticsWidget';
import { crmDashboardLayouts, type DashboardConfig, type WidgetInstance } from '../../../lib/crmAnalyticsExtApi';
import { toast } from 'sonner';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function PinnedAnalyticsSection() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    crmDashboardLayouts.get('overview')
      .then(r => setConfig(r.data ?? { widgets: [], layouts: {} }))
      .catch(() => setConfig({ widgets: [], layouts: {} }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !config || config.widgets.length === 0) return null;

  const unpin = async (widget_id: string) => {
    try {
      const next = await crmDashboardLayouts.removeWidget('overview', widget_id);
      setConfig(next.data);
      toast.success('Widget removed from Overview');
    } catch {
      toast.error('Failed to remove widget');
    }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Sparkles size={16} style={{ color: 'var(--primary)' }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pinned Analytics</div>
        <Link href="/dashboard/crm/leads/analytics" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
          Open Lead Analytics →
        </Link>
      </div>
      <ResponsiveGridLayout
        className="layout"
        layouts={{
          lg: config.layouts.lg ?? defaultLayout(config.widgets, 12),
          md: config.layouts.md ?? defaultLayout(config.widgets, 8),
          sm: config.layouts.sm ?? defaultLayout(config.widgets, 2),
        }}
        breakpoints={{ lg: 1200, md: 768, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 2 }}
        rowHeight={60}
        margin={[14, 14]}
        containerPadding={[0, 0]}
        isDraggable={false}
        isResizable={false}
      >
        {config.widgets.map(w => (
          <div key={w.id}>
            <AnalyticsWidget widget={w} onRemove={unpin} pinned />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}

function defaultLayout(widgets: WidgetInstance[], cols: number) {
  let x = 0, y = 0;
  return widgets.map(w => {
    const cellW = Math.min(6, cols);
    const item = { i: w.id, x, y, w: cellW, h: 4 };
    x += cellW;
    if (x >= cols) { x = 0; y += 4; }
    return item;
  });
}
