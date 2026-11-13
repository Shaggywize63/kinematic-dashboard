'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crmTasks, type MyTask, type Pagination } from '../../../../lib/crmApi';
import { Badge, Card, EmptyState, PageHeader, Select, T, type Tone, useIsCompact } from '../../../../components/ui';
import { formatDate, formatTime } from '../../../../lib/utils';
import { prettifySlug } from '../../../../lib/activityTypes';

// "My Tasks" — the signed-in user's OWN assigned tasks (owner_id OR
// assigned_to = me), grouped by urgency, each showing who assigned it.
// Core CRM surface for every tenant (no Spark gate). Read-focused list:
// it consumes GET /crm/my-tasks via crmTasks.myTasks and never writes.

// Status filter -> `status` query param. '' = All (the backend's
// actionable default). 'completed' flips the view to finished work.
const STATUS_OPTIONS: Array<{ value: '' | 'open' | 'in_progress' | 'completed'; label: string }> = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

// Urgency buckets, in render order. Completed is rendered only when it
// has rows (i.e. when the Completed filter is on, or a completed task
// slips into another fetch).
type Bucket = 'overdue' | 'today' | 'upcoming' | 'nodate' | 'completed';
const SECTIONS: Array<{ key: Bucket; label: string; tone: Tone }> = [
  { key: 'overdue', label: 'Overdue', tone: 'red' },
  { key: 'today', label: 'Today', tone: 'warn' },
  { key: 'upcoming', label: 'Upcoming', tone: 'info' },
  { key: 'nodate', label: 'No date', tone: 'neutral' },
  { key: 'completed', label: 'Completed', tone: 'ok' },
];

const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

function bucketOf(t: MyTask): Bucket {
  if (t.status === 'completed' || t.completed_at) return 'completed';
  if (!t.due_at) return 'nodate';
  const due = Date.parse(t.due_at);
  const start = startOfToday();
  if (t.is_overdue || (Number.isFinite(due) && due < start)) return 'overdue';
  if (Number.isFinite(due) && due < start + 86_400_000) return 'today';
  return 'upcoming';
}

// Relative due label — "Today · 3:30 PM", "Tomorrow", "2 days ago", "in 4 days".
function relDue(iso: string): string {
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return '';
  const d = new Date(due);
  const startDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startDue - startOfToday()) / 86_400_000);
  if (days === 0) return `Today · ${formatTime(iso)}`;
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

const STATUS_TONE: Record<string, Tone> = {
  open: 'info', in_progress: 'warn', planned: 'info',
  completed: 'ok', cancelled: 'neutral',
};
const prettyStatus = (s: string | null) => (s ? prettifySlug(s) : 'Open');

// The most specific linked record, as a link where a detail route exists.
// Companies have no dedicated route, so they render as plain text.
function linkedRecord(t: MyTask): { label: string; href: string | null } | null {
  if (t.lead_id && t.lead_name) return { label: t.lead_name, href: `/dashboard/crm/leads/${t.lead_id}` };
  if (t.account_id && t.account_name) return { label: t.account_name, href: `/dashboard/crm/accounts/${t.account_id}` };
  if (t.deal_id && t.deal_name) return { label: t.deal_name, href: `/dashboard/crm/deals/${t.deal_id}` };
  if (t.contact_id && t.contact_name) return { label: t.contact_name, href: `/dashboard/crm/contacts/${t.contact_id}` };
  if (t.company_name) return { label: t.company_name, href: null };
  return null;
}

function sortBucket(bucket: Bucket, rows: MyTask[]): MyTask[] {
  const by = (fn: (t: MyTask) => number, dir: 1 | -1) =>
    [...rows].sort((a, b) => dir * (fn(a) - fn(b)));
  if (bucket === 'completed') return by((t) => Date.parse(t.completed_at || t.created_at || '') || 0, -1);
  if (bucket === 'nodate') return by((t) => Date.parse(t.created_at || '') || 0, -1);
  // Dated sections: soonest-due first.
  return by((t) => Date.parse(t.due_at || '') || 0, 1);
}

