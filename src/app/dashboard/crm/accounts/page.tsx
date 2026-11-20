'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitMerge, Plus, Search, X } from 'lucide-react';
import { crmAccounts, type Pagination } from '../../../../lib/crmApi';
import type { Account } from '../../../../types/crm';
import AccountsTable, { ACCOUNT_COLUMNS } from '../../../../components/crm/AccountsTable';
import ServerPaginationBar from '../../../../components/crm/shared/ServerPaginationBar';
import ViewCustomizer, { LayoutModeToggle } from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { useFieldHelpers } from '../../../../lib/crm/useFieldHelpers';
import { isB2bClientActive } from '../../../../lib/b2bClient';
import { Badge, Button, Input, T } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';
import { CrmToolbarLeft, CrmToolbarRight } from '../../../../components/crm/layout/CrmPageToolbar';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Accounts list. Search, sort and paging run on the server (GET /crm/accounts with q / sort / page / limit), so the count
 * and the search cover every account, not just the first page the endpoint returns by default. Each row carries its
 * open / won deal and contact rollups from the same call.
 */
export default function AccountsListPage() {
  usePageTitle('Accounts', 'Companies you work with. Each account groups its contacts, deals and activity; the list shows what is open and won with each.');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Spark & Ray: the "Parent companies" tab lists only group accounts (is_group=true);
  // the default "Accounts" tab excludes them (both are the same /crm/accounts endpoint).
  const [tab, setTab] = useState<'accounts' | 'groups'>('accounts');
  const [b2b, setB2b] = useState(false);
  useEffect(() => { setB2b(isB2bClientActive()); }, []);
  // Server-side sort. Empty key = backend default order (created_at). A header
  // click sets a real crm_accounts column and refetches.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>({ key: '', order: 'asc' });
  const view = useViewPrefs('accounts');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  const { fields, loaded: fieldsLoaded } = useFieldHelpers('account');
  // Global CRM date range (header). City scope is handled by the layout remount.
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  // Debounce the search (350ms), like the deals and leads lists, so the server is not hit on every keystroke.
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  // A stricter filter while on page 5 would land on an empty page: go back to page 1 when the filter set changes.
  useEffect(() => { setPage(1); }, [debouncedQ, range.from, range.to, sort.key, sort.order, pageSize, tab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page, limit: pageSize };
        if (range.from) params.from = range.from;
        if (range.to) params.to = range.to;
        if (debouncedQ) params.q = debouncedQ;
        if (sort.key) { params.sort = sort.key; params.order = sort.order; }
        if (tab === 'groups') params.group = 1;
        const r = await crmAccounts.list(params);
        if (!alive) return;
        const rows = r.data || [];
        setAccounts(rows);
        setPagination(r.pagination ?? { total: rows.length, page: 1, limit: pageSize, totalPages: 1, hasNext: false, hasPrev: false });
      } catch (e: any) {
        if (alive) toast.error(e.message || 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, pageSize, debouncedQ, range.from, range.to, sort.key, sort.order, tab]);

  const total = pagination?.total ?? 0;
  const clearSearch = () => { setQ(''); setDebouncedQ(''); };

  const actions = (
    <>
      <LayoutModeToggle mode={view.prefs.mode} onSetMode={view.setMode} />
      <ViewCustomizer
        entityLabel="Accounts"
        columns={ACCOUNT_COLUMNS.filter((c) => !(fieldsLoaded && fields.isHidden(c.key))) as unknown as { key: string; label: string; locked?: boolean }[]}
        hidden={view.prefs.hidden}
        mode={view.prefs.mode}
        onToggle={view.toggleHidden}
        onReset={view.reset}
      />
      <Button href="/dashboard/crm/accounts/duplicates" toolbar icon={<GitMerge size={16} strokeWidth={2} />}>Find duplicates</Button>
      <Button href="/dashboard/crm/accounts/new" variant="primary" toolbar icon={<Plus size={16} strokeWidth={2} />}>New account</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Title now lives in the TopBar breadcrumb (usePageTitle above); the
          count badge and actions portal into CrmLayout's scope-badge / city
          / date-range row so the page starts with the tab strip / search,
          not a repeated heading row. */}
      <CrmToolbarLeft>
        {pagination && <span data-testid="accounts-total"><Badge mono style={{ fontSize: 11.5 }}>{total.toLocaleString('en-IN')} {total === 1 ? 'account' : 'accounts'}</Badge></span>}
      </CrmToolbarLeft>
      <CrmToolbarRight>{actions}</CrmToolbarRight>

      {b2b && (
        <div role="tablist" aria-label="Accounts view" style={{ display: 'inline-flex', gap: 4, padding: 3, background: 'var(--s3)', borderRadius: 10, alignSelf: 'flex-start' }}>
          {([['accounts', 'Accounts'], ['groups', 'Parent companies']] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              style={{ border: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
                background: tab === key ? 'var(--s1)' : 'transparent', color: tab === key ? T.text : T.mute }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 220 }}>
          <Search size={15} strokeWidth={1.8} aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
          <Input
            placeholder="Search accounts..."
            aria-label="Search accounts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {q && <Button size="sm" variant="ghost" onClick={clearSearch} icon={<X size={14} strokeWidth={1.8} />}>Clear</Button>}
        {debouncedQ && pagination && (
          <span style={{ fontSize: 12.5, color: T.dim }} aria-live="polite">{total.toLocaleString('en-IN')} {total === 1 ? 'match' : 'matches'}</span>
        )}
      </div>

      <AccountsTable
        accounts={accounts}
        loading={loading || !fieldsLoaded}
        hiddenColumns={tab === 'groups' ? new Set<string>([...hiddenSet, 'contacts', 'open_deals', 'won']) : hiddenSet}
        viewMode={view.prefs.mode === 'cards' ? 'cards' : 'table'}
        sort={sort}
        onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
        fields={fields}
        searching={!!debouncedQ}
        onClearSearch={clearSearch}
      />
      <ServerPaginationBar pagination={pagination} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} noun="accounts" />
    </div>
  );
}
