'use client';
/**
 * LeadDisqualifyModal — reason-capture modal for marking a lead as
 * Unqualified or Lost. Mirrors DealCloseModal so the three close-flows
 * (lead disqualify, deal win, deal lose) feel uniform across the app.
 *
 * Backend contract: PATCH /api/v1/crm/leads/:id with { status, lost_reason }.
 * The server auto-stamps disqualified_at and writes a crm_lead_history row.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads } from '../../lib/crmApi';

export const UNQUALIFIED_REASONS = [
  'Not ready to buy',
  'No budget',
  'Wrong contact',
  'Needs revisit later',
  'Out of region',
  'Other',
] as const;

export const LOST_LEAD_REASONS = [
  'Lost to competitor',
  'No response',
  'Junk / spam',
  'Wrong fit',
  'Duplicate',
  'Other',
] as const;

export type LeadDisqualifyOutcome = 'unqualified' | 'lost';

export interface LeadDisqualifyModalProps {
  leadId: string;
  open: boolean;
  initialOutcome?: LeadDisqualifyOutcome;
  onClose: () => void;
  onDone?: () => void;
}

export default function LeadDisqualifyModal({
  leadId, open, initialOutcome = 'unqualified', onClose, onDone,
}: LeadDisqualifyModalProps) {
  const [outcome, setOutcome] = useState<LeadDisqualifyOutcome>(initialOutcome);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcome(initialOutcome);
      setReason('');
      setOther('');
      setBusy(false);
    }
  }, [open, initialOutcome]);

  if (!open) return null;

  const reasonList = outcome === 'lost' ? LOST_LEAD_REASONS : UNQUALIFIED_REASONS;

  const submit = async () => {
    if (!reason) { toast.error('Please pick a reason'); return; }
    const finalReason = reason === 'Other' ? (other.trim() || 'Other') : reason;
    setBusy(true);
    try {
      await crmLeads.disqualify(leadId, { status: outcome, lost_reason: finalReason });
      toast.success(outcome === 'lost' ? 'Lead marked as Lost' : 'Lead marked as Unqualified');
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Disqualification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, maxWidth: 460, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
          {outcome === 'lost' ? 'Mark Lead as Lost' : 'Disqualify Lead'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          {outcome === 'lost'
            ? 'Closed out — no further follow-up planned. Can be re-opened later.'
            : 'Not a fit right now — you can revisit and re-open later.'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => { setOutcome('unqualified'); setReason(''); }}
            style={{
              padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: outcome === 'unqualified' ? '2px solid #f59e0b' : '1px solid var(--border)',
              background: outcome === 'unqualified' ? 'rgba(245,158,11,0.12)' : 'var(--s3)',
              color: outcome === 'unqualified' ? '#f59e0b' : 'var(--text)',
            }}>
            Unqualified
          </button>
          <button type="button" onClick={() => { setOutcome('lost'); setReason(''); }}
            style={{
              padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: outcome === 'lost' ? '2px solid #ef4444' : '1px solid var(--border)',
              background: outcome === 'lost' ? 'rgba(239,68,68,0.10)' : 'var(--s3)',
              color: outcome === 'lost' ? '#ef4444' : 'var(--text)',
            }}>
            Lost
          </button>
        </div>

        <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelStyle}>Reason <span style={{ color: '#ef4444' }}>*</span></span>
          <select value={reason} onChange={(e) => { setReason(e.target.value); setOther(''); }} style={inputStyle}>
            <option value="">— Select a reason —</option>
            {reasonList.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && (
            <input value={other} onChange={(e) => setOther(e.target.value)}
              placeholder="Describe the reason…" style={inputStyle} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{
              background: outcome === 'lost' ? '#ef4444' : '#f59e0b',
              border: 'none', color: '#fff',
              padding: '8px 18px', borderRadius: 8, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13,
              opacity: busy ? 0.7 : 1,
            }}>
            {busy ? 'Saving…' : (outcome === 'lost' ? 'Mark Lost' : 'Mark Unqualified')}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700,
};
const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13,
};