function TaskRow({ t, compact }: { t: MyTask; compact: boolean }) {
  const linked = linkedRecord(t);
  const title = t.subject || prettifySlug(t.type) || 'Task';
  const tone = STATUS_TONE[t.status || 'open'] ?? 'neutral';
  const overdueActive = t.is_overdue && t.status !== 'completed' && !t.completed_at;
  return (
    <div
      data-testid="my-task-row"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
        border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{title}</span>
          {t.type && <Badge tone="neutral">{prettifySlug(t.type)}</Badge>}
        </div>
        <Badge tone={tone} dot>{prettyStatus(t.status)}</Badge>
      </div>

      {t.body && (
        <div style={{ fontSize: 12.5, color: T.dim, overflowWrap: 'anywhere' }}>{t.body}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, flexWrap: 'wrap', fontSize: 12.5, color: T.mute }}>
        {linked && (
          linked.href
            ? <Link href={linked.href} style={{ color: T.info, fontWeight: 600, textDecoration: 'none' }}>{linked.label}</Link>
            : <span style={{ color: T.dim, fontWeight: 600 }}>{linked.label}</span>
        )}
        {t.due_at && (
          <span
            title={`${formatDate(t.due_at)} ${formatTime(t.due_at)}`}
            style={{ color: overdueActive ? T.red : T.mute, fontWeight: overdueActive ? 600 : 500 }}
          >
            Due {relDue(t.due_at)}
          </span>
        )}
        {t.assigned_by_name && (
          <span>Assigned by <span style={{ color: T.dim, fontWeight: 600 }}>{t.assigned_by_name}</span></span>
        )}
      </div>
    </div>
  );
}

export default function MyTasksPage() {
  const compact = useIsCompact(560);
  const [status, setStatus] = useState<'' | 'open' | 'in_progress' | 'completed'>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await crmTasks.myTasks({
        status: status || undefined,
        overdue: overdueOnly || undefined,
        limit: 200,
      });
      setTasks(Array.isArray(res?.data) ? res.data : []);
      setPagination(res?.pagination ?? null);
    } catch {
      setError('We could not load your tasks. Please try again.');
      setTasks([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [status, overdueOnly]);

  // Both controls are in the dep array, so changing either refetches.
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const grouped = useMemo(() => {
    const map: Record<Bucket, MyTask[]> = { overdue: [], today: [], upcoming: [], nodate: [], completed: [] };
    for (const t of tasks) map[bucketOf(t)].push(t);
    (Object.keys(map) as Bucket[]).forEach((k) => { map[k] = sortBucket(k, map[k]); });
    return map;
  }, [tasks]);

  const hasAny = tasks.length > 0;
  const toggleBase: React.CSSProperties = {
    height: 34, padding: '0 14px', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 600,
    border: `1px solid ${overdueOnly ? 'transparent' : T.border}`, cursor: 'pointer',
    background: overdueOnly ? T.red : T.card, color: overdueOnly ? '#fff' : T.dim, fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <PageHeader
        eyebrow="CRM"
        title="My Tasks"
        description="Your own assigned tasks, grouped by urgency — and who assigned each one."
        compact
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Select
              data-testid="status-filter"
              aria-label="Status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              style={{ height: 34, width: compact ? 130 : 150 }}
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <button
              type="button"
              data-testid="overdue-toggle"
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly((v) => !v)}
              style={toggleBase}
            >
              Overdue only
            </button>
          </div>
        }
      />

      {loading ? (
        <Card><div style={{ padding: 8, fontSize: 13, color: T.dim }}>Loading your tasks…</div></Card>
      ) : error ? (
        <Card>
          <EmptyState
            title="Something went wrong"
            description={error}
            action={<button type="button" onClick={fetchTasks} style={{ ...toggleBase, background: T.card, color: T.dim, border: `1px solid ${T.border}` }}>Retry</button>}
          />
        </Card>
      ) : !hasAny ? (
        <Card>
          <EmptyState
            title={overdueOnly ? 'Nothing overdue' : 'You have no tasks'}
            description={overdueOnly
              ? 'You are all caught up — no overdue tasks right now.'
              : 'Tasks assigned to you will show up here, grouped by when they are due.'}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SECTIONS.map((s) => {
            const rows = grouped[s.key];
            if (!rows.length) return null;
            return (
              <section key={s.key} data-testid={`section-${s.key}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: T.heading, color: T.text }}>{s.label}</h2>
                  <Badge tone={s.tone}>{rows.length}</Badge>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((t) => <TaskRow key={t.id} t={t} compact={compact} />)}
                </div>
              </section>
            );
          })}
          {pagination && pagination.total > tasks.length && (
            <div style={{ fontSize: 12, color: T.mute, textAlign: 'center' }}>
              Showing {tasks.length} of {pagination.total} tasks.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
