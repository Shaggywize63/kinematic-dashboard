'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmCampaigns } from '../../../../../lib/crmApi';
import type { Campaign } from '../../../../../types/crm';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    crmCampaigns.get(id).then((r) => setC(r.data)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [id]);
  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!c) return <div style={{ color: 'var(--text-dim)' }}>Not found.</div>;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>{c.name}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
        <div><div style={lbl}>Status</div><div style={val}>{c.status}</div></div>
        <div><div style={lbl}>Type</div><div style={val}>{c.type || '—'}</div></div>
        <div><div style={lbl}>Budget</div><div style={val}>${Number(c.budget || 0).toLocaleString()}</div></div>
        <div><div style={lbl}>Spent</div><div style={val}>${Number(c.spent || 0).toLocaleString()}</div></div>
        <div><div style={lbl}>Revenue</div><div style={val}>${Number(c.actual_revenue || 0).toLocaleString()}</div></div>
        <div><div style={lbl}>ROI</div><div style={val}>{c.spent ? `${(((c.actual_revenue || 0) / c.spent - 1) * 100).toFixed(0)}%` : '—'}</div></div>
      </div>
    </div>
  );
}
const lbl: React.CSSProperties = { fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const val: React.CSSProperties = { color: 'var(--text)', marginTop: 2 };
