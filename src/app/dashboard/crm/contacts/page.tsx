'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmContacts } from '../../../../lib/crmApi';
import type { Contact } from '../../../../types/crm';
import ContactsTable from '../../../../components/crm/ContactsTable';
import { useCrmLocationFilter } from '../../../../stores/crmLocationFilterStore';

export default function ContactsListPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const { state: locState, city: locCity } = useCrmLocationFilter();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (locState) params.state = locState;
        if (locCity) params.city = locCity;
        const r = await crmContacts.list(params);
        setContacts(r.data || []);
      }
      catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
    })();
  }, [locState, locCity]);

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
          {(locState || locCity) && (
            <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--s3)', padding: '3px 8px', borderRadius: 6 }}>
              📍 {[locCity, locState].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
        <Link href="/dashboard/crm/contacts/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>⬆ Bulk Import</Link>
        <Link href="/dashboard/crm/contacts/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ New Contact</Link>
      </div>
      <ContactsTable contacts={filtered} loading={loading} />
    </div>
  );
}
