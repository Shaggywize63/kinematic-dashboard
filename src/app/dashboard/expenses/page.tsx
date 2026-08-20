'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  expensesApi, CATEGORY_LABELS, FLAG_COLORS,
  type ExpenseClaim, type ExpensePolicy, type ItemCategory, type ClaimItemInput,
} from '../../../lib/expensesApi';
import {
  card, input, label, btnPrimary, btnGhost, btnSmallGhost, btnSmallDanger, btnSmallSuccess,
  StatusChip, PageHeader, ExpenseTabs, Modal, useExpenseRoles, fmtDate, money,
} from './_ui';

const CATEGORIES: ItemCategory[] = ['mileage', 'travel', 'food', 'lodging', 'fuel', 'toll', 'misc'];

export default function MyClaimsPage() {
  const { canApprove, canAdmin } = useExpenseRoles();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [policy, setPolicy] = useState<ExpensePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, ExpenseClaim | undefined>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.allSettled([expensesApi.listClaims(), expensesApi.getPolicy()]);
      if (c.status === 'fulfilled') setClaims(c.value.data || []);
      if (p.status === 'fulfilled') setPolicy(p.value.data || null);
    } catch (e: any) { toast.error(e.message || 'Failed to load claims'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (claim: ExpenseClaim) => {
    if (expanded[claim.id]) { setExpanded((s) => ({ ...s, [claim.id]: undefined })); return; }
    try {
      const full = await expensesApi.getClaim(claim.id);
      setExpanded((s) => ({ ...s, [claim.id]: full.data }));
    } catch (e: any) { toast.error(e.message || 'Failed to load claim'); }
  };

  const submit = async (claim: ExpenseClaim) => {
    setBusy((s) => ({ ...s, [claim.id]: true }));
    try {
      await expensesApi.submitClaim(claim.id);
      toast.success('Claim submitted for approval');
      setExpanded((s) => ({ ...s, [claim.id]: undefined }));
      load();
    } catch (e: any) { toast.error(e.message || 'Submit failed'); }
    finally { setBusy((s) => ({ ...s, [claim.id]: false })); }
  };

  const cancel = async (claim: ExpenseClaim) => {
    if (!window.confirm('Cancel this claim?')) return;
    setBusy((s) => ({ ...s, [claim.id]: true }));
    try {
      await expensesApi.cancelClaim(claim.id);
      toast.success('Claim cancelled');
      load();
    } catch (e: any) { toast.error(e.message || 'Cancel failed'); }
    finally { setBusy((s) => ({ ...s, [claim.id]: false })); }
  };

  return (
    <div>
      <PageHeader
        title="My Expense Claims"
        subtitle="File travel & field expenses. Mileage is measured from your GPS trail; receipts are read by AI; claims route up your reporting line for approval."
        action={<button style={btnPrimary} onClick={() => setShowCreate(true)}>+ New Claim</button>}
      />
      <ExpenseTabs active="mine" canApprove={canApprove} canAdmin={canAdmin} />

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>My Claims ({claims.length})</div>
        {loading && claims.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : claims.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No claims yet. Click “New Claim” to file one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {claims.map((c) => {
              const full = expanded[c.id];
              return (
                <div key={c.id} style={{ background: 'var(--s3)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => toggle(c)}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {c.title || c.claim_no || 'Expense claim'}
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                          {money(c.total_amount, c.currency)} · {fmtDate(c.created_at)}
                          {c.status === 'submitted' && c.approver_name ? ` · with ${c.approver_name} (L${c.current_level})` : ''}
                        </span>
                      </div>
                      {c.ai_summary && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>🧠 {c.ai_summary}</div>}
                      {Array.isArray(c.ai_flags) && c.ai_flags.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                          {c.ai_flags.map((f, i) => (
                            <span key={i} title={f.detail} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, border: `1px solid ${FLAG_COLORS[f.severity]}`, color: FLAG_COLORS[f.severity] }}>
                              {f.code.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.status === 'rejected' && c.review_note && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>Rejected: {c.review_note}</div>
                      )}
                    </div>
                    <StatusChip status={c.status} />
                    <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>{full ? '▾' : '▸'}</span>
                  </div>

                  {full && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                        {(full.items || []).map((it) => (
                          <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--text)', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, minWidth: 64 }}>{CATEGORY_LABELS[it.category]}</span>
                            <span style={{ color: 'var(--text-dim)' }}>{fmtDate(it.item_date)}</span>
                            <span style={{ flex: 1, minWidth: 120 }}>
                              {it.description || it.merchant || (it.category === 'mileage' ? `${it.from_location || '?'} → ${it.to_location || '?'} · ${it.distance_km ?? 0} km` : '—')}
                              {it.flagged && it.flag_reason && <span title={it.flag_reason} style={{ marginLeft: 6, color: '#eab308' }}>⚠</span>}
                            </span>
                            <span style={{ fontWeight: 600 }}>{money(it.amount, full.currency)}</span>
                          </div>
                        ))}
                      </div>
                      {full.distance_km != null && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                          Mileage: claimed <strong style={{ color: 'var(--text)' }}>{full.distance_km} km</strong>
                          {full.gps_derived_km != null && <> · GPS trail <strong style={{ color: 'var(--text)' }}>{full.gps_derived_km} km</strong></>}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        {full.status === 'draft' && (
                          <>
                            <button style={{ ...btnSmallSuccess, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => submit(c)}>
                              {busy[c.id] ? '…' : 'Submit for approval'}
                            </button>
                            <button style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => cancel(c)}>Cancel</button>
                          </>
                        )}
                        {full.status === 'submitted' && (
                          <button style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }} disabled={!!busy[c.id]} onClick={() => cancel(c)}>Withdraw</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClaimModal
          policy={policy}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ── create-claim modal ───────────────────────────────────────────────────────
interface LineDraft {
  category: ItemCategory;
  item_date: string;
  amount: string;
  description: string;
  merchant: string;
  from_location: string;
  to_location: string;
  distance_km: string;
  receipt_url: string;
  ai_extracted?: Record<string, unknown> | null;
  scanning?: boolean;
  suggesting?: boolean;
}

function blankLine(category: ItemCategory = 'food'): LineDraft {
  return {
    category, item_date: new Date().toISOString().slice(0, 10), amount: '', description: '',
    merchant: '', from_location: '', to_location: '', distance_km: '', receipt_url: '',
  };
}

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const comma = res.indexOf(',');
      resolve({ data: comma >= 0 ? res.slice(comma + 1) : res, mediaType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CreateClaimModal({ policy, onClose, onDone }: {
  policy: ExpensePolicy | null; onClose: () => void; onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines],
  );

  const patch = (i: number, p: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (i: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const scan = async (i: number, file: File) => {
    patch(i, { scanning: true });
    try {
      const { data, mediaType } = await fileToBase64(file);
      const r = await expensesApi.scanReceipt(data, mediaType);
      const f = r.data;
      patch(i, {
        scanning: false,
        amount: f.amount != null ? String(f.amount) : lines[i].amount,
        merchant: f.merchant || lines[i].merchant,
        item_date: f.txn_date || lines[i].item_date,
        category: f.category || lines[i].category,
        ai_extracted: f as unknown as Record<string, unknown>,
      });
      toast.success(f.amount != null ? `Read ₹${f.amount}${f.merchant ? ` · ${f.merchant}` : ''}` : 'Receipt scanned — review the fields');
    } catch (e: any) {
      patch(i, { scanning: false });
      toast.error(e.message || 'Could not read the receipt');
    }
  };

  const suggestMileage = async (i: number) => {
    const day = lines[i].item_date;
    if (!day) return toast.error('Pick the date first');
    patch(i, { suggesting: true });
    try {
      const fromISO = `${day}T00:00:00.000Z`;
      const toISO = `${day}T23:59:59.999Z`;
      const r = await expensesApi.mileage(fromISO, toISO);
      const m = r.data;
      patch(i, {
        suggesting: false,
        distance_km: String(m.distance_km),
        amount: String(m.suggested_amount),
        description: lines[i].description || `Auto: ${m.distance_km} km from GPS trail`,
      });
      toast.success(`${m.distance_km} km → ${money(m.suggested_amount, m.currency)} (@ ${m.mileage_rate}/km)`);
    } catch (e: any) {
      patch(i, { suggesting: false });
      toast.error(e.message || 'Could not compute mileage');
    }
  };

  const save = async () => {
    const items: ClaimItemInput[] = lines
      .filter((l) => Number(l.amount) > 0 || (l.category === 'mileage' && Number(l.distance_km) > 0))
      .map((l) => ({
        category: l.category,
        item_date: l.item_date || null,
        description: l.description.trim() || null,
        amount: Number(l.amount) || 0,
        distance_km: l.category === 'mileage' && l.distance_km ? Number(l.distance_km) : null,
        from_location: l.from_location.trim() || null,
        to_location: l.to_location.trim() || null,
        merchant: l.merchant.trim() || null,
        receipt_url: l.receipt_url.trim() || null,
        ai_extracted: l.ai_extracted ?? null,
      }));
    if (!items.length) return toast.error('Add at least one line with an amount or mileage');
    setSaving(true);
    try {
      await expensesApi.createClaim({ title: title.trim() || null, items });
      toast.success('Draft claim created — review and submit it');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Could not create the claim');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="New Expense Claim" onClose={onClose} width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={label}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="e.g. Client visit — Pune, 12–13 Aug" />
        </div>

        {policy && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--s3)', padding: '8px 12px', borderRadius: 8 }}>
            Mileage reimbursed at <strong style={{ color: 'var(--text)' }}>{money(policy.mileage_rate, policy.currency)}/km</strong>.
            Receipt required over <strong style={{ color: 'var(--text)' }}>{money(policy.require_receipt_over, policy.currency)}</strong>.
            {policy.escalate_over != null && <> Claims over <strong style={{ color: 'var(--text)' }}>{money(policy.escalate_over, policy.currency)}</strong> escalate up the reporting line.</>}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--s2)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <select value={l.category} onChange={(e) => patch(i, { category: e.target.value as ItemCategory })} style={{ ...input, width: 130 }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                <input type="date" value={l.item_date} onChange={(e) => patch(i, { item_date: e.target.value })} style={{ ...input, width: 160 }} />
                <div style={{ flex: 1 }} />
                {lines.length > 1 && <button style={btnSmallDanger} onClick={() => removeLine(i)}>Remove</button>}
              </div>

              {l.category === 'mileage' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <div><label style={label}>From</label><input value={l.from_location} onChange={(e) => patch(i, { from_location: e.target.value })} style={input} placeholder="Origin" /></div>
                  <div><label style={label}>To</label><input value={l.to_location} onChange={(e) => patch(i, { to_location: e.target.value })} style={input} placeholder="Destination" /></div>
                  <button style={{ ...btnSmallGhost, whiteSpace: 'nowrap', opacity: l.suggesting ? 0.5 : 1 }} disabled={l.suggesting} onClick={() => suggestMileage(i)}>
                    {l.suggesting ? '…' : '📍 Suggest from GPS'}
                  </button>
                  <div><label style={label}>Distance (km)</label><input value={l.distance_km} onChange={(e) => patch(i, { distance_km: e.target.value })} style={input} inputMode="decimal" /></div>
                  <div><label style={label}>Amount</label><input value={l.amount} onChange={(e) => patch(i, { amount: e.target.value })} style={input} inputMode="decimal" /></div>
                  <div />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <div><label style={label}>Merchant</label><input value={l.merchant} onChange={(e) => patch(i, { merchant: e.target.value })} style={input} placeholder="Vendor" /></div>
                  <div><label style={label}>Amount</label><input value={l.amount} onChange={(e) => patch(i, { amount: e.target.value })} style={input} inputMode="decimal" /></div>
                  <label style={{ ...btnSmallGhost, whiteSpace: 'nowrap', opacity: l.scanning ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}>
                    {l.scanning ? '…' : '🧾 Scan receipt'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={l.scanning}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(i, f); e.currentTarget.value = ''; }} />
                  </label>
                  <div style={{ gridColumn: '1 / -1' }}><label style={label}>Description</label><input value={l.description} onChange={(e) => patch(i, { description: e.target.value })} style={input} placeholder="Optional" /></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button style={btnGhost} onClick={addLine}>+ Add line</button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Total {money(total, policy?.currency || 'INR')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnGhost} onClick={onClose}>Cancel</button>
            <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Create draft'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
