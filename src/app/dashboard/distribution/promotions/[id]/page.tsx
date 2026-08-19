'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, StatCard, fmtDate, inr } from '../../../../../components/distribution/Atoms';

const PROMO_STATUSES = ['draft', 'active', 'paused', 'closed'];

function promoStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'green';
    case 'paused': return 'amber';
    case 'closed': return 'blue';
    default: return 'gray'; // draft
  }
}

function claimStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'approved': return 'blue';
    case 'settled': return 'green';
    case 'rejected': return 'red';
    default: return 'amber'; // submitted
  }
}

const pct = (v: number | null | undefined) => (v == null || Number.isNaN(v)) ? '—' : `${Number(v).toFixed(1)}%`;
const roiFmt = (v: number | null | undefined) => (v == null || Number.isNaN(v)) ? '—' : `${Number(v).toFixed(2)}×`;

export default function PromotionDetail() {
  const params = useParams();
  const id = params?.id as string;
  const [promo, setPromo] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Edit basic fields
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ budget_amount: '', objective: '', valid_from: '', valid_to: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Add-claim form
  const [claim, setClaim] = useState({ distributor_id: '', claim_no: '', period_from: '', period_to: '', claimed_amount: '', notes: '' });
  const [addingClaim, setAddingClaim] = useState(false);

  const load = async () => {
    try {
      const [p, s]: [any, any] = await Promise.all([
        api.getPromotion(id),
        api.getPromotionSummary(id).catch(() => null),
      ]);
      const promoData = p?.data || p;
      setPromo(promoData);
      setSummary(s?.data || s || null);
      setEdit({
        budget_amount: promoData?.budget_amount != null ? String(promoData.budget_amount) : '',
        objective: promoData?.objective || '',
        valid_from: promoData?.valid_from || '',
        valid_to: promoData?.valid_to || '',
        notes: promoData?.notes || '',
      });
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { if (id) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const changeStatus = async (status: string) => {
    setMsg(null);
    try { await api.setPromotionStatus(id, status); await load(); }
    catch (e: any) { setMsg(e.message || 'Status change failed'); }
  };

  const saveEdit = async () => {
    setSavingEdit(true); setMsg(null);
    try {
      const body: any = {
        objective: edit.objective || null,
        notes: edit.notes || null,
      };
      body.budget_amount = edit.budget_amount.trim() ? Number(edit.budget_amount) : null;
      body.valid_from = edit.valid_from || null;
      body.valid_to = edit.valid_to || null;
      await api.updatePromotion(id, body);
      setEditing(false);
      await load();
    } catch (e: any) { setMsg(e.message || 'Save failed'); }
    setSavingEdit(false);
  };

  const submitClaim = async () => {
    if (!claim.claimed_amount.trim()) { setMsg('Claimed amount is required.'); return; }
    setAddingClaim(true); setMsg(null);
    try {
      const body: any = { claimed_amount: Number(claim.claimed_amount) };
      if (claim.distributor_id.trim()) body.distributor_id = claim.distributor_id.trim();
      if (claim.claim_no.trim()) body.claim_no = claim.claim_no.trim();
      if (claim.period_from) body.period_from = claim.period_from;
      if (claim.period_to) body.period_to = claim.period_to;
      if (claim.notes.trim()) body.notes = claim.notes.trim();
      await api.createPromotionClaim(id, body);
      setClaim({ distributor_id: '', claim_no: '', period_from: '', period_to: '', claimed_amount: '', notes: '' });
      await load();
    } catch (e: any) { setMsg(e.message || 'Add claim failed'); }
    setAddingClaim(false);
  };

  const approveClaim = async (claimId: string) => {
    const amt = window.prompt('Approved amount (leave blank to approve the full claimed amount):', '');
    if (amt === null) return;
    setMsg(null);
    try {
      const body: any = {};
      if (amt.trim()) body.approved_amount = Number(amt);
      await api.approvePromotionClaim(claimId, body);
      await load();
    } catch (e: any) { setMsg(e.message || 'Approve failed'); }
  };
  const rejectClaim = async (claimId: string) => {
    const reason = window.prompt('Reason for rejection (optional):', '');
    if (reason === null) return;
    setMsg(null);
    try { await api.rejectPromotionClaim(claimId, reason.trim() ? { reason: reason.trim() } : {}); await load(); }
    catch (e: any) { setMsg(e.message || 'Reject failed'); }
  };
  const settleClaim = async (claimId: string) => {
    const amt = window.prompt('Settled amount (leave blank to settle the approved amount):', '');
    if (amt === null) return;
    const ref = window.prompt('Payment reference (optional):', '');
    if (ref === null) return;
    setMsg(null);
    try {
      const body: any = {};
      if (amt.trim()) body.settled_amount = Number(amt);
      if (ref.trim()) body.payment_ref = ref.trim();
      await api.settlePromotionClaim(claimId, body);
      await load();
    } catch (e: any) { setMsg(e.message || 'Settle failed'); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!promo) return <div style={{ color: 'var(--primary)' }}>Promotion not found</div>;

  const claims: any[] = promo.tp_claims || promo.claims || [];
  const distributorName = (c: any) => c.distributor?.name || c.distributor_name || c.distributor_id || '—';

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div>
      <PageHeader
        title={promo.name}
        subtitle={`${promo.code}${promo.promo_type ? ' · ' + promo.promo_type : ''}${promo.funding_source ? ' · ' + promo.funding_source + '-funded' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/promotions" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All promotions</a>
            <Pill color={promoStatusColor(promo.status)}>{promo.status || 'draft'}</Pill>
          </div>
        }
      />

      {msg && <div style={{ marginBottom: 14, color: 'var(--primary)', fontSize: 12 }}>{msg}</div>}

      {/* Status controls */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Status</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PROMO_STATUSES.map((st) => (
            <Btn key={st} variant={promo.status === st ? 'primary' : 'ghost'} disabled={promo.status === st} onClick={() => changeStatus(st)}>{st}</Btn>
          ))}
        </div>
      </Card>

      {/* ROI summary */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>ROI & Budget</div>
        {summary ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <StatCard label="Budget" value={inr(summary.budget_amount || 0)} hint={summary.currency || 'INR'} />
            <StatCard label="Claimed" value={inr(summary.claimed_total || 0)} hint={`${summary.claim_count || 0} claim(s)`} />
            <StatCard label="Approved" value={inr(summary.approved_total || 0)} accent="var(--accent)" />
            <StatCard label="Settled" value={inr(summary.settled_total || 0)} accent="var(--green)" />
            <StatCard label="Budget used" value={pct(summary.budget_utilization_pct)} />
            <StatCard label="Generated sales" value={inr(summary.generated_sales || 0)} hint={`${summary.order_count || 0} order(s)`} />
            <StatCard label="ROI" value={roiFmt(summary.roi)} accent="var(--green)" />
          </div>
        ) : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Summary unavailable.</div>}
      </Card>

      {/* Basic fields + edit */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Details</div>
          {!editing && <Btn variant="ghost" onClick={() => setEditing(true)}>Edit</Btn>}
        </div>

        {editing ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div><div style={labelStyle}>Budget amount</div><input value={edit.budget_amount} onChange={(e) => setEdit({ ...edit, budget_amount: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Valid from</div><input value={edit.valid_from} placeholder="YYYY-MM-DD" onChange={(e) => setEdit({ ...edit, valid_from: e.target.value })} style={inputStyle} /></div>
              <div><div style={labelStyle}>Valid to</div><input value={edit.valid_to} placeholder="YYYY-MM-DD" onChange={(e) => setEdit({ ...edit, valid_to: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ marginTop: 12 }}><div style={labelStyle}>Objective</div><textarea value={edit.objective} rows={2} onChange={(e) => setEdit({ ...edit, objective: e.target.value })} style={inputStyle} /></div>
            <div style={{ marginTop: 12 }}><div style={labelStyle}>Notes</div><textarea value={edit.notes} rows={2} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} style={inputStyle} /></div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <Btn disabled={savingEdit} onClick={saveEdit}>{savingEdit ? 'Saving…' : 'Save'}</Btn>
              <Btn variant="ghost" onClick={() => { setEditing(false); load(); }}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, fontSize: 12 }}>
            <div><div style={{ color: 'var(--text-dim)' }}>Budget</div><div style={{ fontWeight: 700, marginTop: 2 }}>{promo.budget_amount != null ? inr(promo.budget_amount) : '—'} {promo.currency && promo.budget_amount != null ? `(${promo.currency})` : ''}</div></div>
            <div><div style={{ color: 'var(--text-dim)' }}>Valid from</div><div style={{ fontWeight: 700, marginTop: 2 }}>{promo.valid_from ? fmtDate(promo.valid_from) : '—'}</div></div>
            <div><div style={{ color: 'var(--text-dim)' }}>Valid to</div><div style={{ fontWeight: 700, marginTop: 2 }}>{promo.valid_to ? fmtDate(promo.valid_to) : '∞'}</div></div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--text-dim)' }}>Objective</div><div style={{ marginTop: 2 }}>{promo.objective || '—'}</div></div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--text-dim)' }}>Notes</div><div style={{ marginTop: 2 }}>{promo.notes || '—'}</div></div>
          </div>
        )}
      </Card>

      {/* Targeting */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Targeting</div>
        <pre style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 11, lineHeight: 1.5, fontFamily: 'JetBrains Mono, monospace', overflow: 'auto', margin: 0 }}>
{JSON.stringify(promo.targeting || {}, null, 2)}
        </pre>
      </Card>

      {/* Claims */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Claims</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={thStyle}>Claim #</th>
            <th style={thStyle}>Distributor</th>
            <th style={thStyle}>Period</th>
            <th style={thStyle}>Claimed</th>
            <th style={thStyle}>Approved</th>
            <th style={thStyle}>Settled</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle} />
          </tr></thead>
          <tbody>
            {claims.length ? claims.map((c) => {
              const st = (c.status || 'submitted').toLowerCase();
              return (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.claim_no || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{distributorName(c)}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{c.period_from ? fmtDate(c.period_from) : '—'} → {c.period_to ? fmtDate(c.period_to) : '—'}</td>
                  <td style={tdStyle}>{c.claimed_amount != null ? inr(c.claimed_amount) : '—'}</td>
                  <td style={tdStyle}>{c.approved_amount != null ? inr(c.approved_amount) : '—'}</td>
                  <td style={tdStyle}>{c.settled_amount != null ? inr(c.settled_amount) : '—'}</td>
                  <td style={tdStyle}><Pill color={claimStatusColor(st)}>{st}</Pill></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {st === 'submitted' && <>
                        <Btn variant="ghost" onClick={() => approveClaim(c.id)}>Approve</Btn>
                        <Btn variant="danger" onClick={() => rejectClaim(c.id)}>Reject</Btn>
                      </>}
                      {st === 'approved' && <Btn onClick={() => settleClaim(c.id)}>Settle</Btn>}
                    </div>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }}>No claims yet.</td></tr>}
          </tbody>
        </table>

        {/* Add claim */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Add claim</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div><div style={labelStyle}>Claimed amount *</div><input value={claim.claimed_amount} placeholder="e.g. 25000" onChange={(e) => setClaim({ ...claim, claimed_amount: e.target.value })} style={inputStyle} /></div>
            <div><div style={labelStyle}>Claim #</div><input value={claim.claim_no} onChange={(e) => setClaim({ ...claim, claim_no: e.target.value })} style={inputStyle} /></div>
            <div><div style={labelStyle}>Distributor ID</div><input value={claim.distributor_id} placeholder="distributor UUID" onChange={(e) => setClaim({ ...claim, distributor_id: e.target.value })} style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} /></div>
            <div><div style={labelStyle}>Period from</div><input value={claim.period_from} placeholder="YYYY-MM-DD" onChange={(e) => setClaim({ ...claim, period_from: e.target.value })} style={inputStyle} /></div>
            <div><div style={labelStyle}>Period to</div><input value={claim.period_to} placeholder="YYYY-MM-DD" onChange={(e) => setClaim({ ...claim, period_to: e.target.value })} style={inputStyle} /></div>
            <div><div style={labelStyle}>Notes</div><input value={claim.notes} onChange={(e) => setClaim({ ...claim, notes: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn disabled={addingClaim} onClick={submitClaim}>{addingClaim ? 'Adding…' : 'Add claim'}</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
