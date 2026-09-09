'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Upload } from 'lucide-react';
import { crmContacts, crmSettings } from '../../../../lib/crmApi';
import type { Contact } from '../../../../types/crm';
import ContactsTable, { CONTACT_COLUMNS } from '../../../../components/crm/ContactsTable';
import { usePagination } from '../../../../components/shared/Pagination';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { Badge, Button, Input, PageHeader, T, useIsCompact } from '../../../../components/ui';

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
  const narrow = useIsCompact(760);

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
  const { pageItems: pagedContacts, bar } = usePagination(filtered);

  const actions = (
    <>
      <ViewCustomizer
        entityLabel="Contacts"
        columns={CONTACT_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
        hidden={view.prefs.hidden}
        mode={view.prefs.mode}
        onToggle={view.toggleHidden}
        onSetMode={view.setMode}
        onReset={view.reset}
      />
      <Button href="/dashboard/crm/contacts/import" icon={<Upload size={16} strokeWidth={1.8} />}>Import</Button>
      <Button href="/dashboard/crm/contacts/new" variant="primary" icon={<Plus size={16} strokeWidth={2} />}>New contact</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Contacts
            {!loading && <Badge mono style={{ fontSize: 11.5 }}>{contacts.length.toLocaleString()} {contacts.length === 1 ? 'contact' : 'contacts'}</Badge>}
          </span>
        }
        description={isB2C
          ? 'Consumer profiles with loyalty tiers and consent flags, linked to their leads and deals.'
          : 'People at the companies you sell to, with their role, account and owner.'}
        actions={actions}
        compact={narrow}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 220 }}>
          <Search size={15} strokeWidth={1.8} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
          <Input
            placeholder="Search contacts..."
            aria-label="Search contacts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {q && filtered.length !== contacts.length && (
          <span style={{ fontSize: 12.5, color: T.dim }}>{filtered.length.toLocaleString()} of {contacts.length.toLocaleString()} match</span>
        )}
      </div>

      <ContactsTable
        contacts={pagedContacts}
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
      {bar}
    </div>
  );
}
