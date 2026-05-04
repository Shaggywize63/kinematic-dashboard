'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmCampaigns } from '../../../../lib/crmApi';
import type { Campaign } from '../../../../types/crm';

const STATUS_COLORS: Record<string, string> = { draft: '#aab', active: '#28B463', paused: '#F7B538', completed: '#7B61FF' };

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmCampaigns.list().then((r) => setCampaigns(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: 'var(--text)' }}>Campaigns</h3>
        <Link href="/dashboard/crm/campaigns/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Campaign</Link>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {campaigns.map((c) => (
            <Link key={c.id} href={`/dashboard/crm/campaigns/${c.id}`} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                <span style={{ color: STATUS_COLORS[c.status], fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Budget: ${Number(c.budget || 0).toLocaleString()} / Spent: ${Number(c.spent || 0).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>Revenue: ${Number(c.actual_revenue || 0).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
