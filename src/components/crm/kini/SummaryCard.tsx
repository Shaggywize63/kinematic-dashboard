'use client';

export default function SummaryCard({ title, summary, highlights }: { title?: string; summary?: string; highlights?: string[] }) {
  return (
    <div style={{ background: 'rgba(123,97,255,0.08)', border: '1px solid rgba(123,97,255,0.3)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      {title && <div style={{ fontSize: 11, color: '#7B61FF', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>}
      {summary && <div style={{ fontSize: 12, color: '#E8EDF8', lineHeight: 1.5, marginBottom: 8 }}>{summary}</div>}
      {highlights && highlights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {highlights.map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: '#aab', display: 'flex', gap: 6 }}>
              <span style={{ color: '#7B61FF' }}>•</span>
              <span>{h}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
