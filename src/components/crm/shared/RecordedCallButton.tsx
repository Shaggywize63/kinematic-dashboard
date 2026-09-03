'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmTelephony } from '../../../lib/crmApi';
import { useAuth } from '../../../hooks/useAuth';

interface Props {
  leadId: string;
  phone?: string | null;
  size?: 'sm' | 'md';
}

// Limited-trial gate: recorded calling is enabled for a single operator while
// the telephony provider is validated end to end (mirrors the server-side
// email gate on POST /crm/telephony/click-to-call). When the trial rolls out
// org-wide, drop this constant and the `enabled` check.
const TRIAL_EMAIL = 's@kinematicapp.com';

/**
 * "Call (recorded)" pill. Placing the call bridges the rep and the lead on the
 * org's telephony provider with server-side recording; the recording then
 * flows into Conversation Analysis automatically. The button POSTs to the
 * backend (which resolves the numbers + provider config) and reports the
 * provider's queued/ringing status.
 *
 * Self-gating: renders nothing unless the signed-in user is the trial operator
 * and the lead has a phone number — same self-hiding contract as CallButton.
 */
export default function RecordedCallButton({ leadId, phone, size = 'sm' }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const enabled = (user?.email || '').toLowerCase() === TRIAL_EMAIL;
  if (!enabled || !phone) return null;

  const dim = size === 'sm' ? { pad: '4px 9px', fs: 11, ic: 12 } : { pad: '8px 14px', fs: 13, ic: 14 };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await crmTelephony.clickToCall({ lead_id: leadId });
      toast.success(
        `Calling ${r.to} — your phone (${r.from}) will ring first, then we bridge the lead. Recording → Conversation Analysis.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not place the recorded call';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Place a recorded call — flows into Conversation Analysis"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: dim.pad,
        background: busy ? 'var(--s3)' : '#7C3AED',
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        fontSize: dim.fs,
        fontWeight: 700,
        cursor: busy ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <svg width={dim.ic} height={dim.ic} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
        <circle cx="18" cy="6" r="3" fill="#EF4444" />
      </svg>
      {busy ? 'Calling…' : 'Call (recorded)'}
    </button>
  );
}
