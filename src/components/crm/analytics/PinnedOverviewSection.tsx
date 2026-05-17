'use client';
/**
 * Pinned analytics widgets on the CRM Overview.
 *
 * Reads the per-user 'overview' layout from the dashboard-layouts API and
 * renders any widgets the user pinned from /dashboard/crm/leads/analytics.
 * Renders nothing when no widgets are pinned, so the existing Overview
 * stat cards + fixed charts are visually untouched until the user opts in.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Pin } from 'lucide-react';
import AnalyticsWidget from './AnalyticsWidget';
import { crmDashboardLayouts, type DashboardConfig } from '../../../lib/crmAnalyticsExtApi';

export default function PinnedOverviewSection() {
  const [config, setConfig] = useState<DashboardConfig>({ widgets: [], layouts: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    crmDashboardLayouts.get('overview')
      .then((r) => {
        if (cancelled) return;
        const cfg = r?.data ?? { widgets: [], layouts: {} };
        setConfig({
          widgets: Array.isArray(cfg.widgets) ? cfg.widgets : [],
          layouts: cfg.layouts && typeof cfg.layouts === 'object' ? cfg.layouts : {},
        });
      })
      .catch(() => {
        // Quietly fall back to empty — a backend hiccup shouldn't make the
        // CRM Overview render a scary banner. The Lead Analytics page has
        // its own visible error surface for diagnosing.
        if (!cancelled) setConfig({ widgets: [], layouts: {} });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onRemove = async (id: string) => {
    try {
      const r = await crmDashboardLayouts.removeWidget('overview', id);
      const next = r?.data ?? { widgets: [], layouts: {} };
      setConfig({
        widgets: Array.isArray(next.widgets) ? next.widgets : [],
        layouts: next.layouts && typeof next.layouts === 'object' ? next.layouts : {},
      });
      toast.success('Unpinned from Overview');
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'unknown error';
      toast.error(`Failed to unpin: ${msg.slice(0, 120)}`);
    }
  };

  if (loading || !config.widgets.length) return null;

  return (
    <div style={section}>
      <div style={head}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pin size={14} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={kicker}>Pinned</div>
            <div style={title}>Your analytics</div>
          </div>
        </div>
        <Link href="/dashboard/crm/leads/analytics" style={link}>
          Manage in Lead Analytics →
        </Link>
      </div>
      <div style={grid}>
        {config.widgets.map((w) => (
          <div key={w.id} style={tile}>
            <AnalyticsWidget widget={w} onRemove={onRemove} pinned />
          </div>
        ))}
      </div>
    </div>
  );
}

const section: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const head: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' };
const kicker: React.CSSProperties = { fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text)' };
const link: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 };
const tile: React.CSSProperties = { height: 300 };
