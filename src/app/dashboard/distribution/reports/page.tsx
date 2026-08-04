'use client';
import { Card, PageHeader } from '../../../../components/distribution/Atoms';

interface Tile { href: string; label: string; sub: string; icon: string; }
const TILES: Tile[] = [
  { href: '/dashboard/distribution/reports/godown',  label: 'Default Godown Report', sub: 'Add date · received · issued · balance', icon: '📦' },
  { href: '/dashboard/distribution/reports/targets', label: 'Quarterly Sales Targets', sub: 'Shop × SKU · target vs achievement', icon: '🎯' },
  { href: '/dashboard/distribution/reports/dsr',     label: 'Daily Salesman Challan', sub: 'Beat sales · van stock · collection', icon: '🧾' },
];

export default function DistributionReports() {
  return (
    <div>
      <PageHeader title="Distribution Reports" subtitle="Godown movement, quarterly targets and daily beat sales." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {TILES.map((t) => (
          <a key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
            <Card style={{ transition: 'border-color .15s' }}>
              <div style={{ fontSize: 28 }}>{t.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', marginTop: 8 }}>{t.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{t.sub}</div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
