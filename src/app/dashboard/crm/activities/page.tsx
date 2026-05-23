'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities, type Pagination, type ActivityView } from '../../../../lib/crmApi';
import api, { API_BASE_URL } from '../../../../lib/api';
import type { Activity } from '../../../../types/crm';
import { getStoredUser, canAccess, getStoredToken } from '../../../../lib/auth';
import UserSearchSelect, { type UserOption } from '../../../../components/crm/shared/UserSearchSelect';
import { ActivityTypeIcon, activityTypeEmoji } from '../../../../components/crm/shared/ActivityTypeIcon';

const TYPE_OPTIONS = ['', 'call', 'email', 'meeting', 'task', 'note', 'sms', 'whatsapp'];
// Activity statuses surfaced on the filter — the same values the row actions
// can flip activities into (open / completed / in_progress / cancelled).
const STATUS_OPTIONS = ['', 'open', 'in_progress', 'completed', 'cancelled'];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

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
  const initialView = (searchParams.get('view') as ActivityView | null) ?? 'all';
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState(initialType);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  // KPI-tile filter: clicking a tile (Overdue / Upcoming / Completed)
  // sets this; the server applies the right date predicates.
  // 'all' = no extra constraint = the default state.
  const [view, setView] = useState<ActivityView>(initialView);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [feFilter, setFeFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  // Server-side pagination state. `page` is 1-indexed. `pagination`
  // metadata (total / hasNext / etc) is what the backend returns
  // alongside the page of rows. Null until the first response lands.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // CSV download — hits the backend export endpoint with the current
  // filters and streams the file to the browser via a blob URL. Mirrors
  // the leads export flow.
  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (statusFilter) qs.set('status', statusFilter);
      if (feFilter) qs.set('owner_id', feFilter);
      // Demo-account short-circuit — raw fetch() bypasses api.ts's demo
      // intercept, so we'd otherwise hit the real backend with a demo
      // token and 401. Build the CSV from the in-memory rows so the demo
      // flow demonstrates the export without talking to the network.
      const demoEmail = (() => {
        try { const raw = window.localStorage.getItem('kinematic_user'); return raw ? (JSON.parse(raw)?.email || '').toLowerCase() : ''; } catch { return ''; }
      })();
      if (demoEmail === 'demo@kinematic.com') {
        const rows = filtered;
        const header = ['Type','Subject','Body','Status','Due At','Completed At','Owner','Linked Entity','Created At'];
        const escape = (v: unknown): string => {
          if (v === null || v === undefined) return '';
          const s = String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const body = rows.map((a: any) => {
          const linkedEntity = a.lead_id ? 'Lead' : a.contact_id ? 'Contact' : a.deal_id ? 'Deal' : a.account_id ? 'Account' : '';
          const status = (a.status as string) || (a.completed_at ? 'completed' : 'open');
          return [a.type, a.subject, a.body || a.description, status, a.due_at, a.completed_at, a.assigned_to_name || a.owner_name || '', linkedEntity, a.created_at].map(escape).join(',');
        }).join('\n');
        const csv = `${header.join(',')}\n${body}\n`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = `activities-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(objUrl);
        toast.success('Activities exported (demo)');
        setExporting(false);
        return;
      }
      const url = `${API_BASE_URL}/api/v1/crm/activities/export${qs.toString() ? `?${qs.toString()}` : ''}`;
      const token = getStoredToken();
      // Forward BOTH the auth bearer AND the active X-Client-Id picker
      // value (super_admin uses this to scope to one tenant). Raw fetch
      // bypasses api.ts so we have to attach the header manually —
      // without it the export ignores the client filter and returns
      // every tenant's activities.
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const sel = window.localStorage.getItem('kinematic_selected_client');
        if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
          headers['X-Client-Id'] = sel;
        }
      } catch { /* ignore */ }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `activities-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success('Activities exported');
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const reload = async () => {
    setLoading(true);
    try {
      // All filters (type / status / owner_id) are now server-side so
      // the row count and the page math reflect the *filtered* result,
      // not a page of the org-wide set. Status maps to the backend's
      // `status` column directly; the legacy "open from completed_at"
      // fallback still runs in the row renderer.
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (type) params.type = type;
      if (statusFilter) params.status = statusFilter;
      if (isAdmin && feFilter) params.owner_id = feFilter;
      // KPI-tile filter — only send when not 'all'. Backend ignores
      // unknown values; sending 'all' as a no-op keeps the URL clean.
      if (view !== 'all') params.view = view;
      const r = await crmActivities.list(params);
      setActivities(r.data || []);
      // `pagination` may be undefined if the backend hasn't shipped the
      // new shape yet — keep the UI working by inferring a single page.
      setPagination(r.pagination ?? {
        total: (r.data || []).length,
        page: 1,
        limit: pageSize,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getStoredUser();
    const admin = !!(user && canAccess(user.role, ['sub_admin']));
    if (admin) setIsAdmin(true);
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

  // Reload on any filter / page / page-size change. Server-side filtering
  // means we don't need the client-side `filtered` array to re-filter on
  // the same dimensions.
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [
    type, statusFilter, feFilter, view, page, pageSize, isAdmin,
  ]);

  // Reset to page 1 whenever any server-side filter changes — otherwise
  // a stricter filter while on page 5 would land on an empty page.
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    type, statusFilter, feFilter, view, pageSize,
  ]);

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

  // Delete affordance — backend DELETE /api/v1/crm/activities/:id is wired to
  // crud.softDelete so rows are recoverable from the DB if needed. Confirm
  // guards against accidental clicks on the small ✕ button.
  const removeActivity = async (a: Activity) => {
    if (!confirm('Delete this activity?')) return;
    setBusyId(a.id);
    try {
      await crmActivities.remove(a.id);
      toast.success('Activity deleted');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  // Server filters (type / status / owner_id) are already applied in
  // the reload() params, so `activities` is the already-filtered page.
  // Keeping `filtered` as an alias to minimise churn in the renderers
  // below.
  const filtered = activities;

  const overdue = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) < new Date());
  const upcoming = filtered.filter((a) => a.due_at && !a.completed_at && new Date(a.due_at) >= new Date());
  const completed = filtered.filter((a) => !!a.completed_at);
  const filtersActive = !!feFilter;

  return (
    <div>
      {/* Admin summary — every tile is a one-click filter. Selecting
          a tile sends ?view=<x> to the API and the server applies the
          right date predicates (overdue = past-due + uncompleted,
          upcoming = future-due + uncompleted, completed = has
          completed_at). Active tile is highlighted; clicking it again
          (or "Total") clears the view filter back to all activities. */}
      {isAdmin && pagination && pagination.total > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            { key: 'all',       label: 'Total',     value: pagination.total, color: 'var(--primary)' },
            { key: 'overdue',   label: 'Overdue',   value: overdue.length,   color: '#ef4444' },
            { key: 'upcoming',  label: 'Upcoming',  value: upcoming.length,  color: '#f59e0b' },
            { key: 'completed', label: 'Completed', value: completed.length, color: '#10b981' },
          ] as Array<{ key: ActivityView; label: string; value: number; color: string }>).map(({ key, label, value, color }) => {
            const active = view === key;
            // "Total" tile shows server-wide count; the rest count the
            // current page only. Sub-label reflects that so users don't
            // misread Overdue/Upcoming/Completed as network totals.
            const sub = key === 'all'
              ? 'all matching filter'
              : (active ? 'filtering by this' : 'on this page · tap to filter');
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={active}
                title={key === 'all' ? 'Show all activities' : `Filter list to ${label.toLowerCase()} activities`}
                className="km-clickable"
                style={{
                  background: active ? color : 'var(--s2)',
                  border: `2px solid ${active ? color : 'var(--border)'}`,
                  borderRadius: 10, padding: '8px 16px', minWidth: 110, textAlign: 'center',
                  cursor: 'pointer', color: 'inherit',
                  boxShadow: active ? `0 4px 14px ${color}40` : 'none',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: active ? '#fff' : color }}>
                  {value.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: active ? '#fff' : 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)', marginTop: 2 }}>
                  {sub}
                </div>
              </button>
            );
          })}
          {view !== 'all' && (
            <button
              type="button"
              onClick={() => setView('all')}
              style={{
                background: 'transparent', border: '1px dashed var(--border)',
                color: 'var(--text-dim)', padding: '6px 12px',
                borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                alignSelf: 'center',
              }}
              title="Clear the tile filter — show all activities again"
            >
              ✕ Clear filter
            </button>
          )}
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
            {pagination
              ? `Showing ${activities.length.toLocaleString()} of ${pagination.total.toLocaleString()} (page ${pagination.page} of ${pagination.totalPages})`
              : `Showing ${activities.length}`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Native <select> options can't render React components — emoji-only
              for the filter labels. activityTypeEmoji uses the WhatsApp green
              circle 🟢 so the option at least colour-signals the brand even
              without the real logo. */}
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t ? `${activityTypeEmoji(t)} ${t[0].toUpperCase() + t.slice(1)}s` : 'All Activities'}</option>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Download activities as CSV (current filters apply)"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
          <Link href="/dashboard/crm/activities/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>⬆ Import</Link>
          <Link href="/dashboard/crm/activities/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ Log Activity</Link>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          {pagination && pagination.total > 0
            ? <>No activities on this page. <button onClick={() => setPage(1)} style={{ color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Go to page 1</button></>
            : <>No activities found. <Link href="/dashboard/crm/activities/new" style={{ color: 'var(--primary)' }}>Log one now →</Link></>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((a) => {
            const isOverdue = a.due_at && !a.completed_at && new Date(a.due_at) < new Date();
            const linkedEntity = a.lead_id ? `Lead` : a.contact_id ? `Contact` : a.deal_id ? `Deal` : a.account_id ? `Account` : null;
            const linkedId = a.lead_id || a.contact_id || a.deal_id || a.account_id;
            const status = ((a as any).status as string) || (a.completed_at ? 'completed' : 'open');
            const statusColor =
              status === 'completed' || status === 'done' ? '#10b981'
              : status === 'in_progress' ? '#f59e0b'
              : status === 'cancelled' ? 'var(--text-dim)'
              : 'var(--primary)';
            const fmtFull = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

            return (
              <div key={a.id} style={{
                background: 'var(--s2)', border: `1px solid ${isOverdue ? '#ef4444' : 'var(--border)'}`,
                borderRadius: 10, padding: '12px 14px',
                borderLeft: `4px solid ${isOverdue ? '#ef4444' : statusColor}`,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                    <span style={{ fontSize: 18, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
                      <ActivityTypeIcon type={a.type} size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                        {a.subject || a.type}
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--s3)', color: statusColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      {(a.body || a.description) && (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, maxWidth: 560, whiteSpace: 'pre-wrap' }}>
                          {a.body || a.description}
                        </div>
                      )}
                      {a.image_url && (
                        /* Photo attached to this activity. Click → full-size in a new tab. */
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <a href={a.image_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, marginBottom: 6 }}>
                          <img src={a.image_url} alt="Activity photo" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }} />
                        </a>
                      )}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text-dim)' }}>{a.type}</span>
                        {a.due_at && (
                          <span style={{ fontSize: 11, color: isOverdue ? '#ef4444' : 'var(--text-dim)' }}>
                            {isOverdue ? '⚠ Overdue · ' : ''}
                            {a.completed_at ? 'Scheduled' : 'Due'}: {fmtFull(a.due_at)}
                          </span>
                        )}
                        {a.completed_at && (
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                            ✓ Completed: {fmtFull(a.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                    gap: 4, fontSize: 11, color: 'var(--text-dim)',
                    // Reserve room for the absolutely-positioned ✕
                    // delete button (top:8, right:8, width:22). Without
                    // this the owner name on the first line bled into
                    // the button area and clipped the last few letters.
                    paddingRight: 28,
                  }}>
                    {(a as any).assigned_to_name || a.owner_name ? (
                      <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👤 {(a as any).assigned_to_name || a.owner_name}
                      </span>
                    ) : null}
                    {linkedEntity && linkedId && (
                      // Was a plain <span> — every linked-entity badge
                      // is now a real link to the parent record. Big
                      // navigation win: from any activity, one click
                      // to the lead/contact/deal/account it belongs
                      // to. Stops propagation so it doesn't fight
                      // with the surrounding card click handlers.
                      <Link
                        href={`/dashboard/crm/${linkedEntity.toLowerCase() + 's'}/${linkedId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="km-clickable"
                        style={{
                          color: 'var(--primary)', textDecoration: 'none',
                          padding: '2px 7px', borderRadius: 4,
                          border: '1px solid var(--primary)',
                          fontWeight: 600,
                        }}
                        title={`Open this ${linkedEntity}`}
                      >
                        🔗 {linkedEntity} →
                      </Link>
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

                {/* Delete affordance — small ✕ in top-right corner. Distinct
                    from the "Cancel" status button: that flips status to
                    cancelled, this hard-removes the activity (soft-delete on
                    the backend so it's recoverable). */}
                <button
                  onClick={() => removeActivity(a)}
                  disabled={busyId === a.id}
                  title="Delete activity"
                  aria-label="Delete activity"
                  style={btnDelete}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <PaginationBar
        pagination={pagination}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={loading}
      />
    </div>
  );
}

/**
 * Pagination footer: page-size picker on the left, current-page +
 * first/prev/next/last on the right. Renders even when pagination is
 * null so the layout doesn't jump on the very first render — controls
 * are just disabled. Same shape as the leads/deals pagination bars.
 */
function PaginationBar({
  pagination, pageSize, onPageChange, onPageSizeChange, loading,
}: {
  pagination: Pagination | null;
  pageSize: number;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  loading: boolean;
}) {
  const p = pagination;
  const totalPages = p?.totalPages ?? 1;
  const currentPage = p?.page ?? 1;
  const total = p?.total ?? 0;
  const start = total === 0 ? 0 : (currentPage - 1) * (p?.limit ?? pageSize) + 1;
  const end = Math.min(currentPage * (p?.limit ?? pageSize), total);

  const disabled = loading || !p;
  const canPrev = !!p?.hasPrev && !disabled;
  const canNext = !!p?.hasNext && !disabled;

  const btn = (active: boolean): React.CSSProperties => ({
    background: 'var(--s3)', border: '1px solid var(--border)', color: active ? 'var(--text)' : 'var(--text-dim)',
    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: active ? 'pointer' : 'not-allowed', opacity: active ? 1 : 0.5, minWidth: 32,
  });

  // Don't render the bar at all when there are zero results — the
  // empty-state banner above already says "no activities."
  if (!loading && total === 0) return null;

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 14, padding: '10px 14px', background: 'var(--s2)',
      border: '1px solid var(--border)', borderRadius: 10,
      flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-dim)' }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={disabled}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>
          {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => onPageChange(1)} disabled={!canPrev} style={btn(canPrev)} title="First page">«</button>
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev} style={btn(canPrev)} title="Previous page">‹</button>
        <span style={{ fontSize: 12, color: 'var(--text)', padding: '0 8px' }}>
          Page <strong>{currentPage}</strong> of {totalPages}
        </span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext} style={btn(canNext)} title="Next page">›</button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={!canNext} style={btn(canNext)} title="Last page">»</button>
      </div>
    </div>
  );
}

const btnBase: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent' };
const btnGreen: React.CSSProperties = { ...btnBase, border: '1px solid #10b981', color: '#10b981' };
const btnAmber: React.CSSProperties = { ...btnBase, border: '1px solid #f59e0b', color: '#f59e0b' };
const btnGhost: React.CSSProperties = { ...btnBase, border: '1px solid var(--border)', color: 'var(--text-dim)' };
const btnGray: React.CSSProperties = { ...btnBase, border: '1px solid var(--text-dim)', color: 'var(--text-dim)' };
const btnDelete: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8,
  width: 22, height: 22, padding: 0,
  borderRadius: 4, border: '1px solid transparent',
  background: 'transparent', color: 'var(--text-dim)',
  fontSize: 12, lineHeight: 1, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
