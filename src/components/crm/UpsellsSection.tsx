'use client';

/**
 * Upsells section — additional revenue logged against an existing deal and/or
 * lead. Rendered on both the deal- and lead-detail pages (pass dealId OR
 * leadId). Lists the upsells newest-first with a running "won" total, and a
 * compact inline form to log a new one. Kept separate from the deal's own
 * amount so the original value and upsell revenue read independently.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmUpsells, type Upsell, type UpsellStatus } from '../../lib/crmApi';
import { formatINR } from '../../lib/formatCurrency';

const STATUS_STYLE: Record<UpsellStatus, { bg: string; fg: string; label: string }> = {
  won: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', label: 'Won' },
  proposed: { bg: 'rgba(99,102,241,0.12)', fg: '#6366f1', label: 'Proposed' },
  lost: { bg: 'rgba(239,68,68,0.10)', fg: '#ef4444', label: 'Lost' },
};

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 };
const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4, display: 'block' };

function fmtDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UpsellsSection({ dealId, leadId }: { dealId?: string; leadId?: string }) {
  const [rows, setRows] = useState<Upsell[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [amount, setAmount] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [status, setStatus] = useState<UpsellStatus>('won');
  const [occurredAt, setOccurredAt] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!dealId && !leadId) return;
    setLoading(true);
    try {
      const res = await crmUpsells.list({ deal_id: dealId, lead_id: leadId });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dealId, leadId]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setAmount(''); setProductName(''); setQuantity(''); setStatus('won'); setOccurredAt(''); setNote('');
  }

  async function submit() {
    const amt = Number(amount.replace(/,/g, ''));
    if (!amount.trim() || !Number.isFinite(amt) || amt < 0) {
      toast.error('Enter a valid upsell amount');
      return;
    }
    setSaving(true);
    try {
      await crmUpsells.create({
        deal_id: dealId ?? null,
        lead_id: leadId ?? null,
        amount: amount.trim(),
        product_name: productName.trim() || null,
        quantity: quantity.trim() || null,
        status,
        occurred_at: occurredAt || null,
        note: note.trim() || null,
      });
      toast.success('Upsell logged');
      resetForm();
      setAdding(false);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not log the upsell');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this upsell?')) return;
    try {
      await crmUpsells.remove(id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not remove the upsell');
    }
  }

  const wonTotal = rows.filter((r) => r.status === 'won').reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Upsells</h3>
          {wonTotal > 0 && (
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>{formatINR(wonTotal)} won</span>
          )}
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            + Add upsell
          </button>
        )}
      </div>

      {adding && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Amount (₹) *</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="5,000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Product / what</label>
              <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Extended warranty" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" placeholder="1" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as UpsellStatus)} style={inputStyle}>
                <option value="won">Won</option>
                <option value="proposed">Proposed</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional details" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAdding(false); resetForm(); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={submit} disabled={saving} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save upsell'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No upsells logged yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => {
            const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.won;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{formatINR(r.amount)}</span>
                    {r.quantity ? <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>× {r.quantity}</span> : null}
                    <span style={{ fontSize: 10, fontWeight: 700, background: st.bg, color: st.fg, padding: '2px 8px', borderRadius: 999 }}>{st.label}</span>
                  </div>
                  {r.product_name && <div style={{ fontSize: 13, marginTop: 2 }}>{r.product_name}</div>}
                  {r.note && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{r.note}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    {fmtDate(r.occurred_at)}{r.created_by_name ? ` · ${r.created_by_name}` : ''}
                  </div>
                </div>
                <button onClick={() => remove(r.id)} title="Remove" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
