'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crmActivities } from '../../lib/crmApi';
import type { Activity } from '../../types/crm';
import { ActivityTypeIcon } from './shared/ActivityTypeIcon';

// Bell-icon dropdown that surfaces upcoming + overdue CRM activities. Reads
// crm_activities via the calendar endpoint with a ±7-day window and filters
// to anything that's not yet completed. Counts overdue items in a red badge
// so reps see them first.

// WhatsApp lives outside this table — rendered via the shared
// <ActivityTypeIcon> SVG so the brand mark shows up instead of a generic
// green emoji. Everything else stays emoji-cheap.
const TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬',
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
  const [clearing, setClearing] = useState(false);
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

  // Single load on mount so the badge count is accurate, then poll only while
  // the dropdown is open AND the tab is visible. Was: 60s setInterval running
  // forever per page mount = ~1440 wasted reqs/user/day.
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!open) return;
    load(); // refresh immediately on open
    let t: number | null = null;
    const start = () => {
      if (t == null) t = window.setInterval(load, 60_000);
    };
    const stop = () => {
      if (t != null) { window.clearInterval(t); t = null; }
    };
    if (document.visibilityState === 'visible') start();
    const onVis = () => { document.visibilityState === 'visible' ? start() : stop(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [open]);

  const sorted = useMemo(() => {
    return [...activities].sort((a: any, b: any) => {
      const da = new Date(a.due_at).getTime();
      const db = new Date(b.due_at).getTime();
      return da - db;
    });
  }, [activities]);

  const overdueCount = sorted.filter((a: any) => new Date(a.due_at).getTime() < Date.now()).length;

  // "Clearing" a reminder means marking its activity completed — the bell
  // filters out anything with completed_at, so it disappears from the list
  // without destroying the underlying CRM activity.
  const dismissOne = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActivities((prev) => prev.filter((a) => a.id !== id));
    try { await crmActivities.update(id, { completed_at: new Date().toISOString() } as any); }
    catch { load(); }
  };

  const clearAll = async () => {
    if (sorted.length === 0 || clearing) return;
    setClearing(true);
    const ids = sorted.map((a: any) => a.id);
    setActivities([]);
    const now = new Date().toISOString();
    try {
      await Promise.allSettled(ids.map((id) => crmActivities.update(id, { completed_at: now } as any)));
    } finally {
      setClearing(false);
      load();
    }
  };

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
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--text)' }}>Activity reminders</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {overdueCount > 0 ? `${overdueCount} overdue · ` : ''}{sorted.length} total
              </span>
              {sorted.length > 0 && (
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  title="Mark all reminders as done"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: '#E01E2C', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, cursor: clearing ? 'wait' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.3 }}
                >
                  {clearing ? 'Clearing…' : 'Clear all'}
                </button>
              )}
            </div>
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
              <div key={a.id} style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
                <Link href={href} onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 32px 10px 14px', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                      <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                        <ActivityTypeIcon
                          type={a.type}
                          size={16}
                          date={a.due_at || a.completed_at}
                          completed={!!a.completed_at}
                        />
                      </span>
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
                <button
                  onClick={(e) => dismissOne(a.id, e)}
                  title="Dismiss"
                  aria-label="Dismiss reminder"
                  style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4, borderRadius: 4 }}
                >
                  ×
                </button>
              </div>
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
