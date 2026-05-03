'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate, inr } from '../../../../../components/distribution/Atoms';

interface ItemRow { sku_id: string; base_price: number; min_qty?: number; max_qty?: number | null }

export default function PriceListDetail() {
  const params = useParams();
  const id = params?.id as string;
  const [pl, setPl] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getPriceList(id); setPl(r?.data || r); } catch {} setLoading(false);
  };
  useEffect(() => { if (id) load(); }, [id]);

  const items: ItemRow[] = pl?.items || [];

  const parseCsv = (): ItemRow[] | string => {
    const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
    const out: ItemRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,\t]/).map((p) => p.trim());
      if (parts.length < 2) return `Row ${i + 1}: expected at least sku_id, base_price`;
      const sku_id = parts[0];
      const base_price = Number(parts[1]);
      if (!sku_id || Number.isNaN(base_price) || base_price < 0) return `Row ${i + 1}: invalid sku_id/base_price`;
      const min_qty = parts[2] ? parseInt(parts[2]) : 1;
      const max_qty = parts[3] ? parseInt(parts[3]) : undefined;
      out.push({ sku_id, base_price, min_qty, max_qty });
    }
    return out;
  };

  const upload = async () => {
    setMsg(null);
    const parsed = parseCsv();
    if (typeof parsed === 'string') { setMsg(parsed); return; }
    if (!parsed.length) { setMsg('Nothing to upload'); return; }
    setBusy(true);
    try {
      await api.bulkAddPriceItems(id, parsed);
      setCsv('');
      await load();
      setMsg(`✓ Uploaded ${parsed.length} item(s)`);
    } catch (e: any) {
      setMsg(`✗ ${e.message}`);
    }
    setBusy(false);
  };

  const activate = async () => {
    if (!confirm('Activate this version? Any current active list for the same class+region will be deactivated atomically.')) return;
    try { await api.activatePriceList(id); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!pl) return <div style={{ color: 'var(--primary)' }}>Price list not found</div>;

  return (
    <div>
      <PageHeader
        title={pl.name}
        subtitle={`${pl.customer_class} · ${pl.region} · v${pl.version} · valid from ${fmtDate(pl.valid_from)}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/price-lists" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All price lists</a>
            <Pill color={pl.is_active ? 'green' : 'gray'}>{pl.is_active ? 'active' : 'draft'}</Pill>
            {!pl.is_active && <Btn onClick={activate}>Activate</Btn>}
          </div>
        }
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Bulk add items</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Paste CSV: <code style={{ background: 'var(--s2)', padding: '1px 5px', borderRadius: 3 }}>sku_id, base_price, min_qty?, max_qty?</code> — one row per line. Refuses if list is already active (create a new version first).
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={'0c1428e5-ed45-4b04-81f9-34d981e6186a, 250\n7118330f-2ad7-429e-9e22-6b6cd90202c0, 280, 1\nb5d961e1-bb4f-4873-bd34-f7e9bd7d708d, 130, 1, 500'}
          style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', outline: 'none' }}
        />
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn disabled={busy || pl.is_active || !csv.trim()} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</Btn>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--primary)' }}>{msg}</span>}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{items.length} priced SKU{items.length === 1 ? '' : 's'}</div>
          <a href="/dashboard/other-management/skus" style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>Manage SKUs →</a>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>SKU ID</Th><Th style={{ textAlign: 'right' }}>Base Price</Th><Th>Min Qty</Th><Th>Max Qty</Th></tr></thead>
          <tbody>
            {items.length ? items.map((i) => (
              <tr key={i.sku_id}>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{i.sku_id}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(i.base_price)}</Td>
                <Td>{i.min_qty || 1}</Td>
                <Td>{i.max_qty ?? '∞'}</Td>
              </tr>
            )) : <tr><Td colSpan={4 as any} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No items yet — upload via the form above.</Td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
