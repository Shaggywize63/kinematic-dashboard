'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitMerge, Plus, Search, X } from 'lucide-react';
import { crmAccounts, type Pagination } from '../../../../lib/crmApi';
import type { Account } from '../../../../types/crm';
import AccountsTable, { ACCOUNT_COLUMNS } from '../../../../components/crm/AccountsTable';
import ServerPaginationBar from '../../../../components/crm/shared/ServerPaginationBar';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { useFieldHelpers } from '../../../../lib/crm/useFieldHelpers';
import { Badge, Button, Input, PageHeader, T, useIsCompact } from '../../../../components/ui';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Accounts list. Search, sort and paging run on the server (GET /crm/accounts with q / sort / page / limit), so the count
 * and the search cover every account, not just the first page the endpoint returns by default. Each row carries its
 * open / won deal and contact rollups from the same call.
 */
export default function AccountsListPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Server-side sort. Empty key = backend default order (created_at). A header
  // click sets a real crm_accounts column and refetches.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>({ key: '', order: 'asc' });
  const view = useViewPrefs('accounts');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  const { fields, loaded: fieldsLoaded } = useFieldHelpers('account');
  // Global CRM date range (header). City scope is handled by the layout remount.
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  const narrow = useIsCompact(760);

  // Debounce the search (350ms), like the deals and leads lists, so the server is not hit on every keystroke.
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  // A stricter filter while on page 5 would land on an empty page: go back to page 1 when the filter set changes.
  useEffect(() => { setPage(1); }, [debouncedQ, range.from, range.to, sort.key, sort.order, pageSize]);

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
  }, [page, pageSize, debouncedQ, range.from, range.to, sort.key, sort.order]);

  const total = pagination?.total ?? 0;
  const clearSearch = () => { setQ(''); setDebouncedQ(''); };

  const actions = (
    <>
      <ViewCustomizer
        entityLabel="Accounts"
        columns={ACCOUNT_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
        hidden={view.prefs.hidden}
        mode={view.prefs.mode}
        onToggle={view.toggleHidden}
        onSetMode={view.setMode}
        onReset={view.reset}
      />
      <Button href="/dashboard/crm/accounts/duplicates" icon={<GitMerge size={16} strokeWidth={2} />}>Find duplicates</Button>
      <Button href="/dashboard/crm/accounts/new" variant="primary" icon={<Plus size={16} strokeWidth={2} />}>New account</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Accounts
            {pagination && <span data-testid="accounts-total"><Badge mono style={{ fontSize: 11.5 }}>{total.toLocaleString('en-IN')} {total === 1 ? 'account' : 'accounts'}</Badge></span>}
          </span>
        }
        description="Companies you work with. Each account groups its contacts, deals and activity; the list shows what is open and won with each."
        actions={actions}
        compact={narrow}
      />

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
        hiddenColumns={hiddenSet}
        viewMode={view.prefs.mode}
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
