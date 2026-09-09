'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell, BellOff, BellRing, CalendarClock, Check, CheckCheck, ClipboardCheck, Hourglass,
  Inbox as InboxIcon, Megaphone, Radio, Trophy, UserPlus,
} from 'lucide-react';
import api from '../../../lib/api';
import { crmActivities } from '../../../lib/crmApi';
import type { Activity } from '../../../types/crm';
import { useClient } from '../../../context/ClientContext';
import { usePageTitle } from '../../../lib/pageTitle';
import { enableBrowserPush, disableBrowserPush, currentSubscription, pushPermission, pushSupported } from '../../../lib/webPush';
import { Badge, Button, Card, EmptyState, Eyebrow, PageHeader, Segmented, T, useIsCompact } from '../../../components/ui';
import BroadcastPanel from './BroadcastPanel';

/**
 * Inbox — the personal notification feed (stagnant leads, deals closing,
 * assignments, admin broadcasts) merged with upcoming / overdue activity
 * reminders, the same two sources the header bell shows. Filters on the
 * left, rows grouped by day on the right. The admin broadcast composer
 * that used to be this whole page lives on the "Broadcasts" tab.
 */

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

type Kind = 'assignment' | 'deal' | 'risk' | 'task' | 'broadcast' | 'other' | 'reminder';

interface Row {
  key: string;
  kind: Kind;
  title: string;
  body?: string;
  at: string;           // ISO — created_at for feed items, due_at for reminders
  unread: boolean;
  overdue?: boolean;
  href: string;
  notifId?: string;     // feed item → mark read
  activityId?: string;  // reminder → mark done
}

function kindOf(type?: string): Kind {
  switch ((type || '').toLowerCase()) {
    case 'lead_assigned': case 'assignment': return 'assignment';
    case 'deal_closing': case 'deal_won': return 'deal';
    case 'lead_stagnant': case 'lead_at_risk': return 'risk';
    case 'task_overdue': case 'task_due': return 'task';
    case 'broadcast': case 'announcement': return 'broadcast';
    default: return 'other';
  }
}

const KIND_META: Record<Kind, { label: string; icon: React.ReactNode; tone: 'info' | 'ok' | 'warn' | 'red' | 'neutral' }> = {
  assignment: { label: 'Assignments', icon: <UserPlus size={16} strokeWidth={1.6} />, tone: 'info' },
  deal: { label: 'Deals', icon: <Trophy size={16} strokeWidth={1.6} />, tone: 'ok' },
  risk: { label: 'Leads at risk', icon: <Hourglass size={16} strokeWidth={1.6} />, tone: 'warn' },
  task: { label: 'Tasks', icon: <ClipboardCheck size={16} strokeWidth={1.6} />, tone: 'red' },
  reminder: { label: 'Reminders', icon: <CalendarClock size={16} strokeWidth={1.6} />, tone: 'warn' },
  broadcast: { label: 'Broadcasts', icon: <Megaphone size={16} strokeWidth={1.6} />, tone: 'neutral' },
  other: { label: 'Other', icon: <Bell size={16} strokeWidth={1.6} />, tone: 'neutral' },
};

const TONE_BG: Record<string, string> = { info: T.infoWash, ok: T.okWash, warn: T.warnWash, red: T.redWash, neutral: 'var(--s3)' };
const TONE_FG: Record<string, string> = { info: T.info, ok: T.ok, warn: T.warn, red: T.red, neutral: T.dim };

// Deep-link target from a feed item's data payload (lead/deal aware).
function notifHref(n: FeedNotif): string {
  const d = n.data || {};
  const leadId = (d.lead_id || d.leadId) as string | undefined;
  const dealId = (d.deal_id || d.dealId) as string | undefined;
  if (leadId) return `/dashboard/crm/leads/${leadId}`;
  if (dealId) return `/dashboard/crm/deals/${dealId}`;
  return '';
}

function dayBucket(iso: string): 'Today' | 'Yesterday' | 'This week' | 'Earlier' | 'Upcoming' {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday + 86400000) return 'Upcoming';
  if (t >= startToday) return 'Today';
  if (t >= startToday - 86400000) return 'Yesterday';
  if (t >= startToday - 6 * 86400000) return 'This week';
  return 'Earlier';
}

