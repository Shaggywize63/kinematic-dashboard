'use client';

export default function IntegrationsPage() {
  const items = [
    { name: 'Email (SMTP / SES)', status: 'Configure via env vars on the API server.' },
    { name: 'Calendar (Google / Outlook)', status: 'OAuth flow available via API — UI coming soon.' },
    { name: 'Webhooks', status: 'Subscribe to lead/deal/activity events via /api/v1/crm/webhooks.' },
    { name: 'Slack notifications', status: 'Use automations to post to Slack channels.' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {items.map((i) => (
        <div key={i.name} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{i.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{i.status}</div>
        </div>
      ))}
    </div>
  );
}
