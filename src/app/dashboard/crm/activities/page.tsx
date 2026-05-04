'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmActivities } from '../../../../lib/crmApi';
import type { Activity } from '../../../../types/crm';
import ActivityTimeline from '../../../../components/crm/ActivityTimeline';

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await crmActivities.list(); setActivities(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = type ? activities.filter((a) => a.type === type) : activities;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          <option value="">All Activities</option>
          <option value="call">Calls</option>
          <option value="email">Emails</option>
          <option value="meeting">Meetings</option>
          <option value="task">Tasks</option>
          <option value="note">Notes</option>
        </select>
        <Link href="/dashboard/crm/activities/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ Log Activity</Link>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <ActivityTimeline activities={filtered} />}
    </div>
  );
}
