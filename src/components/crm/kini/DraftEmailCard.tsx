'use client';

export default function DraftEmailCard({ subject, body }: { subject?: string; body?: string }) {
  return (
    <div style={{ background: 'rgba(0,180,216,0.08)', border: '1px solid rgba(0,180,216,0.3)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 11, color: '#00B4D8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>Drafted Email</div>
      <div style={{ fontWeight: 700, color: '#E8EDF8', marginBottom: 6, fontSize: 13 }}>{subject || '(no subject)'}</div>
      <div style={{ fontSize: 12, color: '#aab', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{body}</div>
    </div>
  );
}
