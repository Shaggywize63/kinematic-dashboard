'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crmActivities } from '../../lib/crmApi';
import type { Activity } from '../../types/crm';

// Bell-icon dropdown that surfaces upcoming + overdue CRM activities. Reads
// crm_activities via the calendar endpoint with a ±7-day window and filters
// to anything that's not yet completed. Counts overdue items in a red badge
// so reps see them first.

const TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬', whatsapp: '💚',
};

function fmtRelative(due?: string | null): { label: string; overdue: boolean } {
  if (!due) return { label: 'No due date', overdue: false };
  const d = new Date(due).getTime();
  const now = Date.now();
  const diffMin = Math.round((d - now) / 60000);
  if (diffMin < -60 * 24) return { label: `${Math.round(-diffMin / (60 * 24))}d overdue`, overdue: true };
  if (diffMin < -60) return { label: `${Math.round(-diffMin / 60)}h overdue`, overdue: true };
  if (diffMin < 0) return { label: `${-diffMin}m overdue`, overdue: true };
  if (diffMin < 60) return { label: `in ${diffMin}m`, overdue: false };
  if (diffMin < 60 * 24) return { label: `in ${Math.round(diffMin / 60)}h`, overdue: false };
  return { label: `in ${Math.round(diffMin / (60 * 24))}d`, overdue: false };
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const to = new Date(Date.now() + 7 * 86400000).toISOString();
      const r = await crmActivities.calendar({ from, to });
      const list = r.data || [];
      // Anything still actionable: not completed and has a due date.
      setActivities(list.filter((a: any) => !a.completed_at && a.due_at));
    } catch {
      setActivities([]);
    } finally { setLoading(false); }
  };

  // Initial load + 60s refresh while mounted, so the badge stays roughly fresh.
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Refresh on open in case it's been > 60s since last poll.
  useEffect(() => {
    if (open) load();
  }, [open]);

  const sorted = useMemo(() => {
    return [...activities].sort((a: any, b: any) => {
      const da = new Date(a.due_at).getTime();
      const db = new Date(b.due_at).getTime();
      return da - db;
    });
  }, [activities]);

  const overdueCount = sorted.filter((a: any) => new Date(a.due_at).getTime() < Date.now()).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Activity reminders"
        aria-label="Activity reminders"
        style={{ position: 'relative', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {sorted.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999,
            background: overdueCount > 0 ? '#E01E2C' : '#3E9EFF',
            color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{sorted.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 360, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45)', zIndex: 1000,
          maxHeight: 480, overflowY: 'auto',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13, color: 'var(--text)' }}>Activity reminders</strong>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {overdueCount > 0 ? `${overdueCount} overdue · ` : ''}{sorted.length} total
            </span>
          </div>
          {loading && sorted.length === 0 && (
            <div style={{ padding: 18, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>Loading…</div>
          )}
          {!loading && sorted.length === 0 && (
            <div style={{ padding: 18, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No reminders in the next 7 days. 🎉</div>
          )}
          {sorted.map((a: any) => {
            const r = fmtRelative(a.due_at);
            const href = a.lead_id ? `/dashboard/crm/leads/${a.lead_id}` : a.deal_id ? `/dashboard/crm/deals/${a.deal_id}` : '/dashboard/crm/activities';
            return (
              <Link key={a.id} href={href} onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                    <span style={{ marginRight: 6 }}>{TYPE_ICONS[a.type] || '•'}</span>
                    {a.subject || a.type}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.overdue ? '#E01E2C' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </span>
                </div>
                {a.body && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.body}</div>
                )}
              </Link>
            );
          })}
          <Link href="/dashboard/crm/activities?status=open" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 14px', textAlign: 'center', fontSize: 12, color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
            See all activities →
          </Link>
        </div>
      )}
    </div>
  );
}
