'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities } from '../../../../lib/crmApi';
import api from '../../../../lib/api';
import type { Activity } from '../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../lib/auth';
import UserSearchSelect, { type UserOption } from '../../../../components/crm/shared/UserSearchSelect';

const TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬', whatsapp: '💚',
};

const TYPE_OPTIONS = ['', 'call', 'email', 'meeting', 'task', 'note', 'sms', 'whatsapp'];
// Activity statuses surfaced on the filter — the same values the row actions
// can flip activities into (open / completed / in_progress / cancelled).
const STATUS_OPTIONS = ['', 'open', 'in_progress', 'completed', 'cancelled'];

// Next.js 14 bails out of static rendering for any page that calls
// useSearchParams() unless the call site is wrapped in <Suspense>. Keep
// the data-fetching logic inside ActivitiesPageInner and render it
// through a Suspense fallback so the build can prerender the shell.
export default function ActivitiesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>}>
      <ActivitiesPageInner />
    </Suspense>
  );
}

function ActivitiesPageInner() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') ?? '';
  const initialStatus = searchParams.get('status') ?? '';
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState(initialType);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [feFilter, setFeFilter] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmActivities.list();
      setActivities(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getStoredUser();
    const admin = !!(user && canAccess(user.role, ['sub_admin']));
    if (admin) setIsAdmin(true);
    reload();
    if (admin) {
      (api.getUsers({ limit: '500' }) as Promise<any>)
        .then((u) => {
          const list: UserOption[] = (u.data || u || []).map((x: any) => ({
            id: x.id, name: x.name || x.full_name || x.email || 'User',
          }));
          setUsers(list);
        })
        .catch(() => {});
    }
  }, []);

  const updateStatus = async (a: Activity, status: string) => {
    setBusyId(a.id);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'completed' || status === 'done') {
        payload.completed_at = new Date().toISOString();
      } else {
        payload.completed_at = null;
      }
      await crmActivities.update(a.id, payload as any);
      toast.success(`Marked ${status.replace('_', ' ')}`);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (type && a.type !== type) return false;
      if (statusFilter) {
        const aStatus = ((a as any).status as string) || (a.completed_at ? 'completed' : 'open');
        if (aStatus !== statusFilter) return false;
      }
      if (isAdmin && feFilter) {
        const aid = (a as any).assigned_to || a.owner_id;
        if (aid !== feFilter) return false;
      }
      return true;
    });
  }, [activities, type, isAdmin, feFilter]);

  const overdue = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) < new Date());
  const upcoming = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) >= new Date());
  const completed = filtered.filter((a) => !!a.completed_at);
  const filtersActive = !!feFilter;

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

      {/* Admin filters: FE (assignee). State/City come from the global CRM location filter in the layout header. */}
      {isAdmin && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Filters</span>
          <div style={{ minWidth: 220 }}>
            <UserSearchSelect
              options={users}
              value={feFilter}
              onChange={setFeFilter}
              placeholder="Filter by FE / assignee…"
              emptyLabel="All assignees"
            />
          </div>
          {filtersActive && (
            <button
              onClick={() => setFeFilter('')}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
              title="Clear FE filter (state/city is in the header filter)"
            >Clear FE</button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            Showing {filtered.length} of {activities.length}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t ? `${TYPE_ICONS[t] || ''} ${t[0].toUpperCase() + t.slice(1)}s` : 'All Activities'}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Filter by status" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s ? s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All Statuses'}</option>
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

                {/* Status change actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {!a.completed_at && (
                    <button onClick={() => updateStatus(a, 'completed')} disabled={busyId === a.id} style={btnGreen}>
                      ✓ Mark Complete
                    </button>
                  )}
                  {(a as any).status !== 'in_progress' && !a.completed_at && (
                    <button onClick={() => updateStatus(a, 'in_progress')} disabled={busyId === a.id} style={btnAmber}>
                      ▶ In Progress
                    </button>
                  )}
                  {a.completed_at && (
                    <button onClick={() => updateStatus(a, 'open')} disabled={busyId === a.id} style={btnGhost}>
                      ↺ Reopen
                    </button>
                  )}
                  {(a as any).status !== 'cancelled' && !a.completed_at && (
                    <button onClick={() => updateStatus(a, 'cancelled')} disabled={busyId === a.id} style={btnGray}>
                      ✕ Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btnBase: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent' };
const btnGreen: React.CSSProperties = { ...btnBase, border: '1px solid #10b981', color: '#10b981' };
const btnAmber: React.CSSProperties = { ...btnBase, border: '1px solid #f59e0b', color: '#f59e0b' };
const btnGhost: React.CSSProperties = { ...btnBase, border: '1px solid var(--border)', color: 'var(--text-dim)' };
const btnGray: React.CSSProperties = { ...btnBase, border: '1px solid var(--text-dim)', color: 'var(--text-dim)' };
