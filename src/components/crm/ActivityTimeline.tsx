'use client';
import type { Activity } from '../../types/crm';
import { formatDistanceToNow } from 'date-fns';

const ICONS: Record<string, string> = { call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝' };

export default function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (!activities.length) return <div style={{ color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>No activities yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {activities.map((a) => (
        <div key={a.id} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 18 }}>{ICONS[a.type] || '•'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{a.subject || a.type}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {a.due_at && (() => { try { return formatDistanceToNow(new Date(a.due_at), { addSuffix: true }); } catch { return ''; } })()}
              </div>
            </div>
            {a.body && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{a.body}</div>}
            {a.owner_name && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>by {a.owner_name}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
