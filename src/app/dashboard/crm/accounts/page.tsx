'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAccounts } from '../../../../lib/crmApi';
import type { Account } from '../../../../types/crm';
import AccountsTable from '../../../../components/crm/AccountsTable';

export default function AccountsListPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await crmAccounts.list(); setAccounts(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = accounts.filter((a) => !q || `${a.name} ${a.industry || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <input placeholder="Search accounts..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
        <Link href="/dashboard/crm/accounts/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Account</Link>
      </div>
      <AccountsTable accounts={filtered} loading={loading} />
    </div>
  );
}
