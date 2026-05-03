'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmContacts } from '../../../../lib/crmApi';
import type { Contact } from '../../../../types/crm';
import ContactsTable from '../../../../components/crm/ContactsTable';

export default function ContactsListPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await crmContacts.list(); setContacts(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = contacts.filter((c) => !q || `${c.full_name || ''} ${c.email || ''} ${c.account_name || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <input placeholder="Search contacts..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
        <Link href="/dashboard/crm/contacts/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Contact</Link>
      </div>
      <ContactsTable contacts={filtered} loading={loading} />
    </div>
  );
}
