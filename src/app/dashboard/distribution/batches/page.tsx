'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, fmtDate, inr } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';
import { useAuth } from '../../../../hooks/useAuth';
import { userHasModule } from '../../../../lib/auth';

/**
 * Batch & Expiry (FIFO/FEFO) + Goods Receiving.
 *
 * Per-GRN stock layers for a distributor. Receive (GRN) posts a new layer;
 * Consume draws layers down by FEFO (earliest-expiry-first, default) or FIFO
 * (earliest-received-first) and returns the consumed layers + a valuation.
 * The KPI strip is driven by the expiry-report for the selected distributor.
 */

interface BatchRow {
  id: string;
  batch_no: string | null;
  sku_id: string;
  sku_name: string | null;
  sku_code: string | null;
  distributor_id: string;
  expiry_date: string | null;
  mfg_date: string | null;
  received_at: string | null;
  qty_received: number | null;
  qty_remaining: number | null;
  unit_cost: number | null;
  status: 'active' | 'near_expiry' | 'expired';
  days_to_expiry: number | null;
}

interface ConsumedLayer { batch_id: string; batch_no: string | null; qty: number; unit_cost: number | null; expiry_date: string | null; }

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'near_expiry', label: 'Near expiry' },
  { value: 'expired', label: 'Expired' },
];

const CONSUME_REASONS = ['sale', 'consume', 'damage', 'van_load'];

function statusColor(s: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((s || '').toLowerCase()) {
    case 'active': return 'green';
    case 'near_expiry': return 'amber';
    case 'expired': return 'red';
    default: return 'gray';
  }
}
function statusLabel(s: string): string {
  switch ((s || '').toLowerCase()) {
    case 'near_expiry': return 'near expiry';
    default: return s;
  }
}

// Human "days to expiry" hint.
function daysHint(d: number | null): { text: string; color: string } {
  if (d == null) return { text: '—', color: 'var(--text-dim)' };
  if (d < 0) return { text: `${Math.abs(d)}d ago`, color: 'var(--primary)' };
  if (d === 0) return { text: 'today', color: 'var(--primary)' };
  return { text: `in ${d}d`, color: d <= 30 ? '#F59E0B' : 'var(--text-dim)' };
}

// Type-aware column sorting for the batch table.
const batchVal = (b: BatchRow, key: string): unknown => {
  switch (key) {
    case 'sku': return b.sku_name;
    case 'code': return b.sku_code;
    case 'batch': return b.batch_no;
    case 'expiry': return b.expiry_date || '';
    case 'days': return b.days_to_expiry;
    case 'received': return b.received_at || '';
    case 'remaining': return Number(b.qty_remaining ?? 0);
    case 'cost': return Number(b.unit_cost ?? 0);
    case 'status': return b.status;
    default: return (b as any)[key];
  }
};

