'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, Th, Td, StatCard, fmtDate } from '../../../../../components/distribution/Atoms';

function loadStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'open': return 'amber';
    case 'reconciled': return 'blue';
    case 'closed': return 'green';
    default: return 'gray';
  }
}

interface RecRow { returned: string; damaged: string }

export default function VanLoadDetail() {
  const params = useParams();
  const id = params?.id as string;
  const [load, setLoad] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [users, setUsers] = useState<Record<string, string>>({});
  const [dists, setDists] = useState<Record<string, string>>({});

  // Reconcile form state, keyed by sku_id.
  const [rec, setRec] = useState<Record<string, RecRow>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api.getUsers({ limit: '500' }).then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.data || []);
      const m: Record<string, string> = {};
      arr.forEach((u: any) => { m[u.id] = u.name || u.full_name || u.email || u.id; });
      setUsers(m);
    }).catch(() => {});
    api.getDistributors().then((r: any) => {
      const arr = r?.data || r || [];
      const m: Record<string, string> = {};
      arr.forEach((d: any) => { m[d.id] = d.name || d.code || d.id; });
      setDists(m);
    }).catch(() => {});
  }, []);

  const fetchLoad = useCallback(async () => {
    try {
      const r: any = await api.getVanLoad(id);
      const d = r?.data || r;
      setLoad(d);
      const seed: Record<string, RecRow> = {};
      (d?.items || []).forEach((it: any) => {
        seed[it.sku_id] = {
          returned: it.returned_qty != null ? String(it.returned_qty) : '',
          damaged: it.damaged_qty != null ? String(it.damaged_qty) : '',
        };
      });
      setRec(seed);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);
  useEffect(() => { if (id) fetchLoad(); }, [id, fetchLoad]);

  const setRecCell = (skuId: string, k: keyof RecRow, v: string) =>
    setRec((r) => ({ ...r, [skuId]: { ...(r[skuId] || { returned: '', damaged: '' }), [k]: v } }));

  const submitReconcile = async () => {
    if (!load?.items?.length) return;
    setSaving(true); setMsg(null);
    try {
      const items = load.items.map((it: any) => {
        const row = rec[it.sku_id] || { returned: '', damaged: '' };
        const out: any = { sku_id: it.sku_id };
        if (row.returned.trim() !== '') out.returned_qty = parseInt(row.returned, 10) || 0;
        if (row.damaged.trim() !== '') out.damaged_qty = parseInt(row.damaged, 10) || 0;
        return out;
      });
      const body: any = { items };
      if (notes.trim()) body.notes = notes.trim();
      await api.reconcileVanLoad(id, body);
      setNotes('');
      setMsg({ kind: 'ok', text: 'Reconciliation saved.' });
      await fetchLoad();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Reconcile failed' }); }
    setSaving(false);
  };

  const closeLoad = async () => {
    if (!confirm('Close this van load? Returns settle back to distributor stock and the load can no longer be edited.')) return;
    setClosing(true); setMsg(null);
    try {
      await api.closeVanLoad(id);
      setMsg({ kind: 'ok', text: 'Load closed.' });
      await fetchLoad();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Close failed' }); }
    setClosing(false);
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!load) return <div style={{ color: 'var(--primary)' }}>Van load not found</div>;

  const status = (load.status || 'open').toLowerCase();
  const isClosed = status === 'closed';
  const items: any[] = load.items || [];
  const totals = load.totals || {};
  const repName = load.user_name || users[load.user_id] || load.user_id || '—';
  const distName = load.distributor_name || dists[load.distributor_id] || load.distributor_id || '—';

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div>
      <PageHeader
        title={`Van load · ${load.load_date ? fmtDate(load.load_date).split(',')[0] : '—'}`}
        subtitle={`${repName}${distName && distName !== '—' ? ' · ' + distName : ''}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/van-loads" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All loads</a>
            <Pill color={loadStatusColor(status)}>{status}</Pill>
          </div>
        }
      />

      {msg && <div style={{ marginBottom: 14, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--primary)' }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</div>}

      {/* Totals */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Loaded" value={Number(totals.loaded || 0).toLocaleString('en-IN')} />
        <StatCard label="Sold" value={Number(totals.sold || 0).toLocaleString('en-IN')} accent="var(--green)" />
        <StatCard label="Returned" value={Number(totals.returned || 0).toLocaleString('en-IN')} accent="var(--accent)" />
        <StatCard label="Damaged" value={Number(totals.damaged || 0).toLocaleString('en-IN')} accent={Number(totals.damaged) > 0 ? 'var(--primary)' : undefined} />
      </div>

      {/* Meta */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, fontSize: 12 }}>
          <div><div style={{ color: 'var(--text-dim)' }}>Load date</div><div style={{ fontWeight: 700, marginTop: 2 }}>{load.load_date ? fmtDate(load.load_date).split(',')[0] : '—'}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Opened</div><div style={{ fontWeight: 700, marginTop: 2 }}>{load.opened_at ? fmtDate(load.opened_at) : '—'}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Closed</div><div style={{ fontWeight: 700, marginTop: 2 }}>{load.closed_at ? fmtDate(load.closed_at) : '—'}</div></div>
          <div><div style={{ color: 'var(--text-dim)' }}>Route plan</div><div style={{ fontWeight: 700, marginTop: 2 }}>{load.route_plan_id || '—'}</div></div>
          {load.notes && <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--text-dim)' }}>Notes</div><div style={{ marginTop: 2 }}>{load.notes}</div></div>}
        </div>
      </Card>

      {/* Items */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>SKU</Th>
            <Th>Code</Th>
            <Th style={{ textAlign: 'right' }}>Loaded</Th>
            <Th style={{ textAlign: 'right' }}>Sold</Th>
            <Th style={{ textAlign: 'right' }}>Returned</Th>
            <Th style={{ textAlign: 'right' }}>Damaged</Th>
          </tr></thead>
          <tbody>
            {items.length ? items.map((it) => (
              <tr key={it.id || it.sku_id}>
                <Td style={{ fontWeight: 700 }}>{it.skus?.name || '—'}</Td>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{it.skus?.sku_code || '—'}</Td>
                <Td style={{ textAlign: 'right' }}>{Number(it.loaded_qty ?? 0).toLocaleString('en-IN')}</Td>
                <Td style={{ textAlign: 'right' }}>{Number(it.sold_qty ?? 0).toLocaleString('en-IN')}</Td>
                <Td style={{ textAlign: 'right' }}>{Number(it.returned_qty ?? 0).toLocaleString('en-IN')}</Td>
                <Td style={{ textAlign: 'right', color: Number(it.damaged_qty) > 0 ? 'var(--primary)' : undefined }}>{Number(it.damaged_qty ?? 0).toLocaleString('en-IN')}</Td>
              </tr>
            )) : <tr><Td colSpan={6 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No items on this load.</Td></tr>}
          </tbody>
        </table>
      </Card>

      {/* Reconcile + Close (while not closed) */}
      {!isClosed && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Reconcile</div>
            <Btn variant="danger" disabled={closing} onClick={closeLoad}>{closing ? 'Closing…' : 'Close load'}</Btn>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>Enter returned and damaged quantities per SKU. Sold is derived (loaded − returned − damaged).</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>SKU</Th>
              <Th style={{ textAlign: 'right' }}>Loaded</Th>
              <Th style={{ width: 140 }}>Returned</Th>
              <Th style={{ width: 140 }}>Damaged</Th>
            </tr></thead>
            <tbody>
              {items.length ? items.map((it) => (
                <tr key={it.id || it.sku_id}>
                  <Td style={{ fontWeight: 700 }}>{it.skus?.name || '—'}{it.skus?.sku_code ? <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400 }}> · {it.skus.sku_code}</span> : null}</Td>
                  <Td style={{ textAlign: 'right' }}>{Number(it.loaded_qty ?? 0).toLocaleString('en-IN')}</Td>
                  <Td><input value={rec[it.sku_id]?.returned ?? ''} placeholder="0" onChange={(e) => setRecCell(it.sku_id, 'returned', e.target.value)} style={inputStyle} /></Td>
                  <Td><input value={rec[it.sku_id]?.damaged ?? ''} placeholder="0" onChange={(e) => setRecCell(it.sku_id, 'damaged', e.target.value)} style={inputStyle} /></Td>
                </tr>
              )) : <tr><Td colSpan={4 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No items to reconcile.</Td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 14 }}>
            <div style={labelStyle}>Notes</div>
            <input value={notes} placeholder="Optional reconciliation note" onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn disabled={saving || !items.length} onClick={submitReconcile}>{saving ? 'Saving…' : 'Save reconciliation'}</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
