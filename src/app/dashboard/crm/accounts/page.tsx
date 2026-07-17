'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAccounts } from '../../../../lib/crmApi';
import type { Account } from '../../../../types/crm';
import AccountsTable, { ACCOUNT_COLUMNS } from '../../../../components/crm/AccountsTable';
import { usePagination } from '../../../../components/shared/Pagination';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';

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

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Company-level records that group contacts, deals, and activity history. Each account tracks industry, annual revenue, and territory, giving your team a 360° view of every business relationship. Use AI summaries to get a quick brief before a meeting.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Search accounts..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ViewCustomizer
            entityLabel="Accounts"
            columns={ACCOUNT_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
            hidden={view.prefs.hidden}
            mode={view.prefs.mode}
            onToggle={view.toggleHidden}
            onSetMode={view.setMode}
            onReset={view.reset}
          />
          <Link href="/dashboard/crm/accounts/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Account</Link>
        </div>
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
