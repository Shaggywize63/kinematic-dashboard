'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Btn, Th, Td } from '../../../../../components/distribution/Atoms';

interface ItemRow { sku_id: string; loaded_qty: string }

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function NewVanLoadPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);

  const [form, setForm] = useState({ user_id: '', distributor_id: '', route_plan_id: '', load_date: todayISO(), notes: '' });
  const [items, setItems] = useState<ItemRow[]>([{ sku_id: '', loaded_qty: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getUsers({ limit: '500' }).then((r: any) => setUsers(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
    api.getSkus({ limit: '1000' }).then((r: any) => {
      const d = r?.data?.data ?? r?.data ?? r ?? [];
      setSkus(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i: number, k: keyof ItemRow, v: string) => setItems((rows) => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setItems((rows) => [...rows, { sku_id: '', loaded_qty: '' }]);
  const removeRow = (i: number) => setItems((rows) => rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);

  const submit = async () => {
    const cleanItems = items
      .filter((r) => r.sku_id.trim())
      .map((r) => ({ sku_id: r.sku_id.trim(), loaded_qty: parseInt(r.loaded_qty, 10) || 0 }));
    if (!cleanItems.length) { setErr('Add at least one SKU line.'); return; }
    if (cleanItems.some((r) => r.loaded_qty < 0)) { setErr('Loaded quantity cannot be negative.'); return; }
    setBusy(true); setErr(null);
    try {
      const body: any = { items: cleanItems };
      if (form.user_id.trim()) body.user_id = form.user_id.trim();
      if (form.distributor_id.trim()) body.distributor_id = form.distributor_id.trim();
      if (form.route_plan_id.trim()) body.route_plan_id = form.route_plan_id.trim();
      if (form.load_date) body.load_date = form.load_date;
      if (form.notes.trim()) body.notes = form.notes.trim();
      const r: any = await api.createVanLoad(body);
      const created = r?.data || r;
      if (created?.id) router.push(`/dashboard/distribution/van-loads/${created.id}`);
      else router.push('/dashboard/distribution/van-loads');
    } catch (e: any) {
      setErr(e?.message || 'Failed to create van load');
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div>
      <PageHeader
        title="New van load"
        subtitle="Load stock out to a van / route. Reconcile returns and damage on the detail page."
        right={<a href="/dashboard/distribution/van-loads" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All loads</a>}
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div>
            <div style={labelStyle}>Rep</div>
            {users.length ? (
              <select value={form.user_id} onChange={(e) => set('user_id', e.target.value)} style={inputStyle}>
                <option value="">— Select rep —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.full_name || u.email || u.id}</option>)}
              </select>
            ) : (
              <input value={form.user_id} placeholder="Rep user UUID" onChange={(e) => set('user_id', e.target.value)} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
            )}
          </div>
          <div>
            <div style={labelStyle}>Distributor</div>
            <select value={form.distributor_id} onChange={(e) => set('distributor_id', e.target.value)} style={inputStyle}>
              <option value="">— Optional —</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Load date</div>
            <input type="date" value={form.load_date} onChange={(e) => set('load_date', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Route plan ID</div>
            <input value={form.route_plan_id} placeholder="Optional" onChange={(e) => set('route_plan_id', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={labelStyle}>Notes</div>
            <input value={form.notes} placeholder="Optional" onChange={(e) => set('notes', e.target.value)} style={inputStyle} />
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Items to load</div>
          <Btn variant="ghost" onClick={addRow}>+ Add SKU</Btn>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>SKU</Th>
            <Th style={{ width: 160 }}>Loaded qty</Th>
            <Th style={{ width: 60 }} />
          </tr></thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i}>
                <Td>
                  {skus.length ? (
                    <select value={row.sku_id} onChange={(e) => setItem(i, 'sku_id', e.target.value)} style={inputStyle}>
                      <option value="">— Select SKU —</option>
                      {skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
                    </select>
                  ) : (
                    <input value={row.sku_id} placeholder="SKU UUID" onChange={(e) => setItem(i, 'sku_id', e.target.value)} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
                  )}
                </Td>
                <Td><input value={row.loaded_qty} placeholder="0" onChange={(e) => setItem(i, 'loaded_qty', e.target.value)} style={inputStyle} /></Td>
                <Td style={{ textAlign: 'right' }}>
                  <Btn variant="ghost" onClick={() => removeRow(i)} disabled={items.length <= 1}>✕</Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {err && <div style={{ marginTop: 12, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <Btn disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create van load'}</Btn>
          <a href="/dashboard/distribution/van-loads"><Btn variant="ghost">Cancel</Btn></a>
        </div>
      </Card>
    </div>
  );
}
