'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, fmtDate, inr } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const CLAIM_TYPES = ['damage', 'expiry', 'scheme', 'promotion', 'price_protection', 'freight', 'shortage', 'other'];
const STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'settled'];

function statusColor(s: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((s || '').toLowerCase()) {
    case 'submitted': return 'amber';
    case 'under_review': return 'blue';
    case 'approved': return 'blue';
    case 'settled': return 'green';
    case 'rejected': return 'red';
    default: return 'gray';
  }
}

const val = (c: any, k: string): unknown => {
  switch (k) {
    case 'claim': return c.title || c.claim_no || c.id;
    case 'distributor': return c.distributor_name;
    case 'type': return c.claim_type;
    case 'claimed': return Number(c.claimed_amount);
    case 'approved': return Number(c.approved_amount || 0);
    case 'settled': return Number(c.settled_amount || 0);
    case 'status': return c.status;
    case 'created': return c.created_at;
    default: return c[k];
  }
};

export default function ClaimsPage() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [fDist, setFDist] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');

  const [form, setForm] = useState({ distributor_id: '', claim_type: 'damage', title: '', claimed_amount: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { sorted, sort, toggle } = useTableSort<any>(rows, val, { key: 'created', dir: 'desc' });
  const { pageItems, bar } = usePagination(sorted);

  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fDist) params.distributor_id = fDist;
      if (fStatus) params.status = fStatus;
      if (fType) params.claim_type = fType;
      const [r, s]: any = await Promise.all([
        api.getClaims(Object.keys(params).length ? params : undefined),
        api.getClaimsSummary(fDist ? { distributor_id: fDist } : undefined),
      ]);
      setRows(r?.data || r || []);
      setSummary(s?.data || s || null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fDist, fStatus, fType]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.distributor_id) { setMsg({ kind: 'err', text: 'Pick a distributor.' }); return; }
    const amt = parseFloat(form.claimed_amount);
    if (Number.isNaN(amt) || amt < 0) { setMsg({ kind: 'err', text: 'Claimed amount must be a non-negative number.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const body: any = { distributor_id: form.distributor_id, claim_type: form.claim_type, claimed_amount: amt };
      if (form.title.trim()) body.title = form.title.trim();
      if (form.description.trim()) body.description = form.description.trim();
      await api.createClaim(body);
      setMsg({ kind: 'ok', text: 'Claim submitted.' });
      setForm({ distributor_id: form.distributor_id, claim_type: 'damage', title: '', claimed_amount: '', description: '' });
      await load();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Failed to submit claim' }); }
    setSaving(false);
  };

  const approve = async (c: any) => {
    const raw = window.prompt(`Approved amount for this claim? (claimed ${inr(Number(c.claimed_amount))})`, String(c.claimed_amount));
    if (raw == null) return;
    const approved_amount = parseFloat(raw);
    if (Number.isNaN(approved_amount) || approved_amount < 0) { setMsg({ kind: 'err', text: 'Invalid approved amount.' }); return; }
    setBusyId(c.id); setMsg(null);
    try { await api.updateClaimStatus(c.id, { status: 'approved', approved_amount }); setMsg({ kind: 'ok', text: 'Claim approved.' }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Approve failed' }); }
    setBusyId(null);
  };
  const reject = async (c: any) => {
    const review_notes = window.prompt('Reason for rejecting this claim?') || '';
    setBusyId(c.id); setMsg(null);
    try { await api.updateClaimStatus(c.id, { status: 'rejected', review_notes }); setMsg({ kind: 'ok', text: 'Claim rejected.' }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Reject failed' }); }
    setBusyId(null);
  };
  const settle = async (c: any) => {
    const base = c.approved_amount ?? c.claimed_amount;
    const raw = window.prompt(`Settlement amount? (approved ${inr(Number(base))})`, String(base));
    if (raw == null) return;
    const settled_amount = parseFloat(raw);
    if (Number.isNaN(settled_amount) || settled_amount < 0) { setMsg({ kind: 'err', text: 'Invalid settlement amount.' }); return; }
    const settlement_ref = window.prompt('Settlement reference (credit-note / txn no)?') || undefined;
    setBusyId(c.id); setMsg(null);
    try { await api.settleClaim(c.id, { settled_amount, settlement_ref, settlement_mode: 'credit_note' }); setMsg({ kind: 'ok', text: 'Claim settled.' }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Settle failed' }); }
    setBusyId(null);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div>
      <PageHeader title="Claims & Settlements" subtitle="Distributor claims — damage, scheme, price-protection and more — from submission through approval to settlement." />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Claims" value={summary?.total ?? rows.length} />
        <StatCard label="Claimed" value={inr(Number(summary?.claimed_amount || 0))} />
        <StatCard label="Approved" value={inr(Number(summary?.approved_amount || 0))} accent="var(--accent)" />
        <StatCard label="Settled" value={inr(Number(summary?.settled_amount || 0))} accent="var(--green)" />
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div><div style={labelStyle}>Distributor</div>
            <select value={fDist} onChange={(e) => setFDist(e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              <option value="">All distributors</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div><div style={labelStyle}>Status</div>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selStyle}>
              <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><div style={labelStyle}>Type</div>
            <select value={fType} onChange={(e) => setFType(e.target.value)} style={selStyle}>
              <option value="">All</option>{CLAIM_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          {(fDist || fStatus || fType) && <Btn variant="ghost" onClick={() => { setFDist(''); setFStatus(''); setFType(''); }}>Clear</Btn>}
        </div>
      </Card>

      {/* List */}
      <Card style={{ marginBottom: 22 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Claim" sortKey="claim" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Distributor" sortKey="distributor" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Type" sortKey="type" sort={sort} onToggle={toggle} /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Claimed" sortKey="claimed" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Approved" sortKey="approved" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Settled" sortKey="settled" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
              pageItems.map((c) => {
                const canReview = ['submitted', 'under_review'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <Td style={{ fontWeight: 700 }}>{c.title || c.claim_no || <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{String(c.id).slice(0, 8)}</span>}</Td>
                    <Td>{c.distributor_name || '—'}</Td>
                    <Td><Pill color="gray">{c.claim_type}</Pill></Td>
                    <Td style={{ textAlign: 'right' }}>{inr(Number(c.claimed_amount || 0))}</Td>
                    <Td style={{ textAlign: 'right' }}>{c.approved_amount != null ? inr(Number(c.approved_amount)) : '—'}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: c.settled_amount != null ? 700 : 400, color: c.settled_amount != null ? 'var(--green)' : undefined }}>{c.settled_amount != null ? inr(Number(c.settled_amount)) : '—'}</Td>
                    <Td><Pill color={statusColor(c.status)}>{c.status}</Pill></Td>
                    <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canReview ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <Btn disabled={busyId === c.id} onClick={() => approve(c)}>Approve</Btn>
                          <Btn variant="ghost" disabled={busyId === c.id} onClick={() => reject(c)}>Reject</Btn>
                        </span>
                      ) : c.status === 'approved' ? (
                        <Btn disabled={busyId === c.id} onClick={() => settle(c)}>Settle</Btn>
                      ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                    </Td>
                  </tr>
                );
              })}
            {!loading && !rows.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No claims yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {rows.length > 0 && bar}

      {/* Raise a claim */}
      <Card style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Raise a claim</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
          <div><div style={labelStyle}>Distributor *</div>
            <select value={form.distributor_id} onChange={(e) => setForm({ ...form, distributor_id: e.target.value })} style={inputStyle}>
              <option value="">— Select —</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div><div style={labelStyle}>Type</div>
            <select value={form.claim_type} onChange={(e) => setForm({ ...form, claim_type: e.target.value })} style={inputStyle}>{CLAIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><div style={labelStyle}>Claimed amount (₹) *</div><input value={form.claimed_amount} placeholder="0" onChange={(e) => setForm({ ...form, claimed_amount: e.target.value })} style={inputStyle} /></div>
          <div><div style={labelStyle}>Title</div><input value={form.title} placeholder="Optional" onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} /></div>
          <div style={{ gridColumn: 'span 4' }}><div style={labelStyle}>Description</div><input value={form.description} placeholder="Optional — supporting detail" onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} /></div>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--primary)' }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</div>}
        <div style={{ marginTop: 14 }}><Btn disabled={saving} onClick={submit}>{saving ? 'Submitting…' : 'Submit claim'}</Btn></div>
      </Card>
    </div>
  );
}
