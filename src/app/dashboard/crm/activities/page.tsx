'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import SignedImage from '@/components/shared/SignedImage';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities, crmLeads, type Pagination, type ActivityView, type ActivitySummary } from '../../../../lib/crmApi';
import api, { API_BASE_URL } from '../../../../lib/api';
import type { Activity } from '../../../../types/crm';
import { getStoredUser, canAccess, getStoredToken } from '../../../../lib/auth';
import UserSearchSelect, { type UserOption } from '../../../../components/crm/shared/UserSearchSelect';
import CustomFieldsSection from '../../../../components/crm/CustomFieldsSection';
import { ActivityTypeIcon, activityTypeEmoji } from '../../../../components/crm/shared/ActivityTypeIcon';
import GoogleCalendarBanner from '../../../../components/crm/GoogleCalendarBanner';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCityScope } from '../../../../context/CityScopeContext';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';

// Activity cards are not a table, so the customizer toggles which
// optional sections appear in each card. Subject + status are locked.
const ACTIVITY_CARD_FIELDS = [
  { key: 'subject', label: 'Subject + status', locked: true },
  { key: 'description', label: 'Description / notes' },
  { key: 'photo', label: 'Photo attachment' },
  { key: 'type_tag', label: 'Type tag' },
  { key: 'due_date', label: 'Due date' },
  { key: 'completed', label: 'Completed at' },
  { key: 'owner', label: 'Owner' },
  { key: 'linked', label: 'Linked record' },
  { key: 'created', label: 'Created date' },
] as const;

