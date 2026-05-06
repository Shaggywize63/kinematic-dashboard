'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Tasks were previously a separate page that talked to the same crm_activities
// table the Activities page uses. They've been merged — Tasks are now just
// activities of type='task'. Anything that hits this URL bounces to the
// unified Activities view with the task filter pre-applied.
export default function TasksRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/crm/activities?type=task');
  }, [router]);
  return (
    <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Redirecting to Activities…</div>
  );
}
