'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, fmtDate } from '../../../../../components/distribution/Atoms';
import SchemeBuilder, { fromScheme, schemeToText, targetingToText, SCHEME_TYPE_LABEL, SchemeType } from '../../../../../components/distribution/SchemeBuilder';

export default function SchemeDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [sch, setSch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Name resolvers so the summary + preview read in plain language.
  const [skus, setSkus] = useState<Array<{ id: string; name?: string; sku_code?: string }>>([]);
  const [outlets, setOutlets] = useState<Array<{ id: string; name: string }>>([]);
  const skuName = useMemo(() => (id2: string) => { const x = skus.find((k) => k.id === id2); return x ? (x.name || x.sku_code || id2) : (id2 ? id2.slice(0, 8) : '—'); }, [skus]);
  const outletName = useMemo(() => (id2: string) => outlets.find((o) => o.id === id2)?.name || id2, [outlets]);

  // Preview tester
  const [outletId, setOutletId] = useState('');
  const [rows, setRows] = useState<Array<{ sku_id: string; qty: string }>>([{ sku_id: '', qty: '1' }]);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getScheme(id); setSch(r?.data || r); } catch {}
    setLoading(false);
  };
  useEffect(() => {
    if (!id) return;
    load();
    (async () => {
      try { const r: any = await api.getSkus(); setSkus((r?.data ?? r ?? []) as any[]); } catch {}
      try { const r: any = await api.getStores(); setOutlets(((r?.data ?? r ?? []) as any[]).map((x) => ({ id: x.id, name: x.name || x.store_name || x.id }))); } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const deactivate = async () => {
    if (!confirm('Retire this scheme version? It will stop applying to new orders.')) return;
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
      const items = rows.filter((r) => r.sku_id && Number(r.qty) > 0).map((r) => ({ sku_id: r.sku_id, qty: parseInt(r.qty) }));
      if (!items.length) throw new Error('Add at least one SKU with a quantity.');
      const r: any = await api.previewScheme({ outlet_id: outletId, items });
      setPreview(r?.data || r);
    } catch (e: any) { setMsg(e.message || 'Preview failed'); }
    setPreviewing(false);
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!sch) return <div style={{ color: 'var(--primary)' }}>Scheme not found</div>;

  if (editing) {
    return (
      <div>
        <PageHeader title={`Edit ${sch.name}`} subtitle="Saving creates a new active version; the current one is retired automatically." />
        <Card>
          <SchemeBuilder
            initial={fromScheme(sch)}
            onCancel={() => setEditing(false)}
            onSaved={() => router.push('/dashboard/distribution/schemes')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={sch.name}
        subtitle={`${sch.code} · v${sch.version} · priority ${sch.priority}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/schemes" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All schemes</a>
            <Pill color={sch.is_active ? 'green' : 'gray'}>{sch.is_active ? 'active' : 'retired'}</Pill>
            <Btn variant="ghost" onClick={() => setEditing(true)}>Edit</Btn>
            {sch.is_active && <Btn variant="danger" onClick={deactivate}>Retire</Btn>}
          </div>
        }
      />

      {/* Plain-language summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 22 }}>
        <Card>
          <div style={{ fontSize: 11, marginBottom: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>What the offer gives</div>
          <div style={{ marginBottom: 8 }}><Pill color="blue">{SCHEME_TYPE_LABEL[sch.type as SchemeType] || sch.type}</Pill></div>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text)' }}>{schemeToText(sch, skuName)}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, marginBottom: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>Who gets it</div>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text)' }}>{targetingToText(sch, outletName)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>{sch.stackable ? 'Can combine with other schemes.' : 'Does not combine with other schemes.'}</div>
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

      {/* Preview tester */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Try it on a sample order</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Pick an outlet and a few items to see exactly what free goods and discounts this scheme (and any others) would apply — before it goes live.</div>

        <div style={{ maxWidth: 420, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outlet</div>
          <select value={outletId} onChange={(e) => setOutletId(e.target.value)} style={selStyle}>
            <option value="">Select an outlet…</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Items</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: 8, alignItems: 'center' }}>
              <select value={row.sku_id} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, sku_id: e.target.value } : r))} style={selStyle}>
                <option value="">Select SKU…</option>
                {skus.map((k) => <option key={k.id} value={k.id}>{k.name || k.sku_code}</option>)}
              </select>
              <input value={row.qty} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, qty: e.target.value.replace(/[^0-9]/g, '') } : r))} placeholder="Qty" style={selStyle} />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} style={ghostBtn}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows([...rows, { sku_id: '', qty: '1' }])} style={{ ...ghostBtn, marginTop: 8 }}>+ Add item</button>

        <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn disabled={previewing || !outletId || !rows.some((r) => r.sku_id)} onClick={runPreview}>{previewing ? 'Checking…' : 'Preview offers'}</Btn>
          {msg && <span style={{ fontSize: 12, color: 'var(--primary)' }}>{msg}</span>}
        </div>

        {preview && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Schemes that would apply</div>
            {(preview.applied_schemes || []).length ? (preview.applied_schemes || []).map((a: any, i: number) => (
              <div key={i} style={{ marginBottom: 6, fontSize: 13, color: 'var(--text)' }}>
                <Pill color="green">{a.scheme_code || a.scheme_type}</Pill>{' '}
                {a.outputs?.type === 'BXGY' ? `${a.outputs.sets} free set(s)` :
                  a.outputs?.type === 'QPS' ? `${a.outputs.slab?.free_qty ?? ''} free` :
                  a.outputs?.type === 'SLAB_DISCOUNT' ? `up to ${a.outputs.percent_max}% off` :
                  a.outputs?.cut ? `discount applied` : ''}
              </div>
            )) : <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No schemes matched this cart.</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

const selStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
const ghostBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-dim)', cursor: 'pointer', padding: '8px 12px', fontSize: 12 };
