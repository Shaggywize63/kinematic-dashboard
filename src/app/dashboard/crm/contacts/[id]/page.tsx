'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmContacts } from '../../../../../lib/crmApi';
import type { Contact } from '../../../../../types/crm';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try { const r = await crmContacts.get(id); setC(r.data); }
      catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!c) return <div style={{ color: 'var(--text-dim)' }}>Contact not found.</div>;
  const fullName = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unnamed';

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <OwnerAvatar name={fullName} size={52} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{fullName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{c.title || '—'}{c.account_name ? ` · ${c.account_name}` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
        <Field label="Email" value={c.email} />
        <Field label="Phone" value={c.phone} />
        <Field label="Owner" value={c.owner_name} />
        <Field label="Created" value={new Date(c.created_at).toLocaleString()} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}
