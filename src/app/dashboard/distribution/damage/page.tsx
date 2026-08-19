'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, fmtDate, inr } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const REASONS = ['damaged', 'expired', 'near_expiry', 'breakage', 'other'];
const STATUSES = ['logged', 'confirmed', 'claimed', 'written_off', 'rejected'];

function reasonColor(r: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((r || '').toLowerCase()) {
    case 'damaged':
    case 'breakage': return 'red';
    case 'expired': return 'amber';
    case 'near_expiry': return 'blue';
    default: return 'gray';
  }
}
function statusColor(s: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((s || '').toLowerCase()) {
    case 'logged': return 'amber';
    case 'confirmed': return 'blue';
    case 'claimed': return 'blue';
    case 'written_off': return 'green';
    case 'rejected': return 'red';
    default: return 'gray';
  }
}

const val = (e: any, k: string): unknown => {
  switch (k) {
    case 'sku': return e.sku_name;
    case 'distributor': return e.distributor_name;
    case 'qty': return Number(e.qty);
    case 'value': return Number(e.qty) * Number(e.unit_value || 0);
    case 'reason': return e.reason;
    case 'status': return e.status;
    case 'expiry': return e.expiry_date || '';
    case 'created': return e.created_at;
    default: return e[k];
  }
};

export default function DamageRegisterPage() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [fDist, setFDist] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fReason, setFReason] = useState('');

  const [form, setForm] = useState({ distributor_id: '', sku_id: '', qty: '', reason: 'damaged', batch_no: '', expiry_date: '', unit_value: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { sorted, sort, toggle } = useTableSort<any>(rows, val, { key: 'created', dir: 'desc' });
  const { pageItems, bar } = usePagination(sorted);

  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
    api.getSkus({ limit: '1000' }).then((r: any) => {
      const d = r?.data?.data ?? r?.data ?? r ?? [];
      setSkus(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fDist) params.distributor_id = fDist;
      if (fStatus) params.status = fStatus;
      if (fReason) params.reason = fReason;
      const r: any = await api.getDamageEntries(Object.keys(params).length ? params : undefined);
      setRows(r?.data || r || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fDist, fStatus, fReason]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.distributor_id) { setMsg({ kind: 'err', text: 'Pick a distributor.' }); return; }
    if (!form.sku_id) { setMsg({ kind: 'err', text: 'Select a SKU.' }); return; }
    const qty = parseInt(form.qty, 10);
    if (!qty || qty <= 0) { setMsg({ kind: 'err', text: 'Qty must be a positive integer.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const body: any = { distributor_id: form.distributor_id, sku_id: form.sku_id, qty, reason: form.reason };
      if (form.batch_no.trim()) body.batch_no = form.batch_no.trim();
      if (form.expiry_date) body.expiry_date = form.expiry_date;
      if (form.unit_value.trim()) body.unit_value = parseFloat(form.unit_value);
      if (form.note.trim()) body.note = form.note.trim();
      await api.createDamageEntry(body);
      setMsg({ kind: 'ok', text: 'Damage entry logged.' });
      setForm({ distributor_id: form.distributor_id, sku_id: '', qty: '', reason: 'damaged', batch_no: '', expiry_date: '', unit_value: '', note: '' });
      await load();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Failed to log entry' }); }
    setSaving(false);
  };

  const doConfirm = async (id: string) => {
    setBusyId(id); setMsg(null);
    try { await api.confirmDamage(id); setMsg({ kind: 'ok', text: 'Confirmed & written off from on-hand.' }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Confirm failed' }); }
    setBusyId(null);
  };
  const doReject = async (id: string) => {
    const reason = window.prompt('Reason for rejecting this entry?') || '';
    setBusyId(id); setMsg(null);
    try { await api.rejectDamage(id, { reason }); setMsg({ kind: 'ok', text: 'Entry rejected.' }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Reject failed' }); }
    setBusyId(null);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  const totalQty = rows.reduce((a, e) => a + (Number(e.qty) || 0), 0);
  const totalValue = rows.reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.unit_value) || 0), 0);
  const openCount = rows.filter((e) => e.status === 'logged').length;

  return (
    <div>
      <PageHeader title="Damaged / Expiry Register" subtitle="Distributor damaged, expired & near-expiry stock. Confirm to write it off on-hand, then roll into a claim." />

      {/* Totals */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Entries" value={rows.length} />
        <StatCard label="Total qty" value={totalQty.toLocaleString('en-IN')} />
        <StatCard label="Est. value" value={inr(totalValue)} accent="var(--primary)" />
        <StatCard label="Awaiting confirm" value={openCount} accent={openCount ? 'var(--accent)' : undefined} />
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div><div style={labelStyle}>Distributor</div>
            <select value={fDist} onChange={(e) => setFDist(e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              <option value="">All distributors</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div><div style={labelStyle}>Status</div>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selStyle}>
              <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><div style={labelStyle}>Reason</div>
            <select value={fReason} onChange={(e) => setFReason(e.target.value)} style={selStyle}>
              <option value="">All</option>{REASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          {(fDist || fStatus || fReason) && <Btn variant="ghost" onClick={() => { setFDist(''); setFStatus(''); setFReason(''); }}>Clear</Btn>}
        </div>
      </Card>

      {/* List */}
      <Card style={{ marginBottom: 22 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="SKU" sortKey="sku" sort={sort} onToggle={toggle} /></Th>
            <Th>Batch</Th>
            <Th><SortLabel label="Expiry" sortKey="expiry" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Distributor" sortKey="distributor" sort={sort} onToggle={toggle} /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Qty" sortKey="qty" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Value" sortKey="value" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th><SortLabel label="Reason" sortKey="reason" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
              pageItems.map((e) => {
                const value = (Number(e.qty) || 0) * (Number(e.unit_value) || 0);
                return (
                  <tr key={e.id}>
                    <Td style={{ fontWeight: 700 }}>{e.sku_name || '—'}{e.sku_code ? <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, fontSize: 12 }}> · {e.sku_code}</span> : null}</Td>
                    <Td style={{ fontSize: 12 }}>{e.batch_no || '—'}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{e.expiry_date ? fmtDate(e.expiry_date).split(',')[0] : '—'}</Td>
                    <Td>{e.distributor_name || '—'}</Td>
                    <Td style={{ textAlign: 'right' }}>{Number(e.qty ?? 0).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right' }}>{e.unit_value != null ? inr(value) : '—'}</Td>
                    <Td><Pill color={reasonColor(e.reason)}>{e.reason}</Pill></Td>
                    <Td><Pill color={statusColor(e.status)}>{e.status}</Pill></Td>
                    <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {e.status === 'logged' ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <Btn disabled={busyId === e.id} onClick={() => doConfirm(e.id)}>Confirm</Btn>
                          <Btn variant="ghost" disabled={busyId === e.id} onClick={() => doReject(e.id)}>Reject</Btn>
                        </span>
                      ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                    </Td>
                  </tr>
                );
              })}
            {!loading && !rows.length && <tr><Td colSpan={9 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No damage entries.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {rows.length > 0 && bar}

      {/* Log form */}
      <Card style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Log a damaged / expired entry</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
          <div><div style={labelStyle}>Distributor *</div>
            <select value={form.distributor_id} onChange={(e) => setForm({ ...form, distributor_id: e.target.value })} style={inputStyle}>
              <option value="">— Select —</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div style={{ gridColumn: 'span 2' }}><div style={labelStyle}>SKU *</div>
            {skus.length ? (
              <select value={form.sku_id} onChange={(e) => setForm({ ...form, sku_id: e.target.value })} style={inputStyle}>
                <option value="">— Select SKU —</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sku_code ? ` · ${s.sku_code}` : ''}</option>)}
              </select>
            ) : <input value={form.sku_id} placeholder="SKU UUID" onChange={(e) => setForm({ ...form, sku_id: e.target.value })} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />}
          </div>
          <div><div style={labelStyle}>Qty *</div><input value={form.qty} placeholder="0" onChange={(e) => setForm({ ...form, qty: e.target.value })} style={inputStyle} /></div>
          <div><div style={labelStyle}>Reason</div>
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={inputStyle}>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
          <div><div style={labelStyle}>Batch #</div><input value={form.batch_no} placeholder="Optional" onChange={(e) => setForm({ ...form, batch_no: e.target.value })} style={inputStyle} /></div>
          <div><div style={labelStyle}>Expiry date</div><input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} style={inputStyle} /></div>
          <div><div style={labelStyle}>Unit value (₹)</div><input value={form.unit_value} placeholder="Optional" onChange={(e) => setForm({ ...form, unit_value: e.target.value })} style={inputStyle} /></div>
          <div style={{ gridColumn: 'span 4' }}><div style={labelStyle}>Note</div><input value={form.note} placeholder="Optional — GRN, batch details, etc." onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></div>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--primary)' }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</div>}
        <div style={{ marginTop: 14 }}><Btn disabled={saving} onClick={submit}>{saving ? 'Logging…' : 'Log entry'}</Btn></div>
      </Card>
    </div>
  );
}