// Meeting first: in field-force usage it's the most common activity type
// reps filter for, so it sits at the top of the picker.
const TYPE_OPTIONS = ['', 'meeting', 'call', 'email', 'task', 'note', 'sms', 'whatsapp'];
// Activity statuses surfaced on the filter — the same values the row actions
// can flip activities into (open / completed / in_progress / cancelled).
// `unset` is a synthetic value the backend translates to
// "status IS NULL OR status NOT IN (canonical set)" so reps can find
// rows whose status was never assigned and edit them.
const STATUS_OPTIONS = ['', 'open', 'in_progress', 'completed', 'cancelled', 'unset'];
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
  // Search-by-lead filter — `leadFilterId` carries the picked lead's UUID
  // (sent as ?lead_id= so the backend's generic crud helper filters via
  // `.eq('lead_id', uuid)`), `leadFilterLabel` is the human display the
  // picker should keep showing once selected. `leadOptions` is the
  // typeahead candidate list, refreshed each time the query string
  // changes (debounced server-side fetch via crmLeads.list).
  const [leadFilterId, setLeadFilterId] = useState('');
  const [leadFilterLabel, setLeadFilterLabel] = useState('');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadOptions, setLeadOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Global header city scope. Activities have no city column of their own —
  // the backend filters them via the linked lead — but the page must refetch
  // when the picked city changes and send it on the request.
  const { selectedCity } = useCityScope();
  // Global CRM date range (header) — applied to the activities' completed_at.
  const dateRange = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  // Layout toggle between the existing list and the month-grid
  // calendar view. Independent of the server-side `view` filter
  // (Overdue / Upcoming / Completed) which both layouts honour. The
  // Google OAuth callback bounces back with ?layout=calendar so the
  // user lands on the calendar view (where the connect banner lives).
  const initialLayout: 'list' | 'calendar' =
    searchParams.get('layout') === 'calendar' ? 'calendar' : 'list';
  const [layout, setLayout] = useState<'list' | 'calendar'>(initialLayout);
  // Calendar grid pivots around a current month. Defaults to today.
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // Server-side pagination state. `page` is 1-indexed. `pagination`
  // metadata (total / hasNext / etc) is what the backend returns
  // alongside the page of rows. Null until the first response lands.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Server-side head-count summary. The list response only has `total`;
  // overdue / upcoming / completed (and the status-axis breakdown) come
  // from /activities/summary, which applies the same scope as the list.
  // This is what the KPI tiles read so the numbers tally with Total.
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  // Sort dropdown — "latest activity" maps to updated_at desc so any
  // touch (status flip, notes edit, reopen) bubbles a row to the top.
  // created_at variants give a static newest/oldest-first; due_at lets
  // reps focus on what's coming up next.
  type SortOption = 'updated_desc' | 'created_desc' | 'created_asc' | 'due_asc' | 'due_desc';
  const [sort, setSort] = useState<SortOption>('updated_desc');
  const [editing, setEditing] = useState<Activity | null>(null);
  const cardView = useViewPrefs('activities');
  const cardHidden = useMemo(() => new Set(cardView.prefs.hidden), [cardView.prefs.hidden]);
  const cardsMode = cardView.prefs.mode === 'cards';

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
      if (leadFilterId) qs.set('lead_id', leadFilterId);
      if (selectedCity) qs.set('city', selectedCity);
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
      // Search by lead — backend's crud.list applies any non-reserved key
      // as .eq(), so `lead_id` filters crm_activities.lead_id directly.
      if (leadFilterId) params.lead_id = leadFilterId;
      if (selectedCity) params.city = selectedCity;
      if (dateRange.from) params.from = dateRange.from;
      if (dateRange.to) params.to = dateRange.to;
      // KPI-tile filter — only send when not 'all'. Backend ignores
      // unknown values; sending 'all' as a no-op keeps the URL clean.
      if (view !== 'all') params.view = view;
      // Sort — backend's crud.list passes `sort` + `order` straight into
      // supabase .order(). due_at/created_at/updated_at are all valid
      // columns on crm_activities.
      const sortMap: Record<SortOption, { sort: string; order: 'asc' | 'desc' }> = {
        updated_desc: { sort: 'updated_at', order: 'desc' },
        created_desc: { sort: 'created_at', order: 'desc' },
        created_asc:  { sort: 'created_at', order: 'asc'  },
        due_asc:      { sort: 'due_at',     order: 'asc'  },
        due_desc:     { sort: 'due_at',     order: 'desc' },
      };
      params.sort  = sortMap[sort].sort;
      params.order = sortMap[sort].order;
      // Summary uses the same filters as the list (minus pagination /
      // sort) so the tiles reflect the same scope. `view` is the
      // tile-active filter — we don't forward it to /summary, otherwise
      // selecting "Overdue" would zero out the other tiles.
      const summaryParams: Record<string, string | number> = {};
      if (type) summaryParams.type = type;
      if (statusFilter) summaryParams.status = statusFilter;
      if (isAdmin && feFilter) summaryParams.owner_id = feFilter;
      if (leadFilterId) summaryParams.lead_id = leadFilterId;
      if (selectedCity) summaryParams.city = selectedCity;
      if (dateRange.from) summaryParams.from = dateRange.from;
      if (dateRange.to) summaryParams.to = dateRange.to;
      const [r, s] = await Promise.all([
        crmActivities.list(params),
        crmActivities.summary(summaryParams).catch(() => null),
      ]);
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
      setSummary(s?.data ?? null);
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
    type, statusFilter, feFilter, leadFilterId, view, page, pageSize, isAdmin, sort, selectedCity, dateRange.from, dateRange.to,
  ]);

  // Reset to page 1 whenever any server-side filter changes — otherwise
  // a stricter filter while on page 5 would land on an empty page.
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    type, statusFilter, feFilter, leadFilterId, view, pageSize, selectedCity,
  ]);

  // Debounced typeahead — query the leads list as the user types in the
  // lead-search picker. Server-side q= matches name/email/phone; the
  // tenant + city scope are auto-attached via api.ts, so we only see
  // leads the user actually has visibility on.
  useEffect(() => {
    if (!leadPickerOpen) return;
    const q = leadQuery.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      setLeadSearching(true);
      try {
        const r = await crmLeads.list(q ? { q, limit: 25 } : { limit: 25 });
        if (cancelled) return;
        const rows: Array<{ id: string; label: string }> = (r.data || []).map((l: any) => {
          const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim() ||
                       l.full_name || l.name || l.email || l.phone || `Lead ${String(l.id).slice(0, 8)}`;
          const sub = [l.city, l.state].filter(Boolean).join(', ');
          return { id: l.id, label: sub ? `${name} · ${sub}` : name };
        });
        setLeadOptions(rows);
      } catch {
        if (!cancelled) setLeadOptions([]);
      } finally {
        if (!cancelled) setLeadSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [leadQuery, leadPickerOpen]);

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
            // Row 1: TOTAL + attention buckets (rows that need a date
            // or that already missed a date). "Completed" lives only
            // on the status-axis row below — it was duplicated here
            // before and confused reps.
            //   overdue  = past-due + uncompleted
            //   upcoming = future-due + uncompleted
            //   undated  = no due_at AND no completed_at
            { key: 'all',       label: 'Total',     value: summary?.total     ?? pagination.total, color: 'var(--primary)' },
            { key: 'overdue',   label: 'Overdue',   value: summary?.overdue   ?? overdue.length,   color: '#ef4444' },
            { key: 'upcoming',  label: 'Upcoming',  value: summary?.upcoming  ?? upcoming.length,  color: '#f59e0b' },
            { key: 'undated',   label: 'No Date',   value: summary?.undated   ?? 0,                color: '#8b5cf6' },
          ] as Array<{ key: ActivityView; label: string; value: number; color: string }>).map(({ key, label, value, color }) => {
            const active = view === key;
            // Every tile is now a server-wide head count under the
            // current filters, so the sub-label is the same for all.
            const sub = active ? 'filtering by this' : 'all matching filter';
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

      {/* Status-axis breakdown — open + in_progress + cancelled +
          completed partitions every activity in scope, so this row
          tallies exactly to Total. Each tile is also a one-click
          status filter (sets ?status=<x>). */}
      {isAdmin && summary && summary.total > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            // `unset` is a synthetic value handled server-side: the
            // list route translates ?status=unset into "status IS NULL
            // OR status NOT IN (canonical set)". So clicking the tile
            // surfaces rows whose status was never set / has a legacy
            // value — reps can then edit them.
            { key: 'open',        label: 'Pending',   value: summary.by_status.open,        color: '#6366f1' },
            { key: 'in_progress', label: 'Ongoing',   value: summary.by_status.in_progress, color: '#f59e0b' },
            { key: 'completed',   label: 'Completed', value: summary.by_status.completed,   color: '#10b981' },
            { key: 'cancelled',   label: 'Cancelled', value: summary.by_status.cancelled,   color: '#9ca3af' },
            { key: 'unset',       label: 'Unset',     value: summary.by_status.unset,       color: '#ef4444' },
          ] as Array<{ key: string; label: string; value: number; color: string }>).map(({ key, label, value, color }) => {
            const active = statusFilter === key;
            return (
              <button
                key={`status-${key}`}
                type="button"
                onClick={() => setStatusFilter(active ? '' : key)}
                aria-pressed={active}
                title={`Filter list to ${label.toLowerCase()} activities`}
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
                  status · {active ? 'filtering by this' : 'tap to filter'}
                </div>
              </button>
            );
          })}
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
          <LeadFilterPicker
            value={leadFilterId}
            label={leadFilterLabel}
            open={leadPickerOpen}
            query={leadQuery}
            options={leadOptions}
            searching={leadSearching}
            onOpenChange={(o) => { setLeadPickerOpen(o); if (o) setLeadQuery(''); }}
            onQueryChange={setLeadQuery}
            onPick={(opt) => {
              setLeadFilterId(opt.id);
              setLeadFilterLabel(opt.label);
              setLeadPickerOpen(false);
              setLeadQuery('');
            }}
            onClear={() => {
              setLeadFilterId('');
              setLeadFilterLabel('');
              setLeadQuery('');
            }}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} title="Sort order" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            <option value="updated_desc">Latest activity</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="due_asc">Due soonest</option>
            <option value="due_desc">Due latest</option>
          </select>
          {isAdmin && (
            <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--s3)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
              Admin — org-wide view
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Layout toggle — flips between the existing list and a
              month grid. Doesn't change the API call; filters + page
              are applied either way and the grid groups whatever is on
              the current page by due_at / completed_at. */}
          <div style={{ display: 'inline-flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {(['list', 'calendar'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLayout(m)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: layout === m ? 'var(--primary)' : 'transparent',
                  color: layout === m ? '#fff' : 'var(--text-dim)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <ViewCustomizer
            entityLabel="Activities"
            columns={ACTIVITY_CARD_FIELDS as unknown as { key: string; label: string; locked?: boolean }[]}
            hidden={cardView.prefs.hidden}
            mode={cardView.prefs.mode}
            onToggle={cardView.toggleHidden}
            onSetMode={cardView.setMode}
            onReset={cardView.reset}
          />
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
      ) : layout === 'calendar' ? (
        <>
          {/* Google Calendar connect / status strip — only surfaced in
              the calendar layout where it's directly relevant. */}
          <GoogleCalendarBanner />
          <ActivityCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            activities={filtered}
          />
        </>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          {pagination && pagination.total > 0
            ? <>No activities on this page. <button onClick={() => setPage(1)} style={{ color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Go to page 1</button></>
            : <>No activities found. <Link href="/dashboard/crm/activities/new" style={{ color: 'var(--primary)' }}>Log one now →</Link></>}
        </div>
      ) : (
        <div style={cardsMode
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }
          : { display: 'flex', flexDirection: 'column', gap: 8 }
        }>
          {filtered.map((a) => {
            const isOverdue = a.due_at && !a.completed_at && new Date(a.due_at) < new Date();
            const linkedEntity = a.lead_id ? `Lead` : a.contact_id ? `Contact` : a.deal_id ? `Deal` : a.account_id ? `Account` : null;
            const linkedId = a.lead_id || a.contact_id || a.deal_id || a.account_id;
            // Prefer the actual parent record's name over the generic
            // "Lead" / "Deal" tag — the API now stamps lead_name /
            // contact_name / account_name / deal_name onto each row.
            const linkedName =
              (a.lead_id    && (a as any).lead_name)    ||
              (a.contact_id && (a as any).contact_name) ||
              (a.deal_id    && (a as any).deal_name)    ||
              (a.account_id && (a as any).account_name) ||
              null;
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
                      <ActivityTypeIcon type={a.type} size={22} date={a.due_at || a.completed_at} completed={!!a.completed_at} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                        {a.subject || a.type}
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--s3)', color: statusColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      {!cardHidden.has('description') && (a.body || a.description) && (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, maxWidth: 560, whiteSpace: 'pre-wrap' }}>
                          {a.body || a.description}
                        </div>
                      )}
                      {!cardHidden.has('photo') && a.image_url && (
                        /* Photo attached to this activity. Click → full-size in a new tab. */
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <a href={a.image_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, marginBottom: 6 }}>
                          <SignedImage src={a.image_url} alt="Activity photo" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }} />
                        </a>
                      )}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!cardHidden.has('type_tag') && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text-dim)' }}>{a.type}</span>
                        )}
                        {!cardHidden.has('due_date') && a.due_at && (
                          <span style={{ fontSize: 11, color: isOverdue ? '#ef4444' : 'var(--text-dim)' }}>
                            {isOverdue ? '⚠ Overdue · ' : ''}
                            {a.completed_at ? 'Scheduled' : 'Due'}: {fmtFull(a.due_at)}
                          </span>
                        )}
                        {!cardHidden.has('completed') && a.completed_at && (
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
                    {!cardHidden.has('owner') && ((a as any).assigned_to_name || a.owner_name) ? (
                      <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👤 {(a as any).assigned_to_name || a.owner_name}
                      </span>
                    ) : null}
                    {!cardHidden.has('linked') && linkedEntity && linkedId && (
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
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={linkedName ? `${linkedEntity}: ${linkedName} — click to open` : `Open this ${linkedEntity}`}
                      >
                        🔗 {linkedName || linkedEntity} →
                      </Link>
                    )}
                    {!cardHidden.has('created') && <span>{new Date(a.created_at).toLocaleDateString()}</span>}
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
                  {/* Edit is available regardless of status — reps need to fix
                      typos, update notes, push out the due_at, etc., on both
                      planned and completed/reopened rows. */}
                  <button onClick={() => setEditing(a)} disabled={busyId === a.id} style={btnGhost}>
                    ✎ Edit
                  </button>
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
      {editing && (
        <EditActivityModal
          activity={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
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

/**
 * Month-grid calendar view of activities. Pivots around `month` (always
 * the 1st of the month). Each day cell shows up to 3 activities; extra
 * are summarised as "+N more". Activities are bucketed by completed_at
 * when present (those become a green tick chip), else due_at (red /
 * amber chip). Clicking an activity opens its parent record.
 */
function ActivityCalendar({
  month, onMonthChange, activities,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  activities: Activity[];
}) {
  // Build a 6-row × 7-col grid starting on the Sunday that contains
  // (or precedes) the 1st of the month. Some months only need 5 rows
  // but rendering 6 keeps the layout stable as the user pages through.
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  // Group activities by YYYY-MM-DD using completed_at if present, else
  // due_at. Activities with neither date are skipped (they don't fit
  // on a calendar).
  const byDay = new Map<string, Activity[]>();
  for (const a of activities) {
    const iso = a.completed_at || a.due_at;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = byDay.get(key) ?? [];
    arr.push(a);
    byDay.set(key, arr);
  }

  const monthLabel = monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const goPrev = () => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const goNext = () => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));
  const goToday = () => {
    const t = new Date();
    onMonthChange(new Date(t.getFullYear(), t.getMonth(), 1));
  };

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
  })();

  // Phone-optimised fallback: a 7-column grid with 6 rows of 90px cells
  // turns into a ~640px-tall scrunched mess on a 360px-wide screen. At
  // narrow viewports we render an agenda-style list instead — every day
  // in the month with at least one activity gets a stacked card. Today
  // bubbles to the top so it's visible without scrolling.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const monthDayKeys: string[] = [];
  for (let i = 0; i < days.length; i++) {
    if (days[i].getMonth() !== monthStart.getMonth()) continue;
    monthDayKeys.push(`${days[i].getFullYear()}-${days[i].getMonth()}-${days[i].getDate()}`);
  }
  const monthDaysWithActivity = monthDayKeys
    .map((k) => ({ key: k, activities: byDay.get(k) ?? [] }))
    .filter((g) => g.activities.length > 0);

  const calendarHeader = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" onClick={goPrev} style={calNavBtn} title="Previous month">‹</button>
        <strong style={{ fontSize: 14, color: 'var(--text)', minWidth: 160, textAlign: 'center' }}>{monthLabel}</strong>
        <button type="button" onClick={goNext} style={calNavBtn} title="Next month">›</button>
        <button type="button" onClick={goToday} style={{ ...calNavBtn, padding: '4px 12px', fontSize: 11 }}>Today</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        {activities.length} activit{activities.length === 1 ? 'y' : 'ies'} on this page · only those with a date are placed on the grid
      </div>
    </div>
  );

  if (isNarrow) {
    if (monthDaysWithActivity.length === 0) {
      return (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          {calendarHeader}
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>
            No activities in this month. Use ‹ / › to browse other months.
          </div>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        {calendarHeader}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {monthDaysWithActivity.map(({ key, activities: list }) => {
            const [yy, mm, dd] = key.split('-').map(Number);
            const cellDate = new Date(yy, mm, dd);
            const isToday = key === todayKey;
            return (
              <div key={key} style={{
                background: 'var(--s3)',
                borderRadius: 8,
                padding: 10,
                borderLeft: isToday ? '4px solid var(--primary)' : '4px solid transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? 'var(--primary)' : 'var(--text)' }}>
                    {cellDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {isToday && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)' }}>· TODAY</span>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>{list.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map((a) => (
                    <AgendaRow key={a.id} a={a} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      {calendarHeader}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} style={{ background: 'var(--s3)', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{d}</div>
        ))}
        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = key === todayKey;
          const list = byDay.get(key) ?? [];
          return (
            <div key={key} style={{
              background: 'var(--s2)',
              minHeight: 90,
              padding: '6px 6px 4px',
              borderTop: isToday ? '2px solid var(--primary)' : 'none',
              opacity: inMonth ? 1 : 0.5,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--primary)' : 'var(--text-dim)' }}>
                  {d.getDate()}
                </span>
                {list.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)' }}>{list.length}</span>
                )}
              </div>
              {list.slice(0, 3).map((a) => {
                const overdue = a.due_at && !a.completed_at && new Date(a.due_at) < new Date();
                const done = !!a.completed_at;
                const chipBg = done ? 'rgba(16,185,129,0.16)' : overdue ? 'rgba(239,68,68,0.16)' : 'rgba(62,158,255,0.16)';
                const chipFg = done ? '#10b981' : overdue ? '#ef4444' : '#3E9EFF';
                const href = a.lead_id
                  ? `/dashboard/crm/leads/${a.lead_id}`
                  : a.contact_id
                  ? `/dashboard/crm/contacts/${a.contact_id}`
                  : a.deal_id
                  ? `/dashboard/crm/deals/${a.deal_id}`
                  : a.account_id
                  ? `/dashboard/crm/accounts/${a.account_id}`
                  : '/dashboard/crm/activities';
                return (
                  <Link
                    key={a.id}
                    href={href}
                    title={`${a.subject || a.type}${a.body ? ` — ${a.body}` : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: chipBg,
                      color: chipFg,
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <ActivityTypeIcon
                      type={a.type}
                      size={14}
                      date={a.due_at || a.completed_at}
                      completed={!!a.completed_at}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.subject || a.type}
                    </span>
                  </Link>
                );
              })}
              {list.length > 3 && (
                <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: '0 6px' }}>
                  +{list.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditActivityModal({ activity, onClose, onSaved }: { activity: Activity; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState(activity.subject || '');
  const [description, setDescription] = useState(activity.description || activity.body || '');
  const [outcome, setOutcome] = useState(activity.outcome || '');
  const [dueAt, setDueAt] = useState(activity.due_at ? toLocalDateTime(activity.due_at) : '');
  const [type, setType] = useState<string>(activity.type);
  // Admin-defined custom fields (entity=activity) — seeded from the row's
  // existing custom_fields; the backend PATCH merges server-side so sending
  // the whole edited map back is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => {
    const cf = (activity as Activity & { custom_fields?: Record<string, unknown> | null }).custom_fields;
    return (cf && typeof cf === 'object') ? { ...cf } : {};
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        subject: subject.trim() || null,
        description: description.trim() || null,
        outcome: outcome.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        custom_fields: customFields,
      };
      await crmActivities.update(activity.id, payload as any);
      toast.success('Activity updated');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete this ${activity.type}? It will be soft-deleted on the backend and can be recovered by support, but won't appear in lists or analytics.`)) return;
    setDeleting(true);
    try {
      await crmActivities.remove(activity.id);
      toast.success('Activity deleted');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Edit activity</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} style={editInput}>
            {['meeting', 'call', 'email', 'task', 'note', 'whatsapp', 'sms', 'other'].map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} style={editInput} /></Field>
        <Field label="Description / notes">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...editInput, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
        <Field label="Outcome (optional)"><input value={outcome} onChange={(e) => setOutcome(e.target.value)} style={editInput} /></Field>
        <Field label="Due / scheduled for"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={editInput} /></Field>
        {/* Admin-defined activity custom fields. CustomFieldsSection yields
            raw <label> children (or nothing when no defs exist), so they
            stack with the modal's other fields via the parent flex gap. */}
        <CustomFieldsSection
          entity="activity"
          values={customFields}
          onChange={setCustomFields}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {/* Delete is destructive and sits on the opposite side from
              the primary Save action so a slip-of-the-thumb doesn't
              nuke the row. The double-confirm in remove() catches the
              rest. */}
          <button onClick={remove} disabled={deleting || saving} style={{
            padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'transparent', border: '1px solid rgba(224,30,44,0.4)',
            color: 'var(--primary)', cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}>
            {deleting ? 'Deleting…' : '🗑 Delete'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={deleting || saving} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={saving || deleting} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
const editInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 9, fontSize: 13,
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--s3)', color: 'var(--text)',
};

function toLocalDateTime(iso: string): string {
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" in *local* time;
  // ISO strings are UTC, so we offset before slicing.
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

/**
 * Compact agenda row used in the phone-optimised calendar layout.
 * Renders the type icon (date-aware where applicable), the subject /
 * type, and a status chip in one tappable line. Click → parent record.
 */
function AgendaRow({ a }: { a: Activity }) {
  const overdue = a.due_at && !a.completed_at && new Date(a.due_at) < new Date();
  const done = !!a.completed_at;
  const chipBg = done ? 'rgba(16,185,129,0.16)' : overdue ? 'rgba(239,68,68,0.16)' : 'rgba(62,158,255,0.16)';
  const chipFg = done ? '#10b981' : overdue ? '#ef4444' : '#3E9EFF';
  const href = a.lead_id
    ? `/dashboard/crm/leads/${a.lead_id}`
    : a.contact_id
    ? `/dashboard/crm/contacts/${a.contact_id}`
    : a.deal_id
    ? `/dashboard/crm/deals/${a.deal_id}`
    : a.account_id
    ? `/dashboard/crm/accounts/${a.account_id}`
    : '/dashboard/crm/activities';
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--s2)',
        textDecoration: 'none',
      }}
    >
      <ActivityTypeIcon
        type={a.type}
        size={20}
        date={a.due_at || a.completed_at}
        completed={done}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.subject || a.type}
        </div>
        {(a.body || a.description) && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.body || a.description}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
        background: chipBg, color: chipFg, textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {done ? 'Done' : overdue ? 'Overdue' : 'Open'}
      </span>
    </Link>
  );
}

/**
 * Server-side lead search picker for the Activities filter strip.
 *
 * Renders a dropdown trigger that, when expanded, shows a debounced
 * typeahead over the leads list. Picking a row sets the lead_id filter
 * on the parent and the picker collapses showing the selected lead's
 * name. The 🔍 affordance is intentionally identical to the other
 * inline-styled selects in this header so the filters read as one row.
 */
function LeadFilterPicker({
  value, label, open, query, options, searching,
  onOpenChange, onQueryChange, onPick, onClear,
}: {
  value: string;
  label: string;
  open: boolean;
  query: string;
  options: Array<{ id: string; label: string }>;
  searching: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (q: string) => void;
  onPick: (opt: { id: string; label: string }) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Filter activities by linked lead"
        style={{
          background: value ? 'var(--primary)' : 'var(--s3)',
          border: `1px solid ${value ? 'var(--primary)' : 'var(--border)'}`,
          color: value ? '#fff' : 'var(--text)',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: value ? 700 : 400,
          cursor: 'pointer',
          maxWidth: 240,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        🔍 {value ? label : 'Search by lead'}
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ marginLeft: 4, fontSize: 12, opacity: 0.85 }}
            aria-label="Clear lead filter"
          >×</span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--s1)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, width: 320, zIndex: 50,
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type a lead name, phone, email…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--s3)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '7px 10px',
              borderRadius: 6, fontSize: 13,
            }}
          />
          <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
            {searching ? (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>
            ) : options.length === 0 ? (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>
                {query ? 'No leads match.' : 'Start typing to search.'}
              </div>
            ) : options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onPick(o)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  color: 'var(--text)', padding: '7px 10px',
                  borderRadius: 6, fontSize: 13, cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const calNavBtn: React.CSSProperties = {
  background: 'var(--s3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};
