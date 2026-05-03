'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, fmtDate } from '../../../../../components/distribution/Atoms';

export default function SchemeDetail() {
  const params = useParams();
  const id = params?.id as string;
  const [sch, setSch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Preview tester
  const [outletId, setOutletId] = useState('');
  const [items, setItems] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getScheme(id); setSch(r?.data || r); } catch {} setLoading(false);
  };
  useEffect(() => { if (id) load(); }, [id]);

  const deactivate = async () => {
    if (!confirm('Deactivate this scheme version?')) return;
    try {
      const r = await fetch(`/api/v1/distribution/schemes/${id}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('kinematic_token')}` },
      });
      if (!r.ok) throw new Error(await r.text());
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const runPreview = async () => {
    setMsg(null); setPreview(null); setPreviewing(true);
    try {
      const lines = items.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [sku_id, qty] = l.split(/[,\t]/).map((p) => p.trim());
        return { sku_id, qty: parseInt(qty) };
      });
      if (lines.some((l) => !l.sku_id || !l.qty)) throw new Error('Each line must be: sku_id, qty');
      const r: any = await api.previewScheme({ outlet_id: outletId, items: lines });
      setPreview(r?.data || r);
    } catch (e: any) {
      setMsg(e.message || 'Preview failed');
    }
    setPreviewing(false);
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!sch) return <div style={{ color: 'var(--primary)' }}>Scheme not found</div>;

  return (
    <div>
      <PageHeader
        title={sch.name}
        subtitle={`${sch.code} · ${sch.type} · v${sch.version} · priority ${sch.priority}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/schemes" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All schemes</a>
            <Pill color={sch.is_active ? 'green' : 'gray'}>{sch.is_active ? 'active' : 'retired'}</Pill>
            {sch.is_active && <Btn variant="danger" onClick={deactivate}>Retire</Btn>}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 22 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Targeting</div>
          <pre style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 11, lineHeight: 1.5, fontFamily: 'JetBrains Mono, monospace', overflow: 'auto' }}>
{JSON.stringify(sch.targeting || {}, null, 2)}
          </pre>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Rules</div>
          <pre style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 11, lineHeight: 1.5, fontFamily: 'JetBrains Mono, monospace', overflow: 'auto' }}>
{JSON.stringify(sch.rules || {}, null, 2)}
          </pre>
        </Card>
      </div>

      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Validity</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
          <div><div style={{ color: 'var(--text-dim)' }}>Valid from</div><div style={{ fontWeight: 700, marginTop: 2 }}>{fmtDate(sch.valid_from)}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Valid to</div><div style={{ fontWeight: 700, marginTop: 2 }}>{sch.valid_to ? fmtDate(sch.valid_to) : '∞'}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Stackable</div><div style={{ fontWeight: 700, marginTop: 2 }}>{sch.stackable ? 'yes' : 'no'}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Created</div><div style={{ fontWeight: 700, marginTop: 2 }}>{fmtDate(sch.created_at)}</div></div>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Preview against a cart</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>Dry-runs the scheme engine against a sample cart so you can confirm slabs and free-goods before publishing.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outlet ID</div>
            <input value={outletId} onChange={(e) => setOutletId(e.target.value)} placeholder="outlet UUID"
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cart (sku_id, qty per line)</div>
            <textarea value={items} onChange={(e) => setItems(e.target.value)} rows={4}
              placeholder={'0c1428e5-..., 12\nb5d961e1-..., 10'}
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn disabled={previewing || !outletId || !items.trim()} onClick={runPreview}>{previewing ? 'Pricing…' : 'Run preview'}</Btn>
          {msg && <span style={{ fontSize: 12, color: 'var(--primary)' }}>{msg}</span>}
        </div>

        {preview && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Applied schemes</div>
            {(preview.applied_schemes || []).length ? (preview.applied_schemes || []).map((a: any, i: number) => (
              <div key={i} style={{ marginBottom: 4, fontSize: 12 }}>
                <Pill color="blue">{a.scheme_type || a.scheme_code}</Pill> v{a.scheme_version} · {JSON.stringify(a.outputs)}
              </div>
            )) : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None matched</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