function fmtTime(iso: string, bucket: string): string {
  const d = new Date(iso);
  if (bucket === 'Today' || bucket === 'Yesterday') return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (bucket === 'This week' || bucket === 'Upcoming') return d.toLocaleDateString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const BUCKET_ORDER = ['Upcoming', 'Today', 'Yesterday', 'This week', 'Earlier'] as const;

type Filter = 'all' | 'unread' | Kind;

export default function NotificationsPage() {
  usePageTitle('Inbox');
  const router = useRouter();
  const narrow = useIsCompact(960);
  const { selectedClientId } = useClient();
  // Tab lives in the URL (?tab=broadcasts) so the bell / deep links can open
  // either view; read after mount so SSR and the first client paint agree.
  const [tab, setTabState] = useState<'inbox' | 'broadcasts'>('inbox');
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('tab') === 'broadcasts') setTabState('broadcasts'); } catch { /* ignore */ }
  }, []);
  const setTab = (t: 'inbox' | 'broadcasts') => {
    setTabState(t);
    try { window.history.replaceState(null, '', t === 'inbox' ? '/dashboard/notifications' : '/dashboard/notifications?tab=broadcasts'); } catch { /* ignore */ }
  };

  const [notifs, setNotifs] = useState<FeedNotif[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date(Date.now() + 7 * 86400000).toISOString();
    const [nRes, aRes] = await Promise.allSettled([
      api.get<{ data?: FeedNotif[] } | FeedNotif[]>('/api/v1/notifications?limit=100'),
      crmActivities.calendar({ from, to }),
    ]);
    if (nRes.status === 'fulfilled') {
      const raw: any = nRes.value;
      const list: FeedNotif[] = Array.isArray(raw) ? raw : (raw?.data || []);
      setNotifs(Array.isArray(list) ? list : []);
    } else setNotifs([]);
    if (aRes.status === 'fulfilled') {
      const list = aRes.value.data || [];
      setActivities(list.filter((a: any) => !a.completed_at && a.due_at));
    } else setActivities([]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh while the tab is visible (same cadence as the bell).
  useEffect(() => {
    let t: number | null = null;
    const start = () => { if (t == null) t = window.setInterval(load, 60_000); };
    const stop = () => { if (t != null) { window.clearInterval(t); t = null; } };
    if (document.visibilityState === 'visible') start();
    const onVis = () => { document.visibilityState === 'visible' ? start() : stop(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const n of notifs) {
      const at = n.created_at || new Date().toISOString();
      out.push({
        key: `n-${n.id}`, kind: kindOf(n.type), title: n.title || 'Notification', body: n.body || undefined,
        at, unread: !n.is_read, href: notifHref(n), notifId: n.id,
      });
    }
    for (const a of activities as any[]) {
      const overdue = new Date(a.due_at).getTime() < Date.now();
      out.push({
        key: `a-${a.id}`, kind: 'reminder', title: a.subject || a.type || 'Reminder', body: a.body || undefined,
        at: a.due_at, unread: overdue, overdue,
        href: a.lead_id ? `/dashboard/crm/leads/${a.lead_id}` : a.deal_id ? `/dashboard/crm/deals/${a.deal_id}` : '/dashboard/crm/activities',
        activityId: a.id,
      });
    }
    return out.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [notifs, activities]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, unread: rows.filter((r) => r.unread).length };
    for (const r of rows) c[r.kind] = (c[r.kind] || 0) + 1;
    return c;
  }, [rows]);

  const visible = rows.filter((r) => filter === 'all' ? true : filter === 'unread' ? r.unread : r.kind === filter);
  const groups = BUCKET_ORDER.map((b) => ({ label: b, rows: visible.filter((r) => dayBucket(r.at) === b) })).filter((g) => g.rows.length > 0);
  const needYou = rows.filter((r) => r.unread).length;

  const markRead = (r: Row) => {
    if (!r.notifId || !r.unread) return;
    setNotifs((prev) => prev.map((n) => (n.id === r.notifId ? { ...n, is_read: true } : n)));
    api.patch(`/api/v1/notifications/${r.notifId}/read`, {}).catch(() => {});
  };
  const markDone = async (r: Row) => {
    if (!r.activityId) return;
    setActivities((prev) => prev.filter((a) => a.id !== r.activityId));
    try { await crmActivities.update(r.activityId, { completed_at: new Date().toISOString() } as any); }
    catch { load(); }
  };
  const markAllRead = async () => {
    if (busyAll) return;
    setBusyAll(true);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { await api.markNotificationsRead(); } catch { /* the next poll re-syncs */ }
    finally { setBusyAll(false); }
  };

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all || 0 },
    { id: 'unread', label: 'Unread', count: counts.unread || 0 },
    { id: 'reminder', label: 'Reminders', count: counts.reminder || 0 },
    { id: 'assignment', label: 'Assignments', count: counts.assignment || 0 },
    { id: 'task', label: 'Tasks', count: counts.task || 0 },
    { id: 'deal', label: 'Deals', count: counts.deal || 0 },
    { id: 'risk', label: 'Leads at risk', count: counts.risk || 0 },
    { id: 'broadcast', label: 'Broadcasts', count: counts.broadcast || 0 },
  ].filter((f) => f.id === 'all' || f.id === 'unread' || f.count > 0) as Array<{ id: Filter; label: string; count: number }>;

  const scopeLabel = selectedClientId ? 'this client' : 'your workspace';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={tab === 'inbox' ? 'Inbox' : 'Broadcasts'}
        description={tab === 'inbox'
          ? <>Assignments, reminders and updates across {scopeLabel}{needYou > 0 ? <> — <strong style={{ color: T.text, fontWeight: 600 }}>{needYou} need you</strong></> : ' — you’re all caught up'}.</>
          : 'Send a message to the people you pick, and see how each broadcast was read.'}
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'inbox', label: 'Inbox' }, { value: 'broadcasts', label: 'Broadcasts' }]} />
            {tab === 'inbox' && (
              <Button onClick={markAllRead} disabled={busyAll || (counts.unread || 0) === 0} icon={<CheckCheck size={16} strokeWidth={1.8} />}>Mark all as read</Button>
            )}
          </>
        }
        compact={narrow}
      />

      {tab === 'broadcasts' ? <BroadcastPanel /> : (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '220px minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* Filter rail */}
          <div style={{ display: 'flex', flexDirection: narrow ? 'row' : 'column', gap: narrow ? 6 : 2, flexWrap: 'wrap' }}>
            {filters.map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)} className="km-navrow" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 32,
                  padding: '0 10px', borderRadius: 6, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
                  background: on ? 'var(--s3)' : 'transparent', color: on ? T.text : T.dim, textAlign: 'left', minWidth: narrow ? 'auto' : 0,
                }}>
                  <span>{f.label}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: on ? T.dim : T.mute }}>{f.count}</span>
                </button>
              );
            })}
            {!narrow && (
              <>
                <Eyebrow style={{ padding: '18px 10px 6px' }}>Preferences</Eyebrow>
                <PushPreference />
              </>
            )}
          </div>

          {/* Feed */}
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--s3)' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ height: 10, width: `${45 + (i * 13) % 30}%`, borderRadius: 5, background: 'var(--s3)' }} />
                      <div style={{ height: 8, width: `${30 + (i * 17) % 25}%`, borderRadius: 4, background: 'var(--s3)', opacity: 0.7 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <EmptyState
                icon={<InboxIcon size={20} strokeWidth={1.6} />}
                title={filter === 'all' ? 'Nothing in your inbox' : filter === 'unread' ? 'No unread notifications' : `No ${filters.find((f) => f.id === filter)?.label.toLowerCase() || 'items'}`}
                description={filter === 'all' ? 'Lead assignments, activity reminders and broadcasts from your admin land here.' : 'Try another filter.'}
                action={filter !== 'all' ? <Button size="sm" onClick={() => setFilter('all')}>Show everything</Button> : undefined}
              />
            ) : groups.map((g) => (
              <div key={g.label}>
                <div style={{ padding: '10px 16px 8px', background: 'var(--s3)', borderBottom: `1px solid ${T.border}`, borderTop: `1px solid ${T.border}` }}>
                  <Eyebrow>{g.label}</Eyebrow>
                </div>
                {g.rows.map((r) => (
                  <FeedRow key={r.key} row={r} bucket={g.label} onOpen={() => { markRead(r); if (r.href) router.push(r.href); }} onMarkRead={() => markRead(r)} onDone={() => markDone(r)} />
                ))}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function FeedRow({ row, bucket, onOpen, onMarkRead, onDone }: { row: Row; bucket: string; onOpen: () => void; onMarkRead: () => void; onDone: () => void }) {
  const [hover, setHover] = useState(false);
  const meta = KIND_META[row.kind];
  const tone = row.overdue ? 'red' : meta.tone;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: hover ? 'var(--s3)' : row.unread ? 'transparent' : 'transparent', transition: 'background .12s ease', cursor: row.href ? 'pointer' : 'default' }}
      onClick={onOpen}
    >
      <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TONE_BG[tone], color: TONE_FG[tone] }}>
        {meta.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: row.unread ? 600 : 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
          {row.overdue && <Badge tone="red">Overdue</Badge>}
        </div>
        {row.body && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.body}</div>}
      </div>
      {hover && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {row.href && (
            <Link href={row.href} onClick={onMarkRead} className="km-btn" data-variant="secondary" style={{ height: 30, padding: '0 10px', borderRadius: 6, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Open
            </Link>
          )}
          {row.notifId && row.unread && <Button size="sm" onClick={onMarkRead} icon={<Check size={14} strokeWidth={2} />}>Mark read</Button>}
          {row.activityId && <Button size="sm" onClick={onDone} icon={<Check size={14} strokeWidth={2} />}>Done</Button>}
        </div>
      )}
      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: row.overdue ? T.red : T.mute, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 48, textAlign: 'right' }}>{fmtTime(row.at, bucket)}</span>
      <span aria-label={row.unread ? 'Unread' : undefined} style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: row.unread ? T.red : 'transparent' }} />
    </div>
  );
}

