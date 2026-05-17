'use client';
import FfmAnalyticsSection from '../../../components/ffm/analytics/FfmAnalyticsSection';

export default function FfmAnalyticsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Field Force Analytics</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          Customisable widget grid for beat coverage, productivity, discipline, risk, and growth metrics.
        </p>
      </div>
      <FfmAnalyticsSection />
    </div>
  );
}
