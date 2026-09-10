'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { crmAccounts } from '../../../../lib/crmApi';
import type { Account } from '../../../../types/crm';
import AccountsTable, { ACCOUNT_COLUMNS } from '../../../../components/crm/AccountsTable';
import { usePagination } from '../../../../components/shared/Pagination';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { Badge, Button, Input, PageHeader, T, useIsCompact } from '../../../../components/ui';

export default function AccountsListPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // Server-side sort. Empty key = backend default order (created_at). A header
  // click sets a real crm_accounts column and refetches.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>({ key: '', order: 'asc' });
  const view = useViewPrefs('accounts');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  // Global CRM date range (header). City scope is handled by the layout remount.
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  const narrow = useIsCompact(760);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (range.from) params.from = range.from;
        if (range.to) params.to = range.to;
        if (sort.key) { params.sort = sort.key; params.order = sort.order; }
        const r = await crmAccounts.list(params);
        setAccounts(r.data || []);
      }
      catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
    })();
    /* eslint-disable-next-line */
  }, [range.from, range.to, sort.key, sort.order]);

  const filtered = accounts.filter((a) => !q || `${a.name} ${a.industry || ''}`.toLowerCase().includes(q.toLowerCase()));
  const { pageItems: pagedAccounts, bar } = usePagination(filtered);

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
      <Button href="/dashboard/crm/accounts/new" variant="primary" icon={<Plus size={16} strokeWidth={2} />}>New account</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Accounts
            {!loading && <Badge mono style={{ fontSize: 11.5 }}>{accounts.length.toLocaleString()} {accounts.length === 1 ? 'account' : 'accounts'}</Badge>}
          </span>
        }
        description="Companies you work with. Each account groups its contacts, deals and activity, with industry, revenue and territory."
        actions={actions}
        compact={narrow}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 220 }}>
          <Search size={15} strokeWidth={1.8} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
          <Input
            placeholder="Search accounts..."
            aria-label="Search accounts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {q && filtered.length !== accounts.length && (
          <span style={{ fontSize: 12.5, color: T.dim }}>{filtered.length.toLocaleString()} of {accounts.length.toLocaleString()} match</span>
        )}
      </div>

      <AccountsTable
        accounts={pagedAccounts}
        loading={loading}
        hiddenColumns={hiddenSet}
        viewMode={view.prefs.mode}
        sort={sort}
        onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
      />
      {bar}
    </div>
  );
}
