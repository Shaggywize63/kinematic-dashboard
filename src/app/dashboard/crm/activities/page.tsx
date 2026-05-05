'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmActivities } from '../../../../lib/crmApi';
import type { Activity } from '../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../lib/auth';

const TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬', whatsapp: '💚',
};

const TYPE_OPTIONS = ['', 'call', 'email', 'meeting', 'task', 'note', 'sms', 'whatsapp'];

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);

    (async () => {
      try {
        const r = await crmActivities.list();
        setActivities(r.data || []);
      } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = type ? activities.filter((a) => a.type === type) : activities;

  const overdue = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) < new Date());
  const upcoming = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) >= new Date());
  const completed = filtered.filter((a) => !!a.completed_at);

  return (
    <div>
      {/* Admin summary */}
      {isAdmin && activities.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: filtered.length, color: 'var(--primary)' },
            { label: 'Overdue', value: overdue.length, color: '#ef4444' },
            { label: 'Upcoming', value: upcoming.length, color: '#f59e0b' },
            { label: 'Completed', value: completed.length, color: '#10b981' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', minWidth: 80, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t ? `${TYPE_ICONS[t] || ''} ${t[0].toUpperCase() + t.slice(1)}s` : 'All Activities'}</option>
            ))}
          </select>
          {isAdmin && (
            <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--s3)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
              Admin — org-wide view
            </span>
          )}
        </div>
        <Link href="/dashboard/crm/activities/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ Log Activity</Link>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          No activities found. <Link href="/dashboard/crm/activities/new" style={{ color: 'var(--primary)' }}>Log one now →</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((a) => {
            const isOverdue = a.due_at && !a.completed_at && new Date(a.due_at) < new Date();
            const linkedEntity = a.lead_id ? `Lead` : a.contact_id ? `Contact` : a.deal_id ? `Deal` : a.account_id ? `Account` : null;
            const linkedId = a.lead_id || a.contact_id || a.deal_id || a.account_id;

            return (
              <div key={a.id} style={{
                background: 'var(--s2)', border: `1px solid ${isOverdue ? '#ef4444' : 'var(--border)'}`,
                borderRadius: 10, padding: '12px 14px',
                borderLeft: `4px solid ${isOverdue ? '#ef4444' : a.completed_at ? '#10b981' : 'var(--primary)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{TYPE_ICONS[a.type] || '📌'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                        {a.subject || a.type}
                      </div>
                      {(a.body || a.description) && (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, maxWidth: 500 }}>
                          {(a.body || a.description || '').slice(0, 120)}{(a.body || a.description || '').length > 120 ? '…' : ''}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text-dim)' }}>{a.type}</span>
                        {a.due_at && (
                          <span style={{ fontSize: 11, color: isOverdue ? '#ef4444' : 'var(--text-dim)' }}>
                            {isOverdue ? '⚠ Overdue · ' : ''}
                            {a.completed_at ? 'Completed' : 'Due'}: {new Date(a.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {a.completed_at && (
                          <span style={{ fontSize: 11, color: '#10b981' }}>✓ Done</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                    {(a as any).assigned_to_name || a.owner_name ? (
                      <span>👤 {(a as any).assigned_to_name || a.owner_name}</span>
                    ) : null}
                    {linkedEntity && linkedId && (
                      <span>🔗 {linkedEntity}</span>
                    )}
                    <span>{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
