'use client';
/**
 * DealCloseModal — reusable Won/Lost close dialog.
 *
 * Mirrors the iOS DealDetailView (commit 982ee3fc) and Android Deal
 * Detail (commit 6848966b) UX so the three surfaces stay in sync.
 *
 * Behaviour:
 *  - Segmented Won / Lost toggle (controlled via `outcome` prop so the
 *    parent can pre-select).
 *  - Lost reason is required (dropdown of `LOST_REASONS`); "Other" reveals
 *    a free-text input.
 *  - Win reason is optional free-text.
 *  - Optional close-date override (defaults to today).
 *  - Confirm hits `crmDeals.win(id, …)` or `crmDeals.lose(id, …)` which
 *    POST to /api/v1/crm/deals/:id/win and /lose respectively.
 *
 * Kept presentational: the parent owns the deal-id and the reload, and
 * passes an `onClosed` callback to refetch after a successful close.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals } from '../../lib/crmApi';

// Single source of truth for lost reasons across kanban / detail / mobile.
// Keep in sync with the iOS + Android dropdowns (982ee3fc / 6848966b).
export const LOST_REASONS = [
  'Price too high',
  'Lost to competitor',
  'No budget / budget cut',
  'No decision maker reached',
  'Bad timing / not ready',
  "Product doesn't fit needs",
  'No response from prospect',
  'Stayed with current solution',
  'Missing features',
  'Project cancelled',
  'Other',
] as const;

export type DealCloseOutcome = 'won' | 'lost';

export interface DealCloseModalProps {
  dealId: string;
  open: boolean;
  /** Which side of the toggle to pre-select when the modal opens. */
  initialOutcome?: DealCloseOutcome;
  onClose: () => void;
  /** Fired after the win/lose API call succeeds. The parent should refetch. */
  onClosed?: () => void;
}

// Default the close-date input to today (YYYY-MM-DD) so the field always
// has a reasonable initial value even if the rep doesn't touch it.
function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DealCloseModal({
  dealId,
  open,
  initialOutcome = 'won',
  onClose,
  onClosed,
}: DealCloseModalProps) {
  const [outcome, setOutcome] = useState<DealCloseOutcome>(initialOutcome);
  const [reason, setReason] = useState('');
  const [lostOther, setLostOther] = useState('');
  const [closeDate, setCloseDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  // Reset internal state every time the modal re-opens so a previous
  // partial fill doesn't bleed in.
  useEffect(() => {
    if (open) {
      setOutcome(initialOutcome);
      setReason('');
      setLostOther('');
      setCloseDate(todayISO());
      setBusy(false);
    }
  }, [open, initialOutcome]);

  if (!open) return null;

  const submit = async () => {
    if (outcome === 'lost' && !reason) {
      toast.error('Please pick a lost reason');
      return;
    }
    setBusy(true);
    try {
      if (outcome === 'won') {
        await crmDeals.win(dealId, {
          reason: reason || undefined,
          close_date: closeDate || undefined,
        });
        toast.success('Deal closed as Won 🎉');
      } else {
        const finalReason = reason === 'Other' ? (lostOther || 'Other') : reason;
        await crmDeals.lose(dealId, {
          reason: finalReason || undefined,
        });
        toast.success('Deal closed as Lost');
      }
      onClosed?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Close failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, maxWidth: 460, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Close Deal</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          Mark this deal as won or lost. You can re-open it later if needed.
        </div>

        {/* Won / Lost segmented toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setOutcome('won')}
            style={{
              padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: outcome === 'won' ? '2px solid #10b981' : '1px solid var(--border)',
              background: outcome === 'won' ? 'rgba(16,185,129,0.12)' : 'var(--s3)',
              color: outcome === 'won' ? '#10b981' : 'var(--text)',
            }}
          >
            ✓ Won
          </button>
          <button
            type="button"
            onClick={() => setOutcome('lost')}
            style={{
              padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: outcome === 'lost' ? '2px solid #ef4444' : '1px solid var(--border)',
              background: outcome === 'lost' ? 'rgba(239,68,68,0.10)' : 'var(--s3)',
              color: outcome === 'lost' ? '#ef4444' : 'var(--text)',
            }}
          >
            ✗ Lost
          </button>
        </div>

        {/* Reason field — required for Lost, optional for Won. */}
        {outcome === 'lost' ? (
          <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>
              Lost Reason <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <select
              value={reason}
              onChange={(e) => { setReason(e.target.value); setLostOther(''); }}
              style={inputStyle}
            >
              <option value="">— Select a reason —</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <input
                value={lostOther}
                onChange={(e) => setLostOther(e.target.value)}
                placeholder="Describe the reason…"
                style={inputStyle}
              />
            )}
          </div>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            <span style={labelStyle}>Win Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Competitive pricing, great demo, referral…"
              style={inputStyle}
            />
          </label>
        )}

        {/* Optional close-date override. Backend accepts close_date on /win;
            for /lose we still show it for UX symmetry but the API currently
            ignores it (the close_date defaults server-side to NOW()). */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
          <span style={labelStyle}>Close Date</span>
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            style={inputStyle}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: outcome === 'won' ? '#10b981' : '#ef4444',
              border: 'none', color: '#fff',
              padding: '8px 18px', borderRadius: 8, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Closing...' : `Close as ${outcome === 'won' ? 'Won' : 'Lost'}`}
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