export default function BatchExpiryPage() {
  const { user } = useAuth();
  const canReceive = userHasModule(user, 'distribution_receiving');

  const [distributors, setDistributors] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);

  const [distributorId, setDistributorId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [status, setStatus] = useState('all');
  const [nearDays, setNearDays] = useState('30');
  const [includeEmpty, setIncludeEmpty] = useState(false);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [report, setReport] = useState<{ near_expiry: BatchRow[]; expired: BatchRow[] }>({ near_expiry: [], expired: [] });
  const [loading, setLoading] = useState(false);

  // Receive (GRN) modal
  const [showReceive, setShowReceive] = useState(false);
  const blankReceive = { distributor_id: '', sku_id: '', qty: '', batch_no: '', expiry_date: '', mfg_date: '', unit_cost: '', reference: '' };
  const [rcv, setRcv] = useState({ ...blankReceive });
  const [rcvSaving, setRcvSaving] = useState(false);
  const [rcvErr, setRcvErr] = useState('');

  // Consume modal
  const [showConsume, setShowConsume] = useState(false);
  const blankConsume = { distributor_id: '', sku_id: '', sku_name: '', qty: '', strategy: 'fefo', reason: 'sale', note: '' };
  const [csm, setCsm] = useState({ ...blankConsume });
  const [csmSaving, setCsmSaving] = useState(false);
  const [csmErr, setCsmErr] = useState('');

  const { sorted, sort, toggle } = useTableSort<BatchRow>(rows, batchVal, { key: 'expiry', dir: 'asc' });
  const { pageItems, bar } = usePagination(sorted);

  // Distributor picker + SKU catalogue (for filters + forms).
  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
    api.getSkus({ limit: '1000' }).then((r: any) => {
      const d = r?.data?.data ?? r?.data ?? r ?? [];
      setSkus(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!distributorId) { setRows([]); setReport({ near_expiry: [], expired: [] }); return; }
    setLoading(true);
    try {
      const params: Record<string, string> = { distributor_id: distributorId, status };
      if (skuId) params.sku_id = skuId;
      if (nearDays.trim()) params.near_days = nearDays.trim();
      if (includeEmpty) params.include_empty = '1';
      const [batchesRes, reportRes] = await Promise.all([
        api.getBatches(params) as Promise<any>,
        api.getBatchExpiryReport({ distributor_id: distributorId, ...(nearDays.trim() ? { within_days: nearDays.trim() } : {}) }) as Promise<any>,
      ]);
      const b = batchesRes?.data ?? batchesRes ?? [];
      setRows(Array.isArray(b) ? b : []);
      const rep = reportRes?.data ?? reportRes ?? {};
      setReport({ near_expiry: Array.isArray(rep?.near_expiry) ? rep.near_expiry : [], expired: Array.isArray(rep?.expired) ? rep.expired : [] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load batches');
    }
    setLoading(false);
  }, [distributorId, skuId, status, nearDays, includeEmpty]);

  // Refetch whenever any filter changes.
  useEffect(() => { load(); }, [load]);

  const openReceive = () => {
    setRcv({ ...blankReceive, distributor_id: distributorId, sku_id: skuId });
    setRcvErr('');
    setShowReceive(true);
  };

  const submitReceive = async () => {
    if (!rcv.distributor_id) { setRcvErr('Pick a distributor.'); return; }
    if (!rcv.sku_id) { setRcvErr('Select a SKU.'); return; }
    const qty = parseInt(rcv.qty, 10);
    if (!qty || qty <= 0) { setRcvErr('Qty must be a positive integer.'); return; }
    setRcvSaving(true); setRcvErr('');
    try {
      const body: any = { distributor_id: rcv.distributor_id, sku_id: rcv.sku_id, qty };
      if (rcv.batch_no.trim()) body.batch_no = rcv.batch_no.trim();
      if (rcv.expiry_date) body.expiry_date = rcv.expiry_date;
      if (rcv.mfg_date) body.mfg_date = rcv.mfg_date;
      if (rcv.unit_cost.trim()) body.unit_cost = parseFloat(rcv.unit_cost);
      if (rcv.reference.trim()) body.reference = rcv.reference.trim();
      const r: any = await api.receiveBatch(body);
      const d = r?.data ?? r ?? {};
      const bal = d?.balance;
      const bNo = d?.batch?.batch_no;
      toast.success(`GRN posted${bNo ? ` · batch ${bNo}` : ''}${bal != null ? ` · balance ${Number(bal).toLocaleString('en-IN')}` : ''}`);
      setShowReceive(false);
      // Keep the distributor in view if the GRN matched the current filter.
      if (rcv.distributor_id === distributorId) await load();
      else { setDistributorId(rcv.distributor_id); }
    } catch (e: any) { setRcvErr(e?.response?.data?.error || e?.message || 'Receiving failed'); }
    setRcvSaving(false);
  };

  const openConsume = (row?: BatchRow) => {
    setCsm({
      ...blankConsume,
      distributor_id: distributorId,
      sku_id: row?.sku_id || skuId,
      sku_name: row ? `${row.sku_name || ''}${row.sku_code ? ` · ${row.sku_code}` : ''}` : '',
    });
    setCsmErr('');
    setShowConsume(true);
  };

  const submitConsume = async () => {
    if (!csm.distributor_id) { setCsmErr('Pick a distributor.'); return; }
    if (!csm.sku_id) { setCsmErr('Select a SKU.'); return; }
    const qty = parseInt(csm.qty, 10);
    if (!qty || qty <= 0) { setCsmErr('Qty must be a positive integer.'); return; }
    setCsmSaving(true); setCsmErr('');
    try {
      const body: any = { distributor_id: csm.distributor_id, sku_id: csm.sku_id, qty, strategy: csm.strategy, reason: csm.reason };
      if (csm.note.trim()) body.note = csm.note.trim();
      const r: any = await api.consumeBatch(body);
      const d = r?.data ?? r ?? {};
      const consumed: ConsumedLayer[] = Array.isArray(d?.consumed) ? d.consumed : [];
      const totalCost = d?.totalCost;
      const bal = d?.balance;
      const layerText = consumed.length
        ? consumed.map((c) => `${c.batch_no || c.batch_id?.slice(0, 8) || '—'}×${c.qty}`).join(', ')
        : '—';
      toast.success(
        `${csm.strategy.toUpperCase()} consumed ${qty} across ${consumed.length} layer${consumed.length === 1 ? '' : 's'}` +
          `${totalCost != null ? ` · cost ${inr(Number(totalCost))}` : ''}` +
          `${bal != null ? ` · balance ${Number(bal).toLocaleString('en-IN')}` : ''}`,
        { description: `Layers: ${layerText}` },
      );
      setShowConsume(false);
      await load();
    } catch (e: any) { setCsmErr(e?.response?.data?.error || e?.message || 'Consume failed'); }
    setCsmSaving(false);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  const totalRemaining = rows.reduce((a, b) => a + (Number(b.qty_remaining) || 0), 0);
  const stockValue = rows.reduce((a, b) => a + (Number(b.qty_remaining) || 0) * (Number(b.unit_cost) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Batch & Expiry"
        subtitle="Per-GRN stock layers with FIFO/FEFO draw-down. Receive goods, track expiry, and consume the right layer first."
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            {canReceive && <Btn onClick={openReceive}>Receive (GRN)</Btn>}
            <Btn variant="ghost" onClick={() => openConsume()}>Consume</Btn>
          </div>
        }
      />

      {/* Filters */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: 240 }}>
            <div style={labelStyle}>Distributor</div>
            <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)} style={{ ...selStyle, minWidth: 240 }}>
              <option value="">— Select distributor —</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>SKU</div>
            <select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              <option value="">All SKUs</option>
              {skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <div style={labelStyle}>Near-expiry (days)</div>
            <input value={nearDays} inputMode="numeric" placeholder="30" onChange={(e) => setNearDays(e.target.value.replace(/[^\d]/g, ''))} style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} />
            Include emptied layers
          </label>
        </div>
      </Card>

      {!distributorId ? (
        <Card><div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Select a distributor to view its batches.</div></Card>
      ) : (
        <>
          {/* KPI strip (from the expiry-report) */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
            <StatCard label="Batches" value={rows.length} />
            <StatCard label="Near expiry" value={report.near_expiry.length} accent={report.near_expiry.length ? '#F59E0B' : undefined} hint={`within ${nearDays || '30'} days`} />
            <StatCard label="Expired" value={report.expired.length} accent={report.expired.length ? 'var(--primary)' : undefined} />
            <StatCard label="Qty remaining" value={totalRemaining.toLocaleString('en-IN')} />
            <StatCard label="Stock value" value={inr(stockValue)} accent="var(--green)" />
          </div>

          {/* Batch table */}
          <Card style={{ marginBottom: 22 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead><tr>
                  <Th><SortLabel label="SKU" sortKey="sku" sort={sort} onToggle={toggle} /></Th>
                  <Th><SortLabel label="Batch" sortKey="batch" sort={sort} onToggle={toggle} /></Th>
                  <Th><SortLabel label="Expiry" sortKey="expiry" sort={sort} onToggle={toggle} /></Th>
                  <Th><SortLabel label="Received" sortKey="received" sort={sort} onToggle={toggle} /></Th>
                  <Th style={{ textAlign: 'right' }}><SortLabel label="Remaining / recv" sortKey="remaining" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th style={{ textAlign: 'right' }}><SortLabel label="Unit cost" sortKey="cost" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
                  <Th />
                </tr></thead>
                <tbody>
                  {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
                    pageItems.map((b) => {
                      const hint = daysHint(b.days_to_expiry);
                      return (
                        <tr key={b.id} style={b.status === 'expired' ? { background: 'rgba(224,30,44,0.06)' } : undefined}>
                          <Td style={{ fontWeight: 700 }}>{b.sku_name || '—'}{b.sku_code ? <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, fontSize: 12 }}> · {b.sku_code}</span> : null}</Td>
                          <Td style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{b.batch_no || '—'}</Td>
                          <Td style={{ fontSize: 12 }}>
                            <div>{b.expiry_date ? fmtDate(b.expiry_date).split(',')[0] : '—'}</div>
                            <div style={{ fontSize: 11, color: hint.color, fontWeight: 600 }}>{hint.text}</div>
                          </Td>
                          <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.received_at ? fmtDate(b.received_at).split(',')[0] : '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 700 }}>{Number(b.qty_remaining ?? 0).toLocaleString('en-IN')}</span>
                            <span style={{ color: 'var(--text-dim)' }}> / {Number(b.qty_received ?? 0).toLocaleString('en-IN')}</span>
                          </Td>
                          <Td style={{ textAlign: 'right' }}>{b.unit_cost != null ? inr(Number(b.unit_cost)) : '—'}</Td>
                          <Td><Pill color={statusColor(b.status)}>{statusLabel(b.status)}</Pill></Td>
                          <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Btn variant="ghost" onClick={() => openConsume(b)}>Consume</Btn>
                          </Td>
                        </tr>
                      );
                    })}
                  {!loading && !rows.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No batches for this distributor{status !== 'all' ? ` in “${STATUS_OPTIONS.find((o) => o.value === status)?.label}”` : ''}.</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          {rows.length > 0 && bar}
        </>
      )}

      {/* Receive (GRN) modal */}
      {showReceive && (
        <Overlay onClose={() => setShowReceive(false)}>
          <ModalCard title="Receive goods (GRN)" subtitle="Post a new stock layer for a distributor." onClose={() => setShowReceive(false)}>
            {rcvErr && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--primary)' }}>✗ {rcvErr}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={labelStyle}>Distributor *</div>
                <select value={rcv.distributor_id} onChange={(e) => setRcv({ ...rcv, distributor_id: e.target.value })} style={inputStyle}>
                  <option value="">— Select —</option>
                  {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={labelStyle}>SKU *</div>
                {skus.length ? (
                  <select value={rcv.sku_id} onChange={(e) => setRcv({ ...rcv, sku_id: e.target.value })} style={inputStyle}>
                    <option value="">— Select SKU —</option>
                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
                  </select>
                ) : <input value={rcv.sku_id} placeholder="SKU UUID" onChange={(e) => setRcv({ ...rcv, sku_id: e.target.value })} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />}
              </div>
              <div><div style={labelStyle}>Qty *</div><input value={rcv.qty} inputMode="numeric" placeholder="0" onChange={(e) => setRcv({ ...rcv, qty: e.target.value.replace(/[^\d]/g, '') })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Batch #</div><input value={rcv.batch_no} placeholder="Optional — auto if blank" onChange={(e) => setRcv({ ...rcv, batch_no: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Expiry date</div><input type="date" value={rcv.expiry_date} onChange={(e) => setRcv({ ...rcv, expiry_date: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Mfg date</div><input type="date" value={rcv.mfg_date} onChange={(e) => setRcv({ ...rcv, mfg_date: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Unit cost (₹)</div><input value={rcv.unit_cost} inputMode="decimal" placeholder="Optional" onChange={(e) => setRcv({ ...rcv, unit_cost: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Reference</div><input value={rcv.reference} placeholder="GRN / PO #" onChange={(e) => setRcv({ ...rcv, reference: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Btn variant="ghost" onClick={() => setShowReceive(false)}>Cancel</Btn>
              <Btn disabled={rcvSaving} onClick={submitReceive}>{rcvSaving ? 'Posting…' : 'Post GRN'}</Btn>
            </div>
          </ModalCard>
        </Overlay>
      )}

      {/* Consume modal */}
      {showConsume && (
        <Overlay onClose={() => setShowConsume(false)}>
          <ModalCard title="Consume stock" subtitle="Draw down layers by FEFO (earliest expiry) or FIFO (earliest received)." onClose={() => setShowConsume(false)}>
            {csmErr && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--primary)' }}>✗ {csmErr}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={labelStyle}>Distributor *</div>
                <select value={csm.distributor_id} onChange={(e) => setCsm({ ...csm, distributor_id: e.target.value })} style={inputStyle}>
                  <option value="">— Select —</option>
                  {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={labelStyle}>SKU *</div>
                {skus.length ? (
                  <select value={csm.sku_id} onChange={(e) => setCsm({ ...csm, sku_id: e.target.value })} style={inputStyle}>
                    <option value="">— Select SKU —</option>
                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
                  </select>
                ) : <input value={csm.sku_id} placeholder="SKU UUID" onChange={(e) => setCsm({ ...csm, sku_id: e.target.value })} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />}
              </div>
              <div><div style={labelStyle}>Qty *</div><input value={csm.qty} inputMode="numeric" placeholder="0" onChange={(e) => setCsm({ ...csm, qty: e.target.value.replace(/[^\d]/g, '') })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Strategy</div>
                <select value={csm.strategy} onChange={(e) => setCsm({ ...csm, strategy: e.target.value })} style={inputStyle}>
                  <option value="fefo">FEFO — earliest expiry first</option>
                  <option value="fifo">FIFO — earliest received first</option>
                </select>
              </div>
              <div><div style={labelStyle}>Reason</div>
                <select value={csm.reason} onChange={(e) => setCsm({ ...csm, reason: e.target.value })} style={inputStyle}>
                  {CONSUME_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div><div style={labelStyle}>Note</div><input value={csm.note} placeholder="Optional" onChange={(e) => setCsm({ ...csm, note: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Btn variant="ghost" onClick={() => setShowConsume(false)}>Cancel</Btn>
              <Btn disabled={csmSaving} onClick={submitConsume}>{csmSaving ? 'Consuming…' : 'Consume'}</Btn>
            </div>
          </ModalCard>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      {children}
    </div>
  );
}

function ModalCard({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--s3)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2, marginBottom: 16 }}>{subtitle}</div>}
      {children}
    </div>
  );
}
