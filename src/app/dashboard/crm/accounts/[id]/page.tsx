'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts } from '../../../../../lib/crmApi';
import type { Account } from '../../../../../types/crm';
import AccountSummaryCard from '../../../../../components/crm/AccountSummaryCard';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try { const r = await crmAccounts.get(id); setA(r.data); }
      catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!a) return <div style={{ color: 'var(--text-dim)' }}>Account not found.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{a.name}</div>
          {a.website && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{a.website}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 14, fontSize: 13 }}>
            <Field label="Industry" value={a.industry} />
            <Field label="Revenue" value={a.annual_revenue ? `$${Number(a.annual_revenue).toLocaleString()}` : null} />
            <Field label="Employees" value={a.employees ? String(a.employees) : null} />
            <Field label="Phone" value={a.phone} />
            <Field label="Owner" value={a.owner_name} />
            <Field label="Created" value={new Date(a.created_at).toLocaleDateString()} />
          </div>
        </div>
        {a.description && (
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, fontSize: 13, color: 'var(--text)' }}>{a.description}</div>
        )}
      </div>
      <AccountSummaryCard accountId={a.id} initial={a.ai_summary} />
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