/** Browser push on / off for this device. */
function PushPreference() {
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'denied' | 'busy'>('busy');
  useEffect(() => {
    (async () => {
      if (!pushSupported()) { setState('unsupported'); return; }
      if (pushPermission() === 'denied') { setState('denied'); return; }
      try { setState((await currentSubscription()) ? 'on' : 'off'); } catch { setState('off'); }
    })();
  }, []);
  const toggle = async () => {
    if (state === 'busy' || state === 'unsupported' || state === 'denied') return;
    const next = state === 'on' ? 'off' : 'on';
    setState('busy');
    try {
      if (next === 'on') {
        const r = await enableBrowserPush();
        setState(r.ok ? 'on' : (pushPermission() === 'denied' ? 'denied' : 'off'));
      } else {
        await disableBrowserPush();
        setState('off');
      }
    } catch { setState(next === 'on' ? 'off' : 'on'); }
  };
  const on = state === 'on';
  const label = state === 'unsupported' ? 'Not supported here' : state === 'denied' ? 'Blocked in browser' : state === 'busy' ? 'Working…' : on ? 'On' : 'Off';
  return (
    <button type="button" onClick={toggle} disabled={state === 'busy' || state === 'unsupported' || state === 'denied'} className="km-navrow" title="Browser push notifications on this device" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 32, padding: '0 10px', borderRadius: 6, border: 0,
      cursor: state === 'busy' || state === 'unsupported' || state === 'denied' ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
      background: 'transparent', color: T.dim, textAlign: 'left', width: '100%',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {on ? <BellRing size={15} strokeWidth={1.6} /> : state === 'denied' || state === 'unsupported' ? <BellOff size={15} strokeWidth={1.6} /> : <Radio size={15} strokeWidth={1.6} />}
        Push
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: on ? T.ok : T.mute }}>{label}</span>
    </button>
  );
}
