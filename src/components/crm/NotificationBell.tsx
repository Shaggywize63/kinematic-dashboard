'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';
import { crmActivities } from '../../lib/crmApi';
import type { Activity } from '../../types/crm';
import { ActivityTypeIcon } from './shared/ActivityTypeIcon';

// Bell-icon dropdown. Surfaces TWO sources so the web matches the mobile
// notification centre:
//   1. The personal notification feed (`/api/v1/notifications`) — stagnant
//      leads, deals closing, tasks overdue, lead assignments, admin
//      broadcasts. This is the "agreed set" that previously only showed on
//      mobile; the web bell used to ignore it entirely.
//   2. Upcoming + overdue CRM activity reminders (calendar, ±7 days).
// Both are merged into one time-sorted list, with unread feed items and
// overdue reminders driving the red badge.

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

// "5m ago" / "2h ago" / "3d ago" for the feed items (which carry a created_at
// in the past rather than a future due date).
function fmtAgo(iso?: string | null): string {
  if (!iso) return '';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  return `${Math.round(diffMin / (60 * 24))}d ago`;
}

interface FeedNotif {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  priority?: string;
  is_read?: boolean;
  created_at?: string;
  data?: Record<string, unknown> | null;
}

// Icon per backend notification type — keeps parity with the mobile feed's
// type glyphs. Falls back to a bell for unknown kinds.
function notifEmoji(type?: string): string {
  switch ((type || '').toLowerCase()) {
    case 'lead_stagnant': case 'lead_at_risk': return '⏳';
    case 'deal_closing': case 'deal_won': return '💰';
    case 'task_overdue': case 'task_due': return '✅';
    case 'lead_assigned': case 'assignment': return '🎯';
    case 'broadcast': case 'announcement': return '📢';
    default: return '🔔';
  }
}

// Deep-link target from a feed item's data payload (lead/deal aware), mirroring
// how the mobile feed routes a tapped notification.
function notifHref(n: FeedNotif): string {
  const d = n.data || {};
  const leadId = (d.lead_id || d.leadId) as string | undefined;
  const dealId = (d.deal_id || d.dealId) as string | undefined;
  if (leadId) return `/dashboard/crm/leads/${leadId}`;
  if (dealId) return `/dashboard/crm/deals/${dealId}`;
  return '/dashboard/notifications';
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notifs, setNotifs] = useState<FeedNotif[]>([]);
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
      const [aRes, nRes] = await Promise.allSettled([
        crmActivities.calendar({ from, to }),
        api.get<{ data?: FeedNotif[] } | FeedNotif[]>('/api/v1/notifications?limit=30'),
      ]);

      if (aRes.status === 'fulfilled') {
        const list = aRes.value.data || [];
        // Anything still actionable: not completed and has a due date.
        setActivities(list.filter((a: any) => !a.completed_at && a.due_at));
      } else {
        setActivities([]);
      }

      if (nRes.status === 'fulfilled') {
        const raw: any = nRes.value;
        const list: FeedNotif[] = Array.isArray(raw) ? raw : (raw?.data || []);
        setNotifs(Array.isArray(list) ? list : []);
      } else {
        setNotifs([]);
      }
    } finally { setLoading(false); }
  };

  // Single load on mount so the badge count is accurate, then poll only while
  // the dropdown is open AND the tab is visible.
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

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a: any, b: any) => {
      const da = new Date(a.due_at).getTime();
      const db = new Date(b.due_at).getTime();
      return da - db;
    });
  }, [activities]);

  const sortedNotifs = useMemo(() => {
    return [...notifs].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da; // newest first
    });
  }, [notifs]);

  const overdueCount = sortedActivities.filter((a: any) => new Date(a.due_at).getTime() < Date.now()).length;
  const unreadCount = sortedNotifs.filter((n) => !n.is_read).length;
  // Badge: unread feed items + actionable reminders. Red when something needs
  // attention now (an overdue reminder or any unread feed item).
  const badgeCount = unreadCount + sortedActivities.length;
  const badgeRed = overdueCount > 0 || unreadCount > 0;

  // Mark a single feed item read locally + server-side; never blocks the
  // navigation that triggered it.
  const markNotifRead = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    api.patch(`/api/v1/notifications/${id}/read`, {}).catch(() => {});
  };

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
    if (clearing) return;
    setClearing(true);
    const ids = sortedActivities.map((a: any) => a.id);
    setActivities([]);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const now = new Date().toISOString();
    try {
      await Promise.allSettled([
        ...ids.map((id) => crmActivities.update(id, { completed_at: now } as any)),
        api.markNotificationsRead(),
      ]);
    } finally {
      setClearing(false);
      load();
    }
  };

  const totalItems = sortedNotifs.length + sortedActivities.length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        style={{ position: 'relative', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999,
            background: badgeRed ? '#E01E2C' : '#3E9EFF',
            color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{badgeCount}</span>
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
            <strong style={{ fontSize: 13, color: 'var(--text)' }}>Notifications</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {unreadCount > 0 ? `${unreadCount} unread · ` : ''}{overdueCount > 0 ? `${overdueCount} overdue · ` : ''}{totalItems} total
              </span>
              {totalItems > 0 && (
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  title="Mark everything as read / done"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: '#E01E2C', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, cursor: clearing ? 'wait' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.3 }}
                >
                  {clearing ? 'Clearing…' : 'Clear all'}
                </button>
              )}
            </div>
          </div>

          {loading && totalItems === 0 && (
            <div style={{ padding: 18, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>Loading…</div>
          )}
          {!loading && totalItems === 0 && (
            <div style={{ padding: 18, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>You&apos;re all caught up. 🎉</div>
          )}

          {/* Personal feed (stagnant leads, deals closing, assignments, broadcasts…) */}
          {sortedNotifs.map((n) => {
            const href = notifHref(n);
            return (
              <div key={`n-${n.id}`} style={{ position: 'relative', borderBottom: '1px solid var(--border)', background: n.is_read ? 'transparent' : 'rgba(62,158,255,0.06)' }}>
                <Link href={href} onClick={() => { markNotifRead(n.id); setOpen(false); }} style={{ display: 'block', padding: '10px 14px', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: n.is_read ? 600 : 800 }}>
                      <span style={{ marginRight: 6 }}>{notifEmoji(n.type)}</span>
                      {n.title || 'Notification'}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {fmtAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
                  )}
                </Link>
              </div>
            );
          })}

          {/* Activity reminders header — only when there are reminders to show
              alongside the feed, so the two sources stay distinguishable. */}
          {sortedActivities.length > 0 && sortedNotifs.length > 0 && (
            <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Activity reminders
            </div>
          )}

          {sortedActivities.map((a: any) => {
            const r = fmtRelative(a.due_at);
            const href = a.lead_id ? `/dashboard/crm/leads/${a.lead_id}` : a.deal_id ? `/dashboard/crm/deals/${a.deal_id}` : '/dashboard/crm/activities';
            return (
              <div key={`a-${a.id}`} style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
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
