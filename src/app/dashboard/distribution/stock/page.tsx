'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const ADJUST_REASONS = ['receipt', 'adjustment', 'damage', 'return', 'transfer', 'correction'];

function reasonColor(reason: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((reason || '').toLowerCase()) {
    case 'receipt': return 'green';
    case 'damage': return 'red';
    case 'return': return 'blue';
    case 'adjustment':
    case 'correction': return 'amber';
    default: return 'gray';
  }
}

// Type-aware column sorting for the on-hand table.
const stockVal = (s: any, key: string): unknown => {
  switch (key) {
    case 'sku': return s.sku_name;
    case 'code': return s.sku_code;
    case 'category': return s.category;
    case 'qty': return Number(s.qty);
    case 'reserved': return Number(s.reserved);
    case 'available': return Number(s.available);
    case 'updated': return s.updated_at;
    default: return s[key];
  }
};

export default function DistributorStockPage() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [distributorId, setDistributorId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);

  const [skus, setSkus] = useState<any[]>([]);

  // Receive / adjust form
  const [adj, setAdj] = useState({ sku_id: '', delta: '', reason: 'receipt', note: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Movements ledger (collapsible)
  const [showMovements, setShowMovements] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  const { sorted, sort, toggle } = useTableSort<any>(rows, stockVal, { key: 'sku', dir: 'asc' });
  const { pageItems, bar } = usePagination(sorted);

  // Distributor picker + SKU catalogue (for the adjust form).
  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
    api.getSkus({ limit: '1000' }).then((r: any) => {
      const d = r?.data?.data ?? r?.data ?? r ?? [];
      setSkus(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const loadStock = useCallback(async () => {
    if (!distributorId) { setRows([]); return; }
    setLoading(true);
    try {
      const r: any = await api.getDistributorStock(distributorId, lowOnly);
      setRows(r?.data || r || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [distributorId, lowOnly]);

  const loadMovements = useCallback(async () => {
    if (!distributorId) { setMovements([]); return; }
    setMovLoading(true);
    try {
      const r: any = await api.getStockMovements({ distributor_id: distributorId, limit: '50' });
      setMovements(r?.data || r || []);
    } catch { /* ignore */ }
    setMovLoading(false);
  }, [distributorId]);

  // Refetch on distributor / low-filter change.
  useEffect(() => { loadStock(); }, [loadStock]);
  useEffect(() => { if (showMovements) loadMovements(); }, [showMovements, loadMovements]);

  const submitAdjust = async () => {
    if (!distributorId) { setMsg({ kind: 'err', text: 'Pick a distributor first.' }); return; }
    const delta = parseInt(adj.delta, 10);
    if (!adj.sku_id) { setMsg({ kind: 'err', text: 'Select a SKU.' }); return; }
    if (!delta || Number.isNaN(delta)) { setMsg({ kind: 'err', text: 'Delta must be a non-zero integer.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const body: any = { distributor_id: distributorId, sku_id: adj.sku_id, delta, reason: adj.reason };
      if (adj.note.trim()) body.note = adj.note.trim();
      const r: any = await api.adjustStock(body);
      const d = r?.data || r;
      setMsg({ kind: 'ok', text: `Stock updated · new balance ${d?.balance ?? '—'}` });
      setAdj({ sku_id: '', delta: '', reason: 'receipt', note: '' });
      await loadStock();
      if (showMovements) await loadMovements();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Adjust failed' }); }
    setSaving(false);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  const totalQty = rows.reduce((a, s) => a + (Number(s.qty) || 0), 0);
  const totalAvail = rows.reduce((a, s) => a + (Number(s.available) || 0), 0);
  const outCount = rows.filter((s) => Number(s.available) <= 0).length;

  return (
    <div>
      <PageHeader
        title="Distributor Stock"
        subtitle="On-hand inventory per distributor. Receive stock, post adjustments, and audit every movement."
      />

      {/* Distributor picker + low filter */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: 260 }}>
            <div style={labelStyle}>Distributor</div>
            <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)} style={{ ...selStyle, minWidth: 260 }}>
              <option value="">— Select distributor —</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low / out-of-stock only
          </label>
        </div>
      </Card>

      {!distributorId ? (
        <Card><div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Select a distributor to view its stock.</div></Card>
      ) : (
        <>
          {/* Totals */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
            <StatCard label="SKUs on hand" value={rows.length} />
            <StatCard label="Total qty" value={totalQty.toLocaleString('en-IN')} />
            <StatCard label="Available" value={totalAvail.toLocaleString('en-IN')} accent="var(--green)" />
            <StatCard label="Out of stock" value={outCount} accent={outCount ? 'var(--primary)' : undefined} />
          </div>

          {/* On-hand table */}
          <Card style={{ marginBottom: 22 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th><SortLabel label="SKU" sortKey="sku" sort={sort} onToggle={toggle} /></Th>
                <Th><SortLabel label="Code" sortKey="code" sort={sort} onToggle={toggle} /></Th>
                <Th><SortLabel label="Category" sortKey="category" sort={sort} onToggle={toggle} /></Th>
                <Th style={{ textAlign: 'right' }}><SortLabel label="Qty" sortKey="qty" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th style={{ textAlign: 'right' }}><SortLabel label="Reserved" sortKey="reserved" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th style={{ textAlign: 'right' }}><SortLabel label="Available" sortKey="available" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th><SortLabel label="Updated" sortKey="updated" sort={sort} onToggle={toggle} /></Th>
              </tr></thead>
              <tbody>
                {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
                  pageItems.map((s) => {
                    const out = Number(s.available) <= 0;
                    return (
                      <tr key={s.id} style={out ? { background: 'rgba(224,30,44,0.06)' } : undefined}>
                        <Td style={{ fontWeight: 700 }}>{s.sku_name || '—'}</Td>
                        <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{s.sku_code || '—'}</Td>
                        <Td>{s.category || '—'}</Td>
                        <Td style={{ textAlign: 'right' }}>{Number(s.qty ?? 0).toLocaleString('en-IN')}</Td>
                        <Td style={{ textAlign: 'right' }}>{Number(s.reserved ?? 0).toLocaleString('en-IN')}</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 700, color: out ? 'var(--primary)' : 'var(--green)' }}>{Number(s.available ?? 0).toLocaleString('en-IN')}</Td>
                        <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.updated_at ? fmtDate(s.updated_at) : '—'}</Td>
                      </tr>
                    );
                  })}
                {!loading && !rows.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{lowOnly ? 'No low / out-of-stock SKUs.' : 'No stock recorded for this distributor.'}</Td></tr>}
              </tbody>
            </table>
          </Card>
          {rows.length > 0 && bar}

          {/* Receive / adjust stock */}
          <Card style={{ marginTop: 22, marginBottom: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Receive / adjust stock</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={labelStyle}>SKU *</div>
                {skus.length ? (
                  <select value={adj.sku_id} onChange={(e) => setAdj({ ...adj, sku_id: e.target.value })} style={inputStyle}>
                    <option value="">— Select SKU —</option>
                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
                  </select>
                ) : (
                  <input value={adj.sku_id} placeholder="SKU UUID" onChange={(e) => setAdj({ ...adj, sku_id: e.target.value })} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
                )}
              </div>
              <div>
                <div style={labelStyle}>Delta *</div>
                <input value={adj.delta} placeholder="e.g. 100 or -5" onChange={(e) => setAdj({ ...adj, delta: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Reason</div>
                <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} style={inputStyle}>
                  {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <div style={labelStyle}>Note</div>
                <input value={adj.note} placeholder="Optional — GRN #, damage details, etc." onChange={(e) => setAdj({ ...adj, note: e.target.value })} style={inputStyle} />
              </div>
            </div>
            {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--primary)' }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</div>}
            <div style={{ marginTop: 14 }}>
              <Btn disabled={saving} onClick={submitAdjust}>{saving ? 'Posting…' : 'Post movement'}</Btn>
            </div>
          </Card>

          {/* Movements ledger (collapsible) */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Movements ledger</div>
              <Btn variant="ghost" onClick={() => setShowMovements((v) => !v)}>{showMovements ? 'Hide' : 'Show'}</Btn>
            </div>
            {showMovements && (
              <div style={{ marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <Th>When</Th>
                    <Th>SKU</Th>
                    <Th style={{ textAlign: 'right' }}>Delta</Th>
                    <Th>Reason</Th>
                    <Th style={{ textAlign: 'right' }}>Balance after</Th>
                    <Th>Note</Th>
                  </tr></thead>
                  <tbody>
                    {movLoading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
                      movements.map((m) => {
                        const delta = Number(m.delta) || 0;
                        return (
                          <tr key={m.id}>
                            <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{m.created_at ? fmtDate(m.created_at) : '—'}</Td>
                            <Td style={{ fontSize: 12 }}>{m.skus?.name || '—'}{m.skus?.sku_code ? <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}> · {m.skus.sku_code}</span> : null}</Td>
                            <Td style={{ textAlign: 'right', fontWeight: 700, color: delta >= 0 ? 'var(--green)' : 'var(--primary)' }}>{delta > 0 ? `+${delta}` : delta}</Td>
                            <Td>{m.reason ? <Pill color={reasonColor(m.reason)}>{m.reason}</Pill> : '—'}</Td>
                            <Td style={{ textAlign: 'right' }}>{m.balance_after != null ? Number(m.balance_after).toLocaleString('en-IN') : '—'}</Td>
                            <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{m.note || '—'}</Td>
                          </tr>
                        );
                      })}
                    {!movLoading && !movements.length && <tr><Td colSpan={6 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No movements recorded.</Td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
