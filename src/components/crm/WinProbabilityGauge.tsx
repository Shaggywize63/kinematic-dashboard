'use client';
import AiBadge from './shared/AiBadge';

export default function WinProbabilityGauge({ probability, confidence, drivers, ai }: { probability: number; confidence?: number; drivers?: Array<{ name: string; impact: number; direction: 'positive' | 'negative' }>; ai?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(probability * 100)));
  const color = pct >= 70 ? '#28B463' : pct >= 40 ? '#F7B538' : '#E01E2C';
  const r = 50; const C = 2 * Math.PI * r; const dash = (pct / 100) * C;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Win Probability</div>
        {ai && <AiBadge />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} stroke="var(--s3)" strokeWidth="10" fill="none" />
          <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none" strokeDasharray={`${dash} ${C}`} strokeLinecap="round" transform="rotate(-90 60 60)" />
          <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">{pct}%</text>
        </svg>
        <div style={{ flex: 1 }}>
          {confidence != null && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Confidence: {Math.round(confidence * 100)}%</div>}
          {drivers && drivers.slice(0, 4).map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text)', marginBottom: 4 }}>
              <span>{d.name}</span>
              <span style={{ color: d.direction === 'positive' ? '#28B463' : '#E01E2C' }}>{d.direction === 'positive' ? '+' : ''}{Math.round(d.impact * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
