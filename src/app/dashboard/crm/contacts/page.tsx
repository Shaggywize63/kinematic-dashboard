'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmContacts, crmSettings } from '../../../../lib/crmApi';
import type { Contact } from '../../../../types/crm';
import ContactsTable, { CONTACT_COLUMNS } from '../../../../components/crm/ContactsTable';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';

export default function ContactsListPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [isB2C, setIsB2C] = useState(false);
  // Server-side sort. Empty key = backend default order (created_at). A header
  // click sets a real crm_contacts column and refetches.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>({ key: '', order: 'asc' });
  const view = useViewPrefs('contacts');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  // Global CRM date range (header picker). City scope is handled by the
  // layout remount; the date range is applied here as created_at from/to.
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const reload = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      if (sort.key) { params.sort = sort.key; params.order = sort.order; }
      const r = await crmContacts.list(params);
      setContacts(r.data || []);
    }
    catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to, sort.key, sort.order]);

  useEffect(() => {
    crmSettings.get().then((r) => {
      if (r.data?.business_type === 'b2c') setIsB2C(true);
    }).catch(() => {});
  }, []);

  const filtered = contacts.filter((c) => !q || `${c.full_name || ''} ${c.email || ''} ${c.account_name || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Your people directory — individuals associated with leads, accounts, or deals. B2C contacts store consumer profiles with loyalty tiers and consent flags. B2B contacts link to company accounts and carry role and department info.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search contacts..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ViewCustomizer
            entityLabel="Contacts"
            columns={CONTACT_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
            hidden={view.prefs.hidden}
            mode={view.prefs.mode}
            onToggle={view.toggleHidden}
            onSetMode={view.setMode}
            onReset={view.reset}
          />
          <Link href="/dashboard/crm/contacts/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>⬆ Bulk Import</Link>
          <Link href="/dashboard/crm/contacts/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ New Contact</Link>
        </div>
      </div>
      <ContactsTable
        contacts={filtered}
        loading={loading}
        isB2C={isB2C}
        hiddenColumns={hiddenSet}
        viewMode={view.prefs.mode}
        sort={sort}
        onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
        onAssign={async (contactId, userId) => {
          await crmContacts.update(contactId, { owner_id: userId } as any);
          toast.success(userId ? 'Contact reassigned' : 'Contact unassigned');
          reload();
        }}
      />
    </div>
  );
}
